# the long haul — game handoff doc
_last updated: 2026-04-13_

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
3. **Trust meter with NPCs** — ⏳ commit 4
4. **Settlement quote evolution** — ⏳ commit 6

**Commit progress:**
- ✅ **Commit 1** (`c9a57b9` + `8f7940f`) — Worker + wrangler.toml + README. Deployed live to `https://coiledlamb.tlh-feed.workers.dev`. KV namespace `c7bdbec95cd6476f9c87abf55c03fdcb`.
- ✅ **Commit 2** (`6d3d56d` HTML, `4020307` CSS, `fc2820c` JS) — Game-side wiring: `postActivity`, `pollFeed`, census header, `no signal` / `connecting to feed...` fallbacks, milestone broadcasts, save schema v1 → v2.
- ✅ **Commit 3a** (`c751caf`) — Bugfix batch: viewport fill (VIEWPORT_CELLS 64→90 + dynamic render count), pickup loop fixes (PKG_PICKUP_RANGE 6→8, PKG_RESPAWN_TICKS 800→500, per-zone pkgChance bumps, scanForPickup `continue` instead of `break` on too-big pkg), sandalweed mechanic (cells flagged `sandal:true`, harvest into `S.sandalweedCount`, auto-equip when boots fail with `bootDurability=30` + `usingMakeshift=true`, on-demand `#sandalBadge` in boots row).
- ✅ **Commit 3** (`0fb8322`) — Identification stages 0/1/2/3, save schema v2 → v3 (`nodeStages` replaces `nodesKnown`), route map render rewritten to be stage-aware, `getDisplayLabel(id)` helper threading through dest drift / settlements panel / cargo tooltip, sandalweed dial-back. Stage 1 (signal) wiring exists but no triggers fire it yet — that comes in commit 4 with trust.
- ✅ **Commit 3b** (this commit) — **Bug batch**: wipe-save reload fix, sandalweed cap + satchel upgrade + further dial-back, stamina drain bump (0.28→0.40), `rebuildRoads` → `efficientConsumption` upgrade swap with v3→v4 save migration, dispatch log fills shell height, custom scrollbars, sandalweed badge tooltip restyle (cargo-style), weight pips moved to right side of cargo bar. Also: split this game-specific handoff into `TLH-HANDOFF.md` from the main `HANDOFF.md`.
- ⏳ **Commit 4** — NPCs at depots A, B, H. Trust meter (0-100) per NPC. Trust thresholds: 25 (identification hints — fires stage 1), 50 (warnings: rain/trip/stamina), 75 (package previews on connected edges), 100 (rest at depot like shelter + bonus scrip). New channels panel + radio chatter system. ~120 NPC dialogue lines (Claude drafts).
- ⏳ **Commit 5** — Lost cargo recovery loop (Tier 1 multiplayer feature deferred from earlier scope).
- ⏳ **Commit 6** — Settlement quote evolution (3 stages × 6 settlements = 18 quotes, Claude drafts) + final UI polish.

After commit 6 ships, drop a small **mini-patch** with sticky gun + terrain scanner (see "future upgrades" section below) before moving on to v0.0.8/v0.0.9.

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
- `pkg` (if present): `{ size, label, kg, slots, scrip, isLost, destId, picked, respawnIn }`. `destId` is the far end of the cell's edge — stamped at generation, never changes.
- `sandal: true` flag marks harvestable sandalweed cells.
- Risky cells: edges leading to C or ? are flagged `risky: true`, applying a ×1.4 trip chance multiplier.
- Scroll is JS-driven: `renderFieldstrip()` computes `worldPosFromRoute()` → `translateX(...)` on `.tlh-fieldstrip` every tick. No CSS animation. `width: max-content` on the strip element. Render count is dynamically sized to actual viewport width.

### packages
- Picked up by proximity scan in `scanForPickup()` — checks cells within `PKG_PICKUP_RANGE = 8` cells ahead of courier each tick.
- Bug-2-aware: `continue` instead of `break` when a package won't fit, so a smaller pkg further ahead can still be picked up.
- On pickup: `pkg.picked = true`, package copied into `S.inventory` with `_worldCell` reference for respawn.
- On node arrival: `tryDeliver(arrivedNodeId)` delivers all inventory items with matching `destId`.
- After delivery: `pkg.respawnIn = PKG_RESPAWN_TICKS (500)` starts countdown. Every 10 ticks, `tickPkgRespawns()` decrements and eventually resets `picked = false`, capped at `PKG_MAX_PER_EDGE = 18` active per edge.

### sandalweeds
- Spawn in scrub (most), road (rare), ruins (rare). Wetlands and depot approaches: never.
- Current rates (commit 3b dial-back): scrub 0.008, road 0.002, ruins 0.002.
- **Hoard cap**: `SANDAL_CAP_BASE = 5` (`SANDAL_CAP_UPGRADED = 25` with `sandalSatchel` upgrade). When at cap, `scanForPickup` leaves the `*` standing — player can come back if they burn through stock.
- Harvest: `scanForPickup` detects `cell.sandal`, increments `S.sandalweedCount`, wipes the `*` from terrain, no slot/weight cost.
- Auto-equip when boots fail: `checkAutobuy` priority order is clip > sandalweed > scrip purchase. Sandalweed equips regardless of `autobuyBoots` toggle — it's a free fallback.
- Equipped sandalweed: `bootDurability = 30`, `usingMakeshift = true` (1.3x boot drain).
- UI: `#sandalBadge` in boots row, format `* N/cap`. Pulses pink when at cap. Cargo-style `:hover::after` tooltip via `.has-tooltip` class.

