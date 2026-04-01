(function () {
  const S = window.OilSpill;

  const CELL             = 15;
  const REFRESH_INTERVAL = 18;

  const CHARS_LIGHT  = [' ', '\u00b7', '\u00b7', '\u00b7', '\u00b7'];
  const CHARS_MID    = ['\u2591', '\u00b7', '\u25e6', '\u2591', '\u00b7'];
  const CHARS_DARK   = ['\u2592', '\u2022', '\u2592', '\u25e6', '\u2592'];
  const CHARS_DEEPER = ['\u2593', '\u25cf', '\u2592', '\u2593', '\u2022'];

  const COL_LIGHT  = '#1e6b69';
  const COL_MID    = '#155352';
  const COL_DARK   = '#0f3b3a';
  const COL_DEEPER = '#0a2c2b';

  let subCanvas = null;
  let subCtx    = null;
  let cols = 0, rows = 0;
  let cellNoise = [];
  let ready = false;   // guard: only draw/resize after init has run

  S.initSublayer = function () {
    const existing = document.getElementById('oilspill-sub');
    if (existing) existing.remove();

    subCanvas = document.createElement('canvas');
    subCanvas.id = 'oilspill-sub';
    Object.assign(subCanvas.style, {
      position:       'fixed',
      inset:          '0',
      width:          '100vw',
      height:         '100vh',
      display:        'block',
      pointerEvents:  'none',
      zIndex:         '-1'
    });

    const particleCanvas = document.getElementById('oilspill-bg');
    if (particleCanvas) {
      document.body.insertBefore(subCanvas, particleCanvas);
    } else {
      document.body.prepend(subCanvas);
    }

    subCtx = subCanvas.getContext('2d');
    ready  = true;
    _resize();
  };

  function _resize() {
    if (!ready || !subCanvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    subCanvas.width  = Math.floor(S.width  * dpr);
    subCanvas.height = Math.floor(S.height * dpr);
    subCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cols = Math.ceil(S.width  / CELL) + 1;
    rows = Math.ceil(S.height / CELL) + 1;

    cellNoise = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) row.push(Math.random());
      cellNoise.push(row);
    }
  }

  // Safe public version — no-ops if not yet initialised
  S.resizeSublayer = function () { _resize(); };

  function sublayerValueAt(cx, cy, now) {
    const plan = S.compositionPlan;
    if (!plan) return 0.5;

    const W = S.width, H = S.height;

    const ds = plan.dominantStart;
    const de = plan.dominantEnd;
    const ddx = de.x - ds.x, ddy = de.y - ds.y;
    const len = Math.hypot(ddx, ddy) || 1;
    const perpX = -ddy / len, perpY = ddx / len;
    const proj  = ((cx - W * 0.5) * perpX + (cy - H * 0.5) * perpY) / (Math.max(W, H) * 0.5);
    const diagGrad = (proj + 1) * 0.5;

    const qc = plan.quietCorner;
    let qx = W * 0.5, qy = H * 0.5;
    if (qc === 'top-left')     { qx = 0; qy = 0; }
    if (qc === 'top-right')    { qx = W; qy = 0; }
    if (qc === 'bottom-left')  { qx = 0; qy = H; }
    if (qc === 'bottom-right') { qx = W; qy = H; }
    const quietDist = Math.hypot(cx - qx, cy - qy) / Math.hypot(W, H);
    const quietInfluence = Math.max(0, 1 - quietDist * 1.8);

    let breathVal = 0;
    if (typeof S.breathAt === 'function') {
      breathVal = S.breathAt(cx, cy, now) * 0.3;
    }

    return Math.max(0, Math.min(1, diagGrad * 0.55 + quietInfluence * 0.35 + breathVal * 0.1));
  }

  function pickCharAndColor(value, noise) {
    const j = value + (noise - 0.5) * 0.18;
    if      (j < 0.22) return { ch: CHARS_LIGHT [Math.floor(noise * CHARS_LIGHT.length)],  col: COL_LIGHT  };
    else if (j < 0.45) return { ch: CHARS_MID   [Math.floor(noise * CHARS_MID.length)],    col: COL_MID    };
    else if (j < 0.68) return { ch: CHARS_DARK  [Math.floor(noise * CHARS_DARK.length)],   col: COL_DARK   };
    else               return { ch: CHARS_DEEPER [Math.floor(noise * CHARS_DEEPER.length)], col: COL_DEEPER };
  }

  S.drawSublayer = function (now, frame) {
    if (!ready || !subCtx) return;
    if (frame % REFRESH_INTERVAL !== 0) return;

    subCtx.clearRect(0, 0, S.width, S.height);
    subCtx.fillStyle = '#0f3b3a';
    subCtx.fillRect(0, 0, S.width, S.height);

    subCtx.font          = `${CELL - 1}px "Source Code Pro", monospace`;
    subCtx.textBaseline  = 'top';
    subCtx.textAlign     = 'left';

    for (let r = 0; r < rows; r++) {
      if (!cellNoise[r]) continue;
      for (let c = 0; c < cols; c++) {
        const cx = c * CELL + CELL * 0.5;
        const cy = r * CELL + CELL * 0.5;
        const v  = sublayerValueAt(cx, cy, now);
        const n  = cellNoise[r][c];
        const { ch, col } = pickCharAndColor(v, n);
        if (ch === ' ') continue;
        subCtx.fillStyle = col;
        subCtx.fillText(ch, c * CELL, r * CELL);
      }
    }
  };
})();
