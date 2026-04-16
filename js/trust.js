/* ==============================================
   THE LONG HAUL — NPC trust + tier behaviors

   Per-NPC trust 0–100, ratcheting through tiers at
   TRUST_THRESHOLDS [20, 40, 60, 80] (realigned in
   pre-refactor commit A from 25/50/75/100).

   Tier behaviors:
     t20: stage-1 reveal of NPC_ADJACENT nodes
     t40: tryWarning — trip-risk > rain > stamina
     t60: tryPreview — outbound edge package preview
     t80: tryRestPrompt — [rest] log button

   v0.0.7.18: function renames (tryT50Warning → tryWarning
     etc) — function names no longer lie about the threshold.
     pickRandom now imported from util.js (was duplicated
     between channels.js and recovery.js).

   v0.0.7.19 (commit 2a): unlock storage canonicalization.
     onTrustUnlock previously wrote to npc[tierKey] (a phantom
     property), but state.js declares the canonical home as
     npc.unlocks[tierKey] and that's what channels.js's
     tickAmbientChatter reads. Result: ambient chatter never
     fired in fresh sessions — only after a save+reload, when
     loadGame's ratchet would populate unlocks from the trust
     value. Fix: write to npc.unlocks.tN, read from npc.unlocks.tN.
     Existing players auto-migrate via the loadGame ratchet on
     next load, no schema bump needed.

   v0.0.7.19 (commit 2b):
     - tryWarning rain check rewired to the new rain scheduler:
       speaks when nextRainStartTick - S.ticks is within
       RAIN_INCOMING_WARN_TICKS of now. Replaces the old
       ambiguous `rainTimer > 0 && rainTimer < 25` test that
       fired both during and between rain events.
     - Renamed local `restPromptPending` writes/reads to
       `depotRestPending` to match the canonical slot declared
       in state.js. Pure name fix, no behavior change.

   v0.0.8.4: NPC_LINES access shape fixed. Every read path in this
     module had been accessing NPC_LINES[depotId].<category> but the
     data is exported as NPC_LINES.<category>[depotId]. Result: the
     threshold unlock line, all t40 warnings, t60 previews, and the
     t80 rest button had been silently no-opping since the refactor.
     Fix: rewrite each access path to category-first. Threshold is a
     single string per tier (no pickRandom); warning promoted to
     arrays keyed by .{rain,trip,stamina}; preview and rest arrays.
     Preview template vars (already {label}/{size}/{dest} in trust.js)
     matched up with rewritten data templates. Third `reason` arg to
     speak() calls was always harmless but silently dropped here.

     Also: computeTrustGain(pkg, depotId) dispatcher added. Reads
     NPC_DEFS[id].trustProfile ('default' | 'careful' | 'scavenger')
     and returns the per-profile trust amount. Discovery stays flat;
     delivery/lost-delivery flows through the dispatcher from
     packages.js callers. v0.0.8.5 will reshape the default base
     from flat constants to (1 + floor(pkg.slots/2)).
   ============================================== */
'use strict';

import { S } from './state.js';
import * as C from './constants.js';
import { NPC_DEFS, NPC_ADJACENT } from './data/npc-defs.js';
import { NPC_LINES } from './data/npc-lines.js';
import { UPGRADE_DEFS } from './data/upgrades.js';
import { postActivity } from './multiplayer.js';
import { getNodeStage, setNodeStage, getDisplayLabel } from './identification.js';
import { speak } from './channels.js';
import { pickRandom } from './util.js';
import { staminaSegCount, renderStamina } from './stamina.js';
import { addLog } from './render/log.js';
import { updateHUD } from './render/hud.js';
import { drawRouteMap } from './render/route-map.js';
import { renderSettlements } from './render/settlements.js';
import { weatherAtCourier } from './weather.js';

const els = S._transient.els;
const worldCells = S._transient.worldCells;

export function getNpc(depotId) {
  if (!NPC_DEFS[depotId] || !S.npcs || !S.npcs[depotId]) return null;
  return S.npcs[depotId];
}

// v0.0.8.4: per-NPC trust gain dispatcher. NPC_DEFS[depotId].trustProfile
// selects the branch. 'careful' (xi) halves gain on non-fragile/non-xl;
// 'scavenger' (psi) doubles on s, normal on m, halves on l/xl. Discovery
// trust stays flat (TRUST_GAIN_DISCOVERY) — no pkg context.
//
// v0.0.8.5: base is now weight-scaled: 1 + floor(pkg.slots / 2).
//   s(1 slot) → +1, m(2) → +2, l(4) → +3, xl(8) → +5.
//   Lost/recovery adds TRUST_GAIN_LOST_BONUS (+1) on top.
//   Profile multipliers apply after the base.
export function computeTrustGain(pkg, depotId) {
  const def = NPC_DEFS[depotId];
  const profile = (def && def.trustProfile) || 'default';
  const base = 1 + Math.floor(pkg.slots / 2) + (pkg.isLost ? C.TRUST_GAIN_LOST_BONUS : 0);
  if (profile === 'scavenger') {
    if (pkg.size === 's') return base * 2;
    if (pkg.size === 'm') return base;
    return base * 0.5;
  }
  if (profile === 'careful') {
    const isCareful = (pkg.modifier === 'fragile' || pkg.size === 'xl');
    return isCareful ? base : base * 0.5;
  }
  return base;
}

