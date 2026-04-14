# the long haul — game handoff doc
_last updated: 2026-04-14 (commits 5-10 + dropoff at commit 11)_

> Companion doc to [`HANDOFF.md`](./HANDOFF.md) (which covers site-wide infrastructure). This doc covers everything related to **The Long Haul** game: architecture, multiplayer, identification stages, persistence, bug list, future feature backlog, and game-specific session log.

---

## 🚧 ACTIVE: module refactor on `tlh-modules` branch

**Branch**: `tlh-modules` (cut from `main` after v0.0.7 merge)
**Goal**: split monolithic `the-long-haul.js` (~2270 lines, single IIFE) into ES modules. Zero behavior change throughout. Sub-versioned during refactor (v0.0.7.1, .2, .3...) — sub-suffix drops on merge back to main.

**Testing setup**: `python -m http.server 8000` from repo root → `http://localhost:8000/the-long-haul.html`. User is on Windows (cmd). Hard refresh (Ctrl+Shift+R) between commits. Pre-existing benign `favicon.ico 404` — ignore.

### 🛑 DROPOFF POINT: about to push commit 11 (packages.js)

**Branch HEAD** as of this writing: `836a91b` (commit 10 — world.js extracted, v0.0.7.10 verified green by user).

**Next action when resuming**: push commit 11 to extract `js/packages.js`. Plan in detail below in "commits remaining".

### key architecture decisions made

- **ES modules over IIFE concat or build step**. User will go live-only post-refactor (deploy direct to Neocities), so the `file://` CORS module restriction doesn't matter — local server only during dev.
- **Single-letter `S` for state kept** (established convention, ~300 uses). Discussed and decided to keep.
- **Transient sub-object named `_transient`** (not `runtime`). Underscore matches existing convention elsewhere in codebase.
- **`els` and `worldCells` as module-local aliases** over `S._transient.els` and `S._transient.worldCells`. `resolveEls()` uses `Object.assign`, `buildWorld()` uses `.length=0+push` — both preserve the alias by mutating in place. **Never reassign these aliases.** Every extracted module that uses them does `const els = S._transient.els; const worldCells = S._transient.worldCells;` at the top.
- **Constants imported as namespace**: `import * as C from './constants.js'` → `C.TICK_MS`, `C.TRIP_CHANCE_BASE` etc. Picked over named imports (40-line import list would be its own kind of noise).
- **Data files flat in `js/data/`** (not nested). Six files: `npc-lines.js`, `npc-defs.js`, `packages.js`, `zones.js`, `glyphs.js`, `upgrades.js`. `UPGRADE_DEFS` imports `S` because `apply` closures mutate state — unusual for a data file but cleaner than a dispatch table.
- **HTML subtitle dimmed sub-version**: `v0.0.7<span style="opacity:0.6">.N</span>` — but the oil-text gradient renders the dimmed `.N` nearly invisible against background. User finds this charming and chose to keep the bug. Update the `.N` value each commit anyway; user verifies via View Source.
- **No save schema bump during refactor**. Stays at v5. Old saves self-heal via existing ratchet in `loadGame`.
- **Circular-import-by-file pattern, established commit 5 onward.** Sub-modules import functions like `addLog`, `renderNetwork`, `drawRouteMap`, `renderSettlements`, `staminaSegCount`, `renderStamina`, `updateHUD` from `./main.js`. This is circular by file but NOT by initialization — these are only ever called inside function bodies, never at module load. ES modules handle this correctly (the binding is live, populated by the time anything runs). Each `export` in main.js is annotated with a comment explaining who imports it and why.

### target file structure
```
the-long-haul.html          (stays at root)
the-long-haul.css           (stays at root)
js/
  main.js                   - entry + init() + tick() + remaining glue
  state.js                  ✅ S object + S._transient
  constants.js              ✅ tuning values
  world.js                  ✅ buildWorld, scroll, fieldstrip
  packages.js               ← COMMIT 11 IN PROGRESS  scanForPickup, tryDeliver, respawns
  trip.js                   - tripChance, catchChance, maybeTrip
  boots.js                  - buy/autobuy/clip/tie-down/sandalweeds
  stamina.js                - canteen, drinkWater, speedMultiplier
  identification.js         ✅ nodeStages helpers
  trust.js                  ✅ addTrust, onTrustUnlock, tryWarning/Preview/RestPrompt (rename pending)
  channels.js               ✅ speak, renderChannels, tickAmbientChatter
  recovery.js               ✅ tickRecoveryAttempt, spawnRecoveryCargo, updatePorterStripBadges
  persistence.js            ✅ save/load/wipe/armWipe/updateSaveStrip
  multiplayer.js            ✅ getPorterId/postActivity/pollFeed/etc
  upgrades.js               - renderUpgrades + buyUpgrade
  render/
    hud.js, route-map.js, settlements.js, network.js, log.js
  data/
    npc-lines.js            ✅
    npc-defs.js             ✅
    packages.js             ✅
    zones.js                ✅
    glyphs.js               ✅
    upgrades.js             ✅ (data with apply closures, imports S)
```

### commits completed on `tlh-modules`

| Commit | SHA | Module | v |
|---|---|---|---|
| 1 | `f9b1e91` | plumbing (IIFE→module) | v0.0.7.1 |
| 2 | `24d0b54` | state.js + `S._transient` | v0.0.7.2 |
| 3 | `077f9e8` | constants.js | v0.0.7.3 |
| 4 part 1 | `1ece0d6` | data files (no-op) | (unchanged) |
| 4 part 2 | `533edf8` | wire data imports | v0.0.7.4 |
| 5 | `a65b18b` | persistence.js | v0.0.7.5 |
| 6 | `d50beec` | multiplayer.js | v0.0.7.6 |
| 7 | `30aa52e` | recovery.js | v0.0.7.7 |
| 8 | `d934c07` | identification.js | v0.0.7.8 |
| 9 | `36d3cb8` | trust.js + channels.js | v0.0.7.9 |
| 10 | `836a91b` | world.js | v0.0.7.10 |

All ten verified green by user. Multiplayer feed working from localhost. Channels, trust gain, recovery cargo all functional through every step.

### in-progress: commit 11 — packages.js (v0.0.7.11)

**Plan as of dropoff:**

