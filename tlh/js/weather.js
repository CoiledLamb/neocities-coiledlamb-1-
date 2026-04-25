/* ==============================================
   THE LONG HAUL — weather system (v0.0.8 original,
   v0.0.9.6 commit 7 unified-coord rework)

   Storms as spatial world objects in SVG (x, y) space.
   Each storm is a dual-gaussian potential field with
   primary + secondary centers — intensity is spatial
   (distance from center determines drizzle/rain/
   downpour), not a whole-storm temporal state.

   Commit 7 changes:
     * Storm coords unified to (x, y, dx, dy) — ring
       and interior storms share one motion model
     * Multi-concurrent spawns (cap MAX_CONCURRENT_STORMS)
     * 2× spawn frequency (halved dry intervals)
     * Interior spawn locations (50/50 ring/interior mix)
     * Intensity gradient in overlap zones
       (weatherAtPoint sums potentials from all storms)
     * Combine/intersect detection stub (overlap % flagged,
       no merging behavior)
     * Weather radio location preroll (nearest-NPC phrase
       for warning messages)

   Exports:
     tickWeather()         — per-tick update
     weatherAtCourier()    — { intensity, storm } at courier
     weatherAtPoint(x, y)  — { intensity, storm } at arbitrary point
     weatherAtCell(ci)     — legacy ring-cell query (converts to xy)
     buildWeatherOverlay() — DOM overlay init
     adminToggleStorm()    — admin command
     initWeather()         — init-time setup
     detectStormIntersections() — exported for sim + tests
   ============================================== */
'use strict';

import { S } from './state.js?v=096-10-22';
import * as C from './constants.js?v=096-10-22';
import { addLog } from './render/log.js?v=096-10-22';
import { pointInRing } from './render/route-map.js?v=096-10-22';
import { emit as tEmit } from './telemetry.js?v=096-10-22';

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

/** Nearest ring node to a point, by SVG distance. Used by the weather
 *  radio preroll to attach a landmark phrase to upcoming storms. */
function nearestNpcTo(x, y) {
  let bestId = null;
  let bestD = Infinity;
  if (!S.routeNodes) return null;
  for (const node of S.routeNodes) {
    const d = Math.hypot(node.x - x, node.y - y);
    if (d < bestD) { bestD = d; bestId = node.id; }
  }
  return bestId;
}

// ============================================================
// POTENTIAL FIELD — (x, y)-native dual-gaussian
// ============================================================

function secondaryCenter(storm) {
  return {
    x: storm.x + (storm.secondaryOffsetX || 0),
    y: storm.y + (storm.secondaryOffsetY || 0),
  };
}

/** Potential at a point from one storm (0 to ~1+w2). */
function stormPotentialAt(storm, x, y) {
  const typeCfg = C.STORM_TYPES[storm.type];
  if (!typeCfg) return 0;
  const sigma1 = typeCfg.sigmaSvg1;
  const sigma2 = typeCfg.sigmaSvg2;
  const d1 = Math.hypot(x - storm.x, y - storm.y);
  const sec = secondaryCenter(storm);
  const d2 = Math.hypot(x - sec.x, y - sec.y);
  const g1 = Math.exp(-(d1 * d1) / (2 * sigma1 * sigma1));
  const g2 = Math.exp(-(d2 * d2) / (2 * sigma2 * sigma2));
  return g1 + typeCfg.w2 * g2;
}

/** Bucketize accumulated potential into intensity. Cap at 1.2 so
 *  overlap zones can nudge from rain to downpour but not create a
 *  hypothetical super-downpour tier. */
function bucketIntensity(totalPot, maxPot) {
  if (maxPot <= 0) return 'none';
  const norm = Math.min(1.2, totalPot / maxPot);
  if (norm >= 0.55) return 'downpour';
  if (norm >= 0.20) return 'rain';
  if (norm >= 0.05) return 'drizzle';
  return 'none';
}

