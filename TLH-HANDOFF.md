# the long haul — game handoff doc
_last updated: 2026-04-14_

> Companion doc to [`HANDOFF.md`](./HANDOFF.md) (which covers site-wide infrastructure). This doc covers everything related to **The Long Haul** game: architecture, multiplayer, identification stages, persistence, bug list, future feature backlog, and game-specific session log.

---

## branch status
- Active development branch: `feature/the-long-haul`
- **Not merged to main/live yet.** The user verifies by loading the HTML directly from the branch — bugs found are real branch bugs, not deployment issues.
- Push convention: full version drops (e.g. v0.0.5 → v0.0.6 → v0.0.7) get pushed to the feature branch when ready. Small bugfixes are batched between version drops and pushed together. Site-wide changes (like adding the music tracks to `nav.js`) can be pushed to `main` separately, as long as they don't expose unfinished TLH-specific work.

---

## v0.0.7 — multi-system bundle

The v0.0.7 bundle interlocks **four systems** that mutually reinforce each other. The decision was made to ship them together rather than piecemeal because they only feel right when present together.

**Four systems:**
1. **Async multiplayer backend** (Cloudflare Worker + KV) — ✅ shipped commits 1-2
2. **Progressive node identification** (??? → signal → tier → full label) — ✅ shipped commit 3
3. **Trust meter with NPCs** — ✅ shipped commits 4a/4b
4. **Settlement quote evolution** — ⏳ commit 6

**Commit progress:**
- ✅ Commits 1, 2, 3a, 3, 3b (detailed below in session log)
- ✅ **Commit 4a** (`a105cbb`) — Trust system scaffold: NPCs at A/B/H with Greek callsigns (rho/iota/tau), `S.npcs` state, `addTrust`/`onTrustUnlock`, t25 live (reveals adjacent stage-0 nodes to stage 1). Save schema v4→v5.
- ✅ **Commit 4b** (`466598b`) — Trust behaviors + channels panel + ~75 dialogue lines. t50 warnings on arrival (trip>rain>stamina), t75 package previews, t100 depot rest prompt (full stamina + 5% overboost + 10¢ + canteen). Channels panel with grid layout + ambient chatter (CHATTER_BASE_CHANCE=0.005, 60-120s per-NPC cooldown).
- ✅ **Wipe save bugfix + Commit 5** (`18f6914`) — Wipe fix: `_wipeInProgress` guard flag prevents autosave/beforeunload/visibilitychange handlers from re-writing state during the 400ms reload window. Commit 5: lost cargo recovery loop — worker `/lost` POST + `/lost/:porterId` GET, `spawnRecoveryCargo` on known-peer-id pool (harvested from feed), RECOVERY_SOFT_CAP=3, RECOVERY_BONUS_MULT=1.5, recovery cargo is one-shot (no respawn on delivery).
- ⏳ **Commit 6** — Settlement quote evolution + final UI polish. **Not started yet.** Full planning block below.

After commit 6 ships, drop a small **mini-patch** with sticky gun + terrain scanner (see "future upgrades" section below) before moving on to v0.0.8/v0.0.9. A **general refactor pass** is also scheduled between commit 6 and v0.0.8 (see "pending refactors" below).

---

## commit 6 — planning (NOT YET STARTED)

Commit 6 is the last commit of v0.0.7. It bundles two bug fixes, a scope-widened cargo-drop rework, and UI polish. Plan is locked — ready to implement in a fresh session.

### bugs to fix

**1. `distKm` accumulator (pre-existing v0.0.5 bug)**

Current code derives `S.distKm` from `(edgeIdx + dotT) * 4.2` every 5 ticks. Because `S.edgeIdx` defaults to 2, after wipe + reload the display shows ~8.4km before the porter has walked anywhere. It's a derived "current ring position" value, not a total-walked accumulator.

