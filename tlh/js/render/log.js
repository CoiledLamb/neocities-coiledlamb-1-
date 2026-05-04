/* render/log.js — v0.0.9.5.1 log buffer + persistence

   Three layers:
     1. DOM window — #logEl renders up to DOM_CAP entries with
        newest at top (existing insertBefore pattern).
     2. S._transient.logHistory — in-session ring buffer up to
        LOG_HISTORY_CAP entries. Holds rendered HTML (timestamp
        baked in). DOM is a mirror of this, not a separate thing.
     3. S.log — persisted ring buffer up to LOG_PERSIST_CAP,
        tail of logHistory. Saved via buildSavePayload; restored
        on load via restoreLogFromSave (called by main.init).

   addLog pushes to both (1) and (2), and maintains (3) as a
   trailing slice. No callsite changes — existing addLog(msg)
   signature preserved across the 30+ import sites.

   No significance classification yet — "last N messages" is the
   persistence rule, same as in-session history. Structured
   event logging (typed { t, d } entries) can layer on later
   without breaking this shape.

   Imports:
     S — game state (state.js)
     C — for TICK_MS in tt() (constants.js)

   Local aliases:
     els — live ref into S._transient.els (never reassign).
*/
'use strict';

import { S } from '../state.js?v=097-0-8';
import * as C from '../constants.js?v=097-0-8';

const els = S._transient.els;

// Bounds. Tuned so in-session recall is generous but the persisted
// slice stays under ~20KB even with verbose HTML. 500 DOM spans is
// well under browser render-cost thresholds, so no virtualization.
const DOM_CAP         = 500;
const LOG_HISTORY_CAP = 500;
const LOG_PERSIST_CAP = 100;

function tt() {
  const totalSecs = Math.floor(S.ticks * C.TICK_MS / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// v0.0.9.5.1 — stacking helpers. Coalesces identical consecutive
// messages into a single entry with a ×N counter. Match is body-
// only (timestamp stripped + existing counter stripped), so repeats
// that differ only in when-they-fired still stack. Helps with tight
// auto-loops (drink, weather alerts, harvest lines) that would
// otherwise dominate the log.
//
// v0.0.9.7.6 — log-count spans are also stripped for matching,
// so messages with inline counts (e.g. "harvested sandalweed
// (3/5)") collapse across ticks even though the count differs.
// bumpCount now takes the new event's html so the latest count
// is preserved on the surviving line; ×N tracks repetition count.
const TS_RE             = /^<span class="log-ts">\[\d+:\d+\]<\/span> /;
const COUNT_RE          = / <span class="log-mult">×\d+<\/span>$/;
const COUNT_INLINE_RE   = /<span class="log-count">[^<]*<\/span>/g;
function stripBody(html) {
  return html
    .replace(TS_RE, '')
    .replace(COUNT_RE, '')
    .replace(COUNT_INLINE_RE, '');
}
function bumpCount(prev, newHtml) {
  const m = prev.match(/ <span class="log-mult">×(\d+)<\/span>$/);
  const n = m ? parseInt(m[1], 10) + 1 : 2;
  // Use newHtml as the base so the inline log-count reflects the
  // latest event (e.g. (4/5) replaces (3/5) on the surviving line).
  const base = newHtml.replace(COUNT_RE, '');
  return `${base} <span class="log-mult">×${n}</span>`;
}

// Render a single HTML string into the log panel as a new top-most
// entry, cap-enforced at DOM_CAP. Used by both addLog (new events)
// and restoreLogFromSave (replaying persisted entries).
function renderLogLine(html) {
  if (!els.logEl) return;
  const el = document.createElement('span');
  el.className = 'log-line';
  el.innerHTML = html;
  els.logEl.insertBefore(el, els.logEl.firstChild);
  const all = els.logEl.querySelectorAll('.log-line');
  if (all.length > DOM_CAP) all[all.length - 1].remove();
}

export function addLog(msg) {
  const html = `<span class="log-ts">[${tt()}]</span> ${msg}`;
  const hist = S._transient.logHistory;

  // v0.0.9.5.1 — stack consecutive duplicates. Compare by body (sans
  // timestamp + sans existing counter) so the same event firing
  // repeatedly bumps a single entry instead of flooding the log.
  const prev = hist[hist.length - 1];
  if (prev && stripBody(prev) === stripBody(html)) {
    const bumped = bumpCount(prev, html);
    hist[hist.length - 1] = bumped;
    if (S.log.length > 0) S.log[S.log.length - 1] = bumped;
    // Update the existing top-most DOM node in place.
    if (els.logEl && els.logEl.firstChild) {
      els.logEl.firstChild.innerHTML = bumped;
    }
    return;
  }

  // Push into the in-session ring (cap LOG_HISTORY_CAP).
  hist.push(html);
  if (hist.length > LOG_HISTORY_CAP) hist.shift();

  // Mirror tail into the persisted ring (cap LOG_PERSIST_CAP).
  // Using push + shift keeps S.log the trailing slice without
  // reallocating or copying the whole history buffer per event.
  S.log.push(html);
  if (S.log.length > LOG_PERSIST_CAP) S.log.shift();

  renderLogLine(html);
}

/**
 * Restore the persisted log slice into the DOM + in-session buffer.
 * Called by main.init after loadGame. Safe to call with empty S.log
 * (first-time save) — no-op in that case.
 *
 * Renders oldest-to-newest in the stored order, but inserts each at
 * logEl.firstChild so the final DOM order is newest-on-top (matching
 * live addLog behavior).
 */
export function restoreLogFromSave() {
  if (!Array.isArray(S.log) || S.log.length === 0) return;
  // Hydrate the in-session buffer from the persisted slice so
  // scrollback starts populated rather than empty-until-new-event.
  S._transient.logHistory = [...S.log];
  if (!els.logEl) return;
  // Clear any placeholder content (init may have rendered nothing,
  // but this is defensive — the restore is idempotent).
  els.logEl.innerHTML = '';
  // Walk oldest → newest; insertBefore firstChild puts newest on top.
  for (const html of S.log) {
    const el = document.createElement('span');
    el.className = 'log-line';
    el.innerHTML = html;
    els.logEl.insertBefore(el, els.logEl.firstChild);
  }
}

