/* ==============================================
   THE LONG HAUL — boot sequence (variant A)

   TLH-specific boot screen. Drop-in replacement for
   boot.js on the long-haul page only.

   Reads the persisted save (tlh-save-v9 → v8 → ... →
   v1 chain) from localStorage directly so it doesn't
   depend on the game module being loaded yet, and
   surfaces a "previously on..." telemetry dump in the
   boot's right column.

   API parity with boot.js:
     window.startBoot(force?)
     window.dismissBoot()

   Session gate:
     Shares the 'cl-booted' sessionStorage key with
     boot.js. If the site boot already ran this session
     (or the user already saw the TLH boot), this skips
     directly to the game.
   ============================================== */
'use strict';
(function () {

const BOOT_FLAG = 'cl-booted';

// SAVE keys, newest first. Mirrors loadGame() in js/persistence.js.
const SAVE_KEYS = [
  'tlh-save-v9', 'tlh-save-v8', 'tlh-save-v7',
  'tlh-save-v6', 'tlh-save-v5', 'tlh-save-v4',
  'tlh-save-v3', 'tlh-save-v2', 'tlh-save-v1',
];
const PORTER_ID_KEY = 'tlh-porter-id';

// Settlement label map. Mirrors S.settlements in js/state.js.
const SETTLEMENT_LABEL = {
  'A': 'depot a',
  'B': 'depot b',
  'H': 'home',
  '?': '???',
  'C': 'ruins',
  '\u00b7': 'waypoint',
};

// Ring edges. Mirrors S.edges in js/state.js. Each edge
// connects two settlement IDs in clockwise order.
const RING_EDGES = [
  ['A', '?'],
  ['?', 'B'],
  ['B', 'C'],
  ['C', 'H'],
  ['H', '\u00b7'],
  ['\u00b7', 'A'],
];

// ---- timing ------------------------------------------------------
const CHAR_MS     = 11;   // typing speed (subject + value)
const HEAD_MS     = 14;   // section header typing speed
const VERIFY_MS   = 120;  // hold on verify word before resolve
const LINE_GAP_MS = 22;   // gap between lines
const SECTION_GAP = 120;  // pause before each // section
const FADE_MS     = 600;  // crossfade out
const TAIL_MS     = 700;  // hold on final line before fade
const TOTAL_COLS  = 38;   // dot-leader column width
const SUB_INDENT  = '  ';

// ---- runtime state ----------------------------------------------
let bootAborted = false;
let bootTimers  = [];

function q(id) { return document.getElementById(id); }

function wait(ms) {
  return new Promise(res => {
    if (bootAborted) { res(); return; }
    const id = setTimeout(res, ms);
    bootTimers.push(id);
  });
}

// ---- save reader ------------------------------------------------
function readSave() {
  for (const key of SAVE_KEYS) {
    let raw;
    try { raw = localStorage.getItem(key); } catch (_) { return null; }
    if (raw) {
      try { return JSON.parse(raw); } catch (_) { return null; }
    }
  }
  return null;
}

function readPorterId() {
  try { return localStorage.getItem(PORTER_ID_KEY) || null; }
  catch (_) { return null; }
}

// ---- formatters --------------------------------------------------
function fmtAgo(ms) {
  if (!ms) return 'unknown';
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 5)    return 'just now';
  if (secs < 60)   return secs + 's ago';
  const mins = Math.floor(secs / 60);
  if (mins < 60)   return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24)  return hours + 'h ' + (mins % 60) + 'm ago';
  const days = Math.floor(hours / 24);
  return days + 'd ' + (hours % 24) + 'h ago';
}

function fmtKm(km) {
  if (typeof km !== 'number' || !isFinite(km)) return '0 km';
  if (km < 10)   return km.toFixed(1) + ' km';
  if (km < 1000) return Math.round(km).toLocaleString() + ' km';
  return km.toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' km';
}

function settlementLabelFromPos(edgeIdx, dotT) {
  if (typeof edgeIdx !== 'number' || edgeIdx < 0 || edgeIdx >= RING_EDGES.length) {
    return 'unknown';
  }
  const [from, to] = RING_EDGES[edgeIdx];
  const t = (typeof dotT === 'number') ? dotT : 0;
  if (t < 0.05) return SETTLEMENT_LABEL[from] || from;
  if (t > 0.95) return SETTLEMENT_LABEL[to]   || to;
  if (t < 0.5)  return SETTLEMENT_LABEL[from] + ' approach';
  return SETTLEMENT_LABEL[to] + ' approach';
}

