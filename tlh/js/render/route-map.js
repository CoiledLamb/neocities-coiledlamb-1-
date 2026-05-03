/* render/route-map.js — extracted commit 16 (v0.0.7.16)

   Route SVG rendering. drawRouteMap paints the full route tree
   with stage-aware colors; updateRouteDot animates the porter
   dot along the active edge; layoutRouteNodes sets node coords
   on init. currentEdge is a tiny helper used by both this file
   and main's tick — exported so main can reuse it.

   Imports:
     S — game state (state.js)
     getNodeStage, getDisplayLabel — identification.js

   Local aliases:
     els — live ref into S._transient.els (never reassign).
*/
'use strict';

import { S } from '../state.js?v=097-0-7';
import * as C from '../constants.js?v=097-0-7';
import { getNodeStage, getDisplayLabel } from '../identification.js?v=097-0-7';
import { TICKS_PER_DAY } from './sky.js?v=097-0-7';
import { NPC_DEFS } from '../data/npc-defs.js?v=097-0-7';
import {
  terrainAt, TERRAIN_GLYPHS, TERRAIN_COLORS, TERRAIN_OPACITY,
  projectOntoRiver, riverPointAt, riverDownstreamT, riverPathLength,
  GEAR_GLYPH, gearWear, gearWearTier,
  cellKeyFromCoords, mesaOutcropAt,
} from '../data/terrain.js?v=097-0-7';
// v0.0.9.6.10.8 — trampleTier no longer consumed here (glyph-swap
// dropped in favor of the persistent-dot layer). trampleAt is used
// to floor the live trail's fade opacity.
import { trampleAt } from '../trail.js?v=097-0-7';
// v0.0.9.6.10.7 — use the density-filtered view of placed gear so
// render matches placedGearAt() gameplay lookup. Full pool lives
// on S.placedGear (persisted, broadcast-addressable); this is the
// curated subset that should be visible to the player.
import { visiblePlacedGear } from '../gear.js?v=097-0-7';
import { speedMultiplier } from '../stamina.js?v=097-0-7';
import { showRichTooltip, hideRichTooltip } from './rich-tooltip.js?v=097-0-7';
import { tlhPalette } from '../palette.js?v=097-0-7';
import { bakeSteppedHypsoPng } from '../data/topo-map.js?v=097-0-7';

const els = S._transient.els;

// ============================================================
// SEGMENT ABSTRACTION (v0.0.9.3)
// ============================================================
// Source of truth for "which leg is the courier walking now."
// S._transient.currentSegment = {
//   from:    nodeId,
//   to:      nodeId,
//   type:    'ring' | 'shortcut',
//   edgeIdx: number  (S.edges index for ring segments, -1 for shortcuts),
//   pathFn:  (t: 0..1) => { x, y },   // in route-map viewBox coords
//   length:  number (viewBox units),
// }
//
// currentEdge() now derives from currentSegment so every downstream
// caller (destDrift, cellToSvg, storm render) keeps working. S.edgeIdx
// stays the canonical ring index for ring segments — shortcut segments
// carry edgeIdx = -1 and callers that need a cell index handle that
// special case (cellIndex returns -1 → treated as off-grid).

export function getCurrentSegment() { return S._transient.currentSegment; }
export function isOnShortcut() {
  const seg = S._transient.currentSegment;
  return !!(seg && seg.type === 'shortcut');
}

/** Courier's current SVG (x, y) on whichever segment is active.
 *  Null only if there's no segment yet (shouldn't happen after init). */
export function courierXY() {
  const seg = S._transient.currentSegment;
  if (!seg) return null;
  return seg.pathFn(S.dotT);
}

/** Terrain type under the courier. Shortcut + river-drift segments
 *  use the full terrainAt classifier (interior positions). Ring
 *  segments default to 'flat' but ALSO check mesa outcrops —
 *  v0.0.9.6.9.3 placed these on ring-edge midpoints so courier
 *  walking the road physically passes through them, engaging the
 *  auto-gear → ladder → plateau-pickup chain without requiring
 *  manual shortcut interaction. */
export function courierTerrain() {
  const seg = S._transient.currentSegment;
  if (!seg) return 'flat';
  const xy = seg.pathFn(S.dotT);
  // v0.0.9.6.9.15 — ring now returns the actual geography it passes
  // through (mountain / rockyHills / river / desert / plateau) instead
  // of hardcoded 'flat'. Matches design intent: these terrains
  // intersect the ring AS WELL as being interior, so trip mechanics
  // and severe-trip branches see real geo on the ring path too. Mesa
  // outcrops still take precedence (ring-specific plateau concept).
  if (seg.type === 'ring') {
    if (mesaOutcropAt(xy.x, xy.y)) return 'plateau';
    return terrainAt(xy.x, xy.y) || 'flat';
  }
  return terrainAt(xy.x, xy.y);
}

export function currentEdge() {
  const seg = S._transient.currentSegment;
  if (seg) return [seg.from, seg.to];
  // Fallback for old callers pre-init (shouldn't happen after initSegment).
  return S.edges[S.edgeIdx % S.edges.length];
}

/** Build a ring segment for the given edge index. */
function makeRingSegment(edgeIdx) {
  const ei = ((edgeIdx % S.edges.length) + S.edges.length) % S.edges.length;
  const [fromId, toId] = S.edges[ei];
  const fromNode = S.routeNodes.find(n => n.id === fromId);
  const toNode   = S.routeNodes.find(n => n.id === toId);
  return {
    from: fromId, to: toId, type: 'ring', edgeIdx: ei,
    pathFn: (t) => ({
      x: fromNode.x + (toNode.x - fromNode.x) * t,
      y: fromNode.y + (toNode.y - fromNode.y) * t,
    }),
    length: Math.hypot(toNode.x - fromNode.x, toNode.y - fromNode.y),
  };
}

/** Build a shortcut segment using a quadratic bezier with a deterministic bow. */
function makeShortcutSegment(fromId, toId, startXY) {
  const toNode = S.routeNodes.find(n => n.id === toId);
  // Start point: may be mid-edge (replan case) or the from-node exactly.
  const src = startXY || S.routeNodes.find(n => n.id === fromId);
  const dx = toNode.x - src.x, dy = toNode.y - src.y;
  const len = Math.hypot(dx, dy) || 1;
  const midX = (src.x + toNode.x) / 2;
  const midY = (src.y + toNode.y) / 2;
  // Perpendicular unit vector from the straight line.
  const px = -dy / len, py = dx / len;
  // Bow toward the side the ring centroid sits on (feels more organic).
  const cx = RING_CX - midX, cy = RING_CY - midY;
  const bowSign = (px * cx + py * cy) > 0 ? -1 : 1;
  const bow = 0.18 * len;
  const ctrlX = midX + px * bow * bowSign;
  const ctrlY = midY + py * bow * bowSign;
  return {
    from: fromId, to: toId, type: 'shortcut', edgeIdx: -1,
    pathFn: (t) => {
      const u = 1 - t;
      return {
        x: u*u*src.x + 2*u*t*ctrlX + t*t*toNode.x,
        y: u*u*src.y + 2*u*t*ctrlY + t*t*toNode.y,
      };
    },
    length: len,
  };
}

/** Set initial segment from S.edgeIdx on game init. */
export function initSegment() {
  S._transient.currentSegment = makeRingSegment(S.edgeIdx);
}

/** Advance to the next ring segment after arrival at arrivedAt.
 *  Called from main.js tick arrival handler. Keeps S.edgeIdx in sync. */
