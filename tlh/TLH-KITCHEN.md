# the long haul — v0.0.9.8 kitchen handoff

_Standalone briefing for a fresh agent picking up the cooking system implementation. Self-contained — does not require reading the full TLH-HANDOFF.md to start, but cross-references it for deep dives._

_Written 2026-05-03 after v0.0.9.7.10 shipped. Branch `main` is at `faa56ca`._

---

## context: where we are

- **Just shipped (.7.7 → .7.10)**: cargo log skeleton + topo map raster + slide-in drawer + filter polish + log dedup + topo follow-ups + fragile-first damage selection + porter ring-corner fix + interior mesa climbing + placed-gear tooltips. v0.0.9.7 closed at .7.7; .7.8/.7.9/.7.10 are pre-kitchen cleanup + balance tweaks.
- **Next patch**: **v0.0.9.8 — the kitchen** (cooking system).
- **Cargo log scaffolding from .7.1**: `S.cargoLog.plants` save slot + `notePlantFound` / `notePlantCookedRole` hooks at [tlh/js/render/cargo-log.js](tlh/js/render/cargo-log.js) are wired and waiting. [tlh/js/data/plants.js](tlh/js/data/plants.js) is an empty `PLANTS = {}` stub awaiting populate.
- **Plant names**: locked, listed in the roster table below.

---

## read these first (canonical sources)

If something below is ambiguous, defer to:

- [tlh/TLH-1.0.md](TLH-1.0.md) — patch sequence and scope per-version. Confirms .8 = the kitchen, .11 = heat-themed plants, .12 = renderer.
- [tlh/TLH-DESIGNBIBLE.md](TLH-DESIGNBIBLE.md) — locked design philosophy: idle-first, ASCII aesthetic, gender-neutral cast, 12 NPCs.
- [tlh/TLH-HANDOFF.md](TLH-HANDOFF.md) — full ship log + all prior implementation plans + the v0.0.9.8 design sketch section (more verbose version of this doc).

---

## locked design decisions

- **Two-plant combo cook.** One trigger slot + one conditional slot. Same plant can fill both slots (uses 2 of that plant from stash; reveals both halves at once).
- **Reveal contract** (per .7.1 cargo log spec): each plant has fixed `trigger` + `conditional` properties; cooking reveals only the role the plant played in the dish. Two plays per plant for full codex completion.
- **No pair gating, no special-case combos.** Plant A's trigger pairs with Plant B's conditional with no lookup table. The plant card is the contract. Variety lives in the cross product. Balance lives at the trigger and conditional level individually, not in pairings.
- **Buff duration**: ~850 ticks (≈5 min real-time at TICK_MS=350). Tunable in 750–900 band.
- **Buff lifecycle**: queue + overwrite. New cook replaces current buff. No stacking.
- **Recipe queue with priority fallback**: ordered preference list. "Try recipe 1; if I'm out of an ingredient, try recipe 2; ..." Echoes existing patterns: boots autobuy fallback ([tlh/js/boots.js:84](js/boots.js:84)) and upgrade-shop pending. Auto-cooks whenever current buff expires + ingredients + water present.
- **Field cook**: anywhere, costs 10–20% canteen per cook (tunable). Picker UI for any 2 ingredients from stash.
- **Depot cook**: trust-gated. Each NPC has an **authored signature recipe** (designer-curated combo), not derived from "ingredients available on the path." Designer picks the perfect pair for each NPC's voice.
- **Per-ingredient stash cap**, sandalweed-style. No shared pantry.
- **Cargo log "plants" section becomes "ingredients"** to cover plants + porter's pal + future weird non-plant items. Hide-items filter renames to "ingredients only" or similar.
- **Cook UI placement**: TBD (see open items).

---

## the unified effect model

**Trigger** = defines *when* the conditional is "on" (active window).
**Conditional** = a grace modifier applied to the underlying system while on.
**Buff window** = caps maximum on-time (~850 ticks).

Two trigger flavors:

- **State predicate** — conditional is on while the predicate holds (e.g., boots warn, in storm, on rocky terrain, low battery). Flips with state.
- **Event sub-window** — conditional is on for ~200 ticks after each event fire; refresh on re-fire.

