(function () {
  const S = window.OilSpill;

  // ---------------------------------------------------------------------------
  // Blue breathing blobs
  // ---------------------------------------------------------------------------
  const BREATH_COUNT = 5;
  const breathZones  = [];

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
      b.x += b.vx;  b.y += b.vy;
      if (b.x < -b.radius)           { b.x = -b.radius;           b.vx *= -1; }
      if (b.x > S.width + b.radius)  { b.x = S.width + b.radius;  b.vx *= -1; }
      if (b.y < -b.radius)           { b.y = -b.radius;           b.vy *= -1; }
      if (b.y > S.height + b.radius) { b.y = S.height + b.radius; b.vy *= -1; }
    }
  };

  // Exposed so sublayer.js can sample it
  S.breathAt = function (x, y, now) {
    let sum = 0;
    for (let i = 0; i < breathZones.length; i++) {
      const b = breathZones[i];
      const dx = x - b.x, dy = y - b.y;
      const distSq = dx * dx + dy * dy;
      const rSq    = b.radius * b.radius;
      if (distSq >= rSq) continue;
      const t = 1 - distSq / rSq;
      sum += t * t * Math.sin(now * b.rate + b.phase);
    }
    return Math.max(-1, Math.min(1, sum * 0.65));
  };

  S.initBreathZones = initBreathZones;

  // ---------------------------------------------------------------------------
  // Quiet zone influence
  // Returns 0–1: 1 = deep in the quiet corner, 0 = far from it.
  // Used to darken blue palette in calm regions.
  // ---------------------------------------------------------------------------
  function quietInfluenceAt(x, y) {
    const plan = S.compositionPlan;
    if (!plan) return 0;
    const W = S.width, H = S.height;
    const qc = plan.quietCorner;
    let qx = W * 0.5, qy = H * 0.5;
    if (qc === 'top-left')     { qx = 0; qy = 0; }
    if (qc === 'top-right')    { qx = W; qy = 0; }
    if (qc === 'bottom-left')  { qx = 0; qy = H; }
    if (qc === 'bottom-right') { qx = W; qy = H; }
    const dist    = Math.hypot(x - qx, y - qy);
    const maxDist = Math.hypot(W, H);
    // 1 at corner, fades to 0 over ~55% of screen diagonal
    return Math.max(0, 1 - dist / (maxDist * 0.55));
  }

  // ---------------------------------------------------------------------------
  // Blue drift currents
  // ---------------------------------------------------------------------------
  const DRIFT_COUNT  = 3;
  const driftCurrents = [];

  S.initDriftCurrents = function () {
    driftCurrents.length = 0;
    for (let i = 0; i < DRIFT_COUNT; i++) {
      driftCurrents.push({
        x:         S.width  * (0.15 + 0.7 * (i / (DRIFT_COUNT - 1)) + (Math.random() - 0.5) * 0.15),
        y:         S.height * (0.2  + 0.6 * Math.random()),
        vx:        (Math.random() - 0.5) * 0.08,
        vy:        (Math.random() - 0.5) * 0.08,
        angle:     Math.random() * Math.PI * 2,
        angleRate: (Math.random() - 0.5) * 0.00008,
        radius:    250 + Math.random() * 200,
        strength:  0.0006 + Math.random() * 0.0005
      });
    }
  };

  S.tickDriftCurrents = function (now) {
    for (let i = 0; i < driftCurrents.length; i++) {
      const c = driftCurrents[i];
      c.x += c.vx;  c.y += c.vy;  c.angle += c.angleRate;
      if (c.x < -c.radius)           { c.x = -c.radius;           c.vx *= -1; }
      if (c.x > S.width + c.radius)  { c.x = S.width + c.radius;  c.vx *= -1; }
      if (c.y < -c.radius)           { c.y = -c.radius;           c.vy *= -1; }
      if (c.y > S.height + c.radius) { c.y = S.height + c.radius; c.vy *= -1; }
    }
  };

  function driftAt(x, y) {
    let dvx = 0, dvy = 0;
    for (let i = 0; i < driftCurrents.length; i++) {
      const c = driftCurrents[i];
      const dx = x - c.x, dy = y - c.y;
      const distSq = dx * dx + dy * dy;
      const rSq    = c.radius * c.radius;
      if (distSq >= rSq) continue;
      const t  = 1 - distSq / rSq;
      const sm = t * t;
      dvx += Math.cos(c.angle) * c.strength * sm;
      dvy += Math.sin(c.angle) * c.strength * sm;
    }
    return [dvx, dvy];
  }

  // ---------------------------------------------------------------------------
  // Dot glyphs — spatially stable Unicode variant shapes for ~15% of blue dots
  // Assigned deterministically from patternA so the same dot always shows
  // the same glyph, avoiding flickery randomness.
  // ---------------------------------------------------------------------------
  const GLYPH_CHARS = ['●', '○', '◉', '◎'];

  function getGlyph(dot) {
    // patternA is in [0,1]; only use glyph if > 0.85 (≈15% of dots)
    if (dot.patternA <= 0.85) return null;
    const idx = Math.floor((dot.patternA - 0.85) / 0.15 * GLYPH_CHARS.length);
    return GLYPH_CHARS[Math.min(idx, GLYPH_CHARS.length - 1)];
  }

  // ---------------------------------------------------------------------------

  class Dot {
    constructor(x, y) {
      this.x = x;  this.y = y;
      this.vx = 0; this.vy = 0;

      this.type  = 'blue';
      this.color = S.blues[2];
      this.blob  = null;

      this.flowAngle   = 0;
      this.spinOffset  = Math.random() * Math.PI * 2;
      this.tendrilBias = Math.random() * Math.PI * 2;
      this.shadeBias   = ((Math.random() * 3) | 0) - 1;

      this.laneX = x; this.laneY = y;
      this.laneNX = 0; this.laneNY = 0;
      this.laneTX = 1; this.laneTY = 0;
      this.laneWidth = 32; this.laneDistance = 999;
      this.localDensity = 0;

      this.patternA  = S.hash01(x * 0.073, y * 0.073, 1);
      this.patternB  = S.hash01(x * 0.131, y * 0.131, 2);
      this.surgeSeed = S.hash01(x * 0.097, y * 0.097, 3) * Math.PI * 2;
    }

    updateLaneData() {
      const lane = S.nearestTealLane(this.x, this.y);
      if (!lane) return;
      this.laneX = lane.px; this.laneY = lane.py;
      this.laneNX = lane.nx; this.laneNY = lane.ny;
      this.laneTX = lane.tx; this.laneTY = lane.ty;
      this.laneWidth = lane.curve.width;
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
      let nearbyTealNX = 0, nearbyTealNY = 0, nearbyTealCount = 0;
      let nearestTealBandDist = 999, nearestTealBandNX = 0, nearestTealBandNY = 0;

      if (this.type === 'teal') this.updateLaneData();

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
            const dx = wrapped.dx, dy = wrapped.dy;
            const distSq = dx * dx + dy * dy;

            if (distSq > 0 && distSq < S.interactionRadiusSq) {
              const dist = Math.sqrt(distSq);
              const nx = dx / dist, ny = dy / dist;
              const force = (S.interactionRadius - dist) * 0.0085;
              this.vx += nx * force; this.vy += ny * force;

              if (this.type === 'purple' && other.type !== 'purple') {
                this.vx += nx * 0.045; this.vy += ny * 0.045;
              }
              if (this.type === 'blue' && other.type === 'teal') {
                const p = ((S.interactionRadius - dist) / S.interactionRadius) * 0.0012;
                this.vx += other.laneTX * p; this.vy += other.laneTY * p;
              }
              if (this.type === 'blue' && other.type === 'purple' && other.blob) {
                const bdx = other.x - other.blob.x, bdy = other.y - other.blob.y;
                const bd = Math.hypot(bdx, bdy) + 0.0001;
                const bnx = bdx / bd, bny = bdy / bd, btx = -bny, bty = bnx;
                const pd = ((S.interactionRadius - dist) / S.interactionRadius);
                this.vx += btx * pd * 0.010 - bnx * pd * 0.004;
                this.vy += bty * pd * 0.010 - bny * pd * 0.004;
              }
            }

            if (this.type === 'teal' && other.type === 'teal' && distSq < S.tealNeighborRadiusSq) {
              const d = Math.sqrt(distSq) + 0.0001;
              const w = 1 - d / S.tealNeighborRadius;
              tealAvgVX += other.vx * w; tealAvgVY += other.vy * w; tealCount += w;
            }

            if (this.type === 'blue' && other.type === 'teal' && distSq < S.blueWakeRadiusSq) {
              const d = Math.sqrt(distSq) + 0.0001;
              const w = 1 - d / S.blueWakeRadius;
              nearbyTealFlowX += other.laneTX * w; nearbyTealFlowY += other.laneTY * w;
              nearbyTealNX    += other.laneNX * w; nearbyTealNY    += other.laneNY * w;
              nearbyTealCount += w;
              const edgeDist = other.laneDistance - other.laneWidth;
              if (edgeDist < nearestTealBandDist) {
                nearestTealBandDist = edgeDist;
                nearestTealBandNX = other.laneNX;
                nearestTealBandNY = other.laneNY;
              }
            }
          }
        }
      }

      // Purple vortex
      if (this.type === 'purple' && this.blob) {
        const dx = this.x - this.blob.x, dy = this.y - this.blob.y;
        const dist = Math.hypot(dx, dy) + 0.0001;
        const nx = dx / dist, ny = dy / dist, tx = -ny, ty = nx;
        const cR = this.blob.radius * 0.14, mR = this.blob.radius * 0.52, oR = this.blob.radius;
        const rT = Math.min(dist / oR, 1);
        if (dist < oR)               { this.vx -= nx * ((1-rT)*0.004+0.006); this.vy -= ny * ((1-rT)*0.004+0.006); }
        if (dist > cR && dist < mR)  { const t=(dist-cR)/(mR-cR); const sw=(1-t)*0.018+0.02; this.vx+=tx*sw; this.vy+=ty*sw; }
        if (dist >= mR && dist < oR) {
          const t=(dist-mR)/(oR-mR); this.vx+=tx*(1-t)*0.008; this.vy+=ty*(1-t)*0.008;
          const a=Math.atan2(dy,dx), tp2=a*3.5+dist*0.045+this.spinOffset+performance.now()*0.00022;
          this.vx+=nx*Math.sin(tp2)*0.018+tx*Math.cos(tp2*0.8+this.tendrilBias)*0.008;
          this.vy+=ny*Math.sin(tp2)*0.018+ty*Math.cos(tp2*0.8+this.tendrilBias)*0.008;
        }
        if (dist < cR) { this.vx *= 0.72; this.vy *= 0.72; }
        const ps = Math.hypot(this.vx, this.vy);
        if (ps > 1.55) { this.vx *= 1.55/ps; this.vy *= 1.55/ps; }
      }

      // Teal flow + vortex deflection
      if (this.type === 'teal') {
        this.flowAngle = S.smoothAngle(this.flowAngle, Math.atan2(this.laneTY, this.laneTX), 0.22);
        for (let bi = 0; bi < S.purpleBlobs.length; bi++) {
          const blob = S.purpleBlobs[bi];
          const bdx = this.x - blob.x, bdy = this.y - blob.y;
          const bd  = Math.hypot(bdx, bdy) + 0.0001;
          const ir  = blob.radius * 1.6;
          if (bd < ir) {
            const t = 1 - bd / ir;
            this.flowAngle = S.smoothAngle(this.flowAngle, Math.atan2(bdx/bd, -(bdy/bd)), t*(1-t)*4*0.35);
            this.vx += -(bdy/bd) * t * 0.018;
            this.vy +=  (bdx/bd) * t * 0.018;
          }
        }
        const density = S.clamp(tealCount / 2.8, 0, 1);
        this.localDensity = density;
        const now = performance.now() * 0.001;
        const lDX = S.wrapDelta(this.laneX - this.x, S.width);
        const lDY = S.wrapDelta(this.laneY - this.y, S.height);
        const along   = -(lDX * this.laneTX + lDY * this.laneTY);
        const lateral =   lDX * this.laneNX + lDY * this.laneNY;
        const surge   = 0.5 + 0.5 * Math.sin(now * 1.6 + along * 0.08 + this.surgeSeed);
        const rb      = Math.sin(now * 0.9 + along * 0.045 + this.patternA * Math.PI * 2) * 0.0004;
        this.vx += Math.cos(this.flowAngle) * (S.lerp(0.082,0.104,density) + surge*0.04);
        this.vy += Math.sin(this.flowAngle) * (S.lerp(0.082,0.104,density) + surge*0.04);
        if (tealCount > 0.0001) {
          this.vx += (tealAvgVX/tealCount - this.vx) * 0.001;
          this.vy += (tealAvgVY/tealCount - this.vy) * 0.001;
        }
        this.vx += this.laneNX * (lateral * 0.00075 + rb);
        this.vy += this.laneNY * (lateral * 0.00075 + rb);
      }

      // Blue: wake + displacement + drift currents
      if (this.type === 'blue') {
        if (nearbyTealCount > 0.0001) {
          nearbyTealFlowX /= nearbyTealCount; nearbyTealFlowY /= nearbyTealCount;
          nearbyTealNX    /= nearbyTealCount; nearbyTealNY    /= nearbyTealCount;
          this.vx += nearbyTealFlowX * 0.0014; this.vy += nearbyTealFlowY * 0.0014;
          this.vx += nearbyTealNX    * 0.0004; this.vy += nearbyTealNY    * 0.0004;
        }
        if (nearestTealBandDist < 28) {
          const ps = S.clamp((28 - nearestTealBandDist) / 28, 0, 1) * 0.0018;
          this.vx += nearestTealBandNX * ps; this.vy += nearestTealBandNY * ps;
        }
        const [dvx, dvy] = driftAt(this.x, this.y);
        this.vx += dvx; this.vy += dvy;
      }

      // Damping
      if (this.type === 'blue') {
        this.vx += (Math.random()-0.5)*0.0013; this.vy += (Math.random()-0.5)*0.0013;
        this.vx *= 0.952; this.vy *= 0.952;
      } else if (this.type === 'teal') {
        this.vx += (Math.random()-0.5)*0.0011; this.vy += (Math.random()-0.5)*0.0011;
        this.vx *= 0.958; this.vy *= 0.958;
        const ts = Math.hypot(this.vx, this.vy);
        if (ts > 1.18) { this.vx *= 1.18/ts; this.vy *= 1.18/ts; }
      } else if (this.type === 'purple') {
        this.vx += (Math.random()-0.5)*0.0007; this.vy += (Math.random()-0.5)*0.0007;
        this.vx *= 0.935; this.vy *= 0.935;
      }

      if (!Number.isFinite(this.vx) || !Number.isFinite(this.vy)) {
        if (S.debug?.enabled) S.debugStats.invalidVelocity++;
        if (S.debug?.stopOnInvalidParticle) throw new Error('Invalid velocity');
        this.vx = 0; this.vy = 0;
      }
      this.x += this.vx; this.y += this.vy;
    }

    updateColor() {
      const speed = Math.hypot(this.vx, this.vy);

      if (this.type === 'blue') {
        const now    = performance.now();
        const breath = S.breathAt(this.x, this.y, now);
        const breathBoost  = breath > 0.25 ? 1 : breath < -0.25 ? -1 : 0;
        const stretchBoost = this.laneDistance < 44 ? 1 : 0;
        const speedBoost   = speed > 0.42 ? 1 : speed > 0.18 ? 0 : -1;
        // Quiet zone: push toward darker end (lower index) of palette
        const quietBoost   = quietInfluenceAt(this.x, this.y) > 0.5 ? -1 : 0;
        const base = 1 + this.shadeBias + speedBoost;
        this.color = S.pickPaletteColor(S.blues,
          S.clamp(base + breathBoost + stretchBoost + quietBoost, 0, S.blues.length - 1));
        return;
      }

      if (this.type === 'teal') {
        const cb = this.laneDistance < this.laneWidth * 0.3 ? 1
                 : this.laneDistance > this.laneWidth * 0.72 ? -1 : 0;
        const hl = this.patternA > 0.92 && speed > 0.5 ? 1 : 0;
        const sb = speed > 0.72 ? 1 : speed > 0.4 ? 0 : -1;
        this.color = S.pickPaletteColor(S.teals,
          S.clamp(2 + this.shadeBias + cb + sb + hl, 0, S.teals.length - 1));
        return;
      }

      if (this.type === 'purple' && this.blob) {
        const d  = Math.hypot(this.x - this.blob.x, this.y - this.blob.y);
        const cR = this.blob.radius * 0.14, mR = this.blob.radius * 0.52, oR = this.blob.radius;
        const bi = d < cR ? 0 : d < mR ? 2 : d < oR ? 3 : 2;
        this.color = S.pickPaletteColor(S.purples,
          S.clamp(bi + this.shadeBias, 0, S.purples.length - 1));
        return;
      }

      this.color = S.blues[2];
    }

    wrap() {
      const m = 10;
      if      (this.x < -m)            { this.x = S.width  + m; this.vx *= 0.35; }
      else if (this.x > S.width  + m)  { this.x = -m;           this.vx *= 0.35; }
      if      (this.y < -m)            { this.y = S.height + m; this.vy *= 0.35; }
      else if (this.y > S.height + m)  { this.y = -m;           this.vy *= 0.35; }
    }

    draw() {
      if (!Number.isFinite(this.x) || !Number.isFinite(this.y)) {
        if (S.debug?.enabled) S.debugStats.invalidPosition++;
        return;
      }
      if (S.debug?.enabled) S.debugStats.drawn++;

      // Blue dots: ~15% get a Unicode glyph variant (spatially stable)
      if (this.type === 'blue') {
        const glyph = getGlyph(this);
        if (glyph) {
          const fontSize = S.baseDotSize * 2.0;
          S.ctx.fillStyle  = this.color;
          S.ctx.font       = `${fontSize}px "Source Code Pro", monospace`;
          S.ctx.textBaseline = 'middle';
          S.ctx.textAlign    = 'center';
          S.ctx.fillText(glyph, this.x, this.y);
          return;
        }
      }

      let radius = S.baseDotSize;
      if (this.type === 'teal')   radius = S.baseDotSize * 0.82;
      if (this.type === 'purple') radius = S.baseDotSize * 1.05;

      S.ctx.fillStyle = this.color;
      S.ctx.beginPath();
      S.ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
      S.ctx.fill();
    }
  }

  S.Dot = Dot;

  S.assignDotType = function (dot) {
    dot.type = 'blue'; dot.blob = null; dot.laneDistance = 999;
    for (let i = 0; i < S.purpleBlobs.length; i++) {
      const b = S.purpleBlobs[i];
      if (Math.hypot(dot.x - b.x, dot.y - b.y) < b.radius) {
        dot.type = 'purple'; dot.blob = b;
      }
    }
    const lane = S.nearestTealLane(dot.x, dot.y);
    if (lane) {
      dot.laneDistance = lane.dist;
      if (lane.dist < lane.curve.width) {
        dot.type = 'teal'; dot.flowAngle = lane.angle; dot.localDensity = 1;
      }
      dot.laneX = lane.px; dot.laneY = lane.py;
      dot.laneNX = lane.nx; dot.laneNY = lane.ny;
      dot.laneTX = lane.tx; dot.laneTY = lane.ty;
      dot.laneWidth = lane.curve.width;
    }
  };
})();
