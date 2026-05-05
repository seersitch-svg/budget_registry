// ============================================================
// BUDGET REGISTRY — API CLIENT v3.0
// Fixes: auto-detect API_BASE, CSRF protection, offline queue,
//        smarter per-module cache invalidation, better errors
// ============================================================

// ── Auto-detect API base from current URL ────────────────────
// Folder structure:
//   budget_registry/index.html
//   budget_registry/api/*.php
//   budget_registry/assets/js/*.js
//   budget_registry/assets/css/*.css
const API_BASE = (() => {
    const loc = window.location;
    const path = loc.pathname;

    // Strategy 1: find known project folder name in path
    // Matches: budget_registry, budget_registry-latest, budget-registry, etc.
    const match = path.match(/^(.*\/budget[_-]registry[^/]*)\//i);
    if (match) return `${loc.protocol}//${loc.host}${match[1]}/api`;

    // Strategy 2: derive from current page directory
    // Strips /index.html or trailing slash to get the project root
    const dir = path.endsWith('/')
        ? path.slice(0, -1)
        : path.substring(0, path.lastIndexOf('/'));
    if (dir) return `${loc.protocol}//${loc.host}${dir}/api`;

    // Strategy 3: served from domain root
    return `${loc.protocol}//${loc.host}/api`;
})();

// ── CSRF Token ───────────────────────────────────────────────
// Generated once per page load, sent in every mutating request header.
// PHP reads it from X-CSRF-Token and validates against session.
const _CSRF_TOKEN = (() => {
    let t = sessionStorage.getItem('_csrf');
    if (!t) { t = crypto.randomUUID(); sessionStorage.setItem('_csrf', t); }
    return t;
})();

// ── Offline Queue ─────────────────────────────────────────────
// When the DB is unreachable, write operations are queued in
// localStorage and replayed automatically when connectivity returns.
const _QUEUE_KEY = 'budget_registry_offline_queue';

function _getQueue() {
    try { return JSON.parse(localStorage.getItem(_QUEUE_KEY) || '[]'); } catch { return []; }
}
function _saveQueue(q) {
    localStorage.setItem(_QUEUE_KEY, JSON.stringify(q));
}
function _enqueue(endpoint, method, body) {
    const q = _getQueue();
    q.push({ endpoint, method, body, ts: Date.now() });
    _saveQueue(q);
    // Show queue badge
    const badge = document.getElementById('offline-queue-badge');
    if (badge) { badge.textContent = `${q.length} pending`; badge.style.display = ''; }
}
async function replayOfflineQueue() {
    const q = _getQueue();
    if (!q.length) return;
    let replayed = 0;
    const remaining = [];
    for (const item of q) {
        try {
            await apiCall(item.endpoint, item.method, item.body, false); // false = don't re-queue
            replayed++;
        } catch {
            remaining.push(item);
        }
    }
    _saveQueue(remaining);
    const badge = document.getElementById('offline-queue-badge');
    if (badge) badge.style.display = remaining.length ? '' : 'none';
    if (replayed > 0) {
        await loadAll();
        renderAll();
        if (typeof toast === 'function') toast(`${replayed} offline operation${replayed > 1 ? 's' : ''} synced`);
    }
}

// ── Loading state tracker ─────────────────────────────────────
const _loadingModules = new Set();
function _setLoading(mod, v) {
    if (v) _loadingModules.add(mod); else _loadingModules.delete(mod);
}

// ── Core API call ─────────────────────────────────────────────
async function apiCall(endpoint, method = 'GET', body = null, allowQueue = true) {
    const isMutating = method !== 'GET';
const opts = {
    method,
    headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': _CSRF_TOKEN,
        'X-Requested-With': 'XMLHttpRequest',
    },
    credentials: 'include',
};
    if (body) opts.body = JSON.stringify(body);

    try {
        const res = await fetch(`${API_BASE}/${endpoint}`, opts);

        // Session expired
        if (res.status === 401) {
            if (typeof doLogout === 'function') doLogout();
            throw new Error('Session expired. Please log in again.');
        }

        // Parse JSON safely
        let json;
        try { json = await res.json(); }
        catch { throw new Error(`Server returned non-JSON (HTTP ${res.status})`); }

        if (!json.success) throw new Error(json.message || json.error || `API error (${res.status})`);
        return json.data;

    } catch (err) {
        const isNetwork = err.message.includes('Failed to fetch') ||
            err.message.includes('NetworkError') ||
            err.message.includes('net::ERR') ||
            err.name === 'TypeError';

        // Queue write operations when offline
        if (isNetwork && isMutating && allowQueue) {
            _enqueue(endpoint, method, body);
            throw new Error('Saved to offline queue — will sync when connection is restored.');
        }

        if (isNetwork) {
            throw new Error(
                'Cannot reach the database server.\n\n' +
                '1. Make sure XAMPP is running (Apache + MySQL)\n' +
                '2. Open via: ' + API_BASE.replace('/api', '/')
            );
        }
        throw err;
    }
}

// ── Per-module smart reload ───────────────────────────────────
// Instead of reloading ALL 6 tables after every save,
// only reload the modules that were actually affected.
const _moduleLoaders = {
    rc:           () => BudgetAPI.getRCs().then(d => { DATA.rc = d || []; mergeRCActivities(); rebuildDataLists(); }),
    allotment:    () => BudgetAPI.getAllotments().then(d => { DATA.allotment = d || []; }),
    earmark:      () => BudgetAPI.getEarmarks().then(d => { DATA.earmark = d || []; }),
    obligation:   () => BudgetAPI.getObligations().then(d => { DATA.obligation = d || []; }),
    disbursement: () => BudgetAPI.getDisbursements().then(d => { DATA.disbursement = d || []; }),
    ref:          () => BudgetAPI.getRefData().then(d => { if(d) applyRefData(d); }),
};

