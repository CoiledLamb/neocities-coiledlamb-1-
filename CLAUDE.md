# CLAUDE.md

Project-specific collaboration rules. These supplement the default agent instructions and the per-conversation memory files in `.claude/projects/*/memory/`. They were derived from a 41-session insights pass on 2026-05-06; each rule addresses a specific recurring friction.

## Read before you propose

For audit, design, or "how should we approach X" requests: read the relevant source first. Do not work from memory or guess at architecture.

Protocol for non-trivial requests:
1. List the files you plan to read
2. Read them
3. Briefly summarize current state
4. Then propose changes

Memory files capture durable decisions but freeze in time — verify against current code before recommending. A memory citing a file or function is a claim from when it was written, not from now.

This rule exists because past sessions repeatedly proposed solutions to already-solved problems (smoke button location, courier dot existence, settlement tiers vs trust profiles) by working from memory rather than reading current state.

## Git verification before "shipped"

After committing, before declaring shipped:
- `git status` — confirm clean
- `git log origin/main..HEAD` — what's local-only
- `git fetch origin` if remote state is uncertain
- For PR merges: `gh pr view <#> --json state,mergedAt` should show MERGED + a timestamp

This project has ~30 active worktrees on different branches. Before any destructive op (`git reset --hard`, `git branch -D`, deleting a worktree), `git worktree list` to avoid orphaning in-progress work elsewhere.

## Preview server hygiene

Workflow lives in `.claude/projects/.../memory/reference_tlh_local_preview.md` and `reference_tlh_preview_port.md` — read those first.

Before debugging "UI change not showing":
1. `preview_list` — is the right server running?
2. Confirm it's serving from THIS worktree's directory, not a sibling
3. If CSS/JS edits aren't visible, run `python build_cachebust.py` from repo root — Neocities cache-busts via `?v=` query strings on every relative ES import

## Long deliverables → file, not inline stream

For audits, multi-file design docs, or large reviews, prefer `Write` to a markdown file (`docs/audit-<topic>.md` or similar) over streaming a long inline response. File output is scrollable, durable, survives session compaction. Inline streaming is for normal conversational answers.

## Versioning — two surfaces, separate cadence

**Game version** (`v0.0.9.7.X` format) lives in `tlh/the-long-haul.html` subtitle + `?v=` cache-bust strings on every relative import. Bumped via the bump-version script + `python build_cachebust.py`. See [memory:feedback_tlh_version_bump.md].

**Worker version** (`v0.0.9.6.10.X` format) lives in `tlh/worker/index.js` header + GET `/` response. Independent from game version. Worker-only patches do **not** bump game version, do **not** run `build_cachebust.py`. See [memory:project_tlh_worker.md].

Commit-message prefix follows the surface:
- Game patches: `tlh v<version> — <desc>`
- Worker-only patches: `tlh worker — <desc>`
- Doc-only changes: `docs(tlh): <desc>`

For the standard ship cycle, use the `/ship-patch` skill — it codifies the version-bump + commit + push steps so they don't get forgotten.
