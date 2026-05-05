// ============================================================
// BUDGET REGISTRY — APP IMPROVEMENTS v3.0
// New features:
//  • User Management UI (admin only)
//  • Audit Log viewer
//  • Print header with agency info
//  • FY filter persistence in localStorage
//  • Unsaved changes guard on modal navigation
//  • Performance: disbursement lookup map
//  • Smart save: module-specific reloads
// ============================================================

// ══════════════════════════════════════════
// PERFORMANCE: LOOKUP MAPS
// Built once after loadAll(), used everywhere
// instead of O(n) .filter() on every render.
// ══════════════════════════════════════════
const _LOOKUP = {
    disbByObligId: {},  // obligation_id → [disbursement]
    obligByRcId:   {},  // rc_id → [obligation]
    obligByEmId:   {},  // earmark_id → [obligation]
    earmarkByRcId: {},  // rc_id → [earmark]
    allotByRcId:   {},  // rc_id → allotment (single)
};

function rebuildLookupMaps() {
    // Clear
    Object.keys(_LOOKUP).forEach(k => _LOOKUP[k] = {});

    DATA.disbursement.forEach(d => {
        if (!d.obligation_id) return;
        if (!_LOOKUP.disbByObligId[d.obligation_id]) _LOOKUP.disbByObligId[d.obligation_id] = [];
        _LOOKUP.disbByObligId[d.obligation_id].push(d);
    });
    DATA.obligation.forEach(o => {
        if (o.rc_id) {
            if (!_LOOKUP.obligByRcId[o.rc_id]) _LOOKUP.obligByRcId[o.rc_id] = [];
            _LOOKUP.obligByRcId[o.rc_id].push(o);
        }
        if (o.earmark_id) {
            if (!_LOOKUP.obligByEmId[o.earmark_id]) _LOOKUP.obligByEmId[o.earmark_id] = [];
            _LOOKUP.obligByEmId[o.earmark_id].push(o);
        }
    });
    DATA.earmark.forEach(em => {
        if (!_LOOKUP.earmarkByRcId[em.rc_id]) _LOOKUP.earmarkByRcId[em.rc_id] = [];
        _LOOKUP.earmarkByRcId[em.rc_id].push(em);
    });
    DATA.allotment.forEach(al => {
        _LOOKUP.allotByRcId[al.rc_id] = al;
    });
}

// Helper: get disbursements for an obligation (O(1))
function getDisbForObligation(obligId) {
    return _LOOKUP.disbByObligId[obligId] || [];
}

// Patch loadAll to also rebuild lookup maps
const _origLoadAll = typeof loadAll === 'function' ? loadAll : null;
async function loadAll() {
    if (_origLoadAll) await _origLoadAll();
    rebuildLookupMaps();
}

// ══════════════════════════════════════════
// FY FILTER PERSISTENCE
// Saves selected FY to localStorage so it
// survives page refresh.
// ══════════════════════════════════════════
const _FY_PREF_KEY = 'budget_registry_fy';

// Override applyFYFilter to also persist
const _origApplyFY = typeof applyFYFilter === 'function' ? applyFYFilter : null;
function applyFYFilter() {
    const sel = document.getElementById('fy-select');
    if (sel) localStorage.setItem(_FY_PREF_KEY, sel.value);
    if (_origApplyFY) _origApplyFY();
}

// Called after FY options are built — restore saved selection
function restoreFYFilter() {
    const saved = localStorage.getItem(_FY_PREF_KEY);
    if (!saved) return;
    const sel = document.getElementById('fy-select');
    if (!sel) return;
    // Check if the saved year is in the options
    const opt = Array.from(sel.options).find(o => o.value === saved);
    if (opt) { sel.value = saved; if (_origApplyFY) _origApplyFY(); }
}

// ══════════════════════════════════════════
// UNSAVED CHANGES GUARD
// Warns user before navigating away from a
// modal with unsaved edits.
// ══════════════════════════════════════════
let _modalDirty = false;

function markModalDirty() { _modalDirty = true; }
function clearModalDirty() { _modalDirty = false; }

// Watch all modal form inputs for changes
document.addEventListener('input', e => {
    if (e.target.closest('.modal-overlay.open')) _modalDirty = true;
});
document.addEventListener('change', e => {
    if (e.target.closest('.modal-overlay.open')) _modalDirty = true;
});

