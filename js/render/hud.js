/* render/hud.js — extracted commit 16 (v0.0.7.16)

   updateHUD, renderCargoSlots, renderCourierStack. Painted
   from S.delivered/scrip/distKm/status/inventory.

   Circular-by-file with upgrades.js (this calls Upg.renderUpgrades
   from the bottom of updateHUD; upgrades.js imports updateHUD +
   renderCargoSlots from here for buyUpgrade). Fine — every cross-
   call is inside a function body, not at module load.

   Imports:
     S — game state (state.js)
     STATUS_COLORS — visual map (data/glyphs.js)
     formatPkgTooltip — packages.js (shared cargo + ground pkg tooltip)
     Upg.renderUpgrades — upgrades.js (namespace import)

   Local aliases:
     els — live ref into S._transient.els (never reassign).
*/
'use strict';

import { S } from '../state.js';
import { STATUS_COLORS } from '../data/glyphs.js';
import { formatPkgTooltip } from '../packages.js';
import { bindCargoDragSource } from './drag.js';
import * as Upg from '../upgrades.js';

const els = S._transient.els;

// v0.0.9.6.1 — shared sticky-gun web glyph + ammo-state classifier.
// 8 radial spokes + 2 concentric octagonal rings rendered inline via
// currentColor, so parent .cslot.gun / .kit-cap.gun-cap CSS controls
// the tint. 3-band color progression: full (5–8) = white, warn (3–4)
// = purple, crit (0–2) = pink + pulse. Exports let kit.js reuse
// without duplicating markup.
export const GUN_WEB_SVG =
  '<svg class="gun-web" viewBox="0 0 10 10" aria-hidden="true">' +
    '<g fill="none" stroke="currentColor" stroke-linecap="round">' +
      '<line x1="5" y1="1"   x2="5" y2="9"   stroke-width="0.4"/>' +
      '<line x1="1" y1="5"   x2="9" y2="5"   stroke-width="0.4"/>' +
      '<line x1="2.2" y1="2.2" x2="7.8" y2="7.8" stroke-width="0.4"/>' +
      '<line x1="2.2" y1="7.8" x2="7.8" y2="2.2" stroke-width="0.4"/>' +
      '<polygon points="5,3.2 6.3,3.7 6.8,5 6.3,6.3 5,6.8 3.7,6.3 3.2,5 3.7,3.7" stroke-width="0.3"/>' +
      '<polygon points="5,4.2 5.6,4.4 5.8,5 5.6,5.6 5,5.8 4.4,5.6 4.2,5 4.4,4.4" stroke-width="0.25"/>' +
    '</g>' +
  '</svg>';

export function gunAmmoClass(gun) {
  if (!gun) return '';
  // 4-band threshold on the 8-shot max:
  //   full  (5–8): white       — fresh load, no concern
  //   warn  (3–4): purple      — half-spent, start thinking about H
  //   crit  (1–2): pink + pulse — resupply before next trip
  //   empty (  0): muted grey  — gun unusable; greyed out, no pulse
  //                              (empty can't fire, no need to flag)
  const a = gun.ammo;
  if (a === 0) return 'ammo-empty';
  if (a <= 2)  return 'ammo-crit';
  if (a <= 4)  return 'ammo-warn';
  return 'ammo-full';
}

export function updateHUD() {
  els.delivered.textContent = S.delivered;
  els.scrip.textContent     = S.scrip + '\u00a2';
  els.walked.textContent    = (Math.round(S.distKm * 10) / 10) + 'km';
  els.status.textContent    = S.status;
  els.status.style.color    = STATUS_COLORS[S.status] || '#b1c9c3';
  Upg.renderUpgrades();
}

function cargoKey() {
  // v0.0.7.21 — key now includes gun state so slot count / ammo display
  // refresh when gun is purchased / holstered / fired.
  // v0.0.8.1 — modifier included so the pkg rewrite's inert modifier
  // field still triggers a redraw if it ever starts affecting visuals.
  const gunKey = S.stickyGun ? `${S.stickyGun.ammo}/${S.stickyGun.ammoMax}${S.stickyGun.holstered?'h':''}` : '-';
  return S.inventory.map(p => `${p.size}${p.destId}${p.scrip}${p.modifier||''}`).join('|') + '|' + S.maxSlots + '|' + S.usedWeight + '|' + gunKey;
}

// v0.0.8.1 — unified pkg shapes. Each pkg renders as a single multi-cell
// div via CSS grid spans rather than N adjacent 1-cell slots. Size glyph
// centers on the shape. Layout is 2 rows \u00d7 ceil(maxSlots/2) columns.
const PKG_SHAPES = {
  s:  { w: 1, h: 1 },
  m:  { w: 2, h: 1 },
  l:  { w: 2, h: 2 },
  xl: { w: 4, h: 2 },
};

