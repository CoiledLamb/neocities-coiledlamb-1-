# roadmap critique — round 2 — 2026-05-12
_Building on `docs/roadmap-critique-2026-05-12.md`. New lens per user ask: where is the doc **lacking**, **missing details**, or **overstuffed**. Less about contradictions, more about what's underspecified or could be trimmed._

---

## headline findings

1. **Companion-doc pattern is applied to cooking only.** Cooking has its own 50+ line spec in [TLH-KITCHEN.md](../tlh/TLH-KITCHEN.md). Salvage, structures, drift, heat, renderer, and onboarding have only the bullets in TLH-1.0.md. As each patch approaches "next-up," it'll need a kitchen-shaped spec or its 1.0 bullets won't survive contact with implementation. The pattern is real but unwritten.
2. **Companion docs drift.** TLH-KITCHEN.md says ".11 = heat-themed plants, .12 = renderer." TLH-1.0.md says ".11 = drift, .12 = heat, .13 = renderer." Drift was inserted at .11 after kitchen was written; kitchen never got updated. Same drift problem the bible had, this time in a younger doc.
3. **Ship criteria check mechanics, not feel.** "Sim shows balanced loop" doesn't catch "depot cooking feels fiddly" or "drift body effects confuse new players." Add a feel-criterion — even a soft one ("internal playtest of N hours from clean save reveals no blocking confusion").
4. **v0.1.0 split, named.** Round 1 said split. The split that actually makes sense: **v0.0.9.15 — the cast** (36 gifts + full trust-ladder dialogue + connective tissue + sim balance from new content) + **v0.1.0 — the ship** (audits + accessibility + discoverability + identity-as-optional + final polish). Two patches each shippable on their own merit.
5. **End-state is unspecified.** "Rebuilding" implies progress; "rebuild global meter (narrative only)" implies a track. Does the meter ever reach 100%? Is there a "you did it" moment, or is it pure idle-forever? Locked-section silent. For an idle game this is a thesis-level question.
6. **Several v0.1.0 items are new features dressed as polish.** Phosphor-script identity rendering, POSTROAD build-string, loop-notation UI surface — all new features. They could defer post-1.0 without hurting the ship bar.
7. **Molten section does two jobs.** Half is scope-management (what might move between locked/post-1.0), half is decision-queue (what needs choosing by patch X). The two need different triage. Split them.

---

## lacking (things not in the doc that should be)

### locked-section gaps

The locked section claims to be "the thesis. Anything in here is the game; changing it would be a different game." But several thesis-level commitments are unspoken:

- **Single porter / no party.** TLH is one character, not a controllable team. Locked but unstated.
- **Single route / no procedural generation.** The ring is the ring. Locked but unstated.
- **No class / role / build system.** Every player has access to the same systems. Locked but unstated.
- **No leaderboards or competitive surfacing.** "Async multiplayer that never interrupts" implies it, but absence-of-competition is a real design choice worth naming.
- **Pace.** The game is "quiet, unhurried" (per bible). That's pace, not narrative. The locked section covers post-post-apocalypse (narrative posture) but doesn't lock the cadence. A faster idle game with the same systems would be a different game.
- **End-state stance.** Does the game end? If "rebuilding" is the frame, is there a rebuilt-state? Or does the loop continue indefinitely? Pick a stance, lock it.

### molten-section gaps

- **Sound interaction model.** Mute-by-default is noted. But: is there a volume mixer? Per-channel (ambient vs weather vs UI)? Toggleable terrain ambience? Autoplay handling for browsers that block it? These are real implementation questions if sound ships at all.
- **Privacy story shape.** The bullet says "what's stored, for how long, public-facing language." That's the *frame*, not the *content*. What's the actual answer? Until that's written, there's nothing for the itch page to quote.
- **Cost ceiling concrete trigger.** "Decision-shaped, not code" — fine, but what's the decision threshold? If Cloudflare bill hits $X, do what? "Accept paid plan vs ride-out vs silent-disable" is three branches without a number.
- **Worker dormancy verification gate.** "Probably true today by accident. Verify." That's a task, not a decision. Schedule it (which patch verifies?) or mark it shipped.
- **Browser compatibility floor — actual number.** CompressionStream is the binding constraint. Safari 16.4 (March 2023) was the last big platform. State the floor: "Chrome/Edge 89+, Firefox 113+, Safari 16.4+." Then the "browser too old" message has a concrete check.

