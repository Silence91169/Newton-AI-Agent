// Newton AI Agent — Options Script
'use strict';

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

// ── Newton account display ────────────────────────────────────────────────────
function renderAccount(newton_user) {
  const statusEl = $('account-status');
  const labelEl  = $('account-label');

  if (!newton_user || (!newton_user.id && !newton_user.email)) {
    statusEl.className = 'account-status account-unknown';
    labelEl.textContent = 'Not detected — log into my.newtonschool.co first';
    return;
  }

  statusEl.className = 'account-status account-ok';
  const display = newton_user.email || newton_user.username || newton_user.id;
  labelEl.textContent = `Logged in as ${display}`;
}

// ── Load settings from storage ────────────────────────────────────────────────
async function load() {
  const { groq_api_key = '', newton_user = null } =
    await chrome.storage.sync.get({ groq_api_key: '', newton_user: null });

  $('inp-groq-key').value = groq_api_key;
  renderAccount(newton_user);
}

// ── Save settings ─────────────────────────────────────────────────────────────
async function save() {
  const key = $('inp-groq-key').value.trim();

  if (!key) {
    showToast('Groq API key cannot be empty', 'error');
    return;
  }
  if (!key.startsWith('gsk_')) {
    showToast('Key should start with gsk_ — check your Groq console', 'error');
    return;
  }

  const btn = $('btn-save');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  await chrome.runtime.sendMessage({
    type:    'SAVE_SETTINGS',
    payload: { groq_api_key: key },
  });

  btn.disabled = false;
  btn.textContent = 'Save';
  showToast('Settings saved', 'success');
}

// ── Toggle key visibility ─────────────────────────────────────────────────────
function toggleKeyVisibility() {
  const inp = $('inp-groq-key');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await load();

  $('btn-save').addEventListener('click', save);
  $('btn-show-key').addEventListener('click', toggleKeyVisibility);

  $('inp-groq-key').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save();
  });
});
