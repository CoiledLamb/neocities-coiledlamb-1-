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

   Battery promoted from stub to persistent baseline feature
   in v0.0.9.5 (commit 1 added the schema slot, commit 3 wired
   innate solar-trickle regen + unhooked stickyGun from drain).
   Remaining v0.0.9.5 battery work (delta's solar/turbine
   upgrades, pi's exoskeleton + gamma's mobile carrier as new
   consumers) rides commit 4.
   ============================================== */
'use strict';

import { S } from './../state.js?v=096-10-15';
import * as C from './../constants.js?v=096-10-15';
import { manualPing } from './../scanner.js?v=096-10-15';
import { GUN_WEB_SVG, LADDER_SVG, gunAmmoClass } from './hud.js?v=096-10-15';
import { GEAR_PRICE } from './../data/terrain.js?v=096-10-15';
import { buyGear } from './../gear.js?v=096-10-15';
import { bindBatteryTooltip } from './battery-tip.js?v=096-10-15';

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
  const hasExo     = !!(S.exoskeleton && S.exoskeleton.unlocked);
  const exoLevel   = hasExo ? (S.exoskeleton.level | 0) : 0;
  const exoLive    = hasExo && S.battery.charge > 0;
  // v0.0.9.6.5.1 — kit row is always visible. Previously gated on
  // scanner || gun ownership, which created a chicken-and-egg bug for
  // new players: they could shortcut across mountain terrain but
  // couldn't see the ladder/anchor capsules needed to buy gear.
  // Battery is a real feature now (solar regen + upgrades) and
  // ladder/anchor are commodity infrastructure — neither needs an
  // unlock gate. Early players see the row with just battery +
  // gear capsules until scanner/gun join later.
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
  // v0.0.9.6.9.30g — rich tooltip on the battery bar. Binds once
  // (idempotent); reads active consumers + current solar/turbine
  // gain via battery.js each refresh.
  bindBatteryTooltip();

  // Structural diff — only the pieces that change DOM shape.
  const sState = hasScanner ? scannerState() : '';
  // v0.0.9.6.9.30h — exo structure key tracks ownership + level so
  // the lvl 1 → lvl 2 upgrade rebuilds the cap text without waiting
  // for another trigger. exoLive is reflected in className updates
  // lower down (in-place, no DOM rebuild needed per battery tick).
  const structureKey = `${hasScanner?`s|${sState}`:''}||${hasGun?'g':''}||${hasExo?`e${exoLevel}`:''}`;

  if (structureKey !== lastStructure) {
    lastStructure = structureKey;
    let html = '';
    // v0.0.9.6.9.9 — kit bar reorder. Scanner/gun lead (always-active
    // tools), then the gear group (ladder + anchor capsules) sits
    // adjacent to its auto-gear toggle at the right edge. Reads left
    // to right: actions → weapons → gear + its toggle. Previous order
    // split ladder/anchor from their auto-gear toggle by scanner/gun.
    if (hasScanner) {
      const stateCls = sState === 'ready' ? '' : ' ' + sState;
      html += `<button class="drink-btn scan-btn${stateCls}" id="scannerBtn" aria-label="scan">` +
                `<span class="scan-dot" aria-hidden="true"></span>` +
                `<span class="scan-txt">scan</span>` +
                `<span class="scan-timer" id="scanTimer"></span>` +
              `</button>`;
    }
    if (hasGun) {
      // v0.0.9.5.5 — web glyph replaces the "gun:" text label.
      // Wrapper `.kit-cap.gun-cap` receives the ammo-state class
      // (ammo-warn / ammo-crit) in the in-place update block below
      // so color flips without rebuilding DOM.
      html += `<span class="kit-cap gun-cap" id="gunCap">` +
                `<span class="kit-cap-lbl gun-web-lbl">${GUN_WEB_SVG}</span>` +
                `<span class="kit-cap-val" id="gunAmmoVal"></span>` +
              `</span>`;
    }
    if (hasExo) {
      // v0.0.9.6.9.30h — exoskeleton capsule (pi's trust gift). Pi
      // glyph stands in for the gear identity (same visual anchor
      // used in the route-map node label). `lvl 1` / `lvl 2` body
      // text surfaces tier; `.dead` class flips dim + pink when the
      // battery empties (bonus is off). Updated in place below.
      const valTxt = `lvl ${exoLevel}`;
      html += `<span class="kit-cap exo-cap" id="exoCap">` +
                `<span class="kit-cap-lbl">\u03c0</span>` +
                `<span class="kit-cap-val" id="exoVal">${valTxt}</span>` +
              `</span>`;
    }
    // Gear capsules — ladder + anchor with glyph + count + buy button.
    // v0.0.9.6.9.25 — ladder glyph swapped from `──` to inline SVG.
    html += `<span class="kit-cap gear-cap" id="gearLadderCap">` +
              `<span class="kit-cap-lbl gear-glyph ladder-lbl">${LADDER_SVG}</span>` +
              `<span class="kit-cap-val" id="kitLadderVal"></span>` +
              `<button class="kit-buy-btn" id="kitLadderBuy" type="button" aria-label="buy ladder">+${GEAR_PRICE}\u00a2</button>` +
            `</span>`;
    html += `<span class="kit-cap gear-cap" id="gearAnchorCap">` +
              `<span class="kit-cap-lbl gear-glyph">\u2020</span>` +
              `<span class="kit-cap-val" id="kitAnchorVal"></span>` +
              `<button class="kit-buy-btn" id="kitAnchorBuy" type="button" aria-label="buy anchor">+${GEAR_PRICE}\u00a2</button>` +
            `</span>`;
    // v0.0.9.6.9.9 — auto-gear toggle restyled to match the other
    // auto buttons (boots-auto class pattern, same as autobuy /
    // autodrink / auto-grab). Inline text replaces the inner span.
    // aria-pressed preserved for screen-reader semantics.
    const autoGearOn    = S.kit && S.kit.autoGear ? ' on' : '';
    const autoGearTxt   = S.kit && S.kit.autoGear ? 'auto-gear: on' : 'auto-gear: off';
    const autoGearPress = S.kit && S.kit.autoGear ? 'true' : 'false';
    html += `<button class="boots-auto${autoGearOn}" id="kitAutoGearBtn" type="button" aria-pressed="${autoGearPress}">${autoGearTxt}</button>`;
    caps.innerHTML = html;

    const newScan = document.getElementById('scannerBtn');
    if (newScan) newScan.addEventListener('click', manualPing);
    els.scannerBtn = newScan;
    els.scanTimer  = document.getElementById('scanTimer');
    els.gunAmmoVal = document.getElementById('gunAmmoVal');
    els.gunCap     = document.getElementById('gunCap');
    els.exoCap     = document.getElementById('exoCap');
    els.exoVal     = document.getElementById('exoVal');

    // Gear wiring.
    els.kitLadderVal  = document.getElementById('kitLadderVal');
    els.kitAnchorVal  = document.getElementById('kitAnchorVal');
    els.kitLadderCap  = document.getElementById('gearLadderCap');
    els.kitAnchorCap  = document.getElementById('gearAnchorCap');
    els.kitAutoGearBtn = document.getElementById('kitAutoGearBtn');
    const lBuy = document.getElementById('kitLadderBuy');
    const aBuy = document.getElementById('kitAnchorBuy');
    if (lBuy) lBuy.addEventListener('click', () => { buyGear('ladder'); renderKit(); });
    if (aBuy) aBuy.addEventListener('click', () => { buyGear('anchor'); renderKit(); });
    if (els.kitAutoGearBtn) {
      els.kitAutoGearBtn.addEventListener('click', () => {
        S.kit.autoGear = !S.kit.autoGear;
        renderKit();
      });
    }
  }

  // In-place text updates — no DOM swap, no animation restart.
  if (hasScanner && els.scanTimer) {
    const txt = timerTxt();
    if (els.scanTimer.textContent !== txt) els.scanTimer.textContent = txt;
  }
  if (hasGun && els.gunAmmoVal) {
    const txt = `${S.stickyGun.ammo}/${S.stickyGun.ammoMax}`;
    if (els.gunAmmoVal.textContent !== txt) els.gunAmmoVal.textContent = txt;
    // v0.0.9.5.5 — tick ammo-state class onto the cap wrapper so the
    // color flips across the warn / crit thresholds without a rebuild.
    if (els.gunCap) {
      const want = ('kit-cap gun-cap ' + gunAmmoClass(S.stickyGun)).trim();
      if (els.gunCap.className !== want) els.gunCap.className = want;
    }
  }
  // v0.0.9.6.9.30h — exo cap live-state class. dead=battery empty.
  if (hasExo && els.exoCap) {
    const want = exoLive ? 'kit-cap exo-cap' : 'kit-cap exo-cap dead';
    if (els.exoCap.className !== want) els.exoCap.className = want;
  }
  // v0.0.9.6 commit 4 — gear capsule counts + auto-toggle state.
  const ladders = S.kit ? S.kit.ladders : 0;
  const anchors = S.kit ? S.kit.anchors : 0;
  if (els.kitLadderVal) {
    const txt = String(ladders);
    if (els.kitLadderVal.textContent !== txt) els.kitLadderVal.textContent = txt;
  }
  if (els.kitAnchorVal) {
    const txt = String(anchors);
    if (els.kitAnchorVal.textContent !== txt) els.kitAnchorVal.textContent = txt;
  }
  if (els.kitLadderCap) {
    const dim = ladders === 0 ? 'kit-cap gear-cap empty' : 'kit-cap gear-cap';
    if (els.kitLadderCap.className !== dim) els.kitLadderCap.className = dim;
  }
  if (els.kitAnchorCap) {
    const dim = anchors === 0 ? 'kit-cap gear-cap empty' : 'kit-cap gear-cap';
    if (els.kitAnchorCap.className !== dim) els.kitAnchorCap.className = dim;
  }
  if (els.kitAutoGearBtn) {
    const on = !!(S.kit && S.kit.autoGear);
    const txt = on ? 'auto-gear: on' : 'auto-gear: off';
    if (els.kitAutoGearBtn.textContent !== txt) els.kitAutoGearBtn.textContent = txt;
    const want = on ? 'boots-auto on' : 'boots-auto';
    if (els.kitAutoGearBtn.className !== want) els.kitAutoGearBtn.className = want;
    const pressed = on ? 'true' : 'false';
    if (els.kitAutoGearBtn.getAttribute('aria-pressed') !== pressed) {
      els.kitAutoGearBtn.setAttribute('aria-pressed', pressed);
    }
  }
}
