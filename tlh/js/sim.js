/* ==============================================
   THE LONG HAUL — simulation harness (v0.0.9.6.9)

   Headless fast-forward runner. Snapshots current
   state, resets to fresh, runs the tick loop for
   N ticks with renders skipped + multiplayer silent,
   collects telemetry, restores original state.

   Two entry points:
     runSimulation(opts)  — single run, returns report
     runBatch(opts)       — N runs, returns aggregate
   ============================================== */
'use strict';

import { S } from './state.js';
import * as C from './constants.js';
import { tick } from './main.js';
import { buildWorld } from './world.js';
import { initWeather } from './weather.js';
import { setSilent, isSilent } from './multiplayer.js';
import {
  startCollection, stopCollection, emit, sample, series, accum, isActive as telemetryActive,
} from './telemetry.js';
import { aggregateReports } from './sim-stats.js';
import { UPGRADE_DEFS } from './data/upgrades.js';
import * as Upg from './upgrades.js';
// v0.0.9.6.9.12 — direct import so applyFreshState can synchronously
// seed interior pkgs. world.js uses a dynamic .then() seeder to break
// a module-load cycle in live; the sim's sync tick loop never lets
// that promise resolve, leaving S.interiorPkgs = {} for the whole run.
import { seedInteriorPkgs } from './packages.js';

// ============================================================
// SNAPSHOT / RESTORE
// ============================================================

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj, (k, v) => {
    // Drop _transient — non-JSON DOM refs live there, and we
    // reconstruct transient state from code paths anyway.
    if (k === '_transient') return undefined;
    return v;
  }));
}

function snapshotGame() {
  // Deep clone persistent fields only. _transient is ephemeral
  // by construction; sim doesn't touch it.
  const snap = deepClone(S);
  // Preserve minimal transient state we DO need restored —
  // just the currentSegment + dotT-related markers so the
  // courier stays where the user left them.
  snap._seg = S._transient.currentSegment;
  return snap;
}

function restoreGame(snap) {
  // Restore persistent fields. Iterate top-level keys so we preserve
  // S identity + the _transient ref live aliases elsewhere.
  for (const k of Object.keys(snap)) {
    if (k === '_seg') continue;
    S[k] = snap[k];
  }
  // Transient segment restore (courier position continuity)
  if (snap._seg) S._transient.currentSegment = snap._seg;
}

// ============================================================
// FRESH-STATE INIT
// ============================================================