/** Primary query. Iterates all storms, accumulates potentials for
 *  gradient-style intensity in overlap zones, returns dominant storm
 *  as the "source" reference. */
export function weatherAtPoint(x, y) {
  if (!S.storms || S.storms.length === 0) return { intensity: 'none', storm: null };
  let totalPot = 0;
  let dominant = null;
  let dominantPot = 0;
  for (const storm of S.storms) {
    const pot = stormPotentialAt(storm, x, y);
    totalPot += pot;
    if (pot > dominantPot) { dominant = storm; dominantPot = pot; }
  }
  const dominantMax = dominant ? (1 + C.STORM_TYPES[dominant.type].w2) : 1;
  return { intensity: bucketIntensity(totalPot, dominantMax), storm: dominant };
}

// ============================================================
// PUBLIC QUERIES
// ============================================================

export function weatherAtCourier() {
  const seg = S._transient.currentSegment;
  if (!seg || !seg.pathFn) {
    // Fallback — shouldn't fire after init, but defensive
    return { intensity: 'none', storm: null };
  }
  const xy = seg.pathFn(S.dotT);
  return weatherAtPoint(xy.x, xy.y);
}

/** Legacy ring-cell query. Still used by trip.js + scanner.js in a
 *  few places. Converts cell index back to (x, y) via ring walk. */
export function weatherAtCell(ci) {
  if (!S.edges || S.edges.length === 0) {
    return { intensity: 'none', storm: null };
  }
  const edgeIdx = Math.floor(ci / C.CELLS_PER_EDGE);
  const t       = (ci % C.CELLS_PER_EDGE) / C.CELLS_PER_EDGE;
  const [fromId, toId] = S.edges[edgeIdx % S.edges.length];
  const fromN = S.routeNodes && S.routeNodes.find(n => n.id === fromId);
  const toN   = S.routeNodes && S.routeNodes.find(n => n.id === toId);
  if (!fromN || !toN) return { intensity: 'none', storm: null };
  const x = fromN.x + (toN.x - fromN.x) * t;
  const y = fromN.y + (toN.y - fromN.y) * t;
  return weatherAtPoint(x, y);
}

// ============================================================
// STORM LIFECYCLE — unified (x, y, dx, dy)
// ============================================================

/** Roll a spawn location: ring-edge (with wetland bias) or interior
 *  (random point inside ring polygon). */
function rollSpawnLocationRaw() {
  if (Math.random() >= C.STORM_INTERIOR_SPAWN_PCT) {
    // Ring spawn with wetland bias
    let edgeIdx = Math.floor(Math.random() * (S.edges ? S.edges.length : 12));
    if (Math.random() < C.STORM_WETLAND_BIAS) {
      const wetEdges = S._transient.wetlandEdges;
      if (wetEdges && wetEdges.length > 0) {
        edgeIdx = wetEdges[Math.floor(Math.random() * wetEdges.length)];
      }
    }
    const t = Math.random();
    const [fromId, toId] = S.edges[edgeIdx % S.edges.length];
    const fromN = S.routeNodes.find(n => n.id === fromId);
    const toN   = S.routeNodes.find(n => n.id === toId);
    if (!fromN || !toN) return { x: 200, y: 200, isInterior: false };
    return {
      x: fromN.x + (toN.x - fromN.x) * t,
      y: fromN.y + (toN.y - fromN.y) * t,
      isInterior: false,
    };
  }
  // Interior spawn via rejection sampling inside ring polygon
  for (let tries = 0; tries < 24; tries++) {
    const x = 50 + Math.random() * 300;
    const y = 50 + Math.random() * 300;
    if (pointInRing(x, y)) return { x, y, isInterior: true };
  }
  return { x: 200, y: 200, isInterior: true };
}

