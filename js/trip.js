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
import { emit as tEmit } from './telemetry.js';
import { addLog } from './render/log.js';
import { renderCourierStack, renderCargoSlots } from './render/hud.js';
import { weatherAtCourier } from './weather.js';
import { courierXY, courierTerrain, beginRiverDrift } from './render/route-map.js';
import {
  TERRAIN_TRIP_MULT,
  TERRAIN_HAS_SEVERE,
  SEVERITY_SCALE,
  MOUNTAIN_STALL_TICKS,
  ROCKYHILLS_STALL_TICKS,
  GEAR_FOR_TERRAIN,
  GEAR_TRIP_MITIGATION,
  reduceMultWithTrample,
} from './data/terrain.js';
import { placedGearAt } from './gear.js';
import { trampleAt, isPassCarved } from './trail.js';

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
  // v0.0.7.21 — terrain scanner buff. When active, multiplies trip
  // chance by S.scanner.buffMagnitude (set per ping in js/scanner.js).
  if (S.scanner.buffActive) chance *= S.scanner.buffMagnitude;
  // v0.0.9.6 commit 3 — per-cell terrain trip multiplier replaces the
  // v0.0.9.3 flat SHORTCUT_TRIP_MULT. During interior travel the trip
  // chance scales by what the courier is actually crossing: flat 1.0
  // (cheaper than old flat tax), river 1.2, rockyHills 1.5, mountain
  // 2.0 (severe without gear — commit 4 adds ladder/anchor mitigation).
  // Weather + risky-cell remain ring-only.
  const seg = S._transient.currentSegment;
  const onInterior = seg && (seg.type === 'shortcut' || seg.type === 'river-drift');
  if (onInterior) {
    const terr = courierTerrain();
    const xy   = seg.pathFn(S.dotT);
    let terrMult = TERRAIN_TRIP_MULT[terr] || 1.0;
    // v0.0.9.6 commit 4 — placed gear mitigation
    if (GEAR_FOR_TERRAIN[terr] && placedGearAt(xy.x, xy.y)) {
      terrMult *= GEAR_TRIP_MITIGATION;
    }
    // v0.0.9.6 commit 6 — trample continuous reduction. Composes with
    // gear mitigation: gear first narrows the penalty range, trample
    // paves the remainder toward flat. A mountain with ladder (×1.3)
    // AND trample 0.5 lands at ×1.15 trip risk; with carve (0.85)
    // it's ×1.05. Severity still scales on the reduced mult below.
    terrMult = reduceMultWithTrample(terrMult, trampleAt(xy.x, xy.y));
    chance *= terrMult;
  } else {
    if (currentCellIsRisky()) chance *= 1.40;
    // v0.0.8 — weather multiplier (spatial intensity from weather.js)
    const w = weatherAtCourier();
    if (w.intensity === 'drizzle')       chance *= C.TRIP_MULT_DRIZZLE;
    else if (w.intensity === 'rain')     chance *= C.TRIP_MULT_RAIN;
    else if (w.intensity === 'downpour') chance *= C.TRIP_MULT_DOWNPOUR;
  }
  // v0.0.8 — encumbrance: heavier cargo = more trip risk.
  // Scales linearly from 1.0 (empty) to TRIP_ENCUMBRANCE_MAX_MULT (full weight).
  if (S.maxWeight > 0 && S.usedWeight > 0) {
    const loadRatio = Math.min(1, S.usedWeight / S.maxWeight);
    chance *= 1 + (C.TRIP_ENCUMBRANCE_MAX_MULT - 1) * loadRatio;
  }
  return chance;
}

export function catchChance() {
  const bf = S.bootDurability/100, sf = Math.min(S.stamina,S.staminaMax)/S.staminaMax;
  let c = C.CATCH_CHANCE_BASE * ((bf+sf)/2);
  if (S.upgrades.steadyFeet) c += 0.15;
  return Math.min(0.85, c);
}

