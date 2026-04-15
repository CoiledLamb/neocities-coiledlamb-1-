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
    fill.style.width = overboost ? '100%' : pct + '%';
    // Color ramp keyed off segment count so the thresholds line up
    // with the 25% tick divisions drawn in CSS.
    const cls = overboost      ? 'stamina-bar-fill overboost'
              : pct <= 25      ? 'stamina-bar-fill crit'
              : pct <= 50      ? 'stamina-bar-fill half'
              :                  'stamina-bar-fill';
    if (fill.className !== cls) fill.className = cls;
  }
  const bar = document.getElementById('staminaBar');
  if (bar) {
    const val = overboost ? 100 : Math.round(pct);
    bar.setAttribute('aria-valuenow', String(val));
    bar.setAttribute('aria-valuetext', overboost ? 'overboost' : val + '% stamina');
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
    // Fill represents remaining water. Top-anchored (inverted from the
    // pre-v0.0.7.22 bottom-anchored fill) so water "drains down" the
    // column as the canteen empties. Bright cyan at full, shifts toward
    // warning hues as water runs low.
    els.canteenBar.style.height = canteenPct+'%';
    const cls = canteenPct <= 25 ? 'canteen-bar-fill crit'
              : canteenPct <= 50 ? 'canteen-bar-fill warn'
              : 'canteen-bar-fill';
    if (els.canteenBar.className !== cls) els.canteenBar.className = cls;
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
