/* ==============================================
   THE LONG HAUL — package definitions

   NPC_PKGS: standard delivery cargo (medicine,
     seeds, letter, tools, rations, lumber).
   LOST_PKGS: orphaned cargo that broadcasts to
     the multiplayer feed when dropped.

   Verbatim extract from main.js (commit 3 / SHA 077f9e8).
   ============================================== */
'use strict';

export const NPC_PKGS = [
  { size:'s', label:'medicine',  kg:1, slots:1, scrip:12 },
  { size:'s', label:'seeds',     kg:1, slots:1, scrip:10 },
  { size:'s', label:'letter',    kg:1, slots:1, scrip:8  },
  { size:'m', label:'tools',     kg:2, slots:2, scrip:22 },
  { size:'m', label:'rations',   kg:2, slots:2, scrip:18 },
  { size:'l', label:'lumber',    kg:4, slots:4, scrip:45 },
];

export const LOST_PKGS = [
  { size:'s', label:'worn journal', kg:1, slots:1, scrip:18, isLost:true },
  { size:'m', label:'salvage kit',  kg:2, slots:2, scrip:30, isLost:true },
  { size:'s', label:'old photo',    kg:1, slots:1, scrip:14, isLost:true },
];
