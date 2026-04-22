/* ==============================================
   THE LONG HAUL — node glyphs + status colors

   NODE_GLYPHS: two-line ASCII art shown by the
     destination drift indicator for each node.
   statusColor(): HUD status text color per game state,
     resolved lazily from the CSS palette tokens (so a
     future bone-theme switch picks up automatically).

   v0.0.9.6.9.30 — STATUS_COLORS object replaced by the
   statusColor() function so colors track the live palette
   instead of baking literals at module-load time.
   ============================================== */
'use strict';

import { tlhPalette } from '../palette.js?v=096-10-21';

export const NODE_GLYPHS = {
  'A':       '/--\\\n[_A_]',
  'B':       '/\\_/\\\n[_B_]',
  'H':       ' /\\ \n[HOME]',
  'C':       '=====\n[RNS]',
  '?':       ' ??? \n[ ? ]',
  '\u00b7':  '  !  \n =\u00b7= ',
};

/** HUD status text color for the current game state. Returns a
 *  hex string read from the CSS palette tokens — caller can pass
 *  the result straight to .style.color. Returns undefined for
 *  unknown statuses; consumer should fall back to its own default. */
export function statusColor(status) {
  const p = tlhPalette();
  switch (status) {
    case 'idle':       return p.crit;
    case 'walking':    return p.textSecondary;
    case 'carrying':   return p.accent;
    case 'delivering': return p.warn;
    case 'returning':  return p.textMid;
    case 'resting':    return p.crit;
    case 'tripped':    return p.crit;
    default:           return undefined;
  }
}
