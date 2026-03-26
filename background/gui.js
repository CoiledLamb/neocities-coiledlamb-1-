(function () {
  const S = window.OilSpill;

  // ============================
  // guards
  // ============================

  function assertEnvironment() {
    if (!S) {
      console.warn("[OilSpill:gui] OilSpill runtime not found.");
      return false;
    }

    if (!window.lil || !window.lil.GUI) {
      console.warn("[OilSpill:gui] lil-gui not found.");
      return false;
    }

    return true;
  }

  if (!assertEnvironment()) return;

  // ============================
  // defaults + state
  // ============================

  const defaultTuning = {
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

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function mergeInto(target, source) {
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
        mergeInto(target[key], value);
      } else {
        target[key] = value;
      }
    }
    return target;
  }

  function initializeTuningState() {
    S.tuning = mergeInto(deepClone(defaultTuning), S.tuning || {});
    S.guiDefaults = deepClone(defaultTuning);
    S.guiControllerRefs = [];
  }

  function refreshControllerDisplays() {
    if (!Array.isArray(S.guiControllerRefs)) return;

    for (const controller of S.guiControllerRefs) {
      if (controller && typeof controller.updateDisplay === "function") {
        controller.updateDisplay();
      }
    }
  }

  // ============================
  // runtime sync
  // ============================

  function applyTuningToRuntime() {
    if (!S.debug || !S.tuning || !S.tuning.debug) return;

    S.debug.enabled = S.tuning.debug.enabled;
    S.debug.showOverlay = S.tuning.debug.showOverlay;
    S.debug.logInit = S.tuning.debug.logInit;
    S.debug.logFrameStats = S.tuning.debug.logFrameStats;
    S.debug.frameSampleRate = S.tuning.debug.frameSampleRate;
    S.debug.stopOnInvalidParticle = S.tuning.debug.stopOnInvalidParticle;
  }

  function updatePauseButton() {
    const btn = document.getElementById("pause-btn");
    if (!btn) return;
    btn.textContent = S.tuning.sim.paused ? "Resume" : "Pause";
  }

  function setPaused(paused) {
    S.tuning.sim.paused = !!paused;
    updatePauseButton();
  }

  function togglePaused() {
    setPaused(!S.tuning.sim.paused);
  }

  // ============================
  // actions
  // ============================

  function regenerateScene() {
    if (typeof S.rebuildScene === "function") {
      S.rebuildScene();
      return;
    }

    if (typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("oilslick:regenerate"));
    }
  }

  function resetDefaults() {
    S.tuning = deepClone(defaultTuning);
    applyTuningToRuntime();
    refreshControllerDisplays();
    updatePauseButton();
    regenerateScene();
  }

  function bindActionButtons() {
    const regenBtn = document.getElementById("regen-btn");
    const pauseBtn = document.getElementById("pause-btn");
    const resetBtn = document.getElementById("reset-btn");

    if (regenBtn && !regenBtn.dataset.oilspillBound) {
      regenBtn.dataset.oilspillBound = "1";
      regenBtn.addEventListener("click", regenerateScene);
    }

    if (pauseBtn && !pauseBtn.dataset.oilspillBound) {
      pauseBtn.dataset.oilspillBound = "1";
      pauseBtn.addEventListener("click", togglePaused);
    }

    if (resetBtn && !resetBtn.dataset.oilspillBound) {
      resetBtn.dataset.oilspillBound = "1";
      resetBtn.addEventListener("click", resetDefaults);
    }
  }

  function bindKeyboardShortcuts() {
    if (window.__oilspillKeyboardBound) return;
    window.__oilspillKeyboardBound = true;

    window.addEventListener("keydown", (event) => {
      if (event.target && /input|textarea|select/i.test(event.target.tagName)) return;

      if (event.code === "Space") {
        event.preventDefault();
        togglePaused();
      }

      if (event.key === "r" || event.key === "R") {
        regenerateScene();
      }
    });
  }

  // ============================
  // dock styles
  // ============================

  function injectDockStyles() {
    if (document.getElementById("oilspill-dock-styles")) return;

    const style = document.createElement("style");
    style.id = "oilspill-dock-styles";
    style.textContent = `
      :root {
        --oil-dock-width: min(390px, calc(100vw - 24px));
        --oil-glass-bg:
          linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.055) 0%,
            rgba(255, 255, 255, 0.018) 28%,
            rgba(255, 255, 255, 0.028) 100%
          ),
          rgba(8, 14, 20, 0.58);
        --oil-glass-border: rgba(255, 255, 255, 0.12);
        --oil-text-main: rgba(255, 255, 255, 0.95);
        --oil-text-soft: rgba(255, 255, 255, 0.76);
        --oil-text-faint: rgba(255, 255, 255, 0.58);
        --oil-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.05),
          0 10px 34px rgba(0, 0, 0, 0.2);
      }

      #lab-hud,
      .lab-sidebar {
        display: none !important;
      }

      #oilspill-dock {
        position: fixed;
        top: 12px;
        right: 12px;
        bottom: 12px;
        z-index: 60;
        width: var(--oil-dock-width);
        border-radius: 16px;
        overflow: hidden;
        transform: translateY(0);
        transition: transform 0.28s ease, opacity 0.2s ease;
        background: var(--oil-glass-bg);
        border: 1px solid var(--oil-glass-border);
        box-shadow: var(--oil-shadow);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }

      #oilspill-dock.is-collapsed {
        transform: translateY(calc(-100% + 44px));
      }

      #oilspill-dock .oil-dock-inner {
        height: 100%;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 14px;
        box-sizing: border-box;
      }

      #oilspill-dock .oil-dock-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding-right: 0;
      }

      #oilspill-dock .oil-dock-header-copy {
        min-width: 0;
        flex: 1 1 auto;
      }

      #oilspill-dock .oil-dock-title {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 0.03em;
        color: var(--oil-text-main);
      }

      #oilspill-dock .oil-dock-copy {
        margin: 8px 0 0;
        font-size: 11px;
        line-height: 1.5;
        color: var(--oil-text-soft);
        max-width: 34ch;
      }

      #oilspill-dock .oil-dock-kbd {
        display: inline-block;
        padding: 1px 5px;
        margin: 0 1px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.065);
        border: 1px solid rgba(255, 255, 255, 0.09);
        color: rgba(255, 255, 255, 0.92);
        font-size: 10px;
      }

      #oilspill-dock .oil-dock-toggle {
        flex: 0 0 auto;
        width: 28px;
        height: 28px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        background:
          linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.08) 0%,
            rgba(255, 255, 255, 0.025) 100%
          ),
          rgba(8, 14, 20, 0.42);
        color: rgba(255, 255, 255, 0.95);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font: inherit;
        font-size: 14px;
        line-height: 1;
        transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
      }

      #oilspill-dock .oil-dock-toggle:hover {
        background:
          linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.11) 0%,
            rgba(255, 255, 255, 0.035) 100%
          ),
          rgba(8, 14, 20, 0.5);
        border-color: rgba(255, 255, 255, 0.26);
      }

      #oilspill-dock .oil-dock-toggle:active {
        transform: translateY(1px);
      }

      #oilspill-dock .oil-dock-scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding-right: 4px;
        padding-bottom: 72px;
        scroll-behavior: smooth;
      }

      #oilspill-dock .oil-dock-scroll::-webkit-scrollbar {
        width: 12px;
      }

      #oilspill-dock .oil-dock-scroll::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.025);
        border-radius: 999px;
      }

      #oilspill-dock .oil-dock-scroll::-webkit-scrollbar-thumb {
        border-radius: 999px;
        border: 2px solid transparent;
        background-clip: padding-box;
        background:
          linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.18) 0%,
            rgba(255, 255, 255, 0.09) 100%
          );
      }

      #oilspill-dock .oil-dock-scroll::-webkit-scrollbar-thumb:hover {
        background:
          linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.26) 0%,
            rgba(255, 255, 255, 0.13) 100%
          );
      }

      #oilspill-dock .oil-dock-scroll {
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.18) rgba(255, 255, 255, 0.03);
      }

      #oilspill-dock .oil-dock-section {
        border-radius: 12px;
        padding: 12px;
        background: rgba(255, 255, 255, 0.035);
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-sizing: border-box;
      }

      #oilspill-dock .oil-dock-section-title {
        margin: 0 0 8px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--oil-text-faint);
      }

      #oilspill-dock .oil-action-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 8px;
      }

      #oilspill-dock .oil-glass-button,
      #oilspill-dock .oil-action-grid button {
        appearance: none;
        border: 1px solid rgba(255, 255, 255, 0.16);
        background:
          linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.08) 0%,
            rgba(255, 255, 255, 0.025) 100%
          ),
          rgba(8, 14, 20, 0.44);
        color: white;
        padding: 9px 12px;
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        text-align: left;
        border-radius: 10px;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          transform 0.15s ease,
          opacity 0.18s ease;
      }

      #oilspill-dock .oil-glass-button:hover,
      #oilspill-dock .oil-action-grid button:hover {
        background:
          linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.11) 0%,
            rgba(255, 255, 255, 0.035) 100%
          ),
          rgba(8, 14, 20, 0.5);
        border-color: rgba(255, 255, 255, 0.26);
      }

      #oilspill-dock .oil-glass-button:active,
      #oilspill-dock .oil-action-grid button:active {
        transform: translateY(1px);
      }

      #oilspill-dock #lab-status {
        min-height: 126px;
        font-size: 11px;
        line-height: 1.55;
        color: rgba(255, 255, 255, 0.84);
        white-space: pre-line;
        padding: 0;
        background: transparent;
        border: 0;
        pointer-events: none;
      }

      #oilspill-gui-mount {
        display: block;
      }

      #oilspill-gui-mount .lil-gui {
        width: 100%;
        max-width: 100%;
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: none;
        --background-color: rgba(255, 255, 255, 0.03);
        --widget-color: rgba(255, 255, 255, 0.05);
        --hover-color: rgba(255, 255, 255, 0.08);
        --focus-color: rgba(255, 255, 255, 0.1);
        --title-background-color: rgba(255, 255, 255, 0.035);
        --text-color: rgba(255, 255, 255, 0.94);
        --number-color: rgba(255, 255, 255, 0.96);
        --string-color: rgba(255, 255, 255, 0.96);
        --font-size: 11px;
        --name-width: 50%;
      }

      #oilspill-gui-mount .lil-gui.root {
        width: 100%;
      }

      #oilspill-gui-mount .lil-gui .title {
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        letter-spacing: 0.03em;
      }

      #oilspill-gui-mount .lil-gui .children {
        border-left: none;
      }

      #oilspill-gui-mount .lil-gui .controller {
        border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        min-height: 28px;
      }

      #oilspill-gui-mount .lil-gui .controller:last-child {
        border-bottom: none;
      }

      #oilspill-gui-mount .lil-gui input {
        color: rgba(255, 255, 255, 0.96);
      }

      #oilspill-gui-mount .lil-gui .slider {
        height: 16px;
        border-radius: 999px;
        background:
          linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.08) 0%,
            rgba(255, 255, 255, 0.035) 100%
          ),
          rgba(255, 255, 255, 0.025);
        border: 1px solid rgba(255, 255, 255, 0.09);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.05),
          inset 0 0 0 1px rgba(255, 255, 255, 0.015);
        overflow: hidden;
      }

      #oilspill-gui-mount .lil-gui .fill {
        margin-top: 0;
        height: 100%;
        border-radius: 999px;
        background:
          linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.82) 0%,
            rgba(255, 255, 255, 0.58) 100%
          );
        opacity: 0.95;
      }

      #oilspill-gui-mount .lil-gui .slider:hover {
        border-color: rgba(255, 255, 255, 0.16);
        background:
          linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.1) 0%,
            rgba(255, 255, 255, 0.04) 100%
          ),
          rgba(255, 255, 255, 0.03);
      }

      #oilspill-dock .oil-dock-footer {
        display: contents;
      }

      #oilspill-dock .oil-to-top {
        position: absolute;
        right: 14px;
        bottom: 14px;
        z-index: 8;
        width: auto;
        min-width: 140px;
        text-align: center;
        opacity: 0;
        pointer-events: none;
        transform: translateY(10px);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.05),
          0 8px 24px rgba(0, 0, 0, 0.24);
      }

      #oilspill-dock .oil-to-top.is-visible {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0);
      }

      @media (max-width: 840px) {
        :root {
          --oil-dock-width: calc(100vw - 24px);
        }

        #oilspill-dock {
          top: auto;
          bottom: 12px;
          max-height: min(78vh, 760px);
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ============================
  // dock DOM
  // ============================

  function buildDockShell() {
    injectDockStyles();

    let dock = document.getElementById("oilspill-dock");
    if (dock) {
      return {
        dock,
        scroll: dock.querySelector(".oil-dock-scroll"),
        guiMount: document.getElementById("oilspill-gui-mount"),
        toTopBtn: document.getElementById("oilspill-to-top"),
        toggleBtn: document.getElementById("oilspill-dock-toggle")
      };
    }

    const existingStatus = document.getElementById("lab-status");
    const regenBtn = document.getElementById("regen-btn");
    const pauseBtn = document.getElementById("pause-btn");
    const resetBtn = document.getElementById("reset-btn");

    dock = document.createElement("aside");
    dock.id = "oilspill-dock";
    dock.setAttribute("aria-label", "Oilslick controls");

    dock.innerHTML = `
      <div class="oil-dock-inner">
        <header class="oil-dock-header">
          <div class="oil-dock-header-copy">
            <h1 class="oil-dock-title">Oilslick Controls</h1>
            <p class="oil-dock-copy">
              Live tuning dock for the oil-spill background. Use drag or click to adjust controls.
              Quick actions: <span class="oil-dock-kbd">R</span> regenerate,
              <span class="oil-dock-kbd">Space</span> pause.
            </p>
          </div>

          <button
            id="oilspill-dock-toggle"
            class="oil-dock-toggle"
            type="button"
            aria-expanded="true"
            aria-label="Collapse controls panel"
            title="Collapse controls panel"
          >^</button>
        </header>

        <div class="oil-dock-scroll">
          <section class="oil-dock-section">
            <h2 class="oil-dock-section-title">Actions</h2>
            <div class="oil-action-grid" id="oilspill-action-grid"></div>
          </section>

          <section class="oil-dock-section">
            <h2 class="oil-dock-section-title">Debug</h2>
            <div id="oilspill-status-slot"></div>
          </section>

          <section class="oil-dock-section">
            <h2 class="oil-dock-section-title">Tuning</h2>
            <div id="oilspill-gui-mount"></div>
          </section>

          <footer class="oil-dock-footer">
            <button id="oilspill-to-top" class="oil-glass-button oil-to-top" type="button">
              Return to top
            </button>
          </footer>
        </div>
      </div>
    `;

    document.body.appendChild(dock);

    const actionGrid = dock.querySelector("#oilspill-action-grid");
    const statusSlot = dock.querySelector("#oilspill-status-slot");

    if (regenBtn) actionGrid.appendChild(regenBtn);
    if (pauseBtn) actionGrid.appendChild(pauseBtn);
    if (resetBtn) actionGrid.appendChild(resetBtn);
    if (existingStatus) statusSlot.appendChild(existingStatus);

    const oldHud = document.getElementById("lab-hud");
    if (oldHud) oldHud.setAttribute("aria-hidden", "true");

    return {
      dock,
      scroll: dock.querySelector(".oil-dock-scroll"),
      guiMount: dock.querySelector("#oilspill-gui-mount"),
      toTopBtn: dock.querySelector("#oilspill-to-top"),
      toggleBtn: dock.querySelector("#oilspill-dock-toggle")
    };
  }

  // ============================
  // dock behavior
  // ============================

  function setupDockBehavior(ui) {
    const { dock, scroll, toTopBtn, toggleBtn } = ui;
    if (!dock || !scroll || !toggleBtn) return;

    function syncToggleState() {
      const collapsed = dock.classList.contains("is-collapsed");
      toggleBtn.textContent = collapsed ? "v" : "^";
      toggleBtn.setAttribute("aria-expanded", String(!collapsed));
      toggleBtn.setAttribute(
        "aria-label",
        collapsed ? "Expand controls panel" : "Collapse controls panel"
      );
      toggleBtn.title = collapsed ? "Expand controls panel" : "Collapse controls panel";
    }

    function updateToTopVisibility() {
      if (!toTopBtn) return;
      toTopBtn.classList.toggle("is-visible", scroll.scrollTop > 160);
    }

    toggleBtn.addEventListener("click", () => {
      dock.classList.toggle("is-collapsed");
      syncToggleState();
    });

    scroll.addEventListener("scroll", updateToTopVisibility);

    if (toTopBtn) {
      toTopBtn.addEventListener("click", () => {
        scroll.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    syncToggleState();
    updateToTopVisibility();
  }

  // ============================
  // interaction guards
  // ============================

  function disableWheelTuning(guiRoot, scrollEl) {
    if (!guiRoot || !scrollEl) return;

    guiRoot.addEventListener(
      "wheel",
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const risky = target.closest(
          ".controller input, .controller select, .controller option, .slider, .widget"
        );

        if (!risky) return;

        event.preventDefault();
        event.stopPropagation();
        scrollEl.scrollTop += event.deltaY;
      },
      { passive: false, capture: true }
    );
  }

  function setupInteractionGuards(ui, gui) {
    disableWheelTuning(gui.domElement, ui.scroll);
  }

  // ============================
  // gui controls
  // ============================

  function addController(folder, object, property, ...args) {
    const controller = folder.add(object, property, ...args);
    S.guiControllerRefs.push(controller);
    return controller;
  }

  function createGuiRoot(container) {
    const gui = new lil.GUI({
      title: "Oilslick Controls",
      container
    });

    gui.domElement.style.width = "100%";
    gui.domElement.style.maxWidth = "100%";
    gui.domElement.style.zIndex = "1";

    return gui;
  }

  function buildSimFolder(gui) {
    const folder = gui.addFolder("Sim");
    addController(folder, S.tuning.sim, "paused").name("Paused").onChange(setPaused);
    folder.open();
    return folder;
  }

  function buildCompositionFolder(gui) {
    const folder = gui.addFolder("Composition");

    addController(folder, S.tuning.composition, "preset", ["diagonalSweep"]).name("Preset");
    addController(folder, S.tuning.composition, "directionMode", ["random", "tl-br", "bl-tr"]).name("Direction");
    addController(folder, S.tuning.composition, "asymmetryStrength", 0.4, 1.2, 0.01).name("Asymmetry");
    addController(folder, S.tuning.composition, "secondaryCurveCount", 1, 2, 1).name("Secondary curves");
    addController(folder, S.tuning.composition, "dominantWidth", 28, 64, 1).name("Dominant width");
    addController(folder, S.tuning.composition, "dominantAmplitude", 10, 60, 1).name("Dominant amp");
    addController(folder, S.tuning.composition, "dominantFrequency", 0.4, 2.2, 0.01).name("Dominant freq");
    addController(folder, S.tuning.composition, "secondaryWidthMin", 10, 40, 1).name("Secondary min width");
    addController(folder, S.tuning.composition, "secondaryWidthMax", 16, 48, 1).name("Secondary max width");
    addController(folder, S.tuning.composition, "secondaryOffsetMin", 10, 120, 1).name("Secondary min offset");
    addController(folder, S.tuning.composition, "secondaryOffsetMax", 20, 180, 1).name("Secondary max offset");
    addController(folder, S.tuning.composition, "purplePrimaryRadius", 100, 260, 1).name("Purple primary radius");
    addController(folder, S.tuning.composition, "purpleSecondaryRadius", 80, 220, 1).name("Purple secondary radius");

    folder.open();
    return folder;
  }

  function buildTealFolder(gui) {
    const folder = gui.addFolder("Teal");

    addController(folder, S.tuning.teal, "directBluePull", 0, 0.01, 0.0001).name("Blue pull");
    addController(folder, S.tuning.teal, "densityDivisor", 1, 6, 0.01).name("Density divisor");
    addController(folder, S.tuning.teal, "forwardMin", 0, 0.2, 0.001).name("Forward min");
    addController(folder, S.tuning.teal, "forwardMax", 0, 0.2, 0.001).name("Forward max");
    addController(folder, S.tuning.teal, "surgeStrength", 0, 0.12, 0.001).name("Surge strength");
    addController(folder, S.tuning.teal, "surgeSpeed", 0, 4, 0.01).name("Surge speed");
    addController(folder, S.tuning.teal, "surgeSpatialScale", 0, 0.2, 0.001).name("Surge spacing");
    addController(folder, S.tuning.teal, "alignStrength", 0, 0.02, 0.0001).name("Align");
    addController(folder, S.tuning.teal, "laneContainment", 0, 0.01, 0.00005).name("Containment");
    addController(folder, S.tuning.teal, "ribbonBias", 0, 0.004, 0.00005).name("Ribbon wobble");
    addController(folder, S.tuning.teal, "damping", 0.85, 0.999, 0.0005).name("Damping");
    addController(folder, S.tuning.teal, "maxSpeed", 0.2, 3, 0.01).name("Max speed");

    return folder;
  }

  function buildBlueFolder(gui) {
    const folder = gui.addFolder("Blue");

    addController(folder, S.tuning.blue, "wakePull", 0, 0.02, 0.0001).name("Wake pull");
    addController(folder, S.tuning.blue, "downstreamCarry", 0, 0.02, 0.0001).name("Downstream carry");
    addController(folder, S.tuning.blue, "damping", 0.85, 0.999, 0.0005).name("Damping");
    addController(folder, S.tuning.blue, "randomJitter", 0, 0.01, 0.0001).name("Random jitter");
    addController(folder, S.tuning.blue, "patternSpeed", 0, 0.005, 0.00005).name("Pattern speed");

    return folder;
  }

  function buildPurpleFolder(gui) {
    const folder = gui.addFolder("Purple");

    addController(folder, S.tuning.purple, "pushOther", 0, 0.12, 0.001).name("Push others");
    addController(folder, S.tuning.purple, "leashBase", 0, 0.03, 0.0005).name("Leash base");
    addController(folder, S.tuning.purple, "leashInner", 0, 0.03, 0.0005).name("Leash inner");
    addController(folder, S.tuning.purple, "swirlInner", 0, 0.05, 0.0005).name("Inner swirl");
    addController(folder, S.tuning.purple, "swirlBase", 0, 0.05, 0.0005).name("Swirl base");
    addController(folder, S.tuning.purple, "edgeSwirl", 0, 0.03, 0.0005).name("Edge swirl");
    addController(folder, S.tuning.purple, "tendrilPush", 0, 0.05, 0.0005).name("Tendril push");
    addController(folder, S.tuning.purple, "sideWobble", 0, 0.03, 0.0005).name("Side wobble");
    addController(folder, S.tuning.purple, "damping", 0.85, 0.999, 0.0005).name("Damping");
    addController(folder, S.tuning.purple, "maxSpeed", 0.2, 3, 0.01).name("Max speed");

    return folder;
  }

  function buildDebugFolder(gui) {
    const folder = gui.addFolder("Debug");

    addController(folder, S.tuning.debug, "enabled").name("Enabled").onChange(applyTuningToRuntime);
    addController(folder, S.tuning.debug, "showOverlay").name("Show overlay").onChange(applyTuningToRuntime);
    addController(folder, S.tuning.debug, "logInit").name("Log init").onChange(applyTuningToRuntime);
    addController(folder, S.tuning.debug, "logFrameStats").name("Log frame stats").onChange(applyTuningToRuntime);
    addController(folder, S.tuning.debug, "frameSampleRate", 1, 120, 1).name("Frame sample").onChange(applyTuningToRuntime);
    addController(folder, S.tuning.debug, "stopOnInvalidParticle").name("Stop on invalid").onChange(applyTuningToRuntime);

    return folder;
  }

  function buildGuiControls(container) {
    const gui = createGuiRoot(container);

    buildSimFolder(gui);
    buildCompositionFolder(gui);
    buildTealFolder(gui);
    buildBlueFolder(gui);
    buildPurpleFolder(gui);
    buildDebugFolder(gui);

    return gui;
  }

  // ============================
  // boot
  // ============================

  initializeTuningState();
  applyTuningToRuntime();

  const ui = buildDockShell();
  setupDockBehavior(ui);

  const gui = buildGuiControls(ui.guiMount);

  bindActionButtons();
  bindKeyboardShortcuts();
  setupInteractionGuards(ui, gui);

  updatePauseButton();
  applyTuningToRuntime();

  console.log("[OilSpill:gui] ready");
})();