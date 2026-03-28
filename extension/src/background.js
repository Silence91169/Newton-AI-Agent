// Newton AI Agent — Background Service Worker (MV3)
'use strict';

const DEFAULT_BACKEND = 'http://localhost:8000';

// ── Defaults ──────────────────────────────────────────────────────────────────
async function getSettings() {
  return chrome.storage.sync.get({
    api_token: '',
    backend_url: DEFAULT_BACKEND,
    enabled: true,
  });
}

// ── Badge ─────────────────────────────────────────────────────────────────────
async function refreshBadge() {
  const { enabled, api_token } = await getSettings();
  if (!api_token) {
    chrome.action.setBadgeBackgroundColor({ color: '#f38ba8' });
    chrome.action.setBadgeText({ text: '!' });
    return;
  }
  if (enabled) {
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
    chrome.action.setBadgeText({ text: 'ON' });
  } else {
    chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
    chrome.action.setBadgeText({ text: 'OFF' });
  }
}

// ── Backend call ──────────────────────────────────────────────────────────────
async function callBackend(path, method, body, extraHeaders = {}) {
  const { backend_url } = await getSettings();
  const url = `${backend_url}${path}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
  return data;
}

// ── Solve request ─────────────────────────────────────────────────────────────
async function handleSolve(payload) {
  const { api_token } = await getSettings();
  if (!api_token) {
    return { error: 'No API token set. Open extension options and paste your token.' };
  }
  try {
    const data = await callBackend('/solve', 'POST', { api_token, ...payload });
    return data;
  } catch (err) {
    return { error: err.message };
  }
}

// ── Connection test ───────────────────────────────────────────────────────────
async function testConnection(api_token, backend_url) {
  const url = `${backend_url || DEFAULT_BACKEND}/auth/verify`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${api_token}` },
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, user: data };
    }
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err?.detail || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Message router ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'SOLVE':
          sendResponse(await handleSolve(msg.payload));
          break;

        case 'SAVE_SETTINGS': {
          await chrome.storage.sync.set(msg.payload);
          await refreshBadge();
          // Notify any open content scripts of the enable toggle
          if ('enabled' in msg.payload) {
            const tabs = await chrome.tabs.query({ url: 'https://my.newtonschool.co/*' });
            for (const tab of tabs) {
              chrome.tabs.sendMessage(tab.id, {
                type: 'SET_ENABLED',
                enabled: msg.payload.enabled,
              }).catch(() => {});
            }
          }
          sendResponse({ ok: true });
          break;
        }

        case 'GET_SETTINGS':
          sendResponse(await getSettings());
          break;

        case 'LOG_ACTIVITY':
          await chrome.storage.local.set({
            lastActivity: msg.text,
            lastActivityTime: Date.now(),
          });
          sendResponse({ ok: true });
          break;

        case 'INCREMENT_SOLVED': {
          const { solvedToday = 0 } = await chrome.storage.local.get('solvedToday');
          await chrome.storage.local.set({ solvedToday: solvedToday + 1 });
          sendResponse({ ok: true });
          break;
        }

        case 'GET_STATS': {
          const local = await chrome.storage.local.get({
            solvedToday: 0,
            lastActivity: '',
            lastActivityTime: 0,
          });
          sendResponse(local);
          break;
        }

        case 'TEST_CONNECTION':
          sendResponse(await testConnection(msg.api_token, msg.backend_url));
          break;

        default:
          sendResponse({ error: `Unknown message type: ${msg.type}` });
      }
    } catch (err) {
      sendResponse({ error: err.message });
    }
  })();
  return true; // keep port open for async response
});

// ── Alarms ────────────────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'daily_reset') {
    await chrome.storage.local.set({ solvedToday: 0 });
  }
});

// ── Startup / install ─────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  await refreshBadge();
  // Reset solved counter at midnight every day
  chrome.alarms.create('daily_reset', { periodInMinutes: 1440 });
});

chrome.runtime.onStartup.addListener(refreshBadge);
