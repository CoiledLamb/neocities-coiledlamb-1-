/* ==============================================
   THE LONG HAUL — shared utilities

   Tiny helpers that don't have a natural home in any
   single module. Currently just pickRandom — split out
   to kill the duplicate that lived in both channels.js
   and recovery.js (handoff bug list item 2).

   Add things here only when they're truly cross-module
   primitives. If a helper's only used by one neighbor,
   keep it in that neighbor.
   ============================================== */
'use strict';

export function pickRandom(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}
