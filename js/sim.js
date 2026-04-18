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
  startCollection, stopCollection, emit, sample, series, isActive as telemetryActive,
} from './telemetry.js';
import { aggregateReports } from './sim-stats.js';

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
function applyFreshState() {
  S.ticks     = 0;
  S.scrip     = 0;
  S.delivered = 0;
  S.stamina   = S.staminaMax;
  S.canteen   = S.canteenMax;
  S.bootDurability = 100;
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
  S.distKm    = 0;
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
  S._transient.lastWeatherIntensity = 'none';
  S._transient.stormIdCounter = 0;
  S.dotT    = 0;
  S.edgeIdx = 0;
  // Rebuild world + re-init weather (seeds interior pkgs via dynamic import).
  buildWorld();
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

export function runSimulation(opts) {
  opts = opts || {};
  const ticks = opts.ticks || 50000;

  // Snapshot user's state so we can restore it after.
  const snap = snapshotGame();

  // Force silent/offline so no network calls fire during sim.
  const wasSilent = isSilent();
  setSilent(true);

  // simMode flag — render paths check this and no-op.
  S._transient.simMode = true;

  // Fresh state for the run.
  applyFreshState();

  // Start collecting. startCollection seeds startTick = S.ticks = 0.
  startCollection();

  const startRealMs = Date.now();

  try {
    for (let i = 0; i < ticks; i++) {
      tick();
      emitPerTickSamples();
    }
  } catch (e) {
    console.error('[sim] tick loop crashed at', S.ticks, e);
  }

  const durationRealMs = Date.now() - startRealMs;
  const report = stopCollection();
  report.meta.duration_real_ms = durationRealMs;
  report.meta.ticks_per_sec = +(ticks / (durationRealMs / 1000)).toFixed(1);

  // Cleanup: restore user's state + silent flag.
  S._transient.simMode = false;
  restoreGame(snap);
  setSilent(wasSilent);

  return report;
}

export async function runBatch(opts) {
  opts = opts || {};
  const runs = opts.runs || 20;
  const ticks = opts.ticks || 50000;

  const reports = [];
  for (let i = 0; i < runs; i++) {
    const r = runSimulation({ ticks });
    reports.push(r);
    // yield to the event loop so long batches don't deadlock the
    // browser UI
    await new Promise(r => setTimeout(r, 0));
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
