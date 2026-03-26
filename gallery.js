// --------------------------
// PAGE CONFIG
// --------------------------
// Change these per page if needed.
const PAGE_CATEGORY = "figures";

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
// STATE
// --------------------------
const perPage = 20;
let currentPage = 1;
let galleryImages = [];
let currentIndex = 0;
let sortDescending = true;
let observer;
let currentMonth = "all";

let galleryData = {
  figures: [],
  hands: [],
  general: []
};

// --------------------------
// NORMALIZATION
// --------------------------
function extractDateDataFromFilename(filename) {
  let digits = filename
    .replace(/^(figures|hands|general)\s/i, "")
    .replace(/\.webp$/i, "");

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
    iso: `20${yy}-${mm.padStart(2, "0")}-${dd}`,
    display: `${mm}/${dd}/${yy}`
  };
}

function normalizeItem(item) {
  if (typeof item === "object" && item !== null) {
    return {
      file: item.file || "",
      date: item.date || null,
      display: item.display || item.file || "Untitled"
    };
  }

  if (typeof item === "string") {
    const dateData = extractDateDataFromFilename(item);

    return {
      file: item,
      date: dateData ? dateData.iso : null,
      display: dateData ? dateData.display : item
    };
  }

  return {
    file: "",
    date: null,
    display: "Untitled"
  };
}

function normalizeCategory(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map(normalizeItem)
    .filter(item => item.file);
}

function loadFallbackData() {
  galleryData.figures = normalizeCategory(CATEGORY_CONFIG.figures.fallback);
  galleryData.hands = normalizeCategory(CATEGORY_CONFIG.hands.fallback);
  galleryData.general = normalizeCategory(CATEGORY_CONFIG.general.fallback);
}

// --------------------------
// HELPERS
// --------------------------
function getCurrentItems() {
  return galleryData[PAGE_CATEGORY] || [];
}

function getCurrentFolder() {
  return CATEGORY_CONFIG[PAGE_CATEGORY]?.folder || "";
}

function getImagePath(item) {
  return getCurrentFolder() + item.file;
}

function getMonthFromItem(item) {
  if (!item.date) return "??";
  const parts = item.date.split("-");
  return parts.length >= 2 ? parts[1] : "??";
}

function getCaption(item) {
  return item.display || item.file || "Untitled";
}

function hasRealDate(item) {
  return !!item.date && !isNaN(new Date(item.date).getTime());
}

function compareItems(a, b) {
  const aHasDate = hasRealDate(a);
  const bHasDate = hasRealDate(b);

  if (aHasDate && bHasDate) {
    const aDate = new Date(a.date);
    const bDate = new Date(b.date);
    return sortDescending ? bDate - aDate : aDate - bDate;
  }

  if (aHasDate && !bHasDate) return -1;
  if (!aHasDate && bHasDate) return 1;

  return sortDescending
    ? b.file.localeCompare(a.file)
    : a.file.localeCompare(b.file);
}

// --------------------------
// TABS
// --------------------------
function generateTabs(allItems = getCurrentItems()) {
  const container = document.querySelector(".tabs");
  container.innerHTML = "";

  const counts = {};

  allItems.forEach(item => {
    const month = getMonthFromItem(item);
    if (month !== "??") {
      counts[month] = (counts[month] || 0) + 1;
    }
  });

  const monthNames = {
    "01":"Jan","02":"Feb","03":"Mar","04":"Apr",
    "05":"May","06":"Jun","07":"Jul","08":"Aug",
    "09":"Sep","10":"Oct","11":"Nov","12":"Dec"
  };

  const allTab = document.createElement("div");
  allTab.className = "tab";
  allTab.innerText = `All (${allItems.length})`;

  if (currentMonth === "all") allTab.classList.add("active");

  allTab.onclick = () => {
    currentMonth = "all";
    currentPage = 1;
    transitionGallery(generateGallery);
  };

  container.appendChild(allTab);

  Object.keys(counts)
    .sort()
    .forEach(month => {
      const tab = document.createElement("div");
      tab.className = "tab";
      tab.innerText = `${monthNames[month] || month} (${counts[month]})`;

      if (month === currentMonth) tab.classList.add("active");

      tab.onclick = () => {
        currentMonth = month;
        currentPage = 1;
        transitionGallery(generateGallery);
      };

      container.appendChild(tab);
    });

  const sortTab = document.createElement("div");
  sortTab.className = "tab sort";
  sortTab.innerText = sortDescending ? "Newest First" : "Oldest First";

  sortTab.onclick = () => {
    toggleSort();
  };

  container.appendChild(sortTab);
}

