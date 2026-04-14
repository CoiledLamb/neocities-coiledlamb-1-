# the long haul — game handoff doc
_last updated: 2026-04-14_

> Companion doc to [`HANDOFF.md`](./HANDOFF.md) (which covers site-wide infrastructure). This doc covers everything related to **The Long Haul** game: architecture, multiplayer, identification stages, persistence, bug list, future feature backlog, and game-specific session log.

---

## 🚧 ACTIVE: module refactor on `tlh-modules` branch

**Branch**: `tlh-modules` (cut from `main` after v0.0.7 merge)
**Goal**: split monolithic `the-long-haul.js` (~2270 lines, single IIFE) into ES modules. Zero behavior change throughout. Sub-versioned during refactor (v0.0.7.1, .2, .3...) — sub-suffix drops on merge back to main.

**Testing setup**: `python -m http.server 8000` from repo root → `http://localhost:8000/the-long-haul.html`. User is on Windows (cmd). Hard refresh (Ctrl+Shift+R) between commits. Pre-existing benign `favicon.ico 404` — ignore.

### key architecture decisions made
- **ES modules over IIFE concat or build step**. User will go live-only post-refactor (deploy direct to Neocities), so the `file://` CORS module restriction doesn't matter — local server only during dev.
- **Single-letter `S` for state kept** (established convention, ~300 uses). Discussed and decided to keep.
- **Transient sub-object named `_transient`** (not `runtime`). Underscore matches existing convention elsewhere in codebase.
- **`els` and `worldCells` as module-local aliases** over `S._transient.els` and `S._transient.worldCells`. `resolveEls()` uses `Object.assign`, `buildWorld()` uses `.length=0+push` — both preserve the alias by mutating in place. Never reassign these aliases.
- **Constants imported as namespace**: `import * as C from './constants.js'` → `C.TICK_MS`, `C.TRIP_CHANCE_BASE` etc. Picked over named imports (40-line import list would be its own kind of noise).
- **Data files flat in `js/data/`** (not nested). Six files: `npc-lines.js`, `npc-defs.js`, `packages.js`, `zones.js`, `glyphs.js`, `upgrades.js`. `UPGRADE_DEFS` imports `S` because `apply` closures mutate state — unusual for a data file but cleaner than a dispatch table.
- **HTML subtitle dimmed sub-version**: `v0.0.7<span style="opacity:0.6">.N</span>` — but the oil-text gradient renders the dimmed `.N` nearly invisible against background. User finds this charming and chose to keep the bug. Update the `.N` value each commit anyway; user verifies via View Source.
- **No save schema bump during refactor**. Stays at v5. Old saves self-heal via existing ratchet in `loadGame`.

