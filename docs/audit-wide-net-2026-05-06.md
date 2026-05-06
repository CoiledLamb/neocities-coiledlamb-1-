# TLH wide-net audit — 2026-05-06

Scope: `tlh/the-long-haul.html`, `tlh/tlh-boot.js`, `tlh/the-long-haul.css`, `tlh/js/**/*.js` (incl. `data/` and `render/`).
Out of scope (per request): `tlh/worker/` (audited separately), all `tlh/tlh-*-mockup.html`, `tlh/.handoff-topo/`, `tlh/favicon-mockups/`. Design docs (`tlh/TLH-*.md`, `HANDOFF.md`) are treated as *one signal*, not ground truth — discrepancies are flagged as questions.

Three Explore agents ran in parallel (half-coded/dead, inconsistencies/drift, atomization/structure). Findings deduped, cross-referenced, and spot-checked. Where an agent over-flagged, I've marked it under §6.

---

## Headline findings (sorted by visibility/impact)

1. **Boot screen shows `v0.9.29` while game is `v0.0.9.7.11`** — visible to every player on startup. [tlh/tlh-boot.js:432](tlh/tlh-boot.js:432) hardcodes the banner; not wired to the bump-version cycle.
2. **`S.inRiver` is a fully abandoned stub** — declared at [tlh/js/state.js:64](tlh/js/state.js:64), never written, gates an unreachable canteen-refill branch at [tlh/js/main.js:385](tlh/js/main.js:385). Not in save schema. Either delete or actually wire river canteen behavior.
3. **`STRAIN_CRIT_THRESHOLD = 0.85` is hardcoded in ≥8 places** — strain-tip, stamina, trip, channels, trail, terrain. Single point of balance editing is not currently single-point.
4. **`render/route-map.js` is 1478 lines and owns gameplay state** (`currentSegment` lives in `S._transient` but is mutated through this render module). Largest atomization concern in the audit.
5. **`render/hud.js` ↔ `upgrades.js` form a hard circular dependency** — currently safe (function-body calls only), but fragile under any refactor.
6. **Cache-buster format `?v=097-0-11` doesn't match subtitle `v0.0.9.7.11`** — two formats for the same version. Cosmetic but trips audits.
7. **`microphones` in pi's ambient dialogue** — modern earth tech named directly, against the "render by appearance" rule. [tlh/js/data/npc-lines.js:196](tlh/js/data/npc-lines.js:196).
8. **Internal `tripChance` / `TRIP_*` naming still pervasive** — user-facing copy is clean ("strain"), internal identifiers still legacy. Memory already flagged this as deferred; reconfirming scope.

---

## 1. Half-coded features

### Real

- **`S.inRiver` abandoned stub** — [tlh/js/state.js:64](tlh/js/state.js:64) `inRiver: false, // stub for future river mechanic`. Field is read once at [tlh/js/main.js:385](tlh/js/main.js:385) (`else if (!onInterior && S.inRiver) S.canteen = ...`) but never written anywhere. The branch that grants canteen on river terrain is dead. Not serialized in `persistence.js` either, so save/load preserves the always-false default. Pick one: wire river canteen, or delete the field + the branch.
- **`_transient.depotRestPending` vestigial** — [tlh/js/trust.js:297](tlh/js/trust.js:297) has explicit comment: `// _transient.depotRestPending vestigial, no longer written`. Slot persists in transient state but is never written/read in current flow (v0.0.9.5.4 changed rest to auto-apply). Safe but lingering.

### Likely intentional placeholders (not actually half-coded)

- **Settlement rebuild WIP bar** — [tlh/js/render/settlements.js:115](tlh/js/render/settlements.js:115) renders `<div class="settle-bar settle-bar-wip">` with reduced-opacity styling at [tlh/the-long-haul.css:1872](tlh/the-long-haul.css:1872) (`opacity: 0.45`). The grayed-out treatment + `wip` class name reads as deliberate placeholder, not abandoned code. Worth confirming the design intent matches.
- **Cargo button placeholder slot** — [tlh/the-long-haul.html:113](tlh/the-long-haul.html:113) has `<button class="boots-auto placeholder" id="cargoBtnPlaceholder" aria-hidden="true" disabled>—</button>`, hidden by CSS unless parent has `.grid2x2`. Looks like a reserved future slot, not abandoned UI.

