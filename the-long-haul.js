/* ==============================================
   THE LONG HAUL — game logic
   v0.0.7
   ============================================== */
'use strict';
(function () {

// ============================================================
// PORTER ID
// ============================================================
function getPorterId() {
  const LS_KEY = 'tlh-porter-id';
  try {
    let id = localStorage.getItem(LS_KEY);
    if (!id) {
      const hex = () => Math.floor(Math.random() * 0x10000).toString(16).toUpperCase().padStart(4, '0');
      id = 'PTR-' + hex() + hex();
      localStorage.setItem(LS_KEY, id);
    } else if (id.startsWith('TLH-')) {
      id = 'PTR-' + id.slice(4);
      localStorage.setItem(LS_KEY, id);
    }
    return id;
  } catch (e) {
    return 'PTR-OFFLINE';
  }
}

// ============================================================
// WORLD MAP CONSTANTS
// ============================================================
const CELLS_PER_EDGE   = 260;
const VIEWPORT_CELLS   = 90;
const COURIER_CELL     = 16;
const PKG_PICKUP_RANGE = 8;
const PKG_MAX_PER_EDGE = 18;
const PKG_RESPAWN_TICKS = 500;

const SANDAL_CAP_BASE     = 5;
const SANDAL_CAP_UPGRADED = 25;

// v0.0.7 commit 6: distKm accumulator
// Pre-commit-6, distKm was derived from (edgeIdx + dotT) * 4.2 every 5 ticks,
// so fresh saves (edgeIdx default 2) would show ~8.4km before moving. Now a
// true accumulator: posKm() gives current ring position, accumulateDist()
// adds forward delta per tick and handles loop rollover.
// Old saves self-heal on first session post-upgrade — no migration needed.
const KM_PER_EDGE = 4.2;

const ZONE_TYPES = {
  road: {
    weight: 40, width: [12, 22],
    chars: [
      { ch: '-',      cls: 'fc-rn', w: 5 },
      { ch: '.',      cls: 'fc-fl', w: 4 },
      { ch: '_',      cls: 'fc-rn', w: 3 },
      { ch: '\u00b7', cls: 'fc-fl', w: 2 },
    ],
    pkgChance: 0.07, sandalChance: 0.002,
  },
  scrub: {
    weight: 25, width: [8, 16],
    chars: [
      { ch: ',', cls: 'fc-fl', w: 5 },
      { ch: '`', cls: 'fc-fl', w: 4 },
      { ch: "'", cls: 'fc-fl', w: 4 },
      { ch: '.', cls: 'fc-fl', w: 3 },
      { ch: '*', cls: 'fc-sw-plant', w: 1 },
    ],
    pkgChance: 0.08, sandalChance: 0.008,
  },
  wetlands: {
    weight: 12, width: [6, 14],
    chars: [
      { ch: '~', cls: 'fc-sw', w: 8 },
      { ch: '|', cls: 'fc-sg', w: 2 },
      { ch: '~', cls: 'fc-sw', w: 6 },
      { ch: ',', cls: 'fc-fl', w: 1 },
    ],
    pkgChance: 0.04, sandalChance: 0.00, refillsCanteen: true,
  },
  ruins: {
    weight: 15, width: [10, 20],
    chars: [
      { ch: '=', cls: 'fc-rn', w: 4 },
      { ch: '|', cls: 'fc-sg', w: 3 },
      { ch: '_', cls: 'fc-rn', w: 3 },
      { ch: '#', cls: 'fc-rn', w: 1 },
      { ch: '[', cls: 'fc-sg', w: 1 },
      { ch: ']', cls: 'fc-sg', w: 1 },
    ],
    pkgChance: 0.12, sandalChance: 0.002, risky: true,
  },
  depot_approach: {
    weight: 8, width: [6, 10],
    chars: [
      { ch: '.', cls: 'fc-fl', w: 6 },
      { ch: '-', cls: 'fc-rn', w: 3 },
      { ch: ',', cls: 'fc-fl', w: 2 },
    ],
    pkgChance: 0.10, sandalChance: 0.00, isDepotApproach: true,
  },
};

const RISKY_EDGE_DEST = new Set(['C', '?']);

const NPC_PKGS = [
  { size:'s', label:'medicine',  kg:1, slots:1, scrip:12 },
  { size:'s', label:'seeds',     kg:1, slots:1, scrip:10 },
  { size:'s', label:'letter',    kg:1, slots:1, scrip:8  },
  { size:'m', label:'tools',     kg:2, slots:2, scrip:22 },
  { size:'m', label:'rations',   kg:2, slots:2, scrip:18 },
  { size:'l', label:'lumber',    kg:4, slots:4, scrip:45 },
];
const LOST_PKGS = [
  { size:'s', label:'worn journal', kg:1, slots:1, scrip:18, isLost:true },
  { size:'m', label:'salvage kit',  kg:2, slots:2, scrip:30, isLost:true },
  { size:'s', label:'old photo',    kg:1, slots:1, scrip:14, isLost:true },
];

const TICK_MS           = 350;
const STAMINA_DRAIN     = 0.40;
const BOOT_DRAIN        = 0.12;
const TRIP_CHANCE_BASE  = 0.006;
const CATCH_CHANCE_BASE = 0.35;
const REST_TICKS_MIN    = 43;
const REST_TICKS_MAX    = 86;

const STATUS_COLORS = {
  idle:       '#da8bda',
  walking:    '#7aa8a6',
  carrying:   '#77bfcf',
  delivering: '#9d78d4',
  returning:  '#4a7a78',
  resting:    '#da8bda',
  tripped:    '#da8bda',
};

const DIST_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];

// v0.0.7 commit 5: lost cargo recovery tunables
// v0.0.7 commit 6: TRIP_LOST_DROP_CHANCE split into NORMAL/LOST — all cargo
// can now drop on trip, not just lost pkgs. Drop check fires BEFORE tie-down
// (tie-down protects damage only, fate takes the cargo regardless).
const TRIP_DROP_CHANCE_NORMAL = 0.20;  // chance any normal pkg drops on trip
const TRIP_DROP_CHANCE_LOST   = 0.30;  // chance lost pkg drops on trip
const RECOVERY_BONUS_MULT    = 1.5;   // scrip multiplier for recovery deliveries
const RECOVERY_SOFT_CAP      = 3;     // max active recovery cargo in world
const RECOVERY_POLL_INTERVAL = 85;    // ticks between recovery spawn attempts (~30s)
const KNOWN_PEERS_CAP        = 10;    // FIFO cap on tracked peer porter IDs

// ============================================================
// NPCs (v0.0.7 commit 4a/4b — trust + chatter)
// ============================================================
const NPC_DEFS = {
  'A': { callsign: 'rho',  name: 'rho',  depotLabel: 'depot a' },
  'B': { callsign: 'iota', name: 'iota', depotLabel: 'depot b' },
  'H': { callsign: 'tau',  name: 'tau',  depotLabel: 'home'    },
};
const TRUST_THRESHOLDS = [25, 50, 75, 100];
const TRUST_GAIN_DELIVERY      = 1;
const TRUST_GAIN_LOST_DELIVERY = 2;
const TRUST_GAIN_DISCOVERY     = 3;

const NPC_ADJACENT = {
  'A': ['?', '\u00b7'],
  'B': ['?', 'C'],
  'H': ['C', '\u00b7'],
};

const NPC_LINES = {
  threshold: {
    'A': {
      25:  'good. been watching you. try the road west when you can.',
      50:  'when the sky goes the colour of zinc, you turn back. tell yourself i said so.',
      75:  'i keep the manifest in my head now. ask before you leave and i\'ll tell you what\'s out there.',
      100: 'door\'s open, porter. fire\'s lit. you sit when you need to sit.',
    },
    'B': {
      25:  'oh — hey! you\'re the one walking the loop! i can point you somewhere new if you want.',
      50:  'rain on the way? i can usually feel it. ask me at the door, i\'ll tell you straight.',
      75:  'i see the packages stacked here before they go out. you want a tip? just ask.',
      100: 'we built the bunk. it\'s yours when you\'re here. don\'t make it weird, just sleep.',
    },
    'H': {
      25:  'i remember your callsign now. that means something. keep coming back.',
      50:  'if you\'re tired or hurt or the weather\'s wrong, i\'ll say so. that\'s the deal.',
      75:  'people leave parcels here on their way through. i can tell you what\'s waiting up the line.',
      100: 'home is home. when you\'re here, you\'re here. eat. sleep. start again.',
    },
  },
  ambient: {
    'A': [
      'wind\'s shifted. mind your hat.',
      'the road keeps. the road forgets.',
      'someone walked through last night. didn\'t stop.',
      'kettle\'s on if you\'re passing.',
      'we don\'t count the days here.',
      'sky was that yellow this morning. you know the one.',
    ],
    'B': [
      'roof patched! a real roof! finally!',
      'do you know who left the seeds? thank them, if you see them.',
      'i tried to follow the stars last night. couldn\'t.',
      'somebody whistled past at dawn. it was you, wasn\'t it?',
      'we\'re going to plant something next season. anything that\'ll take.',
      'the radio crackles when you\'re close. funny.',
    ],
    'H': [
      'come in, dry off, sit a while.',
      'the kettle remembers you.',
      'your boots have a sound. i hear them before i see you.',
      'someone left a photograph here. i\'ll keep it for them.',
      'the dog stayed up listening for you. she does that.',
      'old porter\'s rest — always a chair by the door.',
    ],
  },
  warning: {
    'A': {
      rain:    'sky\'s gonna open inside the hour. lean into it or wait it out.',
      trip:    'next leg eats boots. i\'ve seen it. mind your step.',
      stamina: 'you\'re running on empty, porter. drink before you push.',
    },
    'B': {
      rain:    'oh — rain! get a hood up, it\'s coming!',
      trip:    'careful out there, the path beyond is bad. real bad.',
      stamina: 'you look wiped. drink something before you go!',
    },
    'H': {
      rain:    'rain\'s walking up the valley. you\'ll meet it if you go now.',
      trip:    'the road ahead has bones in it. take it slow.',
      stamina: 'sit a beat. you\'ll fall if you walk like that.',
    },
  },
  preview: {
    'A': '{kind} parcel waiting up the line at {next}. you\'ll want the slot.',
    'B': 'oh! there\'s a {kind} package toward {next}! grab the room for it!',
    'H': '{kind} bundle headed for {next}. travels well in the right hands.',
  },
  rest: {
    'A': [
      'sit. boots off. there.',
      'kettle\'s yours. take what you need.',
      'i\'ll wake you when the light changes.',
    ],
    'B': [
      'oh, good — take the bunk! it\'s real soft, i swear!',
      'the dog will sit at your feet, just so you know!',
      'sleep, sleep — i\'ll watch the door!',
    ],
    'H': [
      'home is home. close your eyes.',
      'rest. nothing\'s going anywhere without you.',
      'i\'ll keep the fire — you keep your strength.',
    ],
  },
};

const CHANNELS_DISPLAY_CAP = 6;
const CHATTER_INTERVAL_MIN_TICKS = 170;
const CHATTER_INTERVAL_MAX_TICKS = 345;
const CHATTER_BASE_CHANCE        = 0.005;

// ============================================================
// STATE
// ============================================================
const S = {
  delivered: 0, scrip: 0, distKm: 0, ticks: 0,
  status: 'walking', restTimer: 0, tripTimer: 0,
  maxSlots: 6, usedSlots: 0, maxWeight: 5, usedWeight: 0, inventory: [],
  tieDownActive: false,
  bootDurability: 80, autobuyBoots: false, bootClipCount: 0, bootClipMax: 0, usingMakeshift: false,
  sandalweedCount: 0,
  stamina: 400, staminaMax: 400, staminaOverboost: false, prevStaminaSeg: 4,
  canteen: 100, canteenMax: 100, autodrink: false,
  isRaining: false, rainTimer: 0, inRiver: false,

  upgrades: {
    bootsT1: false, bootsT2: false,
    bootClip1: false, bootClip2: false,
    cargoSling: false, cargoPack: false, cargoWeight: false,
    efficientConsumption: false, steadyFeet: false,
    sandalSatchel: false,
  },

  settlements: {
    'A':        { label:'depot a',  tier:'waypoint', supply:65, rebuild:65, quote:'"a fire and four walls"'   },
    'B':        { label:'depot b',  tier:'outpost',  supply:34, rebuild:34, quote:'"new roof going up"'       },
    '?':        { label:'???',      tier:'unknown',  supply:5,  rebuild:5,  quote:'"signal detected west"'   },
    'C':        { label:'ruins',    tier:'ruins',    supply:10, rebuild:8,  quote:'"danger. high trip risk."' },
    'H':        { label:'home',     tier:'shelter',  supply:80, rebuild:70, quote:'"hot food. safe walls."'   },
    '\u00b7':   { label:'waypoint', tier:'waypoint', supply:40, rebuild:30, quote:'"a painted stone marker"' },
  },

  routeNodes: [
    { id:'A',       label:'depot a',  x:0, y:0 },
    { id:'?',       label:'???',      x:0, y:0 },
    { id:'B',       label:'depot b',  x:0, y:0 },
    { id:'C',       label:'ruins',    x:0, y:0 },
    { id:'H',       label:'home',     x:0, y:0 },
    { id:'\u00b7',  label:'waypoint', x:0, y:0 },
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
    'A': { trust: 0, unlocks: { t25:false, t50:false, t75:false, t100:false }, nextChatterTick: 0 },
    'B': { trust: 0, unlocks: { t25:false, t50:false, t75:false, t100:false }, nextChatterTick: 0 },
    'H': { trust: 0, unlocks: { t25:false, t50:false, t75:false, t100:false }, nextChatterTick: 0 },
  },

  channels: [],

  // v0.0.7 commit 5: lost cargo recovery loop. All transient — not persisted.
  // knownPeers: porter IDs harvested from feed events (FIFO, cap KNOWN_PEERS_CAP).
  //   Used as the pool for recovery polling.
  // activeRecoveryCount: live count of recovery cargo in worldCells. Soft-capped
  //   at RECOVERY_SOFT_CAP. Decremented on pickup/delivery, incremented on spawn.
  // lastRecoverySpawnTick: throttle for soft-cap pacing — won't spawn a new
  //   recovery if last spawn was inside one poll interval.
  knownPeers: [],
  activeRecoveryCount: 0,
  lastRecoverySpawnTick: 0,
  nextRecoveryAttemptTick: 0,

  // v0.0.7 commit 6: distKm accumulator trackers (transient, not persisted).
  // Null sentinel means "first tick since load" — accumulator uses that to
  // seed without counting a spurious delta.
  _lastDistEdgeIdx: null,
  _lastDistDotT: null,
};

function sandalCap() {
  return S.upgrades.sandalSatchel ? SANDAL_CAP_UPGRADED : SANDAL_CAP_BASE;
}

// v0.0.7 commit 6: distKm accumulator helpers.
// posKm returns current ring position in km; accumulateDist adds forward
// delta since last tick to S.distKm. Handles edge rollover (negative delta
// from wrap-around) by adding the full loop length (6 * KM_PER_EDGE).
function posKm(edgeIdx, dotT) {
  return (edgeIdx + dotT) * KM_PER_EDGE;
}

function accumulateDist() {
  if (S._lastDistEdgeIdx === null || S._lastDistDotT === null) {
    S._lastDistEdgeIdx = S.edgeIdx;
    S._lastDistDotT    = S.dotT;
    return;
  }
  const prev = posKm(S._lastDistEdgeIdx, S._lastDistDotT);
  const now  = posKm(S.edgeIdx, S.dotT);
  let delta  = now - prev;
  if (delta < 0) {
    // edge rollover: porter crossed the end of the loop (edgeIdx wrapped)
    delta += S.edges.length * KM_PER_EDGE;
  }
  // Guard against absurd jumps (e.g. save-load warping). Cap at one edge.
  if (delta > KM_PER_EDGE * 2) delta = 0;
  S.distKm = Math.round((S.distKm + delta) * 10) / 10;
  S._lastDistEdgeIdx = S.edgeIdx;
  S._lastDistDotT    = S.dotT;
}

// ============================================================
// MULTIPLAYER (v0.0.7)
// ============================================================
const FEED_URL    = 'https://coiledlamb.tlh-feed.workers.dev';
const POLL_MS     = 60000;
const FEED_DISPLAY_CAP = 8;

let _porterIdCached = null;
let _pollTimer      = null;

function getCachedPorterId() {
  if (!_porterIdCached) _porterIdCached = getPorterId();
  return _porterIdCached;
}

function postActivity(type, data) {
  const porterId = getCachedPorterId();
  if (porterId === 'PTR-OFFLINE') return;
  try {
    fetch(FEED_URL + '/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ porterId, type, data: data || {} }),
      keepalive: true,
    }).catch(() => {});
  } catch (e) {}
}

