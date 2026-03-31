(function () {
  const S = window.OilSpill;

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

      let nearbyTealX = 0;
      let nearbyTealY = 0;
      let nearbyTealFlowX = 0;
      let nearbyTealFlowY = 0;
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

              // base local separation
              this.vx += nx * force;
              this.vy += ny * force;

              if (this.type === "purple" && other.type !== "purple") {
                this.vx += nx * 0.045;
                this.vy += ny * 0.045;
              }

              // gentler direct teal influence on blue
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

              nearbyTealX += other.x * w;
              nearbyTealY += other.y * w;
              nearbyTealFlowX += other.laneTX * w;
              nearbyTealFlowY += other.laneTY * w;
              nearbyTealCount += w;
            }
          }
        }
      }

      // purple vortex / tendril field
      if (this.type === "purple" && this.blob) {
        const dx = this.x - this.blob.x;
        const dy = this.y - this.blob.y;
        const dist = Math.hypot(dx, dy) + 0.0001;

        const nx = dx / dist;
        const ny = dy / dist;
        const tx = -ny;
        const ty = nx;

        const coreRadius = 24;
        const middleRadius = 92;
        const outerRadius = 175;

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

      // teal flow: ribbon-ish, surge-driven, lightly contained
      if (this.type === "teal") {
        const laneAngle = Math.atan2(this.laneTY, this.laneTX);
        this.flowAngle = S.smoothAngle(this.flowAngle, laneAngle, 0.22);

        const density = S.clamp(tealCount / 2.8, 0, 1);
        this.localDensity = density;

        const now = performance.now() * 0.001;

        const laneDX = S.wrapDelta(this.laneX - this.x, S.width);
        const laneDY = S.wrapDelta(this.laneY - this.y, S.height);

        const along = -(laneDX * this.laneTX + laneDY * this.laneTY);
        const lateral = laneDX * this.laneNX + laneDY * this.laneNY;

        const surge =
          0.5 + 0.5 * Math.sin(now * 1.6 + along * 0.08 + this.surgeSeed);

        const ribbonBias =
          Math.sin(now * 0.9 + along * 0.045 + this.patternA * Math.PI * 2) * 0.0004;

        const forwardThrust = S.lerp(0.082, 0.104, density) + surge * 0.04;

        this.vx += Math.cos(this.flowAngle) * forwardThrust;
        this.vy += Math.sin(this.flowAngle) * forwardThrust;

        // almost no same-band locking
        if (tealCount > 0.0001) {
          tealAvgVX /= tealCount;
          tealAvgVY /= tealCount;

          this.vx += (tealAvgVX - this.vx) * 0.001;
          this.vy += (tealAvgVY - this.vy) * 0.001;
        }

        // very light lateral containment, with a tiny ribbon wobble
        this.vx += this.laneNX * (lateral * 0.00075 + ribbonBias);
        this.vy += this.laneNY * (lateral * 0.00075 + ribbonBias);
      }

      // blue wake refill: passive ambient behavior only.
      // Blue should feel like background fluid, not something that chases teal.
      // Fix: remove centroid-pull entirely; keep only a very faint downstream
      // carry so blue gently drifts in the wake direction without tracking bands.
      if (this.type === "blue" && nearbyTealCount > 0.0001) {
        nearbyTealFlowX /= nearbyTealCount;
        nearbyTealFlowY /= nearbyTealCount;

        // Downstream carry only — no positional pull toward band centroid
        this.vx += nearbyTealFlowX * 0.0012;
        this.vy += nearbyTealFlowY * 0.0012;
      }

      // type-specific drift / damping
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
            x: this.x,
            y: this.y,
            vx: this.vx,
            vy: this.vy,
            laneX: this.laneX,
            laneY: this.laneY,
            laneTX: this.laneTX,
            laneTY: this.laneTY,
            laneDistance: this.laneDistance
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
        const now = performance.now() * 0.0004;

        const wave =
          Math.sin(now + this.patternA * Math.PI * 2 + this.patternB * 4.0);

        const patternBoost = wave > 0.3 ? 1 : wave < -0.3 ? -1 : 0;

        const stretchBoost = this.laneDistance < 44 ? 1 : 0;
        const speedBoost = speed > 0.42 ? 1 : speed > 0.18 ? 0 : -1;

        const base = 1 + this.shadeBias + speedBoost;
        const idx = S.clamp(
          base + patternBoost + stretchBoost,
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
        const dx = this.x - this.blob.x;
        const dy = this.y - this.blob.y;
        const dist = Math.hypot(dx, dy);

        // Use blob.radius to scale color zones proportionally across
        // all vortex sizes rather than hard-coded pixel values.
        // This means small micro-vortices get the full color range
        // instead of appearing uniformly mid-tone.
        const coreRadius    = this.blob.radius * 0.14;
        const middleRadius  = this.blob.radius * 0.52;
        const outerRadius   = this.blob.radius;

        let baseIndex = 1;

        if (dist < coreRadius) {
          baseIndex = 0;
        } else if (dist < middleRadius) {
          baseIndex = 2;
        } else if (dist < outerRadius) {
          baseIndex = 3;
        } else {
          baseIndex = 2;
        }

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

      if (this.x < -margin) {
        this.x = S.width + margin;
        this.vx *= 0.35;
      } else if (this.x > S.width + margin) {
        this.x = -margin;
        this.vx *= 0.35;
      }

      if (this.y < -margin) {
        this.y = S.height + margin;
        this.vy *= 0.35;
      } else if (this.y > S.height + margin) {
        this.y = -margin;
        this.vy *= 0.35;
      }
    }

    draw() {
      if (!Number.isFinite(this.x) || !Number.isFinite(this.y)) {
        if (S.debug?.enabled) {
          S.debugStats.invalidPosition++;
          console.warn("[OilSpill:invalid position]", {
            type: this.type,
            x: this.x,
            y: this.y,
            vx: this.vx,
            vy: this.vy
          });
        }
        return;
      }

      if (S.debug?.enabled) {
        S.debugStats.drawn++;
      }

      let radius = S.baseDotSize;

      if (this.type === "teal") radius = S.baseDotSize * 0.82;
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
        dot.type = "teal";
        dot.flowAngle = lane.angle;
        dot.laneX = lane.px;
        dot.laneY = lane.py;
        dot.laneNX = lane.nx;
        dot.laneNY = lane.ny;
        dot.laneTX = lane.tx;
        dot.laneTY = lane.ty;
        dot.laneWidth = lane.curve.width;
        dot.localDensity = 1;
      } else {
        dot.laneX = lane.px;
        dot.laneY = lane.py;
        dot.laneNX = lane.nx;
        dot.laneNY = lane.ny;
        dot.laneTX = lane.tx;
        dot.laneTY = lane.ty;
        dot.laneWidth = lane.curve.width;
      }
    }
  };
})();
