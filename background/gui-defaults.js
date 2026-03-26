(function () {
  const G = (window.OilSpillGui = window.OilSpillGui || {});

  G.injectDockStyles = function injectDockStyles() {
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
      .lab-sidebar,
      #lab-dock {
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
        padding-top: 2px;
      }

      #oilspill-dock .oil-to-top {
        width: 100%;
        text-align: center;
        opacity: 0;
        pointer-events: none;
        transform: translateY(4px);
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
  };

  function ensureActionButton(id, text) {
    let button = document.getElementById(id);

    if (!button) {
      button = document.createElement("button");
      button.id = id;
      button.type = "button";
      button.textContent = text;
    }

    button.classList.add("glass-button");
    return button;
  }

  function ensureStatusElement() {
    let status = document.getElementById("lab-status");

    if (!status) {
      status = document.createElement("div");
      status.id = "lab-status";
      status.textContent = "Lab booting...";
    }

    status.classList.add("status");
    return status;
  }

  G.buildDockShell = function buildDockShell() {
    G.injectDockStyles();

    let dock = document.getElementById("oilspill-dock");
    if (dock) {
      return {
        dock,
        scroll: dock.querySelector(".oil-dock-scroll"),
        guiMount: dock.querySelector("#oilspill-gui-mount"),
        toTopBtn: dock.querySelector("#oilspill-to-top"),
        toggleBtn: dock.querySelector("#oilspill-dock-toggle")
      };
    }

    const existingStatus = ensureStatusElement();
    const regenBtn = ensureActionButton("regen-btn", "Regenerate");
    const pauseBtn = ensureActionButton("pause-btn", "Pause");
    const resetBtn = ensureActionButton("reset-btn", "Reset Defaults");

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
              Quick actions:
              <span class="oil-dock-kbd">R</span> regenerate,
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

    actionGrid.appendChild(regenBtn);
    actionGrid.appendChild(pauseBtn);
    actionGrid.appendChild(resetBtn);
    statusSlot.appendChild(existingStatus);

    const oldHud = document.getElementById("lab-hud");
    if (oldHud) oldHud.setAttribute("aria-hidden", "true");

    return {
      dock,
      scroll: dock.querySelector(".oil-dock-scroll"),
      guiMount: dock.querySelector("#oilspill-gui-mount"),
      toTopBtn: dock.querySelector("#oilspill-to-top"),
      toggleBtn: dock.querySelector("#oilspill-dock-toggle")
    };
  };

  G.setupDockBehavior = function setupDockBehavior(ui) {
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

    if (!toggleBtn.dataset.oilspillBound) {
      toggleBtn.dataset.oilspillBound = "1";
      toggleBtn.addEventListener("click", () => {
        dock.classList.toggle("is-collapsed");
        syncToggleState();
      });
    }

    if (!scroll.dataset.oilspillBound) {
      scroll.dataset.oilspillBound = "1";
      scroll.addEventListener("scroll", updateToTopVisibility, { passive: true });
    }

    if (toTopBtn && !toTopBtn.dataset.oilspillBound) {
      toTopBtn.dataset.oilspillBound = "1";
      toTopBtn.addEventListener("click", () => {
        scroll.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    syncToggleState();
    updateToTopVisibility();
  };
})();