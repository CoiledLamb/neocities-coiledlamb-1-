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
import { ZONE_TYPES } from './data/zones.js';
import { NODE_GLYPHS } from './data/glyphs.js';
import { saveGame, loadGame, armWipe, updateSaveStrip } from './persistence.js';
import {
  getPorterId, getCachedPorterId, postActivity, postLostDrop,
  fetchLostFromPeer, startPolling, stopPolling,
  shortPorterId, checkDistMilestones, isSilent, setSilent,
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
  bindFieldstripInteractions,
} from './world.js';
import * as Pkg from './packages.js';
import * as Trip from './trip.js';
import * as Boots from './boots.js';
import * as Stamina from './stamina.js';
import * as Upg from './upgrades.js';
import { tickScanner } from './scanner.js';
import { tickWeather, initWeather, buildWeatherOverlay, weatherAtCourier } from './weather.js';
import { renderKit } from './render/kit.js';
import { initAdminChannel } from './admin-channel.js';
import { initSaveIo } from './save-io.js';
import { addLog, restoreLogFromSave } from './render/log.js';
import {
  updateHUD, renderCargoSlots, renderCourierStack,
} from './render/hud.js';
import { bindDragGlobals } from './render/drag.js';
import {
  drawRouteMap, updateRouteDot, updateRouteHud, layoutRouteNodes, currentEdge,
  initSegment, advanceSegmentAfterArrival, bindRouteInteractions,
  tickRouteInteractions, isOnShortcut,
} from './render/route-map.js';
import { renderSettlements, startEmergence, hasActiveEmergence } from './render/settlements.js';
import { renderNetwork } from './render/network.js';
import { initSky, renderSky, daylightOf, TICKS_PER_DAY } from './render/sky.js';

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
    viewport:     $('viewport'),
    skySvg:       $('skySvg'),
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
    autoGrabBtn:  $('autoGrabBtn'),
    canteenBar:   $('canteenBar'),
    tieDownBtn:   $('tieDownBtn'),
    logEl:        $('logEl'),
    upgradesEl:   $('upgradesEl'),
    settlementsEl:$('settlementsEl'),
    routeSvg:     $('routeSvg'),
    networkEl:    $('networkEl'),
    silentBtn:    $('silentBtn'),
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
    batterySegs:   $('kitBatterySegs'),
    kitBatteryVal: $('kitBatteryVal'),
    kitCaps:       $('kitCaps'),
  });
}

