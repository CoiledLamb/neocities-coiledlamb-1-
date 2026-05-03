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

import { S } from '../state.js?v=097-0-7';
import { statusColor } from '../data/glyphs.js?v=097-0-7';
import { tlhPalette } from '../palette.js?v=097-0-7';
import { formatPkgTooltip, formatPkgTooltipHTML } from '../packages.js?v=097-0-7';
import { getDisplayLabel } from '../identification.js?v=097-0-7';
import { bindCargoDragSource } from './drag.js?v=097-0-7';
import { showRichTooltip, hideRichTooltip, activeRichTooltipId } from './rich-tooltip.js?v=097-0-7';
import * as Upg from '../upgrades.js?v=097-0-7';
import { CARRIER_STATS } from '../constants.js?v=097-0-7';

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

// v0.0.9.6.9.25 — ladder kit-cap glyph as inline SVG (two rails +
// three rungs). Replaces the previous `──` (two hyphens) which read
// as a dash, not a ladder. Same currentColor pattern as gun-web so
// the parent .gear-cap palette tints it.
export const LADDER_SVG =
  '<svg class="ladder-glyph" viewBox="0 0 10 10" aria-hidden="true">' +
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1">' +
      '<line x1="3.2" y1="0.6" x2="3.2" y2="9.4"/>' +
      '<line x1="6.8" y1="0.6" x2="6.8" y2="9.4"/>' +
      '<line x1="3.2" y1="2.6" x2="6.8" y2="2.6"/>' +
      '<line x1="3.2" y1="5.0" x2="6.8" y2="5.0"/>' +
      '<line x1="3.2" y1="7.4" x2="6.8" y2="7.4"/>' +
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
  els.status.style.color    = statusColor(S.status) || tlhPalette().text;
  Upg.renderUpgrades();
}

function cargoKey() {
  // v0.0.7.21 — key now includes gun state so slot count / ammo display
  // refresh when gun is purchased / holstered / fired.
  // v0.0.8.1 — modifier included so the pkg rewrite's inert modifier
  // field still triggers a redraw if it ever starts affecting visuals.
  // v0.0.9.6.9.30j — carrier state folded in so deploy/stow + cart
  // inventory changes trigger a redraw (cart-bag visibility, folded
  // pkg in main, cart slot contents).
  const gunKey = S.stickyGun ? `${S.stickyGun.ammo}/${S.stickyGun.ammoMax}${S.stickyGun.holstered?'h':''}` : '-';
  const mainKey = S.inventory.map(p => `${p.size}${p.destId||''}${p.scrip}${(p.tags||[]).join(',')}${p.kind||''}`).join('|');
  const cart    = S.carrier || {};
  const cartInv = cart.inventory || [];
  const cartKey = cart.unlocked
    ? `c${cart.level}${cart.deployed?'d':'s'}:${cartInv.map(p => `${p.size}${p.destId||''}${p.scrip}`).join('|')}`
    : 'c-';
  return mainKey + '|' + S.maxSlots + '|' + S.usedWeight + '|' + gunKey + '|' + cartKey;
}

// v0.0.8.1 — unified pkg shapes. Each pkg renders as a single multi-cell
// div via CSS grid spans rather than N adjacent 1-cell slots. Size glyph
// centers on the shape. Layout is 2 rows \u00d7 ceil(maxSlots/2) columns.
// v0.0.9.6.10.16 — mediums can rotate. Each entry is a list of
// orientations the packer will try in order. First one that fits
// wins; shape picked survives onto the placement so render uses
// the right span.
const PKG_SHAPES = {
  s:  [{ w: 1, h: 1 }],
  m:  [{ w: 2, h: 1 }, { w: 1, h: 2 }],
  l:  [{ w: 2, h: 2 }],
  xl: [{ w: 4, h: 2 }],
};

