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

import { S } from './state.js?v=096-10-20';
import * as C from './constants.js?v=096-10-20';
import { addLog } from './render/log.js?v=096-10-20';
import { updateHUD } from './render/hud.js?v=096-10-20';
import { showRichTooltip, hideRichTooltip, activeRichTooltipId } from './render/rich-tooltip.js?v=096-10-20';
import { emit as tEmit, accum as tAccum } from './telemetry.js?v=096-10-20';

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
  tAccum('scrip.spent', 'boots_manual', C.BOOT_PRICE);
  addLog(`purchased new <span class="log-hi">boots</span> (${C.BOOT_PRICE}\u00a2)`);
  renderBoots(); updateHUD();
}

export function checkAutobuy() {
  // Failsafe ladder when boots hit 0 — runs regardless of autobuy setting.
  // Clip first (real spare pair), sandalweed second (makeshift).
  // v0.0.9.6.9.5 — edge-triggered so the counter reflects distinct
  // wear-out events, not per-tick ticks-at-zero. _transient field
  // resets implicitly across sim snapshot/restore (excluded from clone).
  // v0.0.9.6.9.8 — justWentZero captures the edge for the bootless
  // passthrough emit below (same edge semantics as worn_out).
  const justWentZero = S.bootDurability <= 0 && !S._transient.bootsWasZero;
  if (S.bootDurability <= 0) {
    if (justWentZero) {
      tEmit('boots.worn_out', { status: S.status });
      S._transient.bootsWasZero = true;
    }
  } else if (S._transient.bootsWasZero) {
    S._transient.bootsWasZero = false;
  }
  // v0.0.9.6.9.8 — fallback-path telemetry. Each zero-transition
  // (boots.worn_out above) resolves into exactly one of: clip, sandalweed,
  // autobuy_emergency (at 0%), or bootless (nothing available). With
  // autobuy firing preventively at <=20%, autobuy_preventive is the
  // "no failure happened" path. Sum relationship for sim analysis:
  //   boots.worn_out ≈ clip_consumed + sandalweed_lashed
  //                    + autobuy_emergency + bootless_passthrough
  if (S.bootDurability <= 0 && S.bootClipCount > 0) {
    S.bootClipCount--; S.bootDurability = 100; S.usingMakeshift = false;
    tEmit('boots.clip_consumed', { clipLeft: S.bootClipCount });
    addLog('<span class="log-hi">boot clip</span>: spare pair auto-equipped');
    renderBoots(); return;
  }
  if (S.bootDurability <= 0 && S.sandalweedCount > 0) {
    S.sandalweedCount--; S.bootDurability = S.upgrades.sandalEfficiency ? 50 : 30; S.usingMakeshift = true;
    tEmit('boots.sandalweed_lashed', { sandalweedLeft: S.sandalweedCount, repairTo: S.bootDurability });
    addLog('<span class="log-wn">boots failed</span> \u2014 lashed on a <span class="log-hi">sandalweed</span> (' + S.sandalweedCount + '/' + sandalCap() + ' left)');
    renderBoots(); return;
  }
  // Auto-PURCHASE requires autobuy intent (it costs scrip, player needs to opt in).
  if (!S.autobuyBoots) {
    // Hit 0 with no clip, no sandalweed, autobuy off — player is walking bootless.
    // Edge-only (justWentZero) so the counter matches worn_out semantics.
    if (justWentZero) tEmit('boots.bootless_passthrough', { reason: 'autobuy_off' });
    return;
  }
  if (S.bootDurability <= 20 && S.scrip >= C.BOOT_PRICE) {
    const wasEmergency = S.bootDurability <= 0;
    S.scrip -= C.BOOT_PRICE; S.bootDurability = 100; S.usingMakeshift = false;
    tAccum('scrip.spent', 'boots_autobuy', C.BOOT_PRICE);
    tEmit(wasEmergency ? 'boots.autobuy_emergency' : 'boots.autobuy_preventive', { scripLeft: S.scrip });
    addLog(`autobuy: new <span class="log-hi">boots</span> purchased (${C.BOOT_PRICE}\u00a2)`);
    updateHUD();
  } else if (justWentZero) {
    // Couldn't buy at zero (no scrip). Passthrough = bootless. Edge-only.
    tEmit('boots.bootless_passthrough', { reason: 'no_scrip', scrip: S.scrip });
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
  tAccum('scrip.spent', 'boots_clip_refill', cost);
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
      // v0.0.9.6.9.30 — has-tooltip class dropped; tooltip now
      // routed through the unified rich-tooltip system on hover
      // so it body-portals out of #gameShell's overflow:hidden
      // (was clipping at the right shell edge).
      sandalBadge.className = 'clip-badge sandal-badge';
      els.bootsGearBtn.parentNode.insertBefore(sandalBadge, els.bootsGearBtn.nextSibling);
    }
    if (sandalBadge) {
      const cap = sandalCap();
      const atCap = S.sandalweedCount >= cap;
      sandalBadge.textContent = '* ' + S.sandalweedCount + '/' + cap;
      sandalBadge.classList.toggle('at-cap', atCap);
      // aria-label still set for screen readers; data-tooltip kept as
      // the live source the hover handler reads (re-set every render).
      const tip =
        'sandalweed: ' + S.sandalweedCount + '/' + cap +
        '\nmakeshift footwear' +
        '\nauto-equipped when boots fail (after clip)' +
        (atCap ? '\n[hoard full \u2014 leaving plants standing]' : '');
      sandalBadge.setAttribute('data-tooltip', tip);
      sandalBadge.setAttribute('aria-label', tip);
      sandalBadge.removeAttribute('title');
      sandalBadge.style.display = 'inline';
      // Bind hover handlers exactly once per badge instance.
      // Builds HTML fresh on each hover so the count is always
      // current; first line lands cyan via .rich-tip-head.
      if (!sandalBadge.__tipBound) {
        sandalBadge.__tipBound = true;
        sandalBadge.addEventListener('mouseenter', () => {
          const c    = S.sandalweedCount;
          const cap2 = sandalCap();
          const full = c >= cap2;
          const html =
            `<div class="rich-tip-head">sandalweed: ${c}/${cap2}</div>` +
            'makeshift footwear<br>' +
            'auto-equipped when boots fail (after clip)' +
            (full ? '<br>[hoard full \u2014 leaving plants standing]' : '');
          showRichTooltip(sandalBadge, html, { id: 'sandal', placement: 'above' });
        });
        sandalBadge.addEventListener('mouseleave', () => {
          if (activeRichTooltipId() === 'sandal') hideRichTooltip();
        });
      }
    }
  } else if (sandalBadge) {
    sandalBadge.style.display = 'none';
  }
}
