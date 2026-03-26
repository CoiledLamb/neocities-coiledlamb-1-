(function () {
  const S = window.OilSpill;
  const G = (window.OilSpillGui = window.OilSpillGui || {});

  G.regenerateScene = function regenerateScene() {
    if (typeof S.rebuildScene === "function") {
      S.rebuildScene();
      return;
    }

    if (typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("oilslick:regenerate"));
    }
  };

  G.resetDefaults = function resetDefaults() {
    S.tuning = G.deepClone(G.defaultTuning);
    G.applyTuningToRuntime();
    G.refreshControllerDisplays();
    G.updatePauseButton();
    G.regenerateScene();
  };

  G.bindActionButtons = function bindActionButtons() {
    const regenBtn = document.getElementById("regen-btn");
    const pauseBtn = document.getElementById("pause-btn");
    const resetBtn = document.getElementById("reset-btn");

    if (regenBtn && !regenBtn.dataset.oilspillBound) {
      regenBtn.dataset.oilspillBound = "1";
      regenBtn.addEventListener("click", G.regenerateScene);
    }

    if (pauseBtn && !pauseBtn.dataset.oilspillBound) {
      pauseBtn.dataset.oilspillBound = "1";
      pauseBtn.addEventListener("click", G.togglePaused);
    }

    if (resetBtn && !resetBtn.dataset.oilspillBound) {
      resetBtn.dataset.oilspillBound = "1";
      resetBtn.addEventListener("click", G.resetDefaults);
    }
  };

  G.bindKeyboardShortcuts = function bindKeyboardShortcuts() {
    if (window.__oilspillKeyboardBound) return;
    window.__oilspillKeyboardBound = true;

    window.addEventListener("keydown", (event) => {
      if (event.target && /input|textarea|select/i.test(event.target.tagName)) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        G.togglePaused();
      }

      if (event.key === "r" || event.key === "R") {
        G.regenerateScene();
      }
    });
  };
})();