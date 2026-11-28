import './file-upload.css';

const ICONS = {
  upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
  alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
  video: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>',
  audio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/></svg>',
  sheet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/></svg>',
  archive: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 22h2a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v18"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><circle cx="10" cy="20" r="2"/><path d="M10 7V6"/><path d="M10 12v-1"/><path d="M10 18v-2"/></svg>',
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
};

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = bytes / (1024 ** idx);
  return `${val >= 10 || idx === 0 ? Math.round(val) : val.toFixed(1)} ${units[idx]}`;
}

function fileIcon(file) {
  const type = file.type || '';
  const name = (file.name || '').toLowerCase();
  if (type.startsWith('image/')) return ICONS.image;
  if (type.startsWith('video/')) return ICONS.video;
  if (type.startsWith('audio/')) return ICONS.audio;
  if (type.includes('excel') || type.includes('sheet') || type.includes('csv') || /\.(csv|xlsx|xls)$/.test(name)) return ICONS.sheet;
  if (type.includes('zip') || type.includes('rar') || /\.(zip|rar|7z|gz)$/.test(name)) return ICONS.archive;
  return ICONS.file;
}

function fileTypeLabel(file) {
  const type = file.type || '';
  const name = (file.name || '').toLowerCase();
  if (type.startsWith('image/')) return 'Image';
  if (type.startsWith('video/')) return 'Video';
  if (type.startsWith('audio/')) return 'Audio';
  if (type.includes('pdf') || name.endsWith('.pdf')) return 'PDF';
  if (type.includes('csv') || name.endsWith('.csv')) return 'CSV';
  if (type.includes('html') || /\.(html|htm)$/.test(name)) return 'HTML';
  if (type.includes('excel') || type.includes('sheet') || /\.(xlsx|xls)$/.test(name)) return 'Excel';
  if (type.includes('zip') || type.includes('rar')) return 'Archive';
  if (type.includes('json') || name.endsWith('.json')) return 'JSON';
  if (type.includes('text') || name.endsWith('.txt')) return 'Text';
  return 'File';
}

function matchesAccept(file, accept) {
  if (!accept || accept === '*') return true;
  const tokens = accept.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (!tokens.length) return true;
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith('.')) return name.endsWith(token);
    if (token.endsWith('/*')) return type.startsWith(token.slice(0, -1));
    return type === token;
  });
}

