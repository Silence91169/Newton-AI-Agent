// Newton AI Agent — Content Script
// Runs on https://my.newtonschool.co/*
'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  enabled: true,
  solving: false,
  codingInitialized: false,
  authHeaders: {},
  monacoEditorIdx: null,
};

// ── Utilities ─────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitForElement(selector, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);

    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for: ${selector}`));
    }, timeout);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function findButtonByText(text) {
  for (const el of document.querySelectorAll('button, [role="button"]')) {
    if (el.textContent.trim() === text) return el;
  }
  return null;
}

// ── Overlay UI ────────────────────────────────────────────────────────────────
function buildOverlay() {
  if (document.getElementById('naa-overlay')) return;

  const el = document.createElement('div');
  el.id = 'naa-overlay';
  el.style.cssText = [
    'position:fixed', 'bottom:20px', 'right:20px', 'z-index:2147483647',
    'background:#1e1e2e', 'color:#cdd6f4',
    'border:1px solid #45475a', 'border-radius:12px',
    'padding:12px 16px', 'min-width:230px', 'max-width:300px',
    'font-family:"Segoe UI",system-ui,sans-serif', 'font-size:13px',
    'box-shadow:0 8px 32px rgba(0,0,0,.6)',
    'transition:opacity .3s',
    'user-select:none',
  ].join(';');

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span id="naa-dot" style="width:8px;height:8px;border-radius:50%;
        background:#22c55e;display:inline-block;flex-shrink:0"></span>
      <strong style="font-size:13px;letter-spacing:.3px">Newton AI Agent</strong>
    </div>
    <div id="naa-status" style="color:#a6adc8;line-height:1.5;word-break:break-word">
      Watching for tasks…
    </div>
    <div id="naa-progress-wrap" style="margin-top:8px;display:none">
      <div style="background:#313244;border-radius:4px;height:4px;overflow:hidden">
        <div id="naa-bar"
          style="background:#89b4fa;height:100%;width:0%;transition:width .4s ease"></div>
      </div>
    </div>
  `;
  document.body.appendChild(el);
}

function setStatus(text, color = '#a6adc8', dot = '#22c55e') {
  const s = document.getElementById('naa-status');
  const d = document.getElementById('naa-dot');
  if (s) s.textContent = text;
  if (d) d.style.background = dot;
  chrome.runtime.sendMessage({ type: 'LOG_ACTIVITY', text }).catch(() => {});
}

function setProgress(pct) {
  const wrap = document.getElementById('naa-progress-wrap');
  const bar  = document.getElementById('naa-bar');
  if (!wrap || !bar) return;
  if (pct === null) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  bar.style.width = `${pct}%`;
}

// ── Auth header capture — received from auth_bridge.js (MAIN world) ───────────
document.addEventListener('naa_auth_captured', (e) => {
  if (e.detail?.authorization) {
    state.authHeaders = {
      authorization: e.detail.authorization,
      clientId:      e.detail.clientId,
      clientSecret:  e.detail.clientSecret,
    };
  }
});

// ── Monaco editor index — received from page_bridge.js (MAIN world) ──────────
document.addEventListener('naa_editor_found', (e) => {
  if (typeof e.detail?.idx === 'number') {
    state.monacoEditorIdx = e.detail.idx;
  }
});