### Genuinely empty categories

- No TODO / FIXME / HACK / XXX markers in scope (only one `WIP` class name on the settlement bar).
- No commented-out code blocks.
- No stub functions returning `null` / `// TODO` / `throw "not impl"`.
- No dead exports identified in scope (cross-module imports are dense; everything exported gets used).

---

## 2. Inconsistencies

### 2a. Version sync (highest priority)

| Surface | File:line | Value |
|---|---|---|
| HTML subtitle | [tlh/the-long-haul.html:46](tlh/the-long-haul.html:46) | `v0.0.9.7.11` ✓ |
| CSS cache-bust | [tlh/the-long-haul.html:29](tlh/the-long-haul.html:29) | `?v=097-0-11` ✓ (different format) |
| boot.js cache-bust | [tlh/the-long-haul.html:269](tlh/the-long-haul.html:269) | `?v=097-0-11` ✓ |
| main.js cache-bust | [tlh/the-long-haul.html:270](tlh/the-long-haul.html:270) | `?v=097-0-11` ✓ |
| **Boot terminal banner** | **[tlh/tlh-boot.js:432](tlh/tlh-boot.js:432)** | **`v0.9.29`** ❌ |
| `SAVE_VERSION` | [tlh/js/constants.js:530](tlh/js/constants.js:530) | `9` (matches schema; orthogonal to game version) |

Two issues:
- The boot screen banner is **two minor versions stale** and not wired to any version-bump path. This is the only player-visible string that drifted.
- Cache-bust format (`097-0-11`) and subtitle format (`v0.0.9.7.11`) encode the same value differently. Tooling-friendly to unify, but no functional bug.

### 2b. Naming drift

- **tripChance → strain rename — partial.** Per [memory:project_tlh_trip_chance_language_audit.md], internal-code rename was deferred. Confirmed still partial:
  - User-facing copy: clean (`strain` everywhere player can see it).
  - Internal: function names still `tripChance()` / `tripChanceBreakdown()` ([tlh/js/trip.js:142-146](tlh/js/trip.js:142)). Constants `TRIP_CHANCE_BASE`, `TRIP_MULT_*` ([tlh/js/constants.js:6](tlh/js/constants.js:6), [tlh/js/constants.js:209](tlh/js/constants.js:209)). Comments reference `tripChance` in [tlh/js/state.js:21-29](tlh/js/state.js:21), [tlh/js/state.js:135](tlh/js/state.js:135), [tlh/js/stamina.js:48](tlh/js/stamina.js:48).
  - Status quo per memory is "deferred." Re-flagging only because the audit was wide-net.

- **`parcel` vs `package`** — exactly one stray: [tlh/js/data/packages.js:292](tlh/js/data/packages.js:292) uses label `'rag-tied parcel'`. Everything else uses "package" consistently. Rename or accept.

- **No drift on:** carrier vs courier (clean), settlement/depot/node (each is correct in its domain), destination/dest (`destId` everywhere, "destination" only in comments).

### 2c. State shape and save/load

Largely clean.

- `S.smokeGrace.{ticksRemaining, magnitude}` — schema, persistence, and access paths all match.
- `S._transient.severeTripState` — consistent across access paths.
- Inventory shape — `{ size, label, kg, slots, scrip, isLost, destId }` symmetrically saved and loaded, with v9 migration handling old `modifier` → `tags[]`.
- v6 → v9 migration chain in [tlh/js/persistence.js](tlh/js/persistence.js) is complete; load-side guards back-compat for v9 NPC profile field removal.

One small asymmetry:
- **`S.inRiver` declared in state schema but never serialized.** Loading any save will re-default it to `false` from `state.js`. Currently safe (field is never written), but technically inconsistent. Resolves itself if you delete the field per §1.

