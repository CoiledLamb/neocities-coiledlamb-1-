(function () {
  const S = window.OilSpill;

  S.clamp = function (value, min, max) {
    return Math.max(min, Math.min(max, value));
  };

  S.lerp = function (a, b, t) {
    return a + (b - a) * t;
  };

  S.pickPaletteColor = function (palette, index) {
    return palette[S.clamp(index, 0, palette.length - 1)];
  };

  S.wrapDelta = function (delta, size) {
    if (!Number.isFinite(delta) || !Number.isFinite(size) || size <= 0) return 0;
    if (delta > size * 0.5) return delta - size;
    if (delta < -size * 0.5) return delta + size;
    return delta;
  };

  S.distWrapped = function (ax, ay, bx, by) {
    return {
      dx: S.wrapDelta(ax - bx, S.width),
      dy: S.wrapDelta(ay - by, S.height)
    };
  };

  S.smoothAngle = function (current, target, rate) {
    if (!Number.isFinite(current)) current = 0;
    if (!Number.isFinite(target)) target = 0;
    if (!Number.isFinite(rate)) rate = 0;

    let delta = target - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return current + delta * rate;
  };

  S.hash01 = function (x, y, seed = 0) {
    const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
    return s - Math.floor(s);
  };

  S.isFiniteNumber = function (value) {
    return Number.isFinite(value);
  };

  S.safeHypot = function (x, y, fallback = 0) {
    const h = Math.hypot(x, y);
    return Number.isFinite(h) ? h : fallback;
  };

  S.debugWarn = function (label, payload) {
    if (!S.debug || !S.debug.enabled) return;
    console.warn(label, payload);
  };
})();