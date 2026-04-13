/* ==============================================
   THE LONG HAUL — game logic
   v0.0.5
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
const CELLS_PER_EDGE   = 260;  // terrain cells per route leg
const VIEWPORT_CELLS   = 64;   // cells visible at once
const COURIER_CELL     = 16;   // courier sits at this offset within viewport
const PKG_PICKUP_RANGE = 6;    // cells ahead of courier to scan
const PKG_MAX_PER_EDGE = 14;   // active package cap per edge
const PKG_RESPAWN_TICKS = 800; // ticks before picked pkg respawns

// ============================================================
// ZONE TYPES
// ============================================================
const ZONE_TYPES = {
  road: {
    weight: 40, width: [12, 22],
    chars: [
      { ch: '-',      cls: 'fc-rn', w: 5 },
      { ch: '.',      cls: 'fc-fl', w: 4 },
      { ch: '_',      cls: 'fc-rn', w: 3 },
      { ch: '\u00b7', cls: 'fc-fl', w: 2 },
    ],
    pkgChance: 0.04, sandalChance: 0.01,
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
    pkgChance: 0.05, sandalChance: 0.03,
  },
  wetlands: {
    weight: 12, width: [6, 14],
    chars: [
      { ch: '~', cls: 'fc-sw', w: 8 },
      { ch: '|', cls: 'fc-sg', w: 2 },
      { ch: '~', cls: 'fc-sw', w: 6 },
      { ch: ',', cls: 'fc-fl', w: 1 },
    ],
    pkgChance: 0.02, sandalChance: 0.00, refillsCanteen: true,
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
    pkgChance: 0.09, sandalChance: 0.01, risky: true,
  },
  depot_approach: {
    weight: 8, width: [6, 10],
    chars: [
      { ch: '.', cls: 'fc-fl', w: 6 },
      { ch: '-', cls: 'fc-rn', w: 3 },
      { ch: ',', cls: 'fc-fl', w: 2 },
    ],
    pkgChance: 0.08, sandalChance: 0.00, isDepotApproach: true,
  },
};

// Edges leading into risky destinations get a trip chance bonus (7e)
const RISKY_EDGE_DEST = new Set(['C', '?']);

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

const TICK_MS           = 350;
const STAMINA_DRAIN     = 0.28;
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

// ============================================================
// STATE
// ============================================================
const S = {
  delivered: 0,
  scrip: 0,
  distKm: 0,
  ticks: 0,

  status: 'walking',
  restTimer: 0,
  tripTimer: 0,

  maxSlots: 6,
  usedSlots: 0,
  maxWeight: 5,
  usedWeight: 0,
  inventory: [],

  tieDownActive: false,

  bootDurability: 80,
  autobuyBoots: false,
  bootClipCount: 0,
  bootClipMax: 0,
  usingMakeshift: false,

  stamina: 400,
  staminaMax: 400,
  staminaOverboost: false,
  prevStaminaSeg: 4,

  canteen: 100,
  canteenMax: 100,
  autodrink: false,

  isRaining: false,
  rainTimer: 0,
  inRiver: false,

  upgrades: {
    bootsT1:     false,
    bootsT2:     false,
    bootClip1:   false,
    bootClip2:   false,
    cargoSling:  false,
    cargoPack:   false,
    cargoWeight: false,
    rebuildRoads:false,
    steadyFeet:  false,
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
    { id:'A',       label:'depot a',  x:0, y:0, known:true  },
    { id:'?',       label:'???',      x:0, y:0, known:false },
    { id:'B',       label:'depot b',  x:0, y:0, known:true  },
    { id:'C',       label:'ruins',    x:0, y:0, known:false },
    { id:'H',       label:'home',     x:0, y:0, known:true  },
    { id:'\u00b7',  label:'waypoint', x:0, y:0, known:true  },
  ],
  edges: [['A','?'],['?','B'],['B','C'],['C','H'],['H','\u00b7'],['\u00b7','A']],
  edgeIdx: 2,
  dotT: 0,
  worldPos: 0,

  pendingDelivery: null,

  networkFeed: [
    '<span class="net-hi">visitor</span> rebuilt 3m of north road',
    'lost pkg recovered: <span class="net-ac">[m] tools</span>',
    '<span class="net-hi">2 others</span> online today',
  ],
};

// ============================================================
// WORLD CELLS
// Each cell: { html, pkg, risky, edgeIdx }
// pkg (if present): { size, label, kg, slots, scrip, isLost, destId, picked, respawnIn }
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
          worldCells.push({ html: `<span class="fc fc-sw-plant" title="sandalweed"> * </span>`, pkg: null, risky: isRisky, edgeIdx: ei });
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
// WORLD SCROLL — JS-driven transform, no CSS animation
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
  const leftCell    = Math.floor(S.worldPos);
  const renderCount = VIEWPORT_CELLS + 4;
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
// PACKAGE PICKUP — proximity scan ahead of courier
// ============================================================
function scanForPickup() {
  if (S.status !== 'walking' && S.status !== 'carrying') return;
  const courierCell = Math.floor((S.edgeIdx * CELLS_PER_EDGE) + (S.dotT * CELLS_PER_EDGE));
  for (let offset = 0; offset <= PKG_PICKUP_RANGE; offset++) {
    const ci   = (courierCell + offset) % TOTAL_CELLS;
    const cell = worldCells[ci];
    if (!cell || !cell.pkg || cell.pkg.picked) continue;
    const pkg = cell.pkg;
    if (pkg.slots > S.maxSlots - S.usedSlots) continue;
    if (pkg.kg    > S.maxWeight - S.usedWeight) continue;

    pkg.picked = true;
    const carried = {
      size: pkg.size, label: pkg.label, kg: pkg.kg, slots: pkg.slots,
      scrip: pkg.scrip, isLost: pkg.isLost, destId: pkg.destId,
      _worldCell: ci,
    };
    S.inventory.push(carried);
    S.usedSlots  += carried.slots;
    S.usedWeight += carried.kg;
    S.status = 'carrying';
    renderCourierStack();
    renderCargoSlots(true);
    if (els.courierAt) els.courierAt.className = 'tlh-at bounce carry';
    const lostTag = carried.isLost ? ' <span class="log-wn">[lost pkg]</span>' : '';
    addLog(`picked up <span class="log-hi">[${carried.size}] ${carried.label}</span>${lostTag}`);
    break;
  }
}

// ============================================================
// PACKAGE DELIVERY — called on node arrival
// ============================================================
function tryDeliver(arrivedNodeId) {
  const toDeliver = S.inventory.filter(p => p.destId === arrivedNodeId);
  if (toDeliver.length === 0) return;
  toDeliver.forEach(pkg => {
    S.scrip      += pkg.scrip;
    S.delivered  += 1;
    S.usedSlots  -= pkg.slots;
    S.usedWeight -= pkg.kg;
    S.inventory.splice(S.inventory.indexOf(pkg), 1);
    if (pkg._worldCell !== undefined && worldCells[pkg._worldCell]) {
      worldCells[pkg._worldCell].pkg.respawnIn = PKG_RESPAWN_TICKS;
    }
    const settle = S.settlements[arrivedNodeId];
    if (settle) { settle.supply = Math.min(100, settle.supply + 3); settle.rebuild = Math.min(100, settle.rebuild + 1); }
    const node = S.routeNodes.find(n => n.id === arrivedNodeId);
    if (node && !node.known) {
      node.known = true;
      addLog(`discovered: <span class="log-hi">${node.label}</span>`);
      drawRouteMap();
    }
    addLog(`delivered to <span class="log-hi">${settle ? settle.label : arrivedNodeId}</span> \u2014 <span class="log-ok">+${pkg.scrip}\u00a2</span>`);
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
  const label = node.known ? node.label : '???';
  els.destDrift.innerHTML =
    `<span class="dest-glyph">${glyph.replace(/\n/g, '<br>')}</span>` +
    `<span class="dest-label">${label}</span>`;
  // fix 2: restart animation starting from inside the visible viewport
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
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', na.x); line.setAttribute('y1', na.y);
    line.setAttribute('x2', nb.x); line.setAttribute('y2', nb.y);
    line.setAttribute('stroke', na.known && nb.known ? '#2a5c5a' : '#132e2d');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-dasharray', '3 3');
    svg.appendChild(line);
  });
  S.routeNodes.forEach(n => {
    const isCurrent = (n.id === fromId || n.id === toId);
    const g = document.createElementNS(ns, 'g'); g.style.cursor = 'pointer'; g.title = n.label;
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', n.x); c.setAttribute('cy', n.y);
    c.setAttribute('r', isCurrent ? 7 : 5);
    c.setAttribute('fill',   isCurrent ? '#0b2e2d' : n.known ? '#1e5554' : '#132e2d');
    c.setAttribute('stroke', isCurrent ? '#77bfcf' : n.known ? '#3a6a68' : '#1e5554');
    c.setAttribute('stroke-width', isCurrent ? '1.5' : '1');
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', n.x); t.setAttribute('y', n.y + 4);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-family', "'Source Code Pro',monospace");
    t.setAttribute('font-size', '8'); t.setAttribute('font-weight', '700');
    t.setAttribute('fill', isCurrent ? '#77bfcf' : n.known ? '#4a7a78' : '#2a5c5a');
    t.textContent = n.id;
    const lx     = n.x > 70 ? n.x - 9 : n.x < 40 ? n.x + 9 : n.x;
    const anchor = n.x > 70 ? 'end'    : n.x < 40 ? 'start'  : 'middle';
    const ly     = n.y < 30 ? n.y - 9  : n.y > 165 ? n.y + 12 : n.y < 100 ? n.y - 9 : n.y + 13;
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
    porterIdEl:   $('porterIdEl'),
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
  { id:'rebuildRoads',name:'rebuild roads',      desc:'passively faster travel',       cost:200, requires:null,          apply:()=>{} },
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
function renderSettlements() {
  if (!els.settlementsEl) return;
  els.settlementsEl.innerHTML = '';
  S.routeNodes.filter(n => n.known && S.settlements[n.id])
    .map(n => ({ id:n.id, ...S.settlements[n.id] }))
    .forEach(s => {
      const div = document.createElement('div'); div.className = 'settle-item';
      div.innerHTML = `
        <div class="settle-name">${s.label} <span>${s.tier}</span></div>
        <div class="settle-bar"><div class="settle-fill ${s.rebuild>50?'b':'a'}" style="width:${Math.round(s.rebuild)}%"></div></div>
        <div class="settle-quote">${s.quote}</div>`;
      els.settlementsEl.appendChild(div);
    });
}

function renderNetwork() {
  if (!els.networkEl) return;
  els.networkEl.innerHTML = S.networkFeed.map(f => `<div class="net-item">${f}</div>`).join('');
}

// 7l: proper real-time timestamp
function tt() {
  const totalSecs = Math.floor(S.ticks * TICK_MS / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function addLog(msg) {
  const el = document.createElement('span'); el.className = 'log-line';
  el.innerHTML = `<span class="log-ts">[${tt()}]</span> ${msg}`;
  els.logEl.insertBefore(el, els.logEl.firstChild);
  const all = els.logEl.querySelectorAll('.log-line');
  if (all.length > 14) all[all.length-1].remove(); // fix 5: was 7
}

// ============================================================
// HUD / RENDER
// ============================================================
function updateHUD() {
  els.delivered.textContent = S.delivered;
  els.scrip.textContent     = S.scrip + '\u00a2';
  els.walked.textContent    = S.distKm + 'km';
  els.status.textContent    = S.status;
  els.status.style.color    = STATUS_COLORS[S.status] || '#b1c9c3';
  renderUpgrades(); // fix 3: keep buttons enabled/disabled in sync with scrip
}

// fix 4: track inventory state to avoid rebuilding DOM every tick (kills tooltip flicker)
let _lastCargoKey = '';
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
      const destNode  = S.routeNodes.find(n=>n.id===pkg.destId);
      const destLabel = destNode?(destNode.known?destNode.label:'???'):'?';
      const lostTag   = pkg.isLost?' [lost]':'';
      d.setAttribute('title', `[${pkg.size}] ${pkg.label}${lostTag}\n\u2192 ${destLabel}\n${pkg.scrip}\u00a2`);
      d.classList.add('has-tooltip');
    }
    els.cargoSlots.appendChild(d);
  }

  // weight pips — one per kg of capacity, colour-ramped teal→purple→pink
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
  if (els.clipBadge) {
    if (S.bootClipMax>0) { els.clipBadge.textContent='clip: '+S.bootClipCount+'/'+S.bootClipMax; els.clipBadge.style.display='inline'; }
    else els.clipBadge.style.display='none';
  }
  if (els.buyBootsBtn) els.buyBootsBtn.disabled = S.scrip < 15;
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
    els.drinkBtn.disabled    = S.canteen<=0 || S.stamina>=S.staminaMax; // 7g
  }
  if (els.canteenBar) els.canteenBar.style.width = canteenPct+'%';
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

// boot clip refill: prompt in log instead of silent auto-charge
let _clipRefillPending = null;

function refillBootClip(nodeId) {
  if (S.bootClipMax===0 || !['A','B','H'].includes(nodeId)) return;
  if (S.bootClipCount>=S.bootClipMax) return;
  if (_clipRefillPending) return; // already waiting on a response
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
// TRIP / CATCH  (7e: risky cell bonus)
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
  if (S.tieDownActive && S.inventory.length>0) {
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
  if (S.inventory.length>0) { S.inventory[0].scrip=Math.max(1,Math.floor(S.inventory[0].scrip*0.75)); addLog('<span class="log-wn">tripped! package damaged \u2014 reduced payout</span>'); }
  else addLog('<span class="log-wn">tripped on loose rubble!</span>');
  if (els.courierAt) { els.courierAt.className='tlh-at trip'; els.courierAt.style.animation='trip 0.4s ease 3'; }
}

// ============================================================
// SPEED / DRINK
// ============================================================
function speedMultiplier() {
  let mult = 1-(4-staminaSegCount())*0.15;
  if (S.bootDurability<=0)     mult *= 0.5;
  if (S.upgrades.rebuildRoads) mult *= 1.2;
  return Math.max(0.2, mult);
}

function drinkWater() {
  if (S.canteen<=0 || S.stamina>=S.staminaMax) return;
  const need = S.staminaMax-S.stamina;
  const rest = Math.min(need,(S.canteen/S.canteenMax)*S.staminaMax);
  S.stamina  = Math.min(S.staminaMax, S.stamina+rest);
  S.canteen  = Math.max(0, S.canteen-(rest/S.staminaMax)*S.canteenMax);
  addLog(`drank from canteen \u2014 <span class="log-hi">+${Math.round(rest/S.staminaMax*100)}% stamina</span>`);
}

// ============================================================
// MAIN TICK
// ============================================================
function tick() {
  S.ticks++;

  // trip recovery
  if (S.tripTimer>0) {
    S.tripTimer--;
    if (S.tripTimer===0) {
      S.status = S.inventory.length>0?'carrying':'walking';
      if (els.courierAt) { els.courierAt.className='tlh-at bounce'+(S.inventory.length>0?' carry':''); els.courierAt.style.animation=''; }
    }
    renderBoots(); renderStamina(); updateHUD(); return;
  }

  // resting
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

  // walking / carrying
  if (S.status==='walking' || S.status==='carrying') {
    S.stamina = Math.max(0, S.stamina-STAMINA_DRAIN);
    if (S.staminaOverboost && S.stamina<=S.staminaMax) S.staminaOverboost=false;

    let bd=BOOT_DRAIN;
    if (S.upgrades.bootsT1) bd*=0.75;
    if (S.upgrades.bootsT2) bd*=0.50;
    if (S.usingMakeshift)   bd*=1.30;
    S.bootDurability=Math.max(0,S.bootDurability-bd);

    if (S.isRaining||S.inRiver) S.canteen=Math.min(S.canteenMax,S.canteen+0.4);

    // 7k: distKm from actual route progress (edges completed + fraction)
    if (S.ticks%5===0) {
      S.distKm = Math.round((S.edgeIdx + S.dotT) * 4.2 * 10) / 10;
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

  // advance world position
  const prevEdgeIdx = S.edgeIdx;
  S.dotT += 0.006 * speedMultiplier();

  if (S.dotT >= 1) {
    S.dotT    = 0;
    S.edgeIdx = (S.edgeIdx+1) % S.edges.length;
    const arrivedAt = S.edges[prevEdgeIdx][1];
    const node = S.routeNodes.find(n => n.id===arrivedAt);
    if (node && !node.known) { node.known=true; addLog(`discovered: <span class="log-hi">${node.label}</span>`); }
    drawRouteMap();
    updateDestDrift();
    refillBootClip(arrivedAt);
    tryDeliver(arrivedAt);
  } else {
    updateRouteDot();
  }

  // world scroll
  S.worldPos = worldPosFromRoute();
  renderFieldstrip();

  // pkg respawns (every 10 ticks to save cycles)
  if (S.ticks%10===0) tickPkgRespawns();

  // rain
  if (S.rainTimer>0) S.rainTimer--;
  else if (Math.random()<0.003) { setRain(!S.isRaining); S.rainTimer=40+Math.floor(Math.random()*60); }

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
  S.worldPos = worldPosFromRoute();

  buildRain(); setRain(false);
  layoutRouteNodes(); drawRouteMap(); updateDestDrift();
  renderUpgrades(); renderSettlements(); renderNetwork();
  renderCargoSlots(true); renderCourierStack(); renderBoots(); renderStamina();
  renderFieldstrip();
  updateHUD();

  addLog(`porter <span class="log-hi">${porterId}</span> online at <span class="log-hi">depot a</span>`);

  // 7i: bounce via CSS class
  if (els.courierAt) { els.courierAt.className='tlh-at bounce'; els.courierAt.style.animation=''; }

  els.autobuyBtn.addEventListener('click', () => {
    S.autobuyBoots=!S.autobuyBoots;
    els.autobuyBtn.textContent='autobuy: '+(S.autobuyBoots?'on':'off');
    els.autobuyBtn.classList.toggle('on',S.autobuyBoots);
  });
  els.buyBootsBtn.addEventListener('click', buyBoots);
  els.drinkBtn.addEventListener('click', drinkWater);
  els.autodrinkBtn.addEventListener('click', () => {
    S.autodrink=!S.autodrink;
    els.autodrinkBtn.textContent='auto: '+(S.autodrink?'on':'off');
    els.autodrinkBtn.classList.toggle('on',S.autodrink);
  });
  els.tieDownBtn.addEventListener('click', toggleTieDown);

  setInterval(tick, TICK_MS);
}

if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
