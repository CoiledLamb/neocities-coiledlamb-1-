/* ==============================================
   THE LONG HAUL — sky render (v0.0.9.1)

   Day/night cycle for the play-area side-view strip
   (.tlh-viewport). Atmospheric only — no gameplay hooks
   this patch (NPC sleep, night trip bonus, storms-worse-
   at-night are all intentionally deferred).

   Backdrop composition (each tick):
     - Cool vertical base gradient (full-width, always on).
       Night/day keyframes + a `b`-tinted cool blue-hour mix
       that peaks between the warm window and full day/night.
     - Warm radial overlay during sunrise/sunset, anchored at
       the sun's current horizon x. Orange core → pink halo →
       magenta fringe → transparent. Cool base shows through
       wherever the radial is transparent, so the sky is
       directionally correct (glow on the side where the sun is).

   Celestial bodies:
     - Sun + moon are the SAME radius (real-scale, eclipse-
       compatible if we want one later).
     - Moon has phases on a 7-in-game-day cycle. Shadow circle
       samples the base gradient at moon's current cy so the
       crescent carves cleanly as the moon passes through the
       color bands.
     - Stars: procedurally-placed in the upper ~65% of the
       strip, ~40% steady / rest with reduced-amplitude flicker,
       shared slow horizontal drift. Session-scoped — no save
       persistence.

   Time source is S.ticks, so the phase resumes where the save
   left off automatically (no schema bump). Sunrise/sunset
   bells are kept separate so they can be tuned independently
   later (sunrise paler, etc.).

   Follow-ups noted by the handoff:
     - Sunrise vs. sunset stop decoupling (hooks live here;
       colors currently identical between the two).
     - Storm/rain layer interaction with clear sky (deferred
       to weather rework).

   Imports:
     S — game state singleton
   ============================================== */
'use strict';

import { S } from './../state.js?v=097-0-5';

const els = S._transient.els;

// ============================================================
// TIMING
// ============================================================
// 1500 ticks × 350 ms ≈ 8.75 min per in-game day. Sun/moon glide
// by faster per-tick than 3000 — less "watching the moon move" in
// a single session.
export const TICKS_PER_DAY = 1500;
const HALF_DAY             = TICKS_PER_DAY / 2;
const MOON_CYCLE_DAYS      = 7;

// ============================================================
// GEOMETRY
// ============================================================
// SVG viewBox matches the-long-haul.html: "0 0 800 110".
const SKY_W   = 800;
const SKY_H   = 110;
const BODY_R  = 4.5;    // shared sun + moon radius
const NUM_STARS = 16;

// ============================================================
// COLOR KEYFRAMES — base gradient (4 vertical stops per phase)
// Stops are: top → upper-mid → lower-mid → bottom.
// Values tuned through the mockup; keep in sync with tlh-daynight-mockup.html.
// ============================================================
const STOPS_NIGHT = [ [  5,  18,  22 ],[  8,  28,  30 ],[  8,  31,  30 ],[  8,  31,  30 ] ];
const STOPS_DAY   = [ [ 16,  60,  74 ],[ 20,  66,  80 ],[ 23,  72,  84 ],[ 26,  76,  88 ] ];
const STOPS_COOL  = [ [  8,  22,  48 ],[ 10,  32,  62 ],[ 14,  42,  74 ],[ 18,  52,  82 ] ];

// Gradient stop y-positions (0..1 across the strip height).
// Kept here so both the gradient string AND the moon-shadow sampler
// agree on where each stop "lives" vertically.
const STOP_OFFSETS = [ 0.00, 0.38, 0.72, 1.00 ];

// ============================================================
// MODULE STATE
// ============================================================
let sunEl      = null;
let moonDisc   = null;
let moonShadow = null;
const stars    = [];

