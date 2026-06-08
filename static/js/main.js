const ROOT_PATH = window.location.pathname.startsWith('/yc_image_search_api/')
    ? '/yc_image_search_api'
    : '';

const form = document.getElementById('searchForm');
const modeToggle = document.getElementById('modeToggle');
const imageModeFields = document.getElementById('imageModeFields');
const textModeFields = document.getElementById('textModeFields');
const queryInput = document.getElementById('queryInput');
const imgFormat = document.getElementById('imgFormat');
const imgSize = document.getElementById('imgSize');
const imgOrientation = document.getElementById('imgOrientation');
const imgColor = document.getElementById('imgColor');
const familyMode = document.getElementById('familyMode');
const searchType = document.getElementById('searchType');
const fixTypo = document.getElementById('fixTypo');
const imageFamily = document.getElementById('imageFamily');
const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const uploadPreview = document.getElementById('uploadPreview');
const previewImg = document.getElementById('previewImg');
const clearFileBtn = document.getElementById('clearFileBtn');
const browseBtn = document.getElementById('browseBtn');
const imageUrlInput = document.getElementById('imageUrl');
const clearUrlBtn = document.getElementById('clearUrlBtn');
const siteFilter = document.getElementById('siteFilter');
const limitInput = document.getElementById('limitInput');
const searchBtn = document.getElementById('searchBtn');
const loading = document.getElementById('loading');
const errorMsg = document.getElementById('errorMsg');
const tabSection = document.getElementById('tabSection');
const tabResultsCount = document.getElementById('tabResultsCount');
const resultsGrid = document.getElementById('results');
const debugRequest = document.getElementById('debugRequest');
const debugResponse = document.getElementById('debugResponse');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxSource = document.getElementById('lightboxSource');
const lightboxClose = document.getElementById('lightboxClose');

// ── Mode toggle ───────────────────────────────────────────────────────────────

let currentMode = 'image';

modeToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('.mode-btn');
  if (!btn) return;
  currentMode = btn.dataset.mode;
  document.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
  imageModeFields.classList.toggle('hidden', currentMode !== 'image');
  textModeFields.classList.toggle('hidden', currentMode !== 'text');
});

// ── Tabs ────────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.id !== `tab${capitalize(name)}`));
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── File preview ─────────────────────────────────────────────────────────────

let previewObjectUrl = null;

function setFileMode(file) {
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = URL.createObjectURL(file);
  previewImg.src = previewObjectUrl;
  uploadPlaceholder.classList.add('hidden');
  uploadPreview.classList.remove('hidden');
  uploadArea.classList.add('has-file');
  uploadArea.classList.remove('disabled');
  imageUrlInput.disabled = true;
  imageUrlInput.value = '';
}

function clearFileMode() {
  fileInput.value = '';
  if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = null; }
  previewImg.src = '';
  uploadPreview.classList.add('hidden');
  uploadPlaceholder.classList.remove('hidden');
  uploadArea.classList.remove('has-file');
  imageUrlInput.disabled = false;
}

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) setFileMode(fileInput.files[0]);
});

clearFileBtn.addEventListener('click', (e) => { e.stopPropagation(); clearFileMode(); });

imageUrlInput.addEventListener('input', () => {
  const hasValue = !!imageUrlInput.value.trim();
  uploadArea.classList.toggle('disabled', hasValue);
  clearUrlBtn.classList.toggle('hidden', !hasValue);
});

clearUrlBtn.addEventListener('click', () => {
  imageUrlInput.value = '';
  clearUrlBtn.classList.add('hidden');
  uploadArea.classList.remove('disabled');
  imageUrlInput.focus();
});

uploadArea.addEventListener('click', (e) => {
  if (e.target === clearFileBtn) return;
  if (uploadArea.classList.contains('has-file')) return;
  if (!uploadArea.classList.contains('disabled')) fileInput.click();
});

browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });

// ── Drag and drop ───────────────────────────────────────────────────────────

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (!uploadArea.classList.contains('disabled')) uploadArea.classList.add('dragover');
});
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  if (uploadArea.classList.contains('disabled')) return;
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    setFileMode(file);
  }
});

// ── Lightbox ─────────────────────────────────────────────────────────────────

function openLightbox(imageProxyUrl, sourceUrl) {
  lightboxImg.src = imageProxyUrl;
  lightboxSource.href = sourceUrl;
  lightbox.classList.remove('hidden');
  document.body.classList.add('lightbox-open');
}

function closeLightbox() {
  lightbox.classList.add('hidden');
  lightboxImg.src = '';
  document.body.classList.remove('lightbox-open');
}

