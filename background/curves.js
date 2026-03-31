(function () {
  const S = window.OilSpill;

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function perpendicularUnit(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = S.safeHypot(dx, dy, 1) || 1;

    return {
      x: -dy / len,
      y: dx / len
    };
  }

  function directionUnit(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = S.safeHypot(dx, dy, 1) || 1;

    return {
      x: dx / len,
      y: dy / len
    };
  }

  // Clamp a point so it stays within a padded canvas boundary.
  // This prevents secondaries from spawning off-screen.
  function clampToCanvas(p, pad) {
    return {
      x: S.clamp(p.x, pad, S.width - pad),
      y: S.clamp(p.y, pad, S.height - pad)
    };
  }

  function buildFallbackCurves() {
    S.tealCurves = [];
    const count = 3 + ((Math.random() * 2) | 0);

    for (let i = 0; i < count; i++) {
      const horizontalBias = Math.random() < 0.6;

      const start = horizontalBias
        ? {
            x: Math.random() < 0.5 ? -S.width * 0.08 : S.width * 1.08,
            y: Math.random() * S.height
          }
        : {
            x: Math.random() * S.width,
            y: Math.random() < 0.5 ? -S.height * 0.08 : S.height * 1.08
          };

      const end = horizontalBias
        ? {
            x: start.x < S.width * 0.5 ? S.width * 1.08 : -S.width * 0.08,
            y: S.clamp(
              start.y + (Math.random() - 0.5) * S.height * 0.55,
              -S.height * 0.1,
              S.height * 1.1
            )
          }
        : {
            x: S.clamp(
              start.x + (Math.random() - 0.5) * S.width * 0.55,
              -S.width * 0.1,
              S.width * 1.1
            ),
            y: start.y < S.height * 0.5 ? S.height * 1.08 : -S.height * 0.08
          };

      S.tealCurves.push({
        role: "fallback",
        start,
        end,
        amplitude: 26 + Math.random() * 38,
        frequency: 0.9 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2,
        width: 28 + Math.random() * 12
      });
    }
  }

  S.generateTealCurves = function () {
    S.tealCurves = [];

    const plan = S.compositionPlan;
    if (!plan || plan.preset !== "diagonalSweep") {
      if (S.debug?.enabled) {
        console.warn("[OilSpill:curves] Missing composition plan, using fallback curves.");
      }
      buildFallbackCurves();
      return;
    }

    const a = plan.dominantStart;
    const b = plan.dominantEnd;
    const perp = perpendicularUnit(a, b);
    const dir = directionUnit(a, b);

    // Dominant curve: always full canvas-to-canvas, no clamping needed
    // because dominantStart/End are already inset in composition.js
    S.tealCurves.push({
      role: "dominant",
      start: { x: a.x, y: a.y },
      end: { x: b.x, y: b.y },
      amplitude: plan.tealPlan.dominantAmplitude,
      frequency: plan.tealPlan.dominantFrequency,
      phase: Math.random() * Math.PI * 2,
      width: plan.tealPlan.dominantWidth
    });

    // Secondary curves: offset perpendicular from the dominant,
    // but clamped so they stay visible inside the canvas.
    // The key fix: compute raw start/end then clamp to canvas bounds
    // rather than letting them drift off-screen with edge jitter.
    for (let i = 0; i < plan.tealPlan.secondaryCount; i++) {
      const side = i % 2 === 0 ? 1 : -1;

      const offsetBase =
        rand(plan.tealPlan.secondaryOffsetMin, plan.tealPlan.secondaryOffsetMax) * side;

      const startShift = offsetBase * rand(0.65, 1.0);
      const endShift = offsetBase * rand(0.45, 0.9);

      // Along-axis jitter: smaller range so secondaries don't slip
      // off the start/end edges
      const alongJitterStart = rand(-S.width * 0.015, S.width * 0.015);
      const alongJitterEnd = rand(-S.width * 0.02, S.width * 0.02);

      const rawStart = {
        x: a.x + perp.x * startShift + dir.x * alongJitterStart,
        y: a.y + perp.y * startShift + dir.y * alongJitterStart
      };

      const rawEnd = {
        x: b.x + perp.x * endShift + dir.x * alongJitterEnd,
        y: b.y + perp.y * endShift + dir.y * alongJitterEnd
      };

      // Clamp with a generous pad so the whole ribbon width stays on-screen
      const pad = plan.tealPlan.secondaryWidthMax * 0.5 + 8;
      const start = clampToCanvas(rawStart, pad);
      const end = clampToCanvas(rawEnd, pad);

      S.tealCurves.push({
        role: "secondary",
        start,
        end,
        amplitude: rand(20, 34),
        frequency: rand(0.95, 1.5),
        phase: Math.random() * Math.PI * 2,
        width: rand(
          plan.tealPlan.secondaryWidthMin,
          plan.tealPlan.secondaryWidthMax
        )
      });
    }

    if (S.debug?.enabled && S.debug.logInit) {
      console.log("[OilSpill:curves]", {
        preset: plan.preset,
        direction: plan.direction,
        count: S.tealCurves.length,
        roles: S.tealCurves.map(c => c.role)
      });
    }
  };

  S.curvePoint = function (t, c) {
    const baseX = S.lerp(c.start.x, c.end.x, t);
    const baseY = S.lerp(c.start.y, c.end.y, t);

    const dx = c.end.x - c.start.x;
    const dy = c.end.y - c.start.y;
    const len = S.safeHypot(dx, dy, 1) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    const wave = Math.sin(t * Math.PI * 2 * c.frequency + c.phase) * c.amplitude;

    return {
      x: baseX + nx * wave,
      y: baseY + ny * wave
    };
  };

  S.curveTangent = function (t, c) {
    const p0 = S.curvePoint(S.clamp(t - 0.01, 0, 1), c);
    const p1 = S.curvePoint(S.clamp(t + 0.01, 0, 1), c);
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = S.safeHypot(dx, dy, 1) || 1;

    return {
      tx: dx / len,
      ty: dy / len,
      angle: Math.atan2(dy, dx)
    };
  };

  S.nearestTealLane = function (x, y) {
    let best = null;

    for (let i = 0; i < S.tealCurves.length; i++) {
      const c = S.tealCurves[i];

      for (let step = 0; step <= 24; step++) {
        const t = step / 24;
        const p = S.curvePoint(t, c);
        const dx = x - p.x;
        const dy = y - p.y;
        const distSq = dx * dx + dy * dy;

        if (!best || distSq < best.distSq) {
          const tangent = S.curveTangent(t, c);
          const nx = -tangent.ty;
          const ny = tangent.tx;

          best = {
            curve: c,
            t,
            px: p.x,
            py: p.y,
            tx: tangent.tx,
            ty: tangent.ty,
            nx,
            ny,
            angle: tangent.angle,
            distSq,
            dist: Math.sqrt(distSq)
          };
        }
      }
    }

    return best;
  };
})();
