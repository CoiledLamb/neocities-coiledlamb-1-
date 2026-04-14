/* ==============================================
   THE LONG HAUL — trip mechanics + distance accumulator

   Functions moved from main.js:
     currentCellIsRisky() — is the courier's current cell on a
                            risky edge (×1.4 trip multiplier)?
     tripChance()         — per-tick probability of a trip,
                            scaled by boots, stamina, upgrades,
                            and risky-cell multiplier.
     catchChance()        — probability of recovering from a
                            triggered trip without consequence.
     maybeTrip()          — the meaty one. Rolls trip + catch,
                            on commitment may drop cargo (lost
                            cargo broadcasts via postLostDrop),
                            consume tie-down, damage cargo,
                            and/or sets S.status='tripped' for
                            6 ticks.
     posKm(edgeIdx, dotT) — internal helper: ring-position in km.
     accumulateDist()     — every walking/carrying tick, computes
                            forward delta since last tick,
                            handles edge rollover, caps absurd
                            jumps (likely a load-skew artifact),
                            adds to S.distKm.

   Drop semantics (v0.0.7 commit 6):
     Drop check fires BEFORE tie-down. Tie-down only protects
     against damage fallback, not drops. Normal pkgs vanish
     locally (log only). Lost pkgs go through postLostDrop()
     so other porters can recover them.
   ============================================== */
'use strict';

import { S } from './state.js';
import * as C from './constants.js';
import { postLostDrop } from './multiplayer.js';
import { staminaSegCount } from './stamina.js';
import { addLog } from './render/log.js';
import { renderCourierStack, renderCargoSlots } from './render/hud.js';

// Local aliases — live references into S._transient. Never reassign these.
const els = S._transient.els;
const worldCells = S._transient.worldCells;

// ============================================================
// DISTANCE ACCUMULATOR (v0.0.7 commit 6)
// ============================================================
function posKm(edgeIdx, dotT) {
  return (edgeIdx + dotT) * C.KM_PER_EDGE;
}

export function accumulateDist() {
  const t = S._transient;
  if (t.lastDistEdgeIdx === null || t.lastDistDotT === null) {
    t.lastDistEdgeIdx = S.edgeIdx;
    t.lastDistDotT    = S.dotT;
    return;
  }
  const prev = posKm(t.lastDistEdgeIdx, t.lastDistDotT);
  const now  = posKm(S.edgeIdx, S.dotT);
  let delta  = now - prev;
  if (delta < 0) {
    delta += S.edges.length * C.KM_PER_EDGE;
  }
  if (delta > C.KM_PER_EDGE * 2) delta = 0;
  S.distKm = Math.round((S.distKm + delta) * 10) / 10;
  t.lastDistEdgeIdx = S.edgeIdx;
  t.lastDistDotT    = S.dotT;
}

// ============================================================
// TRIP / CATCH
// ============================================================
function currentCellIsRisky() {
  const ci = Math.floor((S.edgeIdx*C.CELLS_PER_EDGE)+(S.dotT*C.CELLS_PER_EDGE)) % C.TOTAL_CELLS;
  return worldCells[ci] ? worldCells[ci].risky : false;
}

export function tripChance() {
  const bootFail = (100-S.bootDurability)/100;
  const segsLost = 4-staminaSegCount();
  let chance = C.TRIP_CHANCE_BASE * bootFail * (1+segsLost*0.5);
  if (S.upgrades.steadyFeet) chance *= 0.70;
  if (currentCellIsRisky())  chance *= 1.40;
  return chance;
}

export function catchChance() {
  const bf = S.bootDurability/100, sf = Math.min(S.stamina,S.staminaMax)/S.staminaMax;
  let c = C.CATCH_CHANCE_BASE * ((bf+sf)/2);
  if (S.upgrades.steadyFeet) c += 0.15;
  return Math.min(0.85, c);
}

export function maybeTrip() {
  if (S.status!=='walking' && S.status!=='carrying') return;
  if (Math.random() >= tripChance()) return;
  if (Math.random() < catchChance()) { addLog('stumbled on debris \u2014 <span class="log-ok">caught yourself</span>'); return; }

  let dropped = false;
  if (S.inventory.length > 0) {
    const target = S.inventory[0];
    const chance = target.isLost ? C.TRIP_DROP_CHANCE_LOST : C.TRIP_DROP_CHANCE_NORMAL;
    if (Math.random() < chance) {
      S.usedSlots  -= target.slots;
      S.usedWeight -= target.kg;
      S.inventory.splice(0, 1);
      if (target.isLost) {
        postLostDrop(target);
        addLog(`<span class="log-wn">tripped!</span> <span class="log-hi">${target.label}</span> fell into the world \u2014 someone may find it`);
      } else {
        addLog(`<span class="log-wn">tripped!</span> <span class="log-hi">${target.label}</span> was lost in the scramble`);
      }
      renderCourierStack();
      renderCargoSlots(true);
      dropped = true;
    }
  }

  if (!dropped && S.tieDownActive && S.inventory.length > 0) {
    S.tieDownActive=false;
    if (els.tieDownBtn) { els.tieDownBtn.textContent='tie-down: off'; els.tieDownBtn.classList.remove('on'); }
    addLog('<span class="log-wn">tripped!</span> tie-down held \u2014 <span class="log-ok">cargo protected</span>. re-arm to use again');
    S.bootDurability=Math.max(0,S.bootDurability-5);
    S.status='tripped'; S.tripTimer=6;
    if (els.courierAt) { els.courierAt.className='tlh-at trip'; els.courierAt.style.animation='trip 0.4s ease 3'; }
    return;
  }

  S.status='tripped'; S.tripTimer=6;
  S.bootDurability=Math.max(0,S.bootDurability-5);

  if (!dropped) {
    if (S.inventory.length>0) { S.inventory[0].scrip=Math.max(1,Math.floor(S.inventory[0].scrip*0.75)); addLog('<span class="log-wn">tripped! package damaged \u2014 reduced payout</span>'); }
    else addLog('<span class="log-wn">tripped on loose rubble!</span>');
  }
  if (els.courierAt) { els.courierAt.className='tlh-at trip'; els.courierAt.style.animation='trip 0.4s ease 3'; }
}