export function advanceSegmentAfterArrival(arrivedAt) {
  const seg = S._transient.currentSegment;
  if (!seg) { initSegment(); return; }
  // River-drift completion — catch-self + resume toward the original
  // destination with a fresh shortcut from the drift endpoint.
  if (seg.type === 'river-drift') {
    const endXY = seg.pathFn(1);
    S._transient.currentSegment = makeShortcutSegment(seg.from, seg.resumeTo, endXY);
    S.dotT = 0;
    S._transient.shortcutOverlay = null;
    return;
  }
  if (seg.type === 'ring') {
    // Advance one ring edge clockwise.
    S.edgeIdx = (seg.edgeIdx + 1) % S.edges.length;
  } else {
    // Shortcut arrival — resume ring clockwise from the arrived node.
    const nextIdx = S.edges.findIndex(([a]) => a === arrivedAt);
    if (nextIdx !== -1) S.edgeIdx = nextIdx;
  }
  S._transient.currentSegment = makeRingSegment(S.edgeIdx);
  S.dotT = 0;
  S._transient.shortcutOverlay = null;
}

/** River-drift segment (v0.0.9.6 commit 3) — created when a severe
 *  river trip fires. Courier is projected onto the theta→delta main
 *  river line, swept N SVG units downstream over ~5-8 ticks at a
 *  slower-than-walk pace, then catches themselves. On arrival a fresh
 *  shortcut segment to the original destination is spawned so the
 *  idle loop continues unbroken. `resumeTo` is the shortcut's original
 *  `to` node. */
function makeRiverDriftSegment(startXY, resumeTo, sweepSvgUnits) {
  const startProj = projectOntoRiver(startXY.x, startXY.y);
  const endT      = riverDownstreamT(startProj.t, sweepSvgUnits);
  const endXY     = riverPointAt(endT);
  return {
    from: '_drift_start', to: '_drift_end', type: 'river-drift',
    edgeIdx: -1,
    resumeTo,
    pathFn: (t) => {
      const riverT = startProj.t + (endT - startProj.t) * t;
      return riverPointAt(riverT);
    },
    length: Math.hypot(endXY.x - startProj.x, endXY.y - startProj.y),
  };
}

/** Kicks the courier into a river-drift segment. Called by trip.js
 *  when a severe-river trip fires. Returns true on success. Caller
 *  handles cargo damage + log separately. */
export function beginRiverDrift(sweepCells = 6) {
  const seg = S._transient.currentSegment;
  if (!seg) return false;
  const startXY = seg.pathFn(S.dotT);
  // Original destination — we repath here after the drift completes.
  // v0.0.9.6.9.30e — if a severe river trip fires WHILE already
  // drifting (possible: trip.js treats river-drift segs as "on
  // interior" and re-rolls trips from them), seg.to is the sentinel
  // '_drift_end' string, not a real node id. Using it as resumeTo
  // propagates the sentinel into the next drift, and when that drift
  // completes advanceSegmentAfterArrival → makeShortcutSegment fails
  // to find a routeNode with id '_drift_end' and crashes on undefined
  // toNode.x. Carry the ORIGINAL resumeTo forward across chained
  // drifts so the post-drift shortcut always points at a real node.
  const resumeTo = seg.type === 'river-drift' ? seg.resumeTo : seg.to;
  // SVG step is ~12 units per "cell" of texture; swept 5-10 cells lands
  // in the 60-120 unit range.
  const sweepSvg = 12 * sweepCells;
  S._transient.currentSegment = makeRiverDriftSegment(startXY, resumeTo, sweepSvg);
  S.dotT = 0;
  S._transient.shortcutOverlay = null;
  return true;
}

/** Public entry point for click-to-shortcut. Returns true if shortcut started. */
export function startShortcut(targetId) {
  const seg = S._transient.currentSegment;
  if (!seg) return false;
  const adj = adjacencyFromCurrent(targetId);
  if (adj !== 'far') return false;     // adjacent / current-target → no-op
  const courierXY = seg.pathFn(S.dotT);
  S._transient.currentSegment = makeShortcutSegment(seg.to, targetId, courierXY);
  S.dotT = 0;
  return true;
}

// ============================================================
// ADJACENCY + LIVE DISTANCES (for tooltip)
// ============================================================
function nodeIdx(id) { return S.routeNodes.findIndex(n => n.id === id); }

/** Is targetId adjacent to the current segment's endpoint on the ring? */
function adjacencyFromCurrent(targetId) {
  const seg = S._transient.currentSegment;
  if (!seg) return 'far';
  if (targetId === seg.to) return 'target';
  // Walk clockwise around the ring by node index to count steps.
  const startIdx = nodeIdx(seg.to);
  if (startIdx === -1) return 'far';
  let steps = 0;
  let i = startIdx;
  while (S.routeNodes[(i + 1) % S.routeNodes.length].id !== targetId) {
    i = (i + 1) % S.routeNodes.length;
    steps++;
    if (steps >= S.routeNodes.length) return 'far';
  }
  steps += 1; // one more to actually reach targetId
  const backSteps = S.routeNodes.length - steps;
  if (steps === 1 || backSteps === 1) return 'adjacent';
  return 'far';
}

/** Sum of ring edge lengths going clockwise from one node id to another. */
function ringNodeDistance(fromId, toId) {
  let i = S.edges.findIndex(([a]) => a === fromId);
  let total = 0, steps = 0;
  while (steps < S.edges.length) {
    const [a, b] = S.edges[i];
    if (a === toId) break;
    const na = S.routeNodes.find(n => n.id === a);
    const nb = S.routeNodes.find(n => n.id === b);
    total += Math.hypot(nb.x - na.x, nb.y - na.y);
    if (b === toId) break;
    i = (i + 1) % S.edges.length;
    steps++;
  }
  return total;
}

/** Live ring distance from courier's current xy to targetId (clockwise). */
function liveRingDistance(targetId) {
  const seg = S._transient.currentSegment;
  if (!seg) return 0;
  const remaining = (1 - S.dotT) * seg.length;
  if (seg.to === targetId) return remaining;
  return remaining + ringNodeDistance(seg.to, targetId);
}

/** v0.0.9.6.10.4 — km distance from the courier's live position to the
 *  given ring node, clockwise along the route. Returns null when the
 *  computation isn't meaningful: no current segment, target not on the
 *  ring, or courier is on a synthetic seg (river-drift) whose endpoint
 *  isn't in the ring adjacency. Consumers (cargo pkg tooltip) use null
 *  to hide the row rather than show a bogus value. */
export function distanceKmToNode(nodeId) {
  const seg = S._transient.currentSegment;
  if (!seg) return null;
  if (!S.routeNodes.find(n => n.id === nodeId)) return null;
  if (!S.routeNodes.find(n => n.id === seg.to)) return null;
  const svg = liveRingDistance(nodeId);
  return svg / UNITS_PER_KM;
}

/** Live straight-line shortcut distance from courier's current xy to targetId. */
function liveShortcutDistance(targetId) {
  const seg = S._transient.currentSegment;
  const target = S.routeNodes.find(n => n.id === targetId);
  if (!seg || !target) return 0;
  const xy = seg.pathFn(S.dotT);
  return Math.hypot(target.x - xy.x, target.y - xy.y);
}

// SVG viewBox is 400 units wide with the ring spanning ~250 of those.
// Scale chosen so the ring's total perimeter (~720 units) maps to ~24 km,
// matching the live game's per-edge ~4 km feel.
const UNITS_PER_KM = 30;
const toKm = u => (u / UNITS_PER_KM).toFixed(1) + ' km';
// v0.0.9.6.9.27 — adaptive distance + ETA helpers for the route
// footer / tooltips. Footer reads in meters under 1km for resolution
// at close range, and switches back to X.Xkm above that. ETAs lean
// on the live segment + courier speed-mult; if the courier isn't on
// a segment (resting, just-arrived) ETAs degrade to '\u2014'.
function toNearDist(u) {
  const km = u / UNITS_PER_KM;
  if (km < 1) return Math.round(km * 1000) + 'm';
  return km.toFixed(1) + 'km';
}
function unitsPerTick() {
  const seg = S._transient.currentSegment;
  if (!seg || !seg.length) return 0;
  const sM = speedMultiplier();
  if (sM <= 0) return 0;
  // Same dotT advancement constant as main.js's tick path (0.006).
  // River-drift's 0.4 speedScale isn't applied here — ETAs are walking
  // estimates, not "if you keep getting swept" estimates.
  return seg.length * 0.006 * sM;
}
function etaSecs(units) {
  const upt = unitsPerTick();
  if (upt <= 0) return Infinity;
  return (units / upt) * (C.TICK_MS / 1000);
}
function fmtEta(s) {
  if (!isFinite(s) || s < 0) return '\u2014';
  if (s < 60) return '~' + Math.max(1, Math.round(s)) + 's';
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return '~' + (r === 0 ? m + 'm' : m + 'm ' + r + 's');
}

