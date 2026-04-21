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
     PKG_TAG_EFFECTS    — fragile / lightweight / heavy / unwieldy.
                          v0.0.9.6.10.20 rework: tags became label-
                          authored (PKG_LABELS_BY_SIZE entries with a
                          `tags: [...]` field) rather than weighted-
                          rolled at spawn. PKG_TAG_EFFECTS keys each
                          tag to its scripMult/kgDelta/slotDelta.
     PKG_LABELS_BY_SIZE — flat list per size, each label tagged
                          with a `dests:[...]` array and optional
                          `tags:[...]` array. Roller filters by dest
                          inclusion, allowing intermingling (a salvage
                          kit bound for A reads as "A requested salvage
                          from the ruins"); combines label tags into
                          the rolled pkg.
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

// ----- tag effects -----
//
// v0.0.9.6.10.20 shape-rework: modifiers became `tags` authored onto
// each label (see PKG_LABELS_BY_SIZE entries with `tags: [...]`). The
// old weighted-roll PKG_MODIFIERS array became this keyed lookup, which
// the roller consults per-tag to apply effects to the base pkg.
//
// Per tag:
//   scripMult  \u2014 multiplier on base scrip (stacking: additive-excess,
//                  so fragile+heavy = 1 + 0.35 + 0.25 = 1.60)
//   kgDelta    \u2014 'halve' | 'add1to3'. heavy\u2295lightweight never
//                  co-occur at authoring, so at most one kgDelta applies
//   slotDelta  \u2014 integer added to base slots
//   incompat   \u2014 size keys the tag should not be authored onto;
//                  enforced at authoring time, not runtime.
//
// Plain pkgs = no tags (or empty array). pkg.tags ?? [] at read-sites.
// Fragile's damage/breakage mechanic is deferred to its own commit;
// for now fragile still drives scripMult + lost-chance scatter via
// OUTBOUND_LOST_CHANCE in packages.js.
export const PKG_TAG_EFFECTS = {
  fragile:     { scripMult: 1.35 },
  lightweight: { scripMult: 1.20, kgDelta: 'halve',   incompat: ['s'] },
  heavy:       { scripMult: 1.25, kgDelta: 'add1to3' },
  unwieldy:    { scripMult: 1.30, slotDelta: 1 },
};

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
    { label: 'medicine',          dests: ['B','C']             },
    { label: 'sealed letter',     dests: ['A','\u00b7']         },
    { label: 'seeds',             dests: ['B','H','\u00b7']         },
    { label: 'dispatch packet',   dests: ['A']                 },
    { label: 'dried herbs',       dests: ['B','C']             },
    { label: 'flare cartridge',   dests: ['C']                 },
    { label: 'signal mirror',     dests: ['C'], tags: ['fragile'] },
    { label: 'film canister',     dests: ['H'], tags: ['fragile'] },
    { label: 'pressed flowers',   dests: ['H']                      },
    { label: 'beaded bracelet',   dests: ['\u00b7']                 },
    { label: 'carved charm',      dests: ['\u00b7']                 },
    { label: 'knit cap',          dests: ['H']                      },
    { label: 'spare socks',       dests: ['H']                  },
    { label: 'ammo packet',       dests: ['C']                 },
    { label: 'fertilizer packet', dests: ['B']                 },
    { label: 'cuttings',          dests: ['B','H']             },
    { label: 'sealed pouch',      dests: ['\u00b7']             },
    // v0.0.9.4 niche labels — rho (A) depot + tau (H) home identity
    { label: 'dispatch ticket',   dests: ['A']                 },
    { label: 'waybill',           dests: ['A']                 },
    { label: 'family letter',     dests: ['H']                 },
    { label: 'knit gloves',       dests: ['H']                 },
    // phi (?) \u2014 weather instruments
    { label: 'rain gauge',        dests: ['?'], tags: ['fragile'] },
    { label: 'barometer',         dests: ['?'], tags: ['fragile'] },
    { label: 'wind vane',         dests: ['?']                 },
    { label: 'hygrometer',        dests: ['?'], tags: ['fragile'] },
    { label: 'ink for charts',    dests: ['?','H']             },
    // psi (\u00b7) \u2014 scavenger adds on top of migrated orphan labels
    { label: 'pocket cache',      dests: ['\u00b7']                 },
    { label: 'polished scrap',    dests: ['\u00b7']             },
    // xi (C) \u2014 research + ruin salvage
    { label: 'specimen jar',      dests: ['C'], tags: ['fragile'] },
    { label: 'copper coil',       dests: ['C'], tags: ['heavy'] },
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
    { label: 'sun cream vial',        dests: ['\u03bd'], tags: ['fragile']    },
    // -- theta (\u03b8) riverbed / pottery --
    { label: 'pot shard',             dests: ['\u03b8']                       },
    { label: 'glaze sample',          dests: ['\u03b8'], tags: ['fragile']    },
    { label: 'tea leaves',            dests: ['\u03b8','H']                   },
    { label: 'kiln ash',              dests: ['\u03b8']                       },
    { label: 'clay scrap',            dests: ['\u03b8']                       },
    // -- gamma (\u03b3) rocky hillside / workshop --
    { label: 'carabiner',             dests: ['\u03b3','\u03bb']              },
    { label: 'sparkplug',             dests: ['\u03b3','\u03b4']              },
    { label: 'wire nut',              dests: ['\u03b3']                       },
    { label: 'grease jar',            dests: ['\u03b3']                       },
    { label: 'stove cartridge',       dests: ['\u03b3']                       },
    // -- lambda (\u03bb) mountain / climbing --
    { label: 'piton',                 dests: ['\u03bb']                       },
    { label: 'ice screw',             dests: ['\u03bb']                       },
    { label: 'climbing chalk',        dests: ['\u03bb']                       },
    { label: 'summit log',            dests: ['\u03bb']                       },
    { label: 'route card',            dests: ['\u03bb','A']                   },
    // -- pi (\u03c0) summit research / electronics --
    { label: 'capacitor bag',         dests: ['\u03c0'], tags: ['fragile']    },
    { label: 'solder spool',          dests: ['\u03c0','\u03b4']              },
    { label: 'lab notes',             dests: ['\u03c0']                       },
    { label: 'sensor chip',           dests: ['\u03c0'], tags: ['fragile']    },
    { label: 'calibration disc',      dests: ['\u03c0','?'], tags: ['fragile'] },
    // -- delta (\u03b4) dam / electrical --
    { label: 'fuse pack',             dests: ['\u03b4']                       },
    { label: 'seal ring',             dests: ['\u03b4']                       },
    { label: 'gasket',                dests: ['\u03b4','\u03b3']              },
    { label: 'pressure dial',         dests: ['\u03b4','?'], tags: ['fragile'] },
    { label: 'coupling pin',          dests: ['\u03b3']                       },
    // -- iota (B) boost --
    { label: 'growing medium',        dests: ['B']                            },
    { label: 'pollen sample',         dests: ['B'], tags: ['fragile']         },
    { label: 'cutting tray',          dests: ['B','\u03b8']                   },
    { label: 'sapling wrap',          dests: ['B']                            },
    // -- phi (?) boost --
    { label: 'humidity sensor',       dests: ['?'], tags: ['fragile']         },
    { label: 'gauge dial',            dests: ['?'], tags: ['fragile']         },
    // -- plateau-top subset (near-start NPCs only) --
    { label: 'weathered manifest',    dests: ['A']                            },
    { label: 'wind-blown dispatch',   dests: ['A','\u00b7']                   },
    { label: 'sun-bleached relic',    dests: ['\u03bd','A','\u00b7']          },
    { label: 'weathered signal flag', dests: ['\u03bd','A']                   },
    { label: 'trailhead scrap',       dests: ['\u00b7']                       },
    { label: 'wind-whipped charm',    dests: ['\u00b7']                       },
    { label: 'plateau-top trinket',   dests: ['\u00b7']                       },
    { label: 'weathered seed envelope', dests: ['B']                          },
    { label: 'plateau pollen sample', dests: ['B','\u03b8'], tags: ['fragile'] },
    { label: 'sun-baked pot shard',   dests: ['\u03b8']                       },
    { label: 'glaze mineral sample',  dests: ['\u03b8'], tags: ['fragile']    },
    // v0.0.9.6 commit 2: flavored variants + new-cast normalization fill.
    // Generic multi-dest labels (sealed letter, medicine) narrowed to
    // 2-dest niche pairings above; the variants below replace their
    // breadth with character-specific flavor — letters with sender-voice,
    // medicines with terrain-voice. Then unique fill pulls the new cast
    // (pi/lambda/gamma/nu/theta/delta) up to ~32 labels each.
    // -- letter family (ex-"sealed letter") --
    { label: 'weather-report letter', dests: ['?','\u03c0']                   },
    { label: 'glaze recipe letter',   dests: ['\u03b8','\u03b3']              },
    { label: 'expedition letter home',dests: ['\u03bb','H']                   },
    { label: 'dam log letter',        dests: ['\u03b4','A']                   },
    { label: 'pressed-leaf note',     dests: ['B','\u03b8']                   },
    // -- medicine family (ex-"medicine") --
    { label: 'sun salve',             dests: ['\u03bd','\u03bb']              },
    { label: 'bone-mend splint',      dests: ['\u03bb','\u03b3']              },
    { label: 'fever poultice',        dests: ['B','\u03b8']                   },
    // -- pi (\u03c0) fill --
    { label: 'radio crystal',         dests: ['\u03c0'], tags: ['fragile']    },
    { label: 'signal reel',           dests: ['\u03c0','?']                   },
    { label: 'multimeter probe',      dests: ['\u03c0','\u03b3'], tags: ['fragile'] },
    { label: 'ferrite bead',          dests: ['\u03c0']                       },
    { label: 'lab log',               dests: ['\u03c0']                       },
    // -- lambda (\u03bb) fill --
    { label: 'trail marker stake',    dests: ['\u03bb']                       },
    { label: 'belay plate',           dests: ['\u03bb','\u03b3']              },
    { label: 'avalanche beacon',      dests: ['\u03bb'], tags: ['fragile']    },
    // -- gamma (\u03b3) fill --
    { label: 'hex keys',              dests: ['\u03b3']                       },
    { label: 'bearing pack',          dests: ['\u03b3']                       },
    { label: 'copper shim',           dests: ['C']                            },
    // -- nu (\u03bd) fill --
    { label: 'sun-cracked goggles',   dests: ['\u03bd','\u00b7'], tags: ['fragile'] },
    { label: 'gourd stopper',         dests: ['\u03bd','\u03b8']              },
    { label: 'sun charm',             dests: ['\u03bd','\u00b7']              },
    // -- theta (\u03b8) fill --
    { label: 'tea bundle',            dests: ['\u03b8','H']                   },
    { label: 'slip cup',              dests: ['\u03b8']                       },
    { label: 'firing schedule',       dests: ['\u03b8']                       },
    // -- delta (\u03b4) fill --
    { label: 'bypass valve',          dests: ['\u03b4']                       },
    { label: 'sluice pin',            dests: ['\u03b4']                       },
    // v0.0.9.6.10.19 pool-audit — thin-pool evening (C +5, pi +3, nu +2) +
    // flavorful fill (A +2 depot internals, pi +2 electronics lightweight,
    // lambda +2 climbing fragile). Untagged here; tagged in v0.0.9.6.10.20.
    { label: 'dust sample',           dests: ['C'], tags: ['fragile']         },
    { label: 'ruin tag',              dests: ['C']                            },
    { label: 'lens shard',            dests: ['C','\u03c0'], tags: ['fragile'] },
    { label: 'ferrite core',          dests: ['\u03c0'], tags: ['heavy']      },
    { label: 'frost-cracked lens',    dests: ['\u03bb'], tags: ['fragile']    },
    { label: 'oxygen vial',           dests: ['\u03bb'], tags: ['fragile']    },
  ],
  m: [
    { label: 'tool roll',          dests: ['A','\u03b3'], tags: ['lightweight'] },
    { label: 'first-aid kit',      dests: ['A','\u03bb']       },
    { label: 'battery pack',       dests: ['\u03c0','\u03b4'], tags: ['heavy'] },
    { label: 'ration tin',         dests: ['\u03bd','\u03bb']  },
    { label: 'surveyor kit',       dests: ['B']                },
    { label: 'field notes',        dests: ['B','C']            },
    { label: 'water filter',       dests: ['B','C','H']        },
    { label: 'salvage kit',        dests: ['C','A','B']        },
    { label: 'repair kit',         dests: ['\u03b3','\u03b4']  },
    { label: 'rope coil',          dests: ['\u03bb','\u03b3']     },
    { label: 'spare parts',        dests: ['A','\u03b3'], tags: ['fragile'] },
    { label: 'book bundle',        dests: ['H','?']            },
    { label: 'pantry crate',       dests: ['H','\u00b7']            },
    { label: 'linen roll',         dests: ['H','B'], tags: ['lightweight'] },
    { label: 'hearth kit',         dests: ['H','\u00b7']            },
    { label: 'patched coat',       dests: ['\u00b7'], tags: ['lightweight'] },
    { label: 'memory box',         dests: ['H','\u00b7']            },
    { label: 'wrapped offering',   dests: ['\u00b7'], tags: ['lightweight'] },
    // v0.0.9.4 niche labels — rho (A) depot + tau (H) home identity
    { label: 'logbook bundle',     dests: ['A']                },
    { label: 'depot stamp kit',    dests: ['A'], tags: ['fragile'] },
    { label: 'preserves jar',      dests: ['H'], tags: ['fragile'] },
    { label: 'family photos',      dests: ['H']                },
    // phi (?) \u2014 weather work
    { label: 'weather log bundle', dests: ['?']                },
    { label: 'calibration weights',dests: ['?'], tags: ['heavy'] },
    { label: 'storm journal',      dests: ['?']                },
    { label: 'antenna coil',       dests: ['?']                },
    // psi (\u00b7) \u2014 scavenger net-new
    { label: 'rag-tied parcel',    dests: ['\u00b7'], tags: ['lightweight'] },
    // xi (C) \u2014 research + ruin salvage
    { label: 'sealed reports',     dests: ['C']                },
    { label: 'map fragments',      dests: ['C']                },
    { label: 'cracked tile set',   dests: ['C'], tags: ['fragile'] },
    // v0.0.9.5 commit 5 — new-NPC pools + iota/phi boost + plateau-top.
    // -- nu (\u03bd) --
    { label: 'rationed gourd',        dests: ['\u03bd']                       },
    { label: 'filter cartridge',      dests: ['\u03bd'], tags: ['fragile']    },
    { label: 'sun tarp',              dests: ['\u03bd'], tags: ['lightweight'] },
    { label: 'wet cloth roll',        dests: ['\u03bd','H'], tags: ['lightweight'] },
    // -- theta (\u03b8) --
    { label: 'clay bundle',           dests: ['\u03b8']                       },
    { label: 'kiln fuel',             dests: ['\u03b8']                       },
    { label: 'reed mat',              dests: ['\u03b8','B'], tags: ['lightweight'] },
    { label: 'glaze jar',             dests: ['\u03b8'], tags: ['fragile']    },
    { label: 'fired pot',             dests: ['\u03b8','H']                   },
    // -- gamma (\u03b3) --
    { label: 'coil of wire',          dests: ['\u03b3','\u03b4']              },
    { label: 'climbing holds',        dests: ['\u03bb']                       },
    { label: 'forge kit',             dests: ['\u03b3'], tags: ['heavy']      },
    { label: 'bellows patch',         dests: ['\u03b3'], tags: ['lightweight'] },
    // -- lambda (\u03bb) --
    { label: 'crampons',              dests: ['\u03bb']                       },
    { label: 'helmet kit',            dests: ['\u03bb']                       },
    { label: 'signal flare box',      dests: ['\u03bb','?']                   },
    { label: 'summit journal',        dests: ['\u03bb']                       },
    // -- pi (\u03c0) --
    { label: 'oscilloscope probe',    dests: ['\u03c0'], tags: ['fragile']    },
    { label: 'antenna kit',           dests: ['\u03c0','?']                   },
    { label: 'sensor array',          dests: ['\u03c0'], tags: ['fragile']    },
    { label: 'solder kit',            dests: ['\u03c0']                       },
    // -- delta (\u03b4) --
    { label: 'sluice valve',          dests: ['\u03b4'], tags: ['heavy']      },
    { label: 'turbine bearing',       dests: ['\u03b4'], tags: ['fragile','heavy'] },
    { label: 'generator brush',       dests: ['\u03b4'], tags: ['fragile']    },
    { label: 'pressure gauge',        dests: ['\u03b4','?'], tags: ['fragile'] },
    { label: 'penstock bolt',         dests: ['\u03b4','\u03b3']              },
    // -- iota (B) boost --
    { label: 'nursery kit',           dests: ['B']                            },
    { label: 'compost sacks',         dests: ['B']                            },
    { label: 'seedling trays',        dests: ['B']                            },
    { label: 'field soil kit',        dests: ['B']                            },
    // -- phi (?) boost --
    { label: 'barograph',             dests: ['?'], tags: ['fragile']         },
    { label: 'lightning rod kit',     dests: ['?']                            },
    { label: 'cloud log',             dests: ['?']                            },
    // -- plateau-top subset (near-start NPCs) --
    { label: 'abandoned ledger',      dests: ['A']                            },
    { label: 'old route marker',      dests: ['A','\u00b7']                   },
    { label: 'dust-buried cache',     dests: ['\u03bd','\u00b7']              },
    { label: 'sand-scoured satchel',  dests: ['\u03bd','A','\u00b7']          },
    { label: 'mesa-edge cache',       dests: ['\u00b7']                       },
    { label: 'sun-faded field notes', dests: ['B']                            },
    { label: 'wind-blown sapling wrap', dests: ['B','\u03b8']                 },
    { label: 'wind-dried reed bundle', dests: ['\u03b8','B'], tags: ['lightweight'] },
    { label: 'kiln-bound clay slab',  dests: ['\u03b8'], tags: ['heavy']      },
    // v0.0.9.6 commit 2: flavored variants + new-cast normalization fill.
    // -- kit family (ex-"tool roll", "repair kit") --
    { label: 'field toolkit',         dests: ['\u03b3','\u03bb']              },
    { label: 'domestic mend kit',     dests: ['H','\u00b7']                   },
    { label: 'sluice wrench set',     dests: ['\u03b4','\u03b3'], tags: ['heavy'] },
    // -- first-aid family (ex-"first-aid kit") --
    { label: 'blister kit',           dests: ['H']                            },
    { label: 'mountain trauma kit',   dests: ['\u03bb','C']                   },
    { label: 'heat-stroke kit',       dests: ['\u03bd','\u03b4']              },
    // -- battery family (ex-"battery pack") --
    { label: 'observatory cell',      dests: ['\u03c0','C'], tags: ['fragile'] },
    { label: 'generator battery',     dests: ['\u03b4','A'], tags: ['heavy']  },
    // -- ration family (ex-"ration tin") --
    { label: 'desert ration pouch',   dests: ['\u03bd','\u00b7']              },
    { label: 'depot ration box',      dests: ['A','?']                        },
    // -- repair family (ex-"repair kit") --
    { label: 'wood-patch kit',        dests: ['H','B']                        },
    { label: 'cable splice kit',      dests: ['\u03b4','\u03c0']              },
    // -- pi (\u03c0) fill --
    { label: 'scope analyzer',        dests: ['\u03c0']                       },
    { label: 'component tray',        dests: ['\u03c0','\u03b3'], tags: ['fragile'] },
    { label: 'signal processor',      dests: ['\u03c0']                       },
    { label: 'chip catalog',          dests: ['\u03c0','C']                   },
    // -- lambda (\u03bb) fill --
    { label: 'bivvy sack',            dests: ['\u03bb'], tags: ['lightweight'] },
    { label: 'climbing harness',      dests: ['\u03bb']                       },
    { label: 'approach gaiters',      dests: ['\u03bb'], tags: ['lightweight'] },
    { label: 'altimeter',             dests: ['\u03bb','?'], tags: ['fragile'] },
    // -- gamma (\u03b3) fill --
    { label: 'bench vise',            dests: ['\u03b3'], tags: ['heavy']      },
    { label: 'fastener lot',          dests: ['\u03b3']                       },
    { label: 'honing stones',         dests: ['\u03b3'], tags: ['heavy']      },
    // -- nu (\u03bd) fill --
    { label: 'salt-water flask',      dests: ['\u03bd','H'], tags: ['fragile'] },
    { label: 'dust-sealed bundle',    dests: ['\u03bd','?']                   },
    { label: 'shade pole kit',        dests: ['\u03bd']                       },
    // -- theta (\u03b8) fill --
    { label: 'kiln log',              dests: ['\u03b8']                       },
    { label: 'clay-stained rag roll', dests: ['\u03b8','\u00b7'], tags: ['lightweight'] },
    // -- delta (\u03b4) fill --
    { label: 'spillway chart',        dests: ['\u03b4']                       },
    { label: 'maintenance ledger',    dests: ['\u03b4','A']                   },
    // v0.0.9.6.10.19 pool-audit additions (see [s] block for scope).
    { label: 'rubbing kit',           dests: ['C'], tags: ['lightweight']     },
    { label: 'artifact wrap',         dests: ['C'], tags: ['lightweight']     },
    { label: 'power bench kit',       dests: ['\u03c0'], tags: ['heavy']      },
    { label: 'salt jar',              dests: ['\u03bd'], tags: ['fragile']    },
    { label: 'machine bushings',      dests: ['A'], tags: ['fragile']         },
    { label: 'depot timing kit',      dests: ['A'], tags: ['fragile']         },
    { label: 'antistatic wrap',       dests: ['\u03c0'], tags: ['lightweight'] },
  ],
  l: [
    { label: 'parts crate',        dests: ['A','C'], tags: ['heavy'] },
    { label: 'equipment trunk',    dests: ['A'], tags: ['heavy'] },
    { label: 'freight pallet',     dests: ['A']                },
    { label: 'lumber bundle',      dests: ['A','\u03b8'], tags: ['heavy','unwieldy'] },
    { label: 'planting stock',     dests: ['B'], tags: ['unwieldy'] },
    { label: 'irrigation coil',    dests: ['B'], tags: ['unwieldy'] },
    { label: 'reed bundle',        dests: ['B','\u03b8'], tags: ['lightweight','unwieldy'] },
    { label: 'salvage haul',       dests: ['C','A','B'], tags: ['heavy'] },
    { label: 'water drum',         dests: ['B','\u03bd','\u03b4'], tags: ['heavy'] },
    { label: 'fuel canister',      dests: ['C','\u03b4'], tags: ['heavy'] },
    { label: 'scrap bundle',       dests: ['C','A'], tags: ['heavy'] },
    { label: 'generator core',     dests: ['C','\u03b4'], tags: ['heavy'] },
    { label: 'appliance crate',    dests: ['H'], tags: ['heavy'] },
    { label: 'winter kit',         dests: ['H','\u00b7']            },
    { label: 'firewood stack',     dests: ['\u00b7','H'], tags: ['heavy'] },
    { label: 'cache crate',        dests: ['A']                },
    { label: 'relay stockpile',    dests: ['\u00b7']                },
    // v0.0.9.4 niche labels — rho (A) depot + tau (H) home identity
    { label: 'pallet jack wheels', dests: ['A'], tags: ['heavy'] },
    { label: 'heirloom chest',     dests: ['H'], tags: ['fragile'] },
    // phi (?) \u2014 rain-measurement gear
    { label: 'weather balloon',    dests: ['?'], tags: ['unwieldy'] },
    { label: 'tarp roll',          dests: ['?','\u00b7','\u03bd'], tags: ['lightweight','unwieldy'] },
    { label: 'sensor stake set',   dests: ['?']                },
    // psi (\u00b7) \u2014 scavenger
    { label: "forager's bag",      dests: ['\u00b7'], tags: ['lightweight'] },
    // xi (C) \u2014 ruin salvage
    { label: 'salvaged mechanism', dests: ['C']                },
    // v0.0.9.5 commit 5 — new-NPC pools + iota/phi boost.
    // -- nu (\u03bd) --
    { label: 'shade awning',          dests: ['\u03bd'], tags: ['lightweight','unwieldy'] },
    { label: 'purifier coil',         dests: ['\u03bd'], tags: ['heavy']      },
    { label: 'sand ladder',           dests: ['\u03bd','\u03bb'], tags: ['unwieldy'] },
    { label: 'salt block',            dests: ['\u03bd'], tags: ['heavy']      },
    // -- theta (\u03b8) --
    { label: 'clay brick stack',      dests: ['\u03b8'], tags: ['heavy']      },
    { label: 'glaze barrel',          dests: ['\u03b8'], tags: ['heavy']      },
    { label: 'kiln tile set',         dests: ['\u03b8'], tags: ['fragile','heavy'] },
    { label: 'tea crate',             dests: ['\u03b8','H'], tags: ['lightweight'] },
    // -- gamma (\u03b3) --
    { label: 'anvil stand',           dests: ['\u03b3'], tags: ['heavy']      },
    { label: 'gear cache',            dests: ['\u03b3'], tags: ['heavy']      },
    { label: 'forge bellows',         dests: ['\u03b3'], tags: ['unwieldy']   },
    // -- lambda (\u03bb) --
    { label: 'cache pack',            dests: ['\u03bb']                       },
    { label: 'tent kit',              dests: ['\u03bb'], tags: ['unwieldy']   },
    { label: 'expedition rope',       dests: ['\u03bb','\u03b3'], tags: ['unwieldy'] },
    // -- pi (\u03c0) --
    { label: 'antenna segment',       dests: ['\u03c0','?'], tags: ['unwieldy'] },
    { label: 'rack assembly',         dests: ['\u03c0'], tags: ['unwieldy']   },
    { label: 'power coupling',        dests: ['\u03c0','\u03b4'], tags: ['heavy'] },
    // -- delta (\u03b4) --
    { label: 'sluice gate',           dests: ['\u03b4'], tags: ['heavy']      },
    { label: 'turbine housing',       dests: ['\u03b4'], tags: ['heavy']      },
    { label: 'penstock pipe',         dests: ['\u03b4'], tags: ['unwieldy']   },
    // -- iota (B) boost --
    { label: 'greenhouse panel',      dests: ['B'], tags: ['fragile','unwieldy'] },
    { label: 'irrigation pipe',       dests: ['B'], tags: ['unwieldy']        },
    // -- phi (?) boost --
    { label: 'sounder rocket',        dests: ['?']                            },
    { label: 'anemometer tripod',     dests: ['?'], tags: ['unwieldy']        },
    // v0.0.9.6 commit 2: new-cast normalization fill (l tier).
    // -- pi (\u03c0) --
    { label: 'lab bench rig',         dests: ['\u03c0'], tags: ['heavy']      },
    { label: 'repeater stack',        dests: ['\u03c0','?'], tags: ['heavy']  },
    // -- lambda (\u03bb) --
    { label: 'glacier kit',           dests: ['\u03bb']                       },
    { label: 'trailhead cache',       dests: ['\u03bb','A']                   },
    // -- gamma (\u03b3) --
    { label: 'machine oil drum',      dests: ['\u03b3','\u03b4'], tags: ['heavy'] },
    { label: 'mill spindle',          dests: ['\u03b3']                       },
    // -- nu (\u03bd) --
    { label: 'cistern lining',        dests: ['\u03bd','\u03b4'], tags: ['lightweight','unwieldy'] },
    { label: 'sun-whitened tarp',     dests: ['\u03bd','\u00b7'], tags: ['lightweight','unwieldy'] },
    // -- theta (\u03b8) --
    { label: 'reed kiln screen',      dests: ['\u03b8','B'], tags: ['lightweight','unwieldy'] },
    // -- delta (\u03b4) --
    { label: 'spillway grate',        dests: ['\u03b4','\u03b3'], tags: ['heavy'] },
    // v0.0.9.6.10.19 pool-audit additions (see [s] block for scope).
    { label: 'sun umbrella',          dests: ['\u03bd'], tags: ['lightweight','unwieldy'] },
    { label: 'cable spool bundle',    dests: ['\u03c0'], tags: ['lightweight','unwieldy'] },
  ],
  xl: [
    { label: 'reinforced crate',   dests: ['A'], tags: ['heavy','unwieldy'] },
    { label: 'generator frame',    dests: ['A','H'], tags: ['heavy','unwieldy'] },
    { label: 'depot resupply',     dests: ['A','C'], tags: ['heavy'] },
    { label: 'reed-thatch bale',   dests: ['B'], tags: ['lightweight','unwieldy'] },
    { label: 'greenhouse frame',   dests: ['B'], tags: ['fragile','unwieldy'] },
    { label: 'bunker resupply',    dests: ['C'], tags: ['heavy'] },
    { label: 'scrap hoard',        dests: ['C'], tags: ['heavy'] },
    { label: 'relay dish',         dests: ['C','\u00b7'], tags: ['fragile','unwieldy'] },
    { label: 'antenna mast',       dests: ['H','C','?'], tags: ['heavy','unwieldy'] },
    { label: 'prefab panel',       dests: ['H'], tags: ['heavy','unwieldy'] },
    { label: 'household freight',  dests: ['H'], tags: ['heavy'] },
    { label: 'workshop frame',     dests: ['H','A'], tags: ['heavy','unwieldy'] },
    { label: 'shelter frame',      dests: ['\u00b7'], tags: ['unwieldy'] },
    { label: 'forwarded shipment', dests: ['\u00b7']                },
    { label: 'trailside stockpile',dests: ['\u00b7']                },
    // phi (?) \u2014 big weather rigs
    { label: 'anemometer mast',    dests: ['?'], tags: ['fragile','unwieldy'] },
    { label: 'storm shelter frame',dests: ['?'], tags: ['heavy','unwieldy'] },
    // psi (\u00b7)
    { label: 'roped bundle',       dests: ['\u00b7'], tags: ['unwieldy'] },
    // xi (C) \u2014 research archives + oddments
    { label: 'crate of oddments',  dests: ['C']                },
    { label: 'archive crate',      dests: ['C'], tags: ['heavy'] },
    // v0.0.9.5 commit 5 — new-NPC xl pools.
    // -- nu (\u03bd) --
    { label: 'reservoir panel',       dests: ['\u03bd','\u03b4'], tags: ['heavy','unwieldy'] },
    { label: 'water still',           dests: ['\u03bd'], tags: ['unwieldy']   },
    { label: 'large tarp',            dests: ['\u03bd','?'], tags: ['lightweight','unwieldy'] },
    // -- theta (\u03b8) --
    { label: 'kiln brick pallet',     dests: ['\u03b8'], tags: ['heavy','unwieldy'] },
    { label: 'glaze crate',           dests: ['\u03b8'], tags: ['heavy']      },
    // -- gamma (\u03b3) --
    { label: 'forge frame',           dests: ['\u03b3'], tags: ['heavy','unwieldy'] },
    { label: 'lathe bed',             dests: ['\u03b3'], tags: ['heavy']      },
    // -- lambda (\u03bb) --
    { label: 'crampon rack',          dests: ['\u03bb'], tags: ['unwieldy']   },
    { label: 'winter bivvy',          dests: ['\u03bb'], tags: ['lightweight','unwieldy'] },
    // -- pi (\u03c0) --
    { label: 'server rack frame',     dests: ['\u03c0'], tags: ['heavy','unwieldy'] },
    { label: 'dish reflector',        dests: ['\u03c0','?'], tags: ['fragile','unwieldy'] },
    { label: 'battery bank frame',    dests: ['\u03c0','\u03b4'], tags: ['heavy','unwieldy'] },
    // -- delta (\u03b4) --
    { label: 'turbine rotor',         dests: ['\u03b4'], tags: ['heavy']      },
    { label: 'dam gate section',      dests: ['\u03b4'], tags: ['heavy','unwieldy'] },
    { label: 'transformer core',      dests: ['\u03b4'], tags: ['heavy']      },
    // v0.0.9.6 commit 2: new-cast normalization fill (xl tier).
    { label: 'observatory tower frame', dests: ['\u03c0'], tags: ['heavy','unwieldy'] },
    { label: 'basecamp frame',          dests: ['\u03bb','\u03b3'], tags: ['heavy','unwieldy'] },
    { label: 'drill press frame',       dests: ['\u03b3'], tags: ['heavy','unwieldy'] },
    { label: 'clay pit basket',         dests: ['\u03b8','B'], tags: ['heavy'] },
  ],
};

