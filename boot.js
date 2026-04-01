/* ==============================================
   BOOT SEQUENCE — boot.js
   Include on every page. Call startBoot() on load.

   For real loading gates:
     Set window.BOOT_READY = false before load,
     then set it to true when assets are ready.
     The ellipsis loop will keep cycling until it's true.
   ============================================== */
'use strict';
(function () {

const OIL_COLORS = [
  '#40a4b9','#55b0c4','#77bfcf','#9d78d4',
  '#c47fcd','#da8bda','#c47fcd','#9d78d4',
  '#77bfcf','#55b0c4','#40a4b9'
];
const DIM = '#2a5c5a';

const ASCII_TEXT =
`\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
\u2551    C O I L E D   L A M B    \u2551
\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d`;

// ---- Timing constants ----
const CHAR_MS  = 18;   // typing speed per character
const BLINK_MS = 130;  // ▓ blink half-period
const BLINK_N  = 2;    // blinks before committing each dot
const DOT_MS   = 30;   // pause after committing a dot

// ---- State ----
let charSpans   = [];
let sweepHandle = null;
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

// ---- ASCII sweep ----
function buildAscii() {
  const el = q('boot-ascii');
  el.innerHTML = '';
  charSpans = [];
  for (const ch of ASCII_TEXT) {
    if (ch === '\n') el.appendChild(document.createTextNode('\n'));
    else if (ch === ' ') el.appendChild(document.createTextNode(' '));
    else {
      const s = document.createElement('span');
      s.textContent = ch; s.style.color = DIM;
      el.appendChild(s); charSpans.push(s);
    }
  }
}

function startSweep() {
  stopSweep();
  if (!charSpans.length) return;
  const WIN = Math.ceil(charSpans.length * 0.35);
  let f = 0, total = charSpans.length + WIN + 4;
  function tick() {
    f++;
    charSpans.forEach((s, i) => {
      const p = f - i;
      s.style.color = (p >= 0 && p <= WIN)
        ? OIL_COLORS[Math.round((p / WIN) * (OIL_COLORS.length - 1))]
        : DIM;
    });
    sweepHandle = (f < total)
      ? setTimeout(tick, 42)
      : setTimeout(() => { charSpans.forEach(s => s.style.color = DIM); startSweep(); }, 600);
  }
  sweepHandle = setTimeout(tick, 42);
}

function stopSweep() {
  clearTimeout(sweepHandle); sweepHandle = null;
  charSpans.forEach(s => { if (s) s.style.color = DIM; });
}

// ---- Typewriter helpers ----
function appendChar(lineEl, ch, cls) {
  const s = document.createElement('span');
  if (cls) s.className = cls;
  s.textContent = ch;
  return lineEl.appendChild(s);
}

function moveCursor(lineEl) {
  lineEl.querySelectorAll('.blk').forEach(b => b.remove());
  const s = document.createElement('span');
  s.className = 'blk'; s.textContent = '\u2593';
  lineEl.appendChild(s);
  return s;
}

function removeCursor(lineEl) {
  lineEl.querySelectorAll('.blk').forEach(b => b.remove());
}

async function typeString(lineEl, str, cls, charMs) {
  for (const ch of str) {
    if (bootAborted) return;
    appendChar(lineEl, ch, cls);
    moveCursor(lineEl);
    await wait(charMs ?? CHAR_MS);
  }
}

async function blinkAtPosition(lineEl, times) {
  const cursors = lineEl.querySelectorAll('.blk');
  const cur = cursors[cursors.length - 1];
  if (!cur) return;
  for (let i = 0; i < times * 2; i++) {
    if (bootAborted) return;
    cur.style.visibility = (i % 2 === 0) ? 'hidden' : 'visible';
    await wait(BLINK_MS);
  }
  cur.style.visibility = 'visible';
}

async function drawOneDot(lineEl) {
  await blinkAtPosition(lineEl, BLINK_N);
  if (bootAborted) return;
  removeCursor(lineEl);
  appendChar(lineEl, '.', 'dot');
  moveCursor(lineEl);
  await wait(DOT_MS);
}

// ---- Main boot sequence ----
async function runBoot() {
  bootAborted = false;

  const terminal  = q('boot-terminal');
  const welcomeEl = q('boot-welcome');
  terminal.innerHTML   = '';
  welcomeEl.innerHTML  = '';
  welcomeEl.style.display = 'none';

  buildAscii();
  await wait(400);
  if (bootAborted) return;
  startSweep();

  await wait(1400);
  if (bootAborted) return;

  function newLine() {
    const d = document.createElement('div');
    d.className = 'tline';
    terminal.appendChild(d);
    return d;
  }

  // System info lines
  const sysLines = [
    { key: 'SYSTEM.....', val: 'coiled lamb v1'        },
    { key: 'DISPLAY....', val: 'phosphor teal #155352'  },
    { key: 'FONT.......', val: 'source code pro 600'   },
  ];

  for (const { key, val } of sysLines) {
    if (bootAborted) return;
    const line = newLine();
    await typeString(line, key, 'key', CHAR_MS);
    if (bootAborted) return;
    await typeString(line, val, 'val', CHAR_MS);
    if (bootAborted) return;
    removeCursor(line);
    await wait(40);
  }

  if (bootAborted) return;

  // Loading line — loops until window.BOOT_READY is true (or 2 passes in mockup)
  const loadLine = newLine();
  await typeString(loadLine, 'STATUS.....', 'key', CHAR_MS);
  if (bootAborted) return;
  await typeString(loadLine, 'now loading', 'val', CHAR_MS);
  if (bootAborted) return;
  moveCursor(loadLine);

  // Keep looping ellipsis until ready (defaults to 2 loops if BOOT_READY not set)
  let loops = 0;
  const maxLoops = (typeof window.BOOT_READY === 'boolean') ? Infinity : 2;
  while (loops < maxLoops) {
    if (bootAborted) return;
    if (typeof window.BOOT_READY === 'boolean' && window.BOOT_READY) break;
    for (let i = 0; i < 3; i++) {
      if (bootAborted) return;
      await drawOneDot(loadLine);
    }
    if (bootAborted) return;
    loops++;
    if (loops < maxLoops && !(typeof window.BOOT_READY === 'boolean' && window.BOOT_READY)) {
      loadLine.querySelectorAll('.dot').forEach(d => d.remove());
      moveCursor(loadLine);
      await wait(180);
    }
  }

  if (bootAborted) return;
  removeCursor(loadLine);

  await wait(260);
  if (bootAborted) return;

  // Welcome line — typed character by character with oil colours
  welcomeEl.style.display = 'block';
  const wLine = document.createElement('div');
  wLine.className = 'tline';
  wLine.style.display = 'inline-block';
  welcomeEl.appendChild(wLine);

  const WELCOME_STR = 'welcome!';
  const wColors = WELCOME_STR.split('').map((_, i) => {
    const t = i / (WELCOME_STR.length - 1);
    return OIL_COLORS[Math.round(t * (OIL_COLORS.length - 1))];
  });

  for (let i = 0; i < WELCOME_STR.length; i++) {
    if (bootAborted) return;
    const s = document.createElement('span');
    s.textContent = WELCOME_STR[i];
    s.style.color = wColors[i];
    wLine.appendChild(s);
    moveCursor(wLine);
    await wait(CHAR_MS * 2);
  }
  if (bootAborted) return;

  // Final cursor: 2 slow blinks then gone
  const finalCur = wLine.querySelector('.blk');
  if (finalCur) {
    for (let i = 0; i < 4; i++) {
      if (bootAborted) break;
      finalCur.style.visibility = (i % 2 === 0) ? 'hidden' : 'visible';
      await wait(BLINK_MS);
    }
    finalCur.remove();
  }

  await wait(500);
  if (bootAborted) return;

  // Crossfade to site
  stopSweep();
  const bootEl = q('boot');
  const siteEl = q('site');
  if (bootEl) bootEl.classList.add('fading');
  if (siteEl) siteEl.classList.add('visible');
  await wait(800);
  if (!bootAborted && bootEl) bootEl.style.display = 'none';
}

window.startBoot = function () {
  bootAborted = true;
  bootTimers.forEach(clearTimeout); bootTimers = [];
  stopSweep();
  const bootEl = q('boot');
  const siteEl = q('site');
  if (bootEl) { bootEl.style.display = 'flex'; bootEl.classList.remove('fading'); }
  if (siteEl) siteEl.classList.remove('visible');
  setTimeout(() => { bootAborted = false; runBoot(); }, 30);
};

window.dismissBoot = function () {
  bootAborted = true;
  bootTimers.forEach(clearTimeout); bootTimers = [];
  stopSweep();
  const bootEl = q('boot');
  const siteEl = q('site');
  if (bootEl) bootEl.style.display = 'none';
  if (siteEl) siteEl.classList.add('visible');
};

})();
