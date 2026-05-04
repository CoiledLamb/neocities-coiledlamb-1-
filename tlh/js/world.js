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

import { S } from './state.js?v=097-0-10';
import * as C from './constants.js?v=097-0-10';
import { ZONE_TYPES } from './data/zones.js?v=097-0-10';
import { rollPkg, rollDestForSpawn, pickupRange, tryCursorPickup, formatPkgTooltip, formatPkgTooltipHTML } from './packages.js?v=097-0-10';
import { isOnShortcut } from './render/route-map.js?v=097-0-10';
import { showRichTooltip, hideRichTooltip, activeRichTooltipId } from './render/rich-tooltip.js?v=097-0-10';

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
// v0.0.9.4 — destId now picked by the ring-distance-weighted
// rollDestForSpawn helper instead of always being the edge endpoint.
// Gives v0.0.9.3's shortcut travel real gameplay weight: packages
// destined for nodes you'd skip create a concrete carry-vs-shortcut
// tradeoff. Default (+0 offset, 40% weight) still lands on the edge
// endpoint so idle play stays functional.
function makeWorldPkg(edgeIdx, cellRisky) {
  // v0.0.8.6: scavenger's eye bumps lost chance from 15% → 22%
  const isLost = Math.random() < (S.upgrades.scavengerEye ? 0.22 : 0.15);
  const destId = rollDestForSpawn(edgeIdx);
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

  // v0.0.9.6 commit 5 — seed interior pkgs on plateau / mountain /
  // rockyHills cells per INTERIOR_SPAWN_* rates. Idempotent: skips
  // cells already in the table (so loading a save with pre-existing
  // interior pkgs doesn't double-seed). Late-imported to avoid a
  // cycle with packages.js -> terrain.js -> gear.js -> state.js.
  import('./packages.js?v=097-0-10').then(({ seedInteriorPkgs }) => {
    if (typeof seedInteriorPkgs === 'function') seedInteriorPkgs();
  });
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
  // v0.0.9.4.1 — precompute in-range ci bucket so each pkg span knows
  // whether to advertise click affordance + tooltip. Interior (shortcut)
  // travel is off-grid — pickup is gated, so no in-range cells during
  // shortcut (matches scanForPickup gate in main.js).
  //
  // In-range here is BIDIRECTIONAL (±range from courier cell) so a pkg
  // behind the courier is still clickable — auto-pickup stays forward-
  // only but manual clicks work in either direction. Without this, a
  // drag-to-toss that lands at a -1/-2/-3 offset (one of ejectFromCargo's
  // fallback cells) would drop an unclickable pkg. tryCursorPickup does
  // the same bidirectional math so handler + class stay in sync.
  const courierCell = Math.floor((S.edgeIdx * C.CELLS_PER_EDGE) + (S.dotT * C.CELLS_PER_EDGE));
  const range = (S.status === 'walking' || S.status === 'carrying') && !isOnShortcut() ? pickupRange() : -1;
  const inRange = new Set();
  for (let o = -range; o <= range; o++) {
    inRange.add((courierCell + o + C.TOTAL_CELLS) % C.TOTAL_CELLS);
  }
  let html = '';
  for (let i = 0; i < renderCount; i++) {
    const ci   = (leftCell + i) % C.TOTAL_CELLS;
    const cell = worldCells[ci];
    if (!cell) continue;
    if (cell.pkg) {
      if (!cell.pkg.picked) {
        const lostCls = cell.pkg.isLost ? ' fc-pk-lost' : '';
        const reachCls = inRange.has(ci) ? ' in-range has-tooltip' : ' has-tooltip';
        // v0.0.9.4.1 — multi-line data-tooltip (white-space: pre on
        // .has-tooltip::after). Escape any quotes in labels defensively
        // (current pool has none, but the data is external-data-shaped).
        const tip = formatPkgTooltip(cell.pkg).replace(/"/g, '&quot;');
        html += `<span class="fc fc-pk${lostCls}${reachCls}" data-ci="${ci}" data-tooltip="${tip}">[${cell.pkg.size}]</span>`;
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
  // v0.0.9.4.1 bugfix — innerHTML replacement destroys any hovered span
  // silently (no mouseout fires). Reconcile tooltip state with the new
  // DOM: refresh position if the span re-rendered, else hide.
  refreshPkgTooltipAfterRender();
}

// v0.0.9.4.1 — wire the fieldstrip click + hover handlers. Called
// once at init after `els.fieldstrip` is bound. Event delegation —
// tick re-renders of the strip's innerHTML don't detach this.
//
// Tooltip uses the unified rich-tooltip system (body-portaled,
// viewport-clamped). CSS ::after can't escape #viewport's overflow:
// hidden nor the strip's transform-containing-block, so we portal-
// host instead.
export function bindFieldstripInteractions() {
  const strip = els.fieldstrip;
  if (!strip || strip.__fsBound) return;
  strip.__fsBound = true;
  strip.addEventListener('click', (ev) => {
    const target = ev.target.closest('.fc-pk.in-range');
    if (!target) return;
    const ci = parseInt(target.getAttribute('data-ci'), 10);
    if (Number.isNaN(ci)) return;
    tryCursorPickup(ci);
  });
  strip.addEventListener('mouseover', (ev) => {
    const target = ev.target.closest('.fc-pk[data-tooltip]');
    if (!target) return;
    const ci = parseInt(target.getAttribute('data-ci'), 10);
    if (!Number.isNaN(ci)) S._transient.hoveredPkgCi = ci;
    showPkgTooltip(target);
  });
  strip.addEventListener('mouseout', (ev) => {
    const target = ev.target.closest('.fc-pk[data-tooltip]');
    if (!target) return;
    // Only hide if we've left the pkg entirely (relatedTarget not a
    // descendant) — prevents flicker when mousing across inner text.
    const to = ev.relatedTarget;
    if (to && target.contains(to)) return;
    S._transient.hoveredPkgCi = null;
    hidePkgTooltip();
  });
  // v0.0.9.4.1 bugfix — also clear on full strip leave. Catches the
  // case where the cursor exits the strip's bounding box while the
  // last hovered span is already destroyed (mouseout on the span
  // never fires in that case).
  strip.addEventListener('mouseleave', () => {
    S._transient.hoveredPkgCi = null;
    hidePkgTooltip();
  });
}

// v0.0.9.4.1 bugfix — called from renderFieldstrip after the new
// innerHTML is in place. If a pkg was being hovered but its span
// vanished in the re-render (pkg scrolled off, got picked up, or is
// now outside the render window), hide the tooltip and clear state.
// If the same ci is still rendered (new span in its place), refresh
// the tooltip's position so it tracks the span's new screen coords.
export function refreshPkgTooltipAfterRender() {
  const ci = S._transient.hoveredPkgCi;
  if (ci == null) return;
  const strip = els.fieldstrip;
  if (!strip) return;
  const span = strip.querySelector(`.fc-pk[data-ci="${ci}"]`);
  if (span) {
    showPkgTooltip(span);
  } else {
    S._transient.hoveredPkgCi = null;
    hidePkgTooltip();
  }
}

// v0.0.9.6.9.30 — migrated to the unified rich-tooltip system.
// Looks up the live pkg from worldCells[ci] and uses the HTML
// formatter so the first line lands in .rich-tip-head (cyan +
// bold). data-tooltip attribute on the span is kept only as the
// hover-handler trigger marker; its value is no longer read.
function showPkgTooltip(targetEl) {
  const ci = parseInt(targetEl.getAttribute('data-ci'), 10);
  if (Number.isNaN(ci)) return;
  const cell = worldCells[ci];
  if (!cell || !cell.pkg) return;
  showRichTooltip(targetEl, formatPkgTooltipHTML(cell.pkg), {
    id: 'pkg',
    placement: 'below',
  });
}

function hidePkgTooltip() {
  if (activeRichTooltipId() === 'pkg') hideRichTooltip();
}
