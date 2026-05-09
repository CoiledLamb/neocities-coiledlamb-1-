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

import { S } from '../state.js?v=097-0-13';
import * as C from '../constants.js?v=097-0-13';
import { getCachedPorterId, shortPorterId, isSilent, isForcedSilent } from '../multiplayer.js?v=097-0-13';
import { TERRAIN_LOCATION_NOUN } from '../data/terrain.js?v=097-0-13';
import { esc } from '../util.js?v=097-0-13';

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
  //
  // v0.0.9.7.11 — every peer-data string field below is wrapped in esc()
  // before interpolation. The worker validates the OUTER porterId via regex
  // (so e.porterId passed to shortPorterId is safe to render raw), but it
  // does NOT validate inner-shape fields like data.destLabel, data.label,
  // data.npcLabel, data.type, data.forPorter, etc. Those could contain raw
  // HTML from a malicious peer; render-site escape is the fix.
  const lastSeen   = (S._transient.porterLastSeen && S._transient.porterLastSeen[e.porterId]) || e.timestamp;
  const longQuiet  = (Date.now() - lastSeen) > C.LONG_QUIET_MS;
  const idCls      = longQuiet ? 'net-hi long-quiet' : 'net-hi';
  const who        = `<span class="${idCls}">${shortPorterId(e.porterId)}</span>`;
  const data       = e.data || {};
  switch (e.type) {
    case 'delivery':
      return `${who} delivered to <span class="net-ac">${esc(data.destLabel || '?')}</span>`;
    case 'milestone':
      if (data.kind === 'distance') {
        // v0.0.7.21 — coalesced milestones carry values[]; render as a list.
        if (Array.isArray(data.values) && data.values.length > 1) {
          const safeValues = data.values.map(v => esc(String(v))).join('km, ');
          return `${who} hit <span class="net-ac">${safeValues}km</span>`;
        }
        return `${who} hit <span class="net-ac">${esc(String(data.value))}km</span>`;
      }
      return `${who} reached a milestone`;
    case 'discovery':
      return `${who} scouted: <span class="net-ac">${esc(data.label || data.nodeId || '?')}</span>`;
    case 'lost_drop':
      return `${who} lost <span class="net-ac">${esc(data.label || 'cargo')}</span>`;
    case 'lost_recovered':
      if (data.forPorter) {
        // data.forPorter is NOT regex-validated by the worker (only outer
        // porterId is). shortPorterId returns the input as-is when it doesn't
        // match the 2-part format, so esc() is required.
        return `${who} recovered <span class="net-ac">${esc(data.label || 'lost cargo')}</span> for <span class="net-hi">${esc(shortPorterId(data.forPorter))}</span>`;
      }
      return `${who} recovered <span class="net-ac">${esc(data.label || 'lost cargo')}</span>`;
    case 'trust_unlock': {
      const tier = data.tier ? ` (${esc(String(data.tier))})` : '';
      return `${who} earned trust at <span class="net-ac">${esc(data.npcLabel || '?')}</span>${tier}`;
    }
    case 'gear_placement': {
      // v0.0.9.6.10 — peer-placed infrastructure moved off the channels
      // panel and onto the network panel (alongside other porter
      // activity). Terrain noun from TERRAIN_LOCATION_NOUN (hardcoded
      // table — safe); falls back to 'slope' if missing/unknown.
      //
      // v0.0.9.7.13 — batched senders ship data.placements: [...] without
      // per-event terrain. Render as a count summary in that case;
      // single-event senders keep the legacy "placed an anchor on the
      // riverbank" form.
      if (Array.isArray(data.placements)) {
        const n = data.placements.length;
        if (n === 1) {
          const p = data.placements[0] || {};
          const a = /^[aeiou]/i.test(p.type || '') ? 'an' : 'a';
          return `${who} placed ${a} <span class="net-ac">${esc(p.type || 'piece of gear')}</span>`;
        }
        return `${who} placed <span class="net-ac">${n} pieces of gear</span>`;
      }
      const noun = TERRAIN_LOCATION_NOUN[data.terrain] || 'slope';
      const a    = /^[aeiou]/i.test(data.type || '') ? 'an' : 'a';
      return `${who} placed ${a} <span class="net-ac">${esc(data.type || 'piece of gear')}</span> on the ${noun}`;
    }
    default:
      // e.type is on the worker's allowlist — known string set, no escape needed.
      return `${who} ${e.type}`;
  }
}