// v0.0.8.3 — pkg footprint. Base shape from PKG_SHAPES plus modifier
// extensions. Unwieldy adds one extra cell to the right of the bottom
// row; it renders as the base div + a separate 1x1 trail div (both
// use the same size class, no special trail styling). The 2px grid
// gap between them IS the visual — reads as "main pkg with an awkward
// extra bit." Honest slot accounting — total rendered cells match
// pkg.slots.
// v0.0.9.6.10.16 — returns one variant per available orientation.
// Unwieldy trail stays anchored to the chosen base (right-of-bottom-
// row) so vertical-medium + unwieldy would produce a 1x2 + 1x1 trail
// at (x+0, y+2). No size currently mixes rotation + unwieldy (only
// mediums rotate, unwieldy spawns on any size), so the trail math
// just follows the variant's w/h.
function pkgFootprint(pkg) {
  const orientations = PKG_SHAPES[pkg.size] || PKG_SHAPES.s;
  const hasTrail = !!(pkg.tags && pkg.tags.includes('unwieldy'));
  const variants = orientations.map(base => {
    const cells = [];
    for (let dy = 0; dy < base.h; dy++)
      for (let dx = 0; dx < base.w; dx++)
        cells.push({ dx, dy });
    if (hasTrail) cells.push({ dx: base.w, dy: base.h - 1, trail: true });
    return { base, cells };
  });
  return { variants, hasTrail };
}