**No probability gates** on triggers. Earlier drafts had `30% chance on pickup` etc., but the buff window length already provides natural rate limiting and gates muddy player expectation. Trigger fires every time its condition is met.

Conditionals are all rate modifiers — no "stored, waits for downstream event" or one-shot-stored shapes. Unified model, every plant card is legible.

This solves "I ate but the meal expired before anything happened":
- State-trigger meals start working the moment you enter the bad state.
- Event-trigger meals earn value from any one of many common events within the buff window.

---

## trigger vocabulary

**State predicates (10)** — conditional active while predicate holds:

| Tag | Active when |
|---|---|
| `boots_warn` | boots at warn/crit durability |
| `canteen_low` | canteen under 25% |
| `in_storm` | currently in a storm cell |
| `strain_high` | strain ≥ 0.7 (sim-tunable; widen to ≥0.5 if uptime feels low) |
| `on_rocky_terrain` | currently on river OR rockyHills cell |
| `on_plateau_or_mountain` | currently on plateau OR mountain cell |
| `on_daylight` | sun is up (half-day uptime; pairs with sunflower) |
| `on_low_battery` | battery <25% |
| `on_fragile_carried` | any fragile pkg in inventory |

**Event sub-windows (3)** — conditional on for ~200 ticks after each event fire; refresh on re-fire:

| Tag | Fires on | Window |
|---|---|---|
| `on_pickup` | pkg picked up | 200 ticks |
| `on_delivery` | pkg delivered | 200 ticks |
| `on_terrain_enter` | crossed into new terrain type | 200 ticks |

**Cuts** from earlier drafts (do NOT add these back without conversation):

- `on_trip` — strain integration absorbed direct trip-chance modification
- `on_rest` — rest mechanic dropped from cooking design space (vestigial)
- `exhausted` — replaced by more specific state predicates
- `on_dawn` — replaced by `on_daylight` state (more forgiving for idle play)

---

## conditional vocabulary

| Tag | Grace effect | Notes |
|---|---|---|
| `boot_grace` | −40% boot degradation | matches smoke-sandalweed precedent (~25% active) but stronger since meal has resource cost |
| `canteen_grace` | **needs reframe** — see open items | no passive canteen drain to reduce; original effect doesn't fit (audit confirmed in .7.8) |
| `strain_grace` | −50% strain accrual | does NOT cover trip mitigation (tie-down handles that for free); value is delaying strain-cap → trip cycle |
| `terrain_grace` | −50% trip mult on river + rockyHills | clayroot — see split note |
| `terrain_grace_alpine` | −50% trip mult on plateau + mountain | cliffhanger — alpine half of the split |
| `storm_grace` | −50% storm trip-mult contribution (downpour 1.50→1.25, rain 1.25→1.125, drizzle 1.10→1.05) | doesn't touch canteen-refill side of storms |
| `scrip_grace` | +25% scrip per delivery | flagged as weak felt-attribution — needs log message reinforcement at impl ("rustveil bonus: +5c") |
| `scanner_grace` | scanner buff magnitude doubled (T1 ×0.5 → ×0.25) | flagged as weakest felt — invisible system change. Surface via scanner-halo brightness pulse during buff |
| `battery_grace` | flat +0.10/tick passive battery regen during sub-window | stacks with solar; ~75 charge over the half-day |
| `gadget_grace` | −25% battery drain across all consumers | flagged as weak felt — invisible. Surface via battery bar tint or drain-rate readout |
| `fragile_grace` | halves fragile hit rate during severe trips (mountain 100%→50%, river 100%→50%, rockyHills 50%→25%) | NEW — earned its slot via novel system reach (pkg modifier system); stacks with ceramicWrap |
| `wild_grace` | at activation, RNG-selects one of {boot, canteen, strain, terrain, storm, scanner} grace; visible in buff display ("rolled X this time") | porter's pal only |

**Cuts** from earlier drafts:

- `trip_grace` — strain integration absorbed it; redundant
- `trust_grace` — "more numbers, more often" wasn't doing real design work
- `stamina_grace` — sunflower repositioned to battery_grace; no other plant earned the stamina-grace slot
- `outbound_grace` (NPC dispatch chance) — felt moment too thin without UI surface to reinforce. Revisit if outbound system gets more visual weight.

---

## the 12-ingredient roster (locked)

