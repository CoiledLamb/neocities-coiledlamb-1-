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
import {
  GEAR_FOR_TERRAIN,
  GEAR_LIFETIME_BASE_MS, GEAR_LIFETIME_EXTENDED_MS,
  GEAR_PRICE, gearWear,
} from './data/terrain.js';
import { addLog } from './render/log.js';

// Cell-snap grid for placement lookup. Matches the 12-
// unit step used by drawInterior / terrain classifier.
const CELL_STEP = 12;
function snapCell(x, y) {
  return {
    x: Math.round(x / CELL_STEP) * CELL_STEP,
    y: Math.round(y / CELL_STEP) * CELL_STEP,
  };
}

/** Returns the placed-gear entry at (x, y) if any, else null.
 *  Snaps the lookup to the cell grid so different courier
 *  dotT samples on the same cell see the same placement. */
export function placedGearAt(x, y) {
  const s = snapCell(x, y);
  const arr = S._transient.placedGear;
  for (let i = 0; i < arr.length; i++) {
    const g = arr[i];
    if (g.x === s.x && g.y === s.y) return g;
  }
  return null;
}

/** Makes a new placed entry at (x, y). Lifetime baked from
 *  lambda's mountainGear upgrade flag — once placed, all
 *  viewers honor the extended lifetime regardless of their
 *  own upgrades. */
function placeEntry(type, x, y) {
  const s = snapCell(x, y);
  const lifetimeMs = S.upgrades.mountainGear
    ? GEAR_LIFETIME_EXTENDED_MS
    : GEAR_LIFETIME_BASE_MS;
  const entry = {
    id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    x: s.x, y: s.y,
    placedWallClock: Date.now(),
    lifetimeMs,
    stormDecayExtra: 0,
  };
  S._transient.placedGear.push(entry);
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
    const entry = placeEntry(gearType, xy.x, xy.y);
    maybeLogPlacement(gearType, terrain);
    return entry;
  }

  // 3. Auto-buy + place
  if (kit.autoGear && S.scrip >= GEAR_PRICE) {
    S.scrip -= GEAR_PRICE;
    const entry = placeEntry(gearType, xy.x, xy.y);
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

/** Remove expired placed gear. Called from main.js tick. */
export function tickGearDecay() {
  const arr = S._transient.placedGear;
  if (arr.length === 0) return;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (gearWear(arr[i]) >= 1) arr.splice(i, 1);
  }
}

/** Explicit kit-bar buy button entry point. Returns true on
 *  successful purchase. */
export function buyGear(type) {
  if (type !== 'ladder' && type !== 'anchor') return false;
  if (S.scrip < GEAR_PRICE) return false;
  S.scrip -= GEAR_PRICE;
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
 *  warnings. */
export function resetGearLogThrottles() {
  S._transient.placementLogged = false;
  S._transient.unpladderedTerrains = null;
}