/** v0.0.9.6.9.29 — pole-aware spawn: resample up to N times until we
 *  land somewhere the climate field likes. Repeller zones (desert)
 *  reject with probability 1 - exp(effect × K); attractor zones
 *  always pass. Falls back to last sampled location if every attempt
 *  lands in a repeller (rare given 8 attempts × exp falloff). */
function rollSpawnLocation() {
  let last = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const loc = rollSpawnLocationRaw();
    last = loc;
    if (acceptSpawnLocation(loc.x, loc.y)) return loc;
  }
  return last;
}

/** Schedule the next storm + pre-roll type, location, and nearest-
 *  NPC landmark. Composite descriptor lives on S.nextStormSpawn so
 *  the weather radio warning can include "forming over pi's summit". */
function scheduleNextStorm() {
  S.nextStormSpawnTick = S.ticks + randRange(C.STORM_DRY_MIN_TICKS, C.STORM_DRY_MAX_TICKS);
  const type = weightedPick(C.STORM_TYPES);
  const loc  = rollSpawnLocation();
  S.nextStormSpawn = {
    type,
    x: loc.x, y: loc.y,
    isInterior: loc.isInterior,
    nearestNpcId: nearestNpcTo(loc.x, loc.y),
  };
  // Keep legacy nextStormType mirror alive for save-payload compat
  // with pre-commit-7 code paths that still read it.
  S.nextStormType = type;
}

function spawnStormFromPreroll() {
  const p = S.nextStormSpawn;
  if (!p) return;
  const typeCfg = C.STORM_TYPES[p.type];
  if (!typeCfg) return;

  // Random velocity direction at spawn; magnitude from type speed.
  const angle = Math.random() * Math.PI * 2;
  const dx    = Math.cos(angle) * typeCfg.speedSvg;
  const dy    = Math.sin(angle) * typeCfg.speedSvg;

  // Secondary center offset — asymmetric dual-gaussian shape.
  const offAngle = Math.random() * Math.PI * 2;
  const offDist  = 18 + Math.random() * 18;  // SVG units
  const secondaryOffsetX = Math.cos(offAngle) * offDist;
  const secondaryOffsetY = Math.sin(offAngle) * offDist;

  const storm = {
    id: S._transient.stormIdCounter++,
    type: p.type,
    x: p.x,
    y: p.y,
    dx, dy,
    secondaryOffsetX,
    secondaryOffsetY,
    age: 0,
    seed: Math.floor(Math.random() * 100000),
    isInterior: !!p.isInterior,
    intersects: [],
    // v0.0.9.6.9.28 — soft-merge state
    mergingWith: null,   // id of peer while approaching
    mergedBonus: 1.0,    // dissipate-chance multiplier (<1 = slower)
  };
  S.storms.push(storm);
  tEmit('storm.spawned', { type: storm.type, isInterior: storm.isInterior });
}

function moveStorm(storm) {
  storm.x += storm.dx;
  storm.y += storm.dy;
  // No boundary handling — storms drift naturally and dissipate via
  // STORM_DISSIPATE_CHANCE once past STORM_MIN_AGE_TICKS.
}

// ============================================================
// v0.0.9.6.9.29 — CLIMATE POLES (spawn bias + drift + dissipate)
// ============================================================

/** Sum of (pull × gaussian falloff) across every climate pole at
 *  (x, y). Positive = net attractor (wetland / ruins / mountains);
 *  negative = net repeller (desert). Used by:
 *    - rollSpawnLocation (exp-weighted accept/reject)
 *    - dissipation (boost in repeller zones)
 *    - tickWeather drift (gradient-style nudge per tick) */
function climateEffectAt(x, y) {
  let effect = 0;
  for (const pole of C.CLIMATE_POLES) {
    const dx = pole.x - x;
    const dy = pole.y - y;
    const d2 = dx * dx + dy * dy;
    const r2 = pole.range * pole.range;
    effect += pole.pull * Math.exp(-d2 / r2);
  }
  return effect;
}

