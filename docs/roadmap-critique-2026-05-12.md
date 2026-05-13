# roadmap critique — TLH-1.0.md as of 2026-05-12
_Foil pass on the 1.0 scope doc. Grounded against TLH-DESIGNBIBLE.md, recent git log, and the .7 sub-patch arc._

---

## headline findings (read first)

1. **The "gifts per NPC" number contradicts itself three ways.** Locked says 2, v0.1.0 implies 3 (36÷12), ship criteria says 3. Bible table only has 2 columns and three NPCs are still empty at t40. The "locked" line is the one that's wrong — it's the older bar, and the v0.1.0 plan moved past it. Fix the locked line or you're shipping past your own stated thesis.
2. **v0.1.0 is the heaviest patch in the whole sequence, framed as the lightest.** Subtitle says "Polish, tuning, reset." The actual list is 14 bullets including 36 gift items, full trust-ladder dialogue for 12 NPCs, a brand-new phosphor identity rendering system, a 48h reliability audit, an accessibility pass, and discoverability. That's not polish — it's another full patch in a trenchcoat.
3. **Bible is stale relative to 1.0 doc.** Bible says "next up: .7 polish, then .8 dispatch log virtualization" — but .8 is now "the kitchen" and dispatch log virtualization isn't on the 1.0 sequence at all. The bible is supposed to be the steady reference; right now it's lying about the patch sequence. If the bible is the canon, the 1.0 doc is non-canon until reconciled.
4. **NPC count is "molten" but the bible has the full 12-row roster table.** This is a decision that's already been made; the molten listing is misleading. Promote it to locked.
5. **Cargo audit is the highest-impact unscoped work in the doc.** It's tucked into a molten bullet ("comprehensive rewrite, supersedes earlier ~15–30 framing") and tied loosely to .9. It's a complete content pass across 3 axes spanning every package label in the game. If it lives in .9 it eats .9; if it floats it never lands. Needs its own patch slot or its own decisively-deferred line.
6. **No fallback plan for any patch going sideways.** If drift (.11) doesn't feel good after first play, what's the protocol — iterate within .11, cut to .11.x post-1.0, ship a worse version? The doc implies a clean march; reality won't be that clean.
7. **Sim harness is invisible in the schedule.** It's referenced as both an authoring tool ("sim-informed balance") and a deliverable ("full headless sim pass" in v0.1.0), but the work to maintain/extend it doesn't get its own line anywhere. After .8 (cooking adds plants), .9 (salvage), .11 (drift), .12 (heat) — the harness needs corresponding extensions to validate each new system. That's hidden engineering.

---

## internal contradictions

### gift count (2 vs 3)

Three numbers in three places:

| Location | Claim |
|---|---|
| Line 34 (locked) | "two integrated gifts" per NPC |
| Line 161 (v0.1.0 patch) | "36 NPC gift items authored" — 36÷12 = 3 per NPC |
| Line 194 (ship criteria) | "three integrated gifts (per v0.1.0 scope)" |
| Bible NPC table | 2 columns (t20, t40); phi/xi/theta have only t20 filled |

The 1.0 doc's *locked* section is supposed to be the immovable part. Right now the immovable bar (2) contradicts the v0.1.0 plan (3). One of them is wrong. My read: the locked line was written before the v0.1.0 plan added the third-gift tier, and "two" should be updated to "three". But: if the third gift is contingent ("leaning toward first gift being a structure unlock per NPC"), then the locked bar is actually still 2 and the third is aspirational. Either way the doc has to commit.

Also: bible has 3 NPCs still missing a t40 gift (phi, xi, theta — column shows "—"). So even the existing 2-gift bar is not met today. Either close those gaps or move them to the v0.1.0 list explicitly.

### .7 closure