// v0.0.7 commit 5: post a lost-pkg drop to the worker.
// Worker stores under lost:{porterId} FIFO list, cap 20. Fire-and-forget.
function postLostDrop(pkg) {
  const porterId = getCachedPorterId();
  if (porterId === 'PTR-OFFLINE') return;
  try {
    fetch(FEED_URL + '/lost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        porterId,
        pkg: {
          size: pkg.size, label: pkg.label, kg: pkg.kg, slots: pkg.slots,
          scrip: pkg.scrip, isLost: true,
        },
      }),
      keepalive: true,
    }).catch(() => {});
  } catch (e) {}
  // Also broadcast a lost_drop event for the global feed
  postActivity('lost_drop', { label: pkg.label, size: pkg.size });
}

// v0.0.7 commit 5: fetch lost cargo list for a specific peer.
// Returns array of pkg objects, or [] on failure.
async function fetchLostFromPeer(peerPorterId) {
  try {
    const res = await fetch(FEED_URL + '/lost/' + encodeURIComponent(peerPorterId));
    if (!res.ok) return [];
    const data = await res.json();
    if (!data || !Array.isArray(data.lost)) return [];
    return data.lost;
  } catch (e) {
    return [];
  }
}

async function pollFeed() {
  try {
    const url = FEED_URL + '/feed' + (S.lastFeedTimestamp ? ('?since=' + S.lastFeedTimestamp) : '');
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !Array.isArray(data.events)) return;

    S.networkConnected = true;
    S.networkCensus    = data.census || 0;

    const myId = getCachedPorterId();
    const seen = new Set(S.networkFeed.map(e => `${e.timestamp}|${e.porterId}|${e.type}`));
    data.events.forEach(e => {
      const key = `${e.timestamp}|${e.porterId}|${e.type}`;
      if (!seen.has(key)) {
        S.networkFeed.push(e);
        seen.add(key);
        if (e.timestamp > S.lastFeedTimestamp) S.lastFeedTimestamp = e.timestamp;
        // v0.0.7 commit 5: harvest peer porter IDs for recovery pool (FIFO, no self)
        if (e.porterId && e.porterId !== myId) {
          if (!S.knownPeers.includes(e.porterId)) {
            S.knownPeers.push(e.porterId);
            if (S.knownPeers.length > KNOWN_PEERS_CAP) S.knownPeers.shift();
          }
        }
      }
    });

    S.networkFeed.sort((a, b) => a.timestamp - b.timestamp);
    if (S.networkFeed.length > FEED_DISPLAY_CAP) {
      S.networkFeed = S.networkFeed.slice(-FEED_DISPLAY_CAP);
    }

    renderNetwork();
  } catch (e) {}
}

function startPolling() {
  if (_pollTimer) return;
  pollFeed();
  _pollTimer = setInterval(pollFeed, POLL_MS);
}

function stopPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

function shortPorterId(id) {
  if (!id || typeof id !== 'string') return 'PTR-????';
  const parts = id.split('-');
  if (parts.length === 2 && parts[1].length > 4) {
    return parts[0] + '-' + parts[1].slice(0, 4);
  }
  return id;
}

function checkDistMilestones() {
  const km = Math.floor(S.distKm);
  for (const m of DIST_MILESTONES) {
    if (km >= m && !S.milestonesHit.includes(m)) {
      S.milestonesHit.push(m);
      postActivity('milestone', { kind: 'distance', value: m });
      addLog(`milestone: <span class="log-hi">${m}km walked</span>`);
    }
  }
}

// ============================================================
// IDENTIFICATION STAGES (v0.0.7 commit 3)
// ============================================================
function getNodeStage(id) {
  return (S.nodeStages && typeof S.nodeStages[id] === 'number') ? S.nodeStages[id] : 0;
}

function setNodeStage(id, stage) {
  if (!S.nodeStages) S.nodeStages = {};
  const cur = getNodeStage(id);
  if (stage > cur) {
    S.nodeStages[id] = stage;
    return true;
  }
  return false;
}

function markEdgeAdjacent(fromId, toId) {
  let changed = false;
  if (setNodeStage(fromId, 2)) changed = true;
  if (setNodeStage(toId,   2)) changed = true;
  return changed;
}

function getDisplayLabel(id) {
  const stage = getNodeStage(id);
  if (stage >= 3) {
    const node = S.routeNodes.find(n => n.id === id);
    return node ? node.label : id;
  }
  if (stage >= 2) {
    const settle = S.settlements[id];
    return settle ? settle.tier : '???';
  }
  return '???';
}

// ============================================================
// NPC TRUST (v0.0.7 commit 4a/4b)
// ============================================================
function getNpc(depotId) {
  if (!NPC_DEFS[depotId] || !S.npcs || !S.npcs[depotId]) return null;
  return S.npcs[depotId];
}

function addTrust(depotId, amount, reason) {
  const npc = getNpc(depotId);
  if (!npc || !amount) return 0;
  const before = npc.trust;
  npc.trust = Math.max(0, Math.min(100, npc.trust + amount));
  for (const t of TRUST_THRESHOLDS) {
    const key = 't' + t;
    if (before < t && npc.trust >= t && !npc.unlocks[key]) {
      npc.unlocks[key] = true;
      onTrustUnlock(depotId, t);
    }
  }
  return npc.trust;
}

function onTrustUnlock(depotId, tier) {
  const def = NPC_DEFS[depotId];
  const npcLabel = def ? def.callsign : depotId;
  postActivity('trust_unlock', { depotId, npcLabel, tier });

  const line = NPC_LINES.threshold[depotId] && NPC_LINES.threshold[depotId][tier];
  if (line) speak(depotId, line);

  if (tier === 25) {
    const adj = NPC_ADJACENT[depotId] || [];
    const revealed = [];
    adj.forEach(nid => {
      if (getNodeStage(nid) === 0) {
        if (setNodeStage(nid, 1)) revealed.push(nid);
      }
    });
    if (revealed.length > 0) {
      const labels = revealed.map(getDisplayLabel).join(', ');
      addLog(`<span class="log-hi">${npcLabel}</span> shares word of nearby waypoints \u2014 signal: ${labels}`);
      drawRouteMap();
      renderSettlements();
    } else {
      addLog(`<span class="log-hi">${npcLabel}</span> trusts you (25)`);
    }
    return;
  }
  if (tier === 50)  addLog(`<span class="log-hi">${npcLabel}</span> trusts you (50) \u2014 will share warnings`);
  else if (tier === 75)  addLog(`<span class="log-hi">${npcLabel}</span> trusts you (75) \u2014 will preview routes`);
  else if (tier === 100) addLog(`<span class="log-hi">${npcLabel}</span> trusts you (100) \u2014 you have a seat by their fire`);
}

// ============================================================
// CHANNELS / CHATTER (v0.0.7 commit 4b)
// ============================================================
function speak(depotId, text) {
  const def = NPC_DEFS[depotId];
  if (!def) return;
  S.channels.unshift({
    depotId,
    callsign: def.callsign,
    text,
    ts: S.ticks,
  });
  if (S.channels.length > CHANNELS_DISPLAY_CAP) {
    S.channels.length = CHANNELS_DISPLAY_CAP;
  }
  renderChannels();
}

