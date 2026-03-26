(function () {
  const S = window.OilSpill;
  const G = window.OilSpillGui;

  function assertEnvironment() {
    if (!S) {
      console.warn("[OilSpill:gui] OilSpill runtime not found.");
      return false;
    }

    if (!window.lil || !window.lil.GUI) {
      console.warn("[OilSpill:gui] lil-gui not found.");
      return false;
    }

    if (!G) {
      console.warn("[OilSpill:gui] OilSpillGui namespace not found.");
      return false;
    }

    const required = [
      "initializeTuningState",
      "applyTuningToRuntime",
      "buildDockShell",
      "setupDockBehavior",
      "buildGuiControls",
      "bindActionButtons",
      "bindKeyboardShortcuts",
      "setupInteractionGuards",
      "updatePauseButton"
    ];

    for (const key of required) {
      if (typeof G[key] !== "function") {
        console.warn(`[OilSpill:gui] Missing gui module function: ${key}`);
        return false;
      }
    }

    return true;
  }

  if (!assertEnvironment()) return;

  G.initializeTuningState();
  G.applyTuningToRuntime();

  const ui = G.buildDockShell();
  G.setupDockBehavior(ui);

  const gui = G.buildGuiControls(ui.guiMount);

  G.bindActionButtons();
  G.bindKeyboardShortcuts();
  G.setupInteractionGuards(ui, gui);

  G.updatePauseButton();
  G.applyTuningToRuntime();

  console.log("[OilSpill:gui] ready");
})();