### 2d. Terminology rule violations

Cross-checked against memory rules ([feedback_tlh_gender_neutral.md], [feedback_tlh_precollapse_tech.md], [feedback_tlh_gear_placed_not_held.md], [project_tlh_shelter_tag_audit.md]).

**Real:**

- **`microphones`** — [tlh/js/data/npc-lines.js:196](tlh/js/data/npc-lines.js:196), pi's ambient: `'the summit wind interferes with the microphones. i adjust for it.'` Pi is a robot character; "microphones" names modern earth tech directly. Per the rule, should render by appearance (e.g., "sound-capture grilles," "the listening grilles"). Low severity, NPC flavor only.

**Needs your judgment (rule edge case):**

- **`auto-equipped` for spare boots** — [tlh/js/boots.js:81](tlh/js/boots.js:81): `'<span class="log-hi">boot clip</span>: spare pair auto-equipped'`. Boots are *worn*, not placed in the world overlay like anchors/ladders. The "no held/in-use" rule may not apply to footwear in the same way. Either (a) "equipped" is fine for boots specifically and the rule is gear-overlay-only, or (b) standardize on "swapped in" / "auto-deployed" / "fresh pair on" for consistency. Your call — this is a writing decision more than a code issue.
- Same pattern at [tlh/js/boots.js:205](tlh/js/boots.js:205), [tlh/js/boots.js:223](tlh/js/boots.js:223).
- Comment-only at [tlh/js/render/hud.js:224](tlh/js/render/hud.js:224): `'gun: bottom-right when gun equipped + not holstered'`. Comment says "equipped" but state field is correctly `holstered`. Comment-cosmetic.

**Already compliant:**

- NPC pronouns: only `'she'` reference in dialogue is at [tlh/js/data/npc-lines.js:129](tlh/js/data/npc-lines.js:129) for tau's dog — explicitly allowed by rule.
- Settlement tier mechanics: cosmetic-only, no gameplay gates on tier (verified across [tlh/js/state.js:247-267](tlh/js/state.js:247) and downstream). No drift from [project_tlh_shelter_tag_audit.md].
- Item labels: `barometer`, `rain gauge`, `hygrometer` in [tlh/js/data/packages.js:140-142](tlh/js/data/packages.js:140) are appearance-named instruments; rule explicitly exempts these. Settlement quote `'"barometers click in the wind"'` at [tlh/js/state.js:257](tlh/js/state.js:257) is also fine for the same reason.

### 2e. Magic-number drift

Same constant defined or hardcoded in multiple places. Top offenders:

| Value | Meaning | Where |
|---|---|---|
| **`0.85`** | strain crit threshold | [tlh/js/render/strain-tip.js:54](tlh/js/render/strain-tip.js:54), [tlh/js/render/strain-tip.js:58](tlh/js/render/strain-tip.js:58), [tlh/js/stamina.js:115](tlh/js/stamina.js:115), [tlh/js/trip.js:309](tlh/js/trip.js:309), [tlh/js/channels.js:51](tlh/js/channels.js:51), [tlh/js/trail.js:7](tlh/js/trail.js:7), [tlh/js/trail.js:19](tlh/js/trail.js:19), [tlh/js/trail.js:53](tlh/js/trail.js:53), [tlh/js/data/terrain.js:534](tlh/js/data/terrain.js:534), [tlh/js/data/terrain.js:544](tlh/js/data/terrain.js:544), [tlh/js/data/terrain.js:547](tlh/js/data/terrain.js:547) |
| **`1.5`** | various multipliers (recovery, interior, solar, downpour, ...) | [tlh/js/battery.js:147](tlh/js/battery.js:147), [tlh/js/constants.js:256](tlh/js/constants.js:256), [tlh/js/constants.js:274](tlh/js/constants.js:274), [tlh/js/constants.js:545](tlh/js/constants.js:545), [tlh/js/packages.js:95](tlh/js/packages.js:95), [tlh/js/upgrades.js:101](tlh/js/upgrades.js:101), [tlh/js/data/terrain.js:317](tlh/js/data/terrain.js:317), [tlh/js/data/terrain.js:328](tlh/js/data/terrain.js:328), [tlh/js/sim.js:568](tlh/js/sim.js:568), [tlh/js/render/sky.js:351](tlh/js/render/sky.js:351), [tlh/js/weather.js:547](tlh/js/weather.js:547), [tlh/js/data/topo-map.js:139](tlh/js/data/topo-map.js:139), [tlh/js/data/topo-map.js:269](tlh/js/data/topo-map.js:269) |
| **`1.4`** | risky-cell / encumbrance mult | named const in [tlh/js/constants.js:175](tlh/js/constants.js:175), [tlh/js/constants.js:192](tlh/js/constants.js:192) but hardcoded again at [tlh/js/trip.js:232](tlh/js/trip.js:232) |
| boot T1/T2 mults `0.75 / 0.50` | hardcoded | [tlh/js/main.js:368-369](tlh/js/main.js:368) — not in `constants.js` |
| trample milestones `0.25 / 0.50` | hardcoded array | [tlh/js/trail.js:53](tlh/js/trail.js:53) — not in `constants.js` |

