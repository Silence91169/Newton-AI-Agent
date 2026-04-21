// Newton AI Agent — Auth Bridge
// Declared in manifest.json with "world": "MAIN" so it runs in the page's
// JS context and can patch window.fetch / XMLHttpRequest.
// Communicates with content.js (isolated world) via CustomEvents on document.
'use strict';

(function () {
  // Decode a JWT payload (base64url → JSON). Returns null if not a valid JWT.
  function decodeJwt(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
      return JSON.parse(atob(padded));
    } catch {
      return null;
    }
  }

  let lastCapturedId = null; // deduplicate — avoid re-dispatching for the same user

  function capture(auth, cid, csec) {
    if (!auth || !auth.startsWith('Bearer ')) return;

    // Dispatch raw auth headers (for existing usage in content.js)
    document.dispatchEvent(new CustomEvent('naa_auth_captured', {
      detail: {
        authorization: auth,
        clientId:      cid  || '',
        clientSecret:  csec || '',
      },
    }));

    // Decode JWT to extract Newton user identity
    const token   = auth.slice(7); // strip 'Bearer '
    const payload = decodeJwt(token);
    if (!payload) return;

    // Try common JWT claim names used by Newton / backend frameworks
    const id       = String(payload.user_id || payload.id || payload.sub || '');
    const email    = payload.email    || null;
    const username = payload.username || payload.name || payload.preferred_username || null;

    if (!id && !email) return; // nothing useful to surface
    if (id && id === lastCapturedId) return; // same session, skip
    lastCapturedId = id || null;

    document.dispatchEvent(new CustomEvent('naa_user_captured', {
      detail: { id, email, username },
    }));
  }

  // Patch fetch
  const _fetch = window.fetch;
  window.fetch = function (resource, init) {
    init = init || {};
    const h   = init.headers || {};
    const get = (k) => (h instanceof Headers ? h.get(k) : h[k] || h[k.toLowerCase()] || '');
    capture(get('Authorization'), get('Client-Id'), get('Client-Secret'));
    return _fetch.apply(this, arguments);
  };

  // Patch XHR
  const _open = XMLHttpRequest.prototype.open;
  const _setH = XMLHttpRequest.prototype.setRequestHeader;
  const _send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function () {
    this.__naaH = {};
    return _open.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    if (this.__naaH) this.__naaH[k] = v;
    return _setH.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    const h = this.__naaH || {};
    capture(h['Authorization'], h['Client-Id'], h['Client-Secret']);
    return _send.apply(this, arguments);
  };
})();
