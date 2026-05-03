/* ==============================================
   THE LONG HAUL — multiplayer feed + porter ID

   Talks to the Cloudflare Worker at C.FEED_URL. Schema is a
   generic event bus { type, porterId, timestamp, data } so
   new game systems plug in without backend changes.

   Endpoints used:
     POST /activity      — broadcast an event
     GET  /feed?since=   — incremental fetch
     POST /lost          — register a dropped lost-pkg
     GET  /lost/:porterId — read a peer's lost list

   Polling is gated on document visibility (startPolling /
   stopPolling wired in main.js init via visibilitychange).

   v0.0.7.21 — client-side rate limiting.
     Worker KV free-tier is 1000 puts/day. Cap exhaustion 500s
     every other porter's broadcasts, so the client throttles
     first. Rules:
       - Minimum POST_MIN_INTERVAL_MS between any two sends.
         Events that land in the window are queued.
       - Duplicate-type dedupe inside the pending queue: if two
         of the same `type` are pending, only the newer survives
         (prevents walls of identical events after a cooldown).
       - Milestone coalesce: consecutive milestone events in the
         queue are batched into one event with data.values = [...].
       - 429 response → feedThrottled flips, network panel dims,
         sends pause until Retry-After (or THROTTLE_COOLDOWN_MS
         fallback) elapses. Queue is preserved so in-flight work
         doesn't vanish; it just waits.

     postLostDrop still sends the /lost POST directly (not via
     the queue) because the lost-cargo pickup flow depends on
     the worker seeing the drop immediately. The /activity half
     of postLostDrop still goes through the queue.
   ============================================== */
'use strict';

import { S } from './state.js?v=097-0-3';
import * as C from './constants.js?v=097-0-3';
import { addLog } from './render/log.js?v=097-0-3';
import { renderNetwork } from './render/network.js?v=097-0-3';

export function getPorterId() {
  const LS_KEY = 'tlh-porter-id';
  try {
    let id = localStorage.getItem(LS_KEY);
    if (!id) {
      const hex = () => Math.floor(Math.random() * 0x10000).toString(16).toUpperCase().padStart(4, '0');
      id = 'PTR-' + hex() + hex();
      localStorage.setItem(LS_KEY, id);
    } else if (id.startsWith('TLH-')) {
      id = 'PTR-' + id.slice(4);
      localStorage.setItem(LS_KEY, id);
    }
    return id;
  } catch (e) {
    return 'PTR-OFFLINE';
  }
}

export function getCachedPorterId() {
  if (!S._transient.porterIdCached) S._transient.porterIdCached = getPorterId();
  return S._transient.porterIdCached;
}

// ============================================================
// SILENT MODE (v0.0.7.31, expanded v0.0.9.6.10.23)
// Two stacked sources of "silent":
//   1. userSilentPref()  — persisted appear-offline toggle
//   2. forcedSilent flag — set when worker returns 429 (daily-quota
//      exhaustion). Lives on _transient; never touches the user's
//      persisted preference.
// isSilent() ORs them. While forcedSilent is on, the network toggle
// dims + becomes non-interactive; the slow-poll cadence keeps polling
// alive (at POLL_MS_THROTTLED) so we detect when the throttle clears.
// ============================================================
const SILENT_LS_KEY = 'tlh-silent-mode';

function userSilentPref() {
  try { return localStorage.getItem(SILENT_LS_KEY) === '1'; }
  catch (e) { return false; }
}

export function isSilent() {
  return !!S._transient.forcedSilent || userSilentPref();
}

export function isForcedSilent() {
  return !!S._transient.forcedSilent;
}

export function setSilent(on) {
  try {
    if (on) localStorage.setItem(SILENT_LS_KEY, '1');
    else    localStorage.removeItem(SILENT_LS_KEY);
  } catch (e) {}
  if (on) {
    // Drop anything queued so flipping silent on mid-session
    // doesn't leave pending events that would fire on toggle-off.
    S._transient.postQueue.length = 0;
  }
  renderNetwork();
}

// ============================================================
// RATE LIMITING + SEND (v0.0.7.21)
// ============================================================
function doSend(evt) {
  const porterId = getCachedPorterId();
  if (porterId === 'PTR-OFFLINE') return;
  try {
    fetch(C.FEED_URL + '/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ porterId, type: evt.type, data: evt.data || {} }),
      keepalive: true,
    }).then(res => {
      if (res && res.status === 429) {
        handleThrottle(res);
      } else if (res && res.ok && S._transient.feedThrottled) {
        clearThrottle();
      }
    }).catch(() => {});
  } catch (e) {}
}

