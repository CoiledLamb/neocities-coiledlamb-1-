/* ==============================================
   THE LONG HAUL — telemetry collector (v0.0.9.6.9)

   Minimal pub/sub. Event taps scattered across the
   codebase call emit(); collection runs only while
   a sim is active so prod cost is a single `if` check.

   Dev-facing only. No player-visible features.

   Shape:
     startCollection()       — reset + turn on
     stopCollection()        — turn off, return report
     emit(event, data?)      — record one event
     sample(name, value)     — histogram bucket
     series(name, value)     — timeline sample
     isActive()              — hot-path check
   ============================================== */
'use strict';

import { S } from './state.js?v=097-0-13';

let active     = false;
let startTick  = 0;
let counters   = {};
let eventLog   = [];
let histograms = {};
let timelines  = {};
let accumSum   = {};  // eventName -> { [subKey]: cumulativeSum }
let firstSeen  = {};  // once-only events ("first_max": {npcId: tick})
let states     = {};  // arbitrary keyed state (like "stormsSeen": {id: 1})

const EVENT_CAP = 50000;  // ring-cap to bound memory

// ============================================================
// EXPORTS
// ============================================================

export function startCollection() {
  active     = true;
  startTick  = S.ticks;
  counters   = {};
  eventLog   = [];
  histograms = {};
  timelines  = {};
  accumSum   = {};
  firstSeen  = {};
  states     = {};
}

export function stopCollection() {
  active = false;
  return buildReport();
}

export function resetCollection() {
  startCollection();
}

export function isActive() { return active; }

/** Record an event. Hot path: early-out if inactive. */
export function emit(event, data) {
  if (!active) return;
  counters[event] = (counters[event] || 0) + 1;
  if (eventLog.length < EVENT_CAP) {
    eventLog.push({ t: S.ticks - startTick, e: event, d: data || null });
  }
}

/** Bucket a value into a named histogram. Buckets are plain string
 *  keys — caller decides bucketing. */
export function sample(name, bucket) {
  if (!active) return;
  if (!histograms[name]) histograms[name] = {};
  histograms[name][bucket] = (histograms[name][bucket] || 0) + 1;
}

/** Add a { tick, value } point to a named timeline. */
export function series(name, value) {
  if (!active) return;
  if (!timelines[name]) timelines[name] = [];
  timelines[name].push({ t: S.ticks - startTick, v: value });
}

/** Accumulate a numeric value into a sum under event/subKey. */
export function accum(event, subKey, value) {
  if (!active) return;
  if (!accumSum[event]) accumSum[event] = {};
  accumSum[event][subKey] = (accumSum[event][subKey] || 0) + (+value || 0);
}

/** Record the first time something happened. Subsequent calls with
 *  the same key are ignored. Used for e.g. "first NPC to max trust". */
export function markFirst(key, id) {
  if (!active) return;
  if (!firstSeen[key]) firstSeen[key] = {};
  if (!firstSeen[key][id]) {
    firstSeen[key][id] = S.ticks - startTick;
  }
}

/** Get the current count of unique IDs seen under a firstSeen key. */
export function countFirstUnique(key) {
  return firstSeen[key] ? Object.keys(firstSeen[key]).length : 0;
}

/** Namespace bucket — tracks arbitrary keyed state. Unlike emit,
 *  does NOT increment; caller manages. Used for e.g. tracking which
 *  storms have been seen so storm.ended fires once per storm. */
export function state(ns, key, value) {
  if (!active) return undefined;
  if (!states[ns]) states[ns] = {};
  if (value !== undefined) states[ns][key] = value;
  return states[ns][key];
}

// ============================================================
// REPORT BUILDER
// ============================================================

function buildReport() {
  const ticks       = S.ticks - startTick;
  const ingameHrs   = ticks * 0.35 / 3600;  // TICK_MS approx
  return {
    meta: {
      ticks,
      duration_ingame_hrs: +ingameHrs.toFixed(2),
    },
    counters,
    eventLog,
    histograms,
    timelines,
    accumSum,
    firstSeen,
    states,
  };
}
