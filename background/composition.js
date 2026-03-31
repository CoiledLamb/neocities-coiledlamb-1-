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
    return { x: -dy / len, y: dx / len };
  }

  S.generateCompositionPlan = function () {
    const directionRoll = Math.random();
    let direction;
    if      (directionRoll < 0.25) direction = "tl-br";
    else if (directionRoll < 0.5)  direction = "bl-tr";
    else if (directionRoll < 0.75) direction = "tr-bl";
    else                           direction = "br-tl";

    const asymmetryStrength = rand(0.65, 0.95);

    let dominantStart, dominantEnd, quietCorner;

    if (direction === "tl-br") {
      dominantStart = { x: rand(-S.width * 0.04, S.width * 0.10),  y: rand(-S.height * 0.04, S.height * 0.14) };
      dominantEnd   = { x: rand(S.width * 0.90,  S.width * 1.04),  y: rand(S.height * 0.86,  S.height * 1.04) };
      quietCorner   = Math.random() < 0.7 ? "bottom-left" : "top-right";
    } else if (direction === "bl-tr") {
      dominantStart = { x: rand(-S.width * 0.04, S.width * 0.10),  y: rand(S.height * 0.86,  S.height * 1.04) };
      dominantEnd   = { x: rand(S.width * 0.90,  S.width * 1.04),  y: rand(-S.height * 0.04, S.height * 0.14) };
      quietCorner   = Math.random() < 0.7 ? "top-left" : "bottom-right";
    } else if (direction === "tr-bl") {
      dominantStart = { x: rand(S.width * 0.90,  S.width * 1.04),  y: rand(-S.height * 0.04, S.height * 0.14) };
      dominantEnd   = { x: rand(-S.width * 0.04, S.width * 0.10),  y: rand(S.height * 0.86,  S.height * 1.04) };
      quietCorner   = Math.random() < 0.7 ? "bottom-right" : "top-left";
    } else {
      dominantStart = { x: rand(S.width * 0.90,  S.width * 1.04),  y: rand(S.height * 0.86,  S.height * 1.04) };
      dominantEnd   = { x: rand(-S.width * 0.04, S.width * 0.10),  y: rand(-S.height * 0.04, S.height * 0.14) };
      quietCorner   = Math.random() < 0.7 ? "top-right" : "bottom-left";
    }

    const perp = perpendicularUnit(dominantStart, dominantEnd);

    const energyT          = rand(0.32, 0.46);
    const baseEnergyCenter = lerpPoint(dominantStart, dominantEnd, energyT);
    const energyOffset     = rand(-S.width * 0.06, S.width * 0.06);
    const energyCenter     = {
      x: baseEnergyCenter.x + perp.x * energyOffset,
      y: baseEnergyCenter.y + perp.y * energyOffset
    };

    // ---- Teal plan --------------------------------------------------------
    // Dominant: wider so it occupies more visual territory.
    // Companion: a close parallel band that gives the dominant current
    //   internal structure and breadth without looking like a separate river.
    // Tributaries: 1-2 bands that splay outward from the dominant axis,
    //   like a delta peeling away at one end.
    const dominantWidth    = rand(55, 80);
    const companionOffset  = rand(30, 60);                    // px perpendicular
    const companionSide    = Math.random() < 0.5 ? 1 : -1;
    const tributaryCount   = Math.random() < 0.6 ? 1 : 2;   // replacing old secondaryCount

    // ---- Purple plan ------------------------------------------------------
    // Primary vortex: intentionally placed so its edge grazes the dominant
    // band — the teal-wrapping-around-obstacle shape is the interesting result.
    // Lateral offset is now 0–dominantWidth*0.6, so it can partially overlap.
    const primaryLateralSign = Math.random() < 0.5 ? 1 : -1;
    const primaryLateral     = primaryLateralSign * rand(0, dominantWidth * 0.6);
    const primaryT           = rand(0.30, 0.52);
    const primaryBase        = lerpPoint(dominantStart, dominantEnd, primaryT);

    const purplePlan = [{
      role:   "primaryAnchor",
      x:      primaryBase.x + perp.x * primaryLateral,
      y:      primaryBase.y + perp.y * primaryLateral,
      radius: rand(160, 225)
    }];

    // Secondary vortex: clearly off-axis on the opposite side, downstream
    const secondaryLateral = -primaryLateralSign * rand(90, 150);
    const secondaryT       = rand(0.60, 0.80);
    const secondaryBase    = lerpPoint(dominantStart, dominantEnd, secondaryT);
    purplePlan.push({
      role:   "secondaryAnchor",
      x:      secondaryBase.x + perp.x * secondaryLateral,
      y:      secondaryBase.y + perp.y * secondaryLateral,
      radius: rand(80, 125)
    });

    // Optional micro-vortex near the quiet end
    if (Math.random() < 0.4) {
      const microT      = rand(0.10, 0.26);
      const microBase   = lerpPoint(dominantStart, dominantEnd, microT);
      const microLateral = (Math.random() < 0.5 ? 1 : -1) * rand(110, 190);
      purplePlan.push({
        role:   "microAnchor",
        x:      microBase.x + perp.x * microLateral,
        y:      microBase.y + perp.y * microLateral,
        radius: rand(45, 80)
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
        dominantAmplitude:  rand(28, 52),
        dominantFrequency:  rand(0.85, 1.25),
        companionOffset,
        companionSide,
        companionWidth:     rand(dominantWidth * 0.45, dominantWidth * 0.75),
        companionAmplitude: rand(22, 42),
        companionFrequency: rand(0.9, 1.4),
        tributaryCount,
        tributaryOffsetMin:  55,
        tributaryOffsetMax:  130,
        tributaryWidthMin:   18,
        tributaryWidthMax:   34
      },
      purplePlan
    };

    if (S.debug?.enabled && S.debug.logInit) {
      console.log("[OilSpill:composition]", plan);
    }

    return plan;
  };
})();