function pickRandom(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function tryT50Warning(depotId) {
  const npc = getNpc(depotId);
  if (!npc || !npc.unlocks.t50) return false;
  const lines = NPC_LINES.warning[depotId];
  if (!lines) return false;

  const myEdgeIdx = S.edges.findIndex(([a,b]) => a === depotId);
  if (myEdgeIdx >= 0) {
    const [, nextDest] = S.edges[myEdgeIdx];
    if (RISKY_EDGE_DEST.has(nextDest) && lines.trip) {
      speak(depotId, lines.trip);
      return true;
    }
  }
  if (!S.isRaining && S.rainTimer > 0 && S.rainTimer < 25 && lines.rain) {
    speak(depotId, lines.rain);
    return true;
  }
  if (staminaSegCount() <= 2 && lines.stamina) {
    speak(depotId, lines.stamina);
    return true;
  }
  return false;
}

function tryT75Preview(depotId) {
  const npc = getNpc(depotId);
  if (!npc || !npc.unlocks.t75) return false;
  const tmpl = NPC_LINES.preview[depotId];
  if (!tmpl) return false;

  const myEdgeIdx = S.edges.findIndex(([a,b]) => a === depotId);
  if (myEdgeIdx < 0) return false;
  const [, nextDest] = S.edges[myEdgeIdx];

  const startCell = myEdgeIdx * CELLS_PER_EDGE;
  const endCell   = startCell + CELLS_PER_EDGE;
  let found = null;
  for (let i = startCell; i < endCell; i++) {
    const c = worldCells[i];
    if (c && c.pkg && !c.pkg.picked) { found = c.pkg; break; }
  }
  if (!found) return false;

  const kindMap = { s: 'small', m: 'medium', l: 'large' };
  const text = tmpl
    .replace('{kind}', kindMap[found.size] || found.size)
    .replace('{next}', getDisplayLabel(nextDest));
  speak(depotId, text);
  return true;
}

let _depotRestPending = null;
const DEPOT_REST_BONUS_SCRIP = 10;

function tryT100RestPrompt(depotId) {
  const npc = getNpc(depotId);
  if (!npc || !npc.unlocks.t100) return false;
  if (_depotRestPending) return false;
  if (S.stamina >= S.staminaMax && S.staminaOverboost) return false;
  const def = NPC_DEFS[depotId];
  const npcLabel = def ? def.callsign : depotId;
  _depotRestPending = { depotId };
  addLog(`<span class="log-hi">${npcLabel}</span> offers a seat by the fire \u2014 <button class="log-btn" id="depotRestBtn">rest</button>`);
  setTimeout(() => {
    const btn = document.getElementById('depotRestBtn');
    if (btn) btn.addEventListener('click', confirmDepotRest);
  }, 0);
  return true;
}

function confirmDepotRest() {
  if (!_depotRestPending) return;
  const { depotId } = _depotRestPending;
  _depotRestPending = null;
  const def = NPC_DEFS[depotId];
  const npcLabel = def ? def.callsign : depotId;
  S.stamina = S.staminaMax * 1.05;
  S.staminaOverboost = true;
  S.canteen = Math.min(S.canteenMax, S.canteen + 30);
  S.scrip += DEPOT_REST_BONUS_SCRIP;
  addLog(`rested at <span class="log-hi">${npcLabel}</span> \u2014 <span class="log-ok">stamina restored, +${DEPOT_REST_BONUS_SCRIP}\u00a2</span>`);
  const line = pickRandom(NPC_LINES.rest[depotId]);
  if (line) speak(depotId, line);
  renderStamina(); updateHUD();
  const btn = document.getElementById('depotRestBtn');
  if (btn) btn.closest('.log-line').remove();
}

function tickAmbientChatter() {
  if (S.ticks % 10 !== 0) return;
  Object.keys(NPC_DEFS).forEach(depotId => {
    const npc = getNpc(depotId);
    if (!npc || !npc.unlocks.t25) return;
    if (S.ticks < npc.nextChatterTick) return;
    if (Math.random() >= CHATTER_BASE_CHANCE * 10) return;
    const line = pickRandom(NPC_LINES.ambient[depotId]);
    if (!line) return;
    speak(depotId, line);
    npc.nextChatterTick = S.ticks + CHATTER_INTERVAL_MIN_TICKS +
      Math.floor(Math.random() * (CHATTER_INTERVAL_MAX_TICKS - CHATTER_INTERVAL_MIN_TICKS));
  });
}

function fmtChannelAge(ts) {
  const elapsedTicks = S.ticks - ts;
  const elapsedSecs = Math.floor(elapsedTicks * TICK_MS / 1000);
  if (elapsedSecs < 5)   return 'now';
  if (elapsedSecs < 60)  return elapsedSecs + 's';
  const mins = Math.floor(elapsedSecs / 60);
  if (mins < 60)         return mins + 'm';
  return Math.floor(mins / 60) + 'h';
}

function renderChannels() {
  if (!els.channelsEl) return;
  if (S.channels.length === 0) {
    // v0.0.7 commit 6: empty state tells new players what unlocks chatter
    els.channelsEl.innerHTML = '<div class="chan-item chan-quiet">no callsigns trusted yet \u2014 deliver to depots to build trust</div>';
    return;
  }
  els.channelsEl.innerHTML = S.channels.map(c =>
    `<div class="chan-item" data-depot="${c.depotId}">` +
      `<span class="chan-cs">${c.callsign}</span>` +
      `<span class="chan-text">${c.text}</span>` +
      `<span class="chan-ago">${fmtChannelAge(c.ts)}</span>` +
    `</div>`
  ).join('');
}

// ============================================================
// LOST CARGO RECOVERY (v0.0.7 commit 5)
// ============================================================
// Try to spawn one recovery cargo into a random valid worldCell.
// Soft cap: stops if activeRecoveryCount >= RECOVERY_SOFT_CAP, OR if
// we spawned within the last RECOVERY_POLL_INTERVAL ticks (pacing).
async function tickRecoveryAttempt() {
  if (S.ticks < S.nextRecoveryAttemptTick) return;
  S.nextRecoveryAttemptTick = S.ticks + RECOVERY_POLL_INTERVAL;

  if (S.activeRecoveryCount >= RECOVERY_SOFT_CAP) return;
  // Soft pacing: don't spawn back-to-back even if under cap
  if (S.ticks - S.lastRecoverySpawnTick < RECOVERY_POLL_INTERVAL) return;
  if (S.knownPeers.length === 0) return;

  const peerId = pickRandom(S.knownPeers);
  if (!peerId) return;

  const lostList = await fetchLostFromPeer(peerId);
  if (!lostList || lostList.length === 0) return;

  const lostPkg = pickRandom(lostList);
  if (!lostPkg) return;

  spawnRecoveryCargo(lostPkg, peerId);
}

// Find an empty worldCell on a random edge, plant the recovery pkg there.
function spawnRecoveryCargo(lostPkg, fromPorterId) {
  // Pick a random edge
  const edgeIdx = Math.floor(Math.random() * S.edges.length);
  const startCell = edgeIdx * CELLS_PER_EDGE;
  const endCell = startCell + CELLS_PER_EDGE;

  // Find empty cells on this edge (no existing pkg, no sandal)
  const candidates = [];
  for (let i = startCell + 10; i < endCell - 10; i++) {
    const c = worldCells[i];
    if (c && !c.pkg && !c.sandal && i % 8 === 0) {
      candidates.push(i);
    }
  }
  if (candidates.length === 0) return; // edge is too packed; will retry next tick

  const ci = pickRandom(candidates);
  const destId = S.edges[edgeIdx][1];

  // Coerce shape — peer worker may have stored slightly different fields
  const pkg = {
    size:  lostPkg.size  || 's',
    label: lostPkg.label || 'lost cargo',
    kg:    lostPkg.kg    || 1,
    slots: lostPkg.slots || 1,
    scrip: Math.floor((lostPkg.scrip || 14) * RECOVERY_BONUS_MULT),
    isLost: true,
    isRecovery: true,             // commit 5: distinguishes from local lost spawns
    recoveryFromPorter: fromPorterId,
    destId,
    picked: false,
    respawnIn: 0,
  };
  worldCells[ci].pkg = pkg;
  worldCells[ci].isRecovery = true;

  S.activeRecoveryCount++;
  S.lastRecoverySpawnTick = S.ticks;
  updatePorterStripBadges();
  // Quiet log line — feed event covers the social side
  addLog(`<span class="log-wn">recovery cargo</span> dropped into the world`);
}

// v0.0.7 commit 6: subtle porter-strip indicator for active recovery count.
// Ambient presence, not a CTA — only visible when count > 0.
function updatePorterStripBadges() {
  if (!els.porterStrip) return;
  let badge = document.getElementById('recoveryBadge');
  const n = S.activeRecoveryCount;
  if (n > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'recoveryBadge';
      badge.className = 'tlh-porter-recovery has-tooltip';
      // Insert before the hint (which has margin-left: auto and sits at the right)
      const hint = els.porterStrip.querySelector('.tlh-porter-hint');
      if (hint) els.porterStrip.insertBefore(badge, hint);
      else      els.porterStrip.appendChild(badge);
    }
    badge.textContent = 'recovery \u00d7' + n;
    badge.setAttribute('title', n + ' recovery cargo in the world\nfrom other porters\ndeliver for 1.5\u00d7 scrip');
    badge.style.display = 'inline';
  } else if (badge) {
    badge.style.display = 'none';
  }
}

// ============================================================
// PERSISTENCE
// ============================================================
const SAVE_KEY     = 'tlh-save-v1';
const SAVE_KEY_V2  = 'tlh-save-v2';
const SAVE_KEY_V3  = 'tlh-save-v3';
const SAVE_KEY_V4  = 'tlh-save-v4';
const SAVE_KEY_V5  = 'tlh-save-v5';
const SAVE_VERSION = 5;
const AUTOSAVE_MS  = 30000;

let _lastSaveAt = 0;
let _wipeArmed  = false;
let _wipeTimer  = null;
// v0.0.7 wipe fix: guard flag prevents save handlers (autosave, beforeunload,
// visibilitychange) from re-writing in-memory state during the 400ms window
// between wipeSave() and location.reload(). Once set, never unset — page is
// reloading; module re-init will reset it to false naturally.
let _wipeInProgress = false;

function buildSavePayload() {
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    progress: {
      delivered:      S.delivered,
      scrip:          S.scrip,
      distKm:         S.distKm,
      ticks:          S.ticks,
      maxSlots:       S.maxSlots,
      maxWeight:      S.maxWeight,
      bootDurability: S.bootDurability,
      bootClipCount:  S.bootClipCount,
      bootClipMax:    S.bootClipMax,
      usingMakeshift: S.usingMakeshift,
      sandalweedCount: S.sandalweedCount,
      stamina:          S.stamina,
      staminaOverboost: S.staminaOverboost,
      canteen:          S.canteen,
      autobuyBoots:   S.autobuyBoots,
      autodrink:      S.autodrink,
    },
    position: { edgeIdx: S.edgeIdx, dotT: S.dotT },
    inventory: S.inventory.map(p => ({
      size: p.size, label: p.label, kg: p.kg, slots: p.slots,
      scrip: p.scrip, isLost: !!p.isLost, destId: p.destId,
    })),
    upgrades: { ...S.upgrades },
    nodeStages: { ...S.nodeStages },
    settlements: Object.keys(S.settlements).reduce((acc, k) => {
      const s = S.settlements[k];
      acc[k] = { supply: s.supply, rebuild: s.rebuild };
      return acc;
    }, {}),
    multiplayer: {
      milestonesHit:     [...S.milestonesHit],
      lastFeedTimestamp: S.lastFeedTimestamp,
    },
    npcs: Object.keys(S.npcs).reduce((acc, k) => {
      const n = S.npcs[k];
      acc[k] = { trust: n.trust, unlocks: { ...n.unlocks } };
      return acc;
    }, {}),
  };
}

function saveGame(silent) {
  // v0.0.7 wipe fix: bail if wipe is in flight; otherwise the unload handlers
  // re-save the in-memory state we just cleared.
  if (_wipeInProgress) return false;
  try {
    const payload = buildSavePayload();
    localStorage.setItem(SAVE_KEY_V5, JSON.stringify(payload));
    _lastSaveAt = payload.savedAt;
    updateSaveStrip();
    if (!silent) addLog('<span class="log-ok">progress saved</span>');
    return true;
  } catch (e) {
    if (!silent) addLog('<span class="log-wn">save failed: ' + (e && e.message ? e.message : 'storage error') + '</span>');
    return false;
  }
}

