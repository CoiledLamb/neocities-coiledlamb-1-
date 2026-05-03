/* ==============================================
   THE LONG HAUL — interior terrain types (v0.0.9.6)

   The rim of the ring keeps its existing zone-based
   biomes (zones.js). The INTERIOR of the 2D route-map
   gets terrain types here — deterministic placement
   anchored at corner + rim NPC coords so every player
   on the same save layout sees the same world.

   Commit 1 of v0.0.9.6 is COSMETIC ONLY — glyphs +
   colors render on the map, but nothing mechanical
   reads terrain yet. Shortcut penalties, pickup
   scanning, gear gating, trampling, and pkg spawn
   bias land in later commits of this patch.

   Anchors (match layoutRouteNodes in route-map.js):
     nu     NW corner  (92, 92)    — desert
     theta  NE corner  (308, 92)   — river source
     xi     SE corner  (308, 308)  — plateau / ruins
     pi     SW corner  (92, 308)   — mountain
     lambda bottom-L   (163, 315)  — mountain extend E
     delta  bottom-R   (237, 315)  — river terminus (dam)
     gamma  right-rim  (315, 237)  — rocky hills

   River flows theta (NE) → delta (bottom-rim), dammed.
   Two tributaries feed the main channel from the west.
   ============================================== */
'use strict';

// --- NPC coord anchors (viewBox units) ---------------
const NU_X     =  92, NU_Y     =  92;
const THETA_X  = 308, THETA_Y  =  92;
const XI_X     = 308, XI_Y     = 308;
const PI_X     =  92, PI_Y     = 308;
const LAMBDA_X = 163, LAMBDA_Y = 315;
const DELTA_X  = 237, DELTA_Y  = 315;
const GAMMA_X  = 315, GAMMA_Y  = 237;

// --- river path parameters ---------------------------
// Main channel: theta (NE) → delta (bottom-rim).
// Tributaries feed the main channel from the west.
const RIVER_HALF_W     = 7;   // water half-width
const CLAY_BANK_EXTRA  = 5;   // clay-bed band outside water
const TRIBUTARY_HALF_W = 5;   // narrower side-channels

// Tributaries run W→E, joining the main channel from
// the west. Hand-placed endpoints — enough variety to
// make interior crossings matter at more than one
// latitude band.
const TRIBUTARIES = [
  { ax: 175, ay: 155, bx: 270, by: 170 },  // upper W feeder
  { ax: 150, ay: 245, bx: 245, by: 260 },  // lower W feeder
];

// --- biome radii (from NPC anchor) -------------------
// Kept feathered at the edges by a small hash-based
// jitter (see jitterDist). Tuned so each biome has
// meaningful cell presence without crowding neighbors.
const MOUNTAIN_R   = 55;   // around pi
const MOUNTAIN_R_L = 48;   // around lambda (smaller, rim-anchored)
const PLATEAU_R    = 55;   // around xi (ruined corner plateau)
const DESERT_R     = 62;   // around nu (slightly broader)
const ROCKY_R      = 62;   // around gamma

// --- mesa outcrops (v0.0.9.6.9.3) --------------------
// Small plateaus placed ON the early-route ring path, at
// edge midpoints between near-start NPCs. Designed as
// "earlygame teaching outcrops" — courier walking the
// ring passes THROUGH them (not around), engaging the
// auto-gear → ladder → pickup chain without requiring
// manual shortcut activation. All reward, no punishment:
// plateau adds minor time loss on the road, plateau-top
// pkg is a bonus the ladder gate makes the player earn.
//
// Positions: midpoints between H↔A, A↔ν, ν↔·, ·↔B.
// Clustered on the top-north + left-rim sequence so
// players hit all 4 in quick succession during their
// first lap — teaching density is concentrated early,
// then the reward curve drops (motivating engagement
// with further systems).
//
// Anchors (see layoutRouteNodes in route-map.js):
//   H   ( 85, 237)    tau
//   A   ( 85, 163)    rho
//   ν   ( 92,  92)    nu (NW corner)
//   ·   (163,  85)    psi
//   B   (237,  85)    iota
// Outer radius — covers all cells gates + plateau-pickup considers
// "part of the mesa." 24 units = 2 full grid cells in any direction
// from center, big enough that courier-placed ladders in adjacent
// cells count as serving the outcrop.
const MESA_OUTCROP_R = 24;
// Inner radius — controls how many ticks the courier spends in
// plateau-classified terrain. Tighter than outer so passage time
// is brief. Only the classifier uses this; mesaOutcropAt uses outer.
const MESA_INNER_R = 10;
// Each outcrop has a `pathCell` where the pkg spawns + ladder
// auto-places. Derived from snapping the ring midpoint onto the
// 12u cell grid, ensuring courier walking the ring passes through
// the exact cell that auto-place snaps to. Mesa center vs path
// cell are identical when the midpoint already lands on a grid
// multiple; otherwise the path cell takes the nearest valid cell.
const MESA_OUTCROPS = [
  { x:  84, y: 204, label: 'H-A mesa'  },  // H (85,237) ↔ A (85,163); path cell on left rim
  { x:  84, y: 132, label: 'A-nu mesa' },  // A (85,163) ↔ ν (92,92)
  { x: 132, y:  84, label: 'nu-psi mesa'}, // ν (92,92)  ↔ · (163,85); path on top
  { x: 204, y:  84, label: 'psi-B mesa' }, // · (163,85) ↔ B (237,85)
];
export const MESA_OUTCROP_CENTERS = MESA_OUTCROPS;

