// Newton AI Agent — Page Bridge
// Declared in manifest.json with "world": "MAIN" so it runs in the page's
// JS context and has full access to window.monaco, window.fetch, etc.
// Communicates with content.js (isolated world) via CustomEvents on document.
'use strict';

// ── Monaco editor finder ──────────────────────────────────────────────────────
// content.js fires  →  document.dispatchEvent(new CustomEvent('naa_find_editor'))
// page_bridge fires →  document.dispatchEvent(new CustomEvent('naa_editor_found', { detail: { idx } }))

document.addEventListener('naa_find_editor', function () {
  try {
    const editors = window.monaco?.editor?.getEditors?.() ?? [];
    let bestIdx = -1;
    let bestLen = 0;

    editors.forEach(function (ed, i) {
      const model = ed.getModel && ed.getModel();
      if (!model) return;
      const lang  = (model.getLanguageId && model.getLanguageId()) || '';
      const value = (model.getValue     && model.getValue())      || '';
      if (lang === 'plaintext' || value.length === 0) return;
      if (value.length > bestLen) {
        bestLen  = value.length;
        bestIdx  = i;
      }
    });

    if (bestIdx !== -1) {
      document.dispatchEvent(
        new CustomEvent('naa_editor_found', { detail: { idx: bestIdx } })
      );
    }
  } catch (_) {}
});