function loadGame() {
  let raw;
  try { raw = localStorage.getItem(SAVE_KEY_V5); } catch (e) { return false; }
  if (!raw) { try { raw = localStorage.getItem(SAVE_KEY_V4); } catch (e) { return false; } }
  if (!raw) { try { raw = localStorage.getItem(SAVE_KEY_V3); } catch (e) { return false; } }
  if (!raw) { try { raw = localStorage.getItem(SAVE_KEY_V2); } catch (e) { return false; } }
  if (!raw) { try { raw = localStorage.getItem(SAVE_KEY); }    catch (e) { return false; } }
  if (!raw) return false;
  let data;
  try { data = JSON.parse(raw); } catch (e) { return false; }
  if (!data) return false;
  if (data.version !== 1 && data.version !== 2 && data.version !== 3 && data.version !== 4 && data.version !== SAVE_VERSION) return false;

  try {
    const p = data.progress || {};
    if (typeof p.delivered      === 'number') S.delivered      = p.delivered;
    if (typeof p.scrip          === 'number') S.scrip          = p.scrip;
    // v0.0.7 commit 6: distKm loaded from save is the old derived value for
    // saves pre-commit-6. It'll look slightly off on first session after
    // upgrade (shows stale ring-position rather than true total walked) but
    // self-heals as the accumulator adds forward deltas from here on.
    if (typeof p.distKm         === 'number') S.distKm         = p.distKm;
    if (typeof p.ticks          === 'number') S.ticks          = p.ticks;
    if (typeof p.maxSlots       === 'number') S.maxSlots       = p.maxSlots;
    if (typeof p.maxWeight      === 'number') S.maxWeight      = p.maxWeight;
    if (typeof p.bootDurability === 'number') S.bootDurability = p.bootDurability;
    if (typeof p.bootClipCount  === 'number') S.bootClipCount  = p.bootClipCount;
    if (typeof p.bootClipMax    === 'number') S.bootClipMax    = p.bootClipMax;
    if (typeof p.usingMakeshift === 'boolean') S.usingMakeshift = p.usingMakeshift;
    if (typeof p.sandalweedCount === 'number') S.sandalweedCount = Math.max(0, Math.floor(p.sandalweedCount));
    if (typeof p.stamina          === 'number') S.stamina        = p.stamina;
    if (typeof p.staminaOverboost === 'boolean') S.staminaOverboost = p.staminaOverboost;
    if (typeof p.canteen          === 'number') S.canteen        = p.canteen;
    if (typeof p.autobuyBoots   === 'boolean') S.autobuyBoots   = p.autobuyBoots;
    if (typeof p.autodrink      === 'boolean') S.autodrink      = p.autodrink;

    const pos = data.position || {};
    if (typeof pos.edgeIdx === 'number' && pos.edgeIdx >= 0 && pos.edgeIdx < S.edges.length) S.edgeIdx = pos.edgeIdx;
    if (typeof pos.dotT === 'number' && pos.dotT >= 0 && pos.dotT < 1) S.dotT = pos.dotT;

    if (Array.isArray(data.inventory)) {
      S.inventory = data.inventory.map(p => ({ ...p }));
      S.usedSlots  = S.inventory.reduce((sum, p) => sum + (p.slots || 0), 0);
      S.usedWeight = S.inventory.reduce((sum, p) => sum + (p.kg || 0), 0);
    }

    if (data.upgrades && typeof data.upgrades === 'object') {
      Object.keys(S.upgrades).forEach(k => {
        if (typeof data.upgrades[k] === 'boolean') S.upgrades[k] = data.upgrades[k];
      });
      if (data.upgrades.rebuildRoads === true) {
        S.upgrades.efficientConsumption = true;
      }
    }

    if (data.nodeStages && typeof data.nodeStages === 'object') {
      Object.keys(data.nodeStages).forEach(k => {
        const v = data.nodeStages[k];
        if (typeof v === 'number' && v >= 0 && v <= 3) {
          S.nodeStages[k] = Math.floor(v);
        }
      });
    } else if (data.nodesKnown && typeof data.nodesKnown === 'object') {
      Object.keys(data.nodesKnown).forEach(k => {
        if (data.nodesKnown[k] === true) S.nodeStages[k] = 3;
      });
    }

    if (data.settlements && typeof data.settlements === 'object') {
      Object.keys(data.settlements).forEach(k => {
        if (S.settlements[k] && typeof data.settlements[k].supply === 'number') {
          S.settlements[k].supply  = data.settlements[k].supply;
          S.settlements[k].rebuild = data.settlements[k].rebuild;
        }
      });
    }

    if (data.multiplayer && typeof data.multiplayer === 'object') {
      if (Array.isArray(data.multiplayer.milestonesHit)) {
        S.milestonesHit = data.multiplayer.milestonesHit.filter(m => typeof m === 'number');
      }
      if (typeof data.multiplayer.lastFeedTimestamp === 'number') {
        S.lastFeedTimestamp = data.multiplayer.lastFeedTimestamp;
      }
    }

    if (data.npcs && typeof data.npcs === 'object') {
      Object.keys(S.npcs).forEach(k => {
        const n = data.npcs[k];
        if (!n) return;
        if (typeof n.trust === 'number') {
          S.npcs[k].trust = Math.max(0, Math.min(100, Math.floor(n.trust)));
        }
        if (n.unlocks && typeof n.unlocks === 'object') {
          ['t25','t50','t75','t100'].forEach(t => {
            if (typeof n.unlocks[t] === 'boolean') S.npcs[k].unlocks[t] = n.unlocks[t];
          });
        }
        TRUST_THRESHOLDS.forEach(t => {
          const key = 't' + t;
          if (S.npcs[k].trust >= t && !S.npcs[k].unlocks[key]) {
            S.npcs[k].unlocks[key] = true;
          }
        });
      });
    }

    _lastSaveAt = data.savedAt || 0;
    S.status = S.inventory.length > 0 ? 'carrying' : 'walking';

    if (data.version !== SAVE_VERSION) {
      try {
        localStorage.removeItem(SAVE_KEY);
        localStorage.removeItem(SAVE_KEY_V2);
        localStorage.removeItem(SAVE_KEY_V3);
        localStorage.removeItem(SAVE_KEY_V4);
        saveGame(true);
      } catch (e) {}
    }
    return true;
  } catch (e) {
    return false;
  }
}