// ── Background messaging ──────────────────────────────────────────────────────
async function requestSolve(payload) {
  return chrome.runtime.sendMessage({
    type: 'SOLVE',
    payload: { ...payload, auth_headers: state.authHeaders },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// MCQ SOLVER
// ═════════════════════════════════════════════════════════════════════════════

function getQuestionCounter() {
  const re = /^Question\s+(\d+)\/(\d+)$/;
  for (const el of document.querySelectorAll('*')) {
    if (el.children.length > 0) continue;
    const m = el.textContent.trim().match(re);
    if (m) return { current: +m[1], total: +m[2] };
  }
  return null;
}

function extractMCQ() {
  const qEl = document.querySelector('[class*="khXJqZ"]');
  if (!qEl) return null;

  const optEls = document.querySelectorAll('[class*="xZkUk"]');
  if (!optEls.length) return null;

  return {
    question: qEl.textContent.trim(),
    options:  Array.from(optEls).map((o) => o.textContent.trim()),
  };
}

async function solveOneQuestion(q, current, total) {
  setStatus(`Solving Q${current}/${total}…`, '#89b4fa', '#89b4fa');
  setProgress(((current - 1) / total) * 100);

  const result = await requestSolve({
    task_type: 'mcq',
    question:  q.question,
    options:   q.options,
  });

  if (result?.error) {
    setStatus(`Error: ${result.error}`, '#f38ba8', '#f38ba8');
    return false;
  }

  const idx = parseInt(result.answer, 10);
  if (Number.isNaN(idx) || idx < 0 || idx >= q.options.length) {
    setStatus(`Bad answer index "${result.answer}"`, '#f38ba8', '#f38ba8');
    return false;
  }

  const targets = document.querySelectorAll('[class*="llwSLD"]');
  if (!targets[idx]) {
    setStatus(`Option element [${idx}] not found`, '#f38ba8', '#f38ba8');
    return false;
  }

  targets[idx].click();
  setStatus(`Q${current}: picked option ${idx + 1} — "${q.options[idx]}"`, '#a6e3a1', '#22c55e');
  await sleep(400);
  return true;
}

async function runMCQ() {
  if (state.solving) return;
  state.solving = true;

  try {
    // Wait briefly for DOM to settle after navigation
    await sleep(1200);

    for (let attempt = 0; attempt < 200; attempt++) {
      // Wait for question element
      await waitForElement('[class*="khXJqZ"]', 10000).catch(() => null);
      await sleep(300);

      const counter = getQuestionCounter();
      const q = extractMCQ();
      if (!q) {
        setStatus('Question elements not found', '#f38ba8', '#f38ba8');
        break;
      }

      const current = counter?.current ?? attempt + 1;
      const total   = counter?.total   ?? 1;

      const ok = await solveOneQuestion(q, current, total);
      if (!ok) break;

      await sleep(300);

      if (current >= total) {
        // Last question — submit
        const submitBtn = document.querySelector('[class*="kMLgyQ"]');
        if (submitBtn) {
          submitBtn.click();
          setProgress(100);
          setStatus(`Quiz submitted! (${total} questions answered)`, '#a6e3a1', '#22c55e');
          chrome.runtime.sendMessage({ type: 'INCREMENT_SOLVED' }).catch(() => {});
        } else {
          setStatus('Submit button not found', '#f38ba8', '#f38ba8');
        }
        break;
      }

      // Click Next
      const nextBtn = document.querySelector('[class*="hKkMVS"]');
      if (!nextBtn) {
        setStatus('Next button not found', '#f38ba8', '#f38ba8');
        break;
      }

      const prevText = q.question;
      nextBtn.click();

      // Wait for question to change
      let waited = 0;
      while (waited < 6000) {
        await sleep(300);
        waited += 300;
        const el = document.querySelector('[class*="khXJqZ"]');
        if (el && el.textContent.trim() !== prevText) break;
      }
    }
  } catch (err) {
    setStatus(`MCQ error: ${err.message}`, '#f38ba8', '#f38ba8');
    console.error('[Newton AI] MCQ error', err);
  } finally {
    state.solving = false;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// CODING SOLVER
// ═════════════════════════════════════════════════════════════════════════════

function getEditor(idx) {
  // Cannot access monaco directly from isolated world
  // Use page_bridge via CustomEvents instead
  return null;
}

async function waitForMonaco(timeout = 20000) {
  const start = Date.now();
  state.monacoEditorIdx = null;

  await sleep(2000); // let Monaco finish mounting

  while (Date.now() - start < timeout) {
    document.dispatchEvent(new CustomEvent('naa_find_editor'));
    await sleep(800);
    if (state.monacoEditorIdx !== null) return { idx: state.monacoEditorIdx };
  }
  return null;
}

async function setEditorCode(editorRef, code) {
  return new Promise((resolve) => {
    const handler = (e) => {
      document.removeEventListener('naa_set_code_result', handler);
      resolve(e.detail?.ok ?? false);
    };
    document.addEventListener('naa_set_code_result', handler);
    document.dispatchEvent(new CustomEvent('naa_set_code', {
      detail: { idx: editorRef.idx, code }
    }));
    setTimeout(() => { document.removeEventListener('naa_set_code_result', handler); resolve(false); }, 3000);
  });
}

async function dismissPopup(text) {
  await sleep(700);
  const btn = findButtonByText(text);
  if (btn) { btn.click(); await sleep(300); }
}

async function waitForExecution(timeoutMs = 30000) {
  await sleep(2000);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await new Promise((resolve) => {
      const handler = (e) => {
        document.removeEventListener('naa_output_result', handler);
        resolve(e.detail);
      };
      document.addEventListener('naa_output_result', handler);
      document.dispatchEvent(new CustomEvent('naa_get_output'));
      setTimeout(() => { document.removeEventListener('naa_output_result', handler); resolve({ output: '', error: '' }); }, 2000);
    });

    if (result.output || result.error) return result;
    await sleep(800);
  }
  return { output: '', error: '' };
}

function extractProblemDescription() {
  // Primary: exact class fragment found by DOM inspection
  const primary = document.querySelector('[class*="sc-3ef8580b-6"]');
  if (primary) {
    const text = (primary.innerText || '').trim();
    if (text.length > 60) return text.substring(0, 6000);
  }

  // Secondary: the clean description div without title/header
  const secondary = document.querySelector('[class*="sc-3ef8580b-11"]');
  if (secondary) {
    const text = (secondary.innerText || '').trim();
    if (text.length > 60) return text.substring(0, 6000);
  }

  // Fallback: find div with no-text-select class containing problem text
  let best = '';
  document.querySelectorAll('div[class*="no-text-select"]').forEach(div => {
    if (div.closest('.monaco-editor') || div.id === 'naa-overlay') return;
    const text = (div.innerText || '').trim();
    if (text.length > best.length && text.length < 8000) best = text;
  });
  if (best.length > 60) return best.substring(0, 6000);

  // Last resort
  return 'Solve the given programming problem using the starter code provided.';
}

function extractExampleInput() {
  const panel = document.querySelector('[class*="sc-3ef8580b-6"]');
  if (!panel) return '';
  const text = panel.innerText || '';
  const inputMatch = text.match(/(?:Input|INPUT)\s*\n([\s\S]*?)(?:\n(?:Output|OUTPUT|Example|Constraints))/);
  if (inputMatch) return inputMatch[1].trim();
  const exampleMatch = text.match(/(?:Example|EXAMPLE)[\s\S]*?(?:Input|INPUT)\s*\n([\s\S]*?)(?:\n(?:Output|OUTPUT))/);
  if (exampleMatch) return exampleMatch[1].trim();
  return '';
}

async function fillInputEditor(inputText) {
  if (!inputText || !inputText.trim()) return;
  const tabs = document.querySelectorAll('[class*="sc-7172b4-4"]');
  for (const tab of tabs) {
    if (tab.textContent.trim() === 'INPUT') {
      tab.click();
      await sleep(500);
      break;
    }
  }
  return new Promise((resolve) => {
    const handler = (e) => {
      document.removeEventListener('naa_set_code_result', handler);
      resolve(e.detail?.ok ?? false);
    };
    document.addEventListener('naa_set_code_result', handler);
    document.dispatchEvent(new CustomEvent('naa_set_code', {
      detail: { idx: 0, code: inputText }
    }));
    setTimeout(() => {
      document.removeEventListener('naa_set_code_result', handler);
      resolve(false);
    }, 3000);
  });
}

async function runCoding() {
  if (state.solving) return;
  state.solving = true;

  try {
    setStatus('Waiting for Monaco editor…', '#fab387', '#fab387');
    setProgress(5);

    const editor = await waitForMonaco(15000);
    if (!editor) {
      setStatus('Monaco editor not found', '#f38ba8', '#f38ba8');
      return;
    }

    // Get starter code via bridge
    const starterCode = await new Promise((resolve) => {
      const handler = (e) => {
        document.removeEventListener('naa_code_result', handler);
        resolve(e.detail?.code ?? '');
      };
      document.addEventListener('naa_code_result', handler);
      document.dispatchEvent(new CustomEvent('naa_get_code', { detail: { idx: editor.idx } }));
      setTimeout(() => { document.removeEventListener('naa_code_result', handler); resolve(''); }, 3000);
    });

    // Detect language from editor dropdown text
    const langEl = document.querySelector('[class*="sc-6e1082ef-2"]')
                || document.querySelector('[class*="cOVIPX"]');
    const langText = langEl?.textContent?.trim()?.toLowerCase() ?? '';
    const language = langText.includes('python') ? 'python'
      : langText.includes('typescript') ? 'typescript'
      : langText.includes('javascript') ? 'javascript'
      : langText.includes('java') ? 'java'
      : langText.includes('c++') || langText.includes('cpp') ? 'cpp'
      : 'typescript';

    const problem = extractProblemDescription();

    setStatus(`Generating ${language} solution…`, '#89b4fa', '#89b4fa');
    setProgress(20);

    let lastError = '';

    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) {
        setStatus(`Retry ${attempt}/3 with error context…`, '#fab387', '#fab387');
      }

      const result = await requestSolve({
        task_type:     'coding',
        question:      problem,
        language,
        starter_code:  starterCode,
        error_context: lastError || undefined,
      });

      if (result?.error) {
        setStatus(`Solver: ${result.error}`, '#f38ba8', '#f38ba8');
        break;
      }

      const solution = result.answer;
      setProgress(45);

      // Write solution into editor
      await setEditorCode(editor, solution);
      await sleep(500);
      await dismissPopup('Keep Paste');

      // Run
      setStatus(`Running code (attempt ${attempt}/3)…`, '#89b4fa', '#89b4fa');
      setProgress(55);

      const exampleInput = extractExampleInput();
      if (exampleInput) {
        await fillInputEditor(exampleInput);
        await sleep(300);
      }

      const runBtn = document.querySelector('[class*="dMnLDi"]');
      if (!runBtn) {
        setStatus('Run button not found', '#f38ba8', '#f38ba8');
        break;
      }
      runBtn.click();
      await dismissPopup('Keep Paste'); // second popup sometimes appears after run

      setProgress(65);
      const { output, error } = await waitForExecution(25000);
      setProgress(80);

      // Check submission results after clicking submit
      const submitBtn = document.querySelector('[class*="dAAjdS"]');
      if (!submitBtn) {
        setStatus('Submit button not found', '#f38ba8', '#f38ba8');
        break;
      }

      submitBtn.click();
      await dismissPopup('Submit anyway');
      await sleep(4000); // wait for test results to load

      // Check if all test cases passed
      const failedTests = document.querySelectorAll('[class*="sc-"] svg[class*="red"], [class*="sc-"] [class*="error"], [class*="sc-"] [class*="failed"]');
      const passedAll = document.querySelectorAll('[class*="sc-"] [class*="pass"], [class*="sc-"] [class*="success"]').length > 0
                     && failedTests.length === 0;

      // Get test case results text for error context
      const resultsPanel = document.querySelector('[class*="sc-"][class*="submission"], [class*="sc-"][class*="result"]');
      const resultsText = resultsPanel?.innerText ?? '';

      const hasRuntimeError = error &&
        !error.startsWith('Running Code') &&
        (error.includes('Error') || error.includes('Traceback') ||
         error.includes('exception') || error.toLowerCase().includes('failed'));

      if (passedAll) {
        setProgress(100);
        setStatus('All test cases passed! ✅', '#a6e3a1', '#22c55e');
        chrome.runtime.sendMessage({ type: 'INCREMENT_SOLVED' }).catch(() => {});
        break;
      }

      if (attempt < 3) {
        lastError = `Attempt ${attempt} failed.\nTest Results:\n${resultsText}\nSTDERR:\n${error}\nSTDOUT:\n${output}`;
        setStatus(`Attempt ${attempt}/3 failed — retrying with error context…`, '#fab387', '#fab387');
        await sleep(1500);
        continue;
      }

      // Max attempts reached
      setProgress(100);
      setStatus(`Submitted (${attempt} attempts — check results)`, '#f9e2af', '#f9e2af');
      chrome.runtime.sendMessage({ type: 'INCREMENT_SOLVED' }).catch(() => {});
      break;
    }
  } catch (err) {
    setStatus(`Coding error: ${err.message}`, '#f38ba8', '#f38ba8');
    console.error('[Newton AI] Coding error', err);
  } finally {
    state.solving = false;
  }
}

// ═══════════════════════════════════════════════════════
// LIVE QUIZ SOLVER  (/lecture/*/live)
// ═══════════════════════════════════════════════════════

function extractLiveQuiz() {
  const qEl = document.querySelector('[class*="sc-f9e3e3ee-4"]');
  if (!qEl) return null;

  const optEls = document.querySelectorAll('[class*="sc-5a2039c7-15"]');
  if (!optEls.length) return null;

  const counterEl = document.querySelector('[class*="sc-5a2039c7-5"]');
  const counterText = counterEl?.textContent?.trim() ?? '';
  const counterMatch = counterText.match(/Question\s+(\d+)/);
  const current = counterMatch ? parseInt(counterMatch[1]) : 1;

  return {
    question: qEl.textContent.trim(),
    options: Array.from(optEls).map((o) => o.textContent.trim()),
    current,
  };
}

function clickLiveOption(idx) {
  const wrappers = document.querySelectorAll('[class*="sc-67e9c95b-3"]');
  if (wrappers[idx]) {
    wrappers[idx].click();
    return true;
  }
  const optEls = document.querySelectorAll('[class*="sc-5a2039c7-15"]');
  if (optEls[idx]) {
    optEls[idx].click();
    return true;
  }
  return false;
}

function getLiveNextButton() {
  for (const btn of document.querySelectorAll('button[class*="sc-bb799bb6-1"]')) {
    if (btn.textContent.trim() === 'Next') return btn;
  }
  return null;
}

function getLiveSubmitButton() {
  for (const btn of document.querySelectorAll('button[class*="sc-bb799bb6-1"]')) {
    const t = btn.textContent.trim();
    if (t === 'Submit' || t === 'Finish' || t === 'Done') return btn;
  }
  return null;
}

function getTotalLiveQuestions() {
  let max = 0;
  document.querySelectorAll('[class*="sc-"]').forEach((el) => {
    const m = el.textContent.trim().match(/^Q(\d+)\./);
    if (m) max = Math.max(max, parseInt(m[1]));
  });
  return max || null;
}

async function runLiveQuiz() {
  if (state.solving) return;
  state.solving = true;

  setStatus('Live quiz detected — starting…', '#89b4fa', '#89b4fa');

  try {
    await sleep(1500);

    for (let attempt = 0; attempt < 100; attempt++) {
      await waitForElement('[class*="sc-f9e3e3ee-4"]', 10000).catch(() => null);
      await sleep(400);

      const q = extractLiveQuiz();
      if (!q) {
        setStatus('Could not read question', '#f38ba8', '#f38ba8');
        break;
      }

      const total = getTotalLiveQuestions() ?? q.current;
      setStatus(`Solving Q${q.current}/${total}…`, '#89b4fa', '#89b4fa');
      setProgress(((q.current - 1) / total) * 100);

      const result = await requestSolve({
        task_type: 'mcq',
        question:  q.question,
        options:   q.options,
      });

      if (result?.error) {
        setStatus(`Error: ${result.error}`, '#f38ba8', '#f38ba8');
        break;
      }

      const idx = parseInt(result.answer, 10);
      if (isNaN(idx) || idx < 0 || idx >= q.options.length) {
        setStatus(`Bad answer: "${result.answer}"`, '#f38ba8', '#f38ba8');
        break;
      }

      const clicked = clickLiveOption(idx);
      if (!clicked) {
        setStatus(`Option ${idx} not found`, '#f38ba8', '#f38ba8');
        break;
      }

      setStatus(
        `Q${q.current}: picked "${q.options[idx]}"`,
        '#a6e3a1', '#22c55e'
      );
      await sleep(500);

      const submitBtn = getLiveSubmitButton();
      const nextBtn   = getLiveNextButton();

      if (submitBtn) {
        submitBtn.click();
        setProgress(100);
        setStatus(`Quiz submitted! (${total} questions answered)`, '#a6e3a1', '#22c55e');
        chrome.runtime.sendMessage({ type: 'INCREMENT_SOLVED' }).catch(() => {});
        break;
      }

      if (!nextBtn) {
        setStatus('Next button not found — stopping', '#f38ba8', '#f38ba8');
        break;
      }

      const prevQuestion = q.question;
      nextBtn.click();

      let waited = 0;
      while (waited < 8000) {
        await sleep(300);
        waited += 300;
        const el = document.querySelector('[class*="sc-f9e3e3ee-4"]');
        if (el && el.textContent.trim() !== prevQuestion) break;
      }
    }
  } catch (err) {
    setStatus(`Live quiz error: ${err.message}`, '#f38ba8', '#f38ba8');
    console.error('[Newton AI] Live quiz error', err);
  } finally {
    state.solving = false;
    setProgress(null);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE DETECTION & INIT
// ═════════════════════════════════════════════════════════════════════════════

function classifyPage() {
  const p = window.location.pathname;
  if (p.includes('/assessment/'))   return 'mcq';
  if (p.includes('/playground/code/')) return 'coding';
  if (p.includes('/live')) return 'live_quiz';
  return null;
}

async function initPage() {
  const { enabled } = await chrome.storage.sync.get({ enabled: true });
  state.enabled = enabled;

  if (!state.enabled) {
    setStatus('Disabled — toggle in popup', '#585b70', '#6b7280');
    setProgress(null);
    return;
  }

  const kind = classifyPage();
  if (!kind) {
    setStatus('Watching for tasks…', '#a6adc8', '#22c55e');
    setProgress(null);
    return;
  }

  if (kind === 'mcq') {
    setStatus('MCQ detected — starting…', '#89b4fa', '#89b4fa');
    runMCQ();
  } else if (kind === 'live_quiz') {
    setStatus('Live quiz detected — starting…', '#89b4fa', '#89b4fa');
    runLiveQuiz();
  } else if (kind === 'coding' && !state.codingInitialized) {
    state.codingInitialized = true;
    setStatus('Coding challenge detected…', '#89b4fa', '#89b4fa');
    await sleep(2000); // let Monaco finish mounting
    runCoding();
  }
}

// ── SPA navigation watcher ────────────────────────────────────────────────────
let lastPath = window.location.pathname;

new MutationObserver(() => {
  const cur = window.location.pathname;
  if (cur !== lastPath) {
    lastPath = cur;
    state.solving = false;
    state.codingInitialized = false;
    setProgress(null);
    setTimeout(initPage, 800);
  }
}).observe(document.body, { childList: true, subtree: true });

// ── Messages from popup / background ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SET_ENABLED') {
    state.enabled = msg.enabled;
    if (msg.enabled) {
      setStatus('Enabled — scanning…', '#a6e3a1', '#22c55e');
      initPage();
    } else {
      state.solving = false;
      setStatus('Disabled', '#585b70', '#6b7280');
      setProgress(null);
    }
  }
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
(async function main() {
  buildOverlay();
  await initPage();
})();
