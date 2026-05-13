# the long haul — design bible
_a document for the developer, not the agents_

---

## what this is

This is a place to zoom out. Not a technical spec, not a handoff. Just a clear-eyed account of what The Long Haul is, what it's been through, and what makes it tick. For when you've been deep in the weeds for too long and need to remember the shape of the whole thing.

**Forward-looking scope** — patch sequence to 1.0, ship criteria, open design questions, deferred items — lives in [TLH-1.0.md](./TLH-1.0.md). This bible focuses on **what exists now** and **how we got here**.

---

## the game in one paragraph

The Long Haul is a post-post-apocalyptic idle courier game played in a browser. You are a porter walking a circular route between twelve settlements, carrying packages, building trust with the people at each stop, and slowly upgrading your kit. The world is a 2D plane — a ring road laid over real terrain — and other players are walking the same route asynchronously, building paths and leaving gear behind. It's quiet, unhurried, and full of small details that reward attention.

---

## core feel & philosophy

The contractual version of these — what won't change before 1.0 — lives in TLH-1.0.md → locked. Below is the descriptive version: how the game feels when you're playing it.

**Idle-game first.** The courier walks on their own. You set things up and check back in. No hard gates on traversal — gear makes things easier, never mandatory. Every cell is crossable without equipment, just with higher cost.

**Text as world.** ASCII characters aren't a limitation, they're the aesthetic. The `@` is you. The `^` is a mountain. The world is legible because it's written.

**The route is a cast.** Twelve NPCs, twelve voices, twelve flavors of relationship. Trust builds over time and unlocks things that feel like gifts, not purchases. Each stop has a personality.

**Async social presence.** You're never alone, but you're never interrupted. Other players' trails, placed gear, and pre-built structures are there when you arrive. Somebody dug those steps into the cliff. Somebody paved that shortcut.

**Post-post apocalypse means rebuilding.** Not survival horror. Not desperation. Things are hard but the worst is over. People are making pottery. Someone is restoring a dam. The orphan at the waystone has a collection of trinkets that travelers left.

---

## the world map

A 400×400 SVG viewport. The ring road forms a rounded square connecting 12 nodes. Four corners anchor the biome quadrants; two rim slots per side host NPCs.

```
              N side
         nu ──── psi ──── iota ──── theta
         │                              │
        rho                            phi
         │                              │
        tau  ◄ player start           gamma
         │                              │
         pi ──── lambda ── delta ──── xi
              S side
```

**Corner biomes:**
- NW (nu) — desert, water scarcity
- NE (theta) — riverbed, clay, craft
- SE (xi) — mesa plateau, ruins, weather station
- SW (pi) — summit, mountain research lab

**Quadrant feel:**
- North: desert edge → oasis waypoint → scrubby flatland → riverbed
- East: riverbed → mesa country → plateau ruins
- South: plateau ruins → mountain foothills → dam restoration
- West: dam → mountain slope → climbing lodge → desert edge

---

## the twelve NPCs

Trust thresholds: **t20** and **t40** unlock per-NPC gifts; **t60** enables free battery charging at trusted destinations; **t80** enables free rest (stamina + canteen, no scrip).

Per-NPC trust-profile system was retired in v0.0.9.6.10.17 — gain is uniform per delivery now, scaled by package slots (`1 + floor(slots/2)`).

| ID | Callsign | Location | Voice | t20 gift | t40 gift |
|----|----------|----------|-------|----------|----------|
| A | rho | depot | former porter, wizened advice | boot clip | extended clip |
| B | iota | greenhouse | 20s wetlands ecologist | sandalweed satchel | interwoven lashing |
| H | tau | home | your sibling, proud not overprotective | sticky gun | gun holster |
| ? | phi | weather station | stoic forecaster | weather radio | forecast radar |
| C | xi | city ruins | researcher in ruins, careful | terrain scanner | signal dish |
| · | psi | oasis | orphan scavenger | pocket binoculars | topographic map |
| ν | nu | treatment plant | guardian, cautious desert water-keeper | drip-feed integration | reservoir tank |
| θ | theta | kiln | artisan, nurturing potter | river waders | ceramic wrap |
| γ | gamma | workshop | debt-easer, tit-for-tat tinker | mobile carrier | reinforced chassis |
| λ | lambda | lodge | adventurer, gregarious | mountain gear | improved tie-downs |
| π | pi | radio tower | researcher, reclusive summit antisocial | exoskeleton | improved exoskeleton |
| δ | delta | reservoir | routine, tired-hopeful dam restorer | advanced solar panel | rainfall turbine |