function wipeSave() {
  try {
    localStorage.removeItem(SAVE_KEY_V5);
    localStorage.removeItem(SAVE_KEY_V4);
    localStorage.removeItem(SAVE_KEY_V3);
    localStorage.removeItem(SAVE_KEY_V2);
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {}
  _lastSaveAt = 0;
  updateSaveStrip();
}

function fmtAgo(ms) {
  if (!_lastSaveAt) return 'no save yet';
  const secs = Math.floor((Date.now() - _lastSaveAt) / 1000);
  if (secs < 5)   return 'just now';
  if (secs < 60)  return secs + 's ago';
  const mins = Math.floor(secs / 60);
  if (mins < 60)  return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  return Math.floor(hours / 24) + 'd ago';
}

function updateSaveStrip() {
  if (!els.saveAgo) return;
  els.saveAgo.textContent = fmtAgo();
}

function armWipe() {
  if (_wipeArmed) {
    clearTimeout(_wipeTimer);
    _wipeArmed = false;
    // v0.0.7 wipe fix: set guard BEFORE clearing storage so any save handler
    // that fires between now and reload bails immediately.
    _wipeInProgress = true;
    wipeSave();
    if (els.wipeBtn) {
      els.wipeBtn.textContent = 'wipe save';
      els.wipeBtn.classList.remove('armed');
    }
    addLog('<span class="log-wn">save wiped</span> \u2014 reloading for a fresh start...');
    setTimeout(() => { try { location.reload(); } catch (e) {} }, 400);
    return;
  }
  _wipeArmed = true;
  if (els.wipeBtn) {
    els.wipeBtn.textContent = 'click again to confirm';
    els.wipeBtn.classList.add('armed');
  }
  _wipeTimer = setTimeout(() => {
    _wipeArmed = false;
    if (els.wipeBtn) {
      els.wipeBtn.textContent = 'wipe save';
      els.wipeBtn.classList.remove('armed');
    }
  }, 4000);
}

// ============================================================
// WORLD CELLS
// ============================================================
let worldCells = [];
const TOTAL_CELLS = CELLS_PER_EDGE * 6;

function weightedPick(arr, getW) {
  const total = arr.reduce((s, x) => s + getW(x), 0);
  let r = Math.random() * total;
  for (const x of arr) { r -= getW(x); if (r <= 0) return x; }
  return arr[0];
}

function makeWorldPkg(edgeIdx) {
  const isLost = Math.random() < 0.15;
  const pool   = isLost ? LOST_PKGS : NPC_PKGS;
  const def    = pool[Math.floor(Math.random() * pool.length)];
  return { ...def, isLost: isLost || false, destId: S.edges[edgeIdx][1], picked: false, respawnIn: 0 };
}

function buildWorld() {
  worldCells = [];
  for (let ei = 0; ei < 6; ei++) {
    const isRisky = RISKY_EDGE_DEST.has(S.edges[ei][1]);
    let ci = 0;

    while (ci < CELLS_PER_EDGE) {
      const zoneKey = weightedPick(Object.keys(ZONE_TYPES), k => ZONE_TYPES[k].weight);
      const zone    = ZONE_TYPES[zoneKey];
      const zoneLen = zone.width[0] + Math.floor(Math.random() * (zone.width[1] - zone.width[0]));

      if (zone.isDepotApproach && Math.random() < 0.4 && ci + 3 <= CELLS_PER_EDGE) {
        worldCells.push({ html: `<span class="fc fc-fl">   </span>`,     pkg: null, risky: isRisky, edgeIdx: ei });
        worldCells.push({ html: `<span class="fc fc-depot"> [=] </span>`, pkg: null, risky: isRisky, edgeIdx: ei });
        worldCells.push({ html: `<span class="fc fc-fl">   </span>`,     pkg: null, risky: isRisky, edgeIdx: ei });
        ci += 3;
      }

      for (let i = 0; i < zoneLen && ci < CELLS_PER_EDGE; i++, ci++) {
        const r = Math.random();
        if (r < zone.pkgChance && (ci % 8 === 0) && ci + 2 < CELLS_PER_EDGE) {
          const pkg = makeWorldPkg(ei);
          worldCells.push({ html: '', pkg, risky: isRisky, edgeIdx: ei });
          i += 2; ci += 2;
          continue;
        }
        if (r < zone.pkgChance + zone.sandalChance) {
          worldCells.push({ html: `<span class="fc fc-sw-plant" title="sandalweed"> * </span>`, pkg: null, sandal: true, risky: isRisky, edgeIdx: ei });
          i++; ci++;
          continue;
        }
        const c = weightedPick(zone.chars, x => x.w);
        worldCells.push({ html: `<span class="fc ${c.cls}"> ${c.ch} </span>`, pkg: null, risky: isRisky, edgeIdx: ei });
      }

      if (ci < CELLS_PER_EDGE) {
        worldCells.push({ html: `<span class="fc fc-fl">  </span>`, pkg: null, risky: isRisky, edgeIdx: ei });
        ci++;
      }
    }
  }
  while (worldCells.length < TOTAL_CELLS) {
    worldCells.push({ html: `<span class="fc fc-fl"> . </span>`, pkg: null, risky: false, edgeIdx: 0 });
  }
  worldCells.length = TOTAL_CELLS;
}

// ============================================================
// WORLD SCROLL
// ============================================================
let cellPxWidth = 12;

function calcCellPxWidth() {
  const probe = document.createElement('span');
  probe.className   = 'fc fc-fl';
  probe.textContent = ' . ';
  probe.style.cssText = 'visibility:hidden;position:absolute;';
  document.body.appendChild(probe);
  cellPxWidth = probe.getBoundingClientRect().width || 12;
  document.body.removeChild(probe);
}

function worldPosFromRoute() {
  const courierCell = (S.edgeIdx * CELLS_PER_EDGE) + (S.dotT * CELLS_PER_EDGE);
  return ((courierCell - COURIER_CELL) % TOTAL_CELLS + TOTAL_CELLS) % TOTAL_CELLS;
}

function renderFieldstrip() {
  const strip = els.fieldstrip;
  if (!strip) return;
  const leftCell = Math.floor(S.worldPos);
  const viewportPx = (strip.parentNode && strip.parentNode.clientWidth) || (VIEWPORT_CELLS * cellPxWidth);
  const renderCount = Math.max(VIEWPORT_CELLS, Math.ceil(viewportPx / cellPxWidth) + 8);
  let html = '';
  for (let i = 0; i < renderCount; i++) {
    const ci   = (leftCell + i) % TOTAL_CELLS;
    const cell = worldCells[ci];
    if (!cell) continue;
    if (cell.pkg) {
      if (!cell.pkg.picked) {
        const cls = cell.pkg.isLost ? 'fc-pk fc-pk-lost' : 'fc-pk';
        html += `<span class="fc ${cls}" data-ci="${ci}">[${cell.pkg.size}]</span>`;
      } else {
        html += `<span class="fc fc-fl">   </span>`;
      }
    } else {
      html += cell.html;
    }
  }
  strip.innerHTML = html;
  const fracOffset = (S.worldPos - Math.floor(S.worldPos)) * cellPxWidth;
  strip.style.transform = `translateX(${-fracOffset}px)`;
}

// ============================================================
// PACKAGE PICKUP
// ============================================================
function scanForPickup() {
  if (S.status !== 'walking' && S.status !== 'carrying') return;
  const courierCell = Math.floor((S.edgeIdx * CELLS_PER_EDGE) + (S.dotT * CELLS_PER_EDGE));
  for (let offset = 0; offset <= PKG_PICKUP_RANGE; offset++) {
    const ci   = (courierCell + offset) % TOTAL_CELLS;
    const cell = worldCells[ci];
    if (!cell) continue;

    if (cell.sandal) {
      if (S.sandalweedCount >= sandalCap()) continue;
      cell.sandal = false;
      cell.html = `<span class="fc fc-fl">   </span>`;
      S.sandalweedCount++;
      addLog(`harvested <span class="log-hi">sandalweed</span> (${S.sandalweedCount}/${sandalCap()})`);
      renderBoots();
      continue;
    }

    if (!cell.pkg || cell.pkg.picked) continue;
    const pkg = cell.pkg;
    if (pkg.slots > S.maxSlots - S.usedSlots) continue;
    if (pkg.kg    > S.maxWeight - S.usedWeight) continue;

    pkg.picked = true;
    const carried = {
      size: pkg.size, label: pkg.label, kg: pkg.kg, slots: pkg.slots,
      scrip: pkg.scrip, isLost: pkg.isLost, destId: pkg.destId,
      // v0.0.7 commit 5: carry forward recovery metadata
      isRecovery: !!pkg.isRecovery,
      recoveryFromPorter: pkg.recoveryFromPorter || null,
      _worldCell: ci,
    };
    S.inventory.push(carried);
    S.usedSlots  += carried.slots;
    S.usedWeight += carried.kg;
    S.status = 'carrying';
    renderCourierStack();
    renderCargoSlots(true);
    if (els.courierAt) els.courierAt.className = 'tlh-at bounce carry';
    const lostTag = carried.isRecovery
      ? ` <span class="log-wn">[recovery]</span> from <span class="log-hi">${shortPorterId(carried.recoveryFromPorter)}</span>`
      : (carried.isLost ? ' <span class="log-wn">[lost pkg]</span>' : '');
    addLog(`picked up <span class="log-hi">[${carried.size}] ${carried.label}</span>${lostTag}`);
    return;
  }
}

// ============================================================
// PACKAGE DELIVERY
// ============================================================
function tryDeliver(arrivedNodeId) {
  const toDeliver = S.inventory.filter(p => p.destId === arrivedNodeId);
  if (toDeliver.length === 0) return;
  const settle = S.settlements[arrivedNodeId];
  const destLabel = settle ? settle.label : arrivedNodeId;
  toDeliver.forEach(pkg => {
    S.scrip      += pkg.scrip;
    S.delivered  += 1;
    S.usedSlots  -= pkg.slots;
    S.usedWeight -= pkg.kg;
    S.inventory.splice(S.inventory.indexOf(pkg), 1);
    if (pkg._worldCell !== undefined && worldCells[pkg._worldCell] && worldCells[pkg._worldCell].pkg) {
      // v0.0.7 commit 5: recovery cargo doesn't respawn — it's a one-shot item
      // from another porter's lost list. Free up the slot fully.
      if (pkg.isRecovery) {
        worldCells[pkg._worldCell].pkg = null;
        worldCells[pkg._worldCell].isRecovery = false;
        S.activeRecoveryCount = Math.max(0, S.activeRecoveryCount - 1);
        updatePorterStripBadges();
      } else {
        worldCells[pkg._worldCell].pkg.respawnIn = PKG_RESPAWN_TICKS;
      }
    }
    if (settle) { settle.supply = Math.min(100, settle.supply + 3); settle.rebuild = Math.min(100, settle.rebuild + 1); }
    const node = S.routeNodes.find(n => n.id === arrivedNodeId);
    if (node && getNodeStage(arrivedNodeId) < 3) {
      setNodeStage(arrivedNodeId, 3);
      addLog(`discovered: <span class="log-hi">${node.label}</span>`);
      drawRouteMap();
      renderSettlements();
      postActivity('discovery', { nodeId: arrivedNodeId, label: node.label });
      if (NPC_DEFS[arrivedNodeId]) {
        addTrust(arrivedNodeId, TRUST_GAIN_DISCOVERY, 'discovery');
      }
    }
    addLog(`delivered to <span class="log-hi">${destLabel}</span> \u2014 <span class="log-ok">+${pkg.scrip}\u00a2</span>`);
    postActivity('delivery', { destId: arrivedNodeId, destLabel, scrip: pkg.scrip, size: pkg.size });

    // v0.0.7 commit 5: recovery delivery — broadcast lost_recovered + log line
    if (pkg.isRecovery && pkg.recoveryFromPorter) {
      postActivity('lost_recovered', {
        label: pkg.label,
        size: pkg.size,
        forPorter: pkg.recoveryFromPorter,
      });
      addLog(`<span class="log-ok">recovered</span> <span class="log-hi">${pkg.label}</span> \u2014 left by <span class="log-hi">${shortPorterId(pkg.recoveryFromPorter)}</span>`);
    }

    if (NPC_DEFS[arrivedNodeId]) {
      const gain = pkg.isLost ? TRUST_GAIN_LOST_DELIVERY : TRUST_GAIN_DELIVERY;
      addTrust(arrivedNodeId, gain, pkg.isLost ? 'lost-delivery' : 'delivery');
    }
  });
  renderCourierStack();
  renderCargoSlots(true);
  if (S.inventory.length === 0) {
    S.status = 'walking';
    if (els.courierAt) els.courierAt.className = 'tlh-at bounce';
  }
  renderSettlements();
}

function tickPkgRespawns() {
  for (let i = 0; i < TOTAL_CELLS; i++) {
    const cell = worldCells[i];
    if (!cell || !cell.pkg || !cell.pkg.picked || cell.pkg.respawnIn <= 0) continue;
    cell.pkg.respawnIn--;
    if (cell.pkg.respawnIn === 0) {
      const active = worldCells.filter(c => c.edgeIdx === cell.edgeIdx && c.pkg && !c.pkg.picked).length;
      if (active < PKG_MAX_PER_EDGE) {
        cell.pkg.picked = false;
        addLog(`<span class="log-ok">new package</span> spotted on the road`);
      } else {
        cell.pkg.respawnIn = PKG_RESPAWN_TICKS;
      }
    }
  }
}

// ============================================================
// DESTINATION DRIFT
// ============================================================
const NODE_GLYPHS = {
  'A':       '/--\\\n[_A_]',
  'B':       '/\\_/\\\n[_B_]',
  'H':       ' /\\ \n[HOME]',
  'C':       '=====\n[RNS]',
  '?':       ' ??? \n[ ? ]',
  '\u00b7':  '  !  \n =\u00b7= ',
};

function updateDestDrift() {
  if (!els.destDrift) return;
  const [, toId] = currentEdge();
  const node  = S.routeNodes.find(n => n.id === toId);
  if (!node) return;
  const glyph = NODE_GLYPHS[toId] || `[${toId}]`;
  const label = getDisplayLabel(toId);
  els.destDrift.innerHTML =
    `<span class="dest-glyph">${glyph.replace(/\n/g, '<br>')}</span>` +
    `<span class="dest-label">${label}</span>`;
  els.destDrift.style.animation = 'none';
  void els.destDrift.offsetHeight;
  els.destDrift.style.animation = 'destdrift 22s linear forwards';
}

// ============================================================
// RAIN
// ============================================================
function buildRain() {
  if (!els.rainOverlay) return;
  els.rainOverlay.innerHTML = '';
  for (let i = 0; i < 18; i++) {
    const d = document.createElement('span');
    d.textContent = Math.random() < 0.5 ? '|' : '.';
    const dur = 1.1 + Math.random() * 1.3, delay = Math.random() * 2;
    d.style.cssText =
      `position:absolute;left:${Math.random()*100}%;top:0;font-size:10px;` +
      `color:#1e5554;font-family:'Source Code Pro',monospace;` +
      `animation:raindrop ${dur}s linear ${delay}s infinite;`;
    els.rainOverlay.appendChild(d);
  }
}

function setRain(on) {
  S.isRaining = on;
  if (els.rainOverlay) els.rainOverlay.style.display = on ? 'block' : 'none';
  if (on) { S.canteen = Math.min(S.canteenMax, S.canteen + 30); addLog('<span class="log-wn">rain begins \u2014 canteen refilling</span>'); }
  else      addLog('rain clears');
}

// ============================================================
// ROUTE MAP
// ============================================================
function layoutRouteNodes() {
  const W = 110;
  [{ id:'A', x:W/2, y:18 }, { id:'?', x:W-14, y:65 }, { id:'B', x:W-14, y:128 },
   { id:'C', x:W/2, y:175 }, { id:'H', x:14, y:128 }, { id:'\u00b7', x:14, y:65 }]
  .forEach(p => { const n = S.routeNodes.find(n => n.id === p.id); if (n) { n.x = p.x; n.y = p.y; } });
}

function currentEdge() { return S.edges[S.edgeIdx % S.edges.length]; }

function drawRouteMap() {
  const svg = els.routeSvg;
  if (!svg) return;
  svg.innerHTML = '';
  const ns = 'http://www.w3.org/2000/svg';
  const [fromId, toId] = currentEdge();

  S.edges.forEach(([a, b]) => {
    const na = S.routeNodes.find(n => n.id === a), nb = S.routeNodes.find(n => n.id === b);
    if (!na || !nb) return;
    const minStage = Math.min(getNodeStage(a), getNodeStage(b));
    const stroke = minStage >= 3 ? '#2a5c5a'
                 : minStage >= 2 ? '#1e5554'
                 : '#132e2d';
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', na.x); line.setAttribute('y1', na.y);
    line.setAttribute('x2', nb.x); line.setAttribute('y2', nb.y);
    line.setAttribute('stroke', stroke);
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-dasharray', '3 3');
    svg.appendChild(line);
  });

  S.routeNodes.forEach(n => {
    const isCurrent = (n.id === fromId || n.id === toId);
    const stage = getNodeStage(n.id);
    const g = document.createElementNS(ns, 'g'); g.style.cursor = 'pointer';
    g.setAttribute('class', 'route-node-g');
    g.setAttribute('data-stage', String(stage));
    g.setAttribute('data-id', n.id);
    g.setAttribute('title', getDisplayLabel(n.id));

    const fill = isCurrent ? '#0b2e2d'
               : stage >= 3 ? '#1e5554'
               : stage >= 2 ? '#1a3f3e'
               : stage >= 1 ? '#142e2d'
               : '#132e2d';
    const stroke = isCurrent ? '#77bfcf'
                 : stage >= 3 ? '#3a6a68'
                 : stage >= 2 ? '#2f5e5c'
                 : stage >= 1 ? '#244e4d'
                 : '#1e5554';
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', n.x); c.setAttribute('cy', n.y);
    c.setAttribute('r', isCurrent ? 7 : 5);
    c.setAttribute('fill', fill);
    c.setAttribute('stroke', stroke);
    c.setAttribute('stroke-width', isCurrent ? '1.5' : '1');

    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', n.x); t.setAttribute('y', n.y + 4);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-family', "'Source Code Pro',monospace");
    t.setAttribute('font-size', '8'); t.setAttribute('font-weight', '700');
    t.setAttribute('fill', isCurrent ? '#77bfcf'
                          : stage >= 3 ? '#4a7a78'
                          : stage >= 2 ? '#3a6a68'
                          : stage >= 1 ? '#2a5c5a'
                          : '#2a5c5a');
    t.textContent = (stage >= 1 || n.id === '?') ? n.id : '?';

    const lx     = n.x > 70 ? n.x - 9 : n.x < 40 ? n.x + 9 : n.x;
    const anchor = n.x > 70 ? 'end'    : n.x < 40 ? 'start'  : 'middle';
    const ly     = n.y < 30 ? n.y - 9  : n.y > 165 ? n.y + 12 : n.y < 100 ? n.y - 9 : n.y + 13;
    const lbl = document.createElementNS(ns, 'text');
    lbl.setAttribute('x', lx); lbl.setAttribute('y', ly);
    lbl.setAttribute('text-anchor', anchor);
    lbl.setAttribute('font-family', "'Source Code Pro',monospace");
    lbl.setAttribute('font-size', '7');
    lbl.setAttribute('fill', isCurrent ? '#77bfcf'
                            : stage >= 3 ? '#3a6a68'
                            : stage >= 2 ? '#2a5c5a'
                            : '#1e5554');
    lbl.textContent = stage === 0 ? '' : getDisplayLabel(n.id);

    g.appendChild(c); g.appendChild(t); g.appendChild(lbl);
    svg.appendChild(g);
  });

  const dot = document.createElementNS(ns, 'circle');
  dot.setAttribute('id', 'routeDot'); dot.setAttribute('r', '3');
  dot.setAttribute('fill', '#e0eeec'); dot.setAttribute('stroke', '#77bfcf'); dot.setAttribute('stroke-width', '1');
  svg.appendChild(dot);
  updateRouteDot();
}

