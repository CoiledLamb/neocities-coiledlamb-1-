/* ==============================================
   THE LONG HAUL — plant definitions (v0.0.9.7 stub)

   Plants land mechanically in v0.0.9.8 (the kitchen). This
   file exists in v0.0.9.7 as the shape contract so cargo log
   can render plant cards (all '???') and persistence has a
   stable schema slot.

   Per entry:
     name         display string
     biome        list of terrain ids where it grows
     lore         1-2 line vignette, revealed on first found
     trigger      cooking trigger this plant supplies
     conditional  effect modifier in conditional role

   Reveal flags (per-save): triggerRevealed and conditional-
   Revealed are independently flipped by the cooking system
   based on the plant's role in the cooked dish — see
   TLH-1.0.md cargo-log section for the full contract.
   ============================================== */
'use strict';

export const PLANTS = {
  // sunflower: {
  //   name:        'sunflower',
  //   biome:       ['desert'],
  //   lore:        '...',
  //   trigger:     'heat',
  //   conditional: '+stamina',
  // },
};
