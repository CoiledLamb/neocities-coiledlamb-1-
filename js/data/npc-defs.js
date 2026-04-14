/* ==============================================
   THE LONG HAUL — NPC definitions + adjacency

   Three depot NPCs:
     rho  at A (steady/laconic)
     iota at B (young/eager)
     tau  at H (warm/observant)

   NPC_ADJACENT lists which stage-0 nodes each NPC
   reveals to stage 1 on t20 trust unlock.

   Verbatim extract from main.js (commit 3 / SHA 077f9e8).
   ============================================== */
'use strict';

export const NPC_DEFS = {
  'A': { callsign: 'rho',  name: 'rho',  depotLabel: 'depot a' },
  'B': { callsign: 'iota', name: 'iota', depotLabel: 'depot b' },
  'H': { callsign: 'tau',  name: 'tau',  depotLabel: 'home'    },
};

export const NPC_ADJACENT = {
  'A': ['?', '\u00b7'],
  'B': ['?', 'C'],
  'H': ['C', '\u00b7'],
};