Of these, **`0.85`** is the most concerning because it's a player-visible threshold (the strain crit boundary appears in tooltips, drives behavior across stamina/trail/terrain). Editing the threshold today requires touching 11 files. Lift to `STRAIN_CRIT_THRESHOLD` in `constants.js`. The `1.5` cluster is more diffuse (different semantic uses sharing a value); not all should consolidate, but the few that mean the same thing should.

---

## 3. Things that feel/look off

These aren't bugs and aren't strict rule violations — they're code smells worth a second look.

- **`render/route-map.js` owns segment state.** [tlh/js/render/route-map.js:49-62](tlh/js/render/route-map.js:49) defines `currentSegment` (with `from/to/type/edgeIdx/pathFn/length`). It's stored on `S._transient` but mutated through this render file. Any module that wants to know "what segment is the courier on?" must import a render module. Belongs in `state.js` or a dedicated position module, not buried in SVG rendering.
- **`render/sky.js` exports time-domain utilities.** [tlh/js/render/sky.js](tlh/js/render/sky.js) exports `TICKS_PER_DAY` and `daylightOf(tick)`, used by `battery.js`, `stamina-tip.js`, `strain-tip.js` for daily-cycle math. These are time/lighting calculations, not rendering. Splitting into `js/time.js` (constants + math) and `render/sky.js` (SVG) would let non-render code import without dragging the render module.
- **`render/hud.js` ↔ `upgrades.js` circular import.** [tlh/js/render/hud.js:88](tlh/js/render/hud.js:88) calls `Upg.renderUpgrades()`; `upgrades.js` reciprocally calls `updateHUD` and `renderCargoSlots`. Calls are inside function bodies, so module load doesn't deadlock — but the cycle means refactoring either side requires updating both. No third party can call `updateHUD` without knowing it'll re-enter upgrades rendering.
- **Data files with logic crept in:**
  - [tlh/js/data/cargo-index.js](tlh/js/data/cargo-index.js) exports `buildCargoIndex()` — a builder, not data.
  - [tlh/js/data/glyphs.js](tlh/js/data/glyphs.js) exports `statusColor()` — a function, surrounded by const data.
  - [tlh/js/data/terrain.js](tlh/js/data/terrain.js) has `terrainAt()`, `mesaOutcropAt()`, `desertStaminaMult()` — spatial classifiers mixed with constants.
  - [tlh/js/data/topo-map.js](tlh/js/data/topo-map.js) is a procedural noise/height-map *generator* (~120 lines of generation primitives), not a data file.
  - [tlh/js/data/upgrades.js](tlh/js/data/upgrades.js) defines effect closures that mutate `S` — defensible but stretches "data file."
