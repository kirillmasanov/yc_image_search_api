const form = document.getElementById('searchForm');
const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const uploadPreview = document.getElementById('uploadPreview');
const previewImg = document.getElementById('previewImg');
const clearFileBtn = document.getElementById('clearFileBtn');
const browseBtn = document.getElementById('browseBtn');
const imageUrlInput = document.getElementById('imageUrl');
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
  uploadArea.classList.toggle('disabled', !!imageUrlInput.value.trim());
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
  const proxyUrl = thumb.dataset.proxy;
  const sourceUrl = thumb.dataset.source;
  if (proxyUrl) openLightbox(proxyUrl, sourceUrl);
});

// ── Form submit ─────────────────────────────────────────────────────────────

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();
  tabSection.classList.add('hidden');
  loading.classList.remove('hidden');
  searchBtn.disabled = true;

  const formData = new FormData();
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
  const site = siteFilter.value.trim();
  if (site) formData.append('site', site);
  formData.append('limit', limitInput.value);

  try {
    const response = await fetch(`${window.ROOT_PATH}/api/search`, { method: 'POST', body: formData });
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
    resultsGrid.innerHTML = '<p class="no-results">По этому изображению ничего не найдено.</p>';
    return;
  }

  resultsGrid.innerHTML = results.map((r) => {
    const proxyUrl = r.thumbnail_url
      ? `${window.ROOT_PATH}/api/proxy?url=${encodeURIComponent(r.thumbnail_url)}`
      : null;
    const thumb = proxyUrl
      ? `<img src="${proxyUrl}" alt="${esc(r.title)}" loading="lazy">`
      : `<div class="no-thumb">Нет фото</div>`;

    return `
      <div class="card">
        <div class="card-thumb" data-proxy="${esc(proxyUrl || '')}" data-source="${esc(r.source_url)}">${thumb}</div>
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
