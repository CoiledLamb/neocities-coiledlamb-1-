# the long haul — design bible
_a document for the developer, not the agents_

---

## what this is

This is a place to zoom out. Not a technical spec, not a handoff. Just a clear-eyed account of what The Long Haul is, what it's been through, and where it's going. For when you've been deep in the weeds for too long and need to remember the shape of the whole thing.

---

## the game in one paragraph

The Long Haul is a post-post-apocalyptic idle courier game played in a browser. You are a porter walking a circular route between twelve settlements, carrying packages, building trust with the people at each stop, and slowly upgrading your kit. The world is a 2D plane — a ring road laid over real terrain — and other players are walking the same route asynchronously, building paths and leaving gear behind. It's quiet, unhurried, and full of small details that reward attention.

---

## core feel & philosophy

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

| ID | Callsign | Location | Voice | t20 gift | t40 gift |
|----|----------|----------|-------|----------|----------|
| A (rho) | rho | depot | former porter, wizened advice | boot clip 1 | boots T2 |
| B (iota) | iota | greenhouse | 20s wetlands ecologist | sandalweed satchel | efficient consumption |
| H (tau) | tau | home | your sibling, proud not overprotective | steady feet | sticky holster |
| ? (phi) | phi | weather station | stoic forecaster | weather radio | — |
| C (xi) | xi | city ruins | ruins researcher, careful | scanner T2 | — |
| · (psi) | psi | oasis waypoint | orphan scavenger | scavenger's eye | topographic map |
| ν (nu) | nu | purification plant | guardian, cautious desert water-keeper | drip-feed integration | reservoir tank |
| θ (theta) | theta | kiln | artisan, nurturing potter | ceramic wrap | — |
| γ (gamma) | gamma | workshop | debt-easer, tit-for-tat tinker | mobile carrier 1 | mobile carrier 2 |
| λ (lambda) | lambda | climbing lodge | adventurer, gregarious | mountain gear | improved tie-downs |
| π (pi) | pi | radio tower | researcher, reclusive summit antisocial | exoskeleton 1 | exoskeleton 2 |
| δ (delta) | delta | reservoir | routine, tired-hopeful dam restorer | solar panel | rainfall turbine |

All NPCs are nonbinary/agender. Trust threshold tiers: 20 / 40 / 60 / 80.
- t60: battery charging at trusted destinations
- t80: free rest (stamina + canteen, no scrip)

---

## core systems

### the courier loop
- Walks the ring automatically (idle-first)
- `S.dotT` (0→1) tracks position along current segment
- `currentSegment` is the source of truth: ring segments or bezier shortcuts
- Speed modified by stamina, terrain, strain
- Arriving at a node triggers delivery checks, NPC dialogue, outbound dispatch

### packages
- 4 sizes: s (1×1), m (2×1), l (2×2), xl (4×2) — footprint in the cargo grid
- Modifiers: fragile, lightweight, heavy, unwieldy (each changes slot count)
- ~232 authored labels, dest-tagged — each label knows which NPCs it can go between
- Delivery earns scrip + trust scaled by `1 + floor(slots/2)`
- Lost deliveries earn a small bonus trust; damaged earns delivery dialogue

### cargo & kit
- 2-row CSS grid with bin-pack autosort
- Default 6 slots, upgradeable to 8 → 12
- Gun slot reserved bottom-right; tie-down toggle
- Kit bar: stamina drink, scanner, boots, battery — separate from cargo slots

### stamina & strain
- Stamina: 0–100, drains while walking, restores at rest or from drinks
- Strain: accumulates from terrain, load, weather; slows you
- Canteen: refills at water sources, rains, wetland cells; capped by upgrade
- Overboost: stamina can briefly exceed 100 (overlay visual on the bar)

### trust
- Per-NPC values 0–100
- Earns through deliveries (weight-scaled), discoveries, outbound dispatch
- Trust unlocks: upgrades at t20/t40, free battery charge at t60, free rest at t80
- Each NPC has a trust profile shaping how gain is calculated (veteran, wetland-path, homecoming, etc.)

### weather & storms
- Storms are world objects with position, type, dual-gaussian shape
- Travel across the 2D interior over time
- Rendered as isobar contour lines on the route map (unlocked by weather radio L2)
- Affects: trip chance, stamina drain, gear decay, rain-channel regen
- Weather radio L1: storm prediction; L2: map visualization

### terrain
- Classified by `terrainAt(x, y)` — deterministic, stable across reloads
- Types: flat, river, desert, rocky hills, plateau/mesa, mountain
- Each type has its own glyph pool, color, trip/stamina modifiers
- Mesa outcrops on ring edges engage the plateau climbing mechanics
- `courierTerrain()` feeds real geography into the mechanics loop

### multiplayer (async)
- BroadcastChannel + server relay
- Shared world objects: placed gear, trample trails, storm positions
- Every player sees every placed object (visibility sharding deferred to ~10+ active users)
- Canonical ID scheme: `${placerId}-${placedWallClock}-${ci}`