All NPCs are nonbinary/agender. (Tau's dog is the one gendered exception.)

---

## core systems

### the courier loop
- Walks the ring automatically (idle-first)
- `S.dotT` (0→1) tracks position along current segment
- `S._transient.currentSegment` is the source of truth: ring segment, bezier shortcut, or river-drift
- Speed modified by stamina, terrain, strain
- Arriving at a node triggers delivery checks, NPC dialogue, outbound dispatch

### packages
- 4 sizes: s (1×1), m (2×1), l (2×2), xl (4×2) — footprint in the cargo grid
- Modifiers: fragile, lightweight, heavy, unwieldy (each changes slot count)
- ~373 authored labels, dest-tagged — each label knows which NPCs it can go between
- Delivery earns scrip + trust scaled by `1 + floor(slots/2)`
- Lost deliveries earn a small bonus trust; damaged earns delivery dialogue
- Fragile-first damage selection (v0.0.9.7.8): drop path stays uniform random, damage path biases onto fragile pkgs when any are in inventory

### cargo & kit
- 2-row CSS grid with bin-pack autosort
- Default 6 slots, upgradeable to 8 → 12
- Gun slot reserved bottom-right; tie-down toggle
- Kit bar: stamina drink, scanner, boots, battery — separate from cargo slots
- Cargo log (v0.0.9.7.1; slide-in drawer v0.0.9.7.2) — pending-discovery dot surfaces unseen items

### stamina & strain
- Stamina: 0–100, drains while walking, restores at rest or from drinks
- Strain: accumulates from terrain, load, weather; slows you. (Internal code names still use `tripChance` / `TRIP_MULT_*` — user-facing strings standardized to "strain buildup" in v0.0.9.6.10.14.)
- Canteen: refills at water sources, rains, wetland cells; capped by upgrade
- Overboost: stamina can briefly exceed 100 (overlay visual on the bar)

### trust
- Per-NPC values 0–100
- Earns through deliveries (weight-scaled), discoveries, outbound dispatch
- Unlocks: upgrades at t20/t40, free battery charge at t60, free rest at t80
- Gain is uniform per delivery (formula above); per-NPC profile system retired in v0.0.9.6.10.17

### weather & storms
- Storms are world objects with position, type, dual-gaussian shape
- Travel across the 2D interior over time
- Rendered as isobar contour lines on the route map (unlocked by weather radio L2)
- Affects: trip chance, stamina drain, gear decay, rain-channel regen
- Weather radio L1: storm prediction; L2: map visualization

### terrain
- Classified by `terrainAt(x, y)` — deterministic, stable across reloads
- Types: `flat`, `river`, `clayBed`, `mountain`, `rockyHills`, `plateau`, `desert`
- Each type has its own glyph pool, color, trip/stamina modifiers
- Mesa outcrops on ring edges engage the plateau climbing mechanics
- Interior mesas (NW desert region, v0.0.9.7.10) classify as plateau and engage climbing via shortcut
- `courierTerrain()` feeds real geography into the mechanics loop

### multiplayer (async)
- BroadcastChannel + server relay (Cloudflare Worker at `tlh/worker/`)
- Shared world objects: placed gear, trample trails, storm positions
- Every player sees every placed object (visibility sharding deferred to ~10+ active users)
- Canonical ID scheme: `${placerId}-${placedWallClock}-${ci}`
- Worker has its own version line (`v0.0.9.6.10.x`) and ships independently from the game

### persistence
- Save schema currently v9 (migrated v8→v9 during the v0.0.9 arc)
- Saved locally + export/import available; gzipped via `CompressionStream`
- `S._transient` is the non-persisted runtime layer (currentSegment, trail cells, hover state, etc.)
- Pre-v9 migration chain drops at 1.0 launch (forced fresh-start is acceptable; one-time simplification)

---

## patch history (the arc so far)

### v0.0.7 arc — foundations
The multiplayer infrastructure, identification system (stage 0→3 for each NPC/settlement), module refactor (monolith → 16 ES modules), scanner T1, sticky gun, battery prototype, UI passes for cargo and HUD. Long series of bugfix and polish sub-versions. Ended with a solid foundation to build mechanics on.

### v0.0.8 arc — mechanical depth
Three threads: packages, trust, weather.
- **v0.0.8.1** — Package rework: composable roller, dest-tagged label pool (~73 labels), size/modifier system
- **v0.0.8.2/3** — Cargo inventory rework: 2D grid with multi-cell shapes, modifier visuals
- **v0.0.8.4** — Identity patch: phi, xi, psi added. Delivery dialogue (5 conditions × 6 NPCs). NPC voice passes
- **v0.0.8.5** — Weight-scaled trust gain
- **v0.0.8.6** — Upgrade migration to trust rewards; 3 new gadgets; tier structure (t20/40/60/80)
- **v0.0.8.7** — Weather rework: spatial storms, dual-gaussian isobars, weather radio tiering
- **v0.0.8.8** — Bug audit + mobile compatibility

### v0.0.9 arc — the plane beneath the ring
Renderer upgrade + 2D world + terrain + NPC expansion.
- **v0.0.9.1** — Day/night cycle: sky layer with sun arc, moon phases, stars, gradient backdrop
- **v0.0.9.2** — Route map → 2D plane: square viewBox, interior texture, typewriter settlement reveal
- **v0.0.9.3** — Shortcut travel: bezier curves through interior, dotted trail, live tooltip with km/ETA, segment abstraction refactor
- **v0.0.9.3.1** — Overboost overlay polish
- **v0.0.9.4** — Package destination diversification (ring-distance-weighted); NPC outbound dispatch
- **v0.0.9.4.1** — Cursor pickup, drag-to-toss from cargo, ground tooltips
- **v0.0.9.5** — NPC expansion: 6-node hex → 12-node rounded square; 6 new NPCs with full dialogue (~280 lines); battery baseline (solar trickle, day/night sine curve); 13 new trust-reward upgrades; 232-label pool; save migration v7→v8
- **v0.0.9.6** — World patch: terrain types (rivers, mountains, plateau, rocky hills, desert, clayBed); ladder + anchor gear; world overlay + trails; trample system; storm sweep across interior; shortcut rewrite (per-cell terrain effects instead of flat multipliers); river drift segments; gear placement + decay
- **v0.0.9.6.9** — Simulation harness: 20-run batch produced balance data (canteen over-solved, boots too harsh, trust progression glacial, NPC equity uneven)
- **v0.0.9.6.10** — Polish + sim follow-ups: trust profile system retired (uniform-gain), trip-chance language audit (user-facing "strain buildup"), security hardening, worker boundary fixes, save schema v8→v9
- **v0.0.9.7** — Cargo log + topographic map presentation rework. Slide-in drawer with pending-discovery dot; topo raster + outside-ring dim/hatch + vignette + ring polygon outline + node "well" treatment. Interior mesas now climbable via shortcut (.7.10). Fragile-first damage selection (.7.8). Wide-net audit cleanup (.7.12). Worker boundary + gear_placement batch flush (.7.13).

---

## current state (as of v0.0.9.7.13)

The world patch is complete. The interior is alive: terrain classifies correctly (including clayBed and interior mesas), trails persist, gear can be placed and degrades, storms sweep across the 2D plane, river drift is a failure state that resolves naturally. The sim harness has produced real balance data and the v0.0.9.7 arc closed out the topographic map rework + cargo log surface.

**Next up:** v0.0.9.8 — the kitchen (cooking system; see [TLH-KITCHEN.md](./TLH-KITCHEN.md) for the design sketch). The remaining patch sequence to 1.0 is in [TLH-1.0.md](./TLH-1.0.md) → salvage, structures, drift, heat, renderer rework, onboarding, polish.

---

## technical landmarks worth knowing

- **`S`** — the global state object ([state.js](js/state.js)). `S._transient` is runtime-only (not persisted).
- **`S._transient.currentSegment`** — the source of truth for courier position: `{ from, to, type, pathFn, length }`. Types: `ring`, `shortcut`, `river-drift`.
- **`terrainAt(x, y)`** in [js/data/terrain.js](js/data/terrain.js) — deterministic terrain classifier. The world map is generated here.
- **`route-map.js`** — largest render file (~65kb / 1449 lines). Owns the SVG viewport, storm rendering, trail system, trample persistence, tooltip system, shortcut interaction.
- **Save schema v9** — `SAVE_VERSION` in [constants.js](js/constants.js). Migrations live in [persistence.js](js/persistence.js); pre-v9 chain drops at 1.0.
- **Simulation harness** (v0.0.9.6.9) — runs many tick-batches offline. Balance data lives here. Use it before shipping balance changes.
- **Worker** — Cloudflare Worker at [tlh/worker/](worker/). Versions independently (currently `v0.0.9.6.10.26`). Single-DO architecture; migration deferred post-1.0.

---

## when you feel like you can't see the whole thing

You've shipped: multiplayer sync, spatial weather, a 12-NPC cast with authored dialogue, a 2D terrain-classified world, gear placement with decay, a trails system, a simulation harness for balance testing, somewhere around 370 package labels, a cargo log surface, the topographic map rework, and interior mesa climbing. In a browser idle game. Built mostly solo with Claude Code.

The scope feels big because the game is actually getting big. That's earned.

For where things go next — patch sequence, ship criteria, the molten questions — see TLH-1.0.md. This doc's job is to remember what the game already is.
