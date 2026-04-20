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

import { S } from './state.js?v=096-10-15';
import * as C from './constants.js?v=096-10-15';
import { postLostDrop } from './multiplayer.js?v=096-10-15';
import { staminaSegCount } from './stamina.js?v=096-10-15';
import { emit as tEmit } from './telemetry.js?v=096-10-15';
// v0.0.9.6.9.13 — trip-dropped cargo needs to hit the same bottleneck
// edge-tracker used by normal pick/deliver paths. Without this, a
// severe trip at full cargo can transition out of maxed without
// emitting inventory.freed.
import { onInventoryChange } from './packages.js?v=096-10-15';
import { addLog } from './render/log.js?v=096-10-15';
import { renderCourierStack, renderCargoSlots } from './render/hud.js?v=096-10-15';
import { weatherAtCourier } from './weather.js?v=096-10-15';
import { courierXY, courierTerrain, beginRiverDrift } from './render/route-map.js?v=096-10-15';
import {
  TERRAIN_TRIP_MULT,
  TERRAIN_HAS_SEVERE,
  SEVERITY_SCALE,
  MOUNTAIN_STALL_TICKS,
  ROCKYHILLS_STALL_TICKS,
  GEAR_FOR_TERRAIN,
  GEAR_TRIP_MITIGATION,
  reduceMultWithTrample,
} from './data/terrain.js?v=096-10-15';
import { placedGearAt } from './gear.js?v=096-10-15';
import { trampleAt } from './trail.js?v=096-10-15';

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

// v0.0.9.6.9.14 — tripChance rewritten to compute a factor breakdown
// alongside the final value. The breakdown object is what sim telemetry
// attributes each fired trip against: which multiplier was biggest at
// the moment it rolled unlucky? Without this, trip.fired couldn't tell
// us if fires were driven by boots, stamina, terrain, weather, or load.
//
// tripChance() keeps its old signature (returns number) for callers
// that only want the scalar. Internal tick path uses tripChanceBreakdown
// which returns { chance, factors } so maybeTrip can emit both.
export function tripChance() {
  return tripChanceBreakdown().chance;
}