// Minimal fresh-state reset. Rebuilds the world, re-inits weather,
// zeros progress fields. Doesn't wipe transient DOM refs (els).
// v0.0.9.6.9 — forces max automation to match a configured-player
// baseline. Sim characterizes game balance, not tutorial friction;
// new-player-defaults sim mode can come as a separate variant later.
function applyFreshState() {
  S.ticks     = 0;
  S.scrip     = 0;
  S.delivered = 0;
  S.stamina   = S.staminaMax;
  S.canteen   = S.canteenMax;
  S.bootDurability = 100;
  S.strain    = 0;  // v0.0.9.6.9.17 — reset strain gauge per sim run.
  S.status    = 'walking';
  S.inventory = [];
  S.usedSlots = 0;
  S.usedWeight= 0;
  S.log = [];
  S.channels = [];
  S.storms = [];
  S.nextStormSpawnTick = 0;
  S.nextStormType = null;
  S.nextStormSpawn = null;
  S.placedGear = [];
  S.interiorPkgs = {};
  S.interiorTrample = {};
  S.sandalweedCount = 0;
  // v0.0.9.6.9.30l — sim starts fresh with no smoke window; avoids
  // a partial carryover biasing early strain accumulation.
  if (S.smokeGrace) { S.smokeGrace.ticksRemaining = 0; S.smokeGrace.magnitude = 0; }
  S.distKm    = 0;
  // Max automation — every auto-toggle ON. Sim represents configured
  // player behavior, not tutorial onboarding.
  S.autobuyBoots = true;
  S.autodrink    = true;
  S.autoGrab     = true;
  if (!S.kit) S.kit = { ladders: 0, anchors: 0, autoGear: true };
  else S.kit.autoGear = true;
  // Reset NPC trust — copy from defaults
  if (S.npcs) {
    for (const id of Object.keys(S.npcs)) {
      S.npcs[id].trust = 0;
      if (S.npcs[id].unlocks) {
        for (const k of Object.keys(S.npcs[id].unlocks)) {
          S.npcs[id].unlocks[k] = false;
        }
      }
    }
  }
  // Reset upgrades — only keep the sticky auto-buy toggles players
  // would have set. Everything upgrade-flag-wise starts false.
  if (S.upgrades) {
    for (const k of Object.keys(S.upgrades)) {
      S.upgrades[k] = false;
    }
  }
  // Reset transient progression markers
  S._transient.lastDistEdgeIdx = null;
  S._transient.lastDistDotT = null;
  S._transient.severeTripState = null;
  S._transient.placementLogged = false;
  S._transient.plateauGateLogged = false;
  S._transient.unpladderedTerrains = null;
  S._transient.currentSegment = null;
  // v0.0.9.6.9.12 — reset telemetry edge-trackers so state from a prior
  // sim run can't leak across. Otherwise bottleneck durations can go
  // negative (inventoryMaxedSinceTick from run N still set at run N+1
  // tick 0, yielding durationTicks = 0 - 4000).
  S._transient.inventoryWasMaxed      = false;
  S._transient.inventoryMaxedSinceTick = 0;
  S._transient.bootsWasZero            = false;
  if (S._transient.skipEmittedPkgs) S._transient.skipEmittedPkgs.clear();
  S._transient.lastWeatherIntensity = 'none';
  S._transient.stormIdCounter = 0;
  S.dotT    = 0;
  S.edgeIdx = 0;
  // Rebuild world + re-init weather (seeds interior pkgs via dynamic import).
  buildWorld();
  // v0.0.9.6.9.12 — force synchronous interior-pkg seed. Without this,
  // buildWorld's .then() seeder queues behind the sim's tick loop and
  // never runs; plateau/mountain/rockyHills pkgs stay unseeded.
  // seedInteriorPkgs is idempotent — re-running in the live game is a
  // no-op because cells already populated are skipped.
  seedInteriorPkgs();
  // Bootstrap initial segment so tick's segment lookups don't crash
  const firstEdge = S.edges && S.edges[0];
  if (firstEdge) {
    const [fromId, toId] = firstEdge;
    const fromNode = S.routeNodes.find(n => n.id === fromId);
    const toNode   = S.routeNodes.find(n => n.id === toId);
    if (fromNode && toNode) {
      S._transient.currentSegment = {
        from: fromId, to: toId, type: 'ring', edgeIdx: 0,
        pathFn: (t) => ({
          x: fromNode.x + (toNode.x - fromNode.x) * t,
          y: fromNode.y + (toNode.y - fromNode.y) * t,
        }),
        length: Math.hypot(toNode.x - fromNode.x, toNode.y - fromNode.y),
      };
    }
  }
  initWeather();
}

// ============================================================
// PER-TICK SAMPLING (histogram buckets)
// ============================================================

function bucketPct(val, max) {
  const pct = max > 0 ? (val / max) : 0;
  if (pct >= 0.75) return '75-100';
  if (pct >= 0.50) return '50-75';
  if (pct >= 0.25) return '25-50';
  return '0-25';
}

function emitPerTickSamples() {
  // Status distribution
  let statusKey = S.status;
  if (S._transient.severeTripState) statusKey = 'severe_stall';
  const seg = S._transient.currentSegment;
  if (seg && seg.type === 'river-drift') statusKey = 'river_drift';
  sample('state_tick_distribution', statusKey || 'unknown');

  // Resource histograms
  sample('stamina_histogram', bucketPct(S.stamina, S.staminaMax));
  sample('canteen_histogram', bucketPct(S.canteen, S.canteenMax));
  sample('boots_histogram',   bucketPct(S.bootDurability, 100));
  if (S.battery) sample('battery_histogram', bucketPct(S.battery.charge, S.battery.max));

  // v0.0.9.6.10.10 — battery economy telemetry. Histogram alone
  // doesn't tell the story for balance tuning; we need:
  //   battery_zero_ticks — total ticks spent at 0 charge (feature-
  //     cold time for exo/carrier). The critical signal for "is
  //     battery tight enough to bite?"
  //   battery_full_ticks — ticks pinned at max (solar headroom
  //     wasted). High = player could handle more consumers.
  //   battery_charge_timeline — sparse series every 1000 ticks so
  //     batch aggregation can plot the shape of the curve.
  if (S.battery) {
    const charge = S.battery.charge;
    if (charge <= 0)                   accum('battery.time', 'zero_ticks', 1);
    if (charge >= S.battery.max - 0.5) accum('battery.time', 'full_ticks', 1);
    accum('battery.time', 'total_ticks', 1);
    accum('battery.charge_sum', 'total', charge);
    if (S.ticks % 1000 === 0) series('battery_charge_timeline', charge);
  }

  // Inventory utilization
  const slotsPct = S.maxSlots > 0 ? Math.round(100 * S.usedSlots / S.maxSlots) : 0;
  sample('inventory_slots_pct', bucketPct(S.usedSlots, S.maxSlots));

  // Scrip timeline (sparse — every 1000 ticks)
  if (S.ticks % 1000 === 0) {
    series('scrip_timeline', S.scrip);
    series('delivered_timeline', S.delivered);
  }
}