/** Returns the mesa outcrop entry an (x, y) falls within, or null.
 *  Used by the terrain classifier + interior pkg spawn logic to
 *  distinguish mesa-outcrop plateaus from xi's corner plateau. */
export function mesaOutcropAt(x, y) {
  for (const m of MESA_OUTCROPS) {
    if (Math.hypot(x - m.x, y - m.y) < MESA_OUTCROP_R) return m;
  }
  return null;
}

// --- geometry helpers --------------------------------
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// Tiny integer hash — used to feather biome boundaries
// deterministically so circles don't read as circles.
// Returns a value in [-3, +3] SVG units.
function jitterDist(x, y) {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h ^ (h >>> 16)) >>> 0;
  return ((h % 7) - 3);
}

function riverDist(x, y) {
  let d = distToSegment(x, y, THETA_X, THETA_Y, DELTA_X, DELTA_Y);
  for (const t of TRIBUTARIES) {
    const td = distToSegment(x, y, t.ax, t.ay, t.bx, t.by);
    if (td < d) d = td;
  }
  return d;
}

// Separate dist for trib-only check so clay-bed widths
// can differ between main trunk and side channels.
function tribDist(x, y) {
  let d = Infinity;
  for (const t of TRIBUTARIES) {
    const td = distToSegment(x, y, t.ax, t.ay, t.bx, t.by);
    if (td < d) d = td;
  }
  return d;
}

function mainRiverDist(x, y) {
  return distToSegment(x, y, THETA_X, THETA_Y, DELTA_X, DELTA_Y);
}

// --- classifier --------------------------------------
// Returns one of the keys in TERRAIN_GLYPHS / _COLORS.
export function terrainAt(x, y) {
  // River: main trunk + tributaries. Tributaries get
  // narrower water band; main trunk gets the full width.
  const mainD = mainRiverDist(x, y);
  const tribD = tribDist(x, y);
  if (mainD < RIVER_HALF_W) return 'river';
  if (tribD < TRIBUTARY_HALF_W) return 'river';

  // Clay bed sits on river banks. Main-trunk banks are
  // wider (stronger presence near theta); trib banks
  // narrower.
  if (mainD < RIVER_HALF_W + CLAY_BANK_EXTRA) return 'clayBed';
  if (tribD < TRIBUTARY_HALF_W + (CLAY_BANK_EXTRA - 1)) return 'clayBed';

  const j = jitterDist(x, y);

  // Corner-anchor distances
  const dNu     = Math.hypot(x - NU_X,     y - NU_Y);
  const dPi     = Math.hypot(x - PI_X,     y - PI_Y);
  const dLambda = Math.hypot(x - LAMBDA_X, y - LAMBDA_Y);
  const dXi     = Math.hypot(x - XI_X,     y - XI_Y);
  const dGamma  = Math.hypot(x - GAMMA_X,  y - GAMMA_Y);

  // Mountain cluster: pi summit + lambda slope
  if (dPi     < MOUNTAIN_R   + j) return 'mountain';
  if (dLambda < MOUNTAIN_R_L + j) return 'mountain';

  // Plateau: xi corner (ruins on top) + scattered mesa outcrops
  // along the early-route ring (v0.0.9.6.9.2 — earlygame teaching
  // plateaus with near-start-restricted pkg dests). Classifier uses
  // the tighter MESA_INNER_R so courier passage through the outcrop
  // is brief (~8-12 ticks); membership checks (mesaOutcropAt below)
  // use the wider MESA_OUTCROP_R so gate logic + gear-in-outcrop
  // checks cover adjacent snapped cells.
  if (dXi < PLATEAU_R + j) return 'plateau';
  for (const m of MESA_OUTCROPS) {
    if (Math.hypot(x - m.x, y - m.y) < MESA_INNER_R + (j * 0.5)) return 'plateau';
  }

  // Desert: nu corner (warm, sparse)
  if (dNu < DESERT_R + j) return 'desert';

  // Rocky hills: gamma's biome + spillover E off the
  // SW mountain cluster. The spillover rule (close-to
  // -mountain AND east-of-center) gives the "hills
  // between peaks and gamma" feel.
  if (dGamma < ROCKY_R + j) return 'rockyHills';
  if (Math.min(dPi, dLambda) < 85 + j && x > 130) return 'rockyHills';

  return 'flat';
}