Fix:
- Add constant `KM_PER_EDGE = 4.2` near top of file.
- Add transient state (not saved): `S._lastDistEdgeIdx = null`, `S._lastDistDotT = null`.
- Add helper `posKm(edgeIdx, dotT) => (edgeIdx + dotT) * KM_PER_EDGE`.
- Add `accumulateDist()` that computes forward delta between last tick and now, handles edge rollover (negative delta → add full loop length), adds to `S.distKm`, and updates the `_lastDist*` trackers.
- Call `accumulateDist()` each tick inside the walking/carrying block.
- **Remove** the old `if (S.ticks%5===0) { S.distKm = Math.round(...) }` line. Keep `checkDistMilestones()` there.
- Old saves will have slightly-off `distKm` values for the first post-upgrade session (since it was a derived value). Add a comment noting this — no migration needed, it self-heals.

**2. All cargo drop on trip (scope widened from commit 5)**

Commit 5 only dropped lost cargo on trip. Widen to all cargo:
- Replace `TRIP_LOST_DROP_CHANCE = 0.30` with two constants: `TRIP_DROP_CHANCE_NORMAL = 0.20` and `TRIP_DROP_CHANCE_LOST = 0.30`.
- In `maybeTrip()`: drop check fires **BEFORE** tie-down check. Tie-down protects damage only, not drops — fate takes the cargo regardless.
- Pick first item in inventory; roll appropriate chance based on `isLost`. Dropped normal cargo doesn't hit the worker (worker only stores `lost_drop` events); just removes it from inventory and logs the loss. Dropped lost cargo goes through existing `postLostDrop()` path.
- Existing fall-through (damage-first-item-scrip-by-25%) still applies when drop roll fails.

### visual changes

**3. Sandalweed at-cap: kill pulse, stable green**

