(function () {
  const S = window.OilSpill;

  // ---------------------------------------------------------------------------
  // Blue breathing blobs
  // Slow-drifting circular zones that pulse independently, driving the blue
  // color index toward lighter or darker. Spatial blobs of light and shadow.
  // ---------------------------------------------------------------------------

  const BREATH_COUNT = 5;
  const breathZones = [];

  function initBreathZones() {
    breathZones.length = 0;
    for (let i = 0; i < BREATH_COUNT; i++) {
      breathZones.push({
        x:      (S.width  || window.innerWidth)  * (0.1 + 0.8 * (i / BREATH_COUNT)),
        y:      (S.height || window.innerHeight) * (0.15 + 0.7 * Math.random()),
        vx:     (Math.random() - 0.5) * 0.12,
        vy:     (Math.random() - 0.5) * 0.10,
        radius: 180 + Math.random() * 220,
        phase:  Math.random() * Math.PI * 2,
        rate:   0.00018 + Math.random() * 0.00014
      });
    }
  }

  S.tickBreath = function (now) {
    for (let i = 0; i < breathZones.length; i++) {
      const b = breathZones[i];
      b.x += b.vx;
      b.y += b.vy;
      if (b.x < -b.radius)           { b.x = -b.radius;           b.vx *= -1; }
      if (b.x > S.width + b.radius)  { b.x = S.width + b.radius;  b.vx *= -1; }
      if (b.y < -b.radius)           { b.y = -b.radius;           b.vy *= -1; }
      if (b.y > S.height + b.radius) { b.y = S.height + b.radius; b.vy *= -1; }
    }
  };

  function breathAt(x, y, now) {
    let sum = 0;
    for (let i = 0; i < breathZones.length; i++) {
      const b = breathZones[i];
      const dx = x - b.x;
      const dy = y - b.y;
      const distSq = dx * dx + dy * dy;
      const rSq = b.radius * b.radius;
      if (distSq >= rSq) continue;
      const t      = 1 - distSq / rSq;
      const smooth = t * t;
      const pulse  = Math.sin(now * b.rate + b.phase);
      sum += smooth * pulse;
    }
    return Math.max(-1, Math.min(1, sum * 0.65));
  }

  S.initBreathZones = initBreathZones;

  // ---------------------------------------------------------------------------
  // Blue drift currents
  // 2-3 large slow-moving vector fields that give blue particles directed
  // motion independent of the teal bands. Each current has a position,
  // a direction angle that slowly rotates, and a radius of influence.
  // The result: the blue field has visible large-scale circulation —
  // areas that pool and thin, slow eddies, a sense of the whole fluid moving.
  // ---------------------------------------------------------------------------

  const DRIFT_COUNT = 3;
  const driftCurrents = [];

  S.initDriftCurrents = function () {
    driftCurrents.length = 0;
    for (let i = 0; i < DRIFT_COUNT; i++) {
      driftCurrents.push({
        // Spread evenly across the canvas with some randomness
        x:        S.width  * (0.15 + 0.7 * (i / (DRIFT_COUNT - 1)) + (Math.random() - 0.5) * 0.15),
        y:        S.height * (0.2  + 0.6 * Math.random()),
        // Drift velocity of the current's center — very slow wander
        vx:       (Math.random() - 0.5) * 0.08,
        vy:       (Math.random() - 0.5) * 0.08,
        // The direction the current pushes particles
        angle:    Math.random() * Math.PI * 2,
        // How fast the angle slowly rotates (makes the current meander)
        angleRate: (Math.random() - 0.5) * 0.00008,
        // Radius of influence — large, soft falloff
        radius:   250 + Math.random() * 200,
        // Strength of the push
        strength: 0.0006 + Math.random() * 0.0005
      });
    }
  };

  S.tickDriftCurrents = function (now) {
    for (let i = 0; i < driftCurrents.length; i++) {
      const c = driftCurrents[i];
      c.x     += c.vx;
      c.y     += c.vy;
      c.angle += c.angleRate;
      // Soft bounce
      if (c.x < -c.radius)           { c.x = -c.radius;           c.vx *= -1; }
      if (c.x > S.width + c.radius)  { c.x = S.width + c.radius;  c.vx *= -1; }
      if (c.y < -c.radius)           { c.y = -c.radius;           c.vy *= -1; }
      if (c.y > S.height + c.radius) { c.y = S.height + c.radius; c.vy *= -1; }
    }
  };

  // Returns the net drift velocity [dvx, dvy] for a blue particle at (x, y)
  function driftAt(x, y) {
    let dvx = 0, dvy = 0;
    for (let i = 0; i < driftCurrents.length; i++) {
      const c = driftCurrents[i];
      const dx = x - c.x;
      const dy = y - c.y;
      const distSq = dx * dx + dy * dy;
      const rSq    = c.radius * c.radius;
      if (distSq >= rSq) continue;
      const t      = 1 - distSq / rSq;
      const smooth = t * t;  // soft radial falloff
      dvx += Math.cos(c.angle) * c.strength * smooth;
      dvy += Math.sin(c.angle) * c.strength * smooth;
    }
    return [dvx, dvy];
  }

  // ---------------------------------------------------------------------------

  class Dot {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;

      this.type  = "blue";
      this.color = S.blues[2];
      this.blob  = null;

      this.flowAngle   = 0;
      this.spinOffset  = Math.random() * Math.PI * 2;
      this.tendrilBias = Math.random() * Math.PI * 2;
      this.shadeBias   = ((Math.random() * 3) | 0) - 1;

      this.laneX        = x;
      this.laneY        = y;
      this.laneNX       = 0;
      this.laneNY       = 0;
      this.laneTX       = 1;
      this.laneTY       = 0;
      this.laneWidth    = 32;
      this.laneDistance = 999;
      this.localDensity = 0;

      this.patternA  = S.hash01(x * 0.073, y * 0.073, 1);
      this.patternB  = S.hash01(x * 0.131, y * 0.131, 2);
      this.surgeSeed = S.hash01(x * 0.097, y * 0.097, 3) * Math.PI * 2;
    }

    updateLaneData() {
      const lane = S.nearestTealLane(this.x, this.y);
      if (!lane) return;
      this.laneX        = lane.px;
      this.laneY        = lane.py;
      this.laneNX       = lane.nx;
      this.laneNY       = lane.ny;
      this.laneTX       = lane.tx;
      this.laneTY       = lane.ty;
      this.laneWidth    = lane.curve.width;
      this.laneDistance = lane.dist;
    }

    update() {
      if (S.debug?.enabled) {
        S.debugStats.updated++;
        if (S.debugStats.typeCounts[this.type] !== undefined)
          S.debugStats.typeCounts[this.type]++;
      }

      const cellX = Math.floor(this.x / S.spacing) + S.gridOffsetX;
      const cellY = Math.floor(this.y / S.spacing) + S.gridOffsetY;

      let tealAvgVX = 0, tealAvgVY = 0, tealCount = 0;
      let nearbyTealFlowX = 0, nearbyTealFlowY = 0;
      let nearbyTealNX = 0, nearbyTealNY = 0;
      let nearbyTealCount = 0;
      // Track distance to nearest teal band edge for displacement push
      let nearestTealBandDist = 999;
      let nearestTealBandNX = 0, nearestTealBandNY = 0;

      if (this.type === "teal") this.updateLaneData();

      for (let gy = -1; gy <= 1; gy++) {
        const row = S.grid[cellY + gy];
        if (!row) continue;
        for (let gx = -1; gx <= 1; gx++) {
          const cell = row[cellX + gx];
          if (!cell) continue;
          for (let i = 0; i < cell.length; i++) {
            const other = cell[i];
            if (other === this) continue;

            const wrapped = S.distWrapped(this.x, this.y, other.x, other.y);
            const dx = wrapped.dx;
            const dy = wrapped.dy;
            const distSq = dx * dx + dy * dy;

            if (distSq > 0 && distSq < S.interactionRadiusSq) {
              const dist = Math.sqrt(distSq);
              const nx   = dx / dist;
              const ny   = dy / dist;
              const force = (S.interactionRadius - dist) * 0.0085;

              this.vx += nx * force;
              this.vy += ny * force;

              if (this.type === "purple" && other.type !== "purple") {
                this.vx += nx * 0.045;
                this.vy += ny * 0.045;
              }

              if (this.type === "blue" && other.type === "teal") {
                const tealPull = ((S.interactionRadius - dist) / S.interactionRadius) * 0.0012;
                this.vx += other.laneTX * tealPull;
                this.vy += other.laneTY * tealPull;
              }

              if (this.type === "blue" && other.type === "purple" && other.blob) {
                const bdx   = other.x - other.blob.x;
                const bdy   = other.y - other.blob.y;
                const bdist = Math.hypot(bdx, bdy) + 0.0001;
                const bnx = bdx / bdist, bny = bdy / bdist;
                const btx = -bny,        bty =  bnx;
                const purpleDrag = ((S.interactionRadius - dist) / S.interactionRadius) * 0.010;
                const purplePull = ((S.interactionRadius - dist) / S.interactionRadius) * 0.004;
                this.vx += btx * purpleDrag - bnx * purplePull;
                this.vy += bty * purpleDrag - bny * purplePull;
              }
            }

            if (this.type === "teal" && other.type === "teal" && distSq < S.tealNeighborRadiusSq) {
              const dist = Math.sqrt(distSq) + 0.0001;
              const w    = 1 - dist / S.tealNeighborRadius;
              tealAvgVX += other.vx * w;
              tealAvgVY += other.vy * w;
              tealCount += w;
            }

            if (this.type === "blue" && other.type === "teal" && distSq < S.blueWakeRadiusSq) {
              const dist = Math.sqrt(distSq) + 0.0001;
              const w    = 1 - dist / S.blueWakeRadius;
              nearbyTealFlowX += other.laneTX * w;
              nearbyTealFlowY += other.laneTY * w;
              nearbyTealNX    += other.laneNX * w;
              nearbyTealNY    += other.laneNY * w;
              nearbyTealCount += w;

              // Track closest teal band edge for displacement push
              // laneDistance = how far this teal particle is from its lane center
              // We want the blue particle's distance from the band edge = laneDistance - laneWidth
              const edgeDist = other.laneDistance - other.laneWidth;
              if (edgeDist < nearestTealBandDist) {
                nearestTealBandDist = edgeDist;
                // Normal pointing away from the band (outward from lane center)
                nearestTealBandNX = other.laneNX;
                nearestTealBandNY = other.laneNY;
              }
            }
          }
        }
      }

      // -----------------------------------------------------------------------
      // Purple vortex / tendril field
      // -----------------------------------------------------------------------
      if (this.type === "purple" && this.blob) {
        const dx   = this.x - this.blob.x;
        const dy   = this.y - this.blob.y;
        const dist = Math.hypot(dx, dy) + 0.0001;
        const nx = dx / dist, ny = dy / dist;
        const tx = -ny,       ty =  nx;

        const coreRadius   = this.blob.radius * 0.14;
        const middleRadius = this.blob.radius * 0.52;
        const outerRadius  = this.blob.radius;
        const radialT      = Math.min(dist / outerRadius, 1);

        if (dist < outerRadius) {
          const leash = (1 - radialT) * 0.004 + 0.006;
          this.vx += -nx * leash;
          this.vy += -ny * leash;
        }
        if (dist > coreRadius && dist < middleRadius) {
          const t = (dist - coreRadius) / (middleRadius - coreRadius);
          const swirlStrength = (1 - t) * 0.018 + 0.02;
          this.vx += tx * swirlStrength;
          this.vy += ty * swirlStrength;
        }
        if (dist >= middleRadius && dist < outerRadius) {
          const t = (dist - middleRadius) / (outerRadius - middleRadius);
          this.vx += tx * (1 - t) * 0.008;
          this.vy += ty * (1 - t) * 0.008;
          const angle = Math.atan2(dy, dx);
          const tendrilPhase = angle * 3.5 + dist * 0.045 + this.spinOffset + performance.now() * 0.00022;
          this.vx += nx * Math.sin(tendrilPhase) * 0.018;
          this.vy += ny * Math.sin(tendrilPhase) * 0.018;
          this.vx += tx * Math.cos(tendrilPhase * 0.8 + this.tendrilBias) * 0.008;
          this.vy += ty * Math.cos(tendrilPhase * 0.8 + this.tendrilBias) * 0.008;
        }
        if (dist < coreRadius) { this.vx *= 0.72; this.vy *= 0.72; }

        const purpleMaxSpeed = 1.55;
        const speed = Math.hypot(this.vx, this.vy);
        if (speed > purpleMaxSpeed) { this.vx *= purpleMaxSpeed / speed; this.vy *= purpleMaxSpeed / speed; }
      }

      // -----------------------------------------------------------------------
      // Teal flow + vortex deflection
      // -----------------------------------------------------------------------
      if (this.type === "teal") {
        const laneAngle = Math.atan2(this.laneTY, this.laneTX);
        this.flowAngle  = S.smoothAngle(this.flowAngle, laneAngle, 0.22);

        for (let bi = 0; bi < S.purpleBlobs.length; bi++) {
          const blob = S.purpleBlobs[bi];
          const bdx  = this.x - blob.x;
          const bdy  = this.y - blob.y;
          const bdist = Math.hypot(bdx, bdy) + 0.0001;
          const influenceRadius = blob.radius * 1.6;
          if (bdist < influenceRadius) {
            const t = 1 - bdist / influenceRadius;
            const bnx = bdx / bdist, bny = bdy / bdist;
            const tangentAngle = Math.atan2(bnx, -bny);
            this.flowAngle = S.smoothAngle(this.flowAngle, tangentAngle, t * (1 - t) * 4 * 0.35);
            this.vx += -bny * t * 0.018;
            this.vy +=  bnx * t * 0.018;
          }
        }

        const density = S.clamp(tealCount / 2.8, 0, 1);
        this.localDensity = density;
        const now    = performance.now() * 0.001;
        const laneDX = S.wrapDelta(this.laneX - this.x, S.width);
        const laneDY = S.wrapDelta(this.laneY - this.y, S.height);
        const along   = -(laneDX * this.laneTX + laneDY * this.laneTY);
        const lateral =   laneDX * this.laneNX + laneDY * this.laneNY;
        const surge   = 0.5 + 0.5 * Math.sin(now * 1.6 + along * 0.08 + this.surgeSeed);
        const ribbonBias = Math.sin(now * 0.9 + along * 0.045 + this.patternA * Math.PI * 2) * 0.0004;
        const forwardThrust = S.lerp(0.082, 0.104, density) + surge * 0.04;
        this.vx += Math.cos(this.flowAngle) * forwardThrust;
        this.vy += Math.sin(this.flowAngle) * forwardThrust;
        if (tealCount > 0.0001) {
          this.vx += (tealAvgVX / tealCount - this.vx) * 0.001;
          this.vy += (tealAvgVY / tealCount - this.vy) * 0.001;
        }
        this.vx += this.laneNX * (lateral * 0.00075 + ribbonBias);
        this.vy += this.laneNY * (lateral * 0.00075 + ribbonBias);
      }

      // -----------------------------------------------------------------------
      // Blue: wake carry + lateral spread + displacement push + drift currents
      // -----------------------------------------------------------------------
      if (this.type === "blue") {
        // Wake: downstream carry + gentle lateral spread
        if (nearbyTealCount > 0.0001) {
          nearbyTealFlowX /= nearbyTealCount;
          nearbyTealFlowY /= nearbyTealCount;
          nearbyTealNX    /= nearbyTealCount;
          nearbyTealNY    /= nearbyTealCount;
          this.vx += nearbyTealFlowX * 0.0014;
          this.vy += nearbyTealFlowY * 0.0014;
          this.vx += nearbyTealNX * 0.0004;
          this.vy += nearbyTealNY * 0.0004;
        }

        // Displacement push: blue near teal band edges gets nudged outward.
        // This creates a subtle dark margin beside each band — the fluid
        // visibly parts as the teal sweeps through it.
        if (nearestTealBandDist < 28) {
          // edgeDist < 0 means inside the band (shouldn't happen for blue,
          // but clamp to 0 for safety). Push scales with how close to the edge.
          const pushStrength = S.clamp((28 - nearestTealBandDist) / 28, 0, 1) * 0.0018;
          this.vx += nearestTealBandNX * pushStrength;
          this.vy += nearestTealBandNY * pushStrength;
        }

        // Drift currents: large-scale directed motion across the whole blue field
        const [dvx, dvy] = driftAt(this.x, this.y);
        this.vx += dvx;
        this.vy += dvy;
      }

      // -----------------------------------------------------------------------
      // Type-specific drift / damping
      // -----------------------------------------------------------------------
      if (this.type === "blue") {
        this.vx += (Math.random() - 0.5) * 0.0013;
        this.vy += (Math.random() - 0.5) * 0.0013;
        this.vx *= 0.952;
        this.vy *= 0.952;
      } else if (this.type === "teal") {
        this.vx += (Math.random() - 0.5) * 0.0011;
        this.vy += (Math.random() - 0.5) * 0.0011;
        this.vx *= 0.958;
        this.vy *= 0.958;
        const tealMaxSpeed = 1.18;
        const speed = Math.hypot(this.vx, this.vy);
        if (speed > tealMaxSpeed) { this.vx *= tealMaxSpeed / speed; this.vy *= tealMaxSpeed / speed; }
      } else if (this.type === "purple") {
        this.vx += (Math.random() - 0.5) * 0.0007;
        this.vy += (Math.random() - 0.5) * 0.0007;
        this.vx *= 0.935;
        this.vy *= 0.935;
      }

      if (!Number.isFinite(this.vx) || !Number.isFinite(this.vy)) {
        if (S.debug?.enabled) {
          S.debugStats.invalidVelocity++;
          console.warn("[OilSpill:invalid velocity]", { type: this.type, x: this.x, y: this.y, vx: this.vx, vy: this.vy });
        }
        if (S.debug?.stopOnInvalidParticle) throw new Error("Invalid particle velocity");
        this.vx = 0; this.vy = 0;
      }

      this.x += this.vx;
      this.y += this.vy;
    }

    updateColor() {
      const speed = Math.hypot(this.vx, this.vy);

      if (this.type === "blue") {
        const now    = performance.now();
        const breath = breathAt(this.x, this.y, now);
        const breathBoost = breath > 0.25 ? 1 : breath < -0.25 ? -1 : 0;
        const stretchBoost = this.laneDistance < 44 ? 1 : 0;
        const speedBoost   = speed > 0.42 ? 1 : speed > 0.18 ? 0 : -1;
        const base = 1 + this.shadeBias + speedBoost;
        this.color = S.pickPaletteColor(S.blues, S.clamp(base + breathBoost + stretchBoost, 0, S.blues.length - 1));
        return;
      }

      if (this.type === "teal") {
        const centerBias = this.laneDistance < this.laneWidth * 0.3 ? 1
                         : this.laneDistance > this.laneWidth * 0.72 ? -1 : 0;
        const highlight  = this.patternA > 0.92 && speed > 0.5 ? 1 : 0;
        const speedBoost = speed > 0.72 ? 1 : speed > 0.4 ? 0 : -1;
        this.color = S.pickPaletteColor(S.teals, S.clamp(2 + this.shadeBias + centerBias + speedBoost + highlight, 0, S.teals.length - 1));
        return;
      }

      if (this.type === "purple" && this.blob) {
        const dx   = this.x - this.blob.x;
        const dy   = this.y - this.blob.y;
        const dist = Math.hypot(dx, dy);
        const cR = this.blob.radius * 0.14;
        const mR = this.blob.radius * 0.52;
        const oR = this.blob.radius;
        let baseIndex = dist < cR ? 0 : dist < mR ? 2 : dist < oR ? 3 : 2;
        this.color = S.pickPaletteColor(S.purples, S.clamp(baseIndex + this.shadeBias, 0, S.purples.length - 1));
        return;
      }

      this.color = S.blues[2];
    }

    wrap() {
      const margin = 10;
      if      (this.x < -margin)             { this.x = S.width  + margin; this.vx *= 0.35; }
      else if (this.x > S.width  + margin)   { this.x = -margin;           this.vx *= 0.35; }
      if      (this.y < -margin)             { this.y = S.height + margin; this.vy *= 0.35; }
      else if (this.y > S.height + margin)   { this.y = -margin;           this.vy *= 0.35; }
    }

    draw() {
      if (!Number.isFinite(this.x) || !Number.isFinite(this.y)) {
        if (S.debug?.enabled) { S.debugStats.invalidPosition++; }
        return;
      }
      if (S.debug?.enabled) S.debugStats.drawn++;

      let radius = S.baseDotSize;
      if (this.type === "teal")   radius = S.baseDotSize * 0.82;
      if (this.type === "purple") radius = S.baseDotSize * 1.05;

      S.ctx.fillStyle = this.color;
      S.ctx.beginPath();
      S.ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
      S.ctx.fill();
    }
  }

  S.Dot = Dot;

  S.assignDotType = function (dot) {
    dot.type = "blue";
    dot.blob = null;
    dot.laneDistance = 999;

    for (let i = 0; i < S.purpleBlobs.length; i++) {
      const b = S.purpleBlobs[i];
      if (Math.hypot(dot.x - b.x, dot.y - b.y) < b.radius) {
        dot.type = "purple";
        dot.blob = b;
      }
    }

    const lane = S.nearestTealLane(dot.x, dot.y);
    if (lane) {
      dot.laneDistance = lane.dist;
      if (lane.dist < lane.curve.width) {
        dot.type      = "teal";
        dot.flowAngle = lane.angle;
      }
      dot.laneX     = lane.px;
      dot.laneY     = lane.py;
      dot.laneNX    = lane.nx;
      dot.laneNY    = lane.ny;
      dot.laneTX    = lane.tx;
      dot.laneTY    = lane.ty;
      dot.laneWidth = lane.curve.width;
      if (lane.dist < lane.curve.width) dot.localDensity = 1;
    }
  };
})();
