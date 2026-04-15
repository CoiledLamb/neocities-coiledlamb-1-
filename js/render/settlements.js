/* render/settlements.js

   renderSettlements paints the settlements panel.

   v0.0.7.18: now uses getNpc() instead of reaching into
   S.npcs[s.id] directly (handoff bug list item 5 — the
   encapsulation leak introduced commit 9 is closed).

   Imports:
     S — game state (state.js)
     NPC_DEFS — NPC metadata (data/npc-defs.js)
     getNodeStage — identification.js
     getNpc — trust.js (canonical npc accessor)

   Local aliases:
     els — live ref into S._transient.els (never reassign).
*/
'use strict';

import { S } from '../state.js';
import { NPC_DEFS } from '../data/npc-defs.js';
import { getNodeStage } from '../identification.js';
import { getNpc } from '../trust.js';

const els = S._transient.els;

export function renderSettlements() {
  if (!els.settlementsEl) return;
  els.settlementsEl.innerHTML = '';
  S.routeNodes.filter(n => getNodeStage(n.id) >= 2 && S.settlements[n.id])
    .map(n => ({ id:n.id, stage:getNodeStage(n.id), ...S.settlements[n.id] }))
    .forEach(s => {
      const div = document.createElement('div');
      div.className = 'settle-item' + (s.stage < 3 ? ' settle-stage2' : '');
      const name = s.stage >= 3 ? s.label : s.tier;
      const subtitle = s.stage >= 3 ? s.tier : 'unconfirmed';
      const quote = s.stage >= 3 ? s.quote : `"reports of a ${s.tier} along this route"`;
      let trustBlock = '';
      const npcDef = NPC_DEFS[s.id];
      const npc    = getNpc(s.id);
      if (npcDef && npc && s.stage >= 3) {
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
        <div class="settle-name">${name} <span>${subtitle}</span></div>
        <div class="settle-bar settle-bar-wip" title="rebuild progress \u2014 WIP indicator"><div class="settle-fill ${s.rebuild>50?'b':'a'}" style="width:${Math.round(s.rebuild)}%"></div></div>
        <div class="settle-quote">${quote}</div>`;
      els.settlementsEl.appendChild(div);
    });
}