export function createFileUpload(options = {}) {
  const {
    input: existingInput,
    label = '',
    accept = '*',
    maxSize = 50 * 1024 * 1024,
    maxFiles = 1,
    multiple = false,
    onFilesChange,
  } = options;

  const root = document.createElement('div');
  root.className = 'fu-root';

  if (label) {
    const heading = document.createElement('span');
    heading.className = 'fu-label';
    heading.textContent = label;
    root.append(heading);
  }

  const input = existingInput || document.createElement('input');
  input.type = 'file';
  if (accept && accept !== '*') input.accept = accept;
  input.multiple = Boolean(multiple);
  input.classList.add('fu-native-input');
  input.tabIndex = -1;
  if (label && !input.getAttribute('aria-label')) input.setAttribute('aria-label', label);

  const dropzone = document.createElement('div');
  dropzone.className = 'fu-dropzone';
  dropzone.innerHTML = `
    <div class="fu-drop-inner">
      <div class="fu-drop-icon">${ICONS.upload}</div>
      <div class="fu-drop-copy">
        <p class="fu-drop-title">Drop files here or <button type="button" class="fu-browse-btn">browse files</button></p>
        <p class="fu-drop-meta"></p>
      </div>
    </div>
  `;
  dropzone.prepend(input);
  dropzone.querySelector('.fu-drop-meta').textContent = `Maximum file size: ${formatBytes(maxSize)} • Maximum files: ${maxFiles}`;

  const filesSection = document.createElement('div');
  filesSection.className = 'fu-files';
  filesSection.hidden = true;
  filesSection.innerHTML = `
    <div class="fu-files-head">
      <h4 data-fu-count>Files (0)</h4>
      <div class="fu-files-actions">
        <button type="button" class="fu-head-btn" data-fu-add>${ICONS.cloud}<span>Add files</span></button>
        <button type="button" class="fu-head-btn" data-fu-clear>${ICONS.trash}<span>Remove all</span></button>
      </div>
    </div>
    <div class="fu-table-wrap">
      <table class="fu-table">
        <thead>
          <tr><th>Name</th><th>Type</th><th>Size</th><th>Actions</th></tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  `;

  const alertBox = document.createElement('div');
  alertBox.className = 'fu-alert';
  alertBox.setAttribute('role', 'status');
  alertBox.hidden = true;
  alertBox.innerHTML = `${ICONS.alert}<strong>File upload error(s)</strong>`;

  root.append(dropzone, filesSection, alertBox);

  const browseBtn = dropzone.querySelector('.fu-browse-btn');
  const addBtn = filesSection.querySelector('[data-fu-add]');
  const clearBtn = filesSection.querySelector('[data-fu-clear]');
  const countHeading = filesSection.querySelector('[data-fu-count]');
  const tbody = filesSection.querySelector('tbody');

  let items = [];
  let errors = [];
  let syncingInput = false;

  const openPicker = () => input.click();
  browseBtn.addEventListener('click', (e) => { e.stopPropagation(); openPicker(); });
  addBtn.addEventListener('click', openPicker);
  dropzone.addEventListener('click', (e) => {
    if (!browseBtn.contains(e.target) && e.target !== input) openPicker();
  });

  function syncNativeInput() {
    syncingInput = true;
    try {
      const dt = new DataTransfer();
      for (const item of items) dt.items.add(item.file);
      input.files = dt.files;
    } catch {
      /* Environments without writable DataTransfer keep native selection. */
    } finally {
      syncingInput = false;
    }
  }

  function render() {
    filesSection.hidden = items.length === 0;
    countHeading.textContent = `Files (${items.length})`;
    addBtn.textContent = '';
    addBtn.insertAdjacentHTML('beforeend', `${ICONS.cloud}<span>${multiple ? 'Add files' : 'Replace file'}</span>`);
    tbody.replaceChildren(...items.map((item) => {
      const tr = document.createElement('tr');
      const nameTd = document.createElement('td');
      const wrap = document.createElement('div');
      wrap.className = 'fu-name-cell';

      const iconWrap = document.createElement('div');
      iconWrap.className = 'fu-file-icon';
      if (item.status === 'uploading') {
        const circ = 2 * Math.PI * 14;
        const offset = circ * (1 - Math.max(0, Math.min(100, item.progress)) / 100);
        iconWrap.innerHTML = `<svg class="fu-ring" viewBox="0 0 32 32" aria-hidden="true"><circle class="fu-ring-track" cx="16" cy="16" r="14"/><circle class="fu-ring-fill" cx="16" cy="16" r="14" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/></svg>${fileIcon(item.file)}`;
      } else {
        iconWrap.innerHTML = fileIcon(item.file);
      }

      const nameP = document.createElement('p');
      nameP.className = 'fu-file-name';
      nameP.textContent = item.status === 'uploading' ? `${item.file.name} (${Math.round(item.progress)}%)` : item.file.name;
      nameP.title = item.file.name;
      wrap.append(iconWrap, nameP);

      if (item.status === 'error') {
        const errBadge = document.createElement('span');
        errBadge.className = 'fu-badge fu-badge--error';
        errBadge.textContent = 'Error';
        wrap.append(errBadge);
      }
      nameTd.append(wrap);

      const typeTd = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = 'fu-badge';
      badge.textContent = fileTypeLabel(item.file);
      typeTd.append(badge);

      const sizeTd = document.createElement('td');
      sizeTd.className = 'fu-size';
      sizeTd.textContent = formatBytes(item.file.size);

      const actTd = document.createElement('td');
      const actWrap = document.createElement('div');
      actWrap.className = 'fu-row-actions';
      if (item.preview) {
        const dl = document.createElement('a');
        dl.className = 'fu-icon-btn';
        dl.href = item.preview;
        dl.download = item.file.name;
        dl.setAttribute('aria-label', `Download ${item.file.name}`);
        dl.innerHTML = ICONS.download;
        actWrap.append(dl);
      }
      if (item.status === 'error') {
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'fu-icon-btn fu-icon-btn--danger';
        retry.setAttribute('aria-label', `Retry ${item.file.name}`);
        retry.innerHTML = ICONS.refresh;
        retry.onclick = () => openPicker();
        actWrap.append(retry);
      } else {
        const rem = document.createElement('button');
        rem.type = 'button';
        rem.className = 'fu-icon-btn';
        rem.setAttribute('aria-label', `Remove ${item.file.name}`);
        rem.innerHTML = ICONS.trash;
        rem.onclick = () => removeItem(item.id);
        actWrap.append(rem);
      }
      actTd.append(actWrap);

      tr.append(nameTd, typeTd, sizeTd, actTd);
      return tr;
    }));

    alertBox.hidden = errors.length === 0;
    alertBox.querySelectorAll('p').forEach((p) => p.remove());
    for (const msg of errors) {
      const p = document.createElement('p');
      p.textContent = msg;
      alertBox.append(p);
    }
  }

  function revokeItem(item) {
    if (item.preview) URL.revokeObjectURL(item.preview);
  }

  function clear() {
    items.forEach(revokeItem);
    items = [];
    errors = [];
    input.value = '';
    syncNativeInput();
    input.setCustomValidity('');
    render();
    onFilesChange?.([]);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function removeItem(id) {
    const target = items.find((i) => i.id === id);
    if (target) revokeItem(target);
    items = items.filter((i) => i.id !== id);
    errors = [];
    if (!items.length) input.value = '';
    syncNativeInput();
    input.setCustomValidity('');
    render();
    onFilesChange?.(items.map((i) => i.file));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    const nextErrors = [];
    const nextItems = multiple ? [...items] : [];
    if (!multiple) items.forEach(revokeItem);

    for (const file of incoming) {
      if (!multiple && nextItems.length >= 1) break;
      if (nextItems.length >= maxFiles) {
        nextErrors.push(`You can upload up to ${maxFiles} ${maxFiles === 1 ? 'file' : 'files'}.`);
        break;
      }
      if (!matchesAccept(file, accept)) {
        nextErrors.push(`${file.name}: unsupported file type.`);
        continue;
      }
      if (file.size > maxSize) {
        nextErrors.push(`${file.name}: exceeds ${formatBytes(maxSize)} limit.`);
        continue;
      }
      nextItems.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        preview: URL.createObjectURL(file),
        progress: 100,
        status: 'completed',
      });
    }

    items = nextItems;
    errors = nextErrors;
    syncNativeInput();
    input.setCustomValidity(errors[0] || '');
    render();
    onFilesChange?.(items.map((i) => i.file));
  }

  clearBtn.addEventListener('click', clear);

  input.addEventListener('change', () => {
    if (syncingInput) return;
    addFiles(input.files);
  });

  dropzone.addEventListener('dragenter', (e) => { e.preventDefault(); dropzone.classList.add('is-dragging'); });
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('is-dragging'); });
  dropzone.addEventListener('dragleave', (e) => {
    if (!dropzone.contains(e.relatedTarget)) dropzone.classList.remove('is-dragging');
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-dragging');
    addFiles(e.dataTransfer?.files);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  input.addEventListener('invalid', (e) => {
    e.preventDefault();
    errors = [input.validationMessage || 'Choose a valid file.'];
    render();
    browseBtn.focus();
  });

  const form = input.form;
  if (form) {
    form.addEventListener('reset', () => queueMicrotask(() => {
      items.forEach(revokeItem);
      items = [];
      errors = [];
      input.setCustomValidity('');
      render();
    }));
  }

  render();

  return {
    root,
    input,
    clear,
    setProgress(done, total) {
      if (!items.length) return;
      const pct = total > 0 ? Math.round((done / total) * 100) : 100;
      items = items.map((item) => ({
        ...item,
        progress: pct,
        status: done >= total ? 'completed' : 'uploading',
      }));
      render();
    },
    setError(message) {
      errors = message ? [message] : [];
      items = items.map((item) => message ? { ...item, status: 'error', error: message } : { ...item, status: 'completed', error: undefined });
      render();
    },
  };
}
