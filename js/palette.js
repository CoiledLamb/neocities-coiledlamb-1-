/* ===========================================================
   palette.js (v0.0.9.6.9.30)
   ===========================================================
   Single source of truth for JS-side reads of the TLH text
   palette. Mirrors the `:root` tokens declared in
   the-long-haul.css so SVG/canvas paint paths can stay in
   sync with the CSS palette without duplicating literals.

   Use sparingly — most colors live in CSS. JS reads are only
   needed when:
     - SVG element fills are set via setAttribute (route-map
       node labels + current-pos dot)
     - JS picks a color from a lookup (courier @ status,
       gear-wear tier)

   Atmospheric paths are intentionally NOT in this palette —
   sky/sunset, storm gradients, terrain water glyphs, stamina
   bar gradient, trample tier glyphs all keep their own
   literals because the bone-theme override only targets text-
   ish UI bits.

   Caching: read once, cache the resolved hex strings. If a
   future theme switch flips `<html data-theme="bone">`,
   call clearPaletteCache() to force a re-read on next access.
   =========================================================== */
'use strict';

let _cache = null;

function read(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Resolve all TLH text tokens once and cache. Subsequent calls
 *  return the same object until clearPaletteCache() is called.
 *  Returns hex strings ready for SVG/canvas use. */
export function tlhPalette() {
  if (_cache) return _cache;
  _cache = {
    text:          read('--tlh-text'),
    textSecondary: read('--tlh-text-secondary'),
    textMid:       read('--tlh-text-mid'),
    textDim:       read('--tlh-text-dim'),
    textFaint:     read('--tlh-text-faint'),
    textBright:    read('--tlh-text-bright'),
    accent:        read('--tlh-accent'),
    warn:          read('--tlh-warn'),
    warnDeep:      read('--tlh-warn-deep'),
    crit:          read('--tlh-crit'),
    rule:          read('--tlh-rule'),
  };
  return _cache;
}

/** Drop the cache so the next tlhPalette() call re-reads from
 *  the DOM. Call this after flipping a theme attribute. */
export function clearPaletteCache() {
  _cache = null;
}
