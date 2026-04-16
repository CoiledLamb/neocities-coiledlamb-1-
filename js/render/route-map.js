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
const GREEK = { 'A': '\u03b1', 'B': '\u03b2', 'C': '\u03b3', 'H': '\u03b7' };
function nodeGlyph(id) { return GREEK[id] || id; }

export function layoutRouteNodes() {
  const W = 110;
  [{ id:'A', x:W/2, y:18 }, { id:'?', x:W-14, y:65 }, { id:'B', x:W-14, y:128 },
   { id:'C', x:W/2, y:175 }, { id:'H', x:14, y:128 }, { id:'\u00b7', x:14, y:65 }]
  .forEach(p => { const n = S.routeNodes.find(n => n.id === p.id); if (n) { n.x = p.x; n.y = p.y; } });
}

export function drawRouteMap() {
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
    t.textContent = (stage >= 1 || n.id === '?') ? nodeGlyph(n.id) : '?';

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
    while (r < 80) {
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

    // SVG-space sigmas (scaled from cell-space to SVG-space)
    // The route map is ~110x195 SVG units covering 1560 cells
    // Rough scale: 1 cell ≈ 0.07 SVG units for x, but it varies by edge angle.
    // Use a fixed scale that looks right at the map size.
    const pSig1 = typeCfg.sigma1 * 0.35;
    const pSig2 = typeCfg.sigma2 * 0.35;
    const mSig1 = typeCfg.sigma1 * 0.40;  // slightly wider for color mass
    const mSig2 = typeCfg.sigma2 * 0.40;
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
