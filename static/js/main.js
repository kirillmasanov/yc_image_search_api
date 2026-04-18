const form = document.getElementById('searchForm');
const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const browseBtn = document.getElementById('browseBtn');
const fileNameEl = document.getElementById('fileName');
const imageUrlInput = document.getElementById('imageUrl');
const siteFilter = document.getElementById('siteFilter');
const searchBtn = document.getElementById('searchBtn');
const loading = document.getElementById('loading');
const errorMsg = document.getElementById('errorMsg');
const resultsHeader = document.getElementById('resultsHeader');
const resultsGrid = document.getElementById('results');

// ── Mutual exclusivity ──────────────────────────────────────────────────────

function setFileMode(file) {
  fileNameEl.textContent = file.name;
  uploadArea.classList.add('has-file');
  uploadArea.classList.remove('disabled');
  imageUrlInput.disabled = true;
  imageUrlInput.value = '';
}

function clearFileMode() {
  fileInput.value = '';
  fileNameEl.textContent = '';
  uploadArea.classList.remove('has-file');
  imageUrlInput.disabled = false;
}

function setUrlMode() {
  uploadArea.classList.add('disabled');
}

function clearUrlMode() {
  uploadArea.classList.remove('disabled');
}

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    setFileMode(fileInput.files[0]);
  }
});

imageUrlInput.addEventListener('input', () => {
  if (imageUrlInput.value.trim()) {
    setUrlMode();
  } else {
    clearUrlMode();
  }
});

// Allow clicking upload area to clear file & re-enable URL when in file mode
uploadArea.addEventListener('click', (e) => {
  if (e.target === browseBtn) return; // handled separately
  if (uploadArea.classList.contains('has-file')) {
    clearFileMode();
    return;
  }
  if (!uploadArea.classList.contains('disabled')) {
    fileInput.click();
  }
});

browseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});

// ── Drag and drop ───────────────────────────────────────────────────────────

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (!uploadArea.classList.contains('disabled')) {
    uploadArea.classList.add('dragover');
  }
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('dragover');
});

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

// ── Form submit ─────────────────────────────────────────────────────────────

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();
  resultsGrid.innerHTML = '';
  resultsHeader.classList.add('hidden');
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

  try {
    const response = await fetch('/api/search', { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok) {
      showError(data.detail || `Ошибка ${response.status}`);
      return;
    }
    renderResults(data.results, data.total);
  } catch (err) {
    showError('Сетевая ошибка: ' + err.message);
  } finally {
    loading.classList.add('hidden');
    searchBtn.disabled = false;
  }
});

// ── Rendering ───────────────────────────────────────────────────────────────

function renderResults(results, total) {
  if (!results || results.length === 0) {
    resultsGrid.innerHTML = '<p class="no-results">По этому изображению ничего не найдено.</p>';
    return;
  }

  resultsHeader.textContent = `Найдено результатов: ${total}`;
  resultsHeader.classList.remove('hidden');

  resultsGrid.innerHTML = results.map((r) => {
    const proxyUrl = r.thumbnail_url
      ? `/api/proxy?url=${encodeURIComponent(r.thumbnail_url)}`
      : null;
    const thumb = proxyUrl
      ? `<img src="${proxyUrl}" alt="${esc(r.title)}" loading="lazy">`
      : `<div class="no-thumb">Нет фото</div>`;

    return `
      <div class="card">
        <a href="${esc(r.source_url)}" target="_blank" rel="noopener noreferrer">
          <div class="card-thumb">${thumb}</div>
          <div class="card-body">
            <div class="card-title">${esc(r.title || 'Без заголовка')}</div>
            ${r.domain ? `<div class="card-domain">${esc(r.domain)}</div>` : ''}
            ${r.snippet ? `<div class="card-snippet">${esc(r.snippet)}</div>` : ''}
          </div>
        </a>
      </div>`;
  }).join('');
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
