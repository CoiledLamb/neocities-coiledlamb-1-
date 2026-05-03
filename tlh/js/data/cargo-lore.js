/* ==============================================
   THE LONG HAUL — cargo log lore (v0.0.9.7)

   Per-item lore keyed by package label string. Covers labels
   from PKG_LABELS_BY_SIZE, PKG_LABELS_BY_TERRAIN_ORIGIN, and
   PKG_LOST_LABELS (unioned via cargo-index.js).

   Lore reveals on first delivery. Until then the cargo log
   card shows '???' in the lore slot.

   Authoring is incremental — entries appear here over time.
   Items without an entry render their lore as '???' even after
   delivery, until lore lands.
   ============================================== */
'use strict';

export const CARGO_LORE = {
  // 'copper coil':     'Salvaged from old grid towers, still hums faintly when warm.',
  // 'pressed flowers': 'Tucked between pages of a forgotten ledger.',
};