// ============================================================
// RUNNER
// ============================================================

// v0.0.9.6.9 — auto-upgrade helper. Called periodically during sim.
// Picks the cheapest affordable upgrade the player hasn't bought yet
// that's actually available (trust + resource gates respected by
// Upg.buyUpgrade). Matches a "configured player who buys upgrades
// as soon as they become affordable" heuristic.
function autoUpgradeBuy() {
  // UPGRADE_DEFS is an array of { id, cost, requires, trustReward?, ... }.
  // Collect affordable AND visible-but-unaffordable candidates separately
  // so telemetry can show "cheapest item the player could see but not buy"
  // — that's the key gap signal for early-scrip balance tuning.
  const affordable = [];
  let cheapestVisible = Infinity;
  let cheapestVisibleId = null;
  for (const def of UPGRADE_DEFS) {
    if (!def || !def.id) continue;
    if (S.upgrades[def.id]) continue;
    if (typeof def.cost !== 'number' || def.cost <= 0) continue;
    // Requires chain — don't try if prereq isn't bought yet
    if (def.requires && !S.upgrades[def.requires]) continue;
    // Trust-gated upgrades — skip if the NPC hasn't hit the tier
    if (def.trustReward) {
      const npc = S.npcs[def.trustReward.npc];
      if (!npc || !npc.unlocks || !npc.unlocks[def.trustReward.tier]) continue;
    }
    // Track cheapest visible (affordable or not) — useful signal
    if (def.cost < cheapestVisible) {
      cheapestVisible   = def.cost;
      cheapestVisibleId = def.id;
    }
    if (S.scrip >= def.cost) affordable.push(def);
  }
  // v0.0.9.6.9.5 — emit a diagnostic event so batches can report "how
  // often autobuy runs vs actually buys" and "how big the scrip gap
  // is when blocked". Hot-path emits gated by telemetry active flag.
  const gap = cheapestVisible === Infinity ? null : (cheapestVisible - S.scrip);
  emit('autoUpgrade.checked', {
    scrip:          S.scrip,
    cheapest_cost:  cheapestVisible === Infinity ? null : cheapestVisible,
    cheapest_id:    cheapestVisibleId,
    gap,
    affordable:     affordable.length,
  });
  if (affordable.length === 0) return;
  affordable.sort((a, b) => a.cost - b.cost);
  // Buy cheapest — let buyUpgrade's internal guards handle edge cases
  Upg.buyUpgrade(affordable[0].id);
}

// Loop-completion detector. Tracks whether the courier has left home
// since the last H-arrival — prevents a double-count at dotT=0
// immediately after a loop fires.
let loopState = { leftHomeSinceLast: false, lastCountedLoop: 0 };

function checkLoopCompletion(loopsSoFar) {
  const seg = S._transient.currentSegment;
  if (!seg) return loopsSoFar;
  const at = seg.from;
  if (at !== 'H') {
    loopState.leftHomeSinceLast = true;
    return loopsSoFar;
  }
  // Courier is on a segment whose from is H, with dotT near 0 — a
  // home-arrival just completed. Count it only if we've been away
  // since the last one.
  if (S.dotT < 0.02 && loopState.leftHomeSinceLast) {
    loopState.leftHomeSinceLast = false;
    loopsSoFar++;
    emit('loop.completed', { scrip: S.scrip, delivered: S.delivered });
  }
  return loopsSoFar;
}

