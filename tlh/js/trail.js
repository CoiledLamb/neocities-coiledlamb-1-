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

import { S } from './state.js?v=096-10-20';
import {
  cellKeyFromCoords,
  TRAMPLE_PER_STEP,
  TRAMPLE_PASS_THRESHOLD,
} from './data/terrain.js?v=096-10-20';

/** Read trample at the snapped cell. Returns 0 for untracked cells
 *  (the sparse table keeps save payloads small — cells with zero
 *  trample don't persist). */
export function trampleAt(x, y) {
  const key = cellKeyFromCoords(x, y);
  return (S.interiorTrample && S.interiorTrample[key]) || 0;
}

/** Milestone thresholds for multiplayer broadcast (v0.0.9.6 commit 7).
 *  Each interior cell broadcasts at most 3 times over its lifetime —
 *  once per threshold crossing — so the activity feed doesn't flood
 *  with per-tick updates. Peers merge-by-max on receive. */
const TRAMPLE_MILESTONES = [0.25, 0.50, 0.85];

/** Bump trample at the snapped cell by `amount` (default =
 *  TRAMPLE_PER_STEP). Clamps to 1.0. Called from main.js every
 *  tick the courier occupies an interior cell. v0.0.9.6 commit 7 —
 *  detects threshold crossings and fires milestone broadcasts so
 *  peer paving becomes visible. */
export function addTrampleAt(x, y, amount) {
  if (!S.interiorTrample) S.interiorTrample = {};
  const key = cellKeyFromCoords(x, y);
  const current = S.interiorTrample[key] || 0;
  const delta   = amount !== undefined ? amount : TRAMPLE_PER_STEP;
  const next    = Math.min(1, current + delta);
  if (next !== current) {
    S.interiorTrample[key] = next;
    // Milestone detection — at most one crossing per step given
    // TRAMPLE_PER_STEP is small vs threshold gaps.
    for (const th of TRAMPLE_MILESTONES) {
      if (current < th && next >= th) {
        import('./multiplayer.js?v=096-10-20').then(m => {
          if (typeof m.broadcastTrampleMilestone === 'function') {
            m.broadcastTrampleMilestone(key, next);
          }
        });
        break;
      }
    }
  }
}

/** Broadcast receiver — called from multiplayer.js on inbound peer
 *  milestone events. Merges by max (takes the higher of local vs peer
 *  value for that cell). When a peer crosses the carved threshold,
 *  posts a channel line "PTR-XXXX paved the slope". */
export function receiveTrampleMilestone(payload) {
  if (!payload || !payload.cellKey) return;
  const value = +payload.value || 0;
  if (value <= 0) return;
  if (!S.interiorTrample) S.interiorTrample = {};
  const current = S.interiorTrample[payload.cellKey] || 0;
  if (value > current) {
    S.interiorTrample[payload.cellKey] = Math.min(1, value);
    // Carved-threshold crossings fire a channel line (peer paved a
    // cell to pass-carve level — meaningful shared event). Lower
    // tiers stay silent to avoid channel spam.
    if (value >= TRAMPLE_PASS_THRESHOLD && current < TRAMPLE_PASS_THRESHOLD) {
      import('./channels.js?v=096-10-20').then(ch => {
        if (typeof ch.postTrampleChannelMsg === 'function') {
          ch.postTrampleChannelMsg(payload.placerId || '');
        }
      });
    }
  }
}

/** True when the cell has crossed the "carved" trample tier. As of
 *  v0.0.9.6.10.6 this no longer has a gameplay effect — mountain
 *  severity continues to scale continuously via reduceMultWithTrample
 *  and never zeroes. Still used as a rendering + multiplayer signal
 *  (peer channel message at threshold crossing, visual tier in
 *  render/route-map.js). */
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
