// ==============================================
// SHARED SIDEBAR NAV — v1
// Set window.NAV_ACTIVE before loading:
//   <script>window.NAV_ACTIVE = 'figures';</script>
//   <script src="nav.js"></script>
// ==============================================
(function () {
  const NAV = [
    {
      key: 'artwork',
      label: 'Artwork',
      href: 'artwork.html',
      children: [
        { key: 'figures', label: 'Figures',  href: 'figures.html' },
        { key: 'hands',   label: 'Hands',    href: 'hands.html'   },
        { key: 'nsfw',    label: 'NSFW',     href: 'nsfw.html',   badge: '18+' },
      ]
    },
    {
      key: 'toys',
      label: 'Toys',
      href: 'toys.html',
      children: [
        { key: 'oilslick', label: 'Oilslick Labs', href: 'oilslick-lab.html' },
      ]
    },
  ];

  const active = window.NAV_ACTIVE || '';

  function buildSidebar() {
    const sidebar = document.createElement('nav');
    sidebar.className = 'nav-sidebar';
    sidebar.setAttribute('aria-label', 'Site navigation');

    // Logo block
    const logo = document.createElement('div');
    logo.className = 'nav-logo';

    const title = document.createElement('a');
    title.className = 'nav-logo-title oil-text';
    title.href = 'artwork.html';
    title.textContent = 'coiled lamb';
    logo.appendChild(title);

    const sub = document.createElement('a');
    sub.className = 'nav-logo-sub';
    sub.href = 'about.html';
    sub.textContent = 'about';
    if (active === 'about') sub.style.color = '#e0eeec';
    logo.appendChild(sub);

    sidebar.appendChild(logo);

    // Nav links (scrollable middle section)
    const links = document.createElement('div');
    links.className = 'nav-links';

    NAV.forEach((item, i) => {
      if (i > 0) {
        const div = document.createElement('div');
        div.className = 'nav-divider';
        links.appendChild(div);
      }

      const li = document.createElement('div');

      const a = document.createElement('a');
      a.className = 'nav-parent' + (item.key === active ? ' active' : '');
      a.href = item.href;
      a.textContent = item.label;
      li.appendChild(a);

      if (item.children) {
        const childWrap = document.createElement('div');
        childWrap.className = 'nav-children';
        item.children.forEach(child => {
          const ca = document.createElement('a');
          ca.className = 'nav-child' + (child.key === active ? ' active' : '');
          ca.href = child.href;
          ca.textContent = child.label;
          if (child.badge) {
            const b = document.createElement('span');
            b.className = 'nav-badge';
            b.textContent = child.badge;
            ca.appendChild(b);
          }
          childWrap.appendChild(ca);
        });
        li.appendChild(childWrap);
      }

      links.appendChild(li);
    });

    sidebar.appendChild(links);

    // Footer — replay button pinned to bottom
    const footer = document.createElement('div');
    footer.className = 'nav-footer';

    const replay = document.createElement('button');
    replay.className = 'nav-replay';
    replay.textContent = '[ replay opening ]';
    replay.setAttribute('type', 'button');
    replay.setAttribute('aria-label', 'Replay opening sequence');
    replay.onclick = function () {
      if (typeof window.startBoot === 'function') window.startBoot(true);
    };
    footer.appendChild(replay);
    sidebar.appendChild(footer);

    return sidebar;
  }

  // IDs that must stay as direct <body> children — never wrapped in .nav-offset
  // (position:fixed elements break if their containing block gains a transform/offset)
  const BODY_LEVEL_IDS = new Set(['boot', 'lightbox', 'scanlines', 'age-gate']);

  function injectNav() {
    const sidebar = buildSidebar();
    document.body.insertBefore(sidebar, document.body.firstChild);

    // Snapshot to a plain array first — iterating a live HTMLCollection while
    // moving nodes out of it causes elements to be skipped.
    const children = Array.from(document.body.children);

    const wrapper = document.createElement('div');
    wrapper.className = 'nav-offset';

    children.forEach(c => {
      if (c === sidebar) return;                  // skip the sidebar we just inserted
      if (BODY_LEVEL_IDS.has(c.id)) return;       // leave fixed overlays at body level
      wrapper.appendChild(c);                     // moves the node into wrapper
    });

    document.body.appendChild(wrapper);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectNav);
  } else {
    injectNav();
  }
})();
