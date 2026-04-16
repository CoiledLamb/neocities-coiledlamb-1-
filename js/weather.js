/* ==============================================
   THE LONG HAUL — weather system (v0.0.8)

   Storms as spatial world objects on the 6-edge ring.
   Each storm is a dual-gaussian potential field — intensity
   is spatial (distance from center determines drizzle/rain/
   downpour), not a whole-storm temporal state.

   Architecture follows scanner.js: self-contained module
   with tickWeather() called from main.js + query functions
   exported for other modules.

   Exports:
     tickWeather()         — per-tick update (storm spawn, move,
                             dissipate, overlay transitions).
     weatherAtCourier()    — returns { intensity, storm } based
                             on courier ring position vs all storms.
     weatherAtCell(ci)     — intensity at an arbitrary cell index.
     buildWeatherOverlay() — one-time DOM setup (replaces buildRain).
     adminToggleStorm()    — admin command (replaces toggleRain).
     initWeather()         — seed scheduler on init/load.
   ============================================== */
'use strict';

import { S } from './state.js';
import * as C from './constants.js';
import { addLog } from './render/log.js';

const els = S._transient.els;

// ============================================================
// HELPERS
// ============================================================

function randRange(min, max) {
  return min + Math.floor(Math.random() * (max - min));
}