// ----- terrain-origin label pool (v0.0.9.6 commit 2) -----
//
// Cell-native interior pkgs — things *found* on plateau tops, mountain
// slopes, rocky hill scree. Not NPC-dispatched; no courier picked them
// up and dropped them. The narrative is discovery: "you climbed to the
// mesa and pulled this out of a collapsed shelter; it still has a
// destination scribbled on it."
//
// Consumed by commit 5 when interior pkg spawning wires in. For now,
// this table lives as data ready to be called.
//
// Flavor comes from the origin terrain (weathered, frozen, scattered)
// rather than from the dest NPC — so multi-dest is FINE here. The
// dest-weight curve routes the pkg; the origin flavor reads in the
// label regardless of which NPC claims it.
//
// Shape: { [terrain]: { [size]: [{ label, dests }, ...] } }.
// Dest lists keep forward-bias reach so the 12-node ring's dest-weight
// curve always has a valid pick near the cell's origin location.
export const PKG_LABELS_BY_TERRAIN_ORIGIN = {
  plateau: {
    s: [
      { label: 'salvage envelope',      dests: ['A','\u00b7','\u03bd','C']      },
      { label: 'cracked relic',         dests: ['C','\u00b7','\u03b8'], tags: ['fragile'] },
      { label: 'mesa-top trinket',      dests: ['\u00b7','H','B']               },
      { label: 'fossil fragment',       dests: ['C','\u03c0'], tags: ['fragile'] },
      { label: 'weathered dispatch',    dests: ['A','\u00b7']                   },
    ],
    m: [
      { label: 'abandoned satchel',     dests: ['A','\u00b7','\u03bd']          },
      { label: 'dust-choked ledger',    dests: ['A','C','\u00b7']               },
      { label: 'mesa-top kit',          dests: ['\u00b7','H','\u03bd']          },
      { label: 'wind-stripped bag',     dests: ['\u00b7','A','B']               },
      { label: 'plateau-run survey',    dests: ['C','\u03c0']                   },
    ],
    l: [
      { label: 'plateau cache crate',   dests: ['A','\u00b7','C'], tags: ['heavy'] },
      { label: 'sun-weathered trunk',   dests: ['A','\u00b7','H'], tags: ['heavy'] },
      { label: 'mesa-edge bundle',      dests: ['\u00b7','B','\u03b8'], tags: ['unwieldy'] },
      { label: 'collapsed-shelter find',dests: ['C','\u00b7','H']               },
    ],
    xl: [
      { label: 'mesa-top freight',      dests: ['A','C'], tags: ['heavy']       },
      { label: 'plateau cargo hoard',   dests: ['C','\u00b7','A'], tags: ['heavy'] },
      { label: 'ruined-tower cache',    dests: ['C','\u00b7'], tags: ['heavy']  },
    ],
  },
  mountain: {
    s: [
      { label: 'frozen dispatch',       dests: ['\u03bb','A','\u03c0']          },
      { label: 'abandoned beacon',      dests: ['\u03bb','?'], tags: ['fragile'] },
      { label: 'dropped carabiner',     dests: ['\u03b3','\u03bb']              },
      { label: 'altitude-cracked vial', dests: ['B','C','\u03b8'], tags: ['fragile'] },
    ],
    m: [
      { label: 'lost survey pack',      dests: ['\u03bb','C','\u03c0']          },
      { label: "climber's discarded kit", dests: ['\u03bb','\u03b3']            },
      { label: 'frost-brittle bundle',  dests: ['\u03bb','H'], tags: ['fragile'] },
      { label: 'summit castoff',        dests: ['\u03bb','\u03c0','?']          },
    ],
    l: [
      { label: 'expedition wreck cache',dests: ['\u03bb','A','C'], tags: ['heavy'] },
      { label: 'frozen cargo drop',     dests: ['\u03bb','\u03b3'], tags: ['heavy'] },
      { label: 'ice-bound crate',       dests: ['\u03bb','C'], tags: ['heavy']  },
    ],
    xl: [
      { label: 'abandoned ascent rig',  dests: ['\u03bb','\u03b3'], tags: ['heavy','unwieldy'] },
      { label: 'collapsed basecamp crate', dests: ['\u03bb','A'], tags: ['heavy'] },
    ],
  },
  rockyHills: {
    s: [
      { label: 'scattered cargo',       dests: ['A','\u03b3','C']               },
      { label: 'spilled crate shard',   dests: ['\u03b3','B','A']               },
      { label: 'rockfall find',         dests: ['\u03b3','\u00b7']              },
      { label: 'convoy remnant',        dests: ['A','\u03b3','\u03b4']          },
    ],
    m: [
      { label: 'wrecked wagon cache',   dests: ['A','\u03b3','B']               },
      { label: 'tumbled parts bundle',  dests: ['\u03b3','\u03b4','A'], tags: ['heavy'] },
      { label: 'rocky-hills salvage kit', dests: ['\u03b3','C']                 },
      { label: 'scree-bound satchel',   dests: ['\u03b3','\u00b7']              },
    ],
    l: [
      { label: 'overturned freight',    dests: ['A','\u03b3','C'], tags: ['heavy'] },
      { label: 'rocky-draw cargo cache',dests: ['\u03b3','\u03b4','A'], tags: ['heavy'] },
      { label: 'boulder-buried crate',  dests: ['\u03b3','C'], tags: ['heavy']  },
    ],
    xl: [
      { label: 'wreck-site haul',       dests: ['A','\u03b3'], tags: ['heavy']  },
      { label: 'convoy-wreck frame',    dests: ['\u03b3','\u03b4','A'], tags: ['heavy','unwieldy'] },
    ],
  },
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
