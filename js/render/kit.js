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
  const row     = els.kitRow;
  const caps    = els.kitCaps;
  const battVal = els.kitBatteryVal;
  const batt    = els.kitBattery;
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

  // battery (stub) — 10 discrete segs. Each seg represents 10% of
  // full charge. Color ramp (teal → purple → magenta) applies to
  // the *filled* segs when overall charge drops below a threshold.
  // v0.0.7.30: the boundary seg (the one currently draining) gets
  // a .dissolving state with a dot-pattern mask + fractional opacity
  // so it reads as pixels dropping out before the next seg starts
  // depleting.
  const raw          = Math.max(0, Math.min(100, S.battery.charge));
  const charge       = Math.round(raw);
  const fullSegs     = Math.floor(raw / 10);
  const subFill      = (raw - fullSegs * 10) / 10;   // 0..1 within boundary seg
  const segCls       = charge <= 15 ? 'crit' : charge <= 35 ? 'warn' : 'on';

  if (els.batterySegs) {
    const children = els.batterySegs.children;
    for (let i = 0; i < children.length; i++) {
      const seg = children[i];
      let target, sub;
      if (i < fullSegs) {
        target = 'bseg ' + segCls;
        sub = null;
      } else if (i === fullSegs && subFill > 0.02) {
        // Staircase mask: quantize subFill into 4 discrete steps, each
        // mapped to a pre-baked clip-path polygon whose vertices land on
        // tile boundaries. Squares are always fully in or fully out —
        // no mid-pixel diagonal cuts.
        const step = subFill < 0.25 ? 'step1'
                   : subFill < 0.50 ? 'step2'
                   : subFill < 0.75 ? 'step3'
                   :                   'step4';
        target = 'bseg ' + segCls + ' dissolving ' + step;
        sub = null; // --sub var no longer used — clip-path is stepwise
      } else {
        target = 'bseg';
        sub = null;
      }
      if (seg.className !== target) seg.className = target;
      if (sub !== null) {
        if (seg.style.getPropertyValue('--sub') !== sub) {
          seg.style.setProperty('--sub', sub);
        }
      } else if (seg.style.getPropertyValue('--sub')) {
        seg.style.removeProperty('--sub');
      }
    }
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
