// Newton AI Agent — Popup Script
'use strict';

const $ = (id) => document.getElementById(id);

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function classifyCurrentTab(url) {
  if (!url) return { label: 'Not on Newton', dot: '#6b7280' };
  try {
    const path = new URL(url).pathname;
    if (path.includes('/assessment/'))       return { label: 'MCQ Assessment',       dot: '#89b4fa' };
    if (path.includes('/playground/code/'))  return { label: 'Coding Challenge',      dot: '#a6e3a1' };
    if (url.includes('my.newtonschool.co'))  return { label: 'Newton School Portal',  dot: '#f9e2af' };
  } catch { /* ignore */ }
  return { label: 'Not on Newton', dot: '#6b7280' };
}

function refreshConnectionBadge(llm_api_key, newton_user) {
  const badge = $('conn-badge');
  if (!llm_api_key) {
    badge.textContent = 'No Groq key';
    badge.className = 'badge badge-error';
    return;
  }
  if (!newton_user?.id && !newton_user?.email) {
    badge.textContent = 'Login to Newton';
    badge.className = 'badge badge-checking';
    return;
  }
  badge.textContent = 'Ready';
  badge.className = 'badge badge-ok';
}

async function render() {
  const [settings, stats, tabs] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }),
    chrome.runtime.sendMessage({ type: 'GET_STATS' }),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ]);

  // Toggle
  $('toggle-enabled').checked = settings.enabled ?? true;

  // Stats
  $('stat-today').textContent = stats.solvedToday ?? 0;
  const statusEl = $('stat-status');
  statusEl.textContent = settings.enabled ? 'Active' : 'Paused';
  statusEl.style.color = settings.enabled ? 'var(--green)' : 'var(--overlay0)';

  // Activity
  $('activity-text').textContent = stats.lastActivity || 'No activity yet';
  $('activity-time').textContent = timeAgo(stats.lastActivityTime);

  // Current page
  const { label, dot } = classifyCurrentTab(tabs[0]?.url);
  $('page-label').textContent = label;
  $('page-dot').style.background = dot;

  // Connection badge
  refreshConnectionBadge(settings.llm_api_key, settings.newton_user);
}

document.addEventListener('DOMContentLoaded', async () => {
  await render();

  $('toggle-enabled').addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', payload: { enabled } });
    const statusEl = $('stat-status');
    statusEl.textContent = enabled ? 'Active' : 'Paused';
    statusEl.style.color = enabled ? 'var(--green)' : 'var(--overlay0)';
  });

  $('btn-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
});
