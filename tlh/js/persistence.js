/* ==============================================
   THE LONG HAUL — save / load / wipe persistence

   Schema v6 (as of v0.0.7.21). Loader chain
   v6 → v5 → v4 → v3 → v2 → v1 with on-load migration: legacy
   keys are removed and the save is re-written as v6 immediately.

   v6 adds: stickyGun, scanner, scanner.manualCooldown (no
   save-scum on the manual ping gate). Old v5 saves upgrade
   cleanly — stickyGun is null and scanner uses its default
   (not unlocked).

   The save export/import feature (js/save-io.js) wraps
   buildSavePayload output in a TLH-SAVE:<base64> envelope.
   Import routes through the existing loadGame migration chain.

   See TLH-HANDOFF.md "persistence" section for the full list of
   saved/transient fields and the trust-unlock legacy migration
   (t25/t50/t75/t100 → t20/t40/t60/t80) added in pre-refactor
   commit A.

   Wipe save guard:
     S._transient.wipeInProgress is set in armWipe() before
     wipeSave() runs, never unset (module re-init on reload
     resets it). saveGame() bails immediately if the flag is set,
     preventing beforeunload/visibilitychange/autosave from
     re-saving in-memory state over the freshly-cleared store.

   v0.0.7.18: silent saves now surface a one-time warning when
   they fail (handoff bug list item 3 — quota exhaustion / Safari
   private mode were silently losing progress). Flag lives on
   _transient.silentSaveErrorShown so the warning fires once,
   not every 30 seconds for the rest of the session.
   ============================================== */
'use strict';

import { S } from './state.js?v=097-0-8';
import * as C from './constants.js?v=097-0-8';
import { addLog } from './render/log.js?v=097-0-8';
import { UPGRADE_DEFS } from './data/upgrades.js?v=097-0-8';

// v0.0.9.6.10.20 tag-shape migration. Old saves carry `pkg.modifier`
// (string or null) from the pre-tag shape; new saves carry `pkg.tags`
// (string array). On load, convert the old field into the new one and
// drop `modifier` so re-saving emits the new shape cleanly.
function migratePkgTags(p) {
  if (!p || typeof p !== 'object') return p;
  // Already migrated or fresh — trust the tags array, drop any stale modifier.
  if (Array.isArray(p.tags)) {
    if ('modifier' in p) delete p.modifier;
    return p;
  }
  // Old shape: hoist modifier → tags[0].
  p.tags = (typeof p.modifier === 'string' && p.modifier) ? [p.modifier] : [];
  if ('modifier' in p) delete p.modifier;
  return p;
}

const els = S._transient.els;

