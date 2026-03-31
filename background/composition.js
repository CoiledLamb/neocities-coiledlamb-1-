(function () {
  const S = window.OilSpill;

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function lerpPoint(a, b, t) {
    return {
      x: S.lerp(a.x, b.x, t),
      y: S.lerp(a.y, b.y, t)
    };
  }

  function perpendicularUnit(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: -dy / len,
      y: dx / len
    };
  }

  S.generateCompositionPlan = function () {
    // Four possible diagonal directions, weighted so all four appear.
    // Each maps to a start corner → end corner crossing the full canvas.
    const directionRoll = Math.random();
    let direction;
    if (directionRoll < 0.25)      direction = "tl-br";
    else if (directionRoll < 0.5)  direction = "bl-tr";
    else if (directionRoll < 0.75) direction = "tr-bl";
    else                           direction = "br-tl";

    const asymmetryStrength = rand(0.65, 0.95);

    let dominantStart;
    let dominantEnd;
    let quietCorner;

    // Each direction: start near one corner edge, end near the opposite corner edge.
    // Slight inset (0.04–0.18) keeps the line clearly on-canvas at both ends.
    if (direction === "tl-br") {
      dominantStart = {
        x: rand(S.width * 0.04, S.width * 0.18),
        y: rand(S.height * 0.04, S.height * 0.22)
      };
      dominantEnd = {
        x: rand(S.width * 0.82, S.width * 0.96),
        y: rand(S.height * 0.78, S.height * 0.96)
      };
      quietCorner = Math.random() < 0.7 ? "bottom-left" : "top-right";

    } else if (direction === "bl-tr") {
      dominantStart = {
        x: rand(S.width * 0.04, S.width * 0.18),
        y: rand(S.height * 0.78, S.height * 0.96)
      };
      dominantEnd = {
        x: rand(S.width * 0.82, S.width * 0.96),
        y: rand(S.height * 0.04, S.height * 0.22)
      };
      quietCorner = Math.random() < 0.7 ? "top-left" : "bottom-right";

    } else if (direction === "tr-bl") {
      dominantStart = {
        x: rand(S.width * 0.82, S.width * 0.96),
        y: rand(S.height * 0.04, S.height * 0.22)
      };
      dominantEnd = {
        x: rand(S.width * 0.04, S.width * 0.18),
        y: rand(S.height * 0.78, S.height * 0.96)
      };
      quietCorner = Math.random() < 0.7 ? "bottom-right" : "top-left";

    } else { // br-tl
      dominantStart = {
        x: rand(S.width * 0.82, S.width * 0.96),
        y: rand(S.height * 0.78, S.height * 0.96)
      };
      dominantEnd = {
        x: rand(S.width * 0.04, S.width * 0.18),
        y: rand(S.height * 0.04, S.height * 0.22)
      };
      quietCorner = Math.random() < 0.7 ? "top-right" : "bottom-left";
    }

    const energyT = rand(0.32, 0.46);
    const baseEnergyCenter = lerpPoint(dominantStart, dominantEnd, energyT);
    const perp = perpendicularUnit(dominantStart, dominantEnd);
    const energyOffset = rand(-S.width * 0.06, S.width * 0.06);

    const energyCenter = {
      x: baseEnergyCenter.x + perp.x * energyOffset,
      y: baseEnergyCenter.y + perp.y * energyOffset
    };

    const secondaryCount = Math.random() < 0.55 ? 1 : 2;
    const dominantWidth = rand(36, 46);

    const purplePlan = [];

    // Primary vortex: large, near energy center
    purplePlan.push({
      role: "primaryAnchor",
      x: energyCenter.x + perp.x * rand(-40, 40),
      y: energyCenter.y + perp.y * rand(-40, 40),
      radius: rand(155, 215)
    });

    if (secondaryCount >= 1) {
      const secondaryT = rand(0.58, 0.78);
      const secondaryBase = lerpPoint(dominantStart, dominantEnd, secondaryT);
      const secondaryOffset = rand(-S.width * 0.08, S.width * 0.08);

      // Secondary vortex: meaningfully smaller than primary for visual hierarchy
      purplePlan.push({
        role: "secondaryAnchor",
        x: secondaryBase.x + perp.x * secondaryOffset,
        y: secondaryBase.y + perp.y * secondaryOffset,
        radius: rand(85, 130)
      });
    }

    // Optional third micro-vortex for compositions with high secondary count
    if (secondaryCount >= 2 && Math.random() < 0.45) {
      const microT = rand(0.12, 0.28);
      const microBase = lerpPoint(dominantStart, dominantEnd, microT);
      const microOffset = rand(-S.width * 0.12, S.width * 0.12);

      purplePlan.push({
        role: "microAnchor",
        x: microBase.x + perp.x * microOffset,
        y: microBase.y + perp.y * microOffset,
        radius: rand(50, 85)
      });
    }

    const plan = {
      preset: "diagonalSweep",
      direction,
      dominantStart,
      dominantEnd,
      energyCenter,
      quietCorner,
      asymmetryStrength,
      tealPlan: {
        dominantWidth,
        dominantAmplitude: rand(24, 42),
        dominantFrequency: rand(0.9, 1.3),
        secondaryCount,
        secondaryOffsetMin: 46,
        secondaryOffsetMax: 92,
        secondaryWidthMin: 22,
        secondaryWidthMax: 32
      },
      purplePlan
    };

    if (S.debug?.enabled && S.debug.logInit) {
      console.log("[OilSpill:composition]", plan);
    }

    return plan;
  };
})();
