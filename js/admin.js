/* ==============================================
   THE LONG HAUL — admin console (v0.0.7.21)

   Minimal admin tooling for testing and moderation. Two
   functions exposed in this patch:
     - give scrip
     - set trust per NPC

   Activation:
     1. Only activates if C.ADMIN_TOKEN_SHA is non-null.
     2. URL must contain #admin=<token>. SHA-256 of <token>
        must match C.ADMIN_TOKEN_SHA.
     3. On match, S._transient.adminAuthed flips true and the
        admin bar is rendered.
     4. #admin= is stripped from the URL after auth so bookmarks
        don't accidentally leak it.

   Helper exposed globally for token setup:
     window._tlhAdminHash('your-token')
        → returns the hex SHA-256 to paste into constants.js.

   Plaintext token never lives in source or in the deployed JS.
   A player with devtools can still call admin functions directly;
   this gate stops casual URL-guessing + repo-scraping, not a
   determined inspector.

   Exports:
     initAdmin() — call once from main.js init. Handles URL hash
                   auth + global hash helper + admin bar render.
   ============================================== */
'use strict';

import { S } from './state.js';
import * as C from './constants.js';
import { addLog } from './render/log.js';
import { updateHUD } from './render/hud.js';
import { renderSettlements } from './render/settlements.js';

async function sha256Hex(text) {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function parseAdminTokenFromHash() {
  const hash = window.location.hash || '';
  const m = hash.match(/[#&]admin=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function stripAdminFromHash() {
  try {
    const hash = window.location.hash || '';
    const cleaned = hash.replace(/([#&])admin=[^&]*/, '$1').replace(/^#&/, '#').replace(/^#$/, '');
    history.replaceState(null, '', window.location.pathname + window.location.search + (cleaned || ''));
  } catch (e) {}
}

function renderAdminBar() {
  const host = document.getElementById('adminBar');
  if (!host) return;
  host.style.display = 'flex';
  host.innerHTML = '';

  const title = document.createElement('span');
  title.className = 'admin-label';
  title.textContent = '// admin:';
  host.appendChild(title);

  // Give scrip
  const scripBtn = document.createElement('button');
  scripBtn.className = 'admin-btn';
  scripBtn.textContent = '+100\u00a2';
  scripBtn.addEventListener('click', () => {
    S.scrip += 100;
    addLog('<span class="log-wn">[admin]</span> +100\u00a2');
    updateHUD();
  });
  host.appendChild(scripBtn);

  const scripBtn1k = document.createElement('button');
  scripBtn1k.className = 'admin-btn';
  scripBtn1k.textContent = '+1000\u00a2';
  scripBtn1k.addEventListener('click', () => {
    S.scrip += 1000;
    addLog('<span class="log-wn">[admin]</span> +1000\u00a2');
    updateHUD();
  });
  host.appendChild(scripBtn1k);

  // Set trust per NPC
  const trustLabel = document.createElement('span');
  trustLabel.className = 'admin-label';
  trustLabel.textContent = 'trust:';
  host.appendChild(trustLabel);

  Object.keys(S.npcs).forEach(id => {
    const wrap = document.createElement('span');
    wrap.className = 'admin-trust-wrap';

    const label = document.createElement('span');
    label.className = 'admin-label';
    label.textContent = id;
    wrap.appendChild(label);

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '100';
    input.value = S.npcs[id].trust;
    input.className = 'admin-num';
    input.addEventListener('change', () => {
      const v = Math.max(0, Math.min(100, parseInt(input.value, 10) || 0));
      S.npcs[id].trust = v;
      // Sync unlocks on bump-up (admin can't un-unlock — matches handoff invariant).
      C.TRUST_THRESHOLDS.forEach(t => {
        const key = 't' + t;
        if (v >= t && !S.npcs[id].unlocks[key]) S.npcs[id].unlocks[key] = true;
      });
      addLog(`<span class="log-wn">[admin]</span> ${id} trust \u2192 ${v}`);
      renderSettlements();
    });
    wrap.appendChild(input);
    host.appendChild(wrap);
  });
}

export async function initAdmin() {
  // Always expose the hash helper; it's safe (just hashes a string).
  try {
    window._tlhAdminHash = async (token) => {
      const hex = await sha256Hex(String(token));
      console.log('SHA-256:', hex);
      console.log('Paste into js/constants.js as ADMIN_TOKEN_SHA.');
      return hex;
    };
  } catch (e) {}

  if (!C.ADMIN_TOKEN_SHA) return;

  const token = parseAdminTokenFromHash();
  if (!token) return;

  try {
    const hex = await sha256Hex(token);
    if (hex === C.ADMIN_TOKEN_SHA) {
      S._transient.adminAuthed = true;
      stripAdminFromHash();
      renderAdminBar();
      addLog('<span class="log-wn">[admin]</span> console enabled');
    }
  } catch (e) {}
}