// binPack — first-fit packer. Sorts by cell count desc so larger
// footprints land first, then smaller fill in. Multi-cell aware:
// checks every cell in pkg.cells (not just a bounding rect).
// v0.0.9.6.10.16 — orientation-aware. pkgFootprint now returns
// a list of variants (shape + cell layout). The packer tries each
// variant at each (x, y) before moving on. Medium pkgs have two
// variants (2x1 horizontal, 1x2 vertical); the packer picks
// whichever fits first given the grid state. The chosen variant's
// `base` rides onto the placement so render uses the right span.
// Returns { placements: [{pkg, x, y, base, hasTrail}], grid }.
function binPack(pkgs, cols, rows, blockedCells) {
  const grid = Array.from({length: rows}, () => Array(cols).fill(null));
  for (const { x, y } of (blockedCells || [])) {
    if (y >= 0 && y < rows && x >= 0 && x < cols) grid[y][x] = '_blocked';
  }
  // Sort by largest variant's cell count so a pkg with any big variant
  // is placed first. Prevents a medium-vertical squeezing into a slot
  // before an XL gets its chance.
  const withFootprint = pkgs.map(p => ({ pkg: p, fp: pkgFootprint(p) }));
  withFootprint.sort((a, b) => {
    const aMax = Math.max(...a.fp.variants.map(v => v.cells.length));
    const bMax = Math.max(...b.fp.variants.map(v => v.cells.length));
    return bMax - aMax;
  });
  const placements = [];
  for (const { pkg, fp } of withFootprint) {
    const { variants, hasTrail } = fp;
    let placed = false;
    for (let y = 0; y < rows && !placed; y++) {
      for (let x = 0; x < cols && !placed; x++) {
        // Try each orientation at this (x, y). First fit wins.
        for (const variant of variants) {
          const fpW = hasTrail ? variant.base.w + 1 : variant.base.w;
          const fpH = variant.base.h;
          if (x + fpW > cols || y + fpH > rows) continue;
          let free = true;
          for (const c of variant.cells) {
            if (grid[y + c.dy][x + c.dx]) { free = false; break; }
          }
          if (free) {
            for (const c of variant.cells) grid[y + c.dy][x + c.dx] = pkg;
            placements.push({ pkg, x, y, base: variant.base, hasTrail });
            placed = true;
            break;
          }
        }
      }
    }
    if (!placed) {
      // Overflow placement — use the first variant's base for sizing
      // so the overflow badge renders at a sensible shape.
      placements.push({ pkg, overflow: true, base: variants[0].base, hasTrail });
    }
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

  // v0.0.9.6.9.26 — dismiss the cargo rich-tooltip if one was open;
  // its target element is about to be destroyed by the rebuild below.
  // Strain / other-id tooltips are left alone.
  if (activeRichTooltipId() === 'cargo') hideRichTooltip();

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
    // v0.0.9.6.9.26 — cargo cslots also stash an HTML version on the
    // element so the rich-tooltip can render damaged-pkg payouts in
    // pink. aria-label / data-tooltip stay as plain text for a11y +
    // any non-rich consumer.
    const tip = formatPkgTooltip(p.pkg);
    const tipHTML = formatPkgTooltipHTML(p.pkg);
    const modClass = (p.pkg.tags && p.pkg.tags[0]) ? ` mod-${p.pkg.tags[0]}` : '';
    // v0.0.9.4.1 commit 2: pkg's index in S.inventory — needed by the
    // drag layer to know which item to eject. Computed now (before
    // any splicing) so it stays stable through this render frame.
    const invIdx = S.inventory.indexOf(p.pkg);

    const main = document.createElement('div');
    // v0.0.9.6.9.30j — folded carrier pseudo-pkg renders distinctly:
    // dashed-cyan border, `\u25AD` glyph, no drag (can't eject your
    // cart like a regular pkg). Size class drops — the geometry is
    // carried by the grid-span props below; folded class styles the
    // rest. Tooltip still renders via the regular rich-tooltip path
    // so hovering reports "mobile carrier (stowed)".
    if (p.pkg.kind === 'carrier-folded') {
      main.className = `cslot carrier-folded has-tooltip cargo-cslot`;
      main.style.gridColumn = `${p.x + 1} / span ${p.base.w}`;
      main.style.gridRow    = `${p.y + 1} / span ${p.base.h}`;
      main.textContent = '\u25AD';
      const foldedTip = p.pkg.label || 'mobile carrier (stowed)';
      main.setAttribute('data-tooltip', foldedTip);
      main.setAttribute('aria-label', foldedTip);
      main._tipHTML = `<div>${foldedTip}</div><div>deploy to use</div>`;
      els.cargoSlots.appendChild(main);
      continue;
    }
    main.className = `cslot ${p.pkg.size}${modClass} has-tooltip cargo-cslot`;
    main.style.gridColumn = `${p.x + 1} / span ${p.base.w}`;
    main.style.gridRow    = `${p.y + 1} / span ${p.base.h}`;
    main.textContent = p.pkg.size;
    main.setAttribute('data-tooltip', tip);
    main.setAttribute('aria-label', tip);
    main.setAttribute('data-inv-idx', String(invIdx));
    main._tipHTML = tipHTML;
    bindCargoDragSource(main, invIdx, p.pkg);
    els.cargoSlots.appendChild(main);

    if (p.hasTrail) {
      const trail = document.createElement('div');
      trail.className = `cslot ${p.pkg.size}${modClass} has-tooltip cargo-cslot`;
      trail.style.gridColumn = `${p.x + p.base.w + 1}`;
      trail.style.gridRow    = `${p.y + p.base.h}`;
      trail.setAttribute('data-tooltip', tip);
      trail.setAttribute('aria-label', tip);
      trail.setAttribute('data-inv-idx', String(invIdx));
      trail._tipHTML = tipHTML;
      bindCargoDragSource(trail, invIdx, p.pkg);
      els.cargoSlots.appendChild(trail);
    }
  }

  // Render gun slot.
  if (gunCell) {
    const d = document.createElement('div');
    // v0.0.9.5.5 — inline web SVG + ammo-state color class. See GUN_WEB_SVG
    // + gunAmmoClass for the shared definitions (used by kit bar too).
    d.className = 'cslot gun has-tooltip cargo-cslot ' + gunAmmoClass(S.stickyGun);
    d.style.gridColumn = `${gunCell.x + 1}`;
    d.style.gridRow    = `${gunCell.y + 1}`;
    d.innerHTML = GUN_WEB_SVG;
    const gunTip = `sticky gun\nammo ${S.stickyGun.ammo}/${S.stickyGun.ammoMax}\nrefill at H`;
    d.setAttribute('data-tooltip', gunTip);
    d.setAttribute('aria-label', gunTip);
    d._tipHTML = `<div>sticky gun</div><div>ammo ${S.stickyGun.ammo}/${S.stickyGun.ammoMax}</div><div>refill at H</div>`;
    els.cargoSlots.appendChild(d);
  }

  // v0.0.9.6.9.26 — bind hover delegation once. Uses _tipHTML stashed
  // on each cslot above. Identity tag 'cargo' lets the re-render path
  // dismiss only the cargo tooltip and leave others open.
  if (!els.cargoSlots.__cargoTipBound) {
    els.cargoSlots.__cargoTipBound = true;
    els.cargoSlots.addEventListener('mouseover', (ev) => {
      const t = ev.target.closest('.cargo-cslot');
      if (!t || !t._tipHTML) return;
      showRichTooltip(t, t._tipHTML, { id: 'cargo', placement: 'above' });
    });
    els.cargoSlots.addEventListener('mouseout', (ev) => {
      const t = ev.target.closest('.cargo-cslot');
      if (!t) return;
      const to = ev.relatedTarget;
      if (to && t.contains(to)) return;
      hideRichTooltip();
    });
    els.cargoSlots.addEventListener('mouseleave', () => {
      if (activeRichTooltipId() === 'cargo') hideRichTooltip();
    });
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
    // v0.0.9.6.9.30 — weight ribbon unified with the cargo grid.
    // Single-row fuel-gauge, 4px tall, width-matched to the grid
    // above (cols * 15px cells + (cols-1) * 2px gaps). One tick per
    // kg; since maxWeight is an integer and pkg kg is floored, ticks
    // and used-kg always align. Old 2-row pip grid is gone — the
    // grouped container (.cargo-bag) handles the "same widget" read.
    els.weightSegs.innerHTML = '';
    const wCols = Math.max(1, S.maxWeight);
    const cargoWidthPx = cols * 15 + (cols - 1) * 2;
    els.weightSegs.style.width = cargoWidthPx + 'px';
    els.weightSegs.style.gridTemplateColumns = `repeat(${wCols}, 1fr)`;
    els.weightSegs.style.gridTemplateRows    = '';
    const loadPct = S.maxWeight > 0 ? S.usedWeight / S.maxWeight : 0;
    for (let i = 0; i < wCols; i++) {
      const pip = document.createElement('div');
      if (i < S.usedWeight) {
        pip.className = loadPct <= 0.5 ? 'wseg filled' : loadPct <= 0.8 ? 'wseg heavy' : 'wseg overloaded';
      } else {
        pip.className = 'wseg empty';
      }
      els.weightSegs.appendChild(pip);
    }
    bindCargoKgTooltip();
  }

  // v0.0.9.6.9.30j — mobile carrier overlay. Toggles the cargo-btn-
  // stack to 2x2 grid when unlocked, paints the cart-toggle button
  // text + .on class, shows/hides the cart-bag sibling, and renders
  // the cart's own slots + weight ribbon when deployed.
  renderCarrierOverlay();
}