function handleThrottle(res) {
  const t = S._transient;
  let cooldownMs = C.THROTTLE_COOLDOWN_MS;
  try {
    const retryAfter = res.headers.get('Retry-After');
    if (retryAfter) {
      const secs = parseInt(retryAfter, 10);
      if (!isNaN(secs) && secs > 0) cooldownMs = secs * 1000;
    }
  } catch (e) {}
  // v0.0.9.6.10.23 — defensive clamp. A misbehaving Retry-After or a
  // forward clock-jump could otherwise strand the toggle for unbounded
  // time; worker re-enforces server-side, so we cap aggressively.
  if (cooldownMs > C.THROTTLE_MAX_MS) cooldownMs = C.THROTTLE_MAX_MS;
  const firstHit = !t.feedThrottled;
  t.feedThrottled  = true;
  t.forcedSilent   = true;
  t.throttledUntil = Date.now() + cooldownMs;
  if (firstHit) {
    const secs = Math.round(cooldownMs / 1000);
    addLog('<span class="log-wn">feed throttled</span> \u2014 broadcasts paused (' + secs + 's)');
    // v0.0.9.6.10.23 telemetry — surface to console so a future-dev
    // tailing DevTools sees throttle events without scraping the
    // dispatch log.
    try { console.warn('[tlh] feed throttled \u2014 worker quota, retry in', secs, 's'); } catch (e) {}
    renderNetwork();
  }
}

function clearThrottle() {
  const t = S._transient;
  const wasThrottled = t.feedThrottled;
  t.feedThrottled  = false;
  t.forcedSilent   = false;
  t.throttledUntil = 0;
  if (wasThrottled) {
    try { console.info('[tlh] feed throttle cleared \u2014 broadcasts resuming'); } catch (e) {}
  }
  renderNetwork();
}

function queuePost(type, data) {
  const q = S._transient.postQueue;
  // Duplicate-type dedupe: drop any earlier-queued event of the same type.
  // Milestones are the exception — they coalesce by batching, not dropping.
  if (type !== 'milestone') {
    for (let i = q.length - 1; i >= 0; i--) {
      if (q[i].type === type) q.splice(i, 1);
    }
  }
  q.push({ type, data: data || {}, queuedAt: Date.now() });
  scheduleFlush();
}

function scheduleFlush() {
  const t = S._transient;
  if (t.flushTimer !== null) return;
  const now = Date.now();
  const throttleWait = Math.max(0, t.throttledUntil - now);
  const cooldownWait = Math.max(0, (t.lastPostAt + C.POST_MIN_INTERVAL_MS) - now);
  const wait = Math.max(throttleWait, cooldownWait);
  t.flushTimer = setTimeout(flushOne, wait);
}

function flushOne() {
  const t = S._transient;
  t.flushTimer = null;
  const q = t.postQueue;

  // If throttle window hasn't elapsed yet, reschedule.
  if (t.throttledUntil > 0 && Date.now() < t.throttledUntil) {
    scheduleFlush();
    return;
  }
  if (t.throttledUntil > 0 && Date.now() >= t.throttledUntil) {
    clearThrottle();
  }

  if (q.length === 0) return;

  // Coalesce leading milestones into one batched event.
  const head = q[0];
  let toSend;
  if (head.type === 'milestone') {
    const chunk = [];
    while (q.length > 0 && q[0].type === 'milestone') chunk.push(q.shift());
    if (chunk.length === 1) {
      toSend = chunk[0];
    } else {
      const values = chunk.map(c => (c.data && typeof c.data.value === 'number') ? c.data.value : null)
                          .filter(v => v !== null);
      const maxV = values.length > 0 ? Math.max(...values) : undefined;
      toSend = {
        type: 'milestone',
        data: {
          kind: (head.data && head.data.kind) || 'distance',
          value: maxV,
          values,
        },
      };
    }
  } else {
    toSend = q.shift();
  }

  doSend(toSend);
  t.lastPostAt = Date.now();
  if (q.length > 0) scheduleFlush();
}

export function postActivity(type, data) {
  if (isSilent()) return;
  queuePost(type, data);
}

