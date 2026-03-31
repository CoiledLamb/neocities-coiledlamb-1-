// ==============================================
// gallery.js  —  generic category gallery
// ==============================================
// Per-page setup (before this script):
//   <script>window.PAGE_CATEGORY = 'figures';</script>
//   <script src="gallery.js" defer></script>
//
// URL state params (all optional):
//   ?month=03&sort=asc&page=2
// ==============================================

// --------------------------
// CATEGORY CONFIG
// Add categories here as needed.
// --------------------------
const CATEGORY_CONFIG = {
  figures: {
    folder: '/images/figures/',
    fallback: []
  },
  hands: {
    folder: '/images/hands/',
    fallback: []
  },
  artwork: {
    folder: '/images/artwork/',
    fallback: []
  },
  general: {
    folder: '/images/general/',
    fallback: []
  }
};

const PAGE_CATEGORY = window.PAGE_CATEGORY || 'figures';

if (!CATEGORY_CONFIG[PAGE_CATEGORY]) {
  console.warn(`gallery.js: unknown PAGE_CATEGORY "${PAGE_CATEGORY}". Add it to CATEGORY_CONFIG.`);
}

// --------------------------
// URL STATE HELPERS
// --------------------------
function getParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

function setParams(updates) {
  const params = new URLSearchParams(window.location.search);
  Object.entries(updates).forEach(([k, v]) => {
    if (v === null || v === undefined) {
      params.delete(k);
    } else {
      params.set(k, String(v));
    }
  });
  const qs = params.toString();
  const newUrl = window.location.pathname + (qs ? '?' + qs : '');
  history.replaceState(null, '', newUrl);
}

// --------------------------
// STATE  (initialised from URL)
// --------------------------
const PER_PAGE = 20;
let currentPage     = parseInt(getParam('page'),  10) || 1;
let sortDescending  = (getParam('sort') || 'desc') !== 'asc';
let currentMonth    = getParam('month') || 'all';

let galleryImages   = [];
let currentIndex    = 0;
let observer;
let galleryData     = {};
Object.keys(CATEGORY_CONFIG).forEach(k => { galleryData[k] = []; });

// --------------------------
// HELPERS — date / filename
// --------------------------
function extractDateFromFilename(filename) {
  let digits = filename
    .replace(/^(figures|hands|artwork|general)\s/i, '')
    .replace(/\.webp$/i, '')
    .replace(/^(\d{6})[b-z]$/i, '$1')
    .replace(/^(\d{5})[b-z]$/i, '$1');

  let mm, dd, yy;
  if (digits.length === 5) {
    mm = digits.slice(0, 1); dd = digits.slice(1, 3); yy = digits.slice(3, 5);
  } else if (digits.length === 6) {
    mm = digits.slice(0, 2); dd = digits.slice(2, 4); yy = digits.slice(4, 6);
  } else {
    return null;
  }
  return {
    iso:     `20${yy}-${mm.padStart(2, '0')}-${dd}`,
    display: `${mm.padStart(2, '0')}/${dd}/${yy}`
  };
}

function normalizeItem(raw) {
  if (typeof raw === 'object' && raw !== null) {
    return { file: raw.file || '', date: raw.date || null, display: raw.display || raw.file || 'Untitled' };
  }
  if (typeof raw === 'string') {
    const d = extractDateFromFilename(raw);
    return { file: raw, date: d ? d.iso : null, display: d ? d.display : raw };
  }
  return { file: '', date: null, display: 'Untitled' };
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(normalizeItem).filter(i => i.file);
}

// --------------------------
// HELPERS — current category
// --------------------------
function currentItems()  { return galleryData[PAGE_CATEGORY] || []; }
function currentFolder() { return CATEGORY_CONFIG[PAGE_CATEGORY]?.folder || ''; }
function imagePath(item) { return currentFolder() + item.file; }
function monthOf(item)   { if (!item.date) return '??'; const p = item.date.split('-'); return p[1] || '??'; }
function captionOf(item) { return item.display || item.file || 'Untitled'; }
function hasDate(item)   { return !!item.date && !isNaN(new Date(item.date).getTime()); }

// --------------------------
// SORT COMPARATOR
// --------------------------
function compareItems(a, b) {
  const ad = hasDate(a), bd = hasDate(b);
  if (ad && bd) {
    const diff = new Date(b.date) - new Date(a.date);
    if (diff !== 0) return sortDescending ? diff : -diff;
    return sortDescending ? b.file.localeCompare(a.file) : a.file.localeCompare(b.file);
  }
  if (ad && !bd) return -1;
  if (!ad && bd) return  1;
  return sortDescending ? b.file.localeCompare(a.file) : a.file.localeCompare(b.file);
}

// --------------------------
// TABS
// --------------------------
const MONTH_NAMES = {
  '01':'Jan','02':'Feb','03':'Mar','04':'Apr',
  '05':'May','06':'Jun','07':'Jul','08':'Aug',
  '09':'Sep','10':'Oct','11':'Nov','12':'Dec'
};