// Storm count → intensity bucket. Coarse approximation of
// js/weather.js bucketIntensity() — accurate weather state
// requires the full route geometry which we don't have at
// boot. Game module corrects within the first tick anyway.
function intensityFromStorms(stormCount) {
  if (!stormCount)            return 'clear';
  if (stormCount === 1)       return 'drizzle';
  if (stormCount === 2)       return 'rain';
  return 'downpour';
}

// ---- subsystem state derivation ----------------------------------
function bootsState(durability) {
  if (typeof durability !== 'number') return { word: 'responding', sev: 'ok' };
  if (durability <= 10)  return { word: 'failing',    sev: 'crit' };
  if (durability <= 40)  return { word: 'low',        sev: 'warn' };
  return { word: 'responding', sev: 'ok' };
}

function strainState(strain) {
  if (typeof strain !== 'number') return { word: 'nominal', sev: 'ok' };
  if (strain >= 0.85) return { word: 'pinned',   sev: 'crit' };
  if (strain >= 0.50) return { word: 'elevated', sev: 'warn' };
  return { word: 'nominal', sev: 'ok' };
}

function canteenState(c) {
  if (typeof c !== 'number') return { word: 'responding', sev: 'ok' };
  if (c <= 0)  return { word: 'empty',      sev: 'crit' };
  if (c <= 30) return { word: 'low',        sev: 'warn' };
  return { word: 'responding', sev: 'ok' };
}

function staminaState(s) {
  if (typeof s !== 'number') return { word: 'nominal', sev: 'ok' };
  if (s <= 15) return { word: 'spent',    sev: 'crit' };
  if (s <= 50) return { word: 'fatigued', sev: 'warn' };
  return { word: 'nominal', sev: 'ok' };
}

function weatherState(stormCount) {
  const w = intensityFromStorms(stormCount);
  if (w === 'downpour') return { word: 'downpour', sev: 'warn' };
  if (w === 'rain')     return { word: 'rain',     sev: 'warn' };
  if (w === 'drizzle')  return { word: 'drizzle',  sev: 'ok' };
  return { word: 'clear', sev: 'ok' };
}

function hazardState(stormCount, hasNextSpawn) {
  if (stormCount > 0)  return { word: 'storm active',  sev: 'warn' };
  if (hasNextSpawn)    return { word: 'storm inbound', sev: 'warn' };
  return { word: 'clear', sev: 'ok' };
}

function trustEntryCount(npcs) {
  if (!npcs || typeof npcs !== 'object') return 0;
  let n = 0;
  for (const k in npcs) {
    if (npcs[k] && typeof npcs[k].trust === 'number' && npcs[k].trust > 0) n++;
  }
  return n;
}

