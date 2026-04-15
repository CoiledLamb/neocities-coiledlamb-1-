/* ==============================================
   THE LONG HAUL — package data (v0.0.8.1 rework)

   Previous shape (v0.0.7 and earlier): two flat tables
   NPC_PKGS (6 entries) + LOST_PKGS (3 entries). World
   rolled from one or the other and that was the whole
   pool. Players exhausted visible content quickly.

   New shape: composable.
     PKG_BASES          — size \u2192 slot/kg/scrip floor
     PKG_SIZE_WEIGHTS   — spawn weight per size
     PKG_SIZE_WEIGHTS_RISKY — bumped xl chance on risky cells
     PKG_MODIFIERS      — fragile / lightweight / heavy / unwieldy
                          plus a dominant `null` (no modifier)
     PKG_LABELS_BY_SIZE — flat list per size, each label tagged
                          with a `dests:[...]` array. Roller filters
                          by dest inclusion, allowing intermingling
                          (a salvage kit bound for A reads as "A
                          requested salvage from the ruins").
     PKG_LOST_LABELS    — 12 evocative fallback labels. Reserved
                          for recovery pipeline ambient fallback
                          (commit 2+). Inactive in v0.0.8.1.

   The roller `rollPkg(destId, cellRisky, forceLost)` lives in
   js/packages.js alongside the pickup/delivery pipeline — data
   stays here, logic stays there.

   Note on `?` (waystone) identity: the NPC there is an orphan
   living alone. Labels split between practical supplies the
   orphan needs and small trinkets travelers traditionally leave
   at waystones. If the trust patch reshapes `?`, these can shift.
   ============================================== */
'use strict';

// ----- size bases -----
export const PKG_BASES = {
  s:  { slots: 1, kg: 1, scrip: 10  },
  m:  { slots: 2, kg: 2, scrip: 20  },
  l:  { slots: 4, kg: 4, scrip: 45  },
  xl: { slots: 8, kg: 8, scrip: 120 },
};

// Normal spawn weights per size. XL is very rare baseline; risky cells
// (edges leading to C / \u00b7) swap to the RISKY weights which bump xl
// chance \u22486x. Keeps early-route A\u2192?\u2192B xl-free and makes the remote
// stretches feel like where the big hauls live.
export const PKG_SIZE_WEIGHTS       = { s: 40, m: 30, l: 20, xl: 1 };
export const PKG_SIZE_WEIGHTS_RISKY = { s: 35, m: 28, l: 22, xl: 6 };

// ----- modifiers -----
//
// `weight` drives the weighted roll. `null` dominates so ~70% of pkgs
// land plain. Fields applied to the rolled base:
//   scripMult  \u2014 multiplier on base scrip
//   kgDelta    \u2014 'halve' | 'add1to3'
//   slotDelta  \u2014 integer added to base slots
//   incompat   \u2014 size keys this modifier CANNOT apply to
//
// Effects are inert in v0.0.8.1. Fragile damage branch, HUD badge,
// and the cargoStraps compensating upgrade land in v0.0.8.2.
export const PKG_MODIFIERS = [
  { id: null,          weight: 70 },
  { id: 'fragile',     weight: 6,  scripMult: 1.35 },
  { id: 'lightweight', weight: 5,  scripMult: 1.20, kgDelta: 'halve',   incompat: ['s'] },
  { id: 'heavy',       weight: 5,  scripMult: 1.25, kgDelta: 'add1to3' },
  { id: 'unwieldy',    weight: 4,  scripMult: 1.30, slotDelta: 1 },
];

// Scrip multiplier for ambient isLost pkgs (15% world-spawn roll today;
// all lost spawning in commit 2+). Peer-recovered cargo uses
// C.RECOVERY_BONUS_MULT in recovery.js \u2014 separate knob.
export const PKG_LOST_SCRIP_MULT = 1.5;

