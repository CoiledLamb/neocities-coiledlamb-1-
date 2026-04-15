/* ==============================================
   THE LONG HAUL — tuning constants (v0.0.7.18)

   All const tuning values live here. Balance passes are a single-file
   edit. Import as `import * as C from './constants.js'` and reference
   as `C.TICK_MS`, `C.TRIP_CHANCE_BASE`, etc.

   Excluded (lives elsewhere):
   - NPC_DEFS / NPC_LINES / NPC_ADJACENT — dialogue data, going to js/data/
   - NPC_PKGS / LOST_PKGS / ZONE_TYPES — game data, going to js/data/
   - UPGRADE_DEFS — game data with closures, going to upgrades.js
   - NODE_GLYPHS / STATUS_COLORS — presentation data, staying in main.js for now
   ============================================== */
'use strict';

// ----- world / map -----
export const CELLS_PER_EDGE    = 260;
export const VIEWPORT_CELLS    = 90;
export const COURIER_CELL      = 16;
export const PKG_PICKUP_RANGE  = 8;
export const PKG_MAX_PER_EDGE  = 18;
export const PKG_RESPAWN_TICKS = 500;
export const TOTAL_CELLS       = CELLS_PER_EDGE * 6;
export const KM_PER_EDGE       = 4.2;

// ----- sandalweeds -----
export const SANDAL_CAP_BASE     = 5;
export const SANDAL_CAP_UPGRADED = 25;

// ----- environmental spawn rates (v0.0.7.18) -----
// Centralized from zones.js. Sandalweed is a cross-zone resource with
// design intent ("scarce overall, found mostly near wetlands and shelters")
// that lives above any single zone — pulling rates here makes balance
// passes a one-file edit.
//
// Distribution intent (v0.0.7.18 redistribution):
//   wetlands       — primary source, "the marsh edges" (still rare per-cell)
//   depot_approach — secondary, "tended near shelters"
//   scrub          — trace, occasional spotting
//   road / ruins   — almost never, but plausible
//
// Conservative tuning to avoid trivializing boots — wetlands give a
// noticeable but not overwhelming yield. Watch and retune if needed.
export const SANDAL_RATE_WETLANDS       = 0.006;
export const SANDAL_RATE_DEPOT_APPROACH = 0.003;
export const SANDAL_RATE_SCRUB          = 0.001;
export const SANDAL_RATE_ROAD           = 0.0005;
export const SANDAL_RATE_RUINS          = 0.001;

// Wetland canteen refill (v0.0.7.18). Wired in main's tick: when the
// courier's current cell is a wetland, canteen refills by this much
// per tick. Much weaker than rain (+0.4/tick) so wetlands feel like
// a steady drip, not a faucet — water scarcity stays meaningful.
export const WETLAND_CANTEEN_REFILL = 0.05;

// ----- tick / stamina / trip -----
export const TICK_MS           = 350;
export const STAMINA_DRAIN     = 0.40;
export const BOOT_DRAIN        = 0.12;
export const TRIP_CHANCE_BASE  = 0.006;
export const CATCH_CHANCE_BASE = 0.35;
export const REST_TICKS_MIN    = 43;
export const REST_TICKS_MAX    = 86;

// ----- boots -----
export const BOOT_PRICE = 15;

// ----- trip drops -----
// v0.0.7 commit 6: TRIP_LOST_DROP_CHANCE split into NORMAL/LOST — all cargo
// can now drop on trip, not just lost pkgs.
// v0.0.7.18: tie-down semantics changed — tie-down now absorbs drops too
// (option B). See trip.js maybeTrip() for the new flow.
export const TRIP_DROP_CHANCE_NORMAL = 0.20;
export const TRIP_DROP_CHANCE_LOST   = 0.30;

// ----- recovery cargo (v0.0.7 commit 5) -----
export const RECOVERY_BONUS_MULT    = 1.5;  // scrip multiplier for recovery deliveries
export const RECOVERY_SOFT_CAP      = 3;    // max active recovery cargo in world
export const RECOVERY_POLL_INTERVAL = 85;   // ticks between recovery spawn attempts (~30s)
export const KNOWN_PEERS_CAP        = 10;   // FIFO cap on tracked peer porter IDs

// ----- trust / NPC gains (v0.0.7 commits 4a/4b, realigned in commit A) -----
export const TRUST_THRESHOLDS       = [20, 40, 60, 80];
export const TRUST_GAIN_DELIVERY      = 1;
export const TRUST_GAIN_LOST_DELIVERY = 2;
export const TRUST_GAIN_DISCOVERY     = 3;

// ----- channels / chatter (v0.0.7 commit 4b) -----
export const CHANNELS_DISPLAY_CAP       = 6;
export const CHATTER_INTERVAL_MIN_TICKS = 170;
export const CHATTER_INTERVAL_MAX_TICKS = 345;
export const CHATTER_BASE_CHANCE        = 0.005;

// ----- depot rest (t80 prompt reward) -----
export const DEPOT_REST_BONUS_SCRIP = 10;

// ----- multiplayer -----
export const FEED_URL         = 'https://coiledlamb.tlh-feed.workers.dev';
export const POLL_MS          = 60000;
export const FEED_DISPLAY_CAP = 8;
export const DIST_MILESTONES  = [10, 25, 50, 100, 250, 500, 1000];

// ----- edges with elevated trip risk -----
export const RISKY_EDGE_DEST = new Set(['C', '?']);

// ----- persistence -----
export const SAVE_KEY     = 'tlh-save-v1';
export const SAVE_KEY_V2  = 'tlh-save-v2';
export const SAVE_KEY_V3  = 'tlh-save-v3';
export const SAVE_KEY_V4  = 'tlh-save-v4';
export const SAVE_KEY_V5  = 'tlh-save-v5';
export const SAVE_VERSION = 5;
export const AUTOSAVE_MS  = 30000;