Commit `c442273` is titled "v0.0.9.7.7 — topo follow-ups + v0.0.9.7 closed". The 1.0 doc says topographic items (vignette / outside-ring dim / ring outline / node restyle) "remain" in v0.0.9.7. After that "closed" commit there were six more .7 sub-patches (.7.8 through .7.13). So either:
- "closed" was premature and .7 stayed open (likely), or
- The remaining topo items have been done and the 1.0 doc just hasn't been updated.

Easy fix, but the kind of drift the project's stated rule about "verify against current code" exists to catch.

### NPC count

"Implicitly 12 (locked-in by v0.1.0's 36-gift target = 12 × 3). Confirm before v0.1.0 NPC authoring starts." — but the bible's NPC table already lists 12 by callsign with locations, voices, and gifts. The cast has been chosen. Marking this molten is doc theater; promote to locked.

---

## scope underestimation

### v0.1.0 is two patches in a trenchcoat

What v0.1.0 actually contains:

- **Content authoring** (massive, user-only): 36 gifts × design + implementation, full trust-ladder voice × 12 NPCs, connective-tissue threads ξ↔ι / δ↔ν / θ↔τ / λ↔others
- **New rendering system**: phosphor-script identity (pack-flap glyph, cargo popout stripe, 16 hex glyphs as inline SVG, fade-with-distance, ρ refresh logic)
- **New UI surface**: loop-notation, POSTROAD build-string
- **Engineering audits**: 48h+ idle memory growth profile, multi-tab smoke test
- **Polish surface area**: accessibility, discoverability, structure tuning, zipline shape, sim balance, save schema cap, rebuild meter reset, full headless sim pass, "any loose ends from 9.7-9.14"

If you ship that as "polish, tuning, reset" you're underselling 60% of the actual work and setting yourself up to slip. Either split into v0.0.9.15 (content authoring) + v0.1.0 (polish + audits + ship-prep), or relabel honestly.

### cargo audit

> Item-centric → story-centric content rewrite across 3 axes: world-thematic cargo (drift, graveyard, porters, retirement), inter-NPC connective tissue made tangible (drift-tech artifacts ξ recovers, φ↔ι cultivars, φ↔γ scrap, forecasts to ξ, ν↔φ irrigation parts), inert-vs-maintained distinction. Comprehensive rewrite; supersedes earlier "~15–30 special-occasion labels" framing.

The bible says "~232 authored labels." A comprehensive rewrite across 3 axes is a multi-week content project on its own. Hiding it in a molten bullet that's "naturally addressed" in .9 is wishful — .9 is already big (salvage system + recycling + biome variance + scrapheap stub + tag/tier audit). The cargo audit is its own animal.

