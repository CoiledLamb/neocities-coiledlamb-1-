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
  // v0.0.9.4.1 — auto-pickup toggle. Default true ("idle game first";
  // player flips to false via the `grab:` button in the stamina row to
  // switch into cursor-only pickup mode).
  autoGrab: true,
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
    weatherRadio: false, weatherRadioT2: false, sandalEfficiency: false, scavengerEye: false,
    // v0.0.9.5 commit 4 — new trust-reward upgrades. Real effects where
    // v0.0.9.5 systems exist (reservoirTank, solarPanel, rainfallTurbine,
    // scannerT2). Flag-only for v0.0.9.6-gated mechanics (riverWaders,
    // ceramicWrap, mobileCarrier1/2, mountainGear, improvedTieDowns,
    // exoskeleton1/2, topographicMap).
    reservoirTank: false,
    riverWaders:   false, ceramicWrap:      false,
    mobileCarrier1: false, mobileCarrier2:  false,
    mountainGear:  false, improvedTieDowns: false,
    exoskeleton1:  false, exoskeleton2:     false,
    solarPanel:    false, rainfallTurbine:  false,
    scannerT2:     false,
    topographicMap: false,
  },

  // v0.0.7.21 — sticky gun state. null when not owned; object when owned.
  // ammo refills on H arrival. holstered frees the cargo slot.
  // Schema v6.
  stickyGun: null,  // { ammo, ammoMax, holstered } | null

  // v0.0.8.7 — weather radio state. null when not owned; object when granted.
  // Level 1 (phi t20): passive storm warnings with type prediction + pressure bar.
  // Level 2 (phi t40): minimap isobar rendering unlocks.
  weatherRadio: null,  // { unlocked: true, level: 1|2 } | null

  // v0.0.8.7 — pre-rolled storm type for the next spawn. Set when
  // nextStormSpawnTick is scheduled so the weather radio can predict
  // storm type before it materializes.
  nextStormType: null,

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
  // v0.0.9.5: save-schema slot added (persists via v8 migration). Full
  // feature (innate solar trickle, new consumers, delta's regen upgrades)
  // lands in commit 4a — this commit only reserves the persistence slot.
  battery: {
    charge: 80,             // 0-100; stub, persisted from v0.0.9.5 forward
    max:    100,
  },

  settlements: {
    // v0.0.8.4: ? now weather station (phi), C hosts xi, · hosts psi.
    // v0.0.9.5: area-name relabels for the existing 4 (depot a → depot;
    // depot b → greenhouse; ruins → city ruins; waypoint → oasis).
    // 6 new settlements land as stubs; real tier/supply tuning in
    // commits 2-3 as NPC content fills in.
    // Labels/tiers read for stage-2/3 display via identification.js
    // (stage 2 shows tier; stage 3 shows routeNodes.label).
    'A':        { label:'depot',               tier:'waypoint', supply:65, rebuild:65, quote:'"a fire and four walls"'         },
    'B':        { label:'greenhouse',          tier:'outpost',  supply:34, rebuild:34, quote:'"seedlings in trays"'            },
    '?':        { label:'weather station',     tier:'station',  supply:5,  rebuild:5,  quote:'"barometers click in the wind"' },
    'C':        { label:'city ruins',          tier:'ruins',    supply:10, rebuild:8,  quote:'"someone digs through rubble"'  },
    'H':        { label:'home',                tier:'shelter',  supply:80, rebuild:70, quote:'"hot food. safe walls."'         },
    '\u00b7':   { label:'oasis',               tier:'waypoint', supply:40, rebuild:30, quote:'"a painted stone, tended"'      },
    // v0.0.9.5 new settlements (stub; NPCs fill in commits 2-3)
    '\u03bd':   { label:'treatment plant',     tier:'station',  supply:20, rebuild:20, quote:'"pipes hiss in the dry heat"'   },
    '\u03b8':   { label:'kiln',                tier:'outpost',  supply:30, rebuild:30, quote:'"clay dries slow in the sun"'   },
    '\u03b3':   { label:'workshop',            tier:'outpost',  supply:30, rebuild:30, quote:'"sparks from a forge"'          },
    '\u03bb':   { label:'lodge',               tier:'outpost',  supply:30, rebuild:30, quote:'"rope looped on a hook"'        },
    '\u03c0':   { label:'radio tower',         tier:'station',  supply:15, rebuild:15, quote:'"antenna wind, no signal"'      },
    '\u03b4':   { label:'reservoir',           tier:'station',  supply:20, rebuild:20, quote:'"water hammers the gate"'       },
  },

  // v0.0.9.5: 6-node hex ring → 12-node rounded-square rim. Coords locked
  // in dev-rim-preview.html. Bounding square 85..315 on both axes inside
  // the 400×400 viewBox; 25px corner arcs; rim nodes at 163/237 along
  // each straight side for even spacing (~73 units arc-length per segment).
  //
  // IMPORTANT: array order must match clockwise ring traversal.
  // adjacencyFromCurrent() and ringNodeDistance() in render/route-map.js
  // walk S.routeNodes by index to compute adjacency. Order here must be:
  //   nu → psi → iota → theta → phi → gamma → xi → delta → lambda → pi → tau → rho → nu
  // Coords populated by layoutRouteNodes() in render/route-map.js.
  routeNodes: [
    { id:'\u03bd',  label:'treatment plant',     x:0, y:0 }, // nu     — NW corner [new]
    { id:'\u00b7',  label:'oasis',               x:0, y:0 }, // psi    — top-rim-L
    { id:'B',       label:'greenhouse',          x:0, y:0 }, // iota   — top-rim-R
    { id:'\u03b8',  label:'kiln',                x:0, y:0 }, // theta  — NE corner [new]
    { id:'?',       label:'weather station',     x:0, y:0 }, // phi    — right-rim-T
    { id:'\u03b3',  label:'workshop',            x:0, y:0 }, // gamma  — right-rim-B [new]
    { id:'C',       label:'city ruins',          x:0, y:0 }, // xi     — SE corner (promoted)
    { id:'\u03b4',  label:'reservoir',           x:0, y:0 }, // delta  — bottom-rim-R [new]
    { id:'\u03bb',  label:'lodge',               x:0, y:0 }, // lambda — bottom-rim-L [new]
    { id:'\u03c0',  label:'radio tower',         x:0, y:0 }, // pi     — SW corner [new]
    { id:'H',       label:'home',                x:0, y:0 }, // tau    — left-rim-B (player start)
    { id:'A',       label:'depot',               x:0, y:0 }, // rho    — left-rim-T
  ],
  nodeStages: {
    'A':3, 'B':0, 'H':3, '?':0, 'C':0, '\u00b7':0,
    // New 6: all stage 0 until discovered via trust-chain reveal
    '\u03bd':0, '\u03b8':0, '\u03b3':0, '\u03bb':0, '\u03c0':0, '\u03b4':0,
  },
  // 12 edges, clockwise from nu. edgeIdx 10 = tau→rho edge; dotT 0 puts
  // courier at tau's node (home), the new player start.
  edges: [
    ['\u03bd', '\u00b7'], // 0  nu → psi
    ['\u00b7', 'B'],      // 1  psi → iota
    ['B',      '\u03b8'], // 2  iota → theta
    ['\u03b8', '?'],      // 3  theta → phi
    ['?',      '\u03b3'], // 4  phi → gamma
    ['\u03b3', 'C'],      // 5  gamma → xi
    ['C',      '\u03b4'], // 6  xi → delta
    ['\u03b4', '\u03bb'], // 7  delta → lambda
    ['\u03bb', '\u03c0'], // 8  lambda → pi
    ['\u03c0', 'H'],      // 9  pi → tau
    ['H',      'A'],      // 10 tau → rho  ← player starts at H end (dotT 0)
    ['A',      '\u03bd'], // 11 rho → nu
  ],
  edgeIdx: 10, dotT: 0, worldPos: 0,

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
    // v0.0.9.5: 6 new NPCs added (nu/theta/gamma/lambda/pi/delta).
    // Trust starts at 0. Full dialogue + trust profiles authored this
    // commit. Save-migration v7→v8 adds these slots to older saves.
    //
    // Per-NPC profile state (v0.0.9.5, commit 2) added for the three
    // stateful trust profiles:
    //   B.wetlandTicksSinceLastVisit — iota's 'wetland-path' profile
    //   H.kmAtLastVisit              — tau's 'homecoming' distance axis
    //   \u03b4.visitedSinceLastDelta — delta's 'routine' loop counter
    // Other NPCs include the fields as 0 for save-shape uniformity but
    // only read/update them when their trust profile requires it.
    'A':        { trust: 0, unlocks: { t20:false, t40:false, t60:false, t80:false }, nextChatterTick: 0 },
    'B':        { trust: 0, unlocks: { t20:false, t40:false, t60:false, t80:false }, nextChatterTick: 0, wetlandTicksSinceLastVisit: 0 },
    'H':        { trust: 0, unlocks: { t20:false, t40:false, t60:false, t80:false }, nextChatterTick: 0, kmAtLastVisit: 0 },
    '?':        { trust: 0, unlocks: { t20:false, t40:false, t60:false, t80:false }, nextChatterTick: 0 },
    'C':        { trust: 0, unlocks: { t20:false, t40:false, t60:false, t80:false }, nextChatterTick: 0 },
    '\u00b7':   { trust: 0, unlocks: { t20:false, t40:false, t60:false, t80:false }, nextChatterTick: 0 },
    '\u03bd':   { trust: 0, unlocks: { t20:false, t40:false, t60:false, t80:false }, nextChatterTick: 0 },
    '\u03b8':   { trust: 0, unlocks: { t20:false, t40:false, t60:false, t80:false }, nextChatterTick: 0 },
    '\u03b3':   { trust: 0, unlocks: { t20:false, t40:false, t60:false, t80:false }, nextChatterTick: 0 },
    '\u03bb':   { trust: 0, unlocks: { t20:false, t40:false, t60:false, t80:false }, nextChatterTick: 0 },
    '\u03c0':   { trust: 0, unlocks: { t20:false, t40:false, t60:false, t80:false }, nextChatterTick: 0 },
    '\u03b4':   { trust: 0, unlocks: { t20:false, t40:false, t60:false, t80:false }, nextChatterTick: 0, visitedSinceLastDelta: 0 },
  },

  channels: [],

  // v0.0.9.5.1 — dispatch log persistence. Ring buffer of the last
  // LOG_PERSIST_CAP rendered HTML lines (timestamp baked in). Restored
  // into _transient.logHistory + DOM on save load so the player's
  // recent history survives across sessions. Compact-enough at ~100
  // entries × ~150 bytes ≈ 15KB of the ~50KB typical save payload.
  log: [],

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

    // v0.0.9.4 — NPC outbound dispatch. outboundOfferPending is
    // { originNodeId, pkg } while an offer awaits accept; cleared on
    // accept or on arrival at a different node. outboundLastVisit
    // tracks the last NPC node the courier arrived at so we can
    // detect "same visit" (no re-roll) vs "new visit" (offer again
    // if conditions hold).
    outboundOfferPending: null,
    outboundLastVisit: null,

    // v0.0.9.4.1 commit 2 — active drag state. null when idle;
    // { invIdx, pkg, ghostEl } while a cargo item is being dragged.
    // Populated by js/render/drag.js on mousedown+threshold; cleared
    // on mouseup when the drop resolves (toss or snap-back).
    drag: null,

    // v0.0.9.4.1 bugfix — ci of the fc-pk span currently hovered (or
    // null). Used by renderFieldstrip to detect when a hovered span
    // gets destroyed across a tick re-render — browsers don't fire
    // mouseout on detached elements, so without tracking this the
    // #pkgTooltip gets stuck visible indefinitely.
    hoveredPkgCi: null,

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

    // v0.0.9.2 — typewriter emergence animation tracker.
    // Keyed by nodeId; value is { startTick } so renderSettlements()
    // can compute how many chars have been revealed. Entry self-
    // removes once the animation completes. Not persisted.
    emergingSettlements: new Map(),

    // v0.0.9.3 — segment abstraction for shortcut travel.
    // Populated by route-map.js initSegment() on boot; replaced on
    // shortcut trigger and on arrival. Shape:
    //   { from, to, type: 'ring'|'shortcut', edgeIdx, pathFn, length }
    // `edgeIdx` = S.edges index for ring segments, -1 for shortcuts.
    // `pathFn(t 0..1)` returns { x, y } in route-map viewBox coords.
    currentSegment: null,

    // Session-only trail cells dropped behind the courier on shortcut
    // segments. Each: { x, y, age }. Fades out per TRAIL_FADE_TICKS.
    // Persistent multiplayer-synced trails land in v0.0.9.6.
    trailCells: [],

    // Tooltip hover tracking (route-map.js writes to these).
    hoveredNodeId: null,
    hoveredPx:     { x: 0, y: 0 },

    // Gear popover outside-click handler (so we can remove it on close)
    gearPopHandler: null,

    // distKm accumulator trackers (v0.0.7 commit 6). Null sentinel means
    // "first tick since load" — accumulateDist() uses that to seed without
    // counting a spurious delta. Promoted from S root to _transient in
    // v0.0.7.2 for consistency with other transient plumbing.
    lastDistEdgeIdx: null,
    lastDistDotT: null,

    // v0.0.9.5.1 — in-session dispatch log ring buffer. Holds up to
    // LOG_HISTORY_CAP (~500) rendered HTML lines so the player can
    // scroll back through the whole session. S.log is a tail slice of
    // this for persistence. DOM renders the full buffer; panel scrolls
    // to reveal older. No virtualization — 500 <span>s is cheap.
    logHistory: [],
  },
};
