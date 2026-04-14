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

export function postActivity(type, data) {
  const porterId = getCachedPorterId();
  if (porterId === 'PTR-OFFLINE') return;
  try {
    fetch(C.FEED_URL + '/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ porterId, type, data: data || {} }),
      keepalive: true,
    }).catch(() => {});
  } catch (e) {}
}

export function postLostDrop(pkg) {
  const porterId = getCachedPorterId();
  if (porterId === 'PTR-OFFLINE') return;
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
