/* upgrades.js — extracted commit 15 (v0.0.7.15)

   renderUpgrades + buyUpgrade. UPGRADE_DEFS data has lived in
   ./data/upgrades.js since commit 4; this module is the
   behavior half (paint the panel, spend scrip, fire .apply()).

   Imports updated commit 17: addLog/updateHUD/renderCargoSlots
   now from ./render/log.js + ./render/hud.js (was via main.js's
   re-export layer in commit 16).
   Boots.renderBoots still circular-by-file with boots.js, fine
   because all calls are inside function bodies.

   Imports:
     S — game state singleton (state.js)
     UPGRADE_DEFS — upgrade list w/ apply closures (data/upgrades.js)
     addLog — render/log.js
     updateHUD, renderCargoSlots — render/hud.js
     Boots.renderBoots — boots (namespace import)

   Local aliases:
     els — live ref into S._transient.els (never reassign).
*/
'use strict';

import { S } from './state.js?v=097-0-5';
import { UPGRADE_DEFS } from './data/upgrades.js?v=097-0-5';
import { NPC_DEFS } from './data/npc-defs.js?v=097-0-5';
import { addLog } from './render/log.js?v=097-0-5';
import { updateHUD, renderCargoSlots } from './render/hud.js?v=097-0-5';
import * as Boots from './boots.js?v=097-0-5';
import { emit as tEmit, accum as tAccum } from './telemetry.js?v=097-0-5';

const els = S._transient.els;

// v0.0.7.32 — cache the structural state so renderUpgrades doesn't
// rebuild innerHTML every tick. Before: updateHUD → renderUpgrades
// called per tick destroyed hovered .upg-btn mid-animation, restarting
// the oil-border keyframe from 0% and producing the "flicker." Now the
// list rebuilds only when a purchased / reqMet / canAfford / unlocked
// flag flips. v0.0.9.5.2: trust-reward items are visible once their
// NPC tier unlocks, purchased like any other item.
let lastUpgKey = null;

// v0.0.9.5.2 — trust-gate check. Returns true iff the upgrade is
// either not a trust-reward (open shop item) OR its trust-gate NPC
// has unlocked the matching tier. Items below the trust gate don't
// appear in the shop at all, matching the pre-.9.5.2 hidden-until-
// unlocked behavior (we just changed the delivery from auto-grant
// to shop-purchasable).
function trustGateOpen(def) {
  if (!def.trustReward) return true;
  const npc = S.npcs[def.trustReward.npc];
  if (!npc || !npc.unlocks) return false;
  return !!npc.unlocks[def.trustReward.tier];
}

export function renderUpgrades() {
  if (!els.upgradesEl) return;

  // v0.0.9.5.2: trust-reward items enter the shop once their tier
  // unlocks. Before threshold: hidden (same as pre-.9.5.2). After:
  // purchasable with scrip. Already-owned (from old auto-grant
  // saves, or new purchases) show as "owned" and no-op.
  const visibleDefs = UPGRADE_DEFS.filter(trustGateOpen);

  const key = visibleDefs.map(def => {
    const o = S.upgrades[def.id] ? 'o' : 'x';
    const r = !def.requires || S.upgrades[def.requires] ? 'r' : '-';
    const a = S.scrip >= def.cost ? 'a' : 'n';
    return def.id + ':' + o + r + a;
  }).join('|');
  if (key === lastUpgKey) return;
  lastUpgKey = key;

  els.upgradesEl.innerHTML = '';
  visibleDefs.forEach(def => {
    const purchased = S.upgrades[def.id];
    const reqMet    = !def.requires || S.upgrades[def.requires];
    const canAfford = S.scrip >= def.cost;
    const row = document.createElement('div'); row.className = 'upg-item';
    // v0.0.9.5.2 — trust-reward items tag the NPC callsign in the
    // name line so the player knows where the gift came from.
    const giftTag = def.trustReward && NPC_DEFS[def.trustReward.npc]
      ? ` <span class="upg-gift">from ${NPC_DEFS[def.trustReward.npc].callsign}</span>`
      : '';
    const nameEl = document.createElement('span'); nameEl.className = 'upg-name';
    nameEl.innerHTML = `${def.name}${giftTag}<small>${def.desc}</small>`;
    const btn = document.createElement('button'); btn.className = 'upg-btn';
    if (purchased)      { btn.textContent = 'owned'; btn.disabled = true; }
    else if (!reqMet)   { btn.textContent = '???\u00a2'; btn.disabled = true; }
    else { btn.textContent = def.cost+'\u00a2'; btn.disabled = !canAfford; btn.addEventListener('click', ()=>buyUpgrade(def.id)); }
    row.appendChild(nameEl); row.appendChild(btn);
    els.upgradesEl.appendChild(row);
  });
}

export function buyUpgrade(id) {
  const def = UPGRADE_DEFS.find(d => d.id === id);
  if (!def || S.upgrades[id] || S.scrip < def.cost) return;
  // v0.0.9.5.2 — guard the trust gate at buy time too (cheap belt-
  // and-suspenders against stale DOM clicks firing after an unlock
  // revert or a multi-click race).
  if (def.trustReward) {
    const npc = S.npcs[def.trustReward.npc];
    if (!npc || !npc.unlocks || !npc.unlocks[def.trustReward.tier]) return;
  }
  S.scrip -= def.cost; S.upgrades[id] = true; def.apply();
  tEmit('upgrade.acquired', { id, cost: def.cost });
  tAccum('scrip.spent', 'upgrade',          def.cost);
  tAccum('scrip.spent_by_upgrade', def.id,  def.cost);
  // v0.0.9.5.2 — log flavor differs for gift-claim vs. open-shop purchase.
  if (def.trustReward && NPC_DEFS[def.trustReward.npc]) {
    const callsign = NPC_DEFS[def.trustReward.npc].callsign;
    addLog(`claimed <span class="log-ok">${def.name}</span> from <span class="log-hi">${callsign}</span>`);
  } else {
    addLog(`<span class="log-hi">${def.name}</span> purchased`);
  }
  renderUpgrades(); renderCargoSlots(true); Boots.renderBoots(); updateHUD();
}
