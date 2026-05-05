// ============================================================
// pr-monitor-nav-patch.js
// Patches app.js nav() to register 'prmonitor' in
// SECTION_NAMES and SEC_MAP, and calls renderPRMonitoring()
// when that tab is activated.
//
// Load order: AFTER app.js, BEFORE release.js
// OR: simply merge the 3 lines below into app.js manually.
// ============================================================

(function patchNavForPRMonitor() {
  function _apply() {
    // Register in maps (defined in app.js)
    if (typeof SECTION_NAMES !== 'undefined') {
      SECTION_NAMES['prmonitor'] = 'PR Monitoring';
    }
    if (typeof SEC_MAP !== 'undefined') {
      SEC_MAP['prmonitor'] = 'sec-prmonitor';
    }

    // Wrap nav() so it calls renderPRMonitoring() on activation
    if (typeof nav === 'function' && !window._navPRMonitorPatched) {
      window._navPRMonitorPatched = true;
      const _origNav = window.nav;
      window.nav = function(key) {
        _origNav(key);
        if (key === 'prmonitor') {
          // Badge count update
          const badge = document.getElementById('badge-prmonitor');
          if (badge && typeof buildAllPRs === 'function') {
            badge.textContent = buildAllPRs('').length;
          }
          // Render
          if (typeof renderPRMonitoring === 'function') {
            setTimeout(renderPRMonitoring, 50);
          }
        }
      };
    }
  }

  // Wait for app.js to define nav()
  if (typeof nav === 'function') {
    _apply();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      const _wait = () => {
        if (typeof nav === 'function') _apply();
        else setTimeout(_wait, 80);
      };
      _wait();
    });
  }
})();
