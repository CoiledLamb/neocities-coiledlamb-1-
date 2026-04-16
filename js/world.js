/* ==============================================
   THE LONG HAUL — world generation + scroll

   buildWorld() generates a flat array of CELLS_PER_EDGE × 6
   = 1,560 cells at startup. World is regenerated fresh
   each page load — never persisted.

   Each cell: { html, pkg, sandal, risky, wetland, edgeIdx }.
   Packages get destId stamped at gen time (far end of edge).

   Risky cells: edges leading to C or '·' get risky:true,
   applying a x1.4 trip chance multiplier.

   Wetland cells: tagged with wetland:true so main's tick can
   refill canteen when courier passes through (v0.0.7.18 —
   wires up the long-stubbed refillsCanteen zone flag).

   Scroll is JS-driven: renderFieldstrip() computes
   worldPosFromRoute() then translateX on .tlh-fieldstrip.
   No CSS animation. width: max-content on the strip element.

   calcCellPxWidth() probes the rendered cell width once at
   init by inserting an invisible probe span.
   ============================================== */
'use strict';

import { S } from './state.js';
import * as C from './constants.js';
import { ZONE_TYPES } from './data/zones.js';
import { rollPkg } from './packages.js';

const els = S._transient.els;
const worldCells = S._transient.worldCells;

function weightedPick(arr, getW) {
  const total = arr.reduce((s, x) => s + getW(x), 0);
  let r = Math.random() * total;
  for (const x of arr) { r -= getW(x); if (r <= 0) return x; }
  return arr[0];
}

// v0.0.8.1 — routed through rollPkg. The 15% isLost roll is preserved
// here; recovery pipeline inversion (v0.0.8.2+) will reclaim ownership
// of all isLost spawning, at which point this stays false unconditionally.
function makeWorldPkg(edgeIdx, cellRisky) {
  // v0.0.8.6: scavenger's eye bumps lost chance from 15% → 22%
  const isLost = Math.random() < (S.upgrades.scavengerEye ? 0.22 : 0.15);
  const destId = S.edges[edgeIdx][1];
  return rollPkg(destId, cellRisky, isLost);
}

export function buildWorld() {
  worldCells.length = 0;
  for (let ei = 0; ei < 6; ei++) {
    const isRisky = C.RISKY_EDGE_DEST.has(S.edges[ei][1]);
    let ci = 0;

    while (ci < C.CELLS_PER_EDGE) {
      const zoneKey = weightedPick(Object.keys(ZONE_TYPES), k => ZONE_TYPES[k].weight);
      const zone    = ZONE_TYPES[zoneKey];
      const zoneLen = zone.width[0] + Math.floor(Math.random() * (zone.width[1] - zone.width[0]));
      const isWetland = !!zone.refillsCanteen;

      if (zone.isDepotApproach && Math.random() < 0.4 && ci + 3 <= C.CELLS_PER_EDGE) {
        worldCells.push({ html: `<span class="fc fc-fl">   </span>`,     pkg: null, risky: isRisky, edgeIdx: ei });
        worldCells.push({ html: `<span class="fc fc-depot"> [=] </span>`, pkg: null, risky: isRisky, edgeIdx: ei });
        worldCells.push({ html: `<span class="fc fc-fl">   </span>`,     pkg: null, risky: isRisky, edgeIdx: ei });
        ci += 3;
      }

      for (let i = 0; i < zoneLen && ci < C.CELLS_PER_EDGE; i++, ci++) {
        const r = Math.random();
        if (r < zone.pkgChance && (ci % 8 === 0) && ci + 2 < C.CELLS_PER_EDGE) {
          const pkg = makeWorldPkg(ei, isRisky);
          worldCells.push({ html: '', pkg, risky: isRisky, wetland: isWetland, edgeIdx: ei });
          i += 2; ci += 2;
          continue;
        }
        if (r < zone.pkgChance + zone.sandalChance) {
          worldCells.push({ html: `<span class="fc fc-sw-plant" title="sandalweed"> * </span>`, pkg: null, sandal: true, risky: isRisky, wetland: isWetland, edgeIdx: ei });
          i++; ci++;
          continue;
        }
        const c = weightedPick(zone.chars, x => x.w);
        worldCells.push({ html: `<span class="fc ${c.cls}"> ${c.ch} </span>`, pkg: null, risky: isRisky, wetland: isWetland, edgeIdx: ei });
      }

      if (ci < C.CELLS_PER_EDGE) {
        worldCells.push({ html: `<span class="fc fc-fl">  </span>`, pkg: null, risky: isRisky, wetland: isWetland, edgeIdx: ei });
        ci++;
      }
    }
  }
  while (worldCells.length < C.TOTAL_CELLS) {
    worldCells.push({ html: `<span class="fc fc-fl"> . </span>`, pkg: null, risky: false, edgeIdx: 0 });
  }
  worldCells.length = C.TOTAL_CELLS;

  // v0.0.8 — precompute which edges contain wetland cells for storm
  // spawn bias. Avoids scanning 1560 cells on every spawn.
  const wetSet = new Set();
  for (let i = 0; i < worldCells.length; i++) {
    if (worldCells[i].wetland) wetSet.add(worldCells[i].edgeIdx);
  }
  S._transient.wetlandEdges = [...wetSet];
}

export function calcCellPxWidth() {
  const probe = document.createElement('span');
  probe.className   = 'fc fc-fl';
  probe.textContent = ' . ';
  probe.style.cssText = 'visibility:hidden;position:absolute;';
  document.body.appendChild(probe);
  S._transient.cellPxWidth = probe.getBoundingClientRect().width || 12;
  document.body.removeChild(probe);
}

export function worldPosFromRoute() {
  const courierCell = (S.edgeIdx * C.CELLS_PER_EDGE) + (S.dotT * C.CELLS_PER_EDGE);
  return ((courierCell - C.COURIER_CELL) % C.TOTAL_CELLS + C.TOTAL_CELLS) % C.TOTAL_CELLS;
}

export function renderFieldstrip() {
  const strip = els.fieldstrip;
  if (!strip) return;
  const cellPxWidth = S._transient.cellPxWidth;
  const leftCell = Math.floor(S.worldPos);
  const viewportPx = (strip.parentNode && strip.parentNode.clientWidth) || (C.VIEWPORT_CELLS * cellPxWidth);
  const renderCount = Math.max(C.VIEWPORT_CELLS, Math.ceil(viewportPx / cellPxWidth) + 8);
  let html = '';
  for (let i = 0; i < renderCount; i++) {
    const ci   = (leftCell + i) % C.TOTAL_CELLS;
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
