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
  tickRouteInteractions, isOnShortcut, courierTerrain,
} from './render/route-map.js';
import {
  TERRAIN_STAMINA_MULT, TERRAIN_CANTEEN_DELTA, desertStaminaMult,
  GEAR_FOR_TERRAIN, GEAR_STAMINA_MITIGATION,
  reduceMultWithTrample,
} from './data/terrain.js';
import {
  autoPlaceForCell, placedGearAt, tickGearDecay, resetGearLogThrottles,
} from './gear.js';
import { addTrampleAt, trampleAt } from './trail.js';
import { emit as tEmit } from './telemetry.js';
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
    restBtn:      $('restBtn'),
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
export function tick() {
  S.ticks++;

  // v0.0.9.6.9 — early skip for expensive renders during sim mode.
  // Everything below these two calls still runs; we just skip the
  // heaviest DOM paths. Keeps the sim loop ~10× faster.
  const simMode = S._transient && S._transient.simMode;

  // v0.0.9.1 — sky layer renders every tick regardless of game state
  // (trips, rests, walking). Purely visual, no state mutation.
  if (!simMode) renderSky();

  // v0.0.9.5.1 — route HUD overlays (clock + coord + next-dest)
  // update every tick for the same reason: clock must advance even
  // during tripped/resting states. Coord + next are safe no-ops when
  // the courier isn't on a ring segment.
  if (!simMode) updateRouteHud();

  if (S.tripTimer>0) {
    S.tripTimer--;
    if (S.tripTimer===0) {
      S.status = S.inventory.length>0?'carrying':'walking';
      if (els.courierAt) { els.courierAt.className='tlh-at bounce'+(S.inventory.length>0?' carry':''); els.courierAt.style.animation=''; }
    }
    if (!simMode) { Boots.renderBoots(); Stamina.renderStamina(); updateHUD(); }
    return;
  }

  if (S.status==='resting') {
    S.restTimer--;
    // v0.0.9.6.9.17 — strain dissipates during rest. Makes rest an
    // active trip-prevention lever: a full shelter break can bleed
    // ~0.4 strain, turning "about to trip" back into "safe for a
    // while". Pairs with the strain-gauge system in trip.js.
    if (S.strain > 0) S.strain = Math.max(0, S.strain - C.STRAIN_REST_DISSIPATION);
    if (S.restTimer<=0) {
      S.stamina=S.staminaMax*1.25; S.staminaOverboost=true;
      S.canteen=Math.min(S.canteenMax,S.canteen+20); S.status='walking';
      tEmit('rest.ended');
      addLog('rested at shelter \u2014 <span class="log-hi">stamina restored +25% overboost</span>');
      if (els.courierAt) { els.courierAt.className='tlh-at bounce'; els.courierAt.style.animation=''; }
    }
    if (!simMode) { Stamina.renderStamina(); updateHUD(); }
    return;
  }

  if (S.status==='walking' || S.status==='carrying') {
    // v0.0.9.6 commit 3 — per-cell terrain stamina mult replaces the
    // v0.0.9.3 flat SHORTCUT_STAMINA_MULT. Flat interior = 1.0x (no
    // blanket tax); river/mountain/rockyHills carry real load. Desert
    // ramps with daylight (×1.0 at night → ×1.4 midday).
    let staminaMult = 1.0;
    const seg = S._transient.currentSegment;
    const onInterior = seg && (seg.type === 'shortcut' || seg.type === 'river-drift');
    let currentTerrain = null;
    let courierXYNow = seg && seg.pathFn ? seg.pathFn(S.dotT) : null;
    // v0.0.9.6.9.3 — courierTerrain returns 'plateau' when a ring-
    // walking courier enters a mesa-outcrop zone (midpoint between
    // early-route NPCs). Process terrain effects whenever a terrain
    // is non-flat, regardless of segment type.
    currentTerrain = courierTerrain();
    if (currentTerrain !== 'flat') {
      staminaMult = TERRAIN_STAMINA_MULT[currentTerrain] || 1.0;
      if (currentTerrain === 'desert') {
        staminaMult = desertStaminaMult(daylightOf(S.ticks));
      }
      // v0.0.9.6 commit 4 — auto-place ladder/anchor on terrains
      // that benefit. Placed gear mitigates stamina drain.
      if (GEAR_FOR_TERRAIN[currentTerrain] && courierXYNow) {
        const placed = autoPlaceForCell(currentTerrain, courierXYNow);
        if (placed) staminaMult *= GEAR_STAMINA_MITIGATION;
      }
      // v0.0.9.6 commit 6 — trample reduces staminaMult per cell.
      // Only accumulate trample on the interior (shortcut / river-
      // drift) — ring cells are already the "road" and shouldn't
      // get paved by the courier walking them (that's the rim
      // biome's job). Ring mesas still get trample since their
      // (x,y) is along the road and worth reducing penalty on.
      if (onInterior || currentTerrain === 'plateau') {
        addTrampleAt(courierXYNow.x, courierXYNow.y);
        staminaMult = reduceMultWithTrample(staminaMult, trampleAt(courierXYNow.x, courierXYNow.y));
      }
    }
    const staminaDrain = C.STAMINA_DRAIN * staminaMult;
    S.stamina = Math.max(0, S.stamina - staminaDrain);
    if (S.staminaOverboost && S.stamina<=S.staminaMax) S.staminaOverboost=false;

    let bd=C.BOOT_DRAIN;
    if (S.upgrades.bootsT1) bd*=0.75;
    if (S.upgrades.bootsT2) bd*=0.50;
    if (S.usingMakeshift)   bd*=1.30;
    S.bootDurability=Math.max(0,S.bootDurability-bd);

    // v0.0.9.6 commit 3 — weather lookup + canteen refills are now
    // active on interior too. River-water cells refill canteen at the
    // terrain's per-tick delta (+0.3). Wetland rim biome still works
    // the old way. Weather can affect interior too — storm system
    // still ring-only until commit 7 spawns storms in the interior.
    const _w = weatherAtCourier();
    if (_w.intensity === 'downpour')      S.canteen = Math.min(S.canteenMax, S.canteen + C.CANTEEN_DOWNPOUR);
    else if (_w.intensity === 'rain')     S.canteen = Math.min(S.canteenMax, S.canteen + C.CANTEEN_RAIN);
    else if (_w.intensity === 'drizzle')  S.canteen = Math.min(S.canteenMax, S.canteen + C.CANTEEN_DRIZZLE);
    else if (onInterior && TERRAIN_CANTEEN_DELTA[currentTerrain]) {
      S.canteen = Math.min(S.canteenMax, S.canteen + TERRAIN_CANTEEN_DELTA[currentTerrain]);
    }
    else if (!onInterior && S.inRiver)           S.canteen = Math.min(S.canteenMax, S.canteen + C.CANTEEN_RAIN);
    else if (!onInterior && currentCellIsWetland()) S.canteen = Math.min(S.canteenMax, S.canteen + C.WETLAND_CANTEEN_REFILL);

    // Wetland tick counter stays ring-only (river interior cells feed
    // the canteen but aren't "wetlands" narratively, so iota's trust
    // profile rightly doesn't accrue from them).
    if (!onInterior && currentCellIsWetland() && S.npcs && S.npcs['B']) {
      S.npcs['B'].wetlandTicksSinceLastVisit = (S.npcs['B'].wetlandTicksSinceLastVisit || 0) + 1;
    }

    // v0.0.9.5 commit 4: reservoirTank (nu t40) adds a slow passive fill
    // on top of whatever environmental refill is firing. Works on
    // interior too — it's a pack-carried cistern, not a location
    // mechanic.
    if (S.upgrades.reservoirTank && S.canteen < S.canteenMax) {
      S.canteen = Math.min(S.canteenMax, S.canteen + C.RESERVOIR_TANK_PASSIVE_FILL);
    }

    Trip.accumulateDist();
    if (S.ticks%5===0) {
      checkDistMilestones();
    }

    Trip.maybeTrip();
    Boots.checkAutobuy();
    // v0.0.9.6 commit 3 — pickup scanning + scanner tick are now
    // active on interior too. Interior pkg spawning lands in commit 5;
    // until then scanForPickup returns no-op on interior (no pkgs to
    // find). Scanner buffs still apply.
    Pkg.scanForPickup();
    // v0.0.7.21 — scanner tick. No-op unless unlocked.
    tickScanner();

    // v0.0.9.6.9 sim telemetry — resource zero events
    if (S.stamina <= 0 && !S._transient.staminaZeroLatch) {
      S._transient.staminaZeroLatch = true;
      tEmit('stamina.zero');
    } else if (S.stamina > 5) {
      S._transient.staminaZeroLatch = false;
    }
    if (S.canteen <= 0 && !S._transient.canteenEmptyLatch) {
      S._transient.canteenEmptyLatch = true;
      tEmit('canteen.empty');
    } else if (S.canteen > 5) {
      S._transient.canteenEmptyLatch = false;
    }

    if (S.stamina<50 && S.status==='walking' && Math.random()<0.03) {
      S.status='resting'; S.restTimer=C.REST_TICKS_MIN+Math.floor(Math.random()*(C.REST_TICKS_MAX-C.REST_TICKS_MIN));
      addLog('<span class="log-wn">exhausted \u2014 resting at nearest shelter</span>');
      tEmit('rest.started');
      if (els.courierAt) { els.courierAt.className='tlh-at rest'; els.courierAt.style.animation=''; }
    }
  }

  tickAmbientChatter();
  tickRecoveryAttempt();

  // v0.0.9.6 commit 3 — severe-trip stall. Mountain/rockyHills severe
  // trips set S._transient.severeTripState with a ticksRemaining; we
  // pause dotT advancement for that many ticks before resuming. River
  // severe uses its own river-drift segment (moves independently) so
  // it doesn't set this state.
  if (S._transient.severeTripState) {
    S._transient.severeTripState.ticksRemaining--;
    if (S._transient.severeTripState.ticksRemaining <= 0) {
      const type = S._transient.severeTripState.type;
      const msg = type === 'rockyHills'
        ? 'found footing \u2014 <span class="log-ok">moving again</span>'
        : 'steadied on a handhold \u2014 <span class="log-ok">back on the route</span>';
      addLog(msg);
      S._transient.severeTripState = null;
    }
    // Advance other systems (render, stamina, etc.) but skip position.
    // Fall through to render/HUD pass below without bumping dotT.
  } else {
    // v0.0.9.3 — advancement is segment-based. Ring + shortcut + river-
    // drift all run through S._transient.currentSegment; S.dotT advances
    // 0..1 within the active segment. On arrival,
    // advanceSegmentAfterArrival updates S.edgeIdx (for ring resumption)
    // and replaces the segment.
    const seg = S._transient.currentSegment;
    // River drift moves at the speed of the water — slower than a walk.
    const speedScale = (seg && seg.type === 'river-drift') ? 0.4 : 1.0;
    S.dotT += 0.006 * Stamina.speedMultiplier() * speedScale;
  }

  // v0.0.9.6 commit 4 — tick placed-gear wall-clock decay + remove
  // rotted entries. Runs every tick (cheap; scales with small placed-
  // gear count in commit 4's session-local scope).
  tickGearDecay();

  if (S.dotT >= 1) {
    const arrivingSeg = S._transient.currentSegment;
    const arrivedAt   = arrivingSeg ? arrivingSeg.to : null;
    // Reset gear-log throttles when segment changes so each new
    // shortcut gets a fresh "first placement" / "no gear" chance.
    resetGearLogThrottles();
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
    if (!simMode) updateRouteDot();
  }

  // v0.0.9.3 — per-tick interactive route-map updates: trail aging,
  // shortcut preview refresh, live tooltip.
  if (!simMode) tickRouteInteractions();

  S.worldPos = worldPosFromRoute();
  if (!simMode) renderFieldstrip();

  if (S.ticks%10===0) Pkg.tickPkgRespawns();

  // v0.0.8 — weather tick (storm spawn, move, dissipate, overlay).
  tickWeather();

  // v0.0.8.7: weather radio L1 — passive storm warning with type prediction.
  // v0.0.9.6 commit 7 — warn fires whenever any new storm is scheduled
  // (multi-concurrent means storms no longer require empty sky to
  // spawn), and the message now includes the landmark nearest the
  // preroll spawn point.
  if (S.weatherRadio) {
    const ticksUntilSpawn = S.nextStormSpawnTick - S.ticks;
    if (ticksUntilSpawn > 0 && ticksUntilSpawn <= C.STORM_INCOMING_WARN_TICKS
        && S._transient.lastWeatherRadioWarnTick < S.nextStormSpawnTick) {
      S._transient.lastWeatherRadioWarnTick = S.nextStormSpawnTick;
      const secs = Math.round(ticksUntilSpawn * C.TICK_MS / 1000);
      const typeNames = { squall: 'brief squall', front: 'weather front', deluge: 'heavy weather' };
      const preroll = S.nextStormSpawn;
      const typeName = typeNames[(preroll && preroll.type) || S.nextStormType] || 'storm';
      // Build the landmark-relative location phrase. Falls through to
      // "on the horizon" if we can't map to a known NPC.
      let where = 'on the horizon';
      if (preroll && preroll.nearestNpcId) {
        const npc = NPC_DEFS[preroll.nearestNpcId];
        if (npc) {
          const landmark = npc.name || npc.label || npc.callsign || 'the ring';
          where = preroll.isInterior ? `in the interior near ${landmark}` : `near ${landmark}`;
        }
      }
      addLog(`<span class="log-wn">weather radio:</span> ${typeName} forming ${where} \u2014 ~${secs}s`);
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

  if (!simMode) {
    Boots.renderBoots(); Stamina.renderStamina(); renderCargoSlots(); updateHUD();
    renderKit();
  }

  // v0.0.9.2 — drive the settlements typewriter reveal each tick while
  // any emergence is in progress. Cheap — the Map is usually empty.
  if (hasActiveEmergence()) renderSettlements();
}

// ============================================================
// INIT
// ============================================================

// v0.0.9.5.1 — watch a scroll container and toggle `.has-overflow`
// based on whether its content exceeds its visible height. Also
// toggles `.at-top` / `.at-bottom` per scroll position so the
// tier-A mask-fade only dims the edge where content is actually
// clipped (don't fade the top when scrolled to top — nothing above
// to hint at). MutationObserver covers content churn, resize covers
// layout churn, scroll covers scroll-position churn. Cheap — three
// observers max across the three tier-A panels.
function bindOverflowFade(el) {
  if (!el) return;
  const update = () => {
    const over = el.scrollHeight > el.clientHeight + 1;
    el.classList.toggle('has-overflow', over);
    // 1px slack on both ends: inertia scroll on some platforms
    // lands at scrollTop = 0.5 or scrollHeight - clientHeight - 0.5
    // and shouldn't drop the edge-class back off.
    el.classList.toggle('at-top',    el.scrollTop <= 1);
    el.classList.toggle('at-bottom', el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
  };
  update();
  try {
    new MutationObserver(update).observe(el, {
      childList: true, subtree: true, characterData: true,
    });
  } catch (e) {}
  el.addEventListener('scroll', update, { passive: true });
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

  // v0.0.9.1 — sky layer init (day/night cycle on the play-area strip).
  // Creates sun/moon/star SVG children inside #skySvg. Phase derives
  // from S.ticks so no separate schema hook is needed.
  initSky();
  // v0.0.9.6 commit 7 — layoutRouteNodes() MUST run before initWeather
  // so the storm preroll can pick real (x, y) locations via
  // pointInRing (which reads node coords). Prior order left the first
  // storm stuck at the (200, 200) rejection-sample fallback.
  layoutRouteNodes();
  initWeather();
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
  // v0.0.9.6.9.18 — manual rest. Lets the player sit down at any point
  // while walking/carrying to dissipate strain and refill stamina.
  // Uses the same rest-duration range as auto-rest. Disabled while
  // already resting / tripped / severe-state.
  if (els.restBtn) els.restBtn.addEventListener('click', () => {
    if (S.status !== 'walking' && S.status !== 'carrying') return;
    S.status = 'resting';
    S.restTimer = C.REST_TICKS_MIN + Math.floor(Math.random() * (C.REST_TICKS_MAX - C.REST_TICKS_MIN));
    tEmit('rest.started');
    addLog('<span class="log-hi">catching breath</span> \u2014 resting');
    if (els.courierAt) { els.courierAt.className = 'tlh-at rest'; els.courierAt.style.animation = ''; }
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