// v0.0.8.4: delivery dialogue. Fires once per delivery batch (not per-pkg)
// with the highest-priority condition from the batch. No trust gate — NPCs
// react to deliveries from the very first one (before ambient chatter at t20).
export function speakDelivery(arrivedNodeId, deliveredPkgs) {
  if (!NPC_DEFS[arrivedNodeId]) return;
  const del = NPC_LINES.delivery && NPC_LINES.delivery[arrivedNodeId];
  if (!del) return;

  // pick highest-priority condition from the batch
  let cat = 'normal';
  for (const pkg of deliveredPkgs) {
    if ((pkg.isLost || pkg.isRecovery) && del.lost && del.lost.length)                          { cat = 'lost';    break; }
    if (pkg.damaged && del.damaged && del.damaged.length)                                        { cat = 'damaged';  break; }
    if (pkg.modifier === 'fragile' && !pkg.damaged && del.fragile && del.fragile.length)         { cat = 'fragile'; break; }
    if ((pkg.size === 'xl' || pkg.size === 'l') && del.heavy && del.heavy.length)                { cat = 'heavy';   break; }
  }
  const lines = del[cat] || del.normal || [];
  if (!lines.length) return;
  speak(arrivedNodeId, pickRandom(lines));
}

export function addTrust(depotId, amount, reason) {
  if (!NPC_DEFS[depotId]) return;
  if (!S.npcs[depotId]) {
    S.npcs[depotId] = {
      trust: 0,
      unlocks: { t20:false, t40:false, t60:false, t80:false },
      nextChatterTick: 0,
    };
  }
  const npc = S.npcs[depotId];
  const before = npc.trust;
  npc.trust = Math.max(0, Math.min(100, npc.trust + amount));
  if (npc.trust === before) return;
  for (let i = 0; i < C.TRUST_THRESHOLDS.length; i++) {
    const t = C.TRUST_THRESHOLDS[i];
    if (before < t && npc.trust >= t) onTrustUnlock(depotId, t, i);
  }
  renderSettlements();
}

function onTrustUnlock(depotId, threshold, tierIndex) {
  const npc = NPC_DEFS[depotId];
  if (!npc) return;
  const tierKey = `t${threshold}`;
  // v0.0.7.19: write to canonical npc.unlocks[tierKey] (was npc[tierKey],
  // a phantom property that bypassed channels.js's chatter gate).
  if (!S.npcs[depotId].unlocks) {
    S.npcs[depotId].unlocks = { t20:false, t40:false, t60:false, t80:false };
  }
  S.npcs[depotId].unlocks[tierKey] = true;

  // v0.0.8.4: threshold lines are single strings per tier (not arrays).
  // Prior code accessed NPC_LINES[depotId].threshold[threshold] but the data
  // shape is NPC_LINES.threshold[depotId][threshold] — this was silently
  // no-opping since the refactor.
  const line = (NPC_LINES.threshold[depotId] && NPC_LINES.threshold[depotId][threshold]) || null;
  if (line) speak(depotId, line);

  postActivity('trust_unlock', { depotId, npcLabel: npc.callsign, tier: tierKey });

  if (threshold === 20) {
    const adj = NPC_ADJACENT[depotId] || [];
    let revealed = false;
    adj.forEach(adjId => {
      if (getNodeStage(adjId) < 1) {
        setNodeStage(adjId, 1);
        revealed = true;
      }
    });
    if (revealed) {
      addLog(`<span class="log-hi">${npc.callsign}</span> shared route intel`);
      drawRouteMap();
      renderSettlements();
    }
  }

  // v0.0.8.6: auto-grant trust-reward upgrades at this tier.
  // Fires after the threshold line speaks so the reward log appears
  // in sequence: "rho: ..." then "rho gave you boot clip".
  UPGRADE_DEFS.forEach(def => {
    if (!def.trustReward) return;
    if (def.trustReward.npc !== depotId || def.trustReward.tier !== tierKey) return;
    if (S.upgrades[def.id]) return;
    S.upgrades[def.id] = true;
    def.apply();
    addLog(`<span class="log-hi">${npc.callsign}</span> gave you <span class="log-ok">${def.name}</span>`);
  });
}