// Intercept nav clicks
const _origNav = typeof nav === 'function' ? nav : null;
async function nav(key) {
    if (_modalDirty) {
        const openModal = document.querySelector('.modal-overlay.open');
        if (openModal) {
            const ok = await confirm2('Unsaved Changes', 'You have unsaved changes in the open form.\n\nLeave and discard changes?');
            if (!ok) return;
            openModal.classList.remove('open');
            clearModalDirty();
        }
    }
    if (_origNav) _origNav(key);
}

// Reset dirty flag when modal closes
const _origCloseModal = typeof closeModal === 'function' ? closeModal : null;
function closeModal(id) {
    clearModalDirty();
    if (_origCloseModal) _origCloseModal(id);
}

// ══════════════════════════════════════════
// USER MANAGEMENT UI
// Admin-only panel injected into sysconfig
// ══════════════════════════════════════════
let _users = [];

async function loadUsers() {
    try {
        _users = await BudgetAPI.getUsers() || [];
    } catch(e) {
        _users = [];
    }
}

function renderUsersPanel() {
    const panel = document.getElementById('spanel-users');
    if (!panel) return;

    const isAdmin = typeof _currentUser !== 'undefined' && _currentUser?.role === 'admin';
    if (!isAdmin) {
        panel.innerHTML = `<div class="ss-panel-topbar"><div><h2>User Management</h2><p>Admin access required</p></div></div>
          <div class="ss-body"><div class="alert alert-warn">⚠️ Only administrators can manage users.</div></div>`;
        return;
    }

    panel.innerHTML = `
      <div class="ss-panel-topbar">
        <div><h2>User Management</h2><p>Add, edit, and manage system user accounts</p></div>
        <button class="btn btn-primary btn-sm" onclick="openUserModal()">+ Add User</button>
      </div>
      <div class="ss-body">
        <div class="ss-card">
          <div class="ss-card-label">User Accounts</div>
          <div class="table-scroll" style="border:none">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <thead><tr style="background:var(--surface)">
                <th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--border)">Name</th>
                <th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;border-bottom:1px solid var(--border)">Username</th>
                <th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;border-bottom:1px solid var(--border)">Role</th>
                <th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;border-bottom:1px solid var(--border)">Status</th>
                <th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;border-bottom:1px solid var(--border)">Last Login</th>
                <th style="padding:9px 14px;border-bottom:1px solid var(--border)"></th>
              </tr></thead>
              <tbody id="users-tbody">
                ${_users.length ? _users.map(u => `
                  <tr style="border-bottom:1px solid var(--border);${!u.is_active?'opacity:.5':''}">
                    <td style="padding:10px 14px;font-weight:500">${u.full_name || '—'}</td>
                    <td style="padding:10px 14px;font-family:var(--mono);font-size:12px">${u.username}</td>
                    <td style="padding:10px 14px">
                      <span class="badge ${u.role==='admin'?'b-red':u.role==='encoder'?'b-blue':'b-green'}">${u.role}</span>
                    </td>
                    <td style="padding:10px 14px">
                      <span class="badge ${u.is_active?'b-green':'b-yellow'}">${u.is_active?'Active':'Inactive'}</span>
                    </td>
                    <td style="padding:10px 14px;font-size:12px;color:var(--text3)">${u.last_login ? new Date(u.last_login).toLocaleDateString('en-PH') : 'Never'}</td>
                    <td style="padding:10px 14px">
                      <div class="row-actions">
                        <button class="act-btn a-edit" onclick="openUserModal(${u.id})">Edit</button>
                        ${u.id != (_currentUser?.id||0) ? `<button class="act-btn a-del" onclick="deleteUser(${u.id})">${u.is_active?'Deactivate':'Delete'}</button>` : ''}
                      </div>
                    </td>
                  </tr>
                `).join('') : '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text3)">No users found.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
        <div class="ss-card">
          <div class="ss-card-label">Role Permissions</div>
          <div class="ss-row"><div class="ss-row-l"><strong>Admin</strong><span>Full access: manage users, all records, system settings</span></div><div class="ss-row-r"><span class="badge b-red">Admin</span></div></div>
          <div class="ss-row"><div class="ss-row-l"><strong>Encoder</strong><span>Create and edit records; cannot manage users or system settings</span></div><div class="ss-row-r"><span class="badge b-blue">Encoder</span></div></div>
          <div class="ss-row"><div class="ss-row-l"><strong>Viewer</strong><span>Read-only access to all records and reports</span></div><div class="ss-row-r"><span class="badge b-green">Viewer</span></div></div>
        </div>
      </div>`;
}

