// Newton AI Agent — Options Script
'use strict';

const DEFAULT_BACKEND = 'http://localhost:8000';
const $ = (id) => document.getElementById(id);

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'success') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast hidden'; }, 3000);
}

// ── Load settings from storage ────────────────────────────────────────────────
async function load() {
  const settings = await chrome.storage.sync.get({
    api_token:   '',
    backend_url: DEFAULT_BACKEND,
  });
  $('inp-token').value = settings.api_token;
  $('inp-url').value   = settings.backend_url;
}

// ── Save settings ─────────────────────────────────────────────────────────────
async function save() {
  const token = $('inp-token').value.trim();
  const url   = $('inp-url').value.trim() || DEFAULT_BACKEND;

  if (!token) {
    showToast('API token cannot be empty', 'error');
    return;
  }

  const btn = $('btn-save');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  await chrome.runtime.sendMessage({
    type:    'SAVE_SETTINGS',
    payload: { api_token: token, backend_url: url },
  });

  btn.disabled = false;
  btn.textContent = 'Save Settings';
  showToast('Settings saved', 'success');
}

// ── Reset ─────────────────────────────────────────────────────────────────────
async function reset() {
  if (!confirm('Reset backend URL to default (localhost:8000)?')) return;
  $('inp-url').value = DEFAULT_BACKEND;
  await save();
}

// ── Test connection ───────────────────────────────────────────────────────────
async function testConnection() {
  const token = $('inp-token').value.trim();
  const url   = $('inp-url').value.trim() || DEFAULT_BACKEND;
  const result = $('test-result');
  const btn = $('btn-test');

  if (!token) {
    result.textContent = 'Enter a token first';
    result.className = 'test-result test-error';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Testing…';
  result.textContent = '';
  result.className = 'test-result';

  const res = await chrome.runtime.sendMessage({
    type:        'TEST_CONNECTION',
    api_token:   token,
    backend_url: url,
  });

  btn.disabled = false;
  btn.textContent = 'Test Connection';

  if (res?.ok) {
    result.textContent = `Connected${res.user?.name ? ` as ${res.user.name}` : ''}`;
    result.className = 'test-result test-ok';
  } else {
    result.textContent = `Failed: ${res?.error || 'unknown error'}`;
    result.className = 'test-result test-error';
  }
}

// ── Toggle password visibility ────────────────────────────────────────────────
function toggleTokenVisibility() {
  const inp = $('inp-token');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await load();

  $('btn-save').addEventListener('click', save);
  $('btn-reset').addEventListener('click', reset);
  $('btn-test').addEventListener('click', testConnection);
  $('btn-show-token').addEventListener('click', toggleTokenVisibility);

  // Save on Enter key in inputs
  ['inp-token', 'inp-url'].forEach((id) => {
    $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  });

  // Dashboard link — open dashboard registration page
  $('link-dashboard').addEventListener('click', (e) => {
    e.preventDefault();
    const backendUrl = $('inp-url').value.trim() || DEFAULT_BACKEND;
    chrome.tabs.create({ url: `${backendUrl}/dashboard` });
  });
});