function generateTabs(items) {
  const container = document.querySelector('.tabs');
  container.innerHTML = '';

  const counts = {};
  items.forEach(item => {
    const m = monthOf(item);
    if (m !== '??') counts[m] = (counts[m] || 0) + 1;
  });

  function makeTab(label, onClick, isActive, extraClass) {
    const t = document.createElement('div');
    t.className = 'tab' + (isActive ? ' active' : '') + (extraClass ? ' ' + extraClass : '');
    t.textContent = label;
    t.onclick = onClick;
    return t;
  }

  container.appendChild(makeTab(
    `All (${items.length})`,
    () => { currentMonth = 'all'; currentPage = 1; setParams({ month: null, page: null }); transitionGallery(generateGallery); },
    currentMonth === 'all'
  ));

  Object.keys(counts).sort().forEach(m => {
    container.appendChild(makeTab(
      `${MONTH_NAMES[m] || m} (${counts[m]})`,
      () => { currentMonth = m; currentPage = 1; setParams({ month: m, page: null }); transitionGallery(generateGallery); },
      m === currentMonth
    ));
  });

  const sortTab = makeTab(
    sortDescending ? 'Newest First' : 'Oldest First',
    toggleSort,
    false,
    'sort'
  );
  container.appendChild(sortTab);
}

// --------------------------
// TRANSITIONS
// --------------------------
function transitionGallery(fn) {
  const g = document.querySelector('.gallery');
  g.classList.add('fade-out');
  setTimeout(() => { fn(); g.classList.remove('fade-out'); }, 200);
}

// --------------------------
// SORT
// --------------------------
function toggleSort() {
  sortDescending = !sortDescending;
  currentPage = 1;
  setParams({ sort: sortDescending ? null : 'asc', page: null });
  transitionGallery(generateGallery);
}

// --------------------------
// LAZY LOADING
// --------------------------
function setupLazyLoading() {
  if (observer) observer.disconnect();
  observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const img = e.target;
        img.src = img.dataset.src;
        observer.unobserve(img);
      }
    });
  }, { rootMargin: '120px' });
  document.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));
}

function preloadNextPage(filtered) {
  filtered.slice(currentPage * PER_PAGE, (currentPage + 1) * PER_PAGE).forEach(item => {
    const img = new Image(); img.src = imagePath(item);
  });
}

// --------------------------
// MAIN GALLERY RENDER
// --------------------------
function generateGallery() {
  const gallery = document.querySelector('.gallery');
  gallery.innerHTML = '';
  galleryImages = [];

  const items = currentItems();
  generateTabs(items);

  let filtered = items.slice();
  if (currentMonth !== 'all') filtered = filtered.filter(i => monthOf(i) === currentMonth);
  filtered.sort(compareItems);

  const pageItems = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  pageItems.forEach(item => {
    const div = document.createElement('div');
    div.className = 'thumb';

    const img = document.createElement('img');
    img.dataset.src = imagePath(item);
    img.alt = item.file;
    img.onclick = () => openLightbox(img);
    div.appendChild(img);

    const caption = document.createElement('div');
    caption.className = 'caption';
    caption.textContent = captionOf(item);
    div.appendChild(caption);

    gallery.appendChild(div);
    galleryImages.push(img);
  });

  renderPagination(filtered);
  setupLazyLoading();
  preloadNextPage(filtered);
}

// --------------------------
// PAGINATION
// --------------------------
function renderPagination(filtered) {
  const container = document.querySelector('.pagination');
  container.innerHTML = '';
  const total = Math.ceil(filtered.length / PER_PAGE);
  for (let i = 1; i <= total; i++) {
    const a = document.createElement('a');
    a.textContent = i;
    a.href = '#';
    if (i === currentPage) a.classList.add('active');
    a.onclick = e => {
      e.preventDefault();
      currentPage = i;
      setParams({ page: i > 1 ? i : null });
      transitionGallery(generateGallery);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    container.appendChild(a);
  }
}

// --------------------------
// LIGHTBOX
// --------------------------
function openLightbox(imgEl) {
  currentIndex = galleryImages.indexOf(imgEl);
  const lb  = document.getElementById('lightbox');
  const lbi = document.getElementById('lightbox-img');
  lb.style.display = 'flex';
  lbi.style.opacity = 0;
  setTimeout(() => {
    lbi.src = imgEl.src || imgEl.dataset.src;
    lbi.style.opacity = 1;
  }, 50);
}

function changeImage(idx) {
  if (!galleryImages.length) return;
  const lbi = document.getElementById('lightbox-img');
  lbi.style.opacity = 0;
  setTimeout(() => {
    currentIndex = idx;
    const t = galleryImages[currentIndex];
    lbi.src = t.src || t.dataset.src;
    lbi.style.opacity = 1;
  }, 150);
}

function showNext() { changeImage((currentIndex + 1) % galleryImages.length); }
function showPrev() { changeImage((currentIndex - 1 + galleryImages.length) % galleryImages.length); }

document.addEventListener('keydown', e => {
  const lb = document.getElementById('lightbox');
  if (!lb || lb.style.display !== 'flex') return;
  if (e.key === 'ArrowRight') showNext();
  if (e.key === 'ArrowLeft')  showPrev();
  if (e.key === 'Escape')     lb.style.display = 'none';
});

// --------------------------
// DATA LOADING
// --------------------------
function loadFallbackData() {
  Object.keys(CATEGORY_CONFIG).forEach(k => {
    galleryData[k] = normalizeItems(CATEGORY_CONFIG[k].fallback);
  });
}

async function loadGalleryData() {
  loadFallbackData();
  try {
    const res = await fetch('gallery.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    Object.keys(CATEGORY_CONFIG).forEach(k => {
      galleryData[k] = normalizeItems(
        Array.isArray(data[k]) ? data[k] : CATEGORY_CONFIG[k].fallback
      );
    });
  } catch (err) {
    console.warn('gallery.js: using fallback data:', err);
  }
  generateGallery();
}

window.onload = loadGalleryData;
