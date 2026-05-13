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
- **Every NPC has full voice + five trust tiers + two integrated gifts.** Third gift tier is a pending pre-1.0 decision; the bar at 1.0 is two.
- **12-NPC cast.** The bible has the roster. Additional NPCs is a post-1.0 path.
- **Worker dormancy is graceful.** When the relay worker is down, the game plays solo silently. No UI noise. Free-tier limits trigger silent-disable; upgrade-to-paid happens if and when daily active usage warrants it.
- **Browser floor: mid-2023+.** Chrome 89+ / Firefox 113+ / Safari 16.4+ (CompressionStream-bound). Pre-floor browsers get a "too old" message instead of silent breakage.

---

## decisions queue — items that need a call before specific patches

(Previously "molten"; the 1.0-blocking design questions all resolved in the 2026-05-12 walkthrough. What remains are detail-locks tied to specific patches, plus design specs that get their own docs.)

- **Mountain climbing — discrete moment shape.** Direction locked (discrete moment, not strain-only); specifics lock at v0.0.9.14 renderer alongside its spec doc.
- **Sound interaction model** (volume mixer, per-channel, autoplay handling) — lives in a TLH-SOUND.md when v0.0.9.15 is next-up.
- **Profile + likes retention / communication** — lives in the v0.0.9.10 structures spec when it's next-up.
- **Early trust-gift rework — boot clip + sticky gun.** Design framing first (couple hours of disciplined work, your call when); impl pass lands as a v0.1.0 polish item. Door open to rework, replace, or buff-via-tuning.
- **Third gift tier (12 additional upgrades, one per NPC).** Open question; not necessary to engage with at the moment. If yes, slots into v0.1.0; if no, post-1.0.

---

## patch sequence to 1.0

The work between here and there. Each patch is scoped tightly enough to ship; the sequence respects what unblocks what.

### v0.0.9.7 — the log & lift
_UI foundations and cargo log, low risk, high momentum_

- ✅ Cargo log surface _(shipped v0.0.9.7.1 as dispatch sub-tab; reworked v0.0.9.7.2 to slide-in drawer over upgrades + settlements, with pending-discovery dot)_
- ✅ Cargo log skeleton — items + plants (plants stubbed for v0.0.9.8; structures handled by v0.0.9.10 upgrades-tab pattern instead) _(shipped v0.0.9.7.1)_
- ✅ Topographic map presentation rework _(shipped v0.0.9.7.1 → v0.0.9.7.7: raster + outside-ring dim/hatch + vignette + ring polygon outline + node well treatment)_
- ✅ Interior mesa climbing + placed-gear tooltips _(v0.0.9.7.10)_
- ✅ Fragile-first damage selection _(v0.0.9.7.8)_
- ✅ Security hardening + worker boundary _(v0.0.9.7.11 + v0.0.9.7.13)_
- ~~UI facelift groundwork~~ — moved out of v0.0.9.7
- ~~First-run onboarding rework alongside the new UI shell~~ — moved to v0.0.9.16 (the onboarding)

### v0.0.9.8 — the kitchen
_Cooking system full implementation, no temperature content yet. Full spec (with locked decisions and remaining open items) in [TLH-KITCHEN.md](TLH-KITCHEN.md)._

