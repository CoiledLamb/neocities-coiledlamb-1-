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

// v0.0.9.6.10.17 — per-NPC trustProfile field removed. Profile
// system shelved after sim data (v0.0.9.6.10.11-13) showed high
// run-to-run variance, several profiles whose trigger conditions
// rarely fired (wayfinder, stormwise), and ~2-2.5h in-game
// completion-time drag vs a flat-base comparison. Keeping the
// profile-less authorial identity per-NPC (callsign + depotLabel +
// trust-tier dialogue) while trust gain returns to pure base from
// computeTrustGain. Reinstating a profile system later would only
// need a new field here + a dispatch path in trust.js.
export const NPC_DEFS = {
  'A':        { callsign: 'rho',    name: 'rho',    depotLabel: 'depot'               },
  'B':        { callsign: 'iota',   name: 'iota',   depotLabel: 'greenhouse'          },
  'H':        { callsign: 'tau',    name: 'tau',    depotLabel: 'home'                },
  '?':        { callsign: 'phi',    name: 'phi',    depotLabel: 'weather station'     },
  'C':        { callsign: 'xi',     name: 'xi',     depotLabel: 'city ruins'          },
  '\u00b7':   { callsign: 'psi',    name: 'psi',    depotLabel: 'oasis'               },
  '\u03bd':   { callsign: 'nu',     name: 'nu',     depotLabel: 'treatment plant'     },
  '\u03b8':   { callsign: 'theta',  name: 'theta',  depotLabel: 'kiln'                },
  '\u03b3':   { callsign: 'gamma',  name: 'gamma',  depotLabel: 'workshop'            },
  '\u03bb':   { callsign: 'lambda', name: 'lambda', depotLabel: 'lodge'               },
  '\u03c0':   { callsign: 'pi',     name: 'pi',     depotLabel: 'radio tower'         },
  '\u03b4':   { callsign: 'delta',  name: 'delta',  depotLabel: 'reservoir'           },
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

// v0.0.9.6.10.3 — canonical NPC display order for user-facing menus.
// Starts at tau (player's home — dotT 0 of edge 10, first NPC visited)
// then follows the clockwise ring traversal back to pi. Consumed by
// the upgrades shop (data/upgrades.js array order mirrors this) and
// the settlements panel (render/settlements.js sorts by this).
// The ring-index order in state.js::routeNodes is unchanged — that's
// the adjacency source used by route-map.js. Display order is a
// separate concern that lives here.
export const NPC_VISIT_ORDER = [
  'H',        // tau    — home (player start)
  'A',        // rho    — left-rim-T (boot depot)
  '\u03bd',   // nu     — NW corner (treatment plant)
  '\u00b7',   // psi    — top-rim-L (oasis)
  'B',        // iota   — top-rim-R (greenhouse)
  '\u03b8',   // theta  — NE corner (kiln)
  '?',        // phi    — right-rim-T (weather station)
  '\u03b3',   // gamma  — right-rim-B (workshop)
  'C',        // xi     — SE corner (city ruins)
  '\u03b4',   // delta  — bottom-rim-R (reservoir)
  '\u03bb',   // lambda — bottom-rim-L (lodge)
  '\u03c0',   // pi     — SW corner (radio tower)
];
