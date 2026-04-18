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

   v0.0.9.5 commit 4:
     - `efficientConsumption` migrates off scrip-purchasable to nu t20
       (display renamed to 'drip-feed integration'). Retro-grant in
       persistence.js ratchets nu to t20 for saves that already own it.
     - Gear-shaped rename pass (6 id-stable display-name changes):
         cargoWeight 'pack mule rig' -> 'molly netting'
         efficientConsumption 'efficient consumption' -> 'drip-feed integration'
         sandalEfficiency 'sandalweed poultice' -> 'interwoven lashing'
         steadyFeet 'steady feet' -> 'traction cleats'
         weatherRadioT2 'weather map' -> 'forecast radar'
         scavengerEye 'scavenger's eye' -> 'pocket binoculars'
     - 14 new trust-reward upgrades land across the 6 new NPCs + xi t40
       (scannerT2) + psi t40 (topographicMap). Upgrades that hook into
       systems shipping this patch (battery, canteen, scanner) have real
       apply() effects. Upgrades that hook into v0.0.9.6 systems
       (mountains, plateaus, rivers, terrain) ship as flag-only — the
       boolean in S.upgrades.<id> flips true, effect code lives in .6.

   `apply` closures mutate state when the upgrade is granted —
   that's why this data file imports S.

   Tier structure:
     t20 — first gift from every NPC
     t40 — second gift from rho, iota, tau, phi, xi, psi + new 6
     t60 — global battery charging (not a trustReward entry;
            handled directly in main.js node-arrival).
            Future t60 gifts (lambda's climbing gloves / walking stick)
            on deck for v0.0.9.9+.
   ============================================== */
'use strict';

import { S } from '../state.js';
import * as C from '../constants.js';
import { updateWeatherGearVisibility } from '../weather.js';

export const UPGRADE_DEFS = [
  // ----- scrip-purchasable (no trustReward) -----
  // v0.0.9.5: efficientConsumption migrated off this list to nu t20.
  { id:'bootsT1',     name:'sturdy boots',      desc:'+25% boot durability',          cost:30,  requires:null,          apply:()=>{} },
  { id:'bootClip2',   name:'extended clip',      desc:'carry 2 spare pairs of boots',  cost:100, requires:'bootClip1',   apply:()=>{ S.bootClipMax=2; S.bootClipCount=Math.min(2,S.bootClipCount+1); } },
  { id:'cargoSling',  name:'cargo sling',        desc:'+2 carry slots',                cost:80,  requires:null,          apply:()=>{ S.maxSlots+=2; } },
  { id:'cargoPack',   name:'expedition pack',    desc:'+4 more carry slots',           cost:180, requires:'cargoSling',  apply:()=>{ S.maxSlots+=4; } },
  { id:'cargoWeight', name:'molly netting',      desc:'+5 kg capacity',                cost:150, requires:null,          apply:()=>{ S.maxWeight+=5; } },
  { id:'stickyGun',   name:'sticky gun',         desc:'+range pickup, 8 shots, refill at H, takes 1 slot', cost:100, requires:null, apply:()=>{ S.stickyGun = { ammo: C.STICKY_GUN_AMMO_MAX, ammoMax: C.STICKY_GUN_AMMO_MAX, holstered: false }; } },

  // ----- trust-reward: rho (A) — boot depot -----
  { id:'bootClip1',   name:'boot clip',          desc:'carry 1 spare pair of boots',   cost:0, requires:null,          trustReward: { npc:'A', tier:'t20' }, apply:()=>{ S.bootClipMax=1; S.bootClipCount=1; } },
  { id:'bootsT2',     name:'reinforced soles',   desc:'+50% boot durability',          cost:0, requires:'bootsT1',     trustReward: { npc:'A', tier:'t40' }, apply:()=>{} },

  // ----- trust-reward: iota (B) — wetlands ecology -----
  { id:'sandalSatchel',    name:'sandalweed satchel',  desc:'hoard cap 5 \u2192 25',                    cost:0, requires:null, trustReward: { npc:'B', tier:'t20' }, apply:()=>{} },
  { id:'sandalEfficiency', name:'interwoven lashing',  desc:'sandalweed repair 30 \u2192 50 durability', cost:0, requires:null, trustReward: { npc:'B', tier:'t40' }, apply:()=>{} },

  // ----- trust-reward: tau (H) — your sibling -----
  { id:'steadyFeet',    name:'traction cleats',  desc:'-30% trip chance, +15% catch',                  cost:0, requires:null,        trustReward: { npc:'H', tier:'t20' }, apply:()=>{} },
  { id:'stickyHolster', name:'gun holster',      desc:'frees the slot when not firing',                cost:0, requires:'stickyGun', trustReward: { npc:'H', tier:'t40' }, apply:()=>{ if (S.stickyGun) S.stickyGun.holstered = true; } },

  // ----- trust-reward: phi (?) — weather station -----
  { id:'weatherRadio',   name:'weather radio',  desc:'storm warnings with intensity prediction',       cost:0, requires:null,           trustReward: { npc:'?', tier:'t20' }, apply:()=>{ S.weatherRadio = { unlocked: true, level: 1 }; updateWeatherGearVisibility(); } },
  { id:'weatherRadioT2', name:'forecast radar', desc:'storm tracking on the route map',               cost:0, requires:'weatherRadio', trustReward: { npc:'?', tier:'t40' }, apply:()=>{ if (S.weatherRadio) S.weatherRadio.level = 2; updateWeatherGearVisibility(); } },

  // ----- trust-reward: xi (C) — ruins researcher -----
  { id:'scannerT1', name:'terrain scanner', desc:'auto pings reduce trip chance, manual on 30s',           cost:0, requires:null,       trustReward: { npc:'C', tier:'t20' }, apply:()=>{ S.scanner.unlocked = true; S.scanner.level = 1; S.scanner.autoTimer = C.SCANNER_AUTO_INTERVAL_TICKS; } },
  { id:'scannerT2', name:'signal dish',     desc:'ping buff magnitude \u2191 + auto interval \u2193',      cost:0, requires:'scannerT1', trustReward: { npc:'C', tier:'t40' }, apply:()=>{ S.scanner.level = 2; } },

  // ----- trust-reward: psi (\u00b7) — oasis waypoint guardian -----
  { id:'scavengerEye',   name:'pocket binoculars', desc:'packages respawn faster, lost cargo more common', cost:0, requires:null,           trustReward: { npc:'\u00b7', tier:'t20' }, apply:()=>{} },
  { id:'topographicMap', name:'topographic map',   desc:'rim + interior terrain at a glance',              cost:0, requires:null,           trustReward: { npc:'\u00b7', tier:'t40' }, apply:()=>{} },

  // ----- trust-reward: nu (\u03bd) — desert purification plant -----
  // efficientConsumption migrated here from scrip-purchasable. Display
  // renamed to drip-feed integration. Mechanic unchanged (60% canteen
  // drain multiplier in stamina.js reads S.upgrades.efficientConsumption).
  { id:'efficientConsumption', name:'drip-feed integration', desc:'-40% canteen drain per drink',           cost:0, requires:null, trustReward: { npc:'\u03bd', tier:'t20' }, apply:()=>{} },
  { id:'reservoirTank',        name:'reservoir tank',        desc:'canteen capacity +50% + passive fill',   cost:0, requires:null, trustReward: { npc:'\u03bd', tier:'t40' }, apply:()=>{ S.canteenMax = Math.floor(S.canteenMax * 1.5); } },

  // ----- trust-reward: theta (\u03b8) — riverbed kiln / potter -----
  // Both hook into v0.0.9.6 systems (river cells, fragile-in-water
  // damage immunity). Ship as flag-only for commit 4; .6 wires effects.
  { id:'riverWaders', name:'river waders', desc:'reduced trip chance when wading (v0.0.9.6)',                                   cost:0, requires:null, trustReward: { npc:'\u03b8', tier:'t20' }, apply:()=>{} },
  { id:'ceramicWrap', name:'ceramic wrap', desc:'fragile pkgs absorb +1 hit + no water damage on crossings (v0.0.9.6 hook)',    cost:0, requires:null, trustReward: { npc:'\u03b8', tier:'t40' }, apply:()=>{} },

  // ----- trust-reward: gamma (\u03b3) — rocky hillside workshop -----
  // Mobile carrier is a v0.0.9.6 deployable. Flag-only here.
  { id:'mobileCarrier1', name:'mobile carrier', desc:'wheeled carrier; folds into large cargo when stowed (v0.0.9.6)',                     cost:0, requires:null,              trustReward: { npc:'\u03b3', tier:'t20' }, apply:()=>{} },
  { id:'mobileCarrier2', name:'improved tie-downs', desc:'+capacity/battery/traction; folds into medium cargo; wetland/river/mountain (v0.0.9.6)', cost:0, requires:'mobileCarrier1', trustReward: { npc:'\u03b3', tier:'t40' }, apply:()=>{} },

  // ----- trust-reward: lambda (\u03bb) — mountain climbing lodge -----
  // Both hook into v0.0.9.6 gear-placement system. Flag-only here.
  { id:'mountainGear',     name:'mountain gear',     desc:'ladder + anchor durability \u00d72 (v0.0.9.6)',                  cost:0, requires:null,                trustReward: { npc:'\u03bb', tier:'t20' }, apply:()=>{} },
  { id:'improvedTieDowns', name:'improved tie-downs', desc:'chance to withstand a hit; cargo retention on hit (v0.0.9.6)',  cost:0, requires:null,                trustReward: { npc:'\u03bb', tier:'t40' }, apply:()=>{} },

  // ----- trust-reward: pi (\u03c0) — summit radio-tower researcher -----
  // Exoskeleton hooks into battery (shipping in this patch) + mountain
  // cells (v0.0.9.6). Flag-only here; .6 wires the stamina / terrain
  // multipliers. Drain hook can land in .6 alongside the gear effects.
  { id:'exoskeleton1', name:'exoskeleton',              desc:'speed or all-terrain variant; consumes battery (v0.0.9.6)',        cost:0, requires:null,           trustReward: { npc:'\u03c0', tier:'t20' }, apply:()=>{} },
  { id:'exoskeleton2', name:'improved exoskeleton', desc:'combined speed + all-terrain + extended battery life (v0.0.9.6)',      cost:0, requires:'exoskeleton1', trustReward: { npc:'\u03c0', tier:'t40' }, apply:()=>{} },

  // ----- trust-reward: delta (\u03b4) — reservoir engineer -----
  // Both hook directly into the battery baseline (commit 3). Apply
  // flags read by main.js solar-regen tick: solar panel multiplies peak
  // regen + adds a desert-cell bonus (v0.0.9.6 terrain-tagged);
  // rainfall turbine opens a rain-weighted regen channel during storms.
  { id:'solarPanel',     name:'advanced solar panel', desc:'solar regen \u2191; desert cells boost further (v0.0.9.6 bonus)',  cost:0, requires:null,         trustReward: { npc:'\u03b4', tier:'t20' }, apply:()=>{} },
  { id:'rainfallTurbine', name:'rainfall turbine',     desc:'battery regen during rain, scaled by storm intensity',            cost:0, requires:'solarPanel', trustReward: { npc:'\u03b4', tier:'t40' }, apply:()=>{} },
];
