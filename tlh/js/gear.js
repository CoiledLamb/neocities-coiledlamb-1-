/* ==============================================
   THE LONG HAUL — placeable gear (v0.0.9.6 commit 4)

   Ladder + anchor infrastructure. Auto-placed on cell
   entry when kit has the matching item; auto-bought
   from scrip when kit is empty and the autoGear toggle
   is on. Placed structures mitigate that cell's trip +
   stamina penalties for their lifetime (12h base, 24h
   with lambda's mountainGear flag, baked at placement).

   Commit 4 is session-local. Commit 5 promotes
   S._transient.placedGear into the world-overlay
   (save-stored + multiplayer-synced). Commit 6 adds
   drag-UX + trail trampling + pass carving.

   Directional ladder/anchor (ladder=ascent, anchor=
   descent) is a commit-6 concern — deferred until
   trample provides per-cell state that makes tumble-
   loop-safe.

   Exports:
     courierGearCell() — which (x, y) should place gear?
     placedGearAt(x, y) — find placed entry at cell
     tickGearDecay()  — removes rotting entries
     autoPlaceForCell(terrain, xy) — the main hook
     buyGear(type) — explicit buy from kit-bar button
   ============================================== */
'use strict';

import { S } from './state.js';
import * as C from './constants.js';
import {
  GEAR_FOR_TERRAIN,
  GEAR_LIFETIME_BASE_MS, GEAR_LIFETIME_EXTENDED_MS,
  GEAR_PRICE, gearWear,
  cellKeyFromCoords, snapInteriorCell,
  TERRAIN_LOCATION_NOUN,
} from './data/terrain.js';
import { addLog } from './render/log.js';
import { getCachedPorterId, broadcastGearPlacement } from './multiplayer.js';
import { emit as tEmit, accum as tAccum } from './telemetry.js';

// Cell-snap grid for placement lookup. Matches the 12-
// unit step used by drawInterior / terrain classifier.
function snapCell(x, y) { return snapInteriorCell(x, y); }

/** Returns the placed-gear entry at (x, y) if any, else null.
 *  Snaps the lookup to the cell grid so different courier
 *  dotT samples on the same cell see the same placement. */
export function placedGearAt(x, y) {
  const s = snapCell(x, y);
  const arr = S.placedGear;
  for (let i = 0; i < arr.length; i++) {
    const g = arr[i];
    if (g.x === s.x && g.y === s.y) return g;
  }
  return null;
}

/** Canonical ID: ${porterId}-${placedWallClock}-${cellKey}.
 *  Dedup key for broadcast receive. Identical across all viewers
 *  who receive the same placement. */
function canonicalGearId(placerId, placedWallClock, x, y) {
  return `${placerId}-${placedWallClock}-${cellKeyFromCoords(x, y)}`;
}

/** Idempotent add — returns existing entry if one with the same
 *  canonical ID already exists, otherwise pushes + returns the
 *  new entry. Used by both local placement and broadcast receive
 *  so the two paths converge safely. */
export function upsertPlacedGear(entry) {
  const arr = S.placedGear;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].id === entry.id) return arr[i];
  }
  arr.push(entry);
  return entry;
}

/** Makes a new placed entry at (x, y). Lifetime baked from
 *  lambda's mountainGear upgrade flag — once placed, all
 *  viewers honor the extended lifetime regardless of their
 *  own upgrades. Broadcasts to peers so everyone sees it. */
function placeEntry(type, x, y, terrain) {
  const s = snapCell(x, y);
  const lifetimeMs = S.upgrades.mountainGear
    ? GEAR_LIFETIME_EXTENDED_MS
    : GEAR_LIFETIME_BASE_MS;
  const placedWallClock = Date.now();
  const placerId = getCachedPorterId();
  const entry = {
    id: canonicalGearId(placerId, placedWallClock, s.x, s.y),
    placerId,
    type,
    x: s.x, y: s.y,
    placedWallClock,
    lifetimeMs,
    stormDecayExtra: 0,
  };
  upsertPlacedGear(entry);
  tEmit('gear.placed', { type, terrain });
  // Broadcast so peers see our placement. Terrain included for the
  // narrative flavor on the channel line ("placed a ladder on the
  // slope"). Receivers dedup on entry.id.
  broadcastGearPlacement({
    id: entry.id,
    placerId,
    type,
    x: entry.x, y: entry.y,
    placedWallClock,
    lifetimeMs,
    terrain,
  });
  return entry;
}

