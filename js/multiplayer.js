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

import { S } from './state.js';
import * as C from './constants.js';
import { addLog } from './render/log.js';
import { renderNetwork } from './render/network.js';

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
  const firstHit = !t.feedThrottled;
  t.feedThrottled = true;
  t.throttledUntil = Date.now() + cooldownMs;
  if (firstHit) {
    addLog('<span class="log-wn">feed throttled</span> \u2014 broadcasts paused (' + Math.round(cooldownMs/1000) + 's)');
    renderNetwork();
  }
}

function clearThrottle() {
  S._transient.feedThrottled = false;
  S._transient.throttledUntil = 0;
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
  queuePost(type, data);
}

export function postLostDrop(pkg) {
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

export async function fetchLostFromPeer(peerPorterId) {
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
  try {
    const url = C.FEED_URL + '/feed' + (S.lastFeedTimestamp ? ('?since=' + S.lastFeedTimestamp) : '');
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !Array.isArray(data.events)) return;

    S.networkConnected = true;
    S.networkCensus    = data.census || 0;

    const myId = getCachedPorterId();
    const seen = new Set(S.networkFeed.map(e => `${e.timestamp}|${e.porterId}|${e.type}`));
    data.events.forEach(e => {
      const key = `${e.timestamp}|${e.porterId}|${e.type}`;
      if (!seen.has(key)) {
        S.networkFeed.push(e);
        seen.add(key);
        if (e.timestamp > S.lastFeedTimestamp) S.lastFeedTimestamp = e.timestamp;
        if (e.porterId && e.porterId !== myId) {
          if (!S.knownPeers.includes(e.porterId)) {
            S.knownPeers.push(e.porterId);
            if (S.knownPeers.length > C.KNOWN_PEERS_CAP) S.knownPeers.shift();
          }
        }
      }
    });

    S.networkFeed.sort((a, b) => a.timestamp - b.timestamp);
    if (S.networkFeed.length > C.FEED_DISPLAY_CAP) {
      S.networkFeed = S.networkFeed.slice(-C.FEED_DISPLAY_CAP);
    }

    renderNetwork();
  } catch (e) {}
}

export function startPolling() {
  if (S._transient.pollTimer) return;
  pollFeed();
  S._transient.pollTimer = setInterval(pollFeed, C.POLL_MS);
}

export function stopPolling() {
  if (S._transient.pollTimer) {
    clearInterval(S._transient.pollTimer);
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
