// sublayer.js — ASCII halftone background layer
// Draws a grid of Unicode block/dot characters onto a canvas behind the
// particle layer. Cell values are driven by: the composition's diagonal
// gradient (light zone vs quiet/dark zone), breath blobs, and a slow
// per-cell noise offset. Updates every REFRESH_INTERVAL frames so it
// reads like a terminal display refreshing rather than per-frame noise.

(function () {
  const S = window.OilSpill;

  const CELL       = 15;          // px per character cell
  const REFRESH_INTERVAL = 18;    // frames between full redraws

  // Character sets ordered light → dark
  // Mix of block shading and geometric dot shapes for the retrofuturist look
  const CHARS_LIGHT  = [' ', '·', '·', '·', '·'];
  const CHARS_MID    = ['░', '·', '◦', '░', '·'];
  const CHARS_DARK   = ['▒', '•', '▒', '◦', '▒'];
  const CHARS_DEEPER = ['▓', '●', '▒', '▓', '•'];

  // Colour stops: light zone → mid → quiet/dark zone
  const COL_LIGHT  = '#1e6b69';
  const COL_MID    = '#155352';
  const COL_DARK   = '#0f3b3a';
  const COL_DEEPER = '#0a2c2b';

  let subCanvas, subCtx;
  let cols, rows;
  // Per-cell stable noise offsets (set once at init, not per frame)
  let cellNoise = [];

  // Expose for background.js to call
  S.initSublayer = function () {
    const existing = document.getElementById('oilspill-sub');
    if (existing) existing.remove();

    subCanvas = document.createElement('canvas');
    subCanvas.id = 'oilspill-sub';
    Object.assign(subCanvas.style, {
      position:      'fixed',
      inset:         '0',
      width:         '100vw',
      height:        '100vh',
      display:       'block',
      pointerEvents: 'none',
      zIndex:        '-1',
      fontSmoothing: 'none',
      imageRendering: 'pixelated'
    });

    // Insert before the particle canvas so it sits behind it
    const particleCanvas = document.getElementById('oilspill-bg');
    if (particleCanvas) {
      document.body.insertBefore(subCanvas, particleCanvas);
    } else {
      document.body.prepend(subCanvas);
    }

    S.subCanvas = subCanvas;
    S.subCtx    = subCanvas.getContext('2d');
    resizeSublayer();
  };

  function resizeSublayer() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    subCanvas.width  = Math.floor(S.width  * dpr);
    subCanvas.height = Math.floor(S.height * dpr);
    subCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cols = Math.ceil(S.width  / CELL) + 1;
    rows = Math.ceil(S.height / CELL) + 1;

    // Generate stable per-cell noise
    cellNoise = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        row.push(Math.random()); // [0,1], frozen for the life of this init
      }
      cellNoise.push(row);
    }
  }

  // Returns a 0–1 value representing how "dark/quiet" a canvas point is.
  // 0 = full light zone (#155352 / lighter), 1 = full dark/quiet zone (#0f3b3a)
  function sublayerValueAt(cx, cy, now) {
    const plan = S.compositionPlan;
    if (!plan) return 0.5;

    const W = S.width, H = S.height;

    // --- Diagonal gradient following the dominant flow direction ---
    // Project point onto the perpendicular axis of the dominant line
    // so the gradient runs across the sweep, not along it.
    const ds = plan.dominantStart;
    const de = plan.dominantEnd;
    const dx = de.x - ds.x;
    const dy = de.y - ds.y;
    const len = Math.hypot(dx, dy) || 1;
    // Perpendicular component (across the sweep)
    const perpX = -dy / len;
    const perpY =  dx / len;
    // Project canvas point onto perp axis, normalised to [0,1]
    const projPerp = ((cx - W * 0.5) * perpX + (cy - H * 0.5) * perpY) / (Math.max(W, H) * 0.5);
    // projPerp: -1 one side, +1 other side → remap to [0,1]
    const diagGrad = (projPerp + 1) * 0.5;

    // --- Quiet corner influence ---
    // Darker near the quiet corner, regardless of diagonal
    const qc = plan.quietCorner;
    let qx = W * 0.5, qy = H * 0.5;
    if (qc === 'top-left')     { qx = 0;  qy = 0; }
    if (qc === 'top-right')    { qx = W;  qy = 0; }
    if (qc === 'bottom-left')  { qx = 0;  qy = H; }
    if (qc === 'bottom-right') { qx = W;  qy = H; }
    const quietDist = Math.hypot(cx - qx, cy - qy) / Math.hypot(W, H);
    // Close to quiet corner → 1 (dark); far → 0 (light)
    const quietInfluence = Math.max(0, 1 - quietDist * 1.8);

    // --- Breath blob influence (reuse the breath system's per-frame data) ---
    // We sample the same breath zones that drive particle color
    // by calling the exposed breath query if available.
    let breathVal = 0;
    if (typeof S.breathAt === 'function') {
      breathVal = S.breathAt(cx, cy, now) * 0.3;
    }

    // --- Combine ---
    // Base is the diagonal gradient (0=light side, 1=dark side)
    // Quiet corner pushes toward dark independently
    // Breath adds gentle shimmer
    const base = diagGrad * 0.55 + quietInfluence * 0.35 + breathVal * 0.1;
    return Math.max(0, Math.min(1, base));
  }

  function pickCharAndColor(value, noise) {
    // Map value [0,1] through noise-jittered thresholds
    const jittered = value + (noise - 0.5) * 0.18;

    if      (jittered < 0.22) return { ch: CHARS_LIGHT[Math.floor(noise * CHARS_LIGHT.length)],   col: COL_LIGHT  };
    else if (jittered < 0.45) return { ch: CHARS_MID[Math.floor(noise * CHARS_MID.length)],       col: COL_MID    };
    else if (jittered < 0.68) return { ch: CHARS_DARK[Math.floor(noise * CHARS_DARK.length)],     col: COL_DARK   };
    else                      return { ch: CHARS_DEEPER[Math.floor(noise * CHARS_DEEPER.length)], col: COL_DEEPER };
  }

  S.drawSublayer = function (now, frame) {
    if (!subCtx) return;
    if (frame % REFRESH_INTERVAL !== 0) return; // only redraw every N frames

    subCtx.clearRect(0, 0, S.width, S.height);

    // Fill base with the darkest colour so gaps between chars are consistent
    subCtx.fillStyle = '#0f3b3a';
    subCtx.fillRect(0, 0, S.width, S.height);

    subCtx.font = `${CELL - 1}px "Source Code Pro", monospace`;
    subCtx.textBaseline = 'top';
    subCtx.textAlign    = 'left';

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = c * CELL + CELL * 0.5;
        const cy = r * CELL + CELL * 0.5;
        const v    = sublayerValueAt(cx, cy, now);
        const n    = cellNoise[r][c];
        const { ch, col } = pickCharAndColor(v, n);
        if (ch === ' ') continue; // skip spaces — base fill shows through
        subCtx.fillStyle = col;
        subCtx.fillText(ch, c * CELL, r * CELL);
      }
    }
  };

  // Resize sublayer when main canvas resizes
  S.resizeSublayer = resizeSublayer;
})();
