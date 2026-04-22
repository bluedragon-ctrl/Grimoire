// Overlay UI — modal panel over the viewport.
// Used for script editor (nano-style).

let overlayEl, titleEl, hintEl, editorEl, statusEl;
let isOpen = false;
let currentScript = null;
let onSaveCallback = null;
let onCloseCallback = null;

// ── Public API ─────────────────────────────────────────────

export function initOverlay() {
  overlayEl = document.getElementById('overlay');
  titleEl = document.getElementById('overlay-title');
  hintEl = document.getElementById('overlay-hint');
  editorEl = document.getElementById('overlay-editor');
  statusEl = document.getElementById('overlay-status');

  editorEl.addEventListener('keydown', handleEditorKeys);
  editorEl.addEventListener('input', updateStatus);
}

/**
 * Open the editor with a script.
 * @param {string} name — script name
 * @param {string} content — initial script content
 * @param {function} onSave — called with (name, content) on Ctrl+S
 * @param {function} onClose — called when editor closes
 */
export function openEditor(name, content, onSave, onClose) {
  currentScript = name;
  onSaveCallback = onSave;
  onCloseCallback = onClose;

  titleEl.textContent = `edit: ${name}`;
  hintEl.textContent = 'Ctrl+S save | Ctrl+Q quit | Esc quit';
  editorEl.value = content || '';
  editorEl.readOnly = false;
  updateStatus();

  overlayEl.classList.remove('hidden');
  isOpen = true;
  editorEl.focus();
}

/**
 * Open the overlay as a read-only viewer (for help pages, etc.).
 * @param {string} title — display title
 * @param {string} content — text to display
 * @param {function} onClose — called when viewer closes
 */
export function openViewer(title, content, onClose) {
  currentScript = null;
  onSaveCallback = null;
  onCloseCallback = onClose;

  titleEl.textContent = title;
  hintEl.textContent = 'q quit | Esc quit';
  editorEl.value = content || '';
  editorEl.readOnly = true;
  statusEl.textContent = '';

  overlayEl.classList.remove('hidden');
  isOpen = true;
  editorEl.focus();
  editorEl.setSelectionRange(0, 0);
  editorEl.scrollTop = 0;
}

/**
 * Close the overlay.
 */
export function closeOverlay() {
  overlayEl.classList.add('hidden');
  isOpen = false;
  currentScript = null;

  if (onCloseCallback) {
    onCloseCallback();
    onCloseCallback = null;
  }
  onSaveCallback = null;
}

/**
 * Check if overlay is currently open.
 */
export function isOverlayOpen() {
  return isOpen;
}

// ── Input Handling ─────────────────────────────────────────

function handleEditorKeys(e) {
  // Ctrl+S — save
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    save();
    return;
  }

  // Ctrl+Q or Escape — close (also plain 'q' in read-only mode)
  if ((e.ctrlKey && e.key === 'q') || e.key === 'Escape' ||
      (editorEl.readOnly && e.key === 'q')) {
    e.preventDefault();
    closeOverlay();
    return;
  }

  // Tab — insert 2 spaces
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = editorEl.selectionStart;
    const end = editorEl.selectionEnd;
    editorEl.value = editorEl.value.substring(0, start) + '  ' + editorEl.value.substring(end);
    editorEl.selectionStart = editorEl.selectionEnd = start + 2;
    updateStatus();
    return;
  }
}

function save() {
  if (onSaveCallback && currentScript) {
    onSaveCallback(currentScript, editorEl.value);
    flashStatus('Saved.');
  }
}

// ── Status Bar ─────────────────────────────────────────────

function updateStatus() {
  if (!editorEl) return;
  const text = editorEl.value;
  const lines = text.split('\n').length;
  const pos = editorEl.selectionStart;
  const beforeCursor = text.substring(0, pos);
  const line = beforeCursor.split('\n').length;
  const col = pos - beforeCursor.lastIndexOf('\n');

  statusEl.textContent = `Line ${line}/${lines}  Col ${col}  Script: ${currentScript || '?'}`;
}

function flashStatus(msg) {
  const original = statusEl.textContent;
  statusEl.textContent = msg;
  statusEl.style.color = '#ff8800';
  setTimeout(() => {
    statusEl.style.color = '';
    updateStatus();
  }, 1500);
}
