// ==============================================
// gallery.js  —  generic category gallery
// ==============================================
// Per-page config: set window.PAGE_CATEGORY before
// this script loads. e.g.:
//   <script>window.PAGE_CATEGORY = 'figures';</script>
//   <script src="gallery.js" defer></script>
// ==============================================

// --------------------------
// CATEGORY CONFIG
// --------------------------
// Add a new entry here for each gallery category.
// folder  : image path prefix (trailing slash)
// fallback: filenames used if gallery.json fails to load
// --------------------------
const CATEGORY_CONFIG = {
  figures: {
    folder: "/images/figures/",
    fallback: [
      "figures 022026.webp","figures 022126.webp","figures 022226.webp",
      "figures 022426.webp","figures 022526.webp","figures 022626.webp",
      "figures 022726.webp","figures 030226.webp","figures 030426.webp",
      "figures 030526.webp","figures 030626.webp","figures 030726.webp",
      "figures 030826.webp","figures 030926.webp","figures 031126.webp",
      "figures 031226.webp","figures 031326.webp","figures 031526.webp",
      "figures 031626.webp","figures 031726.webp","figures 031826.webp",
      "figures 031926.webp","figures 032026.webp"
    ]
  },
  hands: {
    folder: "/images/hands/",
    fallback: [
      "hands 022026.webp","hands 022226.webp","hands 032426.webp","hands 03526.webp"
    ]
  },
  general: {
    folder: "/images/general/",
    fallback: []
  }
};

// --------------------------
// PAGE SETUP
// Reads window.PAGE_CATEGORY, falls back to 'figures'
// --------------------------
const PAGE_CATEGORY = (window.PAGE_CATEGORY || "figures");

// Validate — warn if the category isn't registered
if (!CATEGORY_CONFIG[PAGE_CATEGORY]) {
  console.warn(`gallery.js: unknown PAGE_CATEGORY "${PAGE_CATEGORY}". Add it to CATEGORY_CONFIG.`);
}

// --------------------------
// STATE
// --------------------------
const PER_PAGE = 20;
let currentPage = 1;
let galleryImages = [];
let currentIndex = 0;
let sortDescending = true;
let observer;
let currentMonth = "all";

let galleryData = {};
Object.keys(CATEGORY_CONFIG).forEach(k => { galleryData[k] = []; });

// --------------------------
// HELPERS — date / filename
// --------------------------

/** Parse date parts from a filename like "figures 022026.webp" */
function extractDateFromFilename(filename) {
  let digits = filename
    .replace(/^(figures|hands|general)\s/i, "")
    .replace(/\.webp$/i, "")
    .replace(/^(\d{6})[b-z]$/i, "$1")
    .replace(/^(\d{5})[b-z]$/i, "$1");

  let mm, dd, yy;
  if (digits.length === 5) {
    mm = digits.slice(0, 1);
    dd = digits.slice(1, 3);
    yy = digits.slice(3, 5);
  } else if (digits.length === 6) {
    mm = digits.slice(0, 2);
    dd = digits.slice(2, 4);
    yy = digits.slice(4, 6);
  } else {
    return null;
  }

  return {
    iso:     `20${yy}-${mm.padStart(2, "0")}-${dd}`,
    display: `${mm.padStart(2, "0")}/${dd}/${yy}`
  };
}

/** Normalise a raw item (string or object) to { file, date, display } */
function normalizeItem(raw) {
  if (typeof raw === "object" && raw !== null) {
    return {
      file:    raw.file    || "",
      date:    raw.date    || null,
      display: raw.display || raw.file || "Untitled"
    };
  }
  if (typeof raw === "string") {
    const d = extractDateFromFilename(raw);
    return { file: raw, date: d ? d.iso : null, display: d ? d.display : raw };
  }
  return { file: "", date: null, display: "Untitled" };
}

/** Normalise an array of raw items and drop any with no filename */
function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(normalizeItem).filter(i => i.file);
}

// --------------------------
// HELPERS — current category
// --------------------------
function currentItems()  { return galleryData[PAGE_CATEGORY] || []; }
function currentFolder() { return CATEGORY_CONFIG[PAGE_CATEGORY]?.folder || ""; }
function imagePath(item) { return currentFolder() + item.file; }

function monthOf(item) {
  if (!item.date) return "??";
  const p = item.date.split("-");
  return p.length >= 2 ? p[1] : "??";
}

function captionOf(item) { return item.display || item.file || "Untitled"; }

function hasDate(item) {
  return !!item.date && !isNaN(new Date(item.date).getTime());
}

// --------------------------
// SORT COMPARATOR
// --------------------------
function compareItems(a, b) {
  const ad = hasDate(a), bd = hasDate(b);
  if (ad && bd) {
    const diff = new Date(b.date) - new Date(a.date);
    if (diff !== 0) return sortDescending ? diff : -diff;
    return sortDescending
      ? b.file.localeCompare(a.file)
      : a.file.localeCompare(b.file);
  }
  if (ad && !bd) return -1;
  if (!ad && bd) return 1;
  return sortDescending
    ? b.file.localeCompare(a.file)
    : a.file.localeCompare(b.file);
}

