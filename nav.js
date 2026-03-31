// ==============================================
// SHARED SIDEBAR NAV
// ==============================================
// Each page sets window.NAV_ACTIVE to the key
// matching its entry below before this script runs.
// e.g. <script>window.NAV_ACTIVE = 'figures';</script>

(function () {
  const NAV = [
    { key: 'home',     label: 'Home',        href: 'index.html' },
    {
      key: 'studies',
      label: 'Studies',
      href: 'studies.html',
      children: [
        { key: 'figures', label: 'Figures', href: 'figures.html' },
        { key: 'hands',   label: 'Hands',   href: 'hands.html'   },
      ]
    },
    { key: 'oilslick', label: 'Oilslick Labs', href: 'oilslick-lab.html' },
  ];

  const active = window.NAV_ACTIVE || '';

  // Determine which top-level item (or parent) is active
  function isActive(item) {
    if (item.key === active) return true;
    if (item.children) return item.children.some(c => c.key === active);
    return false;
  }

  function isChildActive(item) {
    return item.children ? item.children.some(c => c.key === active) : false;
  }

  function buildSidebar() {
    const sidebar = document.createElement('nav');
    sidebar.className = 'nav-sidebar';
    sidebar.setAttribute('aria-label', 'Site navigation');

    // Logo / site name
    const logo = document.createElement('div');
    logo.className = 'nav-logo';
    logo.innerHTML = '<a href="index.html">coiled lamb</a>';
    sidebar.appendChild(logo);

    // Links container
    const links = document.createElement('div');
    links.className = 'nav-links';

    NAV.forEach((item, i) => {
      // Divider before Oilslick
      if (item.key === 'oilslick') {
        const div = document.createElement('div');
        div.className = 'nav-divider';
        links.appendChild(div);
      }

      const li = document.createElement('div');
      li.className = 'nav-item';

      if (item.children) {
        // Has dropdown
        const parentActive = isActive(item);
        if (parentActive) li.classList.add('open');

        const a = document.createElement('a');
        a.className = 'nav-link nav-dropdown-toggle' + (item.key === active ? ' active' : '');
        a.href = item.href;
        a.innerHTML = item.label + '<span class="nav-arrow">›</span>';

        // Toggle dropdown on arrow click without navigating
        a.addEventListener('click', function (e) {
          // If clicking the arrow area, just toggle
          const rect = a.getBoundingClientRect();
          const arrowZone = e.clientX > rect.right - 24;
          if (arrowZone) {
            e.preventDefault();
            li.classList.toggle('open');
          }
        });

        const dropdown = document.createElement('div');
        dropdown.className = 'nav-dropdown';

        item.children.forEach(child => {
          const ca = document.createElement('a');
          ca.className = 'nav-link' + (child.key === active ? ' active' : '');
          ca.href = child.href;
          ca.textContent = child.label;
          dropdown.appendChild(ca);
        });

        li.appendChild(a);
        li.appendChild(dropdown);
      } else {
        const a = document.createElement('a');
        a.className = 'nav-link' + (item.key === active ? ' active' : '');
        a.href = item.href;
        a.textContent = item.label;
        li.appendChild(a);
      }

      links.appendChild(li);
    });

    sidebar.appendChild(links);
    return sidebar;
  }

  function injectNav() {
    const sidebar = buildSidebar();
    document.body.insertBefore(sidebar, document.body.firstChild);

    // Wrap existing body content in nav-offset div (skip the sidebar itself)
    const wrapper = document.createElement('div');
    wrapper.className = 'nav-offset';

    // Move all siblings after the sidebar into the wrapper
    const children = Array.from(document.body.children).slice(1);
    children.forEach(child => wrapper.appendChild(child));
    document.body.appendChild(wrapper);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectNav);
  } else {
    injectNav();
  }
})();
