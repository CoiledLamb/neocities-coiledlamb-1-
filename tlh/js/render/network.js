/* render/network.js — extracted commit 16 (v0.0.7.16)

   renderNetwork (exported) + formatEvent (private). Paints
   the network panel from S.networkFeed, filtering out the
   local porter's own events.

   Circular-by-file with multiplayer.js (this imports
   getCachedPorterId/shortPorterId from there; multiplayer
   imports renderNetwork from here for pollFeed). Fine because
   all calls happen inside function bodies, not at module load.

   Imports:
     S — game state (state.js)
     getCachedPorterId, shortPorterId — multiplayer.js

   Local aliases:
     els — live ref into S._transient.els (never reassign).
*/
'use strict';

import { S } from '../state.js?v=097-0-1';
import * as C from '../constants.js?v=097-0-1';
import { getCachedPorterId, shortPorterId, isSilent, isForcedSilent } from '../multiplayer.js?v=097-0-1';
import { TERRAIN_LOCATION_NOUN } from '../data/terrain.js?v=097-0-1';

const els = S._transient.els;

export function renderNetwork() {
  if (!els.networkEl) return;
  const myId = getCachedPorterId();
  const lines = [];

  // v0.0.7.21 — feed-throttled state. Dim the panel + show a distinct
  // indicator so the player doesn't misread a 429 cooldown as the empty-
  // feed "no signal" state.
  const throttled = !!S._transient.feedThrottled;
  els.networkEl.classList.toggle('throttled', throttled);

  // v0.0.7.31 — silent / appear-offline. Reads still run, outbound is
  // suppressed. Indicator lives at the top of the feed.
  // v0.0.9.6.10.23 — distinguish user-toggle silent from worker-forced
  // silent so the indicator copy stays accurate.
  const silent       = isSilent();
  const forcedSilent = isForcedSilent();
  els.networkEl.classList.toggle('silent', silent);
  els.networkEl.classList.toggle('forced-silent', forcedSilent);
  if (silent) {
    if (forcedSilent) {
      const remain = Math.max(0, Math.ceil((S._transient.throttledUntil - Date.now()) / 1000));
      lines.push(`<div class="net-item net-silent">feed throttled \u2014 broadcasts paused${remain > 0 ? ` (${remain}s)` : ''}</div>`);
    } else {
      lines.push('<div class="net-item net-silent">silent mode \u2014 broadcasts off</div>');
    }
  } else if (throttled) {
    // Belt-and-suspenders: feedThrottled without forcedSilent shouldn't
    // happen post-v0.0.9.6.10.23 (handleThrottle sets both), but handle
    // gracefully in case a stray code path resurfaces.
    const remain = Math.max(0, Math.ceil((S._transient.throttledUntil - Date.now()) / 1000));
    lines.push(`<div class="net-item net-throttled">feed throttled \u2014 broadcasts paused${remain > 0 ? ` (${remain}s)` : ''}</div>`);
  }

  if (S.networkConnected) {
    // v0.0.9.6.10.23 — three-bucket census from new worker (today / week /
    // total). Falls back to legacy single-number census if the worker
    // hasn't been redeployed yet.
    const breakdown = S.networkCensusBreakdown;
    if (breakdown) {
      // Subtracting self (-1) matches the legacy simplification — slightly
      // under-reports for fully-silent players, fine in practice.
      const today = Math.max(0, (breakdown.today | 0) - 1);
      const week  = Math.max(0, (breakdown.week  | 0) - 1);
      const total = Math.max(0, (breakdown.total | 0) - 1);
      if (total === 0) {
        lines.push('<div class="net-item net-census">no other porters seen</div>');
      } else {
        lines.push(`<div class="net-item net-census">today <span class="net-hi">${today}</span> \u00b7 week <span class="net-hi">${week}</span> \u00b7 seen <span class="net-hi">${total}</span></div>`);
      }
    } else {
      const others = Math.max(0, S.networkCensus - 1);
      if (others === 0) {
        lines.push('<div class="net-item net-census">no other porters today</div>');
      } else if (others === 1) {
        lines.push(`<div class="net-item net-census"><span class="net-hi">1 other</span> porter online today</div>`);
      } else {
        lines.push(`<div class="net-item net-census"><span class="net-hi">${others} others</span> online today</div>`);
      }
    }
  }

  const visible = S.networkFeed.filter(e => e.porterId !== myId);

  if (!S.networkConnected) {
    lines.push('<div class="net-item net-quiet">connecting to feed...</div>');
  } else if (visible.length === 0 && !throttled) {
    lines.push('<div class="net-item net-quiet">no signal</div>');
  } else {
    visible.slice().reverse().forEach(e => {
      lines.push(`<div class="net-item">${formatEvent(e)}</div>`);
    });
  }

  els.networkEl.innerHTML = lines.join('');
}

function formatEvent(e) {
  // v0.0.9.6.10.23 — long-quiet styling. If this porter's most-recent
  // feed event is more than LONG_QUIET_MS old, mute the porter ID. Uses
  // the porter's freshest seen-time (not the current event's timestamp)
  // so a recent event from a porter who also has stale events in feed
  // doesn't get wrongly muted.
  const lastSeen   = (S._transient.porterLastSeen && S._transient.porterLastSeen[e.porterId]) || e.timestamp;
  const longQuiet  = (Date.now() - lastSeen) > C.LONG_QUIET_MS;
  const idCls      = longQuiet ? 'net-hi long-quiet' : 'net-hi';
  const who        = `<span class="${idCls}">${shortPorterId(e.porterId)}</span>`;
  const data       = e.data || {};
  switch (e.type) {
    case 'delivery':
      return `${who} delivered to <span class="net-ac">${data.destLabel || '?'}</span>`;
    case 'milestone':
      if (data.kind === 'distance') {
        // v0.0.7.21 — coalesced milestones carry values[]; render as a list.
        if (Array.isArray(data.values) && data.values.length > 1) {
          return `${who} hit <span class="net-ac">${data.values.join('km, ')}km</span>`;
        }
        return `${who} hit <span class="net-ac">${data.value}km</span>`;
      }
      return `${who} reached a milestone`;
    case 'discovery':
      return `${who} scouted: <span class="net-ac">${data.label || data.nodeId || '?'}</span>`;
    case 'lost_drop':
      return `${who} lost <span class="net-ac">${data.label || 'cargo'}</span>`;
    case 'lost_recovered':
      if (data.forPorter) {
        return `${who} recovered <span class="net-ac">${data.label || 'lost cargo'}</span> for <span class="net-hi">${shortPorterId(data.forPorter)}</span>`;
      }
      return `${who} recovered <span class="net-ac">${data.label || 'lost cargo'}</span>`;
    case 'trust_unlock': {
      const tier = data.tier ? ` (${data.tier})` : '';
      return `${who} earned trust at <span class="net-ac">${data.npcLabel || '?'}</span>${tier}`;
    }
    case 'gear_placement': {
      // v0.0.9.6.10 — peer-placed infrastructure moved off the channels
      // panel and onto the network panel (alongside other porter
      // activity). Terrain noun from TERRAIN_LOCATION_NOUN; falls back
      // to generic "slope" if the payload terrain is missing/unknown.
      const noun = TERRAIN_LOCATION_NOUN[data.terrain] || 'slope';
      const a    = /^[aeiou]/i.test(data.type || '') ? 'an' : 'a';
      return `${who} placed ${a} <span class="net-ac">${data.type || 'piece of gear'}</span> on the ${noun}`;
    }
    default:
      return `${who} ${e.type}`;
  }
}