export function postLostDrop(pkg) {
  if (isSilent()) return;
  const porterId = getCachedPorterId();
  if (porterId === 'PTR-OFFLINE') return;
  // /lost goes direct (recovery flow depends on it) but still respects
  // the throttle window — if the worker is rate limiting, a /lost POST
  // will come back 429 too, and we don't want to slam it.
  const t = S._transient;
  if (t.throttledUntil > 0 && Date.now() < t.throttledUntil) {
    // Skip the /lost POST this time; the /activity half still queues.
    postActivity('lost_drop', { label: pkg.label, size: pkg.size });
    return;
  }
  try {
    fetch(C.FEED_URL + '/lost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        porterId,
        pkg: {
          size: pkg.size, label: pkg.label, kg: pkg.kg, slots: pkg.slots,
          scrip: pkg.scrip, isLost: true,
        },
      }),
      keepalive: true,
    }).then(res => {
      if (res && res.status === 429) handleThrottle(res);
    }).catch(() => {});
  } catch (e) {}
  postActivity('lost_drop', { label: pkg.label, size: pkg.size });
}

// v0.0.9.6 commit 5 — placed-gear broadcast. Fires when a courier
// places a ladder or anchor so peers see each other's infrastructure
// in the shared world. Receivers dedup on canonical id in
// receiveGearPlacement. Queued via the same postActivity pipeline as
// milestones / tosses so throttling + rate limits come for free.
export function broadcastGearPlacement(payload) {
  if (isSilent()) return;
  if (!payload || !payload.id) return;
  // Slim payload — the activity feed is seen by every peer; no need
  // to ship stormDecayExtra (viewers compute their own wear from
  // placedWallClock + lifetimeMs).
  postActivity('gear_placement', {
    id:              payload.id,
    placerId:        payload.placerId,
    type:            payload.type,
    x:               payload.x,
    y:               payload.y,
    placedWallClock: payload.placedWallClock,
    lifetimeMs:      payload.lifetimeMs,
    terrain:         payload.terrain,
  });
}

// v0.0.9.6 commit 7 — trample milestone broadcast. Fires when an
// interior cell crosses 0.25 / 0.5 / 0.85 trample thresholds so
// peers see each other's paving. At most 3 broadcasts per cell over
// its lifetime — bounded volume, no per-tick flooding. Receivers
// (trail.receiveTrampleMilestone) merge by max value.
export function broadcastTrampleMilestone(cellKey, value) {
  if (isSilent()) return;
  if (!cellKey) return;
  postActivity('trample_milestone', {
    cellKey,
    value: +value,
    placerId: getCachedPorterId(),
  });
}

export async function fetchLostFromPeer(peerPorterId) {
  // v0.0.9.6.9.6 — respect silent mode (missing gate could let sim or
  // user-silenced sessions hit Cloudflare worker).
  if (isSilent()) return [];
  try {
    const res = await fetch(C.FEED_URL + '/lost/' + encodeURIComponent(peerPorterId));
    if (!res.ok) return [];
    const data = await res.json();
    if (!data || !Array.isArray(data.lost)) return [];
    return data.lost;
  } catch (e) {
    return [];
  }
}