function updateRouteDot() {
  const dot = document.getElementById('routeDot');
  if (!dot) return;
  const [fromId, toId] = currentEdge();
  const from = S.routeNodes.find(n => n.id === fromId), to = S.routeNodes.find(n => n.id === toId);
  if (!from || !to) return;
  dot.setAttribute('cx', from.x + (to.x - from.x) * S.dotT);
  dot.setAttribute('cy', from.y + (to.y - from.y) * S.dotT);
}

// ============================================================
// DOM REFS
// ============================================================
const $ = id => document.getElementById(id);
let els = {};
function resolveEls() {
  els = {
    porterStrip:  document.querySelector('.tlh-porter-strip'),
    porterIdEl:   $('porterIdEl'),
    porterHint:   document.querySelector('.tlh-porter-hint'),
    delivered:    $('hDelivered'),
    scrip:        $('hScrip'),
    walked:       $('hWalked'),
    status:       $('hStatus'),
    courierWrap:  $('courierWrap'),
    courierAt:    $('courierAt'),
    courierStack: $('courierStack'),
    fieldstrip:   $('fieldstrip'),
    rainOverlay:  $('rainOverlay'),
    destDrift:    $('destDrift'),
    cargoSlots:   $('cargoSlots'),
    weightSegs:   $('weightSegs'),
    bootsBar:     $('bootsBar'),
    bootsVal:     $('bootsVal'),
    bootsGearBtn: $('bootsGearBtn'),
    bootsGearPop: $('bootsGearPop'),
    autobuyBtn:   $('autobuyBtn'),
    buyBootsBtn:  $('buyBootsBtn'),
    clipBadge:    $('clipBadge'),
    drinkBtn:     $('drinkBtn'),
    autodrinkBtn: $('autodrinkBtn'),
    canteenBar:   $('canteenBar'),
    tieDownBtn:   $('tieDownBtn'),
    logEl:        $('logEl'),
    upgradesEl:   $('upgradesEl'),
    settlementsEl:$('settlementsEl'),
    routeSvg:     $('routeSvg'),
    networkEl:    $('networkEl'),
    channelsEl:   $('channelsEl'),
    saveBtn:      $('saveBtn'),
    wipeBtn:      $('wipeBtn'),
    saveAgo:      $('saveAgo'),
  };
}

// ============================================================
// UPGRADES
// ============================================================
const UPGRADE_DEFS = [
  { id:'bootsT1',     name:'sturdy boots',      desc:'+25% boot durability',          cost:30,  requires:null,          apply:()=>{} },
  { id:'bootsT2',     name:'reinforced soles',   desc:'+50% boot durability',          cost:90,  requires:'bootsT1',     apply:()=>{} },
  { id:'bootClip1',   name:'boot clip',          desc:'carry 1 spare pair of boots',   cost:40,  requires:null,          apply:()=>{ S.bootClipMax=1; S.bootClipCount=1; } },
  { id:'bootClip2',   name:'extended clip',      desc:'carry 2 spare pairs of boots',  cost:100, requires:'bootClip1',   apply:()=>{ S.bootClipMax=2; S.bootClipCount=Math.min(2,S.bootClipCount+1); } },
  { id:'steadyFeet',  name:'steady feet',        desc:'-30% trip chance, +15% catch',  cost:120, requires:null,          apply:()=>{} },
  { id:'cargoSling',  name:'cargo sling',        desc:'+2 carry slots',                cost:80,  requires:null,          apply:()=>{ S.maxSlots+=2; } },
  { id:'cargoPack',   name:'expedition pack',    desc:'+3 more carry slots',           cost:180, requires:'cargoSling',  apply:()=>{ S.maxSlots+=3; } },
  { id:'cargoWeight', name:'pack mule rig',      desc:'+5 kg capacity',                cost:150, requires:null,          apply:()=>{ S.maxWeight+=5; } },
  { id:'efficientConsumption', name:'efficient consumption', desc:'-40% canteen drain per drink', cost:120, requires:null, apply:()=>{} },
  { id:'sandalSatchel', name:'sandalweed satchel', desc:'hoard cap 5 \u2192 25', cost:60, requires:null, apply:()=>{} },
];

function renderUpgrades() {
  if (!els.upgradesEl) return;
  els.upgradesEl.innerHTML = '';
  UPGRADE_DEFS.forEach(def => {
    const purchased = S.upgrades[def.id];
    const reqMet    = !def.requires || S.upgrades[def.requires];
    const canAfford = S.scrip >= def.cost;
    const row = document.createElement('div'); row.className = 'upg-item';
    const nameEl = document.createElement('span'); nameEl.className = 'upg-name';
    nameEl.innerHTML = `${def.name}<small>${def.desc}</small>`;
    const btn = document.createElement('button'); btn.className = 'upg-btn';
    if (purchased)      { btn.textContent = 'owned'; btn.disabled = true; }
    else if (!reqMet)   { btn.textContent = '???\u00a2'; btn.disabled = true; }
    else { btn.textContent = def.cost+'\u00a2'; btn.disabled = !canAfford; btn.addEventListener('click', ()=>buyUpgrade(def.id)); }
    row.appendChild(nameEl); row.appendChild(btn);
    els.upgradesEl.appendChild(row);
  });
}

function buyUpgrade(id) {
  const def = UPGRADE_DEFS.find(d => d.id === id);
  if (!def || S.upgrades[id] || S.scrip < def.cost) return;
  S.scrip -= def.cost; S.upgrades[id] = true; def.apply();
  addLog(`<span class="log-hi">${def.name}</span> purchased`);
  renderUpgrades(); renderCargoSlots(true); renderBoots(); updateHUD();
}

// ============================================================
// SETTLEMENTS / NETWORK / LOG
// ============================================================
// v0.0.7 commit 6: rebuilt panel layout.
// - Trust bar moved to top (was bottom) when NPC present + stage 3
// - Trust bar: continuous fill with vertical tick marks at 20/40/60/80
//   (visual-only; gameplay thresholds remain 25/50/75/100 — realigned in refactor pass)
// - Rebuild bar faded/recessed — placeholder for future real mechanic
// - Stage-2 settlements get subtle opacity reduction (unconfirmed, de-emphasized)
function renderSettlements() {
  if (!els.settlementsEl) return;
  els.settlementsEl.innerHTML = '';
  S.routeNodes.filter(n => getNodeStage(n.id) >= 2 && S.settlements[n.id])
    .map(n => ({ id:n.id, stage:getNodeStage(n.id), ...S.settlements[n.id] }))
    .forEach(s => {
      const div = document.createElement('div');
      div.className = 'settle-item' + (s.stage < 3 ? ' settle-stage2' : '');
      const name = s.stage >= 3 ? s.label : s.tier;
      const subtitle = s.stage >= 3 ? s.tier : 'unconfirmed';
      const quote = s.stage >= 3 ? s.quote : `"reports of a ${s.tier} along this route"`;
      let trustBlock = '';
      const npcDef = NPC_DEFS[s.id];
      const npc    = getNpc(s.id);
      if (npcDef && npc && s.stage >= 3) {
        const tPct = Math.max(0, Math.min(100, npc.trust));
        trustBlock = `
          <div class="settle-trust">
            <span class="settle-trust-label">${npcDef.callsign}</span>
            <div class="settle-trust-bar">
              <div class="settle-trust-fill" style="width:${tPct}%"></div>
              <span class="settle-trust-tick" style="left:20%"></span>
              <span class="settle-trust-tick" style="left:40%"></span>
              <span class="settle-trust-tick" style="left:60%"></span>
              <span class="settle-trust-tick" style="left:80%"></span>
            </div>
            <span class="settle-trust-val">${tPct}</span>
          </div>`;
      }
      div.innerHTML = `
        ${trustBlock}
        <div class="settle-name">${name} <span>${subtitle}</span></div>
        <div class="settle-bar settle-bar-wip" title="rebuild progress \u2014 WIP indicator"><div class="settle-fill ${s.rebuild>50?'b':'a'}" style="width:${Math.round(s.rebuild)}%"></div></div>
        <div class="settle-quote">${quote}</div>`;
      els.settlementsEl.appendChild(div);
    });
}

function renderNetwork() {
  if (!els.networkEl) return;
  const myId = getCachedPorterId();
  const lines = [];

  if (S.networkConnected) {
    const others = Math.max(0, S.networkCensus - 1);
    if (others === 0) {
      lines.push('<div class="net-item net-census">no other porters today</div>');
    } else if (others === 1) {
      lines.push(`<div class="net-item net-census"><span class="net-hi">1 other</span> porter online today</div>`);
    } else {
      lines.push(`<div class="net-item net-census"><span class="net-hi">${others} others</span> online today</div>`);
    }
  }

  const visible = S.networkFeed.filter(e => e.porterId !== myId);

  if (!S.networkConnected) {
    lines.push('<div class="net-item net-quiet">connecting to feed...</div>');
  } else if (visible.length === 0) {
    lines.push('<div class="net-item net-quiet">no signal</div>');
  } else {
    visible.slice().reverse().forEach(e => {
      lines.push(`<div class="net-item">${formatEvent(e)}</div>`);
    });
  }

  els.networkEl.innerHTML = lines.join('');
}

function formatEvent(e) {
  const who = `<span class="net-hi">${shortPorterId(e.porterId)}</span>`;
  const data = e.data || {};
  switch (e.type) {
    case 'delivery':
      return `${who} delivered to <span class="net-ac">${data.destLabel || '?'}</span>`;
    case 'milestone':
      if (data.kind === 'distance') {
        return `${who} hit <span class="net-ac">${data.value}km</span>`;
      }
      return `${who} reached a milestone`;
    case 'discovery':
      return `${who} scouted: <span class="net-ac">${data.label || data.nodeId || '?'}</span>`;
    case 'lost_drop':
      return `${who} lost <span class="net-ac">${data.label || 'cargo'}</span>`;
    case 'lost_recovered':
      // v0.0.7 commit 5: include the original porter being repaid
      if (data.forPorter) {
        return `${who} recovered <span class="net-ac">${data.label || 'lost cargo'}</span> for <span class="net-hi">${shortPorterId(data.forPorter)}</span>`;
      }
      return `${who} recovered <span class="net-ac">${data.label || 'lost cargo'}</span>`;
    case 'trust_unlock': {
      const tier = data.tier ? ` (${data.tier})` : '';
      return `${who} earned trust at <span class="net-ac">${data.npcLabel || '?'}</span>${tier}`;
    }
    default:
      return `${who} ${e.type}`;
  }
}