| # | Ingredient | NPC anchor / biome | Trigger | Conditional |
|---|---|---|---|---|
| 1 | **gritgrass** | rho — ring/desert (renames sandalweed display, internal IDs stable per .9.5 precedent) | `boots_warn` | `boot_grace` |
| 2 | **pebblewort** | iota / nu / delta — wetland/river | `canteen_low` | `canteen_grace` (see TBD) |
| 3 | **clayroot** | theta — clay banks (river-adjacent harvest justifies river coverage) | `on_rocky_terrain` | `terrain_grace` (river + rockyHills) |
| 4 | **rustveil** | xi — city ruins (lore: *"smelling faintly of wet pennies"* maps to scrip flavor) | `on_pickup` | `scrip_grace` |
| 5 | **windscald** | phi — weather station / windswept plateau | `in_storm` | `storm_grace` |
| 6 | **sunflower** | psi / iota — oasis/greenhouse (daytime ingredient; .11 may overlay heat trigger) | `on_daylight` | `battery_grace` |
| 7 | **stone rasp** | gamma — workshop scrub | `strain_high` | `strain_grace` |
| 8 | **stonesong** | lambda — climbing slope (lore: *"amplifies the sound of the wind"* = scanner amplification) | `on_terrain_enter` | `scanner_grace` |
| 9 | **riverknot** | delta — reservoir banks (delta runs power infrastructure → gadget-themed) | `on_low_battery` | `gadget_grace` |
| 10 | **cliffhanger** | lambda — alpine half of terrain_grace split (clayroot covers river+hills; cliffhanger covers plateau+mountain) | `on_plateau_or_mountain` | `terrain_grace_alpine` |
| 11 | **claybloom** | theta — kiln (ceramic-glaze plant; *"petals feel cool and smooth to the touch"*) | `on_fragile_carried` | `fragile_grace` |
| 12 | **porter's pal** | xi — city ruins (NON-PLANT: pre-collapse preserved meal, archaeology drop at ruins cells) | (any, random both halves) | `wild_grace` |

### special notes per ingredient

**Sandalweed → gritgrass display rename**: existing in-game sandalweed (boot-lash plant, kit-bar badge per [tlh/js/boots.js:198](js/boots.js:198)) gets renamed at the **display layer only** — internal `S.sandalweedCount`, `sandalEfficiency` upgrade ID, `sandalCap()`, etc. stay stable. No save migration. ~15-25 user-facing string sites to touch. Precedent: v0.0.9.5 rename pass ("pack mule rig → molly netting" etc.) per [TLH-HANDOFF.md:18](TLH-HANDOFF.md:18).

**Porter's pal**: ingredient (not plant), spawns at ruins cells, rarer than plants, same stash cap (~5). At cook time RNG selects one of the 9 plants and uses its trigger (or conditional, depending on slot) for the meal. Each cook is a fresh roll, no memory. Wild-pool excludes the strongest conditionals (`battery_grace`, `scrip_grace`) to prevent jackpot-hunting.

**Sunflower**: was named in v0.0.9.11's plan as the heat-trigger rework target. Now lives in .8 as the daylight/battery plant. When .11 ships, **audit signatures for sunflower dependency** and decide whether sunflower picks up a second effect (heat overlay) or whether .11 introduces new heat-anchor plants alongside sunflower. Not blocking .8.

---

## NPC depot signatures (authored)

Designer-curated combos, not coverage-driven. Each NPC's signature is one fixed plant pair that produces a named meal when cooked at that NPC. Pi (cold summit) defers to v0.0.9.11 cold plants — no signature in .8.

When .11 ships heat-themed plants + reworks sunflower's trigger, **audit signatures** for sunflower dependency and update affected recipes.

Authoring is part of the .8 patch — 11 recipes × name + dialogue + plant pair. Lean into NPC voice.

---

## existing-system findings (from .7.8 audit) — relevant for impl