### target file structure
```
the-long-haul.html          (stays at root)
the-long-haul.css           (stays at root)
js/
  main.js                   - entry point + init() + tick() + remaining glue
  state.js                  ✅ S object + S._transient
  constants.js              ✅ tuning values
  world.js                  - buildWorld, worldCells, scroll/fieldstrip
  packages.js               - scanForPickup, tryDeliver, respawns
  trip.js                   - tripChance, catchChance, maybeTrip
  boots.js                  - buy/autobuy/clip/tie-down/sandalweeds merged
  stamina.js                - canteen, drinkWater, speedMultiplier
  identification.js         - nodeStages + helpers
  trust.js                  - addTrust, onTrustUnlock, tryWarning/Preview/RestPrompt
  channels.js               - speak, renderChannels, tickAmbientChatter
  recovery.js               - postLostDrop, fetchLostFromPeer, spawnRecoveryCargo
  persistence.js            - save/load/wipe, schema versioning
  multiplayer.js            - postActivity, pollFeed, census
  upgrades.js               - renderUpgrades + buyUpgrade logic
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

Note: `sandalweeds.js` merged into `boots.js`. `STATUS_COLORS` and `NODE_GLYPHS` in `data/glyphs.js`.

### commits completed on `tlh-modules`

**Commit 1 — v0.0.7.1 "plumbing"** (SHA `f9b1e91`) ✅
- Created `js/main.js` with full IIFE contents, wrapper stripped (module scope isolates), `DOMContentLoaded` guard removed (modules deferred by default).
- Updated `the-long-haul.html`: `<script src="the-long-haul.js">` → `<script type="module" src="js/main.js">`
- Old `the-long-haul.js` left at root as safety net (orphan, unreferenced).
- User verified: works fine locally.

**Commit 2 — v0.0.7.2 "state extraction"** (SHA `24d0b54`) ✅
- Created `js/state.js` exporting `S` with `_transient` sub-object.
- `S._transient` contains: `els`, `worldCells`, `cellPxWidth`, `porterIdCached`, `pollTimer`, `lastSaveAt`, `wipeArmed`, `wipeTimer`, `wipeInProgress`, `depotRestPending`, `clipRefillPending`, `lastCargoKey`, `lastGearPopKey`, `gearPopHandler`, `lastDistEdgeIdx`, `lastDistDotT` (last two promoted from `S` root).
- `main.js`: `import { S } from './state.js'`, local aliases `const els = S._transient.els; const worldCells = S._transient.worldCells;`
- `resolveEls()` uses `Object.assign`, `buildWorld()` uses `.length=0+push`.
- HTML subtitle bumped to v0.0.7.2. Old `the-long-haul.js` reduced to stub comment.
- User verified: works.

**Commit 3 — v0.0.7.3 "constants extraction"** (SHA `077f9e8`) ✅
- Created `js/constants.js` exporting ~50 tuning consts: `CELLS_PER_EDGE`, `VIEWPORT_CELLS`, `COURIER_CELL`, `PKG_PICKUP_RANGE`, `PKG_MAX_PER_EDGE`, `PKG_RESPAWN_TICKS`, `TOTAL_CELLS` (derived), `KM_PER_EDGE`, `SANDAL_CAP_BASE/UPGRADED`, `TICK_MS`, `STAMINA_DRAIN`, `BOOT_DRAIN`, `TRIP_CHANCE_BASE`, `CATCH_CHANCE_BASE`, `REST_TICKS_MIN/MAX`, `TRIP_DROP_CHANCE_NORMAL/LOST`, `RECOVERY_BONUS_MULT/SOFT_CAP/POLL_INTERVAL`, `KNOWN_PEERS_CAP`, `TRUST_THRESHOLDS [20,40,60,80]`, `TRUST_GAIN_*`, `CHANNELS_DISPLAY_CAP`, `CHATTER_INTERVAL_MIN/MAX_TICKS`, `CHATTER_BASE_CHANCE`, `DEPOT_REST_BONUS_SCRIP`, `FEED_URL`, `POLL_MS`, `FEED_DISPLAY_CAP`, `DIST_MILESTONES`, `RISKY_EDGE_DEST`, `SAVE_KEY/V2/V3/V4/V5`, `SAVE_VERSION (5)`, `AUTOSAVE_MS`.
- `main.js` imports `import * as C from './constants.js'` with all references prefixed `C.*`
- HTML subtitle v0.0.7.3. User confirmed green.

### ⚠️ commit 4 — v0.0.7.4 "data extraction" — INCOMPLETE PUSH

**Status**: Attempted in previous session. The 6 data files + main.js rewrite was bundled into one `push_files` call, but the `main.js` payload was so large the tool output truncated mid-`tick()` function. User asked next agent to pick up.

**Verified branch state at handoff time**: `js/` contains only `main.js`, `state.js`, `constants.js`. **No `js/data/` folder exists yet.** The v0.0.7.3 commit (`077f9e8`) is still HEAD of `tlh-modules` and is the working state.

**The fix**: split commit 4 into two pushes (one logical commit, two GitHub commits) to stay under the tool size limit.

#### commit 4 plan — TWO-PART PUSH

**Part 1 (push first): the 6 data files only.** No HTML change, no `main.js` change. Game continues to work because `main.js` still has its inline copies of the data. The new files exist but are unreferenced. User can verify the game still runs after part 1 — it should be 100% identical to v0.0.7.3 because nothing imports the new files yet.

**Part 2 (push second): rewritten `main.js` + HTML version bump to v0.0.7.4.** This is when the game switches to importing from the data files. `main.js` will be ~200 lines smaller (the inline data is gone, replaced by 6 import lines).

#### data file contents

All exports use named exports, all files start with `'use strict';`. Content is verbatim from current `main.js` (commit 3 / SHA `077f9e8`).

**`js/data/npc-lines.js`** — exports `NPC_LINES`. Big dialogue corpus (~75 lines): `threshold[depotId][tier]`, `ambient[depotId][]`, `warning[depotId][kind]`, `preview[depotId]`, `rest[depotId][]`. Three NPCs: A=rho, B=iota, H=tau.

**`js/data/npc-defs.js`** — exports `NPC_DEFS` and `NPC_ADJACENT`.
- `NPC_DEFS = { A: {callsign:'rho',name:'rho',depotLabel:'depot a'}, B: {callsign:'iota',...}, H: {callsign:'tau',...} }`
- `NPC_ADJACENT = { A: ['?', '\u00b7'], B: ['?', 'C'], H: ['C', '\u00b7'] }`

**`js/data/packages.js`** — exports `NPC_PKGS` (medicine/seeds/letter/tools/rations/lumber) and `LOST_PKGS` (worn journal/salvage kit/old photo).

**`js/data/zones.js`** — exports `ZONE_TYPES` (road/scrub/wetlands/ruins/depot_approach with weights, widths, chars, pkgChance, sandalChance, plus flags like `risky`, `refillsCanteen`, `isDepotApproach`).

**`js/data/glyphs.js`** — exports `NODE_GLYPHS` (two-line ASCII per node) and `STATUS_COLORS` (status string → hex).

**`js/data/upgrades.js`** — exports `UPGRADE_DEFS`. **Imports `S` from `'../state.js'`** because `apply` closures mutate state (e.g. `S.maxSlots+=2`). 10 upgrades: `bootsT1/T2`, `bootClip1/2`, `steadyFeet`, `cargoSling/Pack/Weight`, `efficientConsumption`, `sandalSatchel`.

#### main.js v0.0.7.4 import block

```js
import { S } from './state.js';
import * as C from './constants.js';
import { NPC_LINES } from './data/npc-lines.js';
import { NPC_DEFS, NPC_ADJACENT } from './data/npc-defs.js';
import { NPC_PKGS, LOST_PKGS } from './data/packages.js';
import { ZONE_TYPES } from './data/zones.js';
import { NODE_GLYPHS, STATUS_COLORS } from './data/glyphs.js';
import { UPGRADE_DEFS } from './data/upgrades.js';
```

After these imports, the inline declarations of all 9 data blobs (`ZONE_TYPES`, `NPC_PKGS`, `LOST_PKGS`, `STATUS_COLORS`, `NPC_DEFS`, `NPC_ADJACENT`, `NPC_LINES`, `NODE_GLYPHS`, `UPGRADE_DEFS`) are deleted from `main.js`. Nothing else changes — every reference to these constants in the function bodies stays exactly as-is (the imports make the names available at module scope).

#### main.js source of truth for commit 4 part 2

Take commit 3's `main.js` (SHA `077f9e8`, 76KB), remove the 9 data blocks listed above, add the 6 new import lines after the existing two imports. That's the entire diff. No logic changes, no behavior changes.

#### remaining commits after commit 4 (rough order)

The big logic extractions. Recommended order, smallest-and-safest first:
- **Commit 5** — `persistence.js` (save/load/wipe, schema constants already in C). Self-contained, easy first extraction.
- **Commit 6** — `multiplayer.js` (postActivity/pollFeed/census/getCachedPorterId/shortPorterId/checkDistMilestones).
- **Commit 7** — `recovery.js` (lost cargo recovery loop + `updatePorterStripBadges`).
- **Commit 8** — `identification.js` (`nodeStages` helpers).
- **Commit 9** — `trust.js` + `channels.js` (could combine). Good time to rename `tryT50Warning`/`tryT75Preview`/`tryT100RestPrompt` → `tryWarning`/`tryPreview`/`tryRestPrompt` since the trust thresholds were realigned to 20/40/60/80 in pre-refactor commit A. Function names still reflect old thresholds.
- **Commit 10** — `world.js` (buildWorld, worldCells, scroll, fieldstrip, calcCellPxWidth, worldPosFromRoute).
- **Commit 11** — `packages.js` (scanForPickup, tryDeliver, tickPkgRespawns, makeWorldPkg, weightedPick).
- **Commit 12** — `trip.js` (tripChance, catchChance, maybeTrip, currentCellIsRisky).
- **Commit 13** — `boots.js` (buyBoots, checkAutobuy, refillBootClip, confirmClipRefill, toggleTieDown, toggleAutobuy, toggleBootsGear, sandalCap, plus sandalweeds logic absorbed).
- **Commit 14** — `stamina.js` (drinkWater, speedMultiplier, staminaSegCount, renderStamina).
- **Commit 15** — `upgrades.js` (renderUpgrades + buyUpgrade — data already in `data/upgrades.js`).
- **Commit 16** — `render/` subdirectory (hud.js, route-map.js, settlements.js, network.js, log.js).
- **Commit 17** — Final `main.js` cleanup: just `init()` + `tick()` + entry point. Delete the orphan stub `the-long-haul.js` at repo root.

Each commit: bump HTML subtitle to next sub-version (`.5`, `.6`, ...). Commit message format: `refactor(tlh): commit N — extract <module> (v0.0.7.N)`.

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
- User pushes back when something feels weird (e.g. asked good questions about single-letter `S`, the dimmed `.N` rendering, etc.). Take the questions seriously, don't hand-wave.
- Discuss style choices briefly and let user pick when there's no clear winner. Don't over-deliberate.
- Commit messages should be substantive — explain rollback path, what changed, what stayed.

### branch merge plan (after refactor complete)

When `tlh-modules` is fully merged structurally (all extractions done, `main.js` is just init+tick+entry):
1. Drop the sub-version suffix in HTML: `v0.0.7.17` → `v0.0.7` again.
2. Delete the orphan stub `the-long-haul.js` at repo root.
3. Squash-merge or merge-commit to `main` (user's call).
4. Update both this doc and `HANDOFF.md` to reflect new file structure.
5. Delete `tlh-modules` branch.

After merge: ready for sticky gun + terrain scanner mini-patch (designed below in "future upgrades"), then v0.0.8 work.

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
2. **Sticky gun + terrain scanner mini-patch** — two upgrade items shipped as a small bundle. Full design below in "future upgrades".
3. **v0.0.8** — structures tab, new terrain, bigger map. (See future game features.)

---

## commit 6 — what shipped

Final commit of v0.0.7. Shipped as four sequential file commits on branch (CSS → HTML → JS → this doc).

### logic changes
1. **`distKm` accumulator.** Old derived formula (`(edgeIdx + dotT) * 4.2`) replaced with a real forward-delta accumulator. New constant `KM_PER_EDGE = 4.2`. Transient trackers `S._lastDistEdgeIdx` / `S._lastDistDotT` (null sentinel = first tick since load). Helpers `posKm()` and `accumulateDist()` — the latter handles edge rollover (negative delta → add full loop length) and caps absurd jumps at 2× edge length. Called every walking/carrying tick. The old `if (S.ticks%5===0) { S.distKm = ... }` line is gone; `checkDistMilestones()` still runs every 5 ticks. Old saves self-heal on first post-upgrade session (load stale derived value, then accumulate forward from there).

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

## pending refactors (scheduled post-v0.0.7, pre-v0.0.8)

**1. Trust threshold / visual breakpoint realignment** ✅ DONE in pre-refactor commit A (`ec9f377`).

**2. General refactor pass** ← IN PROGRESS on `tlh-modules`. See top section.

**3. Old `distKm` saved values** — fine as-is, comment in load path.

---

## game architecture

The game lives entirely in `the-long-haul.js` as a self-contained IIFE. All mutable state is in the `S` object. Persistent save state lives in `localStorage`.

> **Note**: the above describes pre-refactor architecture (still accurate on `main`). On the `tlh-modules` branch, the game is split across `js/main.js`, `js/state.js`, `js/constants.js`, and `js/data/*.js` (in progress). The behavior described below is identical on both branches.

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
- Helpers: `getNodeStage`, `setNodeStage` (ratchet), `markEdgeAdjacent`, `getDisplayLabel`.
- `renderSettlements` filters on stage ≥ 2. Stage-2 items get `.settle-stage2` class (opacity 0.65).

### NPCs + trust (commit 4a/4b, realigned in commit A)
- `NPC_DEFS` at A/B/H with Greek callsigns: rho (A, steady/laconic), iota (B, young/eager), tau (H, warm/observant).
- `S.npcs.{A,B,H}` = `{ trust, unlocks: {t20,t40,t60,t80}, nextChatterTick }`. (Was `{t25,t50,t75,t100}` pre-commit A.)
- `TRUST_THRESHOLDS = [20, 40, 60, 80]`. Gains: delivery +1, lost-delivery +2, discovery +3.
- t20: reveal stage-0 adjacent nodes to stage 1 (via `NPC_ADJACENT` table).
- t40: `tryT50Warning()` on arrival — checks trip-risk edge > rain-incoming > low-stamina, speaks first match. **Function still named `tryT50Warning` — rename to `tryWarning` deferred to refactor commit 9.**
- t60: `tryT75Preview()` scans the outbound edge for any package, speaks a preview line with size + dest. **Same — rename deferred.**
- t80: `tryT100RestPrompt()` posts log button `[rest]` → `confirmDepotRest` restores stamina to 105% (overboost), +30 canteen, +10¢. **Same — rename deferred.**

### channels / chatter (commit 4b)
- `S.channels` is a FIFO ring (cap 6) of NPC utterances: `{ depotId, callsign, text, ts }`.
- `speak(depotId, text)` unshifts; `renderChannels` paints.
- `tickAmbientChatter()` runs every 10 ticks, per-NPC: gated on `unlocks.t20` (was `t25`), per-NPC cooldown (`nextChatterTick` = 170-345 ticks), base chance 0.005 per 10-tick window.
- Per-NPC color via `[data-depot]` selector: A teal, B pink, H purple.
- **Empty state** (commit 6): `"no callsigns trusted yet — deliver to depots to build trust"`.

### lost cargo recovery (commit 5)
- `postLostDrop(pkg)` POSTs to `/lost` + broadcasts `lost_drop` event.
- `fetchLostFromPeer(peerId)` GETs `/lost/:porterId`.
- `tickRecoveryAttempt()` runs each tick, throttled internally (`nextRecoveryAttemptTick` cadence = 85 ticks ≈ 30s). Soft cap `activeRecoveryCount >= 3`, plus one-per-cycle pacing via `lastRecoverySpawnTick`.
- `spawnRecoveryCargo(lostPkg, fromPorterId)` picks a random edge, finds empty cell on `i%8===0` stride, plants pkg with `isRecovery: true` + 1.5x scrip bonus. Calls `updatePorterStripBadges()` on spawn.
- `knownPeers` is a FIFO of non-self porter IDs harvested in `pollFeed` (cap 10).
- On delivery: clears `worldCell.pkg` fully (no respawn), decrements `activeRecoveryCount`, calls `updatePorterStripBadges()`, broadcasts `lost_recovered` with `forPorter`, logs "recovered X — left by PTR-YYYY".
- **Presence badge** (commit 6): `#recoveryBadge` in porter strip shows `recovery ×N` when count > 0, hidden when 0.

### persistence (schema v5 — commit 4a)
- Save key: `localStorage['tlh-save-v5']`. `SAVE_VERSION = 5`.
- Loader chain: v5 → v4 → v3 → v2 → v1. Migration on load: legacy keys removed, save re-written as v5.
- v5 added `npcs: { A/B/H: { trust, unlocks } }` block (nextChatterTick is transient).
- **Saved fields**: progress (delivered, scrip, distKm, ticks, capacities, boots/clip, sandalweedCount, stamina/canteen, autobuy/autodrink), position (edgeIdx, dotT), inventory (with `_worldCell` stripped), upgrades, nodeStages, settlements supply/rebuild, multiplayer (milestonesHit, lastFeedTimestamp), npcs.
- **NOT saved**: worldCells, package respawn timers, log, rain state, tie-down, pending boot clip refill, pending depot rest, network feed/census/connected, `knownPeers`, `activeRecoveryCount`, `lastRecoverySpawnTick`, `nextRecoveryAttemptTick`, `S.channels`, `S.npcs.*.nextChatterTick`, `_lastDistEdgeIdx`/`_lastDistDotT` (commit 6), `_lastGearPopKey` (commit 6).
- **Trust unlock legacy migration** (commit A): `loadGame` maps old `t25`/`t50`/`t75`/`t100` unlock keys → `t20`/`t40`/`t60`/`t80`. Plus a ratchet that auto-unlocks any tier where current trust ≥ threshold.
- Wipe save: `_wipeInProgress` guard flag set in `armWipe()` BEFORE `wipeSave()`, never unset (module re-init on reload resets). `saveGame()` bails immediately if flag set.

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

### 2026-04-14 (tlh-modules refactor — commits 1-3 done, commit 4 pending)

Started module refactor on new branch `tlh-modules` cut from `main`. ES modules over IIFE. Sub-versioning v0.0.7.N during refactor.

**Pre-refactor commit A** (`ec9f377` on `feature/the-long-haul`, then merged to main): Realigned trust thresholds 25/50/75/100 → 20/40/60/80. Function names `tryT50/T75/T100*` kept for now — rename deferred to refactor commit 9.

**Refactor commit 1 — v0.0.7.1** (`f9b1e91`): Module port. `js/main.js` created, IIFE wrapper stripped, DOMContentLoaded guard removed. HTML script tag becomes `type="module"`. Old `the-long-haul.js` left as orphan safety net.

**Refactor commit 2 — v0.0.7.2** (`24d0b54`): State extraction. `js/state.js` exports `S` with new `S._transient` sub-object consolidating all scattered module-level `let` flags. `els` and `worldCells` as module-local aliases via `Object.assign` / `.length=0+push` patterns. Old `the-long-haul.js` reduced to comment stub.

**Refactor commit 3 — v0.0.7.3** (`077f9e8`): Constants extraction. `js/constants.js` exports ~50 tuning consts. `main.js` imports as `* as C`.

**Refactor commit 4 — v0.0.7.4 (PENDING)**: Data extraction blocked by tool size limit (single push exceeded payload). Plan written above in top section: split into two-part push (data files first, then main.js rewrite).

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