export function tryWarning(arrivedNodeId) {
  if (!NPC_DEFS[arrivedNodeId]) return;
  const npc = S.npcs[arrivedNodeId];
  if (!npc || !npc.unlocks || !npc.unlocks.t40) return;
  // v0.0.8.4: warning lines are arrays per NPC, keyed by category under
  // NPC_LINES.warning[depotId].{rain,trip,stamina}. Old code accessed
  // NPC_LINES[depotId].warningTrip/Rain/Stamina — shape mismatch + wrong
  // key naming meant none of these ever fired.
  const warn = NPC_LINES.warning[arrivedNodeId];

  // Priority: trip-risk edge > rain incoming > low stamina
  const nextEdgeIdx = (S.edgeIdx + 1) % S.edges.length;
  let nextEdgeRisky = false;
  for (let i = 0; i < C.CELLS_PER_EDGE; i++) {
    const ci = nextEdgeIdx * C.CELLS_PER_EDGE + i;
    if (worldCells[ci] && worldCells[ci].risky) { nextEdgeRisky = true; break; }
  }
  if (nextEdgeRisky && warn && warn.trip && warn.trip.length) {
    speak(arrivedNodeId, pickRandom(warn.trip));
    return;
  }
  // v0.0.8 — storm incoming warning. Fires when courier is currently
  // dry but a storm is about to spawn.
  if (weatherAtCourier().intensity === 'none') {
    const ticksUntilSpawn = S.nextStormSpawnTick - S.ticks;
    if (ticksUntilSpawn > 0 && ticksUntilSpawn < C.STORM_INCOMING_WARN_TICKS && warn && warn.rain && warn.rain.length) {
      speak(arrivedNodeId, pickRandom(warn.rain));
      return;
    }
  }
  if (staminaSegCount() <= 1 && warn && warn.stamina && warn.stamina.length) {
    speak(arrivedNodeId, pickRandom(warn.stamina));
  }
}

export function tryPreview(arrivedNodeId) {
  if (!NPC_DEFS[arrivedNodeId]) return;
  const npc = S.npcs[arrivedNodeId];
  if (!npc || !npc.unlocks || !npc.unlocks.t60) return;
  // v0.0.8.4: preview lines are arrays of template strings under
  // NPC_LINES.preview[depotId]. Old code accessed NPC_LINES[depotId].preview.
  const lines = NPC_LINES.preview[arrivedNodeId] || [];
  if (!lines.length) return;
  const nextEdgeIdx = (S.edgeIdx + 1) % S.edges.length;
  let foundPkg = null;
  for (let i = 0; i < C.CELLS_PER_EDGE; i++) {
    const ci = nextEdgeIdx * C.CELLS_PER_EDGE + i;
    const cell = worldCells[ci];
    if (cell && cell.pkg && !cell.pkg.picked) { foundPkg = cell.pkg; break; }
  }
  if (!foundPkg) return;
  const tmpl = pickRandom(lines);
  const msg = tmpl
    .replace('{label}', foundPkg.label)
    .replace('{size}', foundPkg.size)
    .replace('{dest}', getDisplayLabel(foundPkg.destId));
  speak(arrivedNodeId, msg);
}

export function tryRestPrompt(arrivedNodeId) {
  if (!NPC_DEFS[arrivedNodeId]) return;
  const npc = S.npcs[arrivedNodeId];
  if (!npc || !npc.unlocks || !npc.unlocks.t80) return;
  if (S._transient.depotRestPending) return;
  if (S.stamina >= S.staminaMax * 0.85) return;
  const def = NPC_DEFS[arrivedNodeId];
  // v0.0.8.4: rest lines are arrays under NPC_LINES.rest[depotId].
  // Old code accessed NPC_LINES[depotId].rest — shape mismatch meant
  // this early-returned and the rest button never appeared.
  const lines = NPC_LINES.rest[arrivedNodeId] || [];
  if (!lines.length) return;
  S._transient.depotRestPending = { nodeId: arrivedNodeId };
  speak(arrivedNodeId, pickRandom(lines));
  addLog(`<button class="log-btn" id="depotRestBtn">accept rest at ${def.callsign}</button>`);
  setTimeout(() => {
    const btn = document.getElementById('depotRestBtn');
    if (btn) btn.addEventListener('click', confirmDepotRest);
  }, 0);
}

function confirmDepotRest() {
  if (!S._transient.depotRestPending) return;
  const { nodeId } = S._transient.depotRestPending;
  S._transient.depotRestPending = null;
  const def = NPC_DEFS[nodeId];
  // v0.0.8.6: rest is free at t80 — you've earned the NPC's hospitality.
  S.stamina = S.staminaMax * 1.05;
  S.staminaOverboost = true;
  S.canteen = Math.min(S.canteenMax, S.canteen + 30);
  addLog(`rested at <span class="log-hi">${def ? def.callsign : nodeId}</span> \u2014 <span class="log-ok">+stamina +canteen</span>`);
  renderStamina();
  updateHUD();
  const btn = document.getElementById('depotRestBtn');
  if (btn) btn.closest('.log-line').remove();
}
