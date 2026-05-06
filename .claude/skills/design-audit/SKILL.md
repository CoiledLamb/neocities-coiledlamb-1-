---
description: Strict read-first protocol for design audits, system reviews, and architecture investigations. Invoke when the user asks for an audit, review, or "how does X work / what should we do about X" question that depends on understanding current code. NEVER skip the file-listing step or propose without reading.
---

# /design-audit

The protocol that prevents working from memory. Use any time the user asks for a design audit, system review, architecture summary, or "how should we approach X" question that depends on understanding current state.

## Phase 1 — Scope and file plan

1. Restate what the user is asking, in your own words. Confirm intent if ambiguous.
2. List the files you plan to read, with a one-line "what's there" note for each. Group by relevance:
   - Code that implements the system being audited
   - Adjacent code that interacts with it
   - Config, data files, or schema definitions
   - Memory files in `.claude/projects/.../memory/` that may have decision history
3. If the file list is non-trivial (>5 files) or the audit could go in different directions depending on scope, **stop and confirm with the user before reading**. Cheap to confirm; expensive to do the wrong audit.

## Phase 2 — Read

Read the listed files. If references to other clearly-load-bearing files surface mid-read, add them and read those too — but call out the expansion ("found refs to X, also reading"). Don't sprawl beyond the scope you confirmed.

For broad audits (>10 files), spawn an Explore agent rather than reading sequentially yourself.

## Phase 3 — Summarize current state (BEFORE proposing)

Before proposing anything, give the user a grounded summary:
- What the system actually does today (5–10 bullets max)
- What relevant memory says (and where memory and code disagree — the memory may have frozen in time)
- Where the code's structure suggests pain points the user might or might not have seen

Stop on a clear paragraph break. Wait for the user to confirm the summary matches their understanding (or to correct it) before moving to recommendations. Cheap to pause; expensive to propose against a misread state.

## Phase 4 — Propose

After summary confirmation:
- **Findings** — problems, latent bugs, drift between memory and code
- **Recommendations** — ordered by leverage (high-impact-low-effort first)
- **Per-rec one-liner** — "what would change" so the user can react before any code is written

For audits producing >1 screen of findings, write directly to `docs/audit-<topic>.md` rather than streaming inline. See CLAUDE.md "Long deliverables → file."

## Don't

- Propose solutions in Phase 1 or 2. Phase 3 is the earliest moment for hypothesis.
- Fold "while I'm here, also noticed X" into the summary unless X is load-bearing for the requested audit. Use `mcp__ccd_session__spawn_task` for unrelated cleanup.
- Skip Phase 3 even if the audit feels small — the discipline is the point. The cost of proposing against a misread state is much higher than the cost of one extra paragraph.
- Trust memory citations without verifying. A memory naming a file:line is a claim from when written, not from now. Grep or re-read before recommending.

## When NOT to invoke

- Implementation tasks where the design is already locked. Skip to the work.
- Bug fixes with a clear repro. The fix doesn't require an audit.
- Tiny questions ("what does this function do?"). Just answer.
