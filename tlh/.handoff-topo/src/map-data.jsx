// Map data — ring topology + node positions ported from
// tlh/js/render/route-map.js (preserved EXACTLY so gameplay coords
// stay valid). Terrain layer is OURS — naturalistic, decoupled from
// the in-game biome anchors so we can iterate visuals freely. The
// game-side terrain sampler will be retuned later to match.

// ── TLH palette (from :root in the-long-haul.css) ──────────────
const TLH = {
  shellBg:    '#155352',
  panel:      '#0d3533',
  panelDark:  '#0b2e2d',
  panelDarker:'#081f1e',
  rule:       '#1e5554',
  textFaint:  '#2a5c5a',
  textDim:    '#3a6a68',
  textMid:    '#4a7a78',
  textSec:    '#7aa8a6',
  text:       '#b1c9c3',
  textBright: '#e0eeec',
  accent:     '#77bfcf',
  accentDeep: '#40a4b9',
  warn:       '#9d78d4',
  warnDeep:   '#7a58a4',
  crit:       '#da8bda',
};

// ── viewBox + ring layout (matches route-map.js) ────────────────
const VB_W = 400;
const VB_H = 400;
const RING_CX = 200;
const RING_CY = 200;
const INTERIOR_CELL_STEP = 12;

// ── 12 ring nodes (verbatim from route-map.js) ──────────────────
const NODES = [
  { id:'A', g:'ρ', x: 85, y:163, label:'depot',              kind:'depot'   },
  { id:'·', g:'ψ', x:163, y: 85, label:'oasis',              kind:'oasis'   },
  { id:'B', g:'ι', x:237, y: 85, label:'greenhouse',         kind:'farm'    },
  { id:'?', g:'φ', x:315, y:163, label:'weather station',    kind:'station' },
  { id:'C', g:'ξ', x:308, y:308, label:'city ruins',         kind:'ruins'   },
  { id:'H', g:'τ', x: 85, y:237, label:'home',               kind:'home'    },
  { id:'ν', g:'ν', x: 92, y: 92, label:'purification plant', kind:'plant'   },
  { id:'θ', g:'θ', x:308, y: 92, label:'kiln',               kind:'kiln'    },
  { id:'γ', g:'γ', x:315, y:237, label:'workshop',           kind:'shop'    },
  { id:'λ', g:'λ', x:163, y:315, label:'climbing lodge',     kind:'lodge'   },
  { id:'π', g:'π', x: 92, y:308, label:'radio tower',        kind:'tower'   },
  { id:'δ', g:'δ', x:237, y:315, label:'reservoir',          kind:'dam'     },
];
const NODE_BY_ID = Object.fromEntries(NODES.map(n => [n.id, n]));
const EDGE_ORDER = ['A','ν','·','B','θ','?','γ','C','δ','λ','π','H'];
const EDGES = EDGE_ORDER.map((id, i) => [id, EDGE_ORDER[(i+1) % EDGE_ORDER.length]]);

// ── Naturalistic noise plumbing ────────────────────────────────
function vhash(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return (((h ^ (h >> 16)) >>> 0) % 10000) / 10000;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx*fx*(3-2*fx), v = fy*fy*(3-2*fy);
  const a = vhash(xi,yi),     b = vhash(xi+1,yi);
  const c = vhash(xi,yi+1),   d = vhash(xi+1,yi+1);
  return (a*(1-u)+b*u)*(1-v) + (c*(1-u)+d*u)*v;
}
function fbm(x, y, oct = 5) {
  let amp = 0.55, f = 1, sum = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x*f, y*f); n += amp;
    amp *= 0.5; f *= 2.05;
  }
  return sum / n;
}
function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
// Ridge noise — gives sharp linear features (good for mountain spines)
function ridge(x, y, oct = 4) {
  let amp = 0.6, f = 1, sum = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    const v = vnoise(x*f, y*f);
    sum += amp * (1 - Math.abs(v*2 - 1));
    n += amp;
    amp *= 0.5; f *= 2.07;
  }
  return sum / n;
}

