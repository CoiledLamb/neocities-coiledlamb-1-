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

import { S } from './state.js?v=096-10-21';
import * as C from './constants.js?v=096-10-21';
import { addLog } from './render/log.js?v=096-10-21';
import { updateHUD, renderCargoSlots, renderCourierStack } from './render/hud.js?v=096-10-21';
import { renderSettlements } from './render/settlements.js?v=096-10-21';
import { drawRouteMap, updateRouteDot } from './render/route-map.js?v=096-10-21';
import { renderNetwork } from './render/network.js?v=096-10-21';
import * as Boots from './boots.js?v=096-10-21';
import * as Stamina from './stamina.js?v=096-10-21';
import { adminToggleStorm, weatherAtCourier } from './weather.js?v=096-10-21';

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
    storms: S.storms.length,
    weather: weatherAtCourier().intensity,
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

    // v0.0.9.6.9 — sim harness admin hooks
    case 'sim': {
      // eslint-disable-next-line no-console
      return import('./sim.js?v=096-10-21').then(mod => {
        const ticks = (args && args.n) || 50000;
        const report = mod.runSimulation({ ticks });
        addLog(`<span class="log-hi">sim complete</span>: ${ticks} ticks in ${report.meta.duration_real_ms}ms`);
        addLog(`  delivered ${report.counters['pkg.delivered']||0} | trips ${report.counters['trip.fired']||0} | storms ${report.counters['storm.spawned']||0}`);
        // Log compactly to console for dev inspection
        console.log('[sim] report', report);
        return { ok: true, ticks: report.meta.ticks };
      });
    }
    case 'simBatch': {
      return import('./sim.js?v=096-10-21').then(async mod => {
        const runs  = (args && args.runs) || 20;
        const ticks = (args && args.n) || 50000;
        addLog(`<span class="log-hi">sim batch starting</span>: ${runs} runs × ${ticks} ticks…`);
        const batch = await mod.runBatch({ runs, ticks });
        const sum = mod.summarizeBatch(batch);
        console.log('[sim] batch summary\n' + sum);
        console.log('[sim] full batch:', batch);
        addLog(`<span class="log-hi">batch done</span>: ${runs} runs — see console`);
        return { ok: true, summary: sum };
      });
    }
    case 'simDownload': {
      return import('./sim.js?v=096-10-21').then(mod => {
        const ok = mod.downloadLastBatch();
        return { ok };
      });
    }
    // v0.0.9.6.10.10 — battery-economy scenario harness.
    // v0.0.9.6.10.11 — reshaped from 3-arm (A/B/C) to 5-stage
    // accumulating timeline. A (no upgrades) dropped since it read
    // 100% charge trivially (nothing draws). Stages simulate a
    // realistic build order: scanner first (xi t20), then exo (pi
    // t20/t40), then carrier (gamma t20/t40), then solar (delta
    // t20), then rainfall turbine (delta t40). Each stage includes
    // all prior upgrades, so diffs between rows are the marginal
    // impact of adding the next upgrade to the pile.
    // Metrics: mean time at 0 charge, mean time at full, mean
    // charge, delivered, trips. Args: { runs, loops, ticks }.
    case 'batteryEconomy': {
      return import('./sim.js?v=096-10-21').then(async mod => {
        const runs  = (args && args.runs)  || 8;
        const loops = (args && args.loops) || 10;
        const ticks = (args && args.ticks) || 60000;
        const scanner  = ['scannerT1', 'scannerT2'];
        const exo      = scanner.concat(['exoskeleton1', 'exoskeleton2']);
        const carrier  = exo.concat(['mobileCarrier1', 'mobileCarrier2']);
        const solar    = carrier.concat(['solarPanel']);
        const turbine  = solar.concat(['rainfallTurbine']);
        const scenarios = [
          { name: 'T1_scanner',        preown: scanner },
          { name: 'T2_plus_exo',       preown: exo },
          { name: 'T3_plus_carrier',   preown: carrier },
          { name: 'T4_plus_solar',     preown: solar },
          { name: 'T5_plus_turbine',   preown: turbine },
        ];
        addLog(`<span class="log-hi">battery economy scenarios</span>: ${runs}\u00d7${loops} loops, cap ${ticks} ticks each`);
        const results = [];
        for (const sc of scenarios) {
          const batch = await mod.runBatch({ runs, loops, ticks, preownUpgrades: sc.preown, autoUpgrade: false });
          results.push({ name: sc.name, preown: sc.preown, batch });
          addLog(`  ${sc.name} \u2014 ${batch.reports.length} runs done`);
        }
        // Summarize — pull battery.time accumulators out of each batch aggregate.
        const rows = results.map(r => {
          const ag    = r.batch.aggregate;
          const acc   = ag.accumSum || {};
          const bt    = acc['battery.time'] || {};
          const bc    = acc['battery.charge_sum'] || {};
          const zero  = (bt.zero_ticks  && bt.zero_ticks.mean)  || 0;
          const full  = (bt.full_ticks  && bt.full_ticks.mean)  || 0;
          const total = (bt.total_ticks && bt.total_ticks.mean) || 1;
          const chargeSum = (bc.total && bc.total.mean) || 0;
          const meanCharge = chargeSum / total;
          const delivered = (ag.counters['pkg.delivered'] && ag.counters['pkg.delivered'].mean) || 0;
          return {
            scenario:       r.name,
            mean_charge:    +meanCharge.toFixed(1),
            zero_pct:       +(100 * zero  / total).toFixed(1),
            full_pct:       +(100 * full  / total).toFixed(1),
            delivered_mean: +delivered.toFixed(1),
            total_ticks:    Math.round(total),
          };
        });
        // Pretty-print to console as a table
        console.log('[sim] battery economy comparison:');
        console.table(rows);
        addLog(`<span class="log-hi">battery scenarios complete</span> \u2014 see console for comparison table`);
        return { ok: true, rows, results };
      });
    }

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
    case 'toggleRain':
    case 'toggleStorm': {
      adminToggleStorm();
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
