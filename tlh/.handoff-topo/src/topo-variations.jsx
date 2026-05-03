// Four terrain renderers — drop-in <g> children for <MapShell>.
// All share the same HEIGHTMAP (100×100, 4px cells over 400×400).
// Each renderer commits to one cartographic technique:
//   v1 stepped   — 8 quantized elevation rects (USGS quad)
//   v2 smooth    — continuous canvas-baked tint
//   v3 contour   — smooth tint + 9 marching-squares contours
//   v4 hillshade — smooth tint + multiply-blended shaded relief
// All clipped to the ring polygon by MapShell's clipPath.

const HM_PIX_W = 4;  // 400 / 100
const HM_PIX_H = 4;

// ── Slope-filtered marching squares (for form lines) ─────────
// Same as contourPath, but skips segments whose midpoint slope
// (precomputed grad magnitude) exceeds slopeMax. Used to draw
// dashed form lines only where regular contours are too sparse.
function contourPathSlopeFiltered(grid, grad, w, h, T, vbW, vbH, slopeMax) {
  const sx = vbW / (w - 1), sy = vbH / (h - 1);
  let d = '';
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const a = grid[y*w + x];
      const b = grid[y*w + x + 1];
      const c = grid[(y+1)*w + x + 1];
      const dd = grid[(y+1)*w + x];
      let idx = 0;
      if (a > T) idx |= 1;
      if (b > T) idx |= 2;
      if (c > T) idx |= 4;
      if (dd > T) idx |= 8;
      if (idx === 0 || idx === 15) continue;
      // sample slope at cell center
      const gIdx = y*w + x;
      if (grad[gIdx] > slopeMax) continue;
      const ix = (p, q) => (T - p) / (q - p || 1e-6);
      const tT = ((idx & 1) !== ((idx >> 1) & 1)) ? ix(a, b) : null;
      const tR = (((idx >> 1) & 1) !== ((idx >> 2) & 1)) ? ix(b, c) : null;
      const tB = (((idx >> 3) & 1) !== ((idx >> 2) & 1)) ? ix(dd, c) : null;
      const tL = ((idx & 1) !== ((idx >> 3) & 1)) ? ix(a, dd) : null;
      const pts = [];
      if (tT !== null) pts.push([x + tT, y]);
      if (tR !== null) pts.push([x + 1, y + tR]);
      if (tB !== null) pts.push([x + tB, y + 1]);
      if (tL !== null) pts.push([x, y + tL]);
      for (let i = 0; i + 1 < pts.length; i += 2) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[i+1];
        d += `M${(x1*sx).toFixed(2)},${(y1*sy).toFixed(2)}`
          +  `L${(x2*sx).toFixed(2)},${(y2*sy).toFixed(2)}`;
      }
    }
  }
  return d;
}

// ── Marching-squares contour tracer ─────────────────────────
// Returns an SVG path "d" with one M..L per crossing pair.
function contourPath(grid, w, h, T, vbW, vbH) {
  const sx = vbW / (w - 1), sy = vbH / (h - 1);
  let d = '';
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const a = grid[y*w + x];
      const b = grid[y*w + x + 1];
      const c = grid[(y+1)*w + x + 1];
      const dd = grid[(y+1)*w + x];
      let idx = 0;
      if (a > T) idx |= 1;
      if (b > T) idx |= 2;
      if (c > T) idx |= 4;
      if (dd > T) idx |= 8;
      if (idx === 0 || idx === 15) continue;
      const ix = (p, q) => (T - p) / (q - p || 1e-6);
      const tT = ((idx & 1) !== ((idx >> 1) & 1)) ? ix(a, b) : null;
      const tR = (((idx >> 1) & 1) !== ((idx >> 2) & 1)) ? ix(b, c) : null;
      const tB = (((idx >> 3) & 1) !== ((idx >> 2) & 1)) ? ix(dd, c) : null;
      const tL = ((idx & 1) !== ((idx >> 3) & 1)) ? ix(a, dd) : null;
      const pts = [];
      if (tT !== null) pts.push([x + tT, y]);
      if (tR !== null) pts.push([x + 1, y + tR]);
      if (tB !== null) pts.push([x + tB, y + 1]);
      if (tL !== null) pts.push([x, y + tL]);
      for (let i = 0; i + 1 < pts.length; i += 2) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[i+1];
        d += `M${(x1*sx).toFixed(2)},${(y1*sy).toFixed(2)}`
          +  `L${(x2*sx).toFixed(2)},${(y2*sy).toFixed(2)}`;
      }
    }
  }
  return d;
}

// ── Bake hypsometric tint to a data URL ─────────────────────
function bakeSmoothHypso() {
  const c = document.createElement('canvas');
  c.width = HM_W; c.height = HM_H;
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(HM_W, HM_H);
  for (let y = 0; y < HM_H; y++) {
    for (let x = 0; x < HM_W; x++) {
      const e = HEIGHTMAP[y*HM_W + x];
      const hex = hypsoSample(e);
      const r = parseInt(hex.slice(1,3), 16);
      const g = parseInt(hex.slice(3,5), 16);
      const b = parseInt(hex.slice(5,7), 16);
      const i = (y*HM_W + x) * 4;
      id.data[i] = r; id.data[i+1] = g; id.data[i+2] = b; id.data[i+3] = 255;
    }
  }
  ctx.putImageData(id, 0, 0);
  return c.toDataURL('image/png');
}

