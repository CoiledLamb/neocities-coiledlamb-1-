/* ==============================================
   THE LONG HAUL — NPC trust + tier behaviors

   Per-NPC trust 0–100, ratcheting through tiers at
   TRUST_THRESHOLDS [20, 40, 60, 80] (realigned in
   pre-refactor commit A from 25/50/75/100).

   Tier behaviors (function names still reflect old
   thresholds — rename to tryWarning/tryPreview/
   tryRestPrompt deferred to a follow-up commit):
     t20: stage-1 reveal of NPC_ADJACENT nodes
     t40: tryT50Warning — trip-risk > rain > stamina
     t60: tryT75Preview — outbound edge package preview
     t80: tryT100RestPrompt — [rest] log button

   Imports note (commit 9 / v0.0.7.9):
     Imports addLog, drawRouteMap, renderSettlements,
     staminaSegCount, renderStamina, updateHUD from main.js.
     All circular-by-file but invoked only inside function
     bodies, never at module load. They'll move to their own
     modules in later commits.
   ============================================== */
'use strict';

import { S } from './state.js';
import * as C from './constants.js';
import { NPC_DEFS, NPC_ADJACENT } from './data/npc-defs.js';
import { NPC_LINES } from './data/npc-lines.js';
import { postActivity } from './multiplayer.js';
import { getNodeStage, setNodeStage, getDisplayLabel } from './identification.js';
import { speak, pickRandom } from './channels.js';
import {
  addLog, drawRouteMap, renderSettlements,
  staminaSegCount, renderStamina, updateHUD,
} from './main.js';

const els = S._transient.els;
const worldCells = S._transient.worldCells;

export function getNpc(depotId) {
  if (!NPC_DEFS[depotId] || !S.npcs || !S.npcs[depotId]) return null;
  return S.npcs[depotId];
}

export function addTrust(depotId, amount, reason) {
  const npc = getNpc(depotId);
  if (!npc || !amount) return 0;
  const before = npc.trust;
  npc.trust = Math.max(0, Math.min(100, npc.trust + amount));
  for (const t of C.TRUST_THRESHOLDS) {
    const key = 't' + t;
    if (before < t && npc.trust >= t && !npc.unlocks[key]) {
      npc.unlocks[key] = true;
      onTrustUnlock(depotId, t);
    }
  }
  return npc.trust;
}

function onTrustUnlock(depotId, tier) {
  const def = NPC_DEFS[depotId];
  const npcLabel = def ? def.callsign : depotId;
  postActivity('trust_unlock', { depotId, npcLabel, tier });

  const line = NPC_LINES.threshold[depotId] && NPC_LINES.threshold[depotId][tier];
  if (line) speak(depotId, line);

  if (tier === 20) {
    const adj = NPC_ADJACENT[depotId] || [];
    const revealed = [];
    adj.forEach(nid => {
      if (getNodeStage(nid) === 0) {
        if (setNodeStage(nid, 1)) revealed.push(nid);
      }
    });
    if (revealed.length > 0) {
      const labels = revealed.map(getDisplayLabel).join(', ');
      addLog(`<span class="log-hi">${npcLabel}</span> shares word of nearby waypoints \u2014 signal: ${labels}`);
      drawRouteMap();
      renderSettlements();
    } else {
      addLog(`<span class="log-hi">${npcLabel}</span> trusts you (20)`);
    }
    return;
  }
  if (tier === 40)      addLog(`<span class="log-hi">${npcLabel}</span> trusts you (40) \u2014 will share warnings`);
  else if (tier === 60) addLog(`<span class="log-hi">${npcLabel}</span> trusts you (60) \u2014 will preview routes`);
  else if (tier === 80) addLog(`<span class="log-hi">${npcLabel}</span> trusts you (80) \u2014 you have a seat by their fire`);
}

export function tryT50Warning(depotId) {
  const npc = getNpc(depotId);
  if (!npc || !npc.unlocks.t40) return false;
  const lines = NPC_LINES.warning[depotId];
  if (!lines) return false;

  const myEdgeIdx = S.edges.findIndex(([a,b]) => a === depotId);
  if (myEdgeIdx >= 0) {
    const [, nextDest] = S.edges[myEdgeIdx];
    if (C.RISKY_EDGE_DEST.has(nextDest) && lines.trip) {
      speak(depotId, lines.trip);
      return true;
    }
  }
  if (!S.isRaining && S.rainTimer > 0 && S.rainTimer < 25 && lines.rain) {
    speak(depotId, lines.rain);
    return true;
  }
  if (staminaSegCount() <= 2 && lines.stamina) {
    speak(depotId, lines.stamina);
    return true;
  }
  return false;
}

export function tryT75Preview(depotId) {
  const npc = getNpc(depotId);
  if (!npc || !npc.unlocks.t60) return false;
  const tmpl = NPC_LINES.preview[depotId];
  if (!tmpl) return false;

  const myEdgeIdx = S.edges.findIndex(([a,b]) => a === depotId);
  if (myEdgeIdx < 0) return false;
  const [, nextDest] = S.edges[myEdgeIdx];

  const startCell = myEdgeIdx * C.CELLS_PER_EDGE;
  const endCell   = startCell + C.CELLS_PER_EDGE;
  let found = null;
  for (let i = startCell; i < endCell; i++) {
    const c = worldCells[i];
    if (c && c.pkg && !c.pkg.picked) { found = c.pkg; break; }
  }
  if (!found) return false;

  const kindMap = { s: 'small', m: 'medium', l: 'large' };
  const text = tmpl
    .replace('{kind}', kindMap[found.size] || found.size)
    .replace('{next}', getDisplayLabel(nextDest));
  speak(depotId, text);
  return true;
}

export function tryT100RestPrompt(depotId) {
  const npc = getNpc(depotId);
  if (!npc || !npc.unlocks.t80) return false;
  if (S._transient.depotRestPending) return false;
  if (S.stamina >= S.staminaMax && S.staminaOverboost) return false;
  const def = NPC_DEFS[depotId];
  const npcLabel = def ? def.callsign : depotId;
  S._transient.depotRestPending = { depotId };
  addLog(`<span class="log-hi">${npcLabel}</span> offers a seat by the fire \u2014 <button class="log-btn" id="depotRestBtn">rest</button>`);
  setTimeout(() => {
    const btn = document.getElementById('depotRestBtn');
    if (btn) btn.addEventListener('click', confirmDepotRest);
  }, 0);
  return true;
}

function confirmDepotRest() {
  if (!S._transient.depotRestPending) return;
  const { depotId } = S._transient.depotRestPending;
  S._transient.depotRestPending = null;
  const def = NPC_DEFS[depotId];
  const npcLabel = def ? def.callsign : depotId;
  S.stamina = S.staminaMax * 1.05;
  S.staminaOverboost = true;
  S.canteen = Math.min(S.canteenMax, S.canteen + 30);
  S.scrip += C.DEPOT_REST_BONUS_SCRIP;
  addLog(`rested at <span class="log-hi">${npcLabel}</span> \u2014 <span class="log-ok">stamina restored, +${C.DEPOT_REST_BONUS_SCRIP}\u00a2</span>`);
  const line = pickRandom(NPC_LINES.rest[depotId]);
  if (line) speak(depotId, line);
  renderStamina(); updateHUD();
  const btn = document.getElementById('depotRestBtn');
  if (btn) btn.closest('.log-line').remove();
}
