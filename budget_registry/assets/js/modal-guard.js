// ============================================================
// BUDGET REGISTRY — MODAL UNSAVED CHANGES GUARD  v2
// Self-contained module. app.js calls window._modalGuard.*
// for all close paths (backdrop, ✕, Cancel, Escape).
//
// Tracks dirty state per modal. Shows a confirmation dialog
// before discarding any unsaved input.
// ============================================================

(function () {
  'use strict';

  // ── Which modals need the guard ─────────────────────────────
  const DATA_ENTRY = new Set([
    'rcModal',
    'allotmentModal',
    'earmarkModal',
    'obligationModal',
    'disbursementModal',
  ]);

  // ── Dirty state per modal id ─────────────────────────────────
  const _dirty = {};

  // ── Public API exposed on window._modalGuard ─────────────────
  const guard = {

    isDataEntry(id) {
      return DATA_ENTRY.has(id);
    },

    isDirty(id) {
      return !!_dirty[id];
    },

    setDirty(id, val) {
      _dirty[id] = val;
      _updateIndicator(id);
    },

    clearDirty(id) {
      _dirty[id] = false;
      _updateIndicator(id);
    },

    // Show the "discard?" dialog. Returns a Promise<boolean>.
    async confirmDiscard(id) {
      const labels = {
        rcModal:           'Discard Responsibility Center?',
        allotmentModal:    'Discard Allotment?',
        earmarkModal:      'Discard Earmark?',
        obligationModal:   'Discard Obligation?',
        disbursementModal: 'Discard Disbursement?',
      };
      const title = labels[id] || 'Discard Changes?';
      const msg   = 'You have unsaved changes.\n\nClose without saving?';
      // Use the app's existing confirm2() — falls back to native confirm
      if (typeof confirm2 === 'function') {
        return confirm2(title, msg);
      }
      return Promise.resolve(window.confirm(msg));
    },

    // Close a modal immediately — no guard check.
    // Called by app.js AFTER the guard already confirmed.
    forceClose(id) {
      _dirty[id] = false;
      _updateIndicator(id);
      const el = document.getElementById(id);
      if (el) el.classList.remove('open');
    },
  };

  window._modalGuard = guard;

  // ── Dirty indicator dot on modal title ───────────────────────
  const _dots = {};

  function _updateIndicator(id) {
    if (!DATA_ENTRY.has(id)) return;
    const overlay = document.getElementById(id);
    if (!overlay) return;

    // Create the dot once
    if (!_dots[id]) {
      const h2 = overlay.querySelector('.modal-header h2');
      if (!h2) return;
      const dot = document.createElement('span');
      dot.id = `_dirty_dot_${id}`;
      dot.title = 'Unsaved changes';
      dot.style.cssText = [
        'display:inline-block',
        'width:8px',
        'height:8px',
        'border-radius:50%',
        'background:#f59e0b',
        'margin-left:8px',
        'vertical-align:middle',
        'opacity:0',
        'transition:opacity .25s',
        'flex-shrink:0',
      ].join(';');
      h2.appendChild(dot);
      _dots[id] = dot;
    }

    _dots[id].style.opacity = _dirty[id] ? '1' : '0';
  }

  // ── Watch for user input inside any open modal ───────────────
  // Uses capture phase so it fires before any other handler.
  function _getModalId(el) {
    const overlay = el.closest('.modal-overlay');
    return overlay ? overlay.id : null;
  }

  function _onInput(e) {
    // Ignore checkboxes that are part of the EC card toggles
    // (they are not user-data fields, just UI state)
    if (e.target.classList.contains('ec-checkbox')) return;
    // Ignore search inputs
    if (e.target.classList.contains('search-input')) return;

    const id = _getModalId(e.target);
    if (id && DATA_ENTRY.has(id)) {
      guard.setDirty(id, true);
    }
  }

  document.addEventListener('input',  _onInput, true);
  document.addEventListener('change', _onInput, true);

  // ── Reset dirty when a form.reset() fires (openXxxModal calls this) ─
  document.addEventListener('reset', e => {
    const id = _getModalId(e.target);
    if (id) {
      // Timeout: let the reset complete first, then clear dirty
      setTimeout(() => guard.clearDirty(id), 0);
    }
  }, true);

  // ── Also clear dirty when the modal's "open" class is removed ─
  // Catches edge cases where close happens without going through guard
  const _obs = new MutationObserver(mutations => {
    mutations.forEach(m => {
      if (m.type !== 'attributes' || m.attributeName !== 'class') return;
      const el = m.target;
      if (!el.classList.contains('modal-overlay')) return;
      if (!el.classList.contains('open')) {
        // Modal just closed
        guard.clearDirty(el.id);
      }
    });
  });

  // Observe all modal overlays
  function _observeModals() {
    document.querySelectorAll('.modal-overlay').forEach(el => {
      _obs.observe(el, { attributes: true });
    });
  }

  // Run after DOM ready (modals are in the static HTML)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _observeModals);
  } else {
    _observeModals();
  }

})();