/** Run one sim. Termination is whichever fires first:
 *    loops reached   (default 10)
 *    ticks reached   (safety cap, default 200000)
 *    realtime reached (default 60s)
 *  Returns a report with meta.terminated_by indicating why it ended. */
export function runSimulation(opts) {
  opts = opts || {};
  const maxLoops       = opts.loops !== undefined ? opts.loops : 10;
  const maxTicks       = opts.ticks !== undefined ? opts.ticks : 200000;
  const maxRealtimeMs  = opts.maxRealtimeMs || 60000;
  const autoUpgrade    = opts.autoUpgrade !== false;  // default on
  const upgradeEvery   = 50;   // attempt one auto-upgrade every N ticks

  const snap = snapshotGame();
  const wasSilent = isSilent();
  setSilent(true);
  S._transient.simMode = true;

  applyFreshState();
  // v0.0.9.6.9.8 — opt-in overrides for A/B counterfactuals. Default
  // runSimulation matches max-automation baseline from applyFreshState;
  // individual toggles can be flipped off for comparison arms.
  if (opts.autobuyBoots === false) S.autobuyBoots = false;
  // v0.0.9.6.10.10 — preown upgrades for scenario sims (e.g. battery-
  // economy A/B/C with no-upgrades vs. drain-consumers vs. drain +
  // regen upgrades). Takes a list of upgrade ids, sets S.upgrades[id]
  // = true, calls the def's apply() to side-effect any one-time state
  // (carrier.unlocked, scanner.unlocked, etc). Bypasses the trust gate
  // + scrip cost — pure "what if they had this" scenario harness.
  if (Array.isArray(opts.preownUpgrades) && opts.preownUpgrades.length) {
    for (const id of opts.preownUpgrades) {
      const def = UPGRADE_DEFS.find(d => d.id === id);
      if (!def) continue;
      S.upgrades[id] = true;
      if (typeof def.apply === 'function') {
        try { def.apply(); } catch (e) { /* side-effect may fail harmlessly in sim */ }
      }
    }
  }
  // Scenario sims want to disable the auto-upgrade buyer so the
  // preowned set stays the pure variable. Turn auto-upgrade off by
  // default whenever preownUpgrades is set; caller can force it back
  // on with opts.autoUpgrade = true if desired.
  const scenarioMode = Array.isArray(opts.preownUpgrades) && opts.preownUpgrades.length > 0;
  const autoUpgradeEffective = opts.autoUpgrade !== undefined
    ? opts.autoUpgrade
    : !scenarioMode && autoUpgrade;
  loopState = { leftHomeSinceLast: false, lastCountedLoop: 0 };

  startCollection();
  const startRealMs = Date.now();
  let tickCount  = 0;
  let loopCount  = 0;
  let terminated = 'max_ticks';

  try {
    while (true) {
      tick();
      emitPerTickSamples();
      tickCount++;

      // Loop detection on home arrivals
      const before = loopCount;
      loopCount = checkLoopCompletion(loopCount);

      // Auto-upgrade attempt periodically (cheap)
      if (autoUpgradeEffective && tickCount % upgradeEvery === 0) autoUpgradeBuy();

      // Termination checks
      if (maxLoops > 0 && loopCount >= maxLoops) { terminated = 'max_loops'; break; }
      if (tickCount >= maxTicks)                 { terminated = 'max_ticks'; break; }
      if (Date.now() - startRealMs >= maxRealtimeMs) { terminated = 'max_realtime'; break; }
    }
  } catch (e) {
    console.error('[sim] tick loop crashed at', S.ticks, e);
    terminated = 'crashed';
  }

  const durationRealMs = Date.now() - startRealMs;
  const report = stopCollection();
  report.meta.duration_real_ms = durationRealMs;
  report.meta.ticks_per_sec    = +(tickCount / Math.max(0.001, durationRealMs / 1000)).toFixed(1);
  report.meta.loops_completed  = loopCount;
  report.meta.terminated_by    = terminated;

  S._transient.simMode = false;
  restoreGame(snap);
  setSilent(wasSilent);

  return report;
}

