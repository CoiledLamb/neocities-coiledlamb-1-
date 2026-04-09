# coiledlamb.neocities.org — handoff doc
_last updated: 2026-04-09_

---

## project overview

A hand-coded Neocities personal site with a terminal/CRT aesthetic. No build framework — vanilla HTML, CSS, and JS. Deployed via the Neocities GitHub Action on every push to `main`.

**live site:** https://coiledlamb.neocities.org  
**site repo:** https://github.com/CoiledLamb/neocities-coiledlamb-1-  
**pipeline repo:** https://github.com/CoiledLamb/art-pipeline

---

## current architecture

### key files

| file | purpose |
|---|---|
| `nav.js` | injects shared sidebar nav + music player on every page |
| `nav.css` | sidebar + player styles |
| `gallery.js` | generic category gallery (lightbox, lazy load, month tabs, sort, utterances comments) |
| `gallery.json` | data source for gallery — managed exclusively by art-pipeline, never in this repo |
| `build_manifest.py` / `.bat` | generates `manifest.json` with all site files catalogued |
| `boot.js` / `boot.css` | CRT boot/intro sequence |
| `admin/blog-admin.html` | tabbed admin UI for blog + gallery management |
| `style.css` | global base styles |
| `artwork.html` | artwork hub/landing |
| `figures.html`, `hands.html`, `nsfw.html` | gallery pages (each sets `window.PAGE_CATEGORY` then loads `gallery.js`) |
| `blog.html` / `blog.css` | blog page |
| `player-frame.html` | music player iframe (legacy/standalone) |

### gallery system
- `gallery.json` is generated and maintained exclusively by the **art-pipeline** (separate repo: `CoiledLamb/art-pipeline`). That pipeline watches an `incoming/` folder, converts PNGs to WebP, uploads images to Neocities, and updates `gallery.json` directly on the live site.
- `gallery.json` does **not** exist in this repo. The deploy workflow removes it before upload (`rm -f gallery.json`) so the action never touches the live version.
- `gallery.js` reads `gallery.json` which has keys per category (`figures`, `hands`, `nsfw`, `general`).
- Each entry is `{ file, date, display }` — the pipeline may gain a `tags` field in future (see next steps).
- Filenames encode dates: `MMDDYY` or `MDDYY` pattern.
- Lightbox uses utterances (GitHub Issues) for per-image comments, keyed by `?img=N` URL param.
- Month tabs + sort (asc/desc) driven by URL params.

### music player (in `nav.js`)
- 4 tracks: `pilgrim's path`, `stoic porridge`, `onward` (all craigory ham), `drifter` (duster).
- State persists across page navigations via `sessionStorage`.
- Shuffle (`⇄`), loop (off/track/playlist), volume, seek bar.
- Oil-slick animated visualizer bars.
- Tracklist renders in sidebar and scrolls with a thin monochrome scrollbar.

### admin (`admin/blog-admin.html`)
- Single login screen with two token fields: **Neocities API key** and **GitHub PAT**.
- Tabbed layout: **Blog** | **Gallery**.
- Both tokens stored in localStorage if "remember" is checked.
- **Blog tab**: create/edit/delete posts and notes. Rich text toolbar (bold, italic, underline, link). Emoji picker for note status. Tag toggle system with right-click-to-remove. Commits directly to `blog.html` via GitHub API.
- **Gallery tab**: category picker (figures/hands/nsfw/general). Drag-and-drop upload zone with client-side PNG→WebP conversion via `canvas.toBlob`. Per-file filename/display/tags fields before upload. Uploads to Neocities API, then commits updated `gallery.json` to GitHub. Edit metadata and delete (with optional full Neocities file deletion) for existing entries.

---

## deployment