lightboxClose.addEventListener('click', closeLightbox);
lightbox.querySelector('.lightbox-backdrop').addEventListener('click', closeLightbox);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

resultsGrid.addEventListener('click', (e) => {
  const thumb = e.target.closest('.card-thumb');
  if (!thumb) return;
  const fullUrl = thumb.dataset.full || thumb.dataset.proxy;
  const sourceUrl = thumb.dataset.source;
  if (fullUrl) openLightbox(fullUrl, sourceUrl);
});

// ── Form submit ─────────────────────────────────────────────────────────────

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();
  tabSection.classList.add('hidden');
  loading.classList.remove('hidden');
  searchBtn.disabled = true;

  const formData = new FormData();
  let endpoint;

  if (currentMode === 'text') {
    const query = queryInput.value.trim();
    if (!query) {
      showError('Укажите текстовый запрос.');
      loading.classList.add('hidden');
      searchBtn.disabled = false;
      return;
    }
    endpoint = `${ROOT_PATH}/api/search/text`;
    formData.append('query', query);
    if (imgFormat.value) formData.append('img_format', imgFormat.value);
    if (imgSize.value) formData.append('img_size', imgSize.value);
    if (imgOrientation.value) formData.append('img_orientation', imgOrientation.value);
    if (imgColor.value) formData.append('img_color', imgColor.value);
    formData.append('family', familyMode.value);
    formData.append('search_type', searchType.value);
    formData.append('fix_typo', fixTypo.checked ? 'FIX_TYPO_MODE_ON' : 'FIX_TYPO_MODE_OFF');
  } else {
    endpoint = `${ROOT_PATH}/api/search`;
    formData.append('family', imageFamily.value);
    if (fileInput.files.length > 0) {
      formData.append('file', fileInput.files[0]);
    } else {
      const url = imageUrlInput.value.trim();
      if (!url) {
        showError('Укажите файл или ссылку на изображение.');
        loading.classList.add('hidden');
        searchBtn.disabled = false;
        return;
      }
      formData.append('url', url);
    }
  }

  const site = siteFilter.value.trim();
  if (site) formData.append('site', site);
  formData.append('limit', limitInput.value);

  try {
    const response = await fetch(endpoint, { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok) {
      showError(data.detail || `Ошибка ${response.status}`);
      return;
    }
    renderResults(data.results, data.total);
    renderDebug(data.request_payload, data.response_raw);
    switchTab('results');
    tabSection.classList.remove('hidden');
  } catch (err) {
    showError('Сетевая ошибка: ' + err.message);
  } finally {
    loading.classList.add('hidden');
    searchBtn.disabled = false;
  }
});

// ── Rendering ───────────────────────────────────────────────────────────────

function renderResults(results, total) {
  tabResultsCount.textContent = total ? `(${total})` : '';

  if (!results || results.length === 0) {
    resultsGrid.innerHTML = '<p class="no-results">Ничего не найдено.</p>';
    return;
  }

  resultsGrid.innerHTML = results.map((r) => {
    const ref = r.source_url ? `&ref=${encodeURIComponent(r.source_url)}` : '';
    const proxy = (u) => `${ROOT_PATH}/api/proxy?url=${encodeURIComponent(u)}${ref}`;
    // Grid loads the lightweight thumbnail; the lightbox opens the full-size image.
    const proxyUrl = r.thumbnail_url ? proxy(r.thumbnail_url) : null;
    const fullUrl = r.image_url ? proxy(r.image_url) : (proxyUrl || '');
    const thumb = proxyUrl
      ? `<img src="${proxyUrl}" alt="${esc(r.title)}" loading="lazy">`
      : `<div class="no-thumb">Нет фото</div>`;

    return `
      <div class="card">
        <div class="card-thumb" data-proxy="${esc(proxyUrl || '')}" data-full="${esc(fullUrl)}" data-source="${esc(r.source_url)}">${thumb}</div>
        <a href="${esc(r.source_url)}" target="_blank" rel="noopener noreferrer" class="card-body">
          <div class="card-title">${esc(r.title || 'Без заголовка')}</div>
          ${r.domain ? `<div class="card-domain">${esc(r.domain)}</div>` : ''}
          ${r.snippet ? `<div class="card-snippet">${esc(r.snippet)}</div>` : ''}
        </a>
      </div>`;
  }).join('');

}

function renderDebug(requestPayload, responseRaw) {
  debugRequest.textContent = JSON.stringify(requestPayload, null, 2);
  debugResponse.textContent = JSON.stringify(responseRaw, null, 2);
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
}

