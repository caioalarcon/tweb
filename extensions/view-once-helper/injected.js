(() => {
  const state = {
    ttlSeconds: null,
  };

  window.addEventListener('tweb-view-once:set-ttl', (event) => {
    state.ttlSeconds = event.detail === null ? null : Number(event.detail);
    console.info('[view-once-helper] TTL set to', state.ttlSeconds);
  });

  function cloneOptions(options) {
    try {
      return structuredClone(options);
    } catch (_) {
      return { ...options };
    }
  }

  function applyTtlToOptions(options) {
    if(typeof options !== 'object' || !options) return options;
    const ttl = state.ttlSeconds;
    if(options.media && Array.isArray(options.media)) {
      options.media = options.media.map(applyTtlToOptions);
    }
    if(options.message) {
      options.message = applyTtlToOptions(options.message);
    }
    if(ttl === null) return options;
    const patched = cloneOptions(options);
    if(ttl === 0) {
      patched.ttl_seconds = 1;
    } else {
      patched.ttl_seconds = ttl;
    }
    if(patched.pFlags) patched.pFlags.ttl_seconds = true;
    return patched;
  }

  function findCandidate(obj) {
    if(!obj || typeof obj !== 'object') return false;
    return typeof obj.sendFile === 'function'
      && typeof obj.sendTextMessage === 'function'
      && typeof obj.sendMultiMedia === 'function';
  }

  function locateAppMessagesManager() {
    const w = window;
    if(findCandidate(w.appMessagesManager)) return w.appMessagesManager;
    if(findCandidate(w.managers?.appMessagesManager)) return w.managers.appMessagesManager;
    for(const key of Object.keys(w)) {
      try {
        if(findCandidate(w[key])) return w[key];
      } catch (_) {}
    }
    return null;
  }

  function patchSendFile(manager) {
    if(!manager || manager.__viewOncePatched) return;
    const original = manager.sendFile.bind(manager);
    manager.sendFile = function patchedSendFile(opts) {
      const patched = applyTtlToOptions(opts);
      return original(patched);
    };
    manager.__viewOncePatched = true;
    console.info('[view-once-helper] sendFile patched with TTL support');
  }

  function tick() {
    const manager = locateAppMessagesManager();
    if(manager) {
      patchSendFile(manager);
      return true;
    }
    return false;
  }

  tick();
  const interval = setInterval(() => {
    if(tick()) {
      clearInterval(interval);
    }
  }, 1500);
})();
