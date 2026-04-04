/* ==============================================
   LATTICE BACKGROUND — lattice.js
   3D perspective dot grid, fixed behind all content.
   Include on any page that needs the background.
   ============================================== */
'use strict';
(function () {

const SIDEBAR_W = 180;   // nav sidebar width in px
const FOCAL     = 500;   // perspective focal length
const SPACING_X = 160;   // horizontal dot spacing units
const SPACING_Y = 80;    // vertical dot spacing units
const LAYERS    = 10;    // number of depth layers
const GRID      = [-4.5, -3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5, 4.5];
const DOT_COLOR = '177,201,195'; // rgb — matches site text colour

const canvas = document.createElement('canvas');
canvas.id = 'lattice-bg';
canvas.style.cssText = [
  'position:fixed',
  'inset:0',
  'width:100%',
  'height:100%',
  'z-index:0',
  'pointer-events:none',
].join(';');
document.body.prepend(canvas);

// Ensure all existing body children sit above the canvas
const selectors = ['#boot', '#scanlines', '#site', 'nav', 'main', 'header'];
selectors.forEach(sel => {
  const el = document.querySelector(sel);
  if (el && !el.style.position) el.style.position = 'relative';
  if (el) el.style.zIndex = '1';
});

const ctx = canvas.getContext('2d');

function draw() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Vanishing point centred in content area (right of sidebar)
  const vpX = SIDEBAR_W + (canvas.width - SIDEBAR_W) / 2;
  const vpY = canvas.height / 2;

  for (let li = 0; li < LAYERS; li++) {
    const z       = (li + 1) * 80 * 1.4;
    const t       = li / (LAYERS - 1);
    const alpha   = (1 - t * 0.88) * 0.28;
    const dotSize = (1 - t) * 2.0 + 0.4;
    const s       = FOCAL / z;

    for (const xi of GRID) {
      for (const yi of GRID) {
        const px = vpX + xi * SPACING_X * s;
        const py = vpY + yi * SPACING_Y * s;
        ctx.fillStyle = `rgba(${DOT_COLOR},${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

draw();
window.addEventListener('resize', draw);

})();
