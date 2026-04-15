/* render/hud.js — extracted commit 16 (v0.0.7.16)

   updateHUD, renderCargoSlots, renderCourierStack. Painted
   from S.delivered/scrip/distKm/status/inventory.

   Circular-by-file with upgrades.js (this calls Upg.renderUpgrades
   from the bottom of updateHUD; upgrades.js imports updateHUD +
   renderCargoSlots from here for buyUpgrade). Fine — every cross-
   call is inside a function body, not at module load.

   Imports:
     S — game state (state.js)
     STATUS_COLORS — visual map (data/glyphs.js)
     getDisplayLabel — identification.js (for cargo tooltips)
     Upg.renderUpgrades — upgrades.js (namespace import)

   Local aliases:
     els — live ref into S._transient.els (never reassign).
*/
'use strict';

import { S } from '../state.js';
import { STATUS_COLORS } from '../data/glyphs.js';
import { getDisplayLabel } from '../identification.js';
import { effectiveMaxSlots } from '../packages.js';
import * as Upg from '../upgrades.js';

const els = S._transient.els;

export function updateHUD() {
  els.delivered.textContent = S.delivered;
  els.scrip.textContent     = S.scrip + '\u00a2';
  els.walked.textContent    = (Math.round(S.distKm * 10) / 10) + 'km';
  els.status.textContent    = S.status;
  els.status.style.color    = STATUS_COLORS[S.status] || '#b1c9c3';
  Upg.renderUpgrades();
}

function cargoKey() {
  // v0.0.7.21 — key now includes gun state so slot count / ammo display
  // refresh when gun is purchased / holstered / fired.
  const gunKey = S.stickyGun ? `${S.stickyGun.ammo}/${S.stickyGun.ammoMax}${S.stickyGun.holstered?'h':''}` : '-';
  return S.inventory.map(p => `${p.size}${p.destId}${p.scrip}`).join('|') + '|' + S.maxSlots + '|' + S.usedWeight + '|' + gunKey;
}

export function renderCargoSlots(force) {
  if (!els.cargoSlots) return;
  const key = cargoKey();
  if (!force && key === S._transient.lastCargoKey) return;
  S._transient.lastCargoKey = key;

  els.cargoSlots.innerHTML = '';
  const used = [];
  S.inventory.forEach(pkg => { for (let i=0;i<pkg.slots;i++) used.push(pkg); });
  const effMax = effectiveMaxSlots();
  // v0.0.7.21 — gun-occupied slot. When gun is equipped and not holstered
  // it takes the last slot; render it with a distinct marker.
  const gunSlot = (S.stickyGun && !S.stickyGun.holstered);
  for (let i=0; i<S.maxSlots; i++) {
    const pkg = used[i]||null;
    const d = document.createElement('div');
    // Last slot shows the gun when equipped (if there's a pkg at this index
    // that shouldn't happen — effectiveMaxSlots gate prevents pickup past
    // effMax — but defend anyway).
    const isGunHere = gunSlot && i === effMax && !pkg;
    if (isGunHere) {
      d.className = 'cslot gun';
      d.textContent = '\u26a1'; // lightning bolt — the sticky gun marker
      d.setAttribute('title', `sticky gun\nammo ${S.stickyGun.ammo}/${S.stickyGun.ammoMax}\nrefill at H`);
      d.classList.add('has-tooltip');
    } else {
      d.className   = 'cslot '+(pkg?pkg.size:'e');
      d.textContent = pkg?pkg.size:'';
      if (pkg) {
        const destLabel = getDisplayLabel(pkg.destId);
        const recoveryTag = pkg.isRecovery ? ' [recovery]' : (pkg.isLost ? ' [lost]' : '');
        d.setAttribute('title', `[${pkg.size}] ${pkg.label}${recoveryTag}\n\u2192 ${destLabel}\n${pkg.scrip}\u00a2`);
        d.classList.add('has-tooltip');
      }
    }
    els.cargoSlots.appendChild(d);
  }

  if (els.weightSegs) {
    els.weightSegs.innerHTML = '';
    const loadPct = S.usedWeight / S.maxWeight;
    for (let i = 0; i < S.maxWeight; i++) {
      const pip = document.createElement('div');
      pip.className = i < S.usedWeight
        ? (loadPct <= 0.5 ? 'wseg filled' : loadPct <= 0.8 ? 'wseg heavy' : 'wseg overloaded')
        : 'wseg empty';
      els.weightSegs.appendChild(pip);
    }
  }
}

export function renderCourierStack() {
  if (!els.courierStack) return;
  els.courierStack.innerHTML = S.inventory.length === 0 ? '' :
    S.inventory.map(p => `<span class="courier-pkg${p.isLost?' lost':''}">[${p.size}]</span>`).join('');
}