export async function runBatch(opts) {
  opts = opts || {};
  const runs         = opts.runs || 20;
  const loops        = opts.loops !== undefined ? opts.loops : 10;
  const ticks        = opts.ticks;  // optional — omitted = no ticks cap
  const maxRealtimeMs = opts.maxRealtimeMs;
  const autoUpgrade  = opts.autoUpgrade;

  const runOpts = { loops };
  if (ticks !== undefined) runOpts.ticks = ticks;
  if (maxRealtimeMs !== undefined) runOpts.maxRealtimeMs = maxRealtimeMs;
  if (autoUpgrade !== undefined) runOpts.autoUpgrade = autoUpgrade;
  if (opts.autobuyBoots !== undefined) runOpts.autobuyBoots = opts.autobuyBoots;
  // v0.0.9.6.10.10 — forward preown list to each run of the batch
  // so scenario sims (battery economy A/B/C) work through runBatch.
  if (Array.isArray(opts.preownUpgrades) && opts.preownUpgrades.length) {
    runOpts.preownUpgrades = opts.preownUpgrades;
  }

  // v0.0.9.6.9.6 — hold silent for the entire batch so the
  // setTimeout(0) yield between runs can't leave a window where
  // pollFeed / lost-fetch could hit the Cloudflare worker. Inner
  // runSimulation calls still set/restore silent locally but land on
  // our enforced 'true', so net effect is silent-for-whole-batch.
  const wasSilentOuter = isSilent();
  setSilent(true);

  const reports = [];
  try {
    for (let i = 0; i < runs; i++) {
      const r = runSimulation(runOpts);
      reports.push(r);
      // yield to the event loop so long batches don't deadlock the
      // browser UI
      await new Promise(r => setTimeout(r, 0));
    }
  } finally {
    setSilent(wasSilentOuter);
  }
  const aggregate = aggregateReports(reports);
  const batch = { reports, aggregate };

  // Push to in-memory ring for quick re-access
  if (!S._transient.lastSimRuns) S._transient.lastSimRuns = [];
  S._transient.lastSimRuns.unshift(batch);
  if (S._transient.lastSimRuns.length > 10) S._transient.lastSimRuns.length = 10;

  return batch;
}

// ============================================================
// DOWNLOAD
// ============================================================

export function downloadLastBatch() {
  const ring = S._transient.lastSimRuns;
  if (!ring || ring.length === 0) {
    console.warn('[sim] no batches to download');
    return false;
  }
  const batch = ring[0];
  const json  = JSON.stringify(batch, null, 2);
  const blob  = new Blob([json], { type: 'application/json' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  const ts    = new Date().toISOString().replace(/[:.]/g, '-');
  a.href     = url;
  a.download = `tlh-sim-batch-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

export function getRecentRuns() {
  return S._transient.lastSimRuns || [];
}

/** Compact text summary of a batch — surfaces the most actionable
 *  metrics for a quick read. */
export function summarizeBatch(batch) {
  if (!batch || !batch.aggregate) return 'no batch';
  const a = batch.aggregate;
  const lines = [];
  lines.push(`batch: ${a.meta.runs} runs × ${a.meta.ticks_per_run} ticks`);
  lines.push('');
  lines.push('-- Counters (mean ± stddev) --');
  for (const ev of Object.keys(a.counters).sort()) {
    const s = a.counters[ev];
    lines.push(`  ${ev.padEnd(34)} ${s.mean.toFixed(1).padStart(8)} ± ${s.stddev.toFixed(1)}  [${s.min}-${s.max}]`);
  }
  lines.push('');
  if (a.accumSum && Object.keys(a.accumSum).length) {
    lines.push('-- Accumulators (mean) --');
    for (const ev of Object.keys(a.accumSum).sort()) {
      for (const k of Object.keys(a.accumSum[ev]).sort()) {
        const s = a.accumSum[ev][k];
        lines.push(`  ${(ev + '.' + k).padEnd(34)} ${s.mean.toFixed(1).padStart(8)} ± ${s.stddev.toFixed(1)}`);
      }
    }
    lines.push('');
  }
  if (a.histograms && Object.keys(a.histograms).length) {
    lines.push('-- Histograms (% of ticks in bucket) --');
    for (const h of Object.keys(a.histograms).sort()) {
      const total = Object.values(a.histograms[h]).reduce((s, v) => s + (v.mean || 0), 0) || 1;
      const buckets = Object.keys(a.histograms[h]).sort();
      const parts = buckets.map(b => {
        const pct = 100 * (a.histograms[h][b].mean || 0) / total;
        return `${b}:${pct.toFixed(0)}%`;
      });
      lines.push(`  ${h.padEnd(28)} ${parts.join('  ')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
