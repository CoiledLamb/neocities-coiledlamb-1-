(function () {
  const S = window.OilSpill;
  const G = (window.OilSpillGui = window.OilSpillGui || {});

  G.defaultTuning = {
    sim: {
      paused: false
    },

    composition: {
      preset: "diagonalSweep",
      directionMode: "random",
      asymmetryStrength: 0.8,
      secondaryCurveCount: 2,
      dominantWidth: 42,
      dominantAmplitude: 32,
      dominantFrequency: 1.1,
      secondaryWidthMin: 22,
      secondaryWidthMax: 32,
      secondaryOffsetMin: 46,
      secondaryOffsetMax: 92,
      purplePrimaryRadius: 188,
      purpleSecondaryRadius: 148
    },

    teal: {
      directBluePull: 0.0012,
      densityDivisor: 2.8,
      forwardMin: 0.082,
      forwardMax: 0.104,
      surgeStrength: 0.04,
      surgeSpeed: 1.6,
      surgeSpatialScale: 0.08,
      alignStrength: 0.001,
      laneContainment: 0.00075,
      ribbonBias: 0.0004,
      damping: 0.958,
      maxSpeed: 1.18
    },

    blue: {
      wakePull: 0.0042,
      downstreamCarry: 0.0025,
      damping: 0.952,
      randomJitter: 0.0013,
      patternSpeed: 0.0004
    },

    purple: {
      pushOther: 0.045,
      leashBase: 0.006,
      leashInner: 0.004,
      swirlInner: 0.018,
      swirlBase: 0.02,
      edgeSwirl: 0.008,
      tendrilPush: 0.018,
      sideWobble: 0.008,
      damping: 0.935,
      maxSpeed: 1.55
    },

    debug: {
      enabled: true,
      showOverlay: true,
      logInit: true,
      logFrameStats: false,
      frameSampleRate: 12,
      stopOnInvalidParticle: false
    }
  };

  G.deepClone = function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  };

  G.mergeInto = function mergeInto(target, source) {
    for (const key in source) {
      const value = source[key];

      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        target[key] &&
        typeof target[key] === "object" &&
        !Array.isArray(target[key])
      ) {
        G.mergeInto(target[key], value);
      } else {
        target[key] = value;
      }
    }

    return target;
  };

  G.initializeTuningState = function initializeTuningState() {
    S.tuning = G.mergeInto(G.deepClone(G.defaultTuning), S.tuning || {});
    S.guiDefaults = G.deepClone(G.defaultTuning);
    S.guiControllerRefs = [];
  };

  G.refreshControllerDisplays = function refreshControllerDisplays() {
    if (!Array.isArray(S.guiControllerRefs)) return;

    for (const controller of S.guiControllerRefs) {
      if (controller && typeof controller.updateDisplay === "function") {
        controller.updateDisplay();
      }
    }
  };

  G.applyTuningToRuntime = function applyTuningToRuntime() {
    if (!S.debug || !S.tuning || !S.tuning.debug) return;

    S.debug.enabled = S.tuning.debug.enabled;
    S.debug.showOverlay = S.tuning.debug.showOverlay;
    S.debug.logInit = S.tuning.debug.logInit;
    S.debug.logFrameStats = S.tuning.debug.logFrameStats;
    S.debug.frameSampleRate = S.tuning.debug.frameSampleRate;
    S.debug.stopOnInvalidParticle = S.tuning.debug.stopOnInvalidParticle;
  };

  G.updatePauseButton = function updatePauseButton() {
    const btn = document.getElementById("pause-btn");
    if (!btn || !S.tuning || !S.tuning.sim) return;
    btn.textContent = S.tuning.sim.paused ? "Resume" : "Pause";
  };

  G.setPaused = function setPaused(paused) {
    S.tuning.sim.paused = !!paused;
    G.updatePauseButton();
  };

  G.togglePaused = function togglePaused() {
    G.setPaused(!S.tuning.sim.paused);
  };
})();