const _moduleRenders = {
    rc:           () => { renderRC(); updateAll(); },
    allotment:    () => { renderAllotment(); updateAll(); },
    earmark:      () => { renderEarmark(); updateAll(); },
    obligation:   () => { renderObligation(); updateAll(); },
    disbursement: () => { renderDisbursement(); updateAll(); },
};

// Reload only specific modules, then update their tables + dashboard
// Around line 65 in api-client.js - find reloadModules():
async function reloadModules(...modules) {
    await Promise.all(modules.map(m => _moduleLoaders[m]?.()));
    buildFYOptions();
    modules.forEach(m => _moduleRenders[m]?.());
    rptPopulateFilters();
    if (document.getElementById('sec-dashboard')?.classList.contains('active')) dashRender();
}

const BudgetAPI = {
    // ── RC ──────────────────────────────────────────────────────
    getRCs:              ()         => apiCall('rc.php'),
    getRC:               (id)       => apiCall(`rc.php?id=${id}`),
    createRC:            (data)     => apiCall('rc.php', 'POST', data),
    updateRC:            (id, data) => apiCall(`rc.php?id=${id}`, 'PUT', data),
    deleteRC:            (id)       => apiCall(`rc.php?id=${id}`, 'DELETE'),

    // ── Allotments ───────────────────────────────────────────────
    getAllotments:        ()         => apiCall('allotments.php'),
    getAllotment:         (id)       => apiCall(`allotments.php?id=${id}`),
    createAllotment:     (data)     => apiCall('allotments.php', 'POST', data),
    updateAllotment:     (id, data) => apiCall(`allotments.php?id=${id}`, 'PUT', data),
    deleteAllotment:     (id)       => apiCall(`allotments.php?id=${id}`, 'DELETE'),

    // ── Earmarks ─────────────────────────────────────────────────
    getEarmarks:         ()         => apiCall('earmarks.php'),
    getEarmark:          (id)       => apiCall(`earmarks.php?id=${id}`),
    createEarmark:       (data)     => apiCall('earmarks.php', 'POST', data),
    updateEarmark:       (id, data) => apiCall(`earmarks.php?id=${id}`, 'PUT', data),
    updateEarmarkLots:   (id, lotUpdates) => apiCall(`earmarks.php?id=${id}`, 'PUT',
                           { updateLotObligations: true, lotUpdates }),
    deleteEarmark:       (id)       => apiCall(`earmarks.php?id=${id}`, 'DELETE'),

    // ── Obligations ──────────────────────────────────────────────
    getObligations:      ()         => apiCall('obligations.php'),
    getObligation:       (id)       => apiCall(`obligations.php?id=${id}`),
    createObligation:    (data)     => apiCall('obligations.php', 'POST', data),
    updateObligation:    (id, data) => apiCall(`obligations.php?id=${id}`, 'PUT', data),
    deleteObligation:    (id)       => apiCall(`obligations.php?id=${id}`, 'DELETE'),

    // ── Disbursements ────────────────────────────────────────────
    getDisbursements:    ()         => apiCall('disbursements.php'),
    getDisbursement:     (id)       => apiCall(`disbursements.php?id=${id}`),
    createDisbursement:  (data)     => apiCall('disbursements.php', 'POST', data),
    updateDisbursement:  (id, data) => apiCall(`disbursements.php?id=${id}`, 'PUT', data),
    deleteDisbursement:  (id)       => apiCall(`disbursements.php?id=${id}`, 'DELETE'),

    // ── Reference Data ───────────────────────────────────────────
    getRefData:          ()              => apiCall('reference_data.php'),
    createRefItem:       (data)          => apiCall('reference_data.php', 'POST', data),
    updateRefItem:       (id, data)      => apiCall(`reference_data.php?id=${id}`, 'PUT', data),
    deleteRefItem:       (id)            => apiCall(`reference_data.php?id=${id}`, 'DELETE'),
    bulkSaveRefType:     (type, items)   => apiCall('reference_data.php', 'PATCH', { type, items }),

    // ── Users (new) ──────────────────────────────────────────────
    getUsers:            ()         => apiCall('users.php'),
    createUser:          (data)     => apiCall('users.php', 'POST', data),
    updateUser:          (id, data) => apiCall(`users.php?id=${id}`, 'PUT', data),
    deleteUser:          (id)       => apiCall(`users.php?id=${id}`, 'DELETE'),

    // ── Audit Log ────────────────────────────────────────────────
    getAuditLog:         (params)   => apiCall(`audit.php?${new URLSearchParams(params||{})}`),

    // ── Connectivity ────────────────────────────────────────────
    ping: async () => {
        try {
            const r = await fetch(`${API_BASE}/rc.php`, {
                credentials: 'include',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
            });
            return r.ok;
        } catch { return false; }
    },
};

// ── Connectivity monitor: auto-replay queue when back online ──
window.addEventListener('online', async () => {
    const ok = await BudgetAPI.ping();
    if (ok) {
        replayOfflineQueue();
        const dot = document.getElementById('dbDot');
        if (dot) dot.className = 'db-dot connected';
    }
});
window.addEventListener('offline', () => {
    const dot = document.getElementById('dbDot');
    if (dot) dot.className = 'db-dot error';
    const txt = document.getElementById('dbStatusText');
    if (txt) txt.textContent = 'Offline';
});
