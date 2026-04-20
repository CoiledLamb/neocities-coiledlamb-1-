/* ==============================================
   THE LONG HAUL — battery subsystem (v0.0.9.6.9.30f)

   Consolidates the battery consumer registry + current-gain
   calculation that used to live inline in main.js's tick().
   Two public surfaces:

     activeBatteryConsumers() → [{ key, label, rate, active, note }]
       One entry per potential consumer. `active` is true only
       when the consumer is both unlocked AND currently drawing
       (scanner whenever unlocked, exoskeleton while walking,
       carrier while deployed). Tooltip layer reads the full list
       so it can dim inactive consumers or hide them.

     activeBatteryDrainPerTick() → number
       Sum of rates for active consumers. main.js's tick calls
       this to advance S.battery.charge.

     activeBatterySolarGainPerTick() → { total, solar, rain, solarMult }
       Current regen rate split by source. Tooltip renders each
       channel; main.js still adds the total inline so the exact
       arithmetic mirrors the pre-refactor drain/gain loop
       (branch shape preserved, just sourced through this module).

   Why a module: commit 2 (battery rich tooltip) needs to
   enumerate active consumers and show their rates + net math.
   Keeping the logic in one place means adding the exoskeleton
   (commit 3) and carrier (commit 4) is a single-line registration
   each — the tooltip updates automatically.
   ============================================== */
'use strict';

import { S } from './state.js';
import * as C from './constants.js';
import { weatherAtCourier } from './weather.js';
import { daylightOf, TICKS_PER_DAY } from './render/sky.js';

// Per-consumer descriptors. `rateOf` / `activeOf` are callbacks so the
// registry reads live state without cloning. `label` is the name
// shown in the rich tooltip; keep short (fits one line).
const CONSUMERS = [
  {
    key: 'scanner',
    label: 'scanner',
    rateOf:   () => C.BATTERY_DRAIN_RATES.scanner,
    activeOf: () => !!(S.scanner && S.scanner.unlocked),
    // Note: scanner drains while unlocked even when not actively
    // pinging — the idle "standby" pull is the game mechanic.
  },
  // exoskeleton + carrier rows land in commits 3 & 4. Placeholders
  // documented here so the registry is self-explanatory. Add:
  //   { key: 'exoskeleton', rateOf: () => S.exoskeleton.level===2
  //       ? C.BATTERY_DRAIN_RATES.exoskeleton2
  //       : C.BATTERY_DRAIN_RATES.exoskeleton1,
  //     activeOf: () => S.exoskeleton && S.exoskeleton.unlocked &&
  //       (S.status === 'walking' || S.status === 'carrying') }
  //   { key: 'carrier',     rateOf: () => ..., activeOf: () => ...deployed }
];

export function activeBatteryConsumers() {
  const out = [];
  for (const c of CONSUMERS) {
    const active = !!c.activeOf();
    if (!active) continue;
    out.push({ key: c.key, label: c.label, rate: c.rateOf() });
  }
  return out;
}

export function activeBatteryDrainPerTick() {
  let sum = 0;
  for (const c of CONSUMERS) {
    if (c.activeOf()) sum += c.rateOf();
  }
  return sum;
}

// Mirrors main.js's tick gain branches. Returns the full breakdown so
// the tooltip can display each channel; main.js sums `.total` and
// clamps to battery.max inline (keeps the arithmetic path short).
export function activeBatterySolarGainPerTick() {
  let solar = 0;
  let rain  = 0;
  const solarMult = S.upgrades && S.upgrades.solarPanel ? 1.5 : 1.0;
  // Solar channel (day only).
  const sun = daylightOf(S.ticks % TICKS_PER_DAY);
  if (sun > 0) {
    solar = sun * C.BATTERY_SOLAR_PEAK_PER_TICK * solarMult;
  }
  // Rain channel (any time, requires rainfallTurbine upgrade).
  if (S.upgrades && S.upgrades.rainfallTurbine) {
    const w = weatherAtCourier();
    const rainMult = w.intensity === 'downpour' ? 0.75
                   : w.intensity === 'rain'     ? 0.50
                   : w.intensity === 'drizzle'  ? 0.25
                   : 0;
    if (rainMult > 0) rain = rainMult * C.BATTERY_SOLAR_PEAK_PER_TICK;
  }
  return { total: solar + rain, solar, rain, solarMult };
}