- **`sim-stats.js` is misnamed.** [tlh/js/sim-stats.js](tlh/js/sim-stats.js) exports `aggregateReports()` — it generates reports from telemetry buckets owned by `telemetry.js`. It's a reporter, not a stats tracker. `js/sim-reporter.js` would name what it does.
- **`util.js` is small and possibly half-deduped.** [tlh/js/util.js](tlh/js/util.js) is 29 lines (`pickRandom`, `esc`). [tlh/js/main.js](tlh/js/main.js) has a header comment indicating `pickRandom + getNpc` were dedup'd into `util.js`/`trust.js`. Worth grepping that the dedup is complete and there's no local copy left in `trust.js`. *(Did not deep-verify in this pass.)*
- **`packages.js` (1295 lines) is "the most cross-system function in the codebase"** — its own header says so. Imports gear, boots, trust, multiplayer, carrier, identification, and three render modules. Lifecycle (rolling, ground pickup three-way, inventory accept, respawn, telemetry) all in one file. `packages-delivery.js` already exists as a partial extraction; further splits possible if the file becomes a refactor blocker.

---

## 4. Atomization concerns

### File size table (top of distribution, scoped to JS)

| File | Lines | Notes |
|---|---|---|
| `tlh/js/render/route-map.js` | 1478 | 🔴 SVG render + segment state + terrain glyphs + trail fade + weather overlay + geospatial queries |
| `tlh/js/packages.js` | 1295 | 🔴 lifecycle hub; "most cross-system" file |
| `tlh/js/main.js` | 1077 | 🟡 tick orchestrator (expected to be big) |
| `tlh/js/data/npc-lines.js` | 939 | 🟡 pure dialogue corpus; size is content-driven, fine |
| `tlh/js/weather.js` | 822 | 🟡 storm physics + SVG overlay + telemetry coupled |
| `tlh/js/persistence.js` | 742 | 🟡 save/load + v6→v9 migration chain |
| `tlh/js/trip.js` | 738 | 🟡 trip + catch state machine, dense logic |
| `tlh/js/sim.js` | 688 | 🟡 sim harness / runner |
| `tlh/js/data/packages.js` | 658 | 🟡 pure data; size is content-driven, fine |
| `tlh/js/render/hud.js` | 615 | 🟡 fairly cohesive; circular with upgrades.js |
| `tlh/tlh-boot.js` | 605 | 🟡 boot screen rendering + sequencing |
| `tlh/js/constants.js` | 592 | 🟡 tuning knobs; expected large |
| `tlh/js/state.js` | 587 | 🟡 schema + initial state |

Ten files between 600–900 lines, three above 1000. `npc-lines.js`, `data/packages.js`, `constants.js` are size-by-content (acceptable). The non-data outliers — `route-map.js`, `packages.js`, `weather.js`, `trip.js` — mix concerns enough that they're the most likely refactor targets if/when the codebase needs to thin out.

### Import graph

**God-modules** (imported by 10+ files):
- `state.js` — imported by ~37 files. Single source of truth; unavoidable.
- `constants.js` — imported by ~31 files. Read-only; fine.

**Bottleneck modules** (importing 10+ peers):
- `main.js` — ~18 peer imports. Tick coordinator, expected.
- `packages.js` — ~13. Lifecycle hub.
- `render/route-map.js` — ~12. Render hub.

**Confirmed circular import:**
- `render/hud.js` ↔ `upgrades.js` (function-body calls only, not load-time — currently safe).

### Inline JS in `the-long-haul.html`

~7 lines. Pure bootstrap glue (set NAV_ACTIVE global, load nav.js, dismiss-boot keydown handler, `startBoot()` call). All real game initialization is delegated to `js/main.js` via `type=module`. Clean.

---

## 5. Code-vs-doc cross-check (informational, docs not authoritative)

I sampled the design docs only to spot-check intent vs implementation. Per [CLAUDE.md] and your earlier note, docs can be stale too — these are *open questions*, not verdicts.

