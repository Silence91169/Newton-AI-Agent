// Newton AI Agent — Background Service Worker (MV3)
'use strict';

const BACKEND_URL = 'https://newton-ai-agent.onrender.com';

// ── Settings ──────────────────────────────────────────────────────────────────
async function getSettings() {
  return chrome.storage.sync.get({
    groq_api_key: '',
    newton_user:  null,
    enabled:      true,
  });
}

// ── Badge ─────────────────────────────────────────────────────────────────────
async function refreshBadge() {
  const { enabled, groq_api_key } = await getSettings();
  if (!groq_api_key) {
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
async function callBackend(path, method, body) {
  const url = `${BACKEND_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
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
  const { groq_api_key, newton_user } = await getSettings();

  if (!groq_api_key) {
    return { error: 'No Groq API key set. Open extension settings and paste your key.' };
  }

  try {
    const data = await callBackend('/solve', 'POST', {
      groq_api_key,
      newton_user,
      ...payload,
    });
    return data;
  } catch (err) {
    return { error: err.message };
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
            lastActivity:     msg.text,
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
            solvedToday:      0,
            lastActivity:     '',
            lastActivityTime: 0,
          });
          sendResponse(local);
          break;
        }

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
  chrome.alarms.create('daily_reset', { periodInMinutes: 1440 });
});

chrome.runtime.onStartup.addListener(refreshBadge);