/** Per-tick storm drift from the climate-pole field. Each pole
 *  contributes a velocity nudge toward (attractor) or away from
 *  (repeller) itself, scaled by gaussian falloff + CLIMATE_DRIFT_SCALE.
 *  Magnitude is << Fujiwhara so it reads as a prevailing breeze, not
 *  a hard pull. */
function applyClimateDrift(storm) {
  let dx = 0, dy = 0;
  for (const pole of C.CLIMATE_POLES) {
    const px = pole.x - storm.x;
    const py = pole.y - storm.y;
    const d  = Math.hypot(px, py);
    if (d < 0.5) continue;
    const falloff = Math.exp(-(d * d) / (pole.range * pole.range));
    const mag = pole.pull * falloff * C.CLIMATE_DRIFT_SCALE;
    dx += (px / d) * mag;
    dy += (py / d) * mag;
  }
  storm.x += dx;
  storm.y += dy;
}

/** Accept a candidate spawn location with probability weighted by
 *  its climate effect. Attractor zones (effect > 0) always accept;
 *  repeller zones (effect < 0) accept with exp(effect × K) < 1. */
function acceptSpawnLocation(x, y) {
  const eff = climateEffectAt(x, y);
  if (eff >= 0) return true;
  return Math.random() < Math.exp(eff * C.CLIMATE_SPAWN_BIAS_K);
}

function removeStorm(storm) {
  const idx = S.storms.indexOf(storm);
  if (idx >= 0) S.storms.splice(idx, 1);
  tEmit('storm.ended', { type: storm.type, age: storm.age });
  // v0.0.9.6.9.28 — succession: a natural dissipation has a small
  // chance of seeding a new storm nearby. Seeds respect the normal
  // spawn cap when they actually fire; if the cap is full at seed
  // time the seed is silently cancelled (no queue build-up).
  if (Math.random() < C.STORM_SUCCESSION_CHANCE) {
    const angle = Math.random() * Math.PI * 2;
    const dist  = Math.random() * C.STORM_SUCCESSION_RADIUS;
    const sx    = storm.x + Math.cos(angle) * dist;
    const sy    = storm.y + Math.sin(angle) * dist;
    if (!S._transient.pendingStormSeeds) S._transient.pendingStormSeeds = [];
    S._transient.pendingStormSeeds.push({
      x: sx, y: sy,
      type: storm.type,           // inherit type — regional weather consistency
      spawnTick: S.ticks + C.STORM_SUCCESSION_DELAY,
    });
    tEmit('storm.seeded', { type: storm.type });
  }
}

// v0.0.9.6.9.28 — promote a pending seed to an actual storm when its
// delay expires. Respects MAX_CONCURRENT_STORMS (silently drops the
// seed if at cap). Mirrors spawnStormFromPreroll but with explicit
// x/y/type rather than pulling from S.nextStormSpawn.
function spawnStormAt(x, y, type) {
  const typeCfg = C.STORM_TYPES[type];
  if (!typeCfg) return;
  const angle = Math.random() * Math.PI * 2;
  const dx    = Math.cos(angle) * typeCfg.speedSvg;
  const dy    = Math.sin(angle) * typeCfg.speedSvg;
  const offAngle = Math.random() * Math.PI * 2;
  const offDist  = 18 + Math.random() * 18;
  const storm = {
    id: S._transient.stormIdCounter++,
    type, x, y, dx, dy,
    secondaryOffsetX: Math.cos(offAngle) * offDist,
    secondaryOffsetY: Math.sin(offAngle) * offDist,
    age: 0,
    seed: Math.floor(Math.random() * 100000),
    isInterior: false,   // succession seeds aren't tracked as interior-origin
    intersects: [],
    mergingWith: null,
    mergedBonus: 1.0,
  };
  S.storms.push(storm);
  tEmit('storm.spawned', { type, isInterior: false, succession: true });
}