// v0.0.9.5.1 — trip-message flavor by context; v0.0.9.6 commit 3 —
// terrain-keyed flavor activated now that interior cells carry types.
// Priority: interior-terrain (mountain/rockyHills/river/desert/plateau)
// > downpour > rain > risky > default. Shortcut stays as a fallback
// for interior flats + clayBed until those want their own voice.
function tripFlavor() {
  const seg = S._transient.currentSegment;
  if (seg && (seg.type === 'shortcut' || seg.type === 'river-drift')) {
    const terr = courierTerrain();
    if (terr === 'mountain')   return 'mountain';
    if (terr === 'rockyHills') return 'rockyHills';
    if (terr === 'river')      return 'river';
    if (terr === 'desert')     return 'desert';
    if (terr === 'plateau')    return 'plateau';
    if (terr === 'clayBed')    return 'clayBed';
    return 'shortcut';
  }
  const w = weatherAtCourier();
  if (w.intensity === 'downpour') return 'downpour';
  if (w.intensity === 'rain' || w.intensity === 'drizzle') return 'rain';
  if (currentCellIsRisky()) return 'risky';
  return 'default';
}

// Message pools, keyed by flavor. {label} and {lost} are substituted.
// v0.0.9.6 commit 3 — terrain flavors added (mountain/rockyHills/river/
// desert/plateau/clayBed). Missing keys fall through to .default via
// the tripMsg helper's pool[flavor] || pool.default pattern.
const TRIP_MSGS = {
  catch: {
    default:    'stumbled on debris \u2014 <span class="log-ok">caught yourself</span>',
    shortcut:   'pitched into untrodden ground \u2014 <span class="log-ok">caught yourself</span>',
    downpour:   'slipped in the deluge \u2014 <span class="log-ok">caught yourself</span>',
    rain:       'slipped on a wet patch \u2014 <span class="log-ok">caught yourself</span>',
    risky:      'footing gave on the loose stone \u2014 <span class="log-ok">caught yourself</span>',
    mountain:   'foot slipped on a steep pitch \u2014 <span class="log-ok">caught the rock above</span>',
    rockyHills: 'ankle rolled on scree \u2014 <span class="log-ok">caught yourself</span>',
    river:      'current yanked you sideways \u2014 <span class="log-ok">braced against a shallow</span>',
    desert:     'foot punched into loose sand \u2014 <span class="log-ok">caught yourself</span>',
    plateau:    'edge of a mesa step shifted \u2014 <span class="log-ok">caught yourself</span>',
    clayBed:    'clay gave underfoot \u2014 <span class="log-ok">caught yourself</span>',
  },
  empty: {
    default:    '<span class="log-wn">tripped on loose rubble!</span>',
    shortcut:   '<span class="log-wn">lost footing in the brush!</span>',
    downpour:   '<span class="log-wn">took a soaking fall!</span>',
    rain:       '<span class="log-wn">slipped in the mud!</span>',
    risky:      '<span class="log-wn">pitched off the edge!</span>',
    mountain:   '<span class="log-wn">pitched off a loose boulder!</span>',
    rockyHills: '<span class="log-wn">skidded on scree!</span>',
    river:      '<span class="log-wn">went down in the shallows!</span>',
    desert:     '<span class="log-wn">sunk a foot in soft sand!</span>',
    plateau:    '<span class="log-wn">stumbled at a mesa step!</span>',
    clayBed:    '<span class="log-wn">slipped on wet clay!</span>',
  },
  dropLost: {
    default:    '<span class="log-wn">tripped!</span> <span class="log-hi">{label}</span> fell into the world \u2014 someone may find it',
    shortcut:   '<span class="log-wn">tripped off-trail!</span> <span class="log-hi">{label}</span> tumbled into the brush \u2014 someone may find it',
    downpour:   '<span class="log-wn">washed out!</span> <span class="log-hi">{label}</span> swept away in the deluge \u2014 someone may find it',
    rain:       '<span class="log-wn">slipped in the wet!</span> <span class="log-hi">{label}</span> slid into the rough \u2014 someone may find it',
    risky:      '<span class="log-wn">stone rolled!</span> <span class="log-hi">{label}</span> spilled out of reach \u2014 someone may find it',
    mountain:   '<span class="log-wn">rockfall!</span> <span class="log-hi">{label}</span> tumbled down a scree field \u2014 someone may find it',
    rockyHills: '<span class="log-wn">skidded!</span> <span class="log-hi">{label}</span> slid between boulders \u2014 someone may find it',
    river:      '<span class="log-wn">current took it!</span> <span class="log-hi">{label}</span> floated downstream \u2014 someone may find it',
  },
  dropNormal: {
    default:    '<span class="log-wn">tripped!</span> <span class="log-hi">{label}</span> was lost in the scramble',
    shortcut:   '<span class="log-wn">tripped off-trail!</span> <span class="log-hi">{label}</span> is gone in the undergrowth',
    downpour:   '<span class="log-wn">slipped in the downpour!</span> <span class="log-hi">{label}</span> washed into the ditch',
    rain:       '<span class="log-wn">slipped!</span> <span class="log-hi">{label}</span> slid into the ditch',
    risky:      '<span class="log-wn">tripped on a loose stone!</span> <span class="log-hi">{label}</span> tumbled out of reach',
    mountain:   '<span class="log-wn">boulder shifted!</span> <span class="log-hi">{label}</span> cracked open and was lost',
    rockyHills: '<span class="log-wn">tumbled!</span> <span class="log-hi">{label}</span> broke on the rocks',
    river:      '<span class="log-wn">dropped in the drink!</span> <span class="log-hi">{label}</span> sank out of reach',
  },
  damage: {
    default:    '<span class="log-wn">tripped!</span> <span class="log-hi">{label}</span> damaged \u2014 payout <span class="log-wn">-{lost}\u00a2</span>',
    shortcut:   '<span class="log-wn">caught a root!</span> <span class="log-hi">{label}</span> took a hit \u2014 payout <span class="log-wn">-{lost}\u00a2</span>',
    downpour:   '<span class="log-wn">hit wet ground hard!</span> <span class="log-hi">{label}</span> soaked through \u2014 payout <span class="log-wn">-{lost}\u00a2</span>',
    rain:       '<span class="log-wn">slipped in the wet!</span> <span class="log-hi">{label}</span> damp and dented \u2014 payout <span class="log-wn">-{lost}\u00a2</span>',
    risky:      '<span class="log-wn">stone rolled underfoot!</span> <span class="log-hi">{label}</span> battered \u2014 payout <span class="log-wn">-{lost}\u00a2</span>',
    mountain:   '<span class="log-wn">took a hard knock!</span> <span class="log-hi">{label}</span> cracked \u2014 payout <span class="log-wn">-{lost}\u00a2</span>',
    rockyHills: '<span class="log-wn">jarred on a rock!</span> <span class="log-hi">{label}</span> dented \u2014 payout <span class="log-wn">-{lost}\u00a2</span>',
    river:      '<span class="log-wn">water got in!</span> <span class="log-hi">{label}</span> soaked \u2014 payout <span class="log-wn">-{lost}\u00a2</span>',
  },
  // v0.0.9.5.1 — A1 "no-value damage" path. Fires when the damage
  // branch would produce a 0-scrip delta (pkg already at its floor).
  // Package is destroyed instead of taking a no-op hit.
  writeOff: {
    default:    '<span class="log-wn">tripped!</span> <span class="log-hi">{label}</span> fell out of reach \u2014 written off',
    shortcut:   '<span class="log-wn">stumbled!</span> <span class="log-hi">{label}</span> disappeared into the wild',
    downpour:   '<span class="log-wn">washed out!</span> <span class="log-hi">{label}</span> carried off in the flood',
    rain:       '<span class="log-wn">slipped!</span> <span class="log-hi">{label}</span> slid down a wet slope, gone',
    risky:      '<span class="log-wn">rocks gave way!</span> <span class="log-hi">{label}</span> tumbled out of sight',
    mountain:   '<span class="log-wn">slid off a ledge!</span> <span class="log-hi">{label}</span> disappeared below',
    rockyHills: '<span class="log-wn">rolled down the hill!</span> <span class="log-hi">{label}</span> broke apart on a boulder',
    river:      '<span class="log-wn">carried off!</span> <span class="log-hi">{label}</span> vanished downstream',
  },
  // v0.0.9.6 commit 3 — severe-trip messages. Fire when severity
  // rolls true: river = swept downstream (plus cargo water damage),
  // mountain = stall + impact damage, rockyHills = brief slip +
  // scrape damage.
  severeEnter: {
    river:      '<span class="log-wn">swept off your feet!</span> the current is carrying you downstream',
    mountain:   '<span class="log-wn">rockfall!</span> you\u2019re catching yourself on a ledge',
    rockyHills: '<span class="log-wn">hit a patch of loose scree!</span> bracing a moment',
  },
  severeExit: {
    river:      'caught a low branch \u2014 <span class="log-ok">back on the bank</span>',
    mountain:   'steadied on a handhold \u2014 <span class="log-ok">back on the route</span>',
    rockyHills: 'found footing \u2014 <span class="log-ok">moving again</span>',
  },
  severeDamage: {
    river:      '<span class="log-wn">water got into the pack</span> \u2014 <span class="log-hi">{label}</span> soaked (<span class="log-wn">-{lost}\u00a2</span>)',
    mountain:   '<span class="log-wn">impact on the rocks</span> \u2014 <span class="log-hi">{label}</span> took a hit (<span class="log-wn">-{lost}\u00a2</span>)',
    rockyHills: '<span class="log-wn">cargo scraped on stone</span> \u2014 <span class="log-hi">{label}</span> dented (<span class="log-wn">-{lost}\u00a2</span>)',
  },
};

