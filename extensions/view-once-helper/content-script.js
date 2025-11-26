// Content script injected into web.telegram.org
// Provides a small UI control to select view-once/TTL and propagates selection
// into the page context where sendFile is patched.

const STORAGE_KEY = 'tweb-view-once-helper:ttl';
const TTL_OPTIONS = [
  { value: null, label: 'No timer' },
  { value: 0, label: 'View once' },
  { value: 3, label: '3s' },
  { value: 10, label: '10s' },
  { value: 30, label: '30s' },
];

function readStoredTtl() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) return null;
    const parsed = JSON.parse(saved);
    return typeof parsed === 'number' ? parsed : null;
  } catch (err) {
    console.warn('[view-once-helper] failed to read stored TTL', err);
    return null;
  }
}

function persistTtl(value) {
  try {
    if (value === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    }
  } catch (err) {
    console.warn('[view-once-helper] failed to persist TTL', err);
  }
}

function dispatchTtlToPage(value) {
  window.dispatchEvent(
    new CustomEvent('tweb-view-once:set-ttl', { detail: value })
  );
}

function createUi() {
  const container = document.createElement('div');
  container.id = 'tweb-view-once-helper';
  container.style.position = 'fixed';
  container.style.bottom = '12px';
  container.style.right = '12px';
  container.style.zIndex = '2147483647';
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.gap = '6px';
  container.style.padding = '8px 10px';
  container.style.borderRadius = '10px';
  container.style.background = 'rgba(0, 0, 0, 0.75)';
  container.style.color = '#fff';
  container.style.fontSize = '13px';
  container.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.25)';
  container.style.backdropFilter = 'blur(8px)';
  container.style.fontFamily = 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  const label = document.createElement('span');
  label.textContent = 'Media TTL:';

  const select = document.createElement('select');
  select.style.background = '#2b2b2b';
  select.style.color = 'white';
  select.style.border = '1px solid rgba(255,255,255,0.2)';
  select.style.borderRadius = '6px';
  select.style.padding = '4px 8px';
  select.style.fontSize = '13px';
  select.style.outline = 'none';
  select.style.minWidth = '140px';

  TTL_OPTIONS.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.value === null ? 'none' : String(opt.value);
    option.textContent = opt.label;
    select.append(option);
  });

  const stored = readStoredTtl();
  if (stored === null) {
    select.value = 'none';
  } else {
    select.value = String(stored);
  }

  select.addEventListener('change', () => {
    const raw = select.value;
    const value = raw === 'none' ? null : Number(raw);
    persistTtl(value);
    dispatchTtlToPage(value);
  });

  container.append(label, select);
  document.body.appendChild(container);

  // First broadcast so page context can pick up stored value.
  dispatchTtlToPage(stored);

  return { container, select };
}

function injectPageHook() {
  const pageHookSource = `(() => {
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
        return {...options};
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
  })();`;

  const blob = new Blob([pageHookSource], { type: 'text/javascript' });
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = URL.createObjectURL(blob);
  script.onload = () => {
    URL.revokeObjectURL(script.src);
  };
  document.documentElement.appendChild(script);
  script.remove();
}

function setupPopupInjection(selectControl) {
  const observer = new MutationObserver(() => {
    const dialogs = document.querySelectorAll('div[role="dialog"], .popup, .modal-dialog');
    dialogs.forEach((dialog) => {
      if(dialog.querySelector('.tweb-view-once-injected')) return;
      const captionArea = dialog.querySelector('textarea, [contenteditable="true"]');
      if(!captionArea) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'tweb-view-once-injected';
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.gap = '6px';
      wrapper.style.marginTop = '8px';
      wrapper.style.padding = '6px 8px';
      wrapper.style.borderRadius = '8px';
      wrapper.style.background = 'var(--tg-theme-secondary-bg-color, rgba(255,255,255,0.07))';

      const label = document.createElement('span');
      label.textContent = 'Media timer:';
      label.style.fontSize = '13px';
      label.style.color = 'var(--tg-theme-text-color, #fff)';

      const popupSelect = document.createElement('select');
      popupSelect.style.flex = '1';
      popupSelect.style.padding = '6px';
      popupSelect.style.borderRadius = '8px';
      popupSelect.style.border = '1px solid var(--tg-theme-hint-color, rgba(255,255,255,0.2))';
      popupSelect.style.background = 'var(--tg-theme-bg-color, #1c1c1c)';
      popupSelect.style.color = 'var(--tg-theme-text-color, #fff)';
      popupSelect.style.fontSize = '13px';

      TTL_OPTIONS.forEach((opt) => {
        const option = document.createElement('option');
        option.value = opt.value === null ? 'none' : String(opt.value);
        option.textContent = opt.label;
        popupSelect.append(option);
      });

      popupSelect.value = selectControl.value;
      popupSelect.addEventListener('change', () => {
        selectControl.value = popupSelect.value;
        const raw = popupSelect.value;
        const value = raw === 'none' ? null : Number(raw);
        persistTtl(value);
        dispatchTtlToPage(value);
      });

      wrapper.append(label, popupSelect);
      captionArea.parentElement?.appendChild(wrapper);
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

(function init() {
  if(!location.hostname.includes('web.telegram.org')) return;
  const { select } = createUi();
  injectPageHook();
  setupPopupInjection(select);
})();