export function tripChanceBreakdown() {
  const bootFail = (100 - S.bootDurability) / 100;
  const segsLost = 4 - staminaSegCount();
  const staminaMult = 1 + segsLost * 0.5;
  let chance = C.TRIP_CHANCE_BASE * bootFail * staminaMult;

  // v0.0.9.6.9.14 — graceful-stride bonuses.
  // v0.0.9.6.9.16 — bonus reshaped to 60-100% range only. Zero below
  // 60% on either stat (no help when already struggling), linear ramp
  // to -20% at 100%. Rewards *maintaining* peak state rather than
  // providing incremental reduction across all durabilities. Combined
  // effect at full both: 0.80 × 0.80 = 0.64 → 36% trip-chance cut.
  const staminaPctRaw = 100 * S.stamina / (S.staminaMax || 1);
  const bootGraceBonus    = 0.20 * Math.max(0, (S.bootDurability - 60) / 40);
  const staminaGraceBonus = 0.20 * Math.max(0, (staminaPctRaw - 60) / 40);
  chance *= (1 - bootGraceBonus);
  chance *= (1 - staminaGraceBonus);

  // v0.0.9.6.9.30l — smoke-sandalweed grace window. Flat
  // (1-magnitude) cut while ticksRemaining > 0. Stacks multiplicatively
  // with the passive boot/stamina graces above — smoking at peak
  // state compounds the benefit rather than gating on it.
  const smokeActive      = !!(S.smokeGrace && S.smokeGrace.ticksRemaining > 0);
  const smokeGraceBonus  = smokeActive ? (S.smokeGrace.magnitude || 0) : 0;
  if (smokeGraceBonus > 0) chance *= (1 - smokeGraceBonus);

  const steadyFeetMult  = S.upgrades.steadyFeet ? 0.70 : 1.0;
  const scannerBuffMult = S.scanner.buffActive ? S.scanner.buffMagnitude : 1.0;
  // v0.0.9.6.9.20 — direct makeshift trip bump (layered on boot-drain
  // penalty from main.js). Sandalweed is actively wobblier footing.
  const makeshiftMult   = S.usingMakeshift ? C.MAKESHIFT_TRIP_MULT : 1.0;
  chance *= steadyFeetMult * scannerBuffMult * makeshiftMult;

  // v0.0.9.6.9.15 — terrain, gear mitigation, and trample reduction now
  // apply on BOTH ring and interior. courierTerrain() was updated to
  // return real geography on the ring path, so mountain / rockyHills /
  // river cells that intersect the ring carry their full trip penalty.
  // Risky-cell and weather remain ring-only (they're ring-specific
  // concepts — risky flags are hand-placed, weather is spatial over the
  // ring). Shortcut and river-drift segments are still considered
  // 'interior' for anything ring-specific.
  const seg = S._transient.currentSegment;
  const onInterior = seg && (seg.type === 'shortcut' || seg.type === 'river-drift');
  const terrain = courierTerrain();
  let terrMult = TERRAIN_TRIP_MULT[terrain] || 1.0;
  let weatherMult = 1.0, riskyMult = 1.0, weather = 'none';
  if (seg) {
    const xy = seg.pathFn(S.dotT);
    if (GEAR_FOR_TERRAIN[terrain] && placedGearAt(xy.x, xy.y)) {
      terrMult *= GEAR_TRIP_MITIGATION;
    }
    terrMult = reduceMultWithTrample(terrMult, trampleAt(xy.x, xy.y));
  }
  // v0.0.9.6.9.30h — exoskeleton all-terrain variant. Applied AFTER
  // gear + trample so the stack reads: terrain penalty → infra
  // mitigation → paving mitigation → personal equipment. Battery-
  // gated: bonus goes cold at 0 charge but the flag stays set. Both
  // tiers of the exoskel get this (lvl 2 adds speed on top, see
  // main.js dotT advance).
  let exoMult = 1.0;
  if (S.exoskeleton && S.exoskeleton.unlocked &&
      S.battery && S.battery.charge > 0 &&
      C.EXO_ALLTERRAIN_TARGETS[terrain]) {
    exoMult = C.EXO_ALLTERRAIN_MULT;
    terrMult *= exoMult;
  }
  // v0.0.9.6.9.30.2 — theta's river waders. River-only mitigation
  // that stacks with exo on river cells (both trunk and tributaries —
  // terrainAt classifies both as 'river'). Applied AFTER exo in the
  // stack so both show up distinctly in telemetry / tooltip.
  let waderMult = 1.0;
  if (S.upgrades.riverWaders && terrain === 'river') {
    waderMult = C.RIVER_WADERS_TRIP_MULT;
    terrMult *= waderMult;
  }
  chance *= terrMult;
  // v0.0.9.6.9.28 — weather now applies on BOTH ring and interior.
  // Previously gated on !onInterior, which made shortcut/river-drift
  // segments weather-immune even when the storm was spatially present.
  // Rain falls on shortcuts too. Risky-cell flag is hand-placed on ring
  // cells only, so that sub-branch stays ring-gated.
  const w = weatherAtCourier();
  weather = w.intensity;
  if (w.intensity === 'drizzle')       { weatherMult = C.TRIP_MULT_DRIZZLE;  chance *= weatherMult; }
  else if (w.intensity === 'rain')     { weatherMult = C.TRIP_MULT_RAIN;     chance *= weatherMult; }
  else if (w.intensity === 'downpour') { weatherMult = C.TRIP_MULT_DOWNPOUR; chance *= weatherMult; }
  if (!onInterior && currentCellIsRisky()) { riskyMult = 1.40; chance *= 1.40; }

  let encumbranceMult = 1.0;
  if (S.maxWeight > 0 && S.usedWeight > 0) {
    const loadRatio = Math.min(1, S.usedWeight / S.maxWeight);
    encumbranceMult = 1 + (C.TRIP_ENCUMBRANCE_MAX_MULT - 1) * loadRatio;
    chance *= encumbranceMult;
  }

  // v0.0.9.6.9.30k — "lugging a dead cart" penalty. Deployed cart
  // with zero battery adds a flat trip-chance bump (CARRIER_DEAD_STRAIN_MULT
  // defaults to 1.15). Stacks after encumbrance so a heavy dead cart
  // compounds both. Battery-gated specifically on <=0, not low —
  // player has time to recharge before the penalty kicks in.
  let deadCartMult = 1.0;
  if (S.carrier && S.carrier.unlocked && S.carrier.deployed && S.battery && S.battery.charge <= 0) {
    deadCartMult = C.CARRIER_DEAD_STRAIN_MULT;
    chance *= deadCartMult;
  }

  return {
    chance,
    factors: {
      base:          C.TRIP_CHANCE_BASE,
      bootPct:       S.bootDurability,
      bootFail,
      staminaPct:    Math.round(100 * S.stamina / (S.staminaMax || 1)),
      segsLost,
      staminaMult,
      bootGraceBonus,    // shown as bonus (e.g. 0.18); effective mult = (1 - bonus)
      staminaGraceBonus,
      steadyFeetMult,
      scannerBuffMult,
      makeshiftMult,     // v0.0.9.6.9.20 — explicit factor in telemetry
      terrain,           // 'ring' | 'mountain' | 'rockyHills' | 'river' | 'desert' | 'plateau' | 'flat' | 'clayBed'
      terrMult,
      weather,           // 'none' | 'drizzle' | 'rain' | 'downpour'
      weatherMult,
      riskyCell:     riskyMult > 1,
      riskyMult,         // v0.0.9.6.9.19 — expose numerical value for factor audit
      encumbranceMult,
      cargoLoadPct:  S.maxWeight > 0 ? Math.round(100 * S.usedWeight / (S.maxWeight || 1)) : 0,
      usingMakeshift: !!S.usingMakeshift,
      exoMult,       // v0.0.9.6.9.30h — exoskel all-terrain mitigation
      waderMult,     // v0.0.9.6.9.30.2 — theta's river waders (river cells only)
      deadCartMult,  // v0.0.9.6.9.30k — dead-battery deployed cart drag
      smokeGraceBonus,  // v0.0.9.6.9.30l — active smoke-sandalweed cut (0 when inactive)
      smokeActive,      // explicit flag so strain-tip can render an active marker
      smokeTicks:    smokeActive ? (S.smokeGrace.ticksRemaining | 0) : 0,
    },
  };
}

