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

import { S } from './state.js?v=097-0-12';
import * as C from './constants.js?v=097-0-12';
import { addLog } from './render/log.js?v=097-0-12';
import { bindStrainTooltip } from './render/strain-tip.js?v=097-0-12';
import { bindStaminaTooltip } from './render/stamina-tip.js?v=097-0-12';
import { emit as tEmit } from './telemetry.js?v=097-0-12';

const els = S._transient.els;

// staminaSegCount is exported for trust.js (tryWarning) and
// trip.js (tripChance scales with segs lost).
export function staminaSegCount() {
  return Math.min(4, Math.ceil(Math.min(S.stamina,S.staminaMax)/(S.staminaMax/4)));
}

function canDrink() {
  if (S.canteen <= 0) return false;
  // v0.0.9.5.1 — require enough canteen to produce a meaningful sip
  // (≥ DRINK_MIN_LOSS_PCT of canteenMax). Without this, near-empty
  // canteens combined with the critLow auto-drink safety net spam
  // "drank from canteen — +0%" every tick. Same threshold as the
  // stamina-side gate so manual + auto behave symmetrically.
  if (S.canteen < S.canteenMax * C.DRINK_MIN_LOSS_PCT) return false;
  return S.stamina < S.staminaMax * (1 - C.DRINK_MIN_LOSS_PCT);
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
    // v0.0.9.6.9.18 — strain is NO LONGER rendered on the stamina bar.
    // Moved to its own dedicated bar (renderStrain below) with a rest
    // button adjacent. Stamina bar is back to showing only stamina.
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

  // v0.0.9.6.9.18 — strain bar has its own render slot next to the
  // stamina bar in the stamina row. Fill width matches the 0..1 strain
  // value; color progression base → warn (purple) → crit (pink).
  // v0.0.9.6.9.19 — collapsed 3 thresholds to 2 states above base
  // (warn + crit) per the "build up to warn, overflow at crit" framing.
  const strainFill = document.getElementById('strainBarFill');
  if (strainFill) {
    const strainVal = S.strain || 0;
    strainFill.style.width = (strainVal * 100) + '%';
    const strainCls = strainVal >= C.STRAIN_CRIT_THRESHOLD ? 'strain-bar-fill crit'
                    : strainVal >= 0.60                    ? 'strain-bar-fill warn'
                    :                                        'strain-bar-fill';
    if (strainFill.className !== strainCls) strainFill.className = strainCls;
  }
  const strainBar = document.getElementById('strainBar');
  if (strainBar) strainBar.setAttribute('aria-valuenow', String(Math.round((S.strain || 0) * 100)));
  // v0.0.9.6.9.27 — strain % moved out of tooltip and into a sibling
  // .strain-val readout (mirrors boots-val). Tooltip now headlines the
  // estimated time-till-trip; the percent here is the at-a-glance.
  const strainValEl = document.getElementById('strainVal');
  if (strainValEl) {
    const pct = Math.round((S.strain || 0) * 100);
    const txt = pct + '%';
    if (strainValEl.textContent !== txt) strainValEl.textContent = txt;
    const cls = pct >= C.STRAIN_CRIT_THRESHOLD * 100 ? 'strain-val crit'
              : pct >= 60                            ? 'strain-val warn'
              :                                        'strain-val';
    if (strainValEl.className !== cls) strainValEl.className = cls;
  }
  // v0.0.9.6.9.26 — wire the strain rich-tooltip on first paint. The
  // bind is idempotent; subsequent renders skip past the guard.
  bindStrainTooltip();
  // v0.0.9.6.10.5 — same pattern for the stamina bar's rich tooltip.
  bindStaminaTooltip();

  // v0.0.9.6.9.30l — smoke-sandalweed button (replaces manual rest).
  // Text surfaces the stash count, switches to `smoking [Ns]` while
  // the grace window is live. Disabled when stash is empty OR the
  // courier isn't walking/carrying (can't smoke while tripped /
  // resting / severe). Click handler lives in main.js init.
  const smokeBtn = document.getElementById('smokeBtn');
  if (smokeBtn) {
    const eligible = (S.status === 'walking' || S.status === 'carrying') && (S.sandalweedCount || 0) > 0;
    smokeBtn.disabled = !eligible;
    const active = S.smokeGrace && S.smokeGrace.ticksRemaining > 0;
    const txt = active
      ? `smoking [${Math.max(1, Math.ceil(S.smokeGrace.ticksRemaining * C.TICK_MS / 1000))}s]`
      : `smoke (${S.sandalweedCount || 0})`;
    if (smokeBtn.textContent !== txt) smokeBtn.textContent = txt;
    smokeBtn.classList.toggle('on', !!active);
  }

  // v0.0.9.6.9.28 — autodrink + prevStaminaSeg tracking moved out of
  // renderStamina into tickAutodrink() (exported below) and called
  // from main.js tick() regardless of simMode. Previously this block
  // lived here and relied on renderStamina being called every tick,
  // which only happened in non-sim play. Headless sims skipped
  // renderStamina → autodrink never fired → canteen stayed full and
  // stamina pinned at 0, polluting strain telemetry.
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

// v0.0.9.6.9.28 — decoupled per-tick autodrink logic. Called from
// main.js's tick() every tick regardless of sim mode so headless
// sims exercise the drink loop the same way live play does.
// Fires on any seg decrement (nowSegs < prevSeg) OR whenever stamina
// crosses below 15% of max (critLow safety net).
export function tickAutodrink() {
  const nowSegs = staminaSegCount();
  const critLow = S.stamina <= S.staminaMax * 0.15;
  if (S.autodrink && canDrink() && (nowSegs < S.prevStaminaSeg || critLow)) drinkWater();
  S.prevStaminaSeg = nowSegs;
}

export function drinkWater() {
  if (!canDrink()) return;
  const need = S.staminaMax - S.stamina;
  const rest = Math.min(need, (S.canteen/S.canteenMax) * S.staminaMax);
  const canteenBefore = S.canteen;
  S.stamina  = Math.min(S.staminaMax, S.stamina+rest);
  const drainMult = S.upgrades.efficientConsumption ? C.DRINK_EFFICIENT_MULT : 1.0;
  S.canteen  = Math.max(0, S.canteen-(rest/S.staminaMax)*S.canteenMax*drainMult);
  if (S.canteen < S.canteenMax * 0.005) S.canteen = 0;
  // v0.0.9.6.9.28 — emit drink telemetry so sim can see how often
  // autodrink fires and how much stamina it restores per sip.
  tEmit('canteen.drink', {
    stamina_restored_pct: Math.round(rest / S.staminaMax * 100),
    canteen_before_pct:   Math.round(canteenBefore / S.canteenMax * 100),
    canteen_after_pct:    Math.round(S.canteen / S.canteenMax * 100),
  });
  addLog(`drank from canteen \u2014 <span class="log-hi">+${Math.round(rest/S.staminaMax*100)}% stamina</span>`);
}

export function speedMultiplier() {
  let mult = 1-(4-staminaSegCount())*0.15;
  if (S.bootDurability<=0)     mult *= 0.5;
  return Math.max(0.2, mult);
}