function hideError() {
  errorMsg.classList.add('hidden');
  errorMsg.textContent = '';
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Custom dropdowns (progressive enhancement over <select>) ──────────────────

const COLOR_SWATCHES = {
  IMAGE_COLOR_COLOR: 'linear-gradient(90deg,#e74c3c,#f1c40f,#2ecc71,#3498db,#9b59b6)',
  IMAGE_COLOR_GRAYSCALE: 'linear-gradient(90deg,#2b2b2b,#9a9a9a,#e2e2e2)',
  IMAGE_COLOR_RED: '#e74c3c',
  IMAGE_COLOR_ORANGE: '#e67e22',
  IMAGE_COLOR_YELLOW: '#f1c40f',
  IMAGE_COLOR_GREEN: '#27ae60',
  IMAGE_COLOR_CYAN: '#17b3c4',
  IMAGE_COLOR_BLUE: '#2d6cdf',
  IMAGE_COLOR_VIOLET: '#8e44ad',
  IMAGE_COLOR_WHITE: '#ffffff',
  IMAGE_COLOR_BLACK: '#1a1a1a',
};

const CHEVRON_SVG =
  '<svg class="cs-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
const CHECK_SVG =
  '<svg class="cs-check" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

const openDropdowns = [];

function dotMarkup(value) {
  const swatch = COLOR_SWATCHES[value];
  return swatch ? `<span class="cs-dot" style="background:${swatch}"></span>` : '';
}

function enhanceSelect(select) {
  const options = Array.from(select.options);

  const wrap = document.createElement('div');
  wrap.className = 'cs';
  select.parentNode.insertBefore(wrap, select);
  wrap.appendChild(select);
  select.classList.add('cs-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'cs-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = `<span class="cs-value"></span>${CHEVRON_SVG}`;
  wrap.appendChild(trigger);

  // Redirect the associated <label> click to the custom trigger
  if (select.id) {
    const label = document.querySelector(`label[for="${select.id}"]`);
    if (label) label.addEventListener('click', (e) => { e.preventDefault(); trigger.focus(); });
  }

  const valueEl = trigger.querySelector('.cs-value');

  const panel = document.createElement('ul');
  panel.className = 'cs-panel';
  panel.setAttribute('role', 'listbox');
  panel.hidden = true;
  panel.innerHTML = options
    .map(
      (o, i) =>
        `<li class="cs-option" role="option" data-value="${esc(o.value)}" data-index="${i}">` +
        `${dotMarkup(o.value)}<span>${esc(o.text)}</span>${CHECK_SVG}</li>`
    )
    .join('');
  wrap.appendChild(panel);

  const optionEls = Array.from(panel.children);
  let highlighted = -1;

  function syncTrigger() {
    const o = select.options[select.selectedIndex];
    valueEl.innerHTML = `${dotMarkup(o.value)}<span>${esc(o.text)}</span>`;
    optionEls.forEach((el, i) => el.classList.toggle('selected', i === select.selectedIndex));
  }

  function setHighlight(i) {
    if (highlighted >= 0) optionEls[highlighted].classList.remove('highlighted');
    highlighted = i;
    if (i >= 0) {
      optionEls[i].classList.add('highlighted');
      optionEls[i].scrollIntoView({ block: 'nearest' });
    }
  }

  function open() {
    closeAll();
    wrap.classList.add('open');
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    setHighlight(select.selectedIndex);
    openDropdowns.push(close);
  }

  function close() {
    wrap.classList.remove('open');
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    const idx = openDropdowns.indexOf(close);
    if (idx >= 0) openDropdowns.splice(idx, 1);
  }

  function choose(i) {
    select.selectedIndex = i;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    syncTrigger();
    close();
    trigger.focus();
  }

  trigger.addEventListener('click', () => (wrap.classList.contains('open') ? close() : open()));

  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      wrap.classList.contains('open') ? null : open();
    }
  });

  panel.addEventListener('click', (e) => {
    const li = e.target.closest('.cs-option');
    if (li) choose(Number(li.dataset.index));
  });

  panel.addEventListener('mousemove', (e) => {
    const li = e.target.closest('.cs-option');
    if (li) setHighlight(Number(li.dataset.index));
  });

  wrap.addEventListener('keydown', (e) => {
    if (panel.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(Math.min(highlighted + 1, optionEls.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(Math.max(highlighted - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (highlighted >= 0) choose(highlighted); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); trigger.focus(); }
  });

  syncTrigger();
}

function closeAll() {
  while (openDropdowns.length) openDropdowns.pop()();
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.cs')) closeAll();
});

document.querySelectorAll('#searchForm select').forEach(enhanceSelect);
