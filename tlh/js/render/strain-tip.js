/* ===========================================================
   strain-tip.js (v0.0.9.6.9.26)
   ===========================================================
   Hover tooltip on the strain bar that surfaces the live
   factor breakdown driving strain accumulation. Pulls from
   tripChanceBreakdown() — the same factors the trip system
   uses internally — and refreshes every tick while open.

   Why a separate module: keeps the trip / stamina cycle clean
   and lets the tooltip layer evolve independently from sim
   logic. Also lets stamina.js stay free of trip-factor
   formatting concerns.
   =========================================================== */
'use strict';

import { S } from '../state.js?v=097-0-11';
import { tripChanceBreakdown } from '../trip.js?v=097-0-11';
import * as C from '../constants.js?v=097-0-11';
import { showRichTooltip, hideRichTooltip, activeRichTooltipId } from './rich-tooltip.js?v=097-0-11';

const ID = 'strain';

// One-decimal mult formatter, no trailing zero on whole numbers.
function fmtMult(m) {
  if (typeof m !== 'number' || !isFinite(m)) return '';
  if (Math.abs(m - 1) < 0.005) return '\u00d71.00';
  return '\u00d7' + m.toFixed(2);
}

// Tag a multiplier as "raises strain" (>1) or "reduces" (<1) for
// CSS coloring — pink for raises, dim teal for reduces.
function multClass(m) {
  if (m > 1.01) return 'rich-tip-hot';
  if (m < 0.99) return 'rich-tip-ok';
  return 'rich-tip-dim';
}

function row(label, value, mult) {
  const m = typeof mult === 'number' ? `<span class="${multClass(mult)}">${fmtMult(mult)}</span>` : '';
  return `<div class="rich-tip-row"><span class="rich-tip-lbl">${label}</span><span class="rich-tip-val">${value}</span>${m}</div>`;
}

// v0.0.9.6.9.27 — format seconds as compact "Xs" / "Xm Ys".
function fmtSecs(s) {
  if (!isFinite(s) || s < 0) return '\u221e';
  if (s < 60) return Math.max(1, Math.round(s)) + 's';
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return r === 0 ? m + 'm' : m + 'm ' + r + 's';
}

// v0.0.9.6.9.30 — strain head color shifts on trip proximity.
// White at low strain, purple at warn (≥0.50), pink at crit
// (≥0.85). Matches the boot screen's strainState() thresholds
// and the rest of the game's white→purple→pink severity ramp.
function strainHeadClass() {
  const s = S.strain || 0;
  if (s >= 0.85) return 'rich-tip-head-strain crit';
  if (s >= 0.50) return 'rich-tip-head-strain warn';
  return 'rich-tip-head-strain';
}

