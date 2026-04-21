/* ===========================================================
   stamina-tip.js (v0.0.9.6.10.5)
   ===========================================================
   Hover tooltip on the stamina bar. Parallel to strain-tip +
   battery-tip. Shows per-tick drain, multiplier breakdown
   (terrain / gear / trample / desert sun), and an ETA to empty
   at the current rate. Canteen summary at the bottom — autodrink
   gating is the main lever on whether the stamina bar will hold.

   Factors are recomputed on each refresh using the same helpers
   main.js::tick() uses to compute the live drain. No extra state
   is stashed between ticks; the tooltip reads directly from
   currentSegment / courierTerrain / trampleAt etc.
   =========================================================== */
'use strict';

import { S } from '../state.js?v=096-10-19';
import * as C from '../constants.js?v=096-10-19';
import {
  TERRAIN_STAMINA_MULT, GEAR_FOR_TERRAIN, GEAR_STAMINA_MITIGATION,
  desertStaminaMult, reduceMultWithTrample,
} from '../data/terrain.js?v=096-10-19';
import { placedGearAt } from '../gear.js?v=096-10-19';
import { trampleAt } from '../trail.js?v=096-10-19';
import { courierTerrain } from './route-map.js?v=096-10-19';
import { daylightOf, TICKS_PER_DAY } from './sky.js?v=096-10-19';
import { showRichTooltip, hideRichTooltip, activeRichTooltipId } from './rich-tooltip.js?v=096-10-19';

const ID = 'stamina';

function fmtSecs(s) {
  if (!isFinite(s) || s < 0) return '\u221e';
  if (s < 60) return Math.max(1, Math.round(s)) + 's';
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return r === 0 ? m + 'm' : m + 'm ' + r + 's';
}

function fmtMult(m) {
  if (typeof m !== 'number' || !isFinite(m)) return '';
  if (Math.abs(m - 1) < 0.005) return '\u00d71.00';
  return '\u00d7' + m.toFixed(2);
}

function multClass(m) {
  // Inverted semantics vs strain: on stamina, >1 mult = faster drain
  // (hot, bad for the player) and <1 mult = slower drain (ok).
  if (m > 1.01) return 'rich-tip-hot';
  if (m < 0.99) return 'rich-tip-ok';
  return 'rich-tip-dim';
}

function row(label, value, mult) {
  const m = typeof mult === 'number' ? `<span class="${multClass(mult)}">${fmtMult(mult)}</span>` : '';
  return `<div class="rich-tip-row"><span class="rich-tip-lbl">${label}</span><span class="rich-tip-val">${value}</span>${m}</div>`;
}

// Severity ramp — mirrors other headers. Low stamina reads as crit.
function staminaHeadClass() {
  const pct = (S.stamina / (S.staminaMax || 1)) * 100;
  if (pct <= 15) return 'rich-tip-head-strain crit';   // reuse strain head class for color consistency
  if (pct <= 40) return 'rich-tip-head-strain warn';
  return 'rich-tip-head-strain';
}

// Recompute multipliers the same way main.js::tick does. Read-only —
// no state mutation. Returns drain per tick + labeled factor rows.
function computeBreakdown() {
  const walking = S.status === 'walking' || S.status === 'carrying';
  if (!walking) return { walking: false, drain: 0 };

  const seg          = S._transient.currentSegment;
  const onInterior   = seg && (seg.type === 'shortcut' || seg.type === 'river-drift');
  const xy           = seg && seg.pathFn ? seg.pathFn(S.dotT) : null;
  const terrain      = courierTerrain();

  let mult        = 1.0;
  let terrMult    = 1.0;
  let gearMult    = 1.0;
  let trampleMult = 1.0;
  let sunFrac     = null;

  if (terrain !== 'flat') {
    terrMult = TERRAIN_STAMINA_MULT[terrain] || 1.0;
    if (terrain === 'desert') {
      sunFrac  = daylightOf(S.ticks % TICKS_PER_DAY);
      terrMult = desertStaminaMult(sunFrac);
    }
    mult *= terrMult;
    // Gear mitigation — only terrains in GEAR_FOR_TERRAIN qualify,
    // and only when a placed entry exists at the current cell.
    if (GEAR_FOR_TERRAIN[terrain] && xy && placedGearAt(xy.x, xy.y)) {
      gearMult = GEAR_STAMINA_MITIGATION;
      mult *= gearMult;
    }
    // Trample — applies on interior segs + plateau ring mesas.
    if ((onInterior || terrain === 'plateau') && xy) {
      const t       = trampleAt(xy.x, xy.y) || 0;
      const reduced = reduceMultWithTrample(mult, t);
      trampleMult   = mult > 1e-6 ? reduced / mult : 1;
      mult          = reduced;
    }
  }

  const drain = C.STAMINA_DRAIN * mult;
  return { walking: true, drain, mult, terrain, terrMult, gearMult, trampleMult, sunFrac };
}

