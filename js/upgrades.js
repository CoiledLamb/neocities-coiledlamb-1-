/* upgrades.js — extracted commit 15 (v0.0.7.15)

   renderUpgrades + buyUpgrade. UPGRADE_DEFS data has lived in
   ./data/upgrades.js since commit 4; this module is the
   behavior half (paint the panel, spend scrip, fire .apply()).

   Imports from main.js (addLog, updateHUD, renderCargoSlots)
   and Boots.renderBoots are circular-by-file but not by
   initialization — every cross-call happens inside a function
   body, never at module load. Same pattern as every other
   extracted sub-module since commit 5.

   Imports:
     S — game state singleton (state.js)
     UPGRADE_DEFS — upgrade list w/ apply closures (data/upgrades.js)
     addLog, updateHUD, renderCargoSlots — main
     Boots.renderBoots — boots (namespace import)

   Local aliases:
     els — live ref into S._transient.els (never reassign).
*/
'use strict';

import { S } from './state.js';
import { UPGRADE_DEFS } from './data/upgrades.js';
import { addLog, updateHUD, renderCargoSlots } from './main.js';
import * as Boots from './boots.js';

const els = S._transient.els;

export function renderUpgrades() {
  if (!els.upgradesEl) return;
  els.upgradesEl.innerHTML = '';
  UPGRADE_DEFS.forEach(def => {
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
