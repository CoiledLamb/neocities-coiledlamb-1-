/* ==============================================
   THE LONG HAUL — save export / import (v0.0.7.21)

   Envelope format (locked, schema-version-agnostic):
     TLH-SAVE:<base64(gzip(JSON.stringify(payload)))>
   Where payload is:
     { v: <schemaVersion>, ts: <exportMs>, porterId: <opt-in|null>, save: <buildSavePayload> }

   Prefix is TLH-SAVE: (not TLH-SAVE-v6:) so future schema bumps
   don't break old export keys — schema version lives inside the
   payload (`v:`) and migration on import flows through loadGame's
   existing v1→v6 ratchet via applySavePayload().

   v0.0.9.6.10.22: payload is gzip-compressed before base64. Cuts
   export-string length ~6× on a real save (40k chars → ~6.7k).
   Pre-.22 exports (raw-JSON-then-base64) still import: the decode
   path branches on the leading bytes of the b64 body — gzipped
   streams begin "H4sI" (magic 0x1f 0x8b), legacy JSON begins "eyJ"
   (since '{' = 0x7b). No prefix change, no schema bump.

   Porter identity opt-in:
     Checkbox on export (default OFF). When OFF, porterId is null
     in the envelope. When ON, the porter identity travels with
     the save. Import can then either adopt that identity or keep
     the current porter (user confirms at import time).

   UI: modal (not inline), reachable from the save strip via a
   new "save i/o" button. Two textareas (export readout,
   import paste), copy/download buttons on export, confirm
   dialog on import.
   ============================================== */
'use strict';

import { S } from './state.js?v=097-0-8';
import * as C from './constants.js?v=097-0-8';
import { buildSavePayload, saveGame, applySavePayload } from './persistence.js?v=097-0-8';
import { addLog } from './render/log.js?v=097-0-8';
import { updateHUD, renderCargoSlots, renderCourierStack } from './render/hud.js?v=097-0-8';
import { drawRouteMap } from './render/route-map.js?v=097-0-8';
import { renderSettlements } from './render/settlements.js?v=097-0-8';
import * as Boots from './boots.js?v=097-0-8';
import * as Stamina from './stamina.js?v=097-0-8';

const PREFIX          = 'TLH-SAVE:';
const GZIP_B64_PREFIX = 'H4sI';

// Gzip a string, return base64. Stream API ships in every modern
// browser since 2023; we don't ship a polyfill — pre-.22 exports
// stay readable through the legacy decode branch below.
async function gzipToB64(str) {
  const bytes  = new TextEncoder().encode(str);
  const cs     = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const buf = await new Response(cs.readable).arrayBuffer();
  const u8  = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin);
}

async function b64ToGunzipString(b64) {
  const bin = atob(b64);
  const u8  = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const ds     = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(u8);
  writer.close();
  return await new Response(ds.readable).text();
}

async function encodeEnvelope(includePorter) {
  const payload = {
    v:        C.SAVE_VERSION,
    ts:       Date.now(),
    porterId: includePorter ? (localStorage.getItem('tlh-porter-id') || null) : null,
    save:     buildSavePayload(),
  };
  const json = JSON.stringify(payload);
  return PREFIX + await gzipToB64(json);
}

async function decodeEnvelope(str) {
  const s = String(str || '').trim();
  if (!s.startsWith(PREFIX)) throw new Error('not a TLH-SAVE key');
  const b64 = s.slice(PREFIX.length);
  let json;
  try {
    if (b64.startsWith(GZIP_B64_PREFIX)) {
      // v0.0.9.6.10.22+ gzip-compressed envelope.
      json = await b64ToGunzipString(b64);
    } else {
      // Legacy: raw JSON, encodeURIComponent dance for any unicode.
      json = decodeURIComponent(escape(atob(b64)));
    }
  } catch (e) {
    throw new Error('corrupt base64');
  }
  let obj;
  try {
    obj = JSON.parse(json);
  } catch (e) {
    throw new Error('corrupt json');
  }
  if (!obj || !obj.save) throw new Error('no save in envelope');
  return obj;
}

function summary(saveObj) {
  const p = (saveObj && saveObj.progress) || {};
  const km = typeof p.distKm === 'number' ? Math.round(p.distKm * 10) / 10 : 0;
  const delivered = p.delivered || 0;
  return `${km}km walked, ${delivered} delivered`;
}

