/* segment.js — extracted from render/route-map.js (v0.0.9.7.12)

   Read-side accessors for the courier's current segment. Lives outside
   render/ because position-state queries shouldn't pull in SVG render
   code; non-render callers (trip, world, packages, main) read through
   here instead of through render/route-map.js.

   The segment object itself (S._transient.currentSegment) is built and
   mutated by render/route-map.js — that file owns the SVG-coord-aware
   builders (makeRingSegment / makeShortcutSegment / makeRiverDriftSegment)
   and the state mutators (initSegment / advanceSegmentAfterArrival /
   beginRiverDrift / startShortcut). This module exports only readers.

   Coord note: pathFn(t) returns route-map viewBox coords. terrainAt /
   mesaOutcropAt accept those coords directly — the render-viewBox
   doubles as canonical world position for terrain queries.

   Imports:
     S — game state (state.js)
     terrainAt, mesaOutcropAt — data/terrain.js
*/
'use strict';

import { S } from './state.js?v=097-0-13';
import { terrainAt, mesaOutcropAt } from './data/terrain.js?v=097-0-13';

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
