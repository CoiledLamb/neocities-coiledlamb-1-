/* ==============================================
   THE LONG HAUL — node glyphs + status colors

   NODE_GLYPHS: two-line ASCII art shown by the
     destination drift indicator for each node.
   STATUS_COLORS: HUD status text color per game state.

   Verbatim extract from main.js (commit 3 / SHA 077f9e8).
   ============================================== */
'use strict';

export const NODE_GLYPHS = {
  'A':       '/--\\\n[_A_]',
  'B':       '/\\_/\\\n[_B_]',
  'H':       ' /\\ \n[HOME]',
  'C':       '=====\n[RNS]',
  '?':       ' ??? \n[ ? ]',
  '\u00b7':  '  !  \n =\u00b7= ',
};

export const STATUS_COLORS = {
  idle:       '#da8bda',
  walking:    '#7aa8a6',
  carrying:   '#77bfcf',
  delivering: '#9d78d4',
  returning:  '#4a7a78',
  resting:    '#da8bda',
  tripped:    '#da8bda',
};