export function renderCarrierOverlay() {
  const carrierUnlocked = !!(S.carrier && S.carrier.unlocked);
  const deployed        = !!(S.carrier && S.carrier.deployed);

  // Toggle 2x2 grid layout + placeholder visibility based on unlock.
  if (els.cargoBtnStack) {
    els.cargoBtnStack.classList.toggle('grid2x2', carrierUnlocked);
  }
  if (els.cartToggleBtn) {
    els.cartToggleBtn.hidden = !carrierUnlocked;
    // Stow/carry text flips with state. `.on` class when cart is
    // deployed (active state = rolling cart); dim when stowed.
    els.cartToggleBtn.textContent = deployed ? 'cart: stow' : 'cart: carry';
    els.cartToggleBtn.classList.toggle('on', deployed);
  }

  // Cart bag visibility + contents.
  if (els.cartBag) {
    els.cartBag.hidden = !deployed;
    // Pink frame class (wired fully in .30k when dead-battery
    // penalties land). Using battery charge directly here so the
    // visual flip is tied to the same gating the UI semantics will
    // use — no other state needed.
    const dead = deployed && S.battery && S.battery.charge <= 0;
    els.cartBag.classList.toggle('dead', dead);
  }
  if (deployed && els.cartSlots) {
    renderCartGrid();
  }
}

