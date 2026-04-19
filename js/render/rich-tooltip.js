/* ===========================================================
   rich-tooltip.js (v0.0.9.6.9.26)
   ===========================================================
   Single body-portaled tooltip element that supports HTML
   content (so per-substring color is possible) and a live-
   refresh hook (so values can tick while the tooltip is open).

   Why a portal: the existing CSS `.has-tooltip::after` pattern
   is text-only AND lives inside `#gameShell`, which has
   `overflow: hidden`. Tooltips on cells near the shell edge
   get clipped. Appending the tooltip element to `<body>` and
   positioning it with viewport coords avoids both problems.

   API:
     showRichTooltip(targetEl, html, opts?)
        opts.refresh = () => string   live-refresh callback
        opts.refreshMs = number        refresh interval (default 100)
        opts.placement = 'above' | 'below'  (default 'above')
        opts.id = string               identity tag — re-shows
                                       are skipped when same id+target
     updateRichTooltip(html)           replace content, keep position
     hideRichTooltip()                 dismiss + stop refresher
     activeRichTooltipId()             string | null
   =========================================================== */

let tipEl = null;
let activeTarget = null;
let activeId = null;
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

function position(targetEl, placement) {
  const r = targetEl.getBoundingClientRect();
  const tr = tipEl.getBoundingClientRect();
  // Center horizontally over the target, then clamp into viewport
  // with an 8px gutter so edge slots don't push the tooltip past
  // the window. Position is `fixed`, so coords are viewport-local.
  const cx = r.left + r.width / 2;
  let left = cx - tr.width / 2;
  const minL = 8;
  const maxL = window.innerWidth - tr.width - 8;
  if (left < minL) left = minL;
  if (left > maxL) left = maxL;
  let top;
  if (placement === 'below') {
    top = r.bottom + 5;
  } else {
    top = r.top - tr.height - 5;
    // If we'd clip the top, flip below.
    if (top < 8) top = r.bottom + 5;
  }
  tipEl.style.left = left + 'px';
  tipEl.style.top  = top  + 'px';
}

export function showRichTooltip(targetEl, html, opts = {}) {
  if (!targetEl) return;
  ensureEl();
  // Same target + same id = no-op (avoids flicker when the
  // mouseover handler fires repeatedly across child nodes).
  if (activeTarget === targetEl && opts.id && activeId === opts.id) return;
  activeTarget = targetEl;
  activeId = opts.id || null;
  tipEl.innerHTML = html;
  tipEl.classList.add('on');
  tipEl.setAttribute('aria-hidden', 'false');
  position(targetEl, opts.placement || 'above');
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  if (typeof opts.refresh === 'function') {
    const ms = opts.refreshMs || 100;
    refreshTimer = setInterval(() => {
      if (activeTarget !== targetEl) return;
      const next = opts.refresh();
      if (typeof next === 'string' && next !== tipEl.innerHTML) {
        tipEl.innerHTML = next;
        position(targetEl, opts.placement || 'above');
      }
    }, ms);
  }
}

export function updateRichTooltip(html) {
  if (!tipEl || !activeTarget) return;
  if (typeof html !== 'string') return;
  if (tipEl.innerHTML === html) return;
  tipEl.innerHTML = html;
  position(activeTarget, 'above');
}

export function hideRichTooltip() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  if (!tipEl) return;
  tipEl.classList.remove('on');
  tipEl.setAttribute('aria-hidden', 'true');
  activeTarget = null;
  activeId = null;
}

export function activeRichTooltipId() {
  return activeId;
}
