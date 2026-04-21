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

import { S } from '../state.js?v=096-10-19';
import * as C from '../constants.js?v=096-10-19';
import { updateWeatherGearVisibility } from '../weather.js?v=096-10-19';
import { drawRouteMap } from '../render/route-map.js?v=096-10-19';

export const UPGRADE_DEFS = [
  // ============================================================
  // Open scrip shop (no trust gate)
  // ============================================================
  // v0.0.9.6.10.3 reorder: domain-grouped — boots chain, then
  // traction, then cargo-slots, then cargo-weight. bootsT2 was
  // previously orphaned at index 7 after its v0.0.9.6.9.7 move
  // from rho t40; now sits directly after bootsT1.

  // ----- boots -----
  { id:'bootsT1',     name:'sturdy boots',       desc:'+25% boot durability',          cost:30,  requires:null,          apply:()=>{} },
  { id:'bootsT2',     name:'reinforced soles',   desc:'+50% boot durability',          cost:90,  requires:'bootsT1',     apply:()=>{} },

  // ----- traction -----
  // v0.0.9.5.3 — steadyFeet moved FROM tau t20 TO open shop.
  { id:'steadyFeet',  name:'traction cleats',    desc:'-30% strain buildup, +15% catch', cost:120, requires:null,        apply:()=>{} },

  // ----- cargo slots -----
  { id:'cargoSling',  name:'cargo sling',        desc:'+2 carry slots',                cost:60,  requires:null,          apply:()=>{ S.maxSlots+=2; } },
  { id:'cargoPack',   name:'expedition pack',    desc:'+4 more carry slots',           cost:100, requires:'cargoSling',  apply:()=>{ S.maxSlots+=4; } },

  // ----- cargo weight -----
  // v0.0.9.6.9.4 — molly netting split into two scrip entries for
  // early-scrip relief (+2 starter / +4 follow-on; 60/100c).
  { id:'cargoWeight',  name:'molly netting',     desc:'+2 kg capacity',                cost:60,  requires:null,          apply:()=>{ S.maxWeight+=2; } },
  { id:'cargoWeight2', name:'pack mule kit',     desc:'+4 more kg capacity',           cost:100, requires:'cargoWeight', apply:()=>{ S.maxWeight+=4; } },

  // ============================================================
  // Trust rewards — visit order from tau (player home), clockwise
  // ============================================================
  // v0.0.9.6.10.3 reorder: matches NPC_VISIT_ORDER in npc-defs.js so
  // this shop list + the settlements panel share the same sequence.
  // Player starts at tau (edgeIdx 10, dotT 0) and walks clockwise,
  // so tau comes first, then rho, nu, psi, iota, theta, phi, gamma,
  // xi, delta, lambda, pi.

  // ----- tau (H) — home / your sibling -----
  // v0.0.9.5.3: traction cleats moved to open scrip shop; sticky
  // gun arrives here at the same 100¢ price (trust-gated).
  { id:'stickyGun',     name:'sticky gun',       desc:'+range pickup, 8 shots, refill at H, takes 1 slot', cost:100, requires:null,        trustReward: { npc:'H', tier:'t20' }, apply:()=>{ S.stickyGun = { ammo: C.STICKY_GUN_AMMO_MAX, ammoMax: C.STICKY_GUN_AMMO_MAX, holstered: false }; } },
  { id:'stickyHolster', name:'gun holster',      desc:'frees the slot when not firing',                    cost:80,  requires:'stickyGun', trustReward: { npc:'H', tier:'t40' }, apply:()=>{ if (S.stickyGun) S.stickyGun.holstered = true; } },

  // ----- rho (A) — boot depot -----
  // v0.0.9.6.9.7 — rho owns the full boot-clip chain (bootClip1 t20 +
  // bootClip2 t40). bootsT2 moved to open scrip shop.
  { id:'bootClip1',   name:'boot clip',          desc:'carry 1 spare pair of boots',   cost:40,  requires:null,        trustReward: { npc:'A', tier:'t20' }, apply:()=>{ S.bootClipMax=1; S.bootClipCount=1; } },
  { id:'bootClip2',   name:'extended clip',      desc:'carry 2 spare pairs of boots',  cost:100, requires:'bootClip1', trustReward: { npc:'A', tier:'t40' }, apply:()=>{ S.bootClipMax=2; S.bootClipCount=Math.min(2,S.bootClipCount+1); } },

  // ----- nu (\u03bd) — desert purification plant -----
  // efficientConsumption migrated here from scrip-purchasable in v0.0.9.5
  // commit 4; display renamed to drip-feed integration.
  { id:'efficientConsumption', name:'drip-feed integration', desc:'-40% canteen drain per drink',           cost:120, requires:null, trustReward: { npc:'\u03bd', tier:'t20' }, apply:()=>{} },
  { id:'reservoirTank',        name:'reservoir tank',        desc:'canteen capacity +50% + passive fill',   cost:120, requires:null, trustReward: { npc:'\u03bd', tier:'t40' }, apply:()=>{ S.canteenMax = Math.floor(S.canteenMax * 1.5); } },

  // ----- psi (\u00b7) — oasis waypoint guardian -----
  { id:'scavengerEye',   name:'pocket binoculars', desc:'packages respawn faster, lost cargo more common', cost:80,  requires:null,           trustReward: { npc:'\u00b7', tier:'t20' }, apply:()=>{} },
  { id:'topographicMap', name:'topographic map',   desc:'rim + interior terrain at a glance',              cost:150, requires:null,           trustReward: { npc:'\u00b7', tier:'t40' }, apply:()=>{ drawRouteMap(); } },

  // ----- iota (B) — wetlands ecology -----
  { id:'sandalSatchel',    name:'sandalweed satchel',  desc:'hoard cap 5 \u2192 25',                    cost:60, requires:null, trustReward: { npc:'B', tier:'t20' }, apply:()=>{} },
  { id:'sandalEfficiency', name:'interwoven lashing',  desc:'sandalweed repair 30 \u2192 50 durability', cost:60, requires:null, trustReward: { npc:'B', tier:'t40' }, apply:()=>{} },

  // ----- theta (\u03b8) — riverbed kiln / potter -----
  { id:'riverWaders', name:'river waders', desc:'slows strain buildup when wading',                                  cost:80,  requires:null, trustReward: { npc:'\u03b8', tier:'t20' }, apply:()=>{} },
  { id:'ceramicWrap', name:'ceramic wrap', desc:'fragile pkgs absorb +1 hit + no water damage on crossings',         cost:100, requires:null, trustReward: { npc:'\u03b8', tier:'t40' }, apply:()=>{} },

  // ----- phi (?) — weather station -----
  { id:'weatherRadio',   name:'weather radio',  desc:'storm warnings with intensity prediction',       cost:120, requires:null,           trustReward: { npc:'?', tier:'t20' }, apply:()=>{ S.weatherRadio = { unlocked: true, level: 1 }; updateWeatherGearVisibility(); } },
  { id:'weatherRadioT2', name:'forecast radar', desc:'storm tracking on the route map',                cost:180, requires:'weatherRadio', trustReward: { npc:'?', tier:'t40' }, apply:()=>{ if (S.weatherRadio) S.weatherRadio.level = 2; updateWeatherGearVisibility(); } },

  // ----- gamma (\u03b3) — rocky hillside workshop -----
  // Mobile carrier: v0.0.9.6 deployable wheeled cart. Level 2
  // renamed v0.0.9.6.9.30.2 from 'improved tie-downs' → 'reinforced
  // chassis' to avoid a display-name collision with lambda's t40.
  { id:'mobileCarrier1', name:'mobile carrier',      desc:'wheeled cart \u2014 +4 slots / +4 kg when deployed; folds into large cargo when stowed; consumes battery',                        cost:150, requires:null,              trustReward: { npc:'\u03b3', tier:'t20' }, apply:()=>{
      S.carrier.unlocked = true;
      S.carrier.level = 1;
      // v0.0.9.6.9.30j — UI + routing live, new cart arrives rolling.
      S.carrier.deployed = true;
      S.carrier.autoDeployArmed = false;
      S.carrier.safeTerrainTicks = 0;
  } },
  { id:'mobileCarrier2', name:'reinforced chassis', desc:'cart capacity +6 slots / +8 kg; folds into medium cargo; rolls across wetland/river/mountain; better battery',                     cost:200, requires:'mobileCarrier1', trustReward: { npc:'\u03b3', tier:'t40' }, apply:()=>{
      S.carrier.unlocked = true;
      S.carrier.level = 2;
  } },

  // ----- xi (C) — ruins researcher -----
  { id:'scannerT1', name:'terrain scanner', desc:'auto pings slow strain buildup, manual on 30s',          cost:100, requires:null,       trustReward: { npc:'C', tier:'t20' }, apply:()=>{ S.scanner.unlocked = true; S.scanner.level = 1; S.scanner.autoTimer = C.SCANNER_AUTO_INTERVAL_TICKS; } },
  { id:'scannerT2', name:'signal dish',     desc:'ping buff magnitude \u2191 + auto interval \u2193',      cost:120, requires:'scannerT1', trustReward: { npc:'C', tier:'t40' }, apply:()=>{ S.scanner.level = 2; } },

  // ----- delta (\u03b4) — reservoir engineer -----
  // Both hook directly into the battery baseline (v0.0.9.6 commit 3):
  // solar panel multiplies peak regen + adds a desert-cell bonus;
  // rainfall turbine opens a rain-weighted regen channel during storms.
  { id:'solarPanel',      name:'advanced solar panel', desc:'solar regen \u2191; desert cells boost further',                  cost:100, requires:null,         trustReward: { npc:'\u03b4', tier:'t20' }, apply:()=>{} },
  { id:'rainfallTurbine', name:'rainfall turbine',     desc:'battery regen during rain, scaled by storm intensity',            cost:120, requires:'solarPanel', trustReward: { npc:'\u03b4', tier:'t40' }, apply:()=>{} },

  // ----- lambda (\u03bb) — mountain climbing lodge -----
  // Both hook into the gear-placement system. mountainGear is read
  // by gear.js::placeEntry at placement time, baking 24h lifetime
  // into the placed entry for all viewers. improvedTieDowns (wired
  // v0.0.9.6.9.30.2) adds a hold-chance inside the tie-down absorb
  // branch in trip.js::maybeTrip.
  { id:'mountainGear',     name:'mountain gear',      desc:'ladder + anchor durability \u00d72',                                 cost:60,  requires:null, trustReward: { npc:'\u03bb', tier:'t20' }, apply:()=>{} },
  { id:'improvedTieDowns', name:'improved tie-downs', desc:'manual tie-down has a chance to stay armed after absorbing a trip',  cost:100, requires:null, trustReward: { npc:'\u03bb', tier:'t40' }, apply:()=>{} },

  // ----- pi (\u03c0) — summit radio-tower researcher -----
  // Battery-gated. At 0 charge the bonus goes cold but the flag
  // stays set ("graceful off" — see trip.js + main.js speed advance).
  { id:'exoskeleton1', name:'exoskeleton',          desc:'all-terrain \u2014 strain buildup \u00d70.80 on mountain / rocky hills / river; consumes battery',              cost:150, requires:null,           trustReward: { npc:'\u03c0', tier:'t20' }, apply:()=>{ S.exoskeleton.unlocked = true; S.exoskeleton.level = 1; } },
  { id:'exoskeleton2', name:'improved exoskeleton', desc:'+15% walk speed, extended battery life; lvl 1 mitigation retained',                                              cost:200, requires:'exoskeleton1', trustReward: { npc:'\u03c0', tier:'t40' }, apply:()=>{ S.exoskeleton.unlocked = true; S.exoskeleton.level = 2; } },
];
