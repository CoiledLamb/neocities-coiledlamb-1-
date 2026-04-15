/* ==============================================
   THE LONG HAUL — admin channel (v0.0.7.22)

   Replaces the in-game admin bar from v0.0.7.21. Commands now
   arrive over a same-origin BroadcastChannel from
   admin/blog-admin.html's TLH tab. Game listens, authenticates
   each message via SHA-256 compare against C.ADMIN_TOKEN_SHA,
   dispatches to a mutator on match.

   Channel name: 'tlh-admin'

   Message shape (admin -> game):
     { token: <plaintext>, cmd: <string>, args: <object>, replyId: <opt> }

   Reply shape (game -> admin):
     { replyId: <matches>, ok: <bool>, result: <data> | err: <string> }

   Auth: every message's `token` is SHA-256'd and compared to
   C.ADMIN_TOKEN_SHA. If ADMIN_TOKEN_SHA is null, all messages
   are rejected (channel is effectively inert). This is the same
   gate as the v0.0.7.21 URL-hash approach — just applied per-
   message instead of per-session.

   window._tlhAdminHash(token) is kept exposed from the old
   admin.js for one-time token setup (print hex → paste into
   constants.js).

   Commands: see dispatch() below. Grouped:
     - ping: state snapshot + version info
     - resources: setScrip, addScrip, setCanteen, setStamina,
       setBootDurability, setBootClip, setSandalweed
     - trust: setTrust, maxAllTrust
     - world: teleport, toggleRain, forceTrip, clearInventory
     - milestones: toggleMilestone, clearAllMilestones
     - porter: setPorterId
     - save: dumpState, reloadPage
   ============================================== */
'use strict';

import { S } from './state.js';
import * as C from './constants.js';
import { addLog } from './render/log.js';
import { updateHUD, renderCargoSlots, renderCourierStack } from './render/hud.js';
import { renderSettlements } from './render/settlements.js';
import { drawRouteMap, updateRouteDot } from './render/route-map.js';
import { renderNetwork } from './render/network.js';
import * as Boots from './boots.js';
import * as Stamina from './stamina.js';

