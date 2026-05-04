/* ==============================================
   THE LONG HAUL — terrain scanner (v0.0.7.21)

   Courier equipment v2, piece 2 of 3 (sticky gun is piece 1,
   mobile carrier is piece 3). Scanner is a trip-risk mitigator:
   periodic auto-pings grant a short buff that multiplies
   tripChance() by SCANNER_BUFF_MAGNITUDE (trip.js reads
   S.scanner.buffActive + buffMagnitude). Manual ping is a
   longer-duration override on a cooldown.

   This patch ships T1 only. The framework (level field,
   manualCooldown persistence) is forward-compat for T2/T3 in
   v0.0.7.23 — just bump the tuning constants and the level
   check in the buff-duration picker.

   Called from main.js tick() once per tick. No-op unless
   S.scanner.unlocked.

   Battery: not this patch. Handoff flagged the battery shared
   spec as "design ahead" — for v0.0.7.21 scanner just uses
   a local tick-based timer. When mobile carrier lands, battery
   becomes a real subsystem and scanner re-wires.

   Exports:
     tickScanner()     — per-tick update (called from main.js tick).
                         Drains buffRemaining, counts down cooldowns,
                         fires auto-pings.
     manualPing()      — player-triggered ping (bound to UI button).
                         Gated by S.scanner.manualCooldown.
   ============================================== */
'use strict';

import { S } from './state.js?v=097-0-8';
import * as C from './constants.js?v=097-0-8';
import { addLog } from './render/log.js?v=097-0-8';

function applyBuff(durationTicks, magnitude, source) {
  const sc = S.scanner;
  sc.buffActive = true;
  // If a buff is already active, take the better of (remaining, new)
  // rather than stacking — keeps the math bounded.
  sc.buffRemaining = Math.max(sc.buffRemaining, durationTicks);
  sc.buffMagnitude = magnitude;
  if (source === 'manual') {
    addLog(`<span class="log-hi">manual scan</span> \u2014 strain buildup slowed`);
  }
}

// v0.0.9.5 commit 4: scannerT2 (xi t40) upgrade promotes scanner.level
// from 1 to 2. Level-2 tuning constants (SCANNER_*_T2) supersede the
// base values for stronger magnitude + faster auto interval + slightly
// longer buff window. Pure read of sc.level — no separate state path.
function scannerTuning(sc) {
  if ((sc.level || 1) >= 2) {
    return {
      autoInterval: C.SCANNER_AUTO_INTERVAL_TICKS_T2,
      autoDuration: C.SCANNER_BUFF_DURATION_TICKS_T2,
      manualDuration: C.SCANNER_MANUAL_BUFF_TICKS_T2,
      magnitude:    C.SCANNER_BUFF_MAGNITUDE_T2,
    };
  }
  return {
    autoInterval: C.SCANNER_AUTO_INTERVAL_TICKS,
    autoDuration: C.SCANNER_BUFF_DURATION_TICKS,
    manualDuration: C.SCANNER_MANUAL_BUFF_TICKS,
    magnitude:    C.SCANNER_BUFF_MAGNITUDE,
  };
}

export function tickScanner() {
  const sc = S.scanner;
  if (!sc.unlocked) return;

  // Drain buff
  if (sc.buffActive) {
    sc.buffRemaining--;
    if (sc.buffRemaining <= 0) {
      sc.buffActive = false;
      sc.buffRemaining = 0;
      sc.buffMagnitude = 1;
    }
  }

  // Drain manual cooldown
  if (sc.manualCooldown > 0) sc.manualCooldown--;

  // Auto ping tick
  if (sc.autoTimer > 0) {
    sc.autoTimer--;
  } else {
    // Fire auto-ping. Tuning pulled from level (1 or 2).
    const t = scannerTuning(sc);
    applyBuff(t.autoDuration, t.magnitude, 'auto');
    sc.autoTimer = t.autoInterval;
  }
}

export function manualPing() {
  const sc = S.scanner;
  if (!sc.unlocked) return false;
  if (sc.manualCooldown > 0) {
    const secs = Math.ceil(sc.manualCooldown * (C.TICK_MS / 1000));
    addLog(`<span class="log-wn">scanner on cooldown</span> \u2014 ${secs}s`);
    return false;
  }
  const t = scannerTuning(sc);
  applyBuff(t.manualDuration, t.magnitude, 'manual');
  sc.manualCooldown = C.SCANNER_MANUAL_COOLDOWN_TICKS;
  return true;
}