- Boot version `v0.9.29` is far enough behind that either the boot screen never had a version-bump path wired (most likely) or the docs/handoff mentioned a different surface. Worth confirming intent.
- "Microphones" in pi's line vs the precollapse-tech rule in memory: rule wins. Note that `npc-lines.js` is otherwise compliant (no GPS/wifi/computer/phone references).
- No mechanical disagreements between doc claims and code observed in the spot check. Tier-cosmetic-only is honored. Pronoun rule is honored. Gear-as-placed is honored mechanically (the apparent "held" log lines turned out to be over-flags — see §6).

---

## 6. Things that LOOK like findings but aren't

These were flagged by the scan agents and on re-read are not violations / not actionable.

- **"ceramic wrap held" / "tie-down held" log lines** ([tlh/js/trip.js:548](tlh/js/trip.js:548), [tlh/js/trip.js:667](tlh/js/trip.js:667), [tlh/js/trip.js:669](tlh/js/trip.js:669)) — flagged as gear-mechanic violations ("held" forbidden). On re-read, "held" here means *the gear held firm under load*, not *the player held the gear*. The wrap is described as having held; the tie-down is described as having held. Same English idiom as "the rope held," "the dam held." Not a violation.
- **Settlement WIP class** ([tlh/js/render/settlements.js:115](tlh/js/render/settlements.js:115) + CSS opacity `0.45`) — flagged as half-coded. The deliberate grayed-out rendering reads as intentional in-progress *visual indicator*, not abandoned scaffolding. Confirm with intent, but the styling pattern doesn't look like rot.
- **Cargo button placeholder** ([tlh/the-long-haul.html:113](tlh/the-long-haul.html:113)) — `disabled aria-hidden="true"` and CSS-hidden unless `.grid2x2`. Reserved future slot, not abandoned UI.
- **`pickRandom` / `getNpc` in `util.js`** — main.js header notes a dedup happened. I didn't deep-verify whether `trust.js` still has a local copy. Worth a 30-second grep, then you'll know.

---

## 7. Caveats / what this audit didn't cover

- **Runtime behavior.** This is a static-read audit. Nothing was launched in `preview_*` to verify whether any of the half-coded findings actually manifest at runtime. The boot-screen version is the only thing I'm certain players see (verified the source string).
- **Worker contract.** Per scope, `tlh/worker/index.js` was excluded. If the worker's API contract has drifted from the client (e.g., field names in the GET `/` response, save-blob shape, channels protocol), this audit won't catch it.
- **CSS hygiene.** `the-long-haul.css` was only spot-checked for the WIP class. Dead selectors, zombie animations, and unused class names were not enumerated. Could be a follow-up.
- **Telemetry events.** `telemetry.js` events were not cross-referenced against `sim-stats.js` aggregations. Possible orphaned event names on either side.
- **NPC line completeness.** Whether every NPC has all the categories (threshold/ambient/warning/preview/rest) the dialogue system expects, or whether some lookups silently fall through, was not checked.
- **The `tripChance` internal rename** is restated here only because the audit was wide-net. Memory already records this as deferred — no new information.

---

## 8. If you want a triage starting point

(Strictly your call. Listed roughly in order of "visible to players" / "cheap to fix.")

1. Fix the boot-screen version banner — visible to every player, two minutes of work, and a candidate for wiring into `bump-version.sh` so it never drifts again.
2. Decide on `S.inRiver` — delete or implement. Either is a small change and removes a confusing dead branch.
3. Lift `0.85` to `STRAIN_CRIT_THRESHOLD` in `constants.js` and replace ~11 call sites. The threshold is balance-critical and shouldn't be edited eleven times to change one value.
4. Fix "microphones" in pi's line — one-line copy edit.
5. Resolve "auto-equipped" for boots vs the placed-gear rule — writing decision, not code.
6. Everything else (route-map ownership of segment state, sky→time util split, sim-stats rename, data-folder hygiene, hud↔upgrades cycle) is structural and only worth touching if you're already in the area for another reason.
