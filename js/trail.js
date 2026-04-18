/* ==============================================
   THE LONG HAUL — trample / trails (v0.0.9.6 commit 6)

   Per-cell state accumulates as the courier walks the
   same interior cell repeatedly. Trample is a 0..1
   float that reduces terrain penalties continuously
   and at TRAMPLE_PASS_THRESHOLD (0.85) zeros out
   mountain severity — the mountain-pass-carving
   mechanic finally landing.

   Storage: sparse table keyed by cellKey ("x,y") on
   S.interiorTrample. Persisted locally (piggybacks
   save schema v9, no version bump needed — additive
   field).

   Multiplayer sync: NOT in commit 6. Per-tick
   broadcasts would flood the activity feed. Commit 7
   adds milestone broadcasts at threshold crossings
   (0.25 / 0.5 / 0.85) — each cell broadcasts at most
   3 times over its lifetime regardless of tick rate.

   Decay: stubbed. Real decay curves revisit v0.0.9.9+
   once trample has been playable long enough to read
   feel (plan).

   Exports:
     trampleAt(x, y)       — read snapped cell's value
     addTrampleAt(x, y, n) — bump trample, clamp at 1
     isPassCarved(x, y)    — trample >= threshold
     trampleTier(value)    — rendering tier helper
   ============================================== */
'use strict';

import { S } from './state.js';
import {
  cellKeyFromCoords,
  TRAMPLE_PER_STEP,
  TRAMPLE_PASS_THRESHOLD,
} from './data/terrain.js';

/** Read trample at the snapped cell. Returns 0 for untracked cells
 *  (the sparse table keeps save payloads small — cells with zero
 *  trample don't persist). */
export function trampleAt(x, y) {
  const key = cellKeyFromCoords(x, y);
  return (S.interiorTrample && S.interiorTrample[key]) || 0;
}

/** Bump trample at the snapped cell by `amount` (default =
 *  TRAMPLE_PER_STEP). Clamps to 1.0. Called from main.js every
 *  tick the courier occupies an interior cell. */
export function addTrampleAt(x, y, amount) {
  if (!S.interiorTrample) S.interiorTrample = {};
  const key = cellKeyFromCoords(x, y);
  const current = S.interiorTrample[key] || 0;
  const delta   = amount !== undefined ? amount : TRAMPLE_PER_STEP;
  const next    = Math.min(1, current + delta);
  if (next !== current) {
    S.interiorTrample[key] = next;
  }
}

/** True when the cell has been paved enough to bypass severity.
 *  Used by trip.js to zero out severe-trip rolls on carved
 *  mountain cells. */
export function isPassCarved(x, y) {
  return trampleAt(x, y) >= TRAMPLE_PASS_THRESHOLD;
}

/** Classify trample into a visual tier for rendering. Fresh
 *  (0..0.25) keeps the base terrain glyph; walked/paved/carved
 *  get progressively brighter overlays. Rendering uses the
 *  tier name to pick glyph + color. */
export function trampleTier(value) {
  if (value >= TRAMPLE_PASS_THRESHOLD) return 'carved';
  if (value >= 0.50) return 'paved';
  if (value >= 0.25) return 'walked';
  return 'fresh';
}
