# the long haul — game handoff doc
_last updated: 2026-05-01 (**v0.0.9.7.1 shipped on branch** — first commit of v0.0.9.7 "the log & lift"; cargo log skeleton + topo map presentation rework begins. UI facelift moved out of v0.0.9.7; first-run onboarding deferred. Cache-bust 097-0-1. See [just shipped](#just-shipped--v00971--cargo-log-skeleton--topo-map-rework-begins) section below.)_

> Companion doc to [`HANDOFF.md`](./HANDOFF.md) (which covers site-wide infrastructure). This doc covers everything related to **The Long Haul** game: architecture, multiplayer, identification stages, persistence, bug list, specs, roadmap, and game-specific session log.

---

## ✅ CURRENT STATE: v0.0.9.7.1 shipped on branch (cargo log skeleton + topo map rework begins). UI facelift moved out of v0.0.9.7 (no longer fits the patch); first-run onboarding deferred (systems still molten). Open question on session resume: continue v0.0.9.7 with topo follow-ups (vignette, outside-ring dim, ring polygon outline, node restyle) and a small wrap, or call v0.0.9.7 done at .1 and roll v0.0.9.8 (the kitchen) next. v0.0.9.6 arc COMPLETE; v0.0.9.6.9 sim harness shipped (first 20-run batch produced actionable balance data — canteen over-solved, boots too harsh, trust progression glacial, NPC equity uneven; sim-balance items folded into v0.1.0 polish pass per [tlh/TLH-1.0.md](tlh/TLH-1.0.md)).

Game is at `v0.0.9.5` on the `claude/amazing-hermann` branch (merged to main on completion). The v0.0.8 arc shipped as three mechanical threads (packages / trust / weather). v0.0.9 has now landed three renderer / interaction patches, a micro-polish, dest-div + outbound dispatch, cursor-based cargo UX, and the biggest single-arc expansion so far — NPC doubling + battery baseline + full trust-gift wiring:

- **v0.0.9.1 — day/night cycle.** Side-view play-area strip gets a sky layer: sun arcs by day, moon with phases by night, stars flicker between. Backdrop paints as a layered gradient (cool vertical base + sun-anchored warm radial at sunrise/sunset). Real-scale sun + moon (eclipse-ready). See [v0.0.9.1 implementation plan](#v0091-implementation-plan).
- **v0.0.9.2 — route-map panel → 2D plane.** Abstract 6-node ring became a square 2D plane with the ring drawn as a solid line and the interior textured (dim dots inside the ring polygon). Node glyphs `?` → φ and `·` → ψ to match the v0.0.8.4 identity patch. Typewriter settlement-emergence reveal when a node crosses stage-2 → stage-3. Right column widened to 320px; network + channels placed side-by-side below the route map. See [v0.0.9.2 implementation plan](#v0092-implementation-plan).
- **v0.0.9.3 — shortcut travel.** Clicking a non-adjacent node on the 2D route-map cuts the courier through the interior on a natural bezier curve. Dotted trail fades behind. Live tooltip on hover with via-ring / via-shortcut km + savings. Segment-abstraction refactor (option c) — `S._transient.currentSegment` becomes the source of truth for "which leg is the courier walking." Interior is off-grid (no pickup / weather / wetland refill during shortcut). Cost tax (stamina ×1.2, trip ×1.5) primes v0.0.9.6's trample decay model. See [v0.0.9.3 implementation plan](#v0093-implementation-plan).
- **v0.0.9.3.1 — overboost overlay + trust-rewards bug-list note.** Stamina overboost moved from a 25×8 side-segment to a 100×8 overlay on the main bar (same size and shape, `position:absolute; inset:0`), so overboost reads as "stamina is above its cap" rather than "an extra gauge next to stamina." Overlay `display:none`'s once excess hits 0 — it simply goes away. Trust-reward auto-grant → shop-claimable added to the queued bug list (see bug-list item #5).
- **v0.0.9.4 — package destination diversification + NPC outbound dispatch.** Two-commit patch. (1) World-spawn destinations now picked by a ring-distance-weighted curve (40/25/15/10/5/5 across offsets 0-5 clockwise from spawn-edge endpoint) instead of defaulting to the edge endpoint — heavy forward bias keeps idle play smooth while the long tail gives shortcut travel real gameplay weight. Niche label audit added 10 new labels for the two thin dests (rho/A: dispatch ticket, waybill, logbook bundle, depot stamp kit, pallet jack wheels. tau/H: family letter, knit gloves, preserves jar, family photos, heirloom chest). (2) NPC outbound dispatch: all 6 NPCs can offer a pkg on arrival with chance scaling `OUTBOUND_BASE_RATE * (trust/100)` capped 0.8; per-visit cooldown; label pick filters to `dests.includes(origin) && dests.length >= 2` (uses the v0.0.8.1 dests[] as a story-compatibility set); destination picked from label's other dests weighted by the same ring-distance curve. Log-button accept follows the depot-rest pattern. Reward structure: `+N` at origin on accept (N = 1 + floor(slots/2)), `+N+1` at dest on delivery (normal + outbound bonus) — ≈2N+1 trust per successful dispatch vs a regular delivery's N. pkg flagged with `outboundFrom` carries through to tryDeliver for the bonus. See [v0.0.9.4 implementation plan](#v0094-implementation-plan).
- **v0.0.9.4.1 — cursor pickup + drag-drop + ground tooltips + eject-from-cargo.** Two-commit patch + several follow-up bugfix commits. (1) Tooltips on ground pkgs (shared format with cargo via `formatPkgTooltip`), in-range cursor-pointer affordance, click-to-pickup with `grab: auto|off` toggle (auto remains the default per "idle game first"). (2) Drag-to-toss from cargo with modifier-scaled lost chance (fragile 30%, unwieldy 25%, lightweight 20%, heavy 5%, base 10%); kept pkgs drop at the courier's current cell (±3 search), lost pkgs route through the existing `postLostDrop` recovery pipeline tagged with player porter id. Bugfix cycle resolved: body-portal `#pkgTooltip` to escape `overflow:hidden` clipping; `.drag-ghost.cslot` specificity bump so position:fixed wins; explicit ghost dimensions per size class; ghost centered on cursor; `tossedUntilTick` cooldown so auto-scan doesn't re-grab a just-dropped pkg; bidirectional cursor pickup (±range) so tossed pkgs landing behind the courier are clickable; sticky-tooltip fix (track hoveredPkgCi, reconcile after every renderFieldstrip's innerHTML rewrite); grab+tie-down toggles stacked vertically in the cargo row. See [v0.0.9.4.1 implementation plan](#v00941-implementation-plan).
- **v0.0.9.5 — NPC expansion + battery baseline.** Five-commit patch shipped 2026-04-17; biggest single-arc expansion in the v0.0.9 track. (1) **Rim reshape + save migration v7→v8** — 6-node hex → 12-node rounded-square rim with 25px corner arcs; corners at (92/92, 308/92, 308/308, 92/308); rim nodes at 163/237 for even arc-length spacing; player start moves from B↔C edge to tau's node; v7 saves snap-to-tau on load. Greek-letter nodeIds for the new 6 (ν/θ/γ/λ/π/δ); GREEK render table corrected so existing A/B/C/H display as ρ/ι/ξ/τ matching their callsigns. Dest-weight curve extended to 12 entries preserving forward bias. Battery slot added to save schema (feature lands in commit 3). (2) **6 new NPCs with full dialogue + trust profiles across all 12.** ~280 authored lines (threshold x4 + ambient x6 + warning [rain/trip/stamina] x4 each + preview x4 + rest x4 + delivery 5x3 per NPC). Voice briefs: nu (guardian / cautious protective desert water-keeper), theta (artisan / nurturing potter), gamma (debt-easer / tit-for-tat workshop tinker), lambda (adventurer / gregarious mountain climber), pi (researcher / robotic summit antisocial), delta (routine / tired-hopeful dam restorer). All 12 NPCs get character-expressive trust profiles retiring the default/careful/scavenger generics — veteran/wetland-path/homecoming/stormwise/archivist/wayfinder/guardian/artisan/debt-easer/adventurer/researcher/routine. Per-NPC state added for stateful profiles (`iota.wetlandTicksSinceLastVisit`, `tau.kmAtLastVisit`, `delta.visitedSinceLastDelta`); `recordDelivery(depotId)` batch-level hook resets/accrues counters at delivery. (3) **Battery baseline** — promoted from v0.0.7.24 stub to persistent feature. Innate solar trickle regen peaks at 0.20/tick at midday (0 at night), sine-curve through dawn/dusk; charges 0 → ~95 per idle day. `daylightOf()` + `TICKS_PER_DAY` exported from sky.js as shared source of truth. stickyGun decoupled from battery drain (pure mechanical). Scanner stays on drain line at its existing rate. (4) **Upgrade defs + trust-gift wiring + rename pass** — 13 new trust-reward upgrades across 6 new NPCs + xi's t40 (`scannerT2`, bumps `S.scanner.level=2` activating T2 tuning: auto interval 86→60, buff duration 17→24, magnitude 0.5→0.35, manual buff 34→46) + psi's t40 (`topographicMap`, flag-only). `efficientConsumption` migrated off scrip-shop → nu t20 as drip-feed integration with inverse retro-grant (old saves owning the scrip version ratchet nu to t20 automatically, attribution transfers, no benefit lost). Real mechanics wired for nu t40 `reservoirTank` (×1.5 canteenMax + passive fill), delta t20 `solarPanel` (×1.5 solar regen multiplier), delta t40 `rainfallTurbine` (weather-intensity-scaled rain-channel regen), xi t40 `scannerT2`. Flag-only for 9 upgrades gated on v0.0.9.6 terrain/gear (riverWaders, ceramicWrap, mobileCarrier1/2, mountainGear, improvedTieDowns, exoskeleton1/2, topographicMap). Gear-shaped rename pass across 6 id-stable display names: pack mule rig → molly netting, efficient consumption → drip-feed integration, sandalweed poultice → interwoven lashing, steady feet → traction cleats, weather map → forecast radar, scavenger's eye → pocket binoculars. Area-name relabels for 4 existing NPCs (depot a → depot, depot b → greenhouse, ruins → city ruins, waypoint → oasis; new NPCs: purification plant, kiln, workshop, climbing lodge, radio tower, reservoir). (5) **Label pool expansion** — 232 total labels (from ~110). Fresh 15-23-label pools per new NPC across all 4 size tiers (nu water/survival, theta clay/pottery, gamma workshop/mechanical, lambda mountaineering, pi research/electronics, delta dam/electrical). iota +18 / phi +15 sparse-pool boost. 20 plateau-top-eligible cross-tagged labels with dests locked to the near-start NPC allowlist (A/B/H/·/ν/θ) for v0.0.9.6's plateau-spawn rule. See [v0.0.9.5 implementation plan](#v0095-implementation-plan).

The side-view play area + sky from v0.0.9.1 are still untouched through v0.0.9.2 → .5 — the gameplay camera stays the 1-row strip; all the 2D + interactive work lives in the route-map panel + cargo grid.

**v0.0.8 scope redefinition (historical note):** the handoff previously framed v0.0.8 as terrain expansion (deserts, rivers, slopes). User rescoped it around **three mechanical-depth threads**: packages, trust, rain. All three shipped. Terrain moved to v0.0.9 and is now the lead thread there.

**Where we are in the patch arc:**

**v0.0.7 arc (done):**
1. ✅ v0.0.7 multi-system bundle (multiplayer, identification, trust, settlements polish)
2. ✅ Module refactor (monolith → 16 ES modules)
3. ✅ Bugfix patch (v0.0.7.18 / .19 / .20)
4. ✅ v0.0.7.21 — 6-piece bundle: multiplayer rate limit + 429 UI, sticky gun, scanner T1, minimal admin, save export/import, schema v5→v6
5. ✅ v0.0.7.22 — admin channel (BroadcastChannel from blog-admin tab)
6. ✅ v0.0.7.23–.27 — UI/UX pass: inline gear pattern, canteen bracket-frame rework, kit row prototype, scan sonar visual rework
7. ✅ v0.0.7.28 — battery prototype drain (time-only, not persisted)
8. ✅ v0.0.7.29 — swap stamina/battery visual language
9. ✅ v0.0.7.30 — battery pixel-dissolve + canteen cap
10. ✅ v0.0.7.31 — silent / appear-offline toggle
11. ✅ v0.0.7.32 — UI polish pass: canteen RGB lerp, stamina/battery swap formalized, staircase dissolve, network toggle, bugfixes

**v0.0.8 arc (in progress):**
12. ✅ **v0.0.8.1 — package rework: composable spawn roller + dest-tagged label pool**. `data/packages.js` full rewrite (PKG_BASES, PKG_SIZE_WEIGHTS + RISKY variant, PKG_MODIFIERS, PKG_LABELS_BY_SIZE with ~73 dest-tagged labels, PKG_LOST_LABELS fallback). New `rollPkg(destId, cellRisky, forceLost)` in `js/packages.js`. `world.js makeWorldPkg` routed through it. Old `NPC_PKGS` / `LOST_PKGS` tables retired.
13. ✅ **v0.0.8.2 — cargo inventory rework: unified pkg shapes + 2D autosort**. `renderCargoSlots` switched from flex-row of N 1-cell boxes to 2-row CSS grid with multi-cell shapes (s=1×1, m=2×1, l=2×2, xl=4×2). First-fit bin-pack sorted by footprint desc. Gun slot reserved bottom-right; phantom cells for odd maxSlots. Modifier field carried through pickup. Added `.claude/launch.json` for local preview on :8745.
14. ✅ **v0.0.8.3 — cargo polish: modifier visuals, weight 2-row, +4 pack**. Modifier visuals: fragile = per-size saturated caution-tape stripes (teal/purple/pink matching size accent); lightweight = dashed border in size color; heavy = 2px border in size color (no white override); unwieldy = separate 1×1 trail div with 2px grid gap, inherits size class. binPack handles cell-list footprints (unwieldy = base cells + trail cell). Weight segs mirror cargo's 2-row grid. `cargoPack` upgrade: +3 → +4 slots (fixes maxSlots=11 odd stop; new progression 6 → 8 → 12).
15. ✅ **v0.0.8.4 — identity patch: phi + xi + psi + dialogue shape fix + delivery dialogue**. Three new NPCs (phi at `?` weather station, xi at `C` ruins researcher, psi at `·` orphan-scavenger). `trustProfile` dispatcher: 'careful' (xi halves gain on non-fragile/non-xl), 'scavenger' (psi doubles on s, halves on l/xl). NPC_LINES reshaped to category-first arrays; trust.js shape bug fixed (threshold/warning/preview/rest had been silently no-opping since the refactor). Rich dialogue variety: 3–5 variants per repeating slot × 6 NPCs. Label pool rewrites: `?` orphan labels migrated to `·`; fresh weather instrument pool for `?`; `C` expanded with research/ruin-scavenging labels. **Delivery dialogue**: new `delivery` category in NPC_LINES (5 conditions × 6 NPCs × 3 lines = 90 lines). `speakDelivery()` fires once per delivery batch, picking the most interesting condition (lost > damaged > fragile > heavy > normal). No trust gate — NPCs react from the first delivery. `pkg.damaged` flag added in trip.js. **Character voice pass**: rho = former porter giving wizened advice; iota = 20s wetlands ecology researcher; tau = your sibling (encouraging/proud, not overprotective); all NPCs nonbinary/agender.
16. ✅ **v0.0.8.5 — weight-scaled trust gain**. Delivery trust now `1 + floor(pkg.slots/2)`: s→+1, m→+2, l→+3, xl→+5. Lost bonus +1. Delivery log surfaces trust: `+Xc +N trust`. `TRUST_GAIN_DELIVERY` / `TRUST_GAIN_LOST_DELIVERY` removed; replaced by formula + `TRUST_GAIN_LOST_BONUS`.
17. ✅ **v0.0.8.6 — upgrade migration + trust rewards + new gadgets + tier mechanics**. 6 upgrades migrated from scrip to NPC trust rewards; 3 new upgrades added (weatherRadio phi t20, sandalEfficiency iota t40, scavenger's eye psi t20). Scrip menu filtered. `onTrustUnlock` auto-grants; `loadGame` retro-grants for existing saves. Tier structure: t20 = first gift, t40 = second gift (rho/iota/tau), t60 = battery charging at trusted destinations (+15 per visit), t80 = free rest (stamina + canteen, no scrip cost). weatherRadio tick hook fires passive rain log warnings. scavengerEye: respawn 20% faster, lost chance 15%→22%. sandalEfficiency: sandalweed repair 30→50 durability.
18. ✅ **v0.0.8.7 — weather rework**: spatial storms as travelling world objects, dual-gaussian isobar minimap, intensity zones, weather radio tiering (L1 storm prediction, L2 map unlock). Rain thread complete.
19. ✅ **v0.0.8.8 — bug audit + mobile compatibility**: cleanup pass after the v0.0.8 feature arc.

**Resume next session**: v0.0.9.5 is shipped on the `claude/amazing-hermann` branch (5 scope commits + 1 design-lock docs commit + 1 ship-log docs commit). Merged to main. Next patch is **v0.0.9.6 — world patch: terrain bones + gear + world-overlay + trails** (consolidates the old .5 + .6 into a coherent world-mechanics patch; design fully refined 2026-04-17 during the .5 lockdown). **Idle-game-first philosophy locked**: no hard gates on traversal — gear is efficiency, never requirement. Every cell is crossable gear-less, just with higher penalty. Scope: terrain types anchored at v0.0.9.5 corner NPCs — rivers (theta NE source, flow diagonally SW, clay beds in `#98875f` / `#a64a2e`); mountain massifs at SW corner (pi's summit + lambda's slope), severe penalty but always traversable; **plateau / mesa country** (east side) as gear-teaching rung — visual obstacles with walkable paths carved between, plateau tops gated by placed ladder for pkg-top rewards (dests restricted to near-start NPC allowlist per v0.0.9.5 label lock), placed anchor for controlled descent else fall-as-guaranteed-trip; rocky hills as connective tissue; desert at nu's NW with day-scaled stamina drain. Rivers classified creek/river/wide with fall-and-ride-downstream failure mode (courier swept downstream ~5-10 ticks, catches themselves, pathfinding auto-reroutes). Shortcut rewrite: flat SHORTCUT multipliers retire in favor of per-cell terrain effects. Interior brought on-grid (weather + scanner + river-refill + terrain effects active during shortcut; pkg pickup in interior stays off pending .7+, except plateau tops). Ladder + anchor as kit-bar gear (1×1 slots each, bundled 1-5/6-10/11-20 = s/m/l slot; 5c each; 12h wall-clock base durability, lambda's mountain gear ×2 → 24h; spatial storm-at-gear-cell decay ×3). **All gear is placed** (no held/in-use model) — anchor at shore creates rope spanning river (up to 2 cells per anchor), chained ladders share one decay clock as atomic multi-cell infrastructure. Placement consumes inventory + creates world-overlay structure usable by others. Trails land with shared world-overlay data plumbing (per-cell trample, multiplayer-synced, emergent social paving). Mountain-pass carving as natural extension. Storms sweep across 2D interior (not just ring). **Ceramic wrap (theta t40, shipped v0.0.9.5)** waterproofs fragile cargo during river crossings + fall-downstream incidents — cross-patch synergy already wired. 9 flag-only upgrades from v0.0.9.5 (riverWaders, ceramicWrap, mobileCarrier1/2, mountainGear, improvedTieDowns, exoskeleton1/2, topographicMap) get their real effect code wired this patch. See [v0.0.9.6 implementation plan](#v0096-implementation-plan). Dispatch log virt still benched at **v0.0.9.8**; see [its plan](#v0098-implementation-plan).

## just shipped — v0.0.9.7.1 — cargo log skeleton + topo map rework begins

First commit of v0.0.9.7. UI facelift was moved out of v0.0.9.7 entirely (per session call); first-run onboarding deferred (systems still molten). Cache-bust bumped 096-10-24 → 097-0-1 across 43 files via [tlh/scripts/bump-version.sh](tlh/scripts/bump-version.sh); subtitle now reads `v0.0.9.7.1`.

### cargo log skeleton

New "cargo" sub-tab inside the dispatch panel. Encyclopedia of every package label the player can encounter — 372 entries unioned across `PKG_LABELS_BY_SIZE` + `PKG_LABELS_BY_TERRAIN_ORIGIN` + `PKG_LOST_LABELS` (one cross-table dupe — `salvage kit` — merges to a single entry).

Three-state machine per item: `undiscovered` (`???` placeholder card) → `found` (name + wanted-by + counts visible; lore still hidden) → `delivered` (1-2 line lore unlocks). Plant entries follow a parallel state machine — `undiscovered` → `found` (name + biome + lore visible) — plus two independent reveal flags (`triggerRevealed`, `conditionalRevealed`) that the v0.0.9.8 cooking system flips per plant per role-in-dish. Plants design contract: each plant has fixed `trigger` and `conditional` properties; cooking with that plant in a dish reveals only the role it played (encourages diverse experimentation, removes need for an external wiki). See [tlh/TLH-1.0.md](tlh/TLH-1.0.md) cargo-log section for the full reveal contract.

Wanted-by is **derived** from `PKG_LABELS_BY_SIZE.dests` mapped through `NPC_DEFS[destId].callsign` — single source of truth in [tlh/js/data/packages.js](tlh/js/data/packages.js), not duplicated. Lore lives in a separate `CARGO_LORE` table ([tlh/js/data/cargo-lore.js](tlh/js/data/cargo-lore.js)) keyed by label string, currently empty (entries author over time per the user-authored player-copy convention).

### tab + filter chrome (generalizable)

Dispatch panel header was a single `// dispatch log` title; now it's a tab pair:

- **First (primary) tab** always wears the panel-title `// ` prefix at full opacity when active. Inactive tabs reserve the same prefix width with a transparent placeholder so toggling doesn't shift layout. Inactive opacity 0.5 / hover 0.8 / active 1.0.
- **Subsequent (secondary) tabs** get bracketed `[label]` when active; transparent bracket placeholders when inactive (same no-jump trick).

Generalized via `:first-child` / `:not(:first-child)` so v0.0.9.10's upgrades+structures will pick the same convention up automatically — same CSS classes (`.tlh-ptabs` / `.tlh-ptab` / `.is-active`).

Filter strip below the tab row, **cargo-only** (`hidden` attribute toggled by `setLogTab`; `.cargo-filters[hidden] { display: none }` explicit override since `display: flex` would otherwise leak the strip onto the dispatch tab):

- `hide ???` — toggle (was longer "hide undiscovered"; tightened for scrollbar space).
- `hide items` — toggle (was "hide cargo"; "items" is more accurate to what's hidden). Drops the items section entirely so the plants section is reachable without a 372-card scroll.
- `search…` — case-insensitive substring on item label / plant name. Live, no debounce (cheap re-render at 372 cards).

Filters compose. Session-only state — re-opens default to "show all, no search."

### card grid

`.cargo-cards` uses `grid-template-columns: repeat(auto-fit, minmax(170px, 1fr))` so cards flow into 2+ columns on wider panels (~365px slot → 2 cols, ~520px → 3 cols). 170px floor keeps the wanted-by line from wrap-thrashing.

Card visual is intentionally minimal at skeleton stage — name (cyan when discovered), wanted-by, found/delivered counts, 1-line lore. Click-to-expand for richer view is the planned escape hatch when individual entries earn deeper lore (currently no items do).

### topographic map rework — begins

New module [tlh/js/data/topo-map.js](tlh/js/data/topo-map.js) is the production port of the design handoff (kept alongside in [tlh/.handoff-topo/](tlh/.handoff-topo/) for reference until the rework wraps; safe to delete then).

200×200 normalized heightmap built once at module load:

- Domain-warped fbm base drift (`0.36 ± 0.10`)
- SW mountain massif along `NAT_MOUNTAIN_RIDGE` polyline + 4 named radial gaussian peaks (π summit tallest at `h: 0.36`)
- East rolling hills band centered south of γ workshop
- City-ruins mesa stamp (sharp-shouldered, low exponent on smoothstep)
- 3 stepped mesas NW from τ home into the desert
- NW desert basin (slight depression + dune noise)
- River carve along Catmull-Rom spline through `RIVER_CTRL` (-0.32 with banks)
- 5 stream carves (-0.18 each)
- SW reservoir lake basin (flatten cells inside oval `LAKE_SHORE` polygon to elevation 0.04)
- Hi-frequency surface texture (0.07 × fbm at freq 0.13)

Then `bakeSteppedHypsoPng()` quantizes each cell into one of 8 elevation bands and looks up the band-center color from a 9-stop hypsometric ramp (`#0b2e2d` deepest → `#77bfcf` summit). Result is a PNG dataURL (cached after first call).

New `drawTopoTerrain` in [tlh/js/render/route-map.js](tlh/js/render/route-map.js) drops a single `<image class="route-topo">` covering the 400×400 viewBox.

**Gated by the existing `topographicMap` upgrade** (psi t40 unlock) — without it, `drawInterior` keeps painting the muted "unmapped ground" `.` dots. With it, the colored terrain glyph layer is replaced by the hypso raster (the upgrade's reveal got an upgrade).

Non-scope (deferred to later v0.0.9.7 commits per the design handoff render order):
- Outside-ring dim (panelDarker @ 0.45 + diagonal hatch @ 0.18, masked outside ring polygon)
- Vignette (radial gradient transparent center → black 0.35 at corners)
- Ring polygon dashed outline
- Ring road segment + node + courier restyle

Hydrography overlays (river/stream/lake polygon) stay OFF per the chosen design variant — heightmap depression itself reads as the channel/lake. Desert dot-hatch from the handoff was tried and cut (didn't read well visually).

### state schema additions

```
S.cargoLog = {
  items:  { [label]:    { state, foundCount, deliveredCount, lastTouchedAt } },
  plants: { [plantId]:  { state, foundCount, triggerRevealed, conditionalRevealed, lastTouchedAt } },
}
```

Sparse — only labels/plants the player has touched persist. Missing keys imply `undiscovered`. Renderer tolerates absence via `|| { ... }` fallback.

`lastTouchedAt` exists but is currently unwired to UI. It powers a recency-sort surface that was added then cut for placement reasons; data tracking + `setSortMode` export retained in [tlh/js/render/cargo-log.js](tlh/js/render/cargo-log.js) so the UI can be re-enabled trivially when there's a good place for it.

### hooks added

- [packages.js `acceptPickup`](tlh/js/packages.js) (ring) → `noteFound(pkg.label)`
- [packages.js `acceptInteriorPickup`](tlh/js/packages.js) → `noteFound(pkg.label)`
- [packages-delivery.js `tryDeliver`](tlh/js/packages-delivery.js) per-pkg → `noteDelivered(pkg.label)`
- v0.0.9.8 cooking will call `notePlantFound(id)` / `notePlantCookedRole(id, role)` (stubs in place; no-ops until `PLANTS` populates).

### file map

**New:**
- [tlh/js/data/cargo-lore.js](tlh/js/data/cargo-lore.js) — empty `CARGO_LORE` map (lore strings author over time)
- [tlh/js/data/plants.js](tlh/js/data/plants.js) — empty `PLANTS` map (lands in v0.0.9.8)
- [tlh/js/data/cargo-index.js](tlh/js/data/cargo-index.js) — unifies the three label sources into `{ [label]: { sizes, dests, tags, sources } }` for cargo log render
- [tlh/js/render/cargo-log.js](tlh/js/render/cargo-log.js) — cards + filters + state mutators + sort logic
- [tlh/js/data/topo-map.js](tlh/js/data/topo-map.js) — heightmap builder + hypso palette + bake function

**Modified:**
- [tlh/js/state.js](tlh/js/state.js) — `cargoLog` state slot
- [tlh/js/persistence.js](tlh/js/persistence.js) — save/restore `cargoLog` (shallow spread; sparse)
- [tlh/js/render/log.js](tlh/js/render/log.js) — `setLogTab` panel toggle owner; imports `renderCargoLog` (no circular — cargo-log.js doesn't import log.js)
- [tlh/js/render/route-map.js](tlh/js/render/route-map.js) — `drawTopoTerrain` + gated dispatch in `drawRouteMap`
- [tlh/js/packages.js](tlh/js/packages.js) — pickup hooks (ring + interior)
- [tlh/js/packages-delivery.js](tlh/js/packages-delivery.js) — delivery hook
- [tlh/js/main.js](tlh/js/main.js) — register cargo els, bind tab + filter handlers (`bindToggle` helper)
- [tlh/the-long-haul.html](tlh/the-long-haul.html) — tab strip + filter strip + `cargoLogEl` + subtitle bump
- [tlh/the-long-haul.css](tlh/the-long-haul.css) — `.tlh-ptabs` / `.tlh-ptab`, cargo card grid, filter strip styles, `.cargo-filters[hidden]` override

### explicit non-scope (decisions logged)

- **Desert dot-hatch** from the handoff was rendered, tried, cut visually.
- **Sortable by recently found** UI cut for placement reasons; `lastTouchedAt` tracking + `setSortMode` export retained.
- **Hide-cargo** toggle added at user request to make plants section easy to jump to.
- **Salvage tab** in cargo log not needed inherently (per session) — covered when salvage system itself lands in v0.0.9.9.
- **Structures tab** in cargo log not needed inherently (per session) — covered by v0.0.9.10's upgrades-tab pattern (same chrome as cargo's tab pattern).
- **UI facelift** moved out of v0.0.9.7 entirely (per user — implementation already happened).
- **First-run onboarding** deferred (systems still molten — wait for stable surface).
- **Sticky-set-both-`href`-and-`xlink:href`** dropped — modern browsers prefer plain `href` and the dual-set was making the headless screenshot tool hang on serialization.

### what's next

Open. The remaining named v0.0.9.7 items (UI facelift, onboarding) both moved out. Two reasonable directions on session resume:

(a) **Continue v0.0.9.7** with the topo follow-ups the design handoff specifies but this commit deferred — outside-ring dim + diagonal hatch overlay, vignette, ring polygon dashed outline, node circle restyle. Smallest-blast-radius option.

(b) **Call v0.0.9.7 done at .1** and roll **v0.0.9.8 — the kitchen** (the next named patch in [tlh/TLH-1.0.md](tlh/TLH-1.0.md)). Bigger commit; multiple coupled subsystems (two-plant combo cooking, picker UI, field + depot cooking, 9 plants authored, depot stoves, cargo log plants section starts populating).

User to decide on resume.

---

## planned but not built (as of v0.0.8.3)

Captured from design conversations and UX feedback. Not yet spec-locked — revisit each before building.

| Item | State | Schema | Notes |
|---|---|---|---|
| Fragile readability at s-size | 🟡 noted | none | Per-size diagonal stripes communicate fragile, but at the 15px `s` cell the stripes crowd the size letter. User's suggestion: let the shape carry size identity, free the letter slot for modifier info. Revisit during trust work if the label audit reshapes small pkgs. |
| Modifier stacking | 🔴 deferred | none | Current roller picks exactly one modifier per pkg (or none). "Fragile + lightweight" combos etc. were discussed and skipped for clarity/balance. Could revisit once base modifiers have shipped long enough to measure feel. |
| Unwieldy visual refinement | 🟡 iterated | none | V1 shipped (trail cell with 2px gap). Clip-path L-shape was tried (v4) — broke tooltips and left top-left border incomplete. If revisited, prefer single-div + tooltip-safe technique; do NOT reuse clip-path approach without solving the tooltip + border-completeness issues. |
| Modifier-aware pickup-fail logs | 🔴 not built | none | Pickup-fail lines currently read "can't lift [m] tool roll — too heavy". Could surface modifier ("can't lift [m] tool roll (heavy) — too heavy"). Cheap win, not done to avoid scope creep in v0.0.8.1. |
| Package dispatch from shelters/NPCs | 🟡 design partial | TBD | Dest-tagging on labels (each label has `dests:[]`) already sets this up — same data powers "pkg spawned at NPC X, destined for Y in that label's dests list". Implementation waits for trust (trust-reward NPCs dispatching high-trust pkgs). |
| Battery full mechanic | 🟡 designed | v6 → v7 | Drain when scanner pings (and future electronic gadgets — exo). Regen when near a trust-40+ depot (+solar trickle when not raining). Upgrade to boost solar trickle. When it lands, also fold `BATTERY_DRAIN_PER_TICK` into per-device costs + remove the prototype blanket drain. |
| Sticky-gun capsule rework | 🔴 design needed | none | Current `gun: 4/6` readout is bland. User has vision brewing but hasn't locked it. Keep read-only (gun fires automatically in-range; not a manual action). |
| Scanner T2 / T3 tuning | 🟡 designed | none | Handoff sections for v2 spec still accurate. T2 adds auto-ping cadence upgrade; T3 adds edge-preview on pings. Folded into kit-row render already — only needs mechanic wiring + upgrade defs. |
| Mobile carrier (exoskeleton) | 🔴 design conv | v6 → v7 | Needed design conversation. Will use battery — aligns with reason battery gets promoted. Shared battery pool concept already laid out in kit row. Likely v0.0.8 later or v0.0.9. |
| `data/packages.js` atomization | 🟡 flagged | none | File grew from 26 → ~170 lines with the v0.0.8.1 rewrite. Flat + section-commented for now. Trust rework will likely add per-NPC outbound dispatch pools — natural moment to split into `pkg-labels.js` / `pkg-modifiers.js` / `pkg-dispatch.js`. Carve along the dispatch seam, not the size boundary. |
| Local preview per-worktree | ✅ closed | — | `.claude/launch.json` on :8745 per worktree (parent worktree uses :8744). Serving files from the current worktree, not the parent. |
| Stray `v0.0.7.N` subtitle drift | ✅ closed | — | Feedback memory saved; subtitle now bumps alongside commit. |

---

## trust thread primer (v0.0.8 next)

The v0.0.8 arc has three threads: ✅ packages (done v0.0.8.1–.3), ⏳ trust (next), ⏳ rain rework (after trust). This section is the pickup brief for a fresh agent taking on trust.

### user's three stated sub-threads (verbatim-ish)

1. **Give identity to the `?` square.** It's been unidentified from the start; user dislikes that since identification is a core game concept. Don't care what the identity is — just pick one that fits. Proposed lore (landed in v0.0.8.1 label pool): it's a **waystone** — a large stone travelers use to orient themselves, where they traditionally leave trinkets and travelling supplies. An **orphan lives there alone**. The existing `?` label pool reflects this — small gifts (beaded bracelet, carved charm, pressed flowers) and practical supplies the orphan needs (pantry crate, book bundle, hearth kit, patched coat, firewood stack).
2. **Map trust gain onto package weight** (like scrip does). Today trust is `+1 per delivery`, `+2 for lost-delivery`, `+3 for discovery` ([constants.js](js/constants.js) `TRUST_GAIN_*`). Proposal: make trust scale with `pkg.slots` (or `pkg.kg`) so heavier/harder deliveries reward more trust. Discussed formula: `1 + floor(slots / 2)` → xl gives +5, l gives +3, m gives +2, s gives +1. Compresses vs raw slots so xl doesn't dominate.
3. **Audit upgrades and move a number of them into "given by NPCs at x trust" rewards.** Currently all 13 upgrades in [data/upgrades.js](js/data/upgrades.js) are purchasable with scrip. Some should be NPC trust rewards — makes trust feel meaningful and gives each NPC distinct identity.

### design sketch from the earlier session (not implemented, not locked)

Tentative upgrade-to-NPC mapping I proposed during the package sketch:

| upgrade | current cost | → NPC | → trust tier | reasoning |
|---|---|---|---|---|
| `bootClip1` | 40¢ | rho (A) | t20 | A is starting depot; clip is core-loop |
| `sandalSatchel` | 60¢ | iota (B) | t40 | B wetlands-adjacent; thematic fit |
| `steadyFeet` | 120¢ | tau (H) | t40 | home-base substantial upgrade |
| `scannerT1` | 60¢ | `?` (waystone orphan) | t20 | if `?` is specialty node |
| `stickyHolster` | 80¢ | tau (H) | t60 | polish on existing gun |
| `bootsT2` | 90¢ | rho (A) | t60 | builds A's "boot depot" identity |
| `efficientConsumption` | 120¢ | iota (B) | t60 | B water-adjacent |

The rest (`bootsT1`, `bootClip2`, `cargoSling/Pack/Weight/Straps`, `stickyGun`) stay purchasable — gives players who don't grind trust a path.

### open design questions (unresolved, ask the user)

- **Does `?` get an NPC with real dialogue** (like rho/iota/tau), or just a name and no NPC lines yet? User said "i may end up adding an NPC to every location" — suggests yes, but timing isn't locked.
- **What's the orphan's callsign?** Greek letter to match rho/iota/tau? User hasn't picked.
- **Trust threshold retuning.** If weight-based trust gain lands, `TRUST_THRESHOLDS = [20, 40, 60, 80]` may need to grow (e.g. `[25, 60, 110, 180]`) to preserve pacing. Decide empirically after weight-based gain is live — could ship first, measure, retune.
- **Per-tier upgrade cadence.** One upgrade per tier per NPC, or multiple at high tiers? The table above assumes one per tier.
- **Scrip sink rebalancing.** Moving half the upgrades to trust rewards reduces scrip utility mid-game. Either add new scrip sinks (insurance, rainfall canopy at depot, etc.) or accept reduced scrip utility.

### how packages v0.0.8.1 sets up trust work

Relevant architecture from the just-shipped package rework:

- **`pkg.slots` is the scaling axis.** Roller applies modifier slotDelta (unwieldy: +1) before persisting. Weight-based trust formula should read `pkg.slots` not `pkg.kg`, since slots already include modifier effects.
- **Dest-tagging (`PKG_LABELS_BY_SIZE[size][].dests`)** sets up future dispatch-from-NPCs: same data can power "NPC at trust-60 dispatches pkg whose label's dests includes other NPCs" for outbound deliveries. Each label's `dests[]` is a shipping manifest.
- **Waystone labels exist.** `?` has a curated label pool with both orphan-supplies and trinket-offerings. When trust-rewards start dispatching pkgs from `?`, the outbound pool is already semantically authored.
- **Package list revisit likely.** User flagged: "this will probably require revisiting our package list again." Expect trust discussions to surface new label ideas tied to NPC personality. The ~73 labels are a starting point, not locked.

### deferred from packages that intersect trust

- **Fragile readability at s-size** — if trust makes small pkgs carry more weight (pun intended), the fragile visual cramping becomes worse. Consider whether the shape alone should carry size identity, freeing the letter slot.
- **Label audit for personality.** Once NPC trust-reward dispatch lands, each NPC's outbound vibe may sharpen — some labels may need rewriting or cutting. Good moment to revisit the ~73 current labels with each NPC's dispatch role in mind.

### rain thread (queued after trust)

Not in scope for the trust session but captured so the next planning pass has context. Previously sketched (see chat history ~v0.0.8 planning):

- Three intensity states: drizzle → rain → downpour (lifecycle progression)
- Storm as world object living in `_transient.storms[]`, not as player-local `S.isRaining` boolean
- Storm arc travels around the 6-edge ring; represented on minimap as a stylized cloud
- Biome bias: wetland cells more prone to storm spawning
- Downpour → river flooding (finally activates `S.inRiver` stub), reduced pickup range, higher trip chance
- Encumbrance folded into `tripChance()` alongside rain multiplier
- Shape constants: `weatherAtCourier()` derives current intensity from storm arcs; replaces every `if (S.isRaining)` callsite ([main.js](js/main.js), [trust.js](js/trust.js) t40 warning, [admin-channel.js](js/admin-channel.js))

---

## v0.0.9 thread primer (queued after v0.0.8 rain rework)

Planning sketch captured 2026-04-16. Not locked; terrain + NPC cast + renderer direction agreed, but numbers and a few design knobs are still open — see [open design questions](#open-design-questions-v009-unresolved).

**One-line thesis:** _the plane beneath the ring._ The 6-edge ring stops being an abstraction and becomes a road laid on a real 2D surface. The interior of that ring becomes traversable, textured, and (eventually, v0.0.10) socially built on.

### user's stated threads

1. **Renderer refresh.** Untouched since before v0.0.7 UI pass; user calls it "dated." Stay ASCII — sprites are a long-term ambition but too big to lift in-house now. v0.0.9 lifts via 2D viewport + atmospheric polish, not glyph-system rewrite.
2. **2D world — on the route-map panel, not replacing the play area.** The existing side-view play-area strip (`.tlh-viewport` where the courier `@` walks) **stays exactly as it is** — that's the gameplay camera and it's finished. The **route-map panel** (currently the small 6-node SVG ring) is what becomes a 2D plane: a flat top-down space with the ring laid down as a road and the interior traversable in any direction. Clicking a non-adjacent node routes the courier's path through the interior. Interior needs texture (trails + terrain) so it's not featureless.
3. **New terrain types:** rivers, mountains, rocky hills, deserts. Plus a refresh pass on the existing ring biomes (building locations/names may shift, existing NPCs stay in their buildings).
4. **6 new NPCs** total in v0.0.9.5 — cast locked 2026-04-17: `nu` (NW desert corner), `theta` (NE riverbed corner), `pi` (SW summit corner; `xi` promoted rim→SE corner), `lambda` + `delta` + `gamma` at rim slots. See cast below.

### design sketch from the planning session (not locked)

**Map shape: rounded square with 12 node rim.** Hex-with-10 is uneven; true circle is rotationally-symmetric but regionally-flat. Rounded square gives 4 corners as natural geographic anchors (one biome per corner) + 2 rim nodes per side = 12 total. Existing 6 NPCs stay on rim sides (except `xi`, promoted rim→SE corner); **6 new NPCs** join — `nu` / `theta` / `pi` at corners, `lambda` / `delta` / `gamma` at rim. Total post-.5 NPC count: 12. (Corner/rim assignment locked 2026-04-17; see cast table below.)

**Shortcut traversal.** Routes become lists of segments rather than an implicit `edgeIdx`. Click-across-ring = a single straight(ish) segment through the interior. Existing tick/distance/stamina/trip math reuses — the courier is still advancing along a segment, the segment just happens to cross the middle.

**Trails** — the design grab that makes the interior load-bearing.
- Save-stored, per-cell `trample` value + `lastStepTick`.
- Virgin terrain costs more (stamina drain + trip chance); walking over existing trample reduces cost. Emergent social "paving" as many players cross the same routes.
- Multiplayer-synced (existing channel); each player contributes trample from their own movement.
- Glyph/color shifts with trample level (`.` → `,` → `;` → `:` or a color ramp).
- Decay schedule: stubbed in v0.0.9, revisit later.

**Persistent world-overlay system** — lands in one coherent pass alongside trails (shared data plumbing). Trails + proto-structures share:
- Save-stored + multiplayer-synced object table keyed by canonical ID
- Stable ID shape: `${placerId}-${placedWallClock}-${ci}`
- Wall-clock timestamp (not ticks) so cross-session decay math is trivial
- Baked upgrade flags at placement time (ladder placed by someone with the durability upgrade lasts longer *for all viewers*, not dependent on the observer)
- Future-compatible with **visibility sharding** — a hash-based filter `f(viewerId, canonicalId) → bool` can be added later when player count justifies it (user's call: ~10+ active players). For v0.0.9: every save sees every object.

**Proto-structures: ladders + climbing anchors.** Mountains are regions (3-5 cell **massifs**), not per-cell obstacles. Some massifs generate with a natural **pass** (traversable but slower). Off-pass / no-pass massifs require:
- 1 ladder consumed entering (+ placed as a world-overlay object, usable by others)
- 1 anchor consumed exiting (same)
- Repeated crossings → the path trams in, eventually becoming a free pass (natural extension of the trails system — this is the *mountain-pass-carving* mechanic)

Ladder/anchor base durability **12h wall-clock**, extended by **lambda's mountain-gear upgrade** to 24h (×2). *Note: the original draft of this section attributed mountain gear to "delta"; that identity moved to `lambda` during the v0.0.9.5 cast lock. See [v0.0.9.5 cast table](#new-npc-cast-v0095--locked-2026-04-17) for the current mapping.* Degradation is **spatially weather-modulated** — storm overlap at the gear's own cell accelerates decay ×3. Visible wear states via glyph/color shift (`fresh` / `weathered` / `rotting`).

Durability model summary (for v0.0.10 foresight too):

| Structure | Base | Upgrade | Weather | Maintenance |
|---|---|---|---|---|
| Ladder / anchor (v0.0.9) | 12h wall-clock | lambda's mountain gear ×2 → 24h | spatial storm-at-gear-cell ×3 | — |
| Real shelter (v0.0.10) | IRL days–week | tier-based | significant modifier | explicit refresh action |

**Terrain types** (new):
- **Rivers** — diagonals across the interior, originating near theta's corner (clay source). Wading = trip chance up, canteen refill, slower pace. Finally closes the long-stubbed `S.inRiver` flag.
- **Mountains** — clustered in the **SW corner** (pi's summit + lambda's slope) as massifs (see above). *Earlier drafts said "delta's corner" — identity moved to `lambda`+`pi` during cast lock.*
- **Rocky hills** — spillover from the SW mountain cluster eastward into gamma's right-rim biome; intermediate terrain, higher trip chance but no gear required.
- **Desert** — nu's corner; canteen drain accelerated, especially at day (plugs into day/night cycle).

**Package destination diversification** — without this, shortcut travel is cosmetic; players never use 2D freedom if every pkg is for the next shelter. Data is already ready (`PKG_LABELS_BY_SIZE[size][].dests` has been dest-tagged since v0.0.8.1).
- Roller picks uniformly from cells-that-match-this-label rather than always tagging edge endpoint.
- Labels already shape intent — some local (firewood for nearest shelter), some long-haul (research sample for a specific distant NPC).
- Natural moment to also land the deferred **NPC outbound dispatch** — trust-reward NPCs hand you pkgs destined for other NPCs on visit.

**Renderer refresh** (runs through everything):
- Audit existing renderer, identify cheap wins (shelter-emergence polish is known-needed per user).
- **Side-view play-area strip stays as-is** — the 1-row text strip + `@` + ground + destDrift + rain + sky (shipped in v0.0.9.1) is the gameplay camera and doesn't get replaced. The "2D viewport" in this document refers to the *route-map panel* being expanded into a 2D plane (see point 2 above), not a camera rework.
- **Day/night cycle**: shipped in v0.0.9.1 on the side-view strip. See [v0.0.9.1 implementation plan](#v0091-implementation-plan) for the shipped model (layered CSS gradient + sun-anchored radial glow) — supersedes the primer's original "single CSS variable interpolated through color ramps" sketch.
- Weather already spatial — storms are currently drawn along edge line-paths; once the route-map panel is a 2D plane, storms should sweep across it as world objects (generalization bundled with v0.0.9.2 per user's intent since the storm data model already supports it).

### new NPC cast (v0.0.9.5 — locked 2026-04-17)

**All callsigns lowercase** matching existing style. New 6: **nu, theta, gamma, lambda, pi, delta**. Total post-.5: **12 NPCs** (6 existing + 6 new).

**Major shifts from the earlier draft of this section:**
- Original plan had 4 corner NPCs = nu/theta/gamma/delta. **Final layout promotes xi to a corner** and introduces **two corner characters not in the earlier plan**: `lambda` (mountain climber — inherits the voice + role originally attributed to "delta") and `pi` (reclusive summit researcher). The identity originally labeled "delta" is now `lambda`.
- `delta` is **reassigned** to a new character: tired/hopeful engineer restoring a weathered dam; gifts are alternative-electricity generation (solar, turbine).
- Gamma's gift chain split: mobile carrier stays with gamma as a two-tier upgradeable item; exoskeleton migrates to pi.

**Map geometry: rounded-square rim with 12 nodes.** 4 corners + 2 rim-side nodes per side. Player starts at tau's node (home).

```
              N side (L→R)
              nu ─── psi ─── iota ─── theta
              │                          │
              rho                        phi
              │                          │
              tau ◄ player start         gamma
              │                          │
              pi ─── lambda ── delta ─── xi
              S side (L→R)
```

**Corner anchors:** `nu` (NW desert), `theta` (NE riverbed), `xi` (SE ruins, promoted from rim), `pi` (SW summit).

**Quadrant identities:**
- **NW** — water scarcity / desert survival (nu, psi's oasis-waypoint guardian framing)
- **NE** — craft + flowing water (theta's clay + pottery, iota's scrubby depot)
- **SE** — decay / ruins + weather + mesa country (phi's mesa-top weather station, gamma's rocky plateau-base workshop, xi's ruined plateau)
- **SW** — mountain + reclaimed-tech (pi's summit radio-tower-lab, lambda's climbing lodge, delta's dam restoration)

**Per-side biome gradients:**
- North (L→R): desert edge → oasis waypoint → scrubby flatland → riverbed
- East (T→B): riverbed → first-tier mesa (phi's weather station atop) → stepped mesa country (gamma at the base) → plateau ruins — **gear-assisted grab mechanic lands in v0.0.9.6** (placed ladder ascends to plateau tops for pkg pickup; placed anchor controlled-descent; no-gear fall = guaranteed trip)
- South (L→R): summit research lab → mountaineer's lodge → weathered dam → ruins
- West (T→B): desert corner → lowland depot → lowland home → mountain base

**Connected elevated backbone:** the east mesa country and the SW mountain cluster form a continuous elevated system across the southern half of the map — gamma's rocky transition at the right-rim-B connects the two. Bottom rim reads as a descent into the dam valley between them.

Bottom rim reads as a **descent through human eras** — pi's contemporary research → lambda's traditional mountaineering → delta's industrial restoration → xi's pre-collapse ruins.

**Full cast — all tier slots locked:**

| NPC | node | t20 gift | t40 gift | notes |
|-----|------|----------|----------|-------|
| rho (ρ) | left-rim-T | boot clip | reinforced soles | existing, relocated |
| iota (ι) | top-rim-R | sandalweed satchel | interwoven lashing | existing, relocated; t40 renamed (was sandalweed poultice) |
| tau (τ) | left-rim-B | traction cleats | gun holster | existing, relocated; t20 renamed (was steady feet) |
| phi (φ) | right-rim-T | weather radio | forecast radar | existing, relocated; t40 renamed (was weather map) |
| xi (ξ) | SE corner | terrain scanner | scannerT2 (gear name TBD) | existing, **promoted rim→corner**; t40 new |
| psi (ψ) | top-rim-L | pocket binoculars | topographic map | existing, relocated; t20 renamed (was scavenger's eye); t40 new |
| **nu (ν)** | NW corner | drip-feed integration | reservoir tank | 🆕 new; t20 migrated from scrip `efficientConsumption` + renamed |
| **theta (θ)** | NE corner | river waders | ceramic wrap | 🆕 new; ceramic wrap = fragile pkgs absorb +1 hit **and** take no water damage during river crossings / fall-downstream incidents |
| **gamma (γ)** | right-rim-B | mobile carrier lvl 1 | mobile carrier lvl 2 | 🆕 new; two-tier upgradeable carrier (wheels; lvl 1 folds to large cargo, lvl 2 to medium + more capacity + battery + traction for wetlands/rivers/mountains) |
| **lambda (λ)** | bottom-rim-ML | mountain gear (ladder + anchor bundled) | improved tie-downs | 🆕 new; t60 backbench: climbing gloves + walking stick |
| **pi (π)** | SW corner | exoskeleton lvl 1 | exoskeleton lvl 2 | 🆕 new; speed ↔ all-terrain order TBD at build; lvl 2 keeps lvl 1 bonuses + adds battery life |
| **delta (δ)** | bottom-rim-MR | advanced solar panel | rainfall turbine | 🆕 new; tier order flexible, pick at build |

**NPC voice locks (new 6):**

- **nu** — cautious, wary of strangers (hard to reach out in the desert); protective; you're a ray of hope on lands most can't trek. Near-parental reminders to drink water.
- **theta** — nurturing and warm, but disciplined and hardworking. Carves clay from the riverbed for pottery (essential regional good). Respected, revered. Makes very good tea.
- **gamma** — tit-for-tat helpful. Hates owing people; goes out of their way to pay back favors. Expects the same from you.
- **lambda** — gregarious mountain climber. Used to risking life and limb on sharp rock faces just to catch a view. Miracle they're still alive, but someone always comes to their aid. Rim-side mentor figure guiding the ascent.
- **pi** — robotic, stiff, absorbed with work. Are they even human? Reclusive summit researcher. Lives in a converted radio tower; focus is the salvaged lab inside, but the tower is still part of the world.
- **delta** — tired, but hopeful. Devoted to restoring the weathered dam. Gladly accepts any assistance thrown their way.

**Existing NPC reframe — psi.** Shifts from "orphan-scavenger at waypoint" to **oasis-waypoint guardian** — same scrappy scavenger core, reframed as someone who helps travelers cross the desert safely. Existing dialogue continuity preserved; new lines lean into the guardian framing.

**Gear-shaped rename pass** — applied across both scrip-purchasable and trust-reward upgrades. Aesthetic goal: *"your gear loadout is expanding,"* not *"you're gaining new abilities."* All id-stable (saves unaffected — only `name:` strings change).

| id | current name | new name |
|---|---|---|
| `cargoWeight` | pack mule rig | **molly netting** |
| `efficientConsumption` | efficient consumption | **drip-feed integration** (also migrates off scrip-shop → nu t20) |
| `sandalEfficiency` | sandalweed poultice | **interwoven lashing** |
| `steadyFeet` | steady feet | **traction cleats** |
| `weatherRadioT2` | weather map | **forecast radar** |
| `scavengerEye` | scavenger's eye | **pocket binoculars** |

**Battery is baseline infrastructure, not a stub.** v0.0.9.5 promotes `S.battery` from the `render/kit.js` stub ("NOT persisted") to a persistent full feature:
- Baseline solar trickle regen (innate, no upgrade required)
- Persist `S.battery` across saves (schema v7→v8 adds the field)
- Delta's advanced solar panel + rainfall turbine modify regen rates (they upgrade the baseline, not unlock it)
- New consumers: pi's exoskeleton, gamma's mobile carrier, xi's scannerT2 — join existing scanner + stickyGun drain pipeline at [main.js:390](js/main.js:390)

**Naming disambiguation note.** `delta` as an NPC name collides with "river delta" in a world with rivers. Dialogue + log authoring should dodge the collision: prefer *"the dam"* / *"the weathered dam"* / *"delta's place"* over *"the delta."* Pi has no analogous collision.

**Design preference: items > skills.** New trust gifts default to physical items (river waders, ceramic wrap, drip-feed integration, reservoir tank, mobile carrier, exoskeleton, mountain gear, solar panel, turbine) rather than abstract skills. Items feel tangible and present-in-the-world.

### sequencing

1. **v0.0.9.1** — renderer audit + day/night cycle (cheap win, confirms the renderer pipeline is still friendly)
2. **v0.0.9.2** — route-map panel becomes a 2D plane: expand panel size, ring laid as a solid-line road on the plane, interior rendered with placeholder texture + distinct landmass boundary, courier position shown as a dot moving along the ring, storm renderer generalized to sweep across the plane. Shelter-emergence polish (typewriter reveal in settlements side panel) rides here. The side-view play-area strip is **not** touched.
3. **v0.0.9.3** — shortcut travel (click-across-ring → interior segment path). Interior rendered but empty.
4. ✅ **v0.0.9.4** — package destination diversification + NPC outbound dispatch. Shipped as two commits: ring-distance-weighted spawn dest picker + 10 niche labels for thin dests (rho A, tau H); trust-scaled NPC outbound dispatch with `+N` origin / `+N+1` dest reward structure. See [v0.0.9.4 implementation plan](#v0094-implementation-plan).
5. ✅ **v0.0.9.4.1** — cursor pickup + drag-drop + ground tooltips + eject-from-cargo. Two scope commits + bugfix cascade. Tooltips via body-portal (#pkgTooltip escapes fieldstrip clipping), in-range cursor-pointer + click-to-pickup + `grab: auto|off` toggle, drag-to-toss with modifier-scaled lost chance, kept pkgs drop at courier cell ±3 (cooldown so auto doesn't re-grab), lost pkgs route through postLostDrop recovery pipeline. Bidirectional cursor pickup, sticky-tooltip reconciliation, button stacking fixes rolled in. See [v0.0.9.4.1 implementation plan](#v00941-implementation-plan).
6. ✅ **v0.0.9.5 — NPC expansion + battery baseline**. Five-commit patch shipped 2026-04-17. (1) Rim reshape + save migration v7→v8: 12-node rounded-square rim with 25px corner arcs, player start at tau, edge-index mapping via snap-to-tau for old saves, Greek-letter nodeIds for the new 6, dest-weight curve extended to 12. (2) 6 new NPCs with ~280 lines of authored dialogue (nu/theta/gamma/lambda/pi/delta) + character-expressive trust profiles for all 12 (veteran/wetland-path/homecoming/stormwise/archivist/wayfinder/guardian/artisan/debt-easer/adventurer/researcher/routine) retiring the default/careful/scavenger generics. Per-NPC state fields persisted for stateful profiles. (3) Battery baseline: innate solar trickle regen peaking at midday, full-idle-day 0→~95 charge; stickyGun decoupled from drain; daylightOf + TICKS_PER_DAY exported as shared source of truth. (4) 13 new trust-reward upgrades across the 6 new NPCs + xi scannerT2 + psi topographicMap; `efficientConsumption` migrated scrip → nu t20 as drip-feed integration with inverse retro-grant for pre-.5 saves; gear-shaped rename pass (6 id-stable display-name changes); real mechanics wired for reservoirTank/solarPanel/rainfallTurbine/scannerT2; flag-only stubs for 9 upgrades gated on v0.0.9.6 terrain/gear. (5) Label pool expansion to 232 labels (from ~110) with fresh 15-23-label pools per new NPC + iota/phi boost + 20 plateau-top-eligible cross-tagged labels restricted to near-start NPC allowlist. See [v0.0.9.5 implementation plan](#v0095-implementation-plan).
7. **v0.0.9.6** — **world patch: terrain bones + gear + world-overlay + trails** (merged from old .5 + .6; design refined 2026-04-17). **Idle-game-first philosophy: no hard gates on traversal — gear is efficiency, never requirement.** Terrain types anchored at v0.0.9.5 corner NPCs: rivers (theta NE source, flow diagonally SW, clay beds in `#98875f` / `#a64a2e`); mountain massifs at SW corner (pi's summit area + lambda's slope), severe penalty but always traversable, some "steep pitch" cells tagged for 2-chained-ladder coverage; **plateau / mesa country** (east side between theta and xi) — visual obstacles with walkable paths carved between, plateau tops gated by placed ladder for pkg-top rewards, placed anchor for controlled descent else fall-as-guaranteed-trip; rocky hills as connective tissue between SW mountains and east mesas (through gamma's right-rim); desert at nu's NW with day-scaled stamina drain. Rivers classified creek (1 cell, ladder-bridgeable or anchor-crossable) / river (1-2 cell, both options) / wide river (3+ cell, ladder bridge only); **failed no-gear crossings trigger fall-and-ride-downstream failure mode** — courier swept downstream ~5-10 ticks, catches themselves, pathfinding auto-reroutes to original destination. Shortcut mechanic rewrite: flat SHORTCUT_STAMINA_MULT / SHORTCUT_TRIP_MULT retired in favor of per-cell terrain effects. Interior brought on-grid (weather + scanner + river-refill + terrain effects active during shortcut; pkg pickup in interior stays off pending .7+, except plateau tops). Ladder + anchor as kit-bar gear (1×1 slots each, bundled 1-5/6-10/11-20 = s/m/l slot; 5c each; ~12h wall-clock base durability, lambda's mountain gear ×2 → 24h; spatial storm-at-gear-cell decay ×3; visible wear states). Mountain penalty: 2.0× trip / 1.5× stamina base; placed ladder reduces ascent-cell penalty toward 1.5×/1.25×; placed anchor reduces descent-cell penalty same. **All gear is placed** (no held/in-use model) — anchor at shore creates rope spanning river (up to 2 cells per anchor; wider requires bridge); rope retracts to anchor after each crossing; chained ladders share one decay clock as atomic multi-cell infrastructure. Placement consumes inventory + creates world-overlay structure usable by others. Trails land with shared world-overlay data plumbing — per-cell trample value, save-stored + multiplayer-synced, virgin terrain costs more than walked-in paths, emergent social paving. Mountain-pass carving as natural extension. Storms sweep across 2D interior (not just ring); spawn frequency 2×; multiple concurrent storms; combine/intersect logic stubbed for future. Ceramic wrap (theta t40 from v0.0.9.5) waterproofs fragile cargo during river crossings + fall-downstream incidents. See [v0.0.9.6 implementation plan](#v0096-implementation-plan).
8. **v0.0.9.7** — polish slot. Queued items (locked 2026-04-18 during v0.0.9.6.5 review):
   - **Kit-bar reorder.** Move ladder + anchor capsules next to the auto-gear toggle (gear + its toggle clustered together). Move sticky gun to the front of the bar — it's a tactile tool, not an electronic one, so it reads better alongside battery.
   - **Ladder glyph rework.** `‐‐` reads as a dash more than rungs; need a better glyph for "ladder" that isn't already used.
   - **Map structure sizing.** Ladders + anchors render too large on the route map for "minor placed structures" — they should be visibly smaller than NPC nodes / ring segments.
   - **Auto-button visual consistency.** Pattern is dashed cyan when on, faded when off; current `.kit-auto-btn` has it inverted (dashed when off). Align with `grab: auto` / `drink: auto` styling. Rename `auto-gear: on` to split into per-function toggles if needed (user flagged `autodrink: on` as the clearer pattern — `auto-gear` / `auto-drink` / `auto-grab` etc).
   - **Repeated-message log compression.** Log already has `×N` repeat collapsing for identical messages. Some event messages (sandalweed harvest especially) include inline counts that break the dedup key — `"harvested sandalweed (3/5)"` never matches `(4/5)` so they don't compress. Rework those messages to move the variable count out of the dedup-checked text so repeats collapse.
   - **Ground-strip thick climbing animations** (from commit 3 deferrals). Vertical `@` baseline shift on mountain ascent, ladder rung overlays, rope render for anchor-descent, fall animation on plateau-descent without anchor. Pairs with the parked destDrift / scene-backdrop rework since both touch the side-view motion model.
9. **v0.0.9.8** — dispatch log virtualization + significance-tagged persistence (benched here during .3.1 planning). Windowed DOM render backed by an unbounded `_transient.logHistory`; significant events (deliveries, trust unlocks, discoveries, milestones, trip losses, in-progress pickups, etc.) tagged at `addLog` time and persisted into `S.log` so a player can scroll back through a courier's journey across sessions. Slotted after NPC + world work so the significance taxonomy can fold in the .4-.6 event vocabulary (new NPC dialogue, terrain-specific events, new trust gifts) before the journal starts persisting — bigger patch when picked up, much richer persistent journal. All .3.1 design decisions (window sizing, scroll-pinning, persisted cap, pickup-on-inventory, prior-session separator) remain locked; only the taxonomy list needs an audit-and-expand pass before building. See [v0.0.9.8 implementation plan](#v0098-implementation-plan).
10. **v0.0.9.9+** — balance, dialogue polish, mountain-pass-carving tuning, deferred tail. Final polish pass across the whole v0.0.9 arc.

Each patch ships independently playable; no later patch is gated on the next.

### open design questions (v0.0.9, unresolved)

**Resolved 2026-04-17 during v0.0.9.5 cast lock:**
- ~~Walking stick mechanic~~ — backbenched to t60 for lambda alongside climbing gloves; mechanics pick at t60 build time.
- ~~Delta's lost-idea gift~~ — moot: `delta` has been reassigned entirely to a new character (dam engineer, solar + turbine gifts). The "mountain climber delta" identity moved to `lambda`.
- ~~xi tier for terrain map~~ — moot: terrain map reassigned to psi's t40 (as topographic map); xi's t40 becomes scannerT2 instead.

**Still open (v0.0.9.5 build-time picks):**
- **scannerT2 gear name.** "Upgraded terrain scanner" is a level, not gear. Candidates: signal dish, repeater array, resolution lens, calibration plate. Pick at build.
- **pi exoskeleton tier order.** Two variants (speed, all-terrain) across t20+t40; lvl 2 keeps lvl 1 bonuses + adds battery life. Which variant is t20 vs t40 — pick at build.
- **delta tier order.** Advanced solar panel vs rainfall turbine — which is t20 vs t40. Don't care; pick at build.
- **Climbing gloves + walking stick mechanics.** Both on lambda's t60 backbench. Mechanics open; pick at t60 build time.
- **Gamma mobile carrier lvl 2 traction tuning.** Lvl 2 lets it travel across wetlands / rivers / potentially mountains — specific multipliers tune empirically once lvl 2 is in hand.

**Still open (beyond v0.0.9.5):**
- ~~Ladder/anchor decay numbers~~ — **locked 2026-04-17**: base 12h wall-clock, lambda's mountain gear ×2 → 24h, spatial storm-at-gear-cell ×3 decay. Pricing locked at 5c each, ~50c full mountain loop raw.
- **Weather modifier on decay — v0.0.9 or v0.0.10?** Storm system is already spatial so the accumulator is cheap, but it adds tuning surface. Probably stub the field in v0.0.9 and activate in v0.0.10 alongside real shelters.
- **Trail decay schedule.** Stubbed for v0.0.9; revisit when trails have been playable long enough to read feel. (Per-biome rates — wetland fast, desert slow — was discussed but deferred.)
- **Interior size confirmation.** ~Same as ring (~1,560 cells) was the rough answer; rounded-square with ~24-cell inradius lands close. Confirm when drafting v0.0.9.2.
- **psi t40 was empty until this patch** — now filled with topographic map; no action. (Logged for completeness — future-you won't wonder why the old cast tables had a hole.)
- **Visibility sharding trigger.** User stated "~10 active players." Build sharding-compatible data shapes now (canonical IDs, wall-clock timestamps), implement the filter function when player count reaches the trigger.

### how v0.0.8 sets up v0.0.9 work

- **Dest-tagged labels** (v0.0.8.1) — already support pkg destination diversification without data work; roller-side change only.
- **Spatial storms** (v0.0.8.7) — weather already lives as world objects (`_transient.storms[]`); generalizes to 2D with minimal rework. Storm-exposure accumulator for structure decay is a few lines on top.
- **Trust + reward scaffolding** (v0.0.8.6) — `onTrustUnlock` dispatcher + retro-grant for existing saves is directly reusable for 4 new NPCs. Pattern is proven.
- **NPC addition pattern** (v0.0.8.4 — phi/xi/psi) — NPC def + NPC_LINES entry + trust profile + label pool rewrite. Replicates cleanly for the 6 new NPCs in v0.0.9.5 (nu / theta / gamma / lambda / pi / delta).
- **Package architecture** — `PKG_LABELS_BY_SIZE[size][].dests` shipping manifests are ready; new NPC label pools can be authored alongside dialogue.

### notes on existing "longer-horizon features" entries (stale)

The [longer-horizon features](#specs-longer-horizon-features) section contains entries that v0.0.9 partially or fully obsoletes:
- `terrain types (v0.0.8 scope)` → now v0.0.9, sketched above
- `bigger map (v0.0.9 scope)` → superseded by rounded-square reframe
- `structures (v0.0.9 scope)` → moved to v0.0.10; v0.0.9 lands only the persistence foundation via ladders/anchors
- `day/night cycle` (in post-v0.1 parking lot) → pulled forward to v0.0.9.1

Clean up those entries when the v0.0.9 work starts so the doc stays coherent.

---

## v0.0.9.1 implementation plan

Locked 2026-04-16 after an interactive mockup pass at [tlh-daynight-mockup.html](tlh-daynight-mockup.html). Keep the mockup alongside the shipping code so visual parity can be checked per commit.

### thesis

Add a day/night cycle to the **play-area side-view strip** (`.tlh-viewport`), not the route map. The courier `@` gets a sky overhead: sun arcs by day, moon (with phases) arcs by night, stars emerge in between, and the backdrop paints itself through a cool base gradient that gets a **sun-anchored warm radial glow** at sunrise/sunset. No mechanical hooks yet (NPC sleep, night trip bonus, storms-worse-at-night all deferred) — this is atmospheric only.

### spec evolution from the thread primer

The primer originally framed this as "single CSS variable `--tlh-daylight` interpolated through dawn/day/dusk/night color ramps." That framing is superseded:

- **Not a CSS-var-driven color interpolation.** Backdrop is painted by JS each tick via a layered CSS gradient (`linear-gradient` base + `radial-gradient` overlay during warm windows). `--tlh-daylight` still exists as a 0..1 signal but for any future consumer that needs a single scalar — the sky itself is richer than one variable can express.
- **Not the route map.** The route panel is reserved for route-relevant info (storms, terrain). Route-map sky glyph (a small sun/moon indicator) is deferred.
- **Backdrop is not static.** Mockup explored a "backdrop stays `#081f1e`, only celestial bodies move" version; discarded once we tried painting the sky with the extended palette. Final plan paints the sky.

### mockup-established visual direction

- **Sun + moon are the same radius** (real-scale, future-eclipse-ready). Moon carved via an offset backdrop-colored shadow circle.
- **Moon phases** on a 7-in-game-day cycle (~2 real-time hours). 7 as a constant; 4 / 12 are easy alternates if we want to tune.
- **Stars**: ~14–18 procedurally-placed dots in the upper ~65% of the strip. Calmer flicker than the first pass — ~40% are "steady" (no flicker), rest have reduced-amplitude slow sine variation. Shared slow horizontal drift. Mix of `y` (dim) and `Y` (bright).
- **Cool base gradient** (vertical, 4 stops, full-width, always on):
  - Night stops → current `#081f1e` blend
  - Day stops → lifted teal (slightly lighter at bottom)
  - Cool blue hour → `b`-tilted azure stack, fires between warm window and night/day
- **Warm radial overlay** (only during sunrise/sunset):
  - Anchored at the sun's current horizon x position (ellipse center at `{sunXPct}% 100%`)
  - Stops, centered outward: orange (`O` hue) → pink/peach → dark magenta (`m` hue) → transparent
  - Cool base shows through everywhere the radial is transparent
  - Directionally correct: left at sunrise, right at sunset, no glow during moon arc
- **Timing**: warm window peaks while the sun is **visibly low** (tick ~80 sunrise, tick ~1435 sunset), not right at the invisible horizon edge. Cool blue hour peaks between the warm window and full day/night (~tick 240 dawn, ~tick 1560 dusk). Sunrise and sunset bells are **separate** — tunable independently so sunrise can read paler/cooler than sunset later.
- **Day length**: `TICKS_PER_DAY = 1500` (~8.75 min at 350 ms/tick). Sun arc: tick 0–750. Moon arc: tick 750–1500. Faster than the mockup's initial 3000; the slower pace made per-frame motion too subtle to read.
- **Dawn start**: new saves begin at tick 0 (dawn). Existing saves resume from their current `S.ticks` — the phase has always been there, it just wasn't rendered.

### rendering model (concrete)

Per-tick JS computes four signals from `S.ticks`:

| Signal | Source | Drives |
|---|---|---|
| `daylight` (0..1) | half-sine across sun arc, 0 during night | night↔day base-stop lerp; star visibility; sun/moon opacity |
| `coolBias` (0..1) | bell-curve peaks at tick 240 + 1560 | base gradient's mix toward `STOPS_COOL` |
| `warmBias` (0..1) | bell-curve peaks at tick 80 + 1435 (separate per direction) | radial overlay alpha |
| `sunXPct` (0..100) | sun's horizontal position during arc, clamped off-arc | radial ellipse center-x |

Backdrop = `warmOverlay + ', ' + coolBaseGradient`. `coolBaseGradient` is always present; `warmOverlay` is only appended when `warmBias > 0.01`.

### scope — what ships in v0.0.9.1

- `js/render/sky.js` — new module. Exports `initSky()` (creates star + sun + moon SVG elements, seeds star positions session-scoped) and `renderSky()` (called per tick from main loop).
- `js/main.js` — call `renderSky()` from the tick loop. Call `initSky()` after els wiring.
- `the-long-haul.html` — add sky layer element inside `.tlh-viewport`, subtitle bump to `v0.0.9.1`.
- `the-long-haul.css` — palette CSS variables for the three new additions (O, B, b). Optional: `--tlh-daylight` as a published var set by sky.js for any future consumer.
- No save-schema bump (derived entirely from `S.ticks`).
- No changes to weather / storm rendering.
- No changes to the fieldstrip / destDrift / courier / rain layers.

### scope — explicitly deferred (not in .1)

- **Storm/rain layer interaction with sky.** Currently rain renders over a clear sky, showing stars through raindrops. Looks off but is not a regression — revisit during the weather/storm renderer generalization that v0.0.9.2+ will need for the 2D viewport. Note this clearly in the commit message so nobody thinks it's a bug we missed.
- **Route-map sky glyph** (small sun/moon indicator on the route panel). Deferred indefinitely; the route map stays reserved for route-relevant info.
- **Shelter-emergence polish.** Stage-2 → stage-3 settlement reveal is still a dry className swap. Lands in v0.0.9.2 alongside the viewport rework.
- **Ground-strip terrain variety.** Current single-line `. , ; -` ASCII is thematic but flat. Terrain variety lands in v0.0.9.6 (desert / rocky hills / rivers / mountains; terrain moved from old .5 slot during the .4.1 planning swap).
- **Scene backdrop + destDrift rework.** The destination-sliding-past-the-courier effect doesn't physically make sense; eventual direction is per-destination backdrop polish + character animations + ruined-ASCII environments. Parked; candidate for a dedicated polish pass after v0.0.9.7.
- **Richer warm palette.** The warm radial uses O/m/M as the three warm colors. A fuller sunset palette (e.g. adding a dedicated peach or salmon) is aspirational — the current set is enough for a convincing first pass.

### audit findings (the "renderer audit" deliverable)

Things the audit surfaced that are **not in .1 scope** — recorded here so they don't get forgotten:

1. **Shelter emergence is a dry swap** → v0.0.9.2.
2. **Fieldstrip terrain is one-line and invariant** → v0.0.9.6 (was old .5 slot; terrain moved during the .4.1 planning swap).
3. **destDrift right-to-left animation is cosmetic filler, not a physical fact** → post-.7 polish.
4. **Storm renderer is tied to edge linear path**; needs to sweep across the map once 2D lands → v0.0.9.2 weather rework.
5. **Hardcoded colors throughout the stylesheet.** Only the new palette additions (O/B/b) get CSS variables in .1; broader CSS-var refactor is not justified yet and would swell scope.

### palette additions

New CSS custom properties + formalization in the site palette. `m` (`#b154cf`) and `M` (`#da5bd6`) are already used elsewhere on the site — they're not new, just being reused for sky work. These three **are** new:

| Var | Hex | Purpose |
|---|---|---|
| `--tlh-O` | `#e99f10` | orange — warm radial core (sunrise/sunset glow) |
| `--tlh-B` | `#0096ff` | azure — reserved for future bright-blue sky work (not used in .1 directly) |
| `--tlh-b` | `#0048bd` | dark blue — cool blue hour stack top |

Source reference: Caves of Qud color table (per user).

### follow-ups noted inline in shipping code

These are intentional TODO markers to land in the .1 code:

- **Moon shadow fill must sample the base gradient at moon's current `cy`** (not a fixed stop). User explicitly flagged this during mockup review. Fix is small — compute a per-stop lerp at moon's y-fraction and use that RGB for the shadow circle's fill. Without it, the crescent carve reads wrong when the moon is in the lower half of the gradient.
- **Sunrise vs. sunset stop decoupling.** Bells are separate but the stop colors are currently identical. Leaving the hook in place for a future-pass sunrise-paler-than-sunset tune.

### commit sequence (tentative)

Small enough to ship as a single commit, but if it splits:
1. palette additions + subtitle bump + sky layer DOM scaffolding in html/css
2. `js/render/sky.js` + main tick wire-up

Subtitle bump rule (per feedback memory): the patch version in [the-long-haul.html](the-long-haul.html) must bump to `v0.0.9.1`, not just the commit message.

---

## v0.0.9.2 implementation plan

Shipped 2026-04-16 across a batch of small commits (see `git log` between `0852f8d` and `d576e43`). Planned via an interactive mockup pass at [tlh-routemap-mockup.html](tlh-routemap-mockup.html), then iterated in-browser through visual feedback. Several decisions shifted from the original plan during that iteration — captured below alongside what actually shipped.

### thesis

The **route-map panel** (previously a small 6-node SVG ring) became a 2D plane. The ring stays canonical — it's now a solid road laid on that plane. Interior of the ring is visible as "crossable space" via a dotted placeholder texture. The side-view play area (`.tlh-viewport` where `@` walks with its sky layer from v0.0.9.1) was not touched.

### what shipped

- **Flat plane** — no landmass fill, no void distinction, no panel border. Panel's `--tlh-k` bg shows through uniformly. First mockup pass tried a soft landmass fill; user called it "constraining," and the flat plane reads more open.
- **Texture delineates crossable space** — dim `.` / `,` / `·` glyphs populate *only* the interior of the ring polygon (point-in-polygon test against current node positions). Absence of texture outside reads as "uncrossable" without needing a drawn boundary. Re-generated procedurally per session (session-scoped RNG seeded at 9111).
- **Ring as solid-line road** — dashed stroke removed, replaced with a solid line, stroke-width 1.5, stroke-linecap round. Literal ASCII road glyphs land in the later structures patch.
- **Node glyphs refreshed**: `?` → **φ** (phi, weather station NPC); `·` → **ψ** (psi, orphan-scavenger NPC). α / β / γ / η unchanged. Matches the v0.0.8.4 identity patch.
- **Courier on 2D map** — dot moving along the ring road (interpolated edge + dotT, radius bumped from 3 → 4.5 for readability). No trail yet; trail design lands with v0.0.9.3.
- **Panel shape** — viewBox **400×400 square** (shifted from the plan's ~280×280 sketch and an in-between 400×240 landscape attempt, both of which got vetoed during iteration). Aspect-ratio 1/1. Right column widened 140 → 320 px over several tunings.
- **Hexagonal node layout** — all nodes pulled inward from viewBox edges (max x = 310, min x = 90) so the longest settlement label ("weather station") wouldn't risk clipping the panel edge. Centroid `RING_CX / RING_CY = (200, 200)`.
- **Label placement shipped differently than planned** — first tried radial-from-centroid (labels extending away from ring center). Tested OK with short labels but "weather station" at 15 chars still overflowed on the right edge even at x=310. Shipped final: labels stack **vertically above (upper-half nodes) or below (lower-half nodes)**, centered on node x. Length-independent — any label fits regardless of width.
- **Readability pass** — node radius 5 → 8 (current-edge 7 → 10), glyph font 8 → 13, label font 7 → 11. All tuned for the 302×302 rendered display.
- **Right-column reflow** — network + channels wrapped in a new `.tlh-info-row` flex container and placed side-by-side under the route map instead of stacking vertically. Order: **channels then network** (left to right). Each panel `flex: 1 1 0; min-width: 0` so narrow content wraps cleanly. `.chan-text` clamps at 3 lines (webkit line-clamp + ellipsis) so long NPC chatter doesn't balloon panel height. `.net-silent-btn` got `flex-shrink: 0` + nowrap + tighter padding so the online/offline toggle doesn't overflow.
- **Typewriter settlement emergence** — when `setNodeStage(id, 3)` fires, main.js calls `startEmergence(id)` which pushes an entry into `S._transient.emergingSettlements` (Map, not persisted). [settlements.js](js/render/settlements.js) reads that map each render and if a settlement is mid-reveal, shows partial name + blinking caret + subtitle "revealing" instead of the final form. Chars advance at 1 per game tick (~350ms). Main.js tick calls `renderSettlements()` every tick while `hasActiveEmergence()` so the animation drives visibly. Self-clears when complete.
- **Storm renderer generalization** — reused existing `cellToSvg()` mapping; with the new node layout, storms automatically render against the 2D plane. Sigma scale bumped from 0.35 / 0.40 → **0.60 / 0.68** for the wider viewBox; `traceContour` march radius 80 → 130 so outer contours don't clip on heavy storms. Full 2D storm physics (free XY drift away from the ring) stays deferred — needs new storm fields + rewrite of `intensityAtCell`.

### site-level changes that landed alongside

Captured separately in [HANDOFF.md](HANDOFF.md) to keep this doc game-focused. Summary:
- Site-wide custom scrollbar styling in [nav.css](nav.css) (teal palette).
- [the-long-haul.html](the-long-haul.html) `<div class="nav-offset">` wrapper removed — `nav.js` auto-wraps the site in one already, the hardcoded one was double-applying `margin-left: 180px` and leaving ~180 px of dead air left of the game. Site-level concern; any other page hardcoding `.nav-offset` would hit the same bug.

### scope — explicitly deferred

- Literal ASCII road glyphs on the ring → future "structures" patch.
- Real terrain types (rivers / mountain massifs / rocky hills / desert) → v0.0.9.6 (shifted from old .5 during the .4.1 planning swap).
- Terrain depth/height visualization → later than .6, or its own pass.
- Click-across-ring shortcut travel → v0.0.9.3.
- Interior trails (save-stored, multiplayer-synced) → v0.0.9.6.
- Rounded-square rim with 6 new NPCs + xi corner promotion → v0.0.9.5 (pulled forward from old .7 during the .4.1 planning swap so terrain at .6 can anchor at them; cast + geometry locked 2026-04-17).
- Full 2D storm physics (free XY drift) → future patch after .2.
- Expandable isobar legend bar in the route-panel — currently feels cramped at the new route-map size. Revisit alongside the storm/weather rework.

### follow-ups recorded for future work

- **Trust reward delivery via shop, not auto-grant.** Current `onTrustUnlock()` in [trust.js](js/trust.js) auto-sets `S.upgrades[def.id] = true` and runs `def.apply()` the instant a trust threshold crosses. User's preferred model: tier unlocks should *list the upgrade in the shop* for the player to claim, with unique NPC flavor lines per reward. Gives the moment weight and makes the NPC narratively present. Worth a memory entry so future patches touching trust-reward paths default to the shop shape.

### files touched (what actually got written)

- [js/render/route-map.js](js/render/route-map.js) — full visual pass
- [js/render/settlements.js](js/render/settlements.js) — `startEmergence`, `hasActiveEmergence`, typewriter logic
- [js/state.js](js/state.js) — `emergingSettlements: new Map()` added to `_transient`
- [js/main.js](js/main.js) — `startEmergence(arrivedAt)` after stage-3 transition; per-tick render-drive of emergence; viewport/skySvg in `resolveEls`
- [the-long-haul.html](the-long-haul.html) — `#routeSvg` viewBox + aspect-ratio, subtitle `v0.0.9.1 → v0.0.9.2`, info-row wrapping (channels before network), nav-offset removal
- [the-long-haul.css](the-long-haul.css) — `.tlh-layout` column sizing, `.tlh-info-row` flex, `.settle-emerging` + `.settle-caret` + blink keyframe, `.net-silent-btn` tightening, `.net-ptitle > span` ellipsis, `.chan-text` 3-line clamp
- [tlh-routemap-mockup.html](tlh-routemap-mockup.html) — visual reference mockup, kept in-repo alongside `tlh-daynight-mockup.html`
- No save-schema bump

---

## v0.0.9.3 implementation plan

Shipped 2026-04-16 as a single commit (`d680823` on `claude/stoic-jepsen`). Planned via a focused mockup pass at [tlh-shortcut-mockup.html](tlh-shortcut-mockup.html); the mockup resolved interaction + visual direction before any production code.

### thesis

The ring stops being the only route. **Clicking a non-adjacent node on the 2D route-map cuts the courier through the interior** instead of sending them around the ring. Opens up route-planning as an active gameplay loop: default = walk the ring clockwise delivering packages as you go; shortcut = trade skipped delivery opportunities for speed. With package destination diversification (v0.0.9.4) right behind this, the shortcut gains concrete gameplay weight — packages for nodes you'd skip become a real tradeoff.

### data-model shift: "option (c) thin segment shape"

Introduces `S._transient.currentSegment = { from, to, type: 'ring'|'shortcut', edgeIdx, pathFn, length }` as the source of truth for "which leg is the courier walking now." `S.edgeIdx` stays valid for ring segments (matches `currentSegment.edgeIdx`); shortcut segments carry `edgeIdx = -1`. `currentEdge()` in `route-map.js` now derives from `currentSegment` so every downstream caller (weather, packages, route-dot render, destDrift) keeps working.

Considered two alternatives during the design discussion:
- **(a) Shortcut-override pattern** (keep `edgeIdx` as ring driver, add a transient shortcut override) — simpler but creates two parallel traversal states; didn't prime the primer's longer-term segment-list direction.
- **(b) Full path-list refactor** (`S.path = [{...}, ...]` replacing `edgeIdx`) — cleanest match for the primer but bigger blast radius across every edgeIdx caller.

(c) got the segment shape into the codebase now; (b)'s full path-list is the natural upgrade when v0.0.9.6 adds persistent multi-segment paths + trails.

### what shipped

- **Click a non-adjacent node → shortcut.** Adjacent (next / previous clockwise on the ring) and self-target clicks rejected; tooltip shows the rejection variant.
- **Natural curve path.** Quadratic bezier between endpoints; one control point offset perpendicular to the straight line by 18% of segment length. Bow direction deterministic based on which side of the line the ring's centroid sits on.
- **Courier traverses the curve** via `pathFn(S.dotT)`. Existing distance/stamina accumulators reuse — `updateRouteDot()` just samples the segment's pathFn at current dotT.
- **Dotted fading trail** drops a cell every `TRAIL_DROP_EVERY = 3` ticks while on a shortcut. Each cell has an `age` counter, opacity = `max(0, 1 - age/TRAIL_FADE_TICKS)`. `TRAIL_FADE_TICKS = 300` (~105s at 350ms/tick). Session-only — persistent multiplayer-synced trails land in v0.0.9.6.
- **Live tooltip on hover.** Target glyph/label + "via ring: X km" + "via shortcut: Y km" + "shortcut saves (X-Y) km · click to cut across". Re-renders every tick while hovered so distances stay current as the courier moves. Adjacent / target-of-current nodes show a different variant (no CTA).
- **Faint dashed shortcut-curve preview** while a shortcut is active, showing the remaining path.
- **Mid-transit replan.** Clicking a new target mid-shortcut computes a fresh bezier from the courier's current xy (not the original start node) and resets dotT to 0.
- **Arrival.** Both ring and shortcut arrivals fire the normal handlers (setNodeStage / tryDeliver / tryWarning / emergence typewriter / NPC trust / t60 battery charge / etc.). After arrival the next segment is the ring edge clockwise from the arrived node.

### interior = off-grid during shortcut

While `currentSegment.type === 'shortcut'`:
- Weather lookup, wetland refill, river refill, package scan-for-pickup, scanner tick — all gated behind `!isOnShortcut()` in [main.js](js/main.js) tick.
- In [trip.js](js/trip.js), the cell-indexed risky-cell + weather trip multipliers are skipped; replaced by the flat `SHORTCUT_TRIP_MULT` tax.

Clean boundary — interior is genuinely empty of game content until v0.0.9.6's terrain bones + trail overlays fill it in (both previously split across .5 + .6; consolidated into .6 during the .4.1 planning swap).

### cost tax during shortcut

Small flat bump primes v0.0.9.6's virgin-cell cost curve:
- **`SHORTCUT_STAMINA_MULT = 1.20`** (stamina drain per tick)
- **`SHORTCUT_TRIP_MULT    = 1.50`** (trip chance roll)

Numbers chosen so shortcuts remain viable (player still wants them for distance savings) but the ring keeps reason-to-exist. When v0.0.9.6 adds persistent trample, these same numbers become "virgin-cell cost" and scale down as trample accumulates — no redesign across patches.

### files that got written

- [js/state.js](js/state.js) — `S._transient.currentSegment`, `trailCells`, `hoveredNodeId`, `hoveredPx`.
- [js/constants.js](js/constants.js) — `SHORTCUT_STAMINA_MULT`, `SHORTCUT_TRIP_MULT`, `TRAIL_FADE_TICKS`, `TRAIL_DROP_EVERY`, with comments flagging the v0.0.9.6 trample-decay lineage.
- [js/render/route-map.js](js/render/route-map.js) — full segment abstraction: `makeRingSegment` / `makeShortcutSegment` factories, `currentEdge()` derived from `currentSegment`, `updateRouteDot()` uses `pathFn(S.dotT)`, new exports `initSegment` / `advanceSegmentAfterArrival` / `startShortcut` / `getCurrentSegment` / `isOnShortcut` / `bindRouteInteractions` / `tickRouteInteractions`. Click / mousemove / mouseleave handlers attached once via event delegation on `#routeSvg`. Live tooltip renderer. Shortcut-curve preview renderer. Trail dot renderer + per-tick aging + purge.
- [js/main.js](js/main.js) — tick's arrival logic now calls `advanceSegmentAfterArrival()` instead of advancing raw `edgeIdx`; pickup / weather / wetland / scanner all gated behind `!isOnShortcut()`; stamina drain multiplier applied; `tickRouteInteractions()` called every tick. Init calls `initSegment()` + `bindRouteInteractions()` after `loadGame`.
- [js/trip.js](js/trip.js) — shortcut trip-chance multiplier; risky-cell + weather multipliers moved inside `!isOnShortcut()` branch.
- [the-long-haul.html](the-long-haul.html) — subtitle bump to `v0.0.9.3`; absolute-positioned `<div id="routeTooltip">` near the end of the body.
- [the-long-haul.css](the-long-haul.css) — `#routeTooltip` styling: teal-palette panel, `.tip-label` / `.tip-row` / `.tip-cta` / `.tip-dim` variants.
- [tlh-shortcut-mockup.html](tlh-shortcut-mockup.html) — visual reference mockup committed alongside the sky + routemap mockups.
- **No save-schema bump.** All new state is `_transient`.

### minor divergence from plan

- `currentCellIsRisky()` call moved inside the `else` branch in `tripChance()` (wasn't explicitly called out in the plan but required for clean off-grid semantics — cell-indexed risk is meaningless during shortcut).
- Tooltip hover used event delegation (single listener on `#routeSvg`) rather than per-node listeners — marginally cleaner, same UX.
- Shipped as one focused commit rather than splitting into three as the plan suggested — the changes were coupled enough that splitting wouldn't have given independent verifiable checkpoints.

### scope — deferred

- Persistent multiplayer-synced trails with trample mechanics → v0.0.9.6.
- Real terrain types inside the interior (rivers, mountain massifs, rocky hills, desert) → v0.0.9.6 (shifted from old .5 during the .4.1 planning swap).
- Mountain passes + ladder/anchor placement → .6.
- Full path-list data model (routes as arrays of segments, multi-hop planning) → v0.0.9.6 when it becomes load-bearing.
- Shortcut via multiple segments in sequence (e.g., "shortcut through two interior nodes") — .3 ships single-segment shortcuts only.

---

## v0.0.9.4 implementation plan

Shipped 2026-04-16 as two commits on `claude/angry-lehmann` (`d3d14c2` dest-div backend + niche labels, `757d038` NPC outbound dispatch). The plan below was drafted during the v0.0.9.3.1 design walkthrough; everything listed shipped as-specified with no divergences.

### thesis

Delivers on v0.0.9.3's shortcut travel promise: package destinations stop defaulting to the edge endpoint. World-spawn destinations follow a **ring-distance-weighted curve** (mostly next shelter to keep idle play functional, some medium hauls, rare backwards); the existing `PKG_LABELS_BY_SIZE[size][].dests` identity tagging from v0.0.8.1 handles label flavor automatically. Paired with **NPC outbound dispatch** — trust-reward NPCs hand out packages on arrival, story-compatible labels matched via `dests[]` overlap.

After .4, the shortcut becomes a real decision: a pkg destined for a node you'd skip creates the "carry via ring or cut across" tradeoff that v0.0.9.3 was priming.

### dest-div: ring-distance-weighted picker

Replace the `destId = S.edges[edgeIdx][1]` at [world.js:48](js/world.js:48) with a new `rollDestForSpawn(spawnEdgeIdx)` helper. Weights relative to the spawn edge's endpoint on the ring `A → ? → B → C → H → · → A`:

| Relative dest | Meaning | Weight |
|---|---|---|
| edge endpoint (+0) | next shelter, delivered this leg | 40 |
| +1 past endpoint | one extra leg | 25 |
| +2 past endpoint | two more legs | 15 |
| +3 past endpoint | halfway around | 10 |
| +4 (≡ −2) | two legs back | 5 |
| +5 (≡ −1) | one leg back | 5 |

Implementation: weighted pick over offsets `[0..5]`, compute node ID via `(spawnEdgeEnd + offset) % 6` on the node order, pass to existing `rollPkg(destId, cellRisky, forceLost)`. Existing label filter (`l.dests.includes(destId)`) unchanged — data flows naturally through the v0.0.8.1 roller.

**Fallback:** if the rolled dest has zero label candidates at the rolled size (shouldn't happen after the niche audit but defensive), re-roll once to +0 which always has label coverage.

**Tuning flag:** the 40/25/15/10/5/5 curve is sized for the current 6-node ring. When v0.0.9.5 adds 6 new NPCs and the rim expands to ~10-12 nodes (moved from old .7 slot during the .4.1 planning swap), this distribution needs recalculation to preserve the forward-bias shape across longer distances.

### label-pool niche audit

Single-dest identity inventory at .4 plan time:

| Dest | NPC | Single-dest label count | Needs additions? |
|---|---|---|---|
| A | rho (depot) | 2 | ✅ 5 more |
| B | iota | 6 | — |
| C | xi (ruins researcher) | 11 | — |
| H | tau (home / sibling) | 2 | ✅ 5 more |
| ? | phi (weather) | 9 | — |
| · | psi (scavenger) | 10 | — |

10 new labels to add in [data/packages.js](js/data/packages.js):

**A (rho — depot, logistics):**
- s: `dispatch ticket` (A), `waybill` (A)
- m: `logbook bundle` (A), `depot stamp kit` (A)
- l: `pallet jack wheels` (A)

**H (tau — home, sibling warmth):**
- s: `family letter` (H), `knit gloves` (H)
- m: `preserves jar` (H), `family photos` (H)
- l: `heirloom chest` (H)

### NPC outbound dispatch

Trust-reward NPCs offer a package on arrival. Offer chance scales with trust; per-lap cooldown prevents spam.

**Who:** All 6 current NPCs (rho / iota / tau / xi / phi / psi).

**When:** On arrival at any NPC node, if:
- `npc.trust >= OUTBOUND_MIN_TRUST` (floor: 5 — avoids brand-new NPCs spontaneously dispatching)
- `!S._transient.outboundOffered[nodeId]` (cleared when courier passes a lap-boundary leaving that NPC's zone)
- Cargo has room for the offered pkg

**Offer chance:** `OUTBOUND_BASE_RATE * (trust / 100)`, clamped `[0, 0.8]`. At trust 25 → 20% chance per arrival; trust 50 → 40%; trust 100 → 80%.

**Label + dest pick:**
1. Roll size (same weighted pick as world-spawn; no risky-cell bump since arrival cells aren't risky).
2. Filter `PKG_LABELS_BY_SIZE[size]` to labels where `dests.includes(originNodeId)` **AND** `dests.length >= 2` — "xi's vocabulary, with somewhere to send it."
3. Pick label uniformly.
4. Pick destination: other nodes from the label's `dests` (exclude origin). Weight by the same ring-distance curve as dest-div so outbound naturally favors short hauls with rare cross-map sends.

Explicit preferred-partner tables (rho → H, xi → B, etc.) deferred to a later polish pass — user call was "not really sure on this one, we could just have it be random and then refine it later on."

**Player agency:** log-button prompt, same pattern as the t80 rest prompt at [trust.js:273](js/trust.js:273). Button reads `accept parcel from {callsign}` in the dispatch log. Click → pkg enters cargo. No decline button in v1 — the offer times out when the courier leaves (sets `S._transient.outboundOffered[nodeId] = true` to suppress re-offer). Manual eject via the cursor pickup system in the deferred followup patch gives the full "decline later" path.

**Reward structure** — both payouts fire, no replacement:
- **On acceptance:** `+N trust at origin NPC` where `N = 1 + floor(pkg.slots / 2)` — the same weight-scaled formula as v0.0.8.5's delivery trust. Origin NPC rewards you for accepting the dispatch.
- **On delivery:** normal delivery trust (`+N`) at destination **plus +1 bonus** because of the outbound flag. Destination NPC rewards you extra for the relationship-spanning delivery.

Net: successful outbound dispatch = `N` origin trust + `N+1` dest trust ≈ `2N+1` total, vs regular delivery's `N` at dest only. Outbound dispatch becomes the trust-dense loop.

Flag the pkg with `pkg.outboundFrom = originNodeId` so `tryDeliver` can detect + apply the `+1` bonus.

### what stays the same

- `rollPkg(destId, cellRisky, forceLost)` signature unchanged.
- Delivery path in `packages.js tryDeliver` unchanged except for reading `pkg.outboundFrom` for the +1.
- Cargo system unchanged (2D bin-pack, same shapes).
- Scrip / trust baseline formulas unchanged.
- World-spawn cadence unchanged — only the destination picker changes.
- Auto-pickup on proximity unchanged — cursor pickup lives in the deferred followup.

### files the patch will touch

- [js/world.js](js/world.js) — `makeWorldPkg` uses `rollDestForSpawn(edgeIdx)` instead of edge-endpoint.
- [js/packages.js](js/packages.js) — export new `rollDestForSpawn(edgeIdx)`; new `tryOutboundDispatch(nodeId)` called from arrival hook; `tryDeliver` reads `pkg.outboundFrom`.
- [js/main.js](js/main.js) — arrival hook calls `tryOutboundDispatch(arrivedAt)` before pickup scan at around [main.js:308](js/main.js:308).
- [js/state.js](js/state.js) — `S._transient.outboundOffered: {}` map.
- [js/data/packages.js](js/data/packages.js) — 10 new niche labels per the audit above.
- [js/constants.js](js/constants.js) — `DEST_DIV_WEIGHTS` (40/25/15/10/5/5), `OUTBOUND_BASE_RATE = 0.8`, `OUTBOUND_MIN_TRUST = 5`, `OUTBOUND_BONUS_TRUST = 1`.
- [the-long-haul.html](the-long-haul.html) — subtitle bump `.3.1` → `.4`.

### sequence — proposed commit split

1. **Dest-div backend + niche labels.** `rollDestForSpawn`, 10 new labels, `makeWorldPkg` routed through. Verifiable: pick up several world-spawn pkgs, observe dest diversity + identity-appropriate labels.
2. **NPC outbound dispatch.** `tryOutboundDispatch` arrival hook, log-button prompt, accept path, outbound flag + delivery bonus. Verifiable: arrive at an NPC with trust ≥ 5, sometimes get an offer; accept, observe dest follows the ring-distance curve; deliver, observe the bonus trust.

Two commits. Kept tight because cursor pickup is its own patch.

### scope — deferred

- **Cursor pickup + drag-drop + ground-tooltips + eject-from-cargo.** The "glue of the active gameloop" per user during .3.1 planning. Without it, dest-div's interesting choices are invisible — the player still auto-picks everything in range, so "which pkg do I take?" is never a decision. Sized comparably to dest-div + outbound dispatch combined. Slotted as **v0.0.9.4.1** (micro-patch on top of .4), or could re-scope into a fat .4 at merge time. User framing: "it's an idle game first" — the cursor system is glue, not the center of gravity; idle mode (auto-pickup) should remain available as default or toggle.
- **Preferred-partner tables for outbound dispatch.** Launched with uniform-among-compatible-dests (via the ring-distance curve). Explicit per-NPC affinities deferred — user wants data to settle first.
- **Dest weight retune for expanded NPC roster.** 40/25/15/10/5/5 sized for the current 6-node ring; v0.0.9.5's ~10-12-node rim needs recalculation (NPC patch moved from old .7 to .5 during the .4.1 planning swap).
- **Outbound dispatch for lost/damaged pkgs.** v1 only offers fresh pkgs. Lost-pkg dispatch (an NPC asks you to haul something they scavenged) is a natural .5+ beat once terrain lands and lost spawning has more spatial meaning.

---

## v0.0.9.4.1 implementation plan

Drafted 2026-04-16 during the v0.0.9.4 design walkthrough. Not yet implemented — picks up immediately after v0.0.9.4 ships.

### thesis

Turn pickup into a decision instead of a background tick. With v0.0.9.4's dest-div now generating interesting "which pkg do I take?" moments, the player needs an affordance to actually make that choice. Today `scanForPickup()` auto-grabs any fitting pkg in range — the player's role in pkg selection is zero.

Ship two layers: a **tooltip + click-to-pickup** layer that makes "examining + choosing" possible (commit 1), and a **drag-to-place + drag-to-toss** layer that makes "managing the bag + evicting mistakes" possible (commit 2). Together they are the **"glue of the active gameloop"** the user called out — but framed as glue, not the main event: **auto-pickup stays as the default**; the manual mode is an opt-in toggle. Idle play remains playable and pleasant with minimal attention.

### architecture notes

**Fieldstrip hover/click is simple.** `renderFieldstrip()` in [world.js:129](js/world.js:129) re-renders `strip.innerHTML` every tick. Every `.fc-pk` span already carries `data-ci="${ci}"`. Event delegation on the fieldstrip container (mouseover / mouseout / click / mousedown) can read `data-ci` off the target and look up the pkg in `worldCells[ci].pkg`. Re-render on every tick is fine for hover — the span stays under the cursor from one paint to the next since the strip's `translateX` offset moves the strip, not the cursor.

**Drag is trickier because of the tick re-render.** If the player starts dragging a fieldstrip pkg and the strip repaints mid-drag, the dragged span gets destroyed. Solution: drag operates on a **floating ghost element** (an absolutely-positioned clone appended to the body that follows the cursor). The source pkg is flagged `pkg._dragging = true` in state; `renderFieldstrip()` / `renderCargoSlots()` render a translucent placeholder for dragging cells. Ghost lives outside the render path so tick re-renders don't disturb it.

**Cargo drop targets come free from the existing grid.** `renderCargoSlots()` in [hud.js:111](js/render/hud.js:111) already paints cells with known positions. On drag-hover, check if the cursor is over the cargo grid (`getBoundingClientRect` on the grid container) and highlight the target slot(s) — the bin-packer can re-run with the dragged pkg inserted at the hovered position to compute the drop layout. Release inside grid = apply the layout; release outside = ground-pickup drag snaps back (no-op) OR cargo-drag toss (with lost-chance).

### commit 1 — tooltips + click-to-pickup + grab toggle

**Scope:** "examining + choosing" layer. No drag anywhere yet. Ships independently — game still works identically with the toggle set to `auto`, but with hover tooltips added as a pure gain.

**Ground pkg tooltip (hover):**
- Same format as cargo pkg tooltips ([hud.js](js/render/hud.js) — match the existing tooltip content shape exactly, update both call sites in lockstep if needed).
- Content: size, label, destination (settlement label), scrip, kg, slots, modifier (if present), `[lost]` or `[recovery] from PTR-XXXX` tag where applicable (`pkg.isLost` / `pkg.isRecovery` / `pkg.recoveryFromPorter`).
- 150ms show-delay to kill flicker during rapid hover-over.
- Anchored near cursor, small offset. Same element as the v0.0.9.3 route-map tooltip `#routeTooltip` repurposed, OR a fresh `#pkgTooltip` div.
- Event delegation on fieldstrip container: `mouseover` / `mouseout` sets/clears `S._transient.hoveredGroundCi`; tick re-render or tooltip refresher consults that + cursor coords.

**In-range affordance:**
- In-range = within `pickupRange()` (existing helper at [packages.js:69](js/packages.js:69)) of courier cell.
- Visual: cursor: pointer on `.fc-pk` elements that resolve to in-range `worldCells[ci]`. Out-of-range → default cursor.
- No radius visualization on the fieldstrip (user decision — the cursor affordance alone is enough).
- Compute in-range bucket once per tick (small set of ci values), tooltip + click handlers gate on membership.

**Click-to-pickup (auto-bin-pack):**
- Single click on in-range `.fc-pk` → same flow as the existing `scanForPickup` pickup body (slot/weight check, sticky-gun ammo decrement if cross-range pick, push to `S.inventory`, HUD repaint, pickup log). Refactor the pickup-acceptance tail of `scanForPickup` into a shared `acceptPickup(cell)` helper so manual + auto paths call the same thing.
- Out-of-range click → no-op (cursor already signals unclickable).
- Click-during-shortcut → blocked (interior is off-grid per v0.0.9.3; same gate as auto-pickup).

**`grab:` toggle:**
- New button in the stamina-row alongside `auto: on|off` (the autodrink toggle). Button label: `grab: auto` / `grab: off` matching the existing toggle's visual language.
- New persisted state: `S.autoGrab: boolean` (default `true` — idle-first). Add to state.js + persist through serialize/deserialize (no schema bump needed if we use the "unknown fields accepted" path).
- `scanForPickup()` early-returns if `!S.autoGrab`. Cursor pickup path works regardless.

**Sticky gun interaction:**
- Gun extends cursor reach the same way it extends auto-reach (`pickupRange()` helper). Clicks within bare-hand range (≤ `PKG_PICKUP_RANGE`) spend no ammo; clicks in the extended 3..8 band spend ammo (same cross-range check as `scanForPickup`).
- Holstered gun → bare-hand range only for cursor, same as auto.

**Cargo tooltips:**
- Audit existing cargo hover tooltip (current shape in `renderCargoSlots`). Ensure it matches the ground tooltip content 1:1. User call: "same as cargo packages."

### commit 2 — drag-to-place + drag-to-toss + lost-chance

**Scope:** the "managing the bag" layer. Drag-drop on both the fieldstrip (pickup with manual placement) and the cargo grid (rearrange + toss).

**Drag infrastructure:**
- `S._transient.drag = { source, pkg, ghostEl, originCi?, originInvIdx? }` — null when not dragging.
- Pointer-based (mousedown/mousemove/mouseup; touch polish deferred to a later patch per user call).
- `mousedown` on draggable element → start drag threshold of 4px to disambiguate click-vs-drag. Above threshold → create ghost, mark source with `_dragging` flag.
- `mousemove` → follow cursor, check for valid drop target (cargo grid or outside).
- `mouseup` → resolve drop; destroy ghost.

**Ground drag-to-cargo (manual placement):**
- Source: `.fc-pk` cell within `pickupRange()`.
- Drop on cargo grid: re-run binpack with this pkg inserted at the hovered slot position. If fits → apply (same acceptPickup tail). If collides with existing cargo → reject (cursor indicates invalid drop).
- Drop outside cargo → snap back to ground (no toss — you can't toss something you haven't picked up).
- Release over a cargo cell that can hold the pkg (dimensional fit) but is occupied → reject.

**Cargo drag-to-cargo (rearrange):**
- Source: cargo grid item.
- Drop on empty slot(s) → move pkg to new position, re-paint. Persisted in `inventory[i]` ordering + any explicit position field (binpack currently doesn't store positions — need to confirm how it paints; might need to add `inventory[i].gridPos` or just rely on bin-pack order and let drag change the order).
- Drop on occupied slot → swap if footprint-compatible, else reject.

**Cargo drag-to-toss (eject):**
- Source: cargo grid item.
- Drop outside cargo grid → eject path fires.
- **Lost-chance (modifier-scaled):**
  - base: 10%
  - fragile: 30%
  - unwieldy: 25%
  - lightweight: 20%
  - heavy: 5%
  - (default for no-modifier pkgs: base 10%)
- **Kept branch** (rolled not-lost): pkg drops to the courier's current cell if `worldCells[courierCell].pkg === null`; otherwise walk ±3 cells looking for an empty `pkg` slot. If no empty cell found in that window → escalated to lost (vanishes cleanly). Pkg retains all properties (label, dest, scrip, modifier). Becomes a normal world pkg that auto-pickup or cursor will grab.
- **Lost branch**: pkg tagged with player's porter ID (`recoveryFromPorter = S.porterId` — same mechanism as trip-loss at [trip.js:181](js/trip.js:181)). Enters the multiplayer recovery pipeline — other players can pick it up as "recovered from PTR-XXXX." Vanishes locally (doesn't drop to this world).
- Removed from `S.inventory`, `usedSlots/usedWeight` reduced. HUD repaint.
- Log line: kept → `tossed [size] label onto the trail`; lost → `lost [size] label in the toss`.

**During shortcut:**
- Cursor pickup is gated (interior = off-grid, same as auto-pickup).
- Toss still allowed — the interior is still terrain, you can toss into it. Lost-branch tosses during shortcut might even increase lost-chance as a small flavor bump (flag only if user wants). v1: same lost-chance.

### files the patch will touch

**Commit 1:**
- [js/world.js](js/world.js) — fieldstrip mouseover/out/click delegation bound once; per-tick in-range bucket compute.
- [js/packages.js](js/packages.js) — extract `acceptPickup(cell, offset)` helper from `scanForPickup`; `S.autoGrab` early-return in `scanForPickup`.
- [js/render/hud.js](js/render/hud.js) — `grab:` toggle button + click handler; tooltip content helper shared between ground + cargo.
- [js/state.js](js/state.js) — `S.autoGrab: true`, `S._transient.hoveredGroundCi: null`.
- [js/persistence.js](js/persistence.js) — serialize/deserialize `S.autoGrab`.
- [the-long-haul.html](the-long-haul.html) — new `grab:` button markup next to the drink auto toggle; `#pkgTooltip` element near the end of body (or reuse `#routeTooltip` plumbing).
- [the-long-haul.css](the-long-haul.css) — tooltip styling (match `#routeTooltip` palette); `.fc-pk.in-range { cursor: pointer }` selector.
- subtitle `.4` → `.4.1`.

**Commit 2:**
- [js/render/hud.js](js/render/hud.js) — cargo-grid drag source/target; re-binpack preview on drop hover.
- [js/world.js](js/world.js) OR new [js/render/drag.js](js/render/drag.js) — ghost element + global mousemove/mouseup listeners (kept session-scoped via single `bindDrag()` at init).
- [js/packages.js](js/packages.js) — new `ejectFromCargo(invIdx)` helper: lost-chance roll, kept → drop to world cell; lost → tag + broadcast via existing recovery pipeline.
- [js/trip.js](js/trip.js) / [js/recovery.js](js/recovery.js) — may need a touch if eject-lost wants to share the trip-loss broadcast path. Likely no change — just reuse the `postActivity('lost', ...)` pattern.
- [the-long-haul.css](the-long-haul.css) — drag-ghost styling, drop-target highlight, drag-invalid cursor.
- [js/state.js](js/state.js) — `S._transient.drag` shape.

### save schema

No bump. `S.autoGrab` is a new top-level field with a sensible default (`true`); existing saves deserialize with the default. Eject-lost pkgs ride the existing recovery path — no new persisted fields.

### scope — deferred

- **Touch/mobile drag.** User will dogfood on desktop first. Touch polish revisited when the user plays on mobile and finds gaps.
- **Drag-range-scaled lost chance.** User picked modifier-scaled only; a future polish pass could add "throw distance" as a player-controlled variable.
- **Drag-to-throw trajectory anim.** A visual arc + landing thump when tossing would be nice flavor. Pure polish — not blocking.
- **Visual range viz on fieldstrip.** User explicitly declined; noting here in case it ever feels needed.
- **Cargo rearrangement between laps / hotkey auto-sort.** Auto-sort is always-on via binpack; explicit "sort now" hotkey is a feature only needed if manual placement gets messy.

---

## v0.0.9.5 implementation plan

Drafted 2026-04-16 during the v0.0.9.4.1 design walkthrough. **Cast + geometry + gifts + renames locked 2026-04-17.** Not yet implemented — next session picks up from here. This patch was originally slotted at .7 as "world refresh pass"; pulled forward to .5 after confirming terrain placement should anchor at NPCs rather than be provisionally placed and re-jiggered later. Terrain + gear + world-overlay now consolidate into v0.0.9.6.

### thesis

The world gets its cast. Current 6 NPCs on a 6-node ring become 12 NPCs on a 12-node rounded-square rim. 6 new NPCs (`nu`, `theta`, `gamma`, `lambda`, `pi`, `delta`) join the existing 6 (`rho`, `iota`, `tau`, `phi`, `xi`, `psi`), with `xi` promoted from rim to corner. Shipping NPCs first means v0.0.9.6's terrain lands anchored at real named locations with dialogue that reacts to the player — *"theta is working the riverbed today"* is a different experience than *"there's a river in an unnamed part of the map."*

**Scope grew during cast lock (2026-04-17):**
- Battery promoted from stub to persistent baseline feature (innate solar trickle) — user wants it shipped as a full system, not a deferred stub.
- `scannerT2` is on the docket as xi's t40 (was previously a "maybe someday" intent).
- Gear-shaped rename pass touches 6 existing upgrades (all id-stable display-name changes).

### map reshape

**From:** 6-node ring with `S.edges = [['A','?'],['?','B'],['B','C'],['C','H'],['H','\u00b7'],['\u00b7','A']]` — hex-ish, fixed.

**To:** rounded-square rim with **12 nodes** — 4 corners + 2 rim-side nodes per side = 12 rim edges.

```
              N side (L→R)
              nu ─── psi ─── iota ─── theta
              │                          │
              rho                        phi
              │                          │
              tau ◄ player start         gamma
              │                          │
              pi ─── lambda ── delta ─── xi
              S side (L→R)
```

**Player start shift.** Old saves start at `edgeIdx: 2` (mid B↔C edge). New rim starts the player AT tau's node (home). Classic "setting out from home" idle-game opener. Existing saves with in-flight deliveries migrate to nearest new-rim equivalent (see save migration below).

Considerations:
- **Route-map panel redraw.** The 2D plane from v0.0.9.2 stays, but the polygon defining the ring + interior boundary updates to a rounded-square. Shortcut bezier paths in v0.0.9.3 re-resolve against the new geometry automatically (the pathFn math is endpoint-agnostic).
- **Save migration.** Existing saves have `edgeIdx: 0..5`. The new rim has 12 edges. Snap the courier to the new position of whichever old NPC was their most recent origin or destination (e.g., if old `pendingDelivery` was heading to `H`, snap courier to tau's node in the new rim). Saves without in-flight deliveries snap to tau (new default start). Schema bump `SAVE_VERSION` v7 → v8. Also include: `S.battery` persistence, new NPC trust entries (at 0), `efficientConsumption` → nu t20 retro-grant (v0.0.8.6 pattern — if `S.upgrades.efficientConsumption && !S.npcs[nu_nodeId]?.unlocks.t20`, grant-ratchet nu to t20).
- **Node-glyph palette.** Greek letters for all 12 NPCs, all lowercase: `rho ρ`, `iota ι`, `tau τ`, `phi φ`, `xi ξ`, `psi ψ` (existing) + `nu ν`, `theta θ`, `gamma γ`, `lambda λ`, `pi π`, `delta δ` (new).
- **Visual treatment.** Corners read as MORE than rim nodes — slightly larger glyph, a subtle biome-color halo on the route map, or a corner marker. Worth a mockup pass before building.
- **Dest-weight retune.** Current `DEST_DIV_WEIGHTS = [40, 25, 15, 10, 5, 5]` is sized for the 6-node ring. 12 nodes need an extended forward-biased curve. Rough sketch: `[30, 20, 15, 10, 8, 6, 4, 3, 2, 1, 0.7, 0.3]`. Finalize empirically in code.

### new NPCs — what ships

All 6 new need:

- **NPC def** entry in [js/data/npc-defs.js](js/data/npc-defs.js) — nodeId / callsign / trustProfile ('default' / 'careful' / 'scavenger' per v0.0.8.4 dispatcher, or new profile) / node placement / depotLabel.
- **NPC_LINES** entry in [js/data/npc-lines.js](js/data/npc-lines.js) — full category-first dialogue shape from v0.0.8.4: ambient chatter, threshold (trust ↑ lines), warning (pre-trip), preview (pre-weather), restPrompt (t80+), delivery (5 conditions × 3 variants = 15 lines). ~40-60 dialogue lines per new NPC × 6 = **240-360 new lines total**.
- **trustProfile dispatch — full 12-NPC table, locked 2026-04-17.** Every NPC gets a distinct character-expressive profile; all positive-framed (no pure-negative restrictions). Each teaches or rewards a different playstyle. Existing `default` / `careful` / `scavenger` profiles fully retired — all 12 NPCs use new locked profiles.

  | NPC | profile | core mechanic |
  |-----|---------|---------------|
  | **rho** | **veteran** | +trust on long-distance deliveries (ring-distance-weighted bonus) |
  | **iota** | **wetland-path** | +25% trust if delivery route crossed ≥2 wetland cells since last iota visit |
  | **tau** | **homecoming** | clamped multiplier: `×(1 + min(km/60, 1.0)) × max(0.75, 1 - trips/20)` since last tau visit. Distance cap ×2.0, safety floor ×0.75 — tau always gives *some* trust |
  | **phi** | **stormwise** | +trust on deliveries completed during an active storm or within N ticks of storm clearing |
  | **xi** | **archivist** | size-scaled trust: s×1.0 / m×1.15 / l×1.3 / xl×1.6 — xi rewards sheer mass ("more specimens to examine") |
  | **psi** | **wayfinder** | +50% trust on lost-pkg deliveries (pairs with psi's own pocket-binoculars gift that increases lost-cargo spawn rate — synergy loop) |
  | **nu** | **guardian** | +trust on trip-free deliveries (celebrates safe arrival) |
  | **theta** | **artisan** | +trust on fragile-intact deliveries (rewards delicate cargo handling) |
  | **gamma** | **debt-easer** | damage-penalty dampener: damaged delivery trust gain ≈ pristine-delivery trust gain (normally reduced, but gamma is relieved not to owe you for a perfect delivery). No pristine bonus. |
  | **lambda** | **adventurer** | +trust on deliveries that used mountain gear en route (placed ladder/anchor, crossed a placed structure) |
  | **pi** | **researcher** | +trust on modifier-flagged pkgs (fragile / lightweight / heavy / unwieldy) delivered intact |
  | **delta** | **routine** | +20% trust on loop-included deliveries — requires ≥4 distinct other NPCs visited since last delta delivery (tracked as `S.npcs.delta.visitedSinceLastDelta: Set<nodeId>`, cleared on delta delivery) |

  **State-tracking required beyond current infrastructure:**
  - `S.npcs.iota.wetlandCellsSinceLastVisit: number` — increments on wetland cell entry, resets on iota delivery
  - `S.npcs.tau.kmSinceLastVisit: number` + `S.npcs.tau.tripsSinceLastVisit: number` — accumulate movement + trip counts, reset on tau delivery
  - `S.npcs.delta.visitedSinceLastDelta: Set<nodeId>` — NPC ids visited since last delta delivery, cleared on delta delivery
  - `S.npcs.psi.*` — no new state needed; `pkg.isLost` flag already exists from recovery pipeline
  - lambda — delivery handler needs to check whether the route since-last-pickup included a placed-gear structure use; can piggy-back on world-overlay traversal events

  **Damage state for `debt-easer` (gamma) / `guardian` (nu) / `artisan` (theta) / `researcher` (pi):** the existing delivery-damage-penalty pipeline (from v0.0.8.2 fragile modifier + cargo-hit system) already tracks pristine / damaged / lost states per pkg. Profiles just key into that existing flag at delivery time.
- **Upgrade gifts wired** via `trustReward` flags on upgrade defs. `onTrustUnlock` dispatcher already exists from v0.0.8.6; register new entries.
- **Shop visibility** — `renderUpgrades()` filters trust-reward upgrades out of the scrip menu; new entries follow suit.

### battery baseline (new scope in v0.0.9.5)

Promote `S.battery` from the stub at [render/kit.js:15](js/render/kit.js:15) (*"NOT persisted"*) to a persistent, baseline infrastructure feature:

- **Persistence.** `S.battery = { charge, max, regenRate, ... }` added to save schema v8. Load/save roundtrip via [persistence.js](js/persistence.js).
- **Innate solar trickle.** Baseline regen happens passively, scaled by day-fraction (uses v0.0.9.1 day/night infrastructure). Numbers tune empirically — rough starting point: +1/tick daytime, 0/tick nighttime. Battery recharges even without any upgrades.
- **Consumers** — register all with the existing drain pipeline at [main.js:390](js/main.js:390):
  - Existing: `scannerT1`, stickyGun
  - New: `scannerT2` (xi t40) — same/slightly higher drain than T1
  - New: pi's exoskeleton (both tiers, lvl 2 adds more battery life efficiency)
  - New: gamma's mobile carrier (both tiers, lvl 2 adds better battery)
- **Upgrades from delta.** Advanced solar panel (t20) modifies solar-regen multiplier and adds a **desert-cell bonus** (innate solar × higher when player-cell is in desert biome — hooks v0.0.9.6 desert tagging). Rainfall turbine (t40) adds a **rain-regen channel** proportional to rainfall intensity during active storms (hooks v0.0.8-era storm system).
- **UI polish.** Battery bar already exists in [render/kit.js](js/render/kit.js); polish pass for "now it matters" — make it readable at a glance, surface charge-rate indicator when actively regenerating, low-battery warning state.

Battery ships as its own commit (4a) before the trust-reward wiring commit (4b) so it's verifiable independently.

### upgrade migrations + new upgrades

**Migrations (id-stable — saves unaffected by id; only owner + name change):**
- **`efficientConsumption`: scrip-shop → nu t20.** Rename `name:` to `"drip-feed integration"`; remove the scrip-shop entry (cost: null, requires: null is replaced by `trustReward: { npc:'<nu_nodeId>', tier:'t20' }`). Same 60% canteen drain multiplier in [stamina.js:136](js/stamina.js:136) — no mechanic change. On load migration: if `S.upgrades.efficientConsumption && !S.npcs[nu_nodeId]?.unlocks.t20`, grant-ratchet nu to t20 (retro-grant pattern).

**New upgrades (first-time unlocks) — all tier slots locked:**

| id (proposed) | NPC + tier | name | mechanic |
|---|---|---|---|
| `reservoirTank` | nu t40 | reservoir tank | canteen capacity ↑ + passive fill rate ↑ (numbers TBD) |
| `riverWaders` | theta t20 | river waders | reduced trip chance when wading (scales with v0.0.9.6 river-cell mechanic) |
| `ceramicWrap` | theta t40 | ceramic wrap | fragile pkgs absorb +1 damage hit before degrading (hooks v0.0.8.1 fragile modifier) **AND** fragile pkgs take no water damage during river crossings or fall-downstream failures (pairs with v0.0.9.6 river mechanic — theta's clay-craft literally waterproofs your cargo) |
| `mobileCarrier1` | gamma t20 | mobile carrier lvl 1 | wheeled carrier; folds into large cargo when not in use; adds carry capacity; consumes battery when deployed |
| `mobileCarrier2` | gamma t40 | mobile carrier lvl 2 | mobile carrier lvl 1 + more capacity, better battery, better traction (wetlands/rivers/mountains); folds into medium cargo |
| `mountainGear` | lambda t20 | mountain gear | ladder + anchor durability ↑ (ladder/anchor baseline shipped in v0.0.9.6) |
| `improvedTieDowns` | lambda t40 | improved tie-downs | chance to withstand a hit (cargo retention under trip/hit) |
| `exoskeleton1` | pi t20 | exoskeleton lvl 1 | variant: speed OR all-terrain (pick at build); consumes battery |
| `exoskeleton2` | pi t40 | exoskeleton lvl 2 | lvl 1 + the other variant's bonuses + extended battery life |
| `solarPanel` | delta t20 or t40 | advanced solar panel | battery regen ↑ in sun + desert-cell bonus |
| `rainfallTurbine` | delta t40 or t20 | rainfall turbine | battery regen during rain, proportional to intensity |
| `scannerT2` | xi t40 | (gear name TBD — signal dish / repeater array / resolution lens / calibration plate) | upgrades `S.scanner.level = 2`; mechanic TBD at build — range ↑ / buff duration ↑ / auto interval ↓ / or all of the above with smaller magnitudes |
| `topographicMap` | psi t40 | topographic map | persistent overview of the rim + interior terrain (paper map; doesn't require scannerT1) |

**Build-time picks (pick-when-implementing):**
- pi exoskeleton variant order (speed-then-all-terrain vs. all-terrain-then-speed)
- delta tier order (solar vs. turbine at t20 vs. t40)
- scannerT2 mechanic profile + gear-shaped name
- gamma mobile carrier lvl 2 traction-multiplier numbers

### gear-shaped rename pass (id-stable display-name changes)

Aesthetic: "your gear loadout is expanding," not "you're gaining new abilities." Touches [upgrades.js](js/data/upgrades.js) `name:` fields + any hardcoded UI strings referencing them. No id changes — saves unaffected.

| id | current name | new name |
|---|---|---|
| `cargoWeight` | pack mule rig | **molly netting** |
| `efficientConsumption` | efficient consumption | **drip-feed integration** (+ migrates off scrip-shop to nu t20) |
| `sandalEfficiency` | sandalweed poultice | **interwoven lashing** |
| `steadyFeet` | steady feet | **traction cleats** |
| `weatherRadioT2` | weather map | **forecast radar** |
| `scavengerEye` | scavenger's eye | **pocket binoculars** |

Grep for any hardcoded references to the old name strings (dialogue, log strings, tooltips). Canonical source is `name:` field — most UI should pull from it rather than hardcode.

### label pool updates

Each new NPC needs labels tagged with their dest. The v0.0.8.1 dest-tagged pool already covers rho/iota/tau/xi/phi/psi; adding destinations for the 6 new NPCs means adding their nodeIds to existing labels where thematically appropriate AND authoring new niche labels per their identity.

**Current label density audit (2026-04-17):**

| NPC | total labels | density |
|-----|--------------|---------|
| xi (C) | 45 | densest |
| tau (H) | 44 | densest |
| psi (·) | 33 | mid |
| rho (A) | 26 | mid (post v0.0.9.4 boost) |
| iota (B) | 21 | **sparse — boost needed** |
| phi (?) | 20 | **sparsest — boost needed** |
| nu / theta / gamma / lambda / pi / delta | 0 each | new — fresh pools required |

**Fresh pools for new NPCs (20-30 labels each):**
- **nu (desert)** — water-related, survival: waterskin, salt tabs, sand goggles, sun tarp, dust mask, etc.
- **theta (riverbed / clay / pottery)** — clay bundle, pot shards, kiln fuel, tea leaves, glaze samples, reed mats, etc.
- **gamma (rocky hillside / mechanical)** — rope bundle, carabiners, climbing holds, stove fuel, gear cache, etc.
- **lambda (mountain / climbing)** — pitons, ice screws, summit logs, signal flares, rope coil, etc.
- **pi (summit research / robotics)** — circuit boards, calibration weights, sensor arrays, lab notes, antenna parts, solder spools, etc.
- **delta (dam / restoration / electrical)** — wire spools, insulators, sluice parts, generator brushes, seal rings, etc.

**General pool boost for sparse existing NPCs:**
- **iota (+8-10 labels)** — young ecology researcher identity; field / farming / wetland-adjacent (growing medium, cutting tray, pollen sample, field kit, sapling wrap, etc.)
- **phi (+6-8 labels)** — additional weather instruments, storm logs, calibration specimens

**Plateau-top-eligible subset — dests restricted to near-start NPCs.** Packages spawning on plateau tops (gated by ladder per v0.0.9.6) should deliver to NPCs the player is actively trading with, not late-game unlocks. Allocation: **rho / nu / psi / iota / theta** get plateau-top-eligible labels folded into their pools (5-8 per NPC, cross-tagged where natural). **Excluded: xi, tau, phi, gamma, lambda, pi, delta** — either already dense or too-far-from-start to make plateau rewards meaningful early. Rationale: prevents the bias where "first terrain that pays off gives packages for NPCs you've barely unlocked."

Plateau-top label flavor per NPC:
- **rho** — weathered manifest, abandoned ledger, wind-blown dispatch pouch, old route marker stone
- **nu** — sun-bleached relic, dust-buried cache, weathered signal flag, sand-scoured satchel
- **psi** — mesa-edge cache, trailhead scrap, wind-whipped charm, plateau-top trinket (salvaged from a pre-collapse shrine?)
- **iota** — weathered seed envelope, sun-faded field notes, plateau pollen sample, wind-blown sapling wrap
- **theta** — kiln-bound clay slab (harder clay from plateau heights), sun-baked pot shard, wind-dried reed bundle, glaze mineral sample

Cross-tagging preserves v0.0.8.1 intermingling — "sun-bleached relic" could ship to nu, rho, OR psi with different narrative flavor.

Full audit when drafting the commit — ensure each new NPC has ≥4-6 single-dest labels for strong identity, matching the v0.0.9.4 niche-audit standard for rho/tau.

### proposed commit split (6 commits)

1. **Rim reshape + save migration v7→v8.** Update `S.edges` to the 12-node rounded-square shape. Redraw the route-map polygon. Migrate existing saves (edgeIdx remap, courier snap, new NPC trust-state init at 0, battery persistence schema). Player-start shift to tau's node. Dest-weight retune for 12-node ring. Verifiable: load an old save, courier arrives at the correct NPC equivalent, shortcut paths still work, battery persists across a reload.

2. **3 corner-area NPCs.** nu / theta / pi NPC defs + NPC_LINES + trustProfile dispatcher. xi's corner promotion is geometric only — no new content (existing NPC_LINES + trustProfile reused). Verifiable: arrive at each new corner NPC, receive dialogue, trust accrues on delivery.

3. **3 rim NPCs + phi relocation.** lambda / delta / gamma NPC defs + NPC_LINES + trustProfile dispatcher. phi relocation is geometric only — no new content. Verifiable: same as commit 2 across the 3 rim NPCs.

4a. **Battery baseline module.** Persist `S.battery` in save schema, innate solar trickle regen, battery UI polish pass. Register scannerT1 + stickyGun with new drain pipeline (already partially wired). Verifiable: battery regenerates during day with no upgrades, persists across reload, UI bar reads correctly.

4b. **Upgrade defs + trust-gift wiring + rename pass.** 12+ new upgrade defs (see table above) with `trustReward` flags; `onTrustUnlock` registrations for each new tier; `efficientConsumption` migration (scrip → nu t20 + retro-grant); gear-shaped rename pass across 6 upgrades; scannerT2 level-up logic; delta's gifts modify battery regen; pi/gamma exo+carrier register as battery consumers. Verifiable: cross each trust threshold, receive correct gift, existing saves with `efficientConsumption` don't lose the benefit after migration, battery drains with new consumers deployed and regenerates faster with delta's panels.

5. **Label pool expansion.** Add new-NPC nodeIds to existing labels where thematic; author new niche labels per NPC identity (target: ≥4-6 single-dest labels per new NPC). Verifiable: roll pkgs for each new dest, observe identity-appropriate labels.

Save schema bump lands in commit 1 so subsequent commits don't have to migrate multiple times. Battery persistence rides the same v8 schema bump (piggyback), though its consumer wiring + new regen upgrades land in 4a/4b.

### scope — deferred

- **Rim regen visual polish.** First pass of the rounded-square may look geometric; smoother curves + biome-color halos land in .7 / .9+.
- **Existing NPC building relocations.** "Locations may shift on the refreshed rim." Minor shifts land in this patch; big relocations (if any emerge) defer.
- **Trust-rewards-via-shop refactor.** Flagged in the bug-list — trust-tier upgrades currently auto-apply via `onTrustUnlock` + `loadGame` retro-grant; user wants them claimable from a shop surface with per-NPC flavor. Deferred as its own patch.
- **lambda t60 slot.** Climbing gloves + walking stick backbenched for lambda's t60 tier. Neither ships in .5. Mechanics open — pick when building .9.9+ or later.
- **Cross-NPC integration between scanner + topographic map.** Could later wire scanner pings to "fill in" the topographic map; kept independent in .5 for ship cleanliness.
- ~~Trust-profile new variants for nu / gamma / pi / delta~~ — **resolved 2026-04-17**: all 12 NPCs get new character-expressive profiles; `default` / `careful` / `scavenger` fully retired. See the `trustProfile dispatch` bullet above for the full table.

---

## v0.0.9.6 implementation plan

Drafted 2026-04-16 during the v0.0.9.4.1 design walkthrough. Not yet implemented — follows v0.0.9.5. Consolidates the old .5 (terrain bones) + old .6 (world-overlay system) into a single coherent "world patch" since terrain, gear, placement, and overlay all interact tightly.

### thesis

The world gets its mechanics. v0.0.9.5 added the cast and reshaped the rim; .6 fills the interior with terrain that matters, adds the gear that lets you traverse it (ladder + anchor), wires the world-overlay persistence system so placed structures + carved trails survive across sessions + sync across players, and brings storms into the 2D interior. After .6, the shortcut from v0.0.9.3 becomes a real exploration-traversal choice rather than a cosmetic shortcut.

### terrain bones

Interior-only placement (the rim keeps its existing zones from `js/data/zones.js`). Deterministic generation anchored at corner + rim NPCs from .5 — the **theta river** originates at theta (NE corner) and flows S down the east side of the interior, **terminating at delta's dam** on the bottom rim, with **2 westward tributaries** feeding it from the interior; mountains cluster at the SW corner (pi's summit + lambda's slope); rocky hills spill E off the mountain cluster into gamma's right-rim biome; desert centered at nu (NW); ruins plateau at xi (SE). Deterministic means a pure function of `(x, y)` — every player on the same save layout sees the same world (lets multiplayer-synced trails converge). **Delta's dam catches the theta river itself** — when the dam ages, xi's ruined plateau on the far side is what dries out. Strong implicit worldbuilding: theta (river source) and delta (dammer) are a narrative pair, and xi's desolation has a structural cause. (Commit 1 of .6 landed this cosmetically — mechanics attach in later commits.)

**Design philosophy: idle game first — no hard gates on the route.** The travel loop never *stops* the player, only slows them or makes them less efficient. Gear is an efficiency choice, never a requirement. Every cell is traversable by a gear-less courier, just with higher penalty.

**Terrain types:**

| Type | Location | Visual | Mechanics |
|---|---|---|---|
| River (water) | Main trunk runs N→S down east side of interior from theta (NE) to delta (bottom rim, dammed); 2 westward tributaries branch into the interior | `~ ~ ~` in blue-teal | Wading: trip ×1.2, stamina ×1.3, canteen refill +0.3/tick. Closes the long-stubbed `S.inRiver` flag. **Failed no-gear crossing** (severe trip fires) = *fall-and-ride-downstream* flavor: courier swept N cells downstream along river path, catches themselves after ~5-10 ticks, pathfinding auto-reroutes to original destination from new position. Idle loop preserved — never stuck. Cargo damage on fall (fragile pkgs hit unless ceramic wrap equipped). |
| River (clay bed) | Banks of main trunk + tributaries | `-- --` in ochre-olive (saturation gradient by distance from theta — TBD commit 1 or polish pass) | Walkable without wading, slower (stamina ×1.1). Clay is harvestable for future crafting (not wired in .6). |
| Mountain | Clustered 3-5 cell massifs at SW corner (pi's summit + lambda's slope), some with natural passes | `^ ^ ^` in slate | Base penalty: trip ×2.0, stamina ×1.5 — severe but always traversable. Placed ladder on ascent cell → reduces that cell's penalty toward ×1.5/×1.25. Placed anchor on descent cell → same. Natural passes have no penalty (slower than flat). **No "gated" massifs** — the previous draft's "unavoidable without gear" framing is dropped; gear is efficiency, never required. Some pitches tagged as **steep pitches** requiring 2 chained ladders for full coverage (terrain-author knob for difficulty variation within mountains). *Positive:* mountain cells bias the package-spawn weights toward **higher-value pkgs** (xl eligibility ↑ + scrip multiplier on delivery) — the reward for the traversal difficulty. |
| Rocky hills | Spillover ring eastward from SW mountain cluster connecting to the east mesa country via gamma's right-rim biome | `, ~ , .` in muted beige | Intermediate: trip ×1.4-1.6, stamina ×1.15. No gear required baseline. **Gear optional:** 1-2 ladders per hill cluster reduce ascent penalty; 1-2 anchors reduce descent penalty. Segue into mountain mechanics — teaches the same gear on gentler stakes. *Positive:* modified pkg spawn bias (larger sizes + modifier rate bump) — reward for the roughness. |
| Plateau (mesa) | East-side "mesa country" between theta's riverbed and xi's ruined plateau | `== ==` / `¯¯` in muted tan-ochre, with contour `_` lines suggesting stepped edges | **Visual obstacle, walkable paths carved between plateaus** (path cells = baseline, no penalty). Plateau **top cells** are elevated — reached only via placed ladder (ascent blocked otherwise; click = "you'd need a ladder to climb up here"). Descent: placed anchor = controlled; no anchor = **guaranteed trip, flavored as a fall** — cargo at risk, slightly punchier than a normal trip. *Positive:* packages spawn on plateau tops at `pkgChance ≈ 0.10-0.12`, visible from below with a `^` indicator — motivates gear investment early. **Destination picked by the standard dest-weight curve** (retuned for the 12-node ring in commit 2) — forward-bias naturally routes short + cashable given plateau's SE origin. No hardcoded near-start restriction. Teaches gear mechanics on low stakes before mountains. |
| Desert | nu's corner (NW) | `. . . .` in warm sand tone | Stamina ×1.4 during day (plugs into v0.0.9.1 sun arc), ×1.0 at night. Canteen untouched — player drinks more as a secondary effect, thematically "sun tires you out." |
| Wetlands | Existing rim biome (zones.js) — flagged here for completeness since its dual-axis profile is easy to forget | `~` in soft blue-green | *Negative:* slower travel speed (no trip/stamina penalty — just speed). *Positive:* highest sandalweed spawn rate of any terrain + passive canteen trickle refill. Primary lowland-reward biome. Listed here because plateau / mountain / desert are often described as "the new terrains with trade-offs" — wetlands deserves the same framing for clarity. |

**Shortcut mechanic rewrite.** v0.0.9.3's flat `SHORTCUT_STAMINA_MULT = 1.20` and `SHORTCUT_TRIP_MULT = 1.50` retire. Per-cell terrain effects apply during shortcut traversal. Flat terrain (no named type) = ×1.0 baseline (cheaper than the old 1.20 / 1.50 flat tax — the penalty is now tied to ACTUAL terrain, not just "you're in the interior").

### interior on-grid

v0.0.9.3 gated many systems behind `isOnShortcut()`:
- Pickup scanning (skip) — **stays skipped in .6** (no pkgs spawn in the interior yet; revisit in .7+ once NPC dispatch expands into interior-spawn flows)
- Wetland canteen refill (skip) — **wire for rivers**: if current shortcut cell is a river-water cell, refill applies
- Weather lookup (skip) — **on-grid**: storm effects apply in interior now (since storms sweep interior per the spawn changes below)
- Scanner tick (skip) — **on-grid**: scanning is useful in the interior (pre-mountain visibility, rocky-hill trip risk reduction)

Net: interior is on-grid for everything except package pickup.

### ladder + anchor gear

**Philosophy: cheap, disposable, social infrastructure.** Gear is inexpensive, meant to be placed and replaced. Every placement is a gift to the shared world for the next ~12h; the system amortizes gear cost across the player base.

**Single model — everything is placed.** All gear is consumed on placement, creating a world-overlay structure anyone can use. There is **no "held" or "in-use" state** — the narrative flavor of holding a rope during a river crossing or a mountain descent is just that: flavor. Mechanically, the anchor is placed at the shore / cliff-top, the rope extends, travelers grip during passage and let go at the far side, rope retracts to the anchor side for the next traveler. One mental model across all use cases.

**Inventory presence:** ladder = 1×1 slot, anchor = 1×1 slot. Live in the existing **kit bar** (already shipped — current residents: battery, scanner, gun). Ladder + anchor slot in alongside those. Purchased at the shop for scrip, repeat-buyable. Pricing (5c each) is deliberately outside the trust-reward 60/100/150 impact bands — disposable infrastructure operates at a different tier than permanent upgrades.

**Bundling rule** for kit-bar stacks (mirrors cargo size tiers):
- 1-5 ladders = 1 small slot
- 6-10 ladders = 1 medium slot
- 11-20 ladders = 1 large slot

Same scale for anchors. Buy-ladder / buy-anchor buttons live at the end of the kit bar. Keeps the kit bar legible even when the courier is loaded up for a mountain run.

**Pricing (first-pass tuning, adjust empirically):**
- Ladder: **5c**
- Anchor: **5c**
- Full 4-cell mountain loop (4 ladders + 4 anchors): **~40c raw** — first climber pays, subsequent players ride free for ~12h

**Durability:**
- **Base: 12h wall-clock** (not ticks)
- **lambda's mountain-gear upgrade: ×2 → 24h** (extends placed-infrastructure lifetime for all viewers)
- **Weather decay: spatial.** Storm overlap *at the gear's own cell* accelerates decay 3× (not player-in-storm — storm-on-gear). Generalizes the previous player-in-storm spec.
- Wear represented as 0..1 float with wall-clock decay; gear breaks + log message when wear ≥ 1.

**Visual wear states** via glyph/color shift + tooltip label change:
- 0.0–0.35 = `fresh` (cyan text, crisp glyph `/\` for ladder, `|^` for anchor)
- 0.35–0.7 = `weathered` (mid-teal, glyph with subtle fray)
- 0.7–1.0 = `rotting` (rust/muted, glyph with visible damage)

Tooltip: `ladder — fresh` / `ladder — weathered` / `ladder — rotting`.

**Directional gating:** ladder helps ascent, anchor helps descent (at mountain / rocky hill / plateau). Mountain cells tag ascent vs descent side based on elevation gradient (deterministic per seed).

#### Use cases (full matrix)

| use case | gear | rule |
|----------|------|------|
| mountain ascent | 1 ladder per cell (standard pitch); 2 chained ladders per cell (steep-pitch-tagged cells) | placed, reduces that cell's ascent penalty; no-gear = full penalty but traversable |
| mountain descent | 1 anchor per cell | placed, same pattern |
| rocky hill ascent | 1-2 ladders per cluster | placed, optional — reduces penalty when present |
| rocky hill descent | 1-2 anchors per cluster | placed, optional |
| plateau ascent | 1 ladder | **required** to reach plateau top (for pkg pickup); ascent blocked without |
| plateau descent | 1 anchor | placed = controlled descent; **no anchor = guaranteed trip flavored as a fall** (cargo at risk) |
| creek bridge (1-cell-wide river) | 1 ladder | placed across water cell → dry crossing |
| wider river bridge (2-3 cells) | 2-3 chained ladders | placed end-to-end spanning the river; chain shares one decay clock |
| river crossing with anchor | 1 anchor (covers up to 2 cells of rope span) | placed at near shore, rope spans to far shore, travelers cross using rope; trip reduced, bag exposed to water (fragile damage unless ceramic wrap) |

**Chained ladders share one decay clock.** A chain placed simultaneously is one world-overlay structure with multiple cells, one canonical ID, one wall-clock timer. If the chain decays, all cells age out at once. Enables: multi-ladder river bridges, steep-pitch mountain cells, wider-span crossings — all as atomic infrastructure. A broken chain = impassable at all cells in the chain simultaneously, re-place to restore.

**Anchor rope span.** One placed anchor spans up to 2 cells of river crossing. Wider rivers (3+ cells) can't be anchor-crossed — they need a multi-ladder bridge, preserving ladder relevance for the widest water features.

**No hard gates on any traversal.** Every cell — mountain, rocky hill, wide river — is crossable gear-less, just with full penalty. Rivers too wide for anchor-crossing and without a ladder bridge? The courier still wades, still pays the penalty, still may get swept downstream (see river terrain entry for the fall-and-ride-downstream mechanic). Idle loop never stops.

**Placement mechanic:** dragging a ladder / anchor from the kit bar onto a valid cell (ascent cell for ladder, descent cell for anchor, water cell for bridge, shore cell for river-anchor) → consumes the item, creates a world-overlay structure. Placement has a small stamina cost (TBD — ~5-10 stamina?) to prevent placement abuse. Chained placements (e.g., 2 ladders for a river bridge) consume 2 items in one drag action.

**Ceramic wrap synergy:** theta's t40 ceramic wrap (v0.0.9.5) provides full water-damage immunity to fragile packages during river crossings and fall-downstream incidents — in addition to its base +1 fragile-hit absorb. Theta's clay-craft makes your cargo waterproof. Locks the .5↔.6 cross-patch synergy.

### world-overlay system

Save-stored + multiplayer-synced object table. Keyed by canonical ID: `${placerId}-${placedWallClock}-${ci}`. Wall-clock timestamps (not ticks) for cross-session decay math.

**Object types (v0.0.9.6):**
- Placed ladder / anchor structures (as above)
- Trail cells (per-cell trample value, see below)

**Baked upgrade flags at placement.** A ladder placed by a player with lambda's mountain-gear-upgrade lasts longer *for all viewers*, not dependent on the observer's upgrades. Required field in the placed object.

**Visibility sharding**: build sharding-compatible shapes now (canonical IDs, wall-clock timestamps). Actual filter function activates when active player count reaches ~10 (user's threshold call). For v0.0.9.6: every save sees every object.

### trails

Per-cell `trample` float + `lastStepTick`. Tracked in the world-overlay table. Each courier step on a cell adds `TRAMPLE_PER_STEP` (starting value 0.1). Cap at 1.0 (fully paved).

**Effects scale with trample:**
- Virgin terrain (trample = 0): full terrain penalty
- Walked-in path (trample ≈ 0.5): penalties reduced ~30%
- Paved (trample ≥ 0.9): penalties reduced ~70-80% (effectively flat terrain)

**Multiplayer sync:** each player's steps contribute to the shared trample value. Emergent "paving" — popular shortcut routes become easier for everyone over time.

**Visual:** glyph/color ramps with trample: `.` → `,` → `;` → `:` or a cyan-intensity ramp.

**Decay schedule:** stubbed in .6, real decay revisit in v0.0.9.9+.

### mountain-pass carving

Natural extension of trails. Repeated crossings of the same mountain cell increase trample. At high trample (≥0.85), the cell becomes a **free pass** — no gear required, minimal penalty. This is the long-described "mountain-pass-carving" mechanic finally landed.

### storm system rework

Storms already spatial (v0.0.8.7). Extensions for .6:
- **Interior sweep.** Storm center can be ANY world point (ring or interior), not just edge cells. Isobar minimap redraws to show the full 2D plane.
- **Spawn frequency 2×.** Current `nextStormSpawnTick` interval halved.
- **Multiple concurrent storms.** Current code assumes 1 storm at a time; rework `S.storms[]` to handle multiple. Each has its own center, radius, intensity.
- **Combine/intersect stub.** When two storms' radii overlap, flag combine/intersect logic as FUTURE — stub the detection (store overlap percentage) without implementing behavior. Revisit in v0.0.9.9+.
- **Cloud layer over terrain.** Storms fly over mountains unimpeded (cloud layer > terrain). No terrain-storm interaction in .6.
- **Storm wear accelerator.** Placed ladders + anchors accelerate wear when physically within a storm's radius. Spatial check per tick.

### proposed commit split

1. ✅ **Terrain bones + zone data + plan corrections.** Shipped as [js/data/terrain.js](js/data/terrain.js) + [drawInterior in js/render/route-map.js](js/render/route-map.js). Deterministic classifier `terrainAt(x, y)` anchored at corner + rim NPCs; glyph/color/opacity tables per biome; renderer hooks. Cosmetic only — mechanics attach in later commits. Plan-doc corrections bundled: river geometry (theta NE → delta bottom-rim + W tributaries), delta-dam story (catches theta river, not mountain runoff), plateau restriction drop, kit-bar "existing" framing, deferred-list trust-rewards strike. Verifiable: inspect `.route-interior text` fill counts per color in the route SVG.
2. ✅ **Label-pool normalization + terrain-origin pool.** Shipped as v0.0.9.6.3. Dest-weight retune turned out to already be done (v0.0.9.5 commit 1 extended the curve to 12 entries `[30,20,15,10,8,6,4,3,2,1,0.7,0.3]`), so commit 2 pivoted to pure label work. Normalized per-NPC counts from 15-50 → 30-43: xi 50→30, tau 49→37, psi 42→42, pi 15→31, lambda 17→35, gamma 18→41, nu 20→34, theta 22→36, delta 23→40. Narrowed 7 generics (sealed letter 6→2 dests, medicine 5→2, tool roll 4→2, etc) and authored 20 flavored-variant companions (letter family + medicine family + kit family + first-aid family + battery family + ration family + repair family). Added 51 unique new-cast fill labels across all 4 size tiers. Applied 5 miscast prunes + ~18 additional cross-prunes on xi/tau/psi for ceiling. New `PKG_LABELS_BY_TERRAIN_ORIGIN` export (43 labels: 17 plateau + 13 mountain + 13 rockyHills across s/m/l/xl) ready for commit 5 to consume. Rim pool total: 232 → 303 labels.
3. ✅ **Shortcut mechanic rewrite + interior on-grid + severe-trip state machine.** Shipped as v0.0.9.6.4. Per-cell `TERRAIN_TRIP_MULT` / `TERRAIN_STAMINA_MULT` / `TERRAIN_CANTEEN_DELTA` replace the flat `SHORTCUT_*` constants (retired). River water +0.3/tick canteen refill; desert stamina ramps with `daylightOf()` (×1.0 night → ×1.4 midday). 4 on-grid gate flips: pickup scanning, weather, scanner, river-refill all active on interior (wetland refill stays ring-only). Severe-trip state machine: `severityChance = max(0, (tripMult - 1.0) * 0.5)` gives river 10% / rockyHills 25% / mountain 50% severe-fire-on-trip. River severe → new `river-drift` segment sweeps courier 5-10 cells along theta→delta channel at ×0.4 walk speed, catches self, spawns fresh shortcut to original dest. Mountain severe → stall 5-8 ticks (no position rewind, avoids infinite-loop trap). Rocky hills severe → stall 2-3 ticks. Per-terrain cargo damage profiles: fragile always hit on mountain/river, 50% on hills; non-fragile 60% mountain / 50% river / 0% hills. `ceramicWrap` (theta t40) makes fragile pkgs water-immune on river severe (first live wiring of the .5 flag). Mountain/hills severe kept as stall (not tumble-displacement) — revisit with trample integration in commit 6 once per-cell state provides loop-safe escalation. Full terrain message pools added for catch/empty/drop/damage/writeOff × mountain/rockyHills/river. Verified in preview: trip chance scales 1.5× on rockyHills cells, river-drift segment creates and auto-repaths, mountain stall pauses dotT advancement, severe damage fires with `ceramicWrap` immunity respected.
4. ✅ **Ladder + anchor gear.** Shipped as v0.0.9.6.5. Kit-bar integration: `‐‐` (rungs) ladder capsule + `†` (dagger) anchor capsule next to battery, each with count + `[+5¢]` buy button; `auto-gear: on/off` toggle at far right matching the `grab: auto` pattern, default ON per idle-first. Session-local `S._transient.placedGear` array (commit 5 lifts to world-overlay); `S.kit` persists via v8 migration (no schema bump). **3-tier auto-flow** on interior cell entry: placed gear present → use free; item in kit → consume + place; kit empty + autoGear + scrip ≥ 5¢ → buy + place (log -5¢); otherwise → full penalty + throttled "no gear here" warning (once per terrain type per shortcut, reset on segment change). Non-directional in commit 4 — ladder auto-places on mountain/rockyHills/plateau, anchor auto-places on river; directional (ascent vs descent) deferred to commit 6 when trample provides per-cell state to make tumble-displacement loop-safe. Mitigation: GEAR_TRIP_MITIGATION = 0.65, GEAR_STAMINA_MITIGATION = 0.75 — placed ladder on mountain drops trip ×2.0 → ×1.3 and severity chance 50% → 15%. Wall-clock durability: 12h base, 24h with lambda's mountainGear (baked at placement for all viewers). Wear tiers fresh (0-35%) / weathered (35-70%) / rotting (70-100%) with color + tooltip shifts; `gear-rotting` CSS pulse animation. Storm wear accelerator (GEAR_STORM_DECAY_PER_TICK_MS) wired dormant until commit 7. No stamina cost on placement (user call: scrip + consuming the tool is enough friction). New [js/gear.js](js/gear.js) module exports autoPlaceForCell / placedGearAt / buyGear / tickGearDecay / resetGearLogThrottles. Verified in preview: mitigation ratio 0.650 exact on mountain cells, auto-buy fires correctly across terrain types, kit bar UI updates in place, placed-gear glyphs render on route map with wear-tier colors.
5. ✅ **World-overlay + pkg-origin schema v9 + interior spawns.** Shipped as v0.0.9.6.6. **Save schema v8 → v9.** placedGear promoted from `S._transient` to persistent `S.placedGear` (shared infrastructure survives reloads + peer placements land in the local table). Canonical ID format `${porterId}-${placedWallClock}-${cellKey}` — deterministic across viewers so broadcast receivers dedup cleanly. Full broadcast paved per user call: each placement calls `broadcastGearPlacement({id, placerId, type, x, y, placedWallClock, lifetimeMs, terrain})` via postActivity; pollFeed dispatches `gear_placement` events to `gear.receiveGearPlacement()` which upserts and posts a channel message `PTR-XXXX placed a ladder on the slope`. Pkg-origin schema extended with optional `terrainOrigin: 'plateau' | 'mountain' | 'rockyHills' | null` alongside the existing `outboundFrom: npcId` field (pattern parallel). New `rollInteriorPkg()` pulls labels from `PKG_LABELS_BY_TERRAIN_ORIGIN` (shipped commit 2) with per-terrain biases: mountain +4x xl-weight + 1.3x scrip reward; rockyHills 1.5x modifier-rate bump; plateau standard roll. Destination from standard DEST_DIV_WEIGHTS curve using cell's nearest-edge as virtual origin so forward-bias routes cashable. `seedInteriorPkgs()` runs at world-init per-cell with pointInRing filter (terrain classifier can leak outside ring polygon); spawn rates INTERIOR_SPAWN_{PLATEAU=0.10, MOUNTAIN=0.03, ROCKYHILLS=0.05}. `scanForPickup` extended with `scanInteriorPickups()` — checks interior pkgs within PKG_PICKUP_RANGE SVG units of courier on shortcut / river-drift segments, respects autoGrab toggle. `acceptInteriorPickup` gates plateau pkgs on a placed ladder at same cell — tutorializes gear mechanic. Respawn mirrors ring pattern via `INTERIOR_RESPAWN_TICKS = 800` with scavengerEye 20% reduction. Route map renders interior pkgs as `▲` (plateau, larger) / `■` (mountain, rockyHills) glyphs between gear and ring layers. Throttled `plateauGateLogged` transient flag stops the "out of reach" message from ping-ponging with cargo-full. Verified in preview: 7-12 interior pkgs seed per fresh world, broadcast queue receives gear_placement events with full payload, peer placements dedup on canonical ID and post channel message, plateau gate holds without ladder + releases with.
6. ✅ **Trample + pass carving + placement UX trim.** Shipped as v0.0.9.6.7. Per-cell trample state on `S.interiorTrample` (sparse `"x,y"` → 0..1 float, rides v9 schema additively). Every tick on an interior cell bumps TRAMPLE_PER_STEP = 0.005 (~17-34 crossings to paveable). Continuous linear mitigation: `reducedMult = baseMult - (baseMult - 1) × trample` — composes with commit 4 gear mitigation (gear narrows range, trample paves the remainder). Applied to both tripChance + stamina drain. At TRAMPLE_PASS_THRESHOLD = 0.85 on mountain cells, severity chance zeroes outright — the long-described **mountain-pass-carving** mechanic finally landing. Visual ramp: fresh cells keep base terrain glyph; walked (0.25-0.5) `,` overlay, paved (0.5-0.85) `;`, carved (≥0.85) `:` cyan. New [js/trail.js](js/trail.js) exports trampleAt / addTrampleAt / isPassCarved / trampleTier. Dropped from commit 6 scope per user lock: drag-to-place UX (commit 4 auto-placement covers the use case cleanly), mountain tumble retrofit (stall mechanic remains in place; polish pass can revisit with sim data). Also fixed a commit-5 latent bug: saveGame was writing to SAVE_KEY_V8 key despite SAVE_VERSION = 9. Migration unaffected (load chain handles both keys); new saves now go to v9 key. **Multiplayer trample sync DEFERRED TO COMMIT 7** — per-tick broadcasts would flood the activity feed; sync lands as milestone broadcasts at 0.25 / 0.5 / 0.85 threshold crossings (each cell broadcasts ≤ 3 times regardless of tick rate). Straightforward to implement since commit 5 paved the broadcast wire. Verifiable: walk interior cell 200 ticks, observe trample 0 → 1 + trip chance 50% reduction + carved flag fires at 0.85; save/load round-trips trample cleanly.
7. ✅ **Storm sweep + multi-concurrent + 2× spawn + intensity gradient + gear wear + trample sync + weather radio landmarks.** Shipped as v0.0.9.6.8. Full storm system rewrite: position model unified from ring-based `(edgeIdx, t) → primaryCell` to native `(x, y, dx, dy)` for ring AND interior storms alike (one motion model). MAX_CONCURRENT_STORMS = 4 cap, STORM_DRY_MIN/MAX halved to 100/400 ticks (2× spawn), STORM_INTERIOR_SPAWN_PCT = 0.5 (50/50 ring/interior mix, ring retains its 40% wetland-edge bias). Interior spawn via rejection sampling inside ring polygon. Spawn scheduling decoupled from storm count — spawns fire while under cap, regardless of existing storm count. **Intensity gradient** in `weatherAtPoint` (sum potentials from all storms, normalize against dominant storm's max, bucket into intensity — overlap zones can nudge rain → downpour, cap at 1.2 so no super-tier emerges). **Combine/intersect detection stub** — pairwise radius overlap % stored on `storm.intersects[]` each tick; merge/cancel behavior explicitly deferred to v0.0.9.9+. **Gear wear accelerator** — `tickGearDecay` now iterates placed gear × storms, bumps `stormDecayExtra += 2 × TICK_MS` per tick inside any storm radius (3× effective decay, first live wiring of the commit-4 reserved field). **Weather radio landmark display** — `scheduleNextStorm` pre-rolls `S.nextStormSpawn = { type, x, y, isInterior, nearestNpcId }`; L1 warning renders as `"front forming near tau — ~30s"` or `"squall forming in the interior near pi — ~20s"`. **Trample multiplayer sync** (commit-6 deferral resolved) — `addTrampleAt` detects 0.25/0.5/0.85 threshold crossings and broadcasts `trample_milestone` events via postActivity. Receivers merge cell trample by max. Carved-threshold (0.85) crossings post a channel line `"PTR-XXXX paved a trail"` — lower thresholds silent to keep channels clean. Schema migration: legacy ring-shape storm entries dropped on load (transient in-session state; losing active storms at upgrade is acceptable, fresh spawns fire via schedule). Also fixed an init-order bug: `initWeather` was running before `layoutRouteNodes`, leaving first storm preroll at a (200,200) fallback. Reordered so nodes populate first. Verifiable: multi-storm concurrent spawn + interior locations + intensity gradient in overlap zones + combine detection populates intersects[] correctly + gear inside storm radius decays at 3× rate + trample 0.85 crossings emit milestone events + weather radio reads `"forming near [npc]"`.

Seven commits (was six; dest-weight retune + interior-origin label pools split out of commit 1 during the v0.0.9.6 design walkthrough 2026-04-17 since they touch pkg spawning code not terrain code). Each verifiable. Save schema bump moves to commit 5 (world-overlay + pkg-origin both persisted); commits 1-4 ride on v8 schema from .5.

### scope — deferred

- **NPC-dispatched pkgs with interior destinations or origins.** Cell-native interior pkgs (plateau / mountain / rocky-hills salvage) land in .6 commit 5. NPC-dispatch *into* the interior (NPC-A sends to an interior point → player finds, delivers to NPC-B) is the harder interior-spawn flow and defers to v0.0.9.7+.
- **Trail decay schedule.** Stubbed in .6; real decay curves revisit in v0.0.9.9+ when trail data has been playable long enough to read feel.
- **Storm combine/intersect behavior.** Detection stubbed; behavioral rules (merge into super-storm? cancel each other out? create intensity gradient?) punted to v0.0.9.9+.
- **Interior landmarks / points of interest.** Clay deposits at theta's, a mountain summit marker, etc. Atmospheric polish — land post-core mechanics.
- **Visibility sharding active filter.** Shapes ready (canonical IDs + wall-clock), filter activates at ~10 active players.
- **Weather-modulated decay rate for placed structures beyond storm-spatial.** Current .6: only active-storm wear accelerator. Ambient humidity / rain-inside-a-storm modulation deferred to v0.0.10 with real shelters.
- **Thick side-view-strip climbing animations.** Commit 1 ships the ground-strip terrain-variety glyphs in v0.0.9.6 as "thin" — texture changes, `@` walks across it normally, the map carries the gameplay truth of climb / descent / river-cross. "Thick" vertical rendering (`@` rising in screen-Y during ascent, ladder rungs overlaid, rope spans, fall animation on plateau descent) reserved for v0.0.9.7 "open polish slot" — paired with the parked destDrift / scene-backdrop rework since both touch the side-view motion model.
- **Clay-bed saturation gradient.** Plan calls for saturated `#a64a2e` near theta fading to dry `#98875f` distant from source. Commit 1 ships single-color `#b8a072` for simplicity; gradient is a visible-polish follow-up.
- ~~Trust-rewards-via-shop refactor~~ — **shipped in v0.0.9.5.2** (2026-04-17, impact-tiered pricing at 60/100/150). Struck from this list.

---

## v0.0.9.8 implementation plan

Drafted 2026-04-16 during the v0.0.9.3.1 polish commit. Briefly took the .4 slot, then the .6 slot, before the user settled on **v0.0.9.8 (post-NPC-work, pre-final-polish)**. Rationale: letting all the v0.0.9.4-.7 systemic work land first means the significance taxonomy can absorb the new event vocabulary (new NPC dialogue, terrain-specific events, ladder/anchor/trail interactions, new trust gifts) before the journal starts persisting. The patch gets bigger (more tag sites to audit) but the journal it produces is much richer — a player scrolling back through a save actually reads something resembling a courier's story across the full world.

**All six design decisions locked during the .3.1 walkthrough** (see below). Only open work when picking this up:
1. **Re-audit `addLog` call sites** across the .4-.7 patches to find new event types that should be tagged significant (expect: NPC hand-offs, NPC gift dialogue at new callsigns, ladder/anchor place + break events, river wade, mountain ascent, desert canteen-stress warnings, etc.).
2. **Confirm `SAVE_VERSION`** in [constants.js](js/constants.js) — currently v7 as of .3.1; likely advanced during .4-.7. Bump to the next integer.
3. **Update the subtitle bump target** to whatever sub-version this ships as (probably v0.0.9.8; confirm no v0.0.9.7.N micro-patches displaced it).

### thesis

Current log: [js/render/log.js:36](js/render/log.js:36) inserts a DOM `<span>` at `firstChild` and deletes lines past 14. Log vanishes on reload. Player sees a snapshot of "what just happened," nothing more. `#logEl` already has `overflow-y: auto` + styled scrollbars at [the-long-haul.css:957](the-long-haul.css:957) — the only thing blocking scrollback today is the hardcoded 14-line cap.

Retarget: the log becomes the courier's journal. Render window stays small (~30 DOM nodes) for performance; history array is unbounded in session and a significance-tagged subset persists across saves. Significant events (deliveries, trust unlocks, discoveries, milestones, trip losses, NPC gifts) survive the session. Ephemeral chatter (harvesting ticks, drinks, pickup fails, scan cooldowns, save confirmations) doesn't. Scroll down = time travel through your courier's story.

### architecture

**In-memory history.** `S._transient.logHistory: LogEntry[]` — unbounded. Entry shape: `{ ts, msg, sig }` where `ts = ticks-at-addLog-time`, `msg = rendered HTML string`, `sig = boolean — significant event or chatter`. Newest at index 0 (matches current DOM insertion semantics).

**Persisted journal.** `S.log: LogEntry[]` — filtered to `sig === true` on every `addLog`. Hard cap at ~1000 entries (drop oldest when exceeded). At ~80-150 bytes/entry × 1000 ≈ 80-150KB — comfortably within localStorage budget (5-10MB per origin). Rehydrated into `_transient.logHistory` on `loadGame`.

**Render window.** First paint renders the latest `WINDOW_SIZE = 30` entries as DOM nodes. Container scrolls; DOM only ever holds the window.

On scroll-down (user near the oldest rendered node):
- Hydrate next `WINDOW_EXTEND = 30` entries from `logHistory`, append below.
- Grow the DOM as the player reads history. Cap at `MAX_DOM = 500` so a long scroll session doesn't blow up the DOM forever — when exceeded, drop from the top (newest-in-DOM; user can scroll back up and re-hydrate).

On `addLog` while user is viewing latest (scrollTop ≈ 0):
- Insert DOM node at firstChild (current behavior preserved).
- Evict the oldest DOM node if size > `MAX_DOM`.

On `addLog` while user is scrolled down viewing history:
- Push to `logHistory` + `S.log` as normal.
- Do NOT insert a DOM node at top (would push user's scroll position and feel jumpy).
- Show a floating "↑ new messages" pill inside the log container. Click → scroll to top + flush pending-inserts → pill disappears.

### significance taxonomy

Tagged at `addLog` call sites via a second arg: `addLog(msg, { sig: true })`. Default is `sig: false` so any un-updated call stays ephemeral.

**Significant (persist across saves):**
- Deliveries (`delivered [size] label to {dest} — +Xc +N trust`) — [packages.js:281](js/packages.js:281)
- Trust gifts / unlocks (`{callsign} gave you {name}`) — [trust.js:196](js/trust.js:196)
- Trust intel share (`{callsign} shared route intel`) — [trust.js:181](js/trust.js:181)
- Rest at depot (`rested at {callsign}`) — [trust.js:289](js/trust.js:289)
- Discoveries (`discovered: {label}`) — [main.js:308](js/main.js:308), [packages.js:269](js/packages.js:269)
- Milestones (`milestone: Xkm walked`) — [multiplayer.js:325](js/multiplayer.js:325)
- Trip losses (`tripped! {label} fell / lost / damaged`) — [trip.js:181](js/trip.js:181), [trip.js:183](js/trip.js:183), [trip.js:201](js/trip.js:201)
- Package recoveries (`recovered {label}`) — [packages.js:290](js/packages.js:290)
- Weather radio warnings (`weather radio: {type} incoming`) — [main.js:371](js/main.js:371)
- Boot events — purchase ([boots.js:47](js/boots.js:47), [boots.js:68](js/boots.js:68)) + sandalweed-lash ([boots.js:61](js/boots.js:61))
- Save import / wipe — [save-io.js:216](js/save-io.js:216), [persistence.js:395](js/persistence.js:395)
- New package spotted — [packages.js:318](js/packages.js:318)
- Battery charged at depot — [main.js:339](js/main.js:339)
- Exhaustion → auto-rest — [main.js:285](js/main.js:285)
- **Package pickups** — [packages.js:225](js/packages.js:225). Tagged `{ sig: true, pkgId: pkg.id }`. Pruned from `S.log` on successful delivery (see taxonomy q#6 below) so the persistent journal collapses pickup+delivery into just the delivery. Kept on trip-loss / drop so the "picked up X → lost X" story survives. In-progress pickups (still in cargo at save time) persist — unfinished stories carry across reloads.

**Ephemeral (session only, `sig: false` by default — no code change needed at call sites):**
- Harvested sandalweed (fires per harvest, spammy) — [packages.js:174](js/packages.js:174)
- Drank from canteen (fires per drink, spammy) — [stamina.js:139](js/stamina.js:139)
- Pickup fails — [packages.js:194](js/packages.js:194)
- Sticky gun refill — [packages.js:239](js/packages.js:239)
- Scanner cooldown — [scanner.js:81](js/scanner.js:81)
- Manual scan — [scanner.js:45](js/scanner.js:45) (borderline; lean ephemeral)
- Caught yourself (near-trip) — [trip.js:155](js/trip.js:155)
- Tripped on loose rubble (no-cargo case) — [trip.js:203](js/trip.js:203)
- Cargo tied down — [boots.js:118](js/boots.js:118)
- Boot clip refilled — [boots.js:94](js/boots.js:94) / boot-clip low prompt — [boots.js:81](js/boots.js:81)
- Save confirmations + failures — [persistence.js:120](js/persistence.js:120), [persistence.js:125](js/persistence.js:125), [persistence.js:130](js/persistence.js:130)
- Porter online / restored — [main.js:439](js/main.js:439), [main.js:441](js/main.js:441)
- Feed throttled — [multiplayer.js:131](js/multiplayer.js:131)
- Admin channel (debug surface) — all [admin-channel.js](js/admin-channel.js) calls

Roughly 15-17 call sites flip to `sig: true`; ephemeral ones stay unchanged.

### save schema

Bump `SAVE_VERSION` in [constants.js](js/constants.js) to the next version (as of .3.1 plan draft, current is **v7** — verify at build time, may have moved during v0.0.9.4/.5). Add the previous accepted version to the accepted-for-migration list in [persistence.js](js/persistence.js) (currently lines 141, 158 — line numbers may drift). New persisted field: `S.log: []`. Migration for pre-bump saves: load with `S.log = []` — no history before the patch; player's journal starts at this patch's ship time. Document the cap (`LOG_PERSIST_CAP = 1000`) as a constant in constants.js so tuning is single-file.

### design decisions (locked with user during v0.0.9.3.1 planning walkthrough)

1. **Window tuning** — ✅ approved. `WINDOW_SIZE = 30 / WINDOW_EXTEND = 30 / MAX_DOM = 500`. Tune if the scroll feel wants it after the feature is live.
2. **Scroll-pinning** — ✅ approved. Pill-when-viewing-history; new messages insert silently into top of DOM only when the user is already at the top. User clicks the pill to jump up and flush pending inserts.
3. **Persisted hard cap** — ✅ 1000 entries. At ~130-250 bytes/entry (JSON of rendered HTML strings) that's ~150-250KB, well inside the 5-10MB localStorage budget (~20× headroom over current save size). If we ever want 5000+, switch persisted shape from rendered-HTML strings to event-type + args and re-render on read (~60-80 bytes/entry).
4. **Post-death recovery view** — ❌ question was hallucinated. TLH has no death/game-over mechanic. `js/recovery.js` handles *lost-cargo recovery* (picking up other porters' dropped pkgs) — nothing to do with player death. Dropped from the plan.
5. **Prior-session separator** — ✅ approved as polish: subtle color shift on entries loaded from `S.log`, open to a `— session resumed —` line. User noted UI polish is always a plus for this game and is happy to iterate in mockup. Not load-bearing for the mechanic — lives in commit 5.
6. **`picked up` tagging — conditional on still-in-inventory.** ✅ refined from "ephemeral for v1" to: tag pickups `sig: true` AND give each pkg a unique `id`; log entries optionally carry `pkgId`. **On successful delivery** — prune the matching pickup entry from `S.log` (collapses pickup+delivery pair into just "delivered" in the persistent journal). **On trip-loss, drop, or other unresolved ends** — keep the pickup (story `picked up X → lost X in the mud` is exactly what a player should remember). **In-progress pickups** (still in cargo at save time) persist — unfinished stories carry across reloads. Tiny implementation: one `id` field added at `rollPkg` time, one `pkgId` field on log entries, one `removeLogEntryByPkgId(pkgId)` call in the delivery path.

### files the patch will touch

- [js/render/log.js](js/render/log.js) — core rewrite. `addLog(msg, opts)` signature, window rendering, scroll listener, pill element, rehydrate-on-load helper, `removeLogEntryByPkgId(pkgId)` helper.
- [js/state.js](js/state.js) — add `S.log: []` (persisted), `S._transient.logHistory: []`.
- [js/persistence.js](js/persistence.js) — serialize/deserialize `S.log`, schema bump + migration, rehydrate `_transient.logHistory` on `loadGame`.
- [js/packages.js](js/packages.js) — add `pkg.id = crypto.randomUUID()` (or an incrementing counter) in `rollPkg`. Tag pickup log `{ sig: true, pkgId: pkg.id }`. Tag delivery log `{ sig: true }` + call `removeLogEntryByPkgId(pkg.id)` to prune the pickup from `S.log`.
- ~15 other `addLog` call sites across [js/trust.js](js/trust.js), [js/trip.js](js/trip.js), [js/main.js](js/main.js), [js/boots.js](js/boots.js), [js/multiplayer.js](js/multiplayer.js), [js/save-io.js](js/save-io.js) — tag `sig: true` at the significant sites.
- [the-long-haul.html](the-long-haul.html) — "↑ new messages" pill element (absolute-positioned inside the dispatch-log panel). Subtitle bump to whatever sub-version this patch ships as.
- [the-long-haul.css](the-long-haul.css) — pill styling; prior-session visual separator (subtle color shift on pre-session entries, optional `— session resumed —` line; user approved a mockup pass for this).

### sequence — proposed commit split

1. **Signature change.** `addLog(msg, opts?)` with default `{ sig: false }`. Tag the 15+ significant sites. No behavior change yet. Verifiable: game still works, untagged calls still ephemeral.
2. **In-memory history.** Add `S._transient.logHistory`, push on every `addLog`. Rendering still 14-line cap. Verifiable: `logHistory` grows unbounded in the console while DOM stays capped.
3. **Windowed rendering + scroll hydrate + pill.** Replace the 14-line cap with the window + scroll-down hydrate + "↑ new messages" pill flow. Verifiable: scroll reveals history; pill appears when scrolled while new messages arrive.
4. **Persistence + schema bump.** `S.log` serialized, `LOG_PERSIST_CAP`, migration path, rehydrate on load. Verifiable: reload → journal carries over; old saves open without crash with empty log.
5. **Polish (optional).** Session-break separator, mobile tuning, visual-journal treatment.

Save schema bump is last so existing branches don't inherit a half-built migration.

---

## commit 2b — what shipped (v0.0.7.20)

Final commit of the bugfix patch. The four queued items plus one late-breaking find and one opportunistic rename.

### 0. distKm rounding-stomp (the big one — unplanned)

**User-reported symptom**: HUD `walked` counter stuck at 0.0km no matter how far the courier walked. User flagged it early in the session as "either pre- or post-refactor weirdness."

**Root cause**: [js/trip.js](js/trip.js) `accumulateDist()` stored the running total via `S.distKm = Math.round((S.distKm + delta) * 10) / 10`. Per-tick delta is ~0.025km. `Math.round(0 + 0.025 * 10) = Math.round(0.25) = 0` (JS rounds half-away-from-zero; 0.25 rounds DOWN to 0 not UP to 1). So every tick the running total was overwritten with `0 / 10 = 0`. Per-tick delta was below the 0.1km rounding resolution.

**Why it wasn't caught before**: the pre-commit-6 derived formula `(edgeIdx+dotT)*4.2` fired every 5 ticks with ~0.125km jumps — above the 0.1 rounding floor. Commit 6's switch to a per-tick accumulator exposed the bug, but commit 2a's edge-wrap fix only addressed the wrap math. Rounding stomp was the real ceiling.

**Fix**: drop the `Math.round` on write; [hud.js:32](js/render/hud.js:32) already rounds for display. One-line change: `S.distKm += delta`.

**Neither pre-refactor nor post-refactor regression** — it's an accumulator bug that's existed since commit 6 landed on the pre-refactor monolith. Confirmed by reading the old blob-derived pattern.

### 1. Tie-down option B (shipped as spec'd)

Implemented in [js/trip.js](js/trip.js) `maybeTrip()`. Tie-down now absorbs drops AND damage. Chose slightly tighter structure than the spec's three-step flow: the tie-down branch fires early (right after catch-fail), consumes the tie-down, does the stumble (boot damage + tripped status), and returns. The drop roll and damage fallback never execute. Net behavior identical to spec's flow. Log line: "tripped! tie-down held — cargo protected. re-arm to use again" (preserved existing wording; minor tweak for consistency).

### 2. Rain restructure (shipped, with tuning divergence)

Fields placed on `S._transient` rather than root S (spec was ambivalent). Reasoning: they're pure scheduler plumbing — no semantic meaning for save/load, re-seedable on load, fits the `_transient` pattern. Matches `lastGearPopKey` / `lastDistEdgeIdx` / etc.

Implementation in [js/main.js](js/main.js): new `scheduleNextRainTransition()` helper called from `init()` after `setRain(false)`, and from the tick's rain block after each transition fires. Rain tick collapses to a clean 8-line branch checking `S.ticks >= S._transient.nextRainEndTick` (when wet) or `>= nextRainStartTick` (when dry).

**Tuning divergence from spec**: spec suggested dry-period 100-300 ticks (~35-105s at TICK_MS=350). I went **200-800 ticks** (~70s-4min, mean ~500). Rationale: the current 0.003/tick coin-flip has mean wait of ~333 ticks; spec's 100-300 would roughly 2× the rain frequency. Mine is close to current feel, leaning slightly less rainy. If you disagree with the tuning, it's a one-line constants change — [constants.js](js/constants.js) `RAIN_DRY_MIN_TICKS` / `RAIN_DRY_MAX_TICKS`.

Wet-period 40-100 ticks preserved exactly from the old code.

Warn window constant: `RAIN_INCOMING_WARN_TICKS = 25` matches spec. `tryWarning` check rewired accordingly. `S.rainTimer` removed from state.js (it was never persisted).

### 3. Wetland canteen refill (shipped as spec'd)

Added `currentCellIsWetland()` helper in [main.js](js/main.js) alongside the existing `currentCellIsRisky` pattern (tidier than inlining the `worldCells[ci].wetland` check). Wired in the tick as an `else if` after `isRaining||inRiver` — wetland only refills when NOT already refilling from rain/river, so no double-dipping. Tuning preserved at 0.05/tick.

### 4. Pickup-fail logs (shipped with dedupe divergence)

**Dedupe strategy divergence**: spec used a 30-tick cooldown shared across both fail modes. I used a **capacity-keyed cache** (`lastPickupFailKey = ${ci}:${usedSlots}:${usedWeight}`). Trade-off:
- Spec: one log per 10s window, regardless of what changes.
- Mine: one log per unique (cell, capacity) state. Re-fires immediately when the player drops or delivers cargo and walks past the same pkg — capacity changed, so the state changed, so the log refires. Net UX: player gets "can't lift X — too heavy" when they first approach, then stays quiet while walking alongside, then re-fires promptly after delivery/drop.

I think mine is slightly better — state-change-driven rather than time-driven. But happy to swap to spec's tick cooldown if you prefer.

**Message format divergence**: spec had "cargo full" / "too heavy (Xkg, Ykg free)". I used **"can't lift [S] label — no cargo slots"** / **"can't lift [S] label — too heavy"**. Dropped the weight details for terseness — the HUD already shows weight/slots. If you want the details back, one-line change in [packages.js](js/packages.js).

### 5. depotRestPending / restPromptPending rename (bonus, folded in at user request)

[state.js:117](js/state.js:117) declared `depotRestPending: null` but [trust.js](js/trust.js) wrote `restPromptPending` (created on the fly). Harmless (object bag) but misleading. Renamed trust.js's 4 call sites to match the canonical declaration. Closes "noticed bug #3" from the previous handoff.

### files touched
[js/trip.js](js/trip.js), [js/main.js](js/main.js), [js/constants.js](js/constants.js), [js/state.js](js/state.js), [js/trust.js](js/trust.js), [js/packages.js](js/packages.js), [the-long-haul.html](the-long-haul.html), [TLH-HANDOFF.md](TLH-HANDOFF.md). Single push.

### save schema
No bump. Stays v5. `S.rainTimer` removed (was never persisted). New fields all `_transient`.

### verification on hard refresh
1. **walked counter advances** — the one that was stuck at 0. Fix should be visible within seconds.
2. Arm tie-down → trip while carrying → "tie-down held — cargo protected" fires, no drop, no damage payout log.
3. Rain cycles on a sane schedule — roughly one rain event every 2-5 minutes, each ~20-35s at TICK_MS=350.
4. Walking through wetland cells (scrub/marsh zones): canteen slowly ticks up even without rain. Compare pre/post.
5. Walk past a too-heavy pkg → "can't lift [M] label — too heavy" fires once. Walk back over, stays quiet. Deliver cargo, walk past again → re-fires.
6. t80+ trust at a depot with low stamina → "accept rest at rho/iota/tau" button still appears (depotRestPending rename didn't break the prompt flow).

---

## design decisions made this session (don't relitigate)

The v0.0.7.18/.19 session spent serious time on a few design questions. Recording the conclusions so the next agent doesn't re-explore them.

### tie-down semantics: "option B" (shipped in commit 2b)
- Tie-down absorbs the next drop OR damage (whichever comes first), free, manual, one-shot.
- Framing: "active management for active players" — players who watch the window get to dodge consequences; idle players take the full punishment of the trip system.
- Implementation: in `maybeTrip()`, the tie-down branch fires right after the catch-fail check, consumes the tie-down, runs the stumble (boot damage + tripped status), and returns. Drop roll and damage fallback never execute.

### sandalweed redistribution (shipped in commit 1)
- Wetlands now the primary source (`SANDAL_RATE_WETLANDS = 0.006`).
- Depot approach secondary (`0.003`).
- Scrub trace (`0.001`, was `0.008`).
- Road / ruins almost-never (`0.0005` and `0.001`).
- Conservative tuning to avoid trivializing boots. Watch player feedback; retune in `js/constants.js` (centralized this session — used to live in `js/data/zones.js`).
- Design intent: "scarce overall, found mostly near wetlands and shelters" (verbatim from user).

### tooltip pattern (shipped in commit 2a)
- Custom CSS tooltip now reads from `attr(data-tooltip)` not `attr(title)`.
- Decouples custom hover overlay from browser-native tooltip (was double-rendering).
- JS sets `data-tooltip` (drives custom CSS) + `aria-label` (preserves screen reader behavior). Never `title` on `.has-tooltip` elements.
- Pattern applies to: `sandalBadge` in boots.js, `recoveryBadge` in recovery.js. Apply to any future custom tooltip.

### distKm accumulator math (shipped in commit 2a)
- Old: rollover correction added `+ring_length` indiscriminately when delta was negative; combined with the `> 2 * KM_PER_EDGE` cap, every edge transition lost a full lap of km.
- Fixed: rollover correction only fires when `delta < -KM_PER_EDGE` (true wrap or load skew). Edge transitions produce small negatives in `(-KM_PER_EDGE, 0)` which are trusted as the partial-edge step.
- Cap retained as a safety net for survivors.

### trust unlock storage (shipped in commit 2a)
- `onTrustUnlock` now writes to `npc.unlocks[tierKey]` (canonical, per state.js shape), NOT to `npc[tierKey]` (phantom property bypassing channels.js's chatter gate).
- `tryWarning`/`tryPreview`/`tryRestPrompt` updated to read `npc.unlocks.tN`.
- Existing players auto-migrate via `loadGame`'s ratchet.

### centralization rules of thumb (refined this session)
- Cross-zone resources (sandalweed, water refill rates) belong in `js/constants.js`, not in `js/data/zones.js`. Single-file balance pass beats hunting through zone defs.
- Cross-module helpers (pickRandom) belong in `js/util.js`. Don't add to util.js unless ≥2 modules need the helper.
- Single-module helpers stay local. Don't preemptively factor them out.

---

## queued bug list (post-2b, not yet picked up)

Most of the previous list is now closed. Remaining:

**Multiplayer / worker (NEXT UP — promoted to v0.0.7.21):**
1. **Cloudflare KV free-tier daily put quota (1000/day) easily exhausted by active testing.** Worker now returns 429 with `Retry-After` (deployed at worker v0.0.7.1) instead of crashing as 500. **This is now the next push** because hitting cap blocks all downstream testing of new content. Game-side TODO:
   - **Client-side rate limit on `postActivity`**: minimum 5s cooldown between any two posts; drop duplicate types within the window.
   - **Coalesce milestone broadcasts**: if 5km/10km/15km cross in quick succession, batch into one event rather than three POSTs.
   - **429 detection UI signal**: when POSTs start 429ing, dim the network panel + show "feed throttled — broadcasts paused" instead of the misleading "no signal" (which means "empty feed", not "broken").

**Noticed but not formally on the bug list (no rush):**
2. **`S.inRiver` is a stub.** Declared in `state.js` (`inRiver: false`), read in main.js tick (`if (S.isRaining||S.inRiver) S.canteen += 0.4`), never set by any code. Likely intended for future "courier wades river" mechanic. Will be wired when v0.0.8 terrain lands (rivers are part of that scope).
3. ~~State shape inconsistency: `_transient.depotRestPending` vs `restPromptPending`~~ — ✅ closed in commit 2b. Renamed trust.js to use the canonical declared slot.
4. **Sub-version naming**: HTML subtitle is now at `v0.0.7.20` and growing. The dimmed `.N` rendering is charming up to a point but starts looking weird after a dozen sub-versions. Roadmap recommends tagging `v0.0.8` cleanly when terrain lands. Mini-patches between now and then will be `v0.0.7.21`, `.22` — try to keep the runway short.
5. **Trust rewards auto-apply to the player instead of routing through the shop.** Current path in [js/trust.js](js/trust.js): `onTrustUnlock(nodeId, tierKey)` flips `S.upgrades[rewardId] = true` the instant a trust threshold is crossed, and `loadGame` retro-grants for existing saves. The player never "claims" anything — the upgrade just appears. Target shape: when a tier unlocks, the reward should show up in the shop (`renderUpgrades` scrip menu is the current surface, or a dedicated trust-rewards pane) as an NPC-flavored claimable item with unique dialogue per NPC × tier, and only apply to `S.upgrades` on claim. Two code paths need to stop auto-applying: (a) `onTrustUnlock` in trust.js, (b) the retro-grant block in `loadGame` in persistence.js — both should instead push into a `S.pendingTrustRewards` list that the shop reads. Migration concern: existing saves already have the upgrade granted; retro-grant should stay for them but skip writing to pending. Scope-wise this is aligned with `feedback_tlh_trust_rewards_shop` (user wants items claimed from shop, not auto-applied).

---

## specs: courier equipment v2

> Sequencing for these items lives in [roadmap](#roadmap) under "near-term arc: courier equipment v2." Specs preserved here verbatim.

Three items form the courier-equipment-v2 thematic arc: sticky gun, terrain scanner, mobile carrier. Acquisition: upgrades menu now; long-term plan to migrate to NPC trust rewards once map expands (v0.0.9).

### sticky gun

**Concept**: extends pickup radius from a reduced base. Has ammo, refills only at H. Takes a cargo slot; holster upgrade frees the slot.

**Tuning**:
- `PKG_PICKUP_RANGE` from 8 → 6 when gun owned; with gun: ~16.
- Ammo: 8 shots. Auto-refill on H arrival.

**State**: `S.stickyGun = null | { ammo, ammoMax, holstered }`.

**Pickup flow**: if gun + ammo > 0, scan range = 16; on cross-range pickup, decrement ammo, store `S.lastStickyShot` for fade-out visual overlay.

**Holster upgrade**: new `stickyHolster` (~80¢), requires gun. Frees cargo slot.

**Slot accounting**: `effectiveMax = S.maxSlots - (gun && !holstered ? 1 : 0)`.

### terrain scanner

**Concept**: periodic pings + manual ping (30s cooldown), buff against trip chances, bigger buff on risky terrain.

**Tuning sketch**:
- T1 (60¢): 30s interval, 6s buff, manual 30s cooldown.
- T2 (140¢, req T1): 20s interval, 8s buff.
- T3 (240¢, req T2): 15s interval, 10s buff (~66% auto-uptime).
- Manual always 12s buff (longer than any auto) — keeps manual valuable.

**State**: `S.scanner = { unlocked, level, manualCooldown, autoTimer, buffActive, buffRemaining, buffMagnitude }`.

**Trip integration**: `tripChance() *= buffMagnitude` when active (0.5 baseline, 0.3 on risky).

**Save schema**: needs v5 → v6 bump (manual cooldown must persist — no save-scum).

### mobile carrier

**Status**: design-incomplete. User flagged as substantial standalone item.

**Known design notes**:
- Battery (stub for now, **terrain scanner could share** — when scanner ships first, design battery as a real subsystem from day one rather than scanner-local timer).
- Separate inventory on cargo bar.
- Visible cart trail behind character.
- Cart cargo susceptible to bumps not tumbles.

**Save schema**: separate inventory means another bump (v6 → v7 likely). If shipped close enough to scanner in time, could fold into one bump — but don't block scanner waiting for carrier design.

**Open design questions** (need a conversation before building):
- How does carrier interact with tie-down? (Carrier cargo isn't on the courier's back — does tie-down protect it? Probably no, carrier needs its own protection mechanic.)
- Drop-and-leave-cart mechanic? Trust impact if a cart is left in the open?
- Can other porters interact with abandoned carts (multiplayer hook)?

### shared spec: battery subsystem (design ahead)

If sticky gun + scanner + carrier all eventually use battery, design it once when scanner ships:
- `S.battery = { charge, max, drainRates: {...} }` keyed by consumer.
- Recharge: at H by default, at any depot via upgrade.
- Each consumer registers a drain rate; tick subtracts sum.
- When `charge <= 0`, all consumers degrade to "off" gracefully (scanner stops pinging, carrier becomes manual-pull-only, etc.).

If carrier isn't built until much later, scanner gets a local timer instead and battery is introduced when carrier lands. Tradeoff: cleaner-now vs less-rework-later.

---

## specs: longer-horizon features

> Sequencing lives in [roadmap](#roadmap). Design notes preserved here.

### structures (v0.0.9 scope)

Postboxes, rainfall canopies, generators, lookout posts, ziplines, shelters, drone bays. Built on paths, degrade, upgradeable. Pulls in **multiplayer Tier 2** (per-region structure stewardship via KV).

KV schema sketch: `structures:{regionKey}` → list of `{ id, type, builder_porterId, condition, last_maintained_ts }`.

### terrain types (v0.0.8 scope)

Deserts, rivers (bridgeable), slopes/elevation/mountains. Wetlands "slow to travel" mechanic also fits here (currently wetlands only do canteen refill — half-implemented).

Closes the `S.inRiver` stub bug — rivers will actually set the flag when the courier wades.

### bigger map (v0.0.9 scope)

Grow route beyond 6 nodes. Unlocks trust-reward acquisition for sticky gun + scanner (currently only purchasable from upgrades menu — bigger map gives room to make them trust unlocks at new NPCs).

### radio chatter NPCs (v0.1 scope)

Player-authored radio messages, trust meter pooled with NPCs. Multiplayer Tier 3 territory.

### sign system (v0.1 scope)

Porters leave preset messages on cooldown. Sprout-emoji styled, animate in like sandalweed spawn. Pre-structure-tier social layer — could ship before structures if we want a social win without the structure-stewardship complexity.

### settlement quote evolution (v0.1 scope)

3-stage × 6-settlement quote rewrite. Needs the rebuild mechanic to be real first (so probably post-structures).

### admin debug/moderation tools (split: minimal early, full later)

**Minimal admin (cross-cutting infra, ship anytime)**:
- Give scrip
- Set trust per NPC
- Hidden URL hash gating (`#admin=<token>`) or a key combo

This pays for itself instantly during v0.0.8+ testing — manually grinding to t80 to test rest prompts is slow.

**Full admin (post-v0.1 parking lot)**:
- Edit porter hex
- Teleport to node/cell
- Toggle meters on/off
- Force-spawn pkgs / sandalweed / lost cargo

### post-v0.1 parking lot

- Day/night cycle (substantial, probably its own patch)
- Hot springs (field stamina restore with wait-time cost)
- Music-track-to-event integration (cross-cuts with `nav.js`)
- Porter profiles, daily delivery boards, memorial events (multiplayer Tier 4)
- Polish list from `tlh-postrefactorpatch.txt`: more varied package weights, package types (XL, fragile, durable), names tied to delivery destination, delivery animation, canteen visual (invert fill, bracket frame)

---

## save export/import (spec — design settled, not built)

> Sequencing in [roadmap](#roadmap) under "cross-cutting infra."

**Format** (locked):
```
TLH-SAVE:<base64(JSON.stringify(payload))>
```
Where payload is `{ v: 5, ts: <export time>, porterId: <opt-in>, save: <buildSavePayload output> }`.

**Why prefix is `TLH-SAVE:` not `TLH-SAVE-v5:`**: schema version goes inside the payload (`v:`), so future schema bumps don't break old export keys. Migration on import goes through existing `loadGame` chain.

**UI**: modal (not inline panel, not appended to wipe area). Modal contains:
- Export: textarea pre-filled with the key + checkbox "include porter identity (PTR-XXXX)" (default OFF) + copy button + download .txt button
- Import: paste textarea + load button → confirm dialog with summary ("X km, Y deliveries, from PTR-XXXX, made N days ago — proceed?") → load via existing `loadGame`

**Edge cases settled**:
- Import while save exists → confirm dialog with current run summary
- Import save with different porter ID → ask: take over their ID, or keep current and just load progress (default = keep current)
- Corrupt/invalid base64 → friendly error, don't blank page
- Schema mismatch → route through `loadGame`'s existing migration chain

**Multiplayer trust risk**: opt-in-on-export (default off) protects against accidental ID sharing.

**"Save before browser close"**: already handled. `beforeunload` + `visibilitychange` + autosave interval. `localStorage.setItem` is synchronous. Nothing to do.

---

## final file structure (live as of v0.0.7.20)

```
the-long-haul.html          ✅ at root, v0.0.7.20
the-long-haul.css           ✅ at root (custom tooltip reads data-tooltip)
the-long-haul.js            ⚠️ orphan stub still at root (harmless, not loaded; user to delete via web UI)
js/
  main.js                   ✅ entry + init() + tick() + helpers (~325 lines, zero exports)
  state.js                  ✅ S object + S._transient (silentSaveErrorShown added v0.0.7.18)
  constants.js              ✅ tuning values (BOOT_PRICE + sandalweed rates + WETLAND_CANTEEN_REFILL added v0.0.7.18)
  world.js                  ✅ buildWorld stamps cells with wetland: true (v0.0.7.18)
  packages.js               ✅ scanForPickup, tryDeliver, tickPkgRespawns
  trip.js                   ✅ tripChance, catchChance, maybeTrip, accumulateDist (math fixed v0.0.7.19)
  boots.js                  ✅ buy/autobuy/clip/tie-down/sandalweeds (BOOT_PRICE constant + clip-failsafe + full-meter guard + data-tooltip)
  stamina.js                ✅ canteen, drinkWater (drink threshold ≥5% loss), speedMultiplier, staminaSegCount
  identification.js         ✅ nodeStages helpers
  trust.js                  ✅ addTrust, onTrustUnlock (writes canonical npc.unlocks.tN as of v0.0.7.19), tryWarning/Preview/RestPrompt (renamed v0.0.7.18), getNpc (canonical home)
  channels.js               ✅ speak, renderChannels, tickAmbientChatter (imports getNpc + pickRandom from canonical homes)
  recovery.js               ✅ tickRecoveryAttempt, spawnRecoveryCargo, updatePorterStripBadges (data-tooltip)
  persistence.js            ✅ save/load/wipe/armWipe/updateSaveStrip (silent-save error surfacer)
  multiplayer.js            ✅ getPorterId/postActivity/pollFeed/etc
  upgrades.js               ✅ renderUpgrades + buyUpgrade
  util.js                   ✅ pickRandom (created v0.0.7.18)
  render/
    log.js                  ✅ addLog (+ private tt timestamp helper)
    hud.js                  ✅ updateHUD, renderCargoSlots, renderCourierStack
    route-map.js            ✅ drawRouteMap, updateRouteDot, layoutRouteNodes, currentEdge
    settlements.js          ✅ renderSettlements (uses getNpc)
    network.js              ✅ renderNetwork (+ private formatEvent)
  data/
    npc-lines.js            ✅
    npc-defs.js             ✅
    packages.js             ✅
    zones.js                ✅ (sandalChance values pulled from constants.js)
    glyphs.js               ✅
    upgrades.js             ✅ (data with apply closures, imports S)
worker/
  index.js                  ✅ deployed at v0.0.7.1 (429 quota handling)
  wrangler.toml             ⚠️ gitignored (real KV namespace ID), .example template in repo
```

---

## key architecture decisions (preserved through refactor + bugfix patch)

- **ES modules over IIFE concat or build step**. Live deploy on Neocities uses ES modules natively; no build step.
- **Single-letter `S` for state kept** (~300 uses, established convention).
- **Transient sub-object named `_transient`** (not `runtime`) — underscore matches convention.
- **`els` and `worldCells` as module-local aliases** over `S._transient.els` / `S._transient.worldCells`. `resolveEls()` uses `Object.assign`, `buildWorld()` uses `.length=0+push` — both preserve the alias by mutating in place. **Never reassign these aliases.** Every module that uses them does `const els = S._transient.els; const worldCells = S._transient.worldCells;` at the top.
- **Constants imported as namespace**: `import * as C from './constants.js'` → `C.TICK_MS`, `C.TRIP_CHANCE_BASE` etc.
- **Data files flat in `js/data/`** (not nested). `UPGRADE_DEFS` imports `S` because `apply` closures mutate state — unusual for a data file but cleaner than a dispatch table.
- **HTML subtitle dimmed sub-version**: `v0.0.7<span style="opacity:0.6">.N</span>` — oil-text gradient renders the dimmed `.N` nearly invisible against background. User finds this charming. Gets less charming as N climbs (currently `.20`). Roadmap tags v0.0.8 when terrain lands to reset the runway.
- **No save schema bump during refactor or bugfix patch**. Stays at v5. Old saves self-heal via existing ratchet in `loadGame`. Will need a bump for terrain scanner (manual cooldown persistence — see [courier equipment v2 spec](#specs-courier-equipment-v2)).
- **Circular-import-by-file pattern**: many sub-modules import from each other and from `render/*`. Circular by file but NOT by initialization — every cross-call happens inside a function body, never at module load. ES modules handle this correctly (live bindings, populated by the time anything runs).
- **Namespace imports for modules with 3+ functions called from main.js tick/init**: `Pkg`, `Trip`, `Boots`, `Stamina`, `Upg`. Smaller modules use named imports. `render/*` modules use named imports too since each surface is small.
- **Cross-zone resource constants live in `constants.js`**, not in zone defs. Sandalweed rates + wetland canteen refill are centralized — single-file balance pass.
- **Custom tooltips use `data-tooltip`**, not `title`, to avoid double-rendering with browser-native tooltips. JS also sets `aria-label` for screen readers.

---

## invariants preserved

- **No behavior change from refactor work itself.** Pure structural refactors. If user notices any gameplay difference attributable to the module split, it's a bug.
- Save schema stays v5 through this entire patch arc.
- Old saves self-heal via the ratchet in `loadGame`.
- `TRUST_THRESHOLDS` gameplay is `[20, 40, 60, 80]` (set in pre-refactor commit A).
- `TOTAL_CELLS = CELLS_PER_EDGE * 6 = 1560`.
- Worker URL unchanged: `https://coiledlamb.tlh-feed.workers.dev`
- localStorage keys unchanged: `tlh-save-v5`, `tlh-porter-id`.

---

## user preferences for working with this codebase

These are stable across sessions. Honor them.

- User likes seeing **assumptions stated up-front before pushes** ("here's what I'm about to do, here's the one weird thing about it") — gives them a chance to redirect. Do not skip this even when the push feels obvious.
- User is fine with bold structural changes when they're well-explained, but **flag tradeoffs honestly**.
- User **pushes back when something feels weird** (single-letter `S`, the dimmed `.N` rendering, the "no signal" panic that turned out to be cache, the KV quota 500 that turned out to be not-a-refactor-regression, the wrangler.toml placeholder leak, the sandalweed centralization question). Take the questions seriously, don't hand-wave.
- Discuss style choices briefly and let user pick when there's no clear winner. Don't over-deliberate. When user says "go with your gut," do — and explain the call.
- **Commit messages should be substantive** — explain rollback path, what changed, what stayed, what to test. User actively likes this.
- User explicitly **prefers seeing ideas/suggestions when relevant**, doesn't want agent to hold back on things noticed.
- User makes a distinction between **"refactor regression" (fix immediately, don't let it ride)** and **"bugfix patch material" (defer + write to bug list)**. When in doubt, ask — but err toward fixing regressions now so the "no behavior change" claim stays honest.
- **Context budgeting is a real concern.** Long sessions filling files into `/home/claude/` then re-reading them to push burns context fast. When pushing a multi-file commit, generate the file content directly into the `push_files` call rather than staging in /home/claude. The v0.0.7.18 commit needed three sequential pushes due to context exhaustion; v0.0.7.19 fit in one push because we wrote tighter. Split commits proactively when context is tight.
- User pushes back on **input widget glitches** in chat (rank_priorities + multi_select have been unreliable). When asking multi-question elicitations, prefer single_select or fall back to prose questions.

---

## GitHub MCP workflow — lessons (cumulative)

The agent pushes directly via `github:push_files` and `github:create_or_update_file`. No git CLI, no local sandbox the user can see.

**Hard-learned rules (in priority order):**

1. **Always push multi-file commits as a single `push_files` call with ALL files in the array.** Splitting across two calls leaves the branch in a half-applied broken state. Only valid exception: the first half is fully self-consistent (e.g. additive-only files that nothing imports yet). **Caveat**: if the multi-file payload would exceed context budget, plan from the start whether it can be split into self-consistent halves before starting the work — don't discover mid-push.

2. **Before pushing ANY extraction that removes symbols from main's export surface, run:**
   ```bash
   grep -rn "<each removed symbol>" js/
   ```
   for every symbol leaving main. The commit 14 hotfix happened because `trip.js` still imported `staminaSegCount` from `./main.js` after that export moved to `./stamina.js`. Cost: one broken user session + one hotfix commit.

3. **Module-init import failures cascade silently to the entire app.** If `trip.js` fails to load because of a bad import, it takes down packages (which imports trip-indirectly) which takes down everything. Symptom: blank UI, console shows a single `SyntaxError: doesn't provide an export named '<symbol>'`. Fix: rule #2 above. Debug: check the console error — it names the failing module and missing symbol.

4. **Runtime errors inside ticked code are different** — no module-init fail, but tick bails mid-loop. Symptom: UI loads but systems don't update (distKm frozen, renderX not firing). Debug: console will have a red throw with stack trace. Ask user for it before guessing.

5. **Don't probe with junk files on the real branch.** If probing, use `get_file_contents` which doesn't write.

6. **Verify remote state with `get_file_contents` before editing.** Don't assume your last push is the current SHA — intermediate hotfixes happen. Pass the remote SHA back in `create_or_update_file` to get optimistic-concurrency protection.

7. **Commit message length signals care level.** User actively likes substantive commit messages explaining the why, not just what. Short messages read as sloppy.

8. **GitHub MCP tools cannot delete files** (only create/update). When deleting, route through the GitHub web UI or local `git rm` + push.

9. **Compatibility-layer pivot is a valid strategy when an atomic cutover is too large for one push.** Have main re-export the new symbols under the old names, ship that, then sweep imports in a second commit. Two cleanly verifiable commits beat one fragile big-bang.

10. **Context budgeting affects push strategy.** (Added in v0.0.7.19 session.) If the agent has already burned context reading files and exploring, **don't stage to `/home/claude/` then re-read for the push** — go directly to `push_files` with content generated inline. Staging-then-reading roughly doubles the context cost of every file. The v0.0.7.18 commit hit a truncation mid-file because of this; v0.0.7.19 avoided it by writing the push call directly. When context is tight, prefer `create_or_update_file` per file over `push_files` of the whole commit — slower (intermediate broken states) but each call is independent.

---

## branch status

- **Live deploy**: `main` is on Neocities. No outstanding feature branches.
- Push convention: full version drops (e.g. v0.0.7 → v0.0.8) get pushed when ready. Sub-versions (v0.0.7.N) used during a patch arc; drop the suffix when the arc closes. Site-wide changes (like adding music tracks to `nav.js`) can be pushed to `main` separately.

---

## v0.0.7 — multi-system bundle ✅ DONE

The v0.0.7 bundle interlocks **four systems** that mutually reinforce each other.

**Four systems:**
1. **Async multiplayer backend** (Cloudflare Worker + KV) — ✅ shipped
2. **Progressive node identification** (??? → signal → tier → full label) — ✅ shipped
3. **Trust meter with NPCs** — ✅ shipped
4. **Settlement UI polish** — ✅ shipped

v0.0.7 is complete. The patch arc on top of it (v0.0.7.18 housekeeping, v0.0.7.19 bug fixes, v0.0.7.20) cleans up known issues without adding scope.

---

## game architecture

The game lives across `js/main.js` + the extracted modules listed in the file structure section above. All mutable state is in the `S` object exported from `js/state.js`. Persistent save state lives in `localStorage`.

### core loop
- The courier walks a fixed circular route of 6 edges between 6 named nodes (A → ? → B → C → H → · → A).
- `S.edgeIdx` (0–5) and `S.dotT` (0.0–1.0) track position on the route. `dotT` increments each tick by `0.006 × speedMultiplier()`. When it hits 1.0, edge advances and `tryDeliver()` fires.
- Speed is modulated by stamina segment count and boot durability.

### distance tracking (v0.0.7 commit 6, math fixed v0.0.7.19 + v0.0.7.20)
- `KM_PER_EDGE = 4.2`. `posKm(edgeIdx, dotT) = (edgeIdx + dotT) * KM_PER_EDGE` gives current ring position.
- `accumulateDist()` runs every walking/carrying tick. Computes forward delta since last tick. **v0.0.7.19 fix**: only adds ring length when delta is large negative (`< -KM_PER_EDGE`); edge transitions produce small negatives in `(-KM_PER_EDGE, 0)` which are trusted as the partial-edge step. Cap `> 2*KM_PER_EDGE` retained as safety net for surviving outliers. **v0.0.7.20 fix**: dropped the `Math.round` on write — per-tick delta (~0.025km) was below the 0.1km rounding resolution, so the running total was stomped to 0 every tick. Stores full precision now; HUD rounds for display at [render/hud.js:32](js/render/hud.js:32).
- Trackers in `S._transient.lastDistEdgeIdx` / `S._transient.lastDistDotT`. Null sentinel = first tick since load.

### world map
- `buildWorld()` (in `js/world.js`) generates a flat array `worldCells[]` of exactly `CELLS_PER_EDGE × 6 = 1,560` cells at startup. World is regenerated fresh each page load — never persisted.
- Each cell: `{ html, pkg, sandal, risky, wetland, edgeIdx }`. **`wetland: true`** stamped on cells from wetland zones (added v0.0.7.18; canteen refill wired in v0.0.7.20 commit 2b — `currentCellIsWetland()` helper in main.js, refills `+0.05/tick`).
- Risky cells: edges leading to C or '·' get `risky: true`, applying ×1.4 trip chance multiplier.
- Scroll is JS-driven via `translateX` on `.tlh-fieldstrip`. No CSS animation. `width: max-content` on the strip element.

### packages (in `js/packages.js`)
- Picked up by proximity scan in `scanForPickup()` — checks cells within `PKG_PICKUP_RANGE = 8` cells ahead each tick.
- On pickup: `pkg.picked = true`, copied into `S.inventory` with `_worldCell` backref.
- On node arrival: `tryDeliver(arrivedNodeId)` delivers all inventory items with matching `destId`.
- After delivery: normal pkg gets `respawnIn = PKG_RESPAWN_TICKS (500)`. Recovery cargo is **one-shot** — `worldCell.pkg = null`, decrements `activeRecoveryCount`.

### trip + drop (in `js/trip.js`)
- `TRIP_DROP_CHANCE_NORMAL = 0.20`, `TRIP_DROP_CHANCE_LOST = 0.30`.
- **Current behavior (v0.0.7.20)**: catch roll first. If not caught, **tie-down branch fires before drop roll** — if armed with cargo, it consumes the tie-down, runs the stumble, and returns. No drop, no damage. If no tie-down, drop check rolls (lost pkgs broadcast `postLostDrop`; normal pkgs vanish locally). If no drop, first item takes 25% scrip damage.
- v0.0.7.19 damage log now names the package and shows scrip lost.

### boots / stamina
- `boots.js`: `sandalCap`, `buyBoots` (full-meter guarded v0.0.7.18), `checkAutobuy` (clip-equip is failsafe regardless of autobuy as of v0.0.7.18; sandalweed below clip), `refillBootClip`, `confirmClipRefill`, `toggleAutobuy`, `toggleBootsGear`, `toggleTieDown`, `renderBoots`. All hardcoded `15` replaced with `C.BOOT_PRICE`.
- `stamina.js`: `staminaSegCount`, `renderStamina`, `drinkWater` (gated by `canDrink()` since v0.0.7.18: requires ≥5% stamina lost), `speedMultiplier`. Autodrink also respects threshold.

### sandalweeds (rates centralized in `constants.js` v0.0.7.18)
- Spawn rates by zone:
  - wetlands `0.006` (primary)
  - depot_approach `0.003` (secondary)
  - scrub `0.001`, road `0.0005`, ruins `0.001` (trace)
- **Hoard cap**: `SANDAL_CAP_BASE = 5` / `SANDAL_CAP_UPGRADED = 25` (with `sandalSatchel` upgrade). When at cap, `scanForPickup` leaves the `*` standing.
- Auto-equip when boots fail: clip > sandalweed > scrip. Equipped sandalweed: `bootDurability = 30`, `usingMakeshift = true` (1.3x boot drain).
- UI: `#sandalBadge` next to the boots gear button. At-cap stable green (no pulse). Tooltip uses `data-tooltip` (no native title overlay).

### identification stages (in `js/identification.js`)
- `S.nodeStages` is the single source of truth. Object keyed by node id, values 0-3.
- Stages: 0 = unknown, 1 = signal (trust t20), 2 = tier visible (walked adjacent edge), 3 = visited.
- Starting state: `A` and `H` at 3, others at 0.

### NPCs + trust (in `js/trust.js` + `js/channels.js`)
- `NPC_DEFS` at A/B/H with Greek callsigns: rho (A), iota (B), tau (H).
- `S.npcs.{A,B,H}` = `{ trust, unlocks: {t20,t40,t60,t80}, nextChatterTick }`.
- `TRUST_THRESHOLDS = [20, 40, 60, 80]`. Gains: delivery +1, lost-delivery +2, discovery +3.
- t20: reveal stage-0 adjacent nodes to stage 1.
- t40: `tryWarning()` on arrival — trip-risk edge > rain-incoming > low-stamina (rain check restructured in 2b).
- t60: `tryPreview()` scans outbound edge for any package, speaks preview line.
- t80: `tryRestPrompt()` posts log button → `confirmDepotRest` restores stamina to 105% + 30 canteen − 10¢.
- **v0.0.7.18**: function renames swept (was `tryT50Warning`/`tryT75Preview`/`tryT100RestPrompt`).
- **v0.0.7.19**: `onTrustUnlock` writes to canonical `npc.unlocks.tN` (was `npc.tN`, a phantom property that broke ambient chatter).

### channels / chatter (in `js/channels.js`)
- `S.channels` is a FIFO ring (cap 6) of NPC utterances.
- `tickAmbientChatter()` runs every 10 ticks, gated on `unlocks.t20` (now actually fires on first unlock since v0.0.7.19).
- Per-NPC color via `[data-depot]` selector: A teal, B pink, H purple.
- Empty state: "no callsigns trusted yet — deliver to depots to build trust".

### lost cargo recovery (in `js/recovery.js` + `js/multiplayer.js`)
- `postLostDrop(pkg)` POSTs to `/lost` + broadcasts `lost_drop` event.
- `tickRecoveryAttempt()` async, throttled. Soft cap `activeRecoveryCount >= 3`.
- `spawnRecoveryCargo` plants pkg with `isRecovery: true` + 1.5x scrip bonus.
- Recovery delivery is one-shot. Broadcasts `lost_recovered` with `forPorter`.
- Presence badge `#recoveryBadge` in porter strip. Tooltip uses `data-tooltip`.

### persistence (schema v5, in `js/persistence.js`)
- Save key: `localStorage['tlh-save-v5']`. `SAVE_VERSION = 5`.
- Loader chain: v5 → v4 → v3 → v2 → v1.
- v5 added `npcs: { A/B/H: { trust, unlocks } }` block.
- **v0.0.7.18**: silent-save failures (autosave/visibilitychange/beforeunload) now surface a one-time-per-session warning instead of dropping progress silently. Flag `_transient.silentSaveErrorShown`.
- Wipe save: `_wipeInProgress` guard prevents save handlers from re-writing in-memory state during the 400ms between `wipeSave()` and `location.reload()`.

### porter ID
- Format: `PTR-XXXX-XXXX` (8 hex chars). Stored in `tlh-porter-id`. Legacy `TLH-XXXX` migrated. Survives wipe — identity, not progress.

### upgrade system
- 10 upgrades in `UPGRADE_DEFS` (`js/data/upgrades.js`). Bought with scrip, some have prerequisites.
- `renderUpgrades` + `buyUpgrade` in `js/upgrades.js`.
- Full list: `bootsT1/T2`, `bootClip1/2`, `steadyFeet`, `cargoSling/Pack/Weight`, `efficientConsumption`, `sandalSatchel`.

### status flow
`walking` → (pickup) → `carrying` → (node arrival + delivery) → `walking`
`walking` → (exhausted) → `resting` → (timer) → `walking` (+25% overboost)
`walking/carrying` → (trip) → `tripped` → (timer) → previous status

---

## multiplayer

### Cloudflare Worker (`worker/index.js`)
- Worker URL: `https://coiledlamb.tlh-feed.workers.dev`
- KV namespace ID: `c7bdbec95cd6476f9c87abf55c03fdcb` (lives in gitignored `wrangler.toml`).
- Endpoints: `POST /activity`, `GET /feed?since=`, `POST /lost`, `GET /lost/:porterId`, `GET /` (info).
- Allowed event types: `delivery`, `milestone`, `discovery`, `lost_drop`, `lost_recovered`, `trust_unlock`.
- Rate limit: 5 events/60s per porter, silent drop.
- Feed cap 200 events. Census 24h auto-prune. LOST_CAP 20 per porter FIFO.
- CORS open.
- **Worker v0.0.7.1**: KV daily-quota exhaustion returns 429 with `Retry-After` (seconds until UTC midnight) instead of 500.

### game-side (in `js/multiplayer.js`)
- Constants in `MULTIPLAYER` block: `FEED_URL`, `POLL_MS = 60000`, `FEED_DISPLAY_CAP = 8`.
- `postActivity(type, data)` — fire-and-forget POST with `keepalive:true`. Silent on all errors. **Client-side rate limiting is the next push (v0.0.7.21)** — see [roadmap](#roadmap).
- `pollFeed()` — incremental fetch via `?since=`, dedupes, harvests peer porter IDs into `knownPeers`.
- `startPolling`/`stopPolling` tied to `visibilitychange`.
- `checkDistMilestones()` broadcasts at [10, 25, 50, 100, 250, 500, 1000]km. **Coalescing also part of v0.0.7.21**.
- Self events filtered from feed display.

### multiplayer tier ladder (spec)

> Sequencing in [roadmap](#roadmap). Tier descriptions preserved here for design reference.

Designed to fit the game's actual shape: each player has their own procedural world; multiplayer is **a presence layer**, not shared world state.

#### Tier 1 (v0.0.7) — ✅ shipped
Activity log, census, lost cargo recovery, echo events (trust-gated).

#### Tier 2 — fits with structures (v0.0.9)
Structure stewardship, postbox dead-drops, structure naming, roads as collective infrastructure, ziplines as gifts.

#### Tier 3 — fits with radio chatter NPCs (v0.1)
Player-authored radio messages, trust meter pooled with NPCs.

#### Tier 4 — long-tail (post-v0.1)
Porter profiles, daily delivery boards, memorial events.

#### KV schema (current + anticipated)
- ✅ `feed:recent`, `census:active`, `lost:{porterId}`, `rate:{porterId}`.
- ⏳ `structures:{regionKey}`, `postbox:{boxId}`, `radio:queue`.

---

## roadmap

> Single source of truth for sequencing. Specs live in their own sections (cross-linked below). Past completions live in the session log. This section is forward-looking only.
>
> Conventions: ✅ done, 🟢 designed and ready to build, 🟡 partially designed, 🔴 needs design conversation. Schema bumps flagged inline.

### now: v0.0.8.3 (live locally) → trust (next session)

✅ **v0.0.8.1–.3** — package rework + cargo UI rework. Shipped this session. See [session log](#2026-04-15-v0081--2--3--packages--cargo-ui-rework).

🟢 **v0.0.8.4+ (trust)** — next push. Three sub-threads: identify `?` waystone, weight-based trust gain, upgrade audit (move half to NPC trust rewards). See [trust thread primer](#trust-thread-primer-v008-next) for the full brief.

⏳ **v0.0.8.later (rain rework)** — drizzle → rain → downpour intensity states; storms as travelling world objects on the 6-edge ring; biome-biased spawning; downpour flooding wires `S.inRiver`; encumbrance folded into trip chance. Queued after trust.

### v0.0.7 near-term arc: courier equipment v2 (DONE)

Three items, sequential mini-patches under one thematic umbrella. Sticky gun + scanner ship together; mobile carrier follows when designed. **Slotted after v0.0.7.21** to avoid pushing new broadcast-heavy content onto an unprotected client.

| Version | Scope | State | Schema | Notes |
|---|---|---|---|---|
| v0.0.7.21 | Multiplayer rate limit, sticky gun, scanner T1, admin, save i/o | ✅ shipped | v5 → v6 | 6-piece bundle. Scanner uses local autoTimer (no battery). |
| v0.0.7.22 | Admin channel (BroadcastChannel from blog-admin tab) | ✅ shipped | none | Replaced in-game admin bar. |
| v0.0.7.23–.27 | UI/UX pass: inline gear, canteen rework, kit row, scan sonar | ✅ shipped | none | See top-of-doc for per-patch breakdown. |
| v0.0.7.28 | Battery prototype drain (time-only, not persisted) | ⏳ in flight | none | Sets up the animation; full mechanic follows with v6→v7 bump. |
| v0.0.7.29+ | Battery full mechanic + scanner rewire | 🟡 designed | v6 → v7 | Drain per-device, regen at depot/solar, upgrade trickle. Fold prototype blanket drain into per-device cost. |
| v0.0.7.30+ (parallel) | Sticky gun visual rework + stamina seg retrofit | 🔴 design | none | See "planned but not built" table. |
| or fold into v0.0.8 | Mobile carrier (exoskeleton) | 🔴 design conv | v6 → v7 | Uses shared battery. |

**Battery shared spec**: scanner shipped first with a local autoTimer (no battery gating). Kit row + prototype drain are in — full mechanic promotes `S.battery.charge` to a real persisted resource with per-device drain + depot-near/solar regen + upgrade. Scanner's autoTimer is expected to stay; manual ping would be what costs battery.

### cross-cutting infra (parallel, not sequential)

These can land in any order between or alongside the courier-equipment arc. Each is independently shippable. **Multiplayer rate limiting was promoted out of this category to v0.0.7.21** because it's a prerequisite for stable testing of every downstream content piece.

| Item | State | Schema | Trigger to ship |
|---|---|---|---|
| Save export/import | ✅ shipped | v6 | Landed in v0.0.7.21. Modal with `TLH-SAVE:<base64>` envelope, optional porter-id opt-in. |
| Minimal admin (give scrip, set trust) | ✅ shipped | none | Landed in v0.0.7.21; relocated to admin tab in .22. |
| Canteen visual | ✅ shipped | none | Bracket frame + top-anchored drain in v0.0.7.23b. |
| Package variety / delivery anim | 🟡 | none | Still parked; no design conversation yet. |

### v0.0.8: packages + trust + rain (RESCOPED)

🟡 In progress. Originally scoped as terrain expansion; user rescoped around three mechanical-depth threads.

**Thread 1 — packages (✅ done v0.0.8.1–.3)**:
- Composable spawn roller (sizes + modifiers + dest-tagged labels)
- Cargo inventory UI rework (2-row grid, multi-cell shapes, autosort, modifier visuals)
- See [session log](#2026-04-15-v0081--2--3--packages--cargo-ui-rework) for details.

**Thread 2 — trust (⏳ next)**:
- Identify `?` waystone (orphan living at traveler's landmark — label pool already authored)
- Map trust gain to package slots/weight (like scrip does)
- Audit 13 upgrades, move ~half to NPC trust rewards
- See [trust thread primer](#trust-thread-primer-v008-next) for the fresh-agent brief.

**Thread 3 — rain rework (⏳ after trust)**:
- Three intensity states (drizzle → rain → downpour)
- Storms as travelling world objects (`_transient.storms[]`), not player-local `S.isRaining`
- Storm arc travels the 6-edge ring; minimap cloud rendering
- Biome-biased spawning (wetlands more rain-prone)
- Downpour floods rivers (finally activates `S.inRiver` stub), reduces pickup range
- Encumbrance trip scaling folded into `tripChance()` alongside rain multiplier

**Schema**: no bumps expected for packages or rain (both can live on `_transient`). Trust may want a bump if per-NPC dispatch pools or outbound-pkg state get persisted — decide during trust design.

**Tags v0.0.8 cleanly** — resets the dimmed `.N` runway from `.31+`.

### v0.0.9: terrain + structures + bigger map

🔴 Heavy lift. Pushed here from v0.0.8 after the v0.0.8 rescope. Pulls in multiplayer Tier 2.

**Scope — terrain** (was v0.0.8):
- Deserts (visual + canteen drain modifier)
- Rivers (bridgeable; works with downpour flooding from v0.0.8 rain thread)
- Slopes / elevation / mountains (speed modifier)
- Wetland "slow to travel" mechanic (closes the half-implemented wetland debt)

**Scope — structures**:
- Postboxes, rainfall canopies, generators, lookout posts, ziplines, shelters, drone bays. Built on paths, degrade, upgradeable. Spec: [longer-horizon features](#specs-longer-horizon-features).
- Bigger map: route grows beyond 6 nodes.
- **Trust-reward acquisition unlocks**: some courier equipment (sticky gun, scanner) may migrate from upgrades menu to NPC trust rewards at new depots — may fold into v0.0.8 trust work earlier than v0.0.9.
- Multiplayer Tier 2: structure stewardship via KV (`structures:{regionKey}`).

**Schema**: bump for structures (per-structure persistence, multiplayer sync state). Terrain itself probably no bump (worldCells non-persisted).

**Dependencies**: rain (v0.0.8) should land before terrain's rivers (flooding interaction). Trust (v0.0.8) may eat some of the "equipment as trust reward" scope.

### v0.1: radio chatter + social layer

🔴 Needs design conversation. Multiplayer Tier 3 territory.

**Scope**:
- Player-authored radio messages (Tier 3 KV: `radio:queue`)
- Trust meter pooled with NPCs (radio messages affect NPC trust)
- Sign system (preset porter messages on cooldown — could ship earlier as a pre-structures social win; flag for discussion)
- Settlement quote evolution (3-stage × 6-settlement quote rewrite — needs rebuild mechanic real, so post-structures)

**Schema**: probably bump for radio queue subscription state.

### post-v0.1 parking lot

Unordered. Pick when motivated; design conversations needed for most.

- **Day/night cycle** — substantial, probably its own patch
- **Hot springs** — field stamina restore with wait-time cost
- **Music-track-to-event integration** — cross-cuts with `nav.js`; specific tracks for rainfall, depot arrival, home arrival
- **Full admin tools** — porter hex edit, teleport, meters on/off, force-spawn pkgs/sandalweed/lost cargo (minimal admin already shipped per cross-cutting infra)
- **Multiplayer Tier 4** — porter profiles, daily delivery boards, memorial events
- **Polish leftovers** — package types (XL, fragile, durable), names tied to delivery destination, delivery animation, canteen visual rework

### roadmap visualization

```
v0.0.7 arc ✅ DONE
   │ (refactor, bundle, UI/UX pass, battery prototype, silent/offline, polish pass)
   │
   ├── v0.0.8.1 ✅ package rework: composable spawn roller + dest-tagged label pool
   ├── v0.0.8.2 ✅ cargo inventory rework: unified pkg shapes + 2D autosort
   ├── v0.0.8.3 ✅ cargo polish: modifier visuals, weight 2-row, +4 pack
   │
   ├── v0.0.8.4+ ⏳ TRUST THREAD (next session — see trust thread primer)
   │      ├── identify `?` waystone + orphan NPC
   │      ├── weight-based trust gain (pkg.slots → trust)
   │      └── upgrade audit: move ~half to NPC trust rewards
   │
   ├── v0.0.8.later ⏳ rain rework
   │      ├── drizzle/rain/downpour intensity states
   │      ├── storms as travelling world objects (_transient.storms[])
   │      ├── minimap cloud rendering + biome-biased spawning
   │      └── downpour floods rivers (wires S.inRiver) + encumbrance trip scaling
   │
   ├── v0.0.9 🔴 terrain + structures + bigger map
   │      ├── terrain: deserts, rivers, slopes, wetland slowdown
   │      ├── structures: postboxes, canopies, generators, lookouts, ziplines, shelters
   │      ├── multiplayer Tier 2 (structure stewardship via KV)
   │      └── bigger map: route grows beyond 6 nodes
   │
   ├── v0.1 🔴 radio chatter + social layer
   │      ├── multiplayer Tier 3
   │      ├── sign system (could land earlier)
   │      └── settlement quote evolution (post-structures)
   │
   ├── (parallel, unscheduled) full battery mechanic (v6→v7)
   │      ├── per-device drain + depot/solar regen + upgradeable trickle
   │      └── scanner rewire; retire prototype blanket drain
   │
   └── post-v0.1 parking lot 🔴
          • day/night cycle
          • hot springs
          • music-event integration
          • full admin tools
          • multiplayer Tier 4
```

### resume-here cheatsheet

If you're picking up cold and want the fastest "what do I do next":

1. **Default (recommended)**: start [trust thread primer](#trust-thread-primer-v008-next). Three sub-threads settled verbally; open design questions listed. User expects a planning conversation before implementation. Package dest-tagging from v0.0.8.1 sets up future NPC-dispatch cleanly.
2. **If user brings rain thread instead**: storms-as-world-objects design sketch is in the trust primer's "rain thread (queued after trust)" subsection. Rain is less designed than trust — expect a longer sketch phase.
3. **If UI polish mood**: fragile readability at s-size is the live concern — stripes crowd the size letter. If trust's label audit doesn't address it, consider letting shape carry size identity.
4. **If full battery mechanic becomes priority**: schema v6→v7 bump, per-device drain, depot/solar regen, scanner rewire. Queued in parallel with v0.0.8; can land anytime.
5. **Structures / terrain**: v0.0.9. Don't touch before v0.0.8 threads are complete; rain wires `S.inRiver` for terrain-rivers interaction.

**Preview:** `.claude/launch.json` in this worktree runs `python -m http.server 8745` (parent worktree uses :8744 — different port per worktree). Use `preview_start tlh-static` before verifying any UI change.

---

## TLH session log

### 2026-04-15 (v0.0.8.1 → .2 → .3 — packages + cargo UI rework)

Long session, three commits, v0.0.8 arc opened and reframed.

**Scope reframe up front.** Prior roadmap had v0.0.8 = terrain expansion (deserts, rivers, slopes). User rescoped around three mechanical-depth threads — packages, trust, rain — with terrain pushed to v0.0.9. Packages was the "easiest win" per user so it went first.

**v0.0.8.1 — package data + roller.** Full rewrite of [data/packages.js](js/data/packages.js): old 9-entry flat tables (NPC_PKGS + LOST_PKGS) replaced with composable shape — PKG_BASES (s/m/l/xl), PKG_SIZE_WEIGHTS with risky-cell variant that bumps xl \u22486x on C/\u00b7 edges, PKG_MODIFIERS (null:70 dominant + fragile/lightweight/heavy/unwieldy weighted \u223c30%), PKG_LABELS_BY_SIZE with \u223c73 labels each tagged `dests:[]` for destination-filtered picking, PKG_LOST_LABELS 12-entry fallback pool (reserved for later recovery pipeline inversion).

New `rollPkg(destId, cellRisky, forceLost)` in [packages.js](js/packages.js) \u2014 composable roll: size \u2192 modifier (size-incompat filtered) \u2192 apply kgDelta/slotDelta/scripMult \u2192 filter labels by dest \u2192 lost flag + scrip bonus. [world.js](js/world.js) `makeWorldPkg` routed through it; 15% ambient isLost preserved (recovery inversion deferred). Dead `NPC_PKGS`/`LOST_PKGS` imports removed from main.js.

**Label design conversations.** Three key decisions:
- Waystone (`?`) identity: orphan living at a traveler's landmark. Labels split between trinkets (beaded bracelet, carved charm, pressed flowers, wrapped offering) and practical supplies (pantry crate, book bundle, hearth kit, patched coat, firewood stack). Tone explicitly NOT religious/shrine \u2014 incense/icon/altar vocabulary rejected.
- Destination intermingling: labels allow multi-dest assignment (e.g. `salvage kit` dests `[C, A, B]` \u2192 "C sent salvage for A's repairs"). Cuts weak/redundant labels; sets up shelter-dispatch seamlessly.
- Lost cargo priority: peer-dropped pkgs already preserve identity across the wire. Ambient world-spawn lost uses normal label pool + isLost flag. Fallback pool reserved for future recovery-pipeline inversion. User chose Option 2: keep current density, peer-preferred semantics later.

**v0.0.8.2 \u2014 cargo UI rework.** User flagged: each slot rendered independently, so a 4-slot lumber bundle looked like four separate `l` boxes. Rewrote [render/hud.js](js/render/hud.js) `renderCargoSlots` \u2014 now a 2-row CSS grid with `ceil(maxSlots/2)` cols; pkgs render as single multi-cell divs via `grid-column`/`grid-row` spans. PKG_SHAPES: s=1\u00d71, m=2\u00d71, l=2\u00d72, xl=4\u00d72. xl got a new deep-purple color ramp (#3a2050) to distinguish from l.

Simple first-fit `binPack` packer sorted by footprint desc. Gun slot reserved bottom-right. Phantom cells fill trailing grid positions when `cols*rows > maxSlots`. Modifier field carried through pickup into inventory.

**Preview infrastructure.** [.claude/launch.json](.claude/launch.json) added for this worktree, serving on :8745. Side preview panel is now live for iterative CSS work \u2014 paid off immediately in v0.0.8.3 variant iteration.

**v0.0.8.3 \u2014 modifier visuals + weight 2-row + pack bump.** User asked for 4 items: weight segs 2-row, confirm 2-row cargo as default (already yes), fix maxSlots=11 awkward odd stop, and tackle modifier-visual deferrals from v0.0.8.2.

- Weight-segs: flex-row \u2192 2-row grid mirroring cargo. Compact at 10+kg.
- `cargoPack` upgrade: +3 \u2192 +4 slots. Progression was 6 base + sling2 + pack3 = 11 (odd). New: 6 \u2192 8 \u2192 12, aligns on 6 cols \u00d7 2 rows.
- Modifier visuals went through **significant iteration** with user signoff on each:
  - **Fragile V1** (pink inset + outer glow): rejected, "looks like highlight/hover".
  - **Fragile V2** (dashed pink border): rejected, conflicts with lightweight's visual language.
  - **Fragile V3** (diagonal stripe overlay): initial version diluted pink. User pushed back: stripes should match package color, no dilution. Final: per-size saturated stripes \u2014 teal for s, purple for m, pink for l, bright pink for xl.
  - **Heavy**: initially bright-white 2px border. User: border should match object color. Final: 2px in size color.
  - **Lightweight**: dashed border in size color (accepted first pass).
  - **Unwieldy V1** (trail cell with 2px gap): first ship.
  - **Unwieldy V2** (trail flush via negative margin + no left border): user saw the seam line, rejected. "Breaks the illusion."
  - **Unwieldy V4** (single div + clip-path L-shape): elegant on xl, but broke tooltips (clip-path clips ::after pseudo) and top-left border became incomplete. User reverted to V1.
  - **Final: V1 shipped** \u2014 trail cell with 2px gap, inherits size class. User accepted the gap as the "awkward extra bit" signal. Tooltips work, border edges clean.

**Lessons from iteration.**
- CSS-only variant iteration via injected `<style>` blocks in the preview is fast. Clip-path touches tooltip behavior and border completeness \u2014 more expensive to iterate.
- User strongly values tooltip reliability. Do not break them for aesthetic wins.
- Border-completeness around shape outline matters. Partial edges read as broken even when silhouette is intentional.
- Pink as warning color collides with l/xl which are already pink. Per-size accent approach sidesteps it.

**Deferred / flagged.**
- Fragile readability at s-size (stripes cramp size letter). Revisit if trust work reshapes small pkg identity.
- Modifier stacking \u2014 one per pkg for now.
- Modifier-aware pickup-fail logs.
- `data/packages.js` atomization at \u223c170 lines. Split when trust adds dispatch pools.

**Dropoff.** v0.0.8.3 live locally; commits `a5c579e`, `49b8ce4`, `ae3237a` three ahead of origin. User to push/merge. Next session = trust; fresh agent recommended per context budget. [trust thread primer](#trust-thread-primer-v008-next) is the brief.

### 2026-04-15 (v0.0.7.23\u2013.28 \u2014 UI pass + kit row + preview server)

Back-to-back sub-versions in one session. Started at v0.0.7.22 (admin channel), shipped six more sub-versions, set up the local preview workflow, bumped the handoff.

**What shipped:**
- `.23 / .23b` — inline gear reveal pattern for boots row + save strip (fade-slide 180ms animation; save gear position-fixed with options expanding rightward). Canteen bracket-frame rework + top-anchored fill, warn/crit ramp.
- `.24` — kit row prototype (new `<div class="tlh-row kit-row">`). Stylized battery (10px ticks via `repeating-linear-gradient`, terminal nub via `::after`), hairline-divided gadget capsules. Scanner button moved out of stamina row. New `js/render/kit.js`.
- `.25 / .26 / .27` — scan visual thematic rework. Always-visible 6px dot beside label; during buff, dot breathes (color + box-shadow on 1.8s loop) and two fixed-size concentric halos materialize in place. Caught a `content-box` + `border:1px` centering bug via `preview_inspect` — fixed with `box-sizing: border-box`.
- `.28` (this commit) — battery prototype drain, time-only, `0.03 per tick` (~19.4 min full drain). Not persisted. Just enough to animate through warn/crit thresholds.

**Process wins:**
- Set up `.claude/launch.json` running `python -m http.server 8744`. ES modules now work locally. `preview_eval` + `preview_inspect` caught the 1px halo bug that would have needed another user-flag round-trip otherwise. Memory updated; "preview doesn't work" feedback entry retired.
- User caught that I'd shipped .22–.24 without bumping the HTML subtitle. Saved a feedback memory so subtitle bump now rides with its sub-version commit, not as a trailer.

**What didn't ship:**
- Full battery mechanic (drain per-device + regen + upgrade + schema v6→v7).
- Sticky-gun capsule visual rework (user has vision brewing but hasn't locked).
- Stamina seg readability retrofit (design settled, not built).

All three queued in "planned but not built" table at top of doc.

### 2026-04-15 (v0.0.7.20 — commit 2b ships, bugfix patch complete)

Picked up from the v0.0.7.19 dropoff handoff. All four commit-2b items had settled designs in the previous handoff — implementation was mostly mechanical.

**Unplanned find during planning pass.** User reported "walked distance never updates from 0" early in the session. Initially flagged as possibly refactor regression; reading [trip.js](js/trip.js) `accumulateDist` revealed the real cause: `S.distKm = Math.round((S.distKm + delta) * 10) / 10` — per-tick delta ~0.025km, `Math.round(0.25)=0`, running total stomped to 0 every tick. Bug was latent since commit 6 (per-tick accumulator replaced the every-5-ticks derived formula whose ~0.125km jumps were above the rounding floor). Commit 2a's edge-wrap fix didn't touch this. Added as the lead item of 2b. One-line fix: drop the round on write, HUD already rounds for display.

**Divergences from spec, all flagged in the commit 2b section above:**
- Rain dry-period range: 200-800 ticks (I went slightly less rainy than spec's 100-300 to match current 0.003/tick mean wait of ~333).
- Pickup-fail dedupe: capacity-keyed cache vs spec's tick cooldown (re-fires after delivery; I think this is better UX, easy to swap if not).
- Pickup-fail message format: dropped weight details for terseness.
- Rain timer placement: `_transient` not root S (spec was ambivalent).

**Folded in at user request:** `restPromptPending` → `depotRestPending` rename. State.js declared the canonical slot but trust.js wrote a different name — harmless but misleading. 4-line rename in trust.js.

**Workflow note.** Working in a git worktree with local Edit + Bash tools rather than the GitHub MCP push pattern. Remote moved during the session (the v0.0.7.19 handoff doc rewrite landed while I was working from the stale v0.0.7.17 handoff). Caught it via `git status` reporting "behind by 1 commit" before pushing — fast-forwarded cleanly because my code edits didn't conflict with the doc rewrite. Lesson: with worktrees, check remote state right before push, not just at session start.

**Roadmap added (later in session, doc-only push).** User asked for a consolidated roadmap to replace scattered "next-step ordering" + "future upgrades" + "TLH future game features" + "multiplayer plan" sequencing. Bundling discussion settled three things: (1) sticky gun + scanner + mobile carrier under one "courier equipment v2" arc as sequential mini-patches, not one big bundle — keeps small stuff unblocked; (2) v0.0.8 splits into terrain (v0.0.8) before structures (v0.0.9) — closes wetland debt and gives structures more interesting placement options; (3) admin tools split into minimal (ship anytime, recommend ASAP) and full (parking lot). Roadmap landed near the bottom of the doc before session log; old sections trimmed and renamed to "specs:" with sequencing cross-linked to roadmap.

**Roadmap follow-up (doc-only).** User pointed out that multiplayer rate limiting was sitting in cross-cutting infra as "ship whenever" — but the KV cap is easy to hit during active testing, so any new content (sticky gun events, scanner pings, future broadcast-heavy features) makes 429 hits more likely. Promoted multiplayer rate limiting to v0.0.7.21 as a prerequisite, bumped sticky gun + scanner to v0.0.7.22, mobile carrier to v0.0.7.23. Cross-cutting infra table now contains save export/import, minimal admin, polish — multiplayer is no longer parallel/optional. Cheatsheet and ASCII viz updated to match.

**Dropoff:** v0.0.7.20 live. Next push per roadmap: v0.0.7.21 (multiplayer rate limiting + 429 UI). Then v0.0.7.22 (sticky gun + scanner) + minimal admin alongside if context allows.

---

### 2026-04-14 (v0.0.7.18 + v0.0.7.19 — bugfix patch commits 1, 2a)

Picked up immediately after refactor merge. Goal: collate refactor housekeeping bugs (handoff items 1-7) with player-feedback bugs and ship a bugfix patch.

**Player-feedback bugs collated from `tlh-postrefactorpatch.txt`:**
- "package too heavy" log unclear (silent continue, no feedback)
- packages lost even when tied down (turned out to be commit 6 design — tie-down was redefined to damage-only; user wants option B)
- buy boots at near-full meter wastes scrip
- boots don't auto-equip from clip unless auto-buy is on
- km not updating (this turned out to be a real accumulator bug, not just cosmetic — see commit 2a)
- sandalweed too common (turned out to need redistribution by zone, not just rate dial-back)
- drink button spammable at 0% loss

**Design conversations this session (decisions captured in "design decisions" section above):**
- Tie-down semantics: A vs B vs C → user picked B
- Sandalweed redistribution: full reframe ("scarce overall, found mostly near wetlands and shelters") + centralization to constants.js
- Wetland canteen refill tuning: conservative 0.05/tick to avoid trivializing water + boots simultaneously
- Drink threshold: 95% (must have lost ≥5%)
- Tooltip pattern: data-tooltip + aria-label, decoupled from `title`
- Persistence export/import format: `TLH-SAVE:` prefix (no version baked in), payload contains `v:` for migration

**Commits this session:**

- **Commit 1 part 1 `cc7c245`** (v0.0.7.18 prep) — additive files: `util.js`, `state.js` flag, `constants.js` additions, `zones.js` wired to constants, `world.js` wetland tag. Branch stays green (nothing imports from new files yet).
- **Commit 1 part 2 `7f3cffc`** (v0.0.7.18 mid) — `trust.js` (renames + pickRandom from util + getNpc canonical), `channels.js` + `recovery.js` + `render/settlements.js` (drop dups, import canonical), `persistence.js` (silent error surfacer). **Interim broken state**: main.js still calls old `tryT50Warning` etc.
- **Commit 1 part 3 `3ee9fe2`** (v0.0.7.18 close) — `boots.js` (BOOT_PRICE swap, full-meter guard, clip-equip failsafe), `stamina.js` (drink threshold), `main.js` (call site renames), HTML to v0.0.7.18. Restores green state.
- **Commit 2a `35769da`** (v0.0.7.19) — single push, six files: `trip.js` (accumulator math fix + damage log clarity), `trust.js` (unlock storage canonicalization), `boots.js` + `recovery.js` (data-tooltip swap), `the-long-haul.css` (data-tooltip read), HTML to v0.0.7.19.

**Pattern lessons captured**:
- Three-part push for commit 1 was a context-budget casualty (lesson #10 added). Commit 2a fit in one push because we wrote the push call directly without staging to /home/claude.
- Compatibility-layer pivot wasn't needed this session — the renames + dedups had brittle interim states between push-parts but no consumer needed a compat layer.

**What didn't ship (queued as commit 2b):**
- Tie-down option B
- Rain restructure (nextRainStartTick/EndTick)
- Wetland canteen refill wiring
- Pickup-fail logs

User chose to defer 2b to a fresh session for clean context. All four items have settled designs (see "queued for commit 2b" section). Pickup-ready.

**Bug list status after this session:**
- Refactor housekeeping items 1-7: ✅ all closed
- Multiplayer item 8: still open (rate limiting + 429 UI)
- Items added: state shape `_transient.depotRestPending` vs `restPromptPending` inconsistency, `S.inRiver` stub, sub-version naming creep (cosmetic, tagged for v0.0.8 conversation)

**Dropoff**: v0.0.7.19 live and verified green. Commit 2b queued, design-complete, pickup-ready. User logging off — fresh agent next session.

### 2026-04-14 (refactor structurally complete — commits 15-17, worker deploy, wrangler hygiene, tmp-probe cleanup)

Long session. Picked up at commit 14 + worker quota fix landed but not deployed. Pushed commit 15, deployed the worker, cleaned the stray probe file, then landed the full render extraction across commits 16 (two parts) and 17.

**Commits this session:**
- **15 `ed2d67e`** — `js/upgrades.js`. Smallest extraction of refactor: 27 lines, 2 functions.
- **`b051352`** — Removed `js/main.js.tmp-probe` via GitHub web UI (MCP tools can't delete files).
- **16 part 1 `ddd811e`** — Created the 5 render modules. Additive only.
- **16 part 2 `3658f79`** — Cutover via re-export compatibility layer.
- **`4d5f48f`** — HTML subtitle bumped to v0.0.7.16.
- **17 `4e46610`** — Final structural commit. Swept all 9 dependent modules to import directly from `render/*`. Dropped main.js's re-export layer. main.js now ~325 lines, zero exports.

**Worker deploy** (out-of-band, manual): worker v0.0.7.1 deployed. Real KV namespace ID handled via gitignored `wrangler.toml` + committed `wrangler.toml.example` template.

**Strategy notes**: compatibility-layer pivot saved the day. MCP tools cannot delete files.

**Dropoff**: refactor structurally complete at v0.0.7.17, pending verification.

### 2026-04-14 (tlh-modules refactor — commits 11-14 done, worker quota fix)

Resumed refactor. Pushed commits 11, 12, 13-14 (combined), plus one hotfix and a worker-side fix.

**Commits**:
- 11 (multi-push) — packages.js. Messy push: split across 4 sub-commits.
- 12 `19bea14` — trip.js.
- 13-14 part 1 `7dbad92` + part 2 `f779ab8` — boots.js + stamina.js.
- 14 hotfix `78ccbf6` — trip.js missed `staminaSegCount` import.
- Worker quota fix `e8d488f` (worker v0.0.7.1).

**Debugging pattern that worked for the worker 500**: asked user for DevTools Network tab Response body before guessing.

### 2026-04-14 (tlh-modules refactor — commits 5-10)

All ten extractions verified green. Working pattern: each commit announces plan with cross-call story, pushes 3 files, user verifies, move on.

**Commits 5-10 SHAs:**
- 5 `a65b18b` persistence.js
- 6 `d50beec` multiplayer.js — first true circular-import-by-file
- 7 `30aa52e` recovery.js
- 8 `d934c07` identification.js
- 9 `36d3cb8` trust.js + channels.js — biggest yet (~180 lines)
- 10 `836a91b` world.js

**False alarm**: "no signal" on localhost was browser cache showing v0.0.7.4. Empty-state, not bug.

### 2026-04-14 (tlh-modules refactor — commits 1-4)

Started module refactor on `tlh-modules` cut from `main`. ES modules over IIFE.

- Pre-refactor commit A `ec9f377`: trust threshold realignment 25/50/75/100 → 20/40/60/80.
- Refactor commit 1 `f9b1e91` v0.0.7.1: module port.
- Refactor commit 2 `24d0b54` v0.0.7.2: state.js + `_transient`.
- Refactor commit 3 `077f9e8` v0.0.7.3: constants.js.
- Refactor commit 4 `1ece0d6` + `533edf8` v0.0.7.4: data files.

### 2026-04-14 (v0.0.7 commit 6 — v0.0.7 complete)

Final v0.0.7 commit: distKm accumulator, all-cargo drop, settlements rebuild, gear popover, vertical canteen, recovery badge, sandal at-cap stable green, channels empty state.

### 2026-04-14 (v0.0.7 commits 4a/4b + wipe fix + commit 5)

- Commit 4a `a105cbb`: trust scaffold, NPC_DEFS, save schema v4 → v5.
- Commit 4b `466598b`: trust behaviors, channels panel, ~75 dialogue lines.
- Wipe save bugfix: `_wipeInProgress` guard.
- Commit 5 `18f6914`: lost cargo recovery loop.

### 2026-04-13 (v0.0.7 commit 3b: bug batch + handoff split)

Six bugs + UI tweaks. Save schema v3 → v4. Handoff split: spun TLH doc out from main HANDOFF.md.

### 2026-04-13 (mid-day — v0.0.7 commits 1-3)

- Commit 1 `c9a57b9` + `8f7940f`: Cloudflare Worker.
- Commit 2 `6d3d56d` + `4020307` + `fc2820c`: game-side multiplayer wiring. Save schema v1 → v2.
- Commit 3a `c751caf`: bugfix batch.
- Commit 3 `0fb8322`: identification stages, save schema v2 → v3.

### 2026-04-13 (earlier — v0.0.6: persistence + multiplayer planning)

Music tracks added to `nav.js`. v0.0.6 added save/load. Multiplayer platform decided.

### 2026-04-13 (v0.0.5 — earliest)

Full rewrite of terrain + delivery systems. Persistent world map, world packages, proximity pickup. Scroll JS-driven via `translateX`. Introduced the derived `distKm` formula that commit 6 replaced (and commit 2a finally got correct).

---

### commit v0.0.8.4 — identity patch

**Scope**: three new NPCs + trust dialogue shape fix + rich dialogue variety pass.

**What shipped:**

1. **Three new NPCs.** phi (weather station, `?`), xi (reserved researcher, `C`), psi (orphan-scavenger, `·`). Full entries in [NPC_DEFS](js/data/npc-defs.js) with `trustProfile` field; full dialogue corpora in [npc-lines.js](js/data/npc-lines.js); label pools rewritten in [data/packages.js](js/data/packages.js); state defaults in [state.js](js/state.js).

2. **`trustProfile` dispatcher.** New `computeTrustGain(pkg, depotId)` in [trust.js](js/trust.js). Three profiles: `default` (rho/iota/tau/phi — flat legacy behavior), `careful` (xi — halves gain on non-fragile and non-xl pkgs), `scavenger` (psi — doubles on s, normal on m, halves on l/xl). Delivery callers in [packages.js](js/packages.js) now route through the dispatcher; discovery trust stays flat (`TRUST_GAIN_DISCOVERY`). Fractional trust (e.g. 0.5 per delivery to xi) accumulates correctly — threshold checks `before < t && npc.trust >= t` handle floats.

3. **Trust dialogue shape fix (latent bug, significant).** Since the module refactor, [trust.js](js/trust.js) accessed `NPC_LINES[depotId].<category>` but [npc-lines.js](js/data/npc-lines.js) exports `NPC_LINES.<category>[depotId]`. Result: threshold unlock lines, t40 warnings (trip/rain/stamina), t60 preview lines, and t80 rest-prompt buttons had been **silently no-opping** — only ambient chatter via [channels.js](js/channels.js) ever worked. Fix: rewrote all 6 access paths to category-first. Threshold uses direct string access (no pickRandom, one-shot moments). Warning/preview/rest use pickRandom on arrays. Preview template vars `{kind}/{next}` → `{label}/{size}/{dest}` alignment. Dropped harmless third `speak()` arg.

4. **Dialogue variety: 3–5 variants per repeating slot × 6 NPCs.** Warning (`rain`/`trip`/`stamina`) and preview promoted from single strings to arrays. Rest already arrays, expanded from 3 to 4 per NPC. Existing rho/iota/tau expanded; phi/xi/psi authored fresh. Total: ~160 new/rewritten lines. Ambient and threshold untouched (ambient already arrays of 6; threshold intentionally single — one-shot unlock moments).

5. **Label pool rewrites.** `?` orphan-themed labels (beaded bracelet, carved charm, pressed flowers, hearth kit, etc.) migrated to `·` (psi inherits the orphan-gift pool). `?` rebuilt from scratch with weather-instrument labels (rain gauge, barometer, storm journal, anemometer mast). `C` expanded with research/ruin-scavenging labels (specimen jar, copper coil, map fragments, cracked tile set, archive crate). Pool counts: s:26, m:26, l:22, xl:20.

6. **State updates.** `settlements['?']` label/tier/quote updated for weather station. `routeNodes` `?` label = 'weather station'. Three new NPC entries in default `S.npcs`. `·` label stays 'waypoint'; `C` label stays 'ruins'; quotes lightly rewritten to nod at psi/xi presence.

7. **Delivery dialogue.** New `delivery` category in NPC_LINES: 5 conditions (normal, heavy, damaged, fragile, lost) × 6 NPCs × 3 lines = 90 lines. New `speakDelivery(arrivedNodeId, deliveredPkgs)` in [trust.js](js/trust.js) — scans the batch for the most interesting condition (lost > damaged > fragile > heavy > normal), speaks one line. No trust gate — fires from first delivery (good onboarding). `pkg.damaged = true` flag added in [trip.js](js/trip.js) damage branch.

8. **Character voice pass.** All six NPCs given distinct characterization:
   - **rho** — former porter, wizened advice from their years on the route
   - **iota** — 20s wetlands ecology researcher, academic enthusiasm ("germination rates!", "publishable handling quality!")
   - **tau** — the porter's sibling. encouraging and proud, not overprotective. ("you came back. — good. i knew you would." / "that's my family.")
   - **phi** — weather station forecaster, meteorological vocabulary
   - **xi** — reserved researcher in ruins, clipped/formal, warms slowly, light scavenging angle
   - **psi** — orphan-scavenger at waypoint. resilient, self-sufficient, survives alone. warm but not fragile.
   - All NPCs are nonbinary/agender — no gendered language in dialogue or comments (tau's dog keeps her pronouns).

**Files touched:** [js/trust.js](js/trust.js), [js/trip.js](js/trip.js), [js/packages.js](js/packages.js), [js/state.js](js/state.js), [js/data/npc-defs.js](js/data/npc-defs.js), [js/data/npc-lines.js](js/data/npc-lines.js), [js/data/packages.js](js/data/packages.js), [the-long-haul.html](the-long-haul.html), [TLH-HANDOFF.md](TLH-HANDOFF.md).

**Save schema:** no bump. Stays v6. New `S.npcs` entries auto-init on first trust gain; default state now pre-declares them. Existing saves auto-expand via the `addTrust()` lazy-init path. `pkg.damaged` flag is transient (set on inventory objects, not persisted).

**Verification:**
- Zero console errors on load
- NPC_LINES shape confirmed via dynamic import: threshold = strings, warning/preview/rest/delivery = arrays with correct counts
- NPC_DEFS has 6 entries with correct trustProfiles
- Label pools confirm phi receives weather labels, psi receives orphan gifts + scavenger adds, xi receives research/salvage labels
- Delivery dialogue structure: 6 NPCs × 5 conditions × 3 lines each confirmed
- Full trust-event runtime testing (threshold speaking, rest button appearing, trustProfile math, delivery speech on pkg drop-off) requires admin token or gameplay

### commit v0.0.8.5 — weight-scaled trust

Small mechanical commit. `computeTrustGain` base changed from flat `TRUST_GAIN_DELIVERY=1` / `TRUST_GAIN_LOST_DELIVERY=2` to `1 + Math.floor(pkg.slots / 2)` + `TRUST_GAIN_LOST_BONUS` (+1 for lost/recovery). Delivery log now shows `+Xc +N trust`. Profile multipliers (careful/scavenger from .4) apply after the weight-scaled base. Constants `TRUST_GAIN_DELIVERY` and `TRUST_GAIN_LOST_DELIVERY` removed (dead).

**Files touched:** [js/trust.js](js/trust.js), [js/constants.js](js/constants.js), [js/packages.js](js/packages.js), [the-long-haul.html](the-long-haul.html). 4 files, +20/-19.

### commit v0.0.8.6 — upgrade migration + trust rewards

**What shipped:**

1. **Upgrade migration.** 6 upgrades moved from scrip purchase to NPC trust-tier rewards: bootClip1 (rho t20), bootsT2 (rho t40), sandalSatchel (iota t20), steadyFeet (tau t20), stickyHolster (tau t40), scannerT1 (xi t20). `trustReward: { npc, tier }` field on UPGRADE_DEFS entries. `renderUpgrades()` filters them out of the scrip menu. `onTrustUnlock()` auto-grants. `loadGame()` retro-grants for existing players whose NPC trust already exceeds the tier.

2. **Three new trust-reward upgrades:**
   - **weatherRadio** (phi t20): `S.weatherRadio = { unlocked: true }`. Tick hook in main.js fires a log line (`weather radio: rain incoming — ~Ns`) once per incoming storm when approaching the warn window. Dedupe via `_transient.lastWeatherRadioWarnTick`.
   - **sandalEfficiency** (iota t40): sandalweed boot repair 30 → 50 durability. One-line hook in [boots.js:60](js/boots.js:60).
   - **scavenger's eye** (psi t20): `PKG_RESPAWN_TICKS * 0.8` (20% faster respawn); lost spawn chance `0.15 → 0.22`. Hooks in [world.js](js/world.js) and [packages.js](js/packages.js).

3. **Tier structure (consistent, predictable):**
   - t20: first gift from every NPC (6 upgrades)
   - t40: second gift from rho, iota, tau (3 upgrades)
   - t60: battery charges at trusted destinations (+15, capped at 100)
   - t80: free rest (stamina + canteen refill, no scrip cost — gate and deduction both removed)

4. **t80 free rest.** Scrip gate (`< 5`) and deduction (`- 10`) both removed from `tryRestPrompt` / `confirmDepotRest`. At max trust, NPC hospitality is unconditional.

**Files touched:** [js/data/upgrades.js](js/data/upgrades.js), [js/state.js](js/state.js), [js/upgrades.js](js/upgrades.js), [js/trust.js](js/trust.js), [js/persistence.js](js/persistence.js), [js/main.js](js/main.js), [js/boots.js](js/boots.js), [js/world.js](js/world.js), [js/packages.js](js/packages.js), [the-long-haul.html](the-long-haul.html). 10 files, +123/-26.

**Save schema:** no bump (stays v6). New upgrade flags (`weatherRadio`, `sandalEfficiency`, `scavengerEye`) are booleans in `S.upgrades`, auto-handled by the generic upgrades persistence path. `S.weatherRadio` object lazy-inits. Retro-grant migration handles pre-.6 saves.

**NPC reward identity summary:**
- **rho** (A): boots. boot clip at t20, reinforced soles at t40.
- **iota** (B): ecology. sandalweed satchel at t20, sandalweed poultice at t40.
- **tau** (H): sibling gear. steady feet at t20, gun holster at t40.
- **phi** (?): weather. weather radio at t20. (t40+ slots reserved for rain rework gadgets.)
- **xi** (C): electronics. terrain scanner at t20. (t40+ reserved for future scanner T2/T3.)
- **psi** (·): scavenging. scavenger's eye at t20. (t40+ reserved.)

**Next:** rain rework (v0.0.8 final thread) or optional v0.0.8.7 NPC dialogue about their gifts.

---

## reference links (TLH-specific)

- Cloudflare Workers docs: https://developers.cloudflare.com/workers/
- Cloudflare KV docs: https://developers.cloudflare.com/kv/
- Live worker: https://coiledlamb.tlh-feed.workers.dev