- Deploys via GitHub Actions (`.github/workflows/deploy.yml`) on push to `main`.
- Neocities API key stored as GitHub Actions secret `NEOCITIES_API_KEY`.
- **`gallery.json` is protected from deploy overwrites** via a `rm -f gallery.json` step that runs on the Actions runner before the upload step. This means the file simply doesn't exist in the deploy directory when the action scans for files to upload, so it is never touched.
- `build_manifest.py` should be run locally before pushing to regenerate `manifest.json` (or add it to CI).

### gallery.json deploy fix — full history
This bug went through several attempted fixes before being resolved:

1. **`exclude: gallery.json`** — not a valid input for `bcomnes/deploy-to-neocities@v3`. Silently ignored. File still uploaded.
2. **`protected_files: gallery.json`** — is a valid input, but only protects against *cleanup deletion* (when `cleanup: true`). The docs state explicitly: "Protected files can still be updated." Since the stub exists in the repo, the action's content-diff sees a difference and uploads it regardless.
3. **`rm -f gallery.json` pre-deploy step** ✅ — removes the file from the runner's working directory before the action scans. The action never finds it, never uploads it. Verified with a live test push (baseline 40 figures / 8 hands → deploy → still 40 figures / 8 hands).

**Blind spot to monitor:** `gallery.json` still exists as a resident file in the Neocities file manager (it was uploaded by the pipeline and lives on the server). This is correct and intentional — it's the live version. The only risk would be if `cleanup: true` were ever enabled in `deploy.yml`, which would then delete it as an orphan. Do not enable `cleanup: true` without re-examining this.

---

## art-pipeline

**repo:** https://github.com/CoiledLamb/art-pipeline

A local Node.js process that watches `incoming/<category>/` for new PNGs, converts them to WebP via `sharp`, uploads them to Neocities, and updates `gallery.json` on the live site.

### running

The pipeline runs as a **pm2 background daemon** — starts automatically on login, restarts on crash. No manual invocation needed.

**one-time setup (already done, or repeat on a new machine):**
```bash
npm install -g pm2
cd /path/to/art-pipeline
git pull
npm run pm2:start
pm2 save
pm2 startup   # copy and run the printed command to enable autostart on login
```

**day-to-day commands:**

| command | does |
|---|---|
| `npm run pm2:status` | check if it's running |
| `npm run pm2:logs` | live log tail — watch a file process |
| `npm run pm2:restart` | restart after pulling changes to pipeline.js |
| `npm run pm2:stop` | stop the daemon |
| `npm run pm2:start` | start it again |

### workflow
1. Drop a PNG into `incoming/figures/` (or `hands/`, `general/`).
2. Pipeline detects it instantly via chokidar watcher.
3. Converts to WebP at 85% quality.
4. Uploads to `images/<category>/<filename>.webp` on Neocities.
5. Updates `gallery.json` locally and uploads it to the live site.

Files dropped into `incoming/private/` are skipped. Duplicate detection checks both the local `processed/` folder and the live Neocities remote.

### config
- `.env` file with `NEOCITIES_API_KEY=...` — see `env.example.txt`.
- `SAFE_MODE = true` in `pipeline.js` disables uploads for local testing.
- `ALLOW_DUPLICATES = true` bypasses duplicate checks during testing.

---

## known bugs / remaining work

### 🟡 landing page alignment at certain resolutions
Layout breaks at specific viewport widths — likely a `nav-offset` wrapper / sidebar width interaction. Fix: audit `nav.css` flex/grid rules, add responsive breakpoints.

### 🟡 text contrast
Needs a pass through https://webaim.org/resources/contrastchecker/. Likely problem areas: caption text over thumbnails, status text in player, nav badge `18+`.

---

## next steps

### 1 — gallery calendar
A calendar-style view on `artwork.html` where each day cell shows a thumbnail for drawings made that day.

- Could replace or sit alongside the current month-tab system in `gallery.js`.
- Individual drawing pages (replacing lightbox overlay) would make images linkable and better for SEO.
- Tags per image — add a `tags` field to `gallery.json` entries, expose filter UI.

