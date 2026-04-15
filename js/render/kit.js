/* ==============================================
   THE LONG HAUL — kit row render (v0.0.7.24)

   Houses the shared battery readout + any owned gadgets
   (scanner, sticky gun, future exoskeleton, etc). Row is
   hidden entirely until the courier owns at least one
   gadget — no boilerplate for bare-knuckle play.

   Capsule shapes are mixed on purpose:
     - Scanner: an action button (drink-btn prominent when
       ready, dimmed on cooldown, `.on` while buffed).
     - Sticky gun: read-only ammo count (gun fires
       automatically in range; no manual trigger).

   Battery is stubbed at S.battery.charge and NOT persisted
   this patch. Drain/regen + schema bump follow in a later
   sub-version. Keep the render surface ready so promoting
   the mechanic is a one-file mechanics drop.
   ============================================== */
'use strict';

import { S } from './../state.js';
import * as C from './../constants.js';
import { manualPing } from './../scanner.js';

const els = S._transient.els;

// Cache key so we only re-render when visible state changes.
// Keep it stringly-typed; allocation is cheap and the key is a
// handful of chars.
let lastKey = null;

function scannerLabel() {
  const sc = S.scanner;
  if (sc.buffActive) {
    const secs = Math.ceil(sc.buffRemaining * (C.TICK_MS / 1000));
    return `scan [\u25cf ${secs}s]`;
  }
  if (sc.manualCooldown > 0) {
    const secs = Math.ceil(sc.manualCooldown * (C.TICK_MS / 1000));
    return `scan [${secs}s]`;
  }
  return 'scan';
}

export function renderKit() {
  const row     = els.kitRow;
  const caps    = els.kitCaps;
  const battFill= els.kitBatteryFill;
  const battVal = els.kitBatteryVal;
  const batt    = els.kitBattery;
  if (!row || !caps) return;

  const hasScanner = !!S.scanner.unlocked;
  const hasGun     = !!S.stickyGun;
  const anyGadget  = hasScanner || hasGun;

  if (!anyGadget) {
    if (row.style.display !== 'none') row.style.display = 'none';
    lastKey = null;
    return;
  }
  if (row.style.display === 'none') row.style.display = '';

  // battery (stub)
  const charge = Math.max(0, Math.min(100, Math.round(S.battery.charge)));
  if (battFill) {
    battFill.style.width = charge + '%';
    const cls = charge <= 15 ? 'kit-battery-fill crit'
              : charge <= 35 ? 'kit-battery-fill warn'
              : 'kit-battery-fill';
    if (battFill.className !== cls) battFill.className = cls;
  }
  if (battVal) battVal.textContent = charge + '%';
  if (batt) batt.setAttribute('aria-valuenow', String(charge));

  // capsules — diff via a single key; rebuild innerHTML only on change.
  const scanLabel = hasScanner ? scannerLabel() : '';
  const scanReady = hasScanner && !S.scanner.manualCooldown && !S.scanner.buffActive;
  const gunAmmo   = hasGun ? `${S.stickyGun.ammo}/${S.stickyGun.ammoMax}` : '';
  const key = `${hasScanner ? `s|${scanLabel}|${scanReady?'r':'x'}` : ''}` +
              `||${hasGun ? `g|${gunAmmo}` : ''}`;
  if (key === lastKey) return;
  lastKey = key;

  let html = '';
  if (hasScanner) {
    const stateCls = S.scanner.buffActive ? ' on'
                   : S.scanner.manualCooldown > 0 ? ' cd'
                   : '';
    html += `<button class="drink-btn${stateCls}" id="scannerBtn">${scanLabel}</button>`;
  }
  if (hasGun) {
    html += `<span class="kit-cap">` +
              `<span class="kit-cap-lbl">gun:</span>` +
              `<span class="kit-cap-val">${gunAmmo}</span>` +
            `</span>`;
  }
  caps.innerHTML = html;

  // Rebind scan button — innerHTML replaces the node each time the
  // capsule set or label changes.
  const newScan = document.getElementById('scannerBtn');
  if (newScan) newScan.addEventListener('click', manualPing);
  els.scannerBtn = newScan;
}