// ── Naturalistic river — Catmull-Rom spline through control pts ─
// Source originates OFF-MAP in the NE highlands (past the viewBox),
// flows SW through the inhabited ring, and terminates at the
// reservoir lake's north inlet (well south of δ, past the dam).
const RIVER_CTRL = [
  { x: 420, y:  -20 },  // headwaters — off-map, NE highlands
  { x: 380, y:  30 },
  { x: 340, y:  72 },
  { x: 290, y: 120 },
  { x: 244, y: 138 },
  { x: 210, y: 178 },
  { x: 230, y: 220 },
  { x: 252, y: 252 },
  { x: 260, y: 290 },
  { x: 270, y: 335 },  // inlet to lake — past the ring road, SE corner
];

// ── Tributaries (streams feeding the main river) ───────────────
// Each is its own Catmull-Rom polyline; junction snaps to the main
// channel. Streams originate from the mountain massif + NE plateau.
const STREAM_CTRLS = [
  // Stream 1 — drains the SW mountain ridge NE into the river above
  // the lake. Stays well clear of the reservoir.
  [
    { x:  60, y: 340 },
    { x: 110, y: 290 },
    { x: 160, y: 260 },
    { x: 200, y: 245 },
    { x: 230, y: 232 },  // joins main river mid-south
  ],
  // Stream 2 — small NW desert wadi, intermittent feel.
  [
    { x:  -10, y: 130 },
    { x:  60,  y: 150 },
    { x: 120,  y: 158 },
    { x: 180,  y: 156 },
    { x: 220,  y: 162 },  // joins upper-mid river bend
  ],
  // Stream 3 — eastern hills runoff, short but well-defined.
  [
    { x: 360, y: 240 },
    { x: 320, y: 230 },
    { x: 285, y: 235 },
    { x: 258, y: 248 },  // joins main river near hills
  ],
  // Stream 4 — small western feeder out of the foothills.
  [
    { x: 110, y: 210 },
    { x: 150, y: 205 },
    { x: 185, y: 200 },
    { x: 213, y: 198 },  // joins river at upper bend
  ],
  // Stream 5 — outlet BELOW the dam, exits map to the south.
  // Engineering tells: this is the controlled release downstream
  // of the reservoir, draining off-map.
  [
    { x: 295, y: 360 },
    { x: 305, y: 380 },
    { x: 315, y: 410 },  // exits viewBox bottom
  ],
];

// ── Reservoir lake ─────────────────────────────────────────────
// Sits SOUTH of the dam node δ, OUTSIDE the inhabited ring. The
// dam wall (the ring road segment between λ and δ) is what holds
// it back. Pulled east of the SW mountain ridge so it doesn't
// clip through high terrain. Outlet stream releases downstream
// past the viewBox.
const DAM_Y      = 320;          // implicit dam line — north shore
const DAM_X      = 270;          // shifted east of the ridge
const DAM_HALF_W = 14;           // half-width of the dam wall in svg units
const LAKE_INLET = { x: 270, y: 335 };
// Lake center pushed further south past the viewBox edge so only
// a sliver of the north shore shows on-canvas — the body of the
// reservoir sprawls off-map.
const LAKE_CENTER = { x: 280, y: 430 };
// Build an irregular shoreline that intentionally extends past the
// viewBox on the east, west, and south. The renderer + clip-path
// crops it; we WANT the off-map indication.
function buildLakeShoreline() {
  const N = 120;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2;  // 0 = east, π/2 = south
    const sN = Math.max(0, -Math.sin(ang));   // north factor (0..1)
    const sS = Math.max(0,  Math.sin(ang));   // south factor (0..1)
    const sE = Math.max(0,  Math.cos(ang));
    const sW = Math.max(0, -Math.cos(ang));
    // Lake reach — modest, so only a sliver shows on-canvas.
    const rx = 80 - 25 * sN;       // east/west reach (~ +/- 80 from center)
    const ryN = 105 * sN;          // up toward dam (clamped at DAM_Y)
    const ryS = 60 * sS;           // down off-map
    let x = LAKE_CENTER.x + Math.cos(ang) * rx;
    let y = LAKE_CENTER.y - ryN + ryS;
    // FBM wobble for natural shoreline
    const wob = (fbm(Math.cos(ang)*3 + 7, Math.sin(ang)*3 - 4, 4) - 0.5) * 12;
    x += Math.cos(ang) * wob;
    y += Math.sin(ang) * wob * 0.7;
    // Clamp the northern shore to the dam line — held back by road.
    // West of the dam wall, shore continues at DAM_Y (the lake
    // wraps past the dam on both sides).
    if (y < DAM_Y) y = DAM_Y;
    pts.push({ x, y });
  }
  return pts;
}
const LAKE_SHORE = buildLakeShoreline();

