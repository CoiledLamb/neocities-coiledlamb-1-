/* ==============================================
   THE LONG HAUL — state (v0.0.7.18)

   Single source of truth for all mutable game state. Every logic module
   imports this and mutates S in place.

   Structure:
     S.*              — persisted game state (progress, position, upgrades, etc.)
     S._transient.*   — transient session-only state: DOM refs, timers, cache
                        keys, in-flight flags. Never persisted to localStorage.

   The _transient sub-object replaces the scattered module-level `let` flags
   from the pre-split file (_pollTimer, _wipeArmed, _lastGearPopKey, etc.).
   All of them now live in one place with a consistent convention.
   ============================================== */
'use strict';

export const S = {
  // ----- persisted: progress -----
  delivered: 0, scrip: 0, distKm: 0, ticks: 0,
  status: 'walking', restTimer: 0, tripTimer: 0,
  maxSlots: 6, usedSlots: 0, maxWeight: 5, usedWeight: 0, inventory: [],
  tieDownActive: false,
  bootDurability: 80, autobuyBoots: false, bootClipCount: 0, bootClipMax: 0, usingMakeshift: false,
  sandalweedCount: 0,
  stamina: 400, staminaMax: 400, staminaOverboost: false, prevStaminaSeg: 4,
  canteen: 100, canteenMax: 100, autodrink: false,
  inRiver: false,  // stub for future river mechanic

  // v0.0.8 — weather system. Storms are spatial world objects on the ring.
  // Replaces the old isRaining boolean.
  storms: [],              // array of storm objects (1 for now, array for future multi-front)
  nextStormSpawnTick: 0,   // absolute tick target for next storm birth

  upgrades: {
    bootsT1: false, bootsT2: false,
    bootClip1: false, bootClip2: false,
    cargoSling: false, cargoPack: false, cargoWeight: false,
    efficientConsumption: false, steadyFeet: false,
    sandalSatchel: false,
    // v0.0.7.21 — courier equipment v2
    stickyGun: false, stickyHolster: false,
    scannerT1: false,
    // v0.0.8.6 — trust-reward upgrades
    weatherRadio: false, sandalEfficiency: false, scavengerEye: false,
  },

  // v0.0.7.21 — sticky gun state. null when not owned; object when owned.
  // ammo refills on H arrival. holstered frees the cargo slot.
  // Schema v6.
  stickyGun: null,  // { ammo, ammoMax, holstered } | null

  // v0.0.8.6 — weather radio state. null when not owned; object when granted
  // by phi at t20. Tick hook in main.js fires log warnings before rain.
  weatherRadio: null,  // { unlocked: true } | null

  // v0.0.7.21 — terrain scanner state. unlocked flips when the upgrade is
  // purchased. level is forward-compat for T2/T3 in v0.0.7.23.
  // manualCooldown persists (no save-scum). buff fields are transient-ish
  // but persisted so the buff survives a page reload mid-effect.
  // Schema v6.
  scanner: {
    unlocked: false,
    level: 0,
    manualCooldown: 0,      // ticks remaining on manual ping cooldown
    autoTimer: 0,           // ticks until next auto ping
    buffActive: false,
    buffRemaining: 0,       // ticks remaining on current buff
    buffMagnitude: 1,       // tripChance() *= this while buffActive
  },

  // v0.0.7.24 — kit-row battery (prototype stub). Shared charge pool
  // that powers scanner + future electronic gadgets (exoskeleton, etc).
  // NOT persisted this patch (not in buildSavePayload) — drain/regen
  // lands in a later sub-version with a schema bump.
  battery: {
    charge: 80,             // 0-100; stub, no drain logic yet
  },

  settlements: {
    // v0.0.8.4: ? now weather station (phi), C hosts xi, · hosts psi.
    // Labels/tiers updated for stage-2/3 display through identification.js
    // (stage 2 shows tier; stage 3 shows routeNodes.label).
    'A':        { label:'depot a',         tier:'waypoint', supply:65, rebuild:65, quote:'"a fire and four walls"'         },
    'B':        { label:'depot b',         tier:'outpost',  supply:34, rebuild:34, quote:'"new roof going up"'             },
    '?':        { label:'weather station', tier:'station',  supply:5,  rebuild:5,  quote:'"barometers click in the wind"' },
    'C':        { label:'ruins',           tier:'ruins',    supply:10, rebuild:8,  quote:'"someone digs through rubble"'  },
    'H':        { label:'home',            tier:'shelter',  supply:80, rebuild:70, quote:'"hot food. safe walls."'         },
    '\u00b7':   { label:'waypoint',        tier:'waypoint', supply:40, rebuild:30, quote:'"a painted stone, tended"'      },
  },

  routeNodes: [
    { id:'A',       label:'depot a',         x:0, y:0 },
    { id:'?',       label:'weather station', x:0, y:0 },
    { id:'B',       label:'depot b',         x:0, y:0 },
    { id:'C',       label:'ruins',           x:0, y:0 },
    { id:'H',       label:'home',            x:0, y:0 },
    { id:'\u00b7',  label:'waypoint',        x:0, y:0 },
  ],
  nodeStages: { 'A':3, '?':0, 'B':0, 'C':0, 'H':3, '\u00b7':0 },
  edges: [['A','?'],['?','B'],['B','C'],['C','H'],['H','\u00b7'],['\u00b7','A']],
  edgeIdx: 2, dotT: 0, worldPos: 0,

  pendingDelivery: null,

  networkFeed: [],
  networkCensus: 0,
  networkConnected: false,
  milestonesHit: [],
  lastFeedTimestamp: 0,

  npcs: {
    // v0.0.8.4: six NPCs now. addTrust() auto-inits on first gain, but
    // declaring up-front keeps state shape explicit and ensures the
    // persistence ratchet covers everyone on first save without surprise.
    'A':      { trust: 0, unlocks: { t20:false, t40:false, t60:false, t80:false }, nextChatterTick: 0 },
    'B':      { trust: 0, unlocks: { t20:false, t40:false, t60:false, t80:false }, nextChatterTick: 0 },
    'H':      { trust: 0, unlocks: { t20:false, t40:false, t60:false, t80:false }, nextChatterTick: 0 },
    '?':      { trust: 0, unlocks: { t20:false, t40:false, t60:false, t80:false }, nextChatterTick: 0 },
    'C':      { trust: 0, unlocks: { t20:false, t40:false, t60:false, t80:false }, nextChatterTick: 0 },
    '\u00b7': { trust: 0, unlocks: { t20:false, t40:false, t60:false, t80:false }, nextChatterTick: 0 },
  },

  channels: [],

  // v0.0.7 commit 5: lost cargo recovery loop. Transient — not persisted.
  // These live on S root rather than _transient because they have semantic
  // meaning ("how much recovery cargo is live") rather than being pure
  // plumbing like the _transient bucket below.
  knownPeers: [],
  activeRecoveryCount: 0,
  lastRecoverySpawnTick: 0,
  nextRecoveryAttemptTick: 0,

  // ----- transient: session-only plumbing -----
  // v0.0.7.2: consolidated from scattered module-level `let` flags.
  // Never persisted to localStorage.
  _transient: {
    // DOM refs — populated by resolveEls() at init via Object.assign so
    // the reference stays stable (logic modules can alias it locally).
    els: {},

    // World cell array — mutated in place by buildWorld() via
    // .length = 0 + push, so the reference stays stable.
    worldCells: [],

    // Cell width probe result — set once at init by calcCellPxWidth().
    cellPxWidth: 12,

    // Multiplayer plumbing
    porterIdCached: null,
    pollTimer: null,

    // v0.0.7.21 — multiplayer rate limiting.
    // postQueue holds events waiting for the cooldown window to elapse.
    // lastPostAt is the wall-clock ms timestamp of the last actual fetch.
    // flushTimer is the pending setTimeout handle; null when idle.
    // feedThrottled flips true when the worker returns 429, flips back
    //   once the server's Retry-After (or THROTTLE_COOLDOWN_MS fallback)
    //   has elapsed. The network panel reads this to dim + show a
    //   "feed throttled" indicator (distinct from "no signal" empty-feed).
    // throttledUntil is the wall-clock ms when we can resume sending.
    postQueue: [],
    lastPostAt: 0,
    flushTimer: null,
    feedThrottled: false,
    throttledUntil: 0,

    // v0.0.7.21 — admin auth. Flips true if URL hash #admin=<token>
    // matches the SHA in constants.js. Never persisted. Admin panel
    // only renders when this is true.
    adminAuthed: false,

    // Persistence plumbing
    lastSaveAt: 0,
    wipeArmed: false,
    wipeTimer: null,
    // Guard prevents save handlers (autosave, beforeunload, visibilitychange)
    // from re-writing in-memory state during the 400ms between wipeSave()
    // and location.reload(). Once set, never unset — page is reloading.
    wipeInProgress: false,
    // Once-per-session flag so silent-save failures (quota exhaustion,
    // Safari private mode) surface a single visible warning instead of
    // silently dropping progress every 30 seconds. v0.0.7.18.
    silentSaveErrorShown: false,

    // Pending log-button prompts (one at a time)
    depotRestPending: null,
    clipRefillPending: null,

    // Weather system (v0.0.8). Transient rendering state — the storms
    // themselves live on S.storms (persisted). These are session-only
    // helpers for overlay dirty-checking, spawn ID generation, and
    // precomputed wetland edge list for spawn bias.
    lastWeatherIntensity: 'none',
    stormIdCounter: 0,
    wetlandEdges: [],   // populated by buildWorld() — which edgeIdx values have wetland cells

    // v0.0.8.7: weather radio warn dedupe. Set to the current
    // nextStormSpawnTick when the warn fires; resets implicitly
    // when a new storm is scheduled (its spawn tick will be higher).
    lastWeatherRadioWarnTick: 0,

    // Pickup-fail log dedupe (v0.0.7.19 commit 2b). Key is
    // `${ci}:${usedSlots}:${usedWeight}` — a change to any part refires
    // the log line. Prevents per-tick spam while still re-firing after
    // the player drops/delivers cargo and walks past the same pkg again.
    lastPickupFailKey: '',

    // Render dirty-check keys
    lastCargoKey: '',
    lastGearPopKey: '',

    // Gear popover outside-click handler (so we can remove it on close)
    gearPopHandler: null,

    // distKm accumulator trackers (v0.0.7 commit 6). Null sentinel means
    // "first tick since load" — accumulateDist() uses that to seed without
    // counting a spurious delta. Promoted from S root to _transient in
    // v0.0.7.2 for consistency with other transient plumbing.
    lastDistEdgeIdx: null,
    lastDistDotT: null,
  },
};