export function buildSavePayload() {
  return {
    version: C.SAVE_VERSION,
    savedAt: Date.now(),
    progress: {
      delivered:      S.delivered,
      scrip:          S.scrip,
      distKm:         S.distKm,
      ticks:          S.ticks,
      maxSlots:       S.maxSlots,
      maxWeight:      S.maxWeight,
      bootDurability: S.bootDurability,
      bootClipCount:  S.bootClipCount,
      bootClipMax:    S.bootClipMax,
      usingMakeshift: S.usingMakeshift,
      sandalweedCount: S.sandalweedCount,
      // v0.0.9.6.9.30l — smoke-grace window ride-through.
      smokeGrace: S.smokeGrace
        ? { ticksRemaining: S.smokeGrace.ticksRemaining | 0, magnitude: +S.smokeGrace.magnitude || 0 }
        : { ticksRemaining: 0, magnitude: 0 },
      stamina:          S.stamina,
      staminaOverboost: S.staminaOverboost,
      canteen:          S.canteen,
      autobuyBoots:   S.autobuyBoots,
      autodrink:      S.autodrink,
      autoGrab:       S.autoGrab,
      grabMode:       S.grabMode,
      strain:         S.strain,
    },
    position: { edgeIdx: S.edgeIdx, dotT: S.dotT },
    inventory: S.inventory.map(p => ({
      size: p.size, label: p.label, kg: p.kg, slots: p.slots,
      scrip: p.scrip, isLost: !!p.isLost, destId: p.destId,
    })),
    upgrades: { ...S.upgrades },
    nodeStages: { ...S.nodeStages },
    settlements: Object.keys(S.settlements).reduce((acc, k) => {
      const s = S.settlements[k];
      acc[k] = { supply: s.supply, rebuild: s.rebuild };
      return acc;
    }, {}),
    multiplayer: {
      milestonesHit:     [...S.milestonesHit],
      lastFeedTimestamp: S.lastFeedTimestamp,
    },
    npcs: Object.keys(S.npcs).reduce((acc, k) => {
      const n = S.npcs[k];
      // v0.0.9.6.10.17 — profile-state fields
      // (wetlandTicksSinceLastVisit / kmAtLastVisit / visitedSinceLastDelta)
      // no longer serialized. They were tied to the removed trust-profile
      // system; load-side guard kept for back-compat with pre-.17 saves.
      acc[k] = { trust: n.trust, unlocks: { ...n.unlocks } };
      return acc;
    }, {}),
    // v0.0.7.21 (schema v6)
    stickyGun: S.stickyGun ? {
      ammo: S.stickyGun.ammo,
      ammoMax: S.stickyGun.ammoMax,
      holstered: !!S.stickyGun.holstered,
    } : null,
    scanner: {
      unlocked: !!S.scanner.unlocked,
      level: S.scanner.level,
      manualCooldown: S.scanner.manualCooldown,
      autoTimer: S.scanner.autoTimer,
      buffActive: S.scanner.buffActive,
      buffRemaining: S.scanner.buffRemaining,
      buffMagnitude: S.scanner.buffMagnitude,
    },
    // v0.0.8 (schema v7) — weather system.
    // v0.0.9.6 commit 7 — storms now (x, y, dx, dy) native; legacy
    // fields dropped. Migration in apply step handles old-shape
    // entries.
    storms: S.storms.map(s => ({
      id: s.id, type: s.type,
      x: s.x, y: s.y, dx: s.dx, dy: s.dy,
      secondaryOffsetX: s.secondaryOffsetX,
      secondaryOffsetY: s.secondaryOffsetY,
      age: s.age, seed: s.seed,
      isInterior: !!s.isInterior,
    })),
    nextStormSpawnTick: S.nextStormSpawnTick,
    nextStormType: S.nextStormType,
    // v0.0.9.6 commit 7 — composite preroll descriptor for weather
    // radio landmark display.
    nextStormSpawn: S.nextStormSpawn
      ? { type: S.nextStormSpawn.type, x: S.nextStormSpawn.x, y: S.nextStormSpawn.y,
          isInterior: !!S.nextStormSpawn.isInterior,
          nearestNpcId: S.nextStormSpawn.nearestNpcId }
      : null,
    // v0.0.9.5 (schema v8) — battery is now persisted. Full feature
    // (solar trickle + new consumers + delta's regen upgrades) lands
    // in commit 4a; this commit just reserves the persistence slot.
    battery: { charge: S.battery.charge, max: S.battery.max },
    // v0.0.9.6.9.30h — exoskeleton state (pi's trust gift). Purely
    // additive on v9 — older saves restore with defaults and any
    // purchased upgrade flag (S.upgrades.exoskeleton1/2) re-applies
    // via restoreGame's upgrade replay path.
    exoskeleton: S.exoskeleton
      ? { unlocked: !!S.exoskeleton.unlocked, level: S.exoskeleton.level | 0 }
      : { unlocked: false, level: 0 },
    // v0.0.9.6.9.30i — mobile carrier (gamma's trust gift). Additive
    // on v9. Inventory is persisted as a simple pkg array (same shape
    // as S.inventory entries). deployed/autoDeployArmed flags + the
    // safe-terrain counter ride through so deploy state + auto-redeploy
    // progress survive a reload.
    carrier: S.carrier
      ? { unlocked:        !!S.carrier.unlocked,
          level:           S.carrier.level | 0,
          deployed:        !!S.carrier.deployed,
          autoDeployArmed: !!S.carrier.autoDeployArmed,
          safeTerrainTicks: S.carrier.safeTerrainTicks | 0,
          inventory:       Array.isArray(S.carrier.inventory) ? S.carrier.inventory.slice() : [] }
      : { unlocked: false, level: 0, deployed: false, autoDeployArmed: false, safeTerrainTicks: 0, inventory: [] },
    // v0.0.9.6 commit 4 — placeable-gear kit inventory (persisted).
    kit: S.kit ? { ladders: S.kit.ladders, anchors: S.kit.anchors, autoGear: !!S.kit.autoGear } : undefined,
    // v0.0.9.6 commit 5 (schema v9) — shared world-overlay placed
    // structures + cell-native interior pkgs. placedGear is the full
    // array (each entry carries id, placerId, lifetimeMs, etc);
    // interiorPkgs is the sparse (x,y)-keyed table.
    placedGear:   Array.isArray(S.placedGear) ? S.placedGear.slice() : [],
    interiorPkgs: S.interiorPkgs ? { ...S.interiorPkgs } : {},
    // v0.0.9.6 commit 6 — per-cell trample state (ride v9 schema,
    // additive). Sparse table; only cells with non-zero trample
    // actually persist. Multiplayer sync queued for commit 7.
    interiorTrample: S.interiorTrample ? { ...S.interiorTrample } : {},
    // v0.0.9.5.1 — dispatch log tail persisted (last ~100 rendered
    // lines). HTML includes timestamps baked in. Restored into the
    // in-session logHistory + DOM via restoreLogFromSave on load.
    log: Array.isArray(S.log) ? [...S.log] : [],
    // v0.0.9.7 — cargo log discovery state. Sparse: only labels /
    // plant ids that have been touched (state \u2260 undiscovered or
    // any reveal flag flipped) appear. Inner entries are flat objects;
    // shallow spread is enough since JSON.stringify recurses anyway.
    // v0.0.9.7.2 \u2014 `pending` carries the cargo-toggle dot state across
    // reloads so a quit-mid-discovery still surfaces the dot on return.
    cargoLog: {
      items:       (S.cargoLog && S.cargoLog.items)  ? { ...S.cargoLog.items }  : {},
      plants:      (S.cargoLog && S.cargoLog.plants) ? { ...S.cargoLog.plants } : {},
      pending:     !!(S.cargoLog && S.cargoLog.pending),
      notifyMuted: !!(S.cargoLog && S.cargoLog.notifyMuted),
    },
  };
}

