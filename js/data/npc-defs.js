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

   v0.0.9.5 expansion (cast locked 2026-04-17):
     nu     at ν   (NW desert corner — purification plant)
     theta  at θ   (NE riverbed corner — kiln)
     gamma  at γ   (right-rim rocky hillside — workshop)
     lambda at λ   (bottom-rim mountain slope — climbing lodge)
     pi     at π   (SW summit corner — radio tower)
     delta  at δ   (bottom-rim dam engineer — reservoir)

   xi promoted from rim to SE corner (same nodeId 'C').
   Area-name relabels: depot a → depot, depot b → greenhouse,
   ruins → city ruins, waypoint → oasis.

   Commit 1 scope: stubs for new 6 with trustProfile: 'default'.
   Real trust profiles (veteran/artisan/wayfinder/etc.) wire in
   commit 4b. Full dialogue lands in commits 2-3.

   trustProfile selects per-NPC gain logic in
   trust.js::computeTrustGain.

   NPC_ADJACENT lists which stage-0 nodes each NPC
   reveals to stage 1 on t20 trust unlock. phi/xi/psi
   are terminal reveals — by the time their trust
   builds, rho/iota/tau's t20 chains have already
   revealed the full ring. trust.js falls back to ||[]
   so no empty entries needed.

   v0.0.9.5: NPC_ADJACENT extended to chain reveals through
   the 12-node rim. rho reveals the western approach (nu),
   tau reveals the southern approach (pi), and the new
   corner NPCs terminal-reveal to their flanking rim nodes.

   v0.0.7.x-: verbatim extract from main.js (commit 3 / SHA 077f9e8).
   v0.0.8.4: three new NPCs + trustProfile field.
   v0.0.9.5: 12 NPCs total (6 existing relabeled + 6 new stubs).
   ============================================== */
'use strict';

export const NPC_DEFS = {
  // Existing 6 — area-name relabels applied. v0.0.9.5: all shift from
  // default/careful/scavenger to character-expressive profiles.
  'A':        { callsign: 'rho',    name: 'rho',    depotLabel: 'depot',               trustProfile: 'veteran'     },
  'B':        { callsign: 'iota',   name: 'iota',   depotLabel: 'greenhouse',          trustProfile: 'wetland-path'},
  'H':        { callsign: 'tau',    name: 'tau',    depotLabel: 'home',                trustProfile: 'homecoming'  },
  '?':        { callsign: 'phi',    name: 'phi',    depotLabel: 'weather station',     trustProfile: 'stormwise'   },
  'C':        { callsign: 'xi',     name: 'xi',     depotLabel: 'city ruins',          trustProfile: 'archivist'   },
  '\u00b7':   { callsign: 'psi',    name: 'psi',    depotLabel: 'oasis',               trustProfile: 'wayfinder'   },
  // v0.0.9.5 new 6 — dialogue + profiles authored 2026-04-17.
  '\u03bd':   { callsign: 'nu',     name: 'nu',     depotLabel: 'purification plant',  trustProfile: 'guardian'    },
  '\u03b8':   { callsign: 'theta',  name: 'theta',  depotLabel: 'kiln',                trustProfile: 'artisan'     },
  '\u03b3':   { callsign: 'gamma',  name: 'gamma',  depotLabel: 'workshop',            trustProfile: 'debt-easer'  },
  '\u03bb':   { callsign: 'lambda', name: 'lambda', depotLabel: 'climbing lodge',      trustProfile: 'adventurer'  },
  '\u03c0':   { callsign: 'pi',     name: 'pi',     depotLabel: 'radio tower',         trustProfile: 'researcher'  },
  '\u03b4':   { callsign: 'delta',  name: 'delta',  depotLabel: 'reservoir',           trustProfile: 'routine'     },
};

// v0.0.9.5: reveal chain through the 12-node rim. Existing trust
// chains (A reveals ?,·; B reveals ?,C; H reveals C,·) preserved
// so existing saves' unlock state continues to make sense — those
// nodes are still adjacent in the new rim. Extensions below reveal
// into the new-NPC positions as rho/tau/etc. reach t20.
//
// Chain structure (clockwise rim adjacency):
//   rho(A) ↔ nu(ν) ↔ psi(·) ↔ iota(B) ↔ theta(θ) ↔ phi(?) ↔ gamma(γ)
//     ↔ xi(C) ↔ delta(δ) ↔ lambda(λ) ↔ pi(π) ↔ tau(H) ↔ rho(A)
//
// rho (A) now reveals nu — westward first step. tau (H) reveals pi —
// southward first step. B, ?, C preserve their old reveals and gain
// the new adjacent-rim reveals. New NPCs are terminal (no reveals)
// until commits 2-3 wire their outbound chains properly.
export const NPC_ADJACENT = {
  'A':        ['?', '\u00b7', '\u03bd'],  // rho → phi, psi, nu (west)
  'B':        ['?', 'C',      '\u03b8'],  // iota → phi, xi, theta
  'H':        ['C', '\u00b7', '\u03c0'],  // tau → xi, psi, pi (south)
};