**data model change needed:**
```json
{
  "file": "figures 42524.webp",
  "date": "2024-04-25",
  "display": "04/25/24",
  "tags": ["figure", "sketch"]
}
```

**implementation sketch:**
- Add `calendar.js` or extend `gallery.js` with a calendar render mode.
- Individual drawing pages via template + URL param (`drawing.html?id=figures+42524.webp`).
- Mini calendar widget on landing page reading from `gallery.json`.

### 2 — music player
- Songs to consider adding: *One Wayne G* — Mac DeMarco; *Pareidolia* catalogue — Homeshake; *Remote Echoes* — Duster (tentative).

### 3 — layout / responsive
- Landing page alignment fix at your resolution — check what viewport width triggers it.
- Multi-resolution audit: sidebar should collapse or shift gracefully on narrow screens.

### 4 — accessibility / contrast
- Run all text/background combos through https://webaim.org/resources/contrastchecker/.

---

## session log

### 2026-04-09

**admin overhaul (`admin/blog-admin.html`)**
- Rebuilt as a single-file tabbed admin (Blog | Gallery) with a unified login screen.
- Login takes both a Neocities API key and a GitHub PAT; either can be omitted if only one tab is needed.
- **Blog tab**: rich text toolbar added to excerpt/body field (bold, italic, underline, link, clear). All existing functionality preserved.
- **Gallery tab** (new): category picker; drag-and-drop upload with client-side PNG→WebP conversion; per-file metadata fields; uploads to Neocities API; commits `gallery.json` to GitHub. Edit metadata and two-stage delete (index only, or index + Neocities file) for existing entries.

**nav.js bug fixes**
- Tracklist was never displaying: `tlEl` was created but never assigned to `npEls.tracklist`, so `npRenderTL()` always bailed. Fixed by adding `npEls.tracklist = tlEl` and assigning all other `npEls` refs that were also missing.
- Play/pause icon: was showing `■` (stop square `\u25a0`) when playing. Now correctly shows `⏸` (`\u23f8`) when playing and `▶` when stopped/paused.
- Shuffle icon: replaced `⧢` (`\u29e2`) with `⇄` (`\u21c4`) for legibility.

**nav.css**
- Tracklist container gets `.np-tracklist` class with `max-height: 80px`, `overflow-y: auto`, and a thin monochrome scrollbar (`scrollbar-width: thin`, 3px webkit thumb in `#2a7a6e`).

**deploy workflow fix (critical) — gallery.json wipe bug**
- Three-attempt investigation. `exclude` (invalid input, silently ignored) → `protected_files` (valid but only guards cleanup, not upload) → `rm -f gallery.json` pre-deploy step (correct fix, verified live).
- Root cause: `bcomnes/deploy-to-neocities@v3` uses content-aware diffing and will always upload any file present in `dist_dir` that differs from the live version. The only reliable solution is to ensure the file isn't in `dist_dir` at deploy time.
- Verified: test push with baseline 40 figures / 8 hands → deploy completed → counts unchanged.
- Blind spot noted: `gallery.json` lives in the Neocities file manager as a resident file (correct). Would be deleted as an orphan if `cleanup: true` were ever set. Don't enable cleanup without revisiting this.

**art-pipeline: pm2 background daemon**
- Added pm2 convenience scripts to `package.json`: `pm2:start`, `pm2:stop`, `pm2:restart`, `pm2:logs`, `pm2:status`.
- Pipeline now runs as a background daemon via pm2, watching `incoming/` automatically on login. No more manual invocation needed.

---

## reference links

- Neocities API docs: https://neocities.org/api
- utterances (comment system): https://utteranc.es
- WebAIM contrast checker: https://webaim.org/resources/contrastchecker/
- WebP via canvas API: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
- deploy-to-neocities action: https://github.com/bcomnes/deploy-to-neocities
- pm2 docs: https://pm2.keymetrics.io/docs/usage/quick-start/
