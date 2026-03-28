// Newton AI Agent — Auth Bridge
// Declared in manifest.json with "world": "MAIN" so it runs in the page's
// JS context and can patch window.fetch / XMLHttpRequest.
// Communicates with content.js (isolated world) via CustomEvents on document.
'use strict';

(function () {
  function capture(auth, cid, csec) {
    if (!auth || !auth.startsWith('Bearer ')) return;
    document.dispatchEvent(new CustomEvent('naa_auth_captured', {
      detail: {
        authorization: auth,
        clientId:      cid  || '',
        clientSecret:  csec || '',
      },
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