// --- visual tables -----------------------------------
// Glyph arrays are picked from by the renderer's own
// seeded RNG so cells within a type get texture
// variation. Kept intentionally ASCII-ish to match
// TLH's existing visual language.
export const TERRAIN_GLYPHS = {
  flat:       ['.', '.', ',', ',', '\u00b7'],
  river:      ['~', '~', '~', '\u2248'],         // tilde + approx
  clayBed:    ['-', '_', ',', '.'],
  mountain:   ['^', '^', '/', '\\'],
  rockyHills: [',', '.', '~', '`'],
  plateau:    ['=', '=', '_', '\u00af'],         // = and macron
  desert:     ['\u00b0', '\u00ba', '.', '`'],    // degree + masc-ord for "sand peppering"
};

export const TERRAIN_COLORS = {
  flat:       '#2a5c5a',  // dim teal — existing
  river:      '#4a9db0',  // brighter blue-teal water
  clayBed:    '#b8a072',  // warmer ochre clay
  mountain:   '#7a8594',  // slate, slightly brighter
  rockyHills: '#8a7f66',  // muted beige
  plateau:    '#c0a77d',  // brighter tan-ochre
  desert:     '#d9b878',  // brighter warm sand
};

// Rendering opacity per terrain — some biomes want a
// touch more presence than the default 0.35 so the
// texture reads across the map.
export const TERRAIN_OPACITY = {
  flat:       0.35,
  river:      0.85,
  clayBed:    0.60,
  mountain:   0.80,
  rockyHills: 0.60,
  plateau:    0.75,
  desert:     0.70,
};

// --- mechanical tables (v0.0.9.6 commit 3) -----------
// Per-cell trip / stamina multipliers consumed during
// interior shortcut travel. Retire the flat-interior
// SHORTCUT_STAMINA_MULT (1.20) and SHORTCUT_TRIP_MULT
// (1.50) from v0.0.9.3 — terrain does the talking now.
//
// Idle-first invariant: every cell traversable gear-less;
// mountain/rockyHills penalties feel severe but the
// courier always passes through.
//
// Desert stamina uses day/night branch applied at
// call-site (multiplier ramps with daylightOf()).
export const TERRAIN_TRIP_MULT = {
  flat:       1.00,
  clayBed:    1.00,  // slightly sloggier, but same trip risk as flat
  river:      1.20,  // wading
  rockyHills: 1.50,  // intermediate
  mountain:   2.00,  // severe before gear (commit 4 adds ladder/anchor mitigation)
  plateau:    1.00,  // path cells between plateaus; top cells gated in commit 4
  desert:     1.00,
};

export const TERRAIN_STAMINA_MULT = {
  flat:       1.00,
  clayBed:    1.10,
  river:      1.30,  // wading is tiring
  rockyHills: 1.15,
  mountain:   1.50,
  plateau:    1.00,
  desert:     1.00,  // base; see desertStaminaMult() for day/night ramp
};

// Per-tick canteen delta while standing on the terrain
// (only applied during shortcut — ring canteen rules
// stay unchanged). River water refills like a wetland.
export const TERRAIN_CANTEEN_DELTA = {
  flat:       0,
  clayBed:    0,
  river:      0.3,   // +0.3/tick wading a water cell
  rockyHills: 0,
  mountain:   0,
  plateau:    0,
  desert:     0,
};

// Severity chance per trip follows severityChance =
// max(0, (tripMult - 1.0) * SEVERITY_SCALE). Default
// scale 0.5 gives:
//   river ×1.2  -> 10% severity
//   rockyHills ×1.5 -> 25% severity
//   mountain ×2.0 -> 50% severity
export const SEVERITY_SCALE = 0.5;

// Which terrains have *any* severe consequence. Other
// terrains (flat, clayBed, plateau, desert) never roll
// severe — trip fires normally.
export const TERRAIN_HAS_SEVERE = {
  river:      true,
  rockyHills: true,
  mountain:   true,
};

