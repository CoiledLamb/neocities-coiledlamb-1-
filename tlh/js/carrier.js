/* ==============================================
   THE LONG HAUL — mobile carrier (v0.0.9.6.9.30i)

   Gamma's trust gift. Wheeled cart that doubles the
   courier's effective capacity when deployed + folds
   into a cargo-grid pseudo-pkg when stowed.

   Public surface:
     deployCart({ reason })      — remove folded pkg
                                    from main cargo, open
                                    S.carrier.inventory.
     stowCart({ reason, forced })— reverse; when forced
                                    is true, drop cart
                                    inventory pkgs until
                                    the folded shape fits.
     toggleCart()                — user-button path.
     isCarrierTerrainCompatible(t) — per-level check.
     carrierTotalSlots() / Weight() — combined
                                    (main + cart) for
                                    pickup-capacity gates.
     inventoriesForDelivery()    — returns both arrays
                                    so packages.js can
                                    match destIds across.

   Kept separate from packages.js so carrier concerns
   don't ripple through the core pickup/drop plumbing.
   packages.js routes new pickups through preferCart()
   when deployed — one line of churn there.
   ============================================== */
'use strict';

import { S } from './state.js?v=097-0-1';
import * as C from './constants.js?v=097-0-1';
import { addLog } from './render/log.js?v=097-0-1';
import { emit as tEmit } from './telemetry.js?v=097-0-1';

// Build the folded-carrier pseudo-pkg that sits in main cargo
// when stowed. Treated like any other pkg by binPack (size
// class dictates grid shape), but marked with kind so drag +
// delivery code skip it.
function makeFoldedPkg(level) {
  const s = C.CARRIER_STATS[level];
  return {
    size:        s.foldedSize,
    slots:       s.foldedSlots,
    kg:          s.foldedKg,
    kind:        'carrier-folded',
    isCarrier:   true,
    destId:      null,
    scrip:       0,
    label:       'mobile carrier (stowed)',
    // Cargo pipeline uses these fields:
    isLost:      false,
    damaged:     false,
    scripBase:   0,
  };
}

function findFoldedIdx() {
  if (!S.inventory) return -1;
  return S.inventory.findIndex(p => p && p.kind === 'carrier-folded');
}

function removeFolded() {
  const i = findFoldedIdx();
  if (i === -1) return null;
  const pkg = S.inventory[i];
  S.inventory.splice(i, 1);
  S.usedSlots  = Math.max(0, S.usedSlots  - (pkg.slots || 0));
  S.usedWeight = Math.max(0, S.usedWeight - (pkg.kg    || 0));
  return pkg;
}

// Returns true if a folded-cart pkg of the given shape can fit
// into the free main-cargo budget. Slot geometry (bin-pack) is
// not checked — handled by the render-time packer. We only check
// the accounting totals.
function mainHasRoomFor(foldedSlots, foldedKg) {
  const slotsFree  = (S.maxSlots  || 0) - (S.usedSlots  || 0);
  const weightFree = (S.maxWeight || 0) - (S.usedWeight || 0);
  return slotsFree >= foldedSlots && weightFree >= foldedKg;
}

/** True if the given terrain will physically accept the
 *  deployed cart. Level-gated per CARRIER_STATS. */
export function isCarrierTerrainCompatible(terrain) {
  const lvl = S.carrier && S.carrier.level;
  if (!lvl) return true; // not owned — moot
  const stats = C.CARRIER_STATS[lvl];
  return !stats.incompatibleTerrains[terrain];
}

/** Deploy the cart: remove folded pseudo-pkg from main cargo,
 *  flip the deployed flag. Safe to call when already deployed
 *  (no-op). `reason` goes into the log line + telemetry event. */
export function deployCart({ reason } = {}) {
  if (!S.carrier || !S.carrier.unlocked) return false;
  if (S.carrier.deployed) return true;
  removeFolded();
  S.carrier.deployed = true;
  S.carrier.autoDeployArmed = false;
  S.carrier.safeTerrainTicks = 0;
  tEmit('carrier.deployed', { level: S.carrier.level, reason: reason || 'manual' });
  if (reason !== 'silent') {
    addLog(reason === 'autoRedeploy'
      ? '<span class="log-ok">cart redeployed — safe terrain</span>'
      : '<span class="log-ok">cart deployed</span>');
  }
  return true;
}