function buildHTML() {
  const walking = S.status === 'walking' || S.status === 'carrying';
  if (!walking) {
    // Non-walking states never trigger a trip — head stays white
    // (no severity modifier).
    const head = S.status === 'resting'
      ? '<div class="rich-tip-head-strain">resting</div><div class="rich-tip-dim">strain dissipating</div>'
      : `<div class="rich-tip-head-strain">${S.status || 'idle'}</div><div class="rich-tip-dim">no strain accumulation</div>`;
    return head;
  }

  const { chance, factors } = tripChanceBreakdown();
  const delta = chance * C.STRAIN_DELTA_SCALE;
  const remain = Math.max(0, C.STRAIN_TRIP_THRESHOLD - (S.strain || 0));
  // v0.0.9.6.9.27 — head shows estimated time-till-trip at current
  // factors. delta is per-tick; convert to seconds via TICK_MS.
  // If factors stay constant we'd hit threshold in `remainTicks`;
  // it's an estimate, not a promise.
  const headCls = strainHeadClass();
  const lines = [];
  if (delta > 1e-6) {
    const secs = (remain / delta) * (C.TICK_MS / 1000);
    lines.push(`<div class="${headCls}">trip in ~${fmtSecs(secs)}</div>`);
    lines.push(`<div class="rich-tip-sub">+${delta.toFixed(4)}/tick at current factors</div>`);
  } else {
    lines.push(`<div class="${headCls}">trip in \u221e</div>`);
    lines.push('<div class="rich-tip-sub">no accumulation right now</div>');
  }
  lines.push('<div class="rich-tip-divider"></div>');

  // Order: penalties first (largest contributors to fresh strain),
  // then mitigations. Skip neutral factors (mult ≈ 1).
  // Boots — penalty grows as boots wear.
  if (factors.bootFail > 0.01) {
    lines.push(row('boots', Math.round(factors.bootPct) + '%', null));
  }
  // Stamina — explicit mult.
  if (factors.staminaMult > 1.01) {
    lines.push(row('stamina', factors.staminaPct + '%', factors.staminaMult));
  }
  // Terrain.
  if (factors.terrMult && Math.abs(factors.terrMult - 1) > 0.01) {
    lines.push(row(factors.terrain, '', factors.terrMult));
  }
  // Weather.
  if (factors.weatherMult && Math.abs(factors.weatherMult - 1) > 0.01) {
    lines.push(row(factors.weather, '', factors.weatherMult));
  }
  // Risky cell.
  if (factors.riskyCell) {
    lines.push(row('risky cell', '', factors.riskyMult));
  }
  // Encumbrance.
  if (factors.encumbranceMult > 1.01) {
    lines.push(row('cargo load', factors.cargoLoadPct + '%', factors.encumbranceMult));
  }
  // Makeshift sandalweed soles.
  if (factors.usingMakeshift && factors.makeshiftMult > 1.01) {
    lines.push(row('sandalweed', '', factors.makeshiftMult));
  }
  // v0.0.9.6.9.30k — dead-battery deployed carrier drag.
  if (factors.deadCartMult && factors.deadCartMult > 1.01) {
    lines.push(row('dead cart', '', factors.deadCartMult));
  }

  // Mitigations (any sub-1 mult or active grace bonus).
  const mitigations = [];
  if (factors.bootGraceBonus > 0.01)    mitigations.push(row('boot grace',    '', 1 - factors.bootGraceBonus));
  if (factors.staminaGraceBonus > 0.01) mitigations.push(row('stamina grace', '', 1 - factors.staminaGraceBonus));
  if (factors.steadyFeetMult < 0.99)    mitigations.push(row('steady feet',   '', factors.steadyFeetMult));
  if (factors.scannerBuffMult < 0.99)   mitigations.push(row('scanner buff',  '', factors.scannerBuffMult));
  if (factors.exoMult && factors.exoMult < 0.99) mitigations.push(row('exoskeleton', '', factors.exoMult));
  // v0.0.9.6.9.30.2 — theta's river waders (river cells only).
  if (factors.waderMult && factors.waderMult < 0.99) mitigations.push(row('river waders', '', factors.waderMult));
  // v0.0.9.6.9.30l — smoke-sandalweed active-window mitigation. Shows
  // the equivalent multiplier + a countdown so the player sees the
  // window draining in real time.
  if (factors.smokeActive && factors.smokeGraceBonus > 0) {
    const mult = 1 - factors.smokeGraceBonus;
    const secs = Math.max(1, Math.ceil(factors.smokeTicks * C.TICK_MS / 1000));
    mitigations.push(row('smoke', `${secs}s`, mult));
  }
  if (mitigations.length) {
    lines.push('<div class="rich-tip-divider"></div>');
    lines.push(...mitigations);
  }

  return lines.join('');
}

let bound = false;
export function bindStrainTooltip() {
  if (bound) return;
  const bar = document.getElementById('strainBar');
  if (!bar) return;
  bound = true;
  bar.addEventListener('mouseenter', () => {
    showRichTooltip(bar, buildHTML(), {
      id: ID,
      placement: 'above',
      refresh: buildHTML,
      refreshMs: 100,
    });
  });
  bar.addEventListener('mouseleave', () => {
    if (activeRichTooltipId() === ID) hideRichTooltip();
  });
}
