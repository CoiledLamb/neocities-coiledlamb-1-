/* ==============================================
   THE LONG HAUL — package delivery

   Extracted from packages.js in v0.0.9.6.9.30.4. tryDeliver was the
   audit's named "most cross-system function in the codebase" — it
   touches recovery, multiplayer, trust, identification, render, log,
   boots, carrier, stamina, telemetry, geom. Its size (~140 lines)
   plus its import surface was the top remodularization priority.

   packages.js keeps:
     - scanForPickup + interior pickup + sandalweed harvest
     - rollPkg / rollDestForSpawn / rollInteriorPkg (spawn)
     - seedInteriorPkgs / tickPkgRespawns (respawn)
     - formatPkgTooltip / formatPkgTooltipHTML (shared formatters)
     - onInventoryChange / shouldEmitSkipFor (inventory telemetry)
     - tryOutboundDispatch / tryCursorPickup / ejectFromCargo
     - effectiveMaxSlots
   and re-exports tryDeliver so existing consumers
   (main.js's `import * as Pkg`) keep working unchanged.

   Shared helper: onInventoryChange() stays in packages.js; this file
   imports it. One-way dependency — packages.js does NOT import
   anything from packages-delivery.js, so no circular risk.
   ============================================== */
'use strict';

import { S } from './state.js';
import * as C from './constants.js';
import { NPC_DEFS } from './data/npc-defs.js';
import { emit as tEmit, accum as tAccum } from './telemetry.js';
import { postActivity, shortPorterId } from './multiplayer.js';
import { updatePorterStripBadges } from './recovery.js';
import { addTrust, computeTrustGain, speakDelivery, recordDelivery } from './trust.js';
import { removeFromInventories } from './carrier.js';
import { getNodeStage, setNodeStage } from './identification.js';
import { addLog } from './render/log.js';
import { renderCourierStack, renderCargoSlots } from './render/hud.js';
import { drawRouteMap } from './render/route-map.js';
import { renderSettlements } from './render/settlements.js';
import { onInventoryChange } from './packages.js';

// Local aliases — live references into S._transient. Never reassign these.
const els        = S._transient.els;
const worldCells = S._transient.worldCells;

// v0.0.9.5.1 — delivery-broadcast throttle. Every porter delivers
// constantly and the feed was drowning in delivery events; gate to
// one broadcast per DELIVERY_BROADCAST_GATE_MS (10 minutes real-time).
// Session-local (no persistence) — first delivery after reload always
// fires, matching the "is anyone out there" signal on cold start.
const DELIVERY_BROADCAST_GATE_MS = 10 * 60 * 1000;
let   lastDeliveryBroadcastTs    = 0;