- **No passive canteen drain.** Canteen only changes via `drinkWater` (consumed) and various refills (rain, wetland, storm burst, reservoir tank). So `canteen_grace` as "−50% drain at low canteen" doesn't have a hook. **Reframe required** — see open items.
- **Stamina drain is constants-driven** at `C.STAMINA_DRAIN = 0.40`/tick — single hook in [tlh/js/main.js:352](js/main.js:352). Easy modifier surface.
- **`DRINK_MIN_LOSS_PCT` and `DRINK_EFFICIENT_MULT`** already in [tlh/js/constants.js](js/constants.js) (.7.8 cleanup).
- **Trust profile system fully shelved** (per v0.0.9.6.10.17). `computeTrustGain` at [tlh/js/trust.js:107-110](js/trust.js:107) is `1 + floor(slots/2) + (lost ? 1 : 0)`. Cooking-time trust modifiers (if revived) plug in here.
- **Fragile mechanics are alive** (post-.7.8 fragile-first damage selection). `fragile_grace` slots cleanly as a third mitigation alongside ceramicWrap one-absorb and tie-down trip-absorb.
- **Cargo log plants section + persistence** already wired in .7.1. Hooks `notePlantFound(id)` / `notePlantCookedRole(id, role)` at [tlh/js/render/cargo-log.js](js/render/cargo-log.js) waiting.

---

## decisions locked (2026-05-12 walkthrough)

These resolved during a kitchen walkthrough; impl can proceed against them.

1. **`canteen_grace` = drink efficiency.** Drinks cost 50% less canteen during buff. Stacks multiplicatively with `efficientConsumption` upgrade (×0.60 × ×0.50 = ×0.30 combined). Felt as "each sip stretches further."
2. **Magnitude tuning = flat split default.** State-trigger graces −40% (longer uptime, weaker per-tick); event-trigger graces −50% (briefer windows, stronger). Per-plant tuning available later if sim shows imbalance.
3. **Cook UI = cargo drawer.** Cooking lives in a new "meals" sub-section of the cargo drawer. Drawer has the screen real estate to communicate effects clearly.
4. **Recipe queue = 2-back.** 1 active meal + 1 queued. Clicking a meal in the meals screen prompts "cook now or add to queue." Expand depth later if needed.
5. **Depot cook unlock = t40 placeholder.** Each NPC's depot opens at t40 trust for free cooking. Flagged for v0.0.9.10 trust restructure to revisit; name the code constant something like `DEPOT_COOK_TRUST_PLACEHOLDER` so the .10 patch picks it up.
6. **`strain_high` cutoff = 0.7.** Active ~30% of the time. Widen to 0.5 if sim shows under-firing.

## still open before impl

7. **Weak-felt conditionals UI reinforcement — workshop required before .8 starts.** Original set: `scrip_grace` (log message at delivery), `scanner_grace` (halo brightness pulse), `gadget_grace` (battery bar tint). User feedback 2026-05-12: scrip_grace + scanner_grace flagged for potential pull/rework; gadget_grace in scope but needs mockup. Workshop should cover: which of the three survive in any form; if cut, do their plants (rustveil, stonesong) get replaced or does the roster shrink to 10/11; what does gadget_grace UI look like in mockup. **Roster lock may need revisit.**

---

## implementation cheatsheet (suggested order)

1. **Confirm open items** with user — especially #1 (canteen_grace reframe).
2. **Save schema bump**: `S.cargoLog.plants` slot already allocated per .7.1 → extend with `S.cargoLog.supplies` for porter's pal, `S.activeBuff`, `S.recipeQueue`, `S.ingredientStash` (or rename `sandalweedCount` to a generic ingredient stash if you want — likely don't, keep separate for stability). Bump SAVE_VERSION; add migration that initializes new slots empty.
3. **Populate [tlh/js/data/plants.js](js/data/plants.js)** with the 11 plant entries + author lore strings (1-2 lines each, in TLH voice — practical/observational, not "the elders say").
4. **Add INGREDIENTS layer** (or extend PLANTS) for porter's pal as the non-plant entry with `kind: 'plant' | 'supply'` discriminator.
5. **New `js/cooking.js` module**: `TRIGGERS` + `CONDITIONALS` dispatcher tables with the grace-modifier hooks into existing systems (boots, canteen, strain, trip, storm, scrip, scanner, battery, fragile, gadget). Buff lifecycle (start, tick-down, expire, overwrite). Recipe queue logic.
6. **Cook UI**: picker (2-slot, ingredient list from stash), queue surface, active-buff display.
7. **Sandalweed → gritgrass** display-rename pass — ~15-25 user-facing string sites. Internal IDs stay.
8. **Cargo log update**: plants section → ingredients section, hide-items filter rename, render porter's pal alongside plants.
9. **Depot signature-meal authoring**: 11 recipes × name + dialogue + plant pair. Pi defers.
10. **Field cook canteen cost** hook (10-20% per cook).
11. **Recipe queue auto-cook** when current buff expires.
12. **`notePlantFound` / `notePlantCookedRole` hooks** (already at [tlh/js/render/cargo-log.js](js/render/cargo-log.js)) start firing on first cook events.
13. **UI reinforcement** for weak-felt conditionals (scrip_grace log line, scanner_grace halo pulse, gadget_grace battery tint).
14. **Sim harness pass** with cooking enabled — confirm meals don't break existing balance assumptions.

