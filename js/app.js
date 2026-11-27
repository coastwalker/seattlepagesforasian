/* ==========================================================================
   Seattle Asian Pages — Interactive Bilingual Catalog Engine (English | 中文)
   ========================================================================== */

import {
  ANCHOR_98074,
  ANCHOR_PRESETS,
  CATEGORIES,
  AREA_GROUPS,
  ORIGINS,
  ORIGIN_BADGE_ZH,
  CITY_ZH,
  COPY
} from './i18n.js';
import { PLACES } from './data/catalog.js';

/* ---------- Utility Helpers ---------- */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatNumber(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '0';
  return Number(n).toLocaleString('en-US');
}

function buildGoogleMapsSearchUrl(place) {
  if (place.mapsUrl) return place.mapsUrl;
  const q = `${place.name} ${place.address || ''} ${place.city || ''} WA`.trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function buildDirectionsFrom98074Url(place) {
  const dest = `${place.name}, ${place.address || place.city + ', WA'}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent('Sammamish, WA 98074')}&destination=${encodeURIComponent(dest)}`;
}

const CAT_COLORS = {
  restaurants: '#c13f20',
  stores: '#266853',
  bakeries: '#b86219',
  barbers: '#26658c',
  nanny: '#ab304c',
  remodel: '#26737a',
  wellness: '#327045'
};

const CAT_ICONS_TEXT = {
  en: { restaurants: '食', stores: '市', bakeries: '茶', barbers: '髮', nanny: '家', remodel: '築', wellness: '養' },
  zh: { restaurants: '食', stores: '市', bakeries: '茶', barbers: '发', nanny: '家', remodel: '筑', wellness: '养' }
};

/* ---------- Application State ---------- */
const urlParams = new URLSearchParams(window.location.search);
const initialLangParam = urlParams.get('lang');
const savedLang = localStorage.getItem('sap-lang');

const state = {
  lang: initialLangParam === 'zh' || initialLangParam === 'en' ? initialLangParam : (savedLang === 'zh' ? 'zh' : 'en'),
  theme: document.documentElement.getAttribute('data-theme') || 'light',
  query: '',
  category: 'all',
  anchorKey: '98074',
  gpsCoords: null,
  maxDistance: 50,
  area: 'all',
  origin: 'all',
  minRating: 0,
  sortBy: 'recommended',
  viewMode: 'cards', // 'cards' | 'table' | 'map'
  savedOnly: false,
  savedIds: new Set(JSON.parse(localStorage.getItem('sap-saved') || '[]')),
  activePlaceId: null
};

/* ---------- Bilingual Entity Field Getters ---------- */
function getPlaceTitleParts(place) {
  if (state.lang === 'zh') {
    const primary = place.nameZh || place.nativeName || place.name;
    const normPrimary = primary.toLowerCase();
    const normEn = (place.name || '').toLowerCase();
    // Show English storefront name alongside if not already embedded in nameZh
    const baseEnBrand = normEn.split(/[\s(–-]/)[0];
    const alreadyHasEn = baseEnBrand.length >= 3 && normPrimary.includes(baseEnBrand);
    const secondary = !alreadyHasEn && primary !== place.name ? place.name : '';
    return { primary, secondary };
  }
  return {
    primary: place.name,
    secondary: place.nativeName || ''
  };
}

function getPlaceSubcategory(place) {
  return state.lang === 'zh' ? (place.subcategoryZh || place.subcategory) : place.subcategory;
}

function getPlaceOriginBadge(place) {
  if (state.lang === 'zh') {
    return ORIGIN_BADGE_ZH[place.origin] || place.origin;
  }
  return place.origin;
}

function getPlaceCityDisplay(place) {
  if (state.lang === 'zh') {
    const zhCity = CITY_ZH[place.city] || place.city;
    return `${zhCity} (${place.city})`;
  }
  return `${place.city}, WA`;
}

function getPlaceSummary(place) {
  return state.lang === 'zh' ? (place.reviewSummaryZh || place.reviewSummary) : place.reviewSummary;
}

function getPlaceHighlights(place) {
  if (state.lang === 'zh' && Array.isArray(place.highlightsZh) && place.highlightsZh.length > 0) {
    return place.highlightsZh;
  }
  return place.highlights || [];
}

function getPlaceAddress(place) {
  if (state.lang === 'zh') {
    return place.addressZh || place.address || `${CITY_ZH[place.city] || place.city}, WA ${place.zip || ''}`;
  }
  return place.address || `${place.city}, WA ${place.zip || ''}`;
}

function getPlaceHours(place) {
  if (!place.hours && !place.hoursZh) return '';
  return state.lang === 'zh' ? (place.hoursZh || place.hours) : place.hours;
}

function formatDistanceBadgeText(distMiles) {
  if (state.lang === 'zh') {
    if (state.anchorKey === '98074') return `距 98074 约 ${distMiles} 英里`;
    if (state.anchorKey === 'gps') return `距您约 ${distMiles} 英里`;
    return `距 ${state.anchorKey} 约 ${distMiles} 英里`;
  }
  const ref = state.anchorKey === '98074' ? 'from 98074' : (state.anchorKey === 'gps' ? 'from you' : `from ${state.anchorKey}`);
  return `${distMiles} mi ${ref}`;
}

/* ---------- Enrich Dataset with 98074 Distances & Bilingual Search Index ---------- */
const enrichedPlaces = PLACES.map((p) => {
  const d98074 = haversineMiles(ANCHOR_98074.lat, ANCHOR_98074.lng, p.lat, p.lng);
  const ratingVal = typeof p.googleRating === 'number' ? p.googleRating : 0;
  const reviewsVal = typeof p.googleReviewCount === 'number' ? p.googleReviewCount : 0;
  const recScore =
    (ratingVal > 0 ? ratingVal * 18 : 72) +
    Math.log10(reviewsVal + 12) * 11 -
    Math.min(d98074, 48) * 0.22 +
    (p.featured ? 5 : 0);

  const searchHaystack = [
    p.name,
    p.nativeName,
    p.nameZh,
    p.category,
    p.subcategory,
    p.subcategoryZh,
    p.origin,
    ORIGIN_BADGE_ZH[p.origin],
    p.city,
    CITY_ZH[p.city],
    p.zip,
    p.address,
    p.addressZh,
    p.reviewSummary,
    p.reviewSummaryZh,
    ...(p.highlights || []),
    ...(p.highlightsZh || []),
    ...(p.keywords || [])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return {
    ...p,
    dist98074: Number(d98074.toFixed(1)),
    distAnchor: Number(d98074.toFixed(1)),
    recScore,
    searchHaystack
  };
}).filter((p) => p.dist98074 <= 50.0);

/* ---------- Leaflet Map Controller ---------- */
let mapInstance = null;
let tileLayer = null;
let markersLayer = null;
let radiusCircle = null;
let anchorMarker = null;

function refreshAnchorMarkerLanguage() {
  if (!mapInstance || typeof window.L === 'undefined') return;
  const L = window.L;
  const copy = COPY[state.lang];
  if (anchorMarker) {
    mapInstance.removeLayer(anchorMarker);
  }
  const homeIcon = L.divIcon({
    className: '',
    html: `<div style="background:#1c2530;color:#fff;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:800;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35);white-space:nowrap;">${escapeHtml(copy.mapAnchorPin)}</div>`,
    iconSize: [96, 24],
    iconAnchor: [48, 12]
  });
  anchorMarker = L.marker([ANCHOR_98074.lat, ANCHOR_98074.lng], { icon: homeIcon })
    .bindPopup(copy.mapAnchorPopup)
    .addTo(mapInstance);
}

function ensureMapInitialized() {
  if (mapInstance || typeof window.L === 'undefined') return;
  const L = window.L;
  mapInstance = L.map('leaflet-map', {
    center: [47.615, -122.18],
    zoom: 10,
    scrollWheelZoom: true
  });

  updateMapTileTheme();
  markersLayer = L.layerGroup().addTo(mapInstance);

  radiusCircle = L.circle([ANCHOR_98074.lat, ANCHOR_98074.lng], {
    radius: 80467.2,
    color: '#266853',
    weight: 1.5,
    dashArray: '6 6',
    fillColor: '#266853',
    fillOpacity: 0.03
  }).addTo(mapInstance);

  refreshAnchorMarkerLanguage();
}

function updateMapTileTheme() {
  if (!mapInstance || typeof window.L === 'undefined') return;
  if (tileLayer) return;
  const L = window.L;
  tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(mapInstance);
}

function renderMapMarkers(filtered) {
  if (state.viewMode !== 'map') return;
  ensureMapInitialized();
  if (!mapInstance || !markersLayer) return;

  refreshAnchorMarkerLanguage();

  const L = window.L;
  const copy = COPY[state.lang];
  markersLayer.clearLayers();

  const bounds = [];
  filtered.forEach((place) => {
    if (typeof place.lat !== 'number' || typeof place.lng !== 'number') return;
    const color = CAT_COLORS[place.category] || '#c13f20';
    const glyph = (CAT_ICONS_TEXT[state.lang] || CAT_ICONS_TEXT.en)[place.category] || '東';
    const icon = L.divIcon({
      className: '',
      html: `<div class="sap-map-pin" style="background:${color};"><span>${glyph}</span></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -28]
    });

    const { primary, secondary } = getPlaceTitleParts(place);
    const subcat = getPlaceSubcategory(place);
    const cityDisp = state.lang === 'zh' ? (CITY_ZH[place.city] || place.city) : place.city;
    const distLine = state.lang === 'zh' ? `距 98074 约 ${place.dist98074} 英里` : `${place.dist98074} mi from 98074`;

    const ratingLine = place.googleRating
      ? `<div style="font-size:12.5px;font-weight:700;margin:3px 0;">★ ${place.googleRating.toFixed(1)} <span style="font-weight:500;opacity:0.78;">(${formatNumber(place.googleReviewCount)} ${escapeHtml(copy.googleReviewsLabel)})</span></div>`
      : '';

    const popupHtml = `
      <div style="min-width:210px;font-family:var(--font-sans);">
        <div style="font-size:11px;font-weight:700;opacity:0.7;text-transform:uppercase;">${escapeHtml(subcat)} · ${escapeHtml(cityDisp)}</div>
        <div style="font-size:14.5px;font-weight:750;margin-top:2px;">${escapeHtml(primary)} ${secondary ? `<span style="opacity:0.7;font-weight:500;">${escapeHtml(secondary)}</span>` : ''}</div>
        ${ratingLine}
        <div style="font-size:12px;opacity:0.82;margin-bottom:7px;">${escapeHtml(distLine)}</div>
        <div style="display:flex;gap:6px;">
          <button type="button" data-popup-detail="${escapeHtml(place.id)}" style="padding:4px 9px;border-radius:6px;background:var(--accent-primary);color:#fff;font-size:12px;font-weight:700;border:none;cursor:pointer;">${escapeHtml(copy.detailsBtn)}</button>
          <a href="${escapeHtml(buildGoogleMapsSearchUrl(place))}" target="_blank" rel="noopener noreferrer" style="padding:4px 9px;border-radius:6px;border:1px solid var(--border-default);font-size:12px;font-weight:600;text-decoration:none;color:inherit;">${escapeHtml(copy.openGoogleMaps)} ↗</a>
        </div>
      </div>
    `;

    const marker = L.marker([place.lat, place.lng], { icon }).bindPopup(popupHtml);
    marker.on('popupopen', () => {
      const btn = document.querySelector(`[data-popup-detail="${place.id}"]`);
      if (btn) {
        btn.addEventListener('click', () => openDetailDrawer(place.id));
      }
    });
    markersLayer.addLayer(marker);
    bounds.push([place.lat, place.lng]);
  });

  setTimeout(() => {
    mapInstance.invalidateSize();
    if (bounds.length > 1) {
      mapInstance.fitBounds(bounds, { padding: [36, 36], maxZoom: 13 });
    } else if (bounds.length === 1) {
      mapInstance.setView(bounds[0], 13);
    }
  }, 80);
}

/* ---------- Anchor Distance Re-computation ---------- */
function getCurrentAnchorCoords() {
  if (state.anchorKey === 'gps' && state.gpsCoords) {
    return state.gpsCoords;
  }
  const preset = ANCHOR_PRESETS[state.anchorKey] || ANCHOR_PRESETS['98074'];
  return { lat: preset.lat || ANCHOR_98074.lat, lng: preset.lng || ANCHOR_98074.lng };
}

function refreshAnchorDistances() {
  const anchor = getCurrentAnchorCoords();
  enrichedPlaces.forEach((p) => {
    const d = haversineMiles(anchor.lat, anchor.lng, p.lat, p.lng);
    p.distAnchor = Number(d.toFixed(1));
  });
}

/* ---------- Filtering & Sorting ---------- */
function getFilteredPlaces() {
  const tokens = state.query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const areaObj = AREA_GROUPS.find((a) => a.id === state.area);

  const filtered = enrichedPlaces.filter((p) => {
    if (state.savedOnly && !state.savedIds.has(p.id)) return false;
    if (state.category !== 'all' && p.category !== state.category) return false;
    if (p.distAnchor > state.maxDistance) return false;

    if (areaObj && areaObj.id !== 'all') {
      const cityMatch = areaObj.cities.some((c) => c.toLowerCase() === (p.city || '').toLowerCase());
      if (!cityMatch) return false;
    }

    if (state.origin !== 'all') {
      const pOrig = (p.origin || '').toLowerCase();
      if (state.origin === 'Pan-Asian') {
        if (!pOrig.includes('pan-asian') && !pOrig.includes('pan-east asian')) return false;
      } else if (!pOrig.includes(state.origin.toLowerCase())) {
        return false;
      }
    }

    if (state.minRating > 0) {
      if (typeof p.googleRating !== 'number' || p.googleRating < state.minRating) return false;
    }

    if (tokens.length > 0) {
      for (const tok of tokens) {
        if (!p.searchHaystack.includes(tok)) return false;
      }
    }

    return true;
  });

  filtered.sort((a, b) => {
    if (state.sortBy === 'rating') {
      const rDiff = (b.googleRating || 0) - (a.googleRating || 0);
      if (Math.abs(rDiff) > 0.001) return rDiff;
      return (b.googleReviewCount || 0) - (a.googleReviewCount || 0);
    }
    if (state.sortBy === 'reviews') {
      return (b.googleReviewCount || 0) - (a.googleReviewCount || 0);
    }
    if (state.sortBy === 'nearest') {
      return a.distAnchor - b.distAnchor;
    }
    return b.recScore - a.recScore;
  });

  return filtered;
}

/* ---------- Rendering Functions ---------- */
function getCategoryLabel(catId) {
  const found = CATEGORIES.find((c) => c.id === catId);
  if (!found) return catId;
  return state.lang === 'zh' ? found.zh : found.en;
}

function renderMastheadMetrics() {
  const totalEl = document.getElementById('metric-total-places');
  const avgEl = document.getElementById('metric-avg-rating');
  if (totalEl) totalEl.textContent = `${enrichedPlaces.length}`;

  const rated = enrichedPlaces.filter((p) => typeof p.googleRating === 'number' && p.googleRating > 0);
  if (avgEl && rated.length > 0) {
    const avg = rated.reduce((acc, p) => acc + p.googleRating, 0) / rated.length;
    avgEl.textContent = `${avg.toFixed(2)}★`;
  }
}

function renderSelectOptions() {
  const anchorSelects = [
    document.getElementById('select-anchor'),
    document.getElementById('mobile-select-anchor')
  ];
  anchorSelects.forEach((sel) => {
    if (!sel) return;
    sel.innerHTML = Object.entries(ANCHOR_PRESETS)
      .map(([k, v]) => `<option value="${k}" ${state.anchorKey === k ? 'selected' : ''}>${escapeHtml(state.lang === 'zh' ? v.zh : v.label)}</option>`)
      .join('');
  });

  const areaSelects = [
    document.getElementById('select-area'),
    document.getElementById('mobile-select-area')
  ];
  areaSelects.forEach((sel) => {
    if (!sel) return;
    sel.innerHTML = AREA_GROUPS.map(
      (a) => `<option value="${a.id}" ${state.area === a.id ? 'selected' : ''}>${escapeHtml(state.lang === 'zh' ? a.zh : a.en)}</option>`
    ).join('');
  });

  const originSelects = [
    document.getElementById('select-origin'),
    document.getElementById('mobile-select-origin')
  ];
  originSelects.forEach((sel) => {
    if (!sel) return;
    sel.innerHTML = ORIGINS.map(
      (o) => `<option value="${o.id}" ${state.origin === o.id ? 'selected' : ''}>${escapeHtml(state.lang === 'zh' ? o.zh : o.en)}</option>`
    ).join('');
  });

  // Suggest Modal category options
  const sugCat = document.getElementById('sug-category');
  if (sugCat) {
    sugCat.innerHTML = CATEGORIES.filter((c) => c.id !== 'all')
      .map((c) => `<option value="${escapeHtml(c.en)}">${escapeHtml(state.lang === 'zh' ? c.zh : c.en)}</option>`)
      .join('');
  }
}

function renderCategoryRail() {
  const rail = document.getElementById('category-rail');
  if (!rail) return;

  const counts = { all: enrichedPlaces.length };
  enrichedPlaces.forEach((p) => {
    counts[p.category] = (counts[p.category] || 0) + 1;
  });

  rail.innerHTML = CATEGORIES.map((cat) => {
    const selected = state.category === cat.id;
    const label = state.lang === 'zh' ? cat.zh : cat.en;
    const count = counts[cat.id] || 0;
    return `
      <button
        type="button"
        role="tab"
        class="cat-tab"
        data-cat-id="${cat.id}"
        aria-selected="${selected}"
        id="cat-tab-${cat.id}"
      >
        <span class="cat-dot" data-cat="${cat.id}" ${cat.id === 'all' ? 'style="background:var(--accent-primary)"' : ''}></span>
        <span>${escapeHtml(label)}</span>
        <span class="cat-tab-count">${count}</span>
      </button>
    `;
  }).join('');
}

function renderCardHtml(place, copy) {
  const isSaved = state.savedIds.has(place.id);
  const { primary, secondary } = getPlaceTitleParts(place);
  const subcat = getPlaceSubcategory(place);
  const originBadge = getPlaceOriginBadge(place);
  const cityDisp = getPlaceCityDisplay(place);
  const distText = formatDistanceBadgeText(place.distAnchor);
  const summaryText = getPlaceSummary(place);
  const highlightsList = getPlaceHighlights(place);

  const hasRating = typeof place.googleRating === 'number' && place.googleRating > 0;
  const starPct = hasRating ? Math.min(100, Math.max(0, (place.googleRating / 5) * 100)).toFixed(1) : 0;

  const ratingHeaderHtml = hasRating
    ? `
      <div class="google-rating-header">
        <div class="google-score-group">
          <span class="google-score-num">${place.googleRating.toFixed(1)}</span>
          <span class="stars-meter" style="--star-pct:${starPct}%" aria-label="${place.googleRating} / 5">
            <span class="stars-meter-fill"></span>
          </span>
          <span class="google-review-count">(${formatNumber(place.googleReviewCount)} ${escapeHtml(copy.googleReviewsLabel)})</span>
        </div>
        <span class="google-maps-source-tag">${escapeHtml(copy.googleMapsSource)}</span>
      </div>
    `
    : `
      <div class="google-rating-header">
        <span class="google-review-count">${escapeHtml(copy.noGoogleRating)}</span>
      </div>
    `;

  const highlightsHtml = highlightsList
    .slice(0, 3)
    .map((h) => `<span class="highlight-chip">${escapeHtml(h)}</span>`)
    .join('');

  const mapsUrl = buildGoogleMapsSearchUrl(place);
  const distTitle = state.lang === 'zh'
    ? `距萨马米什 98074 约 ${place.dist98074} 英里`
    : `${place.dist98074} miles from Sammamish 98074`;

  const saveLabel = state.lang === 'zh'
    ? (isSaved ? '取消收藏' : '加入收藏')
    : (isSaved ? 'Remove from saved' : 'Save to shortlist');

  return `
    <article class="place-card" data-place-id="${escapeHtml(place.id)}">
      <div>
        <div class="card-top-meta">
          <span class="card-cat-pill">
            <span class="cat-dot" data-cat="${escapeHtml(place.category)}"></span>
            <span>${escapeHtml(getCategoryLabel(place.category))} · ${escapeHtml(subcat)}</span>
          </span>
          <div class="card-top-right">
            <span class="origin-tag">${escapeHtml(originBadge)}</span>
            <button
              type="button"
              class="bookmark-btn"
              data-bookmark-id="${escapeHtml(place.id)}"
              aria-pressed="${isSaved}"
              aria-label="${escapeHtml(saveLabel)}"
              title="${escapeHtml(saveLabel)}"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
                <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path>
              </svg>
            </button>
          </div>
        </div>

        <button type="button" class="card-title-btn" data-open-detail="${escapeHtml(place.id)}">
          <h3 class="card-title">
            ${escapeHtml(primary)}
            ${secondary ? `<span class="card-native-name">${escapeHtml(secondary)}</span>` : ''}
          </h3>
        </button>

        <div class="card-location-line">
          <span>${escapeHtml(cityDisp)}</span>
          <span class="distance-badge" title="${escapeHtml(distTitle)}">${escapeHtml(distText)}</span>
          ${place.priceLevel ? `<span class="price-tier">${escapeHtml(place.priceLevel)}</span>` : ''}
        </div>

        <div class="google-review-panel">
          ${ratingHeaderHtml}
          <p class="google-summary-snippet">${escapeHtml(summaryText)}</p>
        </div>

        ${highlightsHtml ? `<div class="card-highlights">${highlightsHtml}</div>` : ''}
      </div>

      <div class="card-actions">
        <div class="card-action-links">
          <a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer" class="card-btn card-btn-primary">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>${escapeHtml(copy.openGoogleMaps)}</span>
          </a>
          ${place.phone ? `<a href="tel:${escapeHtml(place.phone.replace(/[^\d+]/g, ''))}" class="card-btn">${escapeHtml(copy.callBtn)}</a>` : ''}
        </div>
        <button type="button" class="card-btn" data-open-detail="${escapeHtml(place.id)}">
          <span>${escapeHtml(copy.detailsBtn)}</span>
        </button>
      </div>
    </article>
  `;
}

function renderTableViewHtml(filtered, copy) {
  const rows = filtered
    .map((p) => {
      const { primary, secondary } = getPlaceTitleParts(p);
      const subcat = getPlaceSubcategory(p);
      const originBadge = getPlaceOriginBadge(p);
      const cityShort = state.lang === 'zh' ? (CITY_ZH[p.city] || p.city) : p.city;
      const distShort = state.lang === 'zh' ? `${p.distAnchor} 英里` : `${p.distAnchor} mi`;
      const addrText = getPlaceAddress(p);
      const summaryText = getPlaceSummary(p);

      const hasRating = typeof p.googleRating === 'number' && p.googleRating > 0;
      const ratingCell = hasRating
        ? `<strong class="tabular-nums" style="color:var(--star-gold);">★ ${p.googleRating.toFixed(1)}</strong> <span class="tabular-nums" style="font-size:0.78rem;color:var(--text-tertiary);">(${formatNumber(p.googleReviewCount)})</span>`
        : `<span style="font-size:0.78rem;color:var(--text-tertiary);">${escapeHtml(copy.verifiedServiceShort)}</span>`;

      return `
        <tr data-open-detail="${escapeHtml(p.id)}" tabindex="0" role="button" aria-label="${escapeHtml(primary)}">
          <td>
            <div style="font-weight:700;color:var(--text-primary);">${escapeHtml(primary)} ${secondary ? `<span style="font-weight:500;color:var(--text-tertiary);margin-left:4px;">${escapeHtml(secondary)}</span>` : ''}</div>
            <div style="font-size:0.78rem;color:var(--text-tertiary);">${escapeHtml(addrText)}</div>
          </td>
          <td>
            <span class="card-cat-pill"><span class="cat-dot" data-cat="${escapeHtml(p.category)}"></span>${escapeHtml(subcat)}</span>
            <div style="font-size:0.75rem;color:var(--text-tertiary);margin-top:2px;">${escapeHtml(originBadge)} ${p.priceLevel ? `· ${escapeHtml(p.priceLevel)}` : ''}</div>
          </td>
          <td style="white-space:nowrap;">
            <div style="font-weight:600;">${escapeHtml(cityShort)}</div>
            <span class="distance-badge">${escapeHtml(distShort)}</span>
          </td>
          <td style="white-space:nowrap;">${ratingCell}</td>
          <td style="max-width:360px;font-size:0.82rem;color:var(--text-secondary);">${escapeHtml(summaryText)}</td>
          <td style="white-space:nowrap;" onclick="event.stopPropagation();">
            <a href="${escapeHtml(buildGoogleMapsSearchUrl(p))}" target="_blank" rel="noopener noreferrer" class="card-btn card-btn-primary">${escapeHtml(copy.mapsShort)}</a>
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="index-table-wrap">
      <table class="index-table">
        <thead>
          <tr>
            <th>${escapeHtml(copy.thEntity)}</th>
            <th>${escapeHtml(copy.thCategory)}</th>
            <th>${escapeHtml(copy.thCityDist)}</th>
            <th>${escapeHtml(copy.thRating)}</th>
            <th>${escapeHtml(copy.thSummary)}</th>
            <th>${escapeHtml(copy.thMap)}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderStatusAndActivePills(filtered, copy) {
  const summaryEl = document.getElementById('results-summary-text');
  const pillsEl = document.getElementById('active-filters-list');
  const mobileBadge = document.getElementById('mobile-filter-count');

  if (summaryEl) {
    const savedPrefix = state.savedOnly ? `<strong style="color:var(--accent-primary);">${escapeHtml(copy.savedModeBanner)} · </strong>` : '';
    summaryEl.innerHTML = `${savedPrefix}${escapeHtml(copy.showingResults)} <strong class="tabular-nums">${filtered.length}</strong> ${escapeHtml(copy.ofTotal)} <strong class="tabular-nums">${enrichedPlaces.length}</strong> ${escapeHtml(copy.placesWithin)}`;
  }

  const activePills = [];
  if (state.query.trim()) {
    activePills.push({ label: `“${state.query.trim()}”`, clear: () => { state.query = ''; syncInputs(); renderAll(); } });
  }
  if (state.maxDistance < 50) {
    const dLabel = state.lang === 'zh' ? `≤ ${state.maxDistance} 英里` : `≤ ${state.maxDistance} mi`;
    activePills.push({ label: dLabel, clear: () => { state.maxDistance = 50; syncInputs(); renderAll(); } });
  }
  if (state.area !== 'all') {
    const a = AREA_GROUPS.find((x) => x.id === state.area);
    activePills.push({ label: a ? (state.lang === 'zh' ? a.zh : a.en) : state.area, clear: () => { state.area = 'all'; syncInputs(); renderAll(); } });
  }
  if (state.origin !== 'all') {
    const o = ORIGINS.find((x) => x.id === state.origin);
    activePills.push({ label: o ? (state.lang === 'zh' ? o.zh : o.en) : state.origin, clear: () => { state.origin = 'all'; syncInputs(); renderAll(); } });
  }
  if (state.minRating > 0) {
    activePills.push({ label: `${state.minRating}+ ★`, clear: () => { state.minRating = 0; syncInputs(); renderAll(); } });
  }
  if (state.savedOnly) {
    activePills.push({ label: copy.savedBtn, clear: () => { state.savedOnly = false; syncInputs(); renderAll(); } });
  }

  if (mobileBadge) {
    mobileBadge.hidden = activePills.length === 0;
    mobileBadge.textContent = String(activePills.length);
  }

  if (!pillsEl) return;
  if (activePills.length === 0 && state.category === 'all') {
    pillsEl.innerHTML = '';
    return;
  }

  pillsEl.innerHTML =
    activePills
      .map((p, idx) => `<button type="button" class="active-filter-pill" data-clear-idx="${idx}">${escapeHtml(p.label)} <span aria-hidden="true">×</span></button>`)
      .join('') +
    `<button type="button" class="clear-all-btn" id="reset-all-filters-btn">${escapeHtml(copy.clearFilters)}</button>`;

  pillsEl.querySelectorAll('[data-clear-idx]').forEach((btn) => {
    const idx = Number(btn.getAttribute('data-clear-idx'));
    btn.addEventListener('click', () => activePills[idx]?.clear());
  });

  document.getElementById('reset-all-filters-btn')?.addEventListener('click', resetAllFilters);
}

function renderAll() {
  const copy = COPY[state.lang];
  refreshAnchorDistances();
  renderCategoryRail();

  const filtered = getFilteredPlaces();
  renderStatusAndActivePills(filtered, copy);

  const savedBadge = document.getElementById('saved-count-badge');
  const savedBtn = document.getElementById('saved-filter-btn');
  if (savedBadge) {
    savedBadge.hidden = state.savedIds.size === 0;
    savedBadge.textContent = String(state.savedIds.size);
  }
  if (savedBtn) {
    savedBtn.classList.toggle('active', state.savedOnly);
    savedBtn.setAttribute('aria-pressed', String(state.savedOnly));
  }

  const workspace = document.getElementById('catalog-workspace');
  const mapPanel = document.getElementById('map-panel');
  const container = document.getElementById('listings-container');

  if (workspace && mapPanel) {
    const isMap = state.viewMode === 'map';
    workspace.classList.toggle('map-mode', isMap);
    mapPanel.hidden = !isMap;
  }

  if (!container) return;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>${escapeHtml(copy.emptyTitle)}</h3>
        <p>${escapeHtml(copy.emptyDesc)}</p>
        <button type="button" class="card-btn card-btn-primary" id="empty-reset-btn" style="padding:0.55rem 1.15rem;">
          ${escapeHtml(copy.clearFilters)}
        </button>
      </div>
    `;
    document.getElementById('empty-reset-btn')?.addEventListener('click', resetAllFilters);
  } else if (state.viewMode === 'table') {
    container.innerHTML = renderTableViewHtml(filtered, copy);
  } else {
    container.innerHTML = `<div class="listings-grid">${filtered.map((p) => renderCardHtml(p, copy)).join('')}</div>`;
  }

  if (state.viewMode === 'map') {
    renderMapMarkers(filtered);
  }
}

/* ---------- Detail Drawer Logic ---------- */
let lastFocusedElement = null;

function openDetailDrawer(placeId, pushHash = true, keepFocus = false) {
  const place = enrichedPlaces.find((p) => p.id === placeId);
  if (!place) return;

  if (!keepFocus) {
    lastFocusedElement = document.activeElement;
  }
  state.activePlaceId = placeId;
  const copy = COPY[state.lang];
  const isSaved = state.savedIds.has(place.id);

  const { primary, secondary } = getPlaceTitleParts(place);
  const subcat = getPlaceSubcategory(place);
  const originBadge = getPlaceOriginBadge(place);
  const summaryText = getPlaceSummary(place);
  const highlightsList = getPlaceHighlights(place);
  const addressText = getPlaceAddress(place);
  const hoursText = getPlaceHours(place);

  const headerEl = document.getElementById('drawer-header-content');
  const bodyEl = document.getElementById('drawer-body');
  const footerEl = document.getElementById('drawer-footer');
  const drawer = document.getElementById('detail-drawer');
  const backdrop = document.getElementById('overlay-backdrop');

  const hasRating = typeof place.googleRating === 'number' && place.googleRating > 0;
  const starPct = hasRating ? Math.min(100, Math.max(0, (place.googleRating / 5) * 100)).toFixed(1) : 0;

  headerEl.innerHTML = `
    <div class="card-cat-pill" style="margin-bottom:0.35rem;">
      <span class="cat-dot" data-cat="${escapeHtml(place.category)}"></span>
      <span>${escapeHtml(getCategoryLabel(place.category))} · ${escapeHtml(subcat)}</span>
    </div>
    <h2 id="drawer-place-title" style="margin:0;font-family:var(--font-serif);font-size:1.45rem;line-height:1.2;">
      ${escapeHtml(primary)}
      ${secondary ? `<span style="display:block;font-family:var(--font-sans);font-size:0.98rem;font-weight:500;color:var(--text-tertiary);margin-top:0.22rem;">${escapeHtml(secondary)}</span>` : ''}
    </h2>
  `;

  const googleHeroHtml = hasRating
    ? `
      <div class="drawer-google-hero">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;margin-bottom:0.7rem;">
          <div style="display:flex;align-items:center;gap:0.75rem;">
            <span class="drawer-score-big tabular-nums">${place.googleRating.toFixed(1)}</span>
            <div>
              <div class="stars-meter" style="--star-pct:${starPct}%;font-size:1.05rem;">
                <span class="stars-meter-fill"></span>
              </div>
              <div style="font-size:0.82rem;font-weight:700;color:var(--text-secondary);margin-top:2px;">
                ${formatNumber(place.googleReviewCount)} ${escapeHtml(copy.googleReviewsLabel)}
              </div>
            </div>
          </div>
          <a href="${escapeHtml(buildGoogleMapsSearchUrl(place))}" target="_blank" rel="noopener noreferrer" class="card-btn">
            ${escapeHtml(copy.readOnGoogleMaps)}
          </a>
        </div>
        <div style="font-size:0.74rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-tertiary);margin-bottom:0.3rem;">
          ${escapeHtml(copy.googleSummaryHeading)}
        </div>
        <p style="margin:0;font-size:0.92rem;line-height:1.62;color:var(--text-primary);">
          ${escapeHtml(summaryText)}
        </p>
      </div>
    `
    : `
      <div class="drawer-google-hero">
        <div style="font-size:0.78rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-tertiary);margin-bottom:0.35rem;">
          ${escapeHtml(copy.noGoogleRating)}
        </div>
        <p style="margin:0;font-size:0.92rem;line-height:1.62;color:var(--text-primary);">
          ${escapeHtml(summaryText)}
        </p>
      </div>
    `;

  const estDriveMin = Math.max(4, Math.round(place.dist98074 * 1.65 + 4));
  const distBadgeDrawer = state.lang === 'zh'
    ? `距邮编 98074 约 ${place.dist98074} 英里`
    : `${place.dist98074} mi from ZIP 98074`;
  const driveEstDrawer = state.lang === 'zh'
    ? `（日常车程约 ${estDriveMin} 分钟）`
    : `(~${estDriveMin} min typical drive)`;

  bodyEl.innerHTML = `
    ${googleHeroHtml}

    ${
      highlightsList.length
        ? `<div style="margin-bottom:1.25rem;">
            <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-tertiary);margin-bottom:0.45rem;">${escapeHtml(copy.highlightsLabel)}</div>
            <div class="card-highlights" style="margin:0;">
              ${highlightsList.map((h) => `<span class="highlight-chip" style="font-size:0.8rem;padding:0.28rem 0.65rem;">${escapeHtml(h)}</span>`).join('')}
            </div>
          </div>`
        : ''
    }

    <div class="drawer-info-grid">
      <div class="drawer-info-row">
        <span class="drawer-info-label">${escapeHtml(copy.addressLabel)}</span>
        <div>
          <div style="font-weight:600;">${escapeHtml(addressText)}</div>
          <button type="button" id="drawer-copy-addr-btn" class="clear-all-btn" style="padding:0;font-size:0.78rem;margin-top:0.2rem;">
            ${escapeHtml(copy.copyAddress)}
          </button>
        </div>
      </div>

      <div class="drawer-info-row">
        <span class="drawer-info-label">${escapeHtml(copy.distanceLabel)}</span>
        <div>
          <span class="distance-badge">${escapeHtml(distBadgeDrawer)}</span>
          <span style="font-size:0.82rem;color:var(--text-tertiary);margin-left:0.4rem;">${escapeHtml(driveEstDrawer)}</span>
        </div>
      </div>

      <div class="drawer-info-row">
        <span class="drawer-info-label">${escapeHtml(copy.originLabel)}</span>
        <div>${escapeHtml(originBadge)} · ${escapeHtml(subcat)} ${place.priceLevel ? `· <strong>${escapeHtml(place.priceLevel)}</strong>` : ''}</div>
      </div>

      ${
        hoursText
          ? `<div class="drawer-info-row">
              <span class="drawer-info-label">${escapeHtml(copy.hoursLabel)}</span>
              <div>${escapeHtml(hoursText)}</div>
            </div>`
          : ''
      }

      ${
        place.phone
          ? `<div class="drawer-info-row">
              <span class="drawer-info-label">${escapeHtml(copy.phoneLabel)}</span>
              <div><a href="tel:${escapeHtml(place.phone.replace(/[^\d+]/g, ''))}" style="color:var(--accent-primary);font-weight:700;">${escapeHtml(place.phone)}</a></div>
            </div>`
          : ''
      }

      ${
        place.website
          ? `<div class="drawer-info-row">
              <span class="drawer-info-label">${escapeHtml(copy.websiteLabel)}</span>
              <div><a href="${escapeHtml(place.website)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent-primary);font-weight:600;word-break:break-all;">${escapeHtml(place.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))} ↗</a></div>
            </div>`
          : ''
      }
    </div>
  `;

  footerEl.innerHTML = `
    <a href="${escapeHtml(buildGoogleMapsSearchUrl(place))}" target="_blank" rel="noopener noreferrer" class="drawer-cta drawer-cta-primary">
      ${escapeHtml(copy.openGoogleMaps)} ↗
    </a>
    <a href="${escapeHtml(buildDirectionsFrom98074Url(place))}" target="_blank" rel="noopener noreferrer" class="drawer-cta">
      ${escapeHtml(copy.directions98074)}
    </a>
    <button type="button" class="drawer-cta" id="drawer-bookmark-btn" style="flex:0 1 auto;">
      ${escapeHtml(isSaved ? copy.savedStateBtn : copy.saveActionBtn)}
    </button>
  `;

  document.getElementById('drawer-copy-addr-btn')?.addEventListener('click', () => {
    const addr = place.address || `${place.name}, ${place.city}, WA`;
    navigator.clipboard?.writeText(addr);
    showToast(copy.copiedToast);
  });

  document.getElementById('drawer-bookmark-btn')?.addEventListener('click', () => {
    toggleBookmark(place.id);
    openDetailDrawer(place.id, false, true);
  });

  closeModalsOnly();
  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden', 'false');
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  if (pushHash) {
    history.replaceState(null, '', `#place=${encodeURIComponent(place.id)}`);
  }

  if (!keepFocus) {
    document.getElementById('drawer-close-btn')?.focus();
  }
}

function closeModalsOnly() {
  document.getElementById('mobile-filter-sheet')?.classList.remove('open');
  document.getElementById('mobile-filter-sheet')?.setAttribute('aria-hidden', 'true');
  document.getElementById('suggest-modal')?.classList.remove('open');
  document.getElementById('suggest-modal')?.setAttribute('aria-hidden', 'true');
}

function closeAllOverlays() {
  const drawer = document.getElementById('detail-drawer');
  const backdrop = document.getElementById('overlay-backdrop');
  drawer?.classList.remove('open');
  drawer?.setAttribute('aria-hidden', 'true');
  closeModalsOnly();
  backdrop?.classList.remove('open');
  backdrop?.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';

  if (state.activePlaceId) {
    state.activePlaceId = null;
    if (window.location.hash.startsWith('#place=')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
    lastFocusedElement = null;
  }
}

/* ---------- Bookmarks, Theme & Complete Language Application ---------- */
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast-banner');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 2200);
}

function toggleBookmark(placeId) {
  const copy = COPY[state.lang];
  if (state.savedIds.has(placeId)) {
    state.savedIds.delete(placeId);
    showToast(copy.savedRemovedToast);
  } else {
    state.savedIds.add(placeId);
    showToast(copy.savedAddedToast);
  }
  localStorage.setItem('sap-saved', JSON.stringify([...state.savedIds]));
  renderAll();
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('sap-theme', theme);

  const sun = document.getElementById('theme-icon-sun');
  const moon = document.getElementById('theme-icon-moon');
  if (sun && moon) {
    sun.hidden = theme !== 'dark';
    moon.hidden = theme === 'dark';
  }

  const meta = document.getElementById('meta-theme-color');
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#11161c' : '#f8f5ef');
  }

  updateMapTileTheme();
}

function applyLanguage(lang) {
  state.lang = lang === 'zh' ? 'zh' : 'en';
  localStorage.setItem('sap-lang', state.lang);
  const c = COPY[state.lang];

  document.documentElement.setAttribute('lang', state.lang === 'zh' ? 'zh-CN' : 'en');
  document.title = c.pageTitle;

  // Update segmented English | 中文 buttons
  document.querySelectorAll('[data-lang-opt]').forEach((btn) => {
    const active = btn.getAttribute('data-lang-opt') === state.lang;
    btn.setAttribute('aria-pressed', String(active));
  });

  const textMap = {
    'ui-skip-link': c.skipLink,
    'ui-brand-title': c.brandTitle,
    'ui-brand-subtitle': c.brandSubtitle,
    'ui-saved-label': c.savedBtn,
    'ui-suggest-label': c.suggestBtn,
    'ui-hero-eyebrow': c.heroEyebrow,
    'ui-hero-title': c.heroTitle,
    'ui-hero-lead': c.heroLead,
    'ui-metric-places': c.metricPlaces,
    'ui-metric-categories': c.metricCategories,
    'ui-metric-radius': c.metricRadius,
    'ui-metric-avg': c.metricAvgRating,
    'ui-popular-label': c.popularLabel,
    'ui-quick-near': c.quickNear,
    'ui-quick-japanese': c.quickJapanese,
    'ui-quick-korean': c.quickKorean,
    'ui-quick-viet': c.quickViet,
    'ui-quick-thai': c.quickThai,
    'ui-quick-dimsum': c.quickDimSum,
    'ui-quick-stores': c.quickStores,
    'ui-quick-barbers': c.quickBarbers,
    'ui-quick-nanny': c.quickNanny,
    'ui-quick-remodel': c.quickRemodel,
    'ui-art-caption-left': c.artCaptionLeft,
    'ui-art-caption-right': c.artCaptionRight,
    'ui-label-anchor': c.filterAnchor,
    'ui-label-distance': c.filterDistance,
    'ui-label-area': c.filterArea,
    'ui-label-origin': c.filterOrigin,
    'ui-label-rating': c.filterRating,
    'ui-label-sort': c.filterSort,
    'opt-dist-all': c.distAll,
    'opt-dist-6': c.dist6,
    'opt-dist-12': c.dist12,
    'opt-dist-20': c.dist20,
    'opt-dist-35': c.dist35,
    'opt-rating-all': c.ratingAll,
    'opt-rating-40': c.rating40,
    'opt-rating-45': c.rating45,
    'opt-rating-47': c.rating47,
    'opt-sort-rec': c.sortRecommended,
    'opt-sort-rating': c.sortRating,
    'opt-sort-reviews': c.sortReviews,
    'opt-sort-nearest': c.sortNearest,
    'ui-view-cards': c.viewCards,
    'ui-view-table': c.viewTable,
    'ui-view-map': c.viewMap,
    'ui-mobile-filters-btn': c.mobileFiltersBtn,
    'ui-mobile-nearest-btn': c.mobileNearestBtn,
    'ui-back-to-top': c.backToTopLabel,
    // Mobile Filter Sheet
    'mobile-filter-title': c.mobileFilterTitle,
    'ui-m-anchor-label': c.mobileAnchorLabel,
    'ui-m-radius-label': c.mobileRadiusLabel,
    'm-dist-50': c.distAll,
    'm-dist-6': c.dist6,
    'm-dist-12': c.dist12,
    'm-dist-20': c.dist20,
    'm-dist-35': c.dist35,
    'ui-m-area-label': c.mobileAreaLabel,
    'ui-m-origin-label': c.mobileOriginLabel,
    'ui-m-rating-label': c.mobileRatingLabel,
    'm-rating-0': c.ratingShortAny,
    'ui-m-sort-label': c.mobileSortLabel,
    'm-opt-sort-rec': c.sortRecommended,
    'm-opt-sort-rating': c.sortRating,
    'm-opt-sort-reviews': c.sortReviews,
    'm-opt-sort-nearest': c.sortNearest,
    'mobile-reset-filters-btn': c.mobileResetBtn,
    'mobile-apply-filters-btn': c.mobileApplyBtn,
    // Footer
    'ui-footer-brand-title': c.brandTitle,
    'ui-footer-subtitle': c.footerSubtitle,
    'ui-footer-about-desc': c.footerAboutDesc,
    'ui-footer-hubs-heading': c.footerHubsHeading,
    'ui-footer-hubs-list': c.footerHubsList,
    'ui-footer-reviews-heading': c.footerReviewsHeading,
    'ui-footer-reviews-desc': c.footerReviewsDesc,
    'ui-footer-github-btn': c.footerGithubBtn,
    // Suggest Modal
    'suggest-modal-title': c.suggestTitle,
    'suggest-modal-subtitle': c.suggestSubtitle,
    'ui-sug-name-label': c.sugNameLabel,
    'ui-sug-cat-label': c.sugCatLabel,
    'ui-sug-city-label': c.sugCityLabel,
    'ui-sug-notes-label': c.sugNotesLabel,
    'ui-sug-submit-btn': c.sugSubmitBtn
  };

  Object.entries(textMap).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  });

  const searchInput = document.getElementById('global-search-input');
  if (searchInput) searchInput.placeholder = c.searchPlaceholder;

  const sugName = document.getElementById('sug-name');
  const sugCity = document.getElementById('sug-city');
  const sugNotes = document.getElementById('sug-maps');
  if (sugName) sugName.placeholder = c.sugNamePlaceholder;
  if (sugCity) sugCity.placeholder = c.sugCityPlaceholder;
  if (sugNotes) sugNotes.placeholder = c.sugNotesPlaceholder;

  document.querySelectorAll('.mobile-controls-bar [data-view="cards"]').forEach((el) => { el.textContent = c.viewCards; });
  document.querySelectorAll('.mobile-controls-bar [data-view="table"]').forEach((el) => { el.textContent = c.viewTable; });
  document.querySelectorAll('.mobile-controls-bar [data-view="map"]').forEach((el) => { el.textContent = c.viewMap; });

  renderSelectOptions();
  syncInputs();
  renderAll();

  if (state.activePlaceId) {
    openDetailDrawer(state.activePlaceId, false, true);
  }
}

function resetAllFilters() {
  state.query = '';
  state.category = 'all';
  state.maxDistance = 50;
  state.area = 'all';
  state.origin = 'all';
  state.minRating = 0;
  state.savedOnly = false;
  syncInputs();
  renderAll();
}

function syncInputs() {
  const searchInput = document.getElementById('global-search-input');
  const clearBtn = document.getElementById('search-clear-btn');
  const kbdHint = document.getElementById('search-kbd-hint');
  if (searchInput) searchInput.value = state.query;
  if (clearBtn) clearBtn.hidden = !state.query;
  if (kbdHint) kbdHint.style.display = state.query ? 'none' : '';

  const sDist = document.getElementById('select-distance');
  if (sDist) sDist.value = String(state.maxDistance);

  const sArea = document.getElementById('select-area');
  const mArea = document.getElementById('mobile-select-area');
  if (sArea) sArea.value = state.area;
  if (mArea) mArea.value = state.area;

  const sOrig = document.getElementById('select-origin');
  const mOrig = document.getElementById('mobile-select-origin');
  if (sOrig) sOrig.value = state.origin;
  if (mOrig) mOrig.value = state.origin;

  const sRate = document.getElementById('select-rating');
  if (sRate) sRate.value = String(state.minRating);

  const sSort = document.getElementById('select-sort');
  const mSort = document.getElementById('mobile-select-sort');
  if (sSort) sSort.value = state.sortBy;
  if (mSort) mSort.value = state.sortBy;

  const nearestBtn = document.getElementById('mobile-nearest-btn');
  if (nearestBtn) {
    const isNear = state.sortBy === 'nearest';
    nearestBtn.classList.toggle('active', isNear);
    nearestBtn.setAttribute('aria-pressed', String(isNear));
  }

  document.querySelectorAll('[data-m-dist]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(Number(btn.getAttribute('data-m-dist')) === state.maxDistance));
  });
  document.querySelectorAll('[data-m-rating]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(Number(btn.getAttribute('data-m-rating')) === state.minRating));
  });

  document.querySelectorAll('[data-view]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.getAttribute('data-view') === state.viewMode));
  });

  // Highlight active Quick Jump chip
  document.querySelectorAll('.quick-chip').forEach((chip) => {
    const qCat = chip.getAttribute('data-quick-cat');
    const qDist = chip.getAttribute('data-quick-dist');
    const qQuery = chip.getAttribute('data-quick-query');
    const qOrigin = chip.getAttribute('data-quick-origin');
    let active = false;
    if (qDist && state.maxDistance === Number(qDist) && state.category === 'all' && state.origin === 'all') active = true;
    else if (qOrigin && state.origin === qOrigin && state.category === 'all' && state.maxDistance === 50) active = true;
    else if (qQuery && state.query.toLowerCase() === qQuery.toLowerCase()) active = true;
    else if (qCat && qCat !== 'all' && state.category === qCat && state.origin === 'all' && state.maxDistance === 50) active = true;
    chip.classList.toggle('active', active);
  });
}

function handleAnchorChange(newKey) {
  const copy = COPY[state.lang];
  if (newKey === 'gps') {
    if (!navigator.geolocation) {
      showToast(copy.gpsUnavailableToast);
      syncInputs();
      return;
    }
    showToast(copy.detectingGpsToast);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.gpsCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        state.anchorKey = 'gps';
        state.sortBy = 'nearest';
        syncInputs();
        renderAll();
        showToast(COPY[state.lang].gpsSuccessToast);
      },
      () => {
        showToast(COPY[state.lang].gpsDeniedToast);
        state.anchorKey = '98074';
        renderSelectOptions();
      },
      { timeout: 8000 }
    );
    return;
  }

  state.anchorKey = newKey;
  renderSelectOptions();
  renderAll();
}