/** Auto-place hook. Called on each interior cell entry.
 *  Runs the 3-tier behavior:
 *    1. Placed gear present -> use it, no consume
 *    2. Item in kit         -> consume + place
 *    3. autoGear on + scrip -> buy + place (logs -5c)
 *    4. otherwise           -> log throttled "no gear"
 *       hint once per terrain type per shortcut, return
 *       null (caller takes full penalty)
 *  Returns the placed entry (fresh or existing) or null. */
export function autoPlaceForCell(terrain, xy) {
  const gearType = GEAR_FOR_TERRAIN[terrain];
  if (!gearType) return null;

  // 1. Existing placement
  const existing = placedGearAt(xy.x, xy.y);
  if (existing) return existing;

  // 2. Consume from kit
  const kit = S.kit;
  const stackKey = gearType === 'ladder' ? 'ladders' : 'anchors';
  if (kit[stackKey] > 0) {
    kit[stackKey]--;
    const entry = placeEntry(gearType, xy.x, xy.y, terrain);
    maybeLogPlacement(gearType, terrain);
    return entry;
  }

  // 3. Auto-buy + place
  if (kit.autoGear && S.scrip >= GEAR_PRICE) {
    S.scrip -= GEAR_PRICE;
    const entry = placeEntry(gearType, xy.x, xy.y, terrain);
    tEmit('gear.auto_bought', { type: gearType, terrain });
    tAccum('scrip.spent', 'gear_autobuy', GEAR_PRICE);
    logAutoBuy(gearType, terrain);
    return entry;
  }

  // 4. No gear available — throttled warning log
  maybeLogMissingGear(terrain);
  return null;
}

// --- logging (throttled where relevant) --------------
// Article picker — "a ladder" vs "an anchor". Handles the two
// gear nouns we have; if we ever add a vowel-led gear noun
// elsewhere, this generalizes trivially.
function article(noun) {
  return /^[aeiou]/i.test(noun) ? 'an' : 'a';
}

function maybeLogPlacement(type, terrain) {
  // First placement per shortcut logs; subsequent silent.
  if (S._transient.placementLogged) return;
  S._transient.placementLogged = true;
  const noun = type === 'ladder' ? 'ladder' : 'anchor';
  const where = LOCATION_NOUN[terrain] || 'slope';
  addLog(`placed ${article(noun)} ${noun} on the ${where}`);
}

function logAutoBuy(type, terrain) {
  const noun = type === 'ladder' ? 'ladder' : 'anchor';
  const where = LOCATION_NOUN[terrain] || 'slope';
  addLog(
    `bought and placed ${article(noun)} ${noun} on the ${where} ` +
    `\u2014 <span class="log-wn">-5\u00a2</span>`
  );
}

function maybeLogMissingGear(terrain) {
  if (!S._transient.unpladderedTerrains) {
    S._transient.unpladderedTerrains = new Set();
  }
  if (S._transient.unpladderedTerrains.has(terrain)) return;
  S._transient.unpladderedTerrains.add(terrain);
  const msg = MISSING_GEAR_MSG[terrain];
  if (msg) addLog(msg);
}

const LOCATION_NOUN = {
  mountain:   'slope',
  rockyHills: 'hillside',
  plateau:    'mesa',
  river:      'bank',
};

const MISSING_GEAR_MSG = {
  mountain:   '<span class="log-wn">slope is bare</span> \u2014 a ladder here would cost less than this climb',
  rockyHills: '<span class="log-wn">hillside is bare</span> \u2014 a ladder would smooth the footing',
  river:      '<span class="log-wn">no rope at the crossing</span> \u2014 an anchor would\u2019ve spared the cargo',
  plateau:    '<span class="log-wn">mesa edge unclimbed</span> \u2014 a ladder would reach the top',
};