// ---- line-list builder -------------------------------------------
function buildLines(save, porterId) {
  const lines = [];
  const isReturning = !!save;
  const p   = (save && save.progress)  || {};
  const pos = (save && save.position)  || {};
  const inv = (save && save.inventory) || [];
  const storms = (save && Array.isArray(save.storms)) ? save.storms : [];
  const hasNext = !!(save && save.nextStormSpawn);

  // ------- // porter-init -------
  lines.push({ head: 'porter-init' });
  lines.push({ sub: 'dispatch handshake', val: 'ok', sev: 'ok' });

  if (porterId) {
    lines.push({ sub: 'porter id', val: porterId, sev: 'ok', verify: isReturning ? 'verifying' : 'allocating' });
  } else {
    lines.push({ sub: 'porter id', val: 'fresh', sev: 'ok', verify: 'allocating' });
  }

  if (isReturning && save.savedAt) {
    lines.push({ sub: 'last log entry', val: fmtAgo(save.savedAt), sev: 'ok', verify: 'reading' });
  } else {
    lines.push({ sub: 'last log entry', val: 'none on record', sev: 'ok', verify: 'reading' });
  }

  lines.push({ sub: 'regional atlas', val: 'ring  6 nodes', sev: 'ok', verify: 'loading' });

  if (isReturning) {
    lines.push({ sub: 'locator lock', val: settlementLabelFromPos(pos.edgeIdx, pos.dotT), sev: 'ok', verify: 'acquiring' });
  } else {
    lines.push({ sub: 'locator lock', val: 'home (start)', sev: 'ok', verify: 'acquiring' });
  }

  // ------- // subsystems -------
  lines.push({ head: 'subsystems' });
  lines.push({ sub: 'pedometer',  val: isReturning ? 'recalibrated' : 'zeroed', sev: 'ok' });
  lines.push({ sub: 'pack scale', val: 'calibrated', sev: 'ok' });

  const cn = canteenState(p.canteen);
  lines.push({ sub: 'canteen sensor', val: cn.word, sev: cn.sev, verify: 'checking' });

  const st = staminaState(p.stamina);
  lines.push({ sub: 'stamina monitor', val: st.word, sev: st.sev, verify: 'reading' });

  const bt = bootsState(p.bootDurability);
  lines.push({ sub: 'boots sensor', val: bt.word, sev: bt.sev, verify: 'scanning' });

  const sn = strainState(p.strain);
  lines.push({ sub: 'strain meter', val: sn.word, sev: sn.sev, verify: 'reading' });

  const wt = weatherState(storms.length);
  lines.push({ sub: 'weather receiver', val: wt.word, sev: wt.sev, verify: 'tuning' });

  lines.push({ sub: 'channel relay', val: 'online', sev: 'ok', verify: 'connecting' });

  const hz = hazardState(storms.length, hasNext);
  lines.push({ sub: 'hazard advisory', val: hz.word, sev: hz.sev, verify: 'checking' });

  const trustN = trustEntryCount(save && save.npcs);
  lines.push({ sub: 'trust ledger', val: trustN + ' entries', sev: 'ok', verify: 'synchronising' });

  // ------- // session-recap -------
  lines.push({ head: 'session-recap' });
  if (!isReturning) {
    lines.push({ sub: 'fetching save', val: 'no save on file', sev: 'ok' });
  } else {
    lines.push({ sub: 'fetching save',     val: 'ok', sev: 'ok' });
    lines.push({ sub: 'last position',     val: settlementLabelFromPos(pos.edgeIdx, pos.dotT), sev: 'ok' });
    const cargoCount = inv.length;
    lines.push({
      sub: 'cargo in transit',
      val: cargoCount === 0 ? 'empty' : cargoCount + (cargoCount === 1 ? ' parcel' : ' parcels'),
      sev: cargoCount > 0 ? 'ok' : 'ok',
    });
    lines.push({ sub: 'career distance', val: fmtKm(p.distKm), sev: 'ok' });
    lines.push({ sub: 'career deliveries', val: String(p.delivered || 0), sev: 'ok' });
  }

  // ------- // ready-for-haul -------
  lines.push({ head: 'ready-for-haul' });
  lines.push({ sub: 'status', val: 'awaiting input', sev: 'ok', trailingCursor: true });

  return lines;
}