Options:
- Own patch slot (v0.0.9.9.5 or v0.0.9.15)
- Decisively deferred to post-1.0 (acceptable! the game has 232 labels today, it's playable)
- Trimmed: pick which axis is non-negotiable for 1.0 and ship only that

But "we'll do it during .9" is the failure mode.

### .11 drift

> Drift density variance + Scanner reads drift + Forecast garbling + Drift body effects + Walking suppresses drift on roads + Drift fronts as weather events + Package shell wear

Seven distinct mechanics. Each one has design choices. "Currently absent from code." This is the biggest patch in the sequence and reads like one of seven. It will probably need to be .11.1 through .11.N — fine, but worth acknowledging in the doc so it's not surprising.

---

## risks the doc doesn't surface

### renderer-late risk

.13 renderer rework lands after .11 drift and .12 heat. Reasoning given (don't let polish get invalidated by visual rework) is sound, but it concentrates risk: route-map.js is the largest render file at 53kb, and mesa/mountain/hill support + background scrolling rework is a lot of churn to a load-bearing file two patches before 1.0. If .13 has a regression that takes a week to track down, .14 onboarding ships against a moving target.

Mitigation: a sim harness run + manual playtest pass between .13 and .14, with explicit go/no-go on visual stability. Worth surfacing in the doc.

### onboarding-last regret risk

.14 onboarding is appropriately last (you can't onboard against unfinished systems), but it means the first-time-player experience is unvalidated until very late. If the first 30 minutes turn out to be confusing because (e.g.) cooking introduces too much at once, or the drift body effects bewilder a new player, those fixes ripple back into mechanics from .8 / .11. Acceptable risk but worth flagging.

Mitigation: even before .14, do an internal playtest from a clean save after each big patch lands. The sim harness doesn't catch confusion — it catches balance.

### v0.0.9.10 t100 tier add

> Trust tier restructure (t20/t40/t60/t80/t100)

Today's tiers are t20/40/60/80 (per bible). Adding t100 changes the trust-gain curve's *terminus*. If trust currently asymptotes at ~95 for typical play, t100 may be effectively unreachable; if it caps at 100, adding a tier there means the existing t80 reward needs to move or the new t100 reward is the only thing at the cap. The doc doesn't specify what's at t100 or how curves change. Worth a sub-bullet.

### worker scaling

Memory says single-DO bottleneck risk is acknowledged and DO migration is deferred post-1.0. But the 1.0 doc has no worker line in molten. If concurrent players hit the single-DO ceiling between .14 and .1.0, that's a scramble. Add a one-liner under "infrastructure & shipping":

> **Worker scaling threshold.** Current single-DO architecture has a known concurrent-player ceiling. DO migration is decisively deferred post-1.0; what's the trigger to ship-disable multiplayer relay if the ceiling is hit pre-1.0?

---

## ordering concerns

### storm shelter before drift fronts

.10 ships "storm shelter" (a structure). .11 ships "drift fronts as weather events." The storm shelter's most narrative-rich use case (sheltering from a drift front) doesn't come online until .11. Two options:
- This is intentional (size the shelter to existing storms first, drift extends it later) — fine, but say so
- This is accidental — consider moving storm shelter to .11 alongside drift fronts so they ship together

### salvage feeds structures, but cargo audit may reshape both

.9 ships salvage. .10 ships structures (built from salvage). If the cargo audit reframes how salvage is named/themed (.9's "biome variance, 2-3 types, names TBD"), that naming is now content for .9. If the audit lands later, you re-thematize and either patch names backward or accept inconsistency.

### sim harness vs the additions

Each system added (cooking .8, salvage .9, structures .10, drift .11, heat .12) is a new axis the sim needs to model. The doc has "full headless sim pass" in .1.0 but no per-patch sim coverage requirement. Two possible bars to add:
- "Each patch ships only after sim harness extension covering its new systems" — high bar, possibly slows pace
- "Sim harness gets a catch-up patch between .12 and .13" — explicit slot

Either is better than "we'll sim it at the end."

---

## missing from the roadmap

- **Sound source** (own/CC0/commissioned) — in molten but no decision deadline. If commissioned, that has lead time.
- **Itch.io page** — copy is user-authored per memory; assets (screenshots, GIFs, capsule) aren't on the list. These are 1.0 deliverables, not post-.
- **Sim harness as scheduled work** (see above).
- **Worker scaling threshold** (see above).
- **Localization** — single-language is fine but say so explicitly: "English-only at 1.0. Localization is post-1.0 if at all."
- **Cloud save / sync stance** — not mentioned; presumably "no, localStorage + export/import is the contract." Worth one line in the locked section since it's a player expectation.
- **Telemetry / analytics** — presumably none (privacy-first). One-liner in locked.
- **Music vs ambient** — "sound" in molten reads as just ambient soundscape. If there's no music (intentional), say so.
- **NPC-authoring time budget** — the dialogue work in .14 and .1.0 is user-only. The schedule treats authoring as engineering time. They're different resources; the doc should at least acknowledge "X NPCs of dialogue is Y hours of writing" or "authoring runs in parallel to engineering on .13".

---

## molten triage

13 open questions is a lot. Suggested grouping:

**Decision-shaped (decide now or by next patch):**
- NPC count — already locked in practice; promote.
- Mobile UX scope — explicit accept-current-state would close this immediately.
- Cost ceiling policy — write one paragraph and close.
- Bug reporting / community path — pick a channel (Discord vs email vs itch) and close.
- Browser compatibility floor — declare the floor, add the "browser too old" message in .14 polish.

**Design-shaped (need exploration, schedule):**
- Mountain climbing depth — call this out as a v0.0.9.13-renderer-companion design pass.
- Gear screen — three-way decision: ship pre-1.0 (which patch?), defer post-1.0, or cut. Pick.
- Sticky gun rework — already noted as "post-1.0 unless crystallizes." Close as deferred.
- Sound pre-1.0 vs post-1.0 — pick.

**Content/operations (need lead time):**
- Cargo audit — own slot or deferred (see above).
- Trip-chance internal naming — engineering hygiene, can ship in any .x.x.
- Privacy story — copy task, schedule with itch page.
- Save robustness — pick: localStorage-only-with-better-prompts vs IndexedDB redundancy. Pick before .14 so onboarding can teach the chosen path.

After triage, molten shrinks from 13 to maybe 4-5 genuinely open. That's a doc that's doing its job.

---

## bible drift

The bible (TLH-DESIGNBIBLE.md) is supposed to be the steady reference. Right now:

- Says "Next up: v0.0.9.7 — polish pass informed by sim findings." → We're in .7.13.
- Says "After that: v0.0.9.8 — dispatch log virtualization." → 1.0 doc says .8 is cooking. Dispatch log virtualization isn't in the 1.0 sequence at all.
- Lists "v0.0.9.7+: structures + salvage (Rough design sketch)" → these are now .9 and .10 per 1.0 doc.
- "Things intentionally deferred" still lists "Interior package pickup — currently off except plateau tops; deferred to v0.0.9.7+" — has this shipped or is it still deferred?
- "Trust threshold tiers: 20 / 40 / 60 / 80" — 1.0 doc adds t100 in .10.
- NPC table has only t20 and t40 columns — needs a third column (t60 or "structure unlock") for the v0.1.0 plan.

The bible is the document a new collaborator would read first to orient. Right now it would mislead them about the patch sequence. Either:
- Update bible to match 1.0 doc (probably an hour of work)
- Add a header to bible: "Patch sequence superseded by TLH-1.0.md; sections below describe core systems, not roadmap."

Don't let the gap grow.

---

## what the doc gets right (so this isn't all bricks)

- **Locked / molten / post-1.0 structure** is a clean three-bucket model. Most roadmap docs collapse all three into one list. Keep this.
- **"1.0 is a quality bar, not a date"** is correctly positioned and protects against schedule pressure.
- **Renderer-last ordering** is defensible (don't let polish get invalidated).
- **Drift before heat** is well-justified (heat's drift-adjacency needs drift to plug into).
- **Explicit post-1.0 section** prevents the "while we're at it" scope creep that kills 1.0 docs.
- **The closing paragraph** ("most of it is already scoped, two genuinely open holes") is well-calibrated. It's true, and it's the right way to end a doc that could otherwise feel oppressive.

---

## net take

The roadmap is **structurally sound** but has **two real problems and a lot of small drift**:

1. v0.1.0 is the heaviest patch but billed as the lightest. Fix this or you'll slip the date you're not setting.
2. The cargo audit is unsized and untethered. Pick a home for it or kill it.

The small drift (2-vs-3 gifts, "implicitly 12" NPCs, .7-closed-but-not, bible behind 1.0 doc) is the kind of thing that compounds. None of it is fatal individually; together it's the difference between a roadmap that guides decisions and a roadmap that needs to be re-derived every time someone reads it.

If I were going to do exactly two things this week as a result of this review:

1. **Reconcile bible with 1.0 doc** — one editing pass, an hour or two, removes the worst orientation hazard.
2. **Triage molten** — close the 5-6 decisions that are actually already made, surface the 2-3 that genuinely need design work. The doc will breathe.

The patch sequence itself doesn't need to change. The shape of the work is right. The doc just needs to stop quietly disagreeing with itself.