/** Remove expired placed gear + apply storm wear accelerator. Called
 *  from main.js tick. v0.0.9.6 commit 7 — each piece of placed gear
 *  inside an active storm's radius accumulates 2×TICK_MS extra wear
 *  per tick (so effective decay = 3× while exposed). Once stormDecay
 *  Extra pushes total wear past 1.0, the gear is removed as usual. */
export function tickGearDecay() {
  const arr = S.placedGear;
  if (!arr || arr.length === 0) return;
  const storms = S.storms || [];
  const bonus  = 2 * C.TICK_MS;   // +2× on top of baseline tick elapsed = 3× total
  if (storms.length > 0 && bonus > 0) {
    for (const entry of arr) {
      let inStorm = false;
      for (const storm of storms) {
        const typeCfg = C.STORM_TYPES[storm.type];
        if (!typeCfg) continue;
        const radius = typeCfg.radiusSvg || 30;
        const d = Math.hypot(entry.x - storm.x, entry.y - storm.y);
        if (d < radius) { inStorm = true; break; }
      }
      if (inStorm) {
        entry.stormDecayExtra = (entry.stormDecayExtra || 0) + bonus;
      }
    }
  }
  for (let i = arr.length - 1; i >= 0; i--) {
    if (gearWear(arr[i]) >= 1) {
      tEmit('gear.expired', { type: arr[i].type });
      arr.splice(i, 1);
    }
  }
}

/** Broadcast receiver — called by multiplayer.js on incoming
 *  gear-placement events from peers. Dedup via canonical ID. */
export function receiveGearPlacement(payload) {
  if (!payload || !payload.id || !payload.type) return;
  const entry = {
    id:              payload.id,
    placerId:        payload.placerId,
    type:            payload.type,
    x:               payload.x,
    y:               payload.y,
    placedWallClock: payload.placedWallClock,
    lifetimeMs:      payload.lifetimeMs,
    stormDecayExtra: payload.stormDecayExtra || 0,
  };
  const before = S.placedGear.length;
  upsertPlacedGear(entry);
  // Only log a channel line if this was a fresh receive (dedup miss)
  // and it's from a peer (not our own echo).
  if (S.placedGear.length > before && payload.placerId !== getCachedPorterId()) {
    logPeerPlacement(payload);
  }
}

function logPeerPlacement(payload) {
  // Build the "PTR-XXXX placed a ladder on the slope" line. Terrain
  // noun pulled from TERRAIN_LOCATION_NOUN; falls back to generic
  // "slope" if an unknown terrain slipped through.
  const shortId = (payload.placerId || '').slice(0, 8);
  const noun    = TERRAIN_LOCATION_NOUN[payload.terrain] || 'slope';
  const a       = /^[aeiou]/i.test(payload.type) ? 'an' : 'a';
  // Route through channels.js speak() — posted via import to avoid a
  // circular dependency. Passing through the network feed keeps
  // peer-built infrastructure visible in the channels panel where
  // other porter activity already lives.
  import('./channels.js').then((mod) => {
    if (typeof mod.postGearChannelMsg === 'function') {
      mod.postGearChannelMsg(shortId, a, payload.type, noun);
    }
  });
}

/** Explicit kit-bar buy button entry point. Returns true on
 *  successful purchase. */
export function buyGear(type) {
  if (type !== 'ladder' && type !== 'anchor') return false;
  if (S.scrip < GEAR_PRICE) return false;
  S.scrip -= GEAR_PRICE;
  tAccum('scrip.spent', 'gear_manual', GEAR_PRICE);
  const stackKey = type === 'ladder' ? 'ladders' : 'anchors';
  S.kit[stackKey]++;
  addLog(
    `bought ${article(type)} ${type} for the kit ` +
    `\u2014 <span class="log-wn">-${GEAR_PRICE}\u00a2</span>`
  );
  return true;
}

/** Segment-change hook — reset throttled-log flags so each
 *  new shortcut gets its own "first placement" + "no gear"
 *  warnings. v0.0.9.6 commit 5 — also resets the plateau-gate
 *  throttle used by packages.js acceptInteriorPickup so the
 *  message fires once per shortcut rather than ping-ponging
 *  with cargo-full. */
export function resetGearLogThrottles() {
  S._transient.placementLogged = false;
  S._transient.unpladderedTerrains = null;
  S._transient.plateauGateLogged = false;
}
