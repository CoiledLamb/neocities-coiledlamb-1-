/* ==============================================
   THE LONG HAUL — cargo log render (v0.0.9.7)

   Renders the cargo log body inside the shared dispatch
   panel. Tab toggle and panel chrome live in render/log.js
   (panel owner). This module writes into #cargoLogEl and
   exposes note* state mutators called from packages.js +
   packages-delivery.js (and v0.0.9.8 cooking later).

   Card builder reads:
     - ITEM_INDEX[label]               metadata (wantedBy via NPC_DEFS)
     - S.cargoLog.items[label]         per-save state
     - CARGO_LORE[label]               lore text (gated by state)
     - PLANTS[id]                      plant metadata
     - S.cargoLog.plants[id]           per-save state

   States per item:    undiscovered \u2192 found \u2192 delivered.
   States per plant:   undiscovered \u2192 found, plus two
                       independent reveal flags (triggerRevealed,
                       conditionalRevealed) flipped by cooking.

   v0.0.9.7 ships the skeleton: state, hooks, basic card list.
   Card visual polish + click-to-expand land later as lore
   density warrants.
   ============================================== */
'use strict';

import { S }              from '../state.js?v=097-0-1';
import { NPC_DEFS }       from '../data/npc-defs.js?v=097-0-1';
import { CARGO_LORE }     from '../data/cargo-lore.js?v=097-0-1';
import { PLANTS }         from '../data/plants.js?v=097-0-1';
import { buildCargoIndex } from '../data/cargo-index.js?v=097-0-1';

const ITEM_INDEX = buildCargoIndex();

// ----- state mutators -----

function ensureItemEntry(label) {
  if (!S.cargoLog.items[label]) {
    S.cargoLog.items[label] = {
      state:           'undiscovered',
      foundCount:      0,
      deliveredCount:  0,
      lastTouchedAt:   0,
    };
  }
  return S.cargoLog.items[label];
}

export function noteFound(label) {
  if (!ITEM_INDEX[label]) return;
  const e = ensureItemEntry(label);
  if (e.state === 'undiscovered') e.state = 'found';
  e.foundCount++;
  e.lastTouchedAt = S.ticks;
}

export function noteDelivered(label) {
  if (!ITEM_INDEX[label]) return;
  const e = ensureItemEntry(label);
  e.state = 'delivered';
  e.deliveredCount++;
  e.lastTouchedAt = S.ticks;
}

function ensurePlantEntry(id) {
  if (!S.cargoLog.plants[id]) {
    S.cargoLog.plants[id] = {
      state:               'undiscovered',
      foundCount:          0,
      triggerRevealed:     false,
      conditionalRevealed: false,
      lastTouchedAt:       0,
    };
  }
  return S.cargoLog.plants[id];
}

export function notePlantFound(id) {
  if (!PLANTS[id]) return;
  const e = ensurePlantEntry(id);
  if (e.state === 'undiscovered') e.state = 'found';
  e.foundCount++;
  e.lastTouchedAt = S.ticks;
}

export function notePlantCookedRole(id, role) {
  if (!PLANTS[id]) return;
  const e = ensurePlantEntry(id);
  if (role === 'trigger')     e.triggerRevealed     = true;
  if (role === 'conditional') e.conditionalRevealed = true;
  e.lastTouchedAt = S.ticks;
}

// ----- filters (session-only UI state) -----
//
// Filters are not persisted — they're a browse-time view, not save state.
// `hideUndiscovered` collapses the `???` placeholders to show only what
// the player has touched. `searchQuery` matches against the label string
// (items) or plant name (plants), case-insensitive substring.

const filters = {
  hideUndiscovered: false,
  hideCargo:        false,
  sortMode:         'alpha',  // 'alpha' | 'recent'
  searchQuery:      '',
};

export function setHideUndiscovered(on) {
  filters.hideUndiscovered = !!on;
  renderCargoLog();
}

export function setHideCargo(on) {
  filters.hideCargo = !!on;
  renderCargoLog();
}

export function setSortMode(mode) {
  filters.sortMode = (mode === 'recent') ? 'recent' : 'alpha';
  renderCargoLog();
}

export function setSearchQuery(q) {
  filters.searchQuery = (q || '').toLowerCase();
  renderCargoLog();
}

