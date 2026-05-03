/* ==============================================
   THE LONG HAUL — cargo log item index (v0.0.9.7)

   Builds a unified item-metadata index from the three label
   sources in packages.js. Run once at boot. Read-only after.

   Output shape:
     { [label]: { sizes, dests, tags, sources } }
       sizes    \u2014 array of one or more of 's'|'m'|'l'|'xl'
       dests    \u2014 union of dests across all source rows; may
                  be empty for lost-pool entries (no destination)
       tags     \u2014 union of label tags across all source rows
       sources  \u2014 array of 'main'|'terrain'|'lost' (which
                  tables the label appears in)

   Cross-table dupes (e.g. 'salvage kit' appears in both main
   and lost) merge to one entry with sources: ['main','lost'].
   ============================================== */
'use strict';

import {
  PKG_LABELS_BY_SIZE,
  PKG_LABELS_BY_TERRAIN_ORIGIN,
  PKG_LOST_LABELS,
} from './packages.js?v=097-0-5';

function ensure(idx, label) {
  if (!idx[label]) {
    idx[label] = { sizes: [], dests: [], tags: [], sources: [] };
  }
  return idx[label];
}

function uniqPush(arr, val) {
  if (!arr.includes(val)) arr.push(val);
}

function mergeRow(idx, label, size, dests, tags, source) {
  const e = ensure(idx, label);
  uniqPush(e.sizes, size);
  (dests || []).forEach(d => uniqPush(e.dests, d));
  (tags  || []).forEach(t => uniqPush(e.tags,  t));
  uniqPush(e.sources, source);
}

export function buildCargoIndex() {
  const idx = {};

  // main destination pool
  for (const size of Object.keys(PKG_LABELS_BY_SIZE)) {
    for (const row of PKG_LABELS_BY_SIZE[size]) {
      mergeRow(idx, row.label, size, row.dests, row.tags, 'main');
    }
  }

  // terrain-origin pool (mesa, mountain, rockyHills)
  for (const terrain of Object.keys(PKG_LABELS_BY_TERRAIN_ORIGIN)) {
    const sizes = PKG_LABELS_BY_TERRAIN_ORIGIN[terrain];
    for (const size of Object.keys(sizes)) {
      for (const row of sizes[size]) {
        mergeRow(idx, row.label, size, row.dests, row.tags, 'terrain');
      }
    }
  }

  // lost-pool — no dests, no tags on these entries
  for (const row of PKG_LOST_LABELS) {
    mergeRow(idx, row.label, row.size, [], [], 'lost');
  }

  return idx;
}
