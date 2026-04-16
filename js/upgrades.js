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

import { S } from './state.js';
import { UPGRADE_DEFS } from './data/upgrades.js';
import { addLog } from './render/log.js';
import { updateHUD, renderCargoSlots } from './render/hud.js';
import * as Boots from './boots.js';

const els = S._transient.els;

// v0.0.7.32 — cache the structural state so renderUpgrades doesn't
// rebuild innerHTML every tick. Before: updateHUD → renderUpgrades
// called per tick destroyed hovered .upg-btn mid-animation, restarting
// the oil-border keyframe from 0% and producing the "flicker." Now the
// list rebuilds only when a purchased / reqMet / canAfford flag flips.
let lastUpgKey = null;

export function renderUpgrades() {
  if (!els.upgradesEl) return;

  // v0.0.8.6: trust-reward upgrades are granted by NPCs, not purchased.
  // Filter them out of the scrip menu entirely.
  const scripDefs = UPGRADE_DEFS.filter(def => !def.trustReward);

  const key = scripDefs.map(def => {
    const o = S.upgrades[def.id] ? 'o' : 'x';
    const r = !def.requires || S.upgrades[def.requires] ? 'r' : '-';
    const a = S.scrip >= def.cost ? 'a' : 'n';
    return o + r + a;
  }).join('|');
  if (key === lastUpgKey) return;
  lastUpgKey = key;

  els.upgradesEl.innerHTML = '';
  scripDefs.forEach(def => {
    const purchased = S.upgrades[def.id];
    const reqMet    = !def.requires || S.upgrades[def.requires];
    const canAfford = S.scrip >= def.cost;
    const row = document.createElement('div'); row.className = 'upg-item';
    const nameEl = document.createElement('span'); nameEl.className = 'upg-name';
    nameEl.innerHTML = `${def.name}<small>${def.desc}</small>`;
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
  S.scrip -= def.cost; S.upgrades[id] = true; def.apply();
  addLog(`<span class="log-hi">${def.name}</span> purchased`);
  renderUpgrades(); renderCargoSlots(true); Boots.renderBoots(); updateHUD();
}
