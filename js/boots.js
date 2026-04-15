/* ==============================================
   THE LONG HAUL — boots, clip, sandalweed, tie-down

   Boot lifecycle (`bootDurability` 0–100):
     - Drains every walking/carrying tick (BOOT_DRAIN, modulated
       by upgrades + makeshift penalty in main's tick loop).
     - At 0, checkAutobuy() runs the fallback ladder:
         1. clip > 0 → consume clip (failsafe, fires regardless of autobuy)
         2. otherwise, if sandalweed in stash → lash on makeshift (+30%, 1.30x drain)
         3. otherwise, if autobuy on + scrip ≥ BOOT_PRICE → buy
     - Manual buyBoots() restores to 100% if you've got BOOT_PRICE
       AND boots aren't already at 100 (v0.0.7.18 — was happily
       charging full price for nothing).

   sandalCap() returns SANDAL_CAP_BASE (5) or SANDAL_CAP_UPGRADED
     (25) with sandalSatchel; packages.js imports this for the
     harvest-cap check in scanForPickup.

   Clip refill prompts at depots (A/B/H) via refillBootClip(),
     fires a log-line button → confirmClipRefill() consumes scrip.

   v0.0.7.18 changes:
     - All hardcoded `15` replaced with C.BOOT_PRICE (handoff bug 7)
     - buyBoots() guards against full meter (bug list player feedback)
     - checkAutobuy: clip-equip ladder reordered. Clip now fires
       regardless of autobuy (it's a failsafe), only the *purchase*
       requires autobuy intent. Sandalweed is now a tier below clip
       in the priority order — clip is "real spare boots", sandalweed
       is the makeshift fallback when nothing else is left.
   ============================================== */
'use strict';

import { S } from './state.js';
import * as C from './constants.js';
import { addLog } from './render/log.js';
import { updateHUD } from './render/hud.js';

// Local alias — live reference into S._transient. Never reassign.
const els = S._transient.els;

// sandalCap is exported for packages.js (scanForPickup harvest gate).
export function sandalCap() {
  return S.upgrades.sandalSatchel ? C.SANDAL_CAP_UPGRADED : C.SANDAL_CAP_BASE;
}

export function buyBoots() {
  if (S.bootDurability >= 100) return;
  if (S.scrip < C.BOOT_PRICE) return;
  S.scrip -= C.BOOT_PRICE; S.bootDurability = 100; S.usingMakeshift = false;
  addLog(`purchased new <span class="log-hi">boots</span> (${C.BOOT_PRICE}\u00a2)`);
  renderBoots(); updateHUD();
}

export function checkAutobuy() {
  // Failsafe ladder when boots hit 0 — runs regardless of autobuy setting.
  // Clip first (real spare pair), sandalweed second (makeshift).
  if (S.bootDurability <= 0 && S.bootClipCount > 0) {
    S.bootClipCount--; S.bootDurability = 100; S.usingMakeshift = false;
    addLog('<span class="log-hi">boot clip</span>: spare pair auto-equipped');
    renderBoots(); return;
  }
  if (S.bootDurability <= 0 && S.sandalweedCount > 0) {
    S.sandalweedCount--; S.bootDurability = 30; S.usingMakeshift = true;
    addLog('<span class="log-wn">boots failed</span> \u2014 lashed on a <span class="log-hi">sandalweed</span> (' + S.sandalweedCount + '/' + sandalCap() + ' left)');
    renderBoots(); return;
  }
  // Auto-PURCHASE requires autobuy intent (it costs scrip, player needs to opt in).
  if (!S.autobuyBoots) return;
  if (S.bootDurability <= 20 && S.scrip >= C.BOOT_PRICE) {
    S.scrip -= C.BOOT_PRICE; S.bootDurability = 100; S.usingMakeshift = false;
    addLog(`autobuy: new <span class="log-hi">boots</span> purchased (${C.BOOT_PRICE}\u00a2)`);
    updateHUD();
  }
}

export function refillBootClip(nodeId) {
  if (S.bootClipMax === 0 || !['A','B','H'].includes(nodeId)) return;
  if (S.bootClipCount >= S.bootClipMax) return;
  if (S._transient.clipRefillPending) return;
  const cost = (S.bootClipMax - S.bootClipCount) * C.BOOT_PRICE;
  if (S.scrip < cost) return;
  const settle = S.settlements[nodeId];
  S._transient.clipRefillPending = { nodeId, cost };
  addLog(`<span class="log-wn">boot clip low</span> at <span class="log-hi">${settle?settle.label:nodeId}</span> \u2014 refill for ${cost}\u00a2? <button class="log-btn" id="clipRefillBtn">refill</button>`);
  setTimeout(() => {
    const btn = document.getElementById('clipRefillBtn');
    if (btn) btn.addEventListener('click', confirmClipRefill);
  }, 0);
}

