(function () {
  const S = window.OilSpill;
  const G = (window.OilSpillGui = window.OilSpillGui || {});

  G.addController = function addController(folder, object, property, ...args) {
    const controller = folder.add(object, property, ...args);
    S.guiControllerRefs.push(controller);
    return controller;
  };

  G.createGuiRoot = function createGuiRoot(container) {
    if (!container) {
      throw new Error("[OilSpill:gui] Missing GUI container.");
    }

    container.replaceChildren();

    const gui = new lil.GUI({
      title: "Oilslick Controls",
      container
    });

    gui.domElement.style.width = "100%";
    gui.domElement.style.maxWidth = "100%";
    gui.domElement.style.zIndex = "1";

    return gui;
  };

  G.buildSimFolder = function buildSimFolder(gui) {
    const folder = gui.addFolder("Sim");
    G.addController(folder, S.tuning.sim, "paused").name("Paused").onChange(G.setPaused);
    folder.open();
    return folder;
  };

  G.buildCompositionFolder = function buildCompositionFolder(gui) {
    const folder = gui.addFolder("Composition");

    G.addController(folder, S.tuning.composition, "preset", ["diagonalSweep"]).name("Preset");
    G.addController(folder, S.tuning.composition, "directionMode", ["random", "tl-br", "bl-tr"]).name("Direction");
    G.addController(folder, S.tuning.composition, "asymmetryStrength", 0.4, 1.2, 0.01).name("Asymmetry");
    G.addController(folder, S.tuning.composition, "secondaryCurveCount", 1, 2, 1).name("Secondary curves");
    G.addController(folder, S.tuning.composition, "dominantWidth", 28, 64, 1).name("Dominant width");
    G.addController(folder, S.tuning.composition, "dominantAmplitude", 10, 60, 1).name("Dominant amp");
    G.addController(folder, S.tuning.composition, "dominantFrequency", 0.4, 2.2, 0.01).name("Dominant freq");
    G.addController(folder, S.tuning.composition, "secondaryWidthMin", 10, 40, 1).name("Secondary min width");
    G.addController(folder, S.tuning.composition, "secondaryWidthMax", 16, 48, 1).name("Secondary max width");
    G.addController(folder, S.tuning.composition, "secondaryOffsetMin", 10, 120, 1).name("Secondary min offset");
    G.addController(folder, S.tuning.composition, "secondaryOffsetMax", 20, 180, 1).name("Secondary max offset");
    G.addController(folder, S.tuning.composition, "purplePrimaryRadius", 100, 260, 1).name("Purple primary radius");
    G.addController(folder, S.tuning.composition, "purpleSecondaryRadius", 80, 220, 1).name("Purple secondary radius");

    folder.open();
    return folder;
  };

  G.buildTealFolder = function buildTealFolder(gui) {
    const folder = gui.addFolder("Teal");

    G.addController(folder, S.tuning.teal, "directBluePull", 0, 0.01, 0.0001).name("Blue pull");
    G.addController(folder, S.tuning.teal, "densityDivisor", 1, 6, 0.01).name("Density divisor");
    G.addController(folder, S.tuning.teal, "forwardMin", 0, 0.2, 0.001).name("Forward min");
    G.addController(folder, S.tuning.teal, "forwardMax", 0, 0.2, 0.001).name("Forward max");
    G.addController(folder, S.tuning.teal, "surgeStrength", 0, 0.12, 0.001).name("Surge strength");
    G.addController(folder, S.tuning.teal, "surgeSpeed", 0, 4, 0.01).name("Surge speed");
    G.addController(folder, S.tuning.teal, "surgeSpatialScale", 0, 0.2, 0.001).name("Surge spacing");
    G.addController(folder, S.tuning.teal, "alignStrength", 0, 0.02, 0.0001).name("Align");
    G.addController(folder, S.tuning.teal, "laneContainment", 0, 0.01, 0.00005).name("Containment");
    G.addController(folder, S.tuning.teal, "ribbonBias", 0, 0.004, 0.00005).name("Ribbon wobble");
    G.addController(folder, S.tuning.teal, "damping", 0.85, 0.999, 0.0005).name("Damping");
    G.addController(folder, S.tuning.teal, "maxSpeed", 0.2, 3, 0.01).name("Max speed");

    return folder;
  };

  G.buildBlueFolder = function buildBlueFolder(gui) {
    const folder = gui.addFolder("Blue");

    G.addController(folder, S.tuning.blue, "wakePull", 0, 0.02, 0.0001).name("Wake pull");
    G.addController(folder, S.tuning.blue, "downstreamCarry", 0, 0.02, 0.0001).name("Downstream carry");
    G.addController(folder, S.tuning.blue, "damping", 0.85, 0.999, 0.0005).name("Damping");
    G.addController(folder, S.tuning.blue, "randomJitter", 0, 0.01, 0.0001).name("Random jitter");
    G.addController(folder, S.tuning.blue, "patternSpeed", 0, 0.005, 0.00005).name("Pattern speed");

    return folder;
  };

  G.buildPurpleFolder = function buildPurpleFolder(gui) {
    const folder = gui.addFolder("Purple");

    G.addController(folder, S.tuning.purple, "pushOther", 0, 0.12, 0.001).name("Push others");
    G.addController(folder, S.tuning.purple, "leashBase", 0, 0.03, 0.0005).name("Leash base");
    G.addController(folder, S.tuning.purple, "leashInner", 0, 0.03, 0.0005).name("Leash inner");
    G.addController(folder, S.tuning.purple, "swirlInner", 0, 0.05, 0.0005).name("Inner swirl");
    G.addController(folder, S.tuning.purple, "swirlBase", 0, 0.05, 0.0005).name("Swirl base");
    G.addController(folder, S.tuning.purple, "edgeSwirl", 0, 0.03, 0.0005).name("Edge swirl");
    G.addController(folder, S.tuning.purple, "tendrilPush", 0, 0.05, 0.0005).name("Tendril push");
    G.addController(folder, S.tuning.purple, "sideWobble", 0, 0.03, 0.0005).name("Side wobble");
    G.addController(folder, S.tuning.purple, "damping", 0.85, 0.999, 0.0005).name("Damping");
    G.addController(folder, S.tuning.purple, "maxSpeed", 0.2, 3, 0.01).name("Max speed");

    return folder;
  };

  G.buildDebugFolder = function buildDebugFolder(gui) {
    const folder = gui.addFolder("Debug");

    G.addController(folder, S.tuning.debug, "enabled").name("Enabled").onChange(G.applyTuningToRuntime);
    G.addController(folder, S.tuning.debug, "showOverlay").name("Show overlay").onChange(G.applyTuningToRuntime);
    G.addController(folder, S.tuning.debug, "logInit").name("Log init").onChange(G.applyTuningToRuntime);
    G.addController(folder, S.tuning.debug, "logFrameStats").name("Log frame stats").onChange(G.applyTuningToRuntime);
    G.addController(folder, S.tuning.debug, "frameSampleRate", 1, 120, 1).name("Frame sample").onChange(G.applyTuningToRuntime);
    G.addController(folder, S.tuning.debug, "stopOnInvalidParticle").name("Stop on invalid").onChange(G.applyTuningToRuntime);

    return folder;
  };

  G.buildGuiControls = function buildGuiControls(container) {
    const gui = G.createGuiRoot(container);

    G.buildSimFolder(gui);
    G.buildCompositionFolder(gui);
    G.buildTealFolder(gui);
    G.buildBlueFolder(gui);
    G.buildPurpleFolder(gui);
    G.buildDebugFolder(gui);

    return gui;
  };
})();