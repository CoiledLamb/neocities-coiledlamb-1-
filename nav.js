// ==============================================
// SHARED SIDEBAR NAV
// ==============================================
// Set window.NAV_ACTIVE to a key before loading:
//   <script>window.NAV_ACTIVE = 'figures';</script>
//   <script src="nav.js"></script>

(function () {
  // Children are ALWAYS visible — no collapse.
  const NAV = [
    {
      key: 'studies',
      label: 'Studies',
      href: 'studies.html',
      children: [
        { key: 'figures', label: 'Figures',  href: 'figures.html'  },
        { key: 'hands',   label: 'Hands',    href: 'hands.html'    },
        { key: 'artwork', label: 'Artworks', href: 'artwork.html'  },
      ]
    },
    { key: 'oilslick', label: 'Oilslick Labs', href: 'oilslick-lab.html' },
  ];

  const active = window.NAV_ACTIVE || '';

  function buildSidebar() {
    const sidebar = document.createElement('nav');
    sidebar.className = 'nav-sidebar';
    sidebar.setAttribute('aria-label', 'Site navigation');

    const logo = document.createElement('div');
    logo.className = 'nav-logo';
    logo.innerHTML = '<a href="studies.html">coiled lamb</a>';
    sidebar.appendChild(logo);

    const links = document.createElement('div');
    links.className = 'nav-links';

    NAV.forEach(item => {
      if (item.key === 'oilslick') {
        const div = document.createElement('div');
        div.className = 'nav-divider';
        links.appendChild(div);
      }

      const li = document.createElement('div');
      li.className = 'nav-item';

      // Parent link
      const a = document.createElement('a');
      a.className = 'nav-link nav-parent' +
        (item.key === active ? ' active' : '');
      a.href = item.href;
      a.textContent = item.label;
      li.appendChild(a);

      // Children — always rendered, never hidden
      if (item.children) {
        const sub = document.createElement('div');
        sub.className = 'nav-children';
        item.children.forEach(child => {
          const ca = document.createElement('a');
          ca.className = 'nav-link nav-child' +
            (child.key === active ? ' active' : '');
          ca.href = child.href;
          ca.textContent = child.label;
          sub.appendChild(ca);
        });
        li.appendChild(sub);
      }

      links.appendChild(li);
    });

    sidebar.appendChild(links);
    return sidebar;
  }

  function injectNav() {
    const sidebar = buildSidebar();
    document.body.insertBefore(sidebar, document.body.firstChild);

    const wrapper = document.createElement('div');
    wrapper.className = 'nav-offset';
    Array.from(document.body.children).slice(1).forEach(c => wrapper.appendChild(c));
    document.body.appendChild(wrapper);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectNav);
  } else {
    injectNav();
  }
})();
