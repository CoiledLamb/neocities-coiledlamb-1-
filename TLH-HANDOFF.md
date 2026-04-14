# the long haul — game handoff doc
_last updated: 2026-04-14_

> Companion doc to [`HANDOFF.md`](./HANDOFF.md) (which covers site-wide infrastructure). This doc covers everything related to **The Long Haul** game: architecture, multiplayer, identification stages, persistence, bug list, future feature backlog, and game-specific session log.

---

## branch status
- Active development branch: `feature/the-long-haul`
- **Not merged to main/live yet.** The user verifies by loading the HTML directly from the branch — bugs found are real branch bugs, not deployment issues.
- Push convention: full version drops (e.g. v0.0.5 → v0.0.6 → v0.0.7) get pushed to the feature branch when ready. Small bugfixes are batched between version drops and pushed together. Site-wide changes (like adding the music tracks to `nav.js`) can be pushed to `main` separately, as long as they don't expose unfinished TLH-specific work.

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

**What's next after v0.0.7:**
1. **Sticky gun + terrain scanner mini-patch** — two upgrade items shipped as a small bundle. Full design below in "future upgrades".
2. **General refactor pass** — zero behavior change, just code clarity. Items collected in "pending refactors" below.
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
- Gameplay trust thresholds stay at 25/50/75/100 (visual ticks at 20/40/60/80 — realignment deferred to refactor pass).
- `_wipeInProgress` guard intact.
- Recovery cargo is still one-shot on delivery.
- Tie-down still absorbs damage — just doesn't absorb drops.

---

## pending refactors (scheduled post-v0.0.7, pre-v0.0.8)

**1. Trust threshold / visual breakpoint realignment**

`TRUST_THRESHOLDS = [25, 50, 75, 100]` (gameplay) vs settlements panel tick marks at `20/40/60/80` (visual). Intentionally misaligned right now. Should be realigned before v0.0.8 gates new content on trust. Leaning option (a) — move thresholds to 20/40/60/80. Negligible rebalance, better visual clarity.

**2. General refactor pass**

After 6+ commits in v0.0.7, the JS is ~2270 lines. Areas that have drifted:
- `tick()` is doing too much — extract phases (status machine, movement, edge transition, rendering) into sub-functions.
- NPC trust / channels / chatter could consolidate into a module-like block.
- `NPC_LINES` corpus may eventually want a separate data file.
- Save/load is 200+ lines of repetitive field checks. Worth a helper like `loadNumeric(p, 'delivered')`.
- Transient state flags (`_lastDistEdgeIdx`, `_wipeInProgress`, `_lastGearPopKey`, `_gearPopHandler`, etc.) are scattered — collect in a single `_transient` sub-object.

Zero behavior change, just clarity. Will make v0.0.8 easier to land.

**3. Old `distKm` saved values**

Commit 6 accumulator is in; old saves load their stale derived-value `distKm` once and then accumulate correctly. No migration needed, just a comment on the load path. Fine as-is.

---

## game architecture

The game lives entirely in `the-long-haul.js` as a self-contained IIFE. All mutable state is in the `S` object. Persistent save state lives in `localStorage`.

### core loop
- The courier walks a fixed circular route of 6 edges between 6 named nodes (A → ? → B → C → H → · → A).
- `S.edgeIdx` (0–5) and `S.dotT` (0.0–1.0) track position on the route. `dotT` increments each tick by `0.006 × speedMultiplier()`. When it hits 1.0, edge advances and `tryDeliver()` fires.
- Speed is modulated by stamina segment count and boot durability.

### distance tracking (v0.0.7 commit 6)
- `KM_PER_EDGE = 4.2`. `posKm(edgeIdx, dotT) = (edgeIdx + dotT) * KM_PER_EDGE` gives current ring position.
- `accumulateDist()` runs every walking/carrying tick: computes forward delta since last tick, handles rollover (negative delta → add `edges.length * KM_PER_EDGE`), caps absurd jumps at 2× edge length, adds to `S.distKm`, updates trackers.
- `S._lastDistEdgeIdx` / `S._lastDistDotT` null sentinel = first tick since load; initializes trackers without counting a spurious delta.

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
- Stages: 0 = unknown, 1 = signal (trust t25), 2 = tier visible (walked adjacent edge), 3 = visited.
- Starting state: `A` and `H` at 3 (porter's anchors), all others at 0.
- Helpers: `getNodeStage`, `setNodeStage` (ratchet), `markEdgeAdjacent`, `getDisplayLabel`.
- `renderSettlements` filters on stage ≥ 2. Stage-2 items get `.settle-stage2` class (opacity 0.65).

### NPCs + trust (commit 4a/4b)
- `NPC_DEFS` at A/B/H with Greek callsigns: rho (A, steady/laconic), iota (B, young/eager), tau (H, warm/observant).
- `S.npcs.{A,B,H}` = `{ trust, unlocks: {t25,t50,t75,t100}, nextChatterTick }`.
- `TRUST_THRESHOLDS = [25, 50, 75, 100]`. Gains: delivery +1, lost-delivery +2, discovery +3.
- t25: reveal stage-0 adjacent nodes to stage 1 (via `NPC_ADJACENT` table).
- t50: `tryT50Warning()` on arrival — checks trip-risk edge > rain-incoming > low-stamina, speaks first match.
- t75: `tryT75Preview()` scans the outbound edge for any package, speaks a preview line with size + dest.
- t100: `tryT100RestPrompt()` posts log button `[rest]` → `confirmDepotRest` restores stamina to 105% (overboost), +30 canteen, +10¢.

### channels / chatter (commit 4b)
- `S.channels` is a FIFO ring (cap 6) of NPC utterances: `{ depotId, callsign, text, ts }`.
- `speak(depotId, text)` unshifts; `renderChannels` paints.
- `tickAmbientChatter()` runs every 10 ticks, per-NPC: gated on `unlocks.t25`, per-NPC cooldown (`nextChatterTick` = 170-345 ticks), base chance 0.005 per 10-tick window.
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

## future upgrades — mini-patch after v0.0.7

Two upgrades shipping as a small mini-patch between v0.0.7 and the refactor pass. Acquisition: upgrades menu now; long-term plan to migrate to NPC trust rewards once map expands.

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
