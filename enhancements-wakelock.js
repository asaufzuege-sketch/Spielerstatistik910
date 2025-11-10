// enhancements-wakelock.js
// Adds a "Display ON/OFF" toggle to keep the screen awake.
// - Uses Screen Wake Lock API if available
// - Falls back to NoSleep.js (loaded from CDN) if Wake Lock not supported
// - Persists requested state in localStorage ('keepScreenOn')
// - Re-acquires wake lock on visibilitychange / page show when appropriate
// - Releases on toggle off / unload
(function () {
  const STORAGE_KEY = 'keepScreenOn';
  const NO_SLEEP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/no-sleep/0.12.0/NoSleep.min.js';

  let wakeLock = null;
  let noSleep = null;
  let usingNoSleep = false;

  function log(...args) { console.debug('[wakelock]', ...args); }

  // Request screen wake lock (Screen Wake Lock API)
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

  // Release wake lock if held
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

  // Dynamically load NoSleep.js if not present
  function loadNoSleepScript() {
    return new Promise((resolve, reject) => {
      if (window.NoSleep) return resolve(window.NoSleep);
      const s = document.createElement('script');
      s.src = NO_SLEEP_CDN;
      s.crossOrigin = 'anonymous';
      s.onload = () => {
        resolve(window.NoSleep);
      };
      s.onerror = (e) => reject(e);
      document.head.appendChild(s);
    });
  }

  // Enable NoSleep fallback (plays tiny muted looping video under user gesture)
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

  // Disable NoSleep
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

  // Try to acquire some form of wake lock (API preferred, fallback to NoSleep)
  async function enableKeepScreenOn() {
    // Must be called from user gesture to work reliably
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

  // Release any acquired wake locks
  async function disableKeepScreenOn() {
    try {
      await releaseWakeLockAPI();
    } catch (e) {}
    disableNoSleep();
    localStorage.setItem(STORAGE_KEY, '0');
    updateButtonState(false);
  }

  // Re-request wake lock after visibilitychange (if previously requested)
  async function handleVisibilityChange() {
    try {
      if (document.visibilityState === 'visible') {
        const wanted = localStorage.getItem(STORAGE_KEY) === '1';
        if (wanted) {
          // If API is available, re-acquire. If using NoSleep previously, re-enable it.
          if ('wakeLock' in navigator) {
            await requestWakeLockAPI();
          } else if (!usingNoSleep) {
            await enableNoSleep();
          }
        }
      } else {
        // page hidden: Wake Lock may be auto-released by UA, we'll re-acquire on visible
      }
    } catch (e) {
      console.warn('Visibility handler error:', e);
    }
  }

  // Create the toggle button in the Stats top-bar
  function createToggleButton() {
    // ensure top-bar exists
    const topBar = document.querySelector('#statsPage .top-bar');
    if (!topBar) return null;
    if (document.getElementById('displayWakeLockBtn')) return document.getElementById('displayWakeLockBtn');

    const btn = document.createElement('button');
    btn.id = 'displayWakeLockBtn';
    btn.className = 'top-btn';
    btn.style.minWidth = '140px';
    btn.style.fontWeight = '700';
    btn.style.background = '#304ffe';
    btn.style.color = '#fff';
    btn.title = 'Display dauerhaft anhalten (verhindert Standby). Klick zum Aktivieren/Deaktivieren.';

    function setText(on) {
      btn.textContent = on ? 'Display ON' : 'Display OFF';
    }

    btn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const cur = localStorage.getItem(STORAGE_KEY) === '1';
      if (!cur) {
        // enabling requires user gesture -> call enable
        await enableKeepScreenOn();
      } else {
        await disableKeepScreenOn();
      }
    });

    topBar.appendChild(btn);
    // set initial visual state from localStorage (note: actual lock must be re-requested by user gesture)
    const initial = localStorage.getItem(STORAGE_KEY) === '1';
    setText(initial);
    btn.dataset.on = initial ? '1' : '0';

    // expose setter used elsewhere
    btn._setText = setText;
    return btn;
  }

  function updateButtonState(on) {
    const btn = document.getElementById('displayWakeLockBtn') || createToggleButton();
    if (!btn) return;
    btn._setText(Boolean(on));
    btn.dataset.on = on ? '1' : '0';
    btn.style.filter = on ? 'brightness(1.06)' : '';
  }

  // Initialize: add button and wire up events
  function init() {
    const btn = createToggleButton();
    // If previously requested but not currently active, we can't auto-acquire without gesture.
    // So we just reflect stored intent in the button label.
    const wanted = localStorage.getItem(STORAGE_KEY) === '1';
    updateButtonState(wanted);

    // Visibility handling
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', async () => {
      // On mobile, optionally keep the lock? we release to be polite
      // but if you want to persist across pages, comment this out.
      // We'll release to avoid leaks.
      try { await releaseWakeLockAPI(); } catch (e) {}
    });

    // On unload, release resources
    window.addEventListener('beforeunload', async () => {
      try { await releaseWakeLockAPI(); } catch (e) {}
      disableNoSleep();
    });

    // If the user stored ON and OS supports wakeLock API AND page is visible,
    // we can't automatically re-acquire without a user gesture — but for modern browsers,
    // a subsequent user interaction (clicking the button) will enable it.
    // We still attempt to request if the UA allows (some UAs allow re-request on page show).
    if (wanted && document.visibilityState === 'visible') {
      // best-effort (may fail if no user gesture)
      (async () => {
        if ('wakeLock' in navigator) {
          try { await requestWakeLockAPI(); updateButtonState(Boolean(wakeLock)); } catch(e){ }
        }
      })();
    }
  }

  // Run when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // expose helpers for debugging
  window._enableKeepScreenOn = enableKeepScreenOn;
  window._disableKeepScreenOn = disableKeepScreenOn;
})();