/* ---------- Touch Swipe-Down Dismissal for Mobile Bottom Sheets ---------- */
function enableBottomSheetSwipeClose(sheetEl) {
  if (!sheetEl) return;
  let startY = 0;
  let currentY = 0;
  let dragging = false;

  sheetEl.addEventListener('touchstart', (e) => {
    if (window.innerWidth > 640 || !sheetEl.classList.contains('open')) return;
    const onHeader = e.target.closest('.drawer-header') || e.target.closest('.drawer-drag-handle');
    const bodyEl = sheetEl.querySelector('.drawer-body');
    const atTopOfBody = bodyEl && bodyEl.scrollTop <= 0 && !e.target.closest('input, select, textarea, button, a');
    if (!onHeader && !atTopOfBody) return;

    startY = e.touches[0].clientY;
    currentY = startY;
    dragging = true;
    sheetEl.style.transition = 'none';
  }, { passive: true });

  sheetEl.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    currentY = e.touches[0].clientY;
    const deltaY = Math.max(0, currentY - startY);
    if (deltaY > 4) {
      sheetEl.style.transform = `translateY(${deltaY}px)`;
    }
  }, { passive: true });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    sheetEl.style.transition = '';
    const deltaY = currentY - startY;
    sheetEl.style.transform = '';
    if (deltaY > 72) {
      closeAllOverlays();
    }
  };

  sheetEl.addEventListener('touchend', endDrag, { passive: true });
  sheetEl.addEventListener('touchcancel', endDrag, { passive: true });
}

