/* ==============================================
   THE LONG HAUL — sim statistics (v0.0.9.6.9)

   Aggregates N sim reports into per-metric stats
   (mean, stddev, p50, p95, min, max). Lets batch
   mode surface distribution shape, not just a
   single noisy sample.
   ============================================== */
'use strict';

/** Pure stats helpers. */
function mean(arr) {
  if (!arr.length) return 0;
  let s = 0; for (const v of arr) s += v;
  return s / arr.length;
}
function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let s = 0; for (const v of arr) s += (v - m) * (v - m);
  return Math.sqrt(s / (arr.length - 1));
}
function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * p)));
  return sorted[idx];
}
function statsOf(arr) {
  if (!arr.length) return { mean: 0, stddev: 0, p50: 0, p95: 0, min: 0, max: 0, n: 0 };
  return {
    mean:   +mean(arr).toFixed(2),
    stddev: +stddev(arr).toFixed(2),
    p50:    +percentile(arr, 0.50).toFixed(2),
    p95:    +percentile(arr, 0.95).toFixed(2),
    min:    +Math.min(...arr).toFixed(2),
    max:    +Math.max(...arr).toFixed(2),
    n:      arr.length,
  };
}

/** Aggregate an array of N sim reports. For each numeric metric,
 *  computes stats across runs. */
export function aggregateReports(reports) {
  if (!reports || reports.length === 0) return { meta: { runs: 0 } };
  const n = reports.length;

  // Union set of counter event names
  const eventNames = new Set();
  for (const r of reports) {
    for (const k of Object.keys(r.counters || {})) eventNames.add(k);
  }

  const counters = {};
  for (const ev of eventNames) {
    const values = reports.map(r => (r.counters && r.counters[ev]) || 0);
    counters[ev] = statsOf(values);
  }

  // Accumulator sums — each event's subKeys
  const accumSum = {};
  for (const r of reports) {
    for (const ev of Object.keys(r.accumSum || {})) {
      if (!accumSum[ev]) accumSum[ev] = {};
      for (const k of Object.keys(r.accumSum[ev])) {
        if (!accumSum[ev][k]) accumSum[ev][k] = [];
        accumSum[ev][k].push(r.accumSum[ev][k]);
      }
    }
  }
  const accumStats = {};
  for (const ev of Object.keys(accumSum)) {
    accumStats[ev] = {};
    for (const k of Object.keys(accumSum[ev])) {
      accumStats[ev][k] = statsOf(accumSum[ev][k]);
    }
  }

  // Histogram buckets — sum counts per bucket then average across runs
  const histograms = {};
  for (const r of reports) {
    for (const h of Object.keys(r.histograms || {})) {
      if (!histograms[h]) histograms[h] = {};
      for (const b of Object.keys(r.histograms[h])) {
        if (!histograms[h][b]) histograms[h][b] = [];
        histograms[h][b].push(r.histograms[h][b]);
      }
    }
  }
  const histogramStats = {};
  for (const h of Object.keys(histograms)) {
    histogramStats[h] = {};
    for (const b of Object.keys(histograms[h])) {
      // Pad with zeros for runs that didn't hit this bucket
      const padded = histograms[h][b].concat(
        Array(Math.max(0, n - histograms[h][b].length)).fill(0)
      );
      histogramStats[h][b] = statsOf(padded);
    }
  }

  // firstSeen — for once-per-run markers like "first_max" per NPC,
  // report the tick when the first hit happened across runs.
  const firstSeen = {};
  for (const r of reports) {
    for (const fk of Object.keys(r.firstSeen || {})) {
      if (!firstSeen[fk]) firstSeen[fk] = {};
      for (const id of Object.keys(r.firstSeen[fk])) {
        if (!firstSeen[fk][id]) firstSeen[fk][id] = [];
        firstSeen[fk][id].push(r.firstSeen[fk][id]);
      }
    }
  }
  const firstSeenStats = {};
  for (const fk of Object.keys(firstSeen)) {
    firstSeenStats[fk] = {};
    for (const id of Object.keys(firstSeen[fk])) {
      firstSeenStats[fk][id] = statsOf(firstSeen[fk][id]);
    }
  }

  return {
    meta: {
      runs: n,
      ticks_per_run: reports[0].meta.ticks,
      total_ticks:   reports.reduce((s, r) => s + r.meta.ticks, 0),
    },
    counters,
    accumSum: accumStats,
    histograms: histogramStats,
    firstSeen: firstSeenStats,
  };
}
