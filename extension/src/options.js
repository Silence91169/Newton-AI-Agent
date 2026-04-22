// Newton AI Agent — Options Script
'use strict';

const $ = (id) => document.getElementById(id);

// ── Provider config ───────────────────────────────────────────────────────────
const PROVIDERS = {
  groq: {
    placeholder: 'gsk_xxxxxxxxxxxxxxxx',
    linkHref:    'https://console.groq.com/keys',
    linkText:    'console.groq.com/keys',
  },
  openai: {
    placeholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxx',
    linkHref:    'https://platform.openai.com/api-keys',
    linkText:    'platform.openai.com/api-keys',
  },
  anthropic: {
    placeholder: 'sk-ant-xxxxxxxxxxxxxxxx',
    linkHref:    'https://console.anthropic.com/settings/keys',
    linkText:    'console.anthropic.com/settings/keys',
  },
  gemini: {
    placeholder: 'AIzaxxxxxxxxxxxxxxxx',
    linkHref:    'https://aistudio.google.com/app/apikey',
    linkText:    'aistudio.google.com/app/apikey',
  },
  nvidia: {
    placeholder: 'nvapi-xxxxxxxxxxxxxxxx',
    linkHref:    'https://build.nvidia.com/explore/discover',
    linkText:    'build.nvidia.com',
  },
};

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'success') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast hidden'; }, 3000);
}

// ── Update key field when provider changes ────────────────────────────────────
function applyProvider(provider) {
  const cfg = PROVIDERS[provider] || PROVIDERS.groq;
  $('inp-api-key').placeholder = cfg.placeholder;
  $('key-link').href           = cfg.linkHref;
  $('key-link').textContent    = cfg.linkText;
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
  const { llm_api_key = '', llm_provider = 'groq', newton_user = null } =
    await chrome.storage.sync.get({
      llm_api_key:  '',
      llm_provider: 'groq',
      newton_user:  null,
    });

  $('sel-provider').value = llm_provider;
  $('inp-api-key').value  = llm_api_key;
  applyProvider(llm_provider);
  renderAccount(newton_user);

  // If no key saved yet, draw attention to the input
  if (!llm_api_key) {
    const inp = $('inp-api-key');
    inp.classList.add('inp-attention');
    inp.focus();
    // Stop the animation once the user starts typing
    inp.addEventListener('input', () => inp.classList.remove('inp-attention'), { once: true });
  }
}

// ── Save settings ─────────────────────────────────────────────────────────────
async function save() {
  const provider = $('sel-provider').value;
  const key      = $('inp-api-key').value.trim();

  if (!key) {
    showToast('API key cannot be empty', 'error');
    return;
  }

  const btn = $('btn-save');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  await chrome.runtime.sendMessage({
    type:    'SAVE_SETTINGS',
    payload: { llm_api_key: key, llm_provider: provider },
  });

  btn.disabled = false;
  btn.textContent = 'Save';
  showToast('Settings saved', 'success');
}

// ── Toggle key visibility ─────────────────────────────────────────────────────
function toggleKeyVisibility() {
  const inp = $('inp-api-key');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await load();

  $('sel-provider').addEventListener('change', (e) => applyProvider(e.target.value));
  $('btn-save').addEventListener('click', save);
  $('btn-show-key').addEventListener('click', toggleKeyVisibility);
  $('inp-api-key').addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
});
