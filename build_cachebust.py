#!/usr/bin/env python3
"""
build_cachebust.py — stamp `?v=<version>` on every relative ES module
import inside tlh/js/, matching the canonical version pinned in
tlh/the-long-haul.html.

Why this exists
---------------
The html script tags carry `?v=096-10-N` cachebusters, but ES module
imports like `from './data/upgrades.js'` inside the JS itself do NOT
— browsers cache those at the URL-without-query, so edits to
sub-modules don't show up until a hard-refresh. This script walks
tlh/js/ and appends the canonical version to every matching import
specifier so the full module tree busts cache together.

Idempotent
----------
- Unversioned imports       get `?v=X` appended.
- Already-versioned imports get their `?v=` updated to canonical.
- External / absolute imports ('https://...', bare specifiers) skipped.
- Only tlh/js/**/*.js files are touched.

Usage
-----
  python build_cachebust.py          # stamp all modules in place
  python build_cachebust.py --check  # exit 1 if anything would change

Run after every version bump in tlh/the-long-haul.html so
sub-modules re-stamp with the new canonical. The html's own
`?v=` attributes on script/link tags are NOT rewritten — those
are already managed by hand on the subtitle-bump line.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT      = Path(__file__).parent
HTML_PATH = ROOT / "tlh" / "the-long-haul.html"
JS_ROOT   = ROOT / "tlh" / "js"

# TLH-canonical cachebuster lives on the `tlh-boot.js` and
# `js/main.js` script tags inside the html. Pattern is
# `096-10-N` style (v0.0.9.6.10.N). Nav / other site-level
# scripts carry their own independent `?v=` (e.g. `nav.js?v=2`)
# and must be ignored so we don't pick up the wrong version.
HTML_VERSION_RE = re.compile(
    r"""(?:tlh-boot\.js|js/main\.js)\?v=(?P<ver>[A-Za-z0-9._\-]+)"""
)

# Match relative ES import specifiers in JS. Three forms:
#   from './x.js'
#   import './x.js'          (side-effect form — rare in TLH)
#   import('./x.js')         (dynamic)
# Existing `?v=...` on the specifier is absorbed and replaced.
IMPORT_SPEC_RE = re.compile(
    r"""
    (?P<prefix>
        (?: from   \s+
          | import \s* \( \s*
          | import \s+
        )
    )
    (?P<quote>['"])
    (?P<path>\.{1,2}/[^'"?]+?\.js)
    (?:\?v=[^'"]+)?
    (?P=quote)
    """,
    re.MULTILINE | re.VERBOSE,
)


def read_canonical_version(html_path: Path) -> str:
    """Pull the `?v=X` from the html subtitle / script tags. Exits
    if the file has mixed versions — that'd leave different modules
    cached against different snapshots."""
    text     = html_path.read_text(encoding="utf-8")
    matches  = HTML_VERSION_RE.findall(text)
    if not matches:
        sys.exit(f"error: no ?v= cachebuster found in {html_path}")
    unique = sorted(set(matches))
    if len(unique) > 1:
        sys.exit(
            f"error: mixed versions in {html_path}: {unique}\n"
            "fix the html so every ?v= agrees, then re-run."
        )
    return matches[0]


def rewrite(text: str, version: str) -> tuple[str, int]:
    """Return (new_text, substitution_count). Pure function."""
    def repl(m: re.Match) -> str:
        return (
            f"{m.group('prefix')}"
            f"{m.group('quote')}"
            f"{m.group('path')}?v={version}"
            f"{m.group('quote')}"
        )
    return IMPORT_SPEC_RE.subn(repl, text)


def stamp_file(path: Path, version: str) -> int:
    """Rewrite `path` in place. Returns substitution count.
    Line endings preserved byte-for-byte via newline=''."""
    with open(path, "r", encoding="utf-8", newline="") as f:
        orig = f.read()
    new, count = rewrite(orig, version)
    if new != orig:
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(new)
    return count


def main() -> None:
    check   = "--check" in sys.argv
    version = read_canonical_version(HTML_PATH)
    print(f"canonical version: ?v={version}")

    if not JS_ROOT.exists():
        sys.exit(f"error: {JS_ROOT} does not exist")

    total_files   = 0
    total_subs    = 0
    would_change  = []

    for js_file in sorted(JS_ROOT.rglob("*.js")):
        with open(js_file, "r", encoding="utf-8", newline="") as f:
            orig = f.read()
        new, count = rewrite(orig, version)

        if check:
            if new != orig:
                would_change.append(str(js_file.relative_to(ROOT)))
            continue

        if new != orig:
            with open(js_file, "w", encoding="utf-8", newline="") as f:
                f.write(new)
            total_files += 1
            total_subs  += count

    if check:
        if would_change:
            print("needs stamping:")
            for f in would_change:
                print(f"  {f}")
            sys.exit(1)
        print("all modules up to date.")
        return

    print(f"stamped {total_subs} imports across {total_files} files.")


if __name__ == "__main__":
    main()