async function sha256Hex(text) {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyToken(token) {
  if (!C.ADMIN_TOKEN_SHA) return false;
  if (typeof token !== 'string' || !token) return false;
  try {
    const hex = await sha256Hex(token);
    return hex === C.ADMIN_TOKEN_SHA;
  } catch (e) {
    return false;
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function repaintAll() {
  // Full repaint after any admin mutation. Not every cmd needs every
  // paint, but the convenience of "it's always consistent" outweighs
  // the cost (admin is rare + local).
  try { renderCargoSlots(true); } catch (e) {}
  try { renderCourierStack(); } catch (e) {}
  try { Boots.renderBoots(); } catch (e) {}
  try { Stamina.renderStamina(); } catch (e) {}
  try { renderSettlements(); } catch (e) {}
  try { drawRouteMap(); } catch (e) {}
  try { updateRouteDot(); } catch (e) {}
  try { renderNetwork(); } catch (e) {}
  try { updateHUD(); } catch (e) {}
}

function stateSnapshot() {
  return {
    version: '0.0.7.22',
    scrip: S.scrip,
    delivered: S.delivered,
    distKm: S.distKm,
    ticks: S.ticks,
    status: S.status,
    edgeIdx: S.edgeIdx,
    dotT: S.dotT,
    stamina: S.stamina,
    staminaMax: S.staminaMax,
    canteen: S.canteen,
    canteenMax: S.canteenMax,
    bootDurability: S.bootDurability,
    bootClipCount: S.bootClipCount,
    bootClipMax: S.bootClipMax,
    sandalweedCount: S.sandalweedCount,
    isRaining: S.isRaining,
    milestonesHit: [...S.milestonesHit],
    availableMilestones: [...C.DIST_MILESTONES],
    nodeIds: S.routeNodes.map(n => n.id),
    npcs: Object.keys(S.npcs).reduce((acc, k) => {
      acc[k] = { trust: S.npcs[k].trust, unlocks: { ...S.npcs[k].unlocks } };
      return acc;
    }, {}),
    porterId: (function () {
      try { return localStorage.getItem('tlh-porter-id') || null; } catch (e) { return null; }
    })(),
    inventoryCount: S.inventory.length,
    stickyGun: S.stickyGun ? { ammo: S.stickyGun.ammo, ammoMax: S.stickyGun.ammoMax, holstered: S.stickyGun.holstered } : null,
    scannerUnlocked: S.scanner.unlocked,
  };
}

function dispatch(cmd, args) {
  switch (cmd) {
    case 'ping':
      return stateSnapshot();

    // ----- resources -----
    case 'setScrip': {
      S.scrip = Math.max(0, Math.floor(args.value || 0));
      addLog(`<span class="log-wn">[admin]</span> scrip = ${S.scrip}\u00a2`);
      repaintAll();
      return true;
    }
    case 'addScrip': {
      const delta = Math.floor(args.value || 0);
      S.scrip = Math.max(0, S.scrip + delta);
      addLog(`<span class="log-wn">[admin]</span> ${delta >= 0 ? '+' : ''}${delta}\u00a2 (now ${S.scrip}\u00a2)`);
      repaintAll();
      return true;
    }
    case 'setCanteen': {
      S.canteen = clamp(Math.floor(args.value || 0), 0, S.canteenMax);
      addLog(`<span class="log-wn">[admin]</span> canteen = ${S.canteen}/${S.canteenMax}`);
      repaintAll();
      return true;
    }
    case 'setStamina': {
      S.stamina = clamp(Math.floor(args.value || 0), 0, S.staminaMax);
      S.staminaOverboost = S.stamina > S.staminaMax;
      addLog(`<span class="log-wn">[admin]</span> stamina = ${S.stamina}/${S.staminaMax}`);
      repaintAll();
      return true;
    }
    case 'setBootDurability': {
      S.bootDurability = clamp(Math.floor(args.value || 0), 0, 100);
      addLog(`<span class="log-wn">[admin]</span> bootDurability = ${S.bootDurability}%`);
      repaintAll();
      return true;
    }
    case 'setBootClip': {
      S.bootClipCount = clamp(Math.floor(args.value || 0), 0, S.bootClipMax);
      addLog(`<span class="log-wn">[admin]</span> bootClip = ${S.bootClipCount}/${S.bootClipMax}`);
      repaintAll();
      return true;
    }
    case 'setSandalweed': {
      S.sandalweedCount = Math.max(0, Math.floor(args.value || 0));
      addLog(`<span class="log-wn">[admin]</span> sandalweed = ${S.sandalweedCount}`);
      repaintAll();
      return true;
    }

    // ----- trust -----
    case 'setTrust': {
      const id = String(args.npcId || '');
      if (!S.npcs[id]) throw new Error('unknown npc: ' + id);
      const v = clamp(Math.floor(args.value || 0), 0, 100);
      S.npcs[id].trust = v;
      // Sync unlocks forward (admin doesn't un-unlock — matches in-game v0.0.7.21 behavior).
      C.TRUST_THRESHOLDS.forEach(t => {
        const key = 't' + t;
        if (v >= t && !S.npcs[id].unlocks[key]) S.npcs[id].unlocks[key] = true;
      });
      addLog(`<span class="log-wn">[admin]</span> ${id} trust = ${v}`);
      repaintAll();
      return true;
    }
    case 'maxAllTrust': {
      Object.keys(S.npcs).forEach(id => {
        S.npcs[id].trust = 100;
        C.TRUST_THRESHOLDS.forEach(t => { S.npcs[id].unlocks['t' + t] = true; });
      });
      addLog('<span class="log-wn">[admin]</span> all trust \u2192 100');
      repaintAll();
      return true;
    }

    // ----- world -----
    case 'teleport': {
      // args: { nodeId } — set edgeIdx so that the courier is about to
      // arrive at nodeId. Using dotT=0.99 means the next tick's rollover
      // in main.js will fire tryDeliver for nodeId without further walking.
      const nodeId = String(args.nodeId || '');
      const edgeIndex = S.edges.findIndex(e => e[1] === nodeId);
      if (edgeIndex < 0) throw new Error('unknown node: ' + nodeId);
      S.edgeIdx = edgeIndex;
      S.dotT = 0.99;
      S._transient.lastDistEdgeIdx = null;
      S._transient.lastDistDotT = null;
      addLog(`<span class="log-wn">[admin]</span> teleport \u2192 ${nodeId}`);
      repaintAll();
      return true;
    }
    case 'toggleRain': {
      S.isRaining = !S.isRaining;
      // Schedule an end/start tick so the scheduler doesn't immediately
      // revert us — give ~100 ticks before the next transition.
      if (S.isRaining) {
        S._transient.nextRainEndTick = S.ticks + 100;
      } else {
        S._transient.nextRainStartTick = S.ticks + 300;
      }
      const rainEl = S._transient.els.rainOverlay;
      if (rainEl) rainEl.style.display = S.isRaining ? 'block' : 'none';
      addLog(`<span class="log-wn">[admin]</span> rain ${S.isRaining ? 'on' : 'off'}`);
      return true;
    }
    case 'forceTrip': {
      // Set a one-shot flag that trip.js can read, OR just bash the state
      // directly. Simpler: damage boots so trip chance spikes next tick,
      // and trip the courier right now.
      if (S.status !== 'walking' && S.status !== 'carrying') {
        throw new Error('can\'t trip while ' + S.status);
      }
      S.status = 'tripped';
      S.tripTimer = 6;
      S.bootDurability = Math.max(0, S.bootDurability - 5);
      const atEl = S._transient.els.courierAt;
      if (atEl) { atEl.className = 'tlh-at trip'; atEl.style.animation = 'trip 0.4s ease 3'; }
      addLog(`<span class="log-wn">[admin]</span> force trip`);
      repaintAll();
      return true;
    }
    case 'clearInventory': {
      const n = S.inventory.length;
      S.inventory.length = 0;
      S.usedSlots = 0;
      S.usedWeight = 0;
      if (S.status === 'carrying') S.status = 'walking';
      addLog(`<span class="log-wn">[admin]</span> cleared inventory (${n} pkgs)`);
      repaintAll();
      return true;
    }

    // ----- milestones -----
    case 'toggleMilestone': {
      const km = Math.floor(args.value || 0);
      const idx = S.milestonesHit.indexOf(km);
      if (idx >= 0) {
        S.milestonesHit.splice(idx, 1);
        addLog(`<span class="log-wn">[admin]</span> milestone ${km}km cleared (will re-fire)`);
      } else {
        S.milestonesHit.push(km);
        S.milestonesHit.sort((a, b) => a - b);
        addLog(`<span class="log-wn">[admin]</span> milestone ${km}km marked hit (suppressed)`);
      }
      return true;
    }
    case 'clearAllMilestones': {
      const n = S.milestonesHit.length;
      S.milestonesHit.length = 0;
      addLog(`<span class="log-wn">[admin]</span> cleared ${n} milestone(s)`);
      return true;
    }

    // ----- porter -----
    case 'setPorterId': {
      // args: { id } — full PTR-XXXX-XXXX. Basic validation.
      const id = String(args.id || '').toUpperCase();
      if (!/^PTR-[0-9A-F]{4}-[0-9A-F]{4}$/.test(id)) {
        throw new Error('invalid porter id (expect PTR-XXXX-XXXX hex)');
      }
      try {
        localStorage.setItem('tlh-porter-id', id);
        S._transient.porterIdCached = id;
        const el = S._transient.els.porterIdEl;
        if (el) el.textContent = id;
        addLog(`<span class="log-wn">[admin]</span> porter id \u2192 ${id}`);
        return true;
      } catch (e) {
        throw new Error('localStorage write failed: ' + (e.message || e));
      }
    }

    // ----- save / reload -----
    case 'dumpState':
      return stateSnapshot();
    case 'reloadPage':
      setTimeout(() => { try { location.reload(); } catch (e) {} }, 100);
      return true;

    default:
      throw new Error('unknown cmd: ' + cmd);
  }
}

export function initAdminChannel() {
  // Always expose the hash helper (safe; just hashes a string).
  try {
    window._tlhAdminHash = async (token) => {
      const hex = await sha256Hex(String(token));
      console.log('SHA-256:', hex);
      console.log('Paste into js/constants.js as ADMIN_TOKEN_SHA (quoted).');
      return hex;
    };
  } catch (e) {}

  if (typeof BroadcastChannel === 'undefined') return; // older browsers

  let channel;
  try {
    channel = new BroadcastChannel('tlh-admin');
  } catch (e) {
    return;
  }

  channel.addEventListener('message', async (ev) => {
    const msg = ev.data || {};
    const { token, cmd, args, replyId } = msg;

    const authed = await verifyToken(token);
    if (!authed) {
      if (replyId) channel.postMessage({ replyId, ok: false, err: 'auth' });
      return;
    }
    try {
      const result = await dispatch(cmd, args || {});
      if (replyId) channel.postMessage({ replyId, ok: true, result });
    } catch (e) {
      if (replyId) channel.postMessage({ replyId, ok: false, err: String((e && e.message) || e) });
    }
  });
}