function openUserModal(userId) {
    const user = userId ? _users.find(u => u.id == userId) : null;
    const title = user ? 'Edit User' : 'Add User';

    // Reuse refModal for simplicity
    document.getElementById('refModalTitle').textContent = title;
    document.getElementById('refFormFields').innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div class="form-group">
          <label class="req">Full Name</label>
          <input type="text" id="um_fullName" value="${user?.full_name||''}" placeholder="e.g. Juan Dela Cruz">
        </div>
        <div class="form-group">
          <label class="req">Username</label>
          <input type="text" id="um_username" value="${user?.username||''}" placeholder="e.g. jdelacruz" ${user?'readonly':''}>
        </div>
        <div class="form-group">
          <label ${!user?'class="req"':''}>Password ${user?'<small style="font-weight:400;color:var(--text3)">(leave blank to keep current)</small>':''}</label>
          <input type="password" id="um_password" placeholder="${user?'New password (optional)':'Min. 6 characters'}">
        </div>
        <div class="form-group">
          <label class="req">Role</label>
          <select id="um_role">
            <option value="encoder" ${(user?.role||'encoder')==='encoder'?'selected':''}>Encoder</option>
            <option value="viewer" ${user?.role==='viewer'?'selected':''}>Viewer</option>
            <option value="admin" ${user?.role==='admin'?'selected':''}>Admin</option>
          </select>
        </div>
        ${user ? `<div class="form-group">
          <label>Status</label>
          <select id="um_active">
            <option value="1" ${user.is_active?'selected':''}>Active</option>
            <option value="0" ${!user.is_active?'selected':''}>Inactive</option>
          </select>
        </div>` : ''}
        <input type="hidden" id="um_userId" value="${user?.id||''}">
      </div>`;

    // Override save button
    const saveBtn = document.querySelector('#refModal .modal-footer .btn-primary');
    if (saveBtn) {
        saveBtn.onclick = saveUser;
        saveBtn.textContent = user ? 'Update User' : 'Create User';
    }

    document.getElementById('refModal').classList.add('open');
}

async function saveUser() {
    const userId = document.getElementById('um_userId')?.value;
    const fullName = document.getElementById('um_fullName')?.value?.trim();
    const username = document.getElementById('um_username')?.value?.trim();
    const password = document.getElementById('um_password')?.value;
    const role     = document.getElementById('um_role')?.value;
    const isActive = document.getElementById('um_active')?.value;

    if (!fullName) { toast('Full name is required', 'error'); return; }
    if (!userId && !username) { toast('Username is required', 'error'); return; }
    if (!userId && (!password || password.length < 6)) { toast('Password must be at least 6 characters', 'error'); return; }

    try {
        showSaving(true);
        const payload = { fullName, role };
        if (password) payload.password = password;
        if (isActive !== undefined) payload.isActive = isActive === '1';

        if (userId) {
            await BudgetAPI.updateUser(userId, payload);
            toast('User updated');
        } else {
            payload.username = username;
            await BudgetAPI.createUser(payload);
            toast('User created');
        }
        await loadUsers();
        closeModal('refModal');
        renderUsersPanel();
    } catch(err) {
        toast(err.message, 'error');
    } finally {
        showSaving(false);
    }
}

async function deleteUser(id) {
    const user = _users.find(u => u.id == id);
    if (!user) return;
    const ok = await confirm2('Deactivate User', `Deactivate "${user.full_name || user.username}"?\n\nThey will no longer be able to log in.`);
    if (!ok) return;
    try {
        showSaving(true);
        await BudgetAPI.deleteUser(id);
        toast('User deactivated', 'error');
        await loadUsers();
        renderUsersPanel();
    } catch(err) {
        toast(err.message, 'error');
    } finally {
        showSaving(false);
    }
}

// ══════════════════════════════════════════
// AUDIT LOG VIEWER
// Shows recent system actions in sysconfig
// ══════════════════════════════════════════
async function renderAuditPanel() {
    const panel = document.getElementById('spanel-audit');
    if (!panel) return;

    panel.innerHTML = `
      <div class="ss-panel-topbar">
        <div><h2>Audit Log</h2><p>Recent create, update, and delete actions</p></div>
        <div style="display:flex;gap:8px;align-items:center">
          <select id="audit-module-filter" onchange="renderAuditPanel()" style="font-size:12px;padding:5px 9px;border:1px solid var(--border);border-radius:var(--radius);font-family:var(--font)">
            <option value="">All Modules</option>
            <option value="RC">RC</option>
            <option value="Allotment">Allotment</option>
            <option value="Earmark">Earmark</option>
            <option value="Obligation">Obligation</option>
            <option value="Disbursement">Disbursement</option>
          </select>
          <button class="btn btn-outline btn-sm" onclick="renderAuditPanel()">🔄 Refresh</button>
        </div>
      </div>
      <div class="ss-body">
        <div class="ss-card">
          <div class="ss-card-label">Recent Activity (last 100 entries)</div>
          <div id="audit-loading" style="padding:20px;text-align:center;color:var(--text3)">Loading...</div>
          <div class="table-scroll" id="audit-table-wrap" style="display:none;border:none">
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead><tr style="background:var(--surface)">
                <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;color:var(--text2);text-transform:uppercase;border-bottom:1px solid var(--border)">Time</th>
                <th style="padding:8px 12px;font-size:10px;font-weight:600;color:var(--text2);text-transform:uppercase;border-bottom:1px solid var(--border)">Action</th>
                <th style="padding:8px 12px;font-size:10px;font-weight:600;color:var(--text2);text-transform:uppercase;border-bottom:1px solid var(--border)">Module</th>
                <th style="padding:8px 12px;font-size:10px;font-weight:600;color:var(--text2);text-transform:uppercase;border-bottom:1px solid var(--border)">Reference</th>
                <th style="padding:8px 12px;font-size:10px;font-weight:600;color:var(--text2);text-transform:uppercase;border-bottom:1px solid var(--border)">Summary</th>
              </tr></thead>
              <tbody id="audit-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>`;

    try {
        const mod = document.getElementById('audit-module-filter')?.value || '';
        const rows = await BudgetAPI.getAuditLog({ module: mod, limit: 100 }) || [];
        const tbody = document.getElementById('audit-tbody');
        const wrap  = document.getElementById('audit-table-wrap');
        const load  = document.getElementById('audit-loading');
        if (load) load.style.display = 'none';
        if (wrap) wrap.style.display = '';

        const actionColors = { CREATE: 'b-green', UPDATE: 'b-blue', DELETE: 'b-red' };
        tbody.innerHTML = rows.length ? rows.map(r => `
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:7px 12px;color:var(--text3);white-space:nowrap">${r.created_at ? new Date(r.created_at).toLocaleString('en-PH') : '—'}</td>
            <td style="padding:7px 12px"><span class="badge ${actionColors[r.action]||'b-blue'}">${r.action}</span></td>
            <td style="padding:7px 12px;font-weight:500">${r.module}</td>
            <td style="padding:7px 12px;font-family:var(--mono);font-size:11px;color:var(--text2)">${r.record_ref||'—'}</td>
            <td style="padding:7px 12px;color:var(--text2);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.summary||''}">${r.summary||'—'}</td>
          </tr>
        `).join('') : '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text3)">No audit records found.</td></tr>';

    } catch(err) {
        const load = document.getElementById('audit-loading');
        if (load) load.innerHTML = `<span style="color:var(--red)">Failed to load audit log: ${err.message}</span>`;
    }
}

