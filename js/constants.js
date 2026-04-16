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

// Wetland canteen refill (v0.0.7.18, wired v0.0.7.19 commit 2b). When
// the courier's current cell is a wetland, canteen refills by this much
// per tick. Much weaker than rain (+0.4/tick) so wetlands feel like
// a steady drip, not a faucet — water scarcity stays meaningful.
export const WETLAND_CANTEEN_REFILL = 0.05;

// ----- weather / storms (v0.0.8 rework) -----
// Replaces the old rain on/off boolean with spatial storm objects.
// Storms are dual-gaussian potential fields on the 6-edge ring.
// Intensity is spatial (distance from center), not a whole-storm
// property: outer edge = drizzle, mid = rain, core = downpour.

// Storm spawn scheduling (dry period between storms)
export const STORM_DRY_MIN_TICKS       = 200;
export const STORM_DRY_MAX_TICKS       = 800;

// Intensity zone radii (cells from storm center).
// weatherAtCourier() returns intensity based on which zone the
// courier falls in. Zones are ring-distance from the primary center.
export const STORM_ZONE_DOWNPOUR       = 60;   // within this = downpour
export const STORM_ZONE_RAIN           = 120;  // within this = rain
export const STORM_ZONE_DRIZZLE        = 200;  // within this = drizzle
// Beyond STORM_ZONE_DRIZZLE = clear.

// Storm lifecycle — per-tick probabilities for the storm as a whole.
// The storm spawns, lives, and eventually dissipates. While alive its
// spatial zones are always present — no temporal intensity state.
export const STORM_DISSIPATE_CHANCE    = 0.003; // per-tick chance storm dies
export const STORM_MIN_AGE_TICKS      = 60;    // no dissipation before this (~21s)

// Storm types — speed is edgeT per tick (courier base is 0.006).
// weight = relative spawn probability. radius is the STORM_ZONE_DRIZZLE
// value used for this type (overrides the default above).
export const STORM_TYPES = {
  squall: { speed: 0.008, radius: 150,  sigma1: 22, sigma2: 14, w2: 0.5, weight: 40 },
  front:  { speed: 0.004, radius: 220,  sigma1: 32, sigma2: 20, w2: 0.6, weight: 45 },
  deluge: { speed: 0.002, radius: 180,  sigma1: 28, sigma2: 16, w2: 0.7, weight: 15 },
};

// Wetland spawn bias: probability of forcing storm onto a wetland edge
export const STORM_WETLAND_BIAS        = 0.40;

// Canteen refill rates per tick by intensity zone
export const CANTEEN_DRIZZLE           = 0.20;
export const CANTEEN_RAIN              = 0.40;
export const CANTEEN_DOWNPOUR          = 0.60;
// Burst when courier first enters any storm zone
export const CANTEEN_STORM_BURST       = 30;

// Trip chance multipliers by intensity (multiplicative)
export const TRIP_MULT_DRIZZLE         = 1.10;
export const TRIP_MULT_RAIN            = 1.25;
export const TRIP_MULT_DOWNPOUR        = 1.50;

// Encumbrance trip multiplier: at 100% weight load, trip chance *= this.
// Scales linearly from 1.0 (empty) to this value (full weight).
export const TRIP_ENCUMBRANCE_MAX_MULT = 1.40;

// Pickup range reduction during downpour (cells subtracted, floor 2)
export const DOWNPOUR_RANGE_PENALTY    = 4;

// NPC warning: speak when storm will reach courier within this many ticks
export const STORM_INCOMING_WARN_TICKS = 30;

// Rain overlay spans by intensity
export const RAIN_SPANS_DRIZZLE        = 8;
export const RAIN_SPANS_RAIN           = 18;
export const RAIN_SPANS_DOWNPOUR       = 30;

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

