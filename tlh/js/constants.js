/* ==============================================
   THE LONG HAUL — tuning constants (v0.0.7.18)

   All const tuning values live here. Balance passes are a single-file
   edit. Import as `import * as C from './constants.js?v=096-10-18'` and reference
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

// v0.0.9.6.9.30l — smoke-sandalweed (replaces manual rest button).
// Consumes one stash sandalweed for a timed trip-chance mitigation.
// Magnitude: 25% flat cut (beats the 20% boot/stamina passive grace
// max, since smoke has a resource cost). Duration: 60 ticks (~21s
// at 350ms/tick) — enough to ride out a storm crossing or a mesa
// descent without turning one sandalweed into a big payoff. Re-
// smoking during an active window refreshes the duration; magnitude
// never stacks.
export const SMOKE_GRACE_TICKS     = 60;
export const SMOKE_GRACE_MAGNITUDE = 0.25;

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

// Storm spawn scheduling (dry period between storms).
// v0.0.9.6 commit 7 — halved from 200/800 per user direction
// (canteen balance depends on storm prevalence).
export const STORM_DRY_MIN_TICKS       = 100;
export const STORM_DRY_MAX_TICKS       = 400;

// v0.0.9.6 commit 7 — cap on concurrent active storms. Prevents
// visual clutter + keeps overlap math tractable.
export const MAX_CONCURRENT_STORMS     = 4;

// v0.0.9.6 commit 7 — 50/50 ring/interior spawn mix. When rolling
// a storm location, this fraction spawns on the ring (with its
// wetland bias applied); the rest land in the interior polygon.
export const STORM_INTERIOR_SPAWN_PCT  = 0.50;

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
// v0.0.9.6.9.28 — lifespan bumped so storms live long enough to actually
// encounter the courier given ring travel speeds. Old values produced
// ~137s expected life; new values produce ~230s so a storm reliably
// covers more than one ring edge over its life.
export const STORM_DISSIPATE_CHANCE    = 0.0018; // per-tick chance storm dies (was 0.003)
export const STORM_MIN_AGE_TICKS      = 120;    // no dissipation before this (was 60)

// Storm types.
// weight      = relative spawn probability
// sigma1/2    = cell-space gaussian widths (legacy; used for ring-
//               potential fallback math)
// w2          = secondary center weight in dual-gaussian
// speedSvg    = v0.0.9.6 commit 7 — SVG-units per tick for the new
//               unified (x,y,dx,dy) storm motion model. Derived from
//               ~110-unit avg ring edge × old speed value.
// sigmaSvg1/2 = v0.0.9.6 commit 7 — gaussian widths in SVG-space for
//               the new spatial potential field (stormPotentialAt).
// radiusSvg   = v0.0.9.6 commit 7 — effective outer radius (where
//               gear wear accelerator + combine-intersect detection
//               consider a point to be "inside the storm").
// v0.0.9.6.9.28 — radii + sigmas bumped ~30% so storms cover a more
// meaningful slice of the map at any instant.
// v0.0.9.6.9.29 — further +25% bump so the 4-storm cap reliably
// produces meaningful map coverage. Pairs with the climate-pole
// system (below) so the extra coverage lands in the right places
// instead of uniformly enlarging every storm across the map.
export const STORM_TYPES = {
  squall: { weight: 40, sigma1: 36, sigma2: 22, w2: 0.5, speedSvg: 0.90, sigmaSvg1: 21, sigmaSvg2: 13, radiusSvg: 60 },
  front:  { weight: 45, sigma1: 52, sigma2: 32, w2: 0.6, speedSvg: 0.45, sigmaSvg1: 31, sigmaSvg2: 20, radiusSvg: 82 },
  deluge: { weight: 15, sigma1: 45, sigma2: 26, w2: 0.7, speedSvg: 0.22, sigmaSvg1: 27, sigmaSvg2: 16, radiusSvg: 72 },
};

// Wetland spawn bias: probability of forcing storm onto a wetland edge
export const STORM_WETLAND_BIAS        = 0.40;

// v0.0.9.6.9.28 — soft-merge tunables. Two storms entering
// STORM_MERGE_THRESHOLD overlapPct get tagged `mergingWith` each
// other and drift toward their weighted midpoint at
// STORM_MERGE_ATTRACT svg/tick (Fujiwhara-style attraction). When
// center-to-center distance drops below STORM_MERGE_FINALIZE × the
// smaller radius, the pair collapses into a single promoted storm
// whose dissipate chance is permanently multiplied by
// STORM_MERGED_BONUS (slower fade — weather systems stick around).
export const STORM_MERGE_THRESHOLD     = 0.40;
export const STORM_MERGE_ATTRACT       = 0.08;
export const STORM_MERGE_FINALIZE      = 0.40;
export const STORM_MERGED_BONUS        = 0.70;

// v0.0.9.6.9.28 — succession: when a storm dissipates naturally, a
// small chance of spawning a fresh storm nearby after a short delay.
// Turns a single storm.ended into a regional front rather than a
// blink-out. Never fires on interior-immune boundaries; never forces
// the seed onto the ring or the courier.
export const STORM_SUCCESSION_CHANCE   = 0.25;
export const STORM_SUCCESSION_RADIUS   = 150;   // SVG units from dead storm's last pos
export const STORM_SUCCESSION_DELAY    = 40;    // ticks before the seed spawns

// v0.0.9.6.9.29 — climate poles. Each entry exerts an attractive
// (pull > 0) or repulsive (pull < 0) gaussian influence on storms,
// affecting spawn probability, per-tick drift, and dissipation.
// Range is the SVG-units scale at which the influence falls off.
// The set below mirrors biome geography: ruined corner + wetland +
// mountains pull storms in; desert pushes them out.
//   ruins (xi)          SE corner plateau
//   wetland (iota B)    top-right greenhouse biome
//   pi + lambda         mountain peaks along the bottom rim
//   desert (nu)         NW corner purification plant / dry biome
export const CLIMATE_POLES = [
  { x: 308, y: 308, pull:  1.20, range: 85, label: 'ruins'   },
  { x: 237, y:  85, pull:  1.00, range: 80, label: 'wetland' },
  { x:  92, y: 308, pull:  0.80, range: 65, label: 'pi-mtn'  },
  { x: 163, y: 315, pull:  0.80, range: 65, label: 'lam-mtn' },
  { x:  92, y:  92, pull: -1.20, range: 95, label: 'desert'  },
];
export const CLIMATE_DRIFT_SCALE      = 0.02;   // SVG/tick per unit of pole pull
export const CLIMATE_SPAWN_BIAS_K     = 0.60;   // larger = stronger spawn bias
export const CLIMATE_DISSIPATE_BOOST  = 1.40;   // dissipate-chance multiplier in net-repeller zones
export const CLIMATE_REPELLER_THRESH  = -0.30;  // net effect below this = "in repeller zone"

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
export const BOOT_DRAIN        = 0.108;
export const TRIP_CHANCE_BASE  = 0.006;
export const CATCH_CHANCE_BASE = 0.35;
export const REST_TICKS_MIN    = 43;
export const REST_TICKS_MAX    = 86;

// ----- v0.0.9.3 shortcut travel -----
// v0.0.9.6 commit 3 retired the flat SHORTCUT_STAMINA_MULT (1.20) and
// SHORTCUT_TRIP_MULT (1.50). Terrain tables in js/data/terrain.js now
// drive per-cell cost: flat interior = 1.0x (cheaper than old flat
// tax), river/mountain/rockyHills carry real load, desert ramps with
// daylight. Trample (commit 6) will scale these down per-cell.

// Session-only trail cell fade. A cell's opacity = max(0, 1 - age/FADE).
export const TRAIL_FADE_TICKS      = 300;
export const TRAIL_DROP_EVERY      = 3;    // one trail cell every N ticks while shortcut is active

// ----- boots -----
// v0.0.9.6.9.6 — early-scrip relief round 2. Boot autobuy was eating
// ~61% of run income in 50x25 sim (325c/run → 192c to boots). Dropping
// BOOT_DRAIN 0.12 → 0.108 (+11% boot life per pair) and BOOT_PRICE 15
// → 10 (-33% per-refill cost). Expected combined effect: ~40% less
// scrip to boots per run, freeing ~70-80c for upgrades.
export const BOOT_PRICE = 10;

// ----- trip drops -----
// v0.0.7 commit 6: TRIP_LOST_DROP_CHANCE split into NORMAL/LOST — all cargo
// can now drop on trip, not just lost pkgs.
// v0.0.7.18: tie-down semantics changed — tie-down now absorbs drops too
// (option B). See trip.js maybeTrip() for the new flow.
export const TRIP_DROP_CHANCE_NORMAL = 0.20;
export const TRIP_DROP_CHANCE_LOST   = 0.30;

// v0.0.9.6.9.17 — strain gauge constants. Strain accumulates per-tick
// while walking/carrying using the same factor-breakdown formula that
// computed per-tick tripChance, then fires a trip when it hits 1.0.
// STRAIN_DELTA_SCALE converts the old per-tick chance into a strain
// delta calibrated so a "maintained" (70/70) player accumulates ~0.4
// trips per 500-tick hop. Current mean tripChance was 0.014/tick;
// scaling at 0.25 gives strainDelta ~0.0035/tick at that state → ~1.75
// strain per 500 ticks → ~1.5 trips per hop. Tuneable.
// STRAIN_REST_DISSIPATION drops strain during rest ticks — a full rest
// clears ~0.5 strain over ~100 ticks, making rest a real trip-
// prevention lever (not just stamina refill).
export const STRAIN_DELTA_SCALE       = 0.25;
export const STRAIN_REST_DISSIPATION  = 0.005;
export const STRAIN_TRIP_THRESHOLD    = 1.0;

// v0.0.9.6.9.20 — direct trip-chance multiplier when wearing makeshift
// sandalweed lashing. Layered ON TOP of the existing boot-drain penalty
// (1.30× wear in main.js:319, which indirectly drives bootFail up).
// Narrative: sandalweed isn't just "worse boots", it's wobbly footing
// while your gear is improvised. 1.25× feels noticeable without being
// crushing; interwoven-lashing upgrade doesn't mod it (upgrade already
// improves the repair amount from 30→50).
export const MAKESHIFT_TRIP_MULT      = 1.25;

// ----- recovery cargo (v0.0.7 commit 5) -----
export const RECOVERY_BONUS_MULT    = 1.5;  // scrip multiplier for recovery deliveries
export const RECOVERY_SOFT_CAP      = 3;    // max active recovery cargo in world
export const RECOVERY_POLL_INTERVAL = 85;   // ticks between recovery spawn attempts (~30s)
export const KNOWN_PEERS_CAP        = 10;   // FIFO cap on tracked peer porter IDs

// ----- trust / NPC gains (v0.0.7 commits 4a/4b, realigned in commit A) -----
// v0.0.8.5: delivery trust is now weight-scaled (1 + floor(pkg.slots/2)) in
// computeTrustGain(). TRUST_GAIN_DELIVERY / TRUST_GAIN_LOST_DELIVERY removed.
export const TRUST_THRESHOLDS       = [20, 40, 60, 80];
export const TRUST_GAIN_LOST_BONUS  = 1;    // added on top of weight-scaled base for lost/recovery pkgs
export const TRUST_GAIN_DISCOVERY   = 3;    // flat, no pkg context

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

// ----- v0.0.9.5 commit 4: scannerT2 (xi t40) level-2 tuning -----
// scanner.js reads S.scanner.level; at level 2 these values supersede
// the base values above. Stronger magnitude (trip ×0.35), faster auto
// interval (~21s), slightly longer buff window (~8s).
export const SCANNER_AUTO_INTERVAL_TICKS_T2 = 60;
export const SCANNER_BUFF_DURATION_TICKS_T2 = 24;
export const SCANNER_MANUAL_BUFF_TICKS_T2   = 46;
export const SCANNER_BUFF_MAGNITUDE_T2      = 0.35;

// ----- battery (v0.0.7.28 prototype drain) -----
// Time-only drain for now — no gadget-use cost, no regen. Just enough
// for the kit-row battery animation to move through thresholds during
// a session. At 0.03/tick on a 350ms tick, full drain ≈ 19.4 min.
// Full mechanic (per-device drain + regen + upgrade) lands with a
// schema v6→v7 bump in a later patch.
// v0.0.9.6.9.30f — scanner drain becomes one entry in a keyed
// consumer map (see BATTERY_DRAIN_RATES below). BATTERY_DRAIN_PER_TICK
// preserved for back-compat with any stray callers (none in tree as
// of this commit, but keep the export so future readers grepping for
// it find the migration note).
export const BATTERY_DRAIN_PER_TICK = 0.03;

// v0.0.9.6.9.30f — battery consumer registry. Each tick main.js sums
// over the rates for consumers that are (a) unlocked and (b) actively
// drawing — scanner whenever unlocked, exoskeleton while walking,
// carrier while deployed. Rates tuned so:
//   - scanner alone: full drain in ~19 min (unchanged from the .7.28
//     prototype so existing feel holds)
//   - exoskeleton lvl 1 (all-terrain) adds 0.08/tick while walking —
//     meaningful drain that makes solar panel/turbine upgrades feel
//     load-bearing; lvl 2 drops to 0.05/tick ("extended battery life")
//   - carrier lvl 1 (deployed) draws 0.10/tick — highest single
//     consumer, motivates stow-when-idle; lvl 2 drops to 0.06/tick
// Full stack walking lvl 1 gear = 0.03 + 0.08 + 0.10 = 0.21/tick
// (~2.8 min drain from full) — tight enough that players care about
// solar/turbine regen, loose enough that idle play at night isn't
// instant-dead.
// v0.0.9.6.10.13 — scanner draw model refactored. Was a flat
// 0.03/tick any time the scanner was unlocked (idle-standby
// model, see battery.js CONSUMERS note from pre-.13). Now draws
// ONLY during the buffActive window (auto-ping or manual-ping
// firing). Rate is higher per-tick to compensate for the lower
// uptime; total drain lands near the old flat number at baseline
// auto-ping cadence. T1 vs T2 split matches exo/carrier tiering —
// T2's scanner is a more efficient chip, cheaper per-tick, so a
// player who ticks T2 gets more mitigation (uptime ~40% vs 20%)
// for roughly the same total battery budget.
// Back-of-envelope: auto-ping cadence puts T1 at ~19.8% uptime,
// T2 at ~40%. Per-tick × uptime ≈ total drain per tick:
//   T1: 0.15 × 0.198 = 0.0297/tick (today: 0.03 flat)
//   T2: 0.08 × 0.400 = 0.0320/tick (today: 0.03 flat)
// Manual pings shift uptime up ~10-15pp per press, so the
// player can CHOOSE to burn more battery for more strain
// mitigation — the knob that was missing.
export const BATTERY_DRAIN_RATES = {
  scanner1:         0.15,
  scanner2:         0.08,
  exoskeleton1:     0.08,
  exoskeleton2:     0.05,
  carrier1:         0.10,
  carrier2:         0.06,
};

// v0.0.9.6.9.30h — exoskeleton tunings (pi t20/t40).
// All-terrain mitigation at lvl 1: ×0.80 trip mult on the trio of
// penalty terrains (mountain, rockyHills, river). Composes
// multiplicatively with gear + trample + scanner buff.
// Speed bonus at lvl 2: +15% dotT advance on every segment
// (ring + shortcut + river-drift alike). Numbers land in the
// middle of handoff's speed-variant window; tune once sim data
// from 8-20-run batches with exoskel-unlocked arm is in hand.
export const EXO_ALLTERRAIN_MULT = 0.80;
export const EXO_SPEED_MULT      = 1.15;
// Terrains the all-terrain variant mitigates. Plateau is a
// traversal question (gear required to climb, no trip mult);
// desert is a stamina concern, not trip. Wetland and flat
// don't have penalty mults to begin with.
export const EXO_ALLTERRAIN_TARGETS = { mountain: true, rockyHills: true, river: true };

// v0.0.9.6.9.30.2 — theta's river waders (t20). Applies on river
// terrain only; stacks multiplicatively with exo all-terrain so
// waders + exo on river = 0.80 * 0.80 = 0.64 of the base river
// penalty. Kept at 0.80 (same shape as exo) so the trust-reward
// chain reads as "matched mitigations that combine" rather than
// one overpowered line.
export const RIVER_WADERS_TRIP_MULT = 0.80;

// v0.0.9.6.9.30.2 — lambda's improved tie-downs (t40). Hold-chance
// applied INSIDE the existing tie-down-absorbs-trip branch: on a
// successful absorb, roll this chance to keep the tie-down armed
// instead of disarming it. 0.40 = roughly every 5th-of-3 absorbed
// trip stays armed. Doesn't change the fundamental "must re-arm"
// rhythm; just takes the edge off frequent re-arms during hairy
// stretches.
export const IMPROVED_TIE_DOWNS_HOLD_CHANCE = 0.40;

// v0.0.9.6.9.30i — mobile carrier (gamma t20/t40).
// Folded shape (main-cargo slot cost when stowed) + deployed
// capacity + which terrains the cart can roll across per tier.
// Tuning rationale:
//   - Lvl 1 adds +4 slots / +4 kg (matches L-pkg baseline, so
//     "deploy the cart = effectively a second L-slot of capacity")
//   - Lvl 2 adds +6 slots / +8 kg AND reduces folded footprint
//     to M (2 slots / 2 kg), so the upgrade is felt both in
//     "more stuff when rolling" and "cheaper to stow when not"
// Incompat terrains refuse the cart — forced-stow fires; any pkgs
// in the cart that can't move to main bag get dropped.
export const CARRIER_STATS = {
  1: { maxSlots: 4, maxWeight: 4, foldedSize: 'l', foldedSlots: 4, foldedKg: 4,
       incompatibleTerrains: { mountain: true, river: true } },
  2: { maxSlots: 6, maxWeight: 8, foldedSize: 'm', foldedSlots: 2, foldedKg: 2,
       incompatibleTerrains: {} },
};

// Dead-battery deployed cart penalties. User call: slow the
// courier without forcing a stow (battery can fluctuate day/
// night; forced stows on every sunset would be disruptive).
// Speed mult stacks multiplicatively with exoSpeed + riverDrift
// scale. Strain factor feeds trip.js tripChanceBreakdown as a
// new `deadCartMult` in the penalty section.
// v0.0.9.6.10.12 — speed mult softened 0.50 → 0.75. Sim data
// (batteryEconomy timeline, v0.0.9.6.10.11) showed carrier owners
// spending 40-45% of playtime at 0 charge before the delta t40
// rainfall turbine lands. Half-speed + 45% of session = a
// punitive "you paid for the cart and now it makes you slower"
// feel. 25% slowdown still bites enough that the player cares
// about the battery, but keeps the cart from being a regret
// purchase when owned without solar/turbine support upgrades.
export const CARRIER_DEAD_SPEED_MULT  = 0.75;
export const CARRIER_DEAD_STRAIN_MULT = 1.15;

// Auto-redeploy armed cooldown. After a forced stow, the courier
// must spend this many CONSECUTIVE ticks on compatible terrain
// before the cart re-deploys. Any incompatible-terrain tick
// resets the counter. Manual stow doesn't arm auto-redeploy —
// player choice stays player choice.
export const CARRIER_AUTO_REDEPLOY_TICKS = 5;

// ----- v0.0.9.5 commit 3: battery baseline solar trickle -----
// Peak (midday) regen per tick when no gadgets are draining. Sized so a
// full idle day (zero drain) charges 0 → ~100 across one in-game day
// (TICKS_PER_DAY = 1500, half of which is daylight with a sin curve).
// Integral of sin(s*π) over [0,1] ≈ 0.6366, so effective "full-sun
// tick equivalents" per day = 750 × 0.6366 ≈ 477. For 100 charge in
// one day at peak 0.21: 477 × 0.21 ≈ 100. Using 0.20 gives ~95/day —
// ever-so-slightly under "full by sunset" to match user's "would charge
// from zero if nothing is using it" intent without overshooting.
// Delta's advanced solar panel upgrade (commit 4) multiplies this.
export const BATTERY_SOLAR_PEAK_PER_TICK = 0.20;

// ----- v0.0.9.5 commit 4: reservoirTank passive fill (nu t40) -----
// Per-tick passive canteen refill when reservoirTank is owned. Stacks on
// top of environmental refill (rain/wetland/river). Sized small so it
// supplements rather than replaces active drinking — 0.02/tick is ~6
// canteen per in-game day at a constant rate, roughly matching a light
// drizzle channel. Pairs with the +50% canteenMax that apply() sets.
export const RESERVOIR_TANK_PASSIVE_FILL = 0.02;

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
export const SAVE_KEY_V8  = 'tlh-save-v8';
export const SAVE_KEY_V9  = 'tlh-save-v9';
export const SAVE_VERSION = 9;
export const AUTOSAVE_MS  = 30000;

// ----- v0.0.9.6 commit 5 interior pkg spawn rates -----
// Per-cell spawn probability when buildWorld / respawn fires on an
// interior terrain cell. Plateau cells lead because plateau pkgs are
// the gear-teaching payoff (see plateau-top gating). Mountain is
// deliberately rare but bumps xl-bias + scrip multiplier. Rocky
// hills sits between with a size + modifier rate bump.
export const INTERIOR_SPAWN_PLATEAU    = 0.10;
export const INTERIOR_SPAWN_MOUNTAIN   = 0.03;
export const INTERIOR_SPAWN_ROCKYHILLS = 0.05;
// Reward biases per terrain (multipliers applied at pkg roll)
export const INTERIOR_MOUNTAIN_SCRIP_MULT = 1.3;   // xl + higher scrip
export const INTERIOR_MOUNTAIN_XL_BIAS    = 4.0;   // xl weight multiplier
export const INTERIOR_ROCKYHILLS_MOD_BIAS = 1.5;   // modifier-rate bump
// Interior-pkg respawn cadence (ticks). Match the ring baseline so
// interior doesn't go picked-clean after first sweep.
export const INTERIOR_RESPAWN_TICKS = 800;

// ----- edges with elevated trip risk -----
// v0.0.9.5: 'C' (xi ruins, now SE corner) retained; '?' (phi weather
// station, now right-rim-T) retained. New NPC nodes added later if
// any have risky-approach semantics.
export const RISKY_EDGE_DEST = new Set(['C', '?']);

// ----- v0.0.9.4 + .5: world-spawn destination distribution -----
// Weights for the ring-distance-weighted destination picker. Index =
// clockwise offset from the spawn edge's endpoint.
//
// v0.0.9.4 shipped with 6 weights for the 6-node hex ring.
// v0.0.9.5 expands to 12 for the rounded-square rim. Clockwise order:
//   nu → psi → iota → theta → phi → gamma → xi → delta → lambda → pi → tau → rho → nu
// Heavy forward bias preserved. Long tail gives shortcut travel real
// gameplay weight without flooding far-side nodes. Weights sum to 100
// (readable as percentages).
export const DEST_DIV_WEIGHTS = [30, 20, 15, 10, 8, 6, 4, 3, 2, 1, 0.7, 0.3];

// v0.0.9.6.10.17 — per-profile trust thresholds removed
// (WETLAND_PATH_TICK_THRESHOLD, HOMECOMING_KM_FULL, ROUTINE_VISIT_THRESHOLD).
// Trust profiles shelved; see trust.js::computeTrustGain header.

// ----- v0.0.9.4: NPC outbound dispatch -----
// On arrival at an NPC node, the NPC may offer a package destined for
// another node. Offer chance scales with trust; per-visit cooldown.
// Label pool filtered via the v0.0.8.1 dests[] tagging (treats dests
// as a story-compatibility set — if origin is in the label's dests,
// the label is part of that NPC's vocabulary; dest is any OTHER node
// in the label's dests, weighted by ring-distance curve).
// Reward structure: +N trust at origin on accept (same weight-scaled
// formula as delivery — 1 + floor(slots/2)), +N+1 trust at dest on
// delivery (normal delivery trust plus the outbound bonus). Both
// fire; no replacement. Net ≈ 2N+1 total — dispatch is trust-dense.
export const OUTBOUND_BASE_RATE    = 0.8;  // chance-at-trust-100 cap
export const OUTBOUND_MIN_TRUST    = 5;    // below this, no offers
export const OUTBOUND_BONUS_TRUST  = 1;    // +N+1 on delivery

// v0.0.9.4.1 — toss-cooldown. Dropped pkgs carry a `tossedUntilTick`
// field; scanForPickup (auto) skips them while `S.ticks < tossedUntilTick`.
// Prevents the just-dropped pkg from being instantly re-picked-up by
// the next tick's auto-scan. Cursor pickup is unaffected — clicking
// is a deliberate choice, cooldown doesn't apply. ~8-9s at 350ms/tick.
export const TOSS_COOLDOWN_TICKS   = 25;
