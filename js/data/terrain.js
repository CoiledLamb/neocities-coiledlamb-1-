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
const PLATEAU_R    = 55;   // around xi
const DESERT_R     = 62;   // around nu (slightly broader)
const ROCKY_R      = 62;   // around gamma

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

  // Plateau: xi corner (ruins on top)
  if (dXi < PLATEAU_R + j) return 'plateau';

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