- Two-plant combo mechanic
- Cooking UI in the cargo drawer's new "meals" sub-section (active buff + 2-back recipe queue + overwrite prompts)
- Field cooking (water cost) + depot cooking (free at t40 trust — placeholder, formal per-NPC call lands in v0.0.9.10)
- 11 plants + 1 supply (porter's pal) implemented across existing biomes
- Cargo log updated to support plants
- NPC depot signature recipes (11 authored; π defers to v0.0.9.11 cold plants)
- Pre-impl workshop: resolve weak-felt conditionals (scrip_grace / scanner_grace / gadget_grace) — see kitchen doc item 7

### v0.0.9.9 — the salvage
_Salvage system and carrier upgrade_

- Salvage as item, 6 slot dedicated bag
- Ground spawns
- Carrier lvl 2 recycling (active battery drain)
- Carrier salvage inventory
- Biome variance on salvage output (2-3 types, names TBD)
- Scrapheap structure stubbed in
- Quick tag/tier consistency check when cargo system is touched (substantive audit moved to v0.0.9.13 — the cast).

### v0.0.9.10 — the build
_Structures full implementation against locked salvage. Needs its own spec doc when next-up._

- Trust tier restructure (t20/t40/t60/t80/t100)
- Structure slots per NPC (1 default + 2 trust-unlocked)
- Full structure catalog (~11): roads, generator, well, postbox, shelter, scrapheap, zipline, bridge, storm shelter, tool cache, lookout
- Scrip costs early, salvage costs mid/late
- Decay and storm exposure
- Rebuild global meter (narrative only)
- Settlement state block (population, condition text, current needs)
- **Soft porter profile system + DS-style social rewards.** Quiet, opt-in surfacing of likes on placed structures; possibly a small buff on receipt. Retention / communication language lives in this patch's spec doc.
- Cargo log updated to support structures

### v0.0.9.11 — the drift
_Drift as a unified mechanical phenomenon. Currently absent from code; this lands the lore-load-bearing world antagonist in player hands. Lands before heat so heat's drift-adjacency has somewhere to plug in._

- Drift density variance (per cell or biome region)
- Scanner reads drift density to surface drift-obscured packages
- Forecast garbling proportional to drift on transmission path (φ reports corrupt with heavy drift)
- Drift body effects — jetlag-shaped recovery, cognitive fog at higher density
- Walking suppresses drift on roads (use-as-maintenance dynamics)
- Drift fronts as weather events (heavy days, drift-front warnings via φ)
- Package shell wear — case integrity erodes with time-in-world / weather / pack-time. Erosion as susceptibility, not destruction. Builds on existing trip-chance + strain-buildup; complements fragile tag without replacing it.

### v0.0.9.12 — the heat
_Temperature mechanic + biome data, no renderer changes yet_

- Temperature penalty system implemented (feeds stamina/strain)
- Temperature zones declared per terrain (hot/cold) — data only
- Sunflower reworked to heat-specific trigger
- Second desert plant designed and implemented
- Mountain cold plant(s) stubbed or implemented
- Cooking updated to support temperature triggers
- Biome variance on salvage refined against existing terrain
- New biome plant slots opened (not filled yet)
- Cargo log updated with new plants

### v0.0.9.13 — the cast
_Lore-driven content rewrite. Lands after all cargo-touching systems (.8 cooking, .9 salvage, .10 structures, .11 drift, .12 heat) and before .16 onboarding, so onboarding teaches against final content. Lore lives in Obsidian; paste-or-stage at task time._

- Cargo audit — full 3-axis rewrite of the ~370-label pool:
  - World-thematic cargo (drift, graveyard, porters, retirement)
  - Inter-NPC connective tissue made tangible (drift-tech artifacts ξ recovers, φ↔ι cultivars, φ↔γ scrap, forecasts to ξ, ν↔φ irrigation parts)
  - Inert-vs-maintained distinction
- NPC dialogue rewrite — full trust-ladder voice for all 12 NPCs, with connective-tissue threads woven through: ξ↔ι (specimen-carrying), δ↔ν (parallel infrastructure-keepers, currently no exchange), θ↔τ (rooted-village pair, no exchange), λ↔others (only λ↔π currently wired)

### v0.0.9.14 — the relief
_Renderer rework. Mountain-climbing discrete-moment specifics lock here alongside the spec doc._

- Mesa, mountain, hill renderer support
- Background scrolling rework
- Mountain climbing discrete-moment mechanic (direction locked: a beat that makes climbing feel like climbing, not just slow walking. Specifics lock at implementation.)
- Optional: heat-zone visual cues (warm/cool tints) layered on the new renderer
- Optional: drift-density visual cues (haze / thinning) layered on the new renderer

Renderer lands late so 1.0 polish doesn't risk being invalidated by visual rework. Drift (.11) and heat (.12) both ship on the existing renderer; the world doesn't look different until .14, but their mechanics are in player hands.

### v0.0.9.15 — sound
_Ambient soundscape. CC0-sourced. Mute-by-default non-negotiable. Interaction model (mixer, per-channel, autoplay handling) lives in TLH-SOUND.md when next-up._

- Per-terrain ambient layer
- Per-weather layer (rain, storms)
- Mute-by-default; player-discoverable toggle
- Autoplay handling per browser policy

### v0.0.9.16 — the onboarding
_First-run experience and player progression. Subsumes v0.0.9.7-deferred onboarding rework. Necessary pre-1.0._

- First-run flow + ρ handover ceremony (in-game tutorial integration)
- Player walks gradient of liveness — pacing of NPC introductions
- NPC introduction sequence (when meets ξ vs ι; hears about π before reaching them)
- First-encounter dialogue per NPC (scripted intro; full trust-ladder lives in v0.0.9.13 — the cast)
- Teaching elements for core systems (cargo log, dispatch terminal as boot screen, trust, sound toggle)

### v0.1.0 — the long haul
_Polish, tuning, reset._

- Structure tuning (cooldowns, costs, decay rates)
- Zipline network shape finalized
- Lookout pkg-spawn additive vs zero-sum decided
- Optional: third gift tier — 12 additional upgrades, one per NPC. Pending pre-1.0 decision (in decisions queue).
- Early trust-gift rework (boot clip + sticky gun) — design framing landed earlier; impl pass here. Rework / replace / buff-via-tuning all on the table.
- Worker offline-path verification + documentation
- IndexedDB save redundancy — silent write to localStorage + IndexedDB so browser-clear of one storage area doesn't lose the save
- "Browser too old" message replaces silent breakage on pre-floor browsers
- Touch-friendly mobile presentation + cargo drag-toss fix (raises the mobile floor; full mobile platform remains post-1.0)
- Phosphor-script identity rendering — pack-flap glyph (visible under specific light) + cargo popout phosphor stripe; 16 hex glyphs as inline SVG (15 Block Elements + 1 custom empty); porter id renders as glyph sequence; fade-with-distance from depot, ρ refreshes on each return
- Loop-notation UI surface — where ρ's per-loop log entries appear (cargo popout, dispatch-log line on return-to-depot, or both — pick one)
- POSTROAD frozen build-string on dispatch boot screen — `build 4.2.7r — released [year]` style, frozen at last pre-collapse update date
- Sim-informed balance: canteen, boot durability, trust pacing, NPC equity
- Accessibility pass (reduced-motion, keyboard nav, screen-reader semantics)
- Long-session reliability audit — 48h+ idle profile for memory growth + multi-tab smoke test (no save / BroadcastChannel races)
- Save schema cap — drop pre-v9 migration chain in `persistence.js`
- Discoverability finish — page title, meta, OG tags, non-Neocities favicon, "about" copy (scaffolding shipped v0.0.9.6.10.24)
- Rebuild global meter reset for live
- Full headless sim pass
- Any loose ends from 9.7-9.16

---

## explicitly post-1.0

Listed so they don't quietly creep into the 1.0 must-ship list.

- **Sprite art.** Long-term ambition. ASCII is the 1.0 aesthetic.
- **Visibility sharding.** Waits for ~10+ concurrent players.
- **Modifier stacking** (fragile + lightweight combos). Deferred for clarity.
- **Sticky gun rework.** Post-1.0 unless design crystallizes naturally during the polish pass.
- **Scanner battery draw nuance** beyond the v0.0.9.6.10.13 active-only split.
- **Additional NPCs beyond the 12-NPC cast.** Bigger world, more relationships; post-1.0 expansion path.
- **Gear screen.** Alternate body-paperdoll loadout view showing where each upgrade sits on the porter.
- **Full mobile platform.** v0.1.0 raises the floor (touch-friendly + drag-toss fix); full-platform parity post-1.0.

---

## ship criteria

The plain-language checklist that says "we're there."

- [ ] Sim harness shows a balanced end-to-end loop. No system over- or under-solved.
- [ ] Final NPC roster locked at 12. Every NPC has full dialogue, five trust tiers, and two integrated gifts (third tier optional, decision in queue).
- [ ] Every patch in the **patch sequence** is landed, or its scope explicitly moved to **post-1.0**.
- [ ] All **decisions queue** items are resolved.
- [ ] A new player can complete one full ring loop without dev hand-holding and the game's shape is legible to them.
- [ ] No regressions in mobile compatibility or save/load round-trip.
- [ ] One last balance pass after the final feature lands.

---

## a note for when this doc feels heavy

It's a lot, but most of it is already scoped. The patch sequence has slots for cooking, salvage, structures, drift, temperature, the cast, renderer rework, sound, and onboarding. The decisions queue is short — the 1.0-blocking design questions all resolved into specific patches or post-1.0.

1.0 is closer than the version number suggests.
