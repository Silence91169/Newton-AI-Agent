// Newton AI Agent — Page Bridge (MAIN world)
'use strict';

(function () {

  // ── Find editor ──────────────────────────────────────────────────────────
  document.addEventListener('naa_find_editor', function () {
    try {
      const editors = window.monaco?.editor?.getEditors?.() ?? [];
      let bestIdx = -1;
      let bestLen = 0;
      editors.forEach(function (ed, i) {
        const lang = ed.getModel?.()?.getLanguageId?.() ?? '';
        const val  = ed.getModel?.()?.getValue?.()      ?? '';
        if (lang === 'plaintext' || val.length === 0) return;
        if (val.length > bestLen) { bestLen = val.length; bestIdx = i; }
      });
      if (bestIdx !== -1) {
        document.dispatchEvent(new CustomEvent('naa_editor_found', {
          detail: { idx: bestIdx }
        }));
      }
    } catch (_) {}
  });

  // ── Get editor value ─────────────────────────────────────────────────────
  document.addEventListener('naa_get_code', function (e) {
    try {
      const idx = e.detail?.idx ?? 1;
      const val = window.monaco?.editor?.getEditors?.()[idx]?.getValue?.() ?? '';
      document.dispatchEvent(new CustomEvent('naa_code_result', {
        detail: { code: val, idx }
      }));
    } catch (_) {
      document.dispatchEvent(new CustomEvent('naa_code_result', { detail: { code: '', idx: -1 } }));
    }
  });

  // ── Set editor value ─────────────────────────────────────────────────────
  document.addEventListener('naa_set_code', function (e) {
    try {
      const { idx, code } = e.detail;
      const editor = window.monaco?.editor?.getEditors?.()[idx];
      if (!editor) {
        document.dispatchEvent(new CustomEvent('naa_set_code_result', { detail: { ok: false } }));
        return;
      }
      const model = editor.getModel();
      const range = model.getFullModelRange();
      editor.executeEdits('newton-agent', [{ range, text: code, forceMoveMarkers: true }]);
      editor.pushUndoStop();
      document.dispatchEvent(new CustomEvent('naa_set_code_result', { detail: { ok: true } }));
    } catch (err) {
      document.dispatchEvent(new CustomEvent('naa_set_code_result', { detail: { ok: false, error: err.message } }));
    }
  });

  // ── Get output/error editors ─────────────────────────────────────────────
  document.addEventListener('naa_get_output', function () {
    try {
      const editors = window.monaco?.editor?.getEditors?.() ?? [];
      // Find output and error editors (plaintext, non-empty after run)
      let output = '';
      let error  = '';
      editors.forEach(function (ed, i) {
        const lang = ed.getModel?.()?.getLanguageId?.() ?? '';
        const val  = ed.getModel?.()?.getValue?.()      ?? '';
        if (lang === 'plaintext' && val.length > 0 && i !== 0) {
          if (!error && (val.includes('Error') || val.includes('error') || val.includes('Traceback'))) {
            error = val;
          } else if (!output) {
            output = val;
          }
        }
      });
      document.dispatchEvent(new CustomEvent('naa_output_result', {
        detail: { output, error }
      }));
    } catch (_) {
      document.dispatchEvent(new CustomEvent('naa_output_result', { detail: { output: '', error: '' } }));
    }
  });

})();
