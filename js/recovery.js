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

   Imports note (commit 7 / v0.0.7.7):
     Imports addLog from main.js — same circular-import-safe
     pattern as commits 5/6. Will move when log.js extracts.
   ============================================== */
'use strict';

import { S } from './state.js';
import * as C from './constants.js';
import { fetchLostFromPeer } from './multiplayer.js';
import { addLog } from './main.js';

const els = S._transient.els;
const worldCells = S._transient.worldCells;

function pickRandom(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

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
      badge.className = 'tlh-porter-recovery has-tooltip';
      const hint = els.porterStrip.querySelector('.tlh-porter-hint');
      if (hint) els.porterStrip.insertBefore(badge, hint);
      else      els.porterStrip.appendChild(badge);
    }
    badge.textContent = 'recovery \u00d7' + n;
    badge.setAttribute('title', n + ' recovery cargo in the world\nfrom other porters\ndeliver for 1.5\u00d7 scrip');
    badge.style.display = 'inline';
  } else if (badge) {
    badge.style.display = 'none';
  }
}