/** Stow the cart. Reverse of deploy: cart contents transfer back
 *  to main, folded pseudo-pkg takes a chunk of main cargo slots.
 *
 *  Manual (forced=false) — refuses if main doesn't have room for
 *  cart contents + folded shape. Cart contents never lost on manual.
 *
 *  Forced (forced=true, called from terrain-enforcement in .30k) —
 *  drops cart pkgs that can't be transferred to main. Folded shape
 *  still has to fit afterward; if main is too full of its own
 *  content, the stow abandons and the cart stays deployed (caller
 *  handles the "cart stuck on terrain" fallback). */
export function stowCart({ reason, forced } = {}) {
  if (!S.carrier || !S.carrier.unlocked) return false;
  if (!S.carrier.deployed) return true;

  const lvl = S.carrier.level;
  const stats = C.CARRIER_STATS[lvl];

  // Compute what main needs to absorb.
  const cartSlots = S.carrier.inventory.reduce((s, p) => s + (p.slots || 0), 0);
  const cartKg    = S.carrier.inventory.reduce((s, p) => s + (p.kg    || 0), 0);
  const needSlots = cartSlots + stats.foldedSlots;
  const needKg    = cartKg    + stats.foldedKg;

  if (!forced) {
    // Manual path: all-or-nothing. Refuse if main can't swallow
    // everything. Player resolves by delivering or dropping pkgs,
    // then re-trying.
    if (!mainHasRoomFor(needSlots, needKg)) {
      addLog('<span class="log-wn">can\u2019t stow cart \u2014 need bag space</span>');
      return false;
    }
    // Transfer cart contents into main.
    for (const p of S.carrier.inventory) {
      S.inventory.push(p);
      S.usedSlots  += (p.slots || 0);
      S.usedWeight += (p.kg    || 0);
    }
    S.carrier.inventory = [];
    addLog('<span class="log-ok">cart stowed</span>');
  } else {
    // Forced path: try to transfer cart contents first; drop what
    // doesn't fit; then check whether folded shape still fits in
    // main. If not, abandon (cart stays deployed). Detail logic
    // refined in .30k when terrain enforcement wires in the caller.
    const droppedLabels = [];
    const toRelocate = S.carrier.inventory.slice();
    S.carrier.inventory.length = 0;
    for (const p of toRelocate) {
      if (mainHasRoomFor((p.slots||0), (p.kg||0))) {
        S.inventory.push(p);
        S.usedSlots  += (p.slots || 0);
        S.usedWeight += (p.kg    || 0);
      } else {
        droppedLabels.push(p.label || `[${p.size}]`);
        tEmit('carrier.dropped', { size: p.size, label: p.label, scrip: p.scrip, reason: reason || 'forced' });
      }
    }
    if (!mainHasRoomFor(stats.foldedSlots, stats.foldedKg)) {
      // Folded cart doesn't fit even after dropping cart pkgs. Abandon
      // the stow — cart stays deployed. Caller sees false and decides
      // how to handle (usually: log warning, let terrain penalties
      // continue until the player clears main cargo).
      addLog(`<span class="log-wn">cart stuck on ${reason || 'terrain'} \u2014 bag too full to fold</span>`);
      return false;
    }
    if (droppedLabels.length > 0) {
      const summary = droppedLabels.length === 1
        ? droppedLabels[0]
        : `${droppedLabels.length} pkgs`;
      addLog(`<span class="log-wn">cart stuck on ${reason || 'terrain'} \u2014 threw off ${summary}</span>`);
    } else {
      addLog(`<span class="log-wn">cart stowed \u2014 ${reason || 'incompatible terrain'}</span>`);
    }
  }

  // Insert folded pseudo-pkg.
  const folded = makeFoldedPkg(lvl);
  S.inventory.push(folded);
  S.usedSlots  += folded.slots;
  S.usedWeight += folded.kg;

  S.carrier.deployed = false;
  // Forced stow arms auto-redeploy; manual stow clears it.
  S.carrier.autoDeployArmed = !!forced;
  S.carrier.safeTerrainTicks = 0;
  tEmit('carrier.stowed', { level: lvl, forced: !!forced, reason: reason || 'manual' });
  return true;
}

/** User-button path. Mirrors the cargo-row button's stow/carry
 *  text (stow → button says "cart: stow"; carry → "cart: carry"). */
export function toggleCart() {
  if (!S.carrier || !S.carrier.unlocked) return;
  if (S.carrier.deployed) stowCart({ reason: 'manual' });
  else                    deployCart({ reason: 'manual' });
}