// v0.0.8.3 — pkg footprint. Base shape from PKG_SHAPES plus modifier
// extensions. Unwieldy adds one extra cell to the right of the bottom
// row; it renders as the base div + a separate 1x1 trail div (both
// use the same size class, no special trail styling). The 2px grid
// gap between them IS the visual — reads as "main pkg with an awkward
// extra bit." Honest slot accounting — total rendered cells match
// pkg.slots.
function pkgFootprint(pkg) {
  const base = PKG_SHAPES[pkg.size] || PKG_SHAPES.s;
  const cells = [];
  for (let dy = 0; dy < base.h; dy++)
    for (let dx = 0; dx < base.w; dx++)
      cells.push({ dx, dy });
  const hasTrail = pkg.modifier === 'unwieldy';
  if (hasTrail) cells.push({ dx: base.w, dy: base.h - 1, trail: true });
  return { base, cells, hasTrail };
}

// binPack — first-fit packer. Sorts by cell count desc so larger
// footprints land first, then smaller fill in. Multi-cell aware:
// checks every cell in pkg.cells (not just a bounding rect).
// Returns { placements: [{pkg, x, y, base, hasTrail}], grid }.
function binPack(pkgs, cols, rows, blockedCells) {
  const grid = Array.from({length: rows}, () => Array(cols).fill(null));
  for (const { x, y } of (blockedCells || [])) {
    if (y >= 0 && y < rows && x >= 0 && x < cols) grid[y][x] = '_blocked';
  }
  const withFootprint = pkgs.map(p => ({ pkg: p, fp: pkgFootprint(p) }));
  withFootprint.sort((a, b) => b.fp.cells.length - a.fp.cells.length);
  const placements = [];
  for (const { pkg, fp } of withFootprint) {
    const { base, cells, hasTrail } = fp;
    // Scan bounds: unwieldy extends width by 1 (trail cell is at x=base.w).
    const fpW = hasTrail ? base.w + 1 : base.w;
    const fpH = base.h;
    let placed = false;
    for (let y = 0; y + fpH <= rows && !placed; y++) {
      for (let x = 0; x + fpW <= cols && !placed; x++) {
        let free = true;
        for (const c of cells) {
          if (grid[y + c.dy][x + c.dx]) { free = false; break; }
        }
        if (free) {
          for (const c of cells) grid[y + c.dy][x + c.dx] = pkg;
          placements.push({ pkg, x, y, base, hasTrail });
          placed = true;
        }
      }
    }
    if (!placed) placements.push({ pkg, overflow: true, base, hasTrail });
  }
  return { placements, grid };
}