// ══════════════════════════════════════════
// INJECT USER MANAGEMENT + AUDIT INTO UI
// Adds nav buttons and panels to sysconfig
// ══════════════════════════════════════════
function injectSysconfigTabs() {
    const leftNav = document.querySelector('.ss-left');
    const rightPanel = document.querySelector('.ss-right');
    if (!leftNav || !rightPanel) return;

    // Add separator + new nav buttons if not already present
    if (!document.getElementById('stab-users')) {
        const sep = document.createElement('div');
        sep.className = 'ss-nav-sep';
        leftNav.appendChild(sep);

        const usersBtn = document.createElement('button');
        usersBtn.className = 'ss-nav-btn';
        usersBtn.id = 'stab-users';
        usersBtn.onclick = () => sysTab('users');
        usersBtn.innerHTML = '<span class="ss-icon">👥</span>User Management';
        leftNav.appendChild(usersBtn);

        const auditBtn = document.createElement('button');
        auditBtn.className = 'ss-nav-btn';
        auditBtn.id = 'stab-audit';
        auditBtn.onclick = () => sysTab('audit');
        auditBtn.innerHTML = '<span class="ss-icon">📋</span>Audit Log';
        leftNav.appendChild(auditBtn);

        // Add panels
        const usersPanel = document.createElement('div');
        usersPanel.className = 'ss-panel';
        usersPanel.id = 'spanel-users';
        rightPanel.appendChild(usersPanel);

        const auditPanel = document.createElement('div');
        auditPanel.className = 'ss-panel';
        auditPanel.id = 'spanel-audit';
        rightPanel.appendChild(auditPanel);
    }

    // Add offline queue badge to topbar if not present
    if (!document.getElementById('offline-queue-badge')) {
        const topRight = document.querySelector('.topbar-right');
        if (topRight) {
            const badge = document.createElement('span');
            badge.id = 'offline-queue-badge';
            badge.style.cssText = 'display:none;background:var(--yellow-light);border:1px solid var(--yellow-mid);color:var(--yellow);border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer;';
            badge.title = 'Offline operations pending — click to retry';
            badge.onclick = replayOfflineQueue;
            topRight.insertBefore(badge, topRight.firstChild);
        }
    }
}