### identification stages
- `S.nodeStages` is the single source of truth. Object keyed by node id (`A`, `?`, `B`, `C`, `H`, `·`), values are integers 0-3.
- Stages: 0 = unknown, 1 = signal detected (trust-driven, commit 4), 2 = tier visible (you walked an adjacent edge), 3 = visited.
- Starting state: `A` and `H` at stage 3 (porter's anchors), all others at 0.
- Helpers:
  - `getNodeStage(id)` — returns 0 if absent
  - `setNodeStage(id, stage)` — ratchet-only, only increases
  - `markEdgeAdjacent(from, to)` — bumps both endpoints to ≥ 2, returns true if anything changed
  - `getDisplayLabel(id)` — returns `???` for stage 0/1, tier name for stage 2, real label for stage 3
- Triggers in `tick()`: when an edge transition completes, both new endpoints get bumped to stage 2; bare arrival sets stage 3. Also runs in `tryDeliver` for the delivered-to node.
- Triggered on `init()` for the current edge so resumed saves render correctly.
- Render: `drawRouteMap` uses stage-aware fills, strokes, and labels. Stage 0 nodes show `?` in circle and have *no* external label. Stage 1+ shows real letter (dimmed). Stage 2 shows tier. Stage 3 shows full label. Edges dim/medium/bright based on min endpoint stage. Tooltips also stage-aware.
- `renderSettlements` filters on `getNodeStage(id) >= 2`. Stage 2 entries show tier as title with "unconfirmed" subtitle and a generic `"reports of a [tier] along this route"` quote. Stage 3 shows the canonical entry.
- The `?` node has no special handling — its tier is `unknown` so stage 2 displays "unknown" (slightly weird but harmless), stage 3 displays `???` (matches current behavior). Will be revisited in commit 6 when settlement quotes evolve.

### persistence (schema v4 — commit 3b)
- Save key: `localStorage['tlh-save-v4']`. Versioned schema (`SAVE_VERSION = 4`).
- Loader tries v4 → v3 → v2 → v1 in order. Migration on load: legacy keys removed, save re-written as v4.
- v3 → v4 migration: `upgrades.rebuildRoads === true` becomes `upgrades.efficientConsumption = true` (1:1 boolean swap; old key dropped).
- v1/v2 → v4: `nodesKnown[id] === true` becomes stage 3 (preserves player progress), else stage 0.
- **Saved fields**: progress (delivered, scrip, distKm, ticks, capacities, boots/clip, `sandalweedCount`, stamina/canteen, autobuy/autodrink toggles), position (edgeIdx, dotT), inventory (with `_worldCell` stripped), upgrades, `nodeStages`, settlement supply/rebuild, multiplayer (`milestonesHit`, `lastFeedTimestamp`).
- **NOT saved**: `worldCells[]` (regenerated each load — saves are tiny as a result), package respawn timers, log lines, rain state, tie-down (one-use), pending boot clip refill prompt, `networkFeed` / `networkCensus` / `networkConnected` (transient — refetched on poll).
- **Why `_worldCell` is stripped**: world is fresh each load, old indices don't line up. In-flight inventory loses its respawn link — package delivers fine, but its world cell never gets a respawn timer set. Tiny self-correcting leak. Not a real bug.
- **Upgrade restoration**: load does NOT re-run `apply()` on saved upgrades. Saved values for `maxSlots`, `maxWeight`, `bootClipMax/Count` are trusted as-is. Re-running `apply()` would double the bonuses (e.g. `cargoSling` adds +2 slots, but the saved `maxSlots` already includes that +2).
- **Save triggers**: 30s autosave interval, `visibilitychange` to hidden, `beforeunload`, manual `[save]` button.
- **Wipe save**: two-click confirm pattern. First click arms the button (turns pink, pulses, label changes to "click again to confirm"). 4-second timeout reverts. Second click within window wipes.
  - Commit 3b fix: wipe now triggers `location.reload()` after a 400ms delay. Previously the in-memory `S` survived and the next autosave/visibilitychange trigger would write surviving state back, making wipe appear to do nothing.
  - Does NOT wipe `tlh-porter-id` — that's intentional, porter ID is identity, not progress.
- **No offline progression yet**. Resume-where-you-left-off only. Offline progression is a real balance feature that needs its own version when ready.

### rendering
- `renderCargoSlots(force)` has a dirty-check via `cargoKey()` — only rebuilds DOM when inventory changes. Pass `force=true` on pickup/delivery/upgrade to override. This prevents CSS tooltip flicker. Tooltip uses `getDisplayLabel(pkg.destId)` so packages headed to unknown nodes show `→ ???`.
- `updateHUD()` calls `renderUpgrades()` every tick so upgrade buttons stay in sync with scrip.
- Weight display: `.weight-segs` pip row (one pip per kg of max capacity), colour-ramped teal → purple → pink. Right-aligned in cargo row via `margin-left: auto` (commit 3b).
- Courier stack: all carried packages shown as stacked `[s/m/l]` labels above `@`. Lost packages render pink.
- Three viewport layers: terrain (z1) → destination drift (z2) → rain (z3) → courier (z10). Destination drift animates across the visible viewport on each edge change (`destdrift 22s linear forwards`, restarted via reflow trick). Drift label uses `getDisplayLabel()`.
- Stamina: 4 segments (full/half/crit/empty) + optional 5th overboost segment (pulsing teal, shown after shelter rest).
- Boot clip refill: on arrival at supply depots (A, B, H) with a deficit clip, a log prompt appears with an inline `[refill]` button. Does NOT auto-charge. `_clipRefillPending` state tracks one pending prompt at a time.
- Save strip: thin row below the panels mirroring porter strip aesthetic. `[save]` `[wipe save]` `last save: X ago`. "Ago" text refreshes every ~3s via the tick loop.
- Log: 14-line cap, real-time MM:SS timestamp from `ticks × TICK_MS / 1000`. Note: timestamp continues from saved `ticks` value across reload (intentional — feels like one continuous session).
- Network panel: connected-state-aware. Shows `connecting to feed...` until first poll completes, then census header (`X others online today`) followed by event lines. Empty case shows `no signal`. Self-events filtered out.
- Porter strip hint: `connecting to feed...` → `connected to feed` once first poll succeeds.
- **Shell layout** (commit 3b): `.tlh-shell` is a column flex. The viewport, hud, rows, and save strip are `flex-shrink: 0`. `.tlh-panels` gets `flex: 1; min-height: 0;` so it fills remaining height. Each panel's content (`#logEl`, `#upgradesEl`, `#settlementsEl`) gets `flex: 1; min-height: 0; overflow-y: auto` with custom scrollbars in the terminal palette (6px wide, `#2a5c5a` thumb on `#0b2e2d` track, lightens on hover). `.tlh-layout` uses `align-items: stretch` so the right column matches left height.

### porter ID
- Format: `PTR-XXXX` (8 hex chars). Stored in localStorage key `tlh-porter-id`.
- Legacy `TLH-XXXX` IDs are migrated on next load.
- Survives wipe save — porter ID is identity, not progress.

### upgrade system
- 10 upgrades in `UPGRADE_DEFS`. Bought with scrip. Some have prerequisites.
- `bootClip1` (40¢): enables 1 spare boot slot. `bootClip2` (100¢, requires clip1): expands to 2.
- `cargoSling` (+2 slots), `cargoPack` (+3 slots, requires sling), `cargoWeight` (+5kg).
- `bootsT1` / `bootsT2`: reduce boot drain by ×0.75 / ×0.50 respectively.
- `steadyFeet`: −30% trip chance, +15% catch chance.
- `efficientConsumption` (commit 3b): −40% canteen drain per drink. Replaced `rebuildRoads` (which was a flat passive +20% speed). Save migration handles the swap; `speedMultiplier()` no longer reads `rebuildRoads`.
- `sandalSatchel` (commit 3b): raises sandalweed hoard cap from 5 to 25.

### status flow
`walking` → (pickup) → `carrying` → (node arrival + delivery) → `walking`
`walking` → (exhausted) → `resting` → (timer) → `walking` (with +25% stamina overboost)
`walking/carrying` → (trip) → `tripped` → (timer) → previous status
Tie-down: when armed, intercepts one trip that would damage cargo, then disarms.

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
- `postActivity(type, data)` — fire-and-forget POST with `keepalive:true`, silent failure (no log spam).
- `pollFeed()` — incremental fetch via `?since=`, dedupes by `timestamp|porterId|type`, trims to display cap.
- `startPolling`/`stopPolling` tied to `visibilitychange` listener (only polls while tab visible).
- `shortPorterId()` truncates `PTR-XXXXYYYY` → `PTR-XXXX` for compact display.
- `checkDistMilestones()` broadcasts at [10, 25, 50, 100, 250, 500, 1000]km, deduped via `S.milestonesHit`.
- Broadcasts: `delivery` + `discovery` on `tryDeliver()`, `discovery` on bare arrival in `tick()`, `milestone` from `checkDistMilestones()`.
- Self events filtered out of feed display (you don't see your own activity in the network panel).

### multiplayer plan (full design)

Designed to fit the game's actual shape: each player has their own procedural world; multiplayer is **a presence layer**, not shared world state. Reference frames: Death Stranding likes/structures, Dark Souls bloodstains/messages, Animal Crossing villager letters. Other players are *implied* and *felt*, not *present*.

#### platform decision (✅ deployed)
- **Cloudflare Worker + KV** (free tier covers it forever for personal-site traffic).
- Schema is generic: every event is `{ type, porterId, timestamp, data }` where `type` is any string and `data` is any JSON. Worker is a generic event bus; new game systems just teach themselves to broadcast/consume the event types they care about. Means we don't need backend changes when structures/NPCs/etc arrive.
- Pattern: **broadcast-on-action, consume-on-poll**. POST /activity once per relevant event. Client polls /feed every 60s while tab is visible.
- Rate-limit per porter ID via a second KV key with TTL.

#### Tier 1 status (v0.0.7)
- ✅ Activity log (delivery, milestone, discovery events broadcasting and rendering)
- ✅ Porter census (real "X others online today" from `census` field of /feed response)
- ⏳ Lost cargo recovery loop — deferred to commit 5
- ⏳ Echo events partial reveals — wired into stage 1 identification, fires once trust system in commit 4 enables it

#### v0.0.7+ scope (Tier 2) — fits with structures
- **Structure stewardship**: structures (canopies, lookouts, ziplines, etc.) get stamped with builder porter ID. Tooltip reads "built by PTR-7F2A — repaired 4 times." Using/repairing someone else's structure broadcasts a thank-you event to their feed. Mutual maintenance without direct interaction.
- **Postbox dead-drops**: porter A loads a package into a postbox at depot B with destination = depot H. Package data goes to KV. Porter B encounters that postbox in their game, picks up the package, delivers it. Both porters get scrip + feed events. First true cooperative interaction.
- **Structure naming**: 1-line names propagate ("birdcry overlook", "the long drink"). Tiny content contribution, makes the world feel made-by-people.
- **Roads as collective infrastructure**: stale Tier 2 hook — `rebuildRoads` was replaced by `efficientConsumption` in commit 3b, so this needs redesign. Possible reworks: shared structure-repair counter; community waypoint placements.
- **Ziplines as gifts**: appearing in another porter's world gives them free use for a window before normal procgen would surface it. Builder gets thank-you + tiny scrip kickback per use.

#### v0.0.7+ scope (Tier 3) — fits with radio chatter NPCs
- **Player-authored radio messages**: once per session, write a 60-char message that becomes a radio chatter line in another porter's feed for the next 24h. Anonymized as `static, then: "..."`. Other porters can `[boost]` to repeat them or let them fade. Ambient text becomes partially player-written.
- **Trust meter pooled with NPCs**: trust is partially community-pooled. When a porter hits trust 100 with a given NPC, all porters can hear that NPC's special unlocked line. Discovery becomes communal even though mechanics are solo.

#### v0.1+ scope (Tier 4) — long-tail
- **Porter profiles**: click a porter ID in your feed to see their public stats — total km, delivery count, structures still standing, last-seen time.
- **Daily delivery boards**: community contracts where X total porters across all worlds delivering a kind of package in 24h triggers a small reward for everyone.
- **Memorial events**: porters who don't post activity for 90 days get their lost cargo and unrepaired structures pink-tinted with a "last seen" note. Doesn't punish (they can return any time), creates a melancholy archeology layer.

#### KV schema (current + anticipated)
- ✅ `feed:recent` — last 200 events, all porters (single JSON blob).
- ✅ `census:active` — set of porter IDs seen in last 24h.
- ✅ `lost:{porterId}` — list of lost packages this porter has dropped (recovery system). Endpoints exist; recovery loop pending in commit 5.
- ✅ `rate:{porterId}` — per-porter rate limit counter, TTL ~60s.
- ⏳ `structures:{regionKey}` — structures built at procgen-stable positions, shared (Tier 2).
- ⏳ `postbox:{boxId}` — actual carriable packages awaiting pickup (Tier 2).
- ⏳ `radio:queue` — pending player radio messages (Tier 3).

---

## future upgrades — mini-patch after commit 6

These two upgrades will ship together as a small **mini-patch** between v0.0.7 (commits 4-6) and the meatier v0.0.8/v0.0.9 work. Acquisition for both is the same compromise: ship via the upgrades menu now; long-term plan is to migrate to **NPC trust rewards** at specific locations once the map expands beyond the current 6-node loop.

### sticky gun

**Concept**: equipment item that extends pickup radius from a reduced base. Has ammo. Refills only at home shelter (H). Takes a small cargo slot by default; upgrade frees the slot via dedicated holster.

**Acquisition resolution**: ships in the upgrades menu (~150¢ purchase). Long-term plan: trust 50 reward at the home shelter NPC ("you've earned my workshop access"). Defer the migration until commit 4 NPCs are wired AND the map has more locations to give other upgrades trust-reward homes.

**Tuning**:
- Base pickup radius reduction: `PKG_PICKUP_RANGE` from 8 → 6 (with gun: ~16). Going below 6 brings back the cargo-runs-out problems from commit 3a.
- Ammo capacity: 8 shots. Roughly enough for one pass through 1-2 edges before refill.
- Refill behavior: on arrival at H, instantly refill. Log line `home: sticky gun refilled (8/8)`. No prompt — automatic since H is the home base.

**State additions**:
- `S.stickyGun` — `null` if not owned, else `{ ammo, ammoMax, holstered }`
- On purchase: set `{ ammo: 8, ammoMax: 8, holstered: false }`
- When `!holstered`, takes 1 slot of cargo capacity (effective slots = `S.maxSlots - 1`)

**Pickup flow** (in `scanForPickup`):
- If `S.stickyGun && S.stickyGun.ammo > 0`, scan range = `STICKY_RANGE` (16). Else scan range = `PKG_PICKUP_RANGE` (6).
- When picking up beyond base range: decrement ammo, store `S.lastStickyShot = { fromCi: courierCell, toCi: pickupCi, ts: Date.now() }` for visualization.

**Visualization**:
- New SVG overlay element in viewport, absolute positioned over fieldstrip.
- When `S.lastStickyShot` is set and within last 400ms, draw a line from courier cell (always at `COURIER_CELL`) to pickup cell (offset = `pickupCi - leftCell` cells × `cellPxWidth`).
- Line color: bright cyan `#77bfcf`, fading via opacity over 400ms. Then clear `S.lastStickyShot`.
- Render hook: piggyback on `renderFieldstrip` (already runs every tick).

**Refill at H**: in `tick()`'s edge-arrival block, if `arrivedAt === 'H' && S.stickyGun && S.stickyGun.ammo < S.stickyGun.ammoMax`, set `ammo = ammoMax`, log message.

**Holster upgrade**: new `UPGRADE_DEFS` entry — `stickyHolster` (~80¢, requires owning sticky gun). Easiest impl: always show the upgrade and disable until gun is owned via `reqMet = !!S.stickyGun`. Apply: `S.stickyGun.holstered = true`. Frees up the cargo slot.

**UI**: small badge in cargo or boots row showing `gun: N/M` with ammo state. Color-code: cyan when full, purple when low (≤2), pink when empty.

**Cargo slot accounting**: this is the trickiest part. Currently `S.usedSlots` is computed from inventory. With sticky gun taking a slot, reserve a slot in the effective-max calculation: `effectiveMax = S.maxSlots - (S.stickyGun && !S.stickyGun.holstered ? 1 : 0)`. Apply in `scanForPickup`'s capacity check and in `renderCargoSlots`'s loop bound. Keeps inventory pure cargo, derives effective max where needed.

### terrain scanner

**Concept**: equipment that pings periodically, with a manual ping that goes on cooldown for 30s once pressed. Provides a buff against tumble chances, further boosted on risky terrain, for a short time. Upgrades extend buff duration and shorten the auto-ping interval.

**Acquisition resolution**: same as sticky gun — ships in upgrades menu now (~60¢ for T1), long-term plan is trust reward at a TBD location once the map expands. The lore option that's been kicked around: "scanner recovered from the unknown signal site" — gate it behind first arrival at the `?` node. Worth revisiting once the `?` node has actual content.

**Open design questions** (to settle when implementing):

1. **Uptime cap** — Three framings discussed:
   - (a) Soft cap via diminishing returns — auto-ping uptime approaches but never hits 100% (e.g. T3 sits ~83%).
   - (b) Hit 100% but trade something for it (final tier costs a lot or eats a slot).
   - (c) **Manual-ping-stays-valuable** (lean): cap auto-uptime ~66% at T3, but make manual ping noticeably stronger (longer duration or bigger buff number) so the 30s cooldown ability stays the player's active tool late-game. Keeps engagement with the button instead of letting the scanner solve itself.

2. **Stacking behavior** — proposal: refresh duration but don't stack magnitude. If a periodic ping fires while manual buff is still active, just reset the timer to whichever is longer. No exploit window.

3. **Visibility / UI** — small radar-sweep glyph on a new HUD row (matching the boots/stamina/cargo row pattern) with a thin progress arc showing "next auto-ping in Xs" / "buff: Xs" / "manual cooldown: Xs". Toast in dispatch log on auto-ping ("scan ping — terrain logged") and manual ping ("manual scan — extended buff").

4. **Risky terrain interaction** — scanner already has access to `currentCellIsRisky()`. Either: (a) buff multiplier scales bigger on risky cells, or (b) pinging on risky terrain produces a different visual/sound/log line and a bigger buff number on the toast. (b) is more flavor.

**Tuning sketch** (subject to revision):
- `scannerT1` (60¢): unlock — 30s interval, 6s buff, manual ping 30s cooldown
- `scannerT2` (140¢, requires T1): faster sweeps — 20s interval, 8s buff
- `scannerT3` (240¢, requires T2): wide spectrum — 15s interval, 10s buff (~66% uptime)
- Manual ping always 12s buff (longer than any auto buff) → option (1c) above

**State additions**: `S.scanner = { unlocked, level, manualCooldown, autoTimer, buffActive, buffRemaining, buffMagnitude }`.

**Trip integration**: drop-in to `tripChance()` — `if (S.scanner.buffActive) chance *= S.scanner.buffMagnitude` (proposed 0.5 baseline, 0.3 on risky terrain).

**Save schema**: will require a v4 → v5 bump if scanner state needs to persist across reloads (it should — manual cooldown shouldn't reset on tab-close as a save-scum exploit).

---

## TLH future game features (post-commit-6, do not implement yet)

**Structures tab**: postboxes (store cargo), rainfall canopies (wait out rain + refill canteen), generators (battery recharge stub), lookout posts (see more/farther packages), ziplines (skip terrain between 2 points), shelters (home base), drone bays (carry cargo to destination). Built on paths between landmarks with limited slots. All degrade over time, upgradeable with field resources. Roads can move here too. Multiplayer integration per Tier 2 of multiplayer plan.

**New terrain types**: deserts (rare rain, faster stamina drain), rivers (difficult to wade, bridgeable), slopes/elevation/mountains (ladders/climbing anchors as purchasable consumables).

**Bigger map**: with terrain expansion, the route should grow beyond 6 nodes. Currently the ring is small enough to see everything in 5 minutes; bigger map = real frontier. Also unlocks the trust-reward acquisition path for sticky gun + terrain scanner.

**Hot springs**: field stamina restore with wait time cost.

---

## TLH session log

### 2026-04-13 (latest — v0.0.7 commit 3b: bug batch + handoff split)

**Bug batch (commit 3b on `feature/the-long-haul`)**

Shipped six bug list items + two new UI tweaks in a single batched patch. Sticky gun and terrain scanner deferred to a mini-patch that lands after commits 4-6 finish v0.0.7.

- **Wipe save fix**: `armWipe()` confirmed-wipe path now triggers `location.reload()` after a 400ms delay. The previous bug — wipe appears to do nothing — was because the in-memory `S` survived the localStorage clear, and the next autosave/visibilitychange/beforeunload trigger would re-write surviving state. Reload fully resets the runtime so wipe actually wipes.
- **Stamina drain bump**: `STAMINA_DRAIN` 0.28 → 0.40 (≈43% faster). Canteen now matters meaningfully.
- **`rebuildRoads` → `efficientConsumption` swap**: replaced old upgrade definition entirely with new id `efficientConsumption` (-40% canteen cost per drink). `speedMultiplier()` no longer reads the `rebuildRoads` flag — the ×1.2 term is gone. Save schema bumped v3 → v4 with one-shot migration: `upgrades.rebuildRoads === true` becomes `upgrades.efficientConsumption = true`. No player progress lost.
- **Sandalweed cap + dial-back + satchel upgrade**: `SANDAL_CAP_BASE = 5`, `SANDAL_CAP_UPGRADED = 25`. New helper `sandalCap()` returns the right cap based on `upgrades.sandalSatchel`. `scanForPickup` checks cap before harvesting — at-cap leaves the `*` standing. New `sandalSatchel` upgrade (60¢, no prereq) raises cap to 25. Spawn rates further dialed back: scrub 0.015 → 0.008, road 0.005 → 0.002, ruins 0.005 → 0.002.
- **Sandalweed badge tooltip restyle**: the badge now uses `.has-tooltip` class with cargo-style `:hover::after` tooltip (teal border, monospace, multi-line). Previously was a plain `title=` attribute (browser default). The `.has-tooltip` rule was hoisted from `.cslot.has-tooltip` to a generic class so any element can opt in. Format: `* N/cap`. New `.sandal-badge` variant: green tint, pulses pink (`overboost-pulse` keyframes) when at cap.
- **Weight pips moved right**: `.weight-segs` got `margin-left: auto`, pushing the weight pip row to the right side of the cargo bar. No DOM change required.
- **Dispatch log fills shell**: `.tlh-shell` is now `display: flex; flex-direction: column`. Viewport, hud, rows, and save strip got `flex-shrink: 0`. `.tlh-panels` gets `flex: 1; min-height: 0`. Each panel content (`#logEl`, `#upgradesEl`, `#settlementsEl`) gets `flex: 1; min-height: 0; overflow-y: auto`. `.tlh-layout` switched from `align-items: start` to `align-items: stretch` so the right column also stretches to match.
- **Custom scrollbars**: webkit + firefox scrollbar styling on the three panel content elements. Width 6px, `#2a5c5a` thumb on `#0b2e2d` track, lightens to `#3a6a68` on hover. Matches terminal palette.

**Save schema**: bumped v3 → v4 with one-shot upgrade migration. Loader chain now v4 → v3 → v2 → v1. Save key constants reordered: `SAVE_KEY_V4` is current, others are legacy.

**Handoff split**: spun this game-specific doc out from the main `HANDOFF.md`. Main doc kept site-wide content (gallery, blog, admin, music player, art-pipeline, deployment) plus a pointer to this file. TLH content (game architecture, multiplayer plan, identification stages, persistence, future features, TLH session log) lives here. Trims context cost when working in either domain.

**Sticky gun + terrain scanner**: documented as the upcoming mini-patch after commit 6 ships. Both have full design notes in the "future upgrades" section above. Acquisition resolution for both: ships via upgrades menu now, plan to migrate to NPC trust-reward at specific locations once the map expands.

### 2026-04-13 (mid-day — v0.0.7 commits 1-3 + bug list capture)

**The Long Haul — v0.0.7 commits 1, 2, 3a, 3 (feature/the-long-haul branch)**

Major session. Shipped four commits implementing the multiplayer backend, game-side wiring, a bug batch, and the identification stage system. Ended with a six-item bug list that was addressed in commit 3b above.

**Commit 1: Cloudflare Worker** (`c9a57b9` + `8f7940f` for KV syntax fix)
- Created `worker/index.js`, `worker/wrangler.toml`, `worker/README.md`.
- Endpoints: `POST /activity`, `GET /feed?since=`, `POST /lost`, `GET /lost/:porterId`, `GET /` info.
- KV namespace `c7bdbec95cd6476f9c87abf55c03fdcb`. Allowed event types: delivery, milestone, discovery, lost_drop, lost_recovered, trust_unlock.
- Rate limit 5 events/60s per porter, silent drop. Feed cap 200, census 24h auto-prune, LOST_CAP 20 per porter FIFO. CORS open.
- User deployed to `https://coiledlamb.tlh-feed.workers.dev`.

**Commit 2: game-side wiring** (`6d3d56d` HTML, `4020307` CSS, `fc2820c` JS)
- New `MULTIPLAYER` block with `postActivity`, `pollFeed`, `startPolling`/`stopPolling`, `shortPorterId`, `checkDistMilestones`.
- Broadcasts on delivery, discovery, distance milestones (deduped via `S.milestonesHit`).
- Network panel rewritten: census header at top, real polled events, `no signal` / `connecting to feed...` fallbacks, self-events filtered.
- Save schema bumped v1 → v2: new `multiplayer` field with `milestonesHit` and `lastFeedTimestamp`. v1 saves auto-migrate on load.
- Porter strip hint: `connecting to feed...` → `connected to feed` once first poll succeeds.
- `wipeSave` clears both v1 and v2 keys.
- HTML subtitle bumped to v0.0.7. CSS additions: `.net-quiet` (italic dim) and `.net-census` (separator) classes.
- User VERIFIED via screenshot — porter PTR-82F71BB8 with 9 deliveries, "connected to feed", census working.

**Commit 3a: bugfix batch** (`c751caf`)
- Bug 1 (empty terrain right of courier): `VIEWPORT_CELLS` 64→90, `renderFieldstrip` dynamically sizes renderCount to actual viewport width.
- Bug 2 (cargo can run out): `PKG_PICKUP_RANGE` 6→8, `PKG_MAX_PER_EDGE` 14→18, `PKG_RESPAWN_TICKS` 800→500. Per-zone pkgChance bumped: road 0.04→0.07, scrub 0.05→0.08, wetlands 0.02→0.04, ruins 0.09→0.12, depot_approach 0.08→0.10. `scanForPickup` uses continue+return so a smaller pkg further ahead can still be picked up.
- Bug 3 (sandalweeds non-functional): cells flagged `sandal:true`. `scanForPickup` harvests them, wipes `*` from terrain, no slot/weight cost. New `S.sandalweedCount` persisted in save. `checkAutobuy`: priority clip > sandalweed > scrip. Sandalweed equips regardless of autobuy toggle (free fallback) — sets `bootDurability=30`, `usingMakeshift=true`. `renderBoots` creates on-demand `#sandalBadge` (`* N`) inserted after clipBadge.

**Commit 3: identification stages + sandalweed dial-back** (`0fb8322`)
- Save schema bumped v2 → v3: `nodeStages` (integer 0-3 per id) replaces `nodesKnown` (boolean). New `SAVE_KEY_V3 = 'tlh-save-v3'`. Loader tries v3 → v2 → v1 in order. Migration: `nodesKnown[id] === true` becomes stage 3, else stage 0.
- New helpers in IDENTIFICATION STAGES block: `getNodeStage`, `setNodeStage` (ratchet-only), `markEdgeAdjacent`, `getDisplayLabel`.
- Stage progression: walking an edge bumps both endpoints to ≥2; bare arrival sets 3. Same on `tryDeliver` for delivered-to node. `init()` also bumps current edge endpoints on load.
- `drawRouteMap` rewritten with stage-aware fills/strokes/labels: stage 0 nodes show `?` in circle and have NO external label; stage 1+ shows real letter (dimmed); stage 2 shows tier; stage 3 shows full label. Edges dim/medium/bright based on min endpoint stage. Tooltips also stage-aware.
- `renderSettlements` filters on stage ≥ 2. Stage 2 entries show tier as title with "unconfirmed" subtitle and a generic `"reports of a [tier] along this route"` quote. Stage 3 shows the canonical entry.
- `renderCargoSlots` tooltip and `updateDestDrift` use `getDisplayLabel`.
- `routeNodes[].known` field removed; `nodeStages` is single source of truth.
- Sandalweed dial-back: scrub 0.05 → 0.015, road 0.02 → 0.005, ruins 0.02 → 0.005 (~70% reduction). User reported still too common — fully addressed in commit 3b above.

### 2026-04-13 (earlier — v0.0.6: persistence + multiplayer planning)

**The Long Haul — v0.0.6 (feature/the-long-haul branch)**

Two systems landed in this session: music tracks added to the shared player, and full save/load persistence for TLH.

**music player additions (`nav.js`)**
- Added 5 mac demarco tracks: `20190622`, `20200107 2`, `20200402`, `20201228`, `20210818`.
- All appended to end of `TRACKS` array — preserves saved listener positions for existing 4 tracks.
- Pushed to BOTH `main` (without TLH nav link) and `feature/the-long-haul` (with TLH nav link). Main version preserves the "TLH not live yet" rule by stripping the nav child entry.
- Mac demarco tracks have `0:00` placeholder durations (auto-fills from `audio.duration` once loaded).
- `20200107 2.mp3` keeps the literal space in filename. Modern browsers handle it transparently. If it ever throws `ERR: not found`, URL-encode the `src` to `%20`.
- `pilgrim's path` remains the default first track (index 0) for new sessions.

**persistence / autosave (TLH v0.0.6)**
- New `PERSISTENCE` block in `the-long-haul.js` (~140 lines): `buildSavePayload`, `saveGame`, `loadGame`, `wipeSave`, `armWipe`, `fmtAgo`, `updateSaveStrip`.
- Save key `tlh-save-v1` with versioned schema (`SAVE_VERSION = 1`). Old/malformed/wrong-version saves are discarded gracefully on load — fresh start.
- Saves: progress, position, inventory, upgrades, node-known flags, settlement supply/rebuild values.
- New save strip below panels: `// session: [save] [wipe save] last save: X ago`. Mirrors porter strip aesthetic.
- Wipe save: two-click confirm pattern. (Discovered to be broken in v0.0.7 testing — fixed in commit 3b.)
- Critical detail: load does NOT re-run upgrade `apply()` callbacks.

**multiplayer planning (no code yet at this point)**
- Discussed multiplayer extensively. Settled on Cloudflare Worker + KV as the platform.
- Designed framework: presence layer, not shared world. Generic event bus schema (`{type, porterId, timestamp, data}`) so future game systems just plug in.
- Scoped 4 tiers (v0.0.7 = activity log + census + lost cargo recovery + echo events; later = structure stewardship + postbox dead-drops; etc.). Full plan captured in "multiplayer plan" section above.

### 2026-04-13 (v0.0.5 — earliest)

**The Long Haul — v0.0.5 (feature/the-long-haul branch)**

Full rewrite of terrain and delivery systems. All changes are on the feature branch, not yet merged to main.

**persistent world map (7j)**
- Replaced ephemeral `buildField()` + CSS scroll loop with a pre-generated `worldCells[]` array (1,560 cells, 260 per edge × 6 edges).
- Scroll is now JS-driven via `translateX` on `.tlh-fieldstrip` each tick — no CSS animation. `width: max-content` on the strip element (was `200%`, causing grey area — fix 1).
- `worldPosFromRoute()` converts `edgeIdx + dotT` to a world cell offset. Terrain only repeats after a full circuit.

**world packages**
- Packages exist as persistent objects inside `worldCells[]`. `destId` stamped at generation time = far end of their edge.
- `scanForPickup()` replaces the old `advanceCycle()` pickup system — proximity-based, runs every tick.
- `tryDeliver()` replaces old delivery cycle — fires on node arrival, delivers all inventory items bound for that node.
- Picked packages respawn after `PKG_RESPAWN_TICKS`, capped at `PKG_MAX_PER_EDGE` active per edge.

**bug fixes**
- Fix 1: `.tlh-fieldstrip` `width: 200%` → `width: max-content` (grey area at terrain edge).
- Fix 2: destination drift keyframe rewritten to start at `right: 12%` inside visible viewport (was clipped off-screen).
- Fix 3: `renderUpgrades()` added inside `updateHUD()` — shop buttons now enable as scrip accumulates (was stuck disabled forever after init).
- Fix 4: `renderCargoSlots()` dirty-check via `cargoKey()` — only rebuilds DOM on inventory change, fixing tooltip flicker. Force-render on pickup/delivery/upgrade.
- Fix 5: log line limit bumped from 7 to 14.
- 7e: `RISKY_NODES` (previously unused) wired to `worldCells[].risky` flag; ruins/unknown edge cells apply ×1.4 trip chance multiplier.
- 7g: drink button now correctly disables at `stamina >= staminaMax` (not the overboost ceiling).
- 7i: courier `bounce` animation moved from `style.animation` inline to `.tlh-at.bounce` CSS class, syncing stack and `@` animation.
- 7k: `distKm` now calculated from `(edgeIdx + dotT) × 4.2` (route-based km) instead of raw tick count.
- 7l: `tt()` timestamp fixed to `Math.floor(ticks × TICK_MS / 1000)` real seconds.

**UI additions (v0.0.4 → v0.0.5)**
- Weight pips, boot clip refill, log inline action buttons, destination drift layer, carrier stack, tie-down, cargo slot tooltips, overboost segment, porter ID migrated TLH→PTR.

---

## reference links (TLH-specific)

- Cloudflare Workers docs: https://developers.cloudflare.com/workers/
- Cloudflare KV docs: https://developers.cloudflare.com/kv/
- Live worker: https://coiledlamb.tlh-feed.workers.dev
