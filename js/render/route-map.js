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
import { getNodeStage, getDisplayLabel } from '../identification.js';

const els = S._transient.els;

export function currentEdge() { return S.edges[S.edgeIdx % S.edges.length]; }

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

export function updateRouteDot() {
  const dot = document.getElementById('routeDot');
  if (!dot) return;
  const [fromId, toId] = currentEdge();
  const from = S.routeNodes.find(n => n.id === fromId), to = S.routeNodes.find(n => n.id === toId);
  if (!from || !to) return;
  dot.setAttribute('cx', from.x + (to.x - from.x) * S.dotT);
  dot.setAttribute('cy', from.y + (to.y - from.y) * S.dotT);
}