// --------------------------
// TRANSITIONS
// --------------------------
function transitionGallery(callback) {
  const gallery = document.querySelector(".gallery");
  gallery.classList.add("fade-out");

  setTimeout(() => {
    callback();
    gallery.classList.remove("fade-out");
  }, 200);
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
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        observer.unobserve(img);
      }
    });
  }, { rootMargin: "100px" });

  document.querySelectorAll("img[data-src]").forEach(img => {
    observer.observe(img);
  });
}

// --------------------------
// PRELOAD
// --------------------------
function preloadNextPage(filtered) {
  const start = currentPage * perPage;
  const nextSet = filtered.slice(start, start + perPage);

  nextSet.forEach(item => {
    const img = new Image();
    img.src = getImagePath(item);
  });
}

// --------------------------
// MAIN GALLERY
// --------------------------
function generateGallery() {
  const gallery = document.querySelector(".gallery");
  gallery.innerHTML = "";
  galleryImages = [];

  const allItems = getCurrentItems();
  generateTabs(allItems);

  let filtered = allItems.slice();

  if (currentMonth !== "all") {
    filtered = filtered.filter(item => getMonthFromItem(item) === currentMonth);
  }

  filtered.sort(compareItems);

  const start = (currentPage - 1) * perPage;
  const pageItems = filtered.slice(start, start + perPage);

  pageItems.forEach(item => {
    const div = document.createElement("div");
    div.className = "thumb";

    const img = document.createElement("img");
    img.dataset.src = getImagePath(item);
    img.alt = item.file;
    img.onclick = () => openLightbox(img);

    div.appendChild(img);

    const caption = document.createElement("div");
    caption.className = "caption";
    caption.innerText = getCaption(item);
    div.appendChild(caption);

    // temporary debug link
    const link = document.createElement("a");
    link.href = getImagePath(item);
    link.innerText = "open";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.style.display = "block";
    link.style.fontSize = "10px";
    link.style.opacity = "0.6";
    div.appendChild(link);

    gallery.appendChild(div);
    galleryImages.push(img);
  });

  paginateGallery(filtered);
  setupLazyLoading();
  preloadNextPage(filtered);
}

// --------------------------
// PAGINATION
// --------------------------
function paginateGallery(filtered) {
  const container = document.querySelector(".pagination");
  container.innerHTML = "";

  const totalPages = Math.ceil(filtered.length / perPage);

  for (let i = 1; i <= totalPages; i++) {
    const a = document.createElement("a");
    a.innerText = i;
    a.href = "#";

    if (i === currentPage) {
      a.classList.add("active");
    }

    a.onclick = (e) => {
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
function openLightbox(imgElement) {
  currentIndex = galleryImages.indexOf(imgElement);

  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");

  lightbox.style.display = "flex";
  lightboxImg.style.opacity = 0;

  setTimeout(() => {
    lightboxImg.src = imgElement.src || imgElement.dataset.src;
    lightboxImg.style.opacity = 1;
  }, 200);
}

function changeImage(newIndex) {
  if (!galleryImages.length) return;

  const img = document.getElementById("lightbox-img");
  img.style.opacity = 0;

  setTimeout(() => {
    currentIndex = newIndex;
    const target = galleryImages[currentIndex];

    img.src = target.src || target.dataset.src;
    img.style.opacity = 1;
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
document.addEventListener("keydown", (e) => {
  const lightbox = document.getElementById("lightbox");

  if (lightbox.style.display === "flex") {
    if (e.key === "ArrowRight") showNext();
    if (e.key === "ArrowLeft") showPrev();
    if (e.key === "Escape") lightbox.style.display = "none";
  }
});

// --------------------------
// LOAD DATA
// --------------------------
async function loadGalleryData() {
  loadFallbackData();

  try {
    const response = await fetch("gallery.json", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    galleryData.figures = normalizeCategory(
      Array.isArray(data.figures) ? data.figures : CATEGORY_CONFIG.figures.fallback
    );

    galleryData.hands = normalizeCategory(
      Array.isArray(data.hands) ? data.hands : CATEGORY_CONFIG.hands.fallback
    );

    galleryData.general = normalizeCategory(
      Array.isArray(data.general) ? data.general : CATEGORY_CONFIG.general.fallback
    );
  } catch (err) {
    console.warn("Using fallback gallery data:", err);
  }

  generateGallery();
}

// --------------------------
window.onload = loadGalleryData;