function tripMsg(kind, flavor, label, lost) {
  const pool = TRIP_MSGS[kind] || TRIP_MSGS.empty;
  const tmpl = pool[flavor] || pool.default;
  return tmpl.replace('{label}', label || '').replace('{lost}', String(lost || 0));
}

// v0.0.9.5.1 — A1 helper. Removes pkg from inventory and either posts
// to the multiplayer recovery pipeline (isLost) or drops it at the
// courier's current cell (±3 search window, escalate-to-lost if full).
// Mirrors ejectFromCargo's drop-with-escalation shape so world pkgs
// from trips are recoverable by normal pickup.
function dropTrippedPkg(target, invIdx) {
  S.usedSlots  = Math.max(0, S.usedSlots - target.slots);
  S.usedWeight = Math.max(0, S.usedWeight - target.kg);
  S.inventory.splice(invIdx, 1);

  if (target.isLost) {
    postLostDrop(target);
    return { lost: true };
  }
  // During shortcut the courier is off-grid; worldCells index may not
  // map cleanly — escalate to lost for shortcut trips.
  const seg = S._transient.currentSegment;
  if (seg && seg.type === 'shortcut') {
    const asLost = { ...target, isLost: true };
    postLostDrop(asLost);
    return { lost: true };
  }
  const courierCell = Math.floor((S.edgeIdx * C.CELLS_PER_EDGE) + (S.dotT * C.CELLS_PER_EDGE));
  let dropCi = -1;
  const offsets = [0, 1, -1, 2, -2, 3, -3];
  for (const off of offsets) {
    const ci   = (courierCell + off + C.TOTAL_CELLS) % C.TOTAL_CELLS;
    const cell = worldCells[ci];
    if (cell && !cell.pkg && !cell.sandal) { dropCi = ci; break; }
  }
  if (dropCi < 0) {
    const asLost = { ...target, isLost: true };
    postLostDrop(asLost);
    return { lost: true };
  }
  worldCells[dropCi].pkg = {
    size: target.size, label: target.label, kg: target.kg, slots: target.slots,
    scrip: target.scrip,
    modifier: target.modifier || null,
    isLost: false,
    destId: target.destId,
    isRecovery: !!target.isRecovery,
    recoveryFromPorter: target.recoveryFromPorter || null,
    outboundFrom: target.outboundFrom,
    picked: false,
    respawnIn: 0,
    tossedUntilTick: S.ticks + C.TOSS_COOLDOWN_TICKS,
  };
  return { lost: false };
}