export function renderCargoSlots(force) {
  if (!els.cargoSlots) return;
  const key = cargoKey();
  if (!force && key === S._transient.lastCargoKey) return;
  S._transient.lastCargoKey = key;

  els.cargoSlots.innerHTML = '';

  // Grid geometry. 2 rows always for uniformity (prior flex-row layout
  // made 4-slot pkgs awkward \u2014 a lumber bundle was 4 adjacent boxes).
  const rows = 2;
  const cols = Math.max(1, Math.ceil(S.maxSlots / rows));
  els.cargoSlots.style.gridTemplateColumns = `repeat(${cols}, var(--cslot-size, 15px))`;
  els.cargoSlots.style.gridTemplateRows    = `repeat(${rows}, var(--cslot-size, 15px))`;

  // Identify blocked cells:
  //   - phantom: cells at indices >= maxSlots (when cols*rows > maxSlots)
  //   - gun:     bottom-right when gun equipped + not holstered
  const totalCells = cols * rows;
  const gunEquipped = !!(S.stickyGun && !S.stickyGun.holstered);
  const blocked = [];
  const phantomCells = [];
  // Last slot order: row-major from top-left. Phantoms are the trailing
  // cells past maxSlots; gun slot is the last non-phantom cell.
  let realSlotsSeen = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const flatIdx = y * cols + x;
      if (flatIdx >= S.maxSlots) {
        phantomCells.push({ x, y });
        blocked.push({ x, y });
      } else {
        realSlotsSeen++;
      }
    }
  }
  let gunCell = null;
  if (gunEquipped) {
    // Gun goes in the last real cell (highest flatIdx < maxSlots).
    // Scan backwards for the last non-phantom cell.
    for (let flatIdx = S.maxSlots - 1; flatIdx >= 0; flatIdx--) {
      const gx = flatIdx % cols, gy = Math.floor(flatIdx / cols);
      gunCell = { x: gx, y: gy };
      blocked.push({ x: gx, y: gy });
      break;
    }
  }

  // Pack packages into the remaining cells.
  const { placements, grid } = binPack(S.inventory, cols, rows, blocked);

  // Render placed packages. Primary shape + optional trail div for
  // unwieldy. Trail has no special styling — inherits the size class
  // so it reads as "same pkg, awkward extra piece" with a visible
  // 2px grid gap communicating the asymmetry.
  for (const p of placements) {
    if (p.overflow) continue;
    // v0.0.9.4.1 commit 1: use shared formatPkgTooltip so ground pkgs
    // and cargo show the same tooltip content. Includes porter id on
    // recovery pkgs (surfaces which peer the recovery came from).
    const tip = formatPkgTooltip(p.pkg);
    const modClass = p.pkg.modifier ? ` mod-${p.pkg.modifier}` : '';
    // v0.0.9.4.1 commit 2: pkg's index in S.inventory — needed by the
    // drag layer to know which item to eject. Computed now (before
    // any splicing) so it stays stable through this render frame.
    const invIdx = S.inventory.indexOf(p.pkg);

    const main = document.createElement('div');
    main.className = `cslot ${p.pkg.size}${modClass} has-tooltip`;
    main.style.gridColumn = `${p.x + 1} / span ${p.base.w}`;
    main.style.gridRow    = `${p.y + 1} / span ${p.base.h}`;
    main.textContent = p.pkg.size;
    main.setAttribute('data-tooltip', tip);
    main.setAttribute('aria-label', tip);
    main.setAttribute('data-inv-idx', String(invIdx));
    bindCargoDragSource(main, invIdx, p.pkg);
    els.cargoSlots.appendChild(main);

    if (p.hasTrail) {
      const trail = document.createElement('div');
      trail.className = `cslot ${p.pkg.size}${modClass} has-tooltip`;
      trail.style.gridColumn = `${p.x + p.base.w + 1}`;
      trail.style.gridRow    = `${p.y + p.base.h}`;
      trail.setAttribute('data-tooltip', tip);
      trail.setAttribute('aria-label', tip);
      trail.setAttribute('data-inv-idx', String(invIdx));
      bindCargoDragSource(trail, invIdx, p.pkg);
      els.cargoSlots.appendChild(trail);
    }
  }

  // Render gun slot.
  if (gunCell) {
    const d = document.createElement('div');
    // v0.0.9.5.5 — inline web SVG + ammo-state color class. See GUN_WEB_SVG
    // + gunAmmoClass for the shared definitions (used by kit bar too).
    d.className = 'cslot gun has-tooltip ' + gunAmmoClass(S.stickyGun);
    d.style.gridColumn = `${gunCell.x + 1}`;
    d.style.gridRow    = `${gunCell.y + 1}`;
    d.innerHTML = GUN_WEB_SVG;
    const gunTip = `sticky gun\nammo ${S.stickyGun.ammo}/${S.stickyGun.ammoMax}\nrefill at H`;
    d.setAttribute('data-tooltip', gunTip);
    d.setAttribute('aria-label', gunTip);
    els.cargoSlots.appendChild(d);
  }

  // Render phantom cells (unavailable due to maxSlots ceiling).
  for (const c of phantomCells) {
    const d = document.createElement('div');
    d.className = 'cslot phantom';
    d.style.gridColumn = `${c.x + 1}`;
    d.style.gridRow    = `${c.y + 1}`;
    els.cargoSlots.appendChild(d);
  }

  // Render empty cells \u2014 any grid cell not covered by a placed pkg,
  // gun, or phantom.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y][x]) continue; // occupied by pkg or blocked
      const d = document.createElement('div');
      d.className = 'cslot e';
      d.style.gridColumn = `${x + 1}`;
      d.style.gridRow    = `${y + 1}`;
      els.cargoSlots.appendChild(d);
    }
  }

  if (els.weightSegs) {
    // v0.0.8.3 — weight segs mirror cargo's 2-row grid so the HUD row
    // doesn't grow linearly with maxWeight. Row-major fill (left-to-
    // right, top-to-bottom) preserves the "fills up as you load"
    // reading of the old flex-row layout.
    els.weightSegs.innerHTML = '';
    const wRows = 2;
    const wCols = Math.max(1, Math.ceil(S.maxWeight / wRows));
    els.weightSegs.style.gridTemplateColumns = `repeat(${wCols}, 8px)`;
    els.weightSegs.style.gridTemplateRows    = `repeat(${wRows}, 8px)`;
    const loadPct = S.usedWeight / S.maxWeight;
    for (let i = 0; i < wCols * wRows; i++) {
      const pip = document.createElement('div');
      if (i >= S.maxWeight) {
        pip.className = 'wseg phantom';
      } else if (i < S.usedWeight) {
        pip.className = loadPct <= 0.5 ? 'wseg filled' : loadPct <= 0.8 ? 'wseg heavy' : 'wseg overloaded';
      } else {
        pip.className = 'wseg empty';
      }
      els.weightSegs.appendChild(pip);
    }
  }
}

export function renderCourierStack() {
  if (!els.courierStack) return;
  els.courierStack.innerHTML = S.inventory.length === 0 ? '' :
    S.inventory.map(p => `<span class="courier-pkg${p.isLost?' lost':''}">[${p.size}]</span>`).join('');
}