function weightedPick(types) {
  const entries = Object.entries(types);
  let total = 0;
  for (const [, cfg] of entries) total += cfg.weight;
  let roll = Math.random() * total;
  for (const [key, cfg] of entries) {
    roll -= cfg.weight;
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

/** Shortest distance between two cell indices on the ring. */
function ringDist(a, b) {
  const d = Math.abs(a - b);
  return Math.min(d, C.TOTAL_CELLS - d);
}

/** Convert (edgeIdx, t) to a cell index. */
function cellIndex(edgeIdx, t) {
  return Math.floor((edgeIdx * C.CELLS_PER_EDGE) + (t * C.CELLS_PER_EDGE)) % C.TOTAL_CELLS;
}

// ============================================================
// POTENTIAL FIELD — dual-gaussian for organic storm shapes
// ============================================================
// Each storm has a primary center (where it spawned) and a
// secondary center (offset, weaker) that pulls the contours
// into asymmetric, weather-map-like shapes.

/** Return the potential value (0-1+) at a given cell for a storm. */
function stormPotential(storm, ci) {
  const typeCfg = C.STORM_TYPES[storm.type];
  const sigma1 = typeCfg.sigma1;
  const sigma2 = typeCfg.sigma2;
  const w2     = typeCfg.w2;

  const d1 = ringDist(ci, storm.primaryCell);
  const d2 = ringDist(ci, storm.secondaryCell);

  const g1 = Math.exp(-(d1 * d1) / (2 * sigma1 * sigma1));
  const g2 = Math.exp(-(d2 * d2) / (2 * sigma2 * sigma2));

  return g1 + w2 * g2;
}

/** Determine intensity at a cell index given a storm's potential field. */
function intensityAtCell(storm, ci) {
  const pot = stormPotential(storm, ci);
  // Map potential to intensity zones.
  // Higher potential = closer to center = more intense.
  // Thresholds derived from gaussian: at dist=0 potential ≈ 1.0+w2,
  // at the zone boundaries we want clean crossovers.
  // These are calibrated to the sigma values in STORM_TYPES.
  const typeCfg = C.STORM_TYPES[storm.type];
  const maxPot = 1 + typeCfg.w2;  // theoretical max at exact center

  // Normalize to 0-1 range
  const norm = pot / maxPot;

  if (norm >= 0.55) return 'downpour';
  if (norm >= 0.20) return 'rain';
  if (norm >= 0.05) return 'drizzle';
  return 'none';
}

// ============================================================
// PUBLIC QUERIES
// ============================================================

/**
 * What weather is the courier experiencing right now?
 * Returns { intensity: 'none'|'drizzle'|'rain'|'downpour', storm: obj|null }
 */
export function weatherAtCourier() {
  const courierCell = cellIndex(S.edgeIdx, S.dotT);
  return weatherAtCell(courierCell);
}

/**
 * What weather is at an arbitrary cell index?
 * Checks all storms, returns the most intense hit.
 */
export function weatherAtCell(ci) {
  const intensityRank = { none: 0, drizzle: 1, rain: 2, downpour: 3 };
  let best = { intensity: 'none', storm: null };

  for (const storm of S.storms) {
    const intensity = intensityAtCell(storm, ci);
    if (intensityRank[intensity] > intensityRank[best.intensity]) {
      best = { intensity, storm };
    }
  }
  return best;
}

// ============================================================
// STORM LIFECYCLE
// ============================================================

/** Schedule the next storm spawn + pre-roll its type for weather radio prediction. */
function scheduleNextStorm() {
  S.nextStormSpawnTick = S.ticks + randRange(C.STORM_DRY_MIN_TICKS, C.STORM_DRY_MAX_TICKS);
  S.nextStormType = weightedPick(C.STORM_TYPES);
}

function spawnStorm(preRolledType) {
  const type = preRolledType || weightedPick(C.STORM_TYPES);
  const typeCfg = C.STORM_TYPES[type];

  // Pick a spawn position on the ring
  let edgeIdx = Math.floor(Math.random() * 6);
  const t = Math.random();

  // Wetland bias: chance to force onto a wetland edge
  if (Math.random() < C.STORM_WETLAND_BIAS) {
    const wetEdges = S._transient.wetlandEdges;
    if (wetEdges && wetEdges.length > 0) {
      edgeIdx = wetEdges[Math.floor(Math.random() * wetEdges.length)];
    }
  }

  const primaryCell = cellIndex(edgeIdx, t);

  // Secondary center: offset by 40-80 cells in a random direction,
  // gives the dual-gaussian its asymmetric character.
  // Signed offset stored on the storm so moveStorm can maintain it.
  const secondaryOffset = (40 + Math.floor(Math.random() * 40)) * (Math.random() < 0.5 ? 1 : -1);
  const secondaryCell = (primaryCell + secondaryOffset + C.TOTAL_CELLS) % C.TOTAL_CELLS;

  // Seed for contour rendering — deterministic per storm so
  // contours don't jitter on redraw
  const seed = Math.floor(Math.random() * 100000);

  const storm = {
    id:            S._transient.stormIdCounter++,
    type,
    edgeIdx,
    t,
    primaryCell,
    secondaryCell,
    secondaryOffset,
    age:           0,
    seed,
  };

  S.storms.push(storm);
}

function moveStorm(storm) {
  const speed = C.STORM_TYPES[storm.type].speed;
  storm.t += speed;
  if (storm.t >= 1) {
    storm.t -= 1;
    storm.edgeIdx = (storm.edgeIdx + 1) % 6;
  }
  // Update cell positions — secondary maintains its signed offset
  storm.primaryCell = cellIndex(storm.edgeIdx, storm.t);
  storm.secondaryCell = (storm.primaryCell + storm.secondaryOffset + C.TOTAL_CELLS) % C.TOTAL_CELLS;
}

function removeStorm(storm) {
  const idx = S.storms.indexOf(storm);
  if (idx >= 0) S.storms.splice(idx, 1);
}

// ============================================================
// RAIN OVERLAY (visual, not game logic)
// ============================================================

let currentOverlayIntensity = 'none';

function rebuildOverlay(intensity) {
  if (!els.rainOverlay) return;
  if (intensity === currentOverlayIntensity) return;
  currentOverlayIntensity = intensity;

  els.rainOverlay.innerHTML = '';
  if (intensity === 'none') {
    els.rainOverlay.style.display = 'none';
    return;
  }

  const config = {
    drizzle:  { count: C.RAIN_SPANS_DRIZZLE,  chars: ['.', '.', '|'], durMin: 2.0, durMax: 3.0, opacity: 0.4 },
    rain:     { count: C.RAIN_SPANS_RAIN,      chars: ['|', '.'],     durMin: 1.1, durMax: 2.4, opacity: 0.7 },
    downpour: { count: C.RAIN_SPANS_DOWNPOUR,  chars: ['|', '|', ':'], durMin: 0.6, durMax: 1.5, opacity: 0.9 },
  }[intensity];

  for (let i = 0; i < config.count; i++) {
    const d = document.createElement('span');
    d.textContent = config.chars[Math.floor(Math.random() * config.chars.length)];
    const dur = config.durMin + Math.random() * (config.durMax - config.durMin);
    const delay = Math.random() * 2;
    d.style.cssText =
      `position:absolute;left:${Math.random()*100}%;top:0;font-size:10px;` +
      `color:#1e5554;font-family:'Source Code Pro',monospace;` +
      `opacity:${config.opacity};` +
      `animation:raindrop ${dur}s linear ${delay}s infinite;`;
    els.rainOverlay.appendChild(d);
  }
  els.rainOverlay.style.display = 'block';
}

/** One-time DOM setup — called from init() in place of old buildRain(). */
export function buildWeatherOverlay() {
  currentOverlayIntensity = 'none';
  if (els.rainOverlay) {
    els.rainOverlay.innerHTML = '';
    els.rainOverlay.style.display = 'none';
  }
}

// ============================================================
// TICK
// ============================================================

/** Called once per tick from main.js after movement, before rendering. */
export function tickWeather() {
  // --- Storm lifecycle ---
  for (let i = S.storms.length - 1; i >= 0; i--) {
    const storm = S.storms[i];
    storm.age++;
    moveStorm(storm);

    // Dissipation check (only after minimum age)
    if (storm.age > C.STORM_MIN_AGE_TICKS) {
      if (Math.random() < C.STORM_DISSIPATE_CHANCE) {
        removeStorm(storm);
      }
    }
  }

  // --- Spawn check ---
  if (S.storms.length === 0 && S.ticks >= S.nextStormSpawnTick) {
    spawnStorm(S.nextStormType);
    S.nextStormType = null;
  }

  // --- Schedule next spawn when no storms ---
  if (S.storms.length === 0 && S.nextStormSpawnTick <= S.ticks) {
    scheduleNextStorm();
  }

  // --- Overlay transition ---
  const w = weatherAtCourier();
  const prevIntensity = S._transient.lastWeatherIntensity;

  if (w.intensity !== prevIntensity) {
    rebuildOverlay(w.intensity);

    // Log transitions
    if (prevIntensity === 'none' && w.intensity !== 'none') {
      // Entering storm — canteen burst
      S.canteen = Math.min(S.canteenMax, S.canteen + C.CANTEEN_STORM_BURST);
      addLog(`<span class="log-wn">${w.intensity} begins \u2014 canteen refilling</span>`);
    } else if (w.intensity === 'none' && prevIntensity !== 'none') {
      addLog('weather clears');
    } else if (w.intensity !== 'none' && prevIntensity !== 'none') {
      // Intensity changed within storm (moved deeper or toward edge)
      addLog(`<span class="log-wn">weather shifts to ${w.intensity}</span>`);
    }

    S._transient.lastWeatherIntensity = w.intensity;
    updateWeatherIcon(w.intensity);
  }
}

// ============================================================
// INIT
// ============================================================

/** Seed the weather scheduler. Called from init() after state is settled. */
export function initWeather() {
  S._transient.lastWeatherIntensity = 'none';
  S._transient.stormIdCounter = S._transient.stormIdCounter || 0;

  // If no storms exist (fresh game or old save), schedule a spawn
  if (S.storms.length === 0 && S.nextStormSpawnTick <= S.ticks) {
    scheduleNextStorm();
  }

  // Check if we're already inside a storm on load
  const w = weatherAtCourier();
  rebuildOverlay(w.intensity);
  S._transient.lastWeatherIntensity = w.intensity;

  initWeatherGear();
  updateWeatherIcon(w.intensity);
}

// ============================================================
// ADMIN
// ============================================================

/** Admin toggle: spawn a storm at the courier or remove all storms. */
export function adminToggleStorm() {
  if (S.storms.length > 0) {
    S.storms.length = 0;
    S.nextStormSpawnTick = S.ticks + 300;
    rebuildOverlay('none');
    S._transient.lastWeatherIntensity = 'none';
    addLog('<span class="log-wn">[admin]</span> storms cleared');
  } else {
    // Spawn a front at the courier's position (most visible type)
    const primaryCell = cellIndex(S.edgeIdx, S.dotT);
    const secondaryOffset = 50;
    const secondaryCell = (primaryCell + secondaryOffset) % C.TOTAL_CELLS;
    S.storms.push({
      id:            S._transient.stormIdCounter++,
      type:          'front',
      edgeIdx:       S.edgeIdx,
      t:             S.dotT,
      primaryCell,
      secondaryCell,
      secondaryOffset,
      age:           0,
      seed:          Math.floor(Math.random() * 100000),
    });
    addLog('<span class="log-wn">[admin]</span> storm spawned at courier');
  }
}

// ============================================================
// WEATHER GEAR UI
// ============================================================
// Clickable icon at the bottom of the route panel. Icon and color
// shift with the courier's current weather intensity. Clicking
// toggles the pressure legend bar (gradient + hPa numbers).

const WEATHER_ICONS = {
  none:     '\u2609',  // ☉ sun
  drizzle:  '\u2601',  // ☁ cloud
  rain:     '\u2602',  // ☂ umbrella
  downpour: '\u2608',  // ☈ thunderstorm
};

let legendPainted = false;

/** Paint the gradient bar on the legend canvas (once). */
function paintLegendBar() {
  const canvas = document.getElementById('weatherLegendBar');
  if (!canvas || legendPainted) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;

  // Same color ramp as the minimap color mass
  const stops = [
    [0,    '#162e40'], [0.15, '#1e4458'], [0.30, '#2e4a72'],
    [0.45, '#3e4a7a'], [0.58, '#504a82'], [0.70, '#7a4a78'],
    [0.82, '#9d68a4'], [0.92, '#b878b8'], [1.0,  '#da8bda'],
  ];
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  stops.forEach(([pos, color]) => grad.addColorStop(pos, color));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Tick marks at zone boundaries
  ctx.strokeStyle = '#0b1e1e';
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  [0.3, 0.6].forEach(t => {
    const x = Math.round(t * w) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  });
  ctx.globalAlpha = 1;

  legendPainted = true;
}

/** Update the gear icon character and color class to match current weather. */
function updateWeatherIcon(intensity) {
  const btn = document.getElementById('weatherGearBtn');
  if (!btn) return;
  btn.textContent = WEATHER_ICONS[intensity] || WEATHER_ICONS.none;
  // Remove old intensity classes, add current
  btn.classList.remove('intensity-drizzle', 'intensity-rain', 'intensity-downpour');
  if (intensity !== 'none') {
    btn.classList.add('intensity-' + intensity);
  }
}

/** Wire the gear toggle. Called once from initWeather(). */
function initWeatherGear() {
  const row = document.getElementById('weatherGearRow');
  const btn = document.getElementById('weatherGearBtn');
  const wrap = document.getElementById('weatherLegendInline');
  if (!btn || !wrap || !row) return;

  // Gear row is only visible when weather radio L1+ is owned
  row.hidden = !S.weatherRadio;

  btn.addEventListener('click', () => {
    const open = wrap.hidden;
    wrap.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.classList.toggle('on', open);
    if (open) {
      wrap.style.animation = 'gear-reveal 0.18s ease-out';
      paintLegendBar();
    }
  });

  updateWeatherIcon('none');
}

/** Called when upgrades change — shows gear row if weather radio is owned. */
export function updateWeatherGearVisibility() {
  const row = document.getElementById('weatherGearRow');
  if (row) row.hidden = !S.weatherRadio;
}
