/* ==============================================
   THE LONG HAUL — game logic
   v0.0.7.19

   v0.0.7.19 commit 2b (gameplay logic):
     - distKm accumulator rounding-stomp fix (trip.js).
       Per-tick delta was below Math.round's 0.1 resolution
       so the counter never advanced from 0.
     - Tie-down option B (trip.js): tie-down absorbs drops
       AND damage. Consumed on trip, re-arm to reuse.
     - Rain restructure: single S.rainTimer replaced with
       absolute-tick targets _transient.nextRainStartTick
       and nextRainEndTick. tryWarning's rain-incoming check
       is now unambiguous.
     - Wetland canteen refill wired (+0.05/tick on wetland
       cells). Constant + world tag already shipped in 2b's
       predecessor commits.
     - Pickup-fail log lines ("too heavy" / "no cargo slots")
       with per-key dedupe on (ci, usedSlots, usedWeight).
     - depotRestPending canonical slot name enforced (trust.js
       was writing restPromptPending which didn't match the
       state.js declaration — harmless but misleading).

   v0.0.7.19 commit 2a (already landed):
     - accumulateDist edge-rollover math fix
     - Trust unlock storage canonicalization
       (write to npc.unlocks.tN, not npc.tN)
     - Damage log names package + scrip delta
     - Custom tooltip decoupled from native title

   v0.0.7.18 commit 1 (housekeeping):
     - Trust function renames (tryT50Warning → tryWarning etc).
     - pickRandom + getNpc dedup'd into util.js / trust.js.
     - BOOT_PRICE constant replaces 6 hardcoded 15s.
     - Boots: full-meter purchase guard, clip-equip failsafe.
     - Stamina: drink only when ≥5% lost.
     - Sandalweed rates redistributed + centralized.
     - World cells tag wetland: true at gen.
     - Silent save errors surface once per session.

   Imports:
     S — game state singleton (state.js)
     C — tuning constants namespace (constants.js)
     NPC_LINES, NPC_DEFS, NPC_ADJACENT — NPC data
     NPC_PKGS, LOST_PKGS — cargo definitions
     ZONE_TYPES — terrain weights/chars/spawn rates
     NODE_GLYPHS — visual map (used by updateDestDrift)
     saveGame, loadGame, armWipe, updateSaveStrip — persistence
     getPorterId, getCachedPorterId, postActivity, postLostDrop,
       fetchLostFromPeer, startPolling, stopPolling,
       shortPorterId, checkDistMilestones — multiplayer
     tickRecoveryAttempt, updatePorterStripBadges — recovery
     getNodeStage, setNodeStage, markEdgeAdjacent,
       getDisplayLabel — identification
     addTrust, tryWarning, tryPreview, tryRestPrompt — trust
     renderChannels, tickAmbientChatter — channels
     buildWorld, calcCellPxWidth, worldPosFromRoute,
       renderFieldstrip — world
     Pkg.scanForPickup, Pkg.tryDeliver,
       Pkg.tickPkgRespawns — packages (namespace)
     Trip.maybeTrip, Trip.accumulateDist — trip (namespace)
     Boots.renderBoots, Boots.checkAutobuy, Boots.refillBootClip,
       Boots.toggleBootsGear, Boots.toggleTieDown — boots (namespace)
     Stamina.renderStamina, Stamina.drinkWater,
       Stamina.speedMultiplier — stamina (namespace)
     Upg.renderUpgrades — upgrades (namespace)
     addLog — render/log.js
     updateHUD, renderCargoSlots, renderCourierStack — render/hud.js
     drawRouteMap, updateRouteDot, layoutRouteNodes,
       currentEdge — render/route-map.js
     renderSettlements — render/settlements.js
     renderNetwork — render/network.js

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
import { NODE_GLYPHS } from './data/glyphs.js';
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
  addTrust, tryWarning, tryPreview, tryRestPrompt,
} from './trust.js';
import { renderChannels, tickAmbientChatter } from './channels.js';
import {
  buildWorld, calcCellPxWidth, worldPosFromRoute, renderFieldstrip,
} from './world.js';
import * as Pkg from './packages.js';
import * as Trip from './trip.js';
import * as Boots from './boots.js';
import * as Stamina from './stamina.js';
import * as Upg from './upgrades.js';
import { tickScanner } from './scanner.js';
import { renderKit } from './render/kit.js';
import { initAdminChannel } from './admin-channel.js';
import { initSaveIo } from './save-io.js';
import { addLog } from './render/log.js';
import {
  updateHUD, renderCargoSlots, renderCourierStack,
} from './render/hud.js';
import {
  drawRouteMap, updateRouteDot, layoutRouteNodes, currentEdge,
} from './render/route-map.js';
import { renderSettlements } from './render/settlements.js';
import { renderNetwork } from './render/network.js';

// Local aliases — live references into S._transient. Never reassign these.
const els = S._transient.els;
const worldCells = S._transient.worldCells;

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

// v0.0.7.19 commit 2b — rain scheduler. Absolute-tick targets replace
// the old single S.rainTimer. On init and on every transition, schedule
// the next transition time. Called from init() and from the tick-level
// rain check below.
function scheduleNextRainTransition() {
  const t = S._transient;
  if (S.isRaining) {
    const span = C.RAIN_WET_MAX_TICKS - C.RAIN_WET_MIN_TICKS;
    t.nextRainEndTick = S.ticks + C.RAIN_WET_MIN_TICKS + Math.floor(Math.random() * span);
  } else {
    const span = C.RAIN_DRY_MAX_TICKS - C.RAIN_DRY_MIN_TICKS;
    t.nextRainStartTick = S.ticks + C.RAIN_DRY_MIN_TICKS + Math.floor(Math.random() * span);
  }
}

// v0.0.7.19 commit 2b — wetland check for canteen refill.
function currentCellIsWetland() {
  const ci = Math.floor((S.edgeIdx * C.CELLS_PER_EDGE) + (S.dotT * C.CELLS_PER_EDGE)) % C.TOTAL_CELLS;
  const cell = worldCells[ci];
  return !!(cell && cell.wetland);
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
    bootsGearBtn:   $('bootsGearBtn'),
    bootsGearInline:$('bootsGearInline'),
    saveGearBtn:    $('saveGearBtn'),
    saveGearInline: $('saveGearInline'),
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
    // v0.0.7.21 — scannerBtn is rebuilt inside the kit row each render;
    // renderKit() assigns els.scannerBtn after innerHTML swap.
    saveIoBtn:    $('saveIoBtn'),
    // v0.0.7.24 — kit row
    kitRow:        $('kitRow'),
    kitBattery:    document.querySelector('.kit-battery'),
    kitBatteryFill:$('kitBatteryFill'),
    kitBatteryVal: $('kitBatteryVal'),
    kitCaps:       $('kitCaps'),
  });
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
    Boots.renderBoots(); Stamina.renderStamina(); updateHUD(); return;
  }

  if (S.status==='resting') {
    S.restTimer--;
    if (S.restTimer<=0) {
      S.stamina=S.staminaMax*1.25; S.staminaOverboost=true;
      S.canteen=Math.min(S.canteenMax,S.canteen+20); S.status='walking';
      addLog('rested at shelter \u2014 <span class="log-hi">stamina restored +25% overboost</span>');
      if (els.courierAt) { els.courierAt.className='tlh-at bounce'; els.courierAt.style.animation=''; }
    }
    Stamina.renderStamina(); updateHUD(); return;
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
    else if (currentCellIsWetland()) S.canteen=Math.min(S.canteenMax,S.canteen+C.WETLAND_CANTEEN_REFILL);

    Trip.accumulateDist();
    if (S.ticks%5===0) {
      checkDistMilestones();
    }

    Trip.maybeTrip();
    Boots.checkAutobuy();
    Pkg.scanForPickup();
    // v0.0.7.21 — scanner tick. No-op unless unlocked.
    tickScanner();

    if (S.stamina<50 && S.status==='walking' && Math.random()<0.03) {
      S.status='resting'; S.restTimer=C.REST_TICKS_MIN+Math.floor(Math.random()*(C.REST_TICKS_MAX-C.REST_TICKS_MIN));
      addLog('<span class="log-wn">exhausted \u2014 resting at nearest shelter</span>');
      if (els.courierAt) { els.courierAt.className='tlh-at rest'; els.courierAt.style.animation=''; }
    }
  }

  tickAmbientChatter();
  tickRecoveryAttempt();

  const prevEdgeIdx = S.edgeIdx;
  S.dotT += 0.006 * Stamina.speedMultiplier();

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
    Boots.refillBootClip(arrivedAt);
    Pkg.tryDeliver(arrivedAt);

    if (NPC_DEFS[arrivedAt]) {
      tryWarning(arrivedAt);
      tryPreview(arrivedAt);
      tryRestPrompt(arrivedAt);
    }
  } else {
    updateRouteDot();
  }

  S.worldPos = worldPosFromRoute();
  renderFieldstrip();

  if (S.ticks%10===0) Pkg.tickPkgRespawns();

  // v0.0.7.19 commit 2b — scheduled rain transitions.
  if (S.isRaining) {
    if (S.ticks >= S._transient.nextRainEndTick) {
      setRain(false);
      scheduleNextRainTransition();
    }
  } else {
    if (S.ticks >= S._transient.nextRainStartTick) {
      setRain(true);
      scheduleNextRainTransition();
    }
  }

  if (S.ticks % 9 === 0) updateSaveStrip();
  if (S.ticks % 9 === 0 && S.channels.length > 0) renderChannels();

  // v0.0.7.28 — battery prototype drain (time-only, no gating). Only
  // drains when at least one gadget is owned; otherwise the row is
  // hidden and the charge value is inert. Full mechanic (per-device
  // use + regen + upgrade) lands with schema v6→v7 in a later patch.
  if ((S.scanner.unlocked || S.stickyGun) && S.battery.charge > 0) {
    S.battery.charge = Math.max(0, S.battery.charge - C.BATTERY_DRAIN_PER_TICK);
  }

  Boots.renderBoots(); Stamina.renderStamina(); renderCargoSlots(); updateHUD();
  renderKit();
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
  // v0.0.7.19 commit 2b — seed rain scheduler after initial state is
  // settled. On fresh start S.isRaining is false and S.ticks is 0, so
  // this sets nextRainStartTick to 200-800. Loaded saves don't persist
  // rain state (see persistence.js) so they also start dry.
  scheduleNextRainTransition();
  layoutRouteNodes(); drawRouteMap(); updateDestDrift();
  Upg.renderUpgrades(); renderSettlements(); renderNetwork();
  renderChannels();
  renderCargoSlots(true); renderCourierStack(); Boots.renderBoots(); Stamina.renderStamina();
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

  if (els.bootsGearBtn) els.bootsGearBtn.addEventListener('click', Boots.toggleBootsGear);

  if (els.drinkBtn) els.drinkBtn.addEventListener('click', Stamina.drinkWater);
  if (els.autodrinkBtn) els.autodrinkBtn.addEventListener('click', () => {
    S.autodrink=!S.autodrink;
    els.autodrinkBtn.textContent='auto: '+(S.autodrink?'on':'off');
    els.autodrinkBtn.classList.toggle('on',S.autodrink);
  });
  if (els.tieDownBtn) els.tieDownBtn.addEventListener('click', Boots.toggleTieDown);

  if (S.autodrink && els.autodrinkBtn) {
    els.autodrinkBtn.textContent = 'auto: on';
    els.autodrinkBtn.classList.add('on');
  }

  if (els.saveBtn) els.saveBtn.addEventListener('click', () => saveGame(false));
  if (els.wipeBtn) els.wipeBtn.addEventListener('click', armWipe);
  if (els.saveGearBtn && els.saveGearInline) {
    els.saveGearBtn.addEventListener('click', () => {
      const isOpen = els.saveGearInline.hasAttribute('hidden');
      if (isOpen) els.saveGearInline.removeAttribute('hidden');
      else els.saveGearInline.setAttribute('hidden', '');
      els.saveGearBtn.classList.toggle('on', isOpen);
      els.saveGearBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  }

  // v0.0.7.21 — scanner, save i/o. v0.0.7.22 — admin channel (replaces
  // the in-game admin bar; commands arrive via BroadcastChannel from
  // admin/blog-admin.html's TLH tab). v0.0.7.24 — scanner button lives
  // in the kit row, bound per-render inside renderKit() after each
  // innerHTML rebuild.
  initSaveIo();
  initAdminChannel();
  renderKit();

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