// Display mapping: route node IDs → Greek letter equivalents.
// v0.0.9.2 — ? and · now show as φ/ψ post-stage-1 (matches the
// v0.0.8.4 NPC identity patch: phi at weather station, psi at the
// orphan-scavenger settlement).
// v0.0.9.5 — A/B/C/H remap from α/β/γ/η (stale placeholders) to
// ρ/ι/ξ/τ matching their actual callsigns. Fixes the pre-existing
// mismatch between displayed glyph and NPC callsign AND prevents
// collision with the new gamma NPC (node id = γ character itself).
// Added entries for the new 6 NPCs: identity-map since their nodeId
// IS the Greek letter already — kept explicit for the table reading
// as a self-documenting index of every ring glyph.
const GREEK = {
  'A':       '\u03c1',          // ρ — rho
  'B':       '\u03b9',          // ι — iota
  'C':       '\u03be',          // ξ — xi
  'H':       '\u03c4',          // τ — tau
  '?':       '\u03c6',          // φ — phi
  '\u00b7':  '\u03c8',          // ψ — psi
  '\u03bd':  '\u03bd',          // ν — nu
  '\u03b8':  '\u03b8',          // θ — theta
  '\u03b3':  '\u03b3',          // γ — gamma
  '\u03bb':  '\u03bb',          // λ — lambda
  '\u03c0':  '\u03c0',          // π — pi
  '\u03b4':  '\u03b4',          // δ — delta
};
function nodeGlyph(id) { return GREEK[id] || id; }

// v0.0.9.2 — route map is a 2D plane. Square viewBox (400×400).
// v0.0.9.5 — rounded-square rim with 12 nodes (4 corners + 2 rim-side
// per side) replaces the hex layout. Corners anchor biome identity
// (nu/theta/xi/pi); rim slots host existing + new NPCs.
export function layoutRouteNodes() {
  // v0.0.9.5 — 6-node hex → 12-node rounded-square rim. Bounding square
  // 85..315 on both axes inside the 400×400 viewBox; corners inset to
  // (92/92, 308/92, 308/308, 92/308) sitting on the arc midpoints of
  // 25px corner arcs; rim nodes at 163/237 along each straight side
  // for even spacing (~73 units arc-length per segment).
  //
  // The ring renderer draws straight lines between adjacent nodes
  // (edge-list below). The "rounded" feel comes from the corner nodes
  // sitting inset from the bounding rectangle — corner-adjacent
  // segments read as short chamfers rather than sharp right angles.
  // Explicit arc-path rendering is a later visual-polish pass.
  [{ id:'A',       x: 85, y:163 }, // rho    — left-rim-T  (depot)
   { id:'B',       x:237, y: 85 }, // iota   — top-rim-R   (greenhouse)
   { id:'H',       x: 85, y:237 }, // tau    — left-rim-B  (home) ← player start
   { id:'?',       x:315, y:163 }, // phi    — right-rim-T (weather station)
   { id:'C',       x:308, y:308 }, // xi     — SE corner   (city ruins)
   { id:'\u00b7',  x:163, y: 85 }, // psi    — top-rim-L   (oasis)
   { id:'\u03bd',  x: 92, y: 92 }, // nu     — NW corner   (purification plant) [new]
   { id:'\u03b8',  x:308, y: 92 }, // theta  — NE corner   (kiln) [new]
   { id:'\u03b3',  x:315, y:237 }, // gamma  — right-rim-B (workshop) [new]
   { id:'\u03bb',  x:163, y:315 }, // lambda — bottom-rim-L (climbing lodge) [new]
   { id:'\u03c0',  x: 92, y:308 }, // pi     — SW corner   (radio tower) [new]
   { id:'\u03b4',  x:237, y:315 }, // delta  — bottom-rim-R (reservoir) [new]
  ].forEach(p => { const n = S.routeNodes.find(n => n.id === p.id); if (n) { n.x = p.x; n.y = p.y; } });
}

// Centroid of the ring — used for label placement and point-in-polygon.
const RING_CX = 200;
const RING_CY = 200;