// ---- DOM + style injection --------------------------------------
const STYLE_ID = 'tlh-boot-style';

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #boot {
      /* YoRHa-style cube matrix backdrop — radial-gradient dots
         on a 6px grid. Alpha tuned so the grid reads as discrete
         cubes (not a vague noise) but still sits behind text.
         Layered over the deep teal base; vignette + scanlines
         overlays sit on top. */
      background-color: #0b2e2d;
      background-image:
        radial-gradient(circle at 1px 1px, rgba(170,210,220,0.18) 1px, transparent 1.4px);
      background-size: 6px 6px;
      color: #77bfcf;
      font-family: 'Source Code Pro', ui-monospace, monospace;
      /* Override site boot's center-everything flex; Nier wants
         content top-anchored so it grows downward like a real
         terminal log instead of creeping as lines accumulate. */
      align-items: flex-start !important;
      justify-content: flex-start !important;
    }
    #boot .tlh-boot-inner {
      position: relative;
      z-index: 3;
      width: min(720px, 92vw);
      padding: 8vh 34px 34px 34px;
      box-sizing: border-box;
    }
    #boot .tlh-boot-vignette {
      position: absolute; inset: 0;
      background: radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.35) 100%);
      pointer-events: none;
      z-index: 1;
    }
    #boot .tlh-boot-watermark {
      position: absolute;
      top: 14px; right: 18px;
      font-size: 10px;
      letter-spacing: 0.18em;
      opacity: 0.35;
      z-index: 4;
      color: #3a6a68;
      pointer-events: none;
      text-transform: lowercase;
    }
    #boot .tlh-boot-watermark .glyph {
      display: inline-block;
      width: 10px; height: 10px;
      border: 1px solid currentColor;
      border-radius: 50%;
      vertical-align: middle;
      margin-left: 6px;
      position: relative;
    }
    #boot .tlh-boot-watermark .glyph::after {
      content: '';
      position: absolute;
      inset: 2px;
      border: 1px solid currentColor;
      border-radius: 50%;
      opacity: 0.6;
    }
    #boot .tlh-banner {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      padding-bottom: 6px;
      border-bottom: 1px solid #155352;
      color: #77bfcf;
      margin-bottom: 14px;
    }
    #boot .tlh-banner .right { opacity: 0.55; letter-spacing: 0.12em; }
    #boot .tlh-term {
      font-size: 13px;
      line-height: 1.72;
      letter-spacing: 0.02em;
    }
    #boot .tlh-sec {
      color: #9d78d4;
      font-weight: 700;
      margin-top: 6px;
    }
    #boot .tlh-sec:first-child { margin-top: 0; }
    #boot .tlh-bl {
      display: flex;
      align-items: baseline;
      white-space: pre;
      padding-left: 2px;
    }
    #boot .tlh-bl .sub  { color: #7aa8a6; }
    #boot .tlh-bl .dots { color: #3a6a68; opacity: 0.75; white-space: pre; flex: 0 0 auto; }
    #boot .tlh-bl .val  { color: #77bfcf; padding-left: 4px; }
    #boot .tlh-bl .val.warn    { color: #da8bda; }
    #boot .tlh-bl .val.crit    { color: #c47fcd; }
    #boot .tlh-bl .val.pending { color: #3a6a68; opacity: 0.85; }
    #boot .tlh-cursor {
      display: inline-block;
      color: #77bfcf;
      animation: tlhBootBlink 0.85s steps(2, end) infinite;
      margin-left: 1px;
    }
    @keyframes tlhBootBlink {
      0%, 49%   { opacity: 1; }
      50%, 100% { opacity: 0; }
    }
    #boot .boot-skip {
      position: absolute; bottom: 22px; right: 28px;
      font-size: 10px; color: #2a5c5a; letter-spacing: 0.08em;
      cursor: pointer; transition: color 0.15s;
      z-index: 5;
    }
    #boot .boot-skip:hover { color: #4a7a78; }
  `;
  document.head.appendChild(style);
}

function buildBootDOM() {
  const root = q('boot');
  if (!root) return null;

  // Wipe prior content (the original boot-ascii / boot-terminal /
  // boot-welcome divs from boot.css's design — we rebuild fresh).
  // Keep the .boot-skip span if it exists; re-add it if not.
  const skip = root.querySelector('.boot-skip');
  root.innerHTML = '';

  // Vignette
  const vignette = document.createElement('div');
  vignette.className = 'tlh-boot-vignette';
  root.appendChild(vignette);

  // Watermark
  const wm = document.createElement('div');
  wm.className = 'tlh-boot-watermark';
  wm.innerHTML = 'tlh<span class="glyph"></span>';
  root.appendChild(wm);

  // Inner wrapper
  const inner = document.createElement('div');
  inner.className = 'tlh-boot-inner';

  const banner = document.createElement('div');
  banner.className = 'tlh-banner';
  banner.innerHTML = '<span>dispatch terminal</span><span class="right">v0.9.29</span>';
  inner.appendChild(banner);

  const term = document.createElement('div');
  term.className = 'tlh-term';
  term.id = 'tlh-boot-term';
  inner.appendChild(term);

  root.appendChild(inner);

  if (skip) root.appendChild(skip);
  else {
    const s = document.createElement('span');
    s.className = 'boot-skip';
    s.textContent = '[ press any key to skip ]';
    s.onclick = () => window.dismissBoot();
    root.appendChild(s);
  }

  return term;
}

// ---- typewriter primitives --------------------------------------
function makeDots(subLen, valLen) {
  const dots = Math.max(3, TOTAL_COLS - SUB_INDENT.length - subLen - valLen - 2);
  return ' ' + '.'.repeat(dots) + ' ';
}

async function typeInto(el, text, perChar) {
  for (const ch of text) {
    if (bootAborted) return;
    el.textContent += ch;
    await wait(perChar);
  }
}

async function renderHead(termEl, name) {
  await wait(SECTION_GAP);
  if (bootAborted) return;
  const div = document.createElement('div');
  div.className = 'tlh-sec';
  termEl.appendChild(div);
  await typeInto(div, '// ' + name, HEAD_MS);
}

async function renderLine(termEl, line) {
  if (bootAborted) return;

  const row = document.createElement('div');
  row.className = 'tlh-bl';
  termEl.appendChild(row);

  const subSpan = document.createElement('span');
  const dotSpan = document.createElement('span');
  const valSpan = document.createElement('span');
  subSpan.className = 'sub';
  dotSpan.className = 'dots';
  valSpan.className = 'val ' + (line.sev || 'ok');
  row.appendChild(subSpan);
  row.appendChild(dotSpan);
  row.appendChild(valSpan);

  await typeInto(subSpan, SUB_INDENT + line.sub, CHAR_MS);
  if (bootAborted) return;

  const firstRight = line.verify || line.val;
  dotSpan.textContent = makeDots(line.sub.length, firstRight.length);

  if (line.verify) {
    valSpan.classList.add('pending');
    await typeInto(valSpan, line.verify, CHAR_MS);
    if (bootAborted) return;
    await wait(VERIFY_MS);
    if (bootAborted) return;
    valSpan.textContent = '';
    valSpan.classList.remove('pending');
    dotSpan.textContent = makeDots(line.sub.length, line.val.length);
    await typeInto(valSpan, line.val, CHAR_MS);
  } else {
    await typeInto(valSpan, line.val, CHAR_MS);
  }

  if (line.trailingCursor) {
    const cur = document.createElement('span');
    cur.className = 'tlh-cursor';
    cur.textContent = '\u2592';
    valSpan.appendChild(cur);
  }

  await wait(LINE_GAP_MS);
}

// ---- skip / fade -------------------------------------------------
function skipToSite() {
  const bootEl = q('boot');
  const siteEl = q('site');
  if (bootEl) bootEl.style.display = 'none';
  if (siteEl) siteEl.classList.add('visible');
}

async function fadeToSite() {
  const bootEl = q('boot');
  const siteEl = q('site');
  if (bootEl) bootEl.classList.add('fading');
  if (siteEl) siteEl.classList.add('visible');
  await wait(FADE_MS);
  if (!bootAborted && bootEl) bootEl.style.display = 'none';
}

// ---- main run ----------------------------------------------------
async function runBoot() {
  bootAborted = false;
  // Claim the session boot slot immediately so a peer page in the
  // same session (site boot or another TLH tab) sees the flag and
  // skips. Previously this set on completion, so navigating mid-
  // boot left the flag unset and the next page double-booted.
  try { sessionStorage.setItem(BOOT_FLAG, '1'); } catch (_) {}
  injectStyle();
  const termEl = buildBootDOM();
  if (!termEl) return;

  // Read save up-front so the lines reflect actual state.
  const save     = readSave();
  const porterId = readPorterId();
  const lines    = buildLines(save, porterId);

  // Render
  for (const entry of lines) {
    if (bootAborted) return;
    if (entry.head) await renderHead(termEl, entry.head);
    else            await renderLine(termEl, entry);
  }

  if (bootAborted) return;
  await wait(TAIL_MS);
  if (bootAborted) return;

  // (BOOT_FLAG already set at start of runBoot; intentionally not
  // re-setting here.)
  await fadeToSite();
}

// ---- public API --------------------------------------------------
window.startBoot = function (force) {
  if (!force) {
    try {
      if (sessionStorage.getItem(BOOT_FLAG) === '1') {
        skipToSite();
        return;
      }
      if (new URLSearchParams(location.search).get('skipBoot') === '1') {
        skipToSite();
        return;
      }
    } catch (_) {}
  }

  bootAborted = true;
  bootTimers.forEach(clearTimeout); bootTimers = [];
  const bootEl = q('boot');
  const siteEl = q('site');
  if (bootEl) { bootEl.style.display = 'flex'; bootEl.classList.remove('fading'); }
  if (siteEl) siteEl.classList.remove('visible');
  setTimeout(() => { bootAborted = false; runBoot(); }, 30);
};

window.dismissBoot = function () {
  bootAborted = true;
  bootTimers.forEach(clearTimeout); bootTimers = [];
  try { sessionStorage.setItem(BOOT_FLAG, '1'); } catch (_) {}
  skipToSite();
};

})();