Current `.sandal-badge.at-cap` animates pink via `overboost-pulse`. Change to stable green matching `.fc-sw-plant` (#2a7a58). Remove `animation` line from the at-cap rule — it's visually noisy and not carrying meaning (cap is fine, not urgent).

**4. Boots row gear popover**

Boots row currently has `[buy]` `[autobuy]` `clip: N/M` visible at all times, eating horizontal space. Collapse into a single `⚙` gear icon that opens a small inline popover with all three actions. Recovers ~30% row width. Sandalweed badge stays visible outside the popover (it's a status indicator, not an action).

**5. Settlements panel rebuild**

Current panel has: name, rebuild bar, trust bar (if NPC + stage 3), quote.

New layout:
- Trust bar **on top** (when NPC present + stage 3 — currently at bottom, moving it up).
- Trust bar: **continuous fill with vertical tick marks at 20/40/60/80**. (NOT a pip/segment meter — user confirmed continuous-with-ticks.)
- Rebuild bar: keep it, but **faded/recessed** — it's a placeholder for a future real rebuild mechanic. Dim opacity, tag somewhere inline that it's a WIP indicator.
- Stage-2 settlements: subtle opacity reduction on the whole entry (they're unconfirmed, de-emphasize).

**6. Channels empty state copy**

Current: `"no chatter yet"`. Change to: `"no callsigns trusted yet — deliver to depots to build trust"`. Tells new players why it's empty and what unlocks it.

**7. Recovery cargo presence badge**

Add small subtle indicator on porter strip showing active recovery count when >0. New `updatePorterStripBadges()` function called from `spawnRecoveryCargo` and `tryDeliver` (when recovery count changes). Keep it unobtrusive — it's ambient presence, not a call to action.

**8. Vertical canteen bar**

Current `.canteen-bar-wrap` is a horizontal 28px-wide × 3px-tall bar on the stamina row. Render it vertically — narrow width, full row height, fill grows bottom-to-top. Saves horizontal space on the row. Current CSS:
```
.canteen-bar-wrap { width: 28px; height: 3px; ... }
.canteen-bar-fill { height: 100%; transition: width 0.4s; }
```
Needs full rewrite — swap dimensions, change the JS `els.canteenBar.style.width = canteenPct+'%'` to set height instead.

### out of scope for commit 6 (explicitly deferred)

- Right-column density restructuring
- Channel line tier tinting
- Settlement quote evolution (the actual 3-stage × 6-settlement quote rewrite) — deferred until the rebuild mechanic is real. Commit 6 is UI-polish only; the "settlement quote evolution" bullet for v0.0.7 slips to post-v0.0.7.

### acceptance: after commit 6

- v0.0.7 is **done**. Merge to main when ready.
- Then ship the sticky gun + terrain scanner mini-patch.
- Then the refactor pass.
- Then v0.0.8.

---

## pending refactors (scheduled post-commit-6, pre-v0.0.8)

Items surfaced during v0.0.7 that should be cleaned up before v0.0.8 introduces more complexity.

**1. Trust threshold / visual breakpoint realignment**

`TRUST_THRESHOLDS = [25, 50, 75, 100]` drives gameplay unlocks (t25 identification hints, t50 warnings, t75 previews, t100 rest). The settlements panel trust bar (rebuilt in commit 6) uses visual tick marks at **20/40/60/80** — chosen for visual rhythm, not gameplay alignment.

These are intentionally misaligned right now. They should be realigned. Two options:
- (a) Move thresholds to 20/40/60/80 to match the visual (minor rebalance — unlocks come 5% earlier, marginal).
- (b) Move ticks to 25/50/75/100 to match gameplay (visual is less clean — four evenly-spaced ticks fit better at 20-step intervals than 25-step).

Leaning (a) — gameplay impact is negligible and visual clarity matters more. Do the rebalance before v0.0.8 ships any new trust-gated content.

**2. General refactor pass**

After 6+ commits in v0.0.7, the JS file is ~2100 lines and some areas have drifted:
- `tick()` is doing too much — extract phases (status machine, movement, edge transition, rendering) into clearer sub-functions.
- NPC trust / channels / chatter could probably consolidate into a module-like block.
- Inline dialogue lines (`NPC_LINES`) are fine where they are, but worth reviewing whether they belong in a separate data file once the corpus grows.
- Save/load is 200+ lines and mostly repetitive field-by-field checks. Worth a helper like `loadNumeric(p, 'delivered')`.
- Transient state flags (`_lastDistEdgeIdx`, `_wipeInProgress`, etc.) are scattered — consider collecting them in a single `_transient` sub-object.

Goal: zero behavior change, just code clarity. Will make v0.0.8 (structures tab, new terrain) easier to land.

**3. Old `distKm` saved values**

After commit 6 ships the accumulator, old saves will load their stale derived-value `distKm` once and then accumulate correctly from there. No migration, just a comment on the load path. Can be cleaned up later — or leave the comment in place as context for future readers.

---

## game architecture

The game lives entirely in `the-long-haul.js` as a self-contained IIFE. All mutable state is in the `S` object. Persistent save state lives in `localStorage`.

### core loop
- The courier walks a fixed circular route of 6 edges between 6 named nodes (A → ? → B → C → H → · → A).
- `S.edgeIdx` (0–5) and `S.dotT` (0.0–1.0) track position on the route. `dotT` increments each tick by `0.006 × speedMultiplier()`. When it hits 1.0, edge advances and `tryDeliver()` fires.
- Speed is modulated by stamina segment count and boot durability.

### world map
- `buildWorld()` generates a flat array `worldCells[]` of exactly `CELLS_PER_EDGE × 6 = 1,560` cells at startup. World is regenerated fresh each page load — never persisted.
- Each cell: `{ html, pkg, sandal, risky, edgeIdx }`.
- `pkg` (if present): `{ size, label, kg, slots, scrip, isLost, isRecovery, recoveryFromPorter, destId, picked, respawnIn }`. `destId` is the far end of the cell's edge — stamped at generation, never changes.
- `sandal: true` flag marks harvestable sandalweed cells.
- Risky cells: edges leading to C or ? are flagged `risky: true`, applying a ×1.4 trip chance multiplier.
- Scroll is JS-driven: `renderFieldstrip()` computes `worldPosFromRoute()` → `translateX(...)` on `.tlh-fieldstrip` every tick. No CSS animation. `width: max-content` on the strip element. Render count is dynamically sized to actual viewport width.

### packages
- Picked up by proximity scan in `scanForPickup()` — checks cells within `PKG_PICKUP_RANGE = 8` cells ahead of courier each tick.
- On pickup: `pkg.picked = true`, package copied into `S.inventory` with `_worldCell` reference for respawn. Recovery metadata (`isRecovery`, `recoveryFromPorter`) carries forward.
- On node arrival: `tryDeliver(arrivedNodeId)` delivers all inventory items with matching `destId`.
- After delivery: normal pkg gets `pkg.respawnIn = PKG_RESPAWN_TICKS (500)`. **Recovery cargo is one-shot** — `worldCell.pkg` set to null, `activeRecoveryCount` decremented.

### sandalweeds
- Spawn in scrub (most), road (rare), ruins (rare). Wetlands and depot approaches: never.
- Current rates: scrub 0.008, road 0.002, ruins 0.002.
- **Hoard cap**: `SANDAL_CAP_BASE = 5` (`SANDAL_CAP_UPGRADED = 25` with `sandalSatchel` upgrade). When at cap, `scanForPickup` leaves the `*` standing.
- Auto-equip when boots fail: `checkAutobuy` priority clip > sandalweed > scrip. Equipped sandalweed: `bootDurability = 30`, `usingMakeshift = true` (1.3x boot drain).
- UI: `#sandalBadge` in boots row, format `* N/cap`. **Commit 6 changes the at-cap visual from pink pulse to stable green (#2a7a58).**

### identification stages
- `S.nodeStages` is the single source of truth. Object keyed by node id, values 0-3.
- Stages: 0 = unknown, 1 = signal (trust t25), 2 = tier visible (walked adjacent edge), 3 = visited.
- Starting state: `A` and `H` at 3 (porter's anchors), all others at 0.
- Helpers: `getNodeStage`, `setNodeStage` (ratchet), `markEdgeAdjacent`, `getDisplayLabel`.
- `renderSettlements` filters on stage ≥ 2.

### NPCs + trust (commit 4a/4b)
- `NPC_DEFS` at A/B/H with Greek callsigns: rho (A, steady/laconic), iota (B, young/eager), tau (H, warm/observant).
- `S.npcs.{A,B,H}` = `{ trust, unlocks: {t25,t50,t75,t100}, nextChatterTick }`.
- `TRUST_THRESHOLDS = [25, 50, 75, 100]`. Gains: delivery +1, lost-delivery +2, discovery +3.
- t25: reveal stage-0 adjacent nodes to stage 1 (via `NPC_ADJACENT` table).
- t50: `tryT50Warning()` on arrival — checks trip-risk edge > rain-incoming > low-stamina, speaks first match.
- t75: `tryT75Preview()` scans the outbound edge for any package, speaks a preview line with size + dest.
- t100: `tryT100RestPrompt()` posts log button `[rest]` → `confirmDepotRest` restores stamina to 105% (overboost), +30 canteen, +10¢.
- **TODO**: thresholds 25/50/75/100 vs visual breakpoints 20/40/60/80 misaligned — see pending refactors.

### channels / chatter (commit 4b)
- `S.channels` is a FIFO ring (cap 6) of NPC utterances: `{ depotId, callsign, text, ts }`.
- `speak(depotId, text)` unshifts; `renderChannels` paints.
- `tickAmbientChatter()` runs every 10 ticks, per-NPC: gated on `unlocks.t25`, per-NPC cooldown (`nextChatterTick` = 170-345 ticks), base chance 0.005 per 10-tick window.
- Per-NPC color via `[data-depot]` selector: A teal, B pink, H purple.
- **Commit 6 changes empty state copy to `"no callsigns trusted yet — deliver to depots to build trust"`.**

### lost cargo recovery (commit 5)
- `postLostDrop(pkg)` POSTs to `/lost` + broadcasts `lost_drop` event.
- `fetchLostFromPeer(peerId)` GETs `/lost/:porterId`.
- `tickRecoveryAttempt()` runs each tick, throttled internally (`nextRecoveryAttemptTick` cadence = 85 ticks ≈ 30s). Soft cap `activeRecoveryCount >= 3`, plus one-per-cycle pacing via `lastRecoverySpawnTick`.
- `spawnRecoveryCargo(lostPkg, fromPorterId)` picks a random edge, finds empty cell on `i%8===0` stride, plants pkg with `isRecovery: true` + 1.5x scrip bonus.
- `knownPeers` is a FIFO of non-self porter IDs harvested in `pollFeed` (cap 10).
- On delivery: clears `worldCell.pkg` fully (no respawn), decrements `activeRecoveryCount`, broadcasts `lost_recovered` with `forPorter`, logs "recovered X — left by PTR-YYYY".

### persistence (schema v5 — commit 4a)
- Save key: `localStorage['tlh-save-v5']`. `SAVE_VERSION = 5`.
- Loader chain: v5 → v4 → v3 → v2 → v1. Migration on load: legacy keys removed, save re-written as v5.
- v5 added `npcs: { A/B/H: { trust, unlocks } }` block (nextChatterTick is transient).
- **Saved fields**: progress (delivered, scrip, distKm, ticks, capacities, boots/clip, sandalweedCount, stamina/canteen, autobuy/autodrink), position (edgeIdx, dotT), inventory (with `_worldCell` stripped), upgrades, nodeStages, settlements supply/rebuild, multiplayer (milestonesHit, lastFeedTimestamp), npcs.
- **NOT saved**: worldCells, package respawn timers, log, rain state, tie-down, pending boot clip refill, pending depot rest, network feed/census/connected, `knownPeers`, `activeRecoveryCount`, `lastRecoverySpawnTick`, `nextRecoveryAttemptTick`, `S.channels`, `S.npcs.*.nextChatterTick`, **`_lastDistEdgeIdx`/`_lastDistDotT` (commit 6)**.
- Wipe save: `_wipeInProgress` guard flag set in `armWipe()` BEFORE `wipeSave()`, never unset (module re-init on reload resets). `saveGame()` bails immediately if flag set. This prevents unload handlers from re-writing in-memory state during the 400ms reload window.

### rendering
- `renderCargoSlots(force)` has dirty-check via `cargoKey()`. Tooltip uses `getDisplayLabel(pkg.destId)` + recovery tag.
- Weight pips right-aligned via `margin-left: auto`.
- Courier stack: all carried packages stacked above `@`. Recovery/lost both pink.
- `renderChannels` in right-column panel.
- **Commit 6 adds**: `updatePorterStripBadges()` for recovery presence indicator; vertical canteen bar; gear popover for boots actions; rebuilt settlements panel (trust on top, continuous bar + ticks, dimmed rebuild, stage-2 opacity).

### porter ID
- Format: `PTR-XXXX` (8 hex chars). Stored in `tlh-porter-id`. Legacy `TLH-XXXX` migrated. Survives wipe — identity, not progress.

### upgrade system
- 10 upgrades in `UPGRADE_DEFS`. Bought with scrip, some have prerequisites.
- Full list: `bootsT1/T2`, `bootClip1/2`, `steadyFeet`, `cargoSling/Pack/Weight`, `efficientConsumption`, `sandalSatchel`.

### status flow
`walking` → (pickup) → `carrying` → (node arrival + delivery) → `walking`
`walking` → (exhausted) → `resting` → (timer) → `walking` (+25% overboost)
`walking/carrying` → (trip) → `tripped` → (timer) → previous status
Tie-down: armed intercepts one trip that would DAMAGE cargo. **Commit 6 changes this: drop check fires BEFORE tie-down, tie-down protects damage only.**

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

## future upgrades — mini-patch after commit 6

Two upgrades shipping as a small mini-patch between commit 6 and v0.0.8. Acquisition: upgrades menu now; long-term plan to migrate to NPC trust rewards once map expands.

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

## TLH future game features (post-commit-6, do not implement yet)

**Structures tab**: postboxes, rainfall canopies, generators, lookout posts, ziplines, shelters, drone bays. Built on paths, degrade, upgradeable. Multiplayer per Tier 2.

**New terrain types**: deserts, rivers (bridgeable), slopes/elevation/mountains.

**Bigger map**: grow route beyond 6 nodes. Unlocks trust-reward acquisition for sticky gun + scanner.

**Hot springs**: field stamina restore with wait time cost.

---

## TLH session log

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
- Constants: `TRIP_LOST_DROP_CHANCE=0.30`, `RECOVERY_BONUS_MULT=1.5`, `RECOVERY_SOFT_CAP=3`, `RECOVERY_POLL_INTERVAL=85`, `KNOWN_PEERS_CAP=10`.
- `postLostDrop(pkg)` POSTs to worker, broadcasts `lost_drop`.
- `fetchLostFromPeer(peerId)` GETs lost list.
- `tickRecoveryAttempt()` async, throttled via `nextRecoveryAttemptTick`.
- `spawnRecoveryCargo` picks random edge, finds empty `i%8===0` cell, plants recovery pkg with 1.5x scrip. Visually identical to local lost (pink).
- `knownPeers` harvested in `pollFeed`, FIFO cap 10.
- Recovery delivery is one-shot: clears worldCell fully, decrements activeRecoveryCount, broadcasts `lost_recovered` with `forPorter`, logs "recovered X — left by PTR-YYYY".

User verified commit 4b + wipe fix live. Smart call on widening cargo drop: all cargo can drop on trip, not just lost (finalized for commit 6).

### 2026-04-13 (latest — v0.0.7 commit 3b: bug batch + handoff split)

**Bug batch (commit 3b on `feature/the-long-haul`)**

Shipped six bug list items + two new UI tweaks in a single batched patch.

- **Wipe save fix (incomplete)**: `armWipe()` confirmed-wipe path triggers `location.reload()` after 400ms. This was partially broken — full fix landed in the wipe-fix commit above.
- **Stamina drain bump**: `STAMINA_DRAIN` 0.28 → 0.40.
- **`rebuildRoads` → `efficientConsumption` swap** with v3 → v4 save migration.
- **Sandalweed cap + dial-back + satchel upgrade**: `SANDAL_CAP_BASE = 5`, `SANDAL_CAP_UPGRADED = 25`, `sandalCap()` helper, spawn rates dialed back.
- **Sandalweed badge tooltip restyle**: `.has-tooltip` hoisted to generic class, cargo-style multi-line tooltip. Green tint, pink pulse at cap (**commit 6 changes this to stable green**).
- **Weight pips moved right**: `margin-left: auto` on `.weight-segs`.
- **Dispatch log fills shell**: `.tlh-shell` flex column, panels `flex: 1; min-height: 0; overflow-y: auto`.
- **Custom scrollbars**: 6px, terminal palette.

**Save schema v3 → v4. Loader chain v4 → v3 → v2 → v1.**

**Handoff split**: spun game-specific doc out from `HANDOFF.md`.

### 2026-04-13 (mid-day — v0.0.7 commits 1-3 + bug list capture)

Shipped four commits: Cloudflare Worker deployed, game-side multiplayer wiring, bugfix batch, identification stages.

**Commit 1: Cloudflare Worker** (`c9a57b9` + `8f7940f`) — worker/index.js + wrangler + README. KV namespace `c7bdbec95cd6476f9c87abf55c03fdcb`.

**Commit 2: game-side wiring** (`6d3d56d` HTML, `4020307` CSS, `fc2820c` JS) — MULTIPLAYER block, postActivity/pollFeed/startPolling/checkDistMilestones, network panel rewrite, save schema v1 → v2. User verified via screenshot.

**Commit 3a: bugfix batch** (`c751caf`) — viewport fill, pickup loop fixes, sandalweed mechanic.

**Commit 3: identification stages + sandalweed dial-back** (`0fb8322`) — save schema v2 → v3 with `nodeStages` replacing `nodesKnown`, route map rewrite, stage-aware `getDisplayLabel`, `renderSettlements` filters on stage ≥ 2.

### 2026-04-13 (earlier — v0.0.6: persistence + multiplayer planning)

Music tracks added to shared player (`nav.js`). TLH v0.0.6 added full save/load persistence. Multiplayer platform decided (Cloudflare Worker + KV).

### 2026-04-13 (v0.0.5 — earliest)

Full rewrite of terrain + delivery systems. Persistent world map, world packages, proximity pickup scanning. Scroll is JS-driven via `translateX`. Bug-fixes including viewport fill, destination drift, cargo tooltip flicker, log line limit. Note: commit introduced the `distKm` derived formula that commit 6 replaces with a real accumulator.

---

## reference links (TLH-specific)

- Cloudflare Workers docs: https://developers.cloudflare.com/workers/
- Cloudflare KV docs: https://developers.cloudflare.com/kv/
- Live worker: https://coiledlamb.tlh-feed.workers.dev
