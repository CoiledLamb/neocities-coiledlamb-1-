(function () {
  const S = window.OilSpill;
  const G = (window.OilSpillGui = window.OilSpillGui || {});

  const TOOLTIP_TEXT = {
    directionMode:
      "Chooses the dominant flow direction for the scene. Random varies between supported diagonals on each regenerate.",
    asymmetryStrength:
      "Pushes the scene away from balance. Higher values create a more lopsided, intentional composition.",
    secondaryCurveCount:
      "Controls how many supporting teal flow bands appear alongside the dominant band.",
    dominantWidth:
      "Sets the target thickness of the main teal flow structure.",
    dominantAmplitude:
      "Controls how strongly the dominant line bends or arcs across the page.",
    dominantFrequency:
      "Controls how often the dominant line changes direction along its path.",
    secondaryWidthMin:
      "Minimum width allowed for supporting teal lines.",
    secondaryWidthMax:
      "Maximum width allowed for supporting teal lines.",
    secondaryOffsetMin:
      "Minimum spacing between the dominant teal line and supporting lines.",
    secondaryOffsetMax:
      "Maximum spacing between the dominant teal line and supporting lines.",
    purplePrimaryRadius:
      "Base radius for the main purple vortex system.",
    purpleSecondaryRadius:
      "Base radius for the secondary purple vortex system.",

    directBluePull:
      "How strongly teal motion pulls nearby blue particles along with it.",
    densityDivisor:
      "Scales how densely teal particles occupy their lane or ribbon.",
    forwardMin:
      "Minimum forward push applied to teal particles along their flow direction.",
    forwardMax:
      "Maximum forward push applied to teal particles along their flow direction.",
    surgeStrength:
      "Adds pulsing acceleration to teal flow, making bands feel more alive and less static.",
    surgeSpeed:
      "Controls how quickly that teal surge pattern cycles over time.",
    surgeSpatialScale:
      "Controls how tightly packed or stretched the surge pattern is across space.",
    alignStrength:
      "How strongly teal particles try to align with nearby local flow.",
    laneContainment:
      "Keeps teal particles tucked into their intended ribbon instead of drifting out.",
    ribbonBias:
      "Adds side-to-side shaping pressure that can make teal bands feel more ribbon-like.",
    damping:
      "Velocity loss each frame. Higher values preserve motion longer.",
    maxSpeed:
      "Hard cap on particle speed for this group.",

    wakePull:
      "How much blue particles get caught in the wake of stronger nearby motion.",
    downstreamCarry:
      "How much blue continues drifting after being influenced by nearby flow.",
    randomJitter:
      "Adds small random motion so blue regions do not feel too locked or overly smooth.",
    patternSpeed:
      "Controls the speed of low-level motion patterning in blue particles.",

    pushOther:
      "How strongly purple systems shove surrounding particles outward.",
    leashBase:
      "Base inward pull that keeps purple particles related to their vortex center.",
    leashInner:
      "Extra inner restraint near the core of a purple vortex.",
    swirlInner:
      "Swirl force nearer the inner purple vortex region.",
    swirlBase:
      "Main swirl force across the broader purple vortex body.",
    edgeSwirl:
      "Extra swirl emphasis around the outside edge of purple structures.",
    tendrilPush:
      "Push strength that helps purple systems throw out tendril-like extensions.",
    sideWobble:
      "Adds lateral instability to purple motion so it feels less rigid and circular.",

    frameSampleRate:
      "How often frame stats would log if frame logging is enabled.",
    stopOnInvalidParticle:
      "Stops the sim when a broken particle state is detected, which is useful for debugging bad forces."
  };

  function shouldShowTooltip(property) {
    return Object.prototype.hasOwnProperty.call(TOOLTIP_TEXT, property);
  }

  function decorateController(controller, property) {
    if (!controller || !shouldShowTooltip(property)) return controller;

    const row = controller.domElement;
    if (!row) return controller;

    const nameEl =
      row.querySelector(".name") ||
      row.querySelector(".property-name") ||
      row.firstElementChild;

    if (!nameEl || nameEl.querySelector(".oilspill-help-badge")) return controller;

    const badge = document.createElement("span");
    badge.className = "oilspill-help-badge";
    badge.textContent = "?";
    badge.title = TOOLTIP_TEXT[property];
    badge.setAttribute("aria-label", TOOLTIP_TEXT[property]);
    badge.tabIndex = 0;

    nameEl.appendChild(badge);
    row.dataset.hasTooltip = "1";

    return controller;
  }

  function injectTooltipStyles() {
    if (document.getElementById("oilspill-gui-tooltip-styles")) return;

    const style = document.createElement("style");
    style.id = "oilspill-gui-tooltip-styles";
    style.textContent = `
      #oilspill-gui-mount .lil-gui .name {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      #oilspill-gui-mount .oilspill-help-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        height: 14px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        background: rgba(255, 255, 255, 0.06);
        color: rgba(255, 255, 255, 0.82);
        font-size: 10px;
        line-height: 1;
        cursor: help;
        flex: 0 0 auto;
      }

      #oilspill-gui-mount .oilspill-help-badge:hover,
      #oilspill-gui-mount .oilspill-help-badge:focus-visible {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.24);
        color: rgba(255, 255, 255, 0.96);
        outline: none;
      }
    `;

    document.head.appendChild(style);
  }

  G.addController = function addController(folder, object, property, ...args) {
    const controller = folder.add(object, property, ...args);
    S.guiControllerRefs.push(controller);
    decorateController(controller, property);
    return controller;
  };

  G.createGuiRoot = function createGuiRoot(container) {
    if (!container) {
      throw new Error("[OilSpill:gui] Missing GUI container.");
    }

    injectTooltipStyles();
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

    G.addController(folder, S.tuning.sim, "paused")
      .name("Paused")
      .onChange(G.setPaused);

    folder.open();
    return folder;
  };

  G.buildCompositionFolder = function buildCompositionFolder(gui) {
    const folder = gui.addFolder("Composition");

    G.addController(folder, S.tuning.composition, "preset", ["diagonalSweep"]).name("Preset");
    G.addController(folder, S.tuning.composition, "directionMode", ["random", "tl-br", "bl-tr"])
      .name("Direction");
    G.addController(folder, S.tuning.composition, "asymmetryStrength", 0.4, 1.2, 0.01)
      .name("Asymmetry");
    G.addController(folder, S.tuning.composition, "secondaryCurveCount", 1, 2, 1)
      .name("Secondary curves");
    G.addController(folder, S.tuning.composition, "dominantWidth", 28, 64, 1)
      .name("Dominant width");
    G.addController(folder, S.tuning.composition, "dominantAmplitude", 10, 60, 1)
      .name("Dominant amp");
    G.addController(folder, S.tuning.composition, "dominantFrequency", 0.4, 2.2, 0.01)
      .name("Dominant freq");
    G.addController(folder, S.tuning.composition, "secondaryWidthMin", 10, 40, 1)
      .name("Secondary min width");
    G.addController(folder, S.tuning.composition, "secondaryWidthMax", 16, 48, 1)
      .name("Secondary max width");
    G.addController(folder, S.tuning.composition, "secondaryOffsetMin", 10, 120, 1)
      .name("Secondary min offset");
    G.addController(folder, S.tuning.composition, "secondaryOffsetMax", 20, 180, 1)
      .name("Secondary max offset");
    G.addController(folder, S.tuning.composition, "purplePrimaryRadius", 100, 260, 1)
      .name("Purple primary radius");
    G.addController(folder, S.tuning.composition, "purpleSecondaryRadius", 80, 220, 1)
      .name("Purple secondary radius");

    folder.open();
    return folder;
  };

  G.buildTealFolder = function buildTealFolder(gui) {
    const folder = gui.addFolder("Teal");

    G.addController(folder, S.tuning.teal, "directBluePull", 0, 0.01, 0.0001)
      .name("Blue pull");
    G.addController(folder, S.tuning.teal, "densityDivisor", 1, 6, 0.01)
      .name("Density divisor");
    G.addController(folder, S.tuning.teal, "forwardMin", 0, 0.2, 0.001)
      .name("Forward min");
    G.addController(folder, S.tuning.teal, "forwardMax", 0, 0.2, 0.001)
      .name("Forward max");
    G.addController(folder, S.tuning.teal, "surgeStrength", 0, 0.12, 0.001)
      .name("Surge strength");
    G.addController(folder, S.tuning.teal, "surgeSpeed", 0, 4, 0.01)
      .name("Surge speed");
    G.addController(folder, S.tuning.teal, "surgeSpatialScale", 0, 0.2, 0.001)
      .name("Surge spacing");
    G.addController(folder, S.tuning.teal, "alignStrength", 0, 0.02, 0.0001)
      .name("Align");
    G.addController(folder, S.tuning.teal, "laneContainment", 0, 0.01, 0.00005)
      .name("Containment");
    G.addController(folder, S.tuning.teal, "ribbonBias", 0, 0.004, 0.00005)
      .name("Ribbon wobble");
    G.addController(folder, S.tuning.teal, "damping", 0.85, 0.999, 0.0005)
      .name("Damping");
    G.addController(folder, S.tuning.teal, "maxSpeed", 0.2, 3, 0.01)
      .name("Max speed");

    return folder;
  };

  G.buildBlueFolder = function buildBlueFolder(gui) {
    const folder = gui.addFolder("Blue");

    G.addController(folder, S.tuning.blue, "wakePull", 0, 0.02, 0.0001)
      .name("Wake pull");
    G.addController(folder, S.tuning.blue, "downstreamCarry", 0, 0.02, 0.0001)
      .name("Downstream carry");
    G.addController(folder, S.tuning.blue, "damping", 0.85, 0.999, 0.0005)
      .name("Damping");
    G.addController(folder, S.tuning.blue, "randomJitter", 0, 0.01, 0.0001)
      .name("Random jitter");
    G.addController(folder, S.tuning.blue, "patternSpeed", 0, 0.005, 0.00005)
      .name("Pattern speed");

    return folder;
  };

  G.buildPurpleFolder = function buildPurpleFolder(gui) {
    const folder = gui.addFolder("Purple");

    G.addController(folder, S.tuning.purple, "pushOther", 0, 0.12, 0.001)
      .name("Push others");
    G.addController(folder, S.tuning.purple, "leashBase", 0, 0.03, 0.0005)
      .name("Leash base");
    G.addController(folder, S.tuning.purple, "leashInner", 0, 0.03, 0.0005)
      .name("Leash inner");
    G.addController(folder, S.tuning.purple, "swirlInner", 0, 0.05, 0.0005)
      .name("Inner swirl");
    G.addController(folder, S.tuning.purple, "swirlBase", 0, 0.05, 0.0005)
      .name("Swirl base");
    G.addController(folder, S.tuning.purple, "edgeSwirl", 0, 0.03, 0.0005)
      .name("Edge swirl");
    G.addController(folder, S.tuning.purple, "tendrilPush", 0, 0.05, 0.0005)
      .name("Tendril push");
    G.addController(folder, S.tuning.purple, "sideWobble", 0, 0.03, 0.0005)
      .name("Side wobble");
    G.addController(folder, S.tuning.purple, "damping", 0.85, 0.999, 0.0005)
      .name("Damping");
    G.addController(folder, S.tuning.purple, "maxSpeed", 0.2, 3, 0.01)
      .name("Max speed");

    return folder;
  };

  G.buildDebugFolder = function buildDebugFolder(gui) {
    const folder = gui.addFolder("Debug");

    G.addController(folder, S.tuning.debug, "enabled")
      .name("Enabled")
      .onChange(G.applyTuningToRuntime);

    G.addController(folder, S.tuning.debug, "showOverlay")
      .name("Show overlay")
      .onChange(G.applyTuningToRuntime);

    G.addController(folder, S.tuning.debug, "logInit")
      .name("Log init")
      .onChange(G.applyTuningToRuntime);

    G.addController(folder, S.tuning.debug, "logFrameStats")
      .name("Log frame stats")
      .onChange(G.applyTuningToRuntime);

    G.addController(folder, S.tuning.debug, "frameSampleRate", 1, 120, 1)
      .name("Frame sample")
      .onChange(G.applyTuningToRuntime);

    G.addController(folder, S.tuning.debug, "stopOnInvalidParticle")
      .name("Stop on invalid")
      .onChange(G.applyTuningToRuntime);

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

  G.setupInteractionGuards = function setupInteractionGuards(ui, gui) {
    const root =
      ui?.dock ||
      gui?.domElement ||
      document.getElementById("oilspill-dock") ||
      document;

    if (!root || root.dataset.oilspillInteractionGuardsBound) return;
    root.dataset.oilspillInteractionGuardsBound = "1";

    root.addEventListener(
      "wheel",
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const slider =
          target.closest(".lil-gui .slider") ||
          target.closest(".lil-gui input[type='range']") ||
          target.closest(".lil-gui input[type='number']");

        if (!slider) return;
        event.preventDefault();
      },
      { passive: false }
    );
  };
})();