/* ==============================================
   THE LONG HAUL — topographic map data (v0.0.9.7)

   Heightmap + hypsometric palette for the route-map's
   stepped-hypso terrain rendering. Replaces the per-cell
   biome glyph layer when the topographicMap upgrade is owned.

   Design source: design_handoff_route_map_topo (Oval Stepped variant).
   This module is the production port of map-data.jsx — only the
   pieces the chosen variant uses are kept (oval lake; lobed +
   dendritic alternates dropped). Hydro line/lake overlays are OFF
   in the chosen variant — the heightmap depression itself reads
   as the channel and lake.

   Heightmap is 200\u00d7200 normalized [0..1], built once on module
   load via buildHeightmap(). Bake to a PNG data URL on first paint
   via bakeSteppedHypsoPng() (cached after first call).

   Decoupled from data/terrain.js's gameplay biome classifier
   (terrainAt). The classifier may be retuned in a later patch to
   match this heightmap; for now the visual is naturalistic and the
   gameplay sampler keeps its current shape.
   ============================================== */
'use strict';

// ----- viewBox + heightmap dims -----
const VB_W = 400;
const VB_H = 400;
export const HM_W = 200;
export const HM_H = 200;
const HM_STEP_X = VB_W / (HM_W - 1);
const HM_STEP_Y = VB_H / (HM_H - 1);

// ----- noise primitives -----
function vhash(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return (((h ^ (h >> 16)) >>> 0) % 10000) / 10000;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = vhash(xi,     yi);
  const b = vhash(xi + 1, yi);
  const c = vhash(xi,     yi + 1);
  const d = vhash(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x, y, oct) {
  oct = oct || 5;
  let amp = 0.55, f = 1, sum = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, y * f);
    n   += amp;
    amp *= 0.5;
    f   *= 2.05;
  }
  return sum / n;
}
function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function ridge(x, y, oct) {
  oct = oct || 4;
  let amp = 0.6, f = 1, sum = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    const v = vnoise(x * f, y * f);
    sum += amp * (1 - Math.abs(v * 2 - 1));
    n   += amp;
    amp *= 0.5;
    f   *= 2.07;
  }
  return sum / n;
}

// ----- river control + sampling -----
const RIVER_CTRL = [
  { x: 420, y: -20  },
  { x: 380, y:  30  },
  { x: 340, y:  72  },
  { x: 290, y: 120  },
  { x: 244, y: 138  },
  { x: 210, y: 178  },
  { x: 230, y: 220  },
  { x: 252, y: 252  },
  { x: 260, y: 290  },
  { x: 270, y: 335  },
];
const STREAM_CTRLS = [
  [{ x:  60, y: 340 }, { x: 110, y: 290 }, { x: 160, y: 260 }, { x: 200, y: 245 }, { x: 230, y: 232 }],
  [{ x: -10, y: 130 }, { x:  60, y: 150 }, { x: 120, y: 158 }, { x: 180, y: 156 }, { x: 220, y: 162 }],
  [{ x: 360, y: 240 }, { x: 320, y: 230 }, { x: 285, y: 235 }, { x: 258, y: 248 }],
  [{ x: 110, y: 210 }, { x: 150, y: 205 }, { x: 185, y: 200 }, { x: 213, y: 198 }],
  [{ x: 295, y: 360 }, { x: 305, y: 380 }, { x: 315, y: 410 }],
];

function catmullRom(pts, u) {
  const n = pts.length - 1;
  const i = Math.min(n - 1, Math.max(0, Math.floor(u * n)));
  const t = u * n - i;
  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(n, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  const x = 0.5 * (
    (2 * p1.x) +
    (-p0.x + p2.x) * t +
    (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
    (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
  );
  const y = 0.5 * (
    (2 * p1.y) +
    (-p0.y + p2.y) * t +
    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
  );
  return { x: x, y: y };
}

function buildRiverSamples(ctrl, n, wobbleAmp) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const p = catmullRom(ctrl, u);
    const tang = catmullRom(ctrl, Math.min(1, u + 0.01));
    const dx = tang.x - p.x, dy = tang.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const w = (fbm(p.x * 0.04, p.y * 0.04, 4) - 0.5) * wobbleAmp;
    out[i] = { x: p.x + nx * w, y: p.y + ny * w };
  }
  return out;
}
const RIVER_SAMPLES  = buildRiverSamples(RIVER_CTRL, 260, 14);
const STREAM_SAMPLES = STREAM_CTRLS.map((c, idx) => buildRiverSamples(c, 140, 10 - idx * 1.5));
const RIVER_HALF_W  = 2.6;
const RIVER_BANK    = 4.0;
const STREAM_HALF_W = 1.3;
const STREAM_BANK   = 2.5;

function distToPolyline(px, py, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i].x,     ay = pts[i].y;
    const bx = pts[i + 1].x, by = pts[i + 1].y;
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const ddx = px - (ax + t * dx);
    const ddy = py - (ay + t * dy);
    const d = ddx * ddx + ddy * ddy;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
function riverDist(x, y) { return distToPolyline(x, y, RIVER_SAMPLES); }
function streamDist(x, y) {
  let best = Infinity;
  for (let i = 0; i < STREAM_SAMPLES.length; i++) {
    const d = distToPolyline(x, y, STREAM_SAMPLES[i]);
    if (d < best) best = d;
  }
  return best;
}

// ----- lake (oval, SW reservoir) -----
const DAM_Y       = 320;
const DAM_X       = 270;
const LAKE_CENTER = { x: 280, y: 430 };

function buildLakeShoreline() {
  const N = 120;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2;
    const sN = Math.max(0, -Math.sin(ang));
    const sS = Math.max(0,  Math.sin(ang));
    const rx  = 80 - 25 * sN;
    const ryN = 105 * sN;
    const ryS = 60  * sS;
    let x = LAKE_CENTER.x + Math.cos(ang) * rx;
    let y = LAKE_CENTER.y - ryN + ryS;
    const wob = (fbm(Math.cos(ang) * 3 + 7, Math.sin(ang) * 3 - 4, 4) - 0.5) * 12;
    x += Math.cos(ang) * wob;
    y += Math.sin(ang) * wob * 0.7;
    if (y < DAM_Y) y = DAM_Y;
    pts.push({ x: x, y: y });
  }
  return pts;
}
const LAKE_SHORE = buildLakeShoreline();