// Point-in-polygon test using the current ring nodes as vertices.
// Used by drawInterior to mask the texture to the crossable area
// and by packages.js seedInteriorPkgs to skip cells that would
// spawn outside the ring polygon (and therefore be unreachable).
export function pointInRing(px, py) {
  const pts = S.routeNodes.map(n => [n.x, n.y]);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    const hit = ((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}

// Seeded RNG so interior texture is stable within a session but
// regenerates on reload. Session-scoped — no save persistence.
function makeSeededRand(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// v0.0.9.7 — topographic terrain raster.
//
// Replaces the per-cell glyph + biome-color terrain when the
// topographicMap upgrade is owned. Bakes the 200\u00d7200 stepped-hypso
// heightmap from data/topo-map.js to a PNG data URL on first call
// (cached after that), then drops a single <image> element covering
// the 400\u00d7400 viewBox. Renders behind everything else (trample,
// trail, gear, ring, nodes, courier).
//
// Without the topographicMap upgrade we still call drawInterior
// below, which paints the muted "unmapped ground" dots.
function drawTopoTerrain(svg, ns) {
  const img = document.createElementNS(ns, 'image');
  img.setAttribute('class', 'route-topo');
  img.setAttribute('x', '0');
  img.setAttribute('y', '0');
  img.setAttribute('width',  '400');
  img.setAttribute('height', '400');
  img.setAttribute('preserveAspectRatio', 'none');
  img.setAttribute('href', bakeSteppedHypsoPng());
  svg.appendChild(img);
}

// Interior terrain texture — per-cell glyph + color
// keyed on biome type from data/terrain.js (v0.0.9.6
// commit 1). Classifier is deterministic on (x, y)
// so the world shape is stable across reloads and
// convergent across players. Glyph-within-type still
// uses the session-seeded RNG so texture reads alive
// rather than perfectly tiled.
//
// v0.0.9.7 — topographicMap branch was promoted to drawTopoTerrain
// (stepped-hypso raster). drawInterior is now only called for the
// pre-upgrade muted-dots state; the hasMap branch below is dead but
// kept for safety so a stale call still works.
function drawInterior(svg, ns) {
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('class', 'route-interior');
  const rand = makeSeededRand(9111);
  const step = 12;
  // v0.0.9.6.9.30.2 — psi's topographic map (t40) gates the terrain
  // palette. Without it, non-trampled cells render as uniform muted
  // dots so the interior reads as unknown-but-present. Trampled cells
  // stay visible regardless — the courier's boots have "mapped" them
  // through direct experience, which is a stronger cue than a surveyor's
  // chart. Earning the map from psi lights the whole interior up.
  const hasMap = !!(S.upgrades && S.upgrades.topographicMap);
  // v0.0.9.2 — ranges tuned for the 400×400 square viewBox.
  for (let yy = 50; yy <= 350; yy += step) {
    for (let xx = 50; xx <= 350; xx += step) {
      if (!pointInRing(xx, yy)) continue;
      const kind  = terrainAt(xx, yy);
      const pool  = TERRAIN_GLYPHS[kind];
      const ch    = pool[Math.floor(rand() * pool.length)];
      // v0.0.9.6.10.8 — trample glyph-swap removed. Trample now
      // renders as a dedicated cyan dot layer (#routeTrample) that
      // tracks live courier trail + persistent trample in one
      // visual language. Base terrain glyph stays visible on all
      // cells (fresh or trampled) so the biome identity doesn't get
      // hidden once a cell is walked. topographicMap gate still
      // applies for the unowned-map pre-reveal state.
      let ch2, fill, opacity;
      if (!hasMap) {
        // Pre-topographicMap: uniform muted `.` — terrain is there,
        // but the player doesn't know which kind yet. A single color
        // that reads as "unmapped ground" without blending into the
        // ring edges.
        ch2 = '.'; fill = '#3a4a52'; opacity = 0.45;
      } else {
        ch2 = ch; fill = TERRAIN_COLORS[kind]; opacity = TERRAIN_OPACITY[kind];
      }
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', xx);
      t.setAttribute('y', yy);
      t.setAttribute('font-family', "'Source Code Pro',monospace");
      t.setAttribute('font-size', '6');
      t.setAttribute('fill', fill);
      t.setAttribute('opacity', opacity);
      t.setAttribute('text-anchor', 'middle');
      t.textContent = ch2;
      g.appendChild(t);
    }
  }
  svg.appendChild(g);
}

export function drawRouteMap() {
  // v0.0.9.6.9 — skip rebuild during sim runs. Route-map draw is
  // the most expensive render in the tick loop; sim mode runs
  // thousands of ticks and doesn't need the DOM to reflect any of it.
  if (S._transient && S._transient.simMode) return;
  const svg = els.routeSvg;
  if (!svg) return;
  svg.innerHTML = '';
  const ns = 'http://www.w3.org/2000/svg';
  const [fromId, toId] = currentEdge();

  // v0.0.9.2 — interior texture plotted first so it renders behind
  // the ring and nodes.
  // v0.0.9.7 — topographicMap upgrade now reveals the stepped-hypso
  // raster (drawTopoTerrain) instead of the colored terrain glyphs.
  // Pre-upgrade still falls back to drawInterior's muted dots.
  const hasTopoMap = !!(S.upgrades && S.upgrades.topographicMap);
  if (hasTopoMap) drawTopoTerrain(svg, ns);
  else            drawInterior(svg, ns);

  // v0.0.9.7.7 — defs + outside-ring framing layers per the design
  // handoff at tlh/.handoff-topo/. Defs hold the outside-ring clip
  // path (full rect minus ring polygon, even-odd), the radial
  // vignette gradient, and the diagonal hatch pattern that overlays
  // the dim. Built fresh each draw — cheap; the SVG is wiped via
  // innerHTML='' above so persisting defs across draws would orphan.
  const ringPts   = S.routeNodes.map(n => `${n.x},${n.y}`).join(' ');
  const ringPathD = 'M' + S.routeNodes.map(n => `${n.x},${n.y}`).join(' L') + ' Z';

  const defs = document.createElementNS(ns, 'defs');

  const clipOutside = document.createElementNS(ns, 'clipPath');
  clipOutside.setAttribute('id', 'ringClipOutside');
  clipOutside.setAttribute('clipPathUnits', 'userSpaceOnUse');
  const clipOutPath = document.createElementNS(ns, 'path');
  clipOutPath.setAttribute('clip-rule', 'evenodd');
  clipOutPath.setAttribute('d', `M0,0 H400 V400 H0 Z ${ringPathD}`);
  clipOutside.appendChild(clipOutPath);
  defs.appendChild(clipOutside);

  const vGrad = document.createElementNS(ns, 'radialGradient');
  vGrad.setAttribute('id', 'ringVignette');
  vGrad.setAttribute('cx', '50%');
  vGrad.setAttribute('cy', '50%');
  vGrad.setAttribute('r',  '55%');
  [['70%', '#000', '0'], ['100%', '#000', '0.35']].forEach(([off, col, op]) => {
    const s = document.createElementNS(ns, 'stop');
    s.setAttribute('offset',       off);
    s.setAttribute('stop-color',   col);
    s.setAttribute('stop-opacity', op);
    vGrad.appendChild(s);
  });
  defs.appendChild(vGrad);

  const hatch = document.createElementNS(ns, 'pattern');
  hatch.setAttribute('id',                'ringHatch');
  hatch.setAttribute('width',             '6');
  hatch.setAttribute('height',            '6');
  hatch.setAttribute('patternUnits',      'userSpaceOnUse');
  hatch.setAttribute('patternTransform',  'rotate(35)');
  const hatchLine = document.createElementNS(ns, 'line');
  hatchLine.setAttribute('x1',           '0');
  hatchLine.setAttribute('y1',           '0');
  hatchLine.setAttribute('x2',           '0');
  hatchLine.setAttribute('y2',           '6');
  hatchLine.setAttribute('stroke',       '#2a5c5a');
  hatchLine.setAttribute('stroke-width', '0.35');
  hatch.appendChild(hatchLine);
  defs.appendChild(hatch);

  svg.appendChild(defs);

  // Outside-ring dim — gated on topographicMap. Without the colored
  // raster, the muted-dots layer is already self-contained inside
  // the ring polygon (drawInterior tests pointInRing per cell), so
  // dimming the corners further would just look murky. With the
  // raster the heightmap fills the whole 400×400 viewBox, so the
  // dim + hatch frame the playable ring as the focal area.
  if (hasTopoMap) {
    const dimRect = document.createElementNS(ns, 'rect');
    dimRect.setAttribute('x',         '0');
    dimRect.setAttribute('y',         '0');
    dimRect.setAttribute('width',     '400');
    dimRect.setAttribute('height',    '400');
    dimRect.setAttribute('fill',      '#081f1e');
    dimRect.setAttribute('opacity',   '0.45');
    dimRect.setAttribute('clip-path', 'url(#ringClipOutside)');
    svg.appendChild(dimRect);

    const hatchRect = document.createElementNS(ns, 'rect');
    hatchRect.setAttribute('x',         '0');
    hatchRect.setAttribute('y',         '0');
    hatchRect.setAttribute('width',     '400');
    hatchRect.setAttribute('height',    '400');
    hatchRect.setAttribute('fill',      'url(#ringHatch)');
    hatchRect.setAttribute('opacity',   '0.18');
    hatchRect.setAttribute('clip-path', 'url(#ringClipOutside)');
    svg.appendChild(hatchRect);
  }

  // v0.0.9.6.10.8 — persistent trample layer. Same cyan dot visual
  // as the live fade trail, but sourced from S.interiorTrample so
  // worn-in cells keep a residual dot forever. Opacity scales with
  // trample value so "walking anywhere leaves a path" (faint) while
  // "paving it" reads as a visibly brighter trace. Renders first so
  // the live trail layer paints on top.
  const trampleG = document.createElementNS(ns, 'g');
  trampleG.setAttribute('id', 'routeTrample');
  svg.appendChild(trampleG);
  // Initial paint — tickRouteInteractions repaints this every
  // TRAMPLE_REPAINT_INTERVAL ticks, but we want it visible at
  // drawRouteMap time (reload / topographicMap purchase redraw).
  renderTrampleCells();

  // v0.0.9.3 — trail group (dotted fading path behind the courier on
  // shortcut segments) renders above interior, below ring + nodes.
  const trailG = document.createElementNS(ns, 'g');
  trailG.setAttribute('id', 'routeTrail');
  svg.appendChild(trailG);

  // v0.0.9.6 commit 4 — placed ladder/anchor glyphs on the map.
  // v0.0.9.6 commit 5 — source promoted from transient to persistent
  // S.placedGear so shared infrastructure survives reloads and peer
  // placements render alongside our own.
  // v0.0.9.6.10.7 — filter through visiblePlacedGear() so regions
  // with >3 nearby placements render only the 3 newest.
  const gearG = document.createElementNS(ns, 'g');
  gearG.setAttribute('id', 'routeGear');
  const placed = visiblePlacedGear();
  for (let i = 0; i < placed.length; i++) {
    const entry = placed[i];
    const wear  = gearWear(entry);
    const tier  = gearWearTier(wear);
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', entry.x);
    t.setAttribute('y', entry.y + 2);
    t.setAttribute('font-family', "'Source Code Pro',monospace");
    // v0.0.9.7.5 — gear glyphs shrunk 9 -> 8 so placed
    // infrastructure reads as minor marks beside NPC nodes
    // (which stay at fs 13 + r=8/10). Pairs with the css
    // change that gates the drop-shadow on .gear-rotting only,
    // so healthy gear renders flat and only ailing gear glows.
    t.setAttribute('font-size', '8');
    t.setAttribute('fill', tier.color);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('class', `route-gear gear-${entry.type} gear-${tier.name}`);
    t.textContent = GEAR_GLYPH[entry.type];
    const title = document.createElementNS(ns, 'title');
    title.textContent = `${entry.type} \u2014 ${tier.name}`;
    t.appendChild(title);
    gearG.appendChild(t);
  }
  svg.appendChild(gearG);

  // v0.0.9.7.7 — vignette + ring polygon outline. Vignette is gated
  // on topographicMap (the corners darkening is meaningful only over
  // the colored raster); the dashed outline always renders, framing
  // the ring as a closed loop on top of the per-segment edge lines.
  if (hasTopoMap) {
    const vRect = document.createElementNS(ns, 'rect');
    vRect.setAttribute('x',      '0');
    vRect.setAttribute('y',      '0');
    vRect.setAttribute('width',  '400');
    vRect.setAttribute('height', '400');
    vRect.setAttribute('fill',   'url(#ringVignette)');
    svg.appendChild(vRect);
  }

  const outline = document.createElementNS(ns, 'polygon');
  outline.setAttribute('points',           ringPts);
  outline.setAttribute('fill',             'none');
  outline.setAttribute('stroke',           '#7aa8a6');
  outline.setAttribute('stroke-width',     '0.7');
  outline.setAttribute('stroke-opacity',   '0.55');
  outline.setAttribute('stroke-dasharray', '3 3');
  svg.appendChild(outline);

  // v0.0.9.6.9.1 — interior pkg markers removed from the route map
  // per user call: pkgs are meant to surface on the side-view
  // playfield, not as free "loot map" markers on the route panel.
  // Commit 5's '\u25B2' / '\u25A0' overlay was a placeholder that
  // overpromised; genuine minimap waypoints (watchtowers, beacons)
  // are structure-work queued for v0.0.9.7+. Rendering is intact
  // in S.interiorPkgs data; only the visible marker is gone.

  // v0.0.9.3 — shortcut curve preview (faint dashed line showing the
  // remaining path when a shortcut is active).
  const shortcutG = document.createElementNS(ns, 'g');
  shortcutG.setAttribute('id', 'routeShortcutPath');
  svg.appendChild(shortcutG);

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
    // v0.0.9.2 — solid line, slightly wider. Literal ASCII road glyphs
    // land with the structures patch; this is the interim.
    // v0.0.9.7.7 — width bumped 1.5 → 1.6 + .route-edge class adds a
    // soft black drop-shadow so segments lift off the contour-tinted
    // ground when the topo raster is on. Stage tinting (3-tier color
    // by minStage) preserved per session call — the cue carries
    // discovered-vs-unvisited info worth keeping.
    line.setAttribute('class', 'route-edge');
    line.setAttribute('stroke-width', '1.6');
    line.setAttribute('stroke-linecap', 'round');
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

    // v0.0.9.7.7 — stage-3 fill swaps to panelDarker (#081f1e) when
    // topographicMap is owned. Spec calls this the "well cut into the
    // contour ground" effect — without the topo raster underneath, a
    // dark fill would just look muddy, so the swap is gated. Other
    // stages keep their existing fills regardless of map ownership.
    const fill = isCurrent ? '#0b2e2d'
               : (hasTopoMap && stage >= 3) ? '#081f1e'
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
    // v0.0.9.2 — sizes bumped to read at the 302×302 scaled display.
    c.setAttribute('r', isCurrent ? 10 : 8);
    c.setAttribute('fill', fill);
    c.setAttribute('stroke', stroke);
    c.setAttribute('stroke-width', isCurrent ? '1.8' : '1.2');

    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', n.x); t.setAttribute('y', n.y + 5);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-family', "'Source Code Pro',monospace");
    t.setAttribute('font-size', '13'); t.setAttribute('font-weight', '700');
    // v0.0.9.6.9.30 — node glyph fill via palette tokens.
    const _p = tlhPalette();
    t.setAttribute('fill', isCurrent ? _p.accent
                          : stage >= 3 ? _p.textMid
                          : stage >= 2 ? _p.textDim
                          : stage >= 1 ? _p.textFaint
                          : _p.textFaint);
    t.textContent = (stage >= 1 || n.id === '?') ? nodeGlyph(n.id) : '?';

    // v0.0.9.2 — labels always sit above (for upper-half nodes) or
    // below (for lower-half nodes) their circle, centered on the
    // node's x. Keeps long labels (e.g. "weather station") from
    // running off the side of the panel regardless of label width.
    const isUpper = n.y < RING_CY;
    const lx = n.x;
    const ly = isUpper ? n.y - 16 : n.y + 22;
    const anchor = 'middle';
    const lbl = document.createElementNS(ns, 'text');
    lbl.setAttribute('x', lx); lbl.setAttribute('y', ly);
    lbl.setAttribute('text-anchor', anchor);
    lbl.setAttribute('font-family', "'Source Code Pro',monospace");
    lbl.setAttribute('font-size', '11');
    // v0.0.9.6.9.30 — node label fill via palette tokens.
    lbl.setAttribute('fill', isCurrent ? _p.accent
                            : stage >= 3 ? _p.textDim
                            : stage >= 2 ? _p.textFaint
                            : _p.rule);
    lbl.textContent = stage === 0 ? '' : getDisplayLabel(n.id);

    g.appendChild(c); g.appendChild(t); g.appendChild(lbl);
    svg.appendChild(g);
  });

  // v0.0.8 — storm rendering (two-layer: color mass + contour lines)
  renderStorms(svg, ns);

  const dot = document.createElementNS(ns, 'circle');
  dot.setAttribute('id', 'routeDot'); dot.setAttribute('r', '4.5');
  // v0.0.9.6.9.30 — current-pos dot fill/stroke via palette tokens.
  const _pdot = tlhPalette();
  dot.setAttribute('fill', _pdot.textBright); dot.setAttribute('stroke', _pdot.accent); dot.setAttribute('stroke-width', '1.4');
  svg.appendChild(dot);
  updateRouteDot();

  // v0.0.9.3 — transparent hit regions on top of every node for
  // click-to-shortcut + hover tooltip. Larger than the visible node
  // so they're easy to hit on both desktop + mobile.
  const hitG = document.createElementNS(ns, 'g');
  hitG.setAttribute('id', 'routeHit');
  S.routeNodes.forEach(n => {
    const h = document.createElementNS(ns, 'circle');
    h.setAttribute('class', 'route-node-hit');
    h.setAttribute('cx', n.x); h.setAttribute('cy', n.y);
    h.setAttribute('r', 18);
    h.setAttribute('fill', 'transparent');
    h.setAttribute('style', 'cursor: pointer');
    h.dataset.id = n.id;
    hitG.appendChild(h);
  });
  svg.appendChild(hitG);

  // Repaint the existing shortcut preview / trail if any state is live
  renderShortcutPathPreview();
  renderTrailCells();
}