// ============================================================
// MAIN TICK
// ============================================================
function tick() {
  S.ticks++;

  // v0.0.9.1 — sky layer renders every tick regardless of game state
  // (trips, rests, walking). Purely visual, no state mutation.
  renderSky();

  // v0.0.9.5.1 — route HUD overlays (clock + coord + next-dest)
  // update every tick for the same reason: clock must advance even
  // during tripped/resting states. Coord + next are safe no-ops when
  // the courier isn't on a ring segment.
  updateRouteHud();

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
    // v0.0.9.3 — stamina drain gets a small tax while on interior shortcut
    // segments (virgin-terrain cost; primes the v0.0.9.6 trample decay
    // model where this same multiplier scales down with trample).
    const staminaDrain = isOnShortcut() ? C.STAMINA_DRAIN * C.SHORTCUT_STAMINA_MULT : C.STAMINA_DRAIN;
    S.stamina = Math.max(0, S.stamina - staminaDrain);
    if (S.staminaOverboost && S.stamina<=S.staminaMax) S.staminaOverboost=false;

    let bd=C.BOOT_DRAIN;
    if (S.upgrades.bootsT1) bd*=0.75;
    if (S.upgrades.bootsT2) bd*=0.50;
    if (S.usingMakeshift)   bd*=1.30;
    S.bootDurability=Math.max(0,S.bootDurability-bd);

    // v0.0.9.3 — weather / wetland / river / pickup are all cell-indexed
    // and therefore off-grid while on a shortcut (interior is genuinely
    // empty of game content until terrain bones in v0.0.9.5).
    if (!isOnShortcut()) {
      // v0.0.8 — weather-driven canteen refill. Intensity is spatial (from weather.js).
      const _w = weatherAtCourier();
      if (_w.intensity === 'downpour')      S.canteen = Math.min(S.canteenMax, S.canteen + C.CANTEEN_DOWNPOUR);
      else if (_w.intensity === 'rain')     S.canteen = Math.min(S.canteenMax, S.canteen + C.CANTEEN_RAIN);
      else if (_w.intensity === 'drizzle')  S.canteen = Math.min(S.canteenMax, S.canteen + C.CANTEEN_DRIZZLE);
      else if (S.inRiver)                   S.canteen = Math.min(S.canteenMax, S.canteen + C.CANTEEN_RAIN);
      else if (currentCellIsWetland())      S.canteen = Math.min(S.canteenMax, S.canteen + C.WETLAND_CANTEEN_REFILL);

      // v0.0.9.5 (commit 2): iota's 'wetland-path' trust profile rewards
      // iota deliveries where the courier has spent time in wetland cells
      // since their last iota visit. Tick the counter whenever courier is
      // in a wetland cell (canteen-refill trigger is a clean proxy).
      if (currentCellIsWetland() && S.npcs && S.npcs['B']) {
        S.npcs['B'].wetlandTicksSinceLastVisit = (S.npcs['B'].wetlandTicksSinceLastVisit || 0) + 1;
      }

      // v0.0.9.5 commit 4: reservoirTank (nu t40) adds a slow passive fill
      // on top of whatever environmental refill (rain/wetland/river) is
      // firing. Small enough to not trivialize drinking/stamina management,
      // consistent enough to keep the courier topped up on long routes.
      if (S.upgrades.reservoirTank && S.canteen < S.canteenMax) {
        S.canteen = Math.min(S.canteenMax, S.canteen + C.RESERVOIR_TANK_PASSIVE_FILL);
      }
    }

    Trip.accumulateDist();
    if (S.ticks%5===0) {
      checkDistMilestones();
    }

    Trip.maybeTrip();
    Boots.checkAutobuy();
    // Off-grid during shortcut — no cell-based pickup / scanner hit.
    if (!isOnShortcut()) {
      Pkg.scanForPickup();
      // v0.0.7.21 — scanner tick. No-op unless unlocked.
      tickScanner();
    }

    if (S.stamina<50 && S.status==='walking' && Math.random()<0.03) {
      S.status='resting'; S.restTimer=C.REST_TICKS_MIN+Math.floor(Math.random()*(C.REST_TICKS_MAX-C.REST_TICKS_MIN));
      addLog('<span class="log-wn">exhausted \u2014 resting at nearest shelter</span>');
      if (els.courierAt) { els.courierAt.className='tlh-at rest'; els.courierAt.style.animation=''; }
    }
  }

  tickAmbientChatter();
  tickRecoveryAttempt();

  // v0.0.9.3 — advancement is segment-based. Ring + shortcut both
  // run through S._transient.currentSegment; S.dotT advances 0..1
  // within the active segment. On arrival, advanceSegmentAfterArrival
  // updates S.edgeIdx (for ring resumption) and replaces the segment.
  S.dotT += 0.006 * Stamina.speedMultiplier();

  if (S.dotT >= 1) {
    const arrivingSeg = S._transient.currentSegment;
    const arrivedAt   = arrivingSeg ? arrivingSeg.to : null;
    // advanceSegmentAfterArrival handles edgeIdx + segment + dotT reset
    advanceSegmentAfterArrival(arrivedAt);

    const node = arrivedAt && S.routeNodes.find(n => n.id === arrivedAt);
    if (node && getNodeStage(arrivedAt) < 3) {
      setNodeStage(arrivedAt, 3);
      addLog(`discovered: <span class="log-hi">${node.label}</span>`);
      postActivity('discovery', { nodeId: arrivedAt, label: node.label });
      // v0.0.9.2 — kick off typewriter emergence reveal in the
      // settlements panel if this node has a settlement entry.
      if (S.settlements[arrivedAt]) startEmergence(arrivedAt);
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
    if (arrivedAt) {
      Boots.refillBootClip(arrivedAt);
      Pkg.tryDeliver(arrivedAt);

      if (NPC_DEFS[arrivedAt]) {
        tryWarning(arrivedAt);
        tryPreview(arrivedAt);
        tryRestPrompt(arrivedAt);

        // v0.0.8.6: t60 battery charging — trusted destinations recharge.
        // Any NPC at t60+ adds charge when the courier passes through.
        const npcState = S.npcs[arrivedAt];
        if (npcState && npcState.unlocks && npcState.unlocks.t60 && S.battery) {
          const prev = S.battery.charge;
          S.battery.charge = Math.min(100, S.battery.charge + 15);
          if (S.battery.charge > prev) {
            addLog(`<span class="log-ok">battery charged</span> at ${NPC_DEFS[arrivedAt].callsign}'s`);
          }
        }

        // v0.0.9.4 — NPC outbound dispatch. Trust-scaled chance to be
        // handed a package destined for another node. Fires after
        // tryDeliver so cargo space reflects post-delivery state.
        Pkg.tryOutboundDispatch(arrivedAt);
      }
    }
  } else {
    updateRouteDot();
  }

  // v0.0.9.3 — per-tick interactive route-map updates: trail aging,
  // shortcut preview refresh, live tooltip.
  tickRouteInteractions();

  S.worldPos = worldPosFromRoute();
  renderFieldstrip();

  if (S.ticks%10===0) Pkg.tickPkgRespawns();

  // v0.0.8 — weather tick (storm spawn, move, dissipate, overlay).
  tickWeather();

  // v0.0.8.7: weather radio L1 — passive storm warning with type prediction.
  // Fires once per incoming storm when the warn window is entered.
  // L2 (weatherRadioT2) unlocks the minimap isobar rendering.
  if (S.weatherRadio && weatherAtCourier().intensity === 'none' && S.storms.length === 0) {
    const ticksUntilSpawn = S.nextStormSpawnTick - S.ticks;
    if (ticksUntilSpawn > 0 && ticksUntilSpawn <= C.STORM_INCOMING_WARN_TICKS
        && S._transient.lastWeatherRadioWarnTick < S.nextStormSpawnTick) {
      S._transient.lastWeatherRadioWarnTick = S.nextStormSpawnTick;
      const secs = Math.round(ticksUntilSpawn * C.TICK_MS / 1000);
      const typeNames = { squall: 'brief squall', front: 'weather front', deluge: 'heavy weather' };
      const typeName = typeNames[S.nextStormType] || 'storm';
      addLog(`<span class="log-wn">weather radio:</span> ${typeName} incoming \u2014 ~${secs}s`);
    }
  }

  if (S.ticks % 9 === 0) updateSaveStrip();
  if (S.ticks % 9 === 0 && S.channels.length > 0) renderChannels();

  // v0.0.7.28 — battery prototype drain. Originally time-only whenever
  // scanner or stickyGun was owned. v0.0.9.5 commit 3 decouples stickyGun
  // (pure mechanical — rangefinder + sticky shot, no electronics) so only
  // the scanner drains the battery from this pipeline. Additional
  // consumers (pi's exoskeleton, gamma's mobile carrier) register through
  // their own upgrade hooks in commit 4.
  if (S.scanner.unlocked && S.battery.charge > 0) {
    S.battery.charge = Math.max(0, S.battery.charge - C.BATTERY_DRAIN_PER_TICK);
  }

  // v0.0.9.5 commit 3: innate solar trickle regen. The baseline feature
  // (no upgrade required). daylightOf() peaks at 1.0 at midday, 0 at
  // night, smooth through dawn/dusk. A full idle day charges 0 → ~95.
  //
  // v0.0.9.5 commit 4 additions:
  //   - solarPanel    (delta t20): peak regen ×1.5. Desert-cell bonus
  //                                 hook stays latent; v0.0.9.6 terrain
  //                                 tagging flips it on.
  //   - rainfallTurbine (delta t40): opens a rain-weighted regen channel
  //                                    during active weather. Scales with
  //                                    intensity: drizzle 0.25× peak /
  //                                    rain 0.50× peak / downpour 0.75× peak.
  //                                    Works day or night.
  if (S.battery.charge < S.battery.max) {
    let gain = 0;
    // Solar channel (day only).
    const sun = daylightOf(S.ticks % TICKS_PER_DAY);
    if (sun > 0) {
      const solarMult = S.upgrades.solarPanel ? 1.5 : 1.0;
      gain += sun * C.BATTERY_SOLAR_PEAK_PER_TICK * solarMult;
    }
    // Rain channel (any time) via rainfall turbine.
    if (S.upgrades.rainfallTurbine) {
      const _w = weatherAtCourier();
      const rainMult = _w.intensity === 'downpour' ? 0.75
                     : _w.intensity === 'rain'     ? 0.50
                     : _w.intensity === 'drizzle'  ? 0.25
                     : 0;
      if (rainMult > 0) gain += rainMult * C.BATTERY_SOLAR_PEAK_PER_TICK;
    }
    if (gain > 0) S.battery.charge = Math.min(S.battery.max, S.battery.charge + gain);
  }

  Boots.renderBoots(); Stamina.renderStamina(); renderCargoSlots(); updateHUD();
  renderKit();

  // v0.0.9.2 — drive the settlements typewriter reveal each tick while
  // any emergence is in progress. Cheap — the Map is usually empty.
  if (hasActiveEmergence()) renderSettlements();
}