### persistence
- Save schema currently v8 (migrated at v0.0.9.5 from v7)
- Saved locally + export/import available
- `S._transient` is the non-persisted runtime layer (segment, trail cells, hover state, etc.)

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
Renderer upgrade + 2D world + terrain + NPC expansion. Still in progress.
- **v0.0.9.1** — Day/night cycle: sky layer with sun arc, moon phases, stars, gradient backdrop
- **v0.0.9.2** — Route map → 2D plane: square viewBox, interior texture, typewriter settlement reveal
- **v0.0.9.3** — Shortcut travel: bezier curves through interior, dotted trail, live tooltip with km/ETA, segment abstraction refactor
- **v0.0.9.3.1** — Overboost overlay polish
- **v0.0.9.4** — Package destination diversification (ring-distance-weighted); NPC outbound dispatch
- **v0.0.9.4.1** — Cursor pickup, drag-to-toss from cargo, ground tooltips
- **v0.0.9.5** — NPC expansion: 6-node hex → 12-node rounded square; 6 new NPCs with full dialogue (~280 lines); battery baseline (solar trickle, day/night sine curve); 13 new trust-reward upgrades; 232-label pool; save migration v7→v8
- **v0.0.9.6** — World patch: terrain types (rivers, mountains, plateau, rocky hills, desert); ladder + anchor gear; world overlay + trails; trample system; storm sweep across interior; shortcut rewrite (per-cell terrain effects instead of flat multipliers); river drift segments; gear placement + decay
- **v0.0.9.6.9** — Simulation harness: 20-run batch produced balance data (canteen over-solved, boots too harsh, trust progression glacial, NPC equity uneven)

---

## current state (as of v0.0.9.6.10.x)

The world patch is complete. The interior is alive: terrain classifies correctly, trails persist, gear can be placed and degrades, storms sweep across the 2D plane, river drift is a failure state that resolves naturally. The sim harness exists and has produced real balance data.

**Next up: v0.0.9.7 — polish pass informed by sim findings.** Canteen tuning, boot durability curve, trust pacing, NPC equity.

**After that: v0.0.9.8** — dispatch log virtualization (benched; see handoff for plan).

---

## the next patch: structures + salvage (v0.0.9.7+)

_Rough design sketch — not locked_

**What it adds:** A "structures" submenu in the upgrades panel. Small quality-of-life buildables that persist in the world and hook into async multiplayer — arriving to find someone else built a well is a nice moment.

**Proposed structures:**
- Postbox — store/retrieve items
- Generator — recharge batteries
- Well — refill canteen

**Materials mechanic (salvage):** Building structures requires materials gathered along the route, flavored as salvage from the post-apocalyptic landscape. Ties into the terrain types already in place — different terrain yields different salvage types.

**Async hook:** Some structures on your path are pre-built by other players when you log in. Same world-overlay plumbing already established in v0.0.9.6.

---

## the terrain/elevation question

The renderer is more capable than it looks from the outside — it's SVG, 400×400, with per-cell terrain classification, gear overlays, storm isobars, trail layers, and trample persistence. It hasn't been updated for elevation, but the infrastructure is nearly all there:

- `terrainAt(x, y)` classifies cells already — mountains/hills are just new terrain types in that classifier
- `courierTerrain()` feeds terrain into trip/stamina mechanics — elevation effects hook in here
- `mesaOutcropAt()` is an existing proof-of-concept for "elevated terrain on the ring path"
- The `drawInterior` loop renders per-cell glyphs automatically — mountain glyphs appear once the terrain type exists

What doesn't exist yet: an elevation *value* per cell (for slope-scaled strain). But terrain-type-as-elevation-proxy (the Cairn approach) may be sufficient for a first pass and much cheaper to implement.

**Key insight for mountain climbing mechanics:** You're mostly pulling from Cairn's gear/load system, not its visual language. The load-bearing question is how strain scales with altitude and how gear modifies that curve — the renderer will follow.

---

## things that are intentionally deferred

- **Sprite art** — ASCII is working well and is fast to iterate. Sprites are a long-term ambition. Don't let this be a source of anxiety.
- **Visibility sharding** (per-player world subsets) — deferred until ~10+ active concurrent players
- **Dispatch log virtualization** — v0.0.9.8
- **Modifier stacking** (fragile + lightweight combos) — deferred for clarity
- **Interior package pickup** — currently off except plateau tops; deferred to v0.0.9.7+
- **Sticky gun rework** — design vision not yet locked

---

## open design questions (as of now)

- **Mountain climbing feel:** Is strain the right axis for elevation, or should there be a more discrete moment even within the idle-first philosophy? The current design says always-traversable, but there's design space between "harder" and "blocked."
- **Salvage distribution:** How does salvage spawn — on the ground like packages, or as a passive yield from walking certain terrain? The latter feels more idle-friendly.
- **Structures build cost:** Should structures require just salvage, or also scrip, or also trust with a relevant NPC?
- **When is 1.0?** What's the line between "content complete" and "done"? Worth writing down eventually.

---

## technical landmarks worth knowing

- **`S`** — the global state object (state.js). `S._transient` is runtime-only (not persisted).
- **`currentSegment`** — the source of truth for courier position: `{ from, to, type, pathFn, length }`. Types: `ring`, `shortcut`, `river-drift`.
- **`terrainAt(x, y)`** in `data/terrain.js` — deterministic terrain classifier. The world map is generated here.
- **`route-map.js`** — largest render file (~53kb). Owns the SVG viewport, storm rendering, trail system, trample persistence, tooltip system, shortcut interaction.
- **Save schema v8** — migrated at v0.0.9.5. Keep an eye on migration cost when schema changes.
- **Simulation harness** (v0.0.9.6.9) — runs many tick-batches offline. Balance data lives here. Use it before shipping balance changes.

---

## when you feel like you can't see the whole thing

You've shipped: multiplayer sync, spatial weather, a 12-NPC cast with authored dialogue, a 2D terrain-classified world, gear placement with decay, a trails system, a simulation harness for balance testing, and somewhere around 230 package labels. In a browser idle game. Built mostly solo with Claude Code.

The scope feels big because the game is actually getting big. That's earned.

The next thing doesn't have to be big. Structures + salvage is well-scoped and clearly visualized. The mountain climbing features are mostly about `terrainAt` and `courierTerrain`. You know how to do this.
