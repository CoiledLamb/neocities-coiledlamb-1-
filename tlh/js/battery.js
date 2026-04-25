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

import { S } from './state.js?v=096-10-23';
import * as C from './constants.js?v=096-10-23';
import { weatherAtCourier } from './weather.js?v=096-10-23';
import { daylightOf, TICKS_PER_DAY } from './render/sky.js?v=096-10-23';

// Per-consumer descriptors. `rateOf` / `activeOf` are callbacks so the
// registry reads live state without cloning. `label` is the name
// shown in the rich tooltip; keep short (fits one line).
const CONSUMERS = [
  {
    key: 'scanner',
    label: 'scanner',
    // v0.0.9.6.10.13 — scanner draws only during the buffActive
    // window (auto-ping or manual-ping firing). Previously a flat
    // idle-standby pull; see BATTERY_DRAIN_RATES comment in
    // constants.js for the rate-balance rationale. Scanner T2
    // draws at a lower per-tick rate but pings more often + for
    // longer — net total ≈ flat, but the player can now CHOOSE
    // to burn battery for mitigation (manual pings cost real
    // power during their buff window).
    rateOf: () => S.scanner && S.scanner.level >= 2
      ? C.BATTERY_DRAIN_RATES.scanner2
      : C.BATTERY_DRAIN_RATES.scanner1,
    activeOf: () => !!(S.scanner && S.scanner.unlocked && S.scanner.buffActive),
  },
  {
    key: 'exoskeleton',
    label: 'exoskeleton',
    // Lvl 2 ("extended battery life") draws ~37% less than lvl 1.
    rateOf: () => S.exoskeleton && S.exoskeleton.level >= 2
      ? C.BATTERY_DRAIN_RATES.exoskeleton2
      : C.BATTERY_DRAIN_RATES.exoskeleton1,
    // Draws only while actively moving — idle / resting / tripped
    // don't pull from the motor. Matches the "powered walking"
    // flavor and keeps dead-battery consequences tied to movement.
    activeOf: () => !!(S.exoskeleton && S.exoskeleton.unlocked &&
      (S.status === 'walking' || S.status === 'carrying')),
  },
  {
    key: 'carrier',
    label: 'carrier',
    rateOf: () => S.carrier && S.carrier.level >= 2
      ? C.BATTERY_DRAIN_RATES.carrier2
      : C.BATTERY_DRAIN_RATES.carrier1,
    // Draws only while deployed. Stowed = folded in main cargo, no
    // wheels turning. Unlike exoskeleton the cart doesn't care
    // whether the courier is walking — the "battery" is spinning
    // the hub motors on the wheels and idle draw persists during
    // rest stops (cart stays deployed through resting).
    activeOf: () => !!(S.carrier && S.carrier.unlocked && S.carrier.deployed),
  },
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

// v0.0.9.6.9.30m — full consumer list with active flag for the tooltip.
// Returns every installed/unlocked consumer (not just actively drawing)
// so cold ones ("exo offline at 0 charge", "cart idle while stowed")
// surface as dimmed rows in the battery tooltip instead of vanishing.
// `cold` specifically flags consumers that are installed + powered-on
// contextually (exo while walking, cart while deployed) but blocked by
// empty battery — these are the "bonus has gone cold" cases the player
// needs to notice. Stowed-cart / idle-exo inactive states use `idle`.
export function listBatteryConsumers() {
  const charge = (S.battery && S.battery.charge) || 0;
  const out    = [];
  for (const c of CONSUMERS) {
    // Skip unowned / pre-unlock consumers entirely.
    const unlocked = c.key === 'scanner'
      ? !!(S.scanner && S.scanner.unlocked)
      : c.key === 'exoskeleton'
        ? !!(S.exoskeleton && S.exoskeleton.unlocked)
        : c.key === 'carrier'
          ? !!(S.carrier && S.carrier.unlocked)
          : false;
    if (!unlocked) continue;
    const active = !!c.activeOf();
    // Cold = would-be-active if charge were positive. Exo needs a walking
    // status AND charge; carrier needs deployed AND charge. Charge=0 with
    // the other preconditions met = cold. Scanner's activeOf is "unlocked"
    // alone, so it's never cold in this sense (it keeps a standby draw
    // even at 0 charge — the game treats scanner as the last thing to go).
    let cold = false;
    if (!active && charge <= 0) {
      if (c.key === 'exoskeleton' && (S.status === 'walking' || S.status === 'carrying')) cold = true;
      if (c.key === 'carrier' && S.carrier && S.carrier.deployed) cold = true;
    }
    out.push({ key: c.key, label: c.label, rate: c.rateOf(), active, cold });
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