export async function pollFeed() {
  // v0.0.9.6.10.23 — gate on user-pref directly (not isSilent), so a
  // forced-silent throttle keeps polling at the slow cadence and we
  // observe when the throttle clears. User-pref silent still skips
  // polling entirely (matches v0.0.9.6.9.6 intent: sim / user-silenced
  // sessions don't hit the worker).
  if (userSilentPref()) return;
  try {
    const url = C.FEED_URL + '/feed' + (S.lastFeedTimestamp ? ('?since=' + S.lastFeedTimestamp) : '');
    const res = await fetch(url);
    // v0.0.9.6.10.23 — surface /feed 429 (worker daily-quota exhaustion)
    // into the same throttle path /activity uses. Previously swallowed.
    if (res.status === 429) {
      handleThrottle(res);
      return;
    }
    if (!res.ok) return;
    // Successful poll while throttle was on → throttle has cleared.
    if (S._transient.feedThrottled) clearThrottle();
    const data = await res.json();
    if (!data || !Array.isArray(data.events)) return;

    S.networkConnected = true;
    // v0.0.9.6.10.23 — worker now sends both `census` (number, back-compat)
    // and `censusBreakdown` ({today, week, total}). Old worker only sends
    // census; new client renders breakdown when present, falls through.
    S.networkCensus          = data.census || 0;
    S.networkCensusBreakdown = data.censusBreakdown || null;

    const myId = getCachedPorterId();
    const seen = new Set(S.networkFeed.map(e => `${e.timestamp}|${e.porterId}|${e.type}`));
    const lastSeen = S._transient.porterLastSeen;
    const freshGearEvents = [];
    const freshTrampleEvents = [];
    data.events.forEach(e => {
      const key = `${e.timestamp}|${e.porterId}|${e.type}`;
      if (!seen.has(key)) {
        S.networkFeed.push(e);
        seen.add(key);
        if (e.timestamp > S.lastFeedTimestamp) S.lastFeedTimestamp = e.timestamp;
        // v0.0.9.6.10.23 — most-recent feed timestamp per porter, used
        // for recovery-tooltip freshness suffix + long-quiet styling.
        if (e.porterId && (!lastSeen[e.porterId] || lastSeen[e.porterId] < e.timestamp)) {
          lastSeen[e.porterId] = e.timestamp;
        }
        if (e.porterId && e.porterId !== myId) {
          if (!S.knownPeers.includes(e.porterId)) {
            S.knownPeers.push(e.porterId);
            if (S.knownPeers.length > C.KNOWN_PEERS_CAP) S.knownPeers.shift();
          }
        }
        // v0.0.9.6 commit 5 — dispatch gear_placement events into
        // gear.js receiver so peer placements land in the local
        // S.placedGear table for visibility + amortization. Dynamic
        // import keeps this cycle-safe (gear.js imports multiplayer).
        if (e.type === 'gear_placement' && e.data) {
          freshGearEvents.push(e.data);
        }
        // v0.0.9.6 commit 7 — dispatch trample_milestone events into
        // trail.js receiver. Peer paving merges into local
        // S.interiorTrample (max-value wins). Carved-threshold
        // crossings post a channel line.
        if (e.type === 'trample_milestone' && e.data) {
          freshTrampleEvents.push(e.data);
        }
      }
    });
    if (freshGearEvents.length) {
      import('./gear.js?v=097-0-3').then((gearMod) => {
        freshGearEvents.forEach(data => gearMod.receiveGearPlacement(data));
      });
    }
    if (freshTrampleEvents.length) {
      import('./trail.js?v=097-0-3').then((trailMod) => {
        freshTrampleEvents.forEach(data => trailMod.receiveTrampleMilestone(data));
      });
    }

    S.networkFeed.sort((a, b) => a.timestamp - b.timestamp);
    if (S.networkFeed.length > C.FEED_DISPLAY_CAP) {
      S.networkFeed = S.networkFeed.slice(-C.FEED_DISPLAY_CAP);
    }

    renderNetwork();
  } catch (e) {}
}

// v0.0.9.6.10.23 — recursive-setTimeout poll loop (was setInterval).
// Lets each iteration pick its own cadence: POLL_MS normally,
// POLL_MS_THROTTLED while forcedSilent. Stop semantics: stopPolling
// nulls pollTimer; the in-flight callback checks pollTimer after the
// fetch completes and skips re-arming if it was cleared mid-poll.
function schedulePoll() {
  const t = S._transient;
  const interval = t.forcedSilent ? C.POLL_MS_THROTTLED : C.POLL_MS;
  t.pollTimer = setTimeout(async () => {
    await pollFeed();
    if (t.pollTimer !== null) schedulePoll();
  }, interval);
}

export function startPolling() {
  if (S._transient.pollTimer) return;
  pollFeed().then(schedulePoll);
}

export function stopPolling() {
  if (S._transient.pollTimer !== null) {
    clearTimeout(S._transient.pollTimer);
    S._transient.pollTimer = null;
  }
}

export function shortPorterId(id) {
  if (!id || typeof id !== 'string') return 'PTR-????';
  const parts = id.split('-');
  if (parts.length === 2 && parts[1].length > 4) {
    return parts[0] + '-' + parts[1].slice(0, 4);
  }
  return id;
}

// v0.0.9.6.10.23 — freshness suffix for porter-attributed UI (recovery
// tooltips, etc). Reads S._transient.porterLastSeen, which is populated
// by pollFeed from feed:recent. Returns '' when we have no data on
// this porter (silence preferable to lying with "just now").
export function formatPorterFreshness(porterId) {
  if (!porterId) return '';
  const lastSeen = S._transient.porterLastSeen;
  const ts = lastSeen && lastSeen[porterId];
  if (!ts) return '';
  const ms   = Math.max(0, Date.now() - ts);
  const days = Math.floor(ms / 86400000);
  if (days >= 2)  return `(${days} days ago)`;
  if (days === 1) return '(1 day ago)';
  const hrs  = Math.floor(ms / 3600000);
  if (hrs >= 1)   return `(${hrs}h ago)`;
  const mins = Math.floor(ms / 60000);
  if (mins >= 1)  return `(${mins}m ago)`;
  return '(just now)';
}

export function checkDistMilestones() {
  const km = Math.floor(S.distKm);
  for (const m of C.DIST_MILESTONES) {
    if (km >= m && !S.milestonesHit.includes(m)) {
      S.milestonesHit.push(m);
      postActivity('milestone', { kind: 'distance', value: m });
      addLog(`milestone: <span class="log-hi">${m}km walked</span>`);
    }
  }
}