function processPendingStormSeeds() {
  const pending = S._transient.pendingStormSeeds;
  if (!pending || pending.length === 0) return;
  const kept = [];
  for (const seed of pending) {
    if (S.ticks < seed.spawnTick) { kept.push(seed); continue; }
    // Silently drop if at storm cap
    if (S.storms.length >= C.MAX_CONCURRENT_STORMS) continue;
    spawnStormAt(seed.x, seed.y, seed.type);
  }
  S._transient.pendingStormSeeds = kept;
}

// ============================================================
// COMBINE / INTERSECT DETECTION + SOFT MERGE
// ============================================================

/** Pairwise overlap detection. Each storm gets .intersects[] populated
 *  with { otherId, overlapPct }. Overlap % is a linear approximation
 *  of circle-intersection relative to the smaller radius.
 *  Intensity-gradient behavior already lives in weatherAtPoint; merge
 *  behavior lives in applyMergeDynamics (v0.0.9.6.9.28). */
export function detectStormIntersections() {
  const storms = S.storms;
  if (!storms) return;
  for (const s of storms) s.intersects = [];
  for (let i = 0; i < storms.length; i++) {
    const a = storms[i];
    const ra = (C.STORM_TYPES[a.type] || {}).radiusSvg || 30;
    for (let j = i + 1; j < storms.length; j++) {
      const b = storms[j];
      const rb = (C.STORM_TYPES[b.type] || {}).radiusSvg || 30;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < ra + rb) {
        const minR = Math.min(ra, rb);
        const overlapPct = Math.max(0, Math.min(1, (ra + rb - d) / (minR * 2)));
        a.intersects.push({ otherId: b.id, overlapPct });
        b.intersects.push({ otherId: a.id, overlapPct });
      }
    }
  }
}

// v0.0.9.6.9.28 — type-promotion table for merge finalization. The
// merged storm takes the "heavier" of the two types, except two
// squalls combine into a front (small+small = medium) and two fronts
// combine into a deluge (medium+medium = large). Deluge never
// promotes further.
const STORM_PROMOTE = {
  'squall+squall': 'front',
  'squall+front':  'front',
  'front+squall':  'front',
  'squall+deluge': 'deluge',
  'deluge+squall': 'deluge',
  'front+front':   'deluge',
  'front+deluge':  'deluge',
  'deluge+front':  'deluge',
  'deluge+deluge': 'deluge',
};
function promoteType(aType, bType) {
  return STORM_PROMOTE[`${aType}+${bType}`] || aType;
}

// v0.0.9.6.9.28 — finalize a merging pair into a single storm. Runs
// once centers are close enough that the rendered contour is already
// visually indistinguishable from a single lobe, so the swap is
// invisible to the player. Survivor takes the weighted-centroid
// position + velocity and promotes type; partner is removed.
function finalizeMerge(a, b) {
  const ra = C.STORM_TYPES[a.type].radiusSvg;
  const rb = C.STORM_TYPES[b.type].radiusSvg;
  const wa = ra * ra, wb = rb * rb;
  const wSum = wa + wb;
  const cx = (a.x * wa + b.x * wb) / wSum;
  const cy = (a.y * wa + b.y * wb) / wSum;
  const vx = (a.dx * wa + b.dx * wb) / wSum;
  const vy = (a.dy * wa + b.dy * wb) / wSum;
  const survivor = a;  // arbitrary — we mutate a and remove b
  survivor.type        = promoteType(a.type, b.type);
  survivor.x           = cx;
  survivor.y           = cy;
  survivor.dx          = vx;
  survivor.dy          = vy;
  survivor.age         = Math.max(a.age, b.age);
  survivor.mergedBonus = Math.min(survivor.mergedBonus, C.STORM_MERGED_BONUS);
  survivor.mergingWith = null;
  // Remove partner
  const idx = S.storms.indexOf(b);
  if (idx >= 0) S.storms.splice(idx, 1);
  tEmit('storm.merged', {
    type:      survivor.type,
    fromTypes: [a.type === survivor.type ? '_' : a.type, b.type === survivor.type ? '_' : b.type],
  });
}