function lakeDistFor(x, y, shore) {
  let dMin = Infinity;
  let inside = false;
  const N = shore.length;
  for (let i = 0, j = N - 1; i < N; j = i++) {
    const xi = shore[i].x, yi = shore[i].y;
    const xj = shore[j].x, yj = shore[j].y;
    const dx = xj - xi, dy = yj - yi;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq ? ((x - xi) * dx + (y - yi) * dy) / lenSq : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const ddx = x - (xi + t * dx);
    const ddy = y - (yi + t * dy);
    const d = Math.sqrt(ddx * ddx + ddy * ddy);
    if (d < dMin) dMin = d;
    const hit = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (hit) inside = !inside;
  }
  return inside ? -dMin : dMin;
}

// ----- terrain anchors (decoupled from gameplay terrainAt) -----
const NAT_MOUNTAIN_RIDGE = [
  { x:  70, y: 295 },
  { x:  92, y: 308 },
  { x: 115, y: 300 },
  { x: 140, y: 308 },
  { x: 163, y: 315 },
  { x: 195, y: 318 },
];
const NAT_PEAKS = [
  { x:  92, y: 308, r: 28, h: 0.36 },
  { x: 118, y: 290, r: 22, h: 0.20 },
  { x: 145, y: 305, r: 20, h: 0.14 },
  { x: 315, y: 163, r: 24, h: 0.30 },
  { x: 308, y:  92, r: 18, h: 0.10 },
];
const NAT_HILLS_CENTER = { x: 320, y: 250 };
const NAT_HILLS_R      = 50;
const NAT_RUINS_MESA   = { x: 308, y: 308 };
const NAT_RUINS_R      = 40;
const NAT_DESERT       = { x:  90, y: 110 };
const NAT_MESAS = [
  { x: 55, y: 215, r: 22, h: 0.16 },
  { x: 40, y: 175, r: 20, h: 0.13 },
  { x: 55, y: 140, r: 18, h: 0.10 },
];

