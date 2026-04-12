// ==============================================
// gallery.js  —  generic category gallery
// ==============================================
// Per-page setup (before this script):
//   <script>window.PAGE_CATEGORY = 'figures';</script>
//   <script src="gallery.js" defer></script>
//
// URL state params:
//   ?month=03&sort=asc&img=4
//   img = 0-based index into sorted/filtered list;
//         opens lightbox for that image.
// ==============================================

// --------------------------
// CATEGORY CONFIG
// --------------------------
const CATEGORY_CONFIG = {
  figures: { folder: '/images/figures/', fallback: [] },
  hands:   { folder: '/images/hands/',   fallback: [] },
  nsfw:    { folder: '/images/nsfw/',    fallback: [] },
  general: { folder: '/images/general/', fallback: [] }
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
    if (v === null || v === undefined) params.delete(k);
    else params.set(k, String(v));
  });
  const qs = params.toString();
  history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
}

// --------------------------
// STATE  (initialised from URL)
// --------------------------
let sortDescending = (getParam('sort') || 'desc') !== 'asc';
let currentMonth   = getParam('month') || 'all';

let galleryImages  = [];
let currentIndex   = 0;
let observer;
let galleryData    = {};
Object.keys(CATEGORY_CONFIG).forEach(k => { galleryData[k] = []; });

// --------------------------
// HELPERS — date / filename
// --------------------------
function extractDateFromFilename(filename) {
  let digits = filename
    .replace(/^(figures|hands|nsfw|general)\s/i, '')
    .replace(/\.webp$/i, '')
    .replace(/^(\d{6})[b-z]$/i, '$1')
    .replace(/^(\d{5})[b-z]$/i, '$1');
  let mm, dd, yy;
  if (digits.length === 5) {
    mm = digits.slice(0,1); dd = digits.slice(1,3); yy = digits.slice(3,5);
  } else if (digits.length === 6) {
    mm = digits.slice(0,2); dd = digits.slice(2,4); yy = digits.slice(4,6);
  } else { return null; }
  return {
    iso:     `20${yy}-${mm.padStart(2,'0')}-${dd}`,
    display: `${mm.padStart(2,'0')}/${dd}/${yy}`
  };
}

function normalizeItem(raw) {
  if (typeof raw === 'object' && raw !== null)
    return { file: raw.file||'', date: raw.date||null, display: raw.display||raw.file||'Untitled' };
  if (typeof raw === 'string') {
    const d = extractDateFromFilename(raw);
    return { file: raw, date: d?d.iso:null, display: d?d.display:raw };
  }
  return { file:'', date:null, display:'Untitled' };
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
function monthOf(item)   { if (!item.date) return '??'; return item.date.split('-')[1] || '??'; }
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
    if (m !== '??') counts[m] = (counts[m]||0) + 1;
  });
  function makeTab(label, onClick, isActive, extraClass) {
    const t = document.createElement('div');
    t.className = 'tab' + (isActive?' active':'') + (extraClass?' '+extraClass:'');
    t.textContent = label; t.onclick = onClick; return t;
  }
  container.appendChild(makeTab(
    `All (${items.length})`,
    () => { currentMonth='all'; setParams({month:null,img:null}); transitionGallery(generateGallery); },
    currentMonth==='all'
  ));
  Object.keys(counts).sort().forEach(m => {
    container.appendChild(makeTab(
      `${MONTH_NAMES[m]||m} (${counts[m]})`,
      () => { currentMonth=m; setParams({month:m,img:null}); transitionGallery(generateGallery); },
      m===currentMonth
    ));
  });
  container.appendChild(makeTab(
    sortDescending?'Newest First':'Oldest First',
    toggleSort, false, 'sort'
  ));
}

// --------------------------
// TRANSITIONS
// --------------------------
function transitionGallery(fn) {
  const g = document.querySelector('.gallery');
  g.classList.add('fade-out');
  setTimeout(() => { fn(); g.classList.remove('fade-out'); }, 200);
}

function toggleSort() {
  sortDescending = !sortDescending;
  setParams({ sort: sortDescending?null:'asc', img:null });
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
        if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
        observer.unobserve(img);
      }
    });
  }, { rootMargin: '200px' });
  document.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));
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

  filtered.forEach(item => {
    const div = document.createElement('div');
    div.className = 'thumb';
    const img = document.createElement('img');
    img.dataset.src = imagePath(item);
    img.alt = item.file;
    div.appendChild(img);
    const caption = document.createElement('div');
    caption.className = 'caption';
    caption.textContent = captionOf(item);
    div.appendChild(caption);
    gallery.appendChild(div);
    galleryImages.push(img);
  });

  // Wire click handlers after indices are stable
  galleryImages.forEach((img, idx) => { img.onclick = () => openLightbox(idx); });

  const pag = document.querySelector('.pagination');
  if (pag) pag.innerHTML = '';

  setupLazyLoading();

  // Open lightbox if URL has ?img=N
  const imgParam = parseInt(getParam('img'), 10);
  if (!isNaN(imgParam) && imgParam >= 0 && imgParam < galleryImages.length) {
    setTimeout(() => openLightbox(imgParam), 0);
  }
}

// --------------------------
// LIGHTBOX
// Comments have moved to individual static art pages (/art/[slug].html).
// The lightbox is now image-only; use the caption link to reach the
// full page and its comment thread.
// --------------------------

function openLightbox(idx) {
  currentIndex = idx;
  const lb  = document.getElementById('lightbox');
  const lbi = document.getElementById('lightbox-img');
  lb.style.display = 'flex';
  lbi.style.opacity = 0;

  const img = galleryImages[currentIndex];
  if (img.dataset.src) {
    img.src = img.dataset.src;
    delete img.dataset.src;
    if (observer) observer.unobserve(img);
  }
  lbi.src = img.src;
  lbi.onload = () => { lbi.style.opacity = 1; };

  setParams({ img: idx });
}

function closeLightbox() {
  document.getElementById('lightbox').style.display = 'none';
  setParams({ img: null });
}

function changeImage(idx) {
  if (!galleryImages.length) return;
  const lbi = document.getElementById('lightbox-img');
  lbi.style.opacity = 0;
  setTimeout(() => {
    currentIndex = (idx + galleryImages.length) % galleryImages.length;
    const img = galleryImages[currentIndex];
    if (img.dataset.src) {
      img.src = img.dataset.src;
      delete img.dataset.src;
      if (observer) observer.unobserve(img);
    }
    lbi.src = img.src;
    lbi.onload = () => { lbi.style.opacity = 1; };
    setParams({ img: currentIndex });
  }, 150);
}

function showNext() { changeImage(currentIndex + 1); }
function showPrev() { changeImage(currentIndex - 1); }

document.addEventListener('keydown', e => {
  const lb = document.getElementById('lightbox');
  if (!lb || lb.style.display !== 'flex') return;
  if (e.key === 'ArrowRight') showNext();
  if (e.key === 'ArrowLeft')  showPrev();
  if (e.key === 'Escape')     closeLightbox();
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