// --------------------------
// TABS
// --------------------------
const MONTH_NAMES = {
  "01":"Jan","02":"Feb","03":"Mar","04":"Apr",
  "05":"May","06":"Jun","07":"Jul","08":"Aug",
  "09":"Sep","10":"Oct","11":"Nov","12":"Dec"
};

function generateTabs(items) {
  const container = document.querySelector(".tabs");
  container.innerHTML = "";

  const counts = {};
  items.forEach(item => {
    const m = monthOf(item);
    if (m !== "??") counts[m] = (counts[m] || 0) + 1;
  });

  function makeTab(label, onClick, isActive) {
    const t = document.createElement("div");
    t.className = "tab" + (isActive ? " active" : "");
    t.innerText = label;
    t.onclick = onClick;
    return t;
  }

  container.appendChild(
    makeTab(`All (${items.length})`, () => {
      currentMonth = "all"; currentPage = 1; transitionGallery(generateGallery);
    }, currentMonth === "all")
  );

  Object.keys(counts).sort().forEach(m => {
    container.appendChild(
      makeTab(`${MONTH_NAMES[m] || m} (${counts[m]})`, () => {
        currentMonth = m; currentPage = 1; transitionGallery(generateGallery);
      }, m === currentMonth)
    );
  });

  container.appendChild(
    makeTab(sortDescending ? "Newest First" : "Oldest First", toggleSort, false)
      // give the sort tab its extra class
  );
  container.lastChild.classList.add("sort");
}

// --------------------------
// TRANSITIONS
// --------------------------
function transitionGallery(fn) {
  const g = document.querySelector(".gallery");
  g.classList.add("fade-out");
  setTimeout(() => { fn(); g.classList.remove("fade-out"); }, 200);
}

// --------------------------
// SORT
// --------------------------
function toggleSort() {
  sortDescending = !sortDescending;
  currentPage = 1;
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
  }, { rootMargin: "100px" });
  document.querySelectorAll("img[data-src]").forEach(img => observer.observe(img));
}

function preloadNextPage(filtered) {
  const start = currentPage * PER_PAGE;
  filtered.slice(start, start + PER_PAGE).forEach(item => {
    const img = new Image();
    img.src = imagePath(item);
  });
}

// --------------------------
// MAIN GALLERY RENDER
// --------------------------
function generateGallery() {
  const gallery = document.querySelector(".gallery");
  gallery.innerHTML = "";
  galleryImages = [];

  const items = currentItems();
  generateTabs(items);

  let filtered = items.slice();
  if (currentMonth !== "all") {
    filtered = filtered.filter(item => monthOf(item) === currentMonth);
  }
  filtered.sort(compareItems);

  const pageItems = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  pageItems.forEach(item => {
    const div = document.createElement("div");
    div.className = "thumb";

    const img = document.createElement("img");
    img.dataset.src = imagePath(item);
    img.alt = item.file;
    img.onclick = () => openLightbox(img);
    div.appendChild(img);

    const caption = document.createElement("div");
    caption.className = "caption";
    caption.innerText = captionOf(item);
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
  const container = document.querySelector(".pagination");
  container.innerHTML = "";
  const total = Math.ceil(filtered.length / PER_PAGE);
  for (let i = 1; i <= total; i++) {
    const a = document.createElement("a");
    a.innerText = i;
    a.href = "#";
    if (i === currentPage) a.classList.add("active");
    a.onclick = e => {
      e.preventDefault();
      currentPage = i;
      transitionGallery(generateGallery);
    };
    container.appendChild(a);
  }
}

// --------------------------
// LIGHTBOX
// --------------------------
function openLightbox(imgEl) {
  currentIndex = galleryImages.indexOf(imgEl);
  const lb  = document.getElementById("lightbox");
  const lbi = document.getElementById("lightbox-img");
  lb.style.display = "flex";
  lbi.style.opacity = 0;
  setTimeout(() => {
    lbi.src = imgEl.src || imgEl.dataset.src;
    lbi.style.opacity = 1;
  }, 200);
}

function changeImage(idx) {
  if (!galleryImages.length) return;
  const lbi = document.getElementById("lightbox-img");
  lbi.style.opacity = 0;
  setTimeout(() => {
    currentIndex = idx;
    const t = galleryImages[currentIndex];
    lbi.src = t.src || t.dataset.src;
    lbi.style.opacity = 1;
  }, 200);
}

function showNext() {
  if (!galleryImages.length) return;
  changeImage((currentIndex + 1) % galleryImages.length);
}

function showPrev() {
  if (!galleryImages.length) return;
  changeImage((currentIndex - 1 + galleryImages.length) % galleryImages.length);
}

// --------------------------
// KEYBOARD
// --------------------------
document.addEventListener("keydown", e => {
  const lb = document.getElementById("lightbox");
  if (lb.style.display === "flex") {
    if (e.key === "ArrowRight") showNext();
    if (e.key === "ArrowLeft")  showPrev();
    if (e.key === "Escape")     lb.style.display = "none";
  }
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
    const res = await fetch("gallery.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    Object.keys(CATEGORY_CONFIG).forEach(k => {
      galleryData[k] = normalizeItems(
        Array.isArray(data[k]) ? data[k] : CATEGORY_CONFIG[k].fallback
      );
    });
  } catch (err) {
    console.warn("gallery.js: using fallback data:", err);
  }

  generateGallery();
}

window.onload = loadGalleryData;