export function tryDeliver(arrivedNodeId) {
  // v0.0.7.21 — sticky gun ammo refill at H, regardless of whether
  // there's a pkg to deliver. Home = rearm station.
  if (arrivedNodeId === 'H' && S.stickyGun && S.stickyGun.ammo < S.stickyGun.ammoMax) {
    const refilled = S.stickyGun.ammoMax - S.stickyGun.ammo;
    S.stickyGun.ammo = S.stickyGun.ammoMax;
    addLog(`<span class="log-ok">sticky gun</span> refilled \u2014 +${refilled} shots`);
  }

  // v0.0.9.6.9.30j — delivery checks BOTH main and cart inventories.
  // Cart-first so cart empties before main (protects cart pkgs from
  // forced-stow drops on terrain incompatibility; a delivered pkg is
  // safer than a carried one, so we always prefer to clear the more
  // exposed bucket first).
  const cartInv    = (S.carrier && S.carrier.deployed && Array.isArray(S.carrier.inventory))
    ? S.carrier.inventory : [];
  const cartMatches = cartInv.filter(p => p.destId === arrivedNodeId);
  const mainMatches = S.inventory.filter(p => p.destId === arrivedNodeId);
  const toDeliver = cartMatches.concat(mainMatches);
  if (toDeliver.length === 0) return;
  const settle = S.settlements[arrivedNodeId];
  const destLabel = settle ? settle.label : arrivedNodeId;
  // v0.0.9.6.9.11 — arrival-batch size snapshot for the "dumps everything
  // at each stop vs one-at-a-time" question.
  const arrivalCount = toDeliver.length;
  toDeliver.forEach(pkg => {
    // v0.0.9.6.9 sim telemetry
    // v0.0.9.6.9.10 — carry-duration + src origin added for sim carry-time histogram.
    // v0.0.9.6.9.11 — arrivalBatchCount for batch-size analysis;
    // outbound flag splits dispatch-targeted pairs vs opportunistic ring pickups.
    tEmit('pkg.delivered', {
      npc:                arrivedNodeId,
      size:               pkg.size,
      scrip:              pkg.scrip,
      terrainOrigin:      pkg.terrainOrigin || 'ring',
      carryDurationTicks: (typeof pkg.pickupTick === 'number') ? (S.ticks - pkg.pickupTick) : null,
      srcEdgeIdx:         (typeof pkg.srcEdgeIdx === 'number') ? pkg.srcEdgeIdx : null,
      destEdgeIdx:        S.edgeIdx,
      pickupOrigin:       pkg.pickupOrigin || null,
      arrivalBatchCount:  arrivalCount,
      outbound:           !!pkg.outboundFrom,
    });
    tAccum('pkg.delivered', 'scrip', pkg.scrip);
    tAccum('pkg.delivered', 'scrip_' + arrivedNodeId, pkg.scrip);
    tAccum('pkg.delivered', 'count_' + (pkg.terrainOrigin || 'ring'), 1);
    S.scrip      += pkg.scrip;
    S.delivered  += 1;
    // v0.0.9.6.9.30j — removeFromInventories handles bucket detection
    // + S.usedSlots/Weight accounting (cart pkgs don't touch the main
    // totals). Replaces the old main-only splice + manual decrement.
    removeFromInventories(pkg);
    onInventoryChange();
    if (pkg._worldCell !== undefined && worldCells[pkg._worldCell] && worldCells[pkg._worldCell].pkg) {
      if (pkg.isRecovery) {
        worldCells[pkg._worldCell].pkg = null;
        worldCells[pkg._worldCell].isRecovery = false;
        S.activeRecoveryCount = Math.max(0, S.activeRecoveryCount - 1);
        updatePorterStripBadges();
      } else {
        // v0.0.8.6: scavenger's eye reduces respawn by 20%
        worldCells[pkg._worldCell].pkg.respawnIn = S.upgrades.scavengerEye
          ? Math.floor(C.PKG_RESPAWN_TICKS * 0.8)
          : C.PKG_RESPAWN_TICKS;
      }
    }
    // v0.0.9.6 commit 5 — interior pkg respawn on delivery. Mirrors
    // the ring pattern; scavengerEye applies the same 20% reduction.
    if (pkg._interiorKey && S.interiorPkgs && S.interiorPkgs[pkg._interiorKey]) {
      const entry = S.interiorPkgs[pkg._interiorKey];
      entry.respawnIn = S.upgrades.scavengerEye
        ? Math.floor(C.INTERIOR_RESPAWN_TICKS * 0.8)
        : C.INTERIOR_RESPAWN_TICKS;
    }
    if (settle) { settle.supply = Math.min(100, settle.supply + 3); settle.rebuild = Math.min(100, settle.rebuild + 1); }
    const node = S.routeNodes.find(n => n.id === arrivedNodeId);
    if (node && getNodeStage(arrivedNodeId) < 3) {
      setNodeStage(arrivedNodeId, 3);
      addLog(`discovered: <span class="log-hi">${node.label}</span>`);
      drawRouteMap();
      renderSettlements();
      postActivity('discovery', { nodeId: arrivedNodeId, label: node.label });
      if (NPC_DEFS[arrivedNodeId]) {
        addTrust(arrivedNodeId, C.TRUST_GAIN_DISCOVERY, 'discovery');
      }
    }
    // v0.0.8.5: compute trust gain before logging so we can surface it.
    // Weight-scaled base (1 + floor(slots/2)) with profile multipliers.
    // v0.0.9.4: outbound-flagged pkgs get +OUTBOUND_BONUS_TRUST at dest
    // for being a relationship-spanning delivery (origin NPC already
    // awarded their own trust on accept).
    const gain  = NPC_DEFS[arrivedNodeId] ? computeTrustGain(pkg, arrivedNodeId) : 0;
    const bonus = pkg.outboundFrom && NPC_DEFS[arrivedNodeId] ? C.OUTBOUND_BONUS_TRUST : 0;
    const totalGain = gain + bonus;
    const trustSuffix = totalGain > 0 ? ` +${Math.round(totalGain)} trust` : '';
    const outboundTag = pkg.outboundFrom
      ? ` <span class="log-hi">[from ${NPC_DEFS[pkg.outboundFrom] ? NPC_DEFS[pkg.outboundFrom].callsign : pkg.outboundFrom}]</span>`
      : '';
    addLog(`delivered <span class="log-hi">[${pkg.size}] ${pkg.label}</span>${outboundTag} to <span class="log-hi">${destLabel}</span> \u2014 <span class="log-ok">+${pkg.scrip}\u00a2${trustSuffix}</span>`);
    // v0.0.9.5.1 — delivery broadcasts were the single largest feed
    // contributor (every porter delivers constantly). Throttled to
    // one broadcast per porter per DELIVERY_BROADCAST_GATE_MS so the
    // signal survives but the volume drops ~10-20x. Wall-clock gate
    // (session-local; first delivery after reload always fires).
    const nowTs = Date.now();
    if (nowTs - lastDeliveryBroadcastTs >= DELIVERY_BROADCAST_GATE_MS) {
      lastDeliveryBroadcastTs = nowTs;
      postActivity('delivery', { destId: arrivedNodeId, destLabel, scrip: pkg.scrip, size: pkg.size });
    }

    if (pkg.isRecovery && pkg.recoveryFromPorter) {
      postActivity('lost_recovered', {
        label: pkg.label,
        size: pkg.size,
        forPorter: pkg.recoveryFromPorter,
      });
      addLog(`<span class="log-ok">recovered</span> <span class="log-hi">${pkg.label}</span> \u2014 left by <span class="log-hi">${shortPorterId(pkg.recoveryFromPorter)}</span>`);
    }

    if (totalGain > 0) {
      const reason = pkg.outboundFrom
        ? 'outbound-delivery'
        : (pkg.isLost ? 'lost-delivery' : 'delivery');
      addTrust(arrivedNodeId, totalGain, reason);
    }
  });
  // v0.0.9.5 (commit 2): per-batch state update for stateful trust
  // profiles (tau homecoming km snapshot, iota wetland-tick reset,
  // delta routine-counter accrue/reset). Fires once per batch so a
  // multi-pkg delivery to a non-delta NPC counts as a single "visit"
  // for delta's routine profile. Safe to call before addTrust reads
  // — computeTrustGain already ran earlier in the loop.
  if (NPC_DEFS[arrivedNodeId]) recordDelivery(arrivedNodeId);
  // v0.0.8.4: NPC reacts to the delivery — one line per batch, picking
  // the most interesting condition (lost > damaged > fragile > heavy > normal).
  speakDelivery(arrivedNodeId, toDeliver);
  renderCourierStack();
  renderCargoSlots(true);
  if (S.inventory.length === 0) {
    S.status = 'walking';
    if (els.courierAt) els.courierAt.className = 'tlh-at bounce';
  }
  renderSettlements();
}
