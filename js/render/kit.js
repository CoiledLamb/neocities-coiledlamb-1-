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

// Structure cache — rebuild innerHTML only when the capsule set or
// scanner state class changes. Timers and ammo counts update in
// place via textContent so the sonar CSS animation on .scan-btn.on
// doesn't restart every tick of the countdown.
let lastStructure = null;

function scannerState() {
  const sc = S.scanner;
  if (sc.buffActive) return 'on';
  if (sc.manualCooldown > 0) return 'cd';
  return 'ready';
}

function timerTxt() {
  const sc = S.scanner;
  if (sc.buffActive) {
    const secs = Math.ceil(sc.buffRemaining * (C.TICK_MS / 1000));
    return `[${secs}s]`;
  }
  if (sc.manualCooldown > 0) {
    const secs = Math.ceil(sc.manualCooldown * (C.TICK_MS / 1000));
    return `[${secs}s]`;
  }
  return '';
}

export function renderKit() {
  const row      = els.kitRow;
  const caps     = els.kitCaps;
  const battFill = els.kitBatteryFill;
  const battVal  = els.kitBatteryVal;
  const batt     = els.kitBattery;
  if (!row || !caps) return;

  const hasScanner = !!S.scanner.unlocked;
  const hasGun     = !!S.stickyGun;
  const anyGadget  = hasScanner || hasGun;

  if (!anyGadget) {
    if (row.style.display !== 'none') row.style.display = 'none';
    lastStructure = null;
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

  // Structural diff — only the pieces that change DOM shape.
  const sState = hasScanner ? scannerState() : '';
  const structureKey = `${hasScanner?`s|${sState}`:''}||${hasGun?'g':''}`;

  if (structureKey !== lastStructure) {
    lastStructure = structureKey;
    let html = '';
    if (hasScanner) {
      const stateCls = sState === 'ready' ? '' : ' ' + sState;
      html += `<button class="drink-btn scan-btn${stateCls}" id="scannerBtn" aria-label="scan">` +
                `<span class="scan-dot" aria-hidden="true"></span>` +
                `<span class="scan-txt">scan</span>` +
                `<span class="scan-timer" id="scanTimer"></span>` +
              `</button>`;
    }
    if (hasGun) {
      html += `<span class="kit-cap">` +
                `<span class="kit-cap-lbl">gun:</span>` +
                `<span class="kit-cap-val" id="gunAmmoVal"></span>` +
              `</span>`;
    }
    caps.innerHTML = html;

    const newScan = document.getElementById('scannerBtn');
    if (newScan) newScan.addEventListener('click', manualPing);
    els.scannerBtn = newScan;
    els.scanTimer  = document.getElementById('scanTimer');
    els.gunAmmoVal = document.getElementById('gunAmmoVal');
  }

  // In-place text updates — no DOM swap, no animation restart.
  if (hasScanner && els.scanTimer) {
    const txt = timerTxt();
    if (els.scanTimer.textContent !== txt) els.scanTimer.textContent = txt;
  }
  if (hasGun && els.gunAmmoVal) {
    const txt = `${S.stickyGun.ammo}/${S.stickyGun.ammoMax}`;
    if (els.gunAmmoVal.textContent !== txt) els.gunAmmoVal.textContent = txt;
  }
}