// ── Bake stepped (band-quantized) hypsometric tint ──────────
// Quantize elevation into N bands BEFORE sampling the gradient,
// so each band gets one flat color across all its cells.
function bakeSteppedHypso(bands, hm = HEIGHTMAP) {
  const c = document.createElement('canvas');
  c.width = HM_W; c.height = HM_H;
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(HM_W, HM_H);
  for (let y = 0; y < HM_H; y++) {
    for (let x = 0; x < HM_W; x++) {
      const e = hm[y*HM_W + x];
      const band = Math.min(bands - 1, Math.floor(e * bands));
      const tCenter = (band + 0.5) / bands;
      const hex = hypsoSample(tCenter);
      const r = parseInt(hex.slice(1,3), 16);
      const g = parseInt(hex.slice(3,5), 16);
      const b = parseInt(hex.slice(5,7), 16);
      const i = (y*HM_W + x) * 4;
      id.data[i] = r; id.data[i+1] = g; id.data[i+2] = b; id.data[i+3] = 255;
    }
  }
  ctx.putImageData(id, 0, 0);
  return c.toDataURL('image/png');
}

// ── Bake hillshade (Lambertian shading from heightmap normals) ─
function bakeHillshade(azDeg = 315, altDeg = 45, zScale = 22) {
  const c = document.createElement('canvas');
  c.width = HM_W; c.height = HM_H;
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(HM_W, HM_H);
  const az = (azDeg * Math.PI) / 180;
  const alt = (altDeg * Math.PI) / 180;
  const sinAlt = Math.sin(alt), cosAlt = Math.cos(alt);
  for (let y = 0; y < HM_H; y++) {
    for (let x = 0; x < HM_W; x++) {
      const xm = Math.max(1, Math.min(HM_W - 2, x));
      const ym = Math.max(1, Math.min(HM_H - 2, y));
      const dzdx = ((HEIGHTMAP[ym*HM_W + xm + 1] - HEIGHTMAP[ym*HM_W + xm - 1]) / 2) * zScale;
      const dzdy = ((HEIGHTMAP[(ym+1)*HM_W + xm] - HEIGHTMAP[(ym-1)*HM_W + xm]) / 2) * zScale;
      const slope = Math.atan(Math.hypot(dzdx, dzdy));
      const aspect = Math.atan2(dzdy, -dzdx);
      const shade = cosAlt * Math.cos(slope)
                  + sinAlt * Math.sin(slope) * Math.cos(az - aspect);
      const v = Math.max(0, Math.min(255, Math.round(((shade + 1) / 2) * 255)));
      const i = (y*HM_W + x) * 4;
      id.data[i] = v; id.data[i+1] = v; id.data[i+2] = v; id.data[i+3] = 255;
    }
  }
  ctx.putImageData(id, 0, 0);
  return c.toDataURL('image/png');
}

// ════════════════════════════════════════════════════════════
// V1 — STEPPED HYPSOMETRIC BANDS
// 8 discrete elevation tiers. Crisp, USGS-quad-feel, the most
// "old paper map" of the four. Reads at small sizes.
// ════════════════════════════════════════════════════════════
function TerrainStepped({ bands = 8, heightmap }) {
  const hm = heightmap || HEIGHTMAP;
  const url = React.useMemo(() => bakeSteppedHypso(bands, hm), [bands, hm]);
  return (
    <g>
      <image href={url} x="0" y="0" width={VB_W} height={VB_H}
             preserveAspectRatio="none"
             style={{ imageRendering: 'pixelated' }}/>
    </g>
  );
}

// ════════════════════════════════════════════════════════════
// V2 — SMOOTH GRADIENT HYPSOMETRIC
// Continuous tint. Calmest of the four. Lets the ring + nodes
// breathe; terrain reads as atmosphere rather than detail.
// ════════════════════════════════════════════════════════════
function TerrainSmooth() {
  const url = React.useMemo(() => bakeSmoothHypso(), []);
  return (
    <g>
      <image href={url} x="0" y="0" width={VB_W} height={VB_H}
             preserveAspectRatio="none"
             style={{ imageRendering: 'auto' }}/>
    </g>
  );
}

