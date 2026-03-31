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

    // Push start/end to true canvas edges (slightly off-screen is fine).
    // The visible "tail" problem was caused by clamping too far inward.
    // Now the line always enters and exits the viewport fully.
    if (direction === "tl-br") {
      dominantStart = {
        x: rand(-S.width * 0.04, S.width * 0.10),
        y: rand(-S.height * 0.04, S.height * 0.14)
      };
      dominantEnd = {
        x: rand(S.width * 0.90, S.width * 1.04),
        y: rand(S.height * 0.86, S.height * 1.04)
      };
      quietCorner = Math.random() < 0.7 ? "bottom-left" : "top-right";

    } else if (direction === "bl-tr") {
      dominantStart = {
        x: rand(-S.width * 0.04, S.width * 0.10),
        y: rand(S.height * 0.86, S.height * 1.04)
      };
      dominantEnd = {
        x: rand(S.width * 0.90, S.width * 1.04),
        y: rand(-S.height * 0.04, S.height * 0.14)
      };
      quietCorner = Math.random() < 0.7 ? "top-left" : "bottom-right";

    } else if (direction === "tr-bl") {
      dominantStart = {
        x: rand(S.width * 0.90, S.width * 1.04),
        y: rand(-S.height * 0.04, S.height * 0.14)
      };
      dominantEnd = {
        x: rand(-S.width * 0.04, S.width * 0.10),
        y: rand(S.height * 0.86, S.height * 1.04)
      };
      quietCorner = Math.random() < 0.7 ? "bottom-right" : "top-left";

    } else {
      dominantStart = {
        x: rand(S.width * 0.90, S.width * 1.04),
        y: rand(S.height * 0.86, S.height * 1.04)
      };
      dominantEnd = {
        x: rand(-S.width * 0.04, S.width * 0.10),
        y: rand(-S.height * 0.04, S.height * 0.14)
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

    // Primary vortex: placed off the dominant axis by a meaningful perpendicular
    // distance so it sits beside the teal line rather than on top of it.
    // Min lateral offset = 80px so it never fully overlaps the dominant band.
    const primaryLateralSign = Math.random() < 0.5 ? 1 : -1;
    const primaryLateral = primaryLateralSign * rand(80, 160);
    const primaryT = rand(0.28, 0.48);
    const primaryBase = lerpPoint(dominantStart, dominantEnd, primaryT);

    purplePlan.push({
      role: "primaryAnchor",
      x: primaryBase.x + perp.x * primaryLateral,
      y: primaryBase.y + perp.y * primaryLateral,
      radius: rand(155, 215)
    });

    if (secondaryCount >= 1) {
      // Secondary goes on the OPPOSITE side of the dominant line from primary,
      // further along the flow. This gives visual balance without overlap.
      const secondaryLateral = -primaryLateralSign * rand(60, 120);
      const secondaryT = rand(0.58, 0.78);
      const secondaryBase = lerpPoint(dominantStart, dominantEnd, secondaryT);

      purplePlan.push({
        role: "secondaryAnchor",
        x: secondaryBase.x + perp.x * secondaryLateral,
        y: secondaryBase.y + perp.y * secondaryLateral,
        radius: rand(85, 130)
      });
    }

    // Optional micro-vortex: small, anywhere near the quiet zone
    if (secondaryCount >= 2 && Math.random() < 0.45) {
      const microT = rand(0.12, 0.28);
      const microBase = lerpPoint(dominantStart, dominantEnd, microT);
      const microLateral = (Math.random() < 0.5 ? 1 : -1) * rand(100, 180);

      purplePlan.push({
        role: "microAnchor",
        x: microBase.x + perp.x * microLateral,
        y: microBase.y + perp.y * microLateral,
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
        dominantAmplitude: rand(28, 48),
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
