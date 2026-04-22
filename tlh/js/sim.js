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

import { S } from './state.js?v=096-10-21';
import * as C from './constants.js?v=096-10-21';
import { tick } from './main.js?v=096-10-21';
import { buildWorld } from './world.js?v=096-10-21';
import { initWeather } from './weather.js?v=096-10-21';
import { setSilent, isSilent } from './multiplayer.js?v=096-10-21';
import {
  startCollection, stopCollection, emit, sample, series, accum, isActive as telemetryActive,
} from './telemetry.js?v=096-10-21';
import { aggregateReports } from './sim-stats.js?v=096-10-21';
import { UPGRADE_DEFS } from './data/upgrades.js?v=096-10-21';
import * as Upg from './upgrades.js?v=096-10-21';
// v0.0.9.6.9.12 — direct import so applyFreshState can synchronously
// seed interior pkgs. world.js uses a dynamic .then() seeder to break
// a module-load cycle in live; the sim's sync tick loop never lets
// that promise resolve, leaving S.interiorPkgs = {} for the whole run.
import { seedInteriorPkgs } from './packages.js?v=096-10-21';

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
  // v0.0.9.6.10.21 — baseline sim uses 'auto' (current behavior);
  // pkgSwapPolicy opt overrides drive 'logic'-equivalent arms.
  S.grabMode     = 'auto';
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
  // v0.0.9.6.10.18 — pkg-swap policy opt-in for opportunity-cost A/B.
  // 'keep' (default) preserves current behavior: full cargo skips new
  // pkgs. 'prefer-closer' evicts the worst-scored carried pkg when a
  // new pkg won't fit. Eviction mode 'free' vanishes silently (floor
  // measurement — evictee's future reward is forfeited); 'realistic'
  // runs the toss loss-roll from ejectFromCargo (10-30% lost to
  // recovery, rest drops to trail and may be re-picked).
  // Metric: 'scrip-per-km' (pure revenue density) or
  // 'scrip-trust-per-km' (hybrid with trust-gain weighted at 10¢/point
  // to protect against NPC trust starvation).
  S._transient.pkgSwapPolicy   = opts.pkgSwapPolicy   || 'keep';
  S._transient.pkgSwapEviction = opts.pkgSwapEviction || 'free';
  S._transient.pkgSwapMetric   = opts.pkgSwapMetric   || 'scrip-per-km';
  if (typeof opts.pkgSwapTrustWeight === 'number') {
    S._transient.pkgSwapTrustWeight = opts.pkgSwapTrustWeight;
  }
  // v0.0.9.6.10.18 — floor multiplier. 1.0 = swap on any improvement
  // (matches original logic); 1.5 = new pkg's ratio must be 50%+
  // better than evictee's to trigger. Reduces marginal swaps.
  if (typeof opts.pkgSwapFloor === 'number') {
    S._transient.pkgSwapFloor = opts.pkgSwapFloor;
  }
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

  // v0.0.9.6.10.18 — end-of-run per-NPC snapshot. Emits final trust +
  // unlocked-tier count per NPC into the 'trust.final' accum namespace
  // so batch aggregation exposes mean/stddev per NPC across runs. Lets
  // the swap comparison detect whether a swap policy systematically
  // starves specific NPCs (far-ring trust stalling) rather than only
  // reading the aggregate 'trust.granted' totals.
  if (S.npcs) {
    for (const id of Object.keys(S.npcs)) {
      const n = S.npcs[id];
      if (!n) continue;
      accum('trust.final', 'trust_' + id, n.trust || 0);
      let tierCount = 0;
      if (n.unlocks) {
        if (n.unlocks.t20) tierCount++;
        if (n.unlocks.t40) tierCount++;
        if (n.unlocks.t60) tierCount++;
        if (n.unlocks.t80) tierCount++;
      }
      accum('trust.final', 'tiers_' + id, tierCount);
    }
  }
  const durationRealMs = Date.now() - startRealMs;
  const report = stopCollection();
  report.meta.duration_real_ms = durationRealMs;
  report.meta.ticks_per_sec    = +(tickCount / Math.max(0.001, durationRealMs / 1000)).toFixed(1);
  report.meta.loops_completed  = loopCount;
  report.meta.terminated_by    = terminated;

  S._transient.simMode = false;
  // v0.0.9.6.10.18 — clear swap-policy flags so a subsequent restore
  // into live play can't inherit a stale sim mode. snapshot/restore
  // doesn't clone _transient anyway, but being explicit is cheap.
  S._transient.pkgSwapPolicy      = 'keep';
  S._transient.pkgSwapEviction    = 'free';
  S._transient.pkgSwapMetric      = 'scrip-per-km';
  S._transient.pkgSwapTrustWeight = undefined;
  S._transient.pkgSwapFloor       = undefined;
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
  // v0.0.9.6.10.18 — forward pkg-swap opts to each run of the batch.
  if (opts.pkgSwapPolicy)   runOpts.pkgSwapPolicy   = opts.pkgSwapPolicy;
  if (opts.pkgSwapEviction) runOpts.pkgSwapEviction = opts.pkgSwapEviction;
  if (opts.pkgSwapMetric)   runOpts.pkgSwapMetric   = opts.pkgSwapMetric;
  if (typeof opts.pkgSwapTrustWeight === 'number') {
    runOpts.pkgSwapTrustWeight = opts.pkgSwapTrustWeight;
  }
  if (typeof opts.pkgSwapFloor === 'number') {
    runOpts.pkgSwapFloor = opts.pkgSwapFloor;
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
      // v0.0.9.6.10.20.1 — yield every 10 runs instead of every run.
      // Backgrounded tabs clamp setTimeout to 1000ms min; yielding per-
      // run bloats wall time by ~1s × runs. 10-run chunks keep the UI
      // responsive (per-run ~2-3s × 10 = ~20-30s worst-case hang) while
      // cutting throttled-tab overhead by 10x. Final yield always fires
      // so finally{} setSilent lands promptly.
      if ((i + 1) % 10 === 0 || i === runs - 1) {
        await new Promise(r => setTimeout(r, 0));
      }
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

/** v0.0.9.6.10.18 — 4-arm opportunity-cost comparison. All swap arms
 *  use 'realistic' eviction (matches probable shipping feature).
 *
 *    keep:        baseline — current game behavior (full cargo skips).
 *    scripRatio:  prefer-closer by pkg.scrip/km. Revenue-maximizing.
 *    hybridRatio: prefer-closer by (scrip + trustWeight * trustGain)/km.
 *                 Trust-weighted revenue; guards against NPC trust
 *                 starvation seen in early short runs.
 *    floor:       scripRatio but with a 1.5× floor multiplier — new
 *                 pkg must beat evictee's ratio by 50%+ to trigger.
 *                 Reduces marginal swaps; trades some upside for less
 *                 thrash + fewer losses. */
export async function runSwapComparison(opts) {
  opts = opts || {};
  const runs  = opts.runs  || 10;
  const loops = opts.loops !== undefined ? opts.loops : 10;
  const base  = { runs, loops };
  if (opts.ticks !== undefined) base.ticks = opts.ticks;
  if (opts.maxRealtimeMs !== undefined) base.maxRealtimeMs = opts.maxRealtimeMs;
  const trustWeight = typeof opts.trustWeight === 'number' ? opts.trustWeight : 10;
  const floorMult   = typeof opts.floorMult   === 'number' ? opts.floorMult   : 1.5;

  const keep        = await runBatch({ ...base, pkgSwapPolicy: 'keep' });
  const scripRatio  = await runBatch({ ...base, pkgSwapPolicy: 'prefer-closer', pkgSwapEviction: 'realistic', pkgSwapMetric: 'scrip-per-km' });
  const hybridRatio = await runBatch({ ...base, pkgSwapPolicy: 'prefer-closer', pkgSwapEviction: 'realistic', pkgSwapMetric: 'scrip-trust-per-km', pkgSwapTrustWeight: trustWeight });
  const floor       = await runBatch({ ...base, pkgSwapPolicy: 'prefer-closer', pkgSwapEviction: 'realistic', pkgSwapMetric: 'scrip-per-km', pkgSwapFloor: floorMult });
  const comparison = { keep, scripRatio, hybridRatio, floor, trustWeight, floorMult };
  if (!S._transient.lastSwapComparisons) S._transient.lastSwapComparisons = [];
  S._transient.lastSwapComparisons.unshift(comparison);
  if (S._transient.lastSwapComparisons.length > 5) S._transient.lastSwapComparisons.length = 5;
  return comparison;
}

/** Compact text summary of a 4-arm comparison. Surfaces headline
 *  metrics with mean ± sd plus a per-NPC final-trust block.
 *  Counter event names contain literal dots ('pkg.swapped') so
 *  we key directly rather than path-split. */
export function summarizeSwapComparison(c) {
  if (!c || !c.keep || !c.scripRatio || !c.hybridRatio || !c.floor) return 'no comparison';
  const counter = (batch, ev) => {
    const agg = batch.aggregate;
    const v = agg && agg.counters && agg.counters[ev];
    return v ? { mean: v.mean || 0, sd: v.stddev || 0 } : { mean: 0, sd: 0 };
  };
  const accum = (batch, ev, sub) => {
    const agg = batch.aggregate;
    const node = agg && agg.accumSum && agg.accumSum[ev];
    const v = node && node[sub];
    return v ? { mean: v.mean || 0, sd: v.stddev || 0 } : { mean: 0, sd: 0 };
  };
  const deltaPct = (k, v) => k > 0 ? (((v - k) / k) * 100).toFixed(1) + '%' : '—';
  const fmt = (s) => `${s.mean.toFixed(1)}±${s.sd.toFixed(1)}`;
  const row = (label, getter) => {
    const k  = getter(c.keep);
    const s  = getter(c.scripRatio);
    const h  = getter(c.hybridRatio);
    const f  = getter(c.floor);
    return `  ${label.padEnd(20)} ${fmt(k).padStart(14)}  ${fmt(s).padStart(14)} (${deltaPct(k.mean, s.mean).padStart(7)})  ${fmt(h).padStart(14)} (${deltaPct(k.mean, h.mean).padStart(7)})  ${fmt(f).padStart(14)} (${deltaPct(k.mean, f.mean).padStart(7)})`;
  };
  const lines = [];
  lines.push(`4-arm swap comparison (mean ± sd per run, trust-weight ${c.trustWeight ?? '—'}, floor ${c.floorMult ?? '—'}×):`);
  lines.push('');
  lines.push('  metric                       keep          scrip-ratio   (Δ keep)    hybrid-ratio  (Δ keep)    floor-1.5×    (Δ keep)');
  lines.push(row('scrip earned',   b => accum(b, 'pkg.delivered', 'scrip')));
  lines.push(row('deliveries',     b => counter(b, 'pkg.delivered')));
  lines.push(row('pkg.swapped',    b => counter(b, 'pkg.swapped')));
  lines.push(row('pkg.lost',       b => counter(b, 'pkg.lost')));
  lines.push(row('pkg.tossed',     b => counter(b, 'pkg.tossed')));
  lines.push(row('pickup.failed',  b => counter(b, 'pickup.failed')));
  lines.push(row('trips fired',    b => counter(b, 'trip.fired')));
  lines.push(row('total trust granted', b => {
    const agg = b.aggregate && b.aggregate.accumSum && b.aggregate.accumSum['trust.granted'];
    if (!agg) return { mean: 0, sd: 0 };
    let tot = 0, varSum = 0;
    for (const k of Object.keys(agg)) if (k.startsWith('total_')) { tot += (agg[k].mean || 0); varSum += (agg[k].stddev || 0) ** 2; }
    return { mean: tot, sd: Math.sqrt(varSum) };
  }));

  // Per-NPC final trust block.
  const npcIds = new Set();
  for (const arm of [c.keep, c.scripRatio, c.hybridRatio, c.floor]) {
    const ag = arm.aggregate && arm.aggregate.accumSum && arm.aggregate.accumSum['trust.final'];
    if (!ag) continue;
    for (const k of Object.keys(ag)) if (k.startsWith('trust_')) npcIds.add(k.slice(6));
  }
  if (npcIds.size) {
    lines.push('');
    lines.push('  per-NPC final trust (mean across runs, Δ vs keep)');
    lines.push('  npc      keep   scrip-ratio (Δ)   hybrid-ratio (Δ)   floor-1.5× (Δ)');
    const ids = [...npcIds].sort();
    const d = (v, base) => (v - base >= 0 ? '+' : '') + (v - base).toFixed(1);
    for (const id of ids) {
      const k = accum(c.keep, 'trust.final', 'trust_' + id).mean;
      const s = accum(c.scripRatio, 'trust.final', 'trust_' + id).mean;
      const h = accum(c.hybridRatio, 'trust.final', 'trust_' + id).mean;
      const f = accum(c.floor, 'trust.final', 'trust_' + id).mean;
      lines.push(`  ${id.padEnd(6)} ${k.toFixed(1).padStart(6)}  ${s.toFixed(1).padStart(6)} (${d(s,k).padStart(5)})   ${h.toFixed(1).padStart(6)} (${d(h,k).padStart(5)})   ${f.toFixed(1).padStart(6)} (${d(f,k).padStart(5)})`);
    }
  }
  return lines.join('\n');
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
