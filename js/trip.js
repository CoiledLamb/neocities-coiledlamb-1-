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
     Drop check fires BEFORE tie-down. Tie-down protects against
     damage fallback only, not drops. Normal pkgs vanish locally
     (log only). Lost pkgs go through postLostDrop() so other
     porters can recover them.

   v0.0.7.19 (commit 2a):
     - accumulateDist() math fix. Old behavior: at every edge
       transition (dotT 1→0, edgeIdx+1), the delta was a small
       negative, the rollover correction added a full ring length
       (~25.2km), and then the > 2*KM_PER_EDGE cap discarded the
       result as 0. Net: full lap of km lost per wrap. Fix: only
       add ring length when the negative is LARGE (< -KM_PER_EDGE),
       meaning real wrap or load skew. Edge crossings produce small
       negatives that we trust as the partial-edge step.
     - Damage log now names the package and shows the actual scrip
       delta instead of a generic 'reduced payout'.

   v0.0.7.19 (commit 2b):
     - accumulateDist() rounding-stomp fix. Old code rounded
       S.distKm to 1 decimal on every write. Per-tick delta is
       ~0.025km, so (S.distKm + delta) = 0.025 → Math.round(0.25)
       = 0 → stored as 0. Accumulator was overwriting itself with
       zero every tick because the increment was below the rounding
       resolution. Fix: store full precision; HUD already rounds
       for display at render/hud.js:32. Commit 2a's edge-wrap fix
       was necessary but not sufficient — this was the real ceiling.
     - maybeTrip() tie-down option B: tie-down now absorbs drops
       as well as damage. If tie-down is active and cargo is held,
       the trip consumes the tie-down and skips both the drop roll
       and the damage fallback. Universal absorption regardless of
       lost/normal pkg, matching the constants.js intent comment.
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
// DISTANCE ACCUMULATOR (v0.0.7 commit 6, math fixed v0.0.7.19)
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
  // Only add ring length when delta is LARGE negative (true wrap or load
  // skew). Edge transitions produce small negatives in (-KM_PER_EDGE, 0)
  // which are the partial-edge step we want to count.
  if (delta < -C.KM_PER_EDGE) {
    delta += S.edges.length * C.KM_PER_EDGE;
  }
  // Safety cap: anything still negative or absurdly large is load skew.
  if (delta < 0 || delta > C.KM_PER_EDGE * 2) delta = 0;
  // Store full precision. HUD rounds for display at render/hud.js:32.
  // Old behavior rounded-and-stored per tick, which truncated the
  // ~0.025km/tick delta to zero (see header comment for 2b).
  S.distKm += delta;
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
  // v0.0.7.21 — terrain scanner buff. When active, multiplies trip
  // chance by S.scanner.buffMagnitude (set per ping in js/scanner.js).
  if (S.scanner.buffActive) chance *= S.scanner.buffMagnitude;
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

  // v0.0.7.19 commit 2b — tie-down option B.
  // Tie-down now absorbs drops AND damage. If armed with cargo, the
  // trip consumes it and skips the drop roll + damage fallback entirely.
  // Stumble (boot damage + tripped status) still fires.
  if (S.tieDownActive && S.inventory.length > 0) {
    S.tieDownActive=false;
    if (els.tieDownBtn) { els.tieDownBtn.textContent='tie-down: off'; els.tieDownBtn.classList.remove('on'); }
    addLog('<span class="log-wn">tripped!</span> tie-down held \u2014 <span class="log-ok">cargo protected</span>. re-arm to use again');
    S.bootDurability=Math.max(0,S.bootDurability-5);
    S.status='tripped'; S.tripTimer=6;
    if (els.courierAt) { els.courierAt.className='tlh-at trip'; els.courierAt.style.animation='trip 0.4s ease 3'; }
    return;
  }

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

  S.status='tripped'; S.tripTimer=6;
  S.bootDurability=Math.max(0,S.bootDurability-5);

  if (!dropped) {
    if (S.inventory.length>0) {
      const target = S.inventory[0];
      const oldScrip = target.scrip;
      target.scrip = Math.max(1, Math.floor(oldScrip * 0.75));
      const lost = oldScrip - target.scrip;
      addLog(`<span class="log-wn">tripped!</span> <span class="log-hi">${target.label}</span> damaged \u2014 payout <span class="log-wn">-${lost}\u00a2</span>`);
    }
    else addLog('<span class="log-wn">tripped on loose rubble!</span>');
  }
  if (els.courierAt) { els.courierAt.className='tlh-at trip'; els.courierAt.style.animation='trip 0.4s ease 3'; }
}
