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
   ============================================== */
'use strict';

import { S } from './state.js';
import * as C from './constants.js';
import { NPC_DEFS, NPC_ADJACENT } from './data/npc-defs.js';
import { NPC_LINES } from './data/npc-lines.js';
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

  const lines = (NPC_LINES[depotId] && NPC_LINES[depotId].threshold && NPC_LINES[depotId].threshold[threshold]) || [];
  if (lines.length > 0) speak(depotId, pickRandom(lines), 'unlock');

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
}

export function tryWarning(arrivedNodeId) {
  if (!NPC_DEFS[arrivedNodeId]) return;
  const npc = S.npcs[arrivedNodeId];
  if (!npc || !npc.unlocks || !npc.unlocks.t40) return;
  const def = NPC_DEFS[arrivedNodeId];
  const lines = NPC_LINES[arrivedNodeId] || {};

  // Priority: trip-risk edge > rain incoming > low stamina
  const [, nextTo] = S.edges[(S.edgeIdx + 1) % S.edges.length];
  const nextEdgeIdx = (S.edgeIdx + 1) % S.edges.length;
  let nextEdgeRisky = false;
  for (let i = 0; i < C.CELLS_PER_EDGE; i++) {
    const ci = nextEdgeIdx * C.CELLS_PER_EDGE + i;
    if (worldCells[ci] && worldCells[ci].risky) { nextEdgeRisky = true; break; }
  }
  if (nextEdgeRisky && lines.warningTrip && lines.warningTrip.length) {
    speak(arrivedNodeId, pickRandom(lines.warningTrip), 'warn');
    return;
  }
  // v0.0.8 — storm incoming warning. Fires when courier is currently
  // dry but a storm is about to spawn, OR there's an existing storm
  // that's close enough to reach the courier soon.
  if (weatherAtCourier().intensity === 'none') {
    // Check if a storm spawn is imminent
    const ticksUntilSpawn = S.nextStormSpawnTick - S.ticks;
    if (ticksUntilSpawn > 0 && ticksUntilSpawn < C.STORM_INCOMING_WARN_TICKS && lines.warningRain && lines.warningRain.length) {
      speak(arrivedNodeId, pickRandom(lines.warningRain), 'warn');
      return;
    }
  }
  if (staminaSegCount() <= 1 && lines.warningStamina && lines.warningStamina.length) {
    speak(arrivedNodeId, pickRandom(lines.warningStamina), 'warn');
  }
}

export function tryPreview(arrivedNodeId) {
  if (!NPC_DEFS[arrivedNodeId]) return;
  const npc = S.npcs[arrivedNodeId];
  if (!npc || !npc.unlocks || !npc.unlocks.t60) return;
  const lines = (NPC_LINES[arrivedNodeId] && NPC_LINES[arrivedNodeId].preview) || [];
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
  speak(arrivedNodeId, msg, 'preview');
}

export function tryRestPrompt(arrivedNodeId) {
  if (!NPC_DEFS[arrivedNodeId]) return;
  const npc = S.npcs[arrivedNodeId];
  if (!npc || !npc.unlocks || !npc.unlocks.t80) return;
  if (S._transient.depotRestPending) return;
  if (S.stamina >= S.staminaMax * 0.85) return;
  if (S.scrip < 5) return;
  const def = NPC_DEFS[arrivedNodeId];
  const lines = (NPC_LINES[arrivedNodeId] && NPC_LINES[arrivedNodeId].rest) || [];
  if (!lines.length) return;
  S._transient.depotRestPending = { nodeId: arrivedNodeId };
  speak(arrivedNodeId, pickRandom(lines), 'rest');
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
  S.scrip = Math.max(0, S.scrip - 10);
  S.stamina = S.staminaMax * 1.05;
  S.staminaOverboost = true;
  S.canteen = Math.min(S.canteenMax, S.canteen + 30);
  addLog(`rested at <span class="log-hi">${def ? def.callsign : nodeId}</span> \u2014 <span class="log-ok">+stamina +canteen \u221210\u00a2</span>`);
  renderStamina();
  updateHUD();
  const btn = document.getElementById('depotRestBtn');
  if (btn) btn.closest('.log-line').remove();
}