// ----- label pool -----
//
// Flat list per size. Each entry: { label, dests: [destId, ...] }.
// The roller filters by `dests.includes(destId)` at spawn time.
//
// Multi-dest labels are the intermingling mechanism: a "salvage kit"
// bound for A reads as "A needed salvage from the ruins"; bound for B
// reads as "B needed salvage for repairs". One label, different stories.
//
// Destination identities (informal):
//   A  rho   \u2014 starting depot, pragmatic logistics
//   B  iota  \u2014 wetlands-adjacent, growing / field work
//   C        \u2014 remote / risky outpost, salvage / survival
//   H  tau   \u2014 home, domestic / warm
//   ?        \u2014 waystone with an orphan living alone
//   \u00b7        \u2014 marginal dead-drop / relay stop
export const PKG_LABELS_BY_SIZE = {
  s: [
    { label: 'medicine',          dests: ['A','B','C','H','?']     },
    { label: 'sealed letter',     dests: ['A','B','C','H','?','\u00b7'] },
    { label: 'seeds',             dests: ['B','H','?']             },
    { label: 'dispatch packet',   dests: ['A','\u00b7']                 },
    { label: 'dried herbs',       dests: ['B','?','H']             },
    { label: 'flare cartridge',   dests: ['C']                     },
    { label: 'signal mirror',     dests: ['C']                     },
    { label: 'film canister',     dests: ['H','?']                 },
    { label: 'pressed flowers',   dests: ['H','?']                 },
    { label: 'beaded bracelet',   dests: ['?']                     },
    { label: 'carved charm',      dests: ['?']                     },
    { label: 'knit cap',          dests: ['?','H']                 },
    { label: 'spare socks',       dests: ['?','H','C']             },
    { label: 'ammo packet',       dests: ['C']                     },
    { label: 'fertilizer packet', dests: ['B']                     },
    { label: 'cuttings',          dests: ['B','H']                 },
    { label: 'sealed pouch',      dests: ['\u00b7','C']                 },
  ],
  m: [
    { label: 'tool roll',         dests: ['A','B','C','H']   },
    { label: 'first-aid kit',     dests: ['A','C','H','?']   },
    { label: 'battery pack',      dests: ['A','C','H']       },
    { label: 'ration tin',        dests: ['A','C','H','?']   },
    { label: 'surveyor kit',      dests: ['B']               },
    { label: 'field notes',       dests: ['B','\u00b7']           },
    { label: 'water filter',      dests: ['B','C','H']       },
    { label: 'salvage kit',       dests: ['C','A','B']       },
    { label: 'repair kit',        dests: ['A','C','H']       },
    { label: 'rope coil',         dests: ['B','C','H']       },
    { label: 'spare parts',       dests: ['A','C','H']       },
    { label: 'book bundle',       dests: ['H','?']           },
    { label: 'pantry crate',      dests: ['H','?']           },
    { label: 'linen roll',        dests: ['H','B']           },
    { label: 'hearth kit',        dests: ['H','?']           },
    { label: 'patched coat',      dests: ['?','C']           },
    { label: 'memory box',        dests: ['H','?']           },
    { label: 'wrapped offering',  dests: ['?']               },
  ],
  l: [
    { label: 'parts crate',       dests: ['A','C']       },
    { label: 'equipment trunk',   dests: ['A']           },
    { label: 'freight pallet',    dests: ['A','\u00b7']       },
    { label: 'lumber bundle',     dests: ['A','H','C']   },
    { label: 'planting stock',    dests: ['B']           },
    { label: 'irrigation coil',   dests: ['B']           },
    { label: 'reed bundle',       dests: ['B','H']       },
    { label: 'salvage haul',      dests: ['C','A','B']   },
    { label: 'water drum',        dests: ['B','C','H']   },
    { label: 'fuel canister',     dests: ['C','H']       },
    { label: 'scrap bundle',      dests: ['C','A']       },
    { label: 'generator core',    dests: ['H','C']       },
    { label: 'appliance crate',   dests: ['H']           },
    { label: 'winter kit',        dests: ['H','?']       },
    { label: 'firewood stack',    dests: ['?','H']       },
    { label: 'cache crate',       dests: ['\u00b7','A']       },
    { label: 'relay stockpile',   dests: ['\u00b7','C']       },
  ],
  xl: [
    { label: 'reinforced crate',   dests: ['A']       },
    { label: 'generator frame',    dests: ['A','H']   },
    { label: 'depot resupply',     dests: ['A','C']   },
    { label: 'reed-thatch bale',   dests: ['B']       },
    { label: 'greenhouse frame',   dests: ['B']       },
    { label: 'bunker resupply',    dests: ['C']       },
    { label: 'scrap hoard',        dests: ['C']       },
    { label: 'relay dish',         dests: ['C','\u00b7']   },
    { label: 'antenna mast',       dests: ['H','C']   },
    { label: 'prefab panel',       dests: ['H','B']   },
    { label: 'household freight',  dests: ['H']       },
    { label: 'workshop frame',     dests: ['H','A']   },
    { label: 'shelter frame',      dests: ['?']       },
    { label: 'forwarded shipment', dests: ['\u00b7']       },
    { label: 'trailside stockpile',dests: ['\u00b7']       },
  ],
};

// ----- lost fallback pool -----
//
// Evocative "someone else lost this" labels. In v0.0.8.1 these are
// inactive \u2014 ambient isLost pkgs still draw from the destination pool
// above (the isLost flag + visual badge carry the "lost" narrative).
//
// Reserved for v0.0.8.2+ recovery pipeline inversion: when the
// recovery system fires with no peer drops available, it'll pick
// from this pool for the ambient spawn. Peer-recovered cargo
// preserves the original porter's pkg verbatim \u2014 never touches this.
//
// `size` tags the intended slot; 11 of 12 are small because orphaned
// items are usually small/personal.
export const PKG_LOST_LABELS = [
  { label: 'worn journal',         size: 's' },
  { label: 'old photo',            size: 's' },
  { label: 'salvage kit',          size: 'm' },
  { label: 'cracked lens',         size: 's' },
  { label: 'water-stained ledger', size: 'm' },
  { label: 'stray satchel',        size: 'm' },
  { label: 'half-burned letter',   size: 's' },
  { label: 'weathered map',        size: 's' },
  { label: 'tin of keepsakes',     size: 's' },
  { label: 'lost sandal',          size: 's' },
  { label: 'field notebook',       size: 's' },
  { label: 'sealed envelope',      size: 's' },
];
