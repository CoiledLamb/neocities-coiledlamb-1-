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

// HTML-escape a string for safe interpolation into innerHTML / template-literal
// HTML construction. Five-char escape covers the standard XSS surface.
//
// v0.0.9.7.11 — promoted from packages.js (was private to formatPkgTooltipHTML)
// because peer-data render paths in render/network.js and addLog interpolations
// of pkg.label needed the same primitive. Render-site escape is the pattern;
// don't escape at ingestion or you'll double-escape and display literal entities.
export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