function tt() {
  const totalSecs = Math.floor(S.ticks * TICK_MS / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function addLog(msg) {
  if (!els.logEl) return;
  const el = document.createElement('span'); el.className = 'log-line';
  el.innerHTML = `<span class="log-ts">[${tt()}]</span> ${msg}`;
  els.logEl.insertBefore(el, els.logEl.firstChild);
  const all = els.logEl.querySelectorAll('.log-line');
  if (all.length > 14) all[all.length-1].remove();
}

// ============================================================
// HUD / RENDER
// ============================================================
function updateHUD() {
  els.delivered.textContent = S.delivered;
  els.scrip.textContent     = S.scrip + '\u00a2';
  // v0.0.7 commit 6: distKm is now accumulated directly; display rounded to 1dp
  els.walked.textContent    = (Math.round(S.distKm * 10) / 10) + 'km';
  els.status.textContent    = S.status;
  els.status.style.color    = STATUS_COLORS[S.status] || '#b1c9c3';
  renderUpgrades();
}

let _lastCargoKey = '';
let _lastGearPopKey = '';
function cargoKey() {
  return S.inventory.map(p => `${p.size}${p.destId}${p.scrip}`).join('|') + '|' + S.maxSlots + '|' + S.usedWeight;
}

function renderCargoSlots(force) {
  if (!els.cargoSlots) return;
  const key = cargoKey();
  if (!force && key === _lastCargoKey) return;
  _lastCargoKey = key;

  els.cargoSlots.innerHTML = '';
  const used = [];
  S.inventory.forEach(pkg => { for (let i=0;i<pkg.slots;i++) used.push(pkg); });
  for (let i=0; i<S.maxSlots; i++) {
    const pkg = used[i]||null;
    const d = document.createElement('div');
    d.className   = 'cslot '+(pkg?pkg.size:'e');
    d.textContent = pkg?pkg.size:'';
    if (pkg) {
      const destLabel = getDisplayLabel(pkg.destId);
      const recoveryTag = pkg.isRecovery ? ' [recovery]' : (pkg.isLost ? ' [lost]' : '');
      d.setAttribute('title', `[${pkg.size}] ${pkg.label}${recoveryTag}\n\u2192 ${destLabel}\n${pkg.scrip}\u00a2`);
      d.classList.add('has-tooltip');
    }
    els.cargoSlots.appendChild(d);
  }

  if (els.weightSegs) {
    els.weightSegs.innerHTML = '';
    const loadPct = S.usedWeight / S.maxWeight;
    for (let i = 0; i < S.maxWeight; i++) {
      const pip = document.createElement('div');
      pip.className = i < S.usedWeight
        ? (loadPct <= 0.5 ? 'wseg filled' : loadPct <= 0.8 ? 'wseg heavy' : 'wseg overloaded')
        : 'wseg empty';
      els.weightSegs.appendChild(pip);
    }
  }
}

function renderCourierStack() {
  if (!els.courierStack) return;
  els.courierStack.innerHTML = S.inventory.length === 0 ? '' :
    S.inventory.map(p => `<span class="courier-pkg${p.isLost?' lost':''}">[${p.size}]</span>`).join('');
}

function renderBoots() {
  const d = Math.round(S.bootDurability);
  if (els.bootsVal) els.bootsVal.textContent = d+'%';
  if (els.bootsBar) { els.bootsBar.style.width = d+'%'; els.bootsBar.className = 'boots-bar-fill'+(d>50?'':d>25?' worn':' bad'); }

  // v0.0.7 commit 6: boots gear popover — clip/buy/autobuy live inside here.
  // Dirty-checked: only rebuild innerHTML when state actually changes, so we
  // avoid thrashing the DOM every tick.
  if (els.bootsGearPop) {
    const popKey = `${S.bootClipMax}|${S.bootClipCount}|${S.scrip < 15 ? 'x' : 'o'}|${S.autobuyBoots ? 'on' : 'off'}`;
    if (popKey !== _lastGearPopKey) {
      _lastGearPopKey = popKey;
      const clipLine = S.bootClipMax > 0
        ? `<div class="gear-line">clip: <span class="gear-val">${S.bootClipCount}/${S.bootClipMax}</span></div>`
        : '';
      const buyDisabled = S.scrip < 15 ? 'disabled' : '';
      const autobuyOn = S.autobuyBoots ? ' on' : '';
      const autobuyTxt = S.autobuyBoots ? 'autobuy: on' : 'autobuy: off';
      els.bootsGearPop.innerHTML =
        clipLine +
        `<button class="boots-auto gear-btn" id="buyBootsBtn" ${buyDisabled}>buy boots (15\u00a2)</button>` +
        `<button class="boots-auto gear-btn${autobuyOn}" id="autobuyBtn">${autobuyTxt}</button>`;
      // Re-wire listeners on the fresh DOM nodes
      const newBuy = document.getElementById('buyBootsBtn');
      const newAuto = document.getElementById('autobuyBtn');
      if (newBuy) newBuy.addEventListener('click', buyBoots);
      if (newAuto) newAuto.addEventListener('click', toggleAutobuy);
      els.buyBootsBtn = newBuy;
      els.autobuyBtn  = newAuto;
    }
  }

  let sandalBadge = document.getElementById('sandalBadge');
  if (S.sandalweedCount > 0 || S.upgrades.sandalSatchel) {
    // Sandal badge lives beside the gear button — insert after it.
    if (!sandalBadge && els.bootsGearBtn && els.bootsGearBtn.parentNode) {
      sandalBadge = document.createElement('span');
      sandalBadge.id = 'sandalBadge';
      sandalBadge.className = 'clip-badge sandal-badge has-tooltip';
      els.bootsGearBtn.parentNode.insertBefore(sandalBadge, els.bootsGearBtn.nextSibling);
    }
    if (sandalBadge) {
      const cap = sandalCap();
      const atCap = S.sandalweedCount >= cap;
      sandalBadge.textContent = '* ' + S.sandalweedCount + '/' + cap;
      sandalBadge.classList.toggle('at-cap', atCap);
      sandalBadge.setAttribute('title',
        'sandalweed: ' + S.sandalweedCount + '/' + cap +
        '\nmakeshift footwear' +
        '\nauto-equipped when boots fail' +
        (atCap ? '\n[hoard full \u2014 leaving plants standing]' : '')
      );
      sandalBadge.style.display = 'inline';
    }
  } else if (sandalBadge) {
    sandalBadge.style.display = 'none';
  }
}

function toggleAutobuy() {
  S.autobuyBoots = !S.autobuyBoots;
  renderBoots();
}

// v0.0.7 commit 6: gear popover toggle — click-based, click-outside closes.
let _gearPopHandler = null;
function toggleBootsGear() {
  if (!els.bootsGearPop) return;
  const isOpen = els.bootsGearPop.classList.toggle('open');
  if (els.bootsGearBtn) els.bootsGearBtn.classList.toggle('on', isOpen);
  if (isOpen) {
    // Defer attaching the outside-click handler so the click that opened
    // us doesn't immediately close it.
    setTimeout(() => {
      _gearPopHandler = (ev) => {
        if (!els.bootsGearPop.contains(ev.target) && ev.target !== els.bootsGearBtn) {
          els.bootsGearPop.classList.remove('open');
          if (els.bootsGearBtn) els.bootsGearBtn.classList.remove('on');
          document.removeEventListener('click', _gearPopHandler);
          _gearPopHandler = null;
        }
      };
      document.addEventListener('click', _gearPopHandler);
    }, 0);
  } else if (_gearPopHandler) {
    document.removeEventListener('click', _gearPopHandler);
    _gearPopHandler = null;
  }
}

function staminaSegCount() {
  return Math.min(4, Math.ceil(Math.min(S.stamina,S.staminaMax)/(S.staminaMax/4)));
}

function renderStamina() {
  const perSeg = S.staminaMax/4, disp = Math.min(S.stamina,S.staminaMax);
  for (let i=0;i<4;i++) {
    const seg = document.getElementById('sseg'+i); if(!seg) continue;
    const fl=i*perSeg, ce=(i+1)*perSeg;
    if (disp>=ce)      seg.className='sseg full';
    else if (disp>fl)  seg.className='sseg '+((disp-fl)/perSeg>0.5?'half':'crit');
    else               seg.className='sseg empty';
  }
  const over = document.getElementById('sseg4');
  if (over) {
    if (S.staminaOverboost&&S.stamina>S.staminaMax) { over.className='sseg overboost'; over.style.display='block'; }
    else over.style.display='none';
  }
  const nowSegs = staminaSegCount();
  if (S.autodrink && nowSegs < S.prevStaminaSeg && S.canteen>0) drinkWater();
  S.prevStaminaSeg = nowSegs;
  const canteenPct = Math.round((S.canteen/S.canteenMax)*100);
  if (els.drinkBtn) {
    els.drinkBtn.textContent = `drink (${canteenPct}%)`;
    els.drinkBtn.disabled    = S.canteen<=0 || S.stamina>=S.staminaMax;
  }
  // v0.0.7 commit 6: canteen bar is now vertical — fill grows bottom-to-top via height
  if (els.canteenBar) els.canteenBar.style.height = canteenPct+'%';
}

// ============================================================
// BOOTS / CLIP / TIE-DOWN
// ============================================================
function buyBoots() {
  if (S.scrip<15) return;
  S.scrip-=15; S.bootDurability=100; S.usingMakeshift=false;
  addLog('purchased new <span class="log-hi">boots</span> (15\u00a2)');
  renderBoots(); updateHUD();
}

function checkAutobuy() {
  if (S.bootDurability<=0 && S.bootClipCount<=0 && S.sandalweedCount>0) {
    S.sandalweedCount--; S.bootDurability=30; S.usingMakeshift=true;
    addLog('<span class="log-wn">boots failed</span> \u2014 lashed on a <span class="log-hi">sandalweed</span> (' + S.sandalweedCount + '/' + sandalCap() + ' left)');
    renderBoots(); return;
  }
  if (!S.autobuyBoots) return;
  if (S.bootDurability<=0 && S.bootClipCount>0) {
    S.bootClipCount--; S.bootDurability=100; S.usingMakeshift=false;
    addLog('<span class="log-hi">boot clip</span>: spare pair auto-equipped');
    renderBoots(); return;
  }
  if (S.bootDurability<=20 && S.scrip>=15) {
    S.scrip-=15; S.bootDurability=100; S.usingMakeshift=false;
    addLog('autobuy: new <span class="log-hi">boots</span> purchased (15\u00a2)');
    updateHUD();
  }
}

let _clipRefillPending = null;

function refillBootClip(nodeId) {
  if (S.bootClipMax===0 || !['A','B','H'].includes(nodeId)) return;
  if (S.bootClipCount>=S.bootClipMax) return;
  if (_clipRefillPending) return;
  const cost = (S.bootClipMax-S.bootClipCount)*15;
  if (S.scrip < cost) return;
  const settle = S.settlements[nodeId];
  _clipRefillPending = { nodeId, cost };
  addLog(`<span class="log-wn">boot clip low</span> at <span class="log-hi">${settle?settle.label:nodeId}</span> \u2014 refill for ${cost}\u00a2? <button class="log-btn" id="clipRefillBtn">refill</button>`);
  setTimeout(() => {
    const btn = document.getElementById('clipRefillBtn');
    if (btn) btn.addEventListener('click', confirmClipRefill);
  }, 0);
}

function confirmClipRefill() {
  if (!_clipRefillPending) return;
  const { cost } = _clipRefillPending;
  _clipRefillPending = null;
  if (S.scrip < cost) { addLog('<span class="log-wn">not enough scrip</span>'); return; }
  S.scrip -= cost; S.bootClipCount = S.bootClipMax;
  addLog(`boot clip refilled (${cost}\u00a2)`);
  renderBoots(); updateHUD();
  const btn = document.getElementById('clipRefillBtn');
  if (btn) btn.closest('.log-line').remove();
}

function toggleTieDown() {
  S.tieDownActive = !S.tieDownActive;
  if (els.tieDownBtn) { els.tieDownBtn.textContent='tie-down: '+(S.tieDownActive?'on':'off'); els.tieDownBtn.classList.toggle('on',S.tieDownActive); }
  if (S.tieDownActive) addLog('cargo <span class="log-hi">tied down</span> \u2014 next stumble negated');
}

// ============================================================
// TRIP / CATCH
// ============================================================
function currentCellIsRisky() {
  const ci = Math.floor((S.edgeIdx*CELLS_PER_EDGE)+(S.dotT*CELLS_PER_EDGE)) % TOTAL_CELLS;
  return worldCells[ci] ? worldCells[ci].risky : false;
}

function tripChance() {
  const bootFail = (100-S.bootDurability)/100;
  const segsLost = 4-staminaSegCount();
  let chance = TRIP_CHANCE_BASE * bootFail * (1+segsLost*0.5);
  if (S.upgrades.steadyFeet) chance *= 0.70;
  if (currentCellIsRisky())  chance *= 1.40;
  return chance;
}

function catchChance() {
  const bf = S.bootDurability/100, sf = Math.min(S.stamina,S.staminaMax)/S.staminaMax;
  let c = CATCH_CHANCE_BASE * ((bf+sf)/2);
  if (S.upgrades.steadyFeet) c += 0.15;
  return Math.min(0.85, c);
}

function maybeTrip() {
  if (S.status!=='walking' && S.status!=='carrying') return;
  if (Math.random() >= tripChance()) return;
  if (Math.random() < catchChance()) { addLog('stumbled on debris \u2014 <span class="log-ok">caught yourself</span>'); return; }

  // v0.0.7 commit 6: drop check fires BEFORE tie-down protection.
  // Tie-down protects against damage, not drops — fate takes the cargo.
  // Pick the first item in inventory; roll the appropriate chance based on
  // whether it's a lost pkg (LOST uses higher chance than NORMAL).
  let dropped = false;
  if (S.inventory.length > 0) {
    const target = S.inventory[0];
    const chance = target.isLost ? TRIP_DROP_CHANCE_LOST : TRIP_DROP_CHANCE_NORMAL;
    if (Math.random() < chance) {
      S.usedSlots  -= target.slots;
      S.usedWeight -= target.kg;
      S.inventory.splice(0, 1);
      if (target.isLost) {
        // Lost pkgs go through the worker so others can recover them.
        postLostDrop(target);
        addLog(`<span class="log-wn">tripped!</span> <span class="log-hi">${target.label}</span> fell into the world \u2014 someone may find it`);
      } else {
        // Normal pkgs just vanish locally — no worker event, no recovery path.
        addLog(`<span class="log-wn">tripped!</span> <span class="log-hi">${target.label}</span> was lost in the scramble`);
      }
      renderCourierStack();
      renderCargoSlots(true);
      dropped = true;
    }
  }

  // Tie-down protection: only matters when drop didn't fire. Absorbs the
  // damage-reduction fallback so a single stumble can't drop AND damage.
  if (!dropped && S.tieDownActive && S.inventory.length > 0) {
    S.tieDownActive=false;
    if (els.tieDownBtn) { els.tieDownBtn.textContent='tie-down: off'; els.tieDownBtn.classList.remove('on'); }
    addLog('<span class="log-wn">tripped!</span> tie-down held \u2014 <span class="log-ok">cargo protected</span>. re-arm to use again');
    S.bootDurability=Math.max(0,S.bootDurability-5);
    S.status='tripped'; S.tripTimer=6;
    if (els.courierAt) { els.courierAt.className='tlh-at trip'; els.courierAt.style.animation='trip 0.4s ease 3'; }
    return;
  }

  S.status='tripped'; S.tripTimer=6;
  S.bootDurability=Math.max(0,S.bootDurability-5);

  if (!dropped) {
    if (S.inventory.length>0) { S.inventory[0].scrip=Math.max(1,Math.floor(S.inventory[0].scrip*0.75)); addLog('<span class="log-wn">tripped! package damaged \u2014 reduced payout</span>'); }
    else addLog('<span class="log-wn">tripped on loose rubble!</span>');
  }
  if (els.courierAt) { els.courierAt.className='tlh-at trip'; els.courierAt.style.animation='trip 0.4s ease 3'; }
}

// ============================================================
// SPEED / DRINK
// ============================================================
function speedMultiplier() {
  let mult = 1-(4-staminaSegCount())*0.15;
  if (S.bootDurability<=0)     mult *= 0.5;
  return Math.max(0.2, mult);
}

function drinkWater() {
  if (S.canteen<=0 || S.stamina>=S.staminaMax) return;
  const need = S.staminaMax-S.stamina;
  const rest = Math.min(need,(S.canteen/S.canteenMax)*S.staminaMax);
  S.stamina  = Math.min(S.staminaMax, S.stamina+rest);
  const drainMult = S.upgrades.efficientConsumption ? 0.60 : 1.0;
  S.canteen  = Math.max(0, S.canteen-(rest/S.staminaMax)*S.canteenMax*drainMult);
  addLog(`drank from canteen \u2014 <span class="log-hi">+${Math.round(rest/S.staminaMax*100)}% stamina</span>`);
}

// ============================================================
// MAIN TICK
// ============================================================
function tick() {
  S.ticks++;

  if (S.tripTimer>0) {
    S.tripTimer--;
    if (S.tripTimer===0) {
      S.status = S.inventory.length>0?'carrying':'walking';
      if (els.courierAt) { els.courierAt.className='tlh-at bounce'+(S.inventory.length>0?' carry':''); els.courierAt.style.animation=''; }
    }
    renderBoots(); renderStamina(); updateHUD(); return;
  }

  if (S.status==='resting') {
    S.restTimer--;
    if (S.restTimer<=0) {
      S.stamina=S.staminaMax*1.25; S.staminaOverboost=true;
      S.canteen=Math.min(S.canteenMax,S.canteen+20); S.status='walking';
      addLog('rested at shelter \u2014 <span class="log-hi">stamina restored +25% overboost</span>');
      if (els.courierAt) { els.courierAt.className='tlh-at bounce'; els.courierAt.style.animation=''; }
    }
    renderStamina(); updateHUD(); return;
  }

  if (S.status==='walking' || S.status==='carrying') {
    S.stamina = Math.max(0, S.stamina-STAMINA_DRAIN);
    if (S.staminaOverboost && S.stamina<=S.staminaMax) S.staminaOverboost=false;

    let bd=BOOT_DRAIN;
    if (S.upgrades.bootsT1) bd*=0.75;
    if (S.upgrades.bootsT2) bd*=0.50;
    if (S.usingMakeshift)   bd*=1.30;
    S.bootDurability=Math.max(0,S.bootDurability-bd);

    if (S.isRaining||S.inRiver) S.canteen=Math.min(S.canteenMax,S.canteen+0.4);

    // v0.0.7 commit 6: real distKm accumulator (see KM_PER_EDGE comment).
    // Runs every tick while walking/carrying so we catch sub-edge movement.
    accumulateDist();
    if (S.ticks%5===0) {
      checkDistMilestones();
    }

    maybeTrip();
    checkAutobuy();
    scanForPickup();

    if (S.stamina<50 && S.status==='walking' && Math.random()<0.03) {
      S.status='resting'; S.restTimer=REST_TICKS_MIN+Math.floor(Math.random()*(REST_TICKS_MAX-REST_TICKS_MIN));
      addLog('<span class="log-wn">exhausted \u2014 resting at nearest shelter</span>');
      if (els.courierAt) { els.courierAt.className='tlh-at rest'; els.courierAt.style.animation=''; }
    }
  }

  tickAmbientChatter();
  // v0.0.7 commit 5: recovery cargo spawn attempts (throttled internally)
  tickRecoveryAttempt();

  const prevEdgeIdx = S.edgeIdx;
  S.dotT += 0.006 * speedMultiplier();

  if (S.dotT >= 1) {
    S.dotT    = 0;
    S.edgeIdx = (S.edgeIdx+1) % S.edges.length;
    const arrivedAt = S.edges[prevEdgeIdx][1];
    const node = S.routeNodes.find(n => n.id===arrivedAt);
    if (node && getNodeStage(arrivedAt) < 3) {
      setNodeStage(arrivedAt, 3);
      addLog(`discovered: <span class="log-hi">${node.label}</span>`);
      postActivity('discovery', { nodeId: arrivedAt, label: node.label });
      if (NPC_DEFS[arrivedAt]) {
        addTrust(arrivedAt, TRUST_GAIN_DISCOVERY, 'discovery');
      }
    }
    const [newFrom, newTo] = S.edges[S.edgeIdx];
    if (markEdgeAdjacent(newFrom, newTo)) {
      renderSettlements();
    }
    drawRouteMap();
    updateDestDrift();
    refillBootClip(arrivedAt);
    tryDeliver(arrivedAt);

    if (NPC_DEFS[arrivedAt]) {
      tryT50Warning(arrivedAt);
      tryT75Preview(arrivedAt);
      tryT100RestPrompt(arrivedAt);
    }
  } else {
    updateRouteDot();
  }

  S.worldPos = worldPosFromRoute();
  renderFieldstrip();

  if (S.ticks%10===0) tickPkgRespawns();

  if (S.rainTimer>0) S.rainTimer--;
  else if (Math.random()<0.003) { setRain(!S.isRaining); S.rainTimer=40+Math.floor(Math.random()*60); }

  if (S.ticks % 9 === 0) updateSaveStrip();
  if (S.ticks % 9 === 0 && S.channels.length > 0) renderChannels();

  renderBoots(); renderStamina(); renderCargoSlots(); updateHUD();
}

// ============================================================
// INIT
// ============================================================
function init() {
  resolveEls();
  calcCellPxWidth();

  const porterId = getPorterId();
  if (els.porterIdEl) els.porterIdEl.textContent = porterId;

  buildWorld();

  const restored = loadGame();

  const [curFrom, curTo] = S.edges[S.edgeIdx];
  markEdgeAdjacent(curFrom, curTo);

  S.worldPos = worldPosFromRoute();

  buildRain(); setRain(false);
  layoutRouteNodes(); drawRouteMap(); updateDestDrift();
  renderUpgrades(); renderSettlements(); renderNetwork();
  renderChannels();
  renderCargoSlots(true); renderCourierStack(); renderBoots(); renderStamina();
  updatePorterStripBadges();
  renderFieldstrip();
  updateHUD();
  updateSaveStrip();

  if (restored) {
    addLog(`porter <span class="log-hi">${porterId}</span> back online \u2014 <span class="log-ok">save restored</span>`);
  } else {
    addLog(`porter <span class="log-hi">${porterId}</span> online at <span class="log-hi">depot a</span>`);
  }

  if (els.courierAt) {
    els.courierAt.className = 'tlh-at bounce' + (S.inventory.length > 0 ? ' carry' : '');
    els.courierAt.style.animation = '';
  }

  // v0.0.7 commit 6: gear popover toggle.
  // buy/autobuy buttons are rendered inside the popover by renderBoots()
  // and wired there — we don't pre-bind them at init anymore.
  if (els.bootsGearBtn) els.bootsGearBtn.addEventListener('click', toggleBootsGear);

  if (els.drinkBtn) els.drinkBtn.addEventListener('click', drinkWater);
  if (els.autodrinkBtn) els.autodrinkBtn.addEventListener('click', () => {
    S.autodrink=!S.autodrink;
    els.autodrinkBtn.textContent='auto: '+(S.autodrink?'on':'off');
    els.autodrinkBtn.classList.toggle('on',S.autodrink);
  });
  if (els.tieDownBtn) els.tieDownBtn.addEventListener('click', toggleTieDown);

  if (S.autodrink && els.autodrinkBtn) {
    els.autodrinkBtn.textContent = 'auto: on';
    els.autodrinkBtn.classList.add('on');
  }

  if (els.saveBtn) els.saveBtn.addEventListener('click', () => saveGame(false));
  if (els.wipeBtn) els.wipeBtn.addEventListener('click', armWipe);

  setInterval(() => saveGame(true), AUTOSAVE_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveGame(true);
      stopPolling();
    } else {
      startPolling();
    }
  });
  window.addEventListener('beforeunload', () => saveGame(true));

  if (els.porterHint) els.porterHint.textContent = 'connecting to feed...';

  if (document.visibilityState !== 'hidden') startPolling();

  const hintCheck = setInterval(() => {
    if (S.networkConnected && els.porterHint) {
      els.porterHint.textContent = 'connected to feed';
      clearInterval(hintCheck);
    }
  }, 1000);

  setInterval(tick, TICK_MS);
}

if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
