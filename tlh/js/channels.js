/* ==============================================
   THE LONG HAUL — NPC channels + chatter

   S.channels is a FIFO ring (cap CHANNELS_DISPLAY_CAP)
   of NPC utterances: { depotId, callsign, text, ts }.
   speak() unshifts; renderChannels() paints; tickAmbient
   Chatter() runs every 10 ticks per-NPC, gated on t20
   trust unlock with per-NPC cooldown + base chance.

   Per-NPC color via the [data-depot] CSS selector:
     A teal, B pink, H purple.

   v0.0.7.18: pickRandom moved to util.js (was duplicated
   here and in recovery.js). getNpc imported from trust.js
   (was duplicated here too).
   ============================================== */
'use strict';

import { S } from './state.js?v=096-10-18';
import * as C from './constants.js?v=096-10-18';
import { NPC_DEFS } from './data/npc-defs.js?v=096-10-18';
import { NPC_LINES } from './data/npc-lines.js?v=096-10-18';
import { pickRandom } from './util.js?v=096-10-18';
import { getNpc } from './trust.js?v=096-10-18';

const els = S._transient.els;

export function speak(depotId, text) {
  const def = NPC_DEFS[depotId];
  if (!def) return;
  S.channels.unshift({
    depotId,
    callsign: def.callsign,
    text,
    ts: S.ticks,
  });
  if (S.channels.length > C.CHANNELS_DISPLAY_CAP) {
    S.channels.length = C.CHANNELS_DISPLAY_CAP;
  }
  renderChannels();
}

// v0.0.9.6.10 — postGearChannelMsg removed. Peer-placed infrastructure
// now renders via network.js::formatEvent's 'gear_placement' case,
// alongside other porter activity. Gear events were already in the
// network feed; routing the log line here too was a v0.0.9.6 commit 5
// hold-over from before the network panel existed in its current form.

// v0.0.9.6 commit 7 — peer paving channel line. Fires on inbound
// trample_milestone events when the crossing hits the carved
// threshold (0.85). Lower thresholds stay silent; only pass-carve
// is narrative-worthy. Shares the 'peer' depotId sentinel.
export function postTrampleChannelMsg(porterId) {
  const shortId = (porterId || '').slice(0, 8) || 'PTR-????';
  S.channels.unshift({
    depotId: 'peer',
    callsign: shortId,
    text: 'paved a trail',
    ts: S.ticks,
  });
  if (S.channels.length > C.CHANNELS_DISPLAY_CAP) {
    S.channels.length = C.CHANNELS_DISPLAY_CAP;
  }
  renderChannels();
}

export function tickAmbientChatter() {
  if (S.ticks % 10 !== 0) return;
  Object.keys(NPC_DEFS).forEach(depotId => {
    const npc = getNpc(depotId);
    if (!npc || !npc.unlocks.t20) return;
    if (S.ticks < npc.nextChatterTick) return;
    if (Math.random() >= C.CHATTER_BASE_CHANCE * 10) return;
    const line = pickRandom(NPC_LINES.ambient[depotId]);
    if (!line) return;
    speak(depotId, line);
    npc.nextChatterTick = S.ticks + C.CHATTER_INTERVAL_MIN_TICKS +
      Math.floor(Math.random() * (C.CHATTER_INTERVAL_MAX_TICKS - C.CHATTER_INTERVAL_MIN_TICKS));
  });
}

function fmtChannelAge(ts) {
  const elapsedTicks = S.ticks - ts;
  const elapsedSecs = Math.floor(elapsedTicks * C.TICK_MS / 1000);
  if (elapsedSecs < 5)   return 'now';
  if (elapsedSecs < 60)  return elapsedSecs + 's';
  const mins = Math.floor(elapsedSecs / 60);
  if (mins < 60)         return mins + 'm';
  return Math.floor(mins / 60) + 'h';
}

export function renderChannels() {
  if (!els.channelsEl) return;
  if (S.channels.length === 0) {
    els.channelsEl.innerHTML = '<div class="chan-item chan-quiet">no callsigns trusted yet \u2014 deliver to depots to build trust</div>';
    return;
  }
  els.channelsEl.innerHTML = S.channels.map(c =>
    `<div class="chan-item" data-depot="${c.depotId}">` +
      `<span class="chan-cs">${c.callsign}</span>` +
      `<span class="chan-text">${c.text}</span>` +
      `<span class="chan-ago">${fmtChannelAge(c.ts)}</span>` +
    `</div>`
  ).join('');
}