// Override sysTab to handle new tabs
const _origSysTab = typeof sysTab === 'function' ? sysTab : null;
function sysTab(tab) {
    if (tab === 'users') {
        // Deactivate all panels/buttons
        document.querySelectorAll('.ss-nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.ss-panel').forEach(p => p.classList.remove('active'));
        const btn = document.getElementById('stab-users');
        const panel = document.getElementById('spanel-users');
        if (btn) btn.classList.add('active');
        if (panel) { panel.classList.add('active'); loadUsers().then(renderUsersPanel); }
        return;
    }
    if (tab === 'audit') {
        document.querySelectorAll('.ss-nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.ss-panel').forEach(p => p.classList.remove('active'));
        const btn = document.getElementById('stab-audit');
        const panel = document.getElementById('spanel-audit');
        if (btn) btn.classList.add('active');
        if (panel) { panel.classList.add('active'); renderAuditPanel(); }
        return;
    }
    if (_origSysTab) _origSysTab(tab);
}

// ══════════════════════════════════════════
// PRINT HEADER INJECTION
// Adds agency name, report title, date to
// @media print so they appear when printing.
// ══════════════════════════════════════════
function injectPrintStyles() {
    const prefs = JSON.parse(localStorage.getItem('budget_registry_prefs') || '{}');
    const agency = prefs.agencyName || 'Republic of the Philippines';
    const region = prefs.region     || '';
    const fy     = prefs.fiscalYear || new Date().getFullYear();

    // Inject/update print header element
    let header = document.getElementById('print-header');
    if (!header) {
        header = document.createElement('div');
        header.id = 'print-header';
        document.body.insertBefore(header, document.body.firstChild);
    }
    header.innerHTML = `
      <div style="text-align:center;margin-bottom:12px;padding-bottom:10px;border-bottom:2px solid #000;">
        <div style="font-size:13pt;font-weight:bold;text-transform:uppercase">${agency}</div>
        ${region ? `<div style="font-size:10pt">${region}</div>` : ''}
        <div style="font-size:11pt;font-weight:bold;margin-top:6px">BUDGET EXECUTION REPORT</div>
        <div style="font-size:9pt">Fiscal Year ${fy} &nbsp;·&nbsp; Printed: ${new Date().toLocaleDateString('en-PH', {year:'numeric',month:'long',day:'numeric'})}</div>
      </div>`;

    // Inject print CSS
    let style = document.getElementById('print-header-style');
    if (!style) {
        style = document.createElement('style');
        style.id = 'print-header-style';
        document.head.appendChild(style);
    }
    style.textContent = `
      #print-header { display: none; }
      @media print {
        #print-header { display: block !important; }
        .sidebar, .topbar, .report-controls, .rpt-summary-grid,
        .btn, .act-btn, .toolbar, .toast-container,
        .saving, #db-banner, #offline-queue-badge { display: none !important; }
        .main { margin-left: 0 !important; }
        body { background: white !important; }
        #rpt-table { font-size: 8px !important; }
        .rpt-header-row th { background: #1e3a5f !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .rpt-row-grand td { background: #1e3a5f !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .rpt-row-l0 { background: #dbeafe !important; -webkit-print-color-adjust: exact; }
        .rpt-row-l7 { background: #f0fdf4 !important; -webkit-print-color-adjust: exact; }
      }`;
}