// ════════════════════════════════════════════════════════════
// V3 — TOPOGRAPHIC (line-driven, USGS-quad style)
// Rework brief: previous version was tint-dominant, contour-sparse,
// and read as a blurry photo. Real topos are ink-forward.
//
// Recipe:
//  1. Hypsometric tint at low opacity (~0.4) — wash, not photo.
//  2. 24 contour intervals (vs old 9). Lines actually have rhythm.
//  3. Heavy weight contrast: every 5th = INDEX (bold, bright textSec),
//     others = INTERMEDIATE (thin, textDim). USGS spec = every 5th.
//  4. Spot elevations: tiny labels at local maxima.
//  5. Hachure ticks on the steep sides of index contours where slope
//     is high — slope tags / depression cues, classic topo motif.
// ════════════════════════════════════════════════════════════
function TerrainContour({ contourCount = 40, indexEvery = 5 }) {
  const url = React.useMemo(() => bakeSmoothHypso(), []);

  const contours = React.useMemo(() => {
    const out = [];
    for (let i = 1; i < contourCount; i++) {
      const t = i / contourCount;
      const isIndex = i % indexEvery === 0;
      out.push({
        d: contourPath(HEIGHTMAP, HM_W, HM_H, t, VB_W, VB_H),
        isIndex,
        t,
      });
    }
    return out;
  }, [contourCount, indexEvery]);

  // Form lines — auxiliary dashed half-interval contours, drawn only
  // where the slope is gentle (USGS convention for summit caps and
  // broad ridges where regular contour spacing widens out and the
  // terrain reads as featureless flat).
  const formLines = React.useMemo(() => {
    // Half-intervals between regular contours.
    const out = [];
    // Build a precomputed slope mask: for each cell, |grad|.
    // Then trace contours at i + 0.5 levels, keeping segments only
    // where the slope at that segment's midpoint is below threshold.
    const grad = new Float32Array(HM_W * HM_H);
    for (let y = 1; y < HM_H - 1; y++) {
      for (let x = 1; x < HM_W - 1; x++) {
        const dx = HEIGHTMAP[y*HM_W + x + 1] - HEIGHTMAP[y*HM_W + x - 1];
        const dy = HEIGHTMAP[(y+1)*HM_W + x] - HEIGHTMAP[(y-1)*HM_W + x];
        grad[y*HM_W + x] = Math.hypot(dx, dy);
      }
    }
    // Threshold: only draw form lines where gradient is below this.
    // Tuned so they appear on summit caps but not in the desert/river
    // (where regular contours are already dense enough).
    const SLOPE_MAX = 0.012;
    for (let i = 0; i < contourCount; i++) {
      const T = (i + 0.5) / contourCount;
      // Only generate form lines at higher elevations (mountain caps);
      // lowlands don't need them.
      if (T < 0.5) continue;
      const d = contourPathSlopeFiltered(
        HEIGHTMAP, grad, HM_W, HM_H, T, VB_W, VB_H, SLOPE_MAX
      );
      if (d) out.push({ d, t: T });
    }
    return out;
  }, [contourCount]);

  return (
    <g>
      {/* tint as a wash, not a photo */}
      <image href={url} x="0" y="0" width={VB_W} height={VB_H}
             preserveAspectRatio="none"
             style={{ imageRendering: 'auto', opacity: 0.42 }}/>
      {/* intermediates — uniform thin lines, the body of the topo */}
      <g>
        {contours.filter(c => !c.isIndex).map((c, i) => (
          <path key={'i'+i} d={c.d} fill="none"
                stroke={TLH.textDim}
                strokeWidth={0.45}
                strokeOpacity={0.78}
                strokeLinecap="round"/>
        ))}
      </g>
      {/* index — only marginally heavier, NOT dominant.
          Reference (USGS Baldy quad) keeps every-5th barely thicker
          than intermediates; the weight ramp is subtle, so no single
          ring "owns" the shape. */}
      <g>
        {contours.filter(c => c.isIndex).map((c, i) => (
          <path key={'x'+i} d={c.d} fill="none"
                stroke={TLH.textSec}
                strokeWidth={0.6}
                strokeOpacity={0.88}
                strokeLinecap="round"/>
        ))}
      </g>
    </g>
  );
}

// ════════════════════════════════════════════════════════════
// V4 — HYPSOMETRIC + HILLSHADE
// Smooth tint + Lambertian relief shading. NW light at 45° altitude.
// Multiply-blend darkens slopes facing away; screen-blend lifts ones
// facing the sun. Most dimensional / most "terrain feels solid."
// ════════════════════════════════════════════════════════════
function TerrainHillshade() {
  const colorUrl = React.useMemo(() => bakeSmoothHypso(), []);
  const shadeUrl = React.useMemo(() => bakeHillshade(315, 45, 24), []);
  return (
    <g>
      <image href={colorUrl} x="0" y="0" width={VB_W} height={VB_H}
             preserveAspectRatio="none"
             style={{ imageRendering: 'auto' }}/>
      {/* shadows — multiply blend tones down the dark side */}
      <image href={shadeUrl} x="0" y="0" width={VB_W} height={VB_H}
             preserveAspectRatio="none"
             style={{ mixBlendMode: 'multiply', opacity: 0.55, imageRendering: 'auto' }}/>
      {/* highlights — screen blend lifts the lit side */}
      <image href={shadeUrl} x="0" y="0" width={VB_W} height={VB_H}
             preserveAspectRatio="none"
             style={{ mixBlendMode: 'screen', opacity: 0.18, imageRendering: 'auto' }}/>
    </g>
  );
}

Object.assign(window, {
  TerrainStepped, TerrainSmooth, TerrainContour, TerrainHillshade,
});
