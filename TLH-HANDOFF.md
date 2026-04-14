# the long haul — game handoff doc
_last updated: 2026-04-14 (refactor structurally complete at v0.0.7.17, ready to merge → main)_

> Companion doc to [`HANDOFF.md`](./HANDOFF.md) (which covers site-wide infrastructure). This doc covers everything related to **The Long Haul** game: architecture, multiplayer, identification stages, persistence, bug list, future feature backlog, and game-specific session log.

---

## ✅ REFACTOR COMPLETE: ready to merge `tlh-modules` → `main`

**Branch HEAD**: `4e46610` (commit 17 — drop re-export layer, sweep dependent imports). Game is at `v0.0.7.17`. Refactor is structurally finished. Pending verification by user on hard refresh.

**What's done this session**:
- Monolithic `the-long-haul.js` (~2270 lines, single IIFE) split across 16 ES modules under `js/`.
- Five render modules under `js/render/`: `log.js`, `hud.js`, `route-map.js`, `settlements.js`, `network.js`.
- `main.js` is now ~325 lines: imports + helpers (updateDestDrift, buildRain/setRain, resolveEls) + `tick()` + `init()`. Zero exports.
- Worker quota fix deployed (commit `e8d488f`, worker v0.0.7.1) — KV exhaustion now returns 429 with `Retry-After` instead of crashing as 500.
- Stray `js/main.js.tmp-probe` file removed (commit `b051352`).
- `wrangler.toml` now gitignored; `wrangler.toml.example` template committed (real KV namespace ID was leaking into the repo otherwise — not a security hole, but a coupling smell).

