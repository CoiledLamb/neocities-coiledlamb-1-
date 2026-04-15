/* ==============================================
   THE LONG HAUL — stamina, canteen, drink, speed

   Stamina is rendered as 4 segments (sseg0–3) plus a 5th
   overboost segment (sseg4) shown only when stamina has been
   pushed past staminaMax (the 1.25x post-rest boost).

   staminaSegCount() returns 0–4 — current segment count, used
     by trip.js (trip chance scales with segments lost) and
     stamina.js itself (autodrink trigger).

   renderStamina() repaints all five segments, the canteen bar,
     and the drink button label. Triggers autodrink when a
     segment threshold is crossed downward.

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
  const perSeg = S.staminaMax/4, disp = Math.min(S.stamina,S.staminaMax);
  for (let i=0;i<4;i++) {
    const seg = document.getElementById('sseg'+i); if(!seg) continue;
    const fl=i*perSeg, ce=(i+1)*perSeg;
    if (disp>=ce)      seg.className='sseg full';
    else if (disp>fl)  seg.className='sseg '+((disp-fl)/perSeg>0.5?'half':'crit');
    else               seg.className='sseg empty';
  }
  const over = document.getElementById('sseg4');
  if (over) {
    if (S.staminaOverboost&&S.stamina>S.staminaMax) { over.className='sseg overboost'; over.style.display='block'; }
    else over.style.display='none';
  }
  const nowSegs = staminaSegCount();
  if (S.autodrink && nowSegs < S.prevStaminaSeg && canDrink()) drinkWater();
  S.prevStaminaSeg = nowSegs;
  const canteenPct = Math.round((S.canteen/S.canteenMax)*100);
  if (els.drinkBtn) {
    els.drinkBtn.textContent = `drink (${canteenPct}%)`;
    els.drinkBtn.disabled    = !canDrink();
  }
  if (els.canteenBar) els.canteenBar.style.height = canteenPct+'%';
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
