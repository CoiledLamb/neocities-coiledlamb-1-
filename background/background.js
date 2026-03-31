(() => {
  const existing = document.getElementById("oilspill-bg");
  if (existing) existing.remove();

  const canvas = document.createElement("canvas");
  canvas.id = "oilspill-bg";

  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    display: "block",
    pointerEvents: "none",
    zIndex: "0"
  });

  document.body.prepend(canvas);

  const S = window.OilSpill;
  S.canvas = canvas;
  S.ctx = canvas.getContext("2d");

  S.debugStats = {
    frame: 0,
    updated: 0,
    drawn: 0,
    invalidVelocity: 0,
    invalidPosition: 0,
    typeCounts: { blue: 0, teal: 0, purple: 0 }
  };

  function resizeCanvas() {
    S.width  = window.innerWidth;
    S.height = window.innerHeight;
    S.dpr    = Math.min(window.devicePixelRatio || 1, 1.5);

    S.canvas.width  = Math.floor(S.width  * S.dpr);
    S.canvas.height = Math.floor(S.height * S.dpr);
    S.ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
  }

  function init() {
    S.dots        = [];
    S.purpleBlobs = [];
    S.tealCurves  = [];

    S.compositionPlan = S.generateCompositionPlan();

    for (const blob of S.compositionPlan.purplePlan) {
      S.purpleBlobs.push({ x: blob.x, y: blob.y, radius: blob.radius });
    }

    S.generateTealCurves();

    // Breath zones and drift currents need canvas dimensions
    S.initBreathZones();
    S.initDriftCurrents();

    for (let y = -S.spacing; y < S.height + S.spacing; y += S.spacing) {
      for (let x = -S.spacing; x < S.width + S.spacing; x += S.spacing) {
        const dot = new S.Dot(x, y);
        S.assignDotType(dot);
        dot.updateColor();
        S.dots.push(dot);
      }
    }

    if (S.debug.enabled && S.debug.logInit) {
      const counts = { blue: 0, teal: 0, purple: 0 };
      for (const d of S.dots) counts[d.type]++;
      console.log("[OilSpill:init]", {
        dots: S.dots.length,
        tealCurves: S.tealCurves.length,
        purpleBlobs: S.purpleBlobs.length,
        counts,
        compositionPlan: S.compositionPlan
      });
    }
  }

  // Expose so gui-actions.js regenerateScene() can call it directly
  S.rebuildScene = init;

  function buildGrid() {
    const minX = -S.spacing * 2;
    const minY = -S.spacing * 2;

    S.gridOffsetX = Math.ceil(-minX / S.spacing);
    S.gridOffsetY = Math.ceil(-minY / S.spacing);

    const cols = Math.ceil((S.width  - minX + S.spacing * 2) / S.spacing) + 2;
    const rows = Math.ceil((S.height - minY + S.spacing * 2) / S.spacing) + 2;

    S.grid = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => [])
    );

    for (let i = 0; i < S.dots.length; i++) {
      const d  = S.dots[i];
      const gx = Math.floor(d.x / S.spacing) + S.gridOffsetX;
      const gy = Math.floor(d.y / S.spacing) + S.gridOffsetY;
      if (S.grid[gy] && S.grid[gy][gx]) S.grid[gy][gx].push(d);
    }
  }

  function drawDebugOverlay() {
    if (!S.debug.enabled || !S.debug.showOverlay) return;
    if (S.debugStats.frame % 12 !== 0) return;

    const statusEl = document.getElementById("lab-status");
    if (!statusEl) return;

    const plan   = S.compositionPlan || {};
    const paused = !!(S.tuning && S.tuning.sim && S.tuning.sim.paused);

    statusEl.textContent = [
      `state    ${paused ? "paused" : "running"}`,
      `frame    ${S.debugStats.frame}`,
      "",
      `updated  ${S.debugStats.updated}`,
      `drawn    ${S.debugStats.drawn}`,
      `invalid  ${S.debugStats.invalidVelocity} vel / ${S.debugStats.invalidPosition} pos`,
      "",
      `blue     ${S.debugStats.typeCounts.blue}`,
      `teal     ${S.debugStats.typeCounts.teal}`,
      `purple   ${S.debugStats.typeCounts.purple}`,
      "",
      `preset   ${plan.preset    || "-"}`,
      `flow     ${plan.direction || "-"}`,
      `quiet    ${plan.quietCorner || "-"}`
    ].join("\n");
  }

  function animate() {
    S.debugStats.frame++;
    S.debugStats.updated          = 0;
    S.debugStats.drawn            = 0;
    S.debugStats.invalidVelocity  = 0;
    S.debugStats.invalidPosition  = 0;
    S.debugStats.typeCounts.blue   = 0;
    S.debugStats.typeCounts.teal   = 0;
    S.debugStats.typeCounts.purple = 0;

    const isPaused = !!(S.tuning && S.tuning.sim && S.tuning.sim.paused);
    const now = performance.now();

    if (!isPaused) {
      S.ctx.clearRect(0, 0, S.width, S.height);
      buildGrid();

      S.tickBreath(now);
      S.tickDriftCurrents(now);

      for (let i = 0; i < S.dots.length; i++) {
        const d = S.dots[i];
        d.update();
        d.wrap();
        d.updateColor();
        d.draw();
      }
    } else {
      S.ctx.clearRect(0, 0, S.width, S.height);
      for (let i = 0; i < S.dots.length; i++) {
        const d = S.dots[i];
        d.draw();
        S.debugStats.drawn++;
        if (S.debugStats.typeCounts[d.type] !== undefined) {
          S.debugStats.typeCounts[d.type]++;
        }
      }
    }

    drawDebugOverlay();

    if (
      S.debug.enabled &&
      S.debug.logFrameStats &&
      S.debugStats.frame % S.debug.frameSampleRate === 0
    ) {
      console.log("[OilSpill:frame]", {
        frame: S.debugStats.frame,
        paused: isPaused,
        typeCounts: S.debugStats.typeCounts,
        composition: S.compositionPlan ? {
          preset:      S.compositionPlan.preset,
          direction:   S.compositionPlan.direction,
          quietCorner: S.compositionPlan.quietCorner
        } : null
      });
    }

    requestAnimationFrame(animate);
  }

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeCanvas();
      init();
    }, 120);
  });

  resizeCanvas();
  init();
  animate();
})();
