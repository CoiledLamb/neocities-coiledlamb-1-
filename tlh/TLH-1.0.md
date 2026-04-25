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
- **NPC count.** 12 today. Could grow by 4–8 more. Affects route density, dialogue authoring load, trust pacing. The ring-rounded-square layout has rim slots — adding past 16 might mean rethinking the geometry.
- **Third gift per NPC.** Two gifts is the locked floor; a third gift tier per NPC is on the table. Decision affects authoring load and the shape of the trust curve at the high end.
- **High-tier unlock restructure.** t60 (battery charging) and t80 (free rest) are likely to be reshaped, and t100 doesn't have a defined unlock yet. Worth resolving before 1.0 since these are the "feels like a gift" moments the trust curve is selling toward.

### balance (sim-informed)
- **Canteen tuning.** Currently runs dry too often. Bias storm tuning toward more/more-concurrent rather than conservative.
- **Boot durability curve.** Sim says too harsh. Designs deferred from v0.0.9.6.9.8.
- **Trust pacing.** Sim says glacial.
- **NPC equity.** Uneven gain rates across the cast.

### systems still being shaped
- **Structures + salvage.** Postbox / generator / well are sketched. Open: salvage as ground-spawn vs. passive terrain yield. Open: build cost (salvage-only vs. salvage + scrip vs. salvage + trust).
- **Mountain climbing.** Renderer needs elevation support. Open: is strain alone the right axis, or is there room for a discrete moment within idle-first?
- **Cooking.** WIP. Shape TBD.
- **Gear screen.** WIP. Alternate view for upgrades — needs decision on whether it replaces the current panel or coexists.
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

## must-ship before 1.0

The work between here and there. Order is rough.

1. **v0.0.9.7 — polish pass.** Sim-informed balance: canteen, boots, trust, equity.
2. **Structures + salvage.** Postbox, generator, well + materials gathering. Async hook through existing world overlay.
3. **Mountain climbing.** Renderer elevation support + `terrainAt` / `courierTerrain` extension. Mechanic depth at TBD level.
4. **Cooking.** Authoring + integration into the canteen/stamina/trust loop or wherever it lands.
5. **Gear screen.** Alternate upgrades view shipped and decided-on.
6. **Dispatch log virtualization** (v0.0.9.8 from existing handoff plan).
7. **NPC expansion** if final count is >12. Dialogue, dispatch, gifts, trust profile per new NPC.
8. **First-run onboarding.** What a cold arrival sees — current state assumes you already know the loop. Pre-1.0 quality bar.
9. **Accessibility pass.** Reduced-motion, keyboard navigation, screen-reader semantics. Pre-1.0 quality bar.
10. **Long-session reliability audit.** Profile a 48h+ idle tab for memory growth (trail cells, log entries, listeners). Existing 48h+ save makes a clean starting state. Fold a multi-tab smoke test in while the harness is open — confirm two simultaneous tabs don't race on saves or BroadcastChannel state.
11. **Save schema cap at 1.0.** Drop pre-v9 migration chain in `persistence.js`. One-time simplification.
12. **Build / deploy pipeline.** ~~A `bump-version.sh` or Makefile target replacing the current 273-occurrence sed dance.~~ Shipped: [tlh/scripts/bump-version.sh](tlh/scripts/bump-version.sh). Auto-detects current version, bumps cache-bust strings + subtitle, prints commit message stub. Iterate as needed.
13. **Discoverability surfaces.** Page title, meta description, OG tags, non-Neocities favicon, "about" copy. Small surface, high leverage at launch.
14. **One full balance pass after everything else lands**, since the systems above all interact.

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
- [ ] Final NPC roster locked. Every NPC has full dialogue, five trust tiers, and at least two integrated gifts (third gift either landed or cut).
- [ ] Every system named in **must-ship** is either landed or has been moved to **post-1.0** explicitly.
- [ ] All **molten** questions are resolved or decisively deferred.
- [ ] A new player can complete one full ring loop without dev hand-holding and the game's shape is legible to them.
- [ ] No regressions in mobile compatibility or save/load round-trip.
- [ ] One last balance pass after the final feature lands.

---

## a note for when this doc feels heavy

It's a lot, but most of it is already in motion. The polish pass is scoped. Structures + salvage has a sketch. Mountains have most of the infrastructure. Cooking and the gear screen are the two genuinely open new systems, and "open" is fine — that's what the molten section is for.

1.0 is closer than the version number suggests.
