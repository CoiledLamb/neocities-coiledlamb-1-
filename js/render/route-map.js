/* render/route-map.js — extracted commit 16 (v0.0.7.16)

   Route SVG rendering. drawRouteMap paints the full route tree
   with stage-aware colors; updateRouteDot animates the porter
   dot along the active edge; layoutRouteNodes sets node coords
   on init. currentEdge is a tiny helper used by both this file
   and main's tick — exported so main can reuse it.

   Imports:
     S — game state (state.js)
     getNodeStage, getDisplayLabel — identification.js

   Local aliases:
     els — live ref into S._transient.els (never reassign).
*/
'use strict';

import { S } from '../state.js';
import * as C from '../constants.js';
import { getNodeStage, getDisplayLabel } from '../identification.js';

const els = S._transient.els;

export function currentEdge() { return S.edges[S.edgeIdx % S.edges.length]; }

// Display mapping: route node IDs → Greek letter equivalents.
// v0.0.9.2 — ? and · now show as φ/ψ post-stage-1 (matches the
// v0.0.8.4 NPC identity patch: phi at weather station, psi at the
// orphan-scavenger settlement).
const GREEK = {
  'A': '\u03b1',          // α
  'B': '\u03b2',          // β
  'C': '\u03b3',          // γ
  'H': '\u03b7',          // η
  '?': '\u03c6',          // φ — phi
  '\u00b7': '\u03c8',     // ψ — psi
};
function nodeGlyph(id) { return GREEK[id] || id; }

// v0.0.9.2 — route map is now a 2D plane in a 400×240 viewBox (wider
// than tall, so the info panels can fit side-by-side below it).
// Nodes spread hexagonally; final rounded-square rim with 4 corner
// NPCs waits for the world-map regen pass (→ v0.0.9.7).
export function layoutRouteNodes() {
  [{ id:'A',      x:200, y: 30 }, // top
   { id:'?',      x:340, y: 70 }, // upper-right (φ / weather station)
   { id:'B',      x:340, y:170 }, // lower-right
   { id:'C',      x:200, y:210 }, // bottom
   { id:'H',      x: 60, y:170 }, // lower-left
   { id:'\u00b7', x: 60, y: 70 }, // upper-left (ψ / orphan-scavenger)
  ].forEach(p => { const n = S.routeNodes.find(n => n.id === p.id); if (n) { n.x = p.x; n.y = p.y; } });
}

// Centroid of the ring — used for label placement and point-in-polygon.
const RING_CX = 200;
const RING_CY = 120;