function makeModal() {
  let modal = document.getElementById('saveIoModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'saveIoModal';
  modal.className = 'tlh-modal';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="tlh-modal-backdrop"></div>
    <div class="tlh-modal-body">
      <div class="tlh-modal-head">
        <span class="tlh-modal-title">save i/o</span>
        <button class="tlh-modal-close" id="saveIoClose">\u00d7</button>
      </div>
      <div class="tlh-modal-section">
        <div class="tlh-modal-sectitle">// export</div>
        <textarea id="saveIoExportTxt" class="tlh-modal-txt" readonly></textarea>
        <div class="tlh-modal-row">
          <label class="tlh-modal-check">
            <input type="checkbox" id="saveIoIncludePorter" />
            include porter id (PTR-XXXX)
          </label>
          <button class="tlh-modal-btn" id="saveIoCopy">copy</button>
          <button class="tlh-modal-btn" id="saveIoDownload">download .txt</button>
        </div>
      </div>
      <div class="tlh-modal-section">
        <div class="tlh-modal-sectitle">// import</div>
        <textarea id="saveIoImportTxt" class="tlh-modal-txt" placeholder="paste TLH-SAVE:... here"></textarea>
        <div class="tlh-modal-row">
          <span class="tlh-modal-msg" id="saveIoMsg"></span>
          <button class="tlh-modal-btn" id="saveIoLoad">load</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const closeBtn = modal.querySelector('#saveIoClose');
  const backdrop = modal.querySelector('.tlh-modal-backdrop');
  [closeBtn, backdrop].forEach(el => el && el.addEventListener('click', closeModal));

  const copyBtn = modal.querySelector('#saveIoCopy');
  const dlBtn = modal.querySelector('#saveIoDownload');
  const loadBtn = modal.querySelector('#saveIoLoad');
  const incChk = modal.querySelector('#saveIoIncludePorter');
  const expTxt = modal.querySelector('#saveIoExportTxt');
  const impTxt = modal.querySelector('#saveIoImportTxt');
  const msgEl = modal.querySelector('#saveIoMsg');

  async function refreshExport() {
    try {
      expTxt.value = await encodeEnvelope(!!incChk.checked);
    } catch (e) {
      expTxt.value = '(error generating save — ' + (e.message || 'unknown') + ')';
    }
  }
  modal._refreshExport = refreshExport;
  incChk.addEventListener('change', refreshExport);

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(expTxt.value);
      msgEl.textContent = 'copied';
      msgEl.className = 'tlh-modal-msg ok';
      setTimeout(() => { msgEl.textContent = ''; }, 1500);
    } catch (e) {
      expTxt.select();
      msgEl.textContent = 'select + ctrl-c';
      msgEl.className = 'tlh-modal-msg wn';
    }
  });

  dlBtn.addEventListener('click', () => {
    const blob = new Blob([expTxt.value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `tlh-save-${ts}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  loadBtn.addEventListener('click', () => handleImport(impTxt.value, msgEl));

  return modal;
}

async function handleImport(raw, msgEl) {
  let env;
  try {
    env = await decodeEnvelope(raw);
  } catch (e) {
    msgEl.textContent = 'invalid save: ' + (e.message || 'unknown');
    msgEl.className = 'tlh-modal-msg wn';
    return;
  }

  const incoming = env.save;
  const incomingPorter = env.porterId;
  const currentPorter = localStorage.getItem('tlh-porter-id') || null;
  const currentSummary = summary(buildSavePayload());
  const incomingSummary = summary(incoming);

  let prompt = `load this save?\n\ncurrent: ${currentSummary}\nincoming: ${incomingSummary}`;
  if (incomingPorter && incomingPorter !== currentPorter) {
    prompt += `\n\nincoming save has porter id ${incomingPorter}. keep your current id (${currentPorter || 'none'}) and just load progress? cancel = abort import.`;
  }
  if (!confirm(prompt)) {
    msgEl.textContent = 'cancelled';
    msgEl.className = 'tlh-modal-msg';
    return;
  }

  // Route through the validated-apply path so migrations run.
  const ok = applySavePayload(incoming);
  if (!ok) {
    msgEl.textContent = 'load failed: schema rejected';
    msgEl.className = 'tlh-modal-msg wn';
    return;
  }

  // Persist immediately so the loaded state survives a refresh.
  saveGame(true);

  // Repaint. Similar sweep to init's post-load paint pass.
  renderCargoSlots(true);
  renderCourierStack();
  Boots.renderBoots();
  Stamina.renderStamina();
  drawRouteMap();
  renderSettlements();
  updateHUD();

  addLog('<span class="log-ok">save imported</span> \u2014 ' + incomingSummary);
  msgEl.textContent = 'loaded';
  msgEl.className = 'tlh-modal-msg ok';
  setTimeout(closeModal, 600);
}

function openModal() {
  const modal = makeModal();
  modal.style.display = 'flex';
  if (modal._refreshExport) modal._refreshExport();
  const msgEl = modal.querySelector('#saveIoMsg');
  if (msgEl) { msgEl.textContent = ''; msgEl.className = 'tlh-modal-msg'; }
}

function closeModal() {
  const modal = document.getElementById('saveIoModal');
  if (modal) modal.style.display = 'none';
}

export function initSaveIo() {
  const btn = document.getElementById('saveIoBtn');
  if (btn) btn.addEventListener('click', openModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
}