// Catmull-Rom (uniform) sample at parameter u in [0..1]
function catmullRom(pts, u) {
  const n = pts.length - 1;
  const i = Math.min(n - 1, Math.max(0, Math.floor(u * n)));
  const t = u * n - i;
  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(n, i + 2)];
  const t2 = t*t, t3 = t2*t;
  const x = 0.5 * (
    (2*p1.x) +
    (-p0.x + p2.x) * t +
    (2*p0.x - 5*p1.x + 4*p2.x - p3.x) * t2 +
    (-p0.x + 3*p1.x - 3*p2.x + p3.x) * t3
  );
  const y = 0.5 * (
    (2*p1.y) +
    (-p0.y + p2.y) * t +
    (2*p0.y - 5*p1.y + 4*p2.y - p3.y) * t2 +
    (-p0.y + 3*p1.y - 3*p2.y + p3.y) * t3
  );
  return { x, y };
}

// Pre-sample a polyline along the spline so distance queries are cheap.
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
const RIVER_SAMPLES = buildRiverSamples(RIVER_CTRL, 260, 14);
const STREAM_SAMPLES = STREAM_CTRLS.map((c, idx) =>
  // Different wobble seed per stream by offsetting via index
  buildRiverSamples(c, 140, 10 - idx * 1.5)
);

const RIVER_HALF_W = 2.6;   // narrower channel
const RIVER_BANK   = 4.0;   // sandy/clay bank either side
const STREAM_HALF_W = 1.3;  // skinnier than the main river
const STREAM_BANK   = 2.5;

function distToPolyline(px, py, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i].x, ay = pts[i].y;
    const bx = pts[i+1].x, by = pts[i+1].y;
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx*dx + dy*dy;
    let t = lenSq ? ((px - ax)*dx + (py - ay)*dy) / lenSq : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const ddx = px - (ax + t*dx), ddy = py - (ay + t*dy);
    const d = ddx*ddx + ddy*ddy;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
function riverDist(x, y) { return distToPolyline(x, y, RIVER_SAMPLES); }
function streamDist(x, y) {
  let best = Infinity;
  for (const s of STREAM_SAMPLES) {
    const d = distToPolyline(x, y, s);
    if (d < best) best = d;
  }
  return best;
}

// Lake distance — negative inside the polygon, positive outside.
// Use point-in-poly + min distance to shoreline edges.
//
// SHAPE SOURCE: This is what sculpts the actual heightmap depression
// AND the (optional) overlay polygon. Switch ACTIVE_LAKE_SHORE to
// LAKE_SHORE | LAKE_SHORE_LOBED | LAKE_SHORE_DENDRITIC to change the
// lake shape across the whole system. Currently DENDRITIC — flooded-
// valley fingers reach up tributaries instead of forming an ellipse.
function lakeDistFor(x, y, shore) {
  let dMin = Infinity;
  let inside = false;
  const pts = shore;
  const N = pts.length;
  for (let i = 0, j = N - 1; i < N; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    const dx = xj - xi, dy = yj - yi;
    const lenSq = dx*dx + dy*dy;
    let t = lenSq ? ((x - xi)*dx + (y - yi)*dy) / lenSq : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const ddx = x - (xi + t*dx), ddy = y - (yi + t*dy);
    const d = Math.sqrt(ddx*ddx + ddy*ddy);
    if (d < dMin) dMin = d;
    const hit = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (hit) inside = !inside;
  }
  return inside ? -dMin : dMin;
}
function lakeDist(x, y) {
  return lakeDistFor(x, y, ACTIVE_LAKE_SHORE || LAKE_SHORE);
}
function inLake(x, y) { return lakeDist(x, y) < 0; }

