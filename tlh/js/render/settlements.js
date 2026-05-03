/* render/settlements.js

   renderSettlements paints the settlements panel.

   v0.0.7.18: now uses getNpc() instead of reaching into
   S.npcs[s.id] directly (handoff bug list item 5 — the
   encapsulation leak introduced commit 9 is closed).

   v0.0.9.2: typewriter emergence reveal. When a settlement
   crosses stage-2 → stage-3 the name is revealed char-by-char
   with a blinking caret, instead of the existing dry
   className swap. Tick-driven (not wall-clock) so the
   reveal pauses naturally if the game is paused.

   Imports:
     S — game state (state.js)
     NPC_DEFS — NPC metadata (data/npc-defs.js)
     getNodeStage — identification.js
     getNpc — trust.js (canonical npc accessor)

   Local aliases:
     els — live ref into S._transient.els (never reassign).
*/
'use strict';

import { S } from '../state.js?v=097-0-7';
import { NPC_DEFS, NPC_VISIT_ORDER } from '../data/npc-defs.js?v=097-0-7';
import { getNodeStage } from '../identification.js?v=097-0-7';
import { getNpc } from '../trust.js?v=097-0-7';

const els = S._transient.els;

// v0.0.9.6.10.3 — settlements panel sorts by NPC_VISIT_ORDER (tau
// first, then clockwise ring traversal) instead of S.routeNodes
// native order (which starts at nu). Matches the upgrades shop
// order so both user-facing menus read as "home, then walking route".
// Nodes absent from NPC_VISIT_ORDER (shouldn't happen with current
// 12-NPC roster but future-proof) fall to the end of the list.
const VISIT_INDEX = new Map(NPC_VISIT_ORDER.map((id, i) => [id, i]));
function visitIndexOf(nodeId) {
  const i = VISIT_INDEX.get(nodeId);
  return i === undefined ? NPC_VISIT_ORDER.length : i;
}

/**
 * Start (or restart) a typewriter emergence animation for a node.
 * Called from main.js when setNodeStage transitions a node to 3.
 * Safe to call on non-settlement nodes — it simply won't show up
 * in the settlements panel.
 */
export function startEmergence(nodeId) {
  S._transient.emergingSettlements.set(nodeId, { startTick: S.ticks });
}

/** Any emergence animations still in progress? Called from main.js tick. */
export function hasActiveEmergence() {
  return S._transient.emergingSettlements.size > 0;
}

export function renderSettlements() {
  if (!els.settlementsEl) return;
  const emerging = S._transient.emergingSettlements;
  els.settlementsEl.innerHTML = '';
  S.routeNodes.filter(n => getNodeStage(n.id) >= 2 && S.settlements[n.id])
    .map(n => ({ id:n.id, stage:getNodeStage(n.id), ...S.settlements[n.id] }))
    .sort((a, b) => visitIndexOf(a.id) - visitIndexOf(b.id))
    .forEach(s => {
      const div = document.createElement('div');

      // v0.0.9.2 — emergence typewriter. If an entry exists for this
      // node AND it's now stage-3, advance char count based on elapsed
      // ticks. When the full name is revealed, clear the entry.
      let name     = s.stage >= 3 ? s.label : s.tier;
      let subtitle = s.stage >= 3 ? s.tier  : 'unconfirmed';
      let caretHtml = '';
      const em = emerging.get(s.id);
      if (em && s.stage >= 3) {
        const elapsed = S.ticks - em.startTick;
        const chars   = Math.max(0, Math.min(s.label.length, elapsed));
        if (chars < s.label.length) {
          name      = s.label.slice(0, chars);
          subtitle  = 'revealing';
          caretHtml = '<span class="settle-caret"></span>';
          div.className = 'settle-item settle-emerging';
        } else {
          emerging.delete(s.id);
          div.className = 'settle-item';
        }
      } else {
        div.className = 'settle-item' + (s.stage < 3 ? ' settle-stage2' : '');
      }

      const quote = s.stage >= 3 ? s.quote : `"reports of a ${s.tier} along this route"`;
      let trustBlock = '';
      const npcDef = NPC_DEFS[s.id];
      const npc    = getNpc(s.id);
      if (npcDef && npc && s.stage >= 3 && !em) {
        const tPct = Math.max(0, Math.min(100, npc.trust));
        trustBlock = `
          <div class="settle-trust">
            <span class="settle-trust-label">${npcDef.callsign}</span>
            <div class="settle-trust-bar">
              <div class="settle-trust-fill" style="width:${tPct}%"></div>
              <span class="settle-trust-tick" style="left:20%"></span>
              <span class="settle-trust-tick" style="left:40%"></span>
              <span class="settle-trust-tick" style="left:60%"></span>
              <span class="settle-trust-tick" style="left:80%"></span>
            </div>
            <span class="settle-trust-val">${tPct}</span>
          </div>`;
      }
      div.innerHTML = `
        ${trustBlock}
        <div class="settle-name">${name}${caretHtml} <span>${subtitle}</span></div>
        <div class="settle-bar settle-bar-wip" title="rebuild progress \u2014 WIP indicator"><div class="settle-fill ${s.rebuild>50?'b':'a'}" style="width:${Math.round(s.rebuild)}%"></div></div>
        <div class="settle-quote">${quote}</div>`;
      els.settlementsEl.appendChild(div);
    });
}