// Stall duration for mountain/hills "catch-self" severe
// trips. River uses a separate segment-based sweep
// mechanic (see riverSweepTargets / createRiverDriftSegment).
export const MOUNTAIN_STALL_TICKS = [5, 6, 7, 8];  // picked uniformly
export const ROCKYHILLS_STALL_TICKS = [2, 3];

// Desert day/night stamina ramp. Full sun = ×1.4, no
// sun = ×1.0. Caller reads sky.js daylightOf() and
// passes the 0..1 fraction.
export function desertStaminaMult(dayFrac) {
  return 1.0 + 0.4 * Math.max(0, Math.min(1, dayFrac));
}

// Project (x, y) onto the main theta→delta river path.
// Returns { t, x, y } where t=0 at theta, t=1 at delta.
// Used by the river-sweep mechanic to place the courier
// onto the river and step them downstream.
const RIVER_AX = 308, RIVER_AY =  92;
const RIVER_BX = 237, RIVER_BY = 315;
export function projectOntoRiver(x, y) {
  const dx = RIVER_BX - RIVER_AX, dy = RIVER_BY - RIVER_AY;
  const lenSq = dx * dx + dy * dy;
  let t = ((x - RIVER_AX) * dx + (y - RIVER_AY) * dy) / lenSq;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return { t, x: RIVER_AX + t * dx, y: RIVER_AY + t * dy };
}

// Total river path length in SVG units (theta → delta).
export function riverPathLength() {
  const dx = RIVER_BX - RIVER_AX, dy = RIVER_BY - RIVER_AY;
  return Math.hypot(dx, dy);
}

// Given a starting river-t and a downstream distance in
// SVG units, return the ending river-t (clamped 0..1).
// Used to place the "catch-self" target of a river drift.
export function riverDownstreamT(startT, distSvg) {
  const len = riverPathLength();
  return Math.max(0, Math.min(1, startT + distSvg / len));
}

// Sample the main river path at parameter t in [0..1].
export function riverPointAt(t) {
  const dx = RIVER_BX - RIVER_AX, dy = RIVER_BY - RIVER_AY;
  return { x: RIVER_AX + t * dx, y: RIVER_AY + t * dy };
}

// --- placed-gear mechanics (v0.0.9.6 commit 4) -------
// Which gear item auto-places on which terrain. Non-
// directional in commit 4 — ladder and anchor each map
// to specific terrains; directional (ladder=ascent vs
// anchor=descent) deferred to commit 6 when trample
// provides per-cell state to make directionality
// loop-safe.
export const GEAR_FOR_TERRAIN = {
  mountain:   'ladder',
  rockyHills: 'ladder',
  plateau:    'ladder',   // ascent to plateau tops; content lands commit 5
  river:      'anchor',   // rope-span across water
  // flat / clayBed / desert: no gear helps
};

// Mitigation ratios applied to TRIP_MULT and STAMINA_MULT
// of a cell when the matching gear is placed there. Chosen
// so mountain with ladder (2.0 × 0.65 = 1.3) reads like
// rocky hills without gear — real relief, terrain still
// matters. Severity chance drops automatically because
// it scales off trip mult.
export const GEAR_TRIP_MITIGATION    = 0.65;
export const GEAR_STAMINA_MITIGATION = 0.75;

// Wall-clock lifetimes. Base 12h; lambda's mountainGear
// upgrade doubles to 24h at placement time (baked into
// the placed-gear record so the bonus applies for all
// viewers, not just the placer). Stored as ms.
export const GEAR_LIFETIME_BASE_MS    = 12 * 3600 * 1000;
export const GEAR_LIFETIME_EXTENDED_MS = 24 * 3600 * 1000;

// Storm exposure decay accelerator (wired in commit 4 but
// dormant until commit 7 spawns interior storms). When a
// placed structure sits inside a storm's radius, extra
// wear ms accumulates at this rate per tick.
export const GEAR_STORM_DECAY_PER_TICK_MS = 0;  // commit 7 will set real value

// Price per item at the kit-bar buy button / auto-buy.
// Deliberately outside the 60/100/150 trust-reward bands
// per the v0.0.9.5.2 pricing-memory — this is disposable
// social infrastructure, not a permanent upgrade.
export const GEAR_PRICE = 5;

// Glyphs + colors per wear tier for the on-map render.
// Ladder uses diagonal bars for rung flavor; anchor uses
// DAGGER unicode for the "stabbed into the earth" shape
// user called out.
export const GEAR_GLYPH = {
  ladder: '\u2010\u2010',  // '‐‐' — rungs
  anchor: '\u2020',        // '†'  — dagger
};