**Next action when resuming**:
1. **User verifies commit 17 is green** on hard refresh (`Ctrl+Shift+R`). Most likely failure mode is a missed import → blank UI + console `SyntaxError: doesn't provide an export named '...'`. If it happens, the error message names the module + symbol; rewire and push hotfix.
2. **Merge `tlh-modules` → `main`**:
   - Drop sub-version suffix in HTML: `v0.0.7.17` → `v0.0.7`.
   - Delete orphan stub `the-long-haul.js` at repo root (still there from pre-refactor — harmless, not loaded, but should go).
   - Squash-merge or merge-commit (user's call).
   - Update both this doc and `HANDOFF.md` to reflect new file structure as the live one (no more "tlh-modules branch" framing — it IS main now).
   - Delete `tlh-modules` branch.
3. After merge: bugfix patch (collate refactor housekeeping items 1–7 + multiplayer item 8 + player feedback). Then sticky gun + terrain scanner mini-patch. Then v0.0.8.

### final file structure (live as of commit 17)

```
the-long-haul.html          ✅ at root, v0.0.7.17
the-long-haul.css           ✅ at root
the-long-haul.js            ⚠️ orphan stub still at root, delete on merge
js/
  main.js                   ✅ entry + init() + tick() + helpers (~325 lines, zero exports)
  state.js                  ✅ S object + S._transient
  constants.js              ✅ tuning values
  world.js                  ✅ buildWorld, scroll, fieldstrip
  packages.js               ✅ scanForPickup, tryDeliver, tickPkgRespawns
  trip.js                   ✅ tripChance, catchChance, maybeTrip, accumulateDist
  boots.js                  ✅ buy/autobuy/clip/tie-down/sandalweeds
  stamina.js                ✅ canteen, drinkWater, speedMultiplier, staminaSegCount
  identification.js         ✅ nodeStages helpers
  trust.js                  ✅ addTrust, onTrustUnlock, tryT50/75/100 (rename pending — bug item 1)
  channels.js               ✅ speak, renderChannels, tickAmbientChatter
  recovery.js               ✅ tickRecoveryAttempt, spawnRecoveryCargo, updatePorterStripBadges
  persistence.js            ✅ save/load/wipe/armWipe/updateSaveStrip
  multiplayer.js            ✅ getPorterId/postActivity/pollFeed/etc
  upgrades.js               ✅ renderUpgrades + buyUpgrade
  render/
    log.js                  ✅ addLog (+ private tt timestamp helper)
    hud.js                  ✅ updateHUD, renderCargoSlots, renderCourierStack
    route-map.js            ✅ drawRouteMap, updateRouteDot, layoutRouteNodes, currentEdge
    settlements.js          ✅ renderSettlements
    network.js              ✅ renderNetwork (+ private formatEvent)
  data/
    npc-lines.js            ✅
    npc-defs.js             ✅
    packages.js             ✅
    zones.js                ✅
    glyphs.js               ✅
    upgrades.js             ✅ (data with apply closures, imports S)
worker/
  index.js                  ✅ deployed at v0.0.7.1 (429 quota handling)
  wrangler.toml             ⚠️ now gitignored (real KV namespace ID), .example template in repo
```

### key architecture decisions (preserved through refactor)

- **ES modules over IIFE concat or build step**. Live deploy on Neocities uses ES modules natively; no build step.
- **Single-letter `S` for state kept** (~300 uses, established convention).
- **Transient sub-object named `_transient`** (not `runtime`) — underscore matches convention.
- **`els` and `worldCells` as module-local aliases** over `S._transient.els` / `S._transient.worldCells`. `resolveEls()` uses `Object.assign`, `buildWorld()` uses `.length=0+push` — both preserve the alias by mutating in place. **Never reassign these aliases.** Every module that uses them does `const els = S._transient.els; const worldCells = S._transient.worldCells;` at the top.
- **Constants imported as namespace**: `import * as C from './constants.js'` → `C.TICK_MS`, `C.TRIP_CHANCE_BASE` etc.
- **Data files flat in `js/data/`** (not nested). `UPGRADE_DEFS` imports `S` because `apply` closures mutate state — unusual for a data file but cleaner than a dispatch table.
- **HTML subtitle dimmed sub-version**: `v0.0.7<span style="opacity:0.6">.N</span>` — oil-text gradient renders the dimmed `.N` nearly invisible against background. User finds this charming; on merge, the subtitle drops back to plain `v0.0.7`.
- **No save schema bump during refactor**. Stays at v5. Old saves self-heal via existing ratchet in `loadGame`.
- **Circular-import-by-file pattern**: many sub-modules import from each other and from `render/*`. This is circular by file but NOT by initialization — every cross-call happens inside a function body, never at module load. ES modules handle this correctly (live bindings, populated by the time anything runs).
- **Namespace imports for modules with 3+ functions called from main.js tick/init**: `Pkg`, `Trip`, `Boots`, `Stamina`, `Upg`. Smaller modules use named imports. `render/*` modules use named imports too since each surface is small.

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
| 11 (multi-push) | landed via 4 sub-commits | packages.js | v0.0.7.11 |
| 12 | `19bea14` | trip.js | v0.0.7.12 |
| 13-14 part 1 | `7dbad92` | boots.js + stamina.js + packages wire | — |
| 13-14 part 2 | `f779ab8` | main.js + trust wire + html bump | v0.0.7.14 |
| 14 hotfix | `78ccbf6` | trip.js missed import | (stays v0.0.7.14) |
| worker fix | `e8d488f` | worker/index.js quota→429 | worker v0.0.7.1 |
| 15 | `ed2d67e` | upgrades.js | v0.0.7.15 |
| tmp-probe cleanup | `b051352` | remove main.js.tmp-probe | (no version) |
| 16 part 1 | `ddd811e` | render/* modules created (additive) | (no version) |
| 16 part 2 | `3658f79` | main.js wires render/* via re-export | v0.0.7.16 |
| html .16 bump | `4d5f48f` | HTML subtitle bump | (no version) |
| 17 | `4e46610` | drop re-export layer + sweep imports | v0.0.7.17 |

All verified green by user through commit 16 + html bump. **Commit 17 pending user verification.**

### running bug list (collate with player feedback for next bugfix patch)

**Refactor housekeeping (low-risk, mechanical):**
1. **Function renames** — `tryT50Warning` → `tryWarning`, `tryT75Preview` → `tryPreview`, `tryT100RestPrompt` → `tryRestPrompt`. Names lie about thresholds (now 20/40/60/80, not 50/75/100). Same naming inconsistency: `_lastDist*` vs `lastDist*` post-promotion to `_transient`. Deferred from commit 9 to be a focused commit so any bug isn't ambiguous between move and rename.
2. **Duplicated `pickRandom`** — exists in both `channels.js` and `recovery.js`. Trivial 3-liner. Candidate for a `util.js` if more shared helpers emerge, otherwise leave.

**Genuine code smells (not blocking, not bugs):**
3. **`saveGame` swallows storage errors silently** — quota exceeded, Safari private mode → player loses progress without knowing. Surface a more visible warning.
4. **`getNpc` exists identically in both `channels.js` and `trust.js`** — accidental dup at split. Move to identification or shared spot.
5. **`renderSettlements` reaches into `S.npcs[s.id]` directly** — encapsulation leak introduced commit 9. Now lives in `js/render/settlements.js` as of commit 16; should import `getNpc` properly when fixed.
6. **`tryT50Warning` rain logic possibly off**: `!S.isRaining && S.rainTimer > 0 && S.rainTimer < 25`. Timer counts down both during and between rain. Intent seems "rain incoming soon" but condition also true between events. User to sanity check — they wrote the rules.
7. **`_lastGearPopKey` hardcodes scrip threshold to 15** (boots cost). Should be `C.BOOT_PRICE` constant (doesn't exist; `15` appears in 4 places).

**Multiplayer / worker (still TODO game-side):**
8. **Cloudflare KV free-tier daily put quota (1000/day) easily exhausted by active testing.** Worker now returns 429 with `Retry-After` pointing at next UTC midnight (deployed at worker v0.0.7.1) instead of crashing as 500. Game-side TODO for bugfix patch:
   - **Client-side rate limit on `postActivity`**: minimum 5s cooldown between any two posts; drop duplicate types within the window.
   - **Coalesce milestone broadcasts**: if 5km/10km/15km cross in quick succession, batch into one event rather than three POSTs.
   - **429 detection UI signal**: when POSTs start 429ing, dim the network panel + show "feed throttled — broadcasts paused" instead of the misleading "no signal" (which genuinely means "empty feed", not "broken").

**~~9. Stray `js/main.js.tmp-probe` file~~** — ✅ resolved in commit `b051352`.

### user-discussed features deferred to post-refactor patch

**Save export/import (cross-browser saves)** — User asked, deferred to post-refactor "feedback patch." Plan: base64-encode `buildSavePayload` output, prefix with magic string `TLH-SAVE-v5:`, paste into textarea on import. Open question: bundle porter ID? Recommended hybrid — bundle but checkbox to opt-in on import (default off = move progress, keep new browser's identity). Avoids accidental impersonation/double-broadcast on multiplayer.

**Save on browser close** — User asked. Already handled via `beforeunload` + `visibilitychange` + autosave interval. localStorage.setItem is synchronous, no delay needed. Nothing to do.

### invariants preserved throughout refactor

- **No behavior change, ever.** Pure structural refactors. If user notices any gameplay difference, it's a bug.
- Save schema stays v5. No bump.
- Old saves self-heal via the ratchet in `loadGame`.
- `TRUST_THRESHOLDS` gameplay is `[20, 40, 60, 80]` (set in pre-refactor commit A).
- `TOTAL_CELLS = CELLS_PER_EDGE * 6 = 1560`.
- Worker URL unchanged: `https://coiledlamb.tlh-feed.workers.dev`
- localStorage keys unchanged: `tlh-save-v5`, `tlh-porter-id`.

### user preferences for working with this codebase

- User likes seeing **assumptions stated up-front before pushes** ("here's what I'm about to do, here's the one weird thing about it") — gives them a chance to redirect. Do not skip this even when the push feels obvious.
- User is fine with bold structural changes when they're well-explained, but **flag tradeoffs honestly**.
- User **pushes back when something feels weird** (e.g. asked good questions about single-letter `S`, the dimmed `.N` rendering, the "no signal" panic that turned out to be cache + correct empty-state, the KV quota 500 that turned out to be not-a-refactor-regression, the wrangler.toml placeholder leak). Take the questions seriously, don't hand-wave.
- Discuss style choices briefly and let user pick when there's no clear winner. Don't over-deliberate.
- **Commit messages should be substantive** — explain rollback path, what changed, what stayed, what to test.
- User has a list of player-submitted bugs they'll collate with the running bug list above when we hit the bugfix patch.
- User explicitly **prefers seeing ideas/suggestions when relevant**, doesn't want agent to hold back on things noticed.
- User makes a distinction between **"refactor regression" (fix immediately, don't let it ride)** and **"bugfix patch material" (defer + write to bug list)**. When in doubt, ask — but err toward fixing regressions now so the "no behavior change" claim stays honest.

### GitHub MCP workflow — lessons from this refactor

The agent has been pushing directly via `github:push_files` and `github:create_or_update_file`. No git CLI, no local sandbox that the user can see. That changes which mistakes are easy to make.

**Hard-learned rules (in priority order):**

1. **Always push multi-file commits as a single `push_files` call with ALL files in the array.** Splitting across two calls leaves the branch in a half-applied broken state. Only valid exception: the first half is fully self-consistent (e.g. commit 16 part 1 added new render/* modules without anyone importing from them — the branch kept working between part 1 and part 2).

2. **Before pushing ANY extraction that removes symbols from main's export surface, run:**
   ```bash
   grep -rn "<each removed symbol>" js/
   ```
   for every symbol leaving main. The commit 14 hotfix (`78ccbf6`) happened because `trip.js` still imported `staminaSegCount` from `./main.js` after that export moved to `./stamina.js`. Cost: one broken user session + one hotfix commit. This check takes 5 seconds.

3. **Module-init import failures cascade silently to the entire app.** If `trip.js` fails to load because of a bad import, it takes down packages (which imports trip-indirectly via trust chain) which takes down everything. Symptom: blank UI, console shows a single `SyntaxError: doesn't provide an export named '<symbol>'`. Fix: rule #2 above. Debug: check the console error — it names the failing module and missing symbol.

4. **Runtime errors inside ticked code are different** — no module-init fail, but tick bails mid-loop. Symptom: UI loads but systems don't update (distKm frozen, renderX not firing). Debug: console will have a red throw with stack trace. Ask user for it before guessing.

5. **Don't probe with junk files on the real branch.** In commit 11, created `js/main.js.tmp-probe` to test something and forgot to remove it. Cleanup landed eventually as `b051352`. If probing, use `get_file_contents` which doesn't write.

6. **Verify remote state with `get_file_contents` before editing.** Don't assume your last push is the current SHA — intermediate hotfixes happen. Pass the remote SHA back in `create_or_update_file` to get optimistic-concurrency protection.

7. **Commit message length signals care level.** User actively likes substantive commit messages explaining the why, not just what. Short messages read as sloppy.

8. **GitHub MCP tools cannot delete files** (only create/update). When deleting, route through the GitHub web UI or local `git rm` + push. Don't try to bundle deletions into a code-change commit via MCP — it can't be done.

9. **Compatibility-layer pivot is a valid strategy when an atomic cutover is too large for one push.** Commit 16 was originally planned as a 16-file atomic cutover. When that proved impractical context-wise, the pivot was: have main.js re-export the new render/* symbols under the old names, so dependent modules keep working unchanged. Commit 17 then swept the imports and dropped the layer. Two cleanly verifiable commits beat one fragile big-bang. The trade-off: main.js stays larger than its eventual target between the two commits (~370 lines vs ~325 final). Acceptable if the next commit is queued and ready.

### branch merge plan (next session)

When user verifies commit 17 green on hard refresh:
1. Drop the sub-version suffix in HTML: `v0.0.7.17` → `v0.0.7`.
2. Delete the orphan stub `the-long-haul.js` at repo root (still there from pre-refactor — harmless, not loaded, but should go).
3. Squash-merge or merge-commit to `main` (user's call).
4. Update both this doc and `HANDOFF.md` to reflect new file structure as the live one (no more "tlh-modules branch" framing — it IS main now).
5. Delete `tlh-modules` branch.

After merge: ready for the bugfix/feedback patch (collate refactor housekeeping items 1–7 + multiplayer item 8 + player feedback), then sticky gun + terrain scanner mini-patch, then v0.0.8 work.

---

## branch status
- **Live deploy**: `main` is on Neocities. `tlh-modules` ready to merge.
- Previous: `feature/the-long-haul` (merged to main as v0.0.7).
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
1. **Module refactor** ← ✅ structurally complete on `tlh-modules` at v0.0.7.17. Pending merge to main.
2. **Bugfix patch** — collate refactor housekeeping bugs (above) + player-submitted feedback.
3. **Sticky gun + terrain scanner mini-patch** — two upgrade items shipped as a small bundle. Full design below in "future upgrades".
4. **v0.0.8** — structures tab, new terrain, bigger map. (See future game features.)

---

## commit 6 — what shipped

Final commit of v0.0.7. Shipped as four sequential file commits on branch (CSS → HTML → JS → this doc).

### logic changes
1. **`distKm` accumulator.** Old derived formula (`(edgeIdx + dotT) * 4.2`) replaced with a real forward-delta accumulator. New constant `KM_PER_EDGE = 4.2`. Transient trackers `S._transient.lastDistEdgeIdx` / `S._transient.lastDistDotT` (null sentinel = first tick since load). Helpers `posKm()` and `accumulateDist()` (in `js/trip.js`) — the latter handles edge rollover (negative delta → add full loop length) and caps absurd jumps at 2× edge length. Called every walking/carrying tick. The old `if (S.ticks%5===0) { S.distKm = ... }` line is gone; `checkDistMilestones()` still runs every 5 ticks. Old saves self-heal on first post-upgrade session.

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
No bump. Schema stays v5. `distKm` is still a plain number; transient trackers are never persisted. Old saves self-heal.

### invariants preserved
- ~~Gameplay trust thresholds stay at 25/50/75/100~~ — realigned to 20/40/60/80 in pre-refactor commit A (`ec9f377`).
- `_wipeInProgress` guard intact.
- Recovery cargo is still one-shot on delivery.
- Tie-down still absorbs damage — just doesn't absorb drops.

---

## game architecture

The game (post-refactor) lives across `js/main.js` + the extracted modules listed in the file structure section above. All mutable state is in the `S` object exported from `js/state.js`. Persistent save state lives in `localStorage`.

### core loop
- The courier walks a fixed circular route of 6 edges between 6 named nodes (A → ? → B → C → H → · → A).
- `S.edgeIdx` (0–5) and `S.dotT` (0.0–1.0) track position on the route. `dotT` increments each tick by `0.006 × speedMultiplier()`. When it hits 1.0, edge advances and `tryDeliver()` fires.
- Speed is modulated by stamina segment count and boot durability.

### distance tracking (v0.0.7 commit 6)
- `KM_PER_EDGE = 4.2`. `posKm(edgeIdx, dotT) = (edgeIdx + dotT) * KM_PER_EDGE` gives current ring position.
- `accumulateDist()` runs every walking/carrying tick: computes forward delta since last tick, handles rollover (negative delta → add `edges.length * KM_PER_EDGE`), caps absurd jumps at 2× edge length, adds to `S.distKm`, updates trackers.
- `S._transient.lastDistEdgeIdx` / `S._transient.lastDistDotT` null sentinel = first tick since load.
- `posKm`/`accumulateDist` live in `js/trip.js` since commit 12.

### world map
- `buildWorld()` (in `js/world.js`) generates a flat array `worldCells[]` of exactly `CELLS_PER_EDGE × 6 = 1,560` cells at startup. World is regenerated fresh each page load — never persisted.
- Each cell: `{ html, pkg, sandal, risky, edgeIdx }`.
- `pkg` (if present): `{ size, label, kg, slots, scrip, isLost, isRecovery, recoveryFromPorter, destId, picked, respawnIn }`. `destId` is the far end of the cell's edge — stamped at generation, never changes.
- `sandal: true` flag marks harvestable sandalweed cells.
- Risky cells: edges leading to C or ? are flagged `risky: true`, applying a ×1.4 trip chance multiplier.
- Scroll is JS-driven: `renderFieldstrip()` computes `worldPosFromRoute()` → `translateX(...)` on `.tlh-fieldstrip` every tick. No CSS animation. `width: max-content` on the strip element.

### packages (in `js/packages.js`)
- Picked up by proximity scan in `scanForPickup()` — checks cells within `PKG_PICKUP_RANGE = 8` cells ahead of courier each tick.
- On pickup: `pkg.picked = true`, package copied into `S.inventory` with `_worldCell` reference for respawn. Recovery metadata (`isRecovery`, `recoveryFromPorter`) carries forward.
- On node arrival: `tryDeliver(arrivedNodeId)` delivers all inventory items with matching `destId`.
- After delivery: normal pkg gets `pkg.respawnIn = PKG_RESPAWN_TICKS (500)`. **Recovery cargo is one-shot** — `worldCell.pkg` set to null, `activeRecoveryCount` decremented, `updatePorterStripBadges()` refreshes the strip.

### trip + drop (in `js/trip.js`, v0.0.7 commit 6)
- `TRIP_DROP_CHANCE_NORMAL = 0.20`, `TRIP_DROP_CHANCE_LOST = 0.30`.
- On trip: catch roll first. If not caught, **drop check fires BEFORE tie-down**. Targets first inventory item; roll appropriate chance. Lost pkg drops via `postLostDrop()` (worker). Normal pkg vanishes locally with a log line — no worker event.
- Tie-down: if drop didn't fire and inventory > 0, consumes the tie-down to protect against damage fallback. `S.tieDownActive = false`.
- Damage fallback: if no drop and no tie-down, first item's scrip takes 25% hit (min 1).

### boots / stamina (in `js/boots.js` and `js/stamina.js`)
- `boots.js` owns: `sandalCap`, `buyBoots`, `checkAutobuy`, `refillBootClip`, `confirmClipRefill`, `toggleAutobuy`, `toggleBootsGear`, `toggleTieDown`, `renderBoots`. Tie-down lives here because the original main.js section grouped tie-down with boots/clip; Trip reads `S.tieDownActive` directly so no cross-import needed.
- `stamina.js` owns: `staminaSegCount`, `renderStamina`, `drinkWater`, `speedMultiplier`. Autodrink threshold triggers `drinkWater` from inside `renderStamina`.

### sandalweeds
- Spawn in scrub (most), road (rare), ruins (rare). Wetlands and depot approaches: never.
- Current rates: scrub 0.008, road 0.002, ruins 0.002.
- **Hoard cap**: `SANDAL_CAP_BASE = 5` (`SANDAL_CAP_UPGRADED = 25` with `sandalSatchel` upgrade). When at cap, `scanForPickup` leaves the `*` standing.
- Auto-equip when boots fail: `checkAutobuy` priority clip > sandalweed > scrip. Equipped sandalweed: `bootDurability = 30`, `usingMakeshift = true` (1.3x boot drain).
- UI: `#sandalBadge` next to the boots gear button, format `* N/cap`. **At-cap uses stable green (#2a7a58) — no pulse (commit 6).**

### identification stages (in `js/identification.js`)
- `S.nodeStages` is the single source of truth. Object keyed by node id, values 0-3.
- Stages: 0 = unknown, 1 = signal (trust t20), 2 = tier visible (walked adjacent edge), 3 = visited.
- Starting state: `A` and `H` at 3 (porter's anchors), all others at 0.
- Helpers: `getNodeStage`, `setNodeStage` (ratchet), `markEdgeAdjacent`, `getDisplayLabel`.
- `renderSettlements` (now in `js/render/settlements.js`) filters on stage ≥ 2. Stage-2 items get `.settle-stage2` class (opacity 0.65).

### NPCs + trust (in `js/trust.js` + `js/channels.js`)
- `NPC_DEFS` at A/B/H with Greek callsigns: rho (A, steady/laconic), iota (B, young/eager), tau (H, warm/observant).
- `S.npcs.{A,B,H}` = `{ trust, unlocks: {t20,t40,t60,t80}, nextChatterTick }`.
- `TRUST_THRESHOLDS = [20, 40, 60, 80]`. Gains: delivery +1, lost-delivery +2, discovery +3.
- t20: reveal stage-0 adjacent nodes to stage 1 (via `NPC_ADJACENT` table).
- t40: `tryT50Warning()` on arrival — checks trip-risk edge > rain-incoming > low-stamina, speaks first match. **Function still named `tryT50Warning` — rename to `tryWarning` deferred (see bug list item 1).**
- t60: `tryT75Preview()` scans the outbound edge for any package, speaks a preview line with size + dest. **Same — rename deferred.**
- t80: `tryT100RestPrompt()` posts log button `[rest]` → `confirmDepotRest` restores stamina to 105% (overboost), +30 canteen, +10¢. **Same — rename deferred.**

### channels / chatter (in `js/channels.js`, commit 4b)
- `S.channels` is a FIFO ring (cap 6) of NPC utterances: `{ depotId, callsign, text, ts }`.
- `speak(depotId, text)` unshifts; `renderChannels` paints.
- `tickAmbientChatter()` runs every 10 ticks, per-NPC: gated on `unlocks.t20`, per-NPC cooldown (`nextChatterTick` = 170-345 ticks), base chance 0.005 per 10-tick window.
- Per-NPC color via `[data-depot]` selector: A teal, B pink, H purple.
- **Empty state** (commit 6): `"no callsigns trusted yet — deliver to depots to build trust"`.

### lost cargo recovery (in `js/recovery.js` + `js/multiplayer.js`, commit 5)
- `postLostDrop(pkg)` POSTs to `/lost` + broadcasts `lost_drop` event.
- `fetchLostFromPeer(peerId)` GETs `/lost/:porterId`.
- `tickRecoveryAttempt()` runs each tick, throttled internally (`nextRecoveryAttemptTick` cadence = 85 ticks ≈ 30s). Soft cap `activeRecoveryCount >= 3`, plus one-per-cycle pacing via `lastRecoverySpawnTick`.
- `spawnRecoveryCargo(lostPkg, fromPorterId)` picks a random edge, finds empty cell on `i%8===0` stride, plants pkg with `isRecovery: true` + 1.5x scrip bonus. Calls `updatePorterStripBadges()` on spawn.
- `knownPeers` is a FIFO of non-self porter IDs harvested in `pollFeed` (cap 10).
- On delivery: clears `worldCell.pkg` fully (no respawn), decrements `activeRecoveryCount`, calls `updatePorterStripBadges()`, broadcasts `lost_recovered` with `forPorter`, logs "recovered X — left by PTR-YYYY".
- **Presence badge** (commit 6): `#recoveryBadge` in porter strip shows `recovery ×N` when count > 0, hidden when 0.

### persistence (schema v5 — commit 4a, in `js/persistence.js`)
- Save key: `localStorage['tlh-save-v5']`. `SAVE_VERSION = 5`.
- Loader chain: v5 → v4 → v3 → v2 → v1. Migration on load: legacy keys removed, save re-written as v5.
- v5 added `npcs: { A/B/H: { trust, unlocks } }` block (nextChatterTick is transient).
- **Saved fields**: progress (delivered, scrip, distKm, ticks, capacities, boots/clip, sandalweedCount, stamina/canteen, autobuy/autodrink), position (edgeIdx, dotT), inventory (with `_worldCell` stripped), upgrades, nodeStages, settlements supply/rebuild, multiplayer (milestonesHit, lastFeedTimestamp), npcs.
- **NOT saved**: worldCells, package respawn timers, log, rain state, tie-down, pending boot clip refill, pending depot rest, network feed/census/connected, `knownPeers`, `activeRecoveryCount`, `lastRecoverySpawnTick`, `nextRecoveryAttemptTick`, `S.channels`, `S.npcs.*.nextChatterTick`, `_transient.lastDistEdgeIdx`/`lastDistDotT`, `_transient.lastGearPopKey`.
- **Trust unlock legacy migration** (commit A): `loadGame` maps old `t25`/`t50`/`t75`/`t100` unlock keys → `t20`/`t40`/`t60`/`t80`. Plus a ratchet that auto-unlocks any tier where current trust ≥ threshold.
- Wipe save: `_wipeInProgress` guard flag set in `armWipe()` BEFORE `wipeSave()`, never unset (module re-init on reload resets). `saveGame()` bails immediately if flag set.

### rendering (post-refactor: split across `js/render/*.js`)
- `js/render/log.js`: `addLog(msg)` — dispatch log painter, dirty-trims to 14 lines. Private `tt()` timestamp helper.
- `js/render/hud.js`: `updateHUD` (delivered/scrip/walked/status, plus calls `Upg.renderUpgrades` at the bottom), `renderCargoSlots(force)` with dirty-check via `cargoKey()`, `renderCourierStack`.
- `js/render/route-map.js`: `drawRouteMap` (full SVG repaint, stage-aware colors), `updateRouteDot` (animates porter dot along active edge), `layoutRouteNodes` (init), `currentEdge` (helper used by both this module and main's `updateDestDrift`/`tick`).
- `js/render/settlements.js`: `renderSettlements` (filters stage ≥ 2, trust bar with 4 tick marks at 20/40/60/80%, rebuild bar dimmed, stage-2 dimmed, optional NPC trust block).
- `js/render/network.js`: `renderNetwork` (paints from S.networkFeed, filters self), private `formatEvent`.
- `js/boots.js` `renderBoots()`: gear popover dirty-checked via `_lastGearPopKey`. Sandal badge sibling of gear button.
- `updatePorterStripBadges()` (in `js/recovery.js`): creates/updates `#recoveryBadge` in porter strip.
- Vertical canteen bar (in `js/stamina.js` `renderStamina`): `els.canteenBar.style.height = canteenPct+'%'`.

### porter ID
- Format: `PTR-XXXX` (8 hex chars). Stored in `tlh-porter-id`. Legacy `TLH-XXXX` migrated. Survives wipe — identity, not progress.

### upgrade system
- 10 upgrades in `UPGRADE_DEFS` (in `js/data/upgrades.js`). Bought with scrip, some have prerequisites.
- `renderUpgrades` + `buyUpgrade` in `js/upgrades.js` since commit 15.
- Full list: `bootsT1/T2`, `bootClip1/2`, `steadyFeet`, `cargoSling/Pack/Weight`, `efficientConsumption`, `sandalSatchel`.

### status flow
`walking` → (pickup) → `carrying` → (node arrival + delivery) → `walking`
`walking` → (exhausted) → `resting` → (timer) → `walking` (+25% overboost)
`walking/carrying` → (trip) → `tripped` → (timer) → previous status

---

## multiplayer

### Cloudflare Worker (`worker/index.js`)
- Worker URL: `https://coiledlamb.tlh-feed.workers.dev`
- KV namespace ID: `c7bdbec95cd6476f9c87abf55c03fdcb` (now lives in `wrangler.toml` which is gitignored as of this session — committed template `wrangler.toml.example`).
- Endpoints: `POST /activity`, `GET /feed?since=`, `POST /lost`, `GET /lost/:porterId`, `GET /` (info).
- Allowed event types: `delivery`, `milestone`, `discovery`, `lost_drop`, `lost_recovered`, `trust_unlock`.
- Rate limit: 5 events/60s per porter, silent drop.
- Feed cap 200 events. Census 24h auto-prune. LOST_CAP 20 per porter FIFO.
- CORS open.
- **Worker v0.0.7.1 (deployed this session)**: KV daily-quota exhaustion now returns 429 with `Retry-After` header (seconds until UTC midnight) instead of 500. Detection in the `try/catch` at the bottom of the `fetch` handler via `isKvQuotaError(err)` helper (substring match on "limit exceeded"). Any other unhandled error still returns 500.

### game-side (in `js/multiplayer.js`)
- Constants in `MULTIPLAYER` block: `FEED_URL`, `POLL_MS = 60000`, `FEED_DISPLAY_CAP = 8`.
- `postActivity(type, data)` — fire-and-forget POST with `keepalive:true`. Silent on all errors.
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

### 2026-04-14 (refactor structurally complete — commits 15-17, worker deploy, wrangler hygiene, tmp-probe cleanup)

Long session. Picked up at commit 14 + worker quota fix landed but not deployed. Pushed commit 15, deployed the worker, cleaned the stray probe file, then landed the full render extraction across commits 16 (two parts) and 17.

**Commits this session:**
- **15 `ed2d67e`** — `js/upgrades.js`. Smallest extraction of refactor: 27 lines, 2 functions (`renderUpgrades` + `buyUpgrade`). Data already lived in `js/data/upgrades.js`. Verified green on hard refresh.
- **`b051352`** — Removed `js/main.js.tmp-probe` via GitHub web UI (MCP tools can't delete files). Bug list item 9 closed.
- **16 part 1 `ddd811e`** — Created the 5 render modules: `log.js`, `hud.js`, `route-map.js`, `settlements.js`, `network.js`. Additive only — branch kept working because nothing imported from them yet.
- **16 part 2 `3658f79`** — Cutover. main.js stopped exporting the 7 render functions inline; instead imports from render/* and re-exports under their original names. The 8 dependent modules + upgrades.js kept their `from './main.js'` imports unchanged. Compatibility-layer strategy chosen as a mid-flight pivot when the originally-planned 16-file atomic cutover proved too context-heavy.
- **`4d5f48f`** — HTML subtitle bumped to v0.0.7.16 (couldn't ride along with the main.js push above due to MCP tool constraints).
- **17 `4e46610`** — Final structural commit. Swept all 9 dependent modules (persistence, multiplayer, recovery, trust, boots, stamina, packages, trip, upgrades) to import directly from `render/*`. Dropped main.js's re-export layer + underscore-prefix import aliases. main.js is now ~325 lines, zero exports — purely orchestration. HTML bumped to v0.0.7.17 in the same push. **Pending user verification.**

**Worker deploy** (out-of-band, manual):
- User ran `wrangler deploy` from `worker/` directory. First attempt failed with `KV namespace 'REPLACE_WITH_KV_NAMESPACE_ID' is not valid` — the `wrangler.toml` had a literal placeholder string committed where the real KV namespace ID should have been.
- Discussed with user: real namespace IDs in a public repo are a coupling smell (not a security hole — IDs aren't credentials). Settled on the standard wrangler pattern: `wrangler.toml` gitignored locally, commit a `wrangler.toml.example` template instead.
- User pulled real KV ID via `wrangler kv namespace list`, filled in local `wrangler.toml`, redeployed successfully. Worker v0.0.7.1 is live — 429 quota handling now in production.

**Strategy notes captured for next time:**
- Compatibility-layer pivot (commit 16) saved the day when context ran tight. Two cleanly verifiable commits (re-export then sweep) beat one fragile big-bang. Added as lesson #9 in the GitHub MCP workflow section.
- MCP tools cannot delete files (added as lesson #8). Web UI for deletes; or local git workflow.

**Bug list status updated:**
- ~~9. Stray `js/main.js.tmp-probe`~~ ✅ closed.
- 8 still open (client-side throttling / 429 UI signal / milestone coalescing — all game-side, deferred to bugfix patch).

**Dropoff:** refactor structurally complete at v0.0.7.17. Pending user verification on hard refresh, then merge to main per the plan at top of doc.

### 2026-04-14 (tlh-modules refactor — commits 11-14 done, worker quota fix, dropoff at commit 15)

Resumed refactor from commit 10 dropoff. Pushed commits 11, 12, and 13-14 (combined), plus one hotfix and a worker-side fix. Main.js dropped from ~887 lines to 722.

**Commits this session:**
- **11 (multi-push)** — packages.js. Messy push: split across 4 sub-commits instead of the intended 1. Created stray `js/main.js.tmp-probe` during a misdirected probe attempt.
- **12 `19bea14`** — trip.js. Clean single push.
- **13-14 part 1 `7dbad92` + part 2 `f779ab8`** — boots.js + stamina.js combined. Split for payload size; intended as one atomic commit 13-14.
- **14 hotfix `78ccbf6`** — trip.js was still importing `staminaSegCount` from `./main.js` after commit 14 moved it to `./stamina.js`. Hard symptom: blank UI on user's hard refresh, console: `Uncaught SyntaxError: ... doesn't provide an export named: 'staminaSegCount'`. One-line fix. Cost: one broken user session.
- **Worker quota fix `e8d488f`** (worker v0.0.7.1) — User reported multiplayer broadcasts silently not working. DevTools Network tab showed `POST /activity` returning HTTP 500 with body `server_error: KV put() limit exceeded for the day`. Not a refactor regression — Cloudflare KV free tier 1000 puts/day cap exhausted by active dev testing. Worker patched to detect KV quota errors and return 429 with `Retry-After` instead. **Deploy pending until next session** (handled in this session, see above).

**Debugging pattern that worked for the worker 500:** asked user for DevTools Network tab output, then specifically the Response body of the failing POST. Skipped a lot of guessing.

**Bug list items added:**
- 8 — KV write quota easily exhausted; worker now handles gracefully but client-side rate limiting + UI signal still TODO.
- 9 — stray `js/main.js.tmp-probe` (closed in next session).

### 2026-04-14 (tlh-modules refactor — commits 5-10 done, earlier this day)

Continued refactor on `tlh-modules`. All ten extractions verified green by user across two sessions. Working pattern locked in: each commit announces plan with cross-call story, pushes 3 files (new module + main.js + HTML version bump), user verifies, move on.

**Commits 5-10 SHAs:**
- 5 `a65b18b` persistence.js (v0.0.7.5)
- 6 `d50beec` multiplayer.js (v0.0.7.6) — first true circular-import-by-file (addLog/renderNetwork from main)
- 7 `30aa52e` recovery.js (v0.0.7.7)
- 8 `d934c07` identification.js (v0.0.7.8) — cleanest extraction (pure functions, no DOM)
- 9 `36d3cb8` trust.js + channels.js combined (v0.0.7.9) — biggest yet (~180 lines moved); function rename deferred
- 10 `836a91b` world.js (v0.0.7.10) — first two-digit subversion (`.10`)

**Mid-session false alarm:** User reported "no signal" on localhost network panel after commit 6. Was actually browser cache showing v0.0.7.4 — once cleared, multiplayer working fine. "no signal" is the genuine empty-feed state when the visible window has no events from peers (you're filtered out as self).

**Bug list started during this session** (see top of doc).

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

**No save schema bump.** v5 stays; transient trackers never persisted.

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
