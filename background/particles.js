(function () {
  const S = window.OilSpill;

  // ---------------------------------------------------------------------------
  // Blue breathing blobs
  // A small set of large circular zones that drift slowly and pulse
  // independently, driving the blue color index toward lighter or darker.
  // This replaces the flat per-particle sin-wave shift with spatial blobs.
  // ---------------------------------------------------------------------------

  const BREATH_COUNT = 5;
  const breathZones = [];

  function initBreathZones() {
    breathZones.length = 0;
    for (let i = 0; i < BREATH_COUNT; i++) {
      breathZones.push({
        // start scattered, not clumped
        x: (S.width  || window.innerWidth)  * (0.1 + 0.8 * (i / BREATH_COUNT)),
        y: (S.height || window.innerHeight) * (0.15 + 0.7 * Math.random()),
        // drift velocity — very slow, independent per blob
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.10,
        // radius of influence — large so blobs overlap softly
        radius: 180 + Math.random() * 220,
        // phase offset for the pulse cycle
        phase: Math.random() * Math.PI * 2,
        // how fast this blob pulses (slow variation between blobs)
        rate: 0.00018 + Math.random() * 0.00014
      });
    }
  }

  // Tick breath zones every frame — called from animate loop via S.tickBreath
  S.tickBreath = function (now) {
    for (let i = 0; i < breathZones.length; i++) {
      const b = breathZones[i];
      b.x += b.vx;
      b.y += b.vy;

      // Soft bounce off canvas edges
      if (b.x < -b.radius)           { b.x = -b.radius;           b.vx *= -1; }
      if (b.x > S.width + b.radius)  { b.x = S.width + b.radius;  b.vx *= -1; }
      if (b.y < -b.radius)           { b.y = -b.radius;           b.vy *= -1; }
      if (b.y > S.height + b.radius) { b.y = S.height + b.radius; b.vy *= -1; }
    }
  };

  // Query the net breath influence at a point: returns a float in [-1, +1]
  // Positive = lighter, negative = darker
  function breathAt(x, y, now) {
    let sum = 0;
    for (let i = 0; i < breathZones.length; i++) {
      const b = breathZones[i];
      const dx = x - b.x;
      const dy = y - b.y;
      const distSq = dx * dx + dy * dy;
      const rSq = b.radius * b.radius;
      if (distSq >= rSq) continue;
      const t = 1 - distSq / rSq; // 0 at edge, 1 at center
      const smooth = t * t;        // ease-in falloff for soft edges
      const pulse = Math.sin(now * b.rate + b.phase);
      sum += smooth * pulse;
    }
    // Normalise loosely so overlapping blobs don't blow out the range
    return Math.max(-1, Math.min(1, sum * 0.65));
  }

  // Expose so background.js can init after canvas size is known
  S.initBreathZones = initBreathZones;

  // ---------------------------------------------------------------------------

  class Dot {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;

      this.type = "blue";
      this.color = S.blues[2];

      this.blob = null;

      this.flowAngle = 0;
      this.spinOffset = Math.random() * Math.PI * 2;
      this.tendrilBias = Math.random() * Math.PI * 2;

      this.shadeBias = ((Math.random() * 3) | 0) - 1;

      this.laneX = x;
      this.laneY = y;
      this.laneNX = 0;
      this.laneNY = 0;
      this.laneTX = 1;
      this.laneTY = 0;
      this.laneWidth = 32;
      this.laneDistance = 999;
      this.localDensity = 0;

      this.patternA = S.hash01(x * 0.073, y * 0.073, 1);
      this.patternB = S.hash01(x * 0.131, y * 0.131, 2);
      this.surgeSeed = S.hash01(x * 0.097, y * 0.097, 3) * Math.PI * 2;
    }

    updateLaneData() {
      const lane = S.nearestTealLane(this.x, this.y);
      if (!lane) return;

      this.laneX = lane.px;
      this.laneY = lane.py;
      this.laneNX = lane.nx;
      this.laneNY = lane.ny;
      this.laneTX = lane.tx;
      this.laneTY = lane.ty;
      this.laneWidth = lane.curve.width;
      this.laneDistance = lane.dist;
    }

    update() {
      if (S.debug?.enabled) {
        S.debugStats.updated++;
        if (S.debugStats.typeCounts[this.type] !== undefined) {
          S.debugStats.typeCounts[this.type]++;
        }
      }

      const cellX = Math.floor(this.x / S.spacing) + S.gridOffsetX;
      const cellY = Math.floor(this.y / S.spacing) + S.gridOffsetY;

      let tealAvgVX = 0;
      let tealAvgVY = 0;
      let tealCount = 0;

      let nearbyTealFlowX = 0;
      let nearbyTealFlowY = 0;
      let nearbyTealNX = 0;
      let nearbyTealNY = 0;
      let nearbyTealCount = 0;

      if (this.type === "teal") {
        this.updateLaneData();
      }

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
              const nx = dx / dist;
              const ny = dy / dist;
              const force = (S.interactionRadius - dist) * 0.0085;

              this.vx += nx * force;
              this.vy += ny * force;

              if (this.type === "purple" && other.type !== "purple") {
                this.vx += nx * 0.045;
                this.vy += ny * 0.045;
              }

              if (this.type === "blue" && other.type === "teal") {
                const tealPull =
                  ((S.interactionRadius - dist) / S.interactionRadius) * 0.0012;
                this.vx += other.laneTX * tealPull;
                this.vy += other.laneTY * tealPull;
              }

              if (this.type === "blue" && other.type === "purple" && other.blob) {
                const bdx = other.x - other.blob.x;
                const bdy = other.y - other.blob.y;
                const bdist = Math.hypot(bdx, bdy) + 0.0001;

                const bnx = bdx / bdist;
                const bny = bdy / bdist;
                const btx = -bny;
                const bty = bnx;

                const purpleDrag =
                  ((S.interactionRadius - dist) / S.interactionRadius) * 0.010;
                const purplePull =
                  ((S.interactionRadius - dist) / S.interactionRadius) * 0.004;

                this.vx += btx * purpleDrag - bnx * purplePull;
                this.vy += bty * purpleDrag - bny * purplePull;
              }
            }

            if (
              this.type === "teal" &&
              other.type === "teal" &&
              distSq < S.tealNeighborRadiusSq
            ) {
              const dist = Math.sqrt(distSq) + 0.0001;
              const w = 1 - dist / S.tealNeighborRadius;

              tealAvgVX += other.vx * w;
              tealAvgVY += other.vy * w;
              tealCount += w;
            }

            if (
              this.type === "blue" &&
              other.type === "teal" &&
              distSq < S.blueWakeRadiusSq
            ) {
              const dist = Math.sqrt(distSq) + 0.0001;
              const w = 1 - dist / S.blueWakeRadius;

              nearbyTealFlowX += other.laneTX * w;
              nearbyTealFlowY += other.laneTY * w;
              // accumulate lane normal for gentle lateral spread
              nearbyTealNX += other.laneNX * w;
              nearbyTealNY += other.laneNY * w;
              nearbyTealCount += w;
            }
          }
        }
      }

      // -----------------------------------------------------------------------
      // Purple vortex / tendril field
      // -----------------------------------------------------------------------
      if (this.type === "purple" && this.blob) {
        const dx = this.x - this.blob.x;
        const dy = this.y - this.blob.y;
        const dist = Math.hypot(dx, dy) + 0.0001;

        const nx = dx / dist;
        const ny = dy / dist;
        const tx = -ny;
        const ty = nx;

        const coreRadius   = this.blob.radius * 0.14;
        const middleRadius = this.blob.radius * 0.52;
        const outerRadius  = this.blob.radius;

        const radialT = Math.min(dist / outerRadius, 1);

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
          const edgeSwirl = (1 - t) * 0.008;
          this.vx += tx * edgeSwirl;
          this.vy += ty * edgeSwirl;

          const angle = Math.atan2(dy, dx);
          const tendrilPhase =
            angle * 3.5 +
            dist * 0.045 +
            this.spinOffset +
            performance.now() * 0.00022;

          const tendrilPush = Math.sin(tendrilPhase) * 0.018;
          this.vx += nx * tendrilPush;
          this.vy += ny * tendrilPush;

          const sideWobble =
            Math.cos(tendrilPhase * 0.8 + this.tendrilBias) * 0.008;
          this.vx += tx * sideWobble;
          this.vy += ty * sideWobble;
        }

        if (dist < coreRadius) {
          this.vx *= 0.72;
          this.vy *= 0.72;
        }

        const purpleMaxSpeed = 1.55;
        const speed = Math.hypot(this.vx, this.vy);
        if (speed > purpleMaxSpeed) {
          const scale = purpleMaxSpeed / speed;
          this.vx *= scale;
          this.vy *= scale;
        }
      }

      // -----------------------------------------------------------------------
      // Teal flow + vortex deflection
      // When a teal particle is inside a purple blob's influence radius,
      // blend its flow angle toward the tangential (swirl) direction.
      // This makes the teal band visibly curve around vortices instead of
      // ploughing straight through them.
      // -----------------------------------------------------------------------
      if (this.type === "teal") {
        const laneAngle = Math.atan2(this.laneTY, this.laneTX);
        this.flowAngle = S.smoothAngle(this.flowAngle, laneAngle, 0.22);

        // Vortex deflection: check each blob
        for (let bi = 0; bi < S.purpleBlobs.length; bi++) {
          const blob = S.purpleBlobs[bi];
          const bdx = this.x - blob.x;
          const bdy = this.y - blob.y;
          const bdist = Math.hypot(bdx, bdy) + 0.0001;
          const influenceRadius = blob.radius * 1.6; // reach beyond the purple zone

          if (bdist < influenceRadius) {
            const t = 1 - bdist / influenceRadius; // 0 at edge, 1 at center

            // Tangential direction around the vortex
            const bnx = bdx / bdist;
            const bny = bdy / bdist;
            const btx = -bny; // tangent (counter-clockwise)
            const bty =  bnx;

            const tangentAngle = Math.atan2(bty, btx);

            // Deflect flow angle toward the tangent — strength peaks at ~0.5 t
            // and fades toward center and edge, so it curves rather than spins.
            const deflectionStrength = t * (1 - t) * 4 * 0.35;
            this.flowAngle = S.smoothAngle(
              this.flowAngle,
              tangentAngle,
              deflectionStrength
            );

            // Also add a small tangential velocity kick so the curve is visible
            // even before the angle smoothing has time to take effect.
            this.vx += btx * t * 0.018;
            this.vy += bty * t * 0.018;
          }
        }

        const density = S.clamp(tealCount / 2.8, 0, 1);
        this.localDensity = density;

        const now = performance.now() * 0.001;

        const laneDX = S.wrapDelta(this.laneX - this.x, S.width);
        const laneDY = S.wrapDelta(this.laneY - this.y, S.height);

        const along   = -(laneDX * this.laneTX + laneDY * this.laneTY);
        const lateral =   laneDX * this.laneNX + laneDY * this.laneNY;

        const surge =
          0.5 + 0.5 * Math.sin(now * 1.6 + along * 0.08 + this.surgeSeed);

        const ribbonBias =
          Math.sin(now * 0.9 + along * 0.045 + this.patternA * Math.PI * 2) * 0.0004;

        const forwardThrust = S.lerp(0.082, 0.104, density) + surge * 0.04;

        this.vx += Math.cos(this.flowAngle) * forwardThrust;
        this.vy += Math.sin(this.flowAngle) * forwardThrust;

        if (tealCount > 0.0001) {
          tealAvgVX /= tealCount;
          tealAvgVY /= tealCount;
          this.vx += (tealAvgVX - this.vx) * 0.001;
          this.vy += (tealAvgVY - this.vy) * 0.001;
        }

        this.vx += this.laneNX * (lateral * 0.00075 + ribbonBias);
        this.vy += this.laneNY * (lateral * 0.00075 + ribbonBias);
      }

      // -----------------------------------------------------------------------
      // Blue wake: passive ambient drift.
      // Fine-tuned: downstream carry + a very gentle lateral spread
      // (perpendicular to flow) so blue pools softly rather than streaking.
      // -----------------------------------------------------------------------
      if (this.type === "blue" && nearbyTealCount > 0.0001) {
        nearbyTealFlowX /= nearbyTealCount;
        nearbyTealFlowY /= nearbyTealCount;
        nearbyTealNX    /= nearbyTealCount;
        nearbyTealNY    /= nearbyTealCount;

        // Downstream carry (primary)
        this.vx += nearbyTealFlowX * 0.0014;
        this.vy += nearbyTealFlowY * 0.0014;

        // Very faint lateral spread so blue diffuses outward from the band
        // edge rather than forming a sharp streak
        this.vx += nearbyTealNX * 0.0004;
        this.vy += nearbyTealNY * 0.0004;
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
        if (speed > tealMaxSpeed) {
          const scale = tealMaxSpeed / speed;
          this.vx *= scale;
          this.vy *= scale;
        }
      } else if (this.type === "purple") {
        this.vx += (Math.random() - 0.5) * 0.0007;
        this.vy += (Math.random() - 0.5) * 0.0007;
        this.vx *= 0.935;
        this.vy *= 0.935;
      }

      if (!Number.isFinite(this.vx) || !Number.isFinite(this.vy)) {
        if (S.debug?.enabled) {
          S.debugStats.invalidVelocity++;
          console.warn("[OilSpill:invalid velocity]", {
            type: this.type,
            x: this.x, y: this.y,
            vx: this.vx, vy: this.vy
          });
        }
        if (S.debug?.stopOnInvalidParticle) {
          throw new Error("Invalid particle velocity detected");
        }
        this.vx = 0;
        this.vy = 0;
      }

      this.x += this.vx;
      this.y += this.vy;
    }

    updateColor() {
      const speed = Math.hypot(this.vx, this.vy);

      if (this.type === "blue") {
        const now = performance.now();

        // Replace the old flat sin-wave with a spatial breath-blob query.
        // breathAt returns [-1, +1]: positive = lighter zone, negative = darker.
        const breath = breathAt(this.x, this.y, now);
        const breathBoost = breath > 0.25 ? 1 : breath < -0.25 ? -1 : 0;

        const stretchBoost = this.laneDistance < 44 ? 1 : 0;
        const speedBoost   = speed > 0.42 ? 1 : speed > 0.18 ? 0 : -1;

        const base = 1 + this.shadeBias + speedBoost;
        const idx  = S.clamp(
          base + breathBoost + stretchBoost,
          0,
          S.blues.length - 1
        );

        this.color = S.pickPaletteColor(S.blues, idx);
        return;
      }

      if (this.type === "teal") {
        const centerBias =
          this.laneDistance < this.laneWidth * 0.3
            ? 1
            : this.laneDistance > this.laneWidth * 0.72
              ? -1
              : 0;

        const highlight = this.patternA > 0.92 && speed > 0.5 ? 1 : 0;
        const speedBoost = speed > 0.72 ? 1 : speed > 0.4 ? 0 : -1;

        const idx = S.clamp(
          2 + this.shadeBias + centerBias + speedBoost + highlight,
          0,
          S.teals.length - 1
        );

        this.color = S.pickPaletteColor(S.teals, idx);
        return;
      }

      if (this.type === "purple" && this.blob) {
        const dx   = this.x - this.blob.x;
        const dy   = this.y - this.blob.y;
        const dist = Math.hypot(dx, dy);

        const coreRadius   = this.blob.radius * 0.14;
        const middleRadius = this.blob.radius * 0.52;
        const outerRadius  = this.blob.radius;

        let baseIndex = 1;
        if      (dist < coreRadius)   baseIndex = 0;
        else if (dist < middleRadius) baseIndex = 2;
        else if (dist < outerRadius)  baseIndex = 3;
        else                          baseIndex = 2;

        const idx = S.clamp(
          baseIndex + this.shadeBias,
          0,
          S.purples.length - 1
        );
        this.color = S.pickPaletteColor(S.purples, idx);
        return;
      }

      this.color = S.blues[2];
    }

    wrap() {
      const margin = 10;

      if (this.x < -margin)            { this.x = S.width  + margin; this.vx *= 0.35; }
      else if (this.x > S.width  + margin) { this.x = -margin;          this.vx *= 0.35; }

      if (this.y < -margin)            { this.y = S.height + margin; this.vy *= 0.35; }
      else if (this.y > S.height + margin) { this.y = -margin;          this.vy *= 0.35; }
    }

    draw() {
      if (!Number.isFinite(this.x) || !Number.isFinite(this.y)) {
        if (S.debug?.enabled) {
          S.debugStats.invalidPosition++;
          console.warn("[OilSpill:invalid position]", {
            type: this.type, x: this.x, y: this.y
          });
        }
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
      const dx = dot.x - b.x;
      const dy = dot.y - b.y;

      if (Math.hypot(dx, dy) < b.radius) {
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
        dot.laneX     = lane.px;
        dot.laneY     = lane.py;
        dot.laneNX    = lane.nx;
        dot.laneNY    = lane.ny;
        dot.laneTX    = lane.tx;
        dot.laneTY    = lane.ty;
        dot.laneWidth = lane.curve.width;
        dot.localDensity = 1;
      } else {
        dot.laneX  = lane.px;
        dot.laneY  = lane.py;
        dot.laneNX = lane.nx;
        dot.laneNY = lane.ny;
        dot.laneTX = lane.tx;
        dot.laneTY = lane.ty;
        dot.laneWidth = lane.curve.width;
      }
    }
  };
})();
