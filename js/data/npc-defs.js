/* ==============================================
   THE LONG HAUL — NPC definitions + adjacency

   Six depot NPCs (v0.0.8.4 added phi, xi, psi):
     rho  at A   (steady/laconic, default trust)
     iota at B   (young/eager, default trust)
     tau  at H   (warm/observant, default trust)
     phi  at ?   (weather station, forecaster, default trust)
     xi   at C   (researcher in ruins, 'careful' — slow gain
                  on normal pkgs, full on fragile/xl)
     psi  at ·   (orphan-scavenger at waypoint, 'scavenger' —
                  doubles on s pkgs, normal on m, halves on l/xl)

   trustProfile selects per-NPC gain logic in
   trust.js::computeTrustGain.

   NPC_ADJACENT lists which stage-0 nodes each NPC
   reveals to stage 1 on t20 trust unlock. phi/xi/psi
   are terminal reveals — by the time their trust
   builds, rho/iota/tau's t20 chains have already
   revealed the full ring. trust.js falls back to ||[]
   so no empty entries needed.

   v0.0.7.x-: verbatim extract from main.js (commit 3 / SHA 077f9e8).
   v0.0.8.4: three new NPCs + trustProfile field.
   ============================================== */
'use strict';

export const NPC_DEFS = {
  'A':      { callsign: 'rho',  name: 'rho',  depotLabel: 'depot a',         trustProfile: 'default'   },
  'B':      { callsign: 'iota', name: 'iota', depotLabel: 'depot b',         trustProfile: 'default'   },
  'H':      { callsign: 'tau',  name: 'tau',  depotLabel: 'home',            trustProfile: 'default'   },
  '?':      { callsign: 'phi',  name: 'phi',  depotLabel: 'weather station', trustProfile: 'default'   },
  'C':      { callsign: 'xi',   name: 'xi',   depotLabel: 'ruins',           trustProfile: 'careful'   },
  '\u00b7': { callsign: 'psi',  name: 'psi',  depotLabel: 'waypoint',        trustProfile: 'scavenger' },
};

export const NPC_ADJACENT = {
  'A': ['?', '\u00b7'],
  'B': ['?', 'C'],
  'H': ['C', '\u00b7'],
};