/** v0.0.9.6.9.28 — tag merging pairs, apply Fujiwhara drift, finalize
 *  when centers converge. Runs after detectStormIntersections (which
 *  populates .intersects). Pairs are formed greedily: each storm tags
 *  at most one partner per tick, chosen by highest overlapPct. */
export function applyMergeDynamics() {
  const storms = S.storms;
  if (!storms || storms.length < 2) {
    for (const s of storms || []) s.mergingWith = null;
    return;
  }
  // Clear stale tags; re-derive every tick so breakups happen
  // automatically when storms drift apart.
  for (const s of storms) s.mergingWith = null;
  // Greedy pairing by max overlapPct
  for (const a of storms) {
    if (a.mergingWith != null) continue;
    let best = null, bestPct = C.STORM_MERGE_THRESHOLD;
    for (const inter of a.intersects) {
      if (inter.overlapPct < bestPct) continue;
      const b = storms.find(s => s.id === inter.otherId);
      if (!b || b.mergingWith != null) continue;
      best = b; bestPct = inter.overlapPct;
    }
    if (best) { a.mergingWith = best.id; best.mergingWith = a.id; }
  }
  // Fujiwhara drift — nudge each merging storm toward its peer
  for (const a of storms) {
    if (a.mergingWith == null) continue;
    const b = storms.find(s => s.id === a.mergingWith);
    if (!b) { a.mergingWith = null; continue; }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d  = Math.hypot(dx, dy);
    if (d < 0.5) continue;
    a.x += (dx / d) * C.STORM_MERGE_ATTRACT;
    a.y += (dy / d) * C.STORM_MERGE_ATTRACT;
  }
  // Finalization — collapse pairs whose centers closed in enough
  const consumed = new Set();
  for (const a of storms.slice()) {
    if (consumed.has(a.id) || a.mergingWith == null) continue;
    const b = storms.find(s => s.id === a.mergingWith);
    if (!b || consumed.has(b.id)) continue;
    const ra = C.STORM_TYPES[a.type].radiusSvg;
    const rb = C.STORM_TYPES[b.type].radiusSvg;
    const minR = Math.min(ra, rb);
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d < minR * C.STORM_MERGE_FINALIZE) {
      finalizeMerge(a, b);
      consumed.add(a.id); consumed.add(b.id);
    }
  }
}

// ============================================================
// RAIN OVERLAY (visual)
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