// v0.0.9.6 commit 3 — severe trip consequence dispatch. Called from
// maybeTrip when severity rolls true on a terrain that has a severe
// branch (river / mountain / rockyHills). River triggers the sweep
// segment; mountain/rockyHills set a stall state that main.js tick
// honors by pausing dotT advancement.
function applySevereDamage(terrain) {
  // Per-terrain hit profile. Fragile always hit on mountain/river,
  // 50% on hills. Non-fragile: 60% mountain, 50% river, 0% hills.
  // River with ceramicWrap: fragile pkgs immune to water damage.
  const waterDmg   = terrain === 'river';
  const waterSaves = waterDmg && !!S.upgrades.ceramicWrap;
  let nonFragile, fragile;
  if (terrain === 'river')        { fragile = 1.00; nonFragile = 0.50; }
  else if (terrain === 'mountain'){ fragile = 1.00; nonFragile = 0.60; }
  else                             { fragile = 0.50; nonFragile = 0.00; }  // rockyHills
  for (let i = S.inventory.length - 1; i >= 0; i--) {
    const pkg = S.inventory[i];
    const isFragile = pkg.modifier === 'fragile';
    if (waterSaves && isFragile) continue;  // theta's ceramic wrap protects
    const hit = isFragile ? fragile : nonFragile;
    if (Math.random() >= hit) continue;
    const oldScrip = pkg.scrip;
    const newScrip = Math.max(1, Math.floor(oldScrip * 0.6));
    const lost = oldScrip - newScrip;
    if (lost === 0) continue;  // already at floor, skip to avoid log spam
    pkg.scrip = newScrip;
    pkg.damaged = true;
    addLog(tripMsg('severeDamage', terrain, pkg.label, lost));
  }
  renderCourierStack();
  renderCargoSlots(true);
}

