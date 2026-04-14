/* ==============================================
   THE LONG HAUL — terrain zone types

   buildWorld() composes 6 edges of cells from
   weighted picks of these zones. Each zone defines
   visual chars, package/sandalweed spawn rates,
   and behavioral flags (risky, refillsCanteen,
   isDepotApproach).

   Verbatim extract from main.js (commit 3 / SHA 077f9e8).
   ============================================== */
'use strict';

export const ZONE_TYPES = {
  road: {
    weight: 40, width: [12, 22],
    chars: [
      { ch: '-',      cls: 'fc-rn', w: 5 },
      { ch: '.',      cls: 'fc-fl', w: 4 },
      { ch: '_',      cls: 'fc-rn', w: 3 },
      { ch: '\u00b7', cls: 'fc-fl', w: 2 },
    ],
    pkgChance: 0.07, sandalChance: 0.002,
  },
  scrub: {
    weight: 25, width: [8, 16],
    chars: [
      { ch: ',', cls: 'fc-fl', w: 5 },
      { ch: '`', cls: 'fc-fl', w: 4 },
      { ch: "'", cls: 'fc-fl', w: 4 },
      { ch: '.', cls: 'fc-fl', w: 3 },
      { ch: '*', cls: 'fc-sw-plant', w: 1 },
    ],
    pkgChance: 0.08, sandalChance: 0.008,
  },
  wetlands: {
    weight: 12, width: [6, 14],
    chars: [
      { ch: '~', cls: 'fc-sw', w: 8 },
      { ch: '|', cls: 'fc-sg', w: 2 },
      { ch: '~', cls: 'fc-sw', w: 6 },
      { ch: ',', cls: 'fc-fl', w: 1 },
    ],
    pkgChance: 0.04, sandalChance: 0.00, refillsCanteen: true,
  },
  ruins: {
    weight: 15, width: [10, 20],
    chars: [
      { ch: '=', cls: 'fc-rn', w: 4 },
      { ch: '|', cls: 'fc-sg', w: 3 },
      { ch: '_', cls: 'fc-rn', w: 3 },
      { ch: '#', cls: 'fc-rn', w: 1 },
      { ch: '[', cls: 'fc-sg', w: 1 },
      { ch: ']', cls: 'fc-sg', w: 1 },
    ],
    pkgChance: 0.12, sandalChance: 0.002, risky: true,
  },
  depot_approach: {
    weight: 8, width: [6, 10],
    chars: [
      { ch: '.', cls: 'fc-fl', w: 6 },
      { ch: '-', cls: 'fc-rn', w: 3 },
      { ch: ',', cls: 'fc-fl', w: 2 },
    ],
    pkgChance: 0.10, sandalChance: 0.00, isDepotApproach: true,
  },
};
