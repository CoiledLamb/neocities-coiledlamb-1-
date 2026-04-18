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

   v0.0.7.18 changes:
     - All hardcoded `15` replaced with C.BOOT_PRICE (handoff bug 7)
     - buyBoots() guards against full meter (bug list player feedback)
     - checkAutobuy: clip-equip ladder reordered. Clip now fires
       regardless of autobuy (failsafe). Sandalweed sits below clip.

   v0.0.7.19 (commit 2a): sandalBadge tooltip swapped from `title`
     attribute to `data-tooltip` + `aria-label`. The CSS custom
     tooltip now reads from data-tooltip; aria-label preserves
     screen-reader behavior. Fixes the duplicate-tooltip bug
     (browser was rendering native `title` overlay alongside the
     custom CSS one).
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
    S.sandalweedCount--; S.bootDurability = S.upgrades.sandalEfficiency ? 50 : 30; S.usingMakeshift = true;
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
  // v0.0.9.5.4 — idle-first: auto-refill gated on autobuyBoots. If the
  // player already opted into autobuy (same toggle that buys new boots
  // when durability hits the floor), extend that consent to cover clip
  // refills at depot. No click, no prompt. Autobuy off → silent skip;
  // player who wants to hoard scrip doesn't get ambushed with a log
  // button mid-route. Re-affording the cost post-load re-triggers the
  // auto-refill at the next depot arrival naturally.
  if (!S.autobuyBoots) return;
  const cost = (S.bootClipMax - S.bootClipCount) * C.BOOT_PRICE;
  if (S.scrip < cost) return;
  S.scrip -= cost;
  S.bootClipCount = S.bootClipMax;
  addLog(`autobuy: boot clip refilled (${cost}\u00a2)`);
  renderBoots();
  updateHUD();
}

export function toggleAutobuy() {
  S.autobuyBoots = !S.autobuyBoots;
  renderBoots();
}

export function toggleBootsGear() {
  if (!els.bootsGearInline || !els.bootsGearBtn) return;
  const isOpen = els.bootsGearInline.hasAttribute('hidden');
  if (isOpen) els.bootsGearInline.removeAttribute('hidden');
  else els.bootsGearInline.setAttribute('hidden', '');
  els.bootsGearBtn.classList.toggle('on', isOpen);
  els.bootsGearBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

export function toggleTieDown() {
  if (S.tieDownActive) return;
  S.tieDownActive = true;
  if (els.tieDownBtn) { els.tieDownBtn.textContent='tie-down: on'; els.tieDownBtn.classList.add('on'); }
  addLog('cargo <span class="log-hi">tied down</span> \u2014 next stumble negated');
}

// renderBoots is exported for packages.js (sandalweed harvest)
// and called by main's tick + init.
export function renderBoots() {
  const d = Math.round(S.bootDurability);
  if (els.bootsVal) els.bootsVal.textContent = d+'%';
  if (els.bootsBar) { els.bootsBar.style.width = d+'%'; els.bootsBar.className = 'boots-bar-fill'+(d>50?'':d>25?' worn':' bad'); }

  if (els.bootsGearInline) {
    const canBuy = S.scrip >= C.BOOT_PRICE && S.bootDurability < 100;
    const popKey = `${S.bootClipMax}|${S.bootClipCount}|${canBuy ? 'o' : 'x'}|${S.autobuyBoots ? 'on' : 'off'}`;
    if (popKey !== S._transient.lastGearPopKey) {
      S._transient.lastGearPopKey = popKey;
      const clipLine = S.bootClipMax > 0
        ? `<span class="gear-line">clip: <span class="gear-val">${S.bootClipCount}/${S.bootClipMax}</span></span>`
        : '';
      const buyDisabled = canBuy ? '' : 'disabled';
      const autobuyOn = S.autobuyBoots ? ' on' : '';
      const autobuyTxt = S.autobuyBoots ? 'autobuy: on' : 'autobuy: off';
      els.bootsGearInline.innerHTML =
        clipLine +
        `<button class="boots-auto" id="buyBootsBtn" ${buyDisabled}>buy boots (${C.BOOT_PRICE}\u00a2)</button>` +
        `<button class="boots-auto${autobuyOn}" id="autobuyBtn">${autobuyTxt}</button>`;
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
      // v0.0.7.19: data-tooltip drives the custom CSS overlay; aria-label
      // preserves screen-reader behavior. No `title` attribute = no
      // duplicate browser-native tooltip.
      const tip =
        'sandalweed: ' + S.sandalweedCount + '/' + cap +
        '\nmakeshift footwear' +
        '\nauto-equipped when boots fail (after clip)' +
        (atCap ? '\n[hoard full \u2014 leaving plants standing]' : '');
      sandalBadge.setAttribute('data-tooltip', tip);
      sandalBadge.setAttribute('aria-label', tip);
      sandalBadge.removeAttribute('title');
      sandalBadge.style.display = 'inline';
    }
  } else if (sandalBadge) {
    sandalBadge.style.display = 'none';
  }
}
