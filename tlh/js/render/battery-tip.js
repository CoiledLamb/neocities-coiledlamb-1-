/* ===========================================================
   battery-tip.js (v0.0.9.6.9.30g)
   ===========================================================
   Rich tooltip on the kit-bar battery. Parallel to strain-tip.
   Reads the live consumer registry + gain breakdown from
   battery.js so it always reflects the same math main.js's
   tick loop uses — adding a new consumer in one place (the
   CONSUMERS array) lights this tooltip up automatically.

   Refresh cadence: 200ms. Faster than strain's 100ms because
   battery deltas are slower (scanner alone = 0.03/tick ≈ 0.09/s)
   and the tooltip doesn't need sub-second precision on time-
   till-dead estimates.
   =========================================================== */
'use strict';

import { S } from '../state.js?v=097-0-8';
import { activeBatteryConsumers, activeBatterySolarGainPerTick, listBatteryConsumers } from '../battery.js?v=097-0-8';
import * as C from '../constants.js?v=097-0-8';
import { showRichTooltip, hideRichTooltip, activeRichTooltipId } from './rich-tooltip.js?v=097-0-8';

const ID = 'battery';

// Compact seconds formatter — "12s" / "3m" / "3m 12s" / "∞".
// Same shape strain-tip uses. Duplicated rather than extracted so
// adding new tooltips doesn't require a shared util round-trip.
function fmtSecs(s) {
  if (!isFinite(s) || s < 0) return '\u221e';
  if (s < 60) return Math.max(1, Math.round(s)) + 's';
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return r === 0 ? m + 'm' : m + 'm ' + r + 's';
}

// Tick → real-seconds conversion. TICK_MS defines how long one sim
// tick takes in wall-clock ms; the per-tick deltas from battery.js
// need to be multiplied by (1000 / TICK_MS) to express as per-second.
function ticksToSeconds(ticks) {
  return ticks * (C.TICK_MS / 1000);
}

// Formatter for "+0.10/tick" / "-0.05/tick" style rate strings.
// 3 fractional digits so sub-0.01 gains (night-scan scenarios) still
// read as non-zero; trimmed to remove trailing zeros for the common
// integer-hundredths case.
function fmtRate(r) {
  if (r === 0) return '0/tick';
  const sign = r > 0 ? '+' : '-';
  const abs  = Math.abs(r).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return `${sign}${abs}/tick`;
}

function row(label, value, cls) {
  // Merge cls into the val span's class attribute — two separate
  // class="" attrs get the second one dropped by the HTML parser, so
  // rich-tip-hot/-ok/-dim wouldn't actually apply without this join.
  const valClass = cls ? `rich-tip-val ${cls}` : 'rich-tip-val';
  return `<div class="rich-tip-row">` +
         `<span class="rich-tip-lbl">${label}</span>` +
         `<span class="${valClass}">${value}</span>` +
         `</div>`;
}

function buildHTML() {
  const max    = (S.battery && S.battery.max)    || 100;
  const charge = (S.battery && S.battery.charge) || 0;
  const rounded = Math.round(charge);
  const consumers = activeBatteryConsumers();
  const gain      = activeBatterySolarGainPerTick();
  // v0.0.9.6.9.30m — full installed list for the tooltip. Drain math
  // still uses `consumers` (active subset), but the tooltip walks the
  // full list so cold and idle consumers render as dim rows instead of
  // vanishing at 0 charge.
  const installed = listBatteryConsumers();

  const totalDrain = consumers.reduce((s, c) => s + c.rate, 0);
  const totalGain  = gain.total;
  const net        = totalGain - totalDrain;
  // Cap net at the headroom so "full in Xs" doesn't promise overfill
  // when the charge is already saturated.
  const netCapped  = charge >= max && net > 0 ? 0 : net;

  const lines = [];
  lines.push(`<div class="rich-tip-head">charge ${rounded}/${max}</div>`);

  // Empty state: nothing to report.
  if (installed.length === 0 && totalGain === 0) {
    lines.push('<div class="rich-tip-dim">standby \u2014 no drain, no sun</div>');
    return lines.join('');
  }

  // Consumer rows. Active rows read hot (they're pulling), cold rows
  // read dim with a parenthetical ("offline — no charge") so the player
  // sees the installed consumer hasn't vanished, just gone quiet.
  if (installed.length > 0) {
    lines.push('<div class="rich-tip-divider"></div>');
    for (const c of installed) {
      if (c.active) {
        lines.push(row(c.label, fmtRate(-c.rate), 'rich-tip-hot'));
      } else if (c.cold) {
        lines.push(row(c.label, 'offline', 'rich-tip-dim'));
      } else {
        lines.push(row(c.label, 'idle', 'rich-tip-dim'));
      }
    }
  }

  // Gain rows. Split solar / rain so players see which channel's
  // feeding them right now. Both zero → skip the section.
  if (totalGain > 0) {
    lines.push('<div class="rich-tip-divider"></div>');
    if (gain.solar > 0) {
      const solarLbl = gain.solarMult > 1 ? `solar \u00d7${gain.solarMult}` : 'solar';
      lines.push(row(solarLbl, fmtRate(gain.solar), 'rich-tip-ok'));
    }
    if (gain.rain > 0) {
      lines.push(row('rainfall turbine', fmtRate(gain.rain), 'rich-tip-ok'));
    }
  }

  // Net + ETA.
  lines.push('<div class="rich-tip-divider"></div>');
  const netCls = netCapped > 0.0005 ? 'rich-tip-ok'
               : netCapped < -0.0005 ? 'rich-tip-hot'
               : 'rich-tip-dim';
  lines.push(row('net', fmtRate(netCapped), netCls));

  // ETA — empty (if draining) or full (if gaining). Balance case
  // reports "holding".
  if (netCapped < -0.0005) {
    const ticksUntilEmpty = charge / (-netCapped);
    lines.push(`<div class="rich-tip-sub">empty in ~${fmtSecs(ticksToSeconds(ticksUntilEmpty))}</div>`);
  } else if (netCapped > 0.0005 && charge < max) {
    const ticksUntilFull = (max - charge) / netCapped;
    lines.push(`<div class="rich-tip-sub">full in ~${fmtSecs(ticksToSeconds(ticksUntilFull))}</div>`);
  } else if (charge >= max) {
    lines.push('<div class="rich-tip-sub">fully charged</div>');
  } else {
    lines.push('<div class="rich-tip-sub">holding</div>');
  }

  return lines.join('');
}

let bound = false;
export function bindBatteryTooltip() {
  if (bound) return;
  const bar = document.querySelector('.kit-battery');
  if (!bar) return;
  bound = true;
  bar.style.cursor = 'help';
  bar.addEventListener('mouseenter', () => {
    showRichTooltip(bar, buildHTML(), {
      id: ID,
      placement: 'above',
      refresh: buildHTML,
      refreshMs: 200,
    });
  });
  bar.addEventListener('mouseleave', () => {
    if (activeRichTooltipId() === ID) hideRichTooltip();
  });
}