// v0.0.9.6.9.30 — tier colors remapped to the cyan/warn/crit
// brand ramp and resolved lazily from the CSS palette so a
// future bone-theme switch picks up automatically. tier.color
// is a getter — call sites stay unchanged.
import { tlhPalette as _gearPalette } from '../palette.js?v=097-0-1';
export const GEAR_WEAR_TIERS = [
  { max: 0.35, name: 'fresh',     get color() { return _gearPalette().accent; } },
  { max: 0.70, name: 'weathered', get color() { return _gearPalette().warn;   } },
  { max: 1.01, name: 'rotting',   get color() { return _gearPalette().crit;   } },
];

// Classify wear (0..1) into the fresh/weathered/rotting tier.
export function gearWearTier(wear) {
  for (const t of GEAR_WEAR_TIERS) if (wear <= t.max) return t;
  return GEAR_WEAR_TIERS[GEAR_WEAR_TIERS.length - 1];
}

// Given a placed-gear entry, compute the current 0..1 wear
// factor from wall-clock elapsed plus any storm accumulator.
// Broken when >= 1.
export function gearWear(entry) {
  const now = Date.now();
  const elapsed = Math.max(0, now - entry.placedWallClock) + (entry.stormDecayExtra || 0);
  return Math.min(1, elapsed / entry.lifetimeMs);
}

// --- cell-key helpers (v0.0.9.6 commit 5) ------------
// Interior doesn't share the ring's ci index (ring uses edgeIdx *
// CELLS_PER_EDGE + offset). Interior cells key off their snapped
// (x, y) position on the 12-unit drawInterior grid. String format
// chosen for readability in save payloads + channel logs; trivial
// to parse back.
export const INTERIOR_CELL_STEP = 12;
export function snapInteriorCell(x, y) {
  return {
    x: Math.round(x / INTERIOR_CELL_STEP) * INTERIOR_CELL_STEP,
    y: Math.round(y / INTERIOR_CELL_STEP) * INTERIOR_CELL_STEP,
  };
}
export function cellKeyFromCoords(x, y) {
  const s = snapInteriorCell(x, y);
  return `${s.x},${s.y}`;
}
export function coordsFromCellKey(key) {
  const [xs, ys] = key.split(',');
  return { x: +xs, y: +ys };
}

// Short-form noun for each terrain, used in placement logs + peer
// channel messages ("placed a ladder on the slope"). Mirrors the
// LOCATION_NOUN in gear.js; consolidated here so it's importable
// everywhere it's needed.
export const TERRAIN_LOCATION_NOUN = {
  mountain:   'slope',
  rockyHills: 'hillside',
  plateau:    'mesa',
  river:      'bank',
};

// --- trample mechanics (v0.0.9.6 commit 6) -----------
// Each tick the courier spends on an interior cell bumps that
// cell's trample value by TRAMPLE_PER_STEP. Trample is a 0..1
// float that reduces terrain penalties linearly (via
// reduceMultWithTrample) so walked cells become progressively
// less punishing. At TRAMPLE_PASS_THRESHOLD a mountain cell
// becomes a "free pass" — severity rolls zeroed. Long-described
// mountain-pass-carving mechanic, finally here.
//
// Rate tuned: ~17-34 crossings of a single cell to reach 0.85.
// One traversal lasts 5-10 ticks at terrain speed, so
// 0.005 × 5-10 = 2.5-5% trample per visit.
//
// Decay schedule stubbed in .6; revisit v0.0.9.9+ when trample
// has been playable long enough to read feel (plan).
//
// Multiplayer trample sync is QUEUED FOR COMMIT 7 — per-tick
// broadcasts would flood the activity feed; sync lands as
// milestone broadcasts at threshold crossings (0.25 / 0.5 /
// 0.85) once commit 7 is already touching the multiplayer
// layer for storm work.
export const TRAMPLE_PER_STEP       = 0.005;
export const TRAMPLE_PASS_THRESHOLD = 0.85;

// Pure reducer: applies trample as a continuous linear pull of
// the multiplier toward 1.0 (flat). Composable with any other
// modifier — caller applies gear mitigation first, then this.
//   reducedMult = currentMult - (currentMult - 1) × trample
// At trample 0: no change. At trample 1: flat. Clamps inputs.
export function reduceMultWithTrample(mult, trample) {
  const t = Math.max(0, Math.min(1, trample));
  if (mult <= 1.0) return mult;  // no reduction below baseline
  return mult - (mult - 1) * t;
}