export function saveGame(silent) {
  if (S._transient.wipeInProgress) return false;
  try {
    const payload = buildSavePayload();
    localStorage.setItem(C.SAVE_KEY_V9, JSON.stringify(payload));
    S._transient.lastSaveAt = payload.savedAt;
    updateSaveStrip();
    if (!silent) addLog('<span class="log-ok">progress saved</span>');
    return true;
  } catch (e) {
    const msg = e && e.message ? e.message : 'storage error';
    if (!silent) {
      addLog('<span class="log-wn">save failed: ' + msg + '</span>');
    } else if (!S._transient.silentSaveErrorShown) {
      // Surface silent-save failures ONCE per session so quota exhaustion /
      // Safari private mode can't quietly burn progress for hours.
      S._transient.silentSaveErrorShown = true;
      addLog('<span class="log-wn">autosave failed (' + msg + ') \u2014 progress not being saved. try the [save] button to retry.</span>');
    }
    return false;
  }
}

// v0.0.7.21 — extracted from loadGame so save-io.js can feed an in-memory
// payload through the same migration chain as a localStorage read. Mutates
// S in place. Returns true on success, false on any parse/schema failure.
export function applySavePayload(data) {
  if (!data) return false;
  if (data.version !== 1 && data.version !== 2 && data.version !== 3 && data.version !== 4 && data.version !== 5 && data.version !== 6 && data.version !== 7 && data.version !== 8 && data.version !== C.SAVE_VERSION) return false;
  return _applyValidated(data);
}

export function loadGame() {
  let raw;
  try { raw = localStorage.getItem(C.SAVE_KEY_V9); } catch (e) { return false; }
  if (!raw) { try { raw = localStorage.getItem(C.SAVE_KEY_V8); } catch (e) { return false; } }
  if (!raw) { try { raw = localStorage.getItem(C.SAVE_KEY_V7); } catch (e) { return false; } }
  if (!raw) { try { raw = localStorage.getItem(C.SAVE_KEY_V6); } catch (e) { return false; } }
  if (!raw) { try { raw = localStorage.getItem(C.SAVE_KEY_V5); } catch (e) { return false; } }
  if (!raw) { try { raw = localStorage.getItem(C.SAVE_KEY_V4); } catch (e) { return false; } }
  if (!raw) { try { raw = localStorage.getItem(C.SAVE_KEY_V3); } catch (e) { return false; } }
  if (!raw) { try { raw = localStorage.getItem(C.SAVE_KEY_V2); } catch (e) { return false; } }
  if (!raw) { try { raw = localStorage.getItem(C.SAVE_KEY); }    catch (e) { return false; } }
  if (!raw) return false;
  let data;
  try { data = JSON.parse(raw); } catch (e) { return false; }
  if (!data) return false;
  if (data.version !== 1 && data.version !== 2 && data.version !== 3 && data.version !== 4 && data.version !== 5 && data.version !== 6 && data.version !== 7 && data.version !== 8 && data.version !== C.SAVE_VERSION) return false;
  return _applyValidated(data);
}

