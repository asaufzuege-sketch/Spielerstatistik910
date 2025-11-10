// enhancements-wakelock.js
// Robust variant: ensures the "Display always on" button is created even if top-bar / import button are added later,
// logs helpful diagnostics to console, and attempts multiple insertion strategies.
// - Uses Screen Wake Lock API if available
// - Falls back to NoSleep.js (CDN) if needed
// - Persists requested state in localStorage ('keepScreenOn')
// - Re-acquires lock on visibilitychange when possible
// - Releases on toggle off / unload
//
// Place <script src="enhancements-wakelock.js"></script> after app.js in index.html
(function () {
  const STORAGE_KEY = 'keepScreenOn';
  const NO_SLEEP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/no-sleep/0.12.0/NoSleep.min.js';
  const BTN_ID = 'displayWakeLockBtn';

  let wakeLock = null;
  let noSleep = null;
  let usingNoSleep = false;

  function log(...args) { console.debug('[wakelock]', ...args); }

  async function requestWakeLockAPI() {
    if (!('wakeLock' in navigator)) return false;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        log('Wake Lock released');
        wakeLock = null;
      });
      log('Wake Lock acquired (API)');
      return true;
    } catch (err) {
      console.warn('Wake Lock API request failed:', err);
      wakeLock = null;
      return false;
    }
  }

  async function releaseWakeLockAPI() {
    try {
      if (wakeLock && typeof wakeLock.release === 'function') {
        await wakeLock.release();
        wakeLock = null;
        log('Wake Lock API released');
      }
    } catch (err) {
      console.warn('Error releasing Wake Lock API:', err);
      wakeLock = null;
    }
  }

  function loadNoSleepScript() {
    return new Promise((resolve, reject) => {
      if (window.NoSleep) return resolve(window.NoSleep);
      const s = document.createElement('script');
      s.src = NO_SLEEP_CDN;
      s.crossOrigin = 'anonymous';
      s.onload = () => resolve(window.NoSleep);
      s.onerror = (e) => reject(new Error('NoSleep load failed'));
      document.head.appendChild(s);
    });
  }

  async function enableNoSleep() {
    try {
      const NoSleepCtor = window.NoSleep || (await loadNoSleepScript());
      if (!NoSleepCtor) throw new Error('NoSleep not available');
      noSleep = new NoSleepCtor();
      noSleep.enable();
      usingNoSleep = true;
      log('NoSleep enabled (fallback)');
      return true;
    } catch (err) {
      console.warn('NoSleep enable failed:', err);
      noSleep = null;
      usingNoSleep = false;
      return false;
    }
  }

  function disableNoSleep() {
    try {
      if (noSleep && typeof noSleep.disable === 'function') {
        noSleep.disable();
      }
    } catch (e) {
      console.warn('NoSleep disable error:', e);
    } finally {
      noSleep = null;
      usingNoSleep = false;
      log('NoSleep disabled');
    }
  }

  async function enableKeepScreenOn() {
    let ok = false;
    if ('wakeLock' in navigator) {
      ok = await requestWakeLockAPI();
    }
    if (!ok) {
      ok = await enableNoSleep();
    }
    if (ok) {
      localStorage.setItem(STORAGE_KEY, '1');
      updateButtonState(true);
    } else {
      alert('Display-WakeLock konnte nicht aktiviert werden. Prüfe Browser-Unterstützung oder erlaube Medienwiedergabe (für den Fallback).');
      localStorage.setItem(STORAGE_KEY, '0');
      updateButtonState(false);
    }
  }

  async function disableKeepScreenOn() {
    try { await releaseWakeLockAPI(); } catch (e) {}
    disableNoSleep();
    localStorage.setItem(STORAGE_KEY, '0');
    updateButtonState(false);
  }

  async function handleVisibilityChange() {
    try {
      if (document.visibilityState === 'visible') {
        const wanted = localStorage.getItem(STORAGE_KEY) === '1';
        if (wanted) {
          if ('wakeLock' in navigator) {
            await requestWakeLockAPI();
            updateButtonState(Boolean(wakeLock));
          } else if (!usingNoSleep) {
            await enableNoSleep();
            updateButtonState(Boolean(usingNoSleep));
          }
        }
      }
    } catch (e) {
      console.warn('Visibility handler error:', e);
    }
  }

  function findTopBar() {
    return document.querySelector('#statsPage .top-bar') || document.querySelector('.top-bar');
  }

  function findImportButton(topBar) {
    const byId = document.getElementById('importCsvStatsBtn') || document.getElementById('importCsvSeasonBtn');
    if (byId) return byId;
    if (!topBar) return null;
    const candidates = Array.from(topBar.querySelectorAll('button'));
    for (const b of candidates) {
      const txt = (b.textContent || '').trim().toLowerCase();
      if (/import\s*csv|import/i.test(txt)) return b;
    }
    return null;
  }

  function createButtonElement() {
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.className = 'top-btn';
    btn.style.minWidth = '160px';
    btn.style.fontWeight = '700';
    btn.style.background = '#000000';
    btn.style.color = '#ffffff';
    btn.style.margin = '0 6px';
    btn.style.boxSizing = 'border-box';
    btn.title = 'Display dauerhaft anhalten (verhindert Standby). Klick zum Aktivieren/Deaktivieren.';
    btn.setAttribute('aria-pressed', 'false');
    btn.textContent = 'Display always on';
    btn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const cur = localStorage.getItem(STORAGE_KEY) === '1';
      try {
        if (!cur) {
          await enableKeepScreenOn();
        } else {
          await disableKeepScreenOn();
        }
      } catch (err) {
        console.warn('Toggle action failed:', err);
      }
    });
    return btn;
  }

  function insertButtonIntoTopBar() {
    const topBar = findTopBar();
    if (!topBar) {
      log('topBar not found yet');
      return false;
    }
    if (document.getElementById(BTN_ID)) {
      const existing = document.getElementById(BTN_ID);
      if (existing.parentNode !== topBar) topBar.appendChild(existing);
      return true;
    }

    const btn = createButtonElement();
    const importBtn = findImportButton(topBar);
    const resetBtn = document.getElementById('resetBtn') || topBar.querySelector('.reset-btn');

    try {
      if (importBtn && importBtn.parentNode === topBar) {
        if (importBtn.nextSibling) topBar.insertBefore(btn, importBtn.nextSibling);
        else topBar.appendChild(btn);
        log('Inserted Display button after Import button');
      } else if (resetBtn && resetBtn.parentNode === topBar) {
        topBar.insertBefore(btn, resetBtn);
        log('Inserted Display button before Reset button');
      } else {
        topBar.appendChild(btn);
        log('Appended Display button at end of topBar');
      }
    } catch (e) {
      try { topBar.appendChild(btn); } catch (ee) { console.warn('Failed to append button', ee); return false; }
    }

    const initial = localStorage.getItem(STORAGE_KEY) === '1';
    updateButtonState(initial);
    return true;
  }

  function updateButtonState(on) {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    btn.dataset.on = on ? '1' : '0';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) {
      btn.style.boxShadow = 'inset 0 0 0 2px rgba(255,255,255,0.06)';
      btn.style.filter = 'brightness(1.06)';
    } else {
      btn.style.boxShadow = '';
      btn.style.filter = '';
    }
  }

  function ensureInsertedAndObserve() {
    if (insertButtonIntoTopBar()) {
      return;
    }
    const mo = new MutationObserver((muts, observer) => {
      for (const m of muts) {
        if (m.type === 'childList') {
          const tb = findTopBar();
          if (tb) {
            observer.disconnect();
            setTimeout(() => {
              insertButtonIntoTopBar();
              observeTopBarChildren();
            }, 60);
            break;
          }
        }
      }
    });
    mo.observe(document.body || document.documentElement, { childList: true, subtree: true });

    const intId = setInterval(() => {
      if (insertButtonIntoTopBar()) {
        clearInterval(intId);
        observeTopBarChildren();
      }
    }, 400);
    setTimeout(() => clearInterval(intId), 10000);
  }

  function observeTopBarChildren() {
    const topBar = findTopBar();
    if (!topBar) return;
    const mo2 = new MutationObserver(() => {
      try {
        insertButtonIntoTopBar();
        updateButtonState(localStorage.getItem(STORAGE_KEY) === '1');
      } catch (e) { /* ignore */ }
    });
    mo2.observe(topBar, { childList: true, subtree: false });
  }

  function init() {
    try {
      ensureInsertedAndObserve();
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('pagehide', async () => {
        try { await releaseWakeLockAPI(); } catch (e) {}
      });
      window.addEventListener('beforeunload', async () => {
        try { await releaseWakeLockAPI(); } catch (e) {}
        disableNoSleep();
      });

      const wanted = localStorage.getItem(STORAGE_KEY) === '1';
      const btn = document.getElementById(BTN_ID);
      if (btn) updateButtonState(wanted);

      log('enhancements-wakelock initialized (waiting for topBar if needed). previouslyWanted=' + wanted);
    } catch (e) {
      console.error('enhancements-wakelock init failed:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window._enableKeepScreenOn = enableKeepScreenOn;
  window._disableKeepScreenOn = disableKeepScreenOn;
})();