/** Tick check for auto-redeploy. Called from main.js tick when
 *  the cart is stowed + autoDeployArmed. Counts compatible-
 *  terrain ticks; flips to deployed after CARRIER_AUTO_REDEPLOY_TICKS.
 *  Incompatible-terrain ticks reset the counter. */
export function tryAutoRedeploy(currentTerrain) {
  if (!S.carrier || !S.carrier.unlocked) return;
  if (S.carrier.deployed) return;
  if (!S.carrier.autoDeployArmed) return;
  if (!isCarrierTerrainCompatible(currentTerrain)) {
    S.carrier.safeTerrainTicks = 0;
    return;
  }
  S.carrier.safeTerrainTicks++;
  if (S.carrier.safeTerrainTicks >= C.CARRIER_AUTO_REDEPLOY_TICKS) {
    // Check main has room — folded pkg needs to come OUT, which is
    // guaranteed (we put it in there during stow). deployCart just
    // removes it.
    deployCart({ reason: 'autoRedeploy' });
  }
}

/** Per-tick forced-stow check. If deployed + current terrain is
 *  incompatible, stow forcibly. Called from main.js after terrain
 *  classification. Idempotent (early-returns if already stowed). */
export function enforceTerrainCompatibility(currentTerrain) {
  if (!S.carrier || !S.carrier.unlocked) return;
  if (!S.carrier.deployed) return;
  if (isCarrierTerrainCompatible(currentTerrain)) return;
  stowCart({ reason: currentTerrain, forced: true });
}

/** Capacity check for the cart — does NOT mutate. Returns true
 *  only when the carrier is deployed AND has room for the pkg. */
export function cartFits(pkg) {
  if (!S.carrier || !S.carrier.unlocked || !S.carrier.deployed) return false;
  const lvl   = S.carrier.level;
  const stats = C.CARRIER_STATS[lvl];
  const usedS = (S.carrier.inventory || []).reduce((s, p) => s + (p.slots || 0), 0);
  const usedW = (S.carrier.inventory || []).reduce((s, p) => s + (p.kg    || 0), 0);
  if (usedS + (pkg.slots || 0) > stats.maxSlots)  return false;
  if (usedW + (pkg.kg    || 0) > stats.maxWeight) return false;
  return true;
}

/** Prefer-cart-first accept. Pushes the pkg into S.carrier.inventory
 *  if there's room. Returns true on success. Pickup sites call
 *  cartFits() first to decide bucket, then pushToCart() to commit;
 *  keeping the predicate + mutator split makes the caller's shape
 *  check visible at the call site. */
export function pushToCart(pkg) {
  if (!cartFits(pkg)) return false;
  S.carrier.inventory.push(pkg);
  return true;
}

/** Splice a pkg out of either the main or cart inventory. Used by
 *  delivery/drop paths that iterate the combined bucket view. Returns
 *  'main' | 'cart' | null based on which array it was in. Also
 *  decrements S.usedSlots/Weight iff the pkg was in main (cart uses
 *  its own bookkeeping, not the main-bag totals). */
export function removeFromInventories(pkg) {
  const mainIdx = S.inventory ? S.inventory.indexOf(pkg) : -1;
  if (mainIdx !== -1) {
    S.inventory.splice(mainIdx, 1);
    S.usedSlots  = Math.max(0, S.usedSlots  - (pkg.slots || 0));
    S.usedWeight = Math.max(0, S.usedWeight - (pkg.kg    || 0));
    return 'main';
  }
  if (S.carrier && S.carrier.inventory) {
    const cartIdx = S.carrier.inventory.indexOf(pkg);
    if (cartIdx !== -1) {
      S.carrier.inventory.splice(cartIdx, 1);
      return 'cart';
    }
  }
  return null;
}

/** Combined weight + slot usage across main + cart for HUD
 *  displays that want to report total capacity. */
export function carrierTotalSlots() {
  const cart = (S.carrier && S.carrier.deployed) ? C.CARRIER_STATS[S.carrier.level].maxSlots : 0;
  return (S.maxSlots || 0) + cart;
}
export function carrierTotalWeight() {
  const cart = (S.carrier && S.carrier.deployed) ? C.CARRIER_STATS[S.carrier.level].maxWeight : 0;
  return (S.maxWeight || 0) + cart;
}

/** Both inventories as an array. Delivery code iterates these
 *  to find pkgs matching a destId; works unchanged whether
 *  carrier is owned + deployed or not. */
export function inventoriesForDelivery() {
  if (S.carrier && S.carrier.deployed) {
    return [S.inventory, S.carrier.inventory];
  }
  return [S.inventory];
}