function _applyValidated(data) {

  try {
    const p = data.progress || {};
    if (typeof p.delivered      === 'number') S.delivered      = p.delivered;
    if (typeof p.scrip          === 'number') S.scrip          = p.scrip;
    if (typeof p.distKm         === 'number') S.distKm         = p.distKm;
    if (typeof p.ticks          === 'number') S.ticks          = p.ticks;
    if (typeof p.maxSlots       === 'number') S.maxSlots       = p.maxSlots;
    if (typeof p.maxWeight      === 'number') S.maxWeight      = p.maxWeight;
    // v0.0.9.6.9.30b — maxWeight default was bumped 5 → 6 in
    // v0.0.9.6.9.22 (strain-gauge pass). Saves created before that
    // commit stayed at 5 because persisted values win over fresh
    // defaults. Ratchet up to 6 for any legacy save that hasn't
    // explicitly exceeded it via upgrades. Matches the existing
    // v0.0.8.6 retro-grant pattern below for trust-reward upgrades.
    if (S.maxWeight < 6) S.maxWeight = 6;
    if (typeof p.bootDurability === 'number') S.bootDurability = p.bootDurability;
    if (typeof p.bootClipCount  === 'number') S.bootClipCount  = p.bootClipCount;
    if (typeof p.bootClipMax    === 'number') S.bootClipMax    = p.bootClipMax;
    if (typeof p.usingMakeshift === 'boolean') S.usingMakeshift = p.usingMakeshift;
    if (typeof p.sandalweedCount === 'number') S.sandalweedCount = Math.max(0, Math.floor(p.sandalweedCount));
    // v0.0.9.6.9.30l — restore mid-smoke grace window; older saves
    // (no smokeGrace field) fall through to the state.js defaults.
    if (p.smokeGrace && typeof p.smokeGrace === 'object') {
      S.smokeGrace.ticksRemaining = Math.max(0, p.smokeGrace.ticksRemaining | 0);
      S.smokeGrace.magnitude      = Math.max(0, +p.smokeGrace.magnitude || 0);
    }
    if (typeof p.stamina          === 'number') S.stamina        = p.stamina;
    if (typeof p.staminaOverboost === 'boolean') S.staminaOverboost = p.staminaOverboost;
    if (typeof p.canteen          === 'number') S.canteen        = p.canteen;
    if (typeof p.autobuyBoots   === 'boolean') S.autobuyBoots   = p.autobuyBoots;
    if (typeof p.autodrink      === 'boolean') S.autodrink      = p.autodrink;
    if (typeof p.autoGrab       === 'boolean') S.autoGrab       = p.autoGrab;
    // v0.0.9.6.10.21 — grabMode is the new 3-state source of truth.
    // Migration: legacy saves only had autoGrab (boolean). Map
    // true → 'auto', false → 'off'. Live applyGrabMode() call from
    // main.js init re-syncs the pkgSwap* transients after loadGame.
    if (typeof p.grabMode === 'string' && ['auto','logic','off'].includes(p.grabMode)) {
      S.grabMode = p.grabMode;
    } else if (typeof p.autoGrab === 'boolean') {
      S.grabMode = p.autoGrab ? 'auto' : 'off';
    }
    if (typeof p.strain         === 'number')  S.strain         = Math.max(0, Math.min(1, p.strain));

    const pos = data.position || {};
    if (typeof pos.edgeIdx === 'number' && pos.edgeIdx >= 0 && pos.edgeIdx < S.edges.length) S.edgeIdx = pos.edgeIdx;
    if (typeof pos.dotT === 'number' && pos.dotT >= 0 && pos.dotT < 1) S.dotT = pos.dotT;

    // v0.0.9.5 schema-v8 migration: rim shape changed from 6-node hex to
    // 12-node rounded-square. Old edgeIdx values (0-5) technically still
    // index valid entries in the new 12-edge array but the spatial meaning
    // is scrambled. Snap the courier to tau's node (edgeIdx 10, dotT 0) —
    // the new default "home" start. Players lose mid-route position but
    // keep cargo, upgrades, trust, and inventory. Consistent with the
    // idle-game-first principle: never strand the player spatially.
    if (typeof data.version === 'number' && data.version < 8) {
      S.edgeIdx = 10;
      S.dotT    = 0;
      S.worldPos = 0;
    }

    if (Array.isArray(data.inventory)) {
      S.inventory = data.inventory.map(p => migratePkgTags({ ...p }));
      S.usedSlots  = S.inventory.reduce((sum, p) => sum + (p.slots || 0), 0);
      S.usedWeight = S.inventory.reduce((sum, p) => sum + (p.kg || 0), 0);
    }

    if (data.upgrades && typeof data.upgrades === 'object') {
      Object.keys(S.upgrades).forEach(k => {
        if (typeof data.upgrades[k] === 'boolean') S.upgrades[k] = data.upgrades[k];
      });
      if (data.upgrades.rebuildRoads === true) {
        S.upgrades.efficientConsumption = true;
      }
    }

    if (data.nodeStages && typeof data.nodeStages === 'object') {
      Object.keys(data.nodeStages).forEach(k => {
        const v = data.nodeStages[k];
        if (typeof v === 'number' && v >= 0 && v <= 3) {
          S.nodeStages[k] = Math.floor(v);
        }
      });
    } else if (data.nodesKnown && typeof data.nodesKnown === 'object') {
      Object.keys(data.nodesKnown).forEach(k => {
        if (data.nodesKnown[k] === true) S.nodeStages[k] = 3;
      });
    }

    if (data.settlements && typeof data.settlements === 'object') {
      Object.keys(data.settlements).forEach(k => {
        if (S.settlements[k] && typeof data.settlements[k].supply === 'number') {
          S.settlements[k].supply  = data.settlements[k].supply;
          S.settlements[k].rebuild = data.settlements[k].rebuild;
        }
      });
    }

    if (data.multiplayer && typeof data.multiplayer === 'object') {
      if (Array.isArray(data.multiplayer.milestonesHit)) {
        S.milestonesHit = data.multiplayer.milestonesHit.filter(m => typeof m === 'number');
      }
      if (typeof data.multiplayer.lastFeedTimestamp === 'number') {
        S.lastFeedTimestamp = data.multiplayer.lastFeedTimestamp;
      }
    }

    if (data.npcs && typeof data.npcs === 'object') {
      Object.keys(S.npcs).forEach(k => {
        const n = data.npcs[k];
        if (!n) return;
        if (typeof n.trust === 'number') {
          S.npcs[k].trust = Math.max(0, Math.min(100, Math.floor(n.trust)));
        }
        if (n.unlocks && typeof n.unlocks === 'object') {
          const legacyMap = { t25:'t20', t50:'t40', t75:'t60', t100:'t80' };
          Object.keys(n.unlocks).forEach(oldKey => {
            if (typeof n.unlocks[oldKey] !== 'boolean') return;
            const newKey = legacyMap[oldKey] || oldKey;
            if (newKey in S.npcs[k].unlocks) {
              S.npcs[k].unlocks[newKey] = n.unlocks[oldKey] || S.npcs[k].unlocks[newKey];
            }
          });
        }
        C.TRUST_THRESHOLDS.forEach(t => {
          const key = 't' + t;
          if (S.npcs[k].trust >= t && !S.npcs[k].unlocks[key]) {
            S.npcs[k].unlocks[key] = true;
          }
        });
        // v0.0.9.6.10.17 — per-profile state-field restore removed.
        // Older saves may still carry wetlandTicksSinceLastVisit /
        // kmAtLastVisit / visitedSinceLastDelta in their payload; those
        // fields are silently ignored since the profile system is gone.
        // Removing them explicitly isn't necessary — state.js no longer
        // declares the fields, so they'd land on S.npcs[k] as orphan
        // properties at most, with nothing reading them.
      });
    }

    // v0.0.9.5 commit 4: inverse retro-grant for efficientConsumption.
    // Old saves may own S.upgrades.efficientConsumption from the v0.0.8.6-
    // era scrip-shop purchase. Commit 4 retargets this upgrade as nu's
    // t20 trust reward. For existing owners, ratchet nu to t20 so the
    // attribution is correct and the v0.0.8.6 retro-grant loop below
    // doesn't try to re-apply (it's already owned). Runs BEFORE the
    // forward retro-grant so ordering is clean.
    if (S.upgrades.efficientConsumption && S.npcs['\u03bd'] && !S.npcs['\u03bd'].unlocks.t20) {
      S.npcs['\u03bd'].trust        = Math.max(20, S.npcs['\u03bd'].trust || 0);
      S.npcs['\u03bd'].unlocks.t20  = true;
    }

    // v0.0.8.6 → v0.0.9.6.9.30.5: retro-unlock trust-reward SHOP ROWS
    // for existing saves. Originally this loop auto-granted ownership
    // (trust >= tier ⇒ S.upgrades[id] = true + def.apply()), matching
    // the pre-.9.5.2 auto-grant flow. The .9.5.2 flow change moved
    // trust rewards to shop-purchasable (player pays scrip to claim),
    // but this retro-loop kept firing on every load — silently owning
    // unclaimed upgrades and bypassing the scrip cost.
    // Now: mark the shop-tier unlock (npc.unlocks[tierKey] = true) so
    // the shop row opens, but let the player pay to claim. Matches the
    // post-.9.5.2 flow exactly. Already-owned upgrades (`S.upgrades[id]`
    // already true from the pre-.9.5.2 auto-grant era) are untouched
    // and stay owned.
    UPGRADE_DEFS.forEach(def => {
      if (!def.trustReward) return;
      const npcState = S.npcs[def.trustReward.npc];
      if (!npcState) return;
      const tierKey  = def.trustReward.tier;
      const tierVal  = parseInt(tierKey.substring(1), 10);
      if (npcState.trust >= tierVal && !S.upgrades[def.id]) {
        if (!npcState.unlocks) {
          npcState.unlocks = { t20: false, t40: false, t60: false, t80: false };
        }
        npcState.unlocks[tierKey] = true;
      }
    });

    // v0.0.8.6: restore weatherRadio object if the upgrade flag is set
    // but the object wasn't persisted (pre-.6 save migration path).
    if (S.upgrades.weatherRadio && !S.weatherRadio) {
      S.weatherRadio = { unlocked: true };
    }

    // v0.0.9.6 commit 4 — kit inventory for placeable gear. Saves
    // from before this commit won't have a kit field; seed defaults.
    if (data.kit && typeof data.kit === 'object') {
      S.kit = {
        ladders:  typeof data.kit.ladders  === 'number' ? Math.max(0, Math.floor(data.kit.ladders))  : 0,
        anchors:  typeof data.kit.anchors  === 'number' ? Math.max(0, Math.floor(data.kit.anchors))  : 0,
        autoGear: data.kit.autoGear !== false,  // default ON
      };
    }

    // v0.0.9.6 commit 5 (schema v9) — world-overlay placed structures
    // + interior pkg table. Pre-v9 saves lack both; seed empty. Re-
    // seeding interior pkgs happens at world-init when the save has
    // an empty interiorPkgs table, so upgraded saves get fresh
    // content on first tick.
    if (Array.isArray(data.placedGear)) {
      S.placedGear = data.placedGear.filter(g => g && g.id && g.type).map(g => ({
        id:              String(g.id),
        placerId:        g.placerId || null,
        type:            g.type,
        x:               +g.x || 0,
        y:               +g.y || 0,
        placedWallClock: +g.placedWallClock || Date.now(),
        lifetimeMs:      +g.lifetimeMs || (12 * 3600 * 1000),
        stormDecayExtra: +g.stormDecayExtra || 0,
      }));
    } else {
      S.placedGear = [];
    }
    if (data.interiorPkgs && typeof data.interiorPkgs === 'object') {
      S.interiorPkgs = {};
      for (const k of Object.keys(data.interiorPkgs)) {
        const e = data.interiorPkgs[k];
        if (!e || !e.pkg) continue;
        S.interiorPkgs[k] = {
          x: +e.x || 0,
          y: +e.y || 0,
          terrainOrigin: e.terrainOrigin,
          pkg: migratePkgTags({ ...e.pkg }),
          respawnIn: +e.respawnIn || 0,
          picked: !!e.picked,
        };
      }
    } else {
      S.interiorPkgs = {};
    }

    // v0.0.9.6 commit 6 — per-cell trample. Sparse table; pre-commit
    // saves have no field so default empty. Values clamped to 0..1
    // defensively in case of future-incompatible data.
    if (data.interiorTrample && typeof data.interiorTrample === 'object') {
      S.interiorTrample = {};
      for (const k of Object.keys(data.interiorTrample)) {
        const v = +data.interiorTrample[k];
        if (isFinite(v) && v > 0) {
          S.interiorTrample[k] = Math.min(1, Math.max(0, v));
        }
      }
    } else {
      S.interiorTrample = {};
    }

    // v0.0.7.21 (schema v6) — sticky gun + scanner.
    // Missing fields (v5 save being migrated up) leave defaults intact.
    if (data.stickyGun && typeof data.stickyGun === 'object') {
      const g = data.stickyGun;
      S.stickyGun = {
        ammo: typeof g.ammo === 'number' ? Math.max(0, Math.floor(g.ammo)) : 0,
        ammoMax: typeof g.ammoMax === 'number' ? g.ammoMax : C.STICKY_GUN_AMMO_MAX,
        holstered: !!g.holstered,
      };
    } else {
      S.stickyGun = null;
    }
    if (data.scanner && typeof data.scanner === 'object') {
      const sc = data.scanner;
      if (typeof sc.unlocked === 'boolean') S.scanner.unlocked = sc.unlocked;
      if (typeof sc.level === 'number') S.scanner.level = Math.max(0, Math.floor(sc.level));
      if (typeof sc.manualCooldown === 'number') S.scanner.manualCooldown = Math.max(0, Math.floor(sc.manualCooldown));
      if (typeof sc.autoTimer === 'number') S.scanner.autoTimer = Math.max(0, Math.floor(sc.autoTimer));
      if (typeof sc.buffActive === 'boolean') S.scanner.buffActive = sc.buffActive;
      if (typeof sc.buffRemaining === 'number') S.scanner.buffRemaining = Math.max(0, Math.floor(sc.buffRemaining));
      if (typeof sc.buffMagnitude === 'number') S.scanner.buffMagnitude = sc.buffMagnitude;
    }

    // v0.0.9.5 (schema v8) — battery is now persisted. Old saves (v<8)
    // don't have data.battery; defaults from state.js stand.
    if (data.battery && typeof data.battery === 'object') {
      if (typeof data.battery.charge === 'number') {
        S.battery.charge = Math.max(0, Math.min(data.battery.max || 100, data.battery.charge));
      }
      if (typeof data.battery.max === 'number') {
        S.battery.max = Math.max(1, Math.floor(data.battery.max));
      }
    }

    // v0.0.9.6.9.30h — exoskeleton state. Additive on v9 — absent in
    // older saves, defaults stand; retro-grant from upgrade flags
    // below handles the case where the player already bought the
    // gift on a pre-.30h save (flag set, state field missing).
    if (data.exoskeleton && typeof data.exoskeleton === 'object') {
      if (typeof data.exoskeleton.unlocked === 'boolean') S.exoskeleton.unlocked = data.exoskeleton.unlocked;
      if (typeof data.exoskeleton.level === 'number')     S.exoskeleton.level    = Math.max(0, Math.min(2, data.exoskeleton.level | 0));
    }
    // Retro-grant: if the save has exoskeleton1/2 flags set but no
    // state record, reconstruct level from the flags. Covers saves
    // made between .5 (flag-only stubs) and .30h (state shape added).
    if (S.upgrades && (S.upgrades.exoskeleton1 || S.upgrades.exoskeleton2) && !S.exoskeleton.unlocked) {
      S.exoskeleton.unlocked = true;
      S.exoskeleton.level    = S.upgrades.exoskeleton2 ? 2 : 1;
    }

    // v0.0.9.6.9.30i — mobile carrier state. Same additive pattern +
    // retro-grant from upgrade flags. Cart inventory restored as an
    // array; per-pkg shape matches S.inventory entries so no extra
    // migration needed (pkgs from before .30i just didn't exist in
    // this bucket anyway).
    if (data.carrier && typeof data.carrier === 'object') {
      const c = data.carrier;
      if (typeof c.unlocked === 'boolean')        S.carrier.unlocked = c.unlocked;
      if (typeof c.level    === 'number')         S.carrier.level    = Math.max(0, Math.min(2, c.level | 0));
      if (typeof c.deployed === 'boolean')        S.carrier.deployed = c.deployed;
      if (typeof c.autoDeployArmed === 'boolean') S.carrier.autoDeployArmed = c.autoDeployArmed;
      if (typeof c.safeTerrainTicks === 'number') S.carrier.safeTerrainTicks = Math.max(0, c.safeTerrainTicks | 0);
      if (Array.isArray(c.inventory))             S.carrier.inventory = c.inventory.map(p => migratePkgTags({ ...p }));
    }
    // Retro-grant: upgrade flag → state reconstruction. Default
    // deployed=true for the "new cart arrives rolling" UX (same as
    // the apply callback). Saves that DID have carrier state
    // already restored it above and skip this branch.
    if (S.upgrades && (S.upgrades.mobileCarrier1 || S.upgrades.mobileCarrier2) && !S.carrier.unlocked) {
      S.carrier.unlocked = true;
      S.carrier.level    = S.upgrades.mobileCarrier2 ? 2 : 1;
      S.carrier.deployed = true;
      S.carrier.inventory = [];
    }

    // v0.0.8 (schema v7) — weather system.
    // Old saves (v6 and earlier) have no storm data — start with empty
    // storms[] and let initWeather() schedule a spawn. isRaining was
    // never in the save payload so no migration needed for that.
    // v0.0.9.6 commit 7 — storms migrated to (x, y, dx, dy). Old-
    // shape entries (with primaryCell / edgeIdx / t but no x/y) are
    // DROPPED on load. Storms are transient in-session state; losing
    // a couple of active storms at upgrade time is acceptable —
    // initWeather schedules fresh spawns immediately.
    if (Array.isArray(data.storms)) {
      S.storms = data.storms
        .filter(s => s && typeof s.type === 'string' && C.STORM_TYPES[s.type]
                     && typeof s.x === 'number' && typeof s.y === 'number')
        .map(s => ({
          id:               typeof s.id === 'number' ? s.id : 0,
          type:             s.type,
          x:                +s.x,
          y:                +s.y,
          dx:               typeof s.dx === 'number' ? s.dx : 0,
          dy:               typeof s.dy === 'number' ? s.dy : 0,
          secondaryOffsetX: typeof s.secondaryOffsetX === 'number' ? s.secondaryOffsetX : 20,
          secondaryOffsetY: typeof s.secondaryOffsetY === 'number' ? s.secondaryOffsetY : 0,
          age:              typeof s.age === 'number' ? Math.max(0, s.age) : 0,
          seed:             typeof s.seed === 'number' ? s.seed : Math.floor(Math.random() * 100000),
          isInterior:       !!s.isInterior,
          intersects:       [],
        }));
    } else {
      S.storms = [];
    }
    if (typeof data.nextStormSpawnTick === 'number') {
      S.nextStormSpawnTick = data.nextStormSpawnTick;
    }
    if (typeof data.nextStormType === 'string' && C.STORM_TYPES[data.nextStormType]) {
      S.nextStormType = data.nextStormType;
    }
    // v0.0.9.6 commit 7 — composite next-storm preroll restore.
    if (data.nextStormSpawn && typeof data.nextStormSpawn === 'object'
        && C.STORM_TYPES[data.nextStormSpawn.type]
        && typeof data.nextStormSpawn.x === 'number'
        && typeof data.nextStormSpawn.y === 'number') {
      S.nextStormSpawn = {
        type:         data.nextStormSpawn.type,
        x:            +data.nextStormSpawn.x,
        y:            +data.nextStormSpawn.y,
        isInterior:   !!data.nextStormSpawn.isInterior,
        nearestNpcId: data.nextStormSpawn.nearestNpcId || null,
      };
    } else {
      S.nextStormSpawn = null;
    }
    // v0.0.8.7 — weather radio level migration. Old saves (v0.0.8.6)
    // have weatherRadio = { unlocked: true } without a level field.
    if (S.weatherRadio && typeof S.weatherRadio.level !== 'number') {
      S.weatherRadio.level = 1;
    }

    // v0.0.9.5.1 — dispatch log restore. Accept any string array; cap
    // on read in case the saved slice somehow grew past LOG_PERSIST_CAP
    // (e.g. changed cap between versions). DOM re-render happens from
    // main.init after all state is in place.
    if (Array.isArray(data.log)) {
      S.log = data.log.filter(x => typeof x === 'string').slice(-100);
    } else {
      S.log = [];
    }

    // v0.0.9.7 — cargo log restore. Accept the saved sparse map; defensively
    // wrap missing branches so a pre-v0.0.9.7 save loads cleanly. Renderer
    // tolerates entries with missing fields via its `|| { ... }` fallback.
    S.cargoLog = {
      items:       (data.cargoLog && typeof data.cargoLog.items  === 'object' && data.cargoLog.items)  ? { ...data.cargoLog.items }  : {},
      plants:      (data.cargoLog && typeof data.cargoLog.plants === 'object' && data.cargoLog.plants) ? { ...data.cargoLog.plants } : {},
      pending:     !!(data.cargoLog && data.cargoLog.pending),
      notifyMuted: !!(data.cargoLog && data.cargoLog.notifyMuted),
    };

    S._transient.lastSaveAt = data.savedAt || 0;
    S.status = S.inventory.length > 0 ? 'carrying' : 'walking';

    if (data.version !== C.SAVE_VERSION) {
      try {
        localStorage.removeItem(C.SAVE_KEY);
        localStorage.removeItem(C.SAVE_KEY_V2);
        localStorage.removeItem(C.SAVE_KEY_V3);
        localStorage.removeItem(C.SAVE_KEY_V4);
        localStorage.removeItem(C.SAVE_KEY_V5);
        localStorage.removeItem(C.SAVE_KEY_V6);
        localStorage.removeItem(C.SAVE_KEY_V7);
        saveGame(true);
      } catch (e) {}
    }
    return true;
  } catch (e) {
    return false;
  }
}