export function updateRouteDot() {
  const dot = document.getElementById('routeDot');
  if (!dot) return;
  const seg = S._transient.currentSegment;
  if (!seg) return;
  // v0.0.9.3 — position from segment's pathFn (ring = linear, shortcut = bezier).
  const xy = seg.pathFn(S.dotT);
  dot.setAttribute('cx', xy.x);
  dot.setAttribute('cy', xy.y);
}

// v0.0.9.5.1 — route-panel HUD overlays: clock (title row), coord
// (footer left), next-dest (footer right). Called from main's tick.
// Kept cheap — three text nodes + a guard for missing DOM nodes.
export function updateRouteHud() {
  // Clock — maps S.ticks % TICKS_PER_DAY to a 24h HH:MM string.
  const clockEl = document.getElementById('routeClock');
  if (clockEl) {
    const f = (((S.ticks % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY) / TICKS_PER_DAY;
    const mins = Math.floor(f * 24 * 60);
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    clockEl.textContent = `${hh}:${mm}`;
  }

  const seg = S._transient.currentSegment;

  // Coord — SVG-space x/y from the current segment's pathFn.
  // Integer display matches the 400x400 viewBox scale.
  const coordEl = document.getElementById('routeCoord');
  if (coordEl) {
    if (seg) {
      const xy = seg.pathFn(S.dotT);
      coordEl.innerHTML =
        `<span class="lbl">x:</span><span class="val">${Math.round(xy.x)}</span> ` +
        `<span class="lbl">y:</span><span class="val">${Math.round(xy.y)}</span>`;
    } else {
      coordEl.textContent = 'x:-- y:--';
    }
  }

  // Next-dest — callsign + remaining distance in the current segment.
  // Uses the NPC callsign when the dest is an NPC node, otherwise the
  // single-letter nodeId (matches tooltip's dim-fallback behavior).
  // v0.0.9.6.9.27 — distance now displayed in meters (was X.Xkm) so
  // small remaining distances read with more resolution at a glance.
  const nextEl = document.getElementById('routeNext');
  if (nextEl) {
    if (seg) {
      const destId   = seg.to;
      const npcDef   = NPC_DEFS[destId];
      const destName = npcDef ? npcDef.callsign : destId;
      const remaining = (1 - S.dotT) * seg.length;
      nextEl.innerHTML =
        `<span class="lbl">&rarr;</span><span class="val">${destName}</span> ` +
        `<span class="val">${toNearDist(remaining)}</span>`;
    } else {
      nextEl.textContent = '';
    }
  }
}

// ============================================================
// STORM RENDERING — dual-gaussian potential field isobars
// ============================================================
// Two independent layers:
//   1. Color mass (blurred) — blue→purple→pink precipitation density
//   2. Contour lines — light teal/cyan structural isobars
// Both use the storm's dual-gaussian field but with slightly offset
// centers so they drift independently (like real weather maps).

/** Convert a cell index to SVG (x, y) using the route node positions. */
function cellToSvg(ci) {
  const edgeIdx = Math.floor(ci / C.CELLS_PER_EDGE);
  const t = (ci % C.CELLS_PER_EDGE) / C.CELLS_PER_EDGE;
  const [fromId, toId] = S.edges[edgeIdx % S.edges.length];
  const from = S.routeNodes.find(n => n.id === fromId);
  const to   = S.routeNodes.find(n => n.id === toId);
  if (!from || !to) return { x: 55, y: 100 };
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

/** Seeded RNG for deterministic contour shapes per storm. */
function makeRand(seed) {
  let s = seed;
  return function() { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

/** Gaussian potential at (x,y) from two SVG-space centers. */
function svgPotential(x, y, c1, s1, c2, s2, w2) {
  const d1 = Math.sqrt((x - c1.x) ** 2 + (y - c1.y) ** 2);
  const d2 = Math.sqrt((x - c2.x) ** 2 + (y - c2.y) ** 2);
  return Math.exp(-(d1 * d1) / (2 * s1 * s1)) + w2 * Math.exp(-(d2 * d2) / (2 * s2 * s2));
}

/**
 * Trace a contour at a given potential threshold by marching outward
 * from a centroid at each sample angle. Returns an SVG path string.
 */
function traceContour(potFn, centX, centY, threshold, wobblePhase1, wobblePhase2) {
  const nSample = 64;
  const pts = [];
  for (let i = 0; i < nSample; i++) {
    const a = (Math.PI * 2 * i) / nSample;
    const dx = Math.cos(a), dy = Math.sin(a);
    let r = 0;
    // v0.0.9.2 — march radius bumped from 80 → 130 for the wider viewBox
    // so the outer contour doesn't clip on heavy storms.
    while (r < 130) {
      if (potFn(centX + dx * r, centY + dy * r) < threshold) break;
      r += 0.4;
    }
    // Very subtle wobble for organic feel
    r *= 1 + Math.sin(a + wobblePhase1) * 0.025;
    r *= 1 + Math.sin(a * 2 + wobblePhase2) * 0.012;
    pts.push({ x: centX + dx * r, y: centY + dy * r });
  }
  // Catmull-Rom to cubic bezier for smooth curves
  let d = '';
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length], p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length], p3 = pts[(i + 2) % pts.length];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    if (i === 0) d = `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} `;
    d += `C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)} `;
  }
  return d + 'Z';
}

/** v0.0.9.6.9.28 — connected-component builder for unified storm
 *  rendering. Two storms with any non-zero overlap (storm.intersects
 *  entry exists) are in the same component. Returns a Map from
 *  stormId → array-of-members-in-its-component. Each component is
 *  rendered with a combined potential field so overlapping isobars
 *  read as one deforming system rather than two kissing circles. */
function buildStormComponents(storms) {
  const idToStorm = new Map(storms.map(s => [s.id, s]));
  const compOf = new Map();  // stormId -> component array
  const visited = new Set();
  for (const root of storms) {
    if (visited.has(root.id)) continue;
    const comp = [];
    const queue = [root];
    visited.add(root.id);
    while (queue.length) {
      const s = queue.shift();
      comp.push(s);
      for (const inter of s.intersects || []) {
        if (visited.has(inter.otherId)) continue;
        const peer = idToStorm.get(inter.otherId);
        if (!peer) continue;
        visited.add(peer.id);
        queue.push(peer);
      }
    }
    for (const s of comp) compOf.set(s.id, comp);
  }
  return compOf;
}

function renderStorms(svg, ns) {
  // Gated behind weather radio L2 — the map visualization is the L2 unlock.
  if (!S.weatherRadio || S.weatherRadio.level < 2) return;
  if (S.storms.length === 0) return;

  // Ensure defs block exists for filters/gradients
  let defs = svg.querySelector('defs');
  if (!defs) { defs = document.createElementNS(ns, 'defs'); svg.prepend(defs); }

  // Blur filter for color mass (add once)
  if (!defs.querySelector('#stormBlur')) {
    const bf = document.createElementNS(ns, 'filter');
    bf.setAttribute('id', 'stormBlur');
    bf.setAttribute('x', '-40%'); bf.setAttribute('y', '-40%');
    bf.setAttribute('width', '180%'); bf.setAttribute('height', '180%');
    const feb = document.createElementNS(ns, 'feGaussianBlur');
    feb.setAttribute('stdDeviation', '3');
    bf.appendChild(feb);
    defs.appendChild(bf);
  }

  // v0.0.9.6.9.28 — precompute component membership so each storm's
  // contour tracer samples the combined field of its peers.
  const compOf = buildStormComponents(S.storms);

  for (const storm of S.storms) {
    const rand = makeRand(storm.seed);
    const typeCfg = C.STORM_TYPES[storm.type];

    // v0.0.9.6 commit 7 — storms now live natively in SVG (x, y) coords
    // (rather than ring-cell indices), so render reads positions
    // directly. Primary center + secondary offset give the dual-
    // gaussian shape.
    const primary   = { x: storm.x, y: storm.y };
    const secondary = {
      x: storm.x + (storm.secondaryOffsetX || 0),
      y: storm.y + (storm.secondaryOffsetY || 0),
    };

    // Color mass uses slightly offset centers (precipitation drifts)
    const mOff = { x: (rand() - 0.5) * 6, y: (rand() - 0.5) * 6 };
    const m1 = { x: primary.x + mOff.x, y: primary.y + mOff.y };
    const m2 = { x: secondary.x + mOff.x * 0.5, y: secondary.y + mOff.y * 0.5 };

    // SVG-space sigmas (scaled from cell-space to SVG-space).
    // v0.0.9.2 — scale factors bumped ~1.7× since the viewBox grew
    // from 110-wide to 280-wide. Edges are ~95-120 SVG units each now
    // (vs. ~50-60 in the old layout), so storms need to be wider to
    // still read as storm-shaped.
    const pSig1 = typeCfg.sigma1 * 0.60;
    const pSig2 = typeCfg.sigma2 * 0.60;
    const mSig1 = typeCfg.sigma1 * 0.68;  // slightly wider for color mass
    const mSig2 = typeCfg.sigma2 * 0.68;
    const w2 = typeCfg.w2;

    // Wobble phases (deterministic per storm)
    const wp1 = rand() * Math.PI * 2, wp2 = rand() * Math.PI * 2;
    const wm1 = rand() * Math.PI * 2, wm2 = rand() * Math.PI * 2;

    // Centroids for marching
    const pCentX = (primary.x + secondary.x * w2) / (1 + w2);
    const pCentY = (primary.y + secondary.y * w2) / (1 + w2);
    const mCentX = (m1.x + m2.x * w2) / (1 + w2);
    const mCentY = (m1.y + m2.y * w2) / (1 + w2);

    // v0.0.9.6.9.28 — potential field sums across all members of this
    // storm's connected component. Single-storm components collapse to
    // the old behavior (one peer = self). Overlapping storms produce a
    // unified envelope at outer thresholds and resolve to individual
    // cores at inner thresholds — exactly the isobar-merging look.
    const members = compOf.get(storm.id) || [storm];
    const pPot = (members.length === 1)
      ? (x, y) => svgPotential(x, y, primary, pSig1, secondary, pSig2, w2)
      : (x, y) => {
          let sum = 0;
          for (const m of members) {
            const mCfg = C.STORM_TYPES[m.type];
            const mP = { x: m.x, y: m.y };
            const mS = { x: m.x + (m.secondaryOffsetX || 0), y: m.y + (m.secondaryOffsetY || 0) };
            sum += svgPotential(x, y, mP, mCfg.sigma1 * 0.60, mS, mCfg.sigma2 * 0.60, mCfg.w2);
          }
          return sum;
        };
    const mPot = (members.length === 1)
      ? (x, y) => svgPotential(x, y, m1, mSig1, m2, mSig2, w2)
      : (x, y) => {
          let sum = 0;
          for (const m of members) {
            const mCfg = C.STORM_TYPES[m.type];
            // Reuse this storm's mass-offset for all peers — keeps the
            // deterministic-wobble look coherent across a component.
            const mP1 = { x: m.x + mOff.x, y: m.y + mOff.y };
            const mP2 = { x: m.x + (m.secondaryOffsetX || 0) + mOff.x * 0.5, y: m.y + (m.secondaryOffsetY || 0) + mOff.y * 0.5 };
            sum += svgPotential(x, y, mP1, mCfg.sigma1 * 0.68, mP2, mCfg.sigma2 * 0.68, mCfg.w2);
          }
          return sum;
        };

    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'route-storm');

    // --- LAYER 1: Color mass (blurred blue→purple→pink) ---
    const mg = document.createElementNS(ns, 'g');
    mg.setAttribute('filter', 'url(#stormBlur)');

    const massBands = [
      { t: 0.04, f: '#162e40', o: 0.12 }, { t: 0.09, f: '#1a3848', o: 0.14 },
      { t: 0.15, f: '#1e4458', o: 0.16 }, { t: 0.22, f: '#264a64', o: 0.18 },
      { t: 0.30, f: '#2e4a72', o: 0.20 }, { t: 0.38, f: '#3e4a7a', o: 0.20 },
      { t: 0.47, f: '#504a82', o: 0.20 }, { t: 0.56, f: '#6a4a80', o: 0.18 },
      { t: 0.65, f: '#7a4a78', o: 0.18 }, { t: 0.74, f: '#9d68a4', o: 0.16 },
      { t: 0.83, f: '#b878b8', o: 0.14 }, { t: 0.90, f: '#da8bda', o: 0.12 },
    ];

    for (const band of massBands) {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', traceContour(mPot, mCentX, mCentY, band.t, wm1, wm2));
      path.setAttribute('fill', band.f);
      path.setAttribute('fill-opacity', band.o);
      path.setAttribute('stroke', 'none');
      mg.appendChild(path);
    }
    g.appendChild(mg);

    // --- LAYER 2: Contour lines (light teal/cyan isobars) ---
    const contourLevels = [
      { t: 0.05, c: '#3a6a68', o: 0.18, w: 0.35 }, { t: 0.10, c: '#3a6a68', o: 0.22, w: 0.38 },
      { t: 0.16, c: '#4a7a78', o: 0.26, w: 0.42 }, { t: 0.23, c: '#4a7a78', o: 0.30, w: 0.45 },
      { t: 0.31, c: '#5a8a88', o: 0.36, w: 0.50 }, { t: 0.40, c: '#6a9a98', o: 0.42, w: 0.55 },
      { t: 0.50, c: '#77bfcf', o: 0.38, w: 0.58 }, { t: 0.60, c: '#77bfcf', o: 0.45, w: 0.62 },
      { t: 0.70, c: '#8ac8d0', o: 0.50, w: 0.68 }, { t: 0.80, c: '#b1c9c3', o: 0.50, w: 0.75 },
      { t: 0.90, c: '#b1c9c3', o: 0.55, w: 0.80 },
    ];

    for (const lev of contourLevels) {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', traceContour(pPot, pCentX, pCentY, lev.t, wp1, wp2));
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', lev.c);
      path.setAttribute('stroke-opacity', lev.o);
      path.setAttribute('stroke-width', lev.w);
      g.appendChild(path);
    }

    svg.appendChild(g);
  }
}

// ============================================================
// v0.0.9.3 — SHORTCUT CURVE PREVIEW + TRAIL
// ============================================================

/** Faint dashed line showing the remaining shortcut curve. */
function renderShortcutPathPreview() {
  const g = document.getElementById('routeShortcutPath');
  if (!g) return;
  g.innerHTML = '';
  const seg = S._transient.currentSegment;
  if (!seg || seg.type !== 'shortcut') return;

  const pts = [];
  for (let t = S.dotT; t <= 1; t += 0.02) pts.push(seg.pathFn(t));
  if (pts.length < 2) return;
  let d = '';
  pts.forEach((p, i) => { d += (i === 0 ? 'M ' : 'L ') + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ' '; });

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#40a4b9');
  path.setAttribute('stroke-opacity', '0.28');
  path.setAttribute('stroke-width', '0.9');
  path.setAttribute('stroke-dasharray', '2.5 3');
  g.appendChild(path);
}

/** Render the trail cells — small fading cyan dots dropped behind
 *  the courier. v0.0.9.6.10.8: fade opacity now FLOORS at the
 *  cell's trample value (×TRAMPLE_VISUAL_SCALE), so worn-in cells
 *  keep a residual dot even after the fade window expires. Fresh
 *  cells still fade to nothing. The persistent-trample layer
 *  (#routeTrample) handles cells the courier hasn't revisited
 *  recently enough to still have an active trail dot. */
function renderTrailCells() {
  const g = document.getElementById('routeTrail');
  if (!g) return;
  g.innerHTML = '';
  const trail = S._transient.trailCells;
  if (!trail || trail.length === 0) return;
  const ns = 'http://www.w3.org/2000/svg';
  for (const tc of trail) {
    const fadeOpacity = Math.max(0, 1 - tc.age / C.TRAIL_FADE_TICKS);
    if (fadeOpacity < 0.03) continue;
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', tc.x);
    c.setAttribute('cy', tc.y);
    c.setAttribute('r', '1.3');
    c.setAttribute('fill', '#77bfcf');
    c.setAttribute('opacity', fadeOpacity.toFixed(3));
    g.appendChild(c);
  }
}

// v0.0.9.6.10.8 — repaint cadence for the trample layer. Trample
// advances at TRAMPLE_PER_STEP (0.005) per courier-tick; visual
// deltas within ~10 ticks are imperceptible. Repainting every
// 10 ticks cuts DOM churn ~10x on heavy saves (hundreds of
// trampled cells) without any visible lag.
const TRAMPLE_REPAINT_INTERVAL = 10;

// v0.0.9.6.10.8 — visual scale for the trample-to-opacity mapping.
// A cell at trample=1 (fully carved) renders at 0.9 opacity; trample
// tiers below scale linearly. 0.9 rather than 1.0 so even a carved
// cell still feels like a worn trace, not a filled dot.
const TRAMPLE_VISUAL_SCALE = 0.9;
// Below this trample value a cell doesn't render at all — avoids a
// layer of near-invisible dots peppered across every cell the
// courier has ever breathed near. TRAMPLE_PER_STEP = 0.005, so
// ~1 visit puts a cell at 0.005 (invisible) and ~4 visits hit 0.02
// (first faint appearance). Matches "walking anywhere leaves a
// path" while still gating away single-step noise.
const TRAMPLE_VISUAL_FLOOR = 0.02;

/** Render the persistent trample layer. Iterates S.interiorTrample
 *  and paints one cyan dot per cell, opacity proportional to trample
 *  value. Cells under TRAMPLE_VISUAL_FLOOR skipped. Same dot size +
 *  color as the live trail so the two layers read as one system. */
function renderTrampleCells() {
  const g = document.getElementById('routeTrample');
  if (!g) return;
  g.innerHTML = '';
  const table = S.interiorTrample;
  if (!table) return;
  const ns = 'http://www.w3.org/2000/svg';
  for (const key in table) {
    const v = table[key];
    if (!v || v < TRAMPLE_VISUAL_FLOOR) continue;
    // Key is "x,y" — parse back out. cellKeyFromCoords produces this
    // exact shape so splitting on comma + number-coerce is safe.
    const ix = key.indexOf(',');
    if (ix <= 0) continue;
    const x = +key.slice(0, ix);
    const y = +key.slice(ix + 1);
    if (!isFinite(x) || !isFinite(y)) continue;
    const opacity = Math.min(TRAMPLE_VISUAL_SCALE, v * TRAMPLE_VISUAL_SCALE);
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', x);
    c.setAttribute('cy', y);
    c.setAttribute('r', '1.3');
    c.setAttribute('fill', '#77bfcf');
    c.setAttribute('opacity', opacity.toFixed(3));
    g.appendChild(c);
  }
}

/**
 * Tick hook — called once per game tick from main.js. Handles trail
 * aging + drop, shortcut preview refresh, and live tooltip refresh.
 */
export function tickRouteInteractions() {
  const seg = S._transient.currentSegment;
  if (!seg) return;
  const trail = S._transient.trailCells;

  // Drop a trail cell only while on a shortcut (interior traversal).
  if (seg.type === 'shortcut' && (S.ticks % C.TRAIL_DROP_EVERY) === 0) {
    const xy = seg.pathFn(S.dotT);
    trail.push({ x: xy.x, y: xy.y, age: 0 });
  }

  // Age all existing cells and purge fully-faded entries.
  if (trail.length > 0) {
    for (const tc of trail) tc.age++;
    while (trail.length > 0 && trail[0].age > C.TRAIL_FADE_TICKS) trail.shift();
    renderTrailCells();
  }

  // v0.0.9.6.10.8 — persistent trample layer refresh. Repaints every
  // TRAMPLE_REPAINT_INTERVAL ticks — not every tick, since trample
  // increments are tiny (0.005/step) and the visual delta between
  // ticks is imperceptible. Limits DOM churn on heavy saves where
  // S.interiorTrample can have hundreds of entries.
  if ((S.ticks % TRAMPLE_REPAINT_INTERVAL) === 0) renderTrampleCells();

  // Keep the shortcut-curve preview in sync while the segment advances.
  if (seg.type === 'shortcut') renderShortcutPathPreview();

  // Live tooltip refresh while a node is hovered.
  if (S._transient.hoveredNodeId) renderRouteTooltip();
}

// ============================================================
// v0.0.9.3 — TOOLTIP + CLICK / HOVER WIRING
// ============================================================

// v0.0.9.6.9.30 — migrated from #routeTooltip to the unified
// rich-tooltip system. Uses placement: 'cursor' so the tooltip
// follows the mouse over node hit-targets, multiline for the
// 220px wrap that the longer comparison body needs. Class names
// re-mapped: tip-label → rich-tip-head, tip-row → rich-tip-line,
// tip-cta → rich-tip-ok, tip-dim → rich-tip-dim.
function renderRouteTooltip() {
  const id = S._transient.hoveredNodeId;
  if (!id) { hideRichTooltip(); return; }

  const node = S.routeNodes.find(n => n.id === id);
  if (!node) { hideRichTooltip(); return; }

  // Find a stable target for showRichTooltip. The route-node-hit
  // SVG element drives the hover; identity-tag by id keeps
  // re-shows in cursor mode position-only (no flicker).
  const svg = els.routeSvg;
  const hit = svg ? svg.querySelector(`.route-node-hit[data-id="${id}"]`) : null;
  if (!hit) { hideRichTooltip(); return; }

  const label = (getNodeStage(id) >= 1 || id === '?') ? nodeGlyph(id) : '?';
  const nameLine = (getNodeStage(id) >= 3)
    ? getDisplayLabel(id)
    : (getNodeStage(id) >= 2) ? 'unconfirmed' : 'unscanned';

  // v0.0.9.6.9.27 — each distance line now appends an ETA at the
  // courier's current speed-mult. Estimate, not promise — terrain /
  // weather changes mid-route invalidate it.
  const adj = adjacencyFromCurrent(id);
  let body;
  if (adj === 'target') {
    const r = liveRingDistance(id);
    body = `<span class="rich-tip-dim">current target · ${toKm(r)} · ${fmtEta(etaSecs(r))} to arrive</span>`;
  } else if (adj === 'adjacent') {
    const r = liveRingDistance(id);
    body = `<span class="rich-tip-dim">adjacent on ring · ${toKm(r)} · ${fmtEta(etaSecs(r))}</span>`;
  } else {
    const r  = liveRingDistance(id);
    const sc = liveShortcutDistance(id);
    const saves = r - sc;
    const savesLine = saves > 0
      ? `<span class="rich-tip-ok">shortcut saves ${toKm(saves)} (${fmtEta(etaSecs(saves))}) · click to cut across</span>`
      : `<span class="rich-tip-dim">shortcut wouldn't save distance</span>`;
    body = `<span class="rich-tip-line">via ring: ${toKm(r)} · ${fmtEta(etaSecs(r))}</span>` +
           `<span class="rich-tip-line">via shortcut: ${toKm(sc)} · ${fmtEta(etaSecs(sc))}</span>` +
           savesLine;
  }

  const html = `<span class="rich-tip-head">${label} · ${nameLine}</span>${body}`;
  const { x, y } = S._transient.hoveredPx;
  showRichTooltip(hit, html, {
    id: 'route',
    placement: 'cursor',
    cursor: { x, y },
    multiline: true,
  });
}

let routeInteractionsBound = false;

/** Attach click + hover handlers once. Called by initSegment() from main. */
export function bindRouteInteractions() {
  if (routeInteractionsBound) return;
  const svg = els.routeSvg;
  if (!svg) return;
  svg.addEventListener('mousemove', (e) => {
    const t = e.target;
    if (t.classList && t.classList.contains('route-node-hit')) {
      S._transient.hoveredNodeId = t.dataset.id;
      S._transient.hoveredPx     = { x: e.clientX, y: e.clientY };
      renderRouteTooltip();
    } else if (S._transient.hoveredNodeId) {
      S._transient.hoveredNodeId = null;
      renderRouteTooltip();
    }
  });
  svg.addEventListener('mouseleave', () => {
    if (S._transient.hoveredNodeId) {
      S._transient.hoveredNodeId = null;
      renderRouteTooltip();
    }
  });
  svg.addEventListener('click', (e) => {
    const t = e.target;
    if (t.classList && t.classList.contains('route-node-hit')) {
      startShortcut(t.dataset.id);
      // Redraw so the new shortcut curve preview shows immediately.
      drawRouteMap();
      updateRouteDot();
    }
  });
  routeInteractionsBound = true;
}