function triggerSevereTrip(terrain) {
  tEmit('trip.severe', { terrain });
  if (terrain === 'river') {
    // Sweep courier downstream 5-10 cells along theta→delta main river.
    const cells = 5 + Math.floor(Math.random() * 6);
    if (beginRiverDrift(cells)) {
      addLog(TRIP_MSGS.severeEnter.river);
      applySevereDamage('river');
    }
    return;
  }
  if (terrain === 'mountain') {
    const pick = MOUNTAIN_STALL_TICKS[Math.floor(Math.random() * MOUNTAIN_STALL_TICKS.length)];
    S._transient.severeTripState = { type: 'mountain', ticksRemaining: pick };
    addLog(TRIP_MSGS.severeEnter.mountain);
    applySevereDamage('mountain');
    return;
  }
  if (terrain === 'rockyHills') {
    const pick = ROCKYHILLS_STALL_TICKS[Math.floor(Math.random() * ROCKYHILLS_STALL_TICKS.length)];
    S._transient.severeTripState = { type: 'rockyHills', ticksRemaining: pick };
    addLog(TRIP_MSGS.severeEnter.rockyHills);
    applySevereDamage('rockyHills');
    return;
  }
}

export function maybeTrip() {
  if (S.status!=='walking' && S.status!=='carrying') return;
  // v0.0.9.6 commit 3 — if a stall state is active, we're in the
  // recovery window already; no double-trip.
  if (S._transient.severeTripState) return;
  if (Math.random() >= tripChance()) return;
  const flavor = tripFlavor();
  // v0.0.9.6.9 sim telemetry
  tEmit('trip.fired', { flavor });
  if (Math.random() < catchChance()) {
    tEmit('trip.caught', { flavor });
    addLog(TRIP_MSGS.catch[flavor] || TRIP_MSGS.catch.default);
    return;
  }
  // v0.0.9.6 commit 3 — severity roll. On interior terrains that have
  // a severe branch (river/mountain/rockyHills), roll severityChance =
  // max(0, (tripMult - 1) * SEVERITY_SCALE). If severe, short-circuit
  // the normal drop/damage path and dispatch to the terrain-specific
  // consequence. Non-severe trips fall through to the regular path.
  const terr = courierTerrain();
  if (TERRAIN_HAS_SEVERE[terr]) {
    const seg = S._transient.currentSegment;
    const xy  = seg.pathFn(S.dotT);
    // v0.0.9.6 commit 6 — pass-carved mountain cells zero severity
    // outright. The mountain-pass-carving mechanic: grind the same
    // slope enough (trample ≥ 0.85) and it stops throwing severes.
    // Also loop-safe: even if user wants to retrofit mountain tumble
    // in .9.7 polish, pass-carving self-caps the retry count.
    if (terr === 'mountain' && isPassCarved(xy.x, xy.y)) {
      // severity forced to 0; non-severe trip paths still run
    } else {
      let tripMult = TERRAIN_TRIP_MULT[terr] || 1.0;
      // v0.0.9.6 commit 4 — placed gear reduces severe chance.
      if (GEAR_FOR_TERRAIN[terr] && placedGearAt(xy.x, xy.y)) {
        tripMult *= GEAR_TRIP_MITIGATION;
      }
      // v0.0.9.6 commit 6 — trample continuous reduction applies
      // here too so severity tapers smoothly toward pass-carve.
      tripMult = reduceMultWithTrample(tripMult, trampleAt(xy.x, xy.y));
      const severityChance = Math.max(0, (tripMult - 1.0) * SEVERITY_SCALE);
      if (Math.random() < severityChance) {
        // Stumble animation still fires for visual consistency.
        if (els.courierAt) { els.courierAt.className='tlh-at trip'; els.courierAt.style.animation='trip 0.4s ease 3'; }
        S.bootDurability = Math.max(0, S.bootDurability - 5);
        triggerSevereTrip(terr);
        return;
      }
    }
  }

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
    // v0.0.9.5.1 — A2: roll against a RANDOM pkg from inventory, not
    // the [0]-slot default. Uniform pick so a full cargo shares trip
    // risk evenly instead of pounding whichever pkg was loaded first.
    const targetIdx = Math.floor(Math.random() * S.inventory.length);
    const target = S.inventory[targetIdx];
    const chance = target.isLost ? C.TRIP_DROP_CHANCE_LOST : C.TRIP_DROP_CHANCE_NORMAL;
    if (Math.random() < chance) {
      const { lost } = dropTrippedPkg(target, targetIdx);
      addLog(tripMsg(lost ? 'dropLost' : 'dropNormal', flavor, target.label));
      renderCourierStack();
      renderCargoSlots(true);
      dropped = true;
    } else {
      // v0.0.9.5.1 — A1: if damage would produce a 0-scrip delta (pkg
      // already at its floor of 1), destroy the pkg instead of logging
      // "damaged — payout -0\u00a2" on repeat. Routes through the same
      // drop helper so the pkg lands on the ground (or in the recovery
      // pipeline if shortcut / no free cell / already isLost).
      const oldScrip = target.scrip;
      const newScrip = Math.max(1, Math.floor(oldScrip * 0.75));
      const scripLost = oldScrip - newScrip;
      if (scripLost === 0) {
        dropTrippedPkg(target, targetIdx);
        addLog(tripMsg('writeOff', flavor, target.label));
        renderCourierStack();
        renderCargoSlots(true);
        dropped = true;
      } else {
        target.scrip = newScrip;
        target.damaged = true; // v0.0.8.4: flag for delivery dialogue condition
        addLog(tripMsg('damage', flavor, target.label, scripLost));
      }
    }
  }

  S.status='tripped'; S.tripTimer=6;
  S.bootDurability=Math.max(0,S.bootDurability-5);

  if (!dropped && S.inventory.length === 0) {
    addLog(tripMsg('empty', flavor));
  }
  if (els.courierAt) { els.courierAt.className='tlh-at trip'; els.courierAt.style.animation='trip 0.4s ease 3'; }
}
