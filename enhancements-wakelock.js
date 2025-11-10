// enhancements-wakelock.js
// Adds a "Display always on" toggle to keep the screen awake.
// - Uses Screen Wake Lock API if available
// - Falls back to NoSleep.js (loaded from CDN) if Wake Lock not supported
// - Persists requested state in localStorage ('keepScreenOn')
// - Re-acquires wake lock on visibilitychange / page show when appropriate
// - Releases on toggle off / unload
//
// NOTE: place <script src="enhancements-wakelock.js"></script> after app.js in index.html
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
      s.onerror = () => reject(new Error('NoSleep load failed'));
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
    btn.style.minWidth = '160px';
    btn.style.fontWeight = '700';
    // color requested by user: black
    btn.style.background = '#000000';
    btn.style.color = '#ffffff';
    btn.title = 'Display dauerhaft anhalten (verhindert Standby). Klick zum Aktivieren/Deaktivieren.';

    function setText(on) {
      // Label exactly as requested
      btn.textContent = on ? 'Display always on' : 'Display always on';
      // (Keep same label for both states — visual state is indicated via appearance)
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

    // Insert button between Import and Reset:
    // - If import button exists (id importCsvStatsBtn) place our button after it
    // - Else, insert before Reset button (id resetBtn)
    // - Else append to topBar end
    const importBtn = document.getElementById('importCsvStatsBtn');
    const resetBtn = document.getElementById('resetBtn');
    try {
      if (importBtn && importBtn.parentNode === topBar) {
        // insert after importBtn
        if (importBtn.nextSibling) topBar.insertBefore(btn, importBtn.nextSibling);
        else topBar.appendChild(btn);
      } else if (resetBtn && resetBtn.parentNode === topBar) {
        topBar.insertBefore(btn, resetBtn);
      } else {
        // fallback: append to end
        topBar.appendChild(btn);
      }
    } catch (e) {
      topBar.appendChild(btn);
    }

    // set initial visual state from localStorage
    const initial = localStorage.getItem(STORAGE_KEY) === '1';
    btn.dataset.on = initial ? '1' : '0';
    // visual indicator: use border when ON
    if (initial) {
      btn.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.08) inset';
      btn.style.filter = 'brightness(1.06)';
    } else {
      btn.style.boxShadow = '';
      btn.style.filter = '';
    }

    // expose setter used elsewhere
    btn._setText = setText;
    return btn;
  }

  function updateButtonState(on) {
    const btn = document.getElementById('displayWakeLockBtn') || createToggleButton();
    if (!btn) return;
    // Label remains "Display always on" per user request. Use visual cues for state.
    btn._setText(Boolean(on));
    btn.dataset.on = on ? '1' : '0';
    if (on) {
      btn.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.08) inset';
      btn.style.filter = 'brightness(1.06)';
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.style.boxShadow = '';
      btn.style.filter = '';
      btn.setAttribute('aria-pressed', 'false');
    }
  }

  // Initialize: add button and wire up events
  function init() {
    const btn = createToggleButton();
    // If previously requested but not currently active, we can't auto-acquire without gesture.
    // So we just reflect stored intent in the button appearance.
    const wanted = localStorage.getItem(STORAGE_KEY) === '1';
    updateButtonState(wanted);

    // Visibility handling
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', async () => {
      // Release lock on pagehide to be polite; it will be re-acquired on visible if requested and allowed.
      try { await releaseWakeLockAPI(); } catch (e) {}
    });

    // On unload, release resources
    window.addEventListener('beforeunload', async () => {
      try { await releaseWakeLockAPI(); } catch (e) {}
      disableNoSleep();
    });

    // Best-effort re-request if wanted and UA allows (cannot guarantee without user gesture)
    if (wanted && document.visibilityState === 'visible') {
      (async () => {
        if ('wakeLock' in navigator) {
          try { await requestWakeLockAPI(); updateButtonState(Boolean(wakeLock)); } catch (e) {}
        }
      })();
    }

    // If import button is added later (app.js creates it dynamically), ensure our position is updated
    const topBar = document.querySelector('#statsPage .top-bar');
    if (topBar) {
      const mo = new MutationObserver(() => {
        // re-run creation/placement logic to ensure correct order
        createToggleButton();
        updateButtonState(localStorage.getItem(STORAGE_KEY) === '1');
      });
      mo.observe(topBar, { childList: true, subtree: false });
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
