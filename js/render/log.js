/* render/log.js — extracted commit 16 (v0.0.7.16)

   addLog (exported) + tt (private timestamp helper).

   Most-imported render module after this commit: persistence,
   multiplayer, recovery, trust, boots, stamina, packages,
   upgrades, trip all import addLog from here.

   Imports:
     S — game state (state.js)
     C — for TICK_MS in tt() (constants.js)

   Local aliases:
     els — live ref into S._transient.els (never reassign).
*/
'use strict';

import { S } from '../state.js';
import * as C from '../constants.js';

const els = S._transient.els;

function tt() {
  const totalSecs = Math.floor(S.ticks * C.TICK_MS / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

export function addLog(msg) {
  if (!els.logEl) return;
  const el = document.createElement('span'); el.className = 'log-line';
  el.innerHTML = `<span class="log-ts">[${tt()}]</span> ${msg}`;
  els.logEl.insertBefore(el, els.logEl.firstChild);
  const all = els.logEl.querySelectorAll('.log-line');
  if (all.length > 14) all[all.length-1].remove();
}
