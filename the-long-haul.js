/* ==============================================
   THE LONG HAUL — game logic
   v0.1.0
   ============================================== */
'use strict';
(function () {

// ============================================================
// STATE
// ============================================================
const S = {
  // economy
  delivered: 0,
  scrip: 0,
  distKm: 0,
  ticks: 0,

  // courier
  status: 'idle',   // idle | walking | carrying | delivering | returning | resting | tripped
  restTimer: 0,     // ticks remaining while resting
  tripTimer: 0,     // ticks showing trip animation

  // cargo
  maxSlots: 6,      // total slot-units available
  usedSlots: 0,     // slot-units in use
  maxWeight: 5,     // kg capacity
  usedWeight: 0,
  inventory: [],    // array of { size: 's'|'m'|'l', label: string, kg: number, slots: number, scrip: number }

  // boots
  bootDurability: 80,   // 0-100
  autobuyBoots: false,
  sandalCount: 0,
  usingMakeshift: false,

  // stamina: 0-400 (4 segments × 100)
  stamina: 400,
  staminaMax: 400,

  // canteen
  canteen: 100,     // 0-100 %
  canteenMax: 100,

  // environment
  isRaining: false,
  rainTimer: 0,
  inRiver: false,

  // upgrades purchased
  upgrades: {
    bootsT1: false,   // +25% durability lifespan
    bootsT2: false,   // +50% durability lifespan
    cargoSling: false,// +2 slots
    cargoPack: false, // +3 more slots
    cargoWeight: false,// +5 kg
    rebuildRoads: false, // passive speed (placeholder for per-segment later)
  },

  // settlements
  settlements: [
    { id:'A', label:'depot a', tier:'waypoint',  supply:65, pop:4,  rebuild:65, quote:'"a fire and four walls"',       known:true  },
    { id:'B', label:'depot b', tier:'outpost',   supply:34, pop:7,  rebuild:34, quote:'"new roof going up"',           known:true  },
    { id:'?', label:'???',     tier:'unknown',   supply:5,  pop:0,  rebuild:5,  quote:'"signal detected west"',        known:false },
  ],

  // route
  routeNodes: [
    { id:'A', label:'depot a',  x:0,   y:0,   known:true  },
    { id:'?', label:'???',      x:0,   y:0,   known:false },
    { id:'B', label:'depot b',  x:0,   y:0,   known:true  },
    { id:'C', label:'ruins',    x:0,   y:0,   known:false },
    { id:'H', label:'home',     x:0,   y:0,   known:true  },
    { id:'·', label:'waypoint', x:0,   y:0,   known:true  },
  ],
  edges: [['A','?'],['?','B'],['B','C'],['C','H'],['H','·'],['·','A']],
  currentEdgeFrom: 'B',
  currentEdgeTo:   'C',
  dotT: 0,

  // async / network feed (static flavour for now)
  networkFeed: [
    '<span class="net-hi">visitor</span> rebuilt 3m of north road',
    'lost pkg recovered: <span class="net-ac">[m] tools</span>',
    '<span class="net-hi">2 others</span> online today',
  ],
};

// ============================================================
// CONSTANTS
// ============================================================
const PKG_DEFS = [
  { size:'s', label:'medicine',  kg:1, slots:1, scrip:12 },
  { size:'s', label:'seeds',     kg:1, slots:1, scrip:10 },
  { size:'s', label:'letter',    kg:1, slots:1, scrip:8  },
  { size:'m', label:'tools',     kg:2, slots:2, scrip:22 },
  { size:'m', label:'rations',   kg:2, slots:2, scrip:18 },
  { size:'l', label:'lumber',    kg:4, slots:4, scrip:45 },
];

const TICK_MS        = 350;
const STAMINA_DRAIN  = 0.28;  // per tick while walking
const BOOT_DRAIN     = 0.12;  // per tick while walking (base)
const TRIP_CHANCE_BASE = 0.004; // per tick at 0 boots
const REST_TICKS_MIN = 43;    // ~15s
const REST_TICKS_MAX = 86;    // ~30s
const CARRY_TICKS    = 12;

const STATUS_COLORS = {
  idle:       '#da8bda',
  walking:    '#7aa8a6',
  carrying:   '#77bfcf',
  delivering: '#9d78d4',
  returning:  '#4a7a78',
  resting:    '#da8bda',
  tripped:    '#da8bda',
};

// ============================================================
// DOM REFS
// ============================================================
const $ = id => document.getElementById(id);

const els = {
  delivered: $('hDelivered'),
  scrip:     $('hScrip'),
  walked:    $('hWalked'),
  status:    $('hStatus'),
  courierAt:  $('courierAt'),
  courierPkg: $('courierPkg'),
  fieldstrip: $('fieldstrip'),
  rainOverlay:$('rainOverlay'),
  depotScene: $('depotScene'),
  cargoSlots: $('cargoSlots'),
  cargoBar:   $('cargoBar'),
  cargoWeight:$('cargoWeight'),
  bootsBar:   $('bootsBar'),
  bootsVal:   $('bootsVal'),
  autobuyBtn: $('autobuyBtn'),
  sandalBadge:$('sandalBadge'),
  drinkBtn:   $('drinkBtn'),
  logEl:      $('logEl'),
  upgradesEl: $('upgradesEl'),
  settlementsEl: $('settlementsEl'),
  routeSvg:   $('routeSvg'),
  networkEl:  $('networkEl'),
};

// ============================================================
// FIELD STRIP GENERATION
// ============================================================
function buildField() {
  const defs = [
    { ch:'.', cls:'fc-fl' }, { ch:',', cls:'fc-fl' }, { ch:'`', cls:'fc-fl' },
    { ch:"'", cls:'fc-fl' }, { ch:'_', cls:'fc-rn' }, { ch:'=', cls:'fc-rn' },
    { ch:'|', cls:'fc-sg' }, { ch:'~', cls:'fc-sw' }, { ch:'~', cls:'fc-sw' },
  ];
  let h = '';
  for (let i = 0; i < 300; i++) {
    const r = Math.random();
    if (r < 0.008) {
      // sandalweed pickup chance
      h += `<span class="fc fc-sw-plant" title="sandalweed"> * </span>`;
    } else if (r < 0.018) {
      h += `<span class="fc fc-pk">[s]</span>`; i++;
    } else if (r < 0.025) {
      h += `<span class="fc fc-pk">[m]</span>`; i++;
    } else {
      const p = defs[Math.floor(Math.random() * defs.length)];
      h += `<span class="fc ${p.cls}"> ${p.ch} </span>`;
    }
  }
  els.fieldstrip.innerHTML = h + h;
}

// ============================================================
// RAIN
// ============================================================
function buildRain() {
  els.rainOverlay.innerHTML = '';
  for (let i = 0; i < 18; i++) {
    const d = document.createElement('span');
    d.textContent = Math.random() < 0.5 ? '|' : '.';
    const dur = 1.1 + Math.random() * 1.3;
    const delay = Math.random() * 2;
    d.style.cssText = `position:absolute;left:${Math.random()*100}%;top:0;font-size:10px;` +
      `color:#1e5554;font-family:'Source Code Pro',monospace;` +
      `animation:raindrop ${dur}s linear ${delay}s infinite;`;
    els.rainOverlay.appendChild(d);
  }
}

function setRain(on) {
  S.isRaining = on;
  els.rainOverlay.style.display = on ? 'block' : 'none';
  if (on) {
    // refill canteen while raining
    S.canteen = Math.min(S.canteenMax, S.canteen + 30);
    addLog(`<span class="log-wn">rain begins — canteen refilling</span>`);
  }
}

// ============================================================
// ROUTE MAP
// ============================================================
function layoutRouteNodes() {
  const W = 110, H = 210;
  const positions = [
    { id:'A', x:W/2,    y:18    },
    { id:'?', x:W-14,   y:65    },
    { id:'B', x:W-14,   y:128   },
    { id:'C', x:W/2,    y:175   },
    { id:'H', x:14,     y:128   },
    { id:'·', x:14,     y:65    },
  ];
  positions.forEach(p => {
    const n = S.routeNodes.find(n => n.id === p.id);
    if (n) { n.x = p.x; n.y = p.y; }
  });
}

function drawRouteMap() {
  const svg = els.routeSvg;
  svg.innerHTML = '';
  const ns = 'http://www.w3.org/2000/svg';

  // edges
  S.edges.forEach(([a, b]) => {
    const na = S.routeNodes.find(n => n.id === a);
    const nb = S.routeNodes.find(n => n.id === b);
    if (!na || !nb) return;
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', na.x); line.setAttribute('y1', na.y);
    line.setAttribute('x2', nb.x); line.setAttribute('y2', nb.y);
    const lit = na.known && nb.known;
    line.setAttribute('stroke', lit ? '#2a5c5a' : '#132e2d');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-dasharray', '3 3');
    svg.appendChild(line);
  });

  // nodes
  S.routeNodes.forEach(n => {
    const g = document.createElementNS(ns, 'g');
    g.style.cursor = 'pointer';
    g.title = n.label;

    const isCurrent = (n.id === S.currentEdgeTo || n.id === S.currentEdgeFrom);
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', n.x); c.setAttribute('cy', n.y);
    c.setAttribute('r', isCurrent ? 7 : 5);
    c.setAttribute('fill', isCurrent ? '#0b2e2d' : n.known ? '#1e5554' : '#132e2d');
    c.setAttribute('stroke', isCurrent ? '#77bfcf' : n.known ? '#3a6a68' : '#1e5554');
    c.setAttribute('stroke-width', isCurrent ? '1.5' : '1');

    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', n.x); t.setAttribute('y', n.y + 4);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-family', "'Source Code Pro',monospace");
    t.setAttribute('font-size', '8'); t.setAttribute('font-weight', '700');
    t.setAttribute('fill', isCurrent ? '#77bfcf' : n.known ? '#4a7a78' : '#2a5c5a');
    t.textContent = n.id;

    const lx = n.x > 70 ? n.x - 9 : n.x < 40 ? n.x + 9 : n.x;
    const anchor = n.x > 70 ? 'end' : n.x < 40 ? 'start' : 'middle';
    const ly = n.y < 30 ? n.y - 9 : n.y > 165 ? n.y + 12 : n.y < 100 ? n.y - 9 : n.y + 13;
    const lbl = document.createElementNS(ns, 'text');
    lbl.setAttribute('x', lx); lbl.setAttribute('y', ly);
    lbl.setAttribute('text-anchor', anchor);
    lbl.setAttribute('font-family', "'Source Code Pro',monospace");
    lbl.setAttribute('font-size', '7');
    lbl.setAttribute('fill', isCurrent ? '#77bfcf' : n.known ? '#3a6a68' : '#1e5554');
    lbl.textContent = n.label;

    g.appendChild(c); g.appendChild(t); g.appendChild(lbl);
    svg.appendChild(g);
  });

  // courier dot
  const dot = document.createElementNS(ns, 'circle');
  dot.setAttribute('id', 'routeDot');
  dot.setAttribute('r', '3');
  dot.setAttribute('fill', '#e0eeec');
  dot.setAttribute('stroke', '#77bfcf');
  dot.setAttribute('stroke-width', '1');
  svg.appendChild(dot);
  updateRouteDot();
}

function updateRouteDot() {
  const dot = document.getElementById('routeDot');
  if (!dot) return;
  const from = S.routeNodes.find(n => n.id === S.currentEdgeFrom);
  const to   = S.routeNodes.find(n => n.id === S.currentEdgeTo);
  if (!from || !to) return;
  const x = from.x + (to.x - from.x) * S.dotT;
  const y = from.y + (to.y - from.y) * S.dotT;
  dot.setAttribute('cx', x);
  dot.setAttribute('cy', y);
}

// ============================================================
// UPGRADES
// ============================================================
const UPGRADE_DEFS = [
  {
    id: 'bootsT1',
    name: 'sturdy boots',
    desc: '+25% boot durability',
    cost: 30,
    requires: null,
    apply: () => { /* multiplied in drain calc */ },
  },
  {
    id: 'bootsT2',
    name: 'reinforced soles',
    desc: '+50% boot durability',
    cost: 90,
    requires: 'bootsT1',
    apply: () => {},
  },
  {
    id: 'cargoSling',
    name: 'cargo sling',
    desc: '+2 carry slots',
    cost: 80,
    requires: null,
    apply: () => { S.maxSlots += 2; },
  },
  {
    id: 'cargoPack',
    name: 'expedition pack',
    desc: '+3 more carry slots',
    cost: 180,
    requires: 'cargoSling',
    apply: () => { S.maxSlots += 3; },
  },
  {
    id: 'cargoWeight',
    name: 'pack mule rig',
    desc: '+5 kg capacity',
    cost: 150,
    requires: null,
    apply: () => { S.maxWeight += 5; },
  },
  {
    id: 'rebuildRoads',
    name: 'rebuild roads',
    desc: 'passively faster travel',
    cost: 200,
    requires: null,
    apply: () => { /* speed multiplier handled in tick */ },
  },
];

function renderUpgrades() {
  els.upgradesEl.innerHTML = '';
  UPGRADE_DEFS.forEach(def => {
    const purchased = S.upgrades[def.id];
    const reqMet    = !def.requires || S.upgrades[def.requires];
    const canAfford = S.scrip >= def.cost;

    const row = document.createElement('div');
    row.className = 'upg-item';
    const nameEl = document.createElement('span');
    nameEl.className = 'upg-name';
    nameEl.innerHTML = `${def.name}<small>${def.desc}</small>`;
    const btn = document.createElement('button');
    btn.className = 'upg-btn';
    if (purchased) {
      btn.textContent = 'owned';
      btn.disabled = true;
    } else if (!reqMet) {
      btn.textContent = '???¢';
      btn.disabled = true;
    } else {
      btn.textContent = def.cost + '¢';
      btn.disabled = !canAfford;
      btn.addEventListener('click', () => buyUpgrade(def.id));
    }
    row.appendChild(nameEl);
    row.appendChild(btn);
    els.upgradesEl.appendChild(row);
  });
}

function buyUpgrade(id) {
  const def = UPGRADE_DEFS.find(d => d.id === id);
  if (!def || S.upgrades[id] || S.scrip < def.cost) return;
  S.scrip -= def.cost;
  S.upgrades[id] = true;
  def.apply();
  addLog(`<span class="log-hi">${def.name}</span> purchased`);
  renderUpgrades();
  renderCargoSlots();
  updateHUD();
}

// ============================================================
// SETTLEMENTS
// ============================================================
function renderSettlements() {
  els.settlementsEl.innerHTML = '';
  S.settlements.forEach(s => {
    const div = document.createElement('div');
    div.className = 'settle-item';
    div.innerHTML = `
      <div class="settle-name">${s.label} <span>${s.tier}</span></div>
      <div class="settle-bar"><div class="settle-fill ${s.rebuild > 50 ? 'b' : 'a'}" style="width:${s.rebuild}%"></div></div>
      <div class="settle-quote">${s.quote}</div>
    `;
    els.settlementsEl.appendChild(div);
  });
}

// ============================================================
// NETWORK FEED
// ============================================================
function renderNetwork() {
  els.networkEl.innerHTML = S.networkFeed
    .map(f => `<div class="net-item">${f}</div>`).join('');
}

// ============================================================
// LOG
// ============================================================
let logTick = 0;
function tt() {
  const m = Math.floor(S.ticks / 170);
  const s = S.ticks % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function addLog(msg) {
  const el = document.createElement('span');
  el.className = 'log-line';
  el.innerHTML = `<span class="log-ts">[${tt()}]</span> ${msg}`;
  els.logEl.insertBefore(el, els.logEl.firstChild);
  const all = els.logEl.querySelectorAll('.log-line');
  if (all.length > 7) all[all.length - 1].remove();
}

// ============================================================
// HUD UPDATES
// ============================================================
function updateHUD() {
  els.delivered.textContent = S.delivered;
  els.scrip.textContent     = S.scrip + '¢';
  els.walked.textContent    = S.distKm + 'km';
  const stEl = els.status;
  stEl.textContent  = S.status;
  stEl.style.color  = STATUS_COLORS[S.status] || '#b1c9c3';
}

function renderCargoSlots() {
  els.cargoSlots.innerHTML = '';
  const total = S.maxSlots;
  // build slot array from inventory
  const used = [];
  S.inventory.forEach(pkg => {
    for (let i = 0; i < pkg.slots; i++) used.push(pkg.size);
  });
  for (let i = 0; i < total; i++) {
    const d = document.createElement('div');
    d.className = 'cslot ' + (used[i] || 'e');
    d.textContent = used[i] || '';
    els.cargoSlots.appendChild(d);
  }
  const pct = S.maxWeight > 0 ? Math.min(100, (S.usedWeight / S.maxWeight) * 100) : 0;
  els.cargoBar.style.width = pct + '%';
  els.cargoWeight.textContent = S.usedWeight + '/' + S.maxWeight + 'kg';
}

function renderBoots() {
  const d = Math.round(S.bootDurability);
  els.bootsVal.textContent = d + '%';
  els.bootsBar.style.width = d + '%';
  const cls = d > 50 ? '' : d > 25 ? ' worn' : ' bad';
  els.bootsBar.className = 'boots-bar-fill' + cls;
  els.sandalBadge.textContent = '+' + S.sandalCount + ' sandal';
}

function renderStamina() {
  const segs = 4;
  const perSeg = S.staminaMax / segs;
  for (let i = 0; i < segs; i++) {
    const seg = document.getElementById('sseg' + i);
    if (!seg) continue;
    const threshold = (i + 1) * perSeg;
    const prevThreshold = i * perSeg;
    if (S.stamina >= threshold) {
      seg.className = 'sseg full';
    } else if (S.stamina > prevThreshold) {
      // partially filled — show as half
      const segFill = (S.stamina - prevThreshold) / perSeg;
      seg.className = 'sseg ' + (segFill > 0.5 ? 'half' : 'crit');
    } else {
      seg.className = 'sseg empty';
    }
  }
  const canteenPct = Math.round((S.canteen / S.canteenMax) * 100);
  const drinkBtn = els.drinkBtn;
  drinkBtn.textContent = `drink water (${canteenPct}%)`;
  drinkBtn.disabled = S.canteen <= 0 || S.stamina >= S.staminaMax;
}

// ============================================================
// AUTOBUY BOOTS
// ============================================================
function checkAutobuy() {
  if (!S.autobuyBoots) return;
  if (S.bootDurability <= 20 && S.scrip >= 15) {
    S.scrip -= 15;
    S.bootDurability = 100;
    addLog('autobuy: new <span class="log-hi">boots</span> purchased (15¢)');
    updateHUD();
  } else if (S.bootDurability <= 5 && S.sandalCount > 0) {
    S.sandalCount--;
    S.bootDurability = Math.min(100, S.bootDurability + 40);
    S.usingMakeshift = true;
    addLog('<span class="log-wn">makeshift sandals equipped</span>');
  }
}

// ============================================================
// TRIP LOGIC
// ============================================================
function tripChance() {
  // 0 boots = highest chance; full = near zero
  const baseMult = (100 - S.bootDurability) / 100;
  // each missing stamina segment adds more
  const staminaSegsLost = Math.floor((S.staminaMax - S.stamina) / (S.staminaMax / 4));
  const staminaMult = 1 + staminaSegsLost * 0.5;
  return TRIP_CHANCE_BASE * baseMult * staminaMult;
}

function maybeTrip() {
  if (S.status !== 'walking' && S.status !== 'carrying') return;
  if (Math.random() < tripChance()) {
    S.status = 'tripped';
    S.tripTimer = 6; // ~2 seconds
    // damage boots on trip
    S.bootDurability = Math.max(0, S.bootDurability - 5);
    // if carrying a package, reduce its scrip value
    if (S.inventory.length > 0) {
      S.inventory[0].scrip = Math.max(1, Math.floor(S.inventory[0].scrip * 0.75));
      addLog('<span class="log-wn">tripped! package damaged — reduced payout</span>');
    } else {
      addLog('<span class="log-wn">tripped on loose rubble!</span>');
    }
    els.courierAt.className = 'tlh-at trip';
    els.courierAt.style.animation = 'trip 0.4s ease 3';
  }
}

// ============================================================
// STAMINA EFFECTS
// ============================================================
function staminaSegCount() {
  return Math.ceil(S.stamina / (S.staminaMax / 4));
}
function speedMultiplier() {
  const segsLost = 4 - staminaSegCount();
  // each lost seg = -15% effective speed (purely flavour for now; affects field scroll speed via CSS)
  let mult = 1 - (segsLost * 0.15);
  if (S.bootDurability <= 0) mult *= 0.5;  // no boots = very slow
  if (S.upgrades.rebuildRoads) mult *= 1.2;
  return Math.max(0.2, mult);
}

// ============================================================
// MAIN TICK
// ============================================================nlet cyclePhase = 'pickup'; // pickup | walk | deliver | return
let cycleTimer = 0;

function tick() {
  S.ticks++;

  // --- trip recovery ---
  if (S.tripTimer > 0) {
    S.tripTimer--;
    if (S.tripTimer === 0) {
      S.status = S.inventory.length > 0 ? 'carrying' : 'walking';
      els.courierAt.style.animation = '';
      els.courierAt.className = 'tlh-at' + (S.inventory.length > 0 ? ' carry' : '');
    }
    return;
  }

  // --- rest recovery ---
  if (S.status === 'resting') {
    S.restTimer--;
    if (S.restTimer <= 0) {
      S.stamina = S.staminaMax;
      S.status = 'walking';
      addLog('rested at shelter — <span class="log-hi">stamina fully restored</span>');
      els.courierAt.className = 'tlh-at';
      els.courierAt.style.animation = 'bounce 0.4s steps(1) infinite';
    }
    renderStamina();
    return;
  }

  // --- walking / carrying ---
  if (S.status === 'walking' || S.status === 'carrying') {
    // stamina drain
    S.stamina = Math.max(0, S.stamina - STAMINA_DRAIN);

    // boot drain
    let bootDrain = BOOT_DRAIN;
    if (S.upgrades.bootsT1) bootDrain *= 0.75;
    if (S.upgrades.bootsT2) bootDrain *= 0.5;
    if (S.usingMakeshift)   bootDrain *= 1.3;
    S.bootDurability = Math.max(0, S.bootDurability - bootDrain);

    // canteen refill from rain or river
    if (S.isRaining || S.inRiver) {
      S.canteen = Math.min(S.canteenMax, S.canteen + 0.4);
    }

    // distance
    if (S.ticks % 5 === 0) {
      S.distKm = Math.round(S.ticks * 0.035 * 10) / 10;
    }

    // maybe trip
    maybeTrip();

    // autobuy check
    checkAutobuy();

    // random rest trigger at shelter (low stamina)
    if (S.stamina < 50 && S.status === 'walking' && Math.random() < 0.03) {
      S.status = 'resting';
      S.restTimer = REST_TICKS_MIN + Math.floor(Math.random() * (REST_TICKS_MAX - REST_TICKS_MIN));
      addLog('<span class="log-wn">exhausted — resting at nearest shelter</span>');
      els.courierAt.className = 'tlh-at rest';
      els.courierAt.style.animation = '';
    }
  }

  // --- delivery cycle ---
  cycleTimer++;
  if (cycleTimer >= CARRY_TICKS) {
    cycleTimer = 0;
    advanceCycle();
  }

  // --- route dot ---
  S.dotT = (S.dotT + 0.006) % 1;
  updateRouteDot();

  // --- rain toggle (random) ---
  if (S.rainTimer > 0) {
    S.rainTimer--;
  } else if (Math.random() < 0.003) {
    setRain(!S.isRaining);
    S.rainTimer = 40 + Math.floor(Math.random() * 60);
  }

  // render
  renderBoots();
  renderStamina();
  renderCargoSlots();
  updateHUD();
}

function advanceCycle() {
  if (cyclePhase === 'pickup') {
    // pick up a random package that fits
    const candidates = PKG_DEFS.filter(p =>
      p.slots <= (S.maxSlots - S.usedSlots) &&
      p.kg    <= (S.maxWeight - S.usedWeight)
    );
    if (candidates.length > 0) {
      const def = candidates[Math.floor(Math.random() * candidates.length)];
      const pkg = { ...def, scrip: def.scrip };
      S.inventory.push(pkg);
      S.usedSlots  += pkg.slots;
      S.usedWeight += pkg.kg;
      S.status = 'carrying';
      els.courierPkg.textContent = `[${pkg.size}]`;
      els.courierPkg.style.visibility = 'visible';
      els.courierAt.className = 'tlh-at carry';
      els.courierAt.style.animation = 'bounce 0.4s steps(1) infinite';
      addLog(`picked up <span class="log-hi">[${pkg.size}] ${pkg.label}</span>`);
      cyclePhase = 'walk';
    }
  } else if (cyclePhase === 'walk') {
    cyclePhase = 'deliver';
  } else if (cyclePhase === 'deliver') {
    if (S.inventory.length > 0) {
      const pkg = S.inventory.shift();
      const earned = pkg.scrip;
      S.scrip      += earned;
      S.delivered  += 1;
      S.usedSlots  -= pkg.slots;
      S.usedWeight -= pkg.kg;
      // update settlement
      const settle = S.settlements[1]; // depot B for now
      settle.supply  = Math.min(100, settle.supply  + 2);
      settle.rebuild = Math.min(100, settle.rebuild + 1);
      if (S.inventory.length === 0) {
        els.courierPkg.style.visibility = 'hidden';
        els.courierAt.className = 'tlh-at';
      }
      S.status = 'returning';
      addLog(`delivered <span class="log-hi">[${pkg.size}] ${pkg.label}</span> — <span class="log-ok">+${earned}¢</span>`);
      renderSettlements();
    }
    cyclePhase = 'return';
  } else if (cyclePhase === 'return') {
    S.status = 'walking';
    els.courierAt.className = 'tlh-at';
    els.courierAt.style.animation = 'bounce 0.4s steps(1) infinite';
    cyclePhase = 'pickup';
  }
  renderUpgrades();
}

// ============================================================
// DRINK WATER
// ============================================================
function drinkWater() {
  if (S.canteen <= 0 || S.stamina >= S.staminaMax) return;
  const restore = (S.canteen / S.canteenMax) * S.staminaMax;
  S.stamina  = Math.min(S.staminaMax, S.stamina + restore);
  S.canteen  = 0;
  addLog('drank from canteen — <span class="log-hi">stamina restored</span>');
  renderStamina();
}

// ============================================================
// INIT
// ============================================================
function init() {
  buildField();
  buildRain();
  setRain(false);
  layoutRouteNodes();
  drawRouteMap();
  renderUpgrades();
  renderSettlements();
  renderNetwork();
  renderCargoSlots();
  renderBoots();
  renderStamina();
  updateHUD();

  // boot log entry
  addLog('system initialized — courier standing by at <span class="log-hi">depot a</span>');

  // set initial walk animation
  els.courierAt.style.animation = 'bounce 0.4s steps(1) infinite';
  S.status = 'walking';

  // UI listeners
  els.autobuyBtn.addEventListener('click', () => {
    S.autobuyBoots = !S.autobuyBoots;
    els.autobuyBtn.textContent = 'autobuy: ' + (S.autobuyBoots ? 'on' : 'off');
    els.autobuyBtn.classList.toggle('on', S.autobuyBoots);
  });

  els.drinkBtn.addEventListener('click', drinkWater);

  setInterval(tick, TICK_MS);
}

// wait for DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