function confirmClipRefill() {
  if (!S._transient.clipRefillPending) return;
  const { cost } = S._transient.clipRefillPending;
  S._transient.clipRefillPending = null;
  if (S.scrip < cost) { addLog('<span class="log-wn">not enough scrip</span>'); return; }
  S.scrip -= cost; S.bootClipCount = S.bootClipMax;
  addLog(`boot clip refilled (${cost}\u00a2)`);
  renderBoots(); updateHUD();
  const btn = document.getElementById('clipRefillBtn');
  if (btn) btn.closest('.log-line').remove();
}

export function toggleAutobuy() {
  S.autobuyBoots = !S.autobuyBoots;
  renderBoots();
}

export function toggleBootsGear() {
  if (!els.bootsGearPop) return;
  const isOpen = els.bootsGearPop.classList.toggle('open');
  if (els.bootsGearBtn) els.bootsGearBtn.classList.toggle('on', isOpen);
  if (isOpen) {
    setTimeout(() => {
      S._transient.gearPopHandler = (ev) => {
        if (!els.bootsGearPop.contains(ev.target) && ev.target !== els.bootsGearBtn) {
          els.bootsGearPop.classList.remove('open');
          if (els.bootsGearBtn) els.bootsGearBtn.classList.remove('on');
          document.removeEventListener('click', S._transient.gearPopHandler);
          S._transient.gearPopHandler = null;
        }
      };
      document.addEventListener('click', S._transient.gearPopHandler);
    }, 0);
  } else if (S._transient.gearPopHandler) {
    document.removeEventListener('click', S._transient.gearPopHandler);
    S._transient.gearPopHandler = null;
  }
}

export function toggleTieDown() {
  S.tieDownActive = !S.tieDownActive;
  if (els.tieDownBtn) { els.tieDownBtn.textContent='tie-down: '+(S.tieDownActive?'on':'off'); els.tieDownBtn.classList.toggle('on',S.tieDownActive); }
  if (S.tieDownActive) addLog('cargo <span class="log-hi">tied down</span> \u2014 next stumble negated');
}

// renderBoots is exported for packages.js (sandalweed harvest)
// and called by main's tick + init.
export function renderBoots() {
  const d = Math.round(S.bootDurability);
  if (els.bootsVal) els.bootsVal.textContent = d+'%';
  if (els.bootsBar) { els.bootsBar.style.width = d+'%'; els.bootsBar.className = 'boots-bar-fill'+(d>50?'':d>25?' worn':' bad'); }

  if (els.bootsGearPop) {
    const canBuy = S.scrip >= C.BOOT_PRICE && S.bootDurability < 100;
    const popKey = `${S.bootClipMax}|${S.bootClipCount}|${canBuy ? 'o' : 'x'}|${S.autobuyBoots ? 'on' : 'off'}`;
    if (popKey !== S._transient.lastGearPopKey) {
      S._transient.lastGearPopKey = popKey;
      const clipLine = S.bootClipMax > 0
        ? `<div class="gear-line">clip: <span class="gear-val">${S.bootClipCount}/${S.bootClipMax}</span></div>`
        : '';
      const buyDisabled = canBuy ? '' : 'disabled';
      const autobuyOn = S.autobuyBoots ? ' on' : '';
      const autobuyTxt = S.autobuyBoots ? 'autobuy: on' : 'autobuy: off';
      els.bootsGearPop.innerHTML =
        clipLine +
        `<button class="boots-auto gear-btn" id="buyBootsBtn" ${buyDisabled}>buy boots (${C.BOOT_PRICE}\u00a2)</button>` +
        `<button class="boots-auto gear-btn${autobuyOn}" id="autobuyBtn">${autobuyTxt}</button>`;
      const newBuy = document.getElementById('buyBootsBtn');
      const newAuto = document.getElementById('autobuyBtn');
      if (newBuy) newBuy.addEventListener('click', buyBoots);
      if (newAuto) newAuto.addEventListener('click', toggleAutobuy);
      els.buyBootsBtn = newBuy;
      els.autobuyBtn  = newAuto;
    }
  }

  let sandalBadge = document.getElementById('sandalBadge');
  if (S.sandalweedCount > 0 || S.upgrades.sandalSatchel) {
    if (!sandalBadge && els.bootsGearBtn && els.bootsGearBtn.parentNode) {
      sandalBadge = document.createElement('span');
      sandalBadge.id = 'sandalBadge';
      sandalBadge.className = 'clip-badge sandal-badge has-tooltip';
      els.bootsGearBtn.parentNode.insertBefore(sandalBadge, els.bootsGearBtn.nextSibling);
    }
    if (sandalBadge) {
      const cap = sandalCap();
      const atCap = S.sandalweedCount >= cap;
      sandalBadge.textContent = '* ' + S.sandalweedCount + '/' + cap;
      sandalBadge.classList.toggle('at-cap', atCap);
      sandalBadge.setAttribute('title',
        'sandalweed: ' + S.sandalweedCount + '/' + cap +
        '\nmakeshift footwear' +
        '\nauto-equipped when boots fail (after clip)' +
        (atCap ? '\n[hoard full \u2014 leaving plants standing]' : '')
      );
      sandalBadge.style.display = 'inline';
    }
  } else if (sandalBadge) {
    sandalBadge.style.display = 'none';
  }
}
