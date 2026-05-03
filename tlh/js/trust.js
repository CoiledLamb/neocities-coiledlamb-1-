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

     Also: computeTrustGain(pkg, depotId) dispatcher added. Per-NPC
     trustProfile selected the branch and returned the per-profile
     trust amount. Discovery stays flat; delivery/lost-delivery flows
     through the dispatcher from packages.js callers. v0.0.8.5
     reshaped the default base to (1 + floor(pkg.slots/2)).

     v0.0.9.6.10.17 — dispatcher removed. See the computeTrustGain
     header below for the shelved-profile rationale.
   ============================================== */
'use strict';

import { S } from './state.js?v=097-0-6';
import * as C from './constants.js?v=097-0-6';
import { NPC_DEFS, NPC_ADJACENT } from './data/npc-defs.js?v=097-0-6';
import { NPC_LINES } from './data/npc-lines.js?v=097-0-6';
import { UPGRADE_DEFS } from './data/upgrades.js?v=097-0-6';
import { postActivity } from './multiplayer.js?v=097-0-6';
import { emit as tEmit, accum as tAccum, markFirst as tMarkFirst } from './telemetry.js?v=097-0-6';
import { getNodeStage, setNodeStage, getDisplayLabel } from './identification.js?v=097-0-6';
import { speak } from './channels.js?v=097-0-6';
import { pickRandom } from './util.js?v=097-0-6';
import { staminaSegCount, renderStamina } from './stamina.js?v=097-0-6';
import { addLog } from './render/log.js?v=097-0-6';
import { updateHUD } from './render/hud.js?v=097-0-6';
import { drawRouteMap } from './render/route-map.js?v=097-0-6';
import { renderSettlements } from './render/settlements.js?v=097-0-6';
import { weatherAtCourier } from './weather.js?v=097-0-6';

const els = S._transient.els;
const worldCells = S._transient.worldCells;

export function getNpc(depotId) {
  if (!NPC_DEFS[depotId] || !S.npcs || !S.npcs[depotId]) return null;
  return S.npcs[depotId];
}

// v0.0.8.5: base trust is weight-scaled — 1 + floor(pkg.slots / 2).
//   s(1 slot) → +1, m(2) → +2, l(4) → +3, xl(8) → +5.
//   Lost/recovery adds TRUST_GAIN_LOST_BONUS (+1) on top.
//
// v0.0.9.6.10.17 — per-NPC trust profiles removed. Prior versions
// had a 12-case dispatch (veteran / wetland-path / homecoming /
// stormwise / archivist / wayfinder / guardian / artisan / debt-
// easer / adventurer / researcher / routine) that applied profile-
// specific multipliers on top of base. Sim data showed several
// profiles rarely triggered (wayfinder, stormwise), the low-yield
// ones (veteran, wayfinder) dragged time-to-all-upgrades ~2-2.5h
// in-game vs a flat-base baseline, and run-to-run variance from
// the multipliers complicated balance tuning. System shelved
// pending a redesign. See memory/project_tlh_trust_profiles_pr.md.
//
// recordDelivery() and its per-NPC state fields
// (wetlandTicksSinceLastVisit, kmAtLastVisit, visitedSinceLastDelta)
// were removed as part of the same cleanup — they only existed to
// feed the stateful profiles.
export function computeTrustGain(pkg, depotId) {
  if (!NPC_DEFS[depotId]) return 0;
  return 1 + Math.floor(pkg.slots / 2) + (pkg.isLost ? C.TRUST_GAIN_LOST_BONUS : 0);
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
    if (pkg.tags && pkg.tags.includes('fragile') && !pkg.damaged && del.fragile && del.fragile.length) { cat = 'fragile'; break; }
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
  // v0.0.9.5.1 — round to integer at storage so display/log never surface
  // the fractional multipliers from computeTrustGain's profile table.
  npc.trust = Math.max(0, Math.min(100, Math.round(npc.trust + amount)));
  if (npc.trust === before) return;
  // v0.0.9.6.9 sim telemetry — attribution by reason
  const delta = npc.trust - before;
  tEmit('trust.granted', { npc: depotId, amount: delta, reason });
  tAccum('trust.granted', 'total_' + depotId, delta);
  tAccum('trust.granted', 'by_reason_' + (reason || 'delivery'), delta);
  for (let i = 0; i < C.TRUST_THRESHOLDS.length; i++) {
    const t = C.TRUST_THRESHOLDS[i];
    if (before < t && npc.trust >= t) onTrustUnlock(depotId, t, i);
  }
  if (before < 100 && npc.trust >= 100) {
    tMarkFirst('npc_max', depotId);
  }
  renderSettlements();
}

function onTrustUnlock(depotId, threshold, tierIndex) {
  const npc = NPC_DEFS[depotId];
  if (!npc) return;
  tEmit('trust.tier_unlocked', { npc: depotId, threshold });
  tMarkFirst('tier_unlock_' + threshold, depotId);
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

  // v0.0.9.5.2 — trust-reward flow change: upgrades no longer auto-grant
  // on threshold cross. The tier unlock sets npc.unlocks[tierKey]=true
  // (already done above at line 258-261), which the upgrade shop reads
  // to enable the buy row for matching trustReward entries. Player pays
  // scrip to claim — gives more places to spend scrip, lets the player
  // choose timing. Legacy saves with S.upgrades[id] already true from
  // the old auto-grant flow stay owned (no migration needed — the shop
  // renders them as "owned"). Log a single notice so the player knows
  // something is waiting; full grant log still fires from buyUpgrade.
  const hasClaimables = UPGRADE_DEFS.some(def =>
    def.trustReward &&
    def.trustReward.npc === depotId &&
    def.trustReward.tier === tierKey &&
    !S.upgrades[def.id]
  );
  if (hasClaimables) {
    addLog(`<span class="log-hi">${npc.callsign}</span> has something for you \u2014 <span class="log-ok">claim at shop</span>`);
  }
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
  // Gate: only rest when the player would genuinely benefit. Above 85%
  // stamina, skip — prevents an overboost state (>100%) from being
  // downgraded to 105%. A player resting at 84% stamina gains ~20%+
  // headroom; the branch is safe-benefit-only by construction.
  if (S.stamina >= S.staminaMax * 0.85) return;
  const def = NPC_DEFS[arrivedNodeId];
  // v0.0.8.4: rest lines live under NPC_LINES.rest[depotId]; speak one.
  const lines = NPC_LINES.rest[arrivedNodeId] || [];
  if (lines.length) speak(arrivedNodeId, pickRandom(lines));
  // v0.0.9.5.4 — idle-first: auto-apply instead of prompt. At t80
  // you've earned the NPC's hospitality; clicking "accept rest" is
  // pure friction. Rename kept (tryRestPrompt) since it still reads
  // from the same trust + stamina gates — just no UI interaction
  // now. _transient.depotRestPending vestigial, no longer written.
  S.stamina = S.staminaMax * 1.05;
  S.staminaOverboost = true;
  S.canteen = Math.min(S.canteenMax, S.canteen + 30);
  addLog(`rested at <span class="log-hi">${def.callsign}</span> \u2014 <span class="log-ok">+stamina +canteen</span>`);
  renderStamina();
  updateHUD();
}
