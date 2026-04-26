/* ==============================================
   THE LONG HAUL — lost cargo recovery loop

   Polls a known peer's lost-cargo list every
   RECOVERY_POLL_INTERVAL ticks (~30s) and spawns a
   recovery package somewhere on the world map. Soft
   capped at RECOVERY_SOFT_CAP (3) active recoveries.

   Spawned recovery cargo is visually identical to local
   lost cargo (pink), but pays 1.5× scrip and is one-shot —
   no respawn after delivery. The carrier badge in the
   porter strip (#recoveryBadge) shows the active count.

   v0.0.7.18: pickRandom now imported from util.js.
   v0.0.7.19: recoveryBadge tooltip swapped from `title` to
     `data-tooltip` + `aria-label` (matches sandal badge fix
     in boots.js — no more duplicate browser-native overlay).
   ============================================== */
'use strict';

import { S } from './state.js?v=096-10-24';
import * as C from './constants.js?v=096-10-24';
import { fetchLostFromPeer } from './multiplayer.js?v=096-10-24';
import { pickRandom } from './util.js?v=096-10-24';
import { addLog } from './render/log.js?v=096-10-24';
import { showRichTooltip, hideRichTooltip, activeRichTooltipId } from './render/rich-tooltip.js?v=096-10-24';

const els = S._transient.els;
const worldCells = S._transient.worldCells;

export async function tickRecoveryAttempt() {
  if (S.ticks < S.nextRecoveryAttemptTick) return;
  S.nextRecoveryAttemptTick = S.ticks + C.RECOVERY_POLL_INTERVAL;

  if (S.activeRecoveryCount >= C.RECOVERY_SOFT_CAP) return;
  if (S.ticks - S.lastRecoverySpawnTick < C.RECOVERY_POLL_INTERVAL) return;
  if (S.knownPeers.length === 0) return;

  const peerId = pickRandom(S.knownPeers);
  if (!peerId) return;

  const lostList = await fetchLostFromPeer(peerId);
  if (!lostList || lostList.length === 0) return;

  const lostPkg = pickRandom(lostList);
  if (!lostPkg) return;

  spawnRecoveryCargo(lostPkg, peerId);
}

export function spawnRecoveryCargo(lostPkg, fromPorterId) {
  const edgeIdx = Math.floor(Math.random() * S.edges.length);
  const startCell = edgeIdx * C.CELLS_PER_EDGE;
  const endCell = startCell + C.CELLS_PER_EDGE;

  const candidates = [];
  for (let i = startCell + 10; i < endCell - 10; i++) {
    const c = worldCells[i];
    if (c && !c.pkg && !c.sandal && i % 8 === 0) {
      candidates.push(i);
    }
  }
  if (candidates.length === 0) return;

  const ci = pickRandom(candidates);
  const destId = S.edges[edgeIdx][1];

  const pkg = {
    size:  lostPkg.size  || 's',
    label: lostPkg.label || 'lost cargo',
    kg:    lostPkg.kg    || 1,
    slots: lostPkg.slots || 1,
    scrip: Math.floor((lostPkg.scrip || 14) * C.RECOVERY_BONUS_MULT),
    isLost: true,
    isRecovery: true,
    recoveryFromPorter: fromPorterId,
    destId,
    picked: false,
    respawnIn: 0,
  };
  worldCells[ci].pkg = pkg;
  worldCells[ci].isRecovery = true;

  S.activeRecoveryCount++;
  S.lastRecoverySpawnTick = S.ticks;
  updatePorterStripBadges();
  addLog(`<span class="log-wn">recovery cargo</span> dropped into the world`);
}

export function updatePorterStripBadges() {
  if (!els.porterStrip) return;
  let badge = document.getElementById('recoveryBadge');
  const n = S.activeRecoveryCount;
  if (n > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'recoveryBadge';
      // v0.0.9.6.9.30 — has-tooltip class dropped; tooltip now
      // routed through the unified rich-tooltip system on hover.
      badge.className = 'tlh-porter-recovery';
      const hint = els.porterStrip.querySelector('.tlh-porter-hint');
      if (hint) els.porterStrip.insertBefore(badge, hint);
      else      els.porterStrip.appendChild(badge);
    }
    badge.textContent = 'recovery \u00d7' + n;
    // aria-label preserved for screen readers; data-tooltip is the
    // live source the hover handler reads.
    const tip = n + ' recovery cargo in the world\nfrom other porters\ndeliver for 1.5\u00d7 scrip';
    badge.setAttribute('data-tooltip', tip);
    badge.setAttribute('aria-label', tip);
    badge.removeAttribute('title');
    badge.style.display = 'inline';
    if (!badge.__tipBound) {
      badge.__tipBound = true;
      // First line lands cyan via .rich-tip-head; built fresh on
      // each hover so the count is always current.
      badge.addEventListener('mouseenter', () => {
        const cnt = S.activeRecoveryCount;
        const html =
          `<div class="rich-tip-head">${cnt} recovery cargo in the world</div>` +
          'from other porters<br>' +
          'deliver for 1.5\u00d7 scrip';
        showRichTooltip(badge, html, { id: 'recovery', placement: 'above' });
      });
      badge.addEventListener('mouseleave', () => {
        if (activeRichTooltipId() === 'recovery') hideRichTooltip();
      });
    }
  } else if (badge) {
    badge.style.display = 'none';
  }
}
