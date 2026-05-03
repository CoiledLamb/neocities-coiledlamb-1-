# the long haul — 1.0 scope
_what "done enough to call it 1.0" looks like — a working sketch_

---

## what this doc is

A moving target. The bible is the steady reference; this is the line between in-progress and shippable, and it's expected to be edited as questions resolve.

Not a roadmap, not a checklist of features to grind through. A way to look at the project and answer "is this 1.0 yet?" without re-deriving the whole thing each time.

---

## what 1.0 means

Content-complete and balanced. Not feature-frozen forever — post-1.0 patches still happen. But the core shape stops moving: the game you'd hand to someone today and the game you'd hand to them at 1.0 are recognizably the same game, just polished and full.

1.0 is a quality bar, not a date.

---

## locked — won't change before 1.0

The thesis. Anything in here is the game; changing it would be a different game.

- **Idle-first.** No hard gates. Gear is efficiency, never permission.
- **ASCII as the aesthetic.** Not a placeholder for sprites.
- **Gear is placed/consumed into the world.** No held/in-use mechanics.
- **Async multiplayer that never interrupts.** Other players are presence, not pressure.
- **Gender-neutral cast.** All NPCs they/them. (Tau's dog is the one exception.)
- **Post-post-apocalypse.** Rebuilding, not survival horror.
- **Save schema is a contract.** Migrations OK; ad-hoc churn isn't. Pre-v9 migration chain caps at 1.0 launch.
- **License: freeware + closed source.** Code is on Neocities (technically view-source-able); not actively published as a public repo. Preserves Steam / PWYW itch monetization optionality.
- **Every NPC has full voice + five trust tiers + two integrated gifts.** This is the bar regardless of how many NPCs there end up being.

---

## molten — needs resolving before 1.0

Open questions. Each one has implications that ripple, so they're worth deciding (or decisively deferring) rather than left ambient.

### roster
- **NPC count.** Implicitly 12 (locked-in by v0.1.0's 36-gift target = 12 × 3). Confirm before v0.1.0 NPC authoring starts; growing past 12 changes that math and the ring-rounded-square geometry.

### systems still being shaped
- **Mountain climbing.** Renderer support scoped in v0.0.9.11. Open: mechanic depth — is strain alone the right axis, or is there room for a discrete moment within idle-first?
- **Gear screen.** Alternate upgrades view. Not in the v0.0.9.7–v0.1.0 sequence — needs a call: ship pre-1.0 (and where), defer post-1.0, or cut.
- **Sticky gun rework.** Design vision still not locked.

### tagging / language
- **Shelter tag audit.** 94% of pkg labels have no thematic tie to dest tier; settlement tiers are cosmetic-only today.
- **Trip-chance internal naming.** User-facing strings done; internal `tripChance` / `TRIP_MULT_*` rename still optional.

### infrastructure & shipping
- **Worker dormancy / graceful degradation.** Confirm as design intent: when the relay worker is down, game plays solo silently. Probably true today by accident; the v0.0.9.6.10.23 patch's forced-silent UI state covers it cleanly. Verify the offline path stays quiet and document the intent.
- **Cost ceiling policy.** What's the threshold to accept a paid Cloudflare plan, ride-out the spike, or silent-disable? Decision-shaped, not code.
- **Sound.** Ambient soundscape per terrain + weather is the form that matches the design philosophy. Open: pre-1.0 vs post-1.0 scope; authoring source (own / CC0 / commissioned). Mute-by-default is non-negotiable regardless.
- **Privacy story for multiplayer relay.** What's stored (porter IDs, event metadata), for how long, public-facing language. Belongs on the itch page and/or a privacy section in-game.
- **Save robustness.** Export/import works; the question is whether browser localStorage is the only safety net, or whether to add auto-backup nudges / IndexedDB redundancy / periodic export prompts.
- **Browser compatibility matrix.** What's officially supported? `CompressionStream` (gzipped saves) is the current binding constraint — anything pre-mid-2023 breaks save import. Worth a clear floor + a "browser too old" message instead of silent breakage.
- **Mobile UX scope.** Currently barebones-playable for couch/bed sessions, not a full platform. Cargo grid + drag-toss broken on mobile, acknowledged. Open question is whether 1.0 raises this floor or accepts current state explicitly.
- **Bug reporting / community path.** Where do players send bugs or talk about playing? Email / Discord / GitHub issues / itch form. Trigger to set up: when download or concurrent volume crosses a threshold worth tending to.

---

## patch sequence to 1.0

The work between here and there. Each patch is scoped tightly enough to ship; the sequence respects what unblocks what.

### v0.0.9.7 — the log & lift
_UI foundations and cargo log, low risk, high momentum_

- ✅ Log panel with dispatch/cargo toggle _(shipped v0.0.9.7.1)_
- ✅ Cargo log skeleton — items + plants (plants stubbed for v0.0.9.8; structures handled by v0.0.9.10 upgrades-tab pattern instead) _(shipped v0.0.9.7.1)_
- ✅ Topographic map presentation rework begins _(shipped v0.0.9.7.1; vignette / outside-ring dim / ring outline / node restyle remain)_
- ~~UI facelift groundwork~~ — moved out of v0.0.9.7
- ~~First-run onboarding rework alongside the new UI shell~~ — deferred (systems still molten)

### v0.0.9.8 — the kitchen
_Cooking system full implementation, no temperature content yet_

- Two-plant combo mechanic
- Picker UI, meal slot, overwrite warning
- Field cooking (water cost) + depot cooking (trust-gated)
- 9 plants implemented across existing biomes
- Cargo log updated to support plants
- Depot stoves per NPC reflecting terrain

### v0.0.9.9 — the salvage
_Salvage system and carrier upgrade_

- Salvage as item, 6 slot dedicated bag
- Ground spawns
- Carrier lvl 2 recycling (active battery drain)
- Carrier salvage inventory
- Biome variance on salvage output (2-3 types, names TBD)
- Scrapheap structure stubbed in

### v0.0.9.10 — the build
_Structures full implementation against locked salvage_

- Trust tier restructure (t20/t40/t60/t80/t100)
- Structure slots per NPC (1 default + 2 trust-unlocked)
- Full structure catalog (~11): roads, generator, well, postbox, shelter, scrapheap, zipline, bridge, storm shelter, tool cache, lookout
- Scrip costs early, salvage costs mid/late
- Decay and storm exposure
- Rebuild global meter (narrative only)
- Settlement state block (population, condition text, current needs)
- Cargo log updated to support structures

### v0.0.9.11 — the terrain
_Renderer rework, unblocks everything downstream_

- Mesa, mountain, hill renderer support
- Background scrolling rework
- Temperature zones declared per terrain (hot/cold)
- Biome variance on salvage refined against new terrain
- New biome plant slots opened (not filled yet)

### v0.0.9.12 — the heat
_Temperature effects and desert content, now unblocked_

- Temperature penalty system implemented (feeds stamina/strain)
- Sunflower reworked to heat-specific trigger
- Second desert plant designed and implemented
- Mountain cold plant(s) stubbed or implemented
- Cooking updated to support temperature triggers
- Cargo log updated with new plants

### v0.1.0 — the long haul
_Polish, tuning, reset_

- Structure tuning (cooldowns, costs, decay rates)
- Zipline network shape finalized
- Lookout pkg-spawn additive vs zero-sum decided
- 36 NPC gift items authored — leaning toward first gift being a structure unlock per NPC
- Sim-informed balance: canteen, boot durability, trust pacing, NPC equity
- Accessibility pass (reduced-motion, keyboard nav, screen-reader semantics)
- Long-session reliability audit — 48h+ idle profile for memory growth + multi-tab smoke test (no save / BroadcastChannel races)
- Save schema cap — drop pre-v9 migration chain in `persistence.js`
- Discoverability finish — page title, meta, OG tags, non-Neocities favicon, "about" copy (scaffolding shipped v0.0.9.6.10.24)
- Rebuild global meter reset for live
- Full headless sim pass
- Any loose ends from 9.7-9.12

---

## explicitly post-1.0

Listed so they don't quietly creep into the 1.0 must-ship list.

- **Sprite art.** Long-term ambition. ASCII is the 1.0 aesthetic.
- **Visibility sharding.** Waits for ~10+ concurrent players.
- **Modifier stacking** (fragile + lightweight combos). Deferred for clarity.
- **Sticky gun rework.** Post-1.0 unless design crystallizes naturally during the polish pass.
- **Scanner battery draw nuance** beyond the v0.0.9.6.10.13 active-only split.

---

## ship criteria

The plain-language checklist that says "we're there."

- [ ] Sim harness shows a balanced end-to-end loop. No system over- or under-solved.
- [ ] Final NPC roster locked. Every NPC has full dialogue, five trust tiers, and three integrated gifts (per v0.1.0 scope).
- [ ] Every patch in the **patch sequence** is landed, or its scope explicitly moved to **post-1.0**.
- [ ] All **molten** questions are resolved or decisively deferred.
- [ ] A new player can complete one full ring loop without dev hand-holding and the game's shape is legible to them.
- [ ] No regressions in mobile compatibility or save/load round-trip.
- [ ] One last balance pass after the final feature lands.

---

## a note for when this doc feels heavy

It's a lot, but most of it is already scoped. The patch sequence has slots for cooking, salvage, structures, terrain, and temperature. The gear screen and the depth of the mountain mechanic are the two genuinely open holes, and "open" is fine — that's what the molten section is for.

1.0 is closer than the version number suggests.
