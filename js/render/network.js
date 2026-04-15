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

import { S } from '../state.js';
import { getCachedPorterId, shortPorterId } from '../multiplayer.js';

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

  if (throttled) {
    const remain = Math.max(0, Math.ceil((S._transient.throttledUntil - Date.now()) / 1000));
    lines.push(`<div class="net-item net-throttled">feed throttled \u2014 broadcasts paused${remain > 0 ? ` (${remain}s)` : ''}</div>`);
  }

  if (S.networkConnected) {
    const others = Math.max(0, S.networkCensus - 1);
    if (others === 0) {
      lines.push('<div class="net-item net-census">no other porters today</div>');
    } else if (others === 1) {
      lines.push(`<div class="net-item net-census"><span class="net-hi">1 other</span> porter online today</div>`);
    } else {
      lines.push(`<div class="net-item net-census"><span class="net-hi">${others} others</span> online today</div>`);
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
  const who = `<span class="net-hi">${shortPorterId(e.porterId)}</span>`;
  const data = e.data || {};
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
    default:
      return `${who} ${e.type}`;
  }
}
