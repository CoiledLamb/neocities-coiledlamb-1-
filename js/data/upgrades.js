/* ==============================================
   THE LONG HAUL — upgrade definitions

   10 upgrades. `apply` closures mutate state when
   the upgrade is purchased — that's why this data
   file imports S (unusual for a data file, but
   cleaner than a separate dispatch table).

   Verbatim extract from main.js (commit 3 / SHA 077f9e8).
   ============================================== */
'use strict';

import { S } from '../state.js';

export const UPGRADE_DEFS = [
  { id:'bootsT1',     name:'sturdy boots',      desc:'+25% boot durability',          cost:30,  requires:null,          apply:()=>{} },
  { id:'bootsT2',     name:'reinforced soles',   desc:'+50% boot durability',          cost:90,  requires:'bootsT1',     apply:()=>{} },
  { id:'bootClip1',   name:'boot clip',          desc:'carry 1 spare pair of boots',   cost:40,  requires:null,          apply:()=>{ S.bootClipMax=1; S.bootClipCount=1; } },
  { id:'bootClip2',   name:'extended clip',      desc:'carry 2 spare pairs of boots',  cost:100, requires:'bootClip1',   apply:()=>{ S.bootClipMax=2; S.bootClipCount=Math.min(2,S.bootClipCount+1); } },
  { id:'steadyFeet',  name:'steady feet',        desc:'-30% trip chance, +15% catch',  cost:120, requires:null,          apply:()=>{} },
  { id:'cargoSling',  name:'cargo sling',        desc:'+2 carry slots',                cost:80,  requires:null,          apply:()=>{ S.maxSlots+=2; } },
  { id:'cargoPack',   name:'expedition pack',    desc:'+3 more carry slots',           cost:180, requires:'cargoSling',  apply:()=>{ S.maxSlots+=3; } },
  { id:'cargoWeight', name:'pack mule rig',      desc:'+5 kg capacity',                cost:150, requires:null,          apply:()=>{ S.maxWeight+=5; } },
  { id:'efficientConsumption', name:'efficient consumption', desc:'-40% canteen drain per drink', cost:120, requires:null, apply:()=>{} },
  { id:'sandalSatchel', name:'sandalweed satchel', desc:'hoard cap 5 \u2192 25', cost:60, requires:null, apply:()=>{} },
];