export function tickWeather() {
  // v0.0.9.6.9.28 — lifecycle reordered so merge dynamics run between
  // motion and dissipation: age/move → detect intersections → apply
  // merge drift + finalize → dissipate. Merging storms skip their
  // dissipation roll (can't die mid-fusion); merged survivors get a
  // permanent ×STORM_MERGED_BONUS multiplier on the roll.

  // --- 1. Age + move + climate drift ---
  for (const storm of S.storms) {
    storm.age++;
    moveStorm(storm);
    applyClimateDrift(storm);
  }

  // --- 2. Intersect detection (populates storm.intersects[]) ---
  detectStormIntersections();

  // --- 3. Soft-merge dynamics ---
  applyMergeDynamics();

  // --- 4. Dissipation ---
  for (let i = S.storms.length - 1; i >= 0; i--) {
    const storm = S.storms[i];
    if (storm.mergingWith != null) continue;
    if (storm.age <= C.STORM_MIN_AGE_TICKS) continue;
    let mult = storm.mergedBonus || 1.0;
    // v0.0.9.6.9.29 — storms drifting into repeller zones (desert)
    // die off faster. Reinforces "storms don't hang around over
    // the dry north".
    if (climateEffectAt(storm.x, storm.y) < C.CLIMATE_REPELLER_THRESH) {
      mult *= C.CLIMATE_DISSIPATE_BOOST;
    }
    // v0.0.9.6.10.2 — storms that have drifted out of the route
    // viewBox (400×400 SVG units) have no gameplay effect — player
    // can't see them, can't get rained on. They were just sitting in
    // the pool waiting out the baseline dissipate roll, blocking the
    // MAX_CONCURRENT_STORMS slot from a fresh spawn. Heavily boost
    // dissipation so offscreen drift cleans itself up fast.
    const offscreenMargin = 60;
    if (storm.x < -offscreenMargin || storm.x > 400 + offscreenMargin ||
        storm.y < -offscreenMargin || storm.y > 400 + offscreenMargin) {
      mult *= 8.0;
    }
    if (Math.random() < C.STORM_DISSIPATE_CHANCE * mult) {
      removeStorm(storm);
    }
  }

  // --- 5. Spawn check ---
  // v0.0.9.6 commit 7 — multi-concurrent: spawn when under cap (not
  // when empty). Reschedule immediately so the next storm can preroll
  // into the weather radio warning window.
  if (S.storms.length < C.MAX_CONCURRENT_STORMS && S.ticks >= S.nextStormSpawnTick) {
    if (!S.nextStormSpawn) scheduleNextStorm();
    spawnStormFromPreroll();
    scheduleNextStorm();
  }

  // --- 6. Succession seeds (v0.0.9.6.9.28) — pending seeds from
  // storms that dissipated recently; fires them when their delay
  // ticks land.
  processPendingStormSeeds();

  // --- Overlay transition ---
  const w = weatherAtCourier();
  const prevIntensity = S._transient.lastWeatherIntensity;

  if (w.intensity !== prevIntensity) {
    rebuildOverlay(w.intensity);
    if (prevIntensity === 'none' && w.intensity !== 'none') {
      S.canteen = Math.min(S.canteenMax, S.canteen + C.CANTEEN_STORM_BURST);
      // v0.0.9.6.10 — downpour stays on log-wn (crit pink). Drizzle
      // and rain demoted to log-soft (purple warn) since they're
      // advisories, not alerts.
      const cls = w.intensity === 'downpour' ? 'log-wn' : 'log-soft';
      addLog(`<span class="${cls}">${w.intensity} begins \u2014 canteen refilling</span>`);
    } else if (w.intensity === 'none' && prevIntensity !== 'none') {
      addLog('weather clears');
    } else if (w.intensity !== 'none' && prevIntensity !== 'none') {
      const cls = w.intensity === 'downpour' ? 'log-wn' : 'log-soft';
      addLog(`<span class="${cls}">weather shifts to ${w.intensity}</span>`);
    }
    S._transient.lastWeatherIntensity = w.intensity;
    updateWeatherIcon(w.intensity);
  }
}

// ============================================================
// INIT
// ============================================================

/** Seed the weather scheduler. Also migrates any pre-commit-7 storm
 *  entries (ring-based primaryCell) to the unified (x, y, dx, dy)
 *  model. Dropped-field storms are safer than broken ones. */
function migratePreCommit7Storms() {
  if (!Array.isArray(S.storms)) { S.storms = []; return; }
  const migrated = [];
  for (const raw of S.storms) {
    if (typeof raw.x === 'number' && typeof raw.y === 'number') {
      // Already new-shape; ensure dx/dy/intersects present
      if (typeof raw.dx !== 'number' || typeof raw.dy !== 'number') {
        const typeCfg = C.STORM_TYPES[raw.type];
        const angle = Math.random() * Math.PI * 2;
        raw.dx = Math.cos(angle) * (typeCfg ? typeCfg.speedSvg : 0.4);
        raw.dy = Math.sin(angle) * (typeCfg ? typeCfg.speedSvg : 0.4);
      }
      if (!Array.isArray(raw.intersects)) raw.intersects = [];
      migrated.push(raw);
      continue;
    }
    // Legacy ring entry — drop. Rare since storms are transient.
    // Will respawn fresh via schedule.
  }
  S.storms = migrated;
}

