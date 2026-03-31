(function () {
  const S = window.OilSpill;

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function perpendicularUnit(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = S.safeHypot(dx, dy, 1) || 1;
    return { x: -dy / len, y: dx / len };
  }

  function directionUnit(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = S.safeHypot(dx, dy, 1) || 1;
    return { x: dx / len, y: dy / len };
  }

  function clampToCanvas(p, pad) {
    return {
      x: S.clamp(p.x, pad, S.width  - pad),
      y: S.clamp(p.y, pad, S.height - pad)
    };
  }

  function buildFallbackCurves() {
    S.tealCurves = [];
    const count = 3 + ((Math.random() * 2) | 0);
    for (let i = 0; i < count; i++) {
      const horizontalBias = Math.random() < 0.6;
      const start = horizontalBias
        ? { x: Math.random() < 0.5 ? -S.width * 0.08 : S.width * 1.08, y: Math.random() * S.height }
        : { x: Math.random() * S.width, y: Math.random() < 0.5 ? -S.height * 0.08 : S.height * 1.08 };
      const end = horizontalBias
        ? { x: start.x < S.width * 0.5 ? S.width * 1.08 : -S.width * 0.08,
            y: S.clamp(start.y + (Math.random() - 0.5) * S.height * 0.55, -S.height * 0.1, S.height * 1.1) }
        : { x: S.clamp(start.x + (Math.random() - 0.5) * S.width * 0.55, -S.width * 0.1, S.width * 1.1),
            y: start.y < S.height * 0.5 ? S.height * 1.08 : -S.height * 0.08 };
      S.tealCurves.push({
        role: "fallback", start, end,
        amplitude: 26 + Math.random() * 38,
        frequency: 0.9  + Math.random() * 1.5,
        phase:     Math.random() * Math.PI * 2,
        width:     28   + Math.random() * 12
      });
    }
  }

  S.generateTealCurves = function () {
    S.tealCurves = [];

    const plan = S.compositionPlan;
    if (!plan || plan.preset !== "diagonalSweep") {
      if (S.debug?.enabled) console.warn("[OilSpill:curves] Missing composition plan, using fallback.");
      buildFallbackCurves();
      return;
    }

    const a    = plan.dominantStart;
    const b    = plan.dominantEnd;
    const perp = perpendicularUnit(a, b);
    const dir  = directionUnit(a, b);
    const tp   = plan.tealPlan;

    // ------------------------------------------------------------------
    // 1. Dominant band
    // ------------------------------------------------------------------
    S.tealCurves.push({
      role:      "dominant",
      start:     { x: a.x, y: a.y },
      end:       { x: b.x, y: b.y },
      amplitude: tp.dominantAmplitude,
      frequency: tp.dominantFrequency,
      phase:     Math.random() * Math.PI * 2,
      width:     tp.dominantWidth
    });

    // ------------------------------------------------------------------
    // 2. Companion band — runs close and parallel to the dominant,
    //    giving it internal breadth. Slightly different phase so it
    //    doesn't look like a copy. Starts and ends at the same canvas
    //    edges as dominant (no clamping needed — offset is small).
    // ------------------------------------------------------------------
    const compShift = tp.companionOffset * tp.companionSide;
    S.tealCurves.push({
      role:  "companion",
      start: {
        x: a.x + perp.x * compShift,
        y: a.y + perp.y * compShift
      },
      end: {
        x: b.x + perp.x * compShift * rand(0.7, 1.15),  // slight convergence/divergence
        y: b.y + perp.y * compShift * rand(0.7, 1.15)
      },
      amplitude: tp.companionAmplitude,
      frequency: tp.companionFrequency,
      phase:     Math.random() * Math.PI * 2,
      width:     tp.companionWidth
    });

    // ------------------------------------------------------------------
    // 3. Tributary bands — these splay outward from the dominant axis
    //    like a delta. Near the start they sit close to the dominant;
    //    by the end they've drifted far out into the frame.
    //    This fills the frame with directed motion without competing
    //    with the dominant for visual weight.
    // ------------------------------------------------------------------
    for (let i = 0; i < tp.tributaryCount; i++) {
      // Alternate sides, opposite to companion
      const side = (i % 2 === 0 ? -1 : 1) * tp.companionSide;

      // Start close to the dominant axis (slight offset)
      const startLateral = side * rand(18, 40);
      // End splayed well out into the frame
      const endLateral   = side * rand(tp.tributaryOffsetMin, tp.tributaryOffsetMax);

      // Stagger along the dominant so they don't all start at the same point
      const startAlongT  = rand(0.0, 0.18);  // near the entry edge
      const endAlongT    = rand(0.82, 1.0);  // near the exit edge

      const rawStart = {
        x: S.lerp(a.x, b.x, startAlongT) + perp.x * startLateral + dir.x * 0,
        y: S.lerp(a.y, b.y, startAlongT) + perp.y * startLateral
      };
      const rawEnd = {
        x: S.lerp(a.x, b.x, endAlongT) + perp.x * endLateral,
        y: S.lerp(a.y, b.y, endAlongT) + perp.y * endLateral
      };

      const pad   = tp.tributaryWidthMax * 0.5 + 8;
      const start = clampToCanvas(rawStart, pad);
      const end   = clampToCanvas(rawEnd,   pad);

      S.tealCurves.push({
        role:      "tributary",
        start,
        end,
        amplitude: rand(18, 38),
        frequency: rand(0.9, 1.6),
        phase:     Math.random() * Math.PI * 2,
        width:     rand(tp.tributaryWidthMin, tp.tributaryWidthMax)
      });
    }

    if (S.debug?.enabled && S.debug.logInit) {
      console.log("[OilSpill:curves]", {
        preset:    plan.preset,
        direction: plan.direction,
        count:     S.tealCurves.length,
        roles:     S.tealCurves.map(c => c.role)
      });
    }
  };

  S.curvePoint = function (t, c) {
    const baseX = S.lerp(c.start.x, c.end.x, t);
    const baseY = S.lerp(c.start.y, c.end.y, t);
    const dx  = c.end.x - c.start.x;
    const dy  = c.end.y - c.start.y;
    const len = S.safeHypot(dx, dy, 1) || 1;
    const nx  = -dy / len;
    const ny  =  dx / len;
    const wave = Math.sin(t * Math.PI * 2 * c.frequency + c.phase) * c.amplitude;
    return { x: baseX + nx * wave, y: baseY + ny * wave };
  };

  S.curveTangent = function (t, c) {
    const p0  = S.curvePoint(S.clamp(t - 0.01, 0, 1), c);
    const p1  = S.curvePoint(S.clamp(t + 0.01, 0, 1), c);
    const dx  = p1.x - p0.x;
    const dy  = p1.y - p0.y;
    const len = S.safeHypot(dx, dy, 1) || 1;
    return { tx: dx / len, ty: dy / len, angle: Math.atan2(dy, dx) };
  };

  S.nearestTealLane = function (x, y) {
    let best = null;
    for (let i = 0; i < S.tealCurves.length; i++) {
      const c = S.tealCurves[i];
      for (let step = 0; step <= 24; step++) {
        const t      = step / 24;
        const p      = S.curvePoint(t, c);
        const dx     = x - p.x;
        const dy     = y - p.y;
        const distSq = dx * dx + dy * dy;
        if (!best || distSq < best.distSq) {
          const tangent = S.curveTangent(t, c);
          best = {
            curve: c, t,
            px: p.x,  py: p.y,
            tx: tangent.tx, ty: tangent.ty,
            nx: -tangent.ty, ny: tangent.tx,
            angle: tangent.angle,
            distSq, dist: Math.sqrt(distSq)
          };
        }
      }
    }
    return best;
  };
})();