// Mirrors the main cargo-slots layout but for S.carrier.inventory.
// Grid geometry is driven by CARRIER_STATS so lvl 1 renders 2x2 and
// lvl 2 renders 3x2.
function renderCartGrid() {
  if (!els.cartSlots) return;
  els.cartSlots.innerHTML = '';
  if (els.cartWeightSegs) els.cartWeightSegs.innerHTML = '';

  const stats = CARRIER_STATS[S.carrier.level] || CARRIER_STATS[1];
  const maxSlots  = stats.maxSlots;
  const maxWeight = stats.maxWeight;
  const rows = 2;
  const cols = Math.max(1, Math.ceil(maxSlots / rows));
  const gridPxW = cols * 15 + (cols - 1) * 2;

  els.cartSlots.style.gridTemplateColumns = `repeat(${cols}, var(--cslot-size, 15px))`;
  els.cartSlots.style.gridTemplateRows    = `repeat(${rows}, var(--cslot-size, 15px))`;

  // Phantoms past maxSlots (when cols*rows > maxSlots, i.e. odd).
  const blocked = [];
  let realSeen = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const flatIdx = y * cols + x;
      if (flatIdx >= maxSlots) {
        blocked.push({ x, y });
      } else {
        realSeen++;
      }
    }
  }

  const inv = (S.carrier.inventory) || [];
  const { placements, grid } = binPack(inv, cols, rows, blocked);

  // Placed pkgs (no drag binding for cart pkgs in this commit — a
  // separate drag source would be needed to let the player pull
  // cart pkgs; deferred to a polish follow-up).
  for (const p of placements) {
    if (p.overflow) continue;
    const tip = formatPkgTooltip(p.pkg);
    const tipHTML = formatPkgTooltipHTML(p.pkg);
    const modClass = (p.pkg.tags && p.pkg.tags[0]) ? ` mod-${p.pkg.tags[0]}` : '';
    const main = document.createElement('div');
    main.className = `cslot ${p.pkg.size}${modClass} has-tooltip cargo-cslot cart-cslot`;
    main.style.gridColumn = `${p.x + 1} / span ${p.base.w}`;
    main.style.gridRow    = `${p.y + 1} / span ${p.base.h}`;
    main.textContent = p.pkg.size;
    main.setAttribute('data-tooltip', tip);
    main.setAttribute('aria-label', tip);
    main._tipHTML = tipHTML;
    els.cartSlots.appendChild(main);
    if (p.hasTrail) {
      const trail = document.createElement('div');
      trail.className = `cslot ${p.pkg.size}${modClass} has-tooltip cargo-cslot cart-cslot`;
      trail.style.gridColumn = `${p.x + p.base.w + 1}`;
      trail.style.gridRow    = `${p.y + p.base.h}`;
      trail.setAttribute('data-tooltip', tip);
      trail.setAttribute('aria-label', tip);
      trail._tipHTML = tipHTML;
      els.cartSlots.appendChild(trail);
    }
  }

  // Phantoms (past maxSlots).
  for (const c of blocked) {
    const d = document.createElement('div');
    d.className = 'cslot phantom';
    d.style.gridColumn = `${c.x + 1}`;
    d.style.gridRow    = `${c.y + 1}`;
    els.cartSlots.appendChild(d);
  }

  // Empties.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y][x]) continue;
      const d = document.createElement('div');
      d.className = 'cslot e';
      d.style.gridColumn = `${x + 1}`;
      d.style.gridRow    = `${y + 1}`;
      els.cartSlots.appendChild(d);
    }
  }

  // Weight ribbon — same shape + palette as main. Width matches the
  // cart slots' content box so the two pair visually.
  if (els.cartWeightSegs) {
    const usedW = inv.reduce((s, p) => s + (p.kg || 0), 0);
    els.cartWeightSegs.style.width = (gridPxW + 4) + 'px'; // +4 for the 2px slot-frame padding on each side
    els.cartWeightSegs.style.gridTemplateColumns = `repeat(${maxWeight}, 1fr)`;
    els.cartWeightSegs.style.gridTemplateRows    = '';
    const loadPct = maxWeight > 0 ? usedW / maxWeight : 0;
    for (let i = 0; i < maxWeight; i++) {
      const pip = document.createElement('div');
      if (i < usedW) {
        pip.className = loadPct <= 0.5 ? 'wseg filled' : loadPct <= 0.8 ? 'wseg heavy' : 'wseg overloaded';
      } else {
        pip.className = 'wseg empty';
      }
      els.cartWeightSegs.appendChild(pip);
    }
  }
}

