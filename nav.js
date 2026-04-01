// ==============================================
// SHARED SIDEBAR NAV
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
        { key: 'nsfw',    label: 'NSFW',     href: 'nsfw.html'    },
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

    // Logo + about link
    const logo = document.createElement('div');
    logo.className = 'nav-logo';
    logo.innerHTML =
      '<a href="artwork.html" class="nav-logo-title">coiled lamb</a>' +
      '<a href="about.html" class="nav-logo-sub' +
        (active === 'about' ? ' active' : '') + '">about</a>';
    sidebar.appendChild(logo);

    const links = document.createElement('div');
    links.className = 'nav-links';

    NAV.forEach((item, i) => {
      if (i > 0) {
        const div = document.createElement('div');
        div.className = 'nav-divider';
        links.appendChild(div);
      }

      const li = document.createElement('div');
      li.className = 'nav-item';

      const a = document.createElement('a');
      a.className = 'nav-link nav-parent' + (item.key === active ? ' active' : '');
      a.href = item.href;
      a.textContent = item.label;
      li.appendChild(a);

      if (item.children) {
        const sub = document.createElement('div');
        sub.className = 'nav-children';
        item.children.forEach(child => {
          const ca = document.createElement('a');
          ca.className = 'nav-link nav-child' + (child.key === active ? ' active' : '');
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