---

## things NOT to touch (scope creep guards)

- **Sandalweed boot-lash mechanic** — keep working as-is. Cooking is the SECOND consumer of the sandalweed stash. The lash + smoke mechanics remain.
- **Smoke-sandalweed (manual rest replacement)** — user has flagged this for likely removal before 1.0 ("it was kind of a test for the cooking system"). Don't proactively remove — wait for explicit go-ahead. If kept, it'll eventually be an alternative-spend axis on the sandalweed stash alongside cooking.
- **Trust profile system** — fully shelved. Don't reinvent NPC-specific trust gain.
- **NPC outbound dispatch system** — `outbound_grace` was cut. Don't add a 13th plant for it without conversation.
- **Topo-map visual stamps** — if adding new mesa visuals, MUST use the `NAT_MESAS` smoothstep pattern in [topo-map.js](js/data/topo-map.js), not hand-coded coordinates ("easy to mess up — match how our heightmap does elevation for them").
- **Ring/interior speed bonus plants** — considered, cut. Don't reintroduce.
- **Same-plant cook reveals both halves** — confirmed allowed; discoverable through play. Don't gate by requiring distinct plants.

---

## verification expectations

- All 11 plant cards render correctly in the cargo log with the right reveal states.
- Cooking a plant in trigger slot → reveals only that plant's trigger; conditional slot → reveals only conditional. Both halves at once if same plant in both slots.
- Buff window (~850 ticks) ticks down visibly; overwrite when new cook happens.
- Field cook consumes correct canteen %; depot cook is free.
- Recipe queue auto-cooks when current buff expires + ingredients + water present.
- Porter's pal RNG roll picks from the curated sub-pool (no `battery_grace`, no `scrip_grace`).
- Each grace effect actually fires on its trigger and modifies the right system. Test in-browser with eval if needed.
- No regressions: sandalweed boot-lash still works, save load/save round-trips work, multiplayer doesn't break.
- Browser preview (start with `preview_start tlh-static`, port pinned in [.claude/launch.json](.claude/launch.json) — note: each worktree uses its own port, default in this worktree is 8750; check before assuming).

---

## branch + version conventions

- Subtitle in [tlh/the-long-haul.html](the-long-haul.html) is updated per patch via [tlh/scripts/bump-version.sh](scripts/bump-version.sh) (cache-bust strings) **plus a manual subtitle edit** (the script's parser doesn't handle the `.7.X` collapsed format and warns).
- `.7.10` is the current live version. Next is **`.8.0`** (the kitchen). Or `.8.1` if you sub-divide.
- Cache-bust format: `XYZ-N-M` → game version `0.0.<X>.<Y>.<Z>.<N>.<M>` collapsed where leading zeros allow. `097-0-10` = v0.0.9.7.10. For .8.0, bump to `098-0-0` (the script handles the parse).
- Each commit message: `tlh v<version> — <description>`. Co-author footer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## resume cheatsheet

1. Read this doc + scan [TLH-1.0.md](TLH-1.0.md) (180 lines, fast).
2. Surface the open-items list to the user. Get answers — especially canteen_grace reframe.
3. Set up a fresh worktree if you want isolation, or work on this one.
4. Start with save schema + plant data populate (steps 2-4 above), get something rendering in the cargo log.
5. Then conditionals dispatcher + buff lifecycle (step 5).
6. Then UI (steps 6-9).
7. Land iteratively — each commit shouldable, kitchen patch likely splits into 4-6 commits over .8.0 → .8.4 or so.

You should be productive within an hour of reading this. If you find yourself reinventing decisions already settled here, stop and ask.