// v0.0.9.6.9.30 — hover on the weight ribbon gives a per-pkg kg
// breakdown. Same rich-tooltip surface the strain bar uses. Binds
// once (idempotent) — the mouseenter handler reads live state each
// time so rebuilds from renderCargoSlots don't invalidate the hover.
let _cargoKgTipBound = false;
function bindCargoKgTooltip() {
  if (_cargoKgTipBound) return;
  if (!els.weightSegs) return;
  _cargoKgTipBound = true;
  els.weightSegs.addEventListener('mouseenter', () => {
    showRichTooltip(els.weightSegs, buildCargoKgHTML(), {
      id: 'cargo-kg',
      placement: 'above',
      refresh: buildCargoKgHTML,
      refreshMs: 200,
    });
  });
  els.weightSegs.addEventListener('mouseleave', () => {
    if (activeRichTooltipId() === 'cargo-kg') hideRichTooltip();
  });
}

function escKg(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildCargoKgHTML() {
  const used = S.usedWeight || 0;
  const max  = S.maxWeight  || 0;
  // Plain .rich-tip-head (cyan) — informational, not severity-coded.
  // The ribbon underneath already carries the teal/purple/pink
  // severity channel; repeating it in the head would be noise. The
  // dedicated .rich-tip-head-strain class (v0.0.9.6.9.30) exists for
  // tooltips where severity is the primary signal; kg isn't that.
  const lines = [];
  lines.push(`<div class="rich-tip-head">load ${used}/${max} kg</div>`);
  if (!S.inventory || S.inventory.length === 0) {
    lines.push('<div class="rich-tip-dim">bag empty</div>');
    return lines.join('');
  }
  lines.push('<div class="rich-tip-divider"></div>');
  for (const p of S.inventory) {
    const mod = (p.tags && p.tags.length) ? ` <span class="rich-tip-dim">${escKg(p.tags.join('+'))}</span>` : '';
    const dest = p.destId ? ` <span class="rich-tip-dim">\u2192 ${escKg(getDisplayLabel(p.destId))}</span>` : '';
    lines.push(
      `<div class="rich-tip-row">` +
      `<span class="rich-tip-lbl">[${escKg(p.size)}]${mod}${dest}</span>` +
      `<span class="rich-tip-val">${p.kg || 0} kg</span>` +
      `</div>`
    );
  }
  return lines.join('');
}

export function renderCourierStack() {
  if (!els.courierStack) return;
  els.courierStack.innerHTML = S.inventory.length === 0 ? '' :
    S.inventory.map(p => `<span class="courier-pkg${p.isLost?' lost':''}">[${p.size}]</span>`).join('');
}