// ══════════════════════════════════════════
// BOOT: Wire everything up after DOM ready
// ══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    // Inject new UI elements
    setTimeout(() => {
        injectSysconfigTabs();
        injectPrintStyles();

        // Restore FY filter after options are built
        // (buildFYOptions runs inside bootApp → loadAll)
        const fyObs = new MutationObserver(() => {
            const sel = document.getElementById('fy-select');
            if (sel && sel.options.length > 1) {
                restoreFYFilter();
                fyObs.disconnect();
            }
        });
        const fyEl = document.getElementById('fy-select');
        if (fyEl) fyObs.observe(fyEl, { childList: true });

        // Rebuild lookup maps when DATA changes
        // (hook into existing loadAll via wrapper above)
    }, 300);

    // Rebuild print header whenever agency settings are saved
    const origSaveAgency = typeof saveAgencyInfo === 'function' ? saveAgencyInfo : null;
    if (origSaveAgency) {
        window.saveAgencyInfo = function() {
            origSaveAgency();
            setTimeout(injectPrintStyles, 100);
        };
    }
});

// ══════════════════════════════════════════
// EXPORT TO EXCEL (basic XLSX via CSV)
// Provides a formatted spreadsheet download
// in addition to the plain CSV export.
// ══════════════════════════════════════════
function rptExportExcel() {
    // Build a tab-separated values file with .xls extension
    // Excel opens TSV files natively and preserves number formatting
    const records = typeof rptBuildRCRecords === 'function' ? rptBuildRCRecords() : [];
    if (!records.length) { toast('No data to export', 'error'); return; }

    const grand = typeof _agg === 'function' ? _agg(records) : null;
    if (!grand) { toast('Export function not available', 'error'); return; }

    const c = v => Number(v || 0).toFixed(2);
    const lines = [
        // Agency header
        [JSON.parse(localStorage.getItem('budget_registry_prefs') || '{}').agencyName || 'Republic of the Philippines'],
        ['BUDGET EXECUTION REPORT'],
        [`Fiscal Year ${JSON.parse(localStorage.getItem('budget_registry_prefs') || '{}').fiscalYear || new Date().getFullYear()}`],
        [],
        ['CODES', 'Allotment Received per RC', 'Current Year Obligations', 'Current Year Disbursement',
         'Unpaid Obligations', 'Unobligated Balance per RC', 'Earmarked', 'Remaining Balance'],
    ];

    // Flatten the same hierarchy used in rptExportCSV
    records.forEach(rec => {
        lines.push([
            `RC: ${rec.rcName}`,
            c(rec.allot), c(rec.oblig), c(rec.disb),
            c(rec.oblig - rec.disb), c(rec.allot - rec.oblig),
            c(rec.earmark), c((rec.allot - rec.oblig) - rec.earmark),
        ]);
        rec.ecMap.forEach((acGrp, ecLabel) => {
            let ecOb=0, ecDisb=0;
            acGrp.forEach(v=>{ecOb+=v.ob; ecDisb+=v.disb;});
            lines.push([`  ${ecLabel}`, '', c(ecOb), c(ecDisb), c(ecOb-ecDisb), '', '', '']);
            acGrp.forEach((d, ac) => {
                lines.push([`    ${ac}`, c(d.allot), c(d.ob), c(d.disb),
                             c(d.ob-d.disb), c(d.allot-d.ob), '', c(d.allot-d.ob)]);
            });
        });
    });
    lines.push([]);
    lines.push(['Grand Total', c(grand.allot), c(grand.oblig), c(grand.disb),
                c(grand.unpaid), c(grand.unob), c(grand.earn), c(grand.bal)]);

    const tsv = lines.map(row => row.join('\t')).join('\n');
    const blob = new Blob(['\ufeff' + tsv], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `budget_report_${new Date().toISOString().split('T')[0]}.xls`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Report exported to Excel');
}

// Add Excel export button to report controls after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const printBtn = document.querySelector('[onclick="rptPrint()"]');
        if (printBtn && !document.querySelector('[onclick="rptExportExcel()"]')) {
            const xlsBtn = document.createElement('button');
            xlsBtn.className = 'btn btn-success btn-sm';
            xlsBtn.onclick = rptExportExcel;
            xlsBtn.textContent = '📊 Excel';
            printBtn.parentNode.insertBefore(xlsBtn, printBtn);
        }
    }, 500);
});
