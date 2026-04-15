/* ==============================================
   THE LONG HAUL — stamina, canteen, drink, speed

   v0.0.7.29: stamina render swapped from discrete .sseg divs to a
   single contiguous .stamina-bar (border + repeating-linear-gradient
   tick overlay at 25% divisions). Same thresholds and segCount API,
   different paint surface. Overboost now pulses the full-width bar
   via the existing overboost-pulse keyframes rather than showing a
   dedicated 5th segment.

   staminaSegCount() returns 0–4 — current segment count, used
     by trip.js (trip chance scales with segments lost) and
     stamina.js itself (autodrink trigger). Unchanged by the
     visual swap — callers don't know or care about the render.

   renderStamina() repaints the fill width + color state class,
     updates the canteen column, and sets the drink button label.
     Triggers autodrink when a segment threshold is crossed
     downward (driven by staminaSegCount, not the new fill %).

   drinkWater() consumes canteen, restores stamina. Has the
     `efficientConsumption` upgrade as a 0.60x drain multiplier.
     v0.0.7.18: gated so the player can't waste canteen on a
     ~0% restore — must have lost ≥5% stamina to drink. Threshold
     applies both to the manual button and to the early-return
     in drinkWater itself, so autodrink also won't fire trivially.

   speedMultiplier() — locomotion speed factor, scales with
     stamina segments and zeroes-out broken boots (×0.5).
     Used only by main's tick loop.

   trust.js imports staminaSegCount + renderStamina:
     staminaSegCount for tryWarning's low-stamina advisory,
     renderStamina from confirmDepotRest after restoring stamina.
   ============================================== */
'use strict';

import { S } from './state.js';
import { addLog } from './render/log.js';

const els = S._transient.els;

// Drink threshold (v0.0.7.18): must have lost at least this fraction of
// stamina to drink. Prevents wasting a canteen sip on a 1% restore.
const DRINK_MIN_LOSS_PCT = 0.05;

// staminaSegCount is exported for trust.js (tryWarning) and
// trip.js (tripChance scales with segs lost).
export function staminaSegCount() {
  return Math.min(4, Math.ceil(Math.min(S.stamina,S.staminaMax)/(S.staminaMax/4)));
}

function canDrink() {
  if (S.canteen <= 0) return false;
  return S.stamina < S.staminaMax * (1 - DRINK_MIN_LOSS_PCT);
}

// renderStamina is exported for trust.js (confirmDepotRest)
// and called by main's tick + init.
export function renderStamina() {
  const disp = Math.min(S.stamina, S.staminaMax);
  const pct  = Math.max(0, Math.min(100, (disp / S.staminaMax) * 100));
  const overboost = S.staminaOverboost && S.stamina > S.staminaMax;

  const fill = document.getElementById('staminaBarFill');
  if (fill) {
    // Main bar always represents 0..staminaMax. Overboost spills into
    // the side-segment; the main bar stops at 100% and doesn't pulse.
    fill.style.width = (overboost ? 100 : pct) + '%';
    const cls = pct <= 25 ? 'stamina-bar-fill crit'
              : pct <= 50 ? 'stamina-bar-fill half'
              :             'stamina-bar-fill';
    if (fill.className !== cls) fill.className = cls;
  }
  const bar = document.getElementById('staminaBar');
  if (bar) {
    const val = overboost ? 100 : Math.round(pct);
    bar.setAttribute('aria-valuenow', String(val));
    bar.setAttribute('aria-valuetext', overboost ? 'overboost' : val + '% stamina');
  }
  // v0.0.7.31 — overboost side-segment. Represents 0..25% of
  // staminaMax (the overboost ceiling). Appears only when overboosted.
  const overWrap = document.getElementById('staminaOverboost');
  const overFill = document.getElementById('staminaOverboostFill');
  if (overWrap && overFill) {
    if (overboost) {
      overWrap.style.display = '';
      const excess   = Math.max(0, S.stamina - S.staminaMax);
      const ceiling  = S.staminaMax * 0.25;
      const overPct  = ceiling > 0 ? Math.max(0, Math.min(100, (excess / ceiling) * 100)) : 0;
      overFill.style.width = overPct + '%';
    } else if (overWrap.style.display !== 'none') {
      overWrap.style.display = 'none';
    }
  }

  const nowSegs = staminaSegCount();
  if (S.autodrink && nowSegs < S.prevStaminaSeg && canDrink()) drinkWater();
  S.prevStaminaSeg = nowSegs;
  const canteenPct = Math.round((S.canteen/S.canteenMax)*100);
  if (els.drinkBtn) {
    els.drinkBtn.textContent = `drink (${canteenPct}%)`;
    els.drinkBtn.disabled    = !canDrink();
  }
  if (els.canteenBar) {
    // v0.0.7.31: water is the filled column. Color lerps smoothly
    // from bright cyan (#77bfcf, full) to muted forest green
    // (#2a7a58, empty) across the 100..0 range — continuous hue
    // shift rather than threshold steps, so the middle of the
    // range never collides with stamina's muted-teal family.
    els.canteenBar.style.setProperty('--fillp', (canteenPct / 100).toFixed(3));
    if (els.canteenBar.style.height) els.canteenBar.style.height = '';
    if (els.canteenBar.style.opacity) els.canteenBar.style.opacity = '';
    const t = 1 - (canteenPct / 100);      // 0 full, 1 empty
    const r = Math.round(0x77 + (0x2a - 0x77) * t);
    const g = Math.round(0xbf + (0x7a - 0xbf) * t);
    const b = Math.round(0xcf + (0x58 - 0xcf) * t);
    els.canteenBar.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
    const wrap = els.canteenBar.parentElement;
    if (wrap) {
      wrap.setAttribute('role', 'progressbar');
      wrap.setAttribute('aria-label', 'canteen');
      wrap.setAttribute('aria-valuemin', '0');
      wrap.setAttribute('aria-valuemax', '100');
      wrap.setAttribute('aria-valuenow', String(canteenPct));
      wrap.setAttribute('aria-valuetext', canteenPct + '% water');
    }
  }
}

export function drinkWater() {
  if (!canDrink()) return;
  const need = S.staminaMax - S.stamina;
  const rest = Math.min(need, (S.canteen/S.canteenMax) * S.staminaMax);
  S.stamina  = Math.min(S.staminaMax, S.stamina+rest);
  const drainMult = S.upgrades.efficientConsumption ? 0.60 : 1.0;
  S.canteen  = Math.max(0, S.canteen-(rest/S.staminaMax)*S.canteenMax*drainMult);
  addLog(`drank from canteen \u2014 <span class="log-hi">+${Math.round(rest/S.staminaMax*100)}% stamina</span>`);
}

export function speedMultiplier() {
  let mult = 1-(4-staminaSegCount())*0.15;
  if (S.bootDurability<=0)     mult *= 0.5;
  return Math.max(0.2, mult);
}
