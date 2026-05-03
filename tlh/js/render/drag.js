/* ==============================================
   THE LONG HAUL — drag layer (v0.0.9.4.1 commit 2)

   Drag-to-toss: pull a cargo item out of the cargo grid and release
   outside the grid's bounding box to eject it from inventory. Includes
   a modifier-scaled "lost" roll (fragile pkgs are likeliest to scatter
   into the wild; heavy pkgs rarely lose their footing). Lost drops
   enter the v0.0.7 multiplayer recovery pipeline tagged with the
   player's porter ID. Kept drops land at the courier's current cell
   (walks ±3 for an empty pkg slot) and become normal world pkgs.

   Scope for commit 2:
     - Cargo drag source only (mousedown on `.cslot[data-inv-idx]`).
     - Ghost element tracks the cursor until mouseup.
     - Release outside the cargo-grid bounding box → toss path.
     - Release inside → snap back (no-op). Cargo rearrangement deferred
       since binpack auto-sorts on each render; manual slot-targeting
       doesn't survive a repaint without new ordering state.

   Deferred:
     - Ground → cargo drag: click-to-pickup in commit 1 achieves the
       same result (auto-bin-pack); explicit manual slot placement is
       not load-bearing for the gameloop.

   Click vs drag resolution: a 4-pixel movement threshold distinguishes
   a quick click (no drag commit — lets the parent click handler fire
   normally) from a deliberate drag (commits, suppresses click via a
   session-scoped "just dragged" flag that the cargo click handler can
   check if needed).
   ============================================== */
'use strict';

import { S } from '../state.js?v=097-0-7';
import { ejectFromCargo } from '../packages.js?v=097-0-7';

// Pre-commit: mousedown recorded here but drag hasn't crossed the
// 4px threshold yet. Cleared on mouseup. When a drag commits, this
// moves into `S._transient.drag`.
let pending = null;

const DRAG_THRESHOLD_SQ = 16; // 4px squared

export function bindCargoDragSource(el, invIdx, pkg) {
  el.addEventListener('mousedown', (ev) => {
    // Only left click starts a drag. Middle/right reserved for future.
    if (ev.button !== 0) return;
    ev.preventDefault();
    pending = {
      invIdx,
      pkg,
      startX: ev.clientX,
      startY: ev.clientY,
    };
  });
}

export function bindDragGlobals() {
  if (document.__tlhDragBound) return;
  document.__tlhDragBound = true;

  document.addEventListener('mousemove', (ev) => {
    const drag = S._transient.drag;
    if (drag) {
      // Already dragging — follow cursor, centered on ghost.
      if (drag.ghostEl) positionGhost(drag.ghostEl, ev);
      updateDropHint(ev);
      return;
    }
    if (!pending) return;
    const dx = ev.clientX - pending.startX;
    const dy = ev.clientY - pending.startY;
    if (dx * dx + dy * dy < DRAG_THRESHOLD_SQ) return;

    // Commit drag — create ghost + move pending → S._transient.drag.
    const ghost = document.createElement('div');
    ghost.className = `drag-ghost cslot ${pending.pkg.size}` +
      ((pending.pkg.tags && pending.pkg.tags[0]) ? ` mod-${pending.pkg.tags[0]}` : '');
    ghost.textContent = pending.pkg.size;
    document.body.appendChild(ghost);
    // Ghost is in the DOM now — offsetWidth/Height are meaningful.
    positionGhost(ghost, ev);

    S._transient.drag = {
      invIdx:  pending.invIdx,
      pkg:     pending.pkg,
      ghostEl: ghost,
    };
    pending = null;
    updateDropHint(ev);
  });

  document.addEventListener('mouseup', (ev) => {
    const drag = S._transient.drag;
    if (drag) {
      // Resolve the drop.
      const overCargo = isOverCargoGrid(ev);
      if (!overCargo) {
        // TOSS — outside the cargo-grid bounds.
        ejectFromCargo(drag.invIdx);
      }
      // Inside cargo = snap back (no-op for v1; binpack will re-sort
      // on the next render anyway since the pkg is still in place).

      // Teardown.
      if (drag.ghostEl) drag.ghostEl.remove();
      S._transient.drag = null;
      clearDropHint();
    }
    pending = null;
  });
}

// Center the ghost under the cursor so the dragged pkg reads as "held"
// rather than orbiting next to the pointer. Uses offsetWidth/Height
// which are meaningful once the element is in the DOM with explicit
// sizing (set via .drag-ghost.cslot.{size} rules in CSS).
function positionGhost(ghost, ev) {
  const w = ghost.offsetWidth  || 15;
  const h = ghost.offsetHeight || 15;
  ghost.style.left = (ev.clientX - w / 2) + 'px';
  ghost.style.top  = (ev.clientY - h / 2) + 'px';
}

function getCargoGridEl() {
  // `els.cargoSlots` is the authoritative ref; fall back to id lookup
  // if imports aren't live yet at very early init.
  return (S._transient.els && S._transient.els.cargoSlots)
    || document.getElementById('cargoSlots');
}

function isOverCargoGrid(ev) {
  const el = getCargoGridEl();
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return ev.clientX >= r.left && ev.clientX <= r.right
      && ev.clientY >= r.top  && ev.clientY <= r.bottom;
}

function updateDropHint(ev) {
  const el = getCargoGridEl();
  if (!el) return;
  const over = isOverCargoGrid(ev);
  // Class on the grid container → CSS styles the invalid-toss vs
  // hover-cargo cues. Currently just flags "toss pending" when the
  // cursor is outside the grid while a drag is active.
  el.classList.toggle('drag-over', over);
  document.body.classList.toggle('drag-toss-pending', !over);
}

function clearDropHint() {
  const el = getCargoGridEl();
  if (el) el.classList.remove('drag-over');
  document.body.classList.remove('drag-toss-pending');
}