// ----- multiplayer rate limiting (v0.0.7.21) -----
// KV free-tier is 1000 puts/day. Client-side rate limiting stops a single
// active porter from blowing the whole cap and 500ing every other porter
// downstream. Worker already returns 429 with Retry-After (deployed at
// worker v0.0.7.1); this is the game-side complement.
// - POST_MIN_INTERVAL_MS: minimum wall time between any two fetch-POSTs.
// - MILESTONE_COALESCE_MS: milestones that land within this window after
//   a previous milestone are batched into one event with a values[] array.
// - THROTTLE_COOLDOWN_MS: fallback cooldown when 429 comes back without a
//   usable Retry-After header.
export const POST_MIN_INTERVAL_MS  = 5000;
export const MILESTONE_COALESCE_MS = 1500;
export const THROTTLE_COOLDOWN_MS  = 60000;

// ----- sticky gun (v0.0.7.21) -----
// Pickup range while gun is equipped + ammo loaded. Ammo refills on H arrival.
// Gun occupies one cargo slot unless holstered. See js/packages.js for the
// effectiveMaxSlots accounting.
export const STICKY_GUN_RANGE       = 16;
export const STICKY_GUN_AMMO_MAX    = 8;

// ----- terrain scanner T1 (v0.0.7.21) -----
// T1 only for this patch. Framework (level field, manualCooldown persistence)
// is forward-compatible for T2/T3 in v0.0.7.23.
// Auto pings fire every SCANNER_AUTO_INTERVAL_TICKS while equipped; each
// grants a buff lasting SCANNER_BUFF_DURATION_TICKS ticks.
// Manual ping (player-triggered) uses the longer MANUAL buff but has a
// SCANNER_MANUAL_COOLDOWN_TICKS gate so it can't be spammed.
// Buff multiplies tripChance() by SCANNER_BUFF_MAGNITUDE when active.
export const SCANNER_AUTO_INTERVAL_TICKS  = 86;   // ~30s at 350ms/tick
export const SCANNER_BUFF_DURATION_TICKS  = 17;   // ~6s
export const SCANNER_MANUAL_BUFF_TICKS    = 34;   // ~12s
export const SCANNER_MANUAL_COOLDOWN_TICKS = 86;  // ~30s
export const SCANNER_BUFF_MAGNITUDE       = 0.5;  // trip chance ×0.5 while buffed

// ----- battery (v0.0.7.28 prototype drain) -----
// Time-only drain for now — no gadget-use cost, no regen. Just enough
// for the kit-row battery animation to move through thresholds during
// a session. At 0.03/tick on a 350ms tick, full drain ≈ 19.4 min.
// Full mechanic (per-device drain + regen + upgrade) lands with a
// schema v6→v7 bump in a later patch.
export const BATTERY_DRAIN_PER_TICK = 0.03;

// ----- admin (v0.0.7.21) -----
// SHA-256 (hex) of the admin token. Admin is OFF when null. To enable:
//   1. Open devtools console on the live site.
//   2. Run:  await window._tlhAdminHash('your-token-here')
//   3. Paste the returned hex here and redeploy.
//   4. Visit with  #admin=your-token-here
// The plaintext token lives only in your memory/URL bar; only the hash
// ships in source (and on Neocities). Any devtools-enabled player can
// still call admin functions directly — this gate stops casual
// URL-guessing + repo-scraping, not a determined inspector.
export const ADMIN_TOKEN_SHA = 'e1115c32991e23b06c78bf498d33b51da89da69fbcd2e8b1989c4a4fabaa0805';

// ----- persistence -----
export const SAVE_KEY     = 'tlh-save-v1';
export const SAVE_KEY_V2  = 'tlh-save-v2';
export const SAVE_KEY_V3  = 'tlh-save-v3';
export const SAVE_KEY_V4  = 'tlh-save-v4';
export const SAVE_KEY_V5  = 'tlh-save-v5';
export const SAVE_KEY_V6  = 'tlh-save-v6';
export const SAVE_KEY_V7  = 'tlh-save-v7';
export const SAVE_VERSION = 7;
export const AUTOSAVE_MS  = 30000;

// ----- edges with elevated trip risk -----
export const RISKY_EDGE_DEST = new Set(['C', '?']);