// Simple LCG for deterministic-per-session star placement. Seeded once
// on init so star positions are stable within a session but regenerate
// on reload — intentional, not persisted.
function makeRng(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// ============================================================
// PUBLIC: init
// ============================================================
export function initSky() {
  const svg = els.skySvg;
  if (!svg) return; // no-op if the DOM isn't wired (e.g., pre-resolveEls)

  const starsG    = svg.querySelector('#skyStars');
  const celestial = svg.querySelector('#skyCelestial');
  if (!starsG || !celestial) return;

  // Wipe existing children in case init runs twice (hot-reload, tests).
  starsG.innerHTML = '';
  celestial.innerHTML = '';
  stars.length = 0;

  // --- stars ---
  const rand = makeRng(4242);
  for (let i = 0; i < NUM_STARS; i++) {
    const st = {
      x:            10 + rand() * (SKY_W - 20),
      y:             6 + rand() * (SKY_H * 0.60),
      baseR:       0.6 + rand() * 0.8,
      flickerPhase: rand() * Math.PI * 2,
      flickerSpeed: 0.3 + rand() * 0.5,
      bright:      rand() > 0.55,      // mix of y (dim) / Y (bright)
      driftSpeed:  0.25 + rand() * 0.35,
      steady:      rand() > 0.6,       // ~40% don't flicker at all
      el:          null,
    };
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    el.setAttribute('cx', st.x);
    el.setAttribute('cy', st.y);
    el.setAttribute('r',  st.baseR);
    el.setAttribute('fill', st.bright ? '#ffffff' : '#b1c9c3');
    el.setAttribute('opacity', '0');
    st.el = el;
    starsG.appendChild(el);
    stars.push(st);
  }

  // --- sun ---
  sunEl = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  sunEl.setAttribute('r', BODY_R);
  sunEl.setAttribute('fill', '#ffffff');  // Y
  sunEl.setAttribute('opacity', '0');
  celestial.appendChild(sunEl);

  // --- moon disc + shadow ---
  moonDisc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  moonDisc.setAttribute('r', BODY_R);
  moonDisc.setAttribute('fill', '#b1c9c3');  // y
  moonDisc.setAttribute('opacity', '0');
  celestial.appendChild(moonDisc);

  moonShadow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  moonShadow.setAttribute('r', BODY_R);
  moonShadow.setAttribute('fill', '#081f1e');  // will track gradient each frame
  moonShadow.setAttribute('opacity', '0');
  celestial.appendChild(moonShadow);
}

// ============================================================
// PHASE SIGNALS
// ============================================================
function bellCurve(x, center, width) {
  const d = (x - center) / width;
  return Math.exp(-d * d);
}

// 0 at night, 1 at midday, smooth through dawn/dusk.
// v0.0.9.5 commit 3: exported so battery solar-trickle regen (and
// future daylight-driven systems — desert stamina drain, solar-panel
// upgrade bonuses, etc.) can import a shared source of truth instead
// of each module reimplementing the day-phase curve.
export function daylightOf(t) {
  const f = t / TICKS_PER_DAY;
  if (f < 0.02 || f > 0.52) return 0;
  const s = (f - 0.02) / 0.5;
  return Math.sin(s * Math.PI);
}

// Bell-curve bias peaking between the warm window and full day/night.
function coolBiasOf(t) {
  const f = t / TICKS_PER_DAY;
  if (f < 0.14) return bellCurve(f, 0.08, 0.035);                        // post-sunrise blue hour
  if (f > 0.42 && f < 0.58) return bellCurve(f, 0.52, 0.035);            // pre-night blue hour
  return 0;
}

// Sunrise and sunset are kept as independent bells so colors / timing
// can later diverge (e.g. sunrise paler than sunset).
function warmBiasOf(t) {
  const f = t / TICKS_PER_DAY;
  let w = 0;
  if (f < 0.08) w = Math.max(w, bellCurve(f, 0.027, 0.022));             // sunrise
  if (f > 0.42 && f < 0.52) w = Math.max(w, bellCurve(f, 0.478, 0.022)); // sunset
  return w;
}

// Sun's horizontal position (% of strip width) during its visible arc.
// Clamped outside the arc so the radial's center sits at the last edge
// if a warm bell happens to fire off-arc (currently doesn't, but safe).
// ARC_X_PAD small so sun + moon rise/set near the screen edges rather
// than crowding the courier @ (~70px from left).
const ARC_X_PAD = 6;

function sunXPctOf(t) {
  const frac = Math.min(1, Math.max(0, t / HALF_DAY));
  return ((ARC_X_PAD + frac * (SKY_W - 2 * ARC_X_PAD)) / SKY_W) * 100;
}

// Parabolic arc: x = left→right across strip, y peaks at mid-transit.
function arcPos(frac) {
  const yTop = 14;
  const yBot = SKY_H + 6;       // off-screen at edges
  const x    = ARC_X_PAD + frac * (SKY_W - 2 * ARC_X_PAD);
  const arcY = 1 - Math.sin(frac * Math.PI);
  const y    = yTop + arcY * (yBot - yTop);
  return { x, y };
}

// ============================================================
// COLOR MATH
// ============================================================
function lerpStop(stop, night, day, dl, cool, coolAmt) {
  // Base lerp night → day by daylight, then mix toward cool hour.
  let r = night[stop][0] + (day[stop][0] - night[stop][0]) * dl;
  let g = night[stop][1] + (day[stop][1] - night[stop][1]) * dl;
  let b = night[stop][2] + (day[stop][2] - night[stop][2]) * dl;
  r += (STOPS_COOL[stop][0] - r) * coolAmt;
  g += (STOPS_COOL[stop][1] - g) * coolAmt;
  b += (STOPS_COOL[stop][2] - b) * coolAmt;
  return [
    Math.round(Math.max(0, Math.min(255, r))),
    Math.round(Math.max(0, Math.min(255, g))),
    Math.round(Math.max(0, Math.min(255, b))),
  ];
}

function rgbStr(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }

// Linear interpolation between two rgb triples.
function lerpRgb(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// Sample the base gradient at a given fractional y (0..1). Used for the
// moon shadow so the crescent carves cleanly regardless of moon height.
function sampleBaseAtY(stops, yFrac) {
  if (yFrac <= STOP_OFFSETS[0]) return stops[0];
  if (yFrac >= STOP_OFFSETS[3]) return stops[3];
  // Find the two surrounding stops.
  for (let i = 0; i < 3; i++) {
    if (yFrac <= STOP_OFFSETS[i + 1]) {
      const span = STOP_OFFSETS[i + 1] - STOP_OFFSETS[i];
      const t    = (yFrac - STOP_OFFSETS[i]) / span;
      return lerpRgb(stops[i], stops[i + 1], t);
    }
  }
  return stops[3];
}

// ============================================================
// PUBLIC: render
// ============================================================
export function renderSky() {
  const viewport = els.viewport;
  if (!viewport || !sunEl) return;  // init hasn't run yet

  const t    = ((S.ticks % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
  const day  = Math.floor(S.ticks / TICKS_PER_DAY);
  const dl   = daylightOf(t);
  const cb   = coolBiasOf(t);
  const wb   = warmBiasOf(t);

  // Publish daylight as a CSS var for any future consumer.
  document.documentElement.style.setProperty('--tlh-daylight', dl.toFixed(3));

  // --- base gradient stops ---
  const baseStops = [
    lerpStop(0, STOPS_NIGHT, STOPS_DAY, dl, STOPS_COOL, cb * 0.80),
    lerpStop(1, STOPS_NIGHT, STOPS_DAY, dl, STOPS_COOL, cb * 0.80),
    lerpStop(2, STOPS_NIGHT, STOPS_DAY, dl, STOPS_COOL, cb * 0.80),
    lerpStop(3, STOPS_NIGHT, STOPS_DAY, dl, STOPS_COOL, cb * 0.80),
  ];
  const baseGradient = `linear-gradient(to bottom, `
    + `${rgbStr(baseStops[0])} 0%, `
    + `${rgbStr(baseStops[1])} 38%, `
    + `${rgbStr(baseStops[2])} 72%, `
    + `${rgbStr(baseStops[3])} 100%)`;

  // --- warm radial (only during sunrise/sunset) ---
  let composite = baseGradient;
  if (wb > 0.01) {
    const xPct = sunXPctOf(t);
    // Radial anchored at sun's horizon x. Orange core → pink halo →
    // magenta fringe → transparent. Ellipse is tall so magenta reaches
    // the top of the strip; narrow-ish so the opposite side stays cool.
    composite = `radial-gradient(`
      + `ellipse 55% 190% at ${xPct.toFixed(1)}% 100%, `
      + `rgba(233, 159,  16, ${(0.80 * wb).toFixed(3)}) 0%, `
      + `rgba(225, 115, 160, ${(0.70 * wb).toFixed(3)}) 30%, `
      + `rgba(145,  70, 170, ${(0.55 * wb).toFixed(3)}) 60%, `
      + `rgba(145,  70, 170, 0) 100%), `
      + baseGradient;
  }
  viewport.style.background = composite;

  // --- sun / moon positioning ---
  if (t < HALF_DAY) {
    const frac  = t / HALF_DAY;
    const { x, y } = arcPos(frac);
    sunEl.setAttribute('cx', x);
    sunEl.setAttribute('cy', y);
    sunEl.setAttribute('opacity', '1');
    moonDisc.setAttribute('opacity', '0');
    moonShadow.setAttribute('opacity', '0');
  } else {
    const frac  = (t - HALF_DAY) / HALF_DAY;
    const { x, y } = arcPos(frac);
    moonDisc.setAttribute('cx', x);
    moonDisc.setAttribute('cy', y);

    // Phase: offset a backdrop-colored circle horizontally to carve the crescent.
    // offsetMag sweeps through a cosine so the shadow flips smoothly.
    const phase    = (day % MOON_CYCLE_DAYS) / MOON_CYCLE_DAYS;
    const offsetMag = Math.cos(phase * Math.PI * 2) * (BODY_R * 1.6);
    moonShadow.setAttribute('cx', x + offsetMag);
    moonShadow.setAttribute('cy', y);

    // Sample the base gradient at moon's current y so the carve reads
    // clean whether the moon is in the upper dark stops or the lifted
    // lower stops. (Handoff explicitly called this out.)
    const shadowColor = sampleBaseAtY(baseStops, Math.max(0, Math.min(1, y / SKY_H)));
    moonShadow.setAttribute('fill', rgbStr(shadowColor));

    sunEl.setAttribute('opacity', '0');
    moonDisc.setAttribute('opacity', '1');
    moonShadow.setAttribute('opacity', '1');
  }

  // --- stars: visible at night, fade during dawn/dusk ---
  const starVis = Math.max(0, 1 - dl * 2);
  const driftX  = S.ticks * 0.03;   // shared slow drift
  for (const st of stars) {
    const flick = st.steady
      ? 0.85
      : 0.75 + 0.20 * Math.sin(S.ticks * 0.012 * st.flickerSpeed + st.flickerPhase);
    const x = ((st.x + driftX * st.driftSpeed) % (SKY_W + 20)) - 10;
    st.el.setAttribute('cx', x);
    st.el.setAttribute('opacity', (starVis * flick).toFixed(3));
  }
}