// ============================================================
// INIT
// ============================================================

// v0.0.9.5.1 — watch a scroll container and toggle `.has-overflow`
// based on whether its content exceeds its visible height. Gates
// the tier-A mask-fade so panels without overflow don't dim their
// top row for no reason. MutationObserver covers content churn,
// window resize covers layout churn. Cheap — three observers max.
function bindOverflowFade(el) {
  if (!el) return;
  const update = () => {
    const over = el.scrollHeight > el.clientHeight + 1;
    el.classList.toggle('has-overflow', over);
  };
  update();
  try {
    new MutationObserver(update).observe(el, {
      childList: true, subtree: true, characterData: true,
    });
  } catch (e) {}
  window.addEventListener('resize', update);
}

function init() {
  resolveEls();
  calcCellPxWidth();

  const porterId = getPorterId();
  if (els.porterIdEl) els.porterIdEl.textContent = porterId;

  buildWorld();

  const restored = loadGame();

  // v0.0.9.5.1 — replay the persisted dispatch-log tail into the DOM
  // so the player's recent history survives across sessions. Safe
  // on first-ever load (S.log is empty and the call no-ops).
  restoreLogFromSave();

  // v0.0.9.5.1 — bind overflow-fade gating for the three tier-A
  // scroll panels. Toggles `.has-overflow` when scrollHeight exceeds
  // clientHeight so the fade mask only kicks in when there's
  // actually clipped content (otherwise the top row would dim
  // for no reason). MutationObserver catches content changes,
  // window resize catches layout changes.
  bindOverflowFade(document.getElementById('upgradesEl'));
  bindOverflowFade(document.getElementById('settlementsEl'));
  bindOverflowFade(document.getElementById('channelsEl'));

  const [curFrom, curTo] = S.edges[S.edgeIdx];
  markEdgeAdjacent(curFrom, curTo);

  S.worldPos = worldPosFromRoute();

  // v0.0.8 — weather system init. Replaces old buildRain()/setRain()/
  // scheduleNextRainTransition(). Seeds the spawn scheduler and sets
  // up the overlay based on whether any storms are already active.
  buildWeatherOverlay();
  initWeather();

  // v0.0.9.1 — sky layer init (day/night cycle on the play-area strip).
  // Creates sun/moon/star SVG children inside #skySvg. Phase derives
  // from S.ticks so no separate schema hook is needed.
  initSky();
  layoutRouteNodes();
  // v0.0.9.3 — segment abstraction init. Seed currentSegment from the
  // restored edgeIdx, and attach the route-map click/hover handlers once.
  initSegment();
  drawRouteMap();
  bindRouteInteractions();
  updateDestDrift();
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
  // v0.0.9.4.1 — `grab:` toggle mirrors the autodrink toggle pattern.
  // Controls pkg auto-pickup only (sandalweed still auto-harvests).
  if (els.autoGrabBtn) {
    els.autoGrabBtn.textContent = 'grab: ' + (S.autoGrab ? 'auto' : 'off');
    els.autoGrabBtn.classList.toggle('on', S.autoGrab);
    els.autoGrabBtn.addEventListener('click', () => {
      S.autoGrab = !S.autoGrab;
      els.autoGrabBtn.textContent = 'grab: ' + (S.autoGrab ? 'auto' : 'off');
      els.autoGrabBtn.classList.toggle('on', S.autoGrab);
    });
  }
  if (els.tieDownBtn) els.tieDownBtn.addEventListener('click', Boots.toggleTieDown);
  // v0.0.9.4.1 — fieldstrip click delegation for cursor pickup.
  bindFieldstripInteractions();
  // v0.0.9.4.1 commit 2 — global drag layer (document-level
  // mousemove/mouseup). Cargo items bind their own mousedown via
  // bindCargoDragSource in renderCargoSlots.
  bindDragGlobals();

  // v0.0.7.31 — silent / appear-offline toggle. localStorage-backed so it
  // survives reloads (critical: the whole point is to avoid dummy events
  // while testing, and testing usually involves refreshes).
  // v0.0.7.32 — button LABEL inverted to "online: on/off" so the state is
  // self-explanatory at a glance (online = broadcasting, offline = silent).
  // Internal state still uses isSilent/setSilent — silent is accurate at
  // the wire layer and the localStorage key stays stable for existing users.
  if (els.silentBtn) {
    const paintOnline = () => {
      const online = !isSilent();
      els.silentBtn.textContent = online ? 'online' : 'offline';
      els.silentBtn.classList.toggle('on', online);
      // aria-pressed: true when the toggle is "engaged" (i.e., on/online)
      els.silentBtn.setAttribute('aria-pressed', online ? 'true' : 'false');
      // v0.0.7.32 — dim the whole network ptitle (// network + slashes)
      // to #5a4a78 when offline so the panel header reads disconnected.
      const ptitle = els.silentBtn.parentElement;
      if (ptitle) ptitle.classList.toggle('offline', !online);
    };
    paintOnline();
    els.silentBtn.addEventListener('click', () => {
      setSilent(!isSilent());
      paintOnline();
    });
  }

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
