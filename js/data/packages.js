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

   v0.0.8.4 identity pass: the orphan-at-waystone framing moved off
   `?` when the trust patch settled three new NPCs:
     - `?`  phi — a weather station / forecaster outpost. Labels:
       rain gauges, barometers, storm journals, antennas. Fresh pool.
     - `C`  xi  — reserved researcher living in the ruins; light
       scavenging angle. Research (specimen jars, field notes, map
       fragments) + ruin salvage (copper coil, cracked tiles).
     - `\u00b7`  psi — orphan-scavenger at the waypoint. Inherits the
       personal / fragile-gift pool that used to live at `?` (pressed
       flowers, beaded bracelet, carved charm, hearth kit, etc.).
   Multi-dest labels intermingle — most generic supplies still ship
   to any destination; only the personality-flavored labels narrow
   to 1\u20132 dests.
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
// Destination identities (informal, v0.0.8.4):
//   A  rho   \u2014 starting depot, pragmatic logistics
//   B  iota  \u2014 wetlands-adjacent, growing / field work
//   C  xi    \u2014 researcher in the ruins; specimens, reports, salvage
//   H  tau   \u2014 home, domestic / warm
//   ?  phi   \u2014 weather station; instruments, logs, antennas
//   \u00b7  psi   \u2014 orphan-scavenger at the waypoint; personal gifts,
//              pressed/carved trinkets, practical orphan supplies
export const PKG_LABELS_BY_SIZE = {
  s: [
    { label: 'medicine',          dests: ['A','B','C','H','\u00b7'] },
    { label: 'sealed letter',     dests: ['A','B','C','H','?','\u00b7'] },
    { label: 'seeds',             dests: ['B','H','\u00b7']         },
    { label: 'dispatch packet',   dests: ['A','\u00b7']             },
    { label: 'dried herbs',       dests: ['B','C','H']         },
    { label: 'flare cartridge',   dests: ['C']                 },
    { label: 'signal mirror',     dests: ['C']                 },
    { label: 'film canister',     dests: ['H','C']             },
    { label: 'pressed flowers',   dests: ['H','\u00b7']             },
    { label: 'beaded bracelet',   dests: ['\u00b7']                 },
    { label: 'carved charm',      dests: ['\u00b7']                 },
    { label: 'knit cap',          dests: ['\u00b7','H']             },
    { label: 'spare socks',       dests: ['\u00b7','H','C']         },
    { label: 'ammo packet',       dests: ['C']                 },
    { label: 'fertilizer packet', dests: ['B']                 },
    { label: 'cuttings',          dests: ['B','H']             },
    { label: 'sealed pouch',      dests: ['\u00b7','C']             },
    // v0.0.9.4 niche labels — rho (A) depot + tau (H) home identity
    { label: 'dispatch ticket',   dests: ['A']                 },
    { label: 'waybill',           dests: ['A']                 },
    { label: 'family letter',     dests: ['H']                 },
    { label: 'knit gloves',       dests: ['H']                 },
    // phi (?) \u2014 weather instruments
    { label: 'rain gauge',        dests: ['?']                 },
    { label: 'barometer',         dests: ['?']                 },
    { label: 'wind vane',         dests: ['?']                 },
    { label: 'hygrometer',        dests: ['?']                 },
    { label: 'ink for charts',    dests: ['?','H']             },
    // psi (\u00b7) \u2014 scavenger adds on top of migrated orphan labels
    { label: 'pocket cache',      dests: ['\u00b7']                 },
    { label: 'polished scrap',    dests: ['\u00b7','C']             },
    // xi (C) \u2014 research + ruin salvage
    { label: 'specimen jar',      dests: ['C']                 },
    { label: 'copper coil',       dests: ['C']                 },
    // v0.0.9.5 commit 5: fresh pools for the 6 new NPCs + boost for
    // sparse existing pools (iota B, phi ?) + plateau-top subset
    // (dests restricted to near-start NPCs: rho A, iota B, tau H,
    // psi \u00b7, nu \u03bd, theta \u03b8). v0.0.9.6 plateau-top spawn
    // rule filters against the near-start dest set.
    // -- nu (\u03bd) desert / water-survival --
    { label: 'salt tabs',             dests: ['\u03bd']                       },
    { label: 'sand goggles',          dests: ['\u03bd']                       },
    { label: 'dust mask',             dests: ['\u03bd']                       },
    { label: 'waterskin',             dests: ['\u03bd','H']                   },
    { label: 'sun cream vial',        dests: ['\u03bd']                       },
    // -- theta (\u03b8) riverbed / pottery --
    { label: 'pot shard',             dests: ['\u03b8']                       },
    { label: 'glaze sample',          dests: ['\u03b8']                       },
    { label: 'tea leaves',            dests: ['\u03b8','H']                   },
    { label: 'kiln ash',              dests: ['\u03b8']                       },
    { label: 'clay scrap',            dests: ['\u03b8']                       },
    // -- gamma (\u03b3) rocky hillside / workshop --
    { label: 'carabiner',             dests: ['\u03b3','\u03bb']              },
    { label: 'sparkplug',             dests: ['\u03b3','\u03b4']              },
    { label: 'wire nut',              dests: ['\u03b3','\u03b4']              },
    { label: 'grease jar',            dests: ['\u03b3']                       },
    { label: 'stove cartridge',       dests: ['\u03b3']                       },
    // -- lambda (\u03bb) mountain / climbing --
    { label: 'piton',                 dests: ['\u03bb']                       },
    { label: 'ice screw',             dests: ['\u03bb']                       },
    { label: 'climbing chalk',        dests: ['\u03bb']                       },
    { label: 'summit log',            dests: ['\u03bb']                       },
    { label: 'route card',            dests: ['\u03bb','A']                   },
    // -- pi (\u03c0) summit research / electronics --
    { label: 'capacitor bag',         dests: ['\u03c0']                       },
    { label: 'solder spool',          dests: ['\u03c0','\u03b4']              },
    { label: 'lab notes',             dests: ['\u03c0','C']                   },
    { label: 'sensor chip',           dests: ['\u03c0']                       },
    { label: 'calibration disc',      dests: ['\u03c0','?']                   },
    // -- delta (\u03b4) dam / electrical --
    { label: 'fuse pack',             dests: ['\u03b4','C']                   },
    { label: 'seal ring',             dests: ['\u03b4']                       },
    { label: 'gasket',                dests: ['\u03b4','\u03b3']              },
    { label: 'pressure dial',         dests: ['\u03b4','?']                   },
    { label: 'coupling pin',          dests: ['\u03b4','\u03b3']              },
    // -- iota (B) boost --
    { label: 'growing medium',        dests: ['B']                            },
    { label: 'pollen sample',         dests: ['B']                            },
    { label: 'cutting tray',          dests: ['B','H']                        },
    { label: 'sapling wrap',          dests: ['B']                            },
    // -- phi (?) boost --
    { label: 'humidity sensor',       dests: ['?']                            },
    { label: 'gauge dial',            dests: ['?']                            },
    // -- plateau-top subset (near-start NPCs only) --
    { label: 'weathered manifest',    dests: ['A']                            },
    { label: 'wind-blown dispatch',   dests: ['A','\u00b7']                   },
    { label: 'sun-bleached relic',    dests: ['\u03bd','A','\u00b7']          },
    { label: 'weathered signal flag', dests: ['\u03bd','A']                   },
    { label: 'trailhead scrap',       dests: ['\u00b7']                       },
    { label: 'wind-whipped charm',    dests: ['\u00b7']                       },
    { label: 'plateau-top trinket',   dests: ['\u00b7','B']                   },
    { label: 'weathered seed envelope', dests: ['B']                          },
    { label: 'plateau pollen sample', dests: ['B','\u03b8']                   },
    { label: 'sun-baked pot shard',   dests: ['\u03b8']                       },
    { label: 'glaze mineral sample',  dests: ['\u03b8']                       },
  ],
  m: [
    { label: 'tool roll',          dests: ['A','B','C','H']    },
    { label: 'first-aid kit',      dests: ['A','C','H','?']    },
    { label: 'battery pack',       dests: ['A','C','H','?']    },
    { label: 'ration tin',         dests: ['A','C','H','\u00b7']    },
    { label: 'surveyor kit',       dests: ['B']                },
    { label: 'field notes',        dests: ['B','C','\u00b7']        },
    { label: 'water filter',       dests: ['B','C','H']        },
    { label: 'salvage kit',        dests: ['C','A','B']        },
    { label: 'repair kit',         dests: ['A','C','H','?']    },
    { label: 'rope coil',          dests: ['B','C','H']        },
    { label: 'spare parts',        dests: ['A','C','H']        },
    { label: 'book bundle',        dests: ['H','?','\u00b7']        },
    { label: 'pantry crate',       dests: ['H','\u00b7']            },
    { label: 'linen roll',         dests: ['H','B']            },
    { label: 'hearth kit',         dests: ['H','\u00b7']            },
    { label: 'patched coat',       dests: ['\u00b7','C']            },
    { label: 'memory box',         dests: ['H','\u00b7']            },
    { label: 'wrapped offering',   dests: ['\u00b7']                },
    // v0.0.9.4 niche labels — rho (A) depot + tau (H) home identity
    { label: 'logbook bundle',     dests: ['A']                },
    { label: 'depot stamp kit',    dests: ['A']                },
    { label: 'preserves jar',      dests: ['H']                },
    { label: 'family photos',      dests: ['H']                },
    // phi (?) \u2014 weather work
    { label: 'weather log bundle', dests: ['?']                },
    { label: 'calibration weights',dests: ['?','C']            },
    { label: 'storm journal',      dests: ['?']                },
    { label: 'antenna coil',       dests: ['?','C']            },
    // psi (\u00b7) \u2014 scavenger net-new
    { label: 'rag-tied parcel',    dests: ['\u00b7']                },
    // xi (C) \u2014 research + ruin salvage
    { label: 'sealed reports',     dests: ['C','H']            },
    { label: 'map fragments',      dests: ['C']                },
    { label: 'cracked tile set',   dests: ['C']                },
    // v0.0.9.5 commit 5 — new-NPC pools + iota/phi boost + plateau-top.
    // -- nu (\u03bd) --
    { label: 'rationed gourd',        dests: ['\u03bd']                       },
    { label: 'filter cartridge',      dests: ['\u03bd']                       },
    { label: 'sun tarp',              dests: ['\u03bd']                       },
    { label: 'wet cloth roll',        dests: ['\u03bd','H']                   },
    // -- theta (\u03b8) --
    { label: 'clay bundle',           dests: ['\u03b8']                       },
    { label: 'kiln fuel',             dests: ['\u03b8']                       },
    { label: 'reed mat',              dests: ['\u03b8','B']                   },
    { label: 'glaze jar',             dests: ['\u03b8']                       },
    { label: 'fired pot',             dests: ['\u03b8','H']                   },
    // -- gamma (\u03b3) --
    { label: 'coil of wire',          dests: ['\u03b3','\u03b4']              },
    { label: 'climbing holds',        dests: ['\u03b3','\u03bb']              },
    { label: 'forge kit',             dests: ['\u03b3']                       },
    { label: 'bellows patch',         dests: ['\u03b3']                       },
    // -- lambda (\u03bb) --
    { label: 'crampons',              dests: ['\u03bb']                       },
    { label: 'helmet kit',            dests: ['\u03bb']                       },
    { label: 'signal flare box',      dests: ['\u03bb','?']                   },
    { label: 'summit journal',        dests: ['\u03bb']                       },
    // -- pi (\u03c0) --
    { label: 'oscilloscope probe',    dests: ['\u03c0']                       },
    { label: 'antenna kit',           dests: ['\u03c0','?']                   },
    { label: 'sensor array',          dests: ['\u03c0']                       },
    { label: 'solder kit',            dests: ['\u03c0']                       },
    // -- delta (\u03b4) --
    { label: 'sluice valve',          dests: ['\u03b4']                       },
    { label: 'turbine bearing',       dests: ['\u03b4']                       },
    { label: 'generator brush',       dests: ['\u03b4']                       },
    { label: 'pressure gauge',        dests: ['\u03b4','?']                   },
    { label: 'penstock bolt',         dests: ['\u03b4','\u03b3']              },
    // -- iota (B) boost --
    { label: 'nursery kit',           dests: ['B']                            },
    { label: 'compost sacks',         dests: ['B']                            },
    { label: 'seedling trays',        dests: ['B']                            },
    { label: 'field soil kit',        dests: ['B','C']                        },
    // -- phi (?) boost --
    { label: 'barograph',             dests: ['?']                            },
    { label: 'lightning rod kit',     dests: ['?']                            },
    { label: 'cloud log',             dests: ['?']                            },
    // -- plateau-top subset (near-start NPCs) --
    { label: 'abandoned ledger',      dests: ['A']                            },
    { label: 'old route marker',      dests: ['A','\u00b7']                   },
    { label: 'dust-buried cache',     dests: ['\u03bd','\u00b7']              },
    { label: 'sand-scoured satchel',  dests: ['\u03bd','A','\u00b7']          },
    { label: 'mesa-edge cache',       dests: ['\u00b7','B']                   },
    { label: 'sun-faded field notes', dests: ['B']                            },
    { label: 'wind-blown sapling wrap', dests: ['B','\u03b8']                 },
    { label: 'wind-dried reed bundle', dests: ['\u03b8','B']                  },
    { label: 'kiln-bound clay slab',  dests: ['\u03b8']                       },
  ],
  l: [
    { label: 'parts crate',        dests: ['A','C']            },
    { label: 'equipment trunk',    dests: ['A']                },
    { label: 'freight pallet',     dests: ['A','\u00b7']            },
    { label: 'lumber bundle',      dests: ['A','H','C']        },
    { label: 'planting stock',     dests: ['B']                },
    { label: 'irrigation coil',    dests: ['B']                },
    { label: 'reed bundle',        dests: ['B','H']            },
    { label: 'salvage haul',       dests: ['C','A','B']        },
    { label: 'water drum',         dests: ['B','C','H']        },
    { label: 'fuel canister',      dests: ['C','H']            },
    { label: 'scrap bundle',       dests: ['C','A']            },
    { label: 'generator core',     dests: ['H','C']            },
    { label: 'appliance crate',    dests: ['H']                },
    { label: 'winter kit',         dests: ['H','\u00b7']            },
    { label: 'firewood stack',     dests: ['\u00b7','H']            },
    { label: 'cache crate',        dests: ['\u00b7','A']            },
    { label: 'relay stockpile',    dests: ['\u00b7','C']            },
    // v0.0.9.4 niche labels — rho (A) depot + tau (H) home identity
    { label: 'pallet jack wheels', dests: ['A']                },
    { label: 'heirloom chest',     dests: ['H']                },
    // phi (?) \u2014 rain-measurement gear
    { label: 'weather balloon',    dests: ['?']                },
    { label: 'tarp roll',          dests: ['?','\u00b7','H']        },
    { label: 'sensor stake set',   dests: ['?','C']            },
    // psi (\u00b7) \u2014 scavenger
    { label: "forager's bag",      dests: ['\u00b7']                },
    // xi (C) \u2014 ruin salvage
    { label: 'salvaged mechanism', dests: ['C']                },
    // v0.0.9.5 commit 5 — new-NPC pools + iota/phi boost.
    // -- nu (\u03bd) --
    { label: 'shade awning',          dests: ['\u03bd']                       },
    { label: 'purifier coil',         dests: ['\u03bd','C']                   },
    { label: 'sand ladder',           dests: ['\u03bd','\u03bb']              },
    { label: 'salt block',            dests: ['\u03bd']                       },
    // -- theta (\u03b8) --
    { label: 'clay brick stack',      dests: ['\u03b8']                       },
    { label: 'glaze barrel',          dests: ['\u03b8']                       },
    { label: 'kiln tile set',         dests: ['\u03b8']                       },
    { label: 'tea crate',             dests: ['\u03b8','H']                   },
    // -- gamma (\u03b3) --
    { label: 'anvil stand',           dests: ['\u03b3']                       },
    { label: 'gear cache',            dests: ['\u03b3','C']                   },
    { label: 'forge bellows',         dests: ['\u03b3']                       },
    // -- lambda (\u03bb) --
    { label: 'cache pack',            dests: ['\u03bb']                       },
    { label: 'tent kit',              dests: ['\u03bb']                       },
    { label: 'expedition rope',       dests: ['\u03bb','\u03b3']              },
    // -- pi (\u03c0) --
    { label: 'antenna segment',       dests: ['\u03c0','?']                   },
    { label: 'rack assembly',         dests: ['\u03c0']                       },
    { label: 'power coupling',        dests: ['\u03c0','\u03b4']              },
    // -- delta (\u03b4) --
    { label: 'sluice gate',           dests: ['\u03b4']                       },
    { label: 'turbine housing',       dests: ['\u03b4']                       },
    { label: 'penstock pipe',         dests: ['\u03b4']                       },
    // -- iota (B) boost --
    { label: 'greenhouse panel',      dests: ['B']                            },
    { label: 'irrigation pipe',       dests: ['B']                            },
    // -- phi (?) boost --
    { label: 'sounder rocket',        dests: ['?']                            },
    { label: 'anemometer tripod',     dests: ['?']                            },
  ],
  xl: [
    { label: 'reinforced crate',   dests: ['A']                },
    { label: 'generator frame',    dests: ['A','H']            },
    { label: 'depot resupply',     dests: ['A','C']            },
    { label: 'reed-thatch bale',   dests: ['B']                },
    { label: 'greenhouse frame',   dests: ['B']                },
    { label: 'bunker resupply',    dests: ['C']                },
    { label: 'scrap hoard',        dests: ['C']                },
    { label: 'relay dish',         dests: ['C','\u00b7']            },
    { label: 'antenna mast',       dests: ['H','C','?']        },
    { label: 'prefab panel',       dests: ['H','B']            },
    { label: 'household freight',  dests: ['H']                },
    { label: 'workshop frame',     dests: ['H','A']            },
    { label: 'shelter frame',      dests: ['\u00b7']                },
    { label: 'forwarded shipment', dests: ['\u00b7']                },
    { label: 'trailside stockpile',dests: ['\u00b7']                },
    // phi (?) \u2014 big weather rigs
    { label: 'anemometer mast',    dests: ['?']                },
    { label: 'storm shelter frame',dests: ['?']                },
    // psi (\u00b7)
    { label: 'roped bundle',       dests: ['\u00b7']                },
    // xi (C) \u2014 research archives + oddments
    { label: 'crate of oddments',  dests: ['C']                },
    { label: 'archive crate',      dests: ['C','H']            },
    // v0.0.9.5 commit 5 — new-NPC xl pools.
    // -- nu (\u03bd) --
    { label: 'reservoir panel',       dests: ['\u03bd','\u03b4']              },
    { label: 'water still',           dests: ['\u03bd']                       },
    { label: 'large tarp',            dests: ['\u03bd','?']                   },
    // -- theta (\u03b8) --
    { label: 'kiln brick pallet',     dests: ['\u03b8']                       },
    { label: 'glaze crate',           dests: ['\u03b8']                       },
    // -- gamma (\u03b3) --
    { label: 'forge frame',           dests: ['\u03b3']                       },
    { label: 'lathe bed',             dests: ['\u03b3']                       },
    // -- lambda (\u03bb) --
    { label: 'crampon rack',          dests: ['\u03bb']                       },
    { label: 'winter bivvy',          dests: ['\u03bb']                       },
    // -- pi (\u03c0) --
    { label: 'server rack frame',     dests: ['\u03c0']                       },
    { label: 'dish reflector',        dests: ['\u03c0','?']                   },
    { label: 'battery bank frame',    dests: ['\u03c0','\u03b4']              },
    // -- delta (\u03b4) --
    { label: 'turbine rotor',         dests: ['\u03b4']                       },
    { label: 'dam gate section',      dests: ['\u03b4']                       },
    { label: 'transformer core',      dests: ['\u03b4']                       },
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