### ship-criteria gaps

The 7 criteria are mostly mechanical. Missing:

- **Visual cohesion criterion.** After .13 renderer rework + .11 drift visuals + .12 heat visuals, do the maps + game area + cargo log look like the same game? No criterion captures this.
- **NPC equity criterion.** Sim found "NPC equity uneven" in .9.6.9. "Sim shows balanced loop" is the ship criterion — but does that *specifically* include NPC equity, or is it about the global loop? Say it.
- **Long-session pass/fail.** The .1.0 list has "48h+ idle profile for memory growth + multi-tab smoke test." That's a *process*. The criterion should say "**passes** 48h+ idle without measurable memory growth."
- **Feel criterion.** Internal playtest of a new system from clean save by someone who didn't design it. The cargo audit's whole point is the game feeling more like a *world* than a *taxonomy* — but there's no criterion that checks for that.
- **Cargo audit disposition.** If it's a 1.0 deliverable, name it. If deferred, name it. Today it's tucked into a molten bullet with no surfacing in ship criteria.
- **Kitchen/drift/heat each playable to satisfaction.** "Every patch landed" doesn't say "every patch lands its design promise." Cooking could ship technically while the recipes are unmotivated. Worth a "each system stands on its own when played in isolation" line.

### outside the patch sequence

Things 1.0 doesn't address but should:

- **Playtesting plan.** "A new player can complete one full ring loop without dev hand-holding" — who is that new player? Where do they come from? When? Sample size = 1 is anecdote. Even informal: "ask 3 friends post-.14, watch them play."
- **First-week post-1.0 plan.** The doc ends at "shipped." Idle games live or die in the first week of post-launch tuning. Worth a one-liner: "1.0.x hotfix patches expected for ~2 weeks; balance bands held loose."
- **Worker scaling threshold** (flagged round 1, still missing).
- **Bug threshold for shipping.** Zero open bugs is unrealistic. What's acceptable at 1.0? "No P0/P1 open, P2 with workarounds OK" or similar.
- **Soft-launch vs hard-launch.** Does 1.0 just appear, or is there a "1.0 RC" period? Two-phase ship is common.
- **Itch.io page assets** (flagged round 1, still missing) — screenshots, GIFs, capsule.
- **Demo / press / outreach** — even an explicit "no outreach planned" is a position.

### post-1.0 candidates not listed

Things implicitly deferred but not surfaced:

- **Dispatch log virtualization.** Mentioned in old handoff as "benched at v0.0.9.8." Vanished from 1.0 doc. Where did it go? Post-1.0 list or cut.
- **DO migration** (single-DO bottleneck, in memory but not in doc).
- **Localization** — single-language at 1.0 is fine, but say so.
- **Cloud save / sync** — presumably "no, localStorage + export/import is the contract." Say so.
- **Telemetry / analytics** — presumably "no, privacy-first." Say so.
- **Music** vs **ambient soundscape** — if "sound" only means ambient, music is a separate question (intentionally absent? deferred?).
- **Mobile UX upgrade beyond current floor** — listed as molten, but its post-1.0 form (if accepted-current-state) isn't surfaced.
- **Modding / extensibility** — implicit "no" but worth naming.

---

## missing details (there but underspecified)

The cooking patch has TLH-KITCHEN.md. The other patches don't. The 1.0 bullets are the only spec, and they leave too much open for the patch to actually ship from them.

### .9 — the salvage

