/* ==============================================
   THE LONG HAUL — game logic
   v0.0.7.7

   Refactor commit 7: extracted lost cargo recovery loop
   to ./recovery.js. tickRecoveryAttempt, spawnRecoveryCargo,
   updatePorterStripBadges now imported from there.

   pickRandom helper duplicated in recovery.js (still used
   here by NPC code). Will consolidate when trust/channels
   extract or a util module appears.

   Imports:
     S — game state singleton (state.js)
     C — tuning constants namespace (constants.js)
     NPC_LINES, NPC_DEFS, NPC_ADJACENT — NPC data
     NPC_PKGS, LOST_PKGS — cargo definitions
     ZONE_TYPES — terrain weights/chars/spawn rates
     NODE_GLYPHS, STATUS_COLORS — visual maps
     UPGRADE_DEFS — upgrade list (closures mutate S)
     saveGame, loadGame, armWipe, updateSaveStrip — persistence
     getPorterId, getCachedPorterId, postActivity, postLostDrop,
       fetchLostFromPeer, startPolling, stopPolling,
       shortPorterId, checkDistMilestones — multiplayer
     tickRecoveryAttempt, updatePorterStripBadges — recovery

   Local aliases:
     els, worldCells — see commit 2 notes
   ============================================== */
'use strict';

import { S } from './state.js';
import * as C from './constants.js';
import { NPC_LINES } from './data/npc-lines.js';
import { NPC_DEFS, NPC_ADJACENT } from './data/npc-defs.js';
import { NPC_PKGS, LOST_PKGS } from './data/packages.js';
import { ZONE_TYPES } from './data/zones.js';
import { NODE_GLYPHS, STATUS_COLORS } from './data/glyphs.js';
import { UPGRADE_DEFS } from './data/upgrades.js';
import { saveGame, loadGame, armWipe, updateSaveStrip } from './persistence.js';
import {
  getPorterId, getCachedPorterId, postActivity, postLostDrop,
  fetchLostFromPeer, startPolling, stopPolling,
  shortPorterId, checkDistMilestones,
} from './multiplayer.js';
import { tickRecoveryAttempt, updatePorterStripBadges } from './recovery.js';

// Local aliases — live references into S._transient. Never reassign these.
const els = S._transient.els;
const worldCells = S._transient.worldCells;

function sandalCap() {
  return S.upgrades.sandalSatchel ? C.SANDAL_CAP_UPGRADED : C.SANDAL_CAP_BASE;
}

// v0.0.7 commit 6: distKm accumulator helpers.
function posKm(edgeIdx, dotT) {
  return (edgeIdx + dotT) * C.KM_PER_EDGE;
}

function accumulateDist() {
  const t = S._transient;
  if (t.lastDistEdgeIdx === null || t.lastDistDotT === null) {
    t.lastDistEdgeIdx = S.edgeIdx;
    t.lastDistDotT    = S.dotT;
    return;
  }
  const prev = posKm(t.lastDistEdgeIdx, t.lastDistDotT);
  const now  = posKm(S.edgeIdx, S.dotT);
  let delta  = now - prev;
  if (delta < 0) {
    delta += S.edges.length * C.KM_PER_EDGE;
  }
  if (delta > C.KM_PER_EDGE * 2) delta = 0;
  S.distKm = Math.round((S.distKm + delta) * 10) / 10;
  t.lastDistEdgeIdx = S.edgeIdx;
  t.lastDistDotT    = S.dotT;
}

// ============================================================
// IDENTIFICATION STAGES
// ============================================================
function getNodeStage(id) {
  return (S.nodeStages && typeof S.nodeStages[id] === 'number') ? S.nodeStages[id] : 0;
}

function setNodeStage(id, stage) {
  if (!S.nodeStages) S.nodeStages = {};
  const cur = getNodeStage(id);
  if (stage > cur) {
    S.nodeStages[id] = stage;
    return true;
  }
  return false;
}

function markEdgeAdjacent(fromId, toId) {
  let changed = false;
  if (setNodeStage(fromId, 2)) changed = true;
  if (setNodeStage(toId,   2)) changed = true;
  return changed;
}

function getDisplayLabel(id) {
  const stage = getNodeStage(id);
  if (stage >= 3) {
    const node = S.routeNodes.find(n => n.id === id);
    return node ? node.label : id;
  }
  if (stage >= 2) {
    const settle = S.settlements[id];
    return settle ? settle.tier : '???';
  }
  return '???';
}

// ============================================================
// NPC TRUST
// ============================================================
function getNpc(depotId) {
  if (!NPC_DEFS[depotId] || !S.npcs || !S.npcs[depotId]) return null;
  return S.npcs[depotId];
}