// Point-in-polygon test using the current ring nodes as vertices.
// Used by drawInterior to mask the texture to the crossable area.
function pointInRing(px, py) {
  const pts = S.routeNodes.map(n => [n.x, n.y]);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    const hit = ((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}

// Seeded RNG so interior texture is stable within a session but
// regenerates on reload. Session-scoped — no save persistence.
function makeSeededRand(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// Placeholder interior texture — dim dots plotted only inside the
// ring polygon. The absence of texture outside communicates "not
// crossable" without needing a drawn boundary. Real terrain lands
// in v0.0.9.5; depth/height map is a later concern.
function drawInterior(svg, ns) {
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('class', 'route-interior');
  g.setAttribute('opacity', '0.35');
  const rand = makeSeededRand(9111);
  const step = 12;
  // v0.0.9.2 — ranges tuned for the 400×240 viewBox.
  for (let yy = 20; yy <= 220; yy += step) {
    for (let xx = 50; xx <= 350; xx += step) {
      if (!pointInRing(xx, yy)) continue;
      const r = rand();
      const ch = r < 0.7 ? '.' : r < 0.9 ? ',' : '\u00b7';
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', xx);
      t.setAttribute('y', yy);
      t.setAttribute('font-family', "'Source Code Pro',monospace");
      t.setAttribute('font-size', '6');
      t.setAttribute('fill', '#2a5c5a');
      t.setAttribute('text-anchor', 'middle');
      t.textContent = ch;
      g.appendChild(t);
    }
  }
  svg.appendChild(g);
}

export function drawRouteMap() {
  const svg = els.routeSvg;
  if (!svg) return;
  svg.innerHTML = '';
  const ns = 'http://www.w3.org/2000/svg';
  const [fromId, toId] = currentEdge();

  // v0.0.9.2 — interior texture plotted first so it renders behind
  // the ring and nodes.
  drawInterior(svg, ns);

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
    // v0.0.9.2 — solid line, slightly wider. Literal ASCII road glyphs
    // land with the structures patch; this is the interim.
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-linecap', 'round');
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
    t.textContent = (stage >= 1 || n.id === '?') ? nodeGlyph(n.id) : '?';

    // v0.0.9.2 — labels placed radially outward from the ring
    // centroid (RING_CX, RING_CY) so each label sits outside its node
    // in the direction away from the center of the plane.
    const dx = n.x - RING_CX, dy = n.y - RING_CY;
    const d  = Math.hypot(dx, dy) || 1;
    const off = 13;
    const lx  = n.x + (dx / d) * off;
    const ly  = n.y + (dy / d) * off + 2;
    const anchor = dx > 8 ? 'start' : dx < -8 ? 'end' : 'middle';
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

  // v0.0.8 — storm rendering (two-layer: color mass + contour lines)
  renderStorms(svg, ns);

  const dot = document.createElementNS(ns, 'circle');
  dot.setAttribute('id', 'routeDot'); dot.setAttribute('r', '3');
  dot.setAttribute('fill', '#e0eeec'); dot.setAttribute('stroke', '#77bfcf'); dot.setAttribute('stroke-width', '1');
  svg.appendChild(dot);
  updateRouteDot();
}

export function updateRouteDot() {
  const dot = document.getElementById('routeDot');
  if (!dot) return;
  const [fromId, toId] = currentEdge();
  const from = S.routeNodes.find(n => n.id === fromId), to = S.routeNodes.find(n => n.id === toId);
  if (!from || !to) return;
  dot.setAttribute('cx', from.x + (to.x - from.x) * S.dotT);
  dot.setAttribute('cy', from.y + (to.y - from.y) * S.dotT);
}

// ============================================================
// STORM RENDERING — dual-gaussian potential field isobars
// ============================================================
// Two independent layers:
//   1. Color mass (blurred) — blue→purple→pink precipitation density
//   2. Contour lines — light teal/cyan structural isobars
// Both use the storm's dual-gaussian field but with slightly offset
// centers so they drift independently (like real weather maps).

/** Convert a cell index to SVG (x, y) using the route node positions. */
function cellToSvg(ci) {
  const edgeIdx = Math.floor(ci / C.CELLS_PER_EDGE);
  const t = (ci % C.CELLS_PER_EDGE) / C.CELLS_PER_EDGE;
  const [fromId, toId] = S.edges[edgeIdx % S.edges.length];
  const from = S.routeNodes.find(n => n.id === fromId);
  const to   = S.routeNodes.find(n => n.id === toId);
  if (!from || !to) return { x: 55, y: 100 };
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

/** Seeded RNG for deterministic contour shapes per storm. */
function makeRand(seed) {
  let s = seed;
  return function() { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

/** Gaussian potential at (x,y) from two SVG-space centers. */
function svgPotential(x, y, c1, s1, c2, s2, w2) {
  const d1 = Math.sqrt((x - c1.x) ** 2 + (y - c1.y) ** 2);
  const d2 = Math.sqrt((x - c2.x) ** 2 + (y - c2.y) ** 2);
  return Math.exp(-(d1 * d1) / (2 * s1 * s1)) + w2 * Math.exp(-(d2 * d2) / (2 * s2 * s2));
}

/**
 * Trace a contour at a given potential threshold by marching outward
 * from a centroid at each sample angle. Returns an SVG path string.
 */
function traceContour(potFn, centX, centY, threshold, wobblePhase1, wobblePhase2) {
  const nSample = 64;
  const pts = [];
  for (let i = 0; i < nSample; i++) {
    const a = (Math.PI * 2 * i) / nSample;
    const dx = Math.cos(a), dy = Math.sin(a);
    let r = 0;
    // v0.0.9.2 — march radius bumped from 80 → 130 for the wider viewBox
    // so the outer contour doesn't clip on heavy storms.
    while (r < 130) {
      if (potFn(centX + dx * r, centY + dy * r) < threshold) break;
      r += 0.4;
    }
    // Very subtle wobble for organic feel
    r *= 1 + Math.sin(a + wobblePhase1) * 0.025;
    r *= 1 + Math.sin(a * 2 + wobblePhase2) * 0.012;
    pts.push({ x: centX + dx * r, y: centY + dy * r });
  }
  // Catmull-Rom to cubic bezier for smooth curves
  let d = '';
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length], p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length], p3 = pts[(i + 2) % pts.length];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    if (i === 0) d = `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} `;
    d += `C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)} `;
  }
  return d + 'Z';
}

function renderStorms(svg, ns) {
  // Gated behind weather radio L2 — the map visualization is the L2 unlock.
  if (!S.weatherRadio || S.weatherRadio.level < 2) return;
  if (S.storms.length === 0) return;

  // Ensure defs block exists for filters/gradients
  let defs = svg.querySelector('defs');
  if (!defs) { defs = document.createElementNS(ns, 'defs'); svg.prepend(defs); }

  // Blur filter for color mass (add once)
  if (!defs.querySelector('#stormBlur')) {
    const bf = document.createElementNS(ns, 'filter');
    bf.setAttribute('id', 'stormBlur');
    bf.setAttribute('x', '-40%'); bf.setAttribute('y', '-40%');
    bf.setAttribute('width', '180%'); bf.setAttribute('height', '180%');
    const feb = document.createElementNS(ns, 'feGaussianBlur');
    feb.setAttribute('stdDeviation', '3');
    bf.appendChild(feb);
    defs.appendChild(bf);
  }

  for (const storm of S.storms) {
    const rand = makeRand(storm.seed);
    const typeCfg = C.STORM_TYPES[storm.type];

    // Convert ring positions to SVG coordinates
    const primary   = cellToSvg(storm.primaryCell);
    const secondary = cellToSvg(storm.secondaryCell);

    // Color mass uses slightly offset centers (precipitation drifts)
    const mOff = { x: (rand() - 0.5) * 6, y: (rand() - 0.5) * 6 };
    const m1 = { x: primary.x + mOff.x, y: primary.y + mOff.y };
    const m2 = { x: secondary.x + mOff.x * 0.5, y: secondary.y + mOff.y * 0.5 };

    // SVG-space sigmas (scaled from cell-space to SVG-space).
    // v0.0.9.2 — scale factors bumped ~1.7× since the viewBox grew
    // from 110-wide to 280-wide. Edges are ~95-120 SVG units each now
    // (vs. ~50-60 in the old layout), so storms need to be wider to
    // still read as storm-shaped.
    const pSig1 = typeCfg.sigma1 * 0.60;
    const pSig2 = typeCfg.sigma2 * 0.60;
    const mSig1 = typeCfg.sigma1 * 0.68;  // slightly wider for color mass
    const mSig2 = typeCfg.sigma2 * 0.68;
    const w2 = typeCfg.w2;

    // Wobble phases (deterministic per storm)
    const wp1 = rand() * Math.PI * 2, wp2 = rand() * Math.PI * 2;
    const wm1 = rand() * Math.PI * 2, wm2 = rand() * Math.PI * 2;

    // Centroids for marching
    const pCentX = (primary.x + secondary.x * w2) / (1 + w2);
    const pCentY = (primary.y + secondary.y * w2) / (1 + w2);
    const mCentX = (m1.x + m2.x * w2) / (1 + w2);
    const mCentY = (m1.y + m2.y * w2) / (1 + w2);

    const pPot = (x, y) => svgPotential(x, y, primary, pSig1, secondary, pSig2, w2);
    const mPot = (x, y) => svgPotential(x, y, m1, mSig1, m2, mSig2, w2);

    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'route-storm');

    // --- LAYER 1: Color mass (blurred blue→purple→pink) ---
    const mg = document.createElementNS(ns, 'g');
    mg.setAttribute('filter', 'url(#stormBlur)');

    const massBands = [
      { t: 0.04, f: '#162e40', o: 0.12 }, { t: 0.09, f: '#1a3848', o: 0.14 },
      { t: 0.15, f: '#1e4458', o: 0.16 }, { t: 0.22, f: '#264a64', o: 0.18 },
      { t: 0.30, f: '#2e4a72', o: 0.20 }, { t: 0.38, f: '#3e4a7a', o: 0.20 },
      { t: 0.47, f: '#504a82', o: 0.20 }, { t: 0.56, f: '#6a4a80', o: 0.18 },
      { t: 0.65, f: '#7a4a78', o: 0.18 }, { t: 0.74, f: '#9d68a4', o: 0.16 },
      { t: 0.83, f: '#b878b8', o: 0.14 }, { t: 0.90, f: '#da8bda', o: 0.12 },
    ];

    for (const band of massBands) {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', traceContour(mPot, mCentX, mCentY, band.t, wm1, wm2));
      path.setAttribute('fill', band.f);
      path.setAttribute('fill-opacity', band.o);
      path.setAttribute('stroke', 'none');
      mg.appendChild(path);
    }
    g.appendChild(mg);

    // --- LAYER 2: Contour lines (light teal/cyan isobars) ---
    const contourLevels = [
      { t: 0.05, c: '#3a6a68', o: 0.18, w: 0.35 }, { t: 0.10, c: '#3a6a68', o: 0.22, w: 0.38 },
      { t: 0.16, c: '#4a7a78', o: 0.26, w: 0.42 }, { t: 0.23, c: '#4a7a78', o: 0.30, w: 0.45 },
      { t: 0.31, c: '#5a8a88', o: 0.36, w: 0.50 }, { t: 0.40, c: '#6a9a98', o: 0.42, w: 0.55 },
      { t: 0.50, c: '#77bfcf', o: 0.38, w: 0.58 }, { t: 0.60, c: '#77bfcf', o: 0.45, w: 0.62 },
      { t: 0.70, c: '#8ac8d0', o: 0.50, w: 0.68 }, { t: 0.80, c: '#b1c9c3', o: 0.50, w: 0.75 },
      { t: 0.90, c: '#b1c9c3', o: 0.55, w: 0.80 },
    ];

    for (const lev of contourLevels) {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', traceContour(pPot, pCentX, pCentY, lev.t, wp1, wp2));
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', lev.c);
      path.setAttribute('stroke-opacity', lev.o);
      path.setAttribute('stroke-width', lev.w);
      g.appendChild(path);
    }

    svg.appendChild(g);
  }
}