// ----- heightmap builder -----
function buildHeightmap() {
  const g = new Float32Array(HM_W * HM_H);
  for (let yy = 0; yy < HM_H; yy++) {
    for (let xx = 0; xx < HM_W; xx++) {
      const x = xx * HM_STEP_X;
      const y = yy * HM_STEP_Y;

      const wx = x + (fbm(x * 0.025 + 11, y * 0.025 + 7,  4) - 0.5) * 36;
      const wy = y + (fbm(x * 0.025 - 4,  y * 0.025 + 13, 4) - 0.5) * 36;

      let h = 0.36 + 0.10 * (fbm(x * 0.012, y * 0.012, 4) - 0.5) * 2;

      const dRidge = distToPolyline(wx, wy, NAT_MOUNTAIN_RIDGE);
      const massif = 1 - smoothstep(0, 75, dRidge);
      const spine  = ridge(x * 0.075, y * 0.075, 4);
      h += 0.40 * Math.pow(massif, 1.1) * (0.55 + 0.55 * spine);

      for (let p = 0; p < NAT_PEAKS.length; p++) {
        const pk = NAT_PEAKS[p];
        const dp = Math.hypot(wx - pk.x, wy - pk.y);
        const peak = 1 - smoothstep(0, pk.r, dp);
        h += pk.h * Math.pow(peak, 1.5);
      }

      const dHills = Math.hypot(wx - NAT_HILLS_CENTER.x, wy - NAT_HILLS_CENTER.y);
      const hills  = 1 - smoothstep(0, NAT_HILLS_R + 15, dHills);
      const rocky  = 0.5 + 0.5 * ridge(x * 0.09, y * 0.09, 3);
      h += 0.18 * Math.pow(hills, 1.0) * (0.55 + 0.75 * (fbm(x * 0.08, y * 0.08, 4) - 0.5)) * rocky;

      const dRuins = Math.hypot(wx - NAT_RUINS_MESA.x, wy - NAT_RUINS_MESA.y);
      const mesa   = 1 - smoothstep(0, NAT_RUINS_R, dRuins);
      h += 0.34 * Math.pow(mesa, 0.4);

      for (let m = 0; m < NAT_MESAS.length; m++) {
        const ms = NAT_MESAS[m];
        const dM = Math.hypot(wx - ms.x, wy - ms.y);
        const mt = 1 - smoothstep(0, ms.r, dM);
        h += ms.h * Math.pow(mt, 0.45);
      }

      const dDes = Math.hypot(wx - NAT_DESERT.x, wy - NAT_DESERT.y);
      const des  = 1 - smoothstep(0, 80, dDes);
      h -= 0.06 * des;
      h += 0.04 * des * (vnoise(x * 0.18, y * 0.18) - 0.5);

      const rd = riverDist(x, y);
      const carve = 1 - smoothstep(0, RIVER_HALF_W + RIVER_BANK + 10, rd);
      h -= 0.32 * Math.pow(carve, 1.0);

      const sd = streamDist(x, y);
      const sCarve = 1 - smoothstep(0, STREAM_HALF_W + STREAM_BANK + 6, sd);
      h -= 0.18 * Math.pow(sCarve, 1.0);

      const ld = lakeDistFor(x, y, LAKE_SHORE);
      if (ld < 4) {
        const lakeMix = 1 - smoothstep(-6, 4, ld);
        h = h * (1 - lakeMix) + 0.04 * lakeMix;
      }

      h += 0.07 * (fbm(x * 0.13, y * 0.13, 4) - 0.5);

      g[yy * HM_W + xx] = Math.max(0, Math.min(1, h));
    }
  }
  return g;
}
export const HEIGHTMAP = buildHeightmap();

// ----- hypsometric palette (8-band stepped) -----
const HYPSO_STOPS = [
  { t: 0.00, c: '#0b2e2d' },
  { t: 0.14, c: '#143f3d' },
  { t: 0.28, c: '#2a5c5a' },
  { t: 0.42, c: '#3a6a68' },
  { t: 0.56, c: '#4a7a78' },
  { t: 0.70, c: '#5f9492' },
  { t: 0.82, c: '#7aa8a6' },
  { t: 0.92, c: '#79bac5' },
  { t: 1.00, c: '#77bfcf' },
];
function mixHex(a, b, k) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ar = (A >> 16) & 255, ag = (A >> 8) & 255, ab = A & 255;
  const br = (B >> 16) & 255, bg = (B >> 8) & 255, bb = B & 255;
  const r  = Math.round(ar + (br - ar) * k);
  const g  = Math.round(ag + (bg - ag) * k);
  const b2 = Math.round(ab + (bb - ab) * k);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b2).toString(16).slice(1);
}
function hypsoSample(t) {
  const x = Math.max(0, Math.min(0.999, t));
  for (let i = 0; i < HYPSO_STOPS.length - 1; i++) {
    const a = HYPSO_STOPS[i], b = HYPSO_STOPS[i + 1];
    if (x >= a.t && x <= b.t) {
      const k = (x - a.t) / (b.t - a.t || 1);
      return mixHex(a.c, b.c, k);
    }
  }
  return HYPSO_STOPS[HYPSO_STOPS.length - 1].c;
}

// ----- bake heightmap to PNG dataURL (one-time, cached) -----
//
// Quantize each cell into one of 8 elevation bands and look up the
// band-center color from the hypso ramp. Result is a 200\u00d7200 PNG
// scaled to the route map's 400\u00d7400 viewBox via SVG <image>.
let _bakedDataUrl = null;
export function bakeSteppedHypsoPng() {
  if (_bakedDataUrl) return _bakedDataUrl;
  const canvas = document.createElement('canvas');
  canvas.width  = HM_W;
  canvas.height = HM_H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(HM_W, HM_H);
  // Pre-compute 8 band-center colors as RGB triples for fast pixel writes.
  const bandColors = [];
  for (let band = 0; band < 8; band++) {
    const tCenter = (band + 0.5) / 8;
    const hex = hypsoSample(tCenter);
    const v = parseInt(hex.slice(1), 16);
    bandColors.push([(v >> 16) & 255, (v >> 8) & 255, v & 255]);
  }
  for (let i = 0; i < HEIGHTMAP.length; i++) {
    const e = HEIGHTMAP[i];
    let band = Math.floor(e * 8);
    if (band < 0) band = 0; else if (band > 7) band = 7;
    const rgb = bandColors[band];
    const o = i * 4;
    img.data[o]     = rgb[0];
    img.data[o + 1] = rgb[1];
    img.data[o + 2] = rgb[2];
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  _bakedDataUrl = canvas.toDataURL('image/png');
  return _bakedDataUrl;
}