function sortLabels(labels, getStateForKey) {
  const arr = labels.slice();
  if (filters.sortMode === 'recent') {
    return arr.sort((a, b) => {
      const ta = (getStateForKey(a) && getStateForKey(a).lastTouchedAt) || 0;
      const tb = (getStateForKey(b) && getStateForKey(b).lastTouchedAt) || 0;
      if (tb !== ta) return tb - ta;  // recent first
      return a.localeCompare(b);       // alphabetical tiebreak (covers all-untouched)
    });
  }
  return arr.sort();
}

function passesItemFilter(label) {
  if (filters.hideUndiscovered) {
    const st = S.cargoLog.items[label];
    if (!st || st.state === 'undiscovered') return false;
  }
  if (filters.searchQuery && !label.toLowerCase().includes(filters.searchQuery)) {
    return false;
  }
  return true;
}

function passesPlantFilter(id) {
  const meta = PLANTS[id];
  if (filters.hideUndiscovered) {
    const st = S.cargoLog.plants[id];
    if (!st || st.state === 'undiscovered') return false;
  }
  if (filters.searchQuery) {
    const name = meta && meta.name ? meta.name.toLowerCase() : id.toLowerCase();
    if (!name.includes(filters.searchQuery)) return false;
  }
  return true;
}

// ----- render -----

function destLabels(destIds) {
  if (!destIds || destIds.length === 0) return '\u2014';
  return destIds
    .map(d => NPC_DEFS[d] ? NPC_DEFS[d].callsign : d)
    .join(', ');
}

function itemCardHtml(label) {
  const meta = ITEM_INDEX[label];
  const st   = S.cargoLog.items[label] || { state: 'undiscovered', foundCount: 0, deliveredCount: 0 };
  const undiscovered = st.state === 'undiscovered';
  const delivered    = st.state === 'delivered';
  const name = undiscovered ? '???' : label;
  const want = undiscovered ? '???' : destLabels(meta.dests);
  const lore = (delivered && CARGO_LORE[label]) ? CARGO_LORE[label] : '???';
  return `
    <div class="cargo-card cargo-card-${st.state}">
      <div class="cargo-card-name">${name}</div>
      <div class="cargo-card-meta">wanted by: ${want}</div>
      <div class="cargo-card-stats">found ${st.foundCount} \u00b7 delivered ${st.deliveredCount}</div>
      <div class="cargo-card-lore">${lore}</div>
    </div>`;
}

function plantCardHtml(id) {
  const meta = PLANTS[id];
  const st   = S.cargoLog.plants[id] || { state: 'undiscovered', foundCount: 0, triggerRevealed: false, conditionalRevealed: false };
  const undiscovered = st.state === 'undiscovered';
  const name        = undiscovered ? '???' : meta.name;
  const biome       = undiscovered ? '???' : (meta.biome || []).join(', ');
  const lore        = undiscovered ? '???' : meta.lore;
  const trigger     = st.triggerRevealed     ? meta.trigger     : '???';
  const conditional = st.conditionalRevealed ? meta.conditional : '???';
  return `
    <div class="cargo-card cargo-card-${st.state}">
      <div class="cargo-card-name">${name}</div>
      <div class="cargo-card-meta">biome: ${biome}</div>
      <div class="cargo-card-stats">found ${st.foundCount}</div>
      <div class="cargo-card-lore">${lore}</div>
      <div class="cargo-card-cook">trigger: ${trigger} \u00b7 conditional: ${conditional}</div>
    </div>`;
}

export function renderCargoLog() {
  const el = S._transient.els.cargoLogEl;
  if (!el) return;
  const itemLabels = sortLabels(
    Object.keys(ITEM_INDEX).filter(passesItemFilter),
    (label) => S.cargoLog.items[label],
  );
  const plantIds = sortLabels(
    Object.keys(PLANTS).filter(passesPlantFilter),
    (id) => S.cargoLog.plants[id],
  );
  const itemSectionHtml = filters.hideCargo
    ? ''
    : `<div class="cargo-section">${
        itemLabels.length === 0
          ? '<div class="cargo-empty">// nothing matches</div>'
          : `<div class="cargo-cards">${itemLabels.map(itemCardHtml).join('')}</div>`
      }</div>`;
  const plantSectionHtml = `<div class="cargo-section">
      <div class="cargo-section-title">// plants</div>
      ${plantIds.length === 0
        ? '<div class="cargo-empty">// plants land in v0.0.9.8</div>'
        : `<div class="cargo-cards">${plantIds.map(plantCardHtml).join('')}</div>`}
    </div>`;
  el.innerHTML = itemSectionHtml + plantSectionHtml;
}
