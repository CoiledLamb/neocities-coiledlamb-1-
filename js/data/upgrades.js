/* ==============================================
   THE LONG HAUL — upgrade definitions

   v0.0.8.6: upgrades split into two pools.
     - Scrip-purchasable: bootsT1, bootClip2, cargoSling, cargoPack,
       cargoWeight, efficientConsumption, stickyGun.
     - Trust-reward: granted automatically when NPC trust crosses
       the threshold in trustReward.tier. 6 migrated from scrip,
       3 new (weatherRadio, sandalEfficiency, scavengerEye).
       upgrades.js filters these out of the scrip menu;
       trust.js::onTrustUnlock auto-grants them.

   `apply` closures mutate state when the upgrade is granted —
   that's why this data file imports S.

   Tier structure:
     t20 — first gift from every NPC
     t40 — second gift from rho, iota, tau
     t60 — global battery charging (not a trustReward entry;
            handled directly in main.js node-arrival)
   ============================================== */
'use strict';

import { S } from '../state.js';
import * as C from '../constants.js';
import { updateWeatherGearVisibility } from '../weather.js';

export const UPGRADE_DEFS = [
  // ----- scrip-purchasable (no trustReward) -----
  { id:'bootsT1',     name:'sturdy boots',      desc:'+25% boot durability',          cost:30,  requires:null,          apply:()=>{} },
  { id:'bootClip2',   name:'extended clip',      desc:'carry 2 spare pairs of boots',  cost:100, requires:'bootClip1',   apply:()=>{ S.bootClipMax=2; S.bootClipCount=Math.min(2,S.bootClipCount+1); } },
  { id:'cargoSling',  name:'cargo sling',        desc:'+2 carry slots',                cost:80,  requires:null,          apply:()=>{ S.maxSlots+=2; } },
  { id:'cargoPack',   name:'expedition pack',    desc:'+4 more carry slots',           cost:180, requires:'cargoSling',  apply:()=>{ S.maxSlots+=4; } },
  { id:'cargoWeight', name:'pack mule rig',      desc:'+5 kg capacity',                cost:150, requires:null,          apply:()=>{ S.maxWeight+=5; } },
  { id:'efficientConsumption', name:'efficient consumption', desc:'-40% canteen drain per drink', cost:120, requires:null, apply:()=>{} },
  { id:'stickyGun',     name:'sticky gun',         desc:'+range pickup, 8 shots, refill at H, takes 1 slot', cost:100, requires:null,          apply:()=>{ S.stickyGun = { ammo: C.STICKY_GUN_AMMO_MAX, ammoMax: C.STICKY_GUN_AMMO_MAX, holstered: false }; } },

  // ----- trust-reward: rho (A) — boot depot -----
  { id:'bootClip1',   name:'boot clip',          desc:'carry 1 spare pair of boots',   cost:0, requires:null,          trustReward: { npc:'A', tier:'t20' }, apply:()=>{ S.bootClipMax=1; S.bootClipCount=1; } },
  { id:'bootsT2',     name:'reinforced soles',   desc:'+50% boot durability',          cost:0, requires:'bootsT1',     trustReward: { npc:'A', tier:'t40' }, apply:()=>{} },

  // ----- trust-reward: iota (B) — wetlands ecology -----
  { id:'sandalSatchel',    name:'sandalweed satchel',  desc:'hoard cap 5 \u2192 25',                    cost:0, requires:null, trustReward: { npc:'B', tier:'t20' }, apply:()=>{} },
  { id:'sandalEfficiency', name:'sandalweed poultice', desc:'sandalweed repair 30 \u2192 50 durability', cost:0, requires:null, trustReward: { npc:'B', tier:'t40' }, apply:()=>{} },

  // ----- trust-reward: tau (H) — your sibling -----
  { id:'steadyFeet',    name:'steady feet',      desc:'-30% trip chance, +15% catch',                  cost:0, requires:null,        trustReward: { npc:'H', tier:'t20' }, apply:()=>{} },
  { id:'stickyHolster', name:'gun holster',       desc:'frees the slot when not firing',                cost:0, requires:'stickyGun', trustReward: { npc:'H', tier:'t40' }, apply:()=>{ if (S.stickyGun) S.stickyGun.holstered = true; } },

  // ----- trust-reward: phi (?) — weather station -----
  { id:'weatherRadio',   name:'weather radio',   desc:'storm warnings with intensity prediction',       cost:0, requires:null,           trustReward: { npc:'?', tier:'t20' }, apply:()=>{ S.weatherRadio = { unlocked: true, level: 1 }; updateWeatherGearVisibility(); } },
  { id:'weatherRadioT2', name:'weather map',      desc:'storm tracking on the route map',               cost:0, requires:'weatherRadio', trustReward: { npc:'?', tier:'t40' }, apply:()=>{ if (S.weatherRadio) S.weatherRadio.level = 2; updateWeatherGearVisibility(); } },

  // ----- trust-reward: xi (C) — researcher -----
  { id:'scannerT1', name:'terrain scanner', desc:'auto pings reduce trip chance, manual on 30s', cost:0, requires:null, trustReward: { npc:'C', tier:'t20' }, apply:()=>{ S.scanner.unlocked = true; S.scanner.level = 1; S.scanner.autoTimer = C.SCANNER_AUTO_INTERVAL_TICKS; } },

  // ----- trust-reward: psi (\u00b7) — scavenger -----
  { id:'scavengerEye', name:"scavenger's eye", desc:'packages respawn faster, lost cargo more common', cost:0, requires:null, trustReward: { npc:'\u00b7', tier:'t20' }, apply:()=>{} },
];
