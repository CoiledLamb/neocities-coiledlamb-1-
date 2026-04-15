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
     getDisplayLabel — identification.js (for cargo tooltips)
     Upg.renderUpgrades — upgrades.js (namespace import)

   Local aliases:
     els — live ref into S._transient.els (never reassign).
*/
'use strict';

import { S } from '../state.js';
import { STATUS_COLORS } from '../data/glyphs.js';
import { getDisplayLabel } from '../identification.js';
import * as Upg from '../upgrades.js';

const els = S._transient.els;

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

// binPack — simple first-fit packer. Sorts by footprint (w*h) desc so
// larger shapes land first, then fills in smaller ones around them.
// Returns { placements: [{pkg, x, y, w, h}], grid: [[pkg|null|...]] }.
function binPack(pkgs, cols, rows, blockedCells) {
  const grid = Array.from({length: rows}, () => Array(cols).fill(null));
  // Pre-block unavailable cells (phantoms + gun slot) so the packer avoids them.
  for (const { x, y } of (blockedCells || [])) {
    if (y >= 0 && y < rows && x >= 0 && x < cols) grid[y][x] = '_blocked';
  }
  const sorted = [...pkgs].sort((a, b) => {
    const sa = PKG_SHAPES[a.size] || PKG_SHAPES.s;
    const sb = PKG_SHAPES[b.size] || PKG_SHAPES.s;
    return (sb.w * sb.h) - (sa.w * sa.h);
  });
  const placements = [];
  for (const pkg of sorted) {
    const shape = PKG_SHAPES[pkg.size] || PKG_SHAPES.s;
    let placed = false;
    for (let y = 0; y + shape.h <= rows && !placed; y++) {
      for (let x = 0; x + shape.w <= cols && !placed; x++) {
        let free = true;
        for (let dy = 0; dy < shape.h && free; dy++)
          for (let dx = 0; dx < shape.w && free; dx++)
            if (grid[y+dy][x+dx]) free = false;
        if (free) {
          for (let dy = 0; dy < shape.h; dy++)
            for (let dx = 0; dx < shape.w; dx++)
              grid[y+dy][x+dx] = pkg;
          placements.push({ pkg, x, y, w: shape.w, h: shape.h });
          placed = true;
        }
      }
    }
    if (!placed) placements.push({ pkg, overflow: true, w: shape.w, h: shape.h });
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

  // Render placed packages as multi-cell shapes.
  for (const p of placements) {
    if (p.overflow) continue;
    const d = document.createElement('div');
    d.className = `cslot ${p.pkg.size} has-tooltip`;
    d.style.gridColumn = `${p.x + 1} / span ${p.w}`;
    d.style.gridRow    = `${p.y + 1} / span ${p.h}`;
    d.textContent = p.pkg.size;
    const destLabel = getDisplayLabel(p.pkg.destId);
    const recoveryTag = p.pkg.isRecovery ? ' [recovery]' : (p.pkg.isLost ? ' [lost]' : '');
    const modTag = p.pkg.modifier ? ` (${p.pkg.modifier})` : '';
    const tip = `[${p.pkg.size}] ${p.pkg.label}${modTag}${recoveryTag}\n\u2192 ${destLabel}\n${p.pkg.scrip}\u00a2`;
    d.setAttribute('data-tooltip', tip);
    d.setAttribute('aria-label', tip);
    els.cargoSlots.appendChild(d);
  }

  // Render gun slot.
  if (gunCell) {
    const d = document.createElement('div');
    d.className = 'cslot gun has-tooltip';
    d.style.gridColumn = `${gunCell.x + 1}`;
    d.style.gridRow    = `${gunCell.y + 1}`;
    d.textContent = '\u26a1';
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

export function renderCourierStack() {
  if (!els.courierStack) return;
  els.courierStack.innerHTML = S.inventory.length === 0 ? '' :
    S.inventory.map(p => `<span class="courier-pkg${p.isLost?' lost':''}">[${p.size}]</span>`).join('');
}
