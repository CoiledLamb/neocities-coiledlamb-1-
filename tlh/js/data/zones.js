/* ==============================================
   THE LONG HAUL — terrain zone types

   buildWorld() composes 6 edges of cells from
   weighted picks of these zones. Each zone defines
   visual chars, package/sandalweed spawn rates,
   and behavioral flags (risky, refillsCanteen,
   isDepotApproach).

   sandalChance values pulled from constants.js as of
   v0.0.7.18 — sandalweed is a cross-zone resource
   whose tuning belongs above any single zone def.

   refillsCanteen on wetlands is now actually wired
   (v0.0.7.18). World.js stamps a wetland flag on the
   cell at gen time; main.js tick reads it.
   ============================================== */
'use strict';

import * as C from '../constants.js?v=097-0-2';

export const ZONE_TYPES = {
  road: {
    weight: 40, width: [12, 22],
    chars: [
      { ch: '-',      cls: 'fc-rn', w: 5 },
      { ch: '.',      cls: 'fc-fl', w: 4 },
      { ch: '_',      cls: 'fc-rn', w: 3 },
      { ch: '\u00b7', cls: 'fc-fl', w: 2 },
    ],
    pkgChance: 0.07, sandalChance: C.SANDAL_RATE_ROAD,
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
    pkgChance: 0.08, sandalChance: C.SANDAL_RATE_SCRUB,
  },
  wetlands: {
    weight: 12, width: [6, 14],
    chars: [
      { ch: '~', cls: 'fc-sw', w: 8 },
      { ch: '|', cls: 'fc-sg', w: 2 },
      { ch: '~', cls: 'fc-sw', w: 6 },
      { ch: ',', cls: 'fc-fl', w: 1 },
    ],
    pkgChance: 0.04, sandalChance: C.SANDAL_RATE_WETLANDS, refillsCanteen: true,
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
    pkgChance: 0.12, sandalChance: C.SANDAL_RATE_RUINS, risky: true,
  },
  depot_approach: {
    weight: 8, width: [6, 10],
    chars: [
      { ch: '.', cls: 'fc-fl', w: 6 },
      { ch: '-', cls: 'fc-rn', w: 3 },
      { ch: ',', cls: 'fc-fl', w: 2 },
    ],
    pkgChance: 0.10, sandalChance: C.SANDAL_RATE_DEPOT_APPROACH, isDepotApproach: true,
  },
};