function addTrust(depotId, amount, reason) {
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

// ============================================================
// CHANNELS / CHATTER
// ============================================================
function speak(depotId, text) {
  const def = NPC_DEFS[depotId];
  if (!def) return;
  S.channels.unshift({
    depotId,
    callsign: def.callsign,
    text,
    ts: S.ticks,
  });
  if (S.channels.length > C.CHANNELS_DISPLAY_CAP) {
    S.channels.length = C.CHANNELS_DISPLAY_CAP;
  }
  renderChannels();
}

function pickRandom(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function tryT50Warning(depotId) {
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

function tryT75Preview(depotId) {
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

function tryT100RestPrompt(depotId) {
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

function tickAmbientChatter() {
  if (S.ticks % 10 !== 0) return;
  Object.keys(NPC_DEFS).forEach(depotId => {
    const npc = getNpc(depotId);
    if (!npc || !npc.unlocks.t20) return;
    if (S.ticks < npc.nextChatterTick) return;
    if (Math.random() >= C.CHATTER_BASE_CHANCE * 10) return;
    const line = pickRandom(NPC_LINES.ambient[depotId]);
    if (!line) return;
    speak(depotId, line);
    npc.nextChatterTick = S.ticks + C.CHATTER_INTERVAL_MIN_TICKS +
      Math.floor(Math.random() * (C.CHATTER_INTERVAL_MAX_TICKS - C.CHATTER_INTERVAL_MIN_TICKS));
  });
}

function fmtChannelAge(ts) {
  const elapsedTicks = S.ticks - ts;
  const elapsedSecs = Math.floor(elapsedTicks * C.TICK_MS / 1000);
  if (elapsedSecs < 5)   return 'now';
  if (elapsedSecs < 60)  return elapsedSecs + 's';
  const mins = Math.floor(elapsedSecs / 60);
  if (mins < 60)         return mins + 'm';
  return Math.floor(mins / 60) + 'h';
}

function renderChannels() {
  if (!els.channelsEl) return;
  if (S.channels.length === 0) {
    els.channelsEl.innerHTML = '<div class="chan-item chan-quiet">no callsigns trusted yet \u2014 deliver to depots to build trust</div>';
    return;
  }
  els.channelsEl.innerHTML = S.channels.map(c =>
    `<div class="chan-item" data-depot="${c.depotId}">` +
      `<span class="chan-cs">${c.callsign}</span>` +
      `<span class="chan-text">${c.text}</span>` +
      `<span class="chan-ago">${fmtChannelAge(c.ts)}</span>` +
    `</div>`
  ).join('');
}

// ============================================================
// WORLD CELLS
// ============================================================
function weightedPick(arr, getW) {
  const total = arr.reduce((s, x) => s + getW(x), 0);
  let r = Math.random() * total;
  for (const x of arr) { r -= getW(x); if (r <= 0) return x; }
  return arr[0];
}

function makeWorldPkg(edgeIdx) {
  const isLost = Math.random() < 0.15;
  const pool   = isLost ? LOST_PKGS : NPC_PKGS;
  const def    = pool[Math.floor(Math.random() * pool.length)];
  return { ...def, isLost: isLost || false, destId: S.edges[edgeIdx][1], picked: false, respawnIn: 0 };
}

function buildWorld() {
  worldCells.length = 0;
  for (let ei = 0; ei < 6; ei++) {
    const isRisky = C.RISKY_EDGE_DEST.has(S.edges[ei][1]);
    let ci = 0;

    while (ci < C.CELLS_PER_EDGE) {
      const zoneKey = weightedPick(Object.keys(ZONE_TYPES), k => ZONE_TYPES[k].weight);
      const zone    = ZONE_TYPES[zoneKey];
      const zoneLen = zone.width[0] + Math.floor(Math.random() * (zone.width[1] - zone.width[0]));

      if (zone.isDepotApproach && Math.random() < 0.4 && ci + 3 <= C.CELLS_PER_EDGE) {
        worldCells.push({ html: `<span class="fc fc-fl">   </span>`,     pkg: null, risky: isRisky, edgeIdx: ei });
        worldCells.push({ html: `<span class="fc fc-depot"> [=] </span>`, pkg: null, risky: isRisky, edgeIdx: ei });
        worldCells.push({ html: `<span class="fc fc-fl">   </span>`,     pkg: null, risky: isRisky, edgeIdx: ei });
        ci += 3;
      }

      for (let i = 0; i < zoneLen && ci < C.CELLS_PER_EDGE; i++, ci++) {
        const r = Math.random();
        if (r < zone.pkgChance && (ci % 8 === 0) && ci + 2 < C.CELLS_PER_EDGE) {
          const pkg = makeWorldPkg(ei);
          worldCells.push({ html: '', pkg, risky: isRisky, edgeIdx: ei });
          i += 2; ci += 2;
          continue;
        }
        if (r < zone.pkgChance + zone.sandalChance) {
          worldCells.push({ html: `<span class="fc fc-sw-plant" title="sandalweed"> * </span>`, pkg: null, sandal: true, risky: isRisky, edgeIdx: ei });
          i++; ci++;
          continue;
        }
        const c = weightedPick(zone.chars, x => x.w);
        worldCells.push({ html: `<span class="fc ${c.cls}"> ${c.ch} </span>`, pkg: null, risky: isRisky, edgeIdx: ei });
      }

      if (ci < C.CELLS_PER_EDGE) {
        worldCells.push({ html: `<span class="fc fc-fl">  </span>`, pkg: null, risky: isRisky, edgeIdx: ei });
        ci++;
      }
    }
  }
  while (worldCells.length < C.TOTAL_CELLS) {
    worldCells.push({ html: `<span class="fc fc-fl"> . </span>`, pkg: null, risky: false, edgeIdx: 0 });
  }
  worldCells.length = C.TOTAL_CELLS;
}

// ============================================================
// WORLD SCROLL
// ============================================================
function calcCellPxWidth() {
  const probe = document.createElement('span');
  probe.className   = 'fc fc-fl';
  probe.textContent = ' . ';
  probe.style.cssText = 'visibility:hidden;position:absolute;';
  document.body.appendChild(probe);
  S._transient.cellPxWidth = probe.getBoundingClientRect().width || 12;
  document.body.removeChild(probe);
}

function worldPosFromRoute() {
  const courierCell = (S.edgeIdx * C.CELLS_PER_EDGE) + (S.dotT * C.CELLS_PER_EDGE);
  return ((courierCell - C.COURIER_CELL) % C.TOTAL_CELLS + C.TOTAL_CELLS) % C.TOTAL_CELLS;
}

function renderFieldstrip() {
  const strip = els.fieldstrip;
  if (!strip) return;
  const cellPxWidth = S._transient.cellPxWidth;
  const leftCell = Math.floor(S.worldPos);
  const viewportPx = (strip.parentNode && strip.parentNode.clientWidth) || (C.VIEWPORT_CELLS * cellPxWidth);
  const renderCount = Math.max(C.VIEWPORT_CELLS, Math.ceil(viewportPx / cellPxWidth) + 8);
  let html = '';
  for (let i = 0; i < renderCount; i++) {
    const ci   = (leftCell + i) % C.TOTAL_CELLS;
    const cell = worldCells[ci];
    if (!cell) continue;
    if (cell.pkg) {
      if (!cell.pkg.picked) {
        const cls = cell.pkg.isLost ? 'fc-pk fc-pk-lost' : 'fc-pk';
        html += `<span class="fc ${cls}" data-ci="${ci}">[${cell.pkg.size}]</span>`;
      } else {
        html += `<span class="fc fc-fl">   </span>`;
      }
    } else {
      html += cell.html;
    }
  }
  strip.innerHTML = html;
  const fracOffset = (S.worldPos - Math.floor(S.worldPos)) * cellPxWidth;
  strip.style.transform = `translateX(${-fracOffset}px)`;
}

// ============================================================
// PACKAGE PICKUP
// ============================================================
function scanForPickup() {
  if (S.status !== 'walking' && S.status !== 'carrying') return;
  const courierCell = Math.floor((S.edgeIdx * C.CELLS_PER_EDGE) + (S.dotT * C.CELLS_PER_EDGE));
  for (let offset = 0; offset <= C.PKG_PICKUP_RANGE; offset++) {
    const ci   = (courierCell + offset) % C.TOTAL_CELLS;
    const cell = worldCells[ci];
    if (!cell) continue;

    if (cell.sandal) {
      if (S.sandalweedCount >= sandalCap()) continue;
      cell.sandal = false;
      cell.html = `<span class="fc fc-fl">   </span>`;
      S.sandalweedCount++;
      addLog(`harvested <span class="log-hi">sandalweed</span> (${S.sandalweedCount}/${sandalCap()})`);
      renderBoots();
      continue;
    }

    if (!cell.pkg || cell.pkg.picked) continue;
    const pkg = cell.pkg;
    if (pkg.slots > S.maxSlots - S.usedSlots) continue;
    if (pkg.kg    > S.maxWeight - S.usedWeight) continue;

    pkg.picked = true;
    const carried = {
      size: pkg.size, label: pkg.label, kg: pkg.kg, slots: pkg.slots,
      scrip: pkg.scrip, isLost: pkg.isLost, destId: pkg.destId,
      isRecovery: !!pkg.isRecovery,
      recoveryFromPorter: pkg.recoveryFromPorter || null,
      _worldCell: ci,
    };
    S.inventory.push(carried);
    S.usedSlots  += carried.slots;
    S.usedWeight += carried.kg;
    S.status = 'carrying';
    renderCourierStack();
    renderCargoSlots(true);
    if (els.courierAt) els.courierAt.className = 'tlh-at bounce carry';
    const lostTag = carried.isRecovery
      ? ` <span class="log-wn">[recovery]</span> from <span class="log-hi">${shortPorterId(carried.recoveryFromPorter)}</span>`
      : (carried.isLost ? ' <span class="log-wn">[lost pkg]</span>' : '');
    addLog(`picked up <span class="log-hi">[${carried.size}] ${carried.label}</span>${lostTag}`);
    return;
  }
}

// ============================================================
// PACKAGE DELIVERY
// ============================================================
function tryDeliver(arrivedNodeId) {
  const toDeliver = S.inventory.filter(p => p.destId === arrivedNodeId);
  if (toDeliver.length === 0) return;
  const settle = S.settlements[arrivedNodeId];
  const destLabel = settle ? settle.label : arrivedNodeId;
  toDeliver.forEach(pkg => {
    S.scrip      += pkg.scrip;
    S.delivered  += 1;
    S.usedSlots  -= pkg.slots;
    S.usedWeight -= pkg.kg;
    S.inventory.splice(S.inventory.indexOf(pkg), 1);
    if (pkg._worldCell !== undefined && worldCells[pkg._worldCell] && worldCells[pkg._worldCell].pkg) {
      if (pkg.isRecovery) {
        worldCells[pkg._worldCell].pkg = null;
        worldCells[pkg._worldCell].isRecovery = false;
        S.activeRecoveryCount = Math.max(0, S.activeRecoveryCount - 1);
        updatePorterStripBadges();
      } else {
        worldCells[pkg._worldCell].pkg.respawnIn = C.PKG_RESPAWN_TICKS;
      }
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
    addLog(`delivered to <span class="log-hi">${destLabel}</span> \u2014 <span class="log-ok">+${pkg.scrip}\u00a2</span>`);
    postActivity('delivery', { destId: arrivedNodeId, destLabel, scrip: pkg.scrip, size: pkg.size });

    if (pkg.isRecovery && pkg.recoveryFromPorter) {
      postActivity('lost_recovered', {
        label: pkg.label,
        size: pkg.size,
        forPorter: pkg.recoveryFromPorter,
      });
      addLog(`<span class="log-ok">recovered</span> <span class="log-hi">${pkg.label}</span> \u2014 left by <span class="log-hi">${shortPorterId(pkg.recoveryFromPorter)}</span>`);
    }

    if (NPC_DEFS[arrivedNodeId]) {
      const gain = pkg.isLost ? C.TRUST_GAIN_LOST_DELIVERY : C.TRUST_GAIN_DELIVERY;
      addTrust(arrivedNodeId, gain, pkg.isLost ? 'lost-delivery' : 'delivery');
    }
  });
  renderCourierStack();
  renderCargoSlots(true);
  if (S.inventory.length === 0) {
    S.status = 'walking';
    if (els.courierAt) els.courierAt.className = 'tlh-at bounce';
  }
  renderSettlements();
}

function tickPkgRespawns() {
  for (let i = 0; i < C.TOTAL_CELLS; i++) {
    const cell = worldCells[i];
    if (!cell || !cell.pkg || !cell.pkg.picked || cell.pkg.respawnIn <= 0) continue;
    cell.pkg.respawnIn--;
    if (cell.pkg.respawnIn === 0) {
      const active = worldCells.filter(c => c.edgeIdx === cell.edgeIdx && c.pkg && !c.pkg.picked).length;
      if (active < C.PKG_MAX_PER_EDGE) {
        cell.pkg.picked = false;
        addLog(`<span class="log-ok">new package</span> spotted on the road`);
      } else {
        cell.pkg.respawnIn = C.PKG_RESPAWN_TICKS;
      }
    }
  }
}

// ============================================================
// DESTINATION DRIFT
// ============================================================
function updateDestDrift() {
  if (!els.destDrift) return;
  const [, toId] = currentEdge();
  const node  = S.routeNodes.find(n => n.id === toId);
  if (!node) return;
  const glyph = NODE_GLYPHS[toId] || `[${toId}]`;
  const label = getDisplayLabel(toId);
  els.destDrift.innerHTML =
    `<span class="dest-glyph">${glyph.replace(/\n/g, '<br>')}</span>` +
    `<span class="dest-label">${label}</span>`;
  els.destDrift.style.animation = 'none';
  void els.destDrift.offsetHeight;
  els.destDrift.style.animation = 'destdrift 22s linear forwards';
}

// ============================================================
// RAIN
// ============================================================
function buildRain() {
  if (!els.rainOverlay) return;
  els.rainOverlay.innerHTML = '';
  for (let i = 0; i < 18; i++) {
    const d = document.createElement('span');
    d.textContent = Math.random() < 0.5 ? '|' : '.';
    const dur = 1.1 + Math.random() * 1.3, delay = Math.random() * 2;
    d.style.cssText =
      `position:absolute;left:${Math.random()*100}%;top:0;font-size:10px;` +
      `color:#1e5554;font-family:'Source Code Pro',monospace;` +
      `animation:raindrop ${dur}s linear ${delay}s infinite;`;
    els.rainOverlay.appendChild(d);
  }
}

function setRain(on) {
  S.isRaining = on;
  if (els.rainOverlay) els.rainOverlay.style.display = on ? 'block' : 'none';
  if (on) { S.canteen = Math.min(S.canteenMax, S.canteen + 30); addLog('<span class="log-wn">rain begins \u2014 canteen refilling</span>'); }
  else      addLog('rain clears');
}

// ============================================================
// ROUTE MAP
// ============================================================
function layoutRouteNodes() {
  const W = 110;
  [{ id:'A', x:W/2, y:18 }, { id:'?', x:W-14, y:65 }, { id:'B', x:W-14, y:128 },
   { id:'C', x:W/2, y:175 }, { id:'H', x:14, y:128 }, { id:'\u00b7', x:14, y:65 }]
  .forEach(p => { const n = S.routeNodes.find(n => n.id === p.id); if (n) { n.x = p.x; n.y = p.y; } });
}

function currentEdge() { return S.edges[S.edgeIdx % S.edges.length]; }

function drawRouteMap() {
  const svg = els.routeSvg;
  if (!svg) return;
  svg.innerHTML = '';
  const ns = 'http://www.w3.org/2000/svg';
  const [fromId, toId] = currentEdge();

  S.edges.forEach(([a, b]) => {
    const na = S.routeNodes.find(n => n.id === a), nb = S.routeNodes.find(n => n.id === b);
    if (!na || !nb) return;
    const minStage = Math.min(getNodeStage(a), getNodeStage(b));
    const stroke = minStage >= 3 ? '#2a5c5a'
                 : minStage >= 2 ? '#1e5554'
                 : '#132e2d';
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', na.x); line.setAttribute('y1', na.y);
    line.setAttribute('x2', nb.x); line.setAttribute('y2', nb.y);
    line.setAttribute('stroke', stroke);
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-dasharray', '3 3');
    svg.appendChild(line);
  });

  S.routeNodes.forEach(n => {
    const isCurrent = (n.id === fromId || n.id === toId);
    const stage = getNodeStage(n.id);
    const g = document.createElementNS(ns, 'g'); g.style.cursor = 'pointer';
    g.setAttribute('class', 'route-node-g');
    g.setAttribute('data-stage', String(stage));
    g.setAttribute('data-id', n.id);
    g.setAttribute('title', getDisplayLabel(n.id));

    const fill = isCurrent ? '#0b2e2d'
               : stage >= 3 ? '#1e5554'
               : stage >= 2 ? '#1a3f3e'
               : stage >= 1 ? '#142e2d'
               : '#132e2d';
    const stroke = isCurrent ? '#77bfcf'
                 : stage >= 3 ? '#3a6a68'
                 : stage >= 2 ? '#2f5e5c'
                 : stage >= 1 ? '#244e4d'
                 : '#1e5554';
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', n.x); c.setAttribute('cy', n.y);
    c.setAttribute('r', isCurrent ? 7 : 5);
    c.setAttribute('fill', fill);
    c.setAttribute('stroke', stroke);
    c.setAttribute('stroke-width', isCurrent ? '1.5' : '1');

    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', n.x); t.setAttribute('y', n.y + 4);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-family', "'Source Code Pro',monospace");
    t.setAttribute('font-size', '8'); t.setAttribute('font-weight', '700');
    t.setAttribute('fill', isCurrent ? '#77bfcf'
                          : stage >= 3 ? '#4a7a78'
                          : stage >= 2 ? '#3a6a68'
                          : stage >= 1 ? '#2a5c5a'
                          : '#2a5c5a');
    t.textContent = (stage >= 1 || n.id === '?') ? n.id : '?';

    const lx     = n.x > 70 ? n.x - 9 : n.x < 40 ? n.x + 9 : n.x;
    const anchor = n.x > 70 ? 'end'    : n.x < 40 ? 'start'  : 'middle';
    const ly     = n.y < 30 ? n.y - 9  : n.y > 165 ? n.y + 12 : n.y < 100 ? n.y - 9 : n.y + 13;
    const lbl = document.createElementNS(ns, 'text');
    lbl.setAttribute('x', lx); lbl.setAttribute('y', ly);
    lbl.setAttribute('text-anchor', anchor);
    lbl.setAttribute('font-family', "'Source Code Pro',monospace");
    lbl.setAttribute('font-size', '7');
    lbl.setAttribute('fill', isCurrent ? '#77bfcf'
                            : stage >= 3 ? '#3a6a68'
                            : stage >= 2 ? '#2a5c5a'
                            : '#1e5554');
    lbl.textContent = stage === 0 ? '' : getDisplayLabel(n.id);

    g.appendChild(c); g.appendChild(t); g.appendChild(lbl);
    svg.appendChild(g);
  });

  const dot = document.createElementNS(ns, 'circle');
  dot.setAttribute('id', 'routeDot'); dot.setAttribute('r', '3');
  dot.setAttribute('fill', '#e0eeec'); dot.setAttribute('stroke', '#77bfcf'); dot.setAttribute('stroke-width', '1');
  svg.appendChild(dot);
  updateRouteDot();
}

function updateRouteDot() {
  const dot = document.getElementById('routeDot');
  if (!dot) return;
  const [fromId, toId] = currentEdge();
  const from = S.routeNodes.find(n => n.id === fromId), to = S.routeNodes.find(n => n.id === toId);
  if (!from || !to) return;
  dot.setAttribute('cx', from.x + (to.x - from.x) * S.dotT);
  dot.setAttribute('cy', from.y + (to.y - from.y) * S.dotT);
}

// ============================================================
// DOM REFS
// ============================================================
const $ = id => document.getElementById(id);

function resolveEls() {
  Object.assign(els, {
    porterStrip:  document.querySelector('.tlh-porter-strip'),
    porterIdEl:   $('porterIdEl'),
    porterHint:   document.querySelector('.tlh-porter-hint'),
    delivered:    $('hDelivered'),
    scrip:        $('hScrip'),
    walked:       $('hWalked'),
    status:       $('hStatus'),
    courierWrap:  $('courierWrap'),
    courierAt:    $('courierAt'),
    courierStack: $('courierStack'),
    fieldstrip:   $('fieldstrip'),
    rainOverlay:  $('rainOverlay'),
    destDrift:    $('destDrift'),
    cargoSlots:   $('cargoSlots'),
    weightSegs:   $('weightSegs'),
    bootsBar:     $('bootsBar'),
    bootsVal:     $('bootsVal'),
    bootsGearBtn: $('bootsGearBtn'),
    bootsGearPop: $('bootsGearPop'),
    autobuyBtn:   $('autobuyBtn'),
    buyBootsBtn:  $('buyBootsBtn'),
    clipBadge:    $('clipBadge'),
    drinkBtn:     $('drinkBtn'),
    autodrinkBtn: $('autodrinkBtn'),
    canteenBar:   $('canteenBar'),
    tieDownBtn:   $('tieDownBtn'),
    logEl:        $('logEl'),
    upgradesEl:   $('upgradesEl'),
    settlementsEl:$('settlementsEl'),
    routeSvg:     $('routeSvg'),
    networkEl:    $('networkEl'),
    channelsEl:   $('channelsEl'),
    saveBtn:      $('saveBtn'),
    wipeBtn:      $('wipeBtn'),
    saveAgo:      $('saveAgo'),
  });
}

// ============================================================
// UPGRADES
// ============================================================
function renderUpgrades() {
  if (!els.upgradesEl) return;
  els.upgradesEl.innerHTML = '';
  UPGRADE_DEFS.forEach(def => {
    const purchased = S.upgrades[def.id];
    const reqMet    = !def.requires || S.upgrades[def.requires];
    const canAfford = S.scrip >= def.cost;
    const row = document.createElement('div'); row.className = 'upg-item';
    const nameEl = document.createElement('span'); nameEl.className = 'upg-name';
    nameEl.innerHTML = `${def.name}<small>${def.desc}</small>`;
    const btn = document.createElement('button'); btn.className = 'upg-btn';
    if (purchased)      { btn.textContent = 'owned'; btn.disabled = true; }
    else if (!reqMet)   { btn.textContent = '???\u00a2'; btn.disabled = true; }
    else { btn.textContent = def.cost+'\u00a2'; btn.disabled = !canAfford; btn.addEventListener('click', ()=>buyUpgrade(def.id)); }
    row.appendChild(nameEl); row.appendChild(btn);
    els.upgradesEl.appendChild(row);
  });
}

function buyUpgrade(id) {
  const def = UPGRADE_DEFS.find(d => d.id === id);
  if (!def || S.upgrades[id] || S.scrip < def.cost) return;
  S.scrip -= def.cost; S.upgrades[id] = true; def.apply();
  addLog(`<span class="log-hi">${def.name}</span> purchased`);
  renderUpgrades(); renderCargoSlots(true); renderBoots(); updateHUD();
}

// ============================================================
// SETTLEMENTS / NETWORK / LOG
// ============================================================
function renderSettlements() {
  if (!els.settlementsEl) return;
  els.settlementsEl.innerHTML = '';
  S.routeNodes.filter(n => getNodeStage(n.id) >= 2 && S.settlements[n.id])
    .map(n => ({ id:n.id, stage:getNodeStage(n.id), ...S.settlements[n.id] }))
    .forEach(s => {
      const div = document.createElement('div');
      div.className = 'settle-item' + (s.stage < 3 ? ' settle-stage2' : '');
      const name = s.stage >= 3 ? s.label : s.tier;
      const subtitle = s.stage >= 3 ? s.tier : 'unconfirmed';
      const quote = s.stage >= 3 ? s.quote : `"reports of a ${s.tier} along this route"`;
      let trustBlock = '';
      const npcDef = NPC_DEFS[s.id];
      const npc    = getNpc(s.id);
      if (npcDef && npc && s.stage >= 3) {
        const tPct = Math.max(0, Math.min(100, npc.trust));
        trustBlock = `
          <div class="settle-trust">
            <span class="settle-trust-label">${npcDef.callsign}</span>
            <div class="settle-trust-bar">
              <div class="settle-trust-fill" style="width:${tPct}%"></div>
              <span class="settle-trust-tick" style="left:20%"></span>
              <span class="settle-trust-tick" style="left:40%"></span>
              <span class="settle-trust-tick" style="left:60%"></span>
              <span class="settle-trust-tick" style="left:80%"></span>
            </div>
            <span class="settle-trust-val">${tPct}</span>
          </div>`;
      }
      div.innerHTML = `
        ${trustBlock}
        <div class="settle-name">${name} <span>${subtitle}</span></div>
        <div class="settle-bar settle-bar-wip" title="rebuild progress \u2014 WIP indicator"><div class="settle-fill ${s.rebuild>50?'b':'a'}" style="width:${Math.round(s.rebuild)}%"></div></div>
        <div class="settle-quote">${quote}</div>`;
      els.settlementsEl.appendChild(div);
    });
}

// renderNetwork is exported for multiplayer.js (called from pollFeed).
// Circular import-safe: only invoked inside function bodies, not at module load.
export function renderNetwork() {
  if (!els.networkEl) return;
  const myId = getCachedPorterId();
  const lines = [];

  if (S.networkConnected) {
    const others = Math.max(0, S.networkCensus - 1);
    if (others === 0) {
      lines.push('<div class="net-item net-census">no other porters today</div>');
    } else if (others === 1) {
      lines.push(`<div class="net-item net-census"><span class="net-hi">1 other</span> porter online today</div>`);
    } else {
      lines.push(`<div class="net-item net-census"><span class="net-hi">${others} others</span> online today</div>`);
    }
  }

  const visible = S.networkFeed.filter(e => e.porterId !== myId);

  if (!S.networkConnected) {
    lines.push('<div class="net-item net-quiet">connecting to feed...</div>');
  } else if (visible.length === 0) {
    lines.push('<div class="net-item net-quiet">no signal</div>');
  } else {
    visible.slice().reverse().forEach(e => {
      lines.push(`<div class="net-item">${formatEvent(e)}</div>`);
    });
  }

  els.networkEl.innerHTML = lines.join('');
}

function formatEvent(e) {
  const who = `<span class="net-hi">${shortPorterId(e.porterId)}</span>`;
  const data = e.data || {};
  switch (e.type) {
    case 'delivery':
      return `${who} delivered to <span class="net-ac">${data.destLabel || '?'}</span>`;
    case 'milestone':
      if (data.kind === 'distance') {
        return `${who} hit <span class="net-ac">${data.value}km</span>`;
      }
      return `${who} reached a milestone`;
    case 'discovery':
      return `${who} scouted: <span class="net-ac">${data.label || data.nodeId || '?'}</span>`;
    case 'lost_drop':
      return `${who} lost <span class="net-ac">${data.label || 'cargo'}</span>`;
    case 'lost_recovered':
      if (data.forPorter) {
        return `${who} recovered <span class="net-ac">${data.label || 'lost cargo'}</span> for <span class="net-hi">${shortPorterId(data.forPorter)}</span>`;
      }
      return `${who} recovered <span class="net-ac">${data.label || 'lost cargo'}</span>`;
    case 'trust_unlock': {
      const tier = data.tier ? ` (${data.tier})` : '';
      return `${who} earned trust at <span class="net-ac">${data.npcLabel || '?'}</span>${tier}`;
    }
    default:
      return `${who} ${e.type}`;
  }
}

function tt() {
  const totalSecs = Math.floor(S.ticks * C.TICK_MS / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// addLog is exported for persistence.js / multiplayer.js / recovery.js / etc.
// Circular import-safe: callers only invoke addLog inside function bodies, not at module load.
export function addLog(msg) {
  if (!els.logEl) return;
  const el = document.createElement('span'); el.className = 'log-line';
  el.innerHTML = `<span class="log-ts">[${tt()}]</span> ${msg}`;
  els.logEl.insertBefore(el, els.logEl.firstChild);
  const all = els.logEl.querySelectorAll('.log-line');
  if (all.length > 14) all[all.length-1].remove();
}

// ============================================================
// HUD / RENDER
// ============================================================
function updateHUD() {
  els.delivered.textContent = S.delivered;
  els.scrip.textContent     = S.scrip + '\u00a2';
  els.walked.textContent    = (Math.round(S.distKm * 10) / 10) + 'km';
  els.status.textContent    = S.status;
  els.status.style.color    = STATUS_COLORS[S.status] || '#b1c9c3';
  renderUpgrades();
}

function cargoKey() {
  return S.inventory.map(p => `${p.size}${p.destId}${p.scrip}`).join('|') + '|' + S.maxSlots + '|' + S.usedWeight;
}

function renderCargoSlots(force) {
  if (!els.cargoSlots) return;
  const key = cargoKey();
  if (!force && key === S._transient.lastCargoKey) return;
  S._transient.lastCargoKey = key;

  els.cargoSlots.innerHTML = '';
  const used = [];
  S.inventory.forEach(pkg => { for (let i=0;i<pkg.slots;i++) used.push(pkg); });
  for (let i=0; i<S.maxSlots; i++) {
    const pkg = used[i]||null;
    const d = document.createElement('div');
    d.className   = 'cslot '+(pkg?pkg.size:'e');
    d.textContent = pkg?pkg.size:'';
    if (pkg) {
      const destLabel = getDisplayLabel(pkg.destId);
      const recoveryTag = pkg.isRecovery ? ' [recovery]' : (pkg.isLost ? ' [lost]' : '');
      d.setAttribute('title', `[${pkg.size}] ${pkg.label}${recoveryTag}\n\u2192 ${destLabel}\n${pkg.scrip}\u00a2`);
      d.classList.add('has-tooltip');
    }
    els.cargoSlots.appendChild(d);
  }

  if (els.weightSegs) {
    els.weightSegs.innerHTML = '';
    const loadPct = S.usedWeight / S.maxWeight;
    for (let i = 0; i < S.maxWeight; i++) {
      const pip = document.createElement('div');
      pip.className = i < S.usedWeight
        ? (loadPct <= 0.5 ? 'wseg filled' : loadPct <= 0.8 ? 'wseg heavy' : 'wseg overloaded')
        : 'wseg empty';
      els.weightSegs.appendChild(pip);
    }
  }
}

function renderCourierStack() {
  if (!els.courierStack) return;
  els.courierStack.innerHTML = S.inventory.length === 0 ? '' :
    S.inventory.map(p => `<span class="courier-pkg${p.isLost?' lost':''}">[${p.size}]</span>`).join('');
}

function renderBoots() {
  const d = Math.round(S.bootDurability);
  if (els.bootsVal) els.bootsVal.textContent = d+'%';
  if (els.bootsBar) { els.bootsBar.style.width = d+'%'; els.bootsBar.className = 'boots-bar-fill'+(d>50?'':d>25?' worn':' bad'); }

  if (els.bootsGearPop) {
    const popKey = `${S.bootClipMax}|${S.bootClipCount}|${S.scrip < 15 ? 'x' : 'o'}|${S.autobuyBoots ? 'on' : 'off'}`;
    if (popKey !== S._transient.lastGearPopKey) {
      S._transient.lastGearPopKey = popKey;
      const clipLine = S.bootClipMax > 0
        ? `<div class="gear-line">clip: <span class="gear-val">${S.bootClipCount}/${S.bootClipMax}</span></div>`
        : '';
      const buyDisabled = S.scrip < 15 ? 'disabled' : '';
      const autobuyOn = S.autobuyBoots ? ' on' : '';
      const autobuyTxt = S.autobuyBoots ? 'autobuy: on' : 'autobuy: off';
      els.bootsGearPop.innerHTML =
        clipLine +
        `<button class="boots-auto gear-btn" id="buyBootsBtn" ${buyDisabled}>buy boots (15\u00a2)</button>` +
        `<button class="boots-auto gear-btn${autobuyOn}" id="autobuyBtn">${autobuyTxt}</button>`;
      const newBuy = document.getElementById('buyBootsBtn');
      const newAuto = document.getElementById('autobuyBtn');
      if (newBuy) newBuy.addEventListener('click', buyBoots);
      if (newAuto) newAuto.addEventListener('click', toggleAutobuy);
      els.buyBootsBtn = newBuy;
      els.autobuyBtn  = newAuto;
    }
  }

  let sandalBadge = document.getElementById('sandalBadge');
  if (S.sandalweedCount > 0 || S.upgrades.sandalSatchel) {
    if (!sandalBadge && els.bootsGearBtn && els.bootsGearBtn.parentNode) {
      sandalBadge = document.createElement('span');
      sandalBadge.id = 'sandalBadge';
      sandalBadge.className = 'clip-badge sandal-badge has-tooltip';
      els.bootsGearBtn.parentNode.insertBefore(sandalBadge, els.bootsGearBtn.nextSibling);
    }
    if (sandalBadge) {
      const cap = sandalCap();
      const atCap = S.sandalweedCount >= cap;
      sandalBadge.textContent = '* ' + S.sandalweedCount + '/' + cap;
      sandalBadge.classList.toggle('at-cap', atCap);
      sandalBadge.setAttribute('title',
        'sandalweed: ' + S.sandalweedCount + '/' + cap +
        '\nmakeshift footwear' +
        '\nauto-equipped when boots fail' +
        (atCap ? '\n[hoard full \u2014 leaving plants standing]' : '')
      );
      sandalBadge.style.display = 'inline';
    }
  } else if (sandalBadge) {
    sandalBadge.style.display = 'none';
  }
}

function toggleAutobuy() {
  S.autobuyBoots = !S.autobuyBoots;
  renderBoots();
}

function toggleBootsGear() {
  if (!els.bootsGearPop) return;
  const isOpen = els.bootsGearPop.classList.toggle('open');
  if (els.bootsGearBtn) els.bootsGearBtn.classList.toggle('on', isOpen);
  if (isOpen) {
    setTimeout(() => {
      S._transient.gearPopHandler = (ev) => {
        if (!els.bootsGearPop.contains(ev.target) && ev.target !== els.bootsGearBtn) {
          els.bootsGearPop.classList.remove('open');
          if (els.bootsGearBtn) els.bootsGearBtn.classList.remove('on');
          document.removeEventListener('click', S._transient.gearPopHandler);
          S._transient.gearPopHandler = null;
        }
      };
      document.addEventListener('click', S._transient.gearPopHandler);
    }, 0);
  } else if (S._transient.gearPopHandler) {
    document.removeEventListener('click', S._transient.gearPopHandler);
    S._transient.gearPopHandler = null;
  }
}

function staminaSegCount() {
  return Math.min(4, Math.ceil(Math.min(S.stamina,S.staminaMax)/(S.staminaMax/4)));
}

function renderStamina() {
  const perSeg = S.staminaMax/4, disp = Math.min(S.stamina,S.staminaMax);
  for (let i=0;i<4;i++) {
    const seg = document.getElementById('sseg'+i); if(!seg) continue;
    const fl=i*perSeg, ce=(i+1)*perSeg;
    if (disp>=ce)      seg.className='sseg full';
    else if (disp>fl)  seg.className='sseg '+((disp-fl)/perSeg>0.5?'half':'crit');
    else               seg.className='sseg empty';
  }
  const over = document.getElementById('sseg4');
  if (over) {
    if (S.staminaOverboost&&S.stamina>S.staminaMax) { over.className='sseg overboost'; over.style.display='block'; }
    else over.style.display='none';
  }
  const nowSegs = staminaSegCount();
  if (S.autodrink && nowSegs < S.prevStaminaSeg && S.canteen>0) drinkWater();
  S.prevStaminaSeg = nowSegs;
  const canteenPct = Math.round((S.canteen/S.canteenMax)*100);
  if (els.drinkBtn) {
    els.drinkBtn.textContent = `drink (${canteenPct}%)`;
    els.drinkBtn.disabled    = S.canteen<=0 || S.stamina>=S.staminaMax;
  }
  if (els.canteenBar) els.canteenBar.style.height = canteenPct+'%';
}

// ============================================================
// BOOTS / CLIP / TIE-DOWN
// ============================================================
function buyBoots() {
  if (S.scrip<15) return;
  S.scrip-=15; S.bootDurability=100; S.usingMakeshift=false;
  addLog('purchased new <span class="log-hi">boots</span> (15\u00a2)');
  renderBoots(); updateHUD();
}

function checkAutobuy() {
  if (S.bootDurability<=0 && S.bootClipCount<=0 && S.sandalweedCount>0) {
    S.sandalweedCount--; S.bootDurability=30; S.usingMakeshift=true;
    addLog('<span class="log-wn">boots failed</span> \u2014 lashed on a <span class="log-hi">sandalweed</span> (' + S.sandalweedCount + '/' + sandalCap() + ' left)');
    renderBoots(); return;
  }
  if (!S.autobuyBoots) return;
  if (S.bootDurability<=0 && S.bootClipCount>0) {
    S.bootClipCount--; S.bootDurability=100; S.usingMakeshift=false;
    addLog('<span class="log-hi">boot clip</span>: spare pair auto-equipped');
    renderBoots(); return;
  }
  if (S.bootDurability<=20 && S.scrip>=15) {
    S.scrip-=15; S.bootDurability=100; S.usingMakeshift=false;
    addLog('autobuy: new <span class="log-hi">boots</span> purchased (15\u00a2)');
    updateHUD();
  }
}

function refillBootClip(nodeId) {
  if (S.bootClipMax===0 || !['A','B','H'].includes(nodeId)) return;
  if (S.bootClipCount>=S.bootClipMax) return;
  if (S._transient.clipRefillPending) return;
  const cost = (S.bootClipMax-S.bootClipCount)*15;
  if (S.scrip < cost) return;
  const settle = S.settlements[nodeId];
  S._transient.clipRefillPending = { nodeId, cost };
  addLog(`<span class="log-wn">boot clip low</span> at <span class="log-hi">${settle?settle.label:nodeId}</span> \u2014 refill for ${cost}\u00a2? <button class="log-btn" id="clipRefillBtn">refill</button>`);
  setTimeout(() => {
    const btn = document.getElementById('clipRefillBtn');
    if (btn) btn.addEventListener('click', confirmClipRefill);
  }, 0);
}

function confirmClipRefill() {
  if (!S._transient.clipRefillPending) return;
  const { cost } = S._transient.clipRefillPending;
  S._transient.clipRefillPending = null;
  if (S.scrip < cost) { addLog('<span class="log-wn">not enough scrip</span>'); return; }
  S.scrip -= cost; S.bootClipCount = S.bootClipMax;
  addLog(`boot clip refilled (${cost}\u00a2)`);
  renderBoots(); updateHUD();
  const btn = document.getElementById('clipRefillBtn');
  if (btn) btn.closest('.log-line').remove();
}

function toggleTieDown() {
  S.tieDownActive = !S.tieDownActive;
  if (els.tieDownBtn) { els.tieDownBtn.textContent='tie-down: '+(S.tieDownActive?'on':'off'); els.tieDownBtn.classList.toggle('on',S.tieDownActive); }
  if (S.tieDownActive) addLog('cargo <span class="log-hi">tied down</span> \u2014 next stumble negated');
}

// ============================================================
// TRIP / CATCH
// ============================================================
function currentCellIsRisky() {
  const ci = Math.floor((S.edgeIdx*C.CELLS_PER_EDGE)+(S.dotT*C.CELLS_PER_EDGE)) % C.TOTAL_CELLS;
  return worldCells[ci] ? worldCells[ci].risky : false;
}

function tripChance() {
  const bootFail = (100-S.bootDurability)/100;
  const segsLost = 4-staminaSegCount();
  let chance = C.TRIP_CHANCE_BASE * bootFail * (1+segsLost*0.5);
  if (S.upgrades.steadyFeet) chance *= 0.70;
  if (currentCellIsRisky())  chance *= 1.40;
  return chance;
}

function catchChance() {
  const bf = S.bootDurability/100, sf = Math.min(S.stamina,S.staminaMax)/S.staminaMax;
  let c = C.CATCH_CHANCE_BASE * ((bf+sf)/2);
  if (S.upgrades.steadyFeet) c += 0.15;
  return Math.min(0.85, c);
}

function maybeTrip() {
  if (S.status!=='walking' && S.status!=='carrying') return;
  if (Math.random() >= tripChance()) return;
  if (Math.random() < catchChance()) { addLog('stumbled on debris \u2014 <span class="log-ok">caught yourself</span>'); return; }

  let dropped = false;
  if (S.inventory.length > 0) {
    const target = S.inventory[0];
    const chance = target.isLost ? C.TRIP_DROP_CHANCE_LOST : C.TRIP_DROP_CHANCE_NORMAL;
    if (Math.random() < chance) {
      S.usedSlots  -= target.slots;
      S.usedWeight -= target.kg;
      S.inventory.splice(0, 1);
      if (target.isLost) {
        postLostDrop(target);
        addLog(`<span class="log-wn">tripped!</span> <span class="log-hi">${target.label}</span> fell into the world \u2014 someone may find it`);
      } else {
        addLog(`<span class="log-wn">tripped!</span> <span class="log-hi">${target.label}</span> was lost in the scramble`);
      }
      renderCourierStack();
      renderCargoSlots(true);
      dropped = true;
    }
  }

  if (!dropped && S.tieDownActive && S.inventory.length > 0) {
    S.tieDownActive=false;
    if (els.tieDownBtn) { els.tieDownBtn.textContent='tie-down: off'; els.tieDownBtn.classList.remove('on'); }
    addLog('<span class="log-wn">tripped!</span> tie-down held \u2014 <span class="log-ok">cargo protected</span>. re-arm to use again');
    S.bootDurability=Math.max(0,S.bootDurability-5);
    S.status='tripped'; S.tripTimer=6;
    if (els.courierAt) { els.courierAt.className='tlh-at trip'; els.courierAt.style.animation='trip 0.4s ease 3'; }
    return;
  }

  S.status='tripped'; S.tripTimer=6;
  S.bootDurability=Math.max(0,S.bootDurability-5);

  if (!dropped) {
    if (S.inventory.length>0) { S.inventory[0].scrip=Math.max(1,Math.floor(S.inventory[0].scrip*0.75)); addLog('<span class="log-wn">tripped! package damaged \u2014 reduced payout</span>'); }
    else addLog('<span class="log-wn">tripped on loose rubble!</span>');
  }
  if (els.courierAt) { els.courierAt.className='tlh-at trip'; els.courierAt.style.animation='trip 0.4s ease 3'; }
}

// ============================================================
// SPEED / DRINK
// ============================================================
function speedMultiplier() {
  let mult = 1-(4-staminaSegCount())*0.15;
  if (S.bootDurability<=0)     mult *= 0.5;
  return Math.max(0.2, mult);
}

function drinkWater() {
  if (S.canteen<=0 || S.stamina>=S.staminaMax) return;
  const need = S.staminaMax-S.stamina;
  const rest = Math.min(need,(S.canteen/S.canteenMax)*S.staminaMax);
  S.stamina  = Math.min(S.staminaMax, S.stamina+rest);
  const drainMult = S.upgrades.efficientConsumption ? 0.60 : 1.0;
  S.canteen  = Math.max(0, S.canteen-(rest/S.staminaMax)*S.canteenMax*drainMult);
  addLog(`drank from canteen \u2014 <span class="log-hi">+${Math.round(rest/S.staminaMax*100)}% stamina</span>`);
}

// ============================================================
// MAIN TICK
// ============================================================
function tick() {
  S.ticks++;

  if (S.tripTimer>0) {
    S.tripTimer--;
    if (S.tripTimer===0) {
      S.status = S.inventory.length>0?'carrying':'walking';
      if (els.courierAt) { els.courierAt.className='tlh-at bounce'+(S.inventory.length>0?' carry':''); els.courierAt.style.animation=''; }
    }
    renderBoots(); renderStamina(); updateHUD(); return;
  }

  if (S.status==='resting') {
    S.restTimer--;
    if (S.restTimer<=0) {
      S.stamina=S.staminaMax*1.25; S.staminaOverboost=true;
      S.canteen=Math.min(S.canteenMax,S.canteen+20); S.status='walking';
      addLog('rested at shelter \u2014 <span class="log-hi">stamina restored +25% overboost</span>');
      if (els.courierAt) { els.courierAt.className='tlh-at bounce'; els.courierAt.style.animation=''; }
    }
    renderStamina(); updateHUD(); return;
  }

  if (S.status==='walking' || S.status==='carrying') {
    S.stamina = Math.max(0, S.stamina-C.STAMINA_DRAIN);
    if (S.staminaOverboost && S.stamina<=S.staminaMax) S.staminaOverboost=false;

    let bd=C.BOOT_DRAIN;
    if (S.upgrades.bootsT1) bd*=0.75;
    if (S.upgrades.bootsT2) bd*=0.50;
    if (S.usingMakeshift)   bd*=1.30;
    S.bootDurability=Math.max(0,S.bootDurability-bd);

    if (S.isRaining||S.inRiver) S.canteen=Math.min(S.canteenMax,S.canteen+0.4);

    accumulateDist();
    if (S.ticks%5===0) {
      checkDistMilestones();
    }

    maybeTrip();
    checkAutobuy();
    scanForPickup();

    if (S.stamina<50 && S.status==='walking' && Math.random()<0.03) {
      S.status='resting'; S.restTimer=C.REST_TICKS_MIN+Math.floor(Math.random()*(C.REST_TICKS_MAX-C.REST_TICKS_MIN));
      addLog('<span class="log-wn">exhausted \u2014 resting at nearest shelter</span>');
      if (els.courierAt) { els.courierAt.className='tlh-at rest'; els.courierAt.style.animation=''; }
    }
  }

  tickAmbientChatter();
  tickRecoveryAttempt();

  const prevEdgeIdx = S.edgeIdx;
  S.dotT += 0.006 * speedMultiplier();

  if (S.dotT >= 1) {
    S.dotT    = 0;
    S.edgeIdx = (S.edgeIdx+1) % S.edges.length;
    const arrivedAt = S.edges[prevEdgeIdx][1];
    const node = S.routeNodes.find(n => n.id===arrivedAt);
    if (node && getNodeStage(arrivedAt) < 3) {
      setNodeStage(arrivedAt, 3);
      addLog(`discovered: <span class="log-hi">${node.label}</span>`);
      postActivity('discovery', { nodeId: arrivedAt, label: node.label });
      if (NPC_DEFS[arrivedAt]) {
        addTrust(arrivedAt, C.TRUST_GAIN_DISCOVERY, 'discovery');
      }
    }
    const [newFrom, newTo] = S.edges[S.edgeIdx];
    if (markEdgeAdjacent(newFrom, newTo)) {
      renderSettlements();
    }
    drawRouteMap();
    updateDestDrift();
    refillBootClip(arrivedAt);
    tryDeliver(arrivedAt);

    if (NPC_DEFS[arrivedAt]) {
      tryT50Warning(arrivedAt);
      tryT75Preview(arrivedAt);
      tryT100RestPrompt(arrivedAt);
    }
  } else {
    updateRouteDot();
  }

  S.worldPos = worldPosFromRoute();
  renderFieldstrip();

  if (S.ticks%10===0) tickPkgRespawns();

  if (S.rainTimer>0) S.rainTimer--;
  else if (Math.random()<0.003) { setRain(!S.isRaining); S.rainTimer=40+Math.floor(Math.random()*60); }

  if (S.ticks % 9 === 0) updateSaveStrip();
  if (S.ticks % 9 === 0 && S.channels.length > 0) renderChannels();

  renderBoots(); renderStamina(); renderCargoSlots(); updateHUD();
}

// ============================================================
// INIT
// ============================================================
function init() {
  resolveEls();
  calcCellPxWidth();

  const porterId = getPorterId();
  if (els.porterIdEl) els.porterIdEl.textContent = porterId;

  buildWorld();

  const restored = loadGame();

  const [curFrom, curTo] = S.edges[S.edgeIdx];
  markEdgeAdjacent(curFrom, curTo);

  S.worldPos = worldPosFromRoute();

  buildRain(); setRain(false);
  layoutRouteNodes(); drawRouteMap(); updateDestDrift();
  renderUpgrades(); renderSettlements(); renderNetwork();
  renderChannels();
  renderCargoSlots(true); renderCourierStack(); renderBoots(); renderStamina();
  updatePorterStripBadges();
  renderFieldstrip();
  updateHUD();
  updateSaveStrip();

  if (restored) {
    addLog(`porter <span class="log-hi">${porterId}</span> back online \u2014 <span class="log-ok">save restored</span>`);
  } else {
    addLog(`porter <span class="log-hi">${porterId}</span> online at <span class="log-hi">depot a</span>`);
  }

  if (els.courierAt) {
    els.courierAt.className = 'tlh-at bounce' + (S.inventory.length > 0 ? ' carry' : '');
    els.courierAt.style.animation = '';
  }

  if (els.bootsGearBtn) els.bootsGearBtn.addEventListener('click', toggleBootsGear);

  if (els.drinkBtn) els.drinkBtn.addEventListener('click', drinkWater);
  if (els.autodrinkBtn) els.autodrinkBtn.addEventListener('click', () => {
    S.autodrink=!S.autodrink;
    els.autodrinkBtn.textContent='auto: '+(S.autodrink?'on':'off');
    els.autodrinkBtn.classList.toggle('on',S.autodrink);
  });
  if (els.tieDownBtn) els.tieDownBtn.addEventListener('click', toggleTieDown);

  if (S.autodrink && els.autodrinkBtn) {
    els.autodrinkBtn.textContent = 'auto: on';
    els.autodrinkBtn.classList.add('on');
  }

  if (els.saveBtn) els.saveBtn.addEventListener('click', () => saveGame(false));
  if (els.wipeBtn) els.wipeBtn.addEventListener('click', armWipe);

  setInterval(() => saveGame(true), C.AUTOSAVE_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveGame(true);
      stopPolling();
    } else {
      startPolling();
    }
  });
  window.addEventListener('beforeunload', () => saveGame(true));

  if (els.porterHint) els.porterHint.textContent = 'connecting to feed...';

  if (document.visibilityState !== 'hidden') startPolling();

  const hintCheck = setInterval(() => {
    if (S.networkConnected && els.porterHint) {
      els.porterHint.textContent = 'connected to feed';
      clearInterval(hintCheck);
    }
  }, 1000);

  setInterval(tick, C.TICK_MS);
}

init();
