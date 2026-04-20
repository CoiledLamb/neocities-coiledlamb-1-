/* ===========================================================
   rich-tooltip.js
   ===========================================================
   Single body-portaled tooltip element that backs every tooltip
   in the game. Supports HTML content (so per-substring color is
   possible) and a live-refresh hook (so values can tick while
   the tooltip is open).

   Why a portal: legacy CSS `.has-tooltip::after` lives inside
   `#gameShell` which has `overflow: hidden` for the scrolling
   fieldstrip. Tooltips on cells near the shell edge get clipped.
   Appending the tooltip element to `<body>` and positioning it
   with viewport coords avoids the clip + lets the tooltip cross
   over panels.

   v0.0.9.6.9.30 — unification: all 4 prior tooltip systems
   (#routeTooltip, #pkgTooltip, .has-tooltip::after, the original
   .rich-tip) collapsed onto this one. Adds:
     - placement: 'cursor' for mousemove-anchored tooltips
       (route map). Pass opts.cursor = {x,y}; subsequent shows
       with the same id+target update position only.
     - multiline: true for wrapped-text tooltips (max 220px).
     - text: <string> shortcut — alternative to html, auto-escapes
       and converts \n to <br> for plain-text callers.

   API:
     showRichTooltip(targetEl, html, opts?)
        opts.id        string — identity tag; re-shows are
                       skipped when same id+target unless cursor
                       mode (then position updates only)
        opts.placement 'above' | 'below' | 'cursor' (default 'above')
        opts.cursor    { x, y } — required when placement='cursor'
        opts.multiline boolean — wrap at 220px instead of nowrap
        opts.text      string — pass plain text, auto-escaped +
                       newlines converted (use instead of html)
        opts.refresh   () => string — live-refresh callback
        opts.refreshMs number — refresh interval (default 100)

     updateRichTooltip(html)   replace content, keep position
     hideRichTooltip()         dismiss + stop refresher
     activeRichTooltipId()     string | null
   =========================================================== */

let tipEl = null;
let activeTarget = null;
let activeId = null;
let activeOpts = null;     // last opts so cursor updates can re-use placement
let refreshTimer = null;

function ensureEl() {
  if (tipEl) return tipEl;
  tipEl = document.createElement('div');
  tipEl.id = 'richTooltip';
  tipEl.className = 'rich-tip';
  tipEl.setAttribute('role', 'tooltip');
  tipEl.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tipEl);
  return tipEl;
}

// Plain text → escaped HTML with \n converted to <br>. Used by
// callers that previously stuffed text into data-tooltip with
// `white-space: pre`. Keeps multi-line plain-text tooltips
// XSS-safe even though current call sites don't pass user data.
function textToHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

function position(targetEl, opts) {
  const placement = (opts && opts.placement) || 'above';
  const tr = tipEl.getBoundingClientRect();
  let left, top;

  if (placement === 'cursor' && opts && opts.cursor) {
    // Cursor-anchored: 12px down-right of the cursor. Used by the
    // route-map tooltip so it tracks the mouse over SVG node hit-
    // targets. Universal viewport clamp below keeps it on screen.
    left = opts.cursor.x + 12;
    top  = opts.cursor.y + 12;
  } else {
    // Target-anchored: centered horizontally over the target.
    // above/below picks vertical side; above flips to below if it
    // would clip the top edge.
    const r = targetEl.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    left = cx - tr.width / 2;
    if (placement === 'below') {
      top = r.bottom + 5;
    } else {
      top = r.top - tr.height - 5;
      if (top < 8) top = r.bottom + 5;
    }
  }

  // Universal viewport clamp (8px gutter all sides).
  const minL = 8;
  const maxL = window.innerWidth - tr.width - 8;
  if (left < minL) left = minL;
  if (left > maxL) left = maxL;
  const minT = 8;
  const maxT = window.innerHeight - tr.height - 8;
  if (top < minT) top = minT;
  if (top > maxT) top = maxT;

  tipEl.style.left = left + 'px';
  tipEl.style.top  = top  + 'px';
}

export function showRichTooltip(targetEl, html, opts = {}) {
  if (!targetEl) return;
  ensureEl();

  // text shortcut — plain string with newlines, auto-escaped.
  const content = (typeof opts.text === 'string') ? textToHtml(opts.text) : html;

  // Same target + same id: avoid the flicker of a full re-show.
  // For cursor mode we still want position to track the mouse,
  // and content can update if it changed (e.g. live-recomputed
  // distances on the route tooltip).
  if (activeTarget === targetEl && opts.id && activeId === opts.id) {
    if (typeof content === 'string' && tipEl.innerHTML !== content) {
      tipEl.innerHTML = content;
    }
    activeOpts = opts;
    if (opts.placement === 'cursor') position(targetEl, opts);
    return;
  }

  activeTarget = targetEl;
  activeId = opts.id || null;
  activeOpts = opts;
  tipEl.innerHTML = (typeof content === 'string') ? content : '';

  // multiline modifier — switches white-space + max-width via
  // class so the inline styles on .rich-tip stay clean.
  if (opts.multiline) tipEl.classList.add('multiline');
  else tipEl.classList.remove('multiline');

  tipEl.classList.add('on');
  tipEl.setAttribute('aria-hidden', 'false');
  position(targetEl, opts);

  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  if (typeof opts.refresh === 'function') {
    const ms = opts.refreshMs || 100;
    refreshTimer = setInterval(() => {
      if (activeTarget !== targetEl) return;
      const next = opts.refresh();
      if (typeof next === 'string' && next !== tipEl.innerHTML) {
        tipEl.innerHTML = next;
        position(targetEl, opts);
      }
    }, ms);
  }
}

export function updateRichTooltip(html) {
  if (!tipEl || !activeTarget) return;
  if (typeof html !== 'string') return;
  if (tipEl.innerHTML === html) return;
  tipEl.innerHTML = html;
  position(activeTarget, activeOpts || { placement: 'above' });
}

export function hideRichTooltip() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  if (!tipEl) return;
  tipEl.classList.remove('on');
  tipEl.classList.remove('multiline');
  tipEl.setAttribute('aria-hidden', 'true');
  activeTarget = null;
  activeId = null;
  activeOpts = null;
}

export function activeRichTooltipId() {
  return activeId;
}
