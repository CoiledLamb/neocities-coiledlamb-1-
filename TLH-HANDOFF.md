# the long haul — game handoff doc
_last updated: 2026-04-15 (v0.0.8.3 shipped; v0.0.8 arc redefined around packages/trust/rain, not terrain. Packages done; trust queued next — see [trust thread primer](#trust-thread-primer-v008-next) before picking up.)_

> Companion doc to [`HANDOFF.md`](./HANDOFF.md) (which covers site-wide infrastructure). This doc covers everything related to **The Long Haul** game: architecture, multiplayer, identification stages, persistence, bug list, specs, roadmap, and game-specific session log.

---

## ✅ CURRENT STATE: v0.0.8.3 live — package rework + cargo UI rework done; trust next

Game is at `v0.0.8.3`. Three commits ahead of `origin/main` on branch `claude/elastic-visvesvaraya`, ready to push. After push, the next patch thread is trust — see [trust thread primer](#trust-thread-primer-v008-next).

**v0.0.8 scope redefinition (important):** the handoff previously framed v0.0.8 as terrain expansion (deserts, rivers, slopes). User rescoped it around **three mechanical-depth threads**: packages, trust, rain. Terrain moved to v0.0.9. Packages + cargo UI complete; trust and rain still to build.

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
15. ⏳ **v0.0.8.4+ — trust thread** (NEXT): identify `?` waystone, map trust gain to package weight (like scrip), audit upgrades → move some to NPC trust rewards. See [trust thread primer](#trust-thread-primer-v008-next).
16. ⏳ **v0.0.8.later — rain rework**: drizzle/rain/downpour intensity states, storms as travelling world objects (not localized to player), minimap cloud rendering, biome-biased spawning (wetlands more rain-prone). Encumbrance trip scaling folded in.

**Resume next session**: read the [trust thread primer](#trust-thread-primer-v008-next). It covers the three sub-threads (identify `?`, weight→trust, upgrade audit), open design questions, and how the new package dest-tagging sets up future shelter-dispatch pools.

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

## reference links (TLH-specific)

- Cloudflare Workers docs: https://developers.cloudflare.com/workers/
- Cloudflare KV docs: https://developers.cloudflare.com/kv/
- Live worker: https://coiledlamb.tlh-feed.workers.dev