**Moves to `js/packages.js`:**
- `scanForPickup` — pickup proximity scan (calls addLog, renderBoots, renderCourierStack, renderCargoSlots, shortPorterId, sandalCap)
- `tryDeliver` — most cross-system function in the codebase (~50 lines): touches recovery (`updatePorterStripBadges`, `S.activeRecoveryCount`), multiplayer (`postActivity`, `shortPorterId`), trust (`addTrust`), identification (`getNodeStage`, `setNodeStage`), render (`drawRouteMap`, `renderSettlements`, `renderCourierStack`, `renderCargoSlots`), log (`addLog`), settlement supply/rebuild mutation
- `tickPkgRespawns` — periodic respawn scan (calls addLog only)

**Stays in main:**
- `cargoKey` and `renderCargoSlots` — render concerns, will move to `render/hud.js` later. Keeping them together avoids forcing render to import from packages later.
- `renderCourierStack` — same render concern
- `sandalCap` — boots concern, moves to boots.js in commit 13

**Cross-call story:**
- `packages.js` will import from: state, constants, NPC_DEFS data, multiplayer (`postActivity`, `postLostDrop` not needed — that's in trip.js plan, `shortPorterId`), recovery (`updatePorterStripBadges`), trust (`addTrust`), identification (`getNodeStage`, `setNodeStage`), and main (`addLog`, `renderBoots`, `renderCourierStack`, `renderCargoSlots`, `drawRouteMap`, `renderSettlements`, `sandalCap`)
- main.js will import the 3 public functions back

**Risks to flag before pushing:**
- `sandalCap` is referenced by both packages (scanForPickup) AND boots code (checkAutobuy, renderBoots). Need to either keep it in main and import it into packages.js, OR move it to boots.js early. Plan: keep in main, export it (already a 2-liner). Will move with boots.js in commit 13.
- This is the largest single extraction by cross-system count. Verify on the user's localhost very carefully — pickup, delivery, recovery delivery, trust gain on delivery, settlement supply ticks all need to work.

**Commit message format (template ready):**
```
refactor(tlh): commit 11 — extract packages (v0.0.7.11)

New js/packages.js with: scanForPickup, tryDeliver,
tickPkgRespawns. Most cross-system extraction yet — tryDeliver
alone touches 6 modules.

main.js changes:
- Removed inline PACKAGE PICKUP / PACKAGE DELIVERY blocks (~150 lines)
- Added namespace import for packages.js public surface
- Added `export` to renderBoots, renderCourierStack,
  renderCargoSlots, sandalCap (with circular-import-safe comments)

HTML subtitle bumped to v0.0.7.11.

No save schema bump.

Verify hard-refresh — gameplay 100% identical to v0.0.7.10.
Test: pickup, regular delivery, recovery delivery (rare —
depends on peer activity), trust gain on delivery, settlement
supply tick on delivery, package respawn after delivery.

Next: commit 12 — trip.js (tripChance, catchChance, maybeTrip).
```

### running bug list (collate with player feedback for next bugfix patch)

**Refactor housekeeping (low-risk, mechanical):**
1. **Function renames** — `tryT50Warning` → `tryWarning`, `tryT75Preview` → `tryPreview`, `tryT100RestPrompt` → `tryRestPrompt`. Names lie about thresholds (now 20/40/60/80, not 50/75/100). Same naming inconsistency: `_lastDist*` vs `lastDist*` post-promotion to `_transient`. Deferred from commit 9 to be a focused commit so any bug isn't ambiguous between move and rename.
2. **Duplicated `pickRandom`** — exists in both `channels.js` and `recovery.js`. Trivial 3-liner. Candidate for a `util.js` if more shared helpers emerge, otherwise leave.

**Genuine code smells (not blocking, not bugs):**
3. **`saveGame` swallows storage errors silently** — quota exceeded, Safari private mode → player loses progress without knowing. Surface a more visible warning.
4. **`getNpc` exists identically in both `channels.js` and `trust.js`** — accidental dup at split. Move to identification or shared spot.
5. **`renderSettlements` reaches into `S.npcs[s.id]` directly** — encapsulation leak introduced commit 9 to avoid extra import. When `render/settlements.js` extracts, it should import `getNpc` properly.
6. **`tryT50Warning` rain logic possibly off**: `!S.isRaining && S.rainTimer > 0 && S.rainTimer < 25`. Timer counts down both during and between rain. Intent seems "rain incoming soon" but condition also true between events. User to sanity check — they wrote the rules.
7. **`_lastGearPopKey` hardcodes scrip threshold to 15** (boots cost). Should be `C.BOOT_PRICE` constant (doesn't exist; `15` appears in 4 places).

### user-discussed features deferred to post-refactor patch

**Save export/import (cross-browser saves)** — User asked, deferred to post-refactor "feedback patch." Plan: base64-encode `buildSavePayload` output, prefix with magic string `TLH-SAVE-v5:`, paste into textarea on import. Open question: bundle porter ID? Recommended hybrid — bundle but checkbox to opt-in on import (default off = move progress, keep new browser's identity). Avoids accidental impersonation/double-broadcast on multiplayer.

**Save on browser close** — User asked. Already handled via `beforeunload` + `visibilitychange` + autosave interval. localStorage.setItem is synchronous, no delay needed. Nothing to do.

### remaining commits after 11

Combining where it's safe to reduce ceremony for trivial extractions:

- **Commit 12** — `trip.js`: `tripChance`, `catchChance`, `maybeTrip`, `currentCellIsRisky`. Includes `postLostDrop` call — already imported from multiplayer. Also moves the `posKm` / `accumulateDist` distance helpers (currently inline in main).
- **Commits 13-14 combined** — `boots.js` + `stamina.js` (small + tangled): `buyBoots`, `checkAutobuy`, `refillBootClip`, `confirmClipRefill`, `toggleTieDown`, `toggleAutobuy`, `toggleBootsGear`, `sandalCap`, `drinkWater`, `speedMultiplier`, `staminaSegCount`, `renderStamina`, `renderBoots`. `staminaSegCount` and `renderStamina` are already exported from main (for trust.js).
- **Commit 15** — `upgrades.js`: `renderUpgrades` + `buyUpgrade` (data already in `data/upgrades.js`).
- **Commit 16** — `render/` subdirectory (1-3 pushes depending on size): `hud.js`, `route-map.js`, `settlements.js`, `network.js`, `log.js`. Treat as one logical commit even if split for size.
- **Commit 17** — Final main.js cleanup: just `init()` + `tick()` + entry. Delete orphan `the-long-haul.js` stub at repo root. Drop sub-version suffix (v0.0.7.17 → v0.0.7).

After all 17 done: merge `tlh-modules` → `main`, delete branch.

Then: sticky gun + terrain scanner mini-patch, then user's player-feedback-focused patch (will collate with bug list above), then v0.0.8.

Each commit: bump HTML subtitle to next sub-version. Commit message format: `refactor(tlh): commit N — extract <module> (v0.0.7.N)`.

### invariants preserved throughout refactor

- **No behavior change, ever.** Pure structural refactors. If user notices any gameplay difference, it's a bug.
- Save schema stays v5. No bump.
- Old saves self-heal via the ratchet in `loadGame`.
- `TRUST_THRESHOLDS` gameplay is now `[20, 40, 60, 80]` (set in pre-refactor commit A, before this branch was cut).
- `TOTAL_CELLS = CELLS_PER_EDGE * 6 = 1560`.
- Worker URL unchanged: `https://coiledlamb.tlh-feed.workers.dev`
- localStorage keys unchanged: `tlh-save-v5`, `tlh-porter-id`.

### user preferences for working with this branch

- User likes seeing assumptions stated up-front before pushes ("here's what I'm about to do, here's the one weird thing about it") — gives them a chance to redirect.
- User is fine with bold structural changes when they're well-explained, but flag tradeoffs honestly.
- User pushes back when something feels weird (e.g. asked good questions about single-letter `S`, the dimmed `.N` rendering, the "no signal" panic that turned out to be cache + correct empty-state). Take the questions seriously, don't hand-wave.
- Discuss style choices briefly and let user pick when there's no clear winner. Don't over-deliberate.
- Commit messages should be substantive — explain rollback path, what changed, what stayed.
- User has a list of player-submitted bugs they'll collate with the running bug list above when we hit the bugfix patch.
- User explicitly prefers seeing ideas/suggestions when relevant, doesn't want me to hold back on things I notice.

### branch merge plan (after refactor complete)

When `tlh-modules` is fully merged structurally (all extractions done, `main.js` is just init+tick+entry):
1. Drop the sub-version suffix in HTML: `v0.0.7.17` → `v0.0.7` again.
2. Delete the orphan stub `the-long-haul.js` at repo root.
3. Squash-merge or merge-commit to `main` (user's call).
4. Update both this doc and `HANDOFF.md` to reflect new file structure.
5. Delete `tlh-modules` branch.

After merge: ready for the bugfix/feedback patch (collate refactor housekeeping + player feedback), then sticky gun + terrain scanner mini-patch, then v0.0.8 work.

---

## branch status
- Active development branch: `tlh-modules` (refactor — see top section)
- Previous: `feature/the-long-haul` (merged to main as v0.0.7)
- **Live deploy**: `main` is on Neocities. `tlh-modules` is local-only during refactor (will merge when complete).
- Push convention: full version drops (e.g. v0.0.5 → v0.0.6 → v0.0.7) get pushed to feature branch when ready. Small bugfixes batched between version drops. Site-wide changes (like adding music tracks to `nav.js`) can be pushed to `main` separately.

---

## v0.0.7 — multi-system bundle ✅ DONE

The v0.0.7 bundle interlocks **four systems** that mutually reinforce each other. The decision was made to ship them together rather than piecemeal because they only feel right when present together.

**Four systems:**
1. **Async multiplayer backend** (Cloudflare Worker + KV) — ✅ shipped commits 1-2
2. **Progressive node identification** (??? → signal → tier → full label) — ✅ shipped commit 3
3. **Trust meter with NPCs** — ✅ shipped commits 4a/4b
4. **Settlement UI polish** — ✅ shipped commit 6 (quote evolution proper deferred until rebuild mechanic is real)

**Commit progress:**
- ✅ Commits 1, 2, 3a, 3, 3b (detailed below in session log)
- ✅ **Commit 4a** (`a105cbb`) — Trust system scaffold.
- ✅ **Commit 4b** (`466598b`) — Trust behaviors + channels panel + ~75 dialogue lines.
- ✅ **Wipe save bugfix + Commit 5** (`18f6914`) — Wipe fix + lost cargo recovery loop.
- ✅ **Commit 6** (2026-04-14, CSS `60b4df9` / HTML `00e5a2b` / JS `c56e52c`) — distKm accumulator, all-cargo drop, settlements rebuild, gear popover, vertical canteen, recovery badge, sandal at-cap stable green, channels empty state. **v0.0.7 is complete.**
- ✅ **Pre-refactor commit A** (`ec9f377`) — Realigned trust thresholds 25/50/75/100 → 20/40/60/80 to match settlement panel tick marks. Updated `TRUST_THRESHOLDS` const, `onTrustUnlock` tier comparisons, `NPC_LINES.threshold` keys, `S.npcs` unlock keys (t25→t20 etc), `tryT50/T75/T100` function bodies (unlock gates), `tickAmbientChatter` gate. Added legacy key migration in `loadGame` (t25→t20, t50→t40, t75→t60, t100→t80). Old saves self-heal via ratchet.

**What's next after v0.0.7:**
1. **Module refactor** ← currently in progress on `tlh-modules`. See top section.
2. **Bugfix patch** — collate refactor housekeeping bugs (above) + player-submitted feedback.
3. **Sticky gun + terrain scanner mini-patch** — two upgrade items shipped as a small bundle. Full design below in "future upgrades".
4. **v0.0.8** — structures tab, new terrain, bigger map. (See future game features.)

---

## commit 6 — what shipped

Final commit of v0.0.7. Shipped as four sequential file commits on branch (CSS → HTML → JS → this doc).

### logic changes
1. **`distKm` accumulator.** Old derived formula (`(edgeIdx + dotT) * 4.2`) replaced with a real forward-delta accumulator. New constant `KM_PER_EDGE = 4.2`. Transient trackers `S._lastDistEdgeIdx` / `S._lastDistDotT` (null sentinel = first tick since load). Helpers `posKm()` and `accumulateDist()` — the latter handles edge rollover (negative delta → add full loop length) and caps absurd jumps at 2× edge length. Called every walking/carrying tick. The old `if (S.ticks%5===0) { S.distKm = ... }` line is gone; `checkDistMilestones()` still runs every 5 ticks. Old saves self-heal on first post-upgrade session (load stale derived value, then accumulate forward from there). On refactor branch: trackers live on `S._transient.lastDistEdgeIdx` / `S._transient.lastDistDotT`.

2. **All-cargo drop on trip.** `TRIP_LOST_DROP_CHANCE = 0.30` replaced with `TRIP_DROP_CHANCE_NORMAL = 0.20` + `TRIP_DROP_CHANCE_LOST = 0.30`. In `maybeTrip()`, drop check fires **BEFORE** tie-down. Tie-down protects against damage fallback only, not drops. Drop targets the first inventory item; normal pkgs vanish locally + log only (no worker event), lost pkgs go through `postLostDrop()` as before.

### UI changes
3. **Sandal at-cap → stable green.** `.sandal-badge.at-cap` uses `#2a7a58` (matches `.fc-sw-plant`), no pulse animation. Cap is fine, not urgent.

4. **Boots gear popover.** New `⚙` button collapses `[buy boots]`, `[autobuy]`, and `clip: N/M` into a single popover. Opens on click, closes on outside-click. Popover contents are dirty-checked via `_lastGearPopKey` so we don't thrash the DOM every tick. Sandal badge moved outside to sit next to the gear button (status indicator, not action). Recovered ~30% of row width. Old `#clipBadge` span still in HTML but hidden.

5. **Settlements panel rebuild.**
   - Trust bar moved **above** the name (was below).
   - Trust bar is continuous fill + 4 absolutely-positioned tick marks at 20/40/60/80% via `.settle-trust-tick` spans.
   - Rebuild bar gets `.settle-bar-wip` class (opacity 0.45) — it's a placeholder for future real rebuild mechanic.
   - Stage-2 settlements get `.settle-stage2` class (opacity 0.65) — unconfirmed, de-emphasized.

6. **Channels empty state.** Changed from `"no chatter yet"` to `"no callsigns trusted yet — deliver to depots to build trust"`. Tells new players why it's empty and what unlocks it.

7. **Recovery cargo presence badge.** New `updatePorterStripBadges()` creates/shows `#recoveryBadge` in the porter strip when `activeRecoveryCount > 0`. Text: `recovery ×N`. Called from `spawnRecoveryCargo` (+1), `tryDeliver` on recovery delivery (−1), and `init()`. Pink on dim background — ambient presence, not a CTA.

8. **Vertical canteen bar.** CSS swapped from `width: 28px; height: 3px` (horizontal) to `width: 4px; height: 14px` (vertical). Fill uses `position: absolute; bottom: 0` and transitions `height`. JS updated: `els.canteenBar.style.height = canteenPct+'%'` (was `.width`).

### save schema
No bump. Schema stays v5. `distKm` is still a plain number; transient `_lastDist*` trackers are never persisted. Old saves self-heal.

### invariants preserved
- ~~Gameplay trust thresholds stay at 25/50/75/100~~ — realigned to 20/40/60/80 in pre-refactor commit A (`ec9f377`).
- `_wipeInProgress` guard intact.
- Recovery cargo is still one-shot on delivery.
- Tie-down still absorbs damage — just doesn't absorb drops.

---

## game architecture

The game lives entirely in `the-long-haul.js` as a self-contained IIFE. All mutable state is in the `S` object. Persistent save state lives in `localStorage`.

> **Note**: the above describes pre-refactor architecture (still accurate on `main`). On the `tlh-modules` branch, the game is split across `js/main.js`, `js/state.js`, `js/constants.js`, `js/data/*.js`, plus the extracted modules (persistence, multiplayer, recovery, identification, trust, channels, world). The behavior described below is identical on both branches.

### core loop
- The courier walks a fixed circular route of 6 edges between 6 named nodes (A → ? → B → C → H → · → A).
- `S.edgeIdx` (0–5) and `S.dotT` (0.0–1.0) track position on the route. `dotT` increments each tick by `0.006 × speedMultiplier()`. When it hits 1.0, edge advances and `tryDeliver()` fires.
- Speed is modulated by stamina segment count and boot durability.

### distance tracking (v0.0.7 commit 6)
- `KM_PER_EDGE = 4.2`. `posKm(edgeIdx, dotT) = (edgeIdx + dotT) * KM_PER_EDGE` gives current ring position.
- `accumulateDist()` runs every walking/carrying tick: computes forward delta since last tick, handles rollover (negative delta → add `edges.length * KM_PER_EDGE`), caps absurd jumps at 2× edge length, adds to `S.distKm`, updates trackers.
- `S._lastDistEdgeIdx` / `S._lastDistDotT` null sentinel = first tick since load; initializes trackers without counting a spurious delta.
- (On refactor branch: these live on `S._transient.lastDistEdgeIdx` / `S._transient.lastDistDotT`.)

### world map
- `buildWorld()` generates a flat array `worldCells[]` of exactly `CELLS_PER_EDGE × 6 = 1,560` cells at startup. World is regenerated fresh each page load — never persisted.
- Each cell: `{ html, pkg, sandal, risky, edgeIdx }`.
- `pkg` (if present): `{ size, label, kg, slots, scrip, isLost, isRecovery, recoveryFromPorter, destId, picked, respawnIn }`. `destId` is the far end of the cell's edge — stamped at generation, never changes.
- `sandal: true` flag marks harvestable sandalweed cells.
- Risky cells: edges leading to C or ? are flagged `risky: true`, applying a ×1.4 trip chance multiplier.
- Scroll is JS-driven: `renderFieldstrip()` computes `worldPosFromRoute()` → `translateX(...)` on `.tlh-fieldstrip` every tick. No CSS animation. `width: max-content` on the strip element.

### packages
- Picked up by proximity scan in `scanForPickup()` — checks cells within `PKG_PICKUP_RANGE = 8` cells ahead of courier each tick.
- On pickup: `pkg.picked = true`, package copied into `S.inventory` with `_worldCell` reference for respawn. Recovery metadata (`isRecovery`, `recoveryFromPorter`) carries forward.
- On node arrival: `tryDeliver(arrivedNodeId)` delivers all inventory items with matching `destId`.
- After delivery: normal pkg gets `pkg.respawnIn = PKG_RESPAWN_TICKS (500)`. **Recovery cargo is one-shot** — `worldCell.pkg` set to null, `activeRecoveryCount` decremented, `updatePorterStripBadges()` refreshes the strip.

### trip + drop (v0.0.7 commit 6)
- `TRIP_DROP_CHANCE_NORMAL = 0.20`, `TRIP_DROP_CHANCE_LOST = 0.30`.
- On trip: catch roll first. If not caught, **drop check fires BEFORE tie-down**. Targets first inventory item; roll appropriate chance. Lost pkg drops via `postLostDrop()` (worker). Normal pkg vanishes locally with a log line — no worker event.
- Tie-down: if drop didn't fire and inventory > 0, consumes the tie-down to protect against damage fallback. `S.tieDownActive = false`.
- Damage fallback: if no drop and no tie-down, first item's scrip takes 25% hit (min 1).

### sandalweeds
- Spawn in scrub (most), road (rare), ruins (rare). Wetlands and depot approaches: never.
- Current rates: scrub 0.008, road 0.002, ruins 0.002.
- **Hoard cap**: `SANDAL_CAP_BASE = 5` (`SANDAL_CAP_UPGRADED = 25` with `sandalSatchel` upgrade). When at cap, `scanForPickup` leaves the `*` standing.
- Auto-equip when boots fail: `checkAutobuy` priority clip > sandalweed > scrip. Equipped sandalweed: `bootDurability = 30`, `usingMakeshift = true` (1.3x boot drain).
- UI: `#sandalBadge` next to the boots gear button, format `* N/cap`. **At-cap uses stable green (#2a7a58) — no pulse (commit 6).**

### identification stages
- `S.nodeStages` is the single source of truth. Object keyed by node id, values 0-3.
- Stages: 0 = unknown, 1 = signal (trust t20 — was t25 pre-realignment), 2 = tier visible (walked adjacent edge), 3 = visited.
- Starting state: `A` and `H` at 3 (porter's anchors), all others at 0.
- Helpers: `getNodeStage`, `setNodeStage` (ratchet), `markEdgeAdjacent`, `getDisplayLabel`. (On refactor branch: in `js/identification.js` since commit 8.)
- `renderSettlements` filters on stage ≥ 2. Stage-2 items get `.settle-stage2` class (opacity 0.65).

### NPCs + trust (commit 4a/4b, realigned in commit A)
- `NPC_DEFS` at A/B/H with Greek callsigns: rho (A, steady/laconic), iota (B, young/eager), tau (H, warm/observant).
- `S.npcs.{A,B,H}` = `{ trust, unlocks: {t20,t40,t60,t80}, nextChatterTick }`. (Was `{t25,t50,t75,t100}` pre-commit A.)
- `TRUST_THRESHOLDS = [20, 40, 60, 80]`. Gains: delivery +1, lost-delivery +2, discovery +3.
- t20: reveal stage-0 adjacent nodes to stage 1 (via `NPC_ADJACENT` table).
- t40: `tryT50Warning()` on arrival — checks trip-risk edge > rain-incoming > low-stamina, speaks first match. **Function still named `tryT50Warning` — rename to `tryWarning` deferred (see bug list).**
- t60: `tryT75Preview()` scans the outbound edge for any package, speaks a preview line with size + dest. **Same — rename deferred.**
- t80: `tryT100RestPrompt()` posts log button `[rest]` → `confirmDepotRest` restores stamina to 105% (overboost), +30 canteen, +10¢. **Same — rename deferred.**
- (On refactor branch: in `js/trust.js` since commit 9.)

### channels / chatter (commit 4b)
- `S.channels` is a FIFO ring (cap 6) of NPC utterances: `{ depotId, callsign, text, ts }`.
- `speak(depotId, text)` unshifts; `renderChannels` paints.
- `tickAmbientChatter()` runs every 10 ticks, per-NPC: gated on `unlocks.t20` (was `t25`), per-NPC cooldown (`nextChatterTick` = 170-345 ticks), base chance 0.005 per 10-tick window.
- Per-NPC color via `[data-depot]` selector: A teal, B pink, H purple.
- **Empty state** (commit 6): `"no callsigns trusted yet — deliver to depots to build trust"`.
- (On refactor branch: in `js/channels.js` since commit 9.)

### lost cargo recovery (commit 5)
- `postLostDrop(pkg)` POSTs to `/lost` + broadcasts `lost_drop` event.
- `fetchLostFromPeer(peerId)` GETs `/lost/:porterId`.
- `tickRecoveryAttempt()` runs each tick, throttled internally (`nextRecoveryAttemptTick` cadence = 85 ticks ≈ 30s). Soft cap `activeRecoveryCount >= 3`, plus one-per-cycle pacing via `lastRecoverySpawnTick`.
- `spawnRecoveryCargo(lostPkg, fromPorterId)` picks a random edge, finds empty cell on `i%8===0` stride, plants pkg with `isRecovery: true` + 1.5x scrip bonus. Calls `updatePorterStripBadges()` on spawn.
- `knownPeers` is a FIFO of non-self porter IDs harvested in `pollFeed` (cap 10).
- On delivery: clears `worldCell.pkg` fully (no respawn), decrements `activeRecoveryCount`, calls `updatePorterStripBadges()`, broadcasts `lost_recovered` with `forPorter`, logs "recovered X — left by PTR-YYYY".
- **Presence badge** (commit 6): `#recoveryBadge` in porter strip shows `recovery ×N` when count > 0, hidden when 0.
- (On refactor branch: in `js/recovery.js` since commit 7. `postLostDrop`/`fetchLostFromPeer` in `js/multiplayer.js` since commit 6.)

### persistence (schema v5 — commit 4a)
- Save key: `localStorage['tlh-save-v5']`. `SAVE_VERSION = 5`.
- Loader chain: v5 → v4 → v3 → v2 → v1. Migration on load: legacy keys removed, save re-written as v5.
- v5 added `npcs: { A/B/H: { trust, unlocks } }` block (nextChatterTick is transient).
- **Saved fields**: progress (delivered, scrip, distKm, ticks, capacities, boots/clip, sandalweedCount, stamina/canteen, autobuy/autodrink), position (edgeIdx, dotT), inventory (with `_worldCell` stripped), upgrades, nodeStages, settlements supply/rebuild, multiplayer (milestonesHit, lastFeedTimestamp), npcs.
- **NOT saved**: worldCells, package respawn timers, log, rain state, tie-down, pending boot clip refill, pending depot rest, network feed/census/connected, `knownPeers`, `activeRecoveryCount`, `lastRecoverySpawnTick`, `nextRecoveryAttemptTick`, `S.channels`, `S.npcs.*.nextChatterTick`, `_lastDistEdgeIdx`/`_lastDistDotT` (commit 6), `_lastGearPopKey` (commit 6).
- **Trust unlock legacy migration** (commit A): `loadGame` maps old `t25`/`t50`/`t75`/`t100` unlock keys → `t20`/`t40`/`t60`/`t80`. Plus a ratchet that auto-unlocks any tier where current trust ≥ threshold.
- Wipe save: `_wipeInProgress` guard flag set in `armWipe()` BEFORE `wipeSave()`, never unset (module re-init on reload resets). `saveGame()` bails immediately if flag set.
- (On refactor branch: in `js/persistence.js` since commit 5.)

### rendering
- `renderCargoSlots(force)` has dirty-check via `cargoKey()`. Tooltip uses `getDisplayLabel(pkg.destId)` + recovery tag.
- Weight pips right-aligned via `margin-left: auto`.
- Courier stack: all carried packages stacked above `@`. Recovery/lost both pink.
- `renderChannels` in right-column panel.
- `renderBoots`: boots bar + val always visible; gear popover contents dirty-checked via `_lastGearPopKey = S.bootClipMax|S.bootClipCount|(scrip<15?x:o)|(autobuy?on:off)`. Rebuilds innerHTML + re-wires listeners only when key changes.
- `renderSettlements`: trust bar on top (with 4 tick marks at 20/40/60/80%), name, rebuild bar (dimmed), quote. Stage-2 dimmed.
- `updatePorterStripBadges()`: creates/updates `#recoveryBadge` in porter strip.
- Vertical canteen bar: `els.canteenBar.style.height = canteenPct+'%'`.

### porter ID
- Format: `PTR-XXXX` (8 hex chars). Stored in `tlh-porter-id`. Legacy `TLH-XXXX` migrated. Survives wipe — identity, not progress.

### upgrade system
- 10 upgrades in `UPGRADE_DEFS`. Bought with scrip, some have prerequisites.
- Full list: `bootsT1/T2`, `bootClip1/2`, `steadyFeet`, `cargoSling/Pack/Weight`, `efficientConsumption`, `sandalSatchel`.

### status flow
`walking` → (pickup) → `carrying` → (node arrival + delivery) → `walking`
`walking` → (exhausted) → `resting` → (timer) → `walking` (+25% overboost)
`walking/carrying` → (trip) → `tripped` → (timer) → previous status

---

## multiplayer

### Cloudflare Worker (`worker/index.js`)
- Worker URL: `https://coiledlamb.tlh-feed.workers.dev`
- KV namespace ID: `c7bdbec95cd6476f9c87abf55c03fdcb`
- Endpoints: `POST /activity`, `GET /feed?since=`, `POST /lost`, `GET /lost/:porterId`, `GET /` (info).
- Allowed event types: `delivery`, `milestone`, `discovery`, `lost_drop`, `lost_recovered`, `trust_unlock`.
- Rate limit: 5 events/60s per porter, silent drop.
- Feed cap 200 events. Census 24h auto-prune. LOST_CAP 20 per porter FIFO.
- CORS open.

### game-side
- Constants in `MULTIPLAYER` block: `FEED_URL`, `POLL_MS = 60000`, `FEED_DISPLAY_CAP = 8`.
- `postActivity(type, data)` — fire-and-forget POST with `keepalive:true`.
- `pollFeed()` — incremental fetch via `?since=`, dedupes, harvests peer porter IDs into `knownPeers`.
- `startPolling`/`stopPolling` tied to `visibilitychange` (only polls while tab visible).
- `checkDistMilestones()` broadcasts at [10, 25, 50, 100, 250, 500, 1000]km.
- Self events filtered from feed display.
- (On refactor branch: in `js/multiplayer.js` since commit 6.)

### multiplayer plan (full design)

Designed to fit the game's actual shape: each player has their own procedural world; multiplayer is **a presence layer**, not shared world state. Reference frames: Death Stranding likes/structures, Dark Souls bloodstains/messages, Animal Crossing villager letters.

#### platform decision (✅ deployed)
- Cloudflare Worker + KV. Generic event bus schema `{ type, porterId, timestamp, data }`. New game systems plug in without backend changes.

#### Tier 1 status (v0.0.7)
- ✅ Activity log, census, lost cargo recovery, echo events (trust-gated)

#### v0.0.7+ scope (Tier 2) — fits with structures
- Structure stewardship, postbox dead-drops, structure naming, roads as collective infrastructure (needs redesign — see handoff note), ziplines as gifts.

#### v0.0.7+ scope (Tier 3) — fits with radio chatter NPCs
- Player-authored radio messages, trust meter pooled with NPCs.

#### v0.1+ scope (Tier 4) — long-tail
- Porter profiles, daily delivery boards, memorial events.

#### KV schema (current + anticipated)
- ✅ `feed:recent`, `census:active`, `lost:{porterId}`, `rate:{porterId}`.
- ⏳ `structures:{regionKey}`, `postbox:{boxId}`, `radio:queue`.

---

## future upgrades — mini-patch after refactor

Two upgrades shipping as a small mini-patch after the `tlh-modules` refactor merges. Acquisition: upgrades menu now; long-term plan to migrate to NPC trust rewards once map expands.

### sticky gun

**Concept**: extends pickup radius from a reduced base. Has ammo, refills only at H. Takes a cargo slot; holster upgrade frees the slot.

**Tuning**:
- `PKG_PICKUP_RANGE` from 8 → 6 when gun owned; with gun: ~16.
- Ammo: 8 shots. Auto-refill on H arrival.

**State**: `S.stickyGun = null | { ammo, ammoMax, holstered }`.

**Pickup flow**: if gun + ammo > 0, scan range = 16; on cross-range pickup, decrement ammo, store `S.lastStickyShot` for fade-out visual overlay on fieldstrip.

**Holster upgrade**: new `stickyHolster` (~80¢), requires gun. Frees cargo slot.

**Slot accounting**: `effectiveMax = S.maxSlots - (gun && !holstered ? 1 : 0)`. Apply in pickup capacity check + cargo render bound.

### terrain scanner

**Concept**: periodic pings + manual ping (30s cooldown), buff against trip chances, bigger buff on risky terrain. Upgrades extend duration / shorten interval.

**Tuning sketch**:
- T1 (60¢): 30s interval, 6s buff, manual 30s cooldown.
- T2 (140¢, req T1): 20s interval, 8s buff.
- T3 (240¢, req T2): 15s interval, 10s buff (~66% auto-uptime).
- Manual always 12s buff (longer than any auto) — keeps manual valuable.

**State**: `S.scanner = { unlocked, level, manualCooldown, autoTimer, buffActive, buffRemaining, buffMagnitude }`.

**Trip integration**: `tripChance() *= buffMagnitude` when active (0.5 baseline, 0.3 on risky).

**Save schema**: will need v5 → v6 bump (manual cooldown must persist — no save-scum).

---

## TLH future game features (post-mini-patch, post-refactor, do not implement yet)

**Structures tab**: postboxes, rainfall canopies, generators, lookout posts, ziplines, shelters, drone bays. Built on paths, degrade, upgradeable. Multiplayer per Tier 2.

**New terrain types**: deserts, rivers (bridgeable), slopes/elevation/mountains.

**Bigger map**: grow route beyond 6 nodes. Unlocks trust-reward acquisition for sticky gun + scanner.

**Hot springs**: field stamina restore with wait time cost.

**Settlement quote evolution**: the 3-stage × 6-settlement quote rewrite deferred from commit 6 — needs the rebuild mechanic to be real first.

---

## TLH session log

### 2026-04-14 (tlh-modules refactor — commits 5-10 done, dropoff at commit 11)

Continued refactor on `tlh-modules`. All ten extractions verified green by user across two sessions. Working pattern locked in: each commit announces plan with cross-call story, pushes 3 files (new module + main.js + HTML version bump), user verifies, move on.

**Commits 5-10 SHAs:**
- 5 `a65b18b` persistence.js (v0.0.7.5)
- 6 `d50beec` multiplayer.js (v0.0.7.6) — first true circular-import-by-file (addLog/renderNetwork from main)
- 7 `30aa52e` recovery.js (v0.0.7.7)
- 8 `d934c07` identification.js (v0.0.7.8) — cleanest extraction (pure functions, no DOM)
- 9 `36d3cb8` trust.js + channels.js combined (v0.0.7.9) — biggest yet (~180 lines moved); function rename deferred
- 10 `836a91b` world.js (v0.0.7.10) — first two-digit subversion (`.10`)

**Mid-session false alarm:** User reported "no signal" on localhost network panel after commit 6. Was actually browser cache showing v0.0.7.4 (DevTools Network confirmed) — once cleared, multiplayer working fine. "no signal" is the genuine empty-feed state when the visible window has no events from peers (you're filtered out as self).

**Bug list started during this session** (see top of doc) — will collate with player-submitted feedback for next bugfix patch.

**Dropoff:** Was about to push commit 11 (packages.js) when context ran low. Plan written in detail at top of this doc. Resume by pushing per that plan.

### 2026-04-14 (tlh-modules refactor — commits 1-4 done, earlier session)

Started module refactor on new branch `tlh-modules` cut from `main`. ES modules over IIFE. Sub-versioning v0.0.7.N during refactor.

**Pre-refactor commit A** (`ec9f377` on `feature/the-long-haul`, then merged to main): Realigned trust thresholds 25/50/75/100 → 20/40/60/80. Function names `tryT50/T75/T100*` kept for now — rename deferred.

**Refactor commit 1 — v0.0.7.1** (`f9b1e91`): Module port. `js/main.js` created, IIFE wrapper stripped, DOMContentLoaded guard removed. HTML script tag becomes `type="module"`. Old `the-long-haul.js` left as orphan safety net.

**Refactor commit 2 — v0.0.7.2** (`24d0b54`): State extraction. `js/state.js` exports `S` with new `S._transient` sub-object consolidating all scattered module-level `let` flags. `els` and `worldCells` as module-local aliases via `Object.assign` / `.length=0+push` patterns. Old `the-long-haul.js` reduced to comment stub.

**Refactor commit 3 — v0.0.7.3** (`077f9e8`): Constants extraction. `js/constants.js` exports ~50 tuning consts. `main.js` imports as `* as C`.

**Refactor commit 4 — v0.0.7.4** (parts: `1ece0d6` files, `533edf8` wire): Two-part push (data files first as no-op, then main.js rewrite to import from them). Created six `js/data/*.js` files — `npc-lines`, `npc-defs`, `packages`, `zones`, `glyphs`, `upgrades`. `UPGRADE_DEFS` imports `S` from state because `apply` closures mutate state.

### 2026-04-14 (v0.0.7 commit 6 — v0.0.7 complete)

Final v0.0.7 commit. Shipped as four sequential file commits on branch: CSS (`60b4df9`) → HTML (`00e5a2b`) → JS (`c56e52c`) → this doc.

**Logic:**
- **distKm accumulator**: `KM_PER_EDGE = 4.2`, `posKm()`, `accumulateDist()` with rollover handling, transient `_lastDist*` trackers (null sentinel). Old derived `if (ticks%5===0) { distKm = round(...) }` removed. Runs every walking/carrying tick. Old saves self-heal.
- **All-cargo drop**: `TRIP_LOST_DROP_CHANCE` → `TRIP_DROP_CHANCE_NORMAL = 0.20` + `TRIP_DROP_CHANCE_LOST = 0.30`. Drop check fires before tie-down in `maybeTrip()`. Normal pkg drops vanish locally (no worker); lost pkg drops go through `postLostDrop()`.

**UI:**
- Sandal at-cap stable green `#2a7a58`, no pulse.
- Boots gear popover (`⚙`) collapses `[buy] [autobuy] [clip]` into dirty-checked inline popover via `_lastGearPopKey`. Sandal badge sits beside the gear button.
- Settlements: trust bar on top (was bottom), continuous fill + 4 tick spans at 20/40/60/80%, rebuild bar dimmed (`.settle-bar-wip`), stage-2 opacity 0.65 (`.settle-stage2`).
- Channels empty state: `"no callsigns trusted yet — deliver to depots to build trust"`.
- Recovery presence badge `#recoveryBadge` in porter strip, shows `recovery ×N` when `activeRecoveryCount > 0`. Updated from `spawnRecoveryCargo`, `tryDeliver`, `init`.
- Vertical canteen bar: CSS rewritten (`4px × 14px`, absolute-positioned fill, transition `height`). JS: `canteenBar.style.height = ...%`.

**No save schema bump.** v5 stays; `_lastDist*` / `_lastGearPopKey` / `_gearPopHandler` are transient.

v0.0.7 bundle complete. Next: sticky gun + terrain scanner mini-patch → refactor pass → v0.0.8.

### 2026-04-14 (v0.0.7 commits 4a/4b + wipe fix + commit 5)

**Commit 4a** (`a105cbb`) — Trust system scaffold. NPC_DEFS at A/B/H (rho/iota/tau), `S.npcs` block, `addTrust`/`onTrustUnlock`, t25 live (adjacent stage-0 reveal), t50/t75/t100 log-only placeholders. Save schema v4 → v5. Settlements panel got trust bar.

**Commit 4b** (`466598b`) — Trust behaviors + channels + dialogue corpus.
- t50 `tryT50Warning()`: trip-risk edge > rain-incoming > low-stamina priority.
- t75 `tryT75Preview()`: scans outbound edge for any package, speaks preview.
- t100 `tryT100RestPrompt()`: log button prompt, `confirmDepotRest` restores to 105% stamina + overboost + 30 canteen + 10¢.
- Channels panel: `S.channels` FIFO (cap 6), `speak()` unshifts, `renderChannels` paints, grid layout with per-NPC color.
- Ambient chatter: `tickAmbientChatter()` every 10 ticks, per-NPC cooldown (170-345 ticks), base chance 0.005.
- ~75 dialogue lines across the 3 NPCs spanning thresholds, ambient, warnings, previews, rest.

**Wipe save bugfix + Commit 5** (`18f6914`)

Wipe fix: root cause was `beforeunload`/`visibilitychange`/`autosave` firing during `location.reload()`, calling `saveGame(true)` which re-wrote the surviving in-memory `S` after wipeSave() had cleared localStorage. Fix: `_wipeInProgress` module-level guard flag, set in `armWipe()` immediately before `wipeSave()`, never unset (module re-init on reload). `saveGame()` bails if flag set.

Commit 5: Lost cargo recovery loop.
- Constants: `TRIP_LOST_DROP_CHANCE=0.30` (replaced in commit 6), `RECOVERY_BONUS_MULT=1.5`, `RECOVERY_SOFT_CAP=3`, `RECOVERY_POLL_INTERVAL=85`, `KNOWN_PEERS_CAP=10`.
- `postLostDrop(pkg)` POSTs to worker, broadcasts `lost_drop`.
- `fetchLostFromPeer(peerId)` GETs lost list.
- `tickRecoveryAttempt()` async, throttled via `nextRecoveryAttemptTick`.
- `spawnRecoveryCargo` picks random edge, finds empty `i%8===0` cell, plants recovery pkg with 1.5x scrip. Visually identical to local lost (pink).
- `knownPeers` harvested in `pollFeed`, FIFO cap 10.
- Recovery delivery is one-shot: clears worldCell fully, decrements activeRecoveryCount, broadcasts `lost_recovered` with `forPorter`, logs "recovered X — left by PTR-YYYY".

### 2026-04-13 (v0.0.7 commit 3b: bug batch + handoff split)

Six bug list items + two new UI tweaks in a single batched patch.
- Wipe save fix (partial — completed in the wipe-fix commit above).
- Stamina drain bump: `STAMINA_DRAIN` 0.28 → 0.40.
- `rebuildRoads` → `efficientConsumption` swap with v3 → v4 save migration.
- Sandalweed cap + dial-back + satchel upgrade.
- Sandalweed badge tooltip restyle (pink pulse at cap; **commit 6 swaps to stable green**).
- Weight pips moved right: `margin-left: auto` on `.weight-segs`.
- Dispatch log fills shell.
- Custom scrollbars, 6px terminal palette.

**Save schema v3 → v4. Loader chain v4 → v3 → v2 → v1.**
**Handoff split**: spun game-specific doc out from `HANDOFF.md`.

### 2026-04-13 (mid-day — v0.0.7 commits 1-3)

**Commit 1: Cloudflare Worker** (`c9a57b9` + `8f7940f`) — worker/index.js + wrangler + README. KV namespace `c7bdbec95cd6476f9c87abf55c03fdcb`.

**Commit 2: game-side wiring** (`6d3d56d` HTML, `4020307` CSS, `fc2820c` JS) — MULTIPLAYER block, postActivity/pollFeed/startPolling/checkDistMilestones, network panel rewrite, save schema v1 → v2.

**Commit 3a: bugfix batch** (`c751caf`) — viewport fill, pickup loop fixes, sandalweed mechanic.

**Commit 3: identification stages + sandalweed dial-back** (`0fb8322`) — save schema v2 → v3 with `nodeStages` replacing `nodesKnown`, route map rewrite, stage-aware `getDisplayLabel`, `renderSettlements` filters on stage ≥ 2.

### 2026-04-13 (earlier — v0.0.6: persistence + multiplayer planning)

Music tracks added to shared player (`nav.js`). TLH v0.0.6 added full save/load persistence. Multiplayer platform decided (Cloudflare Worker + KV).

### 2026-04-13 (v0.0.5 — earliest)

Full rewrite of terrain + delivery systems. Persistent world map, world packages, proximity pickup scanning. Scroll is JS-driven via `translateX`. Note: this commit introduced the `distKm` derived formula that commit 6 replaced with a real accumulator.

---

## reference links (TLH-specific)

- Cloudflare Workers docs: https://developers.cloudflare.com/workers/
- Cloudflare KV docs: https://developers.cloudflare.com/kv/
- Live worker: https://coiledlamb.tlh-feed.workers.dev
