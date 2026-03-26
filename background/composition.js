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
    const direction = Math.random() < 0.5 ? "tl-br" : "bl-tr";
    const asymmetryStrength = rand(0.65, 0.95);

    let dominantStart;
    let dominantEnd;
    let quietCorner;

    if (direction === "tl-br") {
      dominantStart = {
        x: rand(-S.width * 0.02, S.width * 0.18),
        y: rand(-S.height * 0.02, S.height * 0.22)
      };

      dominantEnd = {
        x: rand(S.width * 0.82, S.width * 1.02),
        y: rand(S.height * 0.78, S.height * 1.02)
      };

      quietCorner = Math.random() < 0.7 ? "bottom-left" : "top-right";
    } else {
      dominantStart = {
        x: rand(-S.width * 0.02, S.width * 0.18),
        y: rand(S.height * 0.78, S.height * 1.02)
      };

      dominantEnd = {
        x: rand(S.width * 0.82, S.width * 1.02),
        y: rand(-S.height * 0.02, S.height * 0.22)
      };

      quietCorner = Math.random() < 0.7 ? "top-left" : "bottom-right";
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

    purplePlan.push({
      role: "primaryAnchor",
      x: energyCenter.x + perp.x * rand(-40, 40),
      y: energyCenter.y + perp.y * rand(-40, 40),
      radius: rand(170, 205)
    });

    if (secondaryCount >= 1) {
      const secondaryT = rand(0.58, 0.78);
      const secondaryBase = lerpPoint(dominantStart, dominantEnd, secondaryT);
      const secondaryOffset = rand(-S.width * 0.08, S.width * 0.08);

      purplePlan.push({
        role: "secondaryAnchor",
        x: secondaryBase.x + perp.x * secondaryOffset,
        y: secondaryBase.y + perp.y * secondaryOffset,
        radius: rand(130, 165)
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