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
- **Recipe queue, depth 2**: 1 active meal + 1 queued. Deliberate UI-scope compromise (per locked decision #4) — no priority-fallback semantics, just a single "what's next." Auto-cooks whenever current buff expires + ingredients + water present.
- **Field cook**: anywhere, costs 10–20% canteen per cook (tunable). Picker UI for any 2 ingredients from stash.
- **Depot cook**: small scrip cost + auto-rebuy toggle (per locked decision #5). Each NPC has an **authored signature recipe** (designer-curated combo), not derived from "ingredients available on the path." Designer picks the perfect pair for each NPC's voice.
- **Per-ingredient stash cap**, sandalweed-style. No shared pantry.
- **Cargo log "plants" section becomes "ingredients"** to cover plants + porter's pal + future weird non-plant items. Hide-items filter renames to "ingredients only" or similar.
- **Cook UI placement**: cargo drawer "meals" sub-section (per locked decision #3).

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

**State predicates (8)** — conditional active while predicate holds:

| Tag | Active when |
|---|---|
| `boots_warn` | boots at warn/crit durability |
| `canteen_low` | canteen under 25% |
| `in_storm` | currently in a storm cell |
| `strain_high` | strain ≥ 0.7 (sim-tunable; widen to ≥0.5 if uptime feels low) |
| `on_rocky_terrain` | currently on river OR rockyHills cell |
| `on_plateau_or_mountain` | currently on plateau OR mountain cell |
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
- `on_dawn` / `on_daylight` — daylight cycle cut from .8 entirely with sunflower deferred to .11

---

## conditional vocabulary

| Tag | Grace effect | Notes |
|---|---|---|
| `boot_grace` | −40% boot degradation | matches smoke-sandalweed precedent (~25% active) but stronger since meal has resource cost |
| `canteen_grace` | drink cost −50% canteen during buff | stacks ×0.5 with `efficientConsumption` upgrade (×0.30 combined); magnitude tunable later if sim shows imbalance |
| `strain_grace` | −50% strain accrual | does NOT cover trip mitigation (tie-down handles that for free); value is delaying strain-cap → trip cycle |
| `terrain_grace` | −50% trip mult on river + rockyHills | clayroot — see split note |
| `terrain_grace_alpine` | −50% trip mult on plateau + mountain | cliffhanger — alpine half of the split |
| `storm_grace` | −50% storm trip-mult contribution (downpour 1.50→1.25, rain 1.25→1.125, drizzle 1.10→1.05) | doesn't touch canteen-refill side of storms |
| `scrip_grace` | +25% scrip per delivery | felt-attribution via per-delivery log line (`"rustveil bonus: +Nc"`) — confirmed per workshop 2026-05-13 |
| `scanner_grace` | scanner cooldown halved during conditional window (fires 2× as often) | reframed from magnitude-doubled per workshop 2026-05-13 — "thing happened again" is the legible felt signal |
| `gadget_grace` | −25% battery drain across all consumers | UI fully spec'd — see `gadget_grace UI spec` section below |
| `fragile_grace` | halves fragile hit rate during severe trips (mountain 100%→50%, river 100%→50%, rockyHills 50%→25%) | NEW — earned its slot via novel system reach (pkg modifier system); stacks with ceramicWrap |
| `wild_grace` | at activation, RNG-selects one of the 10 non-wild conditionals (boot, canteen, strain, terrain, terrain_alpine, storm, scrip, scanner, gadget, fragile); visible in buff display ("rolled X this time") | porter's pal only — wild-pool exclusions dropped per workshop 2026-05-13 |

**Cuts** from earlier drafts:

- `trip_grace` — strain integration absorbed it; redundant
- `trust_grace` — "more numbers, more often" wasn't doing real design work
- `stamina_grace` — no plant earned the slot; sunflower (originally proposed here, then repositioned through battery_grace) deferred to .11
- `outbound_grace` (NPC dispatch chance) — felt moment too thin without UI surface to reinforce. Revisit if outbound system gets more visual weight.

---

## the 11-ingredient roster (locked)

| # | Ingredient | NPC anchor / biome | Trigger | Conditional |
|---|---|---|---|---|
| 1 | **gritgrass** | rho — ring/desert (renames sandalweed display, internal IDs stable per .9.5 precedent) | `boots_warn` | `boot_grace` |
| 2 | **pebblewort** | iota / nu / delta — wetland/river | `canteen_low` | `canteen_grace` |
| 3 | **clayroot** | theta — clay banks (river-adjacent harvest justifies river coverage) | `on_rocky_terrain` | `terrain_grace` (river + rockyHills) |
| 4 | **rustveil** | xi — city ruins (lore: *"smelling faintly of wet pennies"* maps to scrip flavor) | `on_pickup` | `scrip_grace` |
| 5 | **windscald** | phi — weather station / windswept plateau | `in_storm` | `storm_grace` |
| 6 | **stone rasp** | gamma — workshop scrub | `strain_high` | `strain_grace` |
| 7 | **stonesong** | lambda — climbing slope (lore: *"amplifies the sound of the wind"* = scanner amplification) | `on_terrain_enter` | `scanner_grace` |
| 8 | **riverknot** | delta — reservoir banks (delta runs power infrastructure → gadget-themed) | `on_low_battery` | `gadget_grace` |
| 9 | **cliffhanger** | lambda — alpine half of terrain_grace split (clayroot covers river+hills; cliffhanger covers plateau+mountain) | `on_plateau_or_mountain` | `terrain_grace_alpine` |
| 10 | **claybloom** | theta — kiln (ceramic-glaze plant; *"petals feel cool and smooth to the touch"*) | `on_fragile_carried` | `fragile_grace` |
| 11 | **porter's pal** | xi — city ruins (NON-PLANT: pre-collapse preserved meal, archaeology drop at ruins cells) | (any, random both halves) | `wild_grace` |

### special notes per ingredient

**Sandalweed → gritgrass display rename**: existing in-game sandalweed (boot-lash plant, kit-bar badge per [tlh/js/boots.js:198](js/boots.js:198)) gets renamed at the **display layer only** — internal `S.sandalweedCount`, `sandalEfficiency` upgrade ID, `sandalCap()`, etc. stay stable. No save migration. ~15-25 user-facing string sites to touch. Precedent: v0.0.9.5 rename pass ("pack mule rig → molly netting" etc.) per [TLH-HANDOFF.md:18](TLH-HANDOFF.md:18).

**Porter's pal**: ingredient (not plant), spawns at ruins cells, rarer than plants, same stash cap (~5). At cook time RNG selects one of the 10 plants and uses its trigger (or conditional, depending on slot) for the meal. Each cook is a fresh roll, no memory. No wild-pool exclusions per workshop 2026-05-13 — full plant set eligible.

**Sunflower**: cut from .8 per workshop 2026-05-13. Will be reintroduced in v0.0.9.11 as one of the new heat plants. `on_daylight` trigger and `battery_grace` conditional were sunflower-only and are removed from .8 vocab entirely.

---

## NPC depot signatures (authored)

Designer-curated combos, not coverage-driven. Each NPC's signature is one fixed plant pair that produces a named meal when cooked at that NPC. Pi (cold summit) defers to v0.0.9.11 cold plants — no signature in .8.

When .11 ships heat plants (including reintroduced sunflower), **audit signatures** for any heat-themed dependency and update affected recipes if needed.

Authoring split per [feedback_tlh_player_copy.md]: agent wires 11 signature stubs (plant pair + empty name/dialogue slots) as part of the .8 patch; user fills in meal names and NPC dialogue. Signatures will largely be mixes of local plants — work through each NPC together when we get there.

---

## existing-system findings (from .7.8 audit) — relevant for impl

- **No passive canteen drain.** Canteen only changes via `drinkWater` (consumed) and various refills (rain, wetland, storm burst, reservoir tank). `canteen_grace` reframed to drink-efficiency modifier (per locked decision #1) — hooks at the `drinkWater` consumption point, not a passive drain rate.
- **Stamina drain is constants-driven** at `C.STAMINA_DRAIN = 0.40`/tick — single hook in [tlh/js/main.js:352](js/main.js:352). Easy modifier surface.
- **`DRINK_MIN_LOSS_PCT` and `DRINK_EFFICIENT_MULT`** already in [tlh/js/constants.js](js/constants.js) (.7.8 cleanup).
- **Trust profile system fully shelved** (per v0.0.9.6.10.17). `computeTrustGain` at [tlh/js/trust.js:107-110](js/trust.js:107) is `1 + floor(slots/2) + (lost ? 1 : 0)`. Cooking-time trust modifiers (if revived) plug in here.
- **Fragile mechanics are alive** (post-.7.8 fragile-first damage selection). `fragile_grace` slots cleanly as a third mitigation alongside ceramicWrap one-absorb and tie-down trip-absorb.
- **Cargo log plants section + persistence** already wired in .7.1. Hooks `notePlantFound(id)` / `notePlantCookedRole(id, role)` at [tlh/js/render/cargo-log.js](js/render/cargo-log.js) waiting.

---

## decisions locked

Resolved across walkthroughs on 2026-05-12 and 2026-05-13. Impl can proceed against the full list.

1. **`canteen_grace` = drink efficiency.** Drinks cost 50% less canteen during buff. Stacks multiplicatively with `efficientConsumption` upgrade (×0.60 × ×0.50 = ×0.30 combined). Magnitude tunable later if sim shows imbalance.
2. **Magnitude tuning = flat split default.** State-trigger graces −40% (longer uptime, weaker per-tick); event-trigger graces −50% (briefer windows, stronger). Per-plant tuning available later.
3. **Cook UI = cargo drawer.** Cooking lives in a new "meals" sub-section of the cargo drawer. Drawer has the screen real estate to communicate effects clearly.
4. **Recipe queue = depth 2.** 1 active meal + 1 queued. Clicking a meal in the meals screen prompts "cook now or add to queue." Deliberate UI-scope compromise; no priority-fallback semantics. Expand depth later if needed.
5. **Depot cook = small scrip cost + auto-rebuy toggle.** Cooking at an NPC depot costs a small scrip fee (no trust gate). Player can opt into "auto-rebuy when buff expires" — fires next-in-queue cook at the depot automatically. Replaces earlier t40 free-gate placeholder.
6. **`strain_high` cutoff = 0.7.** Active ~30% of the time. Widen to 0.5 if sim shows under-firing.
7. **Weak-felt conditionals resolved (workshop 2026-05-13):**
   - **`scrip_grace` (rustveil):** keep +25% per delivery; surface via per-delivery log line `"rustveil bonus: +Nc"`.
   - **`scanner_grace` (stonesong):** reframed — scanner cooldown halved during conditional window (fires 2× as often), not magnitude doubled. Felt signal is "thing happened again."
   - **`gadget_grace` (riverknot):** keep −25% drain; UI spec landed (trailing-seg tint + side drain readout + tooltip annotation + trigger-fire log line) — see `gadget_grace UI spec` section.
   - All three plants retained; roster stays at 11.
8. **Sunflower cut from .8.** Deferred to v0.0.9.11 as one of the new heat plants. `on_daylight` trigger and `battery_grace` conditional removed from .8 vocab (no orphans — both were sunflower-only).
9. **Porter's pal wild-pool exclusions dropped.** Wild pool spans the full conditional vocabulary (10 non-wild graces post-sunflower).

## still open before impl

_None. All workshop deliverables landed; see `gadget_grace` UI spec below._

---

## gadget_grace UI spec (workshop deliverable 2026-05-13)

Locks the kit-row HUD treatment for the `gadget_grace` conditional (riverknot). Three surfaces stack: battery-bar tint, side readout, hover tooltip annotation. Plus a log line at trigger-fire.

### state shapes

```
no buff:          KIT  [████████████░░░░░░░░]  60%   -0.05/s
conditional on:   KIT  [████▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒]  22%   -0.04/s
buff expired:     KIT  [███░░░░░░░░░░░░░░░░░]  19%   -0.05/s
```

Buff-armed-but-dormant (player ate riverknot, battery still ≥ 25%) shows no kit-row change — the active-buff display in the cargo drawer "meals" sub-section (per locked decision #3) carries the "your meal is loaded and waiting" signal. Kit row only reacts when the conditional is actually firing.

### battery bar tint

Trailing/empty segments flip from `░` to `▒` while the conditional is firing. No new color ramp — the existing teal/purple/magenta charge ramp on filled segs is unchanged. Reads as "your remaining capacity is being protected."

Cleanly orthogonal to the existing `.crit` / `.warn` / `.on` segment classes and the .7.30 dissolving boundary seg.

### side drain readout

Always-visible drain-rate number right of the % column. Format: `-N.NN/s` (per-second, distinct from the tooltip's `/tick` granularity — gives the player a real-time-readable number on the HUD without needing to hover).

During the conditional window the number drops naturally (drain × 0.75). **No color or format change** on the readout text itself — the felt signal is the lower number + the bar tint + the cargo-drawer buff display. Tinting the readout was considered and dropped to avoid over-signaling.

Math: pull live drain from `activeBatteryDrainPerTick()` at [tlh/js/battery.js:133](tlh/js/battery.js:133), multiply by `(1000 / C.TICK_MS)` for /s units. Refresh cadence ~200ms (match the existing tooltip refresh).

### hover tooltip annotation

Consumer rows show the modified rate inline (multiplied by 0.75 when `gadget_grace` is firing) rather than per-row `× 0.75` suffixes. Single annotation row below the consumers names the source:

```
┌─ charge 22/100 ──────────┐
│ scanner      -0.015/tick │
│ exoskeleton  -0.011/tick │
│ carrier      -0.008/tick │
│ ──────────────────────── │
│ riverknot    gadget ×0.75│
│ ──────────────────────── │
│ solar        +0.045/tick │
│ ──────────────────────── │
│ net          +0.011/tick │
│ full in ~1m 14s          │
└──────────────────────────┘
```

Implementation: in [tlh/js/render/battery-tip.js:64](tlh/js/render/battery-tip.js:64), branch on `S.activeBuff?.conditional === 'gadget_grace'` when computing consumer rates and inserting the annotation row. Annotation row reuses the existing `rich-tip-row` shape; value cell can reuse `rich-tip-ok` styling.

### trigger-fire log line

When the conditional flips on (battery crosses below 25% while the buff window is active), one log line fires to surface the activation moment:

```
[t1247] riverknot kicks in — gadget drain reduced
```

Same shape as `scrip_grace`'s per-delivery line. Fires once per conditional-window entry, not on every tick the conditional remains on. Suppress if the conditional was already active when the meal was eaten (i.e., player cooked riverknot while battery was already below 25% — buff is firing from t=0, no fresh "kicks in" moment).

### what's explicitly NOT changing

- Bracket shape of the battery bar (`[ ]` stays — A-shape change rejected during workshop).
- Readout text color/format during buff (rejected — numeric drop is enough).
- Kit row during buff-armed-but-dormant state (cargo drawer carries that signal).
- Existing battery color ramp on filled segments (untouched).

---

## implementation cheatsheet (suggested order)

1. **Save schema bump**: `S.cargoLog.plants` slot already allocated per .7.1 → extend with `S.cargoLog.supplies` for porter's pal, `S.activeBuff`, `S.recipeQueue`, `S.ingredientStash` (or rename `sandalweedCount` to a generic ingredient stash if you want — likely don't, keep separate for stability). Bump SAVE_VERSION; add migration that initializes new slots empty.
2. **Populate [tlh/js/data/plants.js](js/data/plants.js)** with the 10 plant entries (sunflower deferred to .11). Leave lore strings empty — per [feedback_tlh_player_copy.md], the user authors plant lore, NPC dialogue, and meal names; agent wires structure only.
3. **Add INGREDIENTS layer** (or extend PLANTS) for porter's pal as the non-plant entry with `kind: 'plant' | 'supply'` discriminator.
4. **New `js/cooking.js` module**: `TRIGGERS` + `CONDITIONALS` dispatcher tables with the grace-modifier hooks into existing systems (boots, canteen, strain, trip, storm, scrip, scanner, fragile, gadget). Buff lifecycle (start, tick-down, expire, overwrite). Recipe queue logic (depth 2).
5. **Cook UI**: picker (2-slot, ingredient list from stash), queue surface, active-buff display. Lives in the cargo drawer "meals" sub-section.
6. **Sandalweed → gritgrass** display-rename pass — ~15-25 user-facing string sites. Internal IDs stay.
7. **Cargo log update**: plants section → ingredients section, hide-items filter rename, render porter's pal alongside plants.
8. **Depot signature-meal scaffolding**: 11 signature stubs (1 per non-pi NPC) — each stub is plant pair + empty slots for name and dialogue. User authors copy.
9. **Field cook canteen cost** hook (10-20% per cook). **Depot cook scrip cost** hook + auto-rebuy toggle.
10. **Recipe queue auto-cook** when current buff expires.
11. **`notePlantFound` / `notePlantCookedRole` hooks** (already at [tlh/js/render/cargo-log.js](js/render/cargo-log.js)) start firing on first cook events.
12. **UI reinforcement per workshop:**
    - `scrip_grace`: per-delivery log line at delivery hook.
    - `scanner_grace`: scanner cooldown UI surfaces the 2× rate (fire animation or timer).
    - `gadget_grace`: battery bar tint (`░` → `▒` trailing segs) + always-visible side drain readout + tooltip annotation row. Full spec in the `gadget_grace UI spec` section above.
13. **Sim harness pass** with cooking enabled — confirm meals don't break existing balance assumptions.

---

## things NOT to touch (scope creep guards)

- **Sandalweed boot-lash mechanic** — keep working as-is. Cooking is the SECOND consumer of the sandalweed stash. The lash + smoke mechanics remain.
- **Smoke-sandalweed (manual rest replacement)** — user has flagged this for likely removal before 1.0 ("it was kind of a test for the cooking system"). Don't proactively remove — wait for explicit go-ahead. If kept, it'll eventually be an alternative-spend axis on the sandalweed stash alongside cooking.
- **Trust profile system** — fully shelved. Don't reinvent NPC-specific trust gain.
- **NPC outbound dispatch system** — `outbound_grace` was cut. Don't add a new plant slot for it without conversation.
- **Topo-map visual stamps** — if adding new mesa visuals, MUST use the `NAT_MESAS` smoothstep pattern in [topo-map.js](js/data/topo-map.js), not hand-coded coordinates ("easy to mess up — match how our heightmap does elevation for them").
- **Ring/interior speed bonus plants** — considered, cut. Don't reintroduce.
- **Same-plant cook reveals both halves** — confirmed allowed; discoverable through play. Don't gate by requiring distinct plants.

---

## verification expectations

- All 11 ingredient cards (10 plants + porter's pal) render correctly in the cargo log with the right reveal states.
- Cooking a plant in trigger slot → reveals only that plant's trigger; conditional slot → reveals only conditional. Both halves at once if same plant in both slots.
- Buff window (~850 ticks) ticks down visibly; overwrite when new cook happens.
- Field cook consumes correct canteen %; depot cook charges small scrip fee; auto-rebuy toggle fires next-in-queue cook on buff expiry.
- Recipe queue (depth 2) auto-cooks when current buff expires + ingredients + water present.
- Porter's pal RNG roll picks from the full 10-plant set; no exclusions.
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
2. All design open-items closed (workshop landed 2026-05-13). Only outstanding pre-impl deliverable: `gadget_grace` UI mockup before cheatsheet step 12.
3. Set up a fresh worktree if you want isolation, or work on this one.
4. Start with save schema + plant data populate + ingredients layer (steps 1-3 above), get something rendering in the cargo log.
5. Then conditionals dispatcher + buff lifecycle (step 4).
6. Then UI (steps 5-8).
7. Land iteratively — each commit shouldable, kitchen patch likely splits into 4-6 commits over .8.0 → .8.4 or so.

You should be productive within an hour of reading this. If you find yourself reinventing decisions already settled here, stop and ask.
