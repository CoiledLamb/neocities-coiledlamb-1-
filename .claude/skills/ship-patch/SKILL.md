---
description: Ship a TLH patch with the project's standard cycle. Use after a code change is complete and ready to land. Handles version bumps, cache-busting, commit-message formatting, and push verification. Defaults to game-patch flow; pass "worker" as args for worker-only patches. NEVER skip the pre-flight or verification steps.
---

# /ship-patch

Closes out a TLH patch with the standard versioning + commit + push cycle. Two modes — game patch (default) and worker-only.

## Pre-flight (always)

1. `git status` — should show only the intended changes. If there's drift (unrelated files modified, unstaged settings, etc.), stop and ask the user.
2. `git branch --show-current` — confirm what branch you're on. Direct commits to `main` are normal for solo TLH work; feature branches go via PR.
3. Read the user's intended scope from the conversation. The commit message body should describe what changed in their words, not invented detail.

## Game patch flow (default)

For any change that touches game code (`tlh/js/`, `tlh/the-long-haul.html`, `tlh/the-long-haul.css`, `tlh/data/`, etc.) — anything the player sees in the browser.

1. **Bump the subtitle** in [tlh/the-long-haul.html](tlh/the-long-haul.html). Locate the `<span class="oil-text">` containing `v0.0.9.7<span style="opacity:0.6">.N</span></span>` and increment N. The dimmed `.N` opacity is intentional — preserve the markup. If starting a new batch (e.g. moving from `.7.10` to `.8.0`), bump the root number; the dimmed-trailing-digit pattern continues.

2. **Run the cache-buster**: `python build_cachebust.py` from repo root. This stamps `?v=<canonical>` on every relative ES import across `tlh/js/**/*.js`. Without this, sub-module edits won't reach browsers (Neocities CDN holds them at the unversioned URL). The script is idempotent; `--check` does a dry-run.

3. **Commit** all modified files together. Message format:
   ```
   tlh v0.0.9.7.<N> — <short description>

   - <bullet>
   - <bullet>

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   ```
   Use a HEREDOC for the message (see Bash tool's git-commit example). Never `--amend` after a hook failure — make a NEW commit.

4. **Push**: `git push` (or `git push -u origin <branch>` if it's a fresh branch).

5. **Verify**:
   - `git log origin/main..HEAD` should be empty if pushed to main; otherwise shows the branch's commits ahead
   - `git fetch origin` then re-check if uncertain
   - If a PR was opened: `gh pr view <#> --json state,mergedAt`

6. **Don't** skip cache-busting. **Don't** bump game version for worker-only changes. **Don't** push --force without explicit user confirmation.

## Worker-only patch flow

Trigger: pass `worker` as the skill argument, OR detect that all changes are confined to `tlh/worker/`.

1. **Confirm scope**: `git status` should show only `tlh/worker/*` files modified. If anything outside that path is staged, stop and confirm with the user — they may want a coordinated client+worker change instead.

2. **Bump worker version** in two places:
   - The header comment in [tlh/worker/index.js](tlh/worker/index.js) (around line 3) — e.g. `v0.0.9.6.10.24` → `v0.0.9.6.10.25`
   - The `version:` field in the GET `/` response handler (search for the version string literal)

   Worker version is independent from game version. Format: `v0.0.9.6.10.<N>`.

3. **Skip** `python build_cachebust.py` — worker isn't an ES module the browser caches. Skip the HTML subtitle bump.

4. **Commit**. Message format:
   ```
   tlh worker — <short description> (v0.0.9.6.10.<N>)

   - <bullet>
   - <bullet>

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   ```
   Note the `tlh worker —` prefix, NOT `tlh v<v> —`.

5. **Push** and verify as in step 5 of the game flow.

6. **Deploy reminder** — after the user confirms the commit landed, surface this:
   > To ship the worker live: `cd tlh/worker && wrangler deploy`. README at [tlh/worker/README.md](tlh/worker/README.md) has the full deploy walkthrough including auth.

   The git push alone does NOT deploy the worker — Cloudflare needs `wrangler deploy` separately. The user runs that step.

## When to invoke

The user typing `/ship-patch` (or `/ship-patch worker`) is the signal to run this whole cycle. Don't invoke proactively — shipping decisions are user-driven.

If the user says "commit, push and merge" in conversation without invoking the skill, that's a signal you can run the cycle, but confirm version-bump scope first if you're not sure which mode applies.
