/* ==============================================
   THE LONG HAUL — NPC trust + tier behaviors

   Per-NPC trust 0–100, ratcheting through tiers at
   TRUST_THRESHOLDS [20, 40, 60, 80] (realigned in
   pre-refactor commit A from 25/50/75/100).

   Tier behaviors (function names still reflect old
   thresholds — rename to tryWarning/tryPreview/
   tryRestPrompt deferred to a follow-up commit, see
   bug list item 1):
     t20: stage-1 reveal of NPC_ADJACENT nodes
     t40: tryT50Warning — trip-risk > rain > stamina
     t60: tryT75Preview — outbound edge package preview
     t80: tryT100RestPrompt — [rest] log button
   ============================================== */
'use strict';

import { S } from './state.js';
import * as C from './constants.js';
import { NPC_DEFS, NPC_ADJACENT } from './data/npc-defs.js';
import { NPC_LINES } from './data/npc-lines.js';
import { postActivity } from './multiplayer.js';
import { getNodeStage, setNodeStage, getDisplayLabel } from './identification.js';
import { speak, pickRandom } from './channels.js';
import { staminaSegCount, renderStamina } from './stamina.js';
import { addLog } from './render/log.js';
import { updateHUD } from './render/hud.js';
import { drawRouteMap } from './render/route-map.js';
import { renderSettlements } from './render/settlements.js';

const els = S._transient.els;
const worldCells = S._transient.worldCells;

export function getNpc(depotId) {
  if (!NPC_DEFS[depotId] || !S.npcs || !S.npcs[depotId]) return null;
  return S.npcs[depotId];
}

export function addTrust(depotId, amount, reason) {
  if (!NPC_DEFS[depotId]) return;
  if (!S.npcs[depotId]) S.npcs[depotId] = { trust: 0, lastSpokeTick: 0 };
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
  S.npcs[depotId][tierKey] = true;

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

export function tryT50Warning(arrivedNodeId) {
  if (!NPC_DEFS[arrivedNodeId]) return;
  const npc = S.npcs[arrivedNodeId];
  if (!npc || !npc.t40) return;
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
  if (!S.isRaining && S.rainTimer > 0 && S.rainTimer < 25 && lines.warningRain && lines.warningRain.length) {
    speak(arrivedNodeId, pickRandom(lines.warningRain), 'warn');
    return;
  }
  if (staminaSegCount() <= 1 && lines.warningStamina && lines.warningStamina.length) {
    speak(arrivedNodeId, pickRandom(lines.warningStamina), 'warn');
  }
}

export function tryT75Preview(arrivedNodeId) {
  if (!NPC_DEFS[arrivedNodeId]) return;
  const npc = S.npcs[arrivedNodeId];
  if (!npc || !npc.t60) return;
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

export function tryT100RestPrompt(arrivedNodeId) {
  if (!NPC_DEFS[arrivedNodeId]) return;
  const npc = S.npcs[arrivedNodeId];
  if (!npc || !npc.t80) return;
  if (S._transient.restPromptPending) return;
  if (S.stamina >= S.staminaMax * 0.85) return;
  if (S.scrip < 5) return;
  const def = NPC_DEFS[arrivedNodeId];
  const lines = (NPC_LINES[arrivedNodeId] && NPC_LINES[arrivedNodeId].rest) || [];
  if (!lines.length) return;
  S._transient.restPromptPending = { nodeId: arrivedNodeId };
  speak(arrivedNodeId, pickRandom(lines), 'rest');
  addLog(`<button class="log-btn" id="depotRestBtn">accept rest at ${def.callsign}</button>`);
  setTimeout(() => {
    const btn = document.getElementById('depotRestBtn');
    if (btn) btn.addEventListener('click', confirmDepotRest);
  }, 0);
}

function confirmDepotRest() {
  if (!S._transient.restPromptPending) return;
  const { nodeId } = S._transient.restPromptPending;
  S._transient.restPromptPending = null;
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
