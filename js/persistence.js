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

import { S } from './state.js';
import * as C from './constants.js';
import { addLog } from './render/log.js';
import { UPGRADE_DEFS } from './data/upgrades.js';

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
      stamina:          S.stamina,
      staminaOverboost: S.staminaOverboost,
      canteen:          S.canteen,
      autobuyBoots:   S.autobuyBoots,
      autodrink:      S.autodrink,
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
  };
}

export function saveGame(silent) {
  if (S._transient.wipeInProgress) return false;
  try {
    const payload = buildSavePayload();
    localStorage.setItem(C.SAVE_KEY_V6, JSON.stringify(payload));
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
  if (data.version !== 1 && data.version !== 2 && data.version !== 3 && data.version !== 4 && data.version !== 5 && data.version !== C.SAVE_VERSION) return false;
  return _applyValidated(data);
}

export function loadGame() {
  let raw;
  try { raw = localStorage.getItem(C.SAVE_KEY_V6); } catch (e) { return false; }
  if (!raw) { try { raw = localStorage.getItem(C.SAVE_KEY_V5); } catch (e) { return false; } }
  if (!raw) { try { raw = localStorage.getItem(C.SAVE_KEY_V4); } catch (e) { return false; } }
  if (!raw) { try { raw = localStorage.getItem(C.SAVE_KEY_V3); } catch (e) { return false; } }
  if (!raw) { try { raw = localStorage.getItem(C.SAVE_KEY_V2); } catch (e) { return false; } }
  if (!raw) { try { raw = localStorage.getItem(C.SAVE_KEY); }    catch (e) { return false; } }
  if (!raw) return false;
  let data;
  try { data = JSON.parse(raw); } catch (e) { return false; }
  if (!data) return false;
  if (data.version !== 1 && data.version !== 2 && data.version !== 3 && data.version !== 4 && data.version !== 5 && data.version !== C.SAVE_VERSION) return false;
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
    if (typeof p.bootDurability === 'number') S.bootDurability = p.bootDurability;
    if (typeof p.bootClipCount  === 'number') S.bootClipCount  = p.bootClipCount;
    if (typeof p.bootClipMax    === 'number') S.bootClipMax    = p.bootClipMax;
    if (typeof p.usingMakeshift === 'boolean') S.usingMakeshift = p.usingMakeshift;
    if (typeof p.sandalweedCount === 'number') S.sandalweedCount = Math.max(0, Math.floor(p.sandalweedCount));
    if (typeof p.stamina          === 'number') S.stamina        = p.stamina;
    if (typeof p.staminaOverboost === 'boolean') S.staminaOverboost = p.staminaOverboost;
    if (typeof p.canteen          === 'number') S.canteen        = p.canteen;
    if (typeof p.autobuyBoots   === 'boolean') S.autobuyBoots   = p.autobuyBoots;
    if (typeof p.autodrink      === 'boolean') S.autodrink      = p.autodrink;

    const pos = data.position || {};
    if (typeof pos.edgeIdx === 'number' && pos.edgeIdx >= 0 && pos.edgeIdx < S.edges.length) S.edgeIdx = pos.edgeIdx;
    if (typeof pos.dotT === 'number' && pos.dotT >= 0 && pos.dotT < 1) S.dotT = pos.dotT;

    if (Array.isArray(data.inventory)) {
      S.inventory = data.inventory.map(p => ({ ...p }));
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
      });
    }

    // v0.0.8.6: retro-grant trust-reward upgrades for existing saves.
    // If a player's NPC trust already exceeds a reward tier but the
    // upgrade isn't owned (pre-.6 save), auto-apply it now.
    UPGRADE_DEFS.forEach(def => {
      if (!def.trustReward) return;
      const npcState = S.npcs[def.trustReward.npc];
      if (!npcState) return;
      const tierVal = parseInt(def.trustReward.tier.substring(1), 10);
      if (npcState.trust >= tierVal && !S.upgrades[def.id]) {
        S.upgrades[def.id] = true;
        def.apply();
      }
    });

    // v0.0.8.6: restore weatherRadio object if the upgrade flag is set
    // but the object wasn't persisted (pre-.6 save migration path).
    if (S.upgrades.weatherRadio && !S.weatherRadio) {
      S.weatherRadio = { unlocked: true };
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

    S._transient.lastSaveAt = data.savedAt || 0;
    S.status = S.inventory.length > 0 ? 'carrying' : 'walking';

    if (data.version !== C.SAVE_VERSION) {
      try {
        localStorage.removeItem(C.SAVE_KEY);
        localStorage.removeItem(C.SAVE_KEY_V2);
        localStorage.removeItem(C.SAVE_KEY_V3);
        localStorage.removeItem(C.SAVE_KEY_V4);
        localStorage.removeItem(C.SAVE_KEY_V5);
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
  const secs = Math.floor((Date.now() - S._transient.lastSaveAt) / 1000);
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
