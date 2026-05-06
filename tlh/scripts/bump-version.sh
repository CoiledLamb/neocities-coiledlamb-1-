#!/usr/bin/env bash
# tlh/scripts/bump-version.sh — bump cache-bust version + subtitle.
#
# Replaces all `?v=<old>` with `?v=<new>` across tlh/**/*.{js,html}
# (skipping tlh/worker/, which has its own version scheme), updates
# the dim subtitle in tlh/the-long-haul.html, and prints a templated
# commit-message stub.
#
# Cache-bust format: 096-10-22 corresponds to game version v0.0.9.6.10.22.
# Decoder: first 3 chars of cache-bust are single-digit segments after the
# implicit 0. prefix; remaining dash-separated segments are 1-3 digits each.
# So 096-10-22 -> 0.<0>.<9>.<6>.<10>.<22> -> v0.0.9.6.10.22.
#
# Usage: bash tlh/scripts/bump-version.sh <new-version>
# Example: bash tlh/scripts/bump-version.sh 096-10-23

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <new-version>" >&2
  echo "example: $0 096-10-23" >&2
  exit 1
fi

new_v="$1"

# Validate format: 3 digits, dash, 1-3 digits, dash, 1-3 digits.
if ! [[ "$new_v" =~ ^[0-9]{3}-[0-9]{1,3}-[0-9]{1,3}$ ]]; then
  echo "error: version must look like 096-10-23 (got: $new_v)" >&2
  exit 1
fi

# Find tlh/ relative to invocation.
if   [ -d "tlh"    ]; then ROOT="."
elif [ -d "../tlh" ]; then ROOT=".."
else
  echo "error: run from a directory containing tlh/" >&2
  exit 1
fi

# Detect current version from the canonical source (the subtitle file).
old_v=$(grep -oE '\?v=[0-9]{3}-[0-9]+-[0-9]+' "$ROOT/tlh/the-long-haul.html" | head -1 | sed 's|^?v=||')
if [ -z "$old_v" ]; then
  echo "error: couldn't detect current cache-bust version in the-long-haul.html" >&2
  exit 1
fi

if [ "$old_v" = "$new_v" ]; then
  echo "error: new version equals current ($old_v) — nothing to do" >&2
  exit 1
fi

echo "bumping: $old_v -> $new_v"

# Replace cache-bust strings across tlh/, skipping tlh/worker/.
count=0
while IFS= read -r f; do
  if grep -q "?v=$old_v" "$f" 2>/dev/null; then
    sed -i "s|?v=$old_v|?v=$new_v|g" "$f"
    count=$((count + 1))
  fi
done < <(find "$ROOT/tlh" -type f \( -name "*.js" -o -name "*.html" \) -not -path "$ROOT/tlh/worker/*")
echo "  updated cache-bust in $count files"

# Decode cache-bust to subtitle dim suffix.
# Example: 096-10-22 -> dim suffix .6.10.22 (bright is "v0.0.9", from char 1).
# v0.0.9.7+ format dropped the second-to-last segment, so cache-busts
# now look like 097-0-12 with a vestigial "0-" middle. Strip that
# leading "0-" so 097-0-12 decodes to .7.12 (matching the displayed
# 5-segment v0.0.9.7.12), while older 096-10-22 still decodes correctly.
parse_dim() {
  local v="$1"
  local first="${v%%-*}"            # 096 / 097
  local rest="${v#*-}"               # 10-22 / 0-12
  rest="${rest#0-}"                  # strip vestigial leading "0-" (v0.0.9.7+)
  echo ".${first:2:1}.${rest//-/.}" # .6.10.22 / .7.12
}

old_dim=$(parse_dim "$old_v")
new_dim=$(parse_dim "$new_v")

html="$ROOT/tlh/the-long-haul.html"
if grep -q "<span style=\"opacity:0.6\">$old_dim</span>" "$html"; then
  sed -i "s|<span style=\"opacity:0.6\">$old_dim</span>|<span style=\"opacity:0.6\">$new_dim</span>|" "$html"
  echo "  updated subtitle: $old_dim -> $new_dim"
else
  echo "  warning: subtitle dim part not found in expected format; check $html manually"
fi

# Decode to game version for commit-message hint and boot banner update.
old_game_v="0.0.${old_v:1:1}$old_dim"
new_game_v="0.0.${new_v:1:1}$new_dim"

# Update boot screen "dispatch terminal" banner version (tlh/tlh-boot.js).
boot_js="$ROOT/tlh/tlh-boot.js"
if grep -q "<span class=\"right\">v$old_game_v</span>" "$boot_js"; then
  sed -i "s|<span class=\"right\">v$old_game_v</span>|<span class=\"right\">v$new_game_v</span>|" "$boot_js"
  echo "  updated boot banner: v$old_game_v -> v$new_game_v"
else
  echo "  warning: boot banner version not found in expected format; check $boot_js manually"
fi

echo ""
echo "next steps:"
echo "  git add -A"
echo "  git commit -m 'tlh v$new_game_v — <description>'"
