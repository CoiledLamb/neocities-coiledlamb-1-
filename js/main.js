/* ==============================================
   THE LONG HAUL — game logic
   v0.0.7.12

   Refactor commit 12: extracted trip mechanics + distance
   accumulator to ./trip.js. tripChance, catchChance, maybeTrip,
   currentCellIsRisky, posKm, accumulateDist now live there.
   Called via Trip.* from the tick loop. No new exports needed
   in main — staminaSegCount, addLog, renderCourierStack,
   renderCargoSlots were already exported for prior commits.

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
     getNodeStage, setNodeStage, markEdgeAdjacent,
       getDisplayLabel — identification
     addTrust, tryT50Warning, tryT75Preview,
       tryT100RestPrompt — trust
     renderChannels, tickAmbientChatter — channels
     buildWorld, calcCellPxWidth, worldPosFromRoute,
       renderFieldstrip — world
     Pkg.scanForPickup, Pkg.tryDeliver,
       Pkg.tickPkgRespawns — packages (namespace import)
     Trip.maybeTrip, Trip.accumulateDist,
       Trip.tripChance, Trip.catchChance — trip (namespace import)

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
import {
  getNodeStage, setNodeStage, markEdgeAdjacent, getDisplayLabel,
} from './identification.js';
import {
  addTrust, tryT50Warning, tryT75Preview, tryT100RestPrompt,
} from './trust.js';
import { renderChannels, tickAmbientChatter } from './channels.js';
import {
  buildWorld, calcCellPxWidth, worldPosFromRoute, renderFieldstrip,
} from './world.js';
import * as Pkg from './packages.js';
import * as Trip from './trip.js';

// Local aliases — live references into S._transient. Never reassign these.
const els = S._transient.els;
const worldCells = S._transient.worldCells;

// sandalCap is exported for packages.js (scanForPickup). Moves to
// boots.js in commit 13 — at which point packages.js should import
// it from there instead and this export can drop.
export function sandalCap() {
  return S.upgrades.sandalSatchel ? C.SANDAL_CAP_UPGRADED : C.SANDAL_CAP_BASE;
}

// Distance accumulator helpers (posKm, accumulateDist) now live
// in ./trip.js. Called via Trip.accumulateDist() in the tick loop.

// Package pickup / delivery / respawn now live in ./packages.js.
// scanForPickup, tryDeliver, tickPkgRespawns imported via Pkg.* below.

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

// drawRouteMap is exported for trust.js (called from onTrustUnlock t20).
export function drawRouteMap() {
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
// renderSettlements is exported for trust.js (called from onTrustUnlock t20).
export function renderSettlements() {
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
      const npc    = (S.npcs && S.npcs[s.id]) || null;
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

// addLog is exported for persistence.js / multiplayer.js / recovery.js / trust.js.
// Circular import-safe: callers only invoke addLog inside function bodies.
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
// updateHUD is exported for trust.js (called from confirmDepotRest).
export function updateHUD() {
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

// renderCargoSlots is exported for packages.js (called from
// scanForPickup + tryDeliver). Moves to render/hud.js later.
export function renderCargoSlots(force) {
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

// renderCourierStack is exported for packages.js (called from
// scanForPickup + tryDeliver). Moves to render/hud.js later.
export function renderCourierStack() {
  if (!els.courierStack) return;
  els.courierStack.innerHTML = S.inventory.length === 0 ? '' :
    S.inventory.map(p => `<span class="courier-pkg${p.isLost?' lost':''}">[${p.size}]</span>`).join('');
}

// renderBoots is exported for packages.js (called from sandalweed
// harvest in scanForPickup). Moves to boots.js in commit 13.
export function renderBoots() {
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

// staminaSegCount is exported for trust.js (called from tryT50Warning).
export function staminaSegCount() {
  return Math.min(4, Math.ceil(Math.min(S.stamina,S.staminaMax)/(S.staminaMax/4)));
}

// renderStamina is exported for trust.js (called from confirmDepotRest).
export function renderStamina() {
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
// TRIP / CATCH — now in ./trip.js (tripChance, catchChance,
// maybeTrip, currentCellIsRisky). Called via Trip.maybeTrip() in tick.
// ============================================================

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

    Trip.accumulateDist();
    if (S.ticks%5===0) {
      checkDistMilestones();
    }

    Trip.maybeTrip();
    checkAutobuy();
    Pkg.scanForPickup();

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
    Pkg.tryDeliver(arrivedAt);

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

  if (S.ticks%10===0) Pkg.tickPkgRespawns();

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