// v0.0.9.6.9.15 — catch was boot-only; collapsed too hard at low state.
// v0.0.9.6.9.16 — catch rebuilt with floor + boot + stam + asymmetry.
// v0.0.9.6.9.21 — floor now SCALES with best stat instead of flat 0.10.
//   Catch audit showed 70% of catches firing at 0-25% boots / 79% at
//   0-25% stam, i.e. the flat floor was doing most of the work and
//   bad-state catches felt "unearned". New floor: 0.05 + 0.05 × max
//   (bootFrac, stamFrac). Preserves the "always some chance" safety
//   net while rewarding even partial maintenance of either stat.
//   Floor table (no steadyFeet):
//     0/0   : 0.05 + 0       = 0.05
//     50/0  : 0.05 + 0.025   = 0.075
//     100/0 : 0.05 + 0.05    = 0.10   (old flat floor only at full-one-stat)
//     100/100: 0.05 + 0.05   = 0.10   (floor caps at 0.10, the rest
//                                      comes from the linear boot+stam terms)
export function catchChance() {
  const bootFrac = S.bootDurability / 100;
  const stamFrac = Math.min(S.stamina, S.staminaMax) / (S.staminaMax || 1);
  const higher   = Math.max(bootFrac, stamFrac);
  let c = 0.05 + 0.05 * higher;  // scaled floor
  c += 0.25 * bootFrac;
  c += 0.25 * stamFrac;
  const gap = Math.abs(bootFrac - stamFrac);
  c += Math.min(0.15, 0.15 * gap * higher);
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
  onInventoryChange();

  // v0.0.9.6.9.13 — shared emit helper for the 3 trip-drop exits
  // (pre-tagged isLost, shortcut-forced-lost, ±3-search-forced-lost).
  // Mirrors pkg.lost's shape from packages.js so sim aggregation can
  // treat all loss/toss events uniformly via reason: field.
  const emitLost = (reason) => {
    tEmit('pkg.lost', {
      size:               target.size,
      destId:             target.destId,
      scrip:              target.scrip,
      carryDurationTicks: (typeof target.pickupTick === 'number') ? (S.ticks - target.pickupTick) : null,
      srcEdgeIdx:         (typeof target.srcEdgeIdx === 'number') ? target.srcEdgeIdx : null,
      reason,
      terrainOrigin:      target.terrainOrigin || 'ring',
    });
  };

  if (target.isLost) {
    postLostDrop(target);
    emitLost('trip_pretagged');
    return { lost: true };
  }
  // During shortcut the courier is off-grid; worldCells index may not
  // map cleanly — escalate to lost for shortcut trips.
  const seg = S._transient.currentSegment;
  if (seg && seg.type === 'shortcut') {
    const asLost = { ...target, isLost: true };
    postLostDrop(asLost);
    emitLost('trip_shortcut');
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
    emitLost('trip_forced');
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
  // v0.0.9.6.9.13 — trip-toss (landed on trail, recoverable).
  // Distinct from manual toss via reason: 'trip'.
  tEmit('pkg.tossed', {
    size:               target.size,
    destId:             target.destId,
    scrip:              target.scrip,
    carryDurationTicks: (typeof target.pickupTick === 'number') ? (S.ticks - target.pickupTick) : null,
    srcEdgeIdx:         (typeof target.srcEdgeIdx === 'number') ? target.srcEdgeIdx : null,
    reason:             'trip',
    terrainOrigin:      target.terrainOrigin || 'ring',
  });
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
  // v0.0.9.6.9.30.2 — ceramicWrap also grants a one-time absorb on
  // non-water severe hits (mountain + rockyHills). The per-pkg
  // `ceramicAbsorbed` flag flips on first save and persists with the
  // pkg through save/load, so the cushion is truly "+1 hit per pkg,
  // ever" rather than a per-trip reset.
  const waterDmg   = terrain === 'river';
  const waterSaves = waterDmg && !!S.upgrades.ceramicWrap;
  const absorbDry  = !waterDmg && !!S.upgrades.ceramicWrap;
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
    if (absorbDry && isFragile && !pkg.ceramicAbsorbed) {
      pkg.ceramicAbsorbed = true;
      addLog(`<span class="log-ok">ceramic wrap held</span> \u2014 <span class="log-hi">${pkg.label}</span> absorbed the hit`);
      continue;
    }
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
  // v0.0.9.6.9.17 — strain gauge replaces per-tick trip roll.
  // strainDelta uses the same factor breakdown that used to produce
  // tripChance, scaled so accumulation-to-threshold feels tuned for
  // integrated risk over an NPC hop rather than per-tick rolls.
  // Graceful-stride bonuses already multiply into `chance` inside
  // tripChanceBreakdown (i.e., resilience — same math). Trip fires
  // when strain >= threshold; strain resets to 0.
  const { chance, factors } = tripChanceBreakdown();
  const strainDelta = chance * C.STRAIN_DELTA_SCALE;
  S.strain = Math.min(1.0, (S.strain || 0) + strainDelta);
  if (S.strain < C.STRAIN_TRIP_THRESHOLD) return;
  S.strain = 0;
  const flavor = tripFlavor();
  tEmit('trip.fired', { tripChance: chance, strainDelta, ...factors });
  const catchVal = catchChance();
  if (Math.random() < catchVal) {
    tEmit('trip.caught', { catchChance: catchVal, bootPct: S.bootDurability, staminaPct: factors.staminaPct, terrain: factors.terrain });
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
    // v0.0.9.6.10.6 — mountain carve zero-severity branch removed.
    // Prior behavior: trample ≥ 0.85 on a mountain cell zeroed
    // severity entirely, effectively letting repeat loops (or peer
    // paving via trample_milestone merges) disable mountains as a
    // threat. Leftover from before ladders shipped as the intended
    // mountain mitigation. Now: trample still smoothly reduces
    // severity via reduceMultWithTrample (line below), but never to
    // zero. Mountains stay hard, asymptoting toward "manageable"
    // after traffic, never "cleared". Ladders remain the primary
    // mitigation for a specific crossing.
    {
      let tripMult = TERRAIN_TRIP_MULT[terr] || 1.0;
      // v0.0.9.6 commit 4 — placed gear reduces severe chance.
      if (GEAR_FOR_TERRAIN[terr] && placedGearAt(xy.x, xy.y)) {
        tripMult *= GEAR_TRIP_MITIGATION;
      }
      // v0.0.9.6 commit 6 — trample continuous reduction applies
      // here too so severity tapers smoothly with traffic.
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
  // v0.0.9.6.9.30.2 — lambda's improvedTieDowns (t40) adds a hold-
  // chance: on a successful absorb, roll IMPROVED_TIE_DOWNS_HOLD_CHANCE
  // to keep the tie-down armed instead of disarming it. Doesn't change
  // the "must re-arm" rhythm, just takes the edge off hot stretches.
  if (S.tieDownActive && S.inventory.length > 0) {
    const hold = !!S.upgrades.improvedTieDowns && Math.random() < C.IMPROVED_TIE_DOWNS_HOLD_CHANCE;
    if (!hold) {
      S.tieDownActive=false;
      if (els.tieDownBtn) { els.tieDownBtn.textContent='tie-down: off'; els.tieDownBtn.classList.remove('on'); }
      addLog('<span class="log-wn">tripped!</span> tie-down held \u2014 <span class="log-ok">cargo protected</span>. re-arm to use again');
    } else {
      addLog('<span class="log-wn">tripped!</span> tie-down held \u2014 <span class="log-ok">lashings still secure</span>');
    }
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