- **"Carrier lvl 2 recycling (active battery drain)."** What does "recycling" mean mechanically? Convert salvage to something else? Reduce weight? Generate scrip? "Recycling" is a name, not a behavior.
- **"6 slot dedicated bag."** Separate from the cargo grid or uses the same bin-pack? UI surface? Toggleable view?
- **"Biome variance on salvage output (2-3 types, names TBD)."** Three names is a tiny pool relative to the ~370 package label set. Is 2-3 placeholder or final? If final, salvage is meant to feel sparsely-named — worth saying.
- **"Scrapheap structure stubbed in."** Stubbed where? At a depot? In the world? What does the stub *do* before .10 fills it in?
- **Tag/tier audit when cargo system is touched.** This is the cargo audit hook landing inside .9, but the audit scope is undefined (round 1's complaint, still unresolved).

### .10 — the build

- **"Trust tier restructure (t20/t40/t60/t80/t100)."** Adds t100. What lives at t100? Existing t60 (battery charging) and t80 (free rest) move? Stay? Curve reshape? This is a *system-level* change tucked into one bullet.
- **"Structure slots per NPC (1 default + 2 trust-unlocked)."** So each NPC has 3 structure slots. 12 × 3 = 36 placement slots. How does placement decision work — NPC proposes what they want? Player picks from the catalog? Auto-assigned?
- **Catalog of ~11 structures.** Functional overlap unaddressed: shelter vs storm shelter (both shelter from things), tool cache vs scrapheap (both salvage-related). Are these meant to be distinct or aspectual variants?
- **Decay rates.** Existing gear decays on wallclock. Do structures use the same rate (12h base × multipliers)? Slower? Storm-accelerated?
- **"Rebuild global meter (narrative only)."** What is it? Where does it surface? "Narrative only" suggests no mechanical effect — but a meter that doesn't drive anything is just a number on screen. What does it count?
- **"Settlement state block (population, condition text, current needs)."** Dynamic? Static per-NPC? "Current needs" suggests dynamic — does it drive package generation or just flavor the UI?

### .11 — the drift

Seven mechanics, light on each:

- **"Drift density variance (per cell or biome region)."** "Or" — pick. The choice affects rendering, scanner mechanic, and walking-on-roads suppression.
- **"Scanner reads drift density to surface drift-obscured packages."** New scanner ability — adds to existing scanner T1/T2 or replaces? Battery cost?
- **"Forecast garbling proportional to drift on transmission path."** What does garbling *look like*? Gibberish in the rendered text? Missing characters? Wrong intensity numbers? The presentation matters because forecasts are how phi communicates.
- **"Drift body effects — jetlag-shaped recovery, cognitive fog at higher density."** "Cognitive fog" mechanically = ? Slower message reading? Reduced strain capacity? Visual UI dimming? Word-choice changes in NPC dialogue? Each is a different implementation.
- **"Walking suppresses drift on roads."** Permanent reduction per walk? Time-bounded? Decay reverses while you're away? Roads must exist as structures (from .10) for this to work — implicit dependency on .10 success.
- **"Drift fronts as weather events."** Same dual-gaussian shape as storms, or different? Issued by phi as warnings like storms? Same isobar rendering on map?
- **"Package shell wear — case integrity erodes with time-in-world / weather / pack-time."** New decay axis on packages. How surfaced? Visible per-package on the cargo tile? In cargo log? Affects delivery dialogue?

### .12 — the heat

- **"Temperature penalty system (feeds stamina/strain)."** Penalty in both hot AND cold directions, or just hot? "Mountain cold plant(s)" later in the bullet suggests both — say so.
- **"Temperature zones declared per terrain (hot/cold) — data only."** Diurnal cycle interaction? Hot during the day, cold at night? Or static-per-terrain regardless of time?
- **"Sunflower reworked to heat-specific trigger."** Sunflower currently does what? (Kitchen doc has plant names; sunflower among them?) This refers back to .8 plants — the rework is dependent on .8's design.
- **"New biome plant slots opened (not filled yet)."** Slots in *existing* biomes (since biomes haven't been added) or are biome slots themselves new? "Opened" without "filled" is doing a lot.

### .13 — the relief

- **"Mesa, mountain, hill renderer support."** The world is currently 2D plane from above. Is this side-view rendering (the bible's "side-view play area strip" that's untouched since v0.0.9.1)? Or new visual treatment on the 2D map view? Different files, different work.
- **"Background scrolling rework."** Background of which surface? Side-view? Route map? The "thick side-view rendering deferred out of .7" suggests this is the side-view, but the bullet doesn't say.
- **"Optional: heat-zone visual cues / drift-density visual cues."** What's the gate that makes these optional? If renderer ships, the visual cues for the systems it visualizes should ride along. "Optional" suggests "might cut" — what triggers the cut?

### .14 — the onboarding

- **"First-run flow + ρ handover ceremony."** Handover of what? Player picks up where ρ left off (the depot, a previous porter)? Some kind of ritual? The phrase is evocative but undefined.
- **"Player walks gradient of liveness — pacing of NPC introductions."** "Gradient of liveness" is poetic; what does it mean mechanically? Visibility stages (the existing stage 0→3 system)? Trust ramp? Story-pacing of who appears when?
- **"NPC introduction sequence (when meets ξ vs ι; hears about π before reaching them)."** This is content authoring. Who mentions whom in what order. That's a 12-NPC dependency graph the doc hasn't sketched.
- **"Teaching elements for core systems (cargo log, dispatch terminal as boot screen, trust)."** "Dispatch terminal as boot screen" — first time on this list. Surfaces in v0.1.0 as POSTROAD build-string. Is the boot screen the dispatch terminal *in concept* or *in literal rendering*? Different scopes.

### v0.1.0

- **Phosphor-script identity.** "Fade-with-distance from depot" — what curve? Linear? Square? Visible at 0–N cells, faded N–M, invisible past M? "ρ refreshes on each return" — does that mean glyphs visibly redraw on return-to-depot, or just that the data refreshes?
- **Loop-notation UI surface.** Three options listed (cargo popout, dispatch-log line, both). No decision criterion. Pick.
- **"Lookout pkg-spawn additive vs zero-sum decided."** This is a *decision* in a polish list. Additive: lookouts add new packages to the world. Zero-sum: lookouts redistribute existing spawns. Mechanically very different. What's the question hinging on?
- **"Zipline network shape finalized."** Implies ziplines exist before .1.0. They're in .10's catalog. Is "finalized" tuning, or final design (which would mean .10 ships unfinished)?

### cross-patch dependencies

- **Sticky gun rework ↔ tau's t20 gift.** The locked section says "every NPC has 5 trust tiers + 2 integrated gifts" (currently 2, planned 3 per v0.1.0). Tau's t20 is the sticky gun. If sticky gun reworks in .12+ or post-1.0, tau's t20 reshapes. The doc doesn't surface this.
- **Trust restructure ↔ existing rewards.** Adding t100 at .10 means t60 (battery charging) and t80 (free rest) either compress or stay put. If they stay, t100 is a *new* unlock — what is it? If they compress, every existing save's trust state gets reinterpreted.
- **Cargo audit ↔ salvage naming.** .9 ships salvage with "2-3 types, names TBD." If cargo audit reframes thematic naming, salvage either gets retroactively re-themed or ships before the audit and is inconsistent with the audit's output.
- **Drift roads ↔ structure roads.** .11's "walking suppresses drift on roads" needs .10's roads to exist. Implicit dependency.

---

## overstuffed (cut, trim, or split)

### v0.1.0 split — named proposal

Currently v0.1.0 is 14 bullets including 36 gifts + full trust-ladder × 12 + new phosphor system + 48h audit + accessibility + discoverability + structure tuning + zipline shape + lookout decision + balance + save schema cap + rebuild meter reset + headless sim pass + loose ends. Subtitle "Polish, tuning, reset" undersells this badly.

Proposed split:

**v0.0.9.15 — the cast**
_Content: gifts, dialogue, connective tissue, balance under new content._
- 36 NPC gift items (or whatever the locked-decided number is)
- Full trust-ladder dialogue × 12 NPCs
- Connective-tissue threads (ξ↔ι, δ↔ν, θ↔τ, λ↔others)
- Sim-informed balance after all new content lands
- Structure tuning (cooldowns, costs, decay)
- Zipline network shape finalized
- Lookout pkg-spawn decision

**v0.1.0 — the ship**
_Audits, accessibility, discoverability, polish, reset._
- 48h+ reliability audit
- Accessibility pass
- Discoverability finish
- Save schema cap (drop pre-v9)
- Rebuild global meter reset for live
- Full headless sim pass
- Any loose ends
- Optional: phosphor-script identity (if landed; else post-1.0)
- Optional: loop-notation UI surface (if needed; else post-1.0)
- Optional: POSTROAD build-string (flavor; else post-1.0)

This gives each patch a coherent thesis ("the cast" / "the ship") and lets the identity-rendering features defer cleanly post-1.0 without dragging the ship.

### v0.0.9.11 split

Drift is 7 mechanics. Some are infrastructure (density variance, scanner reads), some are content (forecast garbling, dialogue effects), some are weather (drift fronts), some are decay (package shell wear). Worth splitting:

- **v0.0.9.11a — drift world**: density variance, scanner reads, walking-suppression-on-roads
- **v0.0.9.11b — drift effects**: body effects, forecast garbling, drift fronts as weather events, package shell wear

The split lets the world layer prove out (sim runs) before the effect layer tunes onto it.

### molten section split — two queues

The molten section conflates two activities. Suggested split:

**scope questions** — things that might move between locked and post-1.0:
- Mountain climbing depth (could be locked "strain only" or post-1.0 "discrete-moment exploration")
- Gear screen (pre-1.0 / post-1.0 / cut)
- Sticky gun rework (post-1.0 unless natural crystal during polish)
- Sound (pre-1.0 ambient / post-1.0 / cut)
- NPC count (likely locked-promote at 12)

**decisions queue** — things to choose by patch X:
- Cargo audit scope: decide before .9 starts
- Cost ceiling policy: decide before .14 ships
- Privacy story content: decide before itch page exists (in .14 or .1.0)
- Save robustness: decide before .14 (onboarding teaches chosen save flow)
- Browser compatibility floor: decide before .14 (onboarding renders "too old" message)
- Mobile UX scope: decide before .1.0 starts
- Bug reporting channel: decide before community-visible launch
- Trip-chance internal naming: hygiene, defer indefinitely

The decision queue has implicit deadlines tied to the patch sequence. Surface them.

### cargo audit — MVP scope

Round 1 said "own slot or deferred." The middle path: ship a *minimum-viable* cargo audit that earns its keep without eating .9.

The audit's 3 axes:
1. **World-thematic cargo** (drift, graveyard, porters, retirement) — narrative flavor, can defer post-1.0 as a content patch
2. **Inter-NPC connective tissue** (ξ↔ι specimens, φ↔ι cultivars, etc.) — load-bearing for "the route is a cast" thesis
3. **Inert vs maintained distinction** — taxonomic, low immediate payoff

MVP for 1.0: ship axis 2 (connective tissue) only. ~25 new labels with the right NPC pair tags. Axes 1 and 3 defer post-1.0. The doc currently treats all three as one block; pulling them apart unlocks shippable progress.

### candidate v0.1.0 → post-1.0 moves

Features dressed as polish that could honestly defer:

- **Phosphor-script identity rendering.** Beautiful idea, but a *new identity system*. Game's playable without it. Defer cleanly.
- **POSTROAD frozen build-string on dispatch boot screen.** Flavor. Defer.
- **Loop-notation UI surface.** Small but real implementation. Defer or land in .14 onboarding with the rest of the teaching surfaces.

Each move recovers v0.1.0 capacity for actual polish (balance, accessibility, audits).

### molten — close the easy ones now

Round 1 noted the molten section is too big. Concrete closures:

- **NPC count 12** — promote to locked. Bible has the roster. Done.
- **Sticky gun rework** — already noted as "post-1.0 unless crystallizes." Close as deferred.
- **Worker dormancy verification** — schedule the verify task into a sub-patch (.7.x or .8.x). Close.
- **Trip-chance internal naming** — hygiene, low priority. Move to "won't fix unless cleaning that file anyway."
- **Mobile UX scope** — pick a stance. "Accept current state explicitly" is a valid close.

5 closures shrinks molten from 13 to 8. Doc breathes.

---

## net take

Round 1 found contradictions and scope mismatches. Round 2 finds two structural issues:

1. **The 1.0 doc is bullets-only, but the work needs spec-density.** Cooking solved this with TLH-KITCHEN.md. Salvage, structures, drift, heat, renderer, onboarding will each need similar treatment as they come up. Either commit to per-patch design docs or expect 1.0 bullets to be insufficient at implementation time. The pattern is real; make it explicit.
2. **The 1.0 doc's authority isn't enforced on its companions.** Bible drifted (round 1 noted). Kitchen doc has drifted on patch numbering (.11 was heat in kitchen's view; it's drift in 1.0's). Each companion doc needs a "1.0 is canon, update this when 1.0 changes" header, and a sweep when 1.0 changes.

If I were to do exactly three things this week as a result of this review:

1. **Sweep companion docs against 1.0** — kitchen at minimum, plus a quick HANDOFF check. ~1 hour.
2. **Triage molten** (close 5, surface 2-3 genuinely open) — 30 minutes.
3. **Name the v0.1.0 split** in the doc — even as an "if we split, this is the line" comment. Reduces the silent-slip risk round 1 flagged.

The patch sequence shape is right. The doc's job is to be a useful instrument while you walk through it; right now it's a useful blueprint that's slowly losing fidelity. None of this is fatal. All of it compounds.
