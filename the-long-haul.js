/* ==============================================
   THE LONG HAUL — game logic
   v0.0.3
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
      id = 'TLH-' + hex() + hex();
      localStorage.setItem(LS_KEY, id);
    }
    return id;
  } catch (e) {
    return 'TLH-OFFLINE';
  }
}

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
  status: 'walking', // idle | walking | carrying | delivering | returning | resting | tripped
  restTimer: 0,
  tripTimer: 0,

  // cargo
  maxSlots: 6,
  usedSlots: 0,
  maxWeight: 5,
  usedWeight: 0,
  inventory: [], // { size, label, kg, slots, scrip, isLost }

  // boots
  bootDurability: 80,
  autobuyBoots: false,
  sandalCount: 0,
  usingMakeshift: false,

  // stamina: 0-400 (4 segs x 100)
  stamina: 400,
  staminaMax: 400,
  prevStaminaSeg: 4, // track segment crossings for autodrink

  // canteen
  canteen: 100,
  canteenMax: 100,
  autodrink: false,

  // environment
  isRaining: false,
  rainTimer: 0,
  inRiver: false,

  // upgrades
  upgrades: {
    bootsT1:     false,
    bootsT2:     false,
    cargoSling:  false,
    cargoPack:   false,
    cargoWeight: false,
    rebuildRoads:false,
    steadyFeet:  false,
  },

  // settlements — keyed by node id
  settlements: {
    'A': { label:'depot a', tier:'waypoint', supply:65, rebuild:65, quote:'"a fire and four walls"'   },
    'B': { label:'depot b', tier:'outpost',  supply:34, rebuild:34, quote:'"new roof going up"'       },
    '?': { label:'???',     tier:'unknown',  supply:5,  rebuild:5,  quote:'"signal detected west"'   },
    'C': { label:'ruins',   tier:'ruins',    supply:10, rebuild:8,  quote:'"danger. high trip risk."' },
    'H': { label:'home',    tier:'shelter',  supply:80, rebuild:70, quote:'"hot food. safe walls."'   },
    '·': { label:'waypoint',tier:'waypoint', supply:40, rebuild:30, quote:'"a painted stone marker"' },
  },

  // route — circular edge list; courier walks each in order
  routeNodes: [
    { id:'A', label:'depot a',  x:0, y:0, known:true  },
    { id:'?', label:'???',      x:0, y:0, known:false },
    { id:'B', label:'depot b',  x:0, y:0, known:true  },
    { id:'C', label:'ruins',    x:0, y:0, known:false },
    { id:'H', label:'home',     x:0, y:0, known:true  },
    { id:'·', label:'waypoint', x:0, y:0, known:true  },
  ],
  edges: [['A','?'],['?','B'],['B','C'],['C','H'],['H','·'],['·','A']],
  edgeIdx: 2,   // start on B->C
  dotT: 0,

  // delivery queue: packages waiting at each node
  // filled by advanceCycle when porter arrives
  pendingDelivery: null, // { pkg, destNodeId }

  networkFeed: [
    '<span class="net-hi">visitor</span> rebuilt 3m of north road',
    'lost pkg recovered: <span class="net-ac">[m] tools</span>',
    '<span class="net-hi">2 others</span> online today',
  ],
};

// ============================================================
// CONSTANTS
// ============================================================
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

// nodes where packages are more dangerous / harder to find
const RISKY_NODES = new Set(['C', '?']);

const TICK_MS          = 350;
const STAMINA_DRAIN    = 0.28;
const BOOT_DRAIN       = 0.12;
const TRIP_CHANCE_BASE = 0.006; // per tick when boots=0, stamina=0
const CATCH_CHANCE_BASE= 0.35;  // max catch chance at full boots+stamina
const REST_TICKS_MIN   = 43;
const REST_TICKS_MAX   = 86;
const EDGE_TICKS       = 18;    // ticks to traverse one edge

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
// DOM REFS (resolved after DOMContentLoaded)
// ============================================================
const $ = id => document.getElementById(id);
let els = {};

function resolveEls() {
  els = {
    porterIdEl:   $('porterIdEl'),
    delivered:    $('hDelivered'),
    scrip:        $('hScrip'),
    walked:       $('hWalked'),
    status:       $('hStatus'),
    courierAt:    $('courierAt'),
    courierPkg:   $('courierPkg'),
    fieldstrip:   $('fieldstrip'),
    rainOverlay:  $('rainOverlay'),
    cargoSlots:   $('cargoSlots'),
    cargoBar:     $('cargoBar'),
    cargoWeight:  $('cargoWeight'),
    bootsBar:     $('bootsBar'),
    bootsVal:     $('bootsVal'),
    autobuyBtn:   $('autobuyBtn'),
    sandalBadge:  $('sandalBadge'),
    drinkBtn:     $('drinkBtn'),
    autodrinkBtn: $('autodrinkBtn'),
    canteenBar:   $('canteenBar'),
    logEl:        $('logEl'),
    upgradesEl:   $('upgradesEl'),
    settlementsEl:$('settlementsEl'),
    routeSvg:     $('routeSvg'),
    networkEl:    $('networkEl'),
  };
}

// ============================================================
// TERRAIN: ZONE-BASED FIELD GENERATION
// ============================================================
// Zone types define character palettes and widths.
// The strip is assembled from a sequence of zones so each
// biome reads as a coherent stretch rather than noise.

const ZONE_TYPES = {
  road: {
    weight: 40,
    width: [12, 22],
    // flat packed-dirt road: dashes and dots
    chars: [
      { ch: '-',  cls: 'fc-rn', w: 5 },
      { ch: '.',  cls: 'fc-fl', w: 4 },
      { ch: '_',  cls: 'fc-rn', w: 3 },
      { ch: '\u00b7', cls: 'fc-fl', w: 2 },
    ],
    pkgChance: 0.04,
    sandalChance: 0.01,
  },
  scrub: {
    weight: 25,
    width: [8, 16],
    // low scrubland: commas, backticks, apostrophes
    chars: [
      { ch: ',',  cls: 'fc-fl', w: 5 },
      { ch: '`',  cls: 'fc-fl', w: 4 },
      { ch: "'",  cls: 'fc-fl', w: 4 },
      { ch: '.',  cls: 'fc-fl', w: 3 },
      { ch: '*',  cls: 'fc-sw-plant', w: 1 }, // sandalweed in scrub
    ],
    pkgChance: 0.05,
    sandalChance: 0.03,
  },
  wetlands: {
    weight: 12,
    width: [6, 14],
    // tilde-heavy, occasional reeds
    chars: [
      { ch: '~',  cls: 'fc-sw', w: 8 },
      { ch: '|',  cls: 'fc-sg', w: 2 },
      { ch: '~',  cls: 'fc-sw', w: 6 },
      { ch: ',',  cls: 'fc-fl', w: 1 },
    ],
    pkgChance: 0.02,
    sandalChance: 0.00,
    refillsCanteen: true,
  },
  ruins: {
    weight: 15,
    width: [10, 20],
    // structural debris: pipes, equals, hash, brackets
    chars: [
      { ch: '=',  cls: 'fc-rn', w: 4 },
      { ch: '|',  cls: 'fc-sg', w: 3 },
      { ch: '_',  cls: 'fc-rn', w: 3 },
      { ch: '#',  cls: 'fc-rn', w: 1 },
      { ch: '[',  cls: 'fc-sg', w: 1 },
      { ch: ']',  cls: 'fc-sg', w: 1 },
    ],
    pkgChance: 0.09, // more packages in ruins
    sandalChance: 0.01,
    risky: true,
  },
  depot_approach: {
    weight: 8,
    width: [6, 10],
    // cleared ground near a settlement
    chars: [
      { ch: '.',  cls: 'fc-fl', w: 6 },
      { ch: '-',  cls: 'fc-rn', w: 3 },
      { ch: ',',  cls: 'fc-fl', w: 2 },
    ],
    pkgChance: 0.08, // packages cluster near depots
    sandalChance: 0.00,
    isDepotApproach: true,
  },
};

function weightedZonePick() {
  const keys = Object.keys(ZONE_TYPES);
  const total = keys.reduce((s, k) => s + ZONE_TYPES[k].weight, 0);
  let r = Math.random() * total;
  for (const k of keys) {
    r -= ZONE_TYPES[k].weight;
    if (r <= 0) return k;
  }
  return 'road';
}

function weightedCharPick(chars) {
  const total = chars.reduce((s, c) => s + c.w, 0);
  let r = Math.random() * total;
  for (const c of chars) {
    r -= c.w;
    if (r <= 0) return c;
  }
  return chars[0];
}

function buildDepotScene(nodeId) {
  // Returns an HTML string for a small depot ascii structure
  const scenes = {
    'A': ' /--\\ \n[_A_]\n |   |',
    'B': ' /\_/\ \n[___]\n| B |',
    'H': '  /\\  \n /  \ \n[HOME]',
    '·': '  !  \n  |  \n====',
  };
  const scene = scenes[nodeId] || (' ??? ');
  return scene.split('\n').map((l, i) =>
    `<span class="ds-line${i === 0 ? ' ds-roof' : i === 2 ? ' ds-base' : ''}">${l}</span>`
  ).join('\n');
}

function buildField() {
  let h = '';
  const TARGET_CHARS = 600; // long enough that seam takes >40s to cycle
  let count = 0;

  while (count < TARGET_CHARS) {
    const zoneKey = weightedZonePick();
    const zone = ZONE_TYPES[zoneKey];
    const [minW, maxW] = zone.width;
    const zoneLen = minW + Math.floor(Math.random() * (maxW - minW));

    // optionally inject a depot scene block into depot_approach zones
    if (zone.isDepotApproach && Math.random() < 0.4) {
      // small gap then depot ascii, then gap
      h += `<span class="fc fc-fl">   </span>`;
      h += `<span class="fc fc-depot"> [=] </span>`;
      h += `<span class="fc fc-fl">   </span>`;
      count += 9;
    }

    for (let i = 0; i < zoneLen && count < TARGET_CHARS; i++) {
      const r = Math.random();

      // package spawn — weighted by zone
      if (r < zone.pkgChance && (count % 8 === 0)) {
        const isLost = Math.random() < 0.15;
        const pkgSize = Math.random() < 0.6 ? 's' : Math.random() < 0.7 ? 'm' : 'l';
        const cls = isLost ? 'fc-pk fc-pk-lost' : 'fc-pk';
        h += `<span class="fc ${cls}" data-pkg="${pkgSize}">[${pkgSize}]</span>`;
        count += 3;
        i += 2;
        continue;
      }

      // sandalweed spawn
      if (r < zone.pkgChance + zone.sandalChance) {
        h += `<span class="fc fc-sw-plant" title="sandalweed"> * </span>`;
        count += 3;
        i++;
        continue;
      }

      // normal terrain char
      const c = weightedCharPick(zone.chars);
      h += `<span class="fc ${c.cls}"> ${c.ch} </span>`;
      count += 3;
    }

    // zone separator: a small gap
    h += `<span class="fc fc-fl">  </span>`;
    count += 2;
  }

  // duplicate for seamless loop
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
    d.style.cssText =
      `position:absolute;left:${Math.random()*100}%;top:0;font-size:10px;` +
      `color:#1e5554;font-family:'Source Code Pro',monospace;` +
      `animation:raindrop ${dur}s linear ${delay}s infinite;`;
    els.rainOverlay.appendChild(d);
  }
}

function setRain(on) {
  S.isRaining = on;
  els.rainOverlay.style.display = on ? 'block' : 'none';
  if (on) {
    S.canteen = Math.min(S.canteenMax, S.canteen + 30);
    addLog('<span class="log-wn">rain begins — canteen refilling</span>');
  } else {
    addLog('rain clears');
  }
}

// ============================================================
// ROUTE MAP
// ============================================================
function layoutRouteNodes() {
  const W = 110;
  const positions = [
    { id:'A', x:W/2,  y:18  },
    { id:'?', x:W-14, y:65  },
    { id:'B', x:W-14, y:128 },
    { id:'C', x:W/2,  y:175 },
    { id:'H', x:14,   y:128 },
    { id:'·', x:14,   y:65  },
  ];
  positions.forEach(p => {
    const n = S.routeNodes.find(n => n.id === p.id);
    if (n) { n.x = p.x; n.y = p.y; }
  });
}

function currentEdge() {
  return S.edges[S.edgeIdx % S.edges.length];
}

function drawRouteMap() {
  const svg = els.routeSvg;
  svg.innerHTML = '';
  const ns = 'http://www.w3.org/2000/svg';
  const [fromId, toId] = currentEdge();

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

  S.routeNodes.forEach(n => {
    const g = document.createElementNS(ns, 'g');
    g.style.cursor = 'pointer';
    g.title = n.label;
    const isCurrent = (n.id === fromId || n.id === toId);
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
  const [fromId, toId] = currentEdge();
  const from = S.routeNodes.find(n => n.id === fromId);
  const to   = S.routeNodes.find(n => n.id === toId);
  if (!from || !to) return;
  dot.setAttribute('cx', from.x + (to.x - from.x) * S.dotT);
  dot.setAttribute('cy', from.y + (to.y - from.y) * S.dotT);
}

// ============================================================
// UPGRADES
// ============================================================
const UPGRADE_DEFS = [
  {
    id: 'bootsT1', name: 'sturdy boots', desc: '+25% boot durability',
    cost: 30, requires: null,
    apply: () => {},
  },
  {
    id: 'bootsT2', name: 'reinforced soles', desc: '+50% boot durability',
    cost: 90, requires: 'bootsT1',
    apply: () => {},
  },
  {
    id: 'steadyFeet', name: 'steady feet', desc: '-30% trip chance, +15% catch',
    cost: 120, requires: null,
    apply: () => {},
  },
  {
    id: 'cargoSling', name: 'cargo sling', desc: '+2 carry slots',
    cost: 80, requires: null,
    apply: () => { S.maxSlots += 2; },
  },
  {
    id: 'cargoPack', name: 'expedition pack', desc: '+3 more carry slots',
    cost: 180, requires: 'cargoSling',
    apply: () => { S.maxSlots += 3; },
  },
  {
    id: 'cargoWeight', name: 'pack mule rig', desc: '+5 kg capacity',
    cost: 150, requires: null,
    apply: () => { S.maxWeight += 5; },
  },
  {
    id: 'rebuildRoads', name: 'rebuild roads', desc: 'passively faster travel',
    cost: 200, requires: null,
    apply: () => {},
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
      btn.textContent = 'owned'; btn.disabled = true;
    } else if (!reqMet) {
      btn.textContent = '???¢'; btn.disabled = true;
    } else {
      btn.textContent = def.cost + '¢';
      btn.disabled = !canAfford;
      btn.addEventListener('click', () => buyUpgrade(def.id));
    }
    row.appendChild(nameEl); row.appendChild(btn);
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
  // only show known settlements
  const known = S.routeNodes
    .filter(n => n.known && S.settlements[n.id])
    .map(n => ({ id: n.id, ...S.settlements[n.id] }));
  known.forEach(s => {
    const div = document.createElement('div');
    div.className = 'settle-item';
    div.innerHTML = `
      <div class="settle-name">${s.label} <span>${s.tier}</span></div>
      <div class="settle-bar"><div class="settle-fill ${s.rebuild > 50 ? 'b' : 'a'}" style="width:${Math.round(s.rebuild)}%"></div></div>
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
// HUD
// ============================================================
function updateHUD() {
  els.delivered.textContent = S.delivered;
  els.scrip.textContent     = S.scrip + '¢';
  els.walked.textContent    = S.distKm + 'km';
  els.status.textContent    = S.status;
  els.status.style.color    = STATUS_COLORS[S.status] || '#b1c9c3';
}

function renderCargoSlots() {
  els.cargoSlots.innerHTML = '';
  const used = [];
  S.inventory.forEach(pkg => { for (let i = 0; i < pkg.slots; i++) used.push(pkg.size); });
  for (let i = 0; i < S.maxSlots; i++) {
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

function staminaSegCount() {
  return Math.min(4, Math.ceil(S.stamina / (S.staminaMax / 4)));
}

function renderStamina() {
  const perSeg = S.staminaMax / 4;
  for (let i = 0; i < 4; i++) {
    const seg = document.getElementById('sseg' + i);
    if (!seg) continue;
    const floor = i * perSeg;
    const ceil  = (i + 1) * perSeg;
    if (S.stamina >= ceil)       seg.className = 'sseg full';
    else if (S.stamina > floor)  seg.className = 'sseg ' + ((S.stamina - floor) / perSeg > 0.5 ? 'half' : 'crit');
    else                         seg.className = 'sseg empty';
  }

  // autodrink: fire when a full segment just emptied
  const nowSegs = staminaSegCount();
  if (S.autodrink && nowSegs < S.prevStaminaSeg && S.canteen > 0) {
    drinkWater();
  }
  S.prevStaminaSeg = nowSegs;

  const canteenPct = Math.round((S.canteen / S.canteenMax) * 100);
  els.drinkBtn.textContent = `drink (${canteenPct}%)`;
  els.drinkBtn.disabled = S.canteen <= 0 || S.stamina >= S.staminaMax;
  els.canteenBar.style.width = canteenPct + '%';
}

// ============================================================
// AUTOBUY BOOTS
// ============================================================
function checkAutobuy() {
  if (!S.autobuyBoots) return;
  if (S.bootDurability <= 20 && S.scrip >= 15) {
    S.scrip -= 15;
    S.bootDurability = 100;
    S.usingMakeshift = false;
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
// TRIP / CATCH LOGIC
// ============================================================
function tripChance() {
  const bootFail     = (100 - S.bootDurability) / 100;
  const segsLost     = 4 - staminaSegCount();
  const staminaMult  = 1 + segsLost * 0.5;
  let chance = TRIP_CHANCE_BASE * bootFail * staminaMult;
  if (S.upgrades.steadyFeet) chance *= 0.70;
  return chance;
}

function catchChance() {
  const bootFactor    = S.bootDurability / 100;
  const staminaFactor = S.stamina / S.staminaMax;
  let chance = CATCH_CHANCE_BASE * ((bootFactor + staminaFactor) / 2);
  if (S.upgrades.steadyFeet) chance += 0.15;
  return Math.min(0.85, chance);
}

function maybeTrip() {
  if (S.status !== 'walking' && S.status !== 'carrying') return;
  if (Math.random() >= tripChance()) return;

  // trip roll fired — check catch
  if (Math.random() < catchChance()) {
    addLog('stumbled on debris — <span class="log-ok">caught yourself</span>');
    return;
  }

  // actual fall
  S.status = 'tripped';
  S.tripTimer = 6;
  S.bootDurability = Math.max(0, S.bootDurability - 5);
  if (S.inventory.length > 0) {
    S.inventory[0].scrip = Math.max(1, Math.floor(S.inventory[0].scrip * 0.75));
    addLog('<span class="log-wn">tripped! package damaged — reduced payout</span>');
  } else {
    addLog('<span class="log-wn">tripped on loose rubble!</span>');
  }
  els.courierAt.className = 'tlh-at trip';
  els.courierAt.style.animation = 'trip 0.4s ease 3';
}

// ============================================================
// SPEED
// ============================================================
function speedMultiplier() {
  const segsLost = 4 - staminaSegCount();
  let mult = 1 - (segsLost * 0.15);
  if (S.bootDurability <= 0) mult *= 0.5;
  if (S.upgrades.rebuildRoads) mult *= 1.2;
  return Math.max(0.2, mult);
}

// ============================================================
// DELIVERY CYCLE
// ============================================================
let edgeTicker = 0;   // counts ticks within current edge
let cyclePhase = 'pickup'; // pickup | transit | deliver | return

function advanceCycle() {
  if (cyclePhase === 'pickup') {
    // pick a package (85% NPC, 15% lost player pkg)
    const pool = Math.random() < 0.15 ? LOST_PKGS : NPC_PKGS;
    const candidates = pool.filter(p =>
      p.slots <= (S.maxSlots - S.usedSlots) &&
      p.kg    <= (S.maxWeight - S.usedWeight)
    );
    if (candidates.length === 0) return; // can't carry anything; try next tick

    const def = candidates[Math.floor(Math.random() * candidates.length)];
    const pkg = { ...def };
    // destination: the node at the far end of the current edge
    const destId = currentEdge()[1];
    S.pendingDelivery = { pkg, destId };
    S.inventory.push(pkg);
    S.usedSlots  += pkg.slots;
    S.usedWeight += pkg.kg;
    S.status = 'carrying';
    els.courierPkg.textContent = `[${pkg.size}]`;
    els.courierPkg.style.visibility = 'visible';
    els.courierAt.className = 'tlh-at carry';
    els.courierAt.style.animation = 'bounce 0.4s steps(1) infinite';
    const lostTag = pkg.isLost ? ' <span class="log-wn">[lost pkg]</span>' : '';
    addLog(`picked up <span class="log-hi">[${pkg.size}] ${pkg.label}</span>${lostTag}`);
    cyclePhase = 'transit';

  } else if (cyclePhase === 'transit') {
    cyclePhase = 'deliver';

  } else if (cyclePhase === 'deliver') {
    if (S.pendingDelivery && S.inventory.length > 0) {
      const { pkg, destId } = S.pendingDelivery;
      const earned = pkg.scrip;
      S.scrip      += earned;
      S.delivered  += 1;
      S.usedSlots  -= pkg.slots;
      S.usedWeight -= pkg.kg;
      S.inventory.splice(S.inventory.indexOf(pkg), 1);
      S.pendingDelivery = null;

      // credit the destination settlement
      const settle = S.settlements[destId];
      if (settle) {
        settle.supply  = Math.min(100, settle.supply  + 3);
        settle.rebuild = Math.min(100, settle.rebuild + 1);
      }
      // reveal node if unknown
      const node = S.routeNodes.find(n => n.id === destId);
      if (node && !node.known) {
        node.known = true;
        addLog(`discovered: <span class="log-hi">${node.label}</span>`);
        drawRouteMap();
      }

      if (S.inventory.length === 0) {
        els.courierPkg.style.visibility = 'hidden';
        els.courierAt.className = 'tlh-at';
      }
      S.status = 'returning';
      addLog(`delivered to <span class="log-hi">${S.settlements[destId] ? S.settlements[destId].label : destId}</span> — <span class="log-ok">+${earned}¢</span>`);
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
  const staminaNeeded  = S.staminaMax - S.stamina;
  const staminaRestored = Math.min(staminaNeeded, (S.canteen / S.canteenMax) * S.staminaMax);
  const canteenUsed    = (staminaRestored / S.staminaMax) * S.canteenMax;
  S.stamina  = Math.min(S.staminaMax, S.stamina + staminaRestored);
  S.canteen  = Math.max(0, S.canteen - canteenUsed);
  addLog(`drank from canteen — <span class="log-hi">+${Math.round(staminaRestored / S.staminaMax * 100)}% stamina</span>`);
}

// ============================================================
// MAIN TICK
// ============================================================
function tick() {
  S.ticks++;

  // --- trip recovery ---
  if (S.tripTimer > 0) {
    S.tripTimer--;
    if (S.tripTimer === 0) {
      S.status = S.inventory.length > 0 ? 'carrying' : 'walking';
      els.courierAt.style.animation = 'bounce 0.4s steps(1) infinite';
      els.courierAt.className = 'tlh-at' + (S.inventory.length > 0 ? ' carry' : '');
    }
    renderBoots(); renderStamina(); updateHUD();
    return;
  }

  // --- resting ---
  if (S.status === 'resting') {
    S.restTimer--;
    if (S.restTimer <= 0) {
      S.stamina = S.staminaMax;
      S.canteen = Math.min(S.canteenMax, S.canteen + 20); // shelter top-up
      S.status = 'walking';
      addLog('rested at shelter — <span class="log-hi">stamina fully restored</span>');
      els.courierAt.className = 'tlh-at';
      els.courierAt.style.animation = 'bounce 0.4s steps(1) infinite';
    }
    renderStamina(); updateHUD();
    return;
  }

  // --- walking / carrying ---
  if (S.status === 'walking' || S.status === 'carrying') {
    S.stamina = Math.max(0, S.stamina - STAMINA_DRAIN);

    let bootDrain = BOOT_DRAIN;
    if (S.upgrades.bootsT1) bootDrain *= 0.75;
    if (S.upgrades.bootsT2) bootDrain *= 0.50;
    if (S.usingMakeshift)   bootDrain *= 1.30;
    S.bootDurability = Math.max(0, S.bootDurability - bootDrain);

    if (S.isRaining || S.inRiver) {
      S.canteen = Math.min(S.canteenMax, S.canteen + 0.4);
    }

    if (S.ticks % 5 === 0) {
      const speed = speedMultiplier();
      S.distKm = Math.round(S.ticks * 0.035 * speed * 10) / 10;
    }

    maybeTrip();
    checkAutobuy();

    // low-stamina auto-rest at shelter node
    if (S.stamina < 50 && S.status === 'walking' && Math.random() < 0.03) {
      S.status = 'resting';
      S.restTimer = REST_TICKS_MIN + Math.floor(Math.random() * (REST_TICKS_MAX - REST_TICKS_MIN));
      addLog('<span class="log-wn">exhausted — resting at nearest shelter</span>');
      els.courierAt.className = 'tlh-at rest';
      els.courierAt.style.animation = '';
    }
  }

  // --- edge / route dot ---
  S.dotT += 0.006 * speedMultiplier();
  if (S.dotT >= 1) {
    S.dotT = 0;
    S.edgeIdx = (S.edgeIdx + 1) % S.edges.length;
    // mark destination node as known when we arrive
    const arrivedAt = currentEdge()[0]; // we just finished previous edge, now at its "to" node
    const node = S.routeNodes.find(n => n.id === arrivedAt);
    if (node && !node.known) {
      node.known = true;
      addLog(`discovered: <span class="log-hi">${node.label}</span>`);
    }
    drawRouteMap();
    // advance delivery cycle on arrival
    advanceCycle();
  } else {
    updateRouteDot();
  }

  // --- edge-based delivery cycle (mid-edge pickup) ---
  edgeTicker++;
  if (edgeTicker >= EDGE_TICKS) {
    edgeTicker = 0;
    if (cyclePhase === 'pickup') advanceCycle();
    else if (cyclePhase === 'transit') advanceCycle();
  }

  // --- rain ---
  if (S.rainTimer > 0) {
    S.rainTimer--;
  } else if (Math.random() < 0.003) {
    setRain(!S.isRaining);
    S.rainTimer = 40 + Math.floor(Math.random() * 60);
  }

  renderBoots();
  renderStamina();
  renderCargoSlots();
  updateHUD();
}

// ============================================================
// INIT
// ============================================================
function init() {
  resolveEls();

  // porter ID
  const porterId = getPorterId();
  if (els.porterIdEl) els.porterIdEl.textContent = porterId;

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

  addLog(`porter <span class="log-hi">${porterId}</span> online at <span class="log-hi">depot a</span>`);

  els.courierAt.style.animation = 'bounce 0.4s steps(1) infinite';

  els.autobuyBtn.addEventListener('click', () => {
    S.autobuyBoots = !S.autobuyBoots;
    els.autobuyBtn.textContent = 'autobuy: ' + (S.autobuyBoots ? 'on' : 'off');
    els.autobuyBtn.classList.toggle('on', S.autobuyBoots);
  });

  els.drinkBtn.addEventListener('click', drinkWater);

  els.autodrinkBtn.addEventListener('click', () => {
    S.autodrink = !S.autodrink;
    els.autodrinkBtn.textContent = 'auto: ' + (S.autodrink ? 'on' : 'off');
    els.autodrinkBtn.classList.toggle('on', S.autodrink);
  });

  setInterval(tick, TICK_MS);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
