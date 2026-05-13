# the long haul — v0.0.9.8 kitchen handoff

_Standalone briefing for a fresh agent picking up the cooking system implementation. Self-contained — does not require reading the full TLH-HANDOFF.md to start, but cross-references it for deep dives._

_Written 2026-05-03 after v0.0.9.7.10 shipped; updated through 2026-05-13 (workshop + pre-impl walkthrough). Latest live version is v0.0.9.7.13._

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

- **Two-plant combo cook.** One trigger slot + one conditional slot. Two distinct ingredients required — no doubling the same plant in both slots.
- **Reveal contract** (per .7.1 cargo log spec): each plant has fixed `trigger` + `conditional` properties; cooking reveals only the role the plant played in the dish. Two plays per plant for full codex completion.
- **No pair gating, no special-case combos.** Plant A's trigger pairs with Plant B's conditional with no lookup table. The plant card is the contract. Variety lives in the cross product. Balance lives at the trigger and conditional level individually, not in pairings.
- **Buff duration**: ~850 ticks (≈5 min real-time at TICK_MS=350). Tunable in 750–900 band.
- **Buff lifecycle**: overwrite — new cook replaces current buff. No stacking, no FIFO queueing of buffs.
- **Cooking flow**: manual cook by default + optional auto-cook toggle with 3-slot drag-orderable rotation (per locked decision #4). Rotation recipes are composed via the picker (revealed plants from the codex), not by cooking. See `meals UI spec` section for the full shape.
- **Field cook**: anywhere not at an NPC. Picker UI for any 2 distinct ingredients from stash. Costs 10–20% canteen per cook (tunable).
- **Depot cook**: at an NPC. Two sub-modes (per locked decision #5): (a) cook your own 2 ingredients in the NPC's kitchen — free (no canteen, no scrip); (b) eat the NPC's **authored signature meal** (designer-curated plant pair using their ingredients) — small scrip cost. Manual purchase only, no auto-buy. Doubles as a plant-discovery vector via the reveal contract.
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

**State predicates (7)** — conditional active while predicate holds:

| Tag | Active when |
|---|---|
| `boots_warn` | boots at warn/crit durability |
| `canteen_low` | canteen under 25% |
| `in_storm` | currently in a storm cell |
| `strain_high` | strain ≥ 0.7 (sim-tunable; widen to ≥0.5 if uptime feels low) |
| `on_difficult_terrain` | currently on river OR rockyHills OR plateau OR mountain cell (unified per mutual-exclusion design rule — see decisions locked) |
| `on_low_battery` | battery <25% |
| `on_fragile_carried` | any fragile pkg in inventory |

**Event sub-windows (2)** — conditional on for ~200 ticks after each event fire; refresh on re-fire:

| Tag | Fires on | Window |
|---|---|---|
| `on_pickup` | pkg picked up | 200 ticks |
| `on_terrain_enter` | crossed into new terrain type | 200 ticks |

**Cuts** from earlier drafts (do NOT add these back without conversation):

- `on_trip` — strain integration absorbed direct trip-chance modification
- `on_rest` — rest mechanic dropped from cooking design space (vestigial)
- `exhausted` — replaced by more specific state predicates
- `on_dawn` / `on_daylight` — daylight cycle cut from .8 entirely with sunflower deferred to .11
- `on_delivery` — cut as a bad conditional candidate; surfaces too infrequently to land felt rewards reliably. `on_terrain_enter` (stonesong's anchor) has a similar concern and may need rework if it lands soft in playtest — flagged but in scope for .8
- `on_rocky_terrain` / `on_plateau_or_mountain` — merged into `on_difficult_terrain` per mutual-exclusion design rule (was creating broken cross-pairings between clayroot and cliffhanger); cliffhanger cut as collateral, slot vacuum to be filled by a .11+ plant

---

## conditional vocabulary

| Tag | Grace effect | Notes |
|---|---|---|
| `boot_grace` | −40% boot degradation | matches smoke-sandalweed precedent (~25% active) but stronger since meal has resource cost |
| `canteen_grace` | drink cost −50% canteen during buff | stacks ×0.5 with `efficientConsumption` upgrade (×0.30 combined); magnitude tunable later if sim shows imbalance |
| `strain_grace` | −50% strain accrual | does NOT cover trip mitigation (tie-down handles that for free); value is delaying strain-cap → trip cycle |
| `terrain_grace` | −50% trip mult on all difficult terrain (river + rockyHills + plateau + mountain) | clayroot — unified per mutual-exclusion rule (terrain_grace_alpine collapsed in here; cliffhanger cut). Magnitude tunable if broader coverage proves over-strong |
| `storm_grace` | −50% storm trip-mult contribution (downpour 1.50→1.25, rain 1.25→1.125, drizzle 1.10→1.05) | doesn't touch canteen-refill side of storms |
| `scrip_grace` | +25% scrip per delivery | felt-attribution via per-delivery log line (`"rustveil bonus: +Nc"`) — confirmed per workshop 2026-05-13 |
| `scanner_grace` | scanner cooldown halved during conditional window (fires 2× as often) | reframed from magnitude-doubled per workshop 2026-05-13 — "thing happened again" is the legible felt signal |
| `gadget_grace` | −25% battery drain across all consumers | UI fully spec'd — see `gadget_grace UI spec` section below |
| `fragile_grace` | halves fragile hit rate during severe trips (mountain 100%→50%, river 100%→50%, rockyHills 50%→25%) | NEW — earned its slot via novel system reach (pkg modifier system); stacks with ceramicWrap |
| `wild_grace` | at activation, RNG-selects one of the 9 non-wild conditionals (boot, canteen, strain, terrain, storm, scrip, scanner, gadget, fragile); visible in buff display ("rolled X this time") | porter's pal only — every cook unique; **no cargo-log reveal** of the rolled plant's effect (porter's pal is its own ephemeral entry); full plant pool eligible |

**Cuts** from earlier drafts:

- `trip_grace` — strain integration absorbed it; redundant
- `trust_grace` — "more numbers, more often" wasn't doing real design work
- `stamina_grace` — no plant earned the slot; sunflower (originally proposed here, then repositioned through battery_grace) deferred to .11
- `outbound_grace` (NPC dispatch chance) — felt moment too thin without UI surface to reinforce. Revisit if outbound system gets more visual weight.
- `terrain_grace_alpine` — collapsed into unified `terrain_grace` per mutual-exclusion design rule. The clayroot↔cliffhanger cross-pairing was strictly broken (trigger and conditional terrain domains never overlap). Cliffhanger cut as collateral; slot to be filled by a .11+ plant.

---

## the 10-ingredient roster (locked)

| # | Ingredient | NPC anchor / biome | Trigger | Conditional |
|---|---|---|---|---|
| 1 | **gritgrass** | rho — ring/desert (renames sandalweed display, internal IDs stable per .9.5 precedent) | `boots_warn` | `boot_grace` |
| 2 | **pebblewort** | iota / nu / delta — wetland/river | `canteen_low` | `canteen_grace` |
| 3 | **clayroot** | theta — clay banks (now covers all difficult terrain post-cliffhanger collapse) | `on_difficult_terrain` | `terrain_grace` (all difficult terrain) |
| 4 | **rustveil** | xi — city ruins (lore: *"smelling faintly of wet pennies"* maps to scrip flavor) | `on_pickup` | `scrip_grace` |
| 5 | **windscald** | phi — weather station / windswept plateau | `in_storm` | `storm_grace` |
| 6 | **stone rasp** | gamma — workshop scrub | `strain_high` | `strain_grace` |
| 7 | **stonesong** | lambda — climbing slope (lore: *"amplifies the sound of the wind"* = scanner amplification) | `on_terrain_enter` | `scanner_grace` |
| 8 | **riverknot** | delta — reservoir banks (delta runs power infrastructure → gadget-themed) | `on_low_battery` | `gadget_grace` |
| 9 | **claybloom** | theta — kiln (ceramic-glaze plant; *"petals feel cool and smooth to the touch"*) | `on_fragile_carried` | `fragile_grace` |
| 10 | **porter's pal** | xi — city ruins (NON-PLANT: pre-collapse preserved meal, archaeology drop at ruins cells) | random (rolls 1 of 9 plant triggers per cook) | `wild_grace` |

### special notes per ingredient

**Sandalweed → gritgrass display rename**: existing in-game sandalweed (boot-lash plant, kit-bar badge per [tlh/js/boots.js:198](js/boots.js:198)) gets renamed at the **display layer only** — internal `S.sandalweedCount`, `sandalEfficiency` upgrade ID, `sandalCap()`, etc. stay stable. No save migration. ~15-25 user-facing string sites to touch. Precedent: v0.0.9.5 rename pass ("pack mule rig → molly netting" etc.) per [TLH-HANDOFF.md:18](TLH-HANDOFF.md:18).

**Porter's pal**: ingredient (not plant), spawns at ruins cells, rarer than plants, same stash cap (~5). Treated as a normal ingredient — occupies one slot, paired with a different ingredient in the other slot (no doubling, no porter's-pal-in-both-slots). At cook time RNG independently rolls per slot: trigger slot fires one of the 9 plant triggers (rolled randomly); conditional slot fires `wild_grace`, which rolls one of the 9 non-wild conditionals. **No cargo-log reveal** — the rolled plant's effect is not added to the codex; porter's pal is its own ephemeral entry. Every cook is unique. No wild-pool exclusions — full plant set eligible per roll.

**Sunflower**: cut from .8 per workshop 2026-05-13. Will be reintroduced in v0.0.9.11 as one of the new heat plants. `on_daylight` trigger and `battery_grace` conditional were sunflower-only and are removed from .8 vocab entirely.

**Cliffhanger**: cut from .8 per pre-impl walkthrough 2026-05-13. Was anchored to lambda as the alpine half of the terrain_grace split, but its trigger (`on_plateau_or_mountain`) and clayroot's conditional (`terrain_grace`) had mutually-exclusive terrain domains — the clayroot↔cliffhanger cross-pairings were strictly broken (active but unable to fire). Resolution: collapse `terrain_grace_alpine` into a unified `terrain_grace` covering all difficult terrain (clayroot keeps the conditional, trigger renamed to `on_difficult_terrain`). Cliffhanger slot vacuum to be filled by a future plant — likely in .11+ heat/cold/drift expansion. Lambda still has stonesong as an anchor.

---

## NPC depot signatures (authored)

Designer-curated combos, not coverage-driven. Each NPC's signature is one fixed plant pair that produces a named meal when cooked at that NPC. Pi (cold summit) defers to v0.0.9.11 cold plants — no signature in .8.

When .11 ships heat plants (including reintroduced sunflower), **audit signatures** for any heat-themed dependency and update affected recipes if needed.

Authoring split per [feedback_tlh_player_copy.md]: agent wires 10 signature stubs (1 per non-pi non-psi NPC — plant pair + empty name/dialogue slots) as part of the .8 patch; user fills in meal names and NPC dialogue. Signatures will largely be mixes of local plants — work through each NPC together when we get there. Pi defers to .11 cold plants; psi defers until .11/heat/cold/drift introduces a plant that can anchor it (sunflower cut left psi without an anchor).

---

## existing-system findings (from .7.8 audit) — relevant for impl

- **No passive canteen drain.** Canteen only changes via `drinkWater` (consumed) and various refills (rain, wetland, storm burst, reservoir tank). `canteen_grace` reframed to drink-efficiency modifier (per locked decision #1) — hooks at the `drinkWater` consumption point, not a passive drain rate.
- **Stamina drain is constants-driven** at `C.STAMINA_DRAIN = 0.40`/tick — single hook in [tlh/js/main.js:352](js/main.js:352). Easy modifier surface.
- **`DRINK_MIN_LOSS_PCT` and `DRINK_EFFICIENT_MULT`** already in [tlh/js/constants.js](js/constants.js) (.7.8 cleanup). Confirmed: `DRINK_MIN_LOSS_PCT = 0.05` is a *gate* on when drinking is allowed (canteen ≥ 5%, stamina ≤ 95%), NOT a per-drink cost floor. `canteen_grace` × `DRINK_EFFICIENT_MULT` stacks cleanly to ×0.30 with no floor interference — headroom verified.
- **Trust profile system fully shelved** (per v0.0.9.6.10.17). `computeTrustGain` at [tlh/js/trust.js:107-110](js/trust.js:107) is `1 + floor(slots/2) + (lost ? 1 : 0)`. Cooking-time trust modifiers (if revived) plug in here.
- **Fragile mechanics are alive** (post-.7.8 fragile-first damage selection). `fragile_grace` slots cleanly as a third mitigation alongside ceramicWrap one-absorb and tie-down trip-absorb.
- **Cargo log plants section + persistence** already wired in .7.1. Hooks `notePlantFound(id)` / `notePlantCookedRole(id, role)` at [tlh/js/render/cargo-log.js](js/render/cargo-log.js) waiting.

---

## decisions locked

Resolved across walkthroughs on 2026-05-12 and 2026-05-13. Impl can proceed against the full list.

1. **`canteen_grace` = drink efficiency.** Drinks cost 50% less canteen during buff. Stacks multiplicatively with `efficientConsumption` upgrade (×0.60 × ×0.50 = ×0.30 combined). Magnitude tunable later if sim shows imbalance.
2. **Magnitudes authored per-plant.** Each conditional's magnitude lives in the vocabulary table and is authored per-plant from the start. An earlier draft proposed flat state −40% / event −50% defaults; in practice every conditional overrides that default, so the "flat split" framing was dropped. State-vs-event distinction stays as a soft heuristic for future plants (state = longer uptime / weaker per-tick; event = briefer windows / stronger) but is not an active rule on the .8 vocab.
3. **Cook UI = cargo drawer.** Cooking lives in a new "meals" sub-section of the cargo drawer. Drawer has the screen real estate to communicate effects clearly.
4. **Cooking flow = manual default + auto-cook toggle + 3-slot rotation.** Manual mode (default): player picks 2 distinct ingredients each cook via the picker. Auto-cook toggle (per-save state, hidden when rotation is empty): on buff expiry, walks the rotation pointer through saved slots; fires the first slot whose ingredients are available and advances. If no slot has ingredients, skips quietly. Rotation cap is 3 saved recipes, drag-to-reorder for priority. Recipes are composed via the picker (revealed plants only — no need to actually cook to save). Manual cook while auto-cook is on takes precedence and does not advance the pointer. See `meals UI spec` section for the full shape.
5. **Cooking economics = three modes.** **Field cook** (anywhere not at an NPC): your stash ingredients, costs 10–20% canteen. **Depot cook with own ingredients** (at an NPC): your stash ingredients, free — the NPC's kitchen is hospitable space, no canteen, no scrip. **Depot signature** (at an NPC): NPC's ingredients (player doesn't need to own them), small scrip cost (~10c, tunable). Signature meals are manual purchase only — never part of auto-cook rotation. The earlier "auto-rebuy toggle" idea is dropped; the earlier t40 free-gate placeholder is also dropped. Signature meals double as a plant-discovery vector via the reveal contract (eating xi's `rustveil + clayroot` reveals both plants' roles).
6. **`strain_high` cutoff = 0.7.** Active ~30% of the time. Widen to 0.5 if sim shows under-firing.
7. **Weak-felt conditionals resolved (workshop 2026-05-13):**
   - **`scrip_grace` (rustveil):** keep +25% per delivery; surface via per-delivery log line `"rustveil bonus: +Nc"`.
   - **`scanner_grace` (stonesong):** reframed — scanner cooldown halved during conditional window (fires 2× as often), not magnitude doubled. Felt signal is "thing happened again."
   - **`gadget_grace` (riverknot):** keep −25% drain; UI spec landed (trailing-seg tint + side drain readout + tooltip annotation + trigger-fire log line) — see `gadget_grace UI spec` section.
   - All three plants retained; roster stays at 11.
8. **Sunflower + cliffhanger both cut from .8.** Sunflower deferred to v0.0.9.11 as a heat plant (`on_daylight` trigger and `battery_grace` conditional removed from .8 vocab, both were sunflower-only). Cliffhanger cut to resolve the mutual-exclusion break with clayroot (see #10 below) — `on_plateau_or_mountain` trigger collapsed into `on_difficult_terrain`, `terrain_grace_alpine` collapsed into a unified `terrain_grace`. Both cuts produce slot vacuums for .11+ plants to fill. Psi (greenhouse NPC) is left without a plant anchor for its signature recipe; left as-is — .11 heat / cold / drift expansions will introduce new plants that can anchor psi when they arrive. Psi defers alongside pi in .8 — agent authors 10 signature stubs (12 NPCs minus pi minus psi). Lambda still has stonesong as its anchor after cliffhanger's cut, so lambda's signature is unaffected.
9. **Porter's pal wild-pool exclusions dropped.** Wild pool spans the full conditional vocabulary (9 non-wild graces post-sunflower and -cliffhanger).
10. **Mutual-exclusion design rule.** Two plants whose triggers and conditionals can never co-occur in the same game state produce strictly-broken cross-pairings (trigger fires, conditional active, but the conditional's effect cannot land because its required context is excluded by the trigger's context). Resolution: **collapse the conflicting conditionals into one unified conditional covering both contexts; let trigger variety carry the design split.** The displaced plant goes into the cuts pile (or defers to a future patch where its slot can be re-filled). Applied in .8 to terrain pairings — `terrain_grace_alpine` collapsed into a unified `terrain_grace` covering all difficult terrain; cliffhanger cut (slot vacuum to be filled in .11+). **Expect to apply this rule when .11+ ships heat/cold pairings** — a `heat_grace` and `cold_grace` would create the same problem (heat trigger + cold grace never co-occurs). Use a single `temperature_grace` (or similar) that handles both extremes via trigger split. General heuristic: if you can't have plant A's trigger and plant B's conditional active at the same time *in any game state*, the cross-pair is broken — collapse.

## still open before impl

_None. All workshop deliverables landed; see `meals UI spec` + `gadget_grace UI spec` sections below._

---

## meals UI spec (cooking flow)

Locks the cargo-drawer "meals" sub-section that houses cooking. Covers manual cook, auto-cook + rotation, and the at-NPC signature-meal panel.

### UI shape

```
┌─ MEALS ─────────────────────────────────┐
│  ACTIVE: rustveil + clayroot            │
│  [████░░░░░░░░░░] 3:24                  │
│                                          │
│  auto-cook  [● ON ]                     │
│  rotation:                               │
│    ≡  1. rustveil + clayroot      [×]   │
│    ≡  2. gritgrass + windscald    [×]   │
│       [+ add recipe]                    │
│                                          │
│  ─────────────────────────────────────  │
│  COOK NOW                                │
│  [pick 2 ingredients…]   cost: 15%      │
│                                          │
│  ─────────────────────────────────────  │
│  AT XI                                   │
│  signature: [unnamed]                    │
│    rustveil + clayroot                   │
│    [eat for 10c]                         │
└──────────────────────────────────────────┘
```

### components

1. **Active buff display** — current meal name + countdown bar. Hidden when no buff is active.
2. **Auto-cook toggle** — per-save state, persists across sessions. **Hidden when rotation is empty** (toggle has nothing to fire).
3. **Rotation list** — 0–3 saved recipes. Each slot shows recipe + drag handle + remove button. Drag-to-reorder shuffles priority (slot 1 = highest-priority next-up). After 3 slots are filled, the `+ add recipe` affordance hides until a slot is removed.
4. **Add-recipe picker** — opens the 2-ingredient picker, but the confirm action is "save to slot" rather than "cook now." **Shows revealed plants only** (codex-known); unrevealed plants are not pickable for rotation slots — discover via cook-now or signature meal first, then save to rotation.
5. **Cook-now picker** — any 2 *distinct* ingredients from stash, revealed or not. Blocks same-ingredient pairings at pick time. Cost label is dynamic: `cost: N%` (with canteen glyph) in field, `cost: free` at NPC.
6. **Signature panel** (conditional, only when at an NPC) — NPC's authored signature recipe (plant pair + meal name + scrip cost). One-click `[eat for Nc]` button. Manual only — never auto-fires. Eating it consumes scrip and starts a buff (replaces current buff per overwrite rule).

### behavior

**Manual mode** (auto-cook OFF, or rotation empty):
- Player picks 2 ingredients via cook-now picker, or buys NPC signature. Buff starts. Expires after ~850 ticks.
- On expiry: nothing auto-fires. Player cooks again when ready.

**Auto-cook mode** (auto-cook ON, rotation has ≥1 slot):
- On buff expiry: walk rotation pointer starting at current slot.
- For each slot, check ingredients available + cost affordable (canteen in field, free at NPC). If yes, cook. Advance pointer.
- If no slot satisfies, skip quietly this cycle. Pointer stays. Retries on next expiry.
- Manual cook during auto-cook takes precedence — replaces current buff, pointer does NOT advance.

**Recipe save flow:**
- Click `[+ add recipe]`. Picker opens with revealed plants only. Pick 2 distinct ingredients. Confirm. Slot fills.
- To change order: drag the `≡` handle. To remove: click `[×]`.
- To edit: remove and re-add (no in-place edit — keeps the UI surface minimal).

**At-NPC behavior:**
- Cook-now cost label flips from `cost: N%` to `cost: free` (using NPC's kitchen).
- Signature panel appears as a separate section with NPC's authored meal + scrip cost.
- Signature is manual-only; eating it reveals both plants' roles in the cargo log per the reveal contract (a discovery vector for plants the player hasn't foraged yet).
- Porter's pal in a signature pair: works as expected (random roll on the signature's porter's-pal slot), but the NPC's signature shouldn't include porter's pal in both slots (no-doubling rule applies to authored signatures too).

### what's explicitly NOT in this spec

- Depth-2 fixed queue (replaced by rotation + auto-cook toggle — earlier draft rejected for not supporting "set it and forget it" idle play).
- Save-via-cook (replaced by picker-based save — you don't need to consume ingredients to save a recipe).
- Signature meal auto-buy / "auto-rebuy" toggle (dropped — signatures are explicit purchases).
- Same-plant cooks (disallowed per locked design decisions — two distinct ingredients required, no doubling).
- In-place rotation slot editing (remove + re-add only — kept UI surface minimum).

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

1. **Save schema bump**: `S.cargoLog.plants` slot already allocated per .7.1 → extend with `S.cargoLog.supplies` for porter's pal, `S.activeBuff`, `S.recipeRotation` (3-slot array + pointer index + auto-cook bool), `S.ingredientStash` (keep separate from `sandalweedCount` for stability). Bump SAVE_VERSION; add migration that initializes new slots empty.
2. **Populate [tlh/js/data/plants.js](js/data/plants.js)** with the 9 plant entries (sunflower + cliffhanger deferred to .11+). Leave lore strings empty — per [feedback_tlh_player_copy.md], the user authors plant lore, NPC dialogue, and meal names; agent wires structure only.
3. **Add INGREDIENTS layer** (or extend PLANTS) for porter's pal as the non-plant entry with `kind: 'plant' | 'supply'` discriminator.
4. **New `js/cooking.js` module**: `TRIGGERS` + `CONDITIONALS` dispatcher tables with the grace-modifier hooks into existing systems (boots, canteen, strain, trip, storm, scrip, scanner, fragile, gadget). Buff lifecycle (start, tick-down, expire, overwrite). Rotation logic (3-slot, pointer-walked auto-cook).
5. **Cook UI**: picker (2-slot, blocks same-ingredient pairings; cook-now shows full stash, add-recipe shows revealed plants only), auto-cook toggle, rotation list with drag-to-reorder + remove, active-buff display, at-NPC signature panel. Lives in the cargo drawer "meals" sub-section — see `meals UI spec` section.
6. **Sandalweed → gritgrass** display-rename pass — ~15-25 user-facing string sites. Internal IDs stay.
7. **Cargo log update**: plants section → ingredients section, hide-items filter rename, render porter's pal alongside plants.
8. **Depot signature-meal scaffolding**: 10 signature stubs (non-pi, non-psi NPCs) — each stub is plant pair + empty slots for name and dialogue. User authors copy. Pi defers to .11; psi defers until heat/cold/drift introduces an anchor plant.
9. **Cook-cost dispatcher**: field cook = 10–20% canteen; depot cook with own ingredients = free; depot signature = small scrip cost. Cost source-aware (location-dependent).
10. **Auto-cook + rotation** on buff expiry — walk 3-slot rotation pointer, pick first slot with available ingredients, advance. Skip quietly if none available. Manual cook takes precedence and does NOT advance pointer.
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
- **Two distinct ingredients required** — same-plant cooking is disallowed (reversed from an earlier draft). Codex completion requires cooking a plant with ≥2 distinct partners across its cooking life. Picker must block same-ingredient pairings at pick time.

---

## verification expectations

- All 10 ingredient cards (9 plants + porter's pal) render correctly in the cargo log with the right reveal states.
- Cooking a plant in trigger slot → reveals only that plant's trigger; conditional slot → reveals only conditional. Codex completion requires ≥2 distinct partners across a plant's cooking life. Picker blocks same-ingredient pairings.
- Buff window (~850 ticks) ticks down visibly; overwrite when new cook happens.
- Field cook (anywhere not at NPC) consumes 10–20% canteen. Depot cook with own ingredients (at NPC) is free. Depot signature (at NPC, NPC's ingredients) costs scrip — manual only.
- Auto-cook + rotation: on buff expiry, pointer walks the 3-slot rotation; fires first slot with available ingredients; skips quietly if none. Manual cook does not advance pointer.
- Porter's pal RNG roll picks from the full 9-plant set per slot (independent rolls); no exclusions; no cargo-log reveal of the rolled plant; cannot pair with another porter's pal in the same cook.
- Each grace effect actually fires on its trigger and modifies the right system. Test in-browser with eval if needed.
- No regressions: sandalweed boot-lash still works, save load/save round-trips work, multiplayer doesn't break.
- Browser preview (start with `preview_start tlh-static`, port pinned in [.claude/launch.json](.claude/launch.json) — note: each worktree uses its own port, default in this worktree is 8750; check before assuming).

---

## branch + version conventions

- Subtitle in [tlh/the-long-haul.html](the-long-haul.html) is updated per patch via [tlh/scripts/bump-version.sh](scripts/bump-version.sh) (cache-bust strings) **plus a manual subtitle edit** (the script's parser doesn't handle the `.7.X` collapsed format and warns).
- `.7.13` is the current live version. Next is **`.8.0`** (the kitchen). Or `.8.1` if you sub-divide.
- Cache-bust format: `XYZ-N-M` → game version `0.0.<X>.<Y>.<Z>.<N>.<M>` collapsed where leading zeros allow. `097-0-13` = v0.0.9.7.13. For .8.0, bump to `098-0-0` (the script handles the parse).
- Each commit message: `tlh v<version> — <description>`. Co-author footer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## resume cheatsheet

1. Read this doc + scan [TLH-1.0.md](TLH-1.0.md) (180 lines, fast).
2. All design open-items closed (workshop 2026-05-13 + pre-impl walkthrough 2026-05-13). Both UI specs landed: `meals UI spec` (cooking flow) and `gadget_grace UI spec` (HUD treatment).
3. Set up a fresh worktree if you want isolation, or work on this one.
4. Start with save schema + plant data populate + ingredients layer (steps 1-3 above), get something rendering in the cargo log.
5. Then conditionals dispatcher + buff lifecycle (step 4).
6. Then UI (steps 5-8).
7. Land iteratively — each commit shouldable, kitchen patch likely splits into 4-6 commits over .8.0 → .8.4 or so.

You should be productive within an hour of reading this. If you find yourself reinventing decisions already settled here, stop and ask.