export function initWeather() {
  S._transient.lastWeatherIntensity = 'none';
  S._transient.stormIdCounter = S._transient.stormIdCounter || 0;
  migratePreCommit7Storms();

  // v0.0.9.6 commit 7 — initWeather runs after layoutRouteNodes in
  // main.js so node coords are populated by the time we schedule.
  if (!S.nextStormSpawn && S.nextStormSpawnTick <= S.ticks) {
    scheduleNextStorm();
  }

  const w = weatherAtCourier();
  rebuildOverlay(w.intensity);
  S._transient.lastWeatherIntensity = w.intensity;

  initWeatherGear();
  updateWeatherIcon(w.intensity);
}

// ============================================================
// ADMIN
// ============================================================

export function adminToggleStorm() {
  if (S.storms.length > 0) {
    S.storms.length = 0;
    S.nextStormSpawnTick = S.ticks + 300;
    rebuildOverlay('none');
    S._transient.lastWeatherIntensity = 'none';
    addLog('<span class="log-wn">[admin]</span> storms cleared');
    return;
  }
  // Spawn a front at the courier's current (x, y)
  const seg = S._transient.currentSegment;
  const xy  = seg && seg.pathFn ? seg.pathFn(S.dotT) : { x: 200, y: 200 };
  const typeCfg = C.STORM_TYPES.front;
  const angle = Math.random() * Math.PI * 2;
  S.storms.push({
    id: S._transient.stormIdCounter++,
    type: 'front',
    x: xy.x, y: xy.y,
    dx: Math.cos(angle) * typeCfg.speedSvg,
    dy: Math.sin(angle) * typeCfg.speedSvg,
    secondaryOffsetX: 20,
    secondaryOffsetY: 0,
    age: 0,
    seed: Math.floor(Math.random() * 100000),
    isInterior: false,
    intersects: [],
  });
  addLog('<span class="log-wn">[admin]</span> storm spawned at courier');
}

// ============================================================
// WEATHER GEAR UI (unchanged from pre-commit-7)
// ============================================================

const WEATHER_ICONS = {
  none:     '\u2609',
  drizzle:  '\u2601',
  rain:     '\u2602',
  downpour: '\u2608',
};

let legendPainted = false;

function paintLegendBar() {
  const canvas = document.getElementById('weatherLegendBar');
  if (!canvas || legendPainted) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;

  const stops = [
    [0.0,  '#3a6a68'], [0.15, '#4a6a78'], [0.30, '#5a6a88'],
    [0.45, '#6a5a90'], [0.58, '#7a5a98'], [0.70, '#9568b8'],
    [0.82, '#b878cc'], [0.92, '#c76cd0'], [1.0,  '#da5bd6'],
  ];
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  stops.forEach(([pos, color]) => grad.addColorStop(pos, color));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

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

function updateWeatherIcon(intensity) {
  const btn = document.getElementById('weatherGearBtn');
  if (!btn) return;
  btn.textContent = WEATHER_ICONS[intensity] || WEATHER_ICONS.none;
  btn.classList.remove('intensity-drizzle', 'intensity-rain', 'intensity-downpour');
  if (intensity !== 'none') {
    btn.classList.add('intensity-' + intensity);
  }
}

function initWeatherGear() {
  const row = document.getElementById('weatherGearRow');
  const btn = document.getElementById('weatherGearBtn');
  const wrap = document.getElementById('weatherLegendInline');
  if (!btn || !wrap || !row) return;

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

export function updateWeatherGearVisibility() {
  const row = document.getElementById('weatherGearRow');
  if (row) row.hidden = !S.weatherRadio;
}