/* ---------- Event Wiring ---------- */
function initEvents() {
  const searchInput = document.getElementById('global-search-input');
  const clearBtn = document.getElementById('search-clear-btn');

  searchInput?.addEventListener('input', (e) => {
    state.query = e.target.value;
    syncInputs();
    renderAll();
  });

  clearBtn?.addEventListener('click', () => {
    state.query = '';
    syncInputs();
    renderAll();
    searchInput?.focus();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')) {
      e.preventDefault();
      searchInput?.focus();
    } else if (e.key === 'Escape') {
      closeAllOverlays();
    }
  });

  document.getElementById('brand-home-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    resetAllFilters();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  });

  // Explicit English | 中文 Segmented Language Option
  document.querySelectorAll('[data-lang-opt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const chosen = btn.getAttribute('data-lang-opt');
      if (chosen && chosen !== state.lang) {
        applyLanguage(chosen);
      }
    });
  });

  document.getElementById('saved-filter-btn')?.addEventListener('click', () => {
    state.savedOnly = !state.savedOnly;
    renderAll();
  });

  document.getElementById('category-rail')?.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-cat-id]');
    if (!tab) return;
    state.category = tab.getAttribute('data-cat-id');
    syncInputs();
    renderAll();
    tab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  });

  document.querySelectorAll('.quick-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const wasActive = chip.classList.contains('active');
      resetAllFilters();
      if (!wasActive) {
        const qCat = chip.getAttribute('data-quick-cat');
        const qDist = chip.getAttribute('data-quick-dist');
        const qQuery = chip.getAttribute('data-quick-query');
        const qOrigin = chip.getAttribute('data-quick-origin');
        if (qCat) state.category = qCat;
        if (qDist) state.maxDistance = Number(qDist);
        if (qQuery) state.query = qQuery;
        if (qOrigin) state.origin = qOrigin;
      }
      syncInputs();
      renderAll();
      document.getElementById('catalog-results-anchor')?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  document.getElementById('select-anchor')?.addEventListener('change', (e) => handleAnchorChange(e.target.value));
  document.getElementById('mobile-select-anchor')?.addEventListener('change', (e) => handleAnchorChange(e.target.value));

  document.getElementById('select-distance')?.addEventListener('change', (e) => {
    state.maxDistance = Number(e.target.value);
    syncInputs();
    renderAll();
  });

  document.getElementById('select-area')?.addEventListener('change', (e) => {
    state.area = e.target.value;
    syncInputs();
    renderAll();
  });

  document.getElementById('select-origin')?.addEventListener('change', (e) => {
    state.origin = e.target.value;
    syncInputs();
    renderAll();
  });

  document.getElementById('select-rating')?.addEventListener('change', (e) => {
    state.minRating = Number(e.target.value);
    syncInputs();
    renderAll();
  });

  document.getElementById('select-sort')?.addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    syncInputs();
    renderAll();
  });

  // 1-tap Mobile Nearest toggle
  document.getElementById('mobile-nearest-btn')?.addEventListener('click', () => {
    state.sortBy = state.sortBy === 'nearest' ? 'recommended' : 'nearest';
    syncInputs();
    renderAll();
  });

  document.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.viewMode = btn.getAttribute('data-view');
      syncInputs();
      renderAll();
    });
  });

  // Whole-card tap + Bookmark & Detail trigger delegation
  document.getElementById('listings-container')?.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const bmBtn = e.target.closest('[data-bookmark-id]');
    if (bmBtn) {
      e.stopPropagation();
      toggleBookmark(bmBtn.getAttribute('data-bookmark-id'));
      return;
    }
    const detailTrigger = e.target.closest('[data-open-detail]');
    if (detailTrigger) {
      openDetailDrawer(detailTrigger.getAttribute('data-open-detail'));
      return;
    }
    const card = e.target.closest('.place-card');
    if (card) {
      openDetailDrawer(card.getAttribute('data-place-id'));
    }
  });

  // Mobile Filter Sheet
  document.getElementById('mobile-open-filters-btn')?.addEventListener('click', () => {
    lastFocusedElement = document.activeElement;
    const sheet = document.getElementById('mobile-filter-sheet');
    const backdrop = document.getElementById('overlay-backdrop');
    backdrop?.classList.add('open');
    sheet?.classList.add('open');
    sheet?.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  });

  document.getElementById('mobile-dist-chips')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-m-dist]');
    if (!btn) return;
    state.maxDistance = Number(btn.getAttribute('data-m-dist'));
    syncInputs();
    renderAll();
  });

  document.getElementById('mobile-rating-chips')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-m-rating]');
    if (!btn) return;
    state.minRating = Number(btn.getAttribute('data-m-rating'));
    syncInputs();
    renderAll();
  });

  document.getElementById('mobile-select-area')?.addEventListener('change', (e) => {
    state.area = e.target.value;
    syncInputs();
    renderAll();
  });

  document.getElementById('mobile-select-origin')?.addEventListener('change', (e) => {
    state.origin = e.target.value;
    syncInputs();
    renderAll();
  });

  document.getElementById('mobile-select-sort')?.addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    syncInputs();
    renderAll();
  });

  document.getElementById('mobile-reset-filters-btn')?.addEventListener('click', resetAllFilters);
  document.getElementById('mobile-apply-filters-btn')?.addEventListener('click', closeAllOverlays);
  document.getElementById('mobile-filter-close-btn')?.addEventListener('click', closeAllOverlays);

  // Suggest Modal
  document.getElementById('open-suggest-btn')?.addEventListener('click', () => {
    lastFocusedElement = document.activeElement;
    const modal = document.getElementById('suggest-modal');
    const backdrop = document.getElementById('overlay-backdrop');
    backdrop?.classList.add('open');
    modal?.classList.add('open');
    modal?.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    document.getElementById('sug-name')?.focus();
  });

  document.getElementById('suggest-close-btn')?.addEventListener('click', closeAllOverlays);

  document.getElementById('suggest-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('sug-name')?.value.trim() || '';
    const cat = document.getElementById('sug-category')?.value || '';
    const city = document.getElementById('sug-city')?.value.trim() || '';
    const notes = document.getElementById('sug-maps')?.value.trim() || '';

    const title = `[Directory Suggestion] ${name} (${cat} - ${city})`;
    const body = `### Suggested Asian Listing (≤ 50 miles of 98074)\n\n- **Name:** ${name}\n- **Category:** ${cat}\n- **City / Address:** ${city}\n- **Google Maps / Notes:**\n${notes || 'N/A'}\n`;
    const issueUrl = `https://github.com/coastwalker/seattlepagesforasian/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    window.open(issueUrl, '_blank', 'noopener,noreferrer');
    closeAllOverlays();
  });

  document.getElementById('drawer-close-btn')?.addEventListener('click', closeAllOverlays);
  document.getElementById('overlay-backdrop')?.addEventListener('click', closeAllOverlays);

  // Floating Back-to-Top & Mobile Scroll-Aware Header Tuck
  const backToTopBtn = document.getElementById('back-to-top-btn');
  backToTopBtn?.addEventListener('click', () => {
    document.body.classList.remove('mobile-scrolled-down');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  let lastScrollY = window.scrollY;
  let scrollTicking = false;
  window.addEventListener('scroll', () => {
    if (scrollTicking) return;
    scrollTicking = true;
    window.requestAnimationFrame(() => {
      const y = window.scrollY;
      const delta = y - lastScrollY;
      if (window.innerWidth <= 820) {
        if (y > 130 && delta > 8) {
          document.body.classList.add('mobile-scrolled-down');
        } else if (delta < -8 || y < 70) {
          document.body.classList.remove('mobile-scrolled-down');
        }
      } else {
        document.body.classList.remove('mobile-scrolled-down');
      }
      if (backToTopBtn) {
        backToTopBtn.hidden = y < 650;
      }
      lastScrollY = y;
      scrollTicking = false;
    });
  }, { passive: true });

  // Enable touch swipe-down to close on all mobile bottom sheets
  enableBottomSheetSwipeClose(document.getElementById('detail-drawer'));
  enableBottomSheetSwipeClose(document.getElementById('mobile-filter-sheet'));
  enableBottomSheetSwipeClose(document.getElementById('suggest-modal'));

  window.addEventListener('hashchange', checkHashDeepLink);
}

function checkHashDeepLink() {
  const hash = window.location.hash || '';
  if (hash.startsWith('#place=')) {
    const id = decodeURIComponent(hash.slice('#place='.length));
    openDetailDrawer(id, false);
  }
}

/* ---------- Bootstrap ---------- */
function init() {
  applyTheme(state.theme);
  renderMastheadMetrics();
  renderSelectOptions();
  applyLanguage(state.lang);
  syncInputs();
  initEvents();
  checkHashDeepLink();
}

init();