export function wipeSave() {
  try {
    // v0.0.9.6.9.30m — V9 key was missing from the wipe list. Without
    // this line loadGame()'s V9-first priority reloads the active save
    // on the post-wipe reload, so the wipe silently didn't take.
    localStorage.removeItem(C.SAVE_KEY_V9);
    localStorage.removeItem(C.SAVE_KEY_V8);
    localStorage.removeItem(C.SAVE_KEY_V7);
    localStorage.removeItem(C.SAVE_KEY_V6);
    localStorage.removeItem(C.SAVE_KEY_V5);
    localStorage.removeItem(C.SAVE_KEY_V4);
    localStorage.removeItem(C.SAVE_KEY_V3);
    localStorage.removeItem(C.SAVE_KEY_V2);
    localStorage.removeItem(C.SAVE_KEY);
  } catch (e) {}
  S._transient.lastSaveAt = 0;
  updateSaveStrip();
}

function fmtAgo(ms) {
  if (!S._transient.lastSaveAt) return 'no save yet';
  // v0.0.9.6.10.23 — clamp delta non-negative so a clock-set-back doesn't
  // surface "saved -42s ago" in the UI.
  const secs = Math.max(0, Math.floor((Date.now() - S._transient.lastSaveAt) / 1000));
  if (secs < 5)   return 'just now';
  if (secs < 60)  return secs + 's ago';
  const mins = Math.floor(secs / 60);
  if (mins < 60)  return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  return Math.floor(hours / 24) + 'd ago';
}

export function updateSaveStrip() {
  if (!els.saveAgo) return;
  els.saveAgo.textContent = fmtAgo();
}

export function armWipe() {
  const t = S._transient;
  if (t.wipeArmed) {
    clearTimeout(t.wipeTimer);
    t.wipeArmed = false;
    t.wipeInProgress = true;
    wipeSave();
    if (els.wipeBtn) {
      els.wipeBtn.textContent = 'wipe save';
      els.wipeBtn.classList.remove('armed');
    }
    addLog('<span class="log-wn">save wiped</span> \u2014 reloading for a fresh start...');
    setTimeout(() => { try { location.reload(); } catch (e) {} }, 400);
    return;
  }
  t.wipeArmed = true;
  if (els.wipeBtn) {
    els.wipeBtn.textContent = 'click again to confirm';
    els.wipeBtn.classList.add('armed');
  }
  t.wipeTimer = setTimeout(() => {
    t.wipeArmed = false;
    if (els.wipeBtn) {
      els.wipeBtn.textContent = 'wipe save';
      els.wipeBtn.classList.remove('armed');
    }
  }, 4000);
}