function buildHTML() {
  const b   = computeBreakdown();
  const pct = Math.round((S.stamina / (S.staminaMax || 1)) * 100);
  const headCls = staminaHeadClass();
  const lines = [];

  if (!b.walking) {
    lines.push(`<div class="${headCls}">stamina ${pct}%</div>`);
    const sub = S.status === 'resting'
      ? 'resting \u2014 no drain'
      : `no drain \u2014 ${S.status || 'idle'}`;
    lines.push(`<div class="rich-tip-dim">${sub}</div>`);
    return lines.join('');
  }

  // Head + ETA to empty at current rate. Note: this does NOT model
  // canteen autodrink refilling stamina; it's a "how fast am I
  // burning" signal. Canteen section below shows the other half.
  if (b.drain > 1e-6) {
    const secs = (S.stamina / b.drain) * (C.TICK_MS / 1000);
    lines.push(`<div class="${headCls}">empty in ~${fmtSecs(secs)}</div>`);
    lines.push(`<div class="rich-tip-sub">-${b.drain.toFixed(4)}/tick at current factors</div>`);
  } else {
    lines.push(`<div class="${headCls}">stamina ${pct}%</div>`);
    lines.push('<div class="rich-tip-sub">no drain right now</div>');
  }

  // Factor rows — only show non-neutral multipliers. Terrain first
  // (usually the biggest lever), then gear/trample mitigations.
  const rows = [];
  if (Math.abs(b.terrMult - 1) > 0.01) {
    const label = b.terrain === 'desert' && b.sunFrac !== null
      ? `${b.terrain} (${Math.round(b.sunFrac * 100)}% sun)`
      : b.terrain;
    rows.push(row(label, '', b.terrMult));
  }
  if (b.gearMult < 0.99) {
    rows.push(row('placed gear', '', b.gearMult));
  }
  if (b.trampleMult < 0.99) {
    rows.push(row('trample', '', b.trampleMult));
  }
  if (rows.length) {
    lines.push('<div class="rich-tip-divider"></div>');
    lines.push(...rows);
  }

  // Canteen summary. Autodrink gating determines whether stamina
  // stays high; show current canteen % + autodrink state.
  lines.push('<div class="rich-tip-divider"></div>');
  const canteenPct = Math.round(100 * S.canteen / (S.canteenMax || 1));
  const canteenCls = canteenPct <= 15 ? 'rich-tip-hot' : canteenPct <= 40 ? '' : 'rich-tip-dim';
  const autoLbl = S.autodrink ? 'autodrink on' : 'autodrink off';
  lines.push(`<div class="rich-tip-row"><span class="rich-tip-lbl">canteen</span><span class="rich-tip-val ${canteenCls}">${canteenPct}%</span></div>`);
  lines.push(`<div class="rich-tip-dim">${autoLbl}</div>`);

  return lines.join('');
}

let bound = false;
export function bindStaminaTooltip() {
  if (bound) return;
  const bar = document.getElementById('staminaBar');
  if (!bar) return;
  bound = true;
  bar.style.cursor = 'help';
  bar.addEventListener('mouseenter', () => {
    showRichTooltip(bar, buildHTML(), {
      id: ID,
      placement: 'above',
      refresh: buildHTML,
      refreshMs: 150,
    });
  });
  bar.addEventListener('mouseleave', () => {
    if (activeRichTooltipId() === ID) hideRichTooltip();
  });
}