// Build SVG path strings
function polylineToD(pts) {
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)}`;
  }
  return d;
}
const RIVER_PATH_D = polylineToD(RIVER_SAMPLES);
const STREAM_PATH_DS = STREAM_SAMPLES.map(polylineToD);

// Lake outline path — direct from shoreline polygon.
const LAKE_PATH_D = (() => {
  let d = '';
  for (let i = 0; i < LAKE_SHORE.length; i++) {
    d += (i === 0 ? 'M' : 'L') + LAKE_SHORE[i].x.toFixed(1) + ',' + LAKE_SHORE[i].y.toFixed(1) + ' ';
  }
  return d + 'Z';
})();

// ── Alternate lake shapes (mockup) ─────────────────────────────
// Two alternatives to the current "oval" reservoir, for comparison.
//
// LOBED OVAL: same overall ellipse, but rx is modulated by a
//   low-frequency lobe term so the shoreline has 2–3 bays + a
//   peninsula or two. Cheap, naturalistic, doesn't reach into
//   off-map valleys.
//
// DENDRITIC: built as the union of fattened "drowned valley"
//   axis lines radiating south from the impoundment. Reads as
//   a flooded river system — the classic Lake Powell / Shasta
//   shape. We render it by sampling distance to the axis fingers
//   and emitting an isoline at width=W.
function buildLakeShorelineLobed() {
  const N = 140;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2;
    const sN = Math.max(0, -Math.sin(ang));
    const sS = Math.max(0,  Math.sin(ang));
    // Lobe modulation: 3 bays around the south half + 1 pen on east.
    // Two-frequency cosine sum gives a gentle wavy outline.
    const lobe = 1
      + 0.18 * Math.cos(ang * 3 + 0.6)   // 3 bays
      + 0.10 * Math.cos(ang * 5 - 1.2);  // smaller scallops
    let rx = (80 - 25 * sN) * lobe;
    const ryN = 105 * sN;
    const ryS = 60 * sS * lobe;
    let x = LAKE_CENTER.x + Math.cos(ang) * rx;
    let y = LAKE_CENTER.y - ryN + ryS;
    const wob = (fbm(Math.cos(ang)*3 + 7, Math.sin(ang)*3 - 4, 4) - 0.5) * 14;
    x += Math.cos(ang) * wob;
    y += Math.sin(ang) * wob * 0.7;
    if (y < DAM_Y) y = DAM_Y;
    pts.push({ x, y });
  }
  return pts;
}
const LAKE_SHORE_LOBED = buildLakeShorelineLobed();
const LAKE_PATH_D_LOBED = (() => {
  let d = '';
  for (let i = 0; i < LAKE_SHORE_LOBED.length; i++) {
    d += (i === 0 ? 'M' : 'L') + LAKE_SHORE_LOBED[i].x.toFixed(1) + ',' + LAKE_SHORE_LOBED[i].y.toFixed(1) + ' ';
  }
  return d + 'Z';
})();

// Dendritic: 4 "drowned valley" axes fan south from near the dam.
// Lake = union of fattened axis lines. We march squares along a
// grid and emit a polygon at width=W via metaball-style threshold.
// Fingers reach DEEP into the on-canvas area so the branching reads.
const DENDRITIC_AXES = [
  // Trunk runs roughly N-S, off-map south
  { a: { x: 270, y: 322 }, b: { x: 290, y: 480 }, w0: 20, w1: 14 },
  // East finger — long, reaching past the SE city ruins shoulder
  { a: { x: 280, y: 350 }, b: { x: 380, y: 380 }, w0: 14, w1:  6 },
  // SW finger — reaching back W under the mountains
  { a: { x: 270, y: 340 }, b: { x: 175, y: 395 }, w0: 14, w1:  5 },
  // Mid sub-finger pointing SE
  { a: { x: 295, y: 380 }, b: { x: 360, y: 470 }, w0: 10, w1:  4 },
  // Small north pocket — a "flooded side valley" tucked behind the dam
  { a: { x: 248, y: 332 }, b: { x: 220, y: 360 }, w0:  9, w1:  4 },
];
// Distance from point p to a fattened line segment (lerping width).
function dendriticInfluence(x, y) {
  let best = Infinity;
  for (const ax of DENDRITIC_AXES) {
    const dx = ax.b.x - ax.a.x, dy = ax.b.y - ax.a.y;
    const len2 = dx*dx + dy*dy;
    let t = ((x - ax.a.x)*dx + (y - ax.a.y)*dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax.a.x + t*dx, py = ax.a.y + t*dy;
    const d = Math.hypot(x - px, y - py);
    const w = ax.w0 + (ax.w1 - ax.w0) * t;
    // Signed: negative = inside, positive = outside
    const signed = d - w;
    if (signed < best) best = signed;
  }
  return best;
}
// March a coarse grid, then trace the threshold contour at level=0.
// Reuse the marching-squares approach used for terrain bands.
function buildDendriticShoreline() {
  const W = 110, H = 110;
  const x0 = 150, y0 = 290, x1 = 410, y1 = 510;
  const dx = (x1 - x0) / (W - 1), dy = (y1 - y0) / (H - 1);
  const grid = new Float32Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = x0 + i*dx, y = y0 + j*dy;
      // Add fbm wobble so shoreline isn't perfectly smooth
      const wob = (fbm(x*0.05, y*0.05, 3) - 0.5) * 5;
      grid[j*W + i] = dendriticInfluence(x, y) + wob;
    }
  }
  // Quick & dirty: emit a polyline by tracing along threshold via
  // pixel-perimeter walk. Simpler approach for an SVG path: sample
  // many radial rays from a center point. But dendritic isn't star-
  // shaped, so radial fails. Instead, use marching squares.
  // (Implementation: mirror the contour code from terrain.)
  return marchingSquaresPolygon(grid, W, H, x0, y0, dx, dy, 0);
}
// Minimal MS that returns a single closed polygon (assumes one
// connected component, which dendritic gives us). Falls back to a
// rectangle if anything goes wrong.
function marchingSquaresPolygon(g, W, H, x0, y0, dx, dy, lvl) {
  // Build edge segments per cell, then chain into a polygon.
  const segs = [];
  const lerp = (a, b, va, vb) => {
    const t = (lvl - va) / (vb - va);
    return [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t];
  };
  for (let j = 0; j < H-1; j++) {
    for (let i = 0; i < W-1; i++) {
      const tl = g[j*W + i], tr = g[j*W + i+1];
      const bl = g[(j+1)*W + i], br = g[(j+1)*W + i+1];
      let code = 0;
      if (tl < lvl) code |= 8;
      if (tr < lvl) code |= 4;
      if (br < lvl) code |= 2;
      if (bl < lvl) code |= 1;
      if (code === 0 || code === 15) continue;
      const ax = x0 + i*dx, ay = y0 + j*dy;
      const bx = ax + dx, by = ay + dy;
      const T = [ax, ay], TR = [bx, ay], BR = [bx, by], BL = [ax, by];
      const eT = () => lerp(T, TR, tl, tr);
      const eR = () => lerp(TR, BR, tr, br);
      const eB = () => lerp(BL, BR, bl, br);
      const eL = () => lerp(T, BL, tl, bl);
      const push = (a, b) => segs.push([a, b]);
      switch (code) {
        case 1: case 14: push(eL(), eB()); break;
        case 2: case 13: push(eB(), eR()); break;
        case 3: case 12: push(eL(), eR()); break;
        case 4: case 11: push(eT(), eR()); break;
        case 6: case 9:  push(eT(), eB()); break;
        case 7: case 8:  push(eL(), eT()); break;
        case 5:          push(eL(), eT()); push(eB(), eR()); break;
        case 10:         push(eT(), eR()); push(eL(), eB()); break;
      }
    }
  }
  // Chain segments into a single polygon.
  if (segs.length === 0) return [{ x: 0, y: 0 }];
  const poly = [];
  const used = new Array(segs.length).fill(false);
  used[0] = true;
  poly.push({ x: segs[0][0][0], y: segs[0][0][1] });
  poly.push({ x: segs[0][1][0], y: segs[0][1][1] });
  let last = segs[0][1];
  for (let step = 0; step < segs.length; step++) {
    let found = false;
    for (let s = 0; s < segs.length; s++) {
      if (used[s]) continue;
      const [a, b] = segs[s];
      const da = Math.hypot(a[0]-last[0], a[1]-last[1]);
      const db = Math.hypot(b[0]-last[0], b[1]-last[1]);
      if (da < 0.5) { poly.push({ x: b[0], y: b[1] }); last = b; used[s] = true; found = true; break; }
      if (db < 0.5) { poly.push({ x: a[0], y: a[1] }); last = a; used[s] = true; found = true; break; }
    }
    if (!found) break;
  }
  return poly;
}
const LAKE_SHORE_DENDRITIC = buildDendriticShoreline();
// Pick the active lake shape. Changes BOTH the heightmap depression
// and the overlay polygon.
const ACTIVE_LAKE_SHORE = LAKE_SHORE;
const LAKE_PATH_D_DENDRITIC = (() => {
  if (!LAKE_SHORE_DENDRITIC.length) return '';
  let d = '';
  for (let i = 0; i < LAKE_SHORE_DENDRITIC.length; i++) {
    d += (i === 0 ? 'M' : 'L') + LAKE_SHORE_DENDRITIC[i].x.toFixed(1) + ',' + LAKE_SHORE_DENDRITIC[i].y.toFixed(1) + ' ';
  }
  return d + 'Z';
})();

// ── Naturalistic biome anchors (decoupled from game data) ──────
// Mountains form an arc along the SW corner. Hills cluster around
// the workshop (γ) on the east. The city ruins (ξ, SE corner) sit
// on a mesa — high, flat-topped, defensible. Plateau covers the NE,
// desert the NW.
// SW mountain ridge — the high spine. π (92,308) is the summit end,
// λ (163,315) is the approach/foothill end. Ridge curves up from
// the lowland near λ toward the π summit, so contours read as
// "climbing the mountain to reach the radio tower."
const NAT_MOUNTAIN_RIDGE = [
  { x: 70,  y: 295 },  // beyond π, fades off-map W
  { x: 92,  y: 308 },  // π — summit
  { x: 115, y: 300 },  // shoulder descending east
  { x: 140, y: 308 },
  { x: 163, y: 315 },  // λ — climbing lodge / approach
  { x: 195, y: 318 },  // foothill tail toward δ
];
// Discrete summits — small radial bumps stamped on top of the broader
// terrain. Heights chosen for narrative correctness:
//   • π radio tower SITS on the highest peak of the SW massif
//   • λ climbing lodge is the APPROACH (foothill, lower), not summit
//   • φ weather station occupies its own peak in the east
//   • θ kiln has a small knoll so it isn't perfectly flat lowland
//   • plus two unnamed massif peaks for ridge rhythm
const NAT_PEAKS = [
  // SW massif — π is the boss, others ramp down toward λ approach
  { x:  92, y: 308, r: 28, h: 0.36 },  // π radio tower — tallest peak
  { x: 118, y: 290, r: 22, h: 0.20 },  // shoulder
  { x: 145, y: 305, r: 20, h: 0.14 },  // descending
  // φ weather station — its own discrete peak in the east
  { x: 315, y: 163, r: 24, h: 0.30 },
  // θ kiln knoll — small bump so kiln isn't flat
  { x: 308, y:  92, r: 18, h: 0.10 },
];
const NAT_HILLS_CENTER  = { x: 320, y: 250 };  // pulled S of γ so it doesn't merge with φ peak
const NAT_HILLS_R       = 50;                  // tighter — was 70
const NAT_RUINS_MESA    = { x: 308, y: 308 };  // city ruins (ξ) on a mesa
const NAT_RUINS_R       = 40;
const NAT_DESERT        = { x: 90,  y: 110 };  // NW

// Mesa table-tops west of home (τ at 85,237) leading NW into desert.
// Flat-topped, sharp-shouldered — a stepped descent from inhabited
// band down into the desert basin. Each mesa is a discrete plateau.
const NAT_MESAS = [
  { x:  55, y: 215, r: 22, h: 0.16 },  // tallest, just W of home
  { x:  40, y: 175, r: 20, h: 0.13 },  // mid step
  { x:  55, y: 140, r: 18, h: 0.10 },  // last step before desert
];

function distToNaturalRidge(x, y) {
  return distToPolyline(x, y, NAT_MOUNTAIN_RIDGE);
}

// ── Heightmap (200×200 — 2px cells, double res for smoother contours) ─
const HM_W = 200, HM_H = 200;
const HM_STEP_X = VB_W / (HM_W - 1);
const HM_STEP_Y = VB_H / (HM_H - 1);

function buildHeightmap(lakeShore = LAKE_SHORE) {
  const g = new Float32Array(HM_W * HM_H);
  for (let yy = 0; yy < HM_H; yy++) {
    for (let xx = 0; xx < HM_W; xx++) {
      const x = xx * HM_STEP_X;
      const y = yy * HM_STEP_Y;

      // Domain-warp the lookup coords so every feature falls along
      // wobbly contours instead of perfect circles.
      const wx = x + (fbm(x*0.025 + 11, y*0.025 + 7, 4) - 0.5) * 36;
      const wy = y + (fbm(x*0.025 - 4,  y*0.025 + 13, 4) - 0.5) * 36;

      // Base elevation drifts gently across the map
      let h = 0.36 + 0.10 * (fbm(x*0.012, y*0.012, 4) - 0.5) * 2;

      // Mountain massif — broad ridge dome (lowered so peaks have
      // headroom; was 0.55, now 0.40). Spine noise frequency bumped
      // for crinklier surface detail.
      const dRidge = distToPolyline(wx, wy, NAT_MOUNTAIN_RIDGE);
      const massif = 1 - smoothstep(0, 75, dRidge);
      const spine  = ridge(x*0.075, y*0.075, 4);
      h += 0.40 * Math.pow(massif, 1.1) * (0.55 + 0.55 * spine);

      // Discrete peaks — small radial gaussians along the ridge so the
      // massif has named summits instead of a saturated dome top.
      for (let p = 0; p < NAT_PEAKS.length; p++) {
        const pk = NAT_PEAKS[p];
        const dp = Math.hypot(wx - pk.x, wy - pk.y);
        const peak = 1 - smoothstep(0, pk.r, dp);
        h += pk.h * Math.pow(peak, 1.5);
      }

      // Hills — rolling band south of workshop (γ). Rocky character
      // but tighter footprint so it doesn't bleed into the φ peak.
      const dHills = Math.hypot(wx - NAT_HILLS_CENTER.x, wy - NAT_HILLS_CENTER.y);
      const hills  = 1 - smoothstep(0, NAT_HILLS_R + 15, dHills);
      const rocky  = 0.5 + 0.5 * ridge(x*0.09, y*0.09, 3);
      h += 0.18 * Math.pow(hills, 1.0) * (0.55 + 0.75 * (fbm(x*0.08, y*0.08, 4) - 0.5)) * rocky;

      // City ruins mesa — sharp-shouldered, flat top (the ruins sit
      // on the plateau crown). Falls off quickly to give a real edge.
      const dRuins = Math.hypot(wx - NAT_RUINS_MESA.x, wy - NAT_RUINS_MESA.y);
      const mesa = 1 - smoothstep(0, NAT_RUINS_R, dRuins);
      h += 0.34 * Math.pow(mesa, 0.4);

      // Mesa stepping NW from home (τ) into the desert. Each mesa is
      // sharp-shouldered (low exponent on smoothstep result) so the
      // contours show distinct table edges, not smooth domes.
      for (let m = 0; m < NAT_MESAS.length; m++) {
        const ms = NAT_MESAS[m];
        const dM = Math.hypot(wx - ms.x, wy - ms.y);
        const mt = 1 - smoothstep(0, ms.r, dM);
        h += ms.h * Math.pow(mt, 0.45);
      }

      // Desert basin — slight depression with dune noise
      const dDes = Math.hypot(wx - NAT_DESERT.x, wy - NAT_DESERT.y);
      const des  = 1 - smoothstep(0, 80, dDes);
      h -= 0.06 * des;
      h += 0.04 * des * (vnoise(x*0.18, y*0.18) - 0.5);

      // River carve — strong negative, narrow channel + softer banks.
      // Carve runs deep enough to hit the lowest hypsometric band so
      // the channel reads as water without needing a stroke overlay.
      const rd = riverDist(x, y);
      const carve = 1 - smoothstep(0, RIVER_HALF_W + RIVER_BANK + 10, rd);
      h -= 0.32 * Math.pow(carve, 1.0);

      // Stream carves — softer, narrower, but still deep enough to
      // drop into the lowest 1-2 bands.
      const sd = streamDist(x, y);
      const sCarve = 1 - smoothstep(0, STREAM_HALF_W + STREAM_BANK + 6, sd);
      h -= 0.18 * Math.pow(sCarve, 1.0);

      // Lake — flatten to the basin floor (lowest band).
      // lakeDist returns world-unit distance now (negative inside).
      const ld = lakeDistFor(x, y, lakeShore);
      if (ld < 4) {
        const lakeMix = 1 - smoothstep(-6, 4, ld);
        h = h * (1 - lakeMix) + 0.04 * lakeMix;
      }

      // High-frequency surface texture
      h += 0.07 * (fbm(x*0.13, y*0.13, 4) - 0.5);

      g[yy * HM_W + xx] = Math.max(0, Math.min(1, h));
    }
  }
  return g;
}
const HEIGHTMAP = buildHeightmap();
// Pre-baked alternates so per-card mockups can show the lake-shape
// effect on the carved elevation.
const HEIGHTMAP_LOBED     = buildHeightmap(LAKE_SHORE_LOBED);
const HEIGHTMAP_DENDRITIC = buildHeightmap(LAKE_SHORE_DENDRITIC);

function sampleHeight(x, y) {
  const fx = x / HM_STEP_X;
  const fy = y / HM_STEP_Y;
  const x0 = Math.max(0, Math.min(HM_W - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(HM_H - 1, Math.floor(fy)));
  const x1 = Math.min(HM_W - 1, x0 + 1);
  const y1 = Math.min(HM_H - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const a = HEIGHTMAP[y0*HM_W + x0];
  const b = HEIGHTMAP[y0*HM_W + x1];
  const c = HEIGHTMAP[y1*HM_W + x0];
  const d = HEIGHTMAP[y1*HM_W + x1];
  return (a*(1-tx)+b*tx)*(1-ty) + (c*(1-tx)+d*tx)*ty;
}

// ── Hypsometric palette: muted teal-green → sharp blue-green ───
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
  const ar=(A>>16)&255, ag=(A>>8)&255, ab=A&255;
  const br=(B>>16)&255, bg=(B>>8)&255, bb=B&255;
  const r = Math.round(ar+(br-ar)*k);
  const g = Math.round(ag+(bg-ag)*k);
  const b2= Math.round(ab+(bb-ab)*k);
  return '#' + ((1<<24)+(r<<16)+(g<<8)+b2).toString(16).slice(1);
}
function hypsoSample(t) {
  const x = Math.max(0, Math.min(0.999, t));
  for (let i = 0; i < HYPSO_STOPS.length - 1; i++) {
    const a = HYPSO_STOPS[i], b = HYPSO_STOPS[i+1];
    if (x >= a.t && x <= b.t) {
      const k = (x - a.t) / (b.t - a.t || 1);
      return mixHex(a.c, b.c, k);
    }
  }
  return HYPSO_STOPS[HYPSO_STOPS.length-1].c;
}

// ── Point in ring polygon ──────────────────────────────────────
function pointInRing(px, py) {
  const pts = EDGE_ORDER.map(id => NODE_BY_ID[id]);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    const hit = ((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}

Object.assign(window, {
  TLH, VB_W, VB_H, RING_CX, RING_CY, INTERIOR_CELL_STEP,
  NODES, NODE_BY_ID, EDGES, EDGE_ORDER,
  HEIGHTMAP, HEIGHTMAP_LOBED, HEIGHTMAP_DENDRITIC, HM_W, HM_H, sampleHeight,
  hypsoSample, pointInRing,
  RIVER_PATH_D, STREAM_PATH_DS, LAKE_PATH_D, LAKE_PATH_D_LOBED, LAKE_PATH_D_DENDRITIC,
  LAKE_CENTER, LAKE_INLET,
  DAM_X, DAM_Y, DAM_HALF_W,
  riverDist, streamDist, lakeDist, inLake,
});
