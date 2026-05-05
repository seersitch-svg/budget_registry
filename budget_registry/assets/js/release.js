// ============================================================
// BUDGET REGISTRY — PR RELEASE MODULE  v2.0
//
// Features:
//  • Dedicated "PR Monitoring" section (nav item added at boot)
//  • Full status set matching official form:
//      Registry Status : Earmarked | Not Earmarked | Obligated | Cancelled | N/A
//      PR Status       : Pending | Approved | Not-Approved | Budget Approved | Cancelled | N/A
//      Approval Status : For Signature: RD | Signed | Return to End-User | Return to BAC | Approved Budget | N/A
//      Release Status  : Released to: RDO | Released to: BAC | Released to: End-User | Pending Release | N/A
//  • Sign column (per-lot signatory tracking)
//  • Search + multi-filter + sort
//  • Bulk-update selected PRs
//  • Per-lot edit modal with all fields
//  • Per-earmark inline release table (in earmark view modal)
//  • Print single PR form / Print all PRs summary
// ============================================================

// ── DOM shorthand ────────────────────────────────────────────
const _$ = id => document.getElementById(id);

// ── Status Constants ─────────────────────────────────────────
const REG_STATUS_OPTS = [
  'Earmarked', 'Not Earmarked', 'Obligated', 'Cancelled', 'N/A'
];
const PR_STATUS_OPTS = [
  'Pending', 'Approved', 'Not-Approved', 'Budget Approved', 'Cancelled', 'N/A'
];
const APPROVAL_STATUS_OPTS = [
  'For Signature: RD', 'Signed', 'Return to End-User', 'Return to BAC', 'Approved Budget', 'N/A'
];
const RELEASE_STATUS_OPTS = [
  'Released to: RDO', 'Released to: BAC', 'Released to: End-User', 'Pending Release', 'N/A'
];

// ── Badge style maps ─────────────────────────────────────────
function regStatusBadge(s) {
  const m = {
    'Earmarked':     'b-cyan',
    'Not Earmarked': 'b-orange',
    'Obligated':     'b-purple',
    'Cancelled':     'b-red',
    'N/A':           '',
  };
  return s ? `<span class="badge ${m[s]||''}" style="font-size:10px">${s}</span>` : '—';
}
function prStatusBadge(s) {
  const m = {
    'Pending':        'b-yellow',
    'Approved':       'b-green',
    'Not-Approved':   'b-red',
    'Budget Approved':'b-blue',
    'Cancelled':      'b-red',
    'N/A':            '',
  };
  return s ? `<span class="badge ${m[s]||''}" style="font-size:10px">${s}</span>` : '—';
}
function approvalStatusBadge(s) {
  const m = {
    'For Signature: RD': 'b-blue',
    'Signed':            'b-green',
    'Return to End-User':'b-orange',
    'Return to BAC':     'b-orange',
    'Approved Budget':   'b-green',
    'N/A':               '',
  };
  return s ? `<span class="badge ${m[s]||''}" style="font-size:10px">${s}</span>` : '—';
}
function releaseStatusBadge(s) {
  const m = {
    'Released to: RDO':      'b-cyan',
    'Released to: BAC':      'b-purple',
    'Released to: End-User': 'b-green',
    'Pending Release':       'b-yellow',
    'N/A':                   '',
  };
  return s ? `<span class="badge ${m[s]||''}" style="font-size:10px">${s}</span>` : '—';
}

// ── Derive registry status from lot data ─────────────────────
function deriveRegistryStatus(lot) {
  if (lot.registryStatus) return lot.registryStatus; // manually set
  if (lot.is_obligated === true || lot.is_obligated == 1) return 'Obligated';
  // Check if lot belongs to an earmark at all
  return 'Earmarked';
}

// ── Build flat list of all PRs across all earmarks ───────────
function buildAllPRs(filterFY) {
  const rows = [];
  DATA.earmark.forEach(em => {
    if (filterFY && em.date && new Date(em.date + 'T00:00').getFullYear() != parseInt(filterFY)) return;
    const rc = getRCById(em.rc_id);
    const lots = em.lots || [];
    lots.forEach((lot, li) => {
      const items   = lot.items || [];
      const lotAmt  = items.reduce((s, i) => s + (parseFloat(i.amount || i.totalCost) || 0), 0);
      const particulars = items.map(i => i.particulars).filter(Boolean).join('; ') || '—';
      const lotNum  = lot.lotNumber || li + 1;
      const prNum   = lot.prNumber || `${em.earmark_number}-${String(lotNum).padStart(2,'0')}`;
      const regSt   = deriveRegistryStatus(lot);
      rows.push({
        earmarkId:      em.id,
        lotIndex:       li,
        prNum,
        earmarkNum:     em.earmark_number,
        earmarkDate:    em.date,
        quarter:        em.quarter || '',
        rcName:         rc?.responsibility_center || '—',
        rcId:           em.rc_id,
        particulars,
        requisitioner:  lot.requisitioner || '',
        amount:         lotAmt,
        registryStatus: regSt,
        prStatus:       lot.prStatus || 'Pending',
        approvalStatus: lot.approvalStatus || 'For Signature: RD',
        releaseStatus:  lot.releaseStatus || 'Pending Release',
        releasedTo:     lot.releasedTo || '',
        releaseDate:    lot.releaseDate || '',
        signedBy:       lot.signedBy || '',
        signedDate:     lot.signedDate || '',
        remarks:        lot.releaseRemarks || '',
        isObligated:    lot.is_obligated === true || lot.is_obligated == 1,
        obligationId:   lot.obligation_id || null,
      });
    });
  });
  return rows;
}

// ── PR MONITORING STATE ───────────────────────────────────────
let _prPage = 1;
const _prPageSize = 25;
let _prSort = { col: 'prNum', dir: 1 };
let _prSelected = new Set(); // keys: "earmarkId:lotIndex"

// ══════════════════════════════════════════════════════════════
//  RENDER PR MONITORING SECTION
// ══════════════════════════════════════════════════════════════
function renderPRMonitoring() {
  if (!_$('sec-prmonitor')?.classList.contains('active')) return;

  const filterFY = _$('fy-select')?.value || '';

  // Filters
  const q       = (_$('prm-search')?.value   || '').toLowerCase().trim();
  const fPrSt   = _$('prm-f-prstatus')?.value || '';
  const fApSt   = _$('prm-f-apstatus')?.value || '';
  const fRelSt  = _$('prm-f-relstatus')?.value || '';
  const fRegSt  = _$('prm-f-regstatus')?.value || '';
  const fRC     = _$('prm-f-rc')?.value || '';
  const fQtr    = _$('prm-f-qtr')?.value || '';

  let rows = buildAllPRs(filterFY).filter(r => {
    if (fPrSt  && r.prStatus       !== fPrSt)  return false;
    if (fApSt  && r.approvalStatus !== fApSt)  return false;
    if (fRelSt && r.releaseStatus  !== fRelSt) return false;
    if (fRegSt && r.registryStatus !== fRegSt) return false;
    if (fRC    && r.rcName         !== fRC)    return false;
    if (fQtr   && r.quarter        !== fQtr)   return false;
    if (q) {
      const hay = [r.prNum, r.earmarkNum, r.rcName, r.requisitioner,
                   r.particulars, r.releasedTo, r.signedBy].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Sort
  rows.sort((a, b) => {
    let av = a[_prSort.col], bv = b[_prSort.col];
    if (typeof av === 'number') return (av - bv) * _prSort.dir;
    return String(av || '').localeCompare(String(bv || '')) * _prSort.dir;
  });

  // KPIs
  const total    = rows.length;
  const pending  = rows.filter(r => r.prStatus === 'Pending').length;
  const approved = rows.filter(r => r.prStatus === 'Approved' || r.prStatus === 'Budget Approved').length;
  const released = rows.filter(r => r.releaseStatus?.startsWith('Released')).length;
  const notApproved = rows.filter(r => r.prStatus === 'Not-Approved').length;
  const totalAmt = rows.reduce((s, r) => s + r.amount, 0);

  _$('prm-kpi-total').textContent    = total;
  _$('prm-kpi-pending').textContent  = pending;
  _$('prm-kpi-approved').textContent = approved;
  _$('prm-kpi-released').textContent = released;
  _$('prm-kpi-notappr').textContent  = notApproved;
  _$('prm-kpi-amt').textContent      = fmt.cur(totalAmt);

  // Populate RC filter
  const rcSel = _$('prm-f-rc');
  if (rcSel && rcSel.options.length <= 1) {
    const rcs = [...new Set(buildAllPRs('').map(r => r.rcName))].sort();
    rcs.forEach(rc => { rcSel.innerHTML += `<option value="${rc}">${rc}</option>`; });
  }

  // Paginate
  const maxPage = Math.max(1, Math.ceil(rows.length / _prPageSize));
  if (_prPage > maxPage) _prPage = 1;
  const pageRows = rows.slice((_prPage - 1) * _prPageSize, _prPage * _prPageSize);

  // Table body
  const tbody = _$('prm-tbody');
  if (!pageRows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="13">No PR records match the current filters.</td></tr>`;
  } else {
    tbody.innerHTML = pageRows.map(r => {
      const key = `${r.earmarkId}:${r.lotIndex}`;
      const sel = _prSelected.has(key);
      return `<tr${sel?' class="prm-selected"':''} id="prm-row-${key.replace(':','_')}">
        <td><input type="checkbox" class="prm-cb" ${sel?'checked':''} onchange="prmToggleRow('${key}',this.checked)"></td>
        <td style="font-family:var(--mono);font-size:11px;font-weight:700;color:var(--blue);white-space:nowrap">${r.prNum}</td>
        <td style="font-size:11px;color:var(--text2)">${r.rcName}</td>
        <td style="font-size:11px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.particulars}">${r.particulars}</td>
        <td style="font-size:11px">${r.requisitioner || '—'}</td>
        <td style="font-family:var(--mono);font-size:11px;font-weight:600;text-align:right">${fmt.cur(r.amount)}</td>
        <td>${regStatusBadge(r.registryStatus)}</td>
        <td>${prStatusBadge(r.prStatus)}</td>
        <td>${approvalStatusBadge(r.approvalStatus)}</td>
        <td>${releaseStatusBadge(r.releaseStatus)}</td>
        <td style="font-size:11px;white-space:nowrap">${r.releaseDate ? fmt.date(r.releaseDate) : '—'}</td>
        <td style="font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.signedBy || '—'}</td>
        <td>
          <div class="row-actions">
            <button class="act-btn a-edit" style="font-size:10px;padding:3px 8px"
              onclick="openReleaseUpdateModal(${r.earmarkId},${r.lotIndex})">Edit</button>
            <button class="act-btn a-print" style="font-size:10px;padding:3px 8px"
              onclick="printReleaseForm(${r.earmarkId},${r.lotIndex})">🖨 Print</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // Select-all state
  const allCb = _$('prm-select-all');
  if (allCb) {
    const pageKeys = pageRows.map(r => `${r.earmarkId}:${r.lotIndex}`);
    allCb.checked = pageKeys.length > 0 && pageKeys.every(k => _prSelected.has(k));
    allCb.indeterminate = pageKeys.some(k => _prSelected.has(k)) && !allCb.checked;
  }

  prmUpdateBulkBar();
  prmRenderPager(rows.length, maxPage);
}

function prmSortBy(col) {
  if (_prSort.col === col) _prSort.dir *= -1;
  else { _prSort.col = col; _prSort.dir = 1; }
  _prPage = 1;
  renderPRMonitoring();
}

function prmGoPage(p) { _prPage = p; renderPRMonitoring(); }

function prmRenderPager(total, maxPage) {
  const el = _$('prm-pager');
  if (!el) return;
  if (maxPage <= 1) { el.innerHTML = ''; return; }
  let html = `<button class="pager-btn" ${_prPage===1?'disabled':''} onclick="prmGoPage(${_prPage-1})">‹</button>`;
  for (let i = 1; i <= maxPage; i++) {
    if (maxPage > 7 && Math.abs(i - _prPage) > 2 && i !== 1 && i !== maxPage) {
      if (i === 2 || i === maxPage - 1) html += `<span class="pager-ellipsis">…</span>`;
      continue;
    }
    html += `<button class="pager-btn ${i===_prPage?'active':''}" onclick="prmGoPage(${i})">${i}</button>`;
  }
  html += `<button class="pager-btn" ${_prPage===maxPage?'disabled':''} onclick="prmGoPage(${_prPage+1})">›</button>`;
  html += `<span class="pager-info">${((_prPage-1)*_prPageSize)+1}–${Math.min(_prPage*_prPageSize,total)} of ${total}</span>`;
  el.innerHTML = html;
}

function prmToggleRow(key, checked) {
  if (checked) _prSelected.add(key); else _prSelected.delete(key);
  const row = _$('prm-row-' + key.replace(':', '_'));
  if (row) row.className = checked ? 'prm-selected' : '';
  prmUpdateBulkBar();
  const allCb = _$('prm-select-all');
  if (allCb) {
    const filterFY = _$('fy-select')?.value || '';
    const visible = buildAllPRs(filterFY)
      .slice((_prPage - 1) * _prPageSize, _prPage * _prPageSize)
      .map(r => `${r.earmarkId}:${r.lotIndex}`);
    allCb.checked = visible.length > 0 && visible.every(k => _prSelected.has(k));
    allCb.indeterminate = visible.some(k => _prSelected.has(k)) && !allCb.checked;
  }
}

function prmToggleAll(checked) {
  const filterFY = _$('fy-select')?.value || '';
  const visible = buildAllPRs(filterFY)
    .slice((_prPage - 1) * _prPageSize, _prPage * _prPageSize)
    .map(r => `${r.earmarkId}:${r.lotIndex}`);
  visible.forEach(k => { if (checked) _prSelected.add(k); else _prSelected.delete(k); });
  renderPRMonitoring();
}

function prmUpdateBulkBar() {
  const bar  = _$('prm-bulk-bar');
  const cnt  = _$('prm-bulk-count');
  if (!bar) return;
  if (_prSelected.size > 0) {
    bar.style.display = 'flex';
    cnt.textContent = `${_prSelected.size} PR${_prSelected.size !== 1 ? 's' : ''} selected`;
  } else {
    bar.style.display = 'none';
  }
}

function prmClearSelection() { _prSelected.clear(); renderPRMonitoring(); }

// Export CSV
function prmExportCSV() {
  const filterFY = _$('fy-select')?.value || '';
  const all = buildAllPRs(filterFY);
  const headers = ['PR No.','Earmark','RC','Quarter','Particulars','Requisitioner','Amount',
                   'Registry Status','PR Status','Approval Status','Release Status',
                   'Released To','Release Date','Signed By','Signed Date','Remarks'];
  const rows = all.map(r => [r.prNum, r.earmarkNum, r.rcName, r.quarter, r.particulars,
    r.requisitioner, r.amount, r.registryStatus, r.prStatus, r.approvalStatus,
    r.releaseStatus, r.releasedTo, r.releaseDate, r.signedBy, r.signedDate, r.remarks]);
  const csv = [headers, ...rows].map(row =>
    row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
  a.download = `pr_release_monitoring_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  toast('CSV exported');
}

// ══════════════════════════════════════════════════════════════
//  RELEASE UPDATE MODAL (edit one lot)
// ══════════════════════════════════════════════════════════════
function openReleaseUpdateModal(earmarkId, lotIndex) {
  const em  = DATA.earmark.find(x => x.id == earmarkId);
  if (!em) return;
  const lot = (em.lots || [])[lotIndex];
  if (!lot) return;

  const lotNum  = lot.lotNumber || lotIndex + 1;
  const prNum   = lot.prNumber || `${em.earmark_number}-${String(lotNum).padStart(2,'0')}`;
  const items   = lot.items || [];
  const lotAmt  = items.reduce((s, i) => s + (parseFloat(i.amount || i.totalCost) || 0), 0);
  const regSt   = deriveRegistryStatus(lot);

  const mkOpts = (opts, cur) => opts.map(o =>
    `<option value="${o}" ${(cur||opts[0])===o?'selected':''}>${o}</option>`
  ).join('');

  let modal = _$('releaseModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'releaseModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal" style="max-width:700px;">
      <div class="modal-header">
        <h2>📤 Update PR Release Status</h2>
        <button class="modal-close" onclick="closeReleaseModal()">✕</button>
      </div>
      <div class="modal-body" style="padding:20px;">

        <div style="background:var(--blue-light);border:1px solid var(--blue-mid);border-radius:var(--radius);padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:14px;">
          <div style="font-size:22px">📋</div>
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--blue)">${prNum}</div>
            <div style="font-size:11px;color:var(--text2);margin-top:2px">
              Earmark: <strong>${em.earmark_number}</strong> &nbsp;·&nbsp;
              Lot ${lotNum} &nbsp;·&nbsp; <strong>${fmt.cur(lotAmt)}</strong> &nbsp;·&nbsp;
              RC: <strong>${getRCById(em.rc_id)?.responsibility_center || '—'}</strong>
            </div>
          </div>
        </div>

        <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:12px;">

          <div class="form-group">
            <label>PR Number</label>
            <input type="text" id="rel_prNum" value="${prNum}" style="font-family:var(--mono);font-weight:600">
          </div>
          <div class="form-group">
            <label>Requisitioner</label>
            <input type="text" id="rel_requisitioner" value="${lot.requisitioner || ''}" placeholder="Full name">
          </div>

          <div class="form-group">
            <label class="req">Registry Status</label>
            <select id="rel_regStatus">${mkOpts(REG_STATUS_OPTS, regSt)}</select>
          </div>
          <div class="form-group">
            <label class="req">PR Status</label>
            <select id="rel_prStatus">${mkOpts(PR_STATUS_OPTS, lot.prStatus || 'Pending')}</select>
          </div>

          <div class="form-group">
            <label class="req">Approval Status</label>
            <select id="rel_approvalStatus">${mkOpts(APPROVAL_STATUS_OPTS, lot.approvalStatus || 'For Signature: RD')}</select>
          </div>
          <div class="form-group">
            <label class="req">Release Status</label>
            <select id="rel_releaseStatus">${mkOpts(RELEASE_STATUS_OPTS, lot.releaseStatus || 'Pending Release')}</select>
          </div>

          <div class="form-group">
            <label>Released To</label>
            <input type="text" id="rel_releasedTo" value="${lot.releasedTo || ''}" placeholder="e.g. RDO / BAC / End-User">
          </div>
          <div class="form-group">
            <label>Release Date</label>
            <input type="date" id="rel_releaseDate" value="${lot.releaseDate || ''}">
          </div>

          <div class="form-group">
            <label>Signed By</label>
            <input type="text" id="rel_signedBy" value="${lot.signedBy || ''}" placeholder="Name of signatory">
          </div>
          <div class="form-group">
            <label>Date Signed</label>
            <input type="date" id="rel_signedDate" value="${lot.signedDate || ''}">
          </div>

          <div class="form-group" style="grid-column:1/-1;">
            <label>Remarks / Notes</label>
            <textarea id="rel_remarks" rows="2" placeholder="Optional remarks...">${lot.releaseRemarks || ''}</textarea>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeReleaseModal()">Cancel</button>
        <button class="btn btn-success" onclick="saveReleaseUpdate(${earmarkId},${lotIndex})">💾 Save</button>
        <button class="btn btn-primary" onclick="saveReleaseUpdate(${earmarkId},${lotIndex},true)">💾 Save &amp; Print</button>
      </div>
    </div>`;

  modal.classList.add('open');
}

function closeReleaseModal() {
  const modal = _$('releaseModal');
  if (modal) modal.classList.remove('open');
}

document.addEventListener('click', e => {
  if (e.target.id === 'releaseModal') closeReleaseModal();
});

async function saveReleaseUpdate(earmarkId, lotIndex, andPrint = false) {
  const em = DATA.earmark.find(x => x.id == earmarkId);
  if (!em) return;

  const lots = JSON.parse(JSON.stringify(em.lots || []));
  if (!lots[lotIndex]) { toast('Lot not found', 'error'); return; }

  lots[lotIndex].prNumber       = (_$('rel_prNum')?.value        || '').trim();
  lots[lotIndex].requisitioner  = (_$('rel_requisitioner')?.value || '').trim();
  lots[lotIndex].registryStatus = _$('rel_regStatus')?.value      || '';
  lots[lotIndex].prStatus       = _$('rel_prStatus')?.value       || 'Pending';
  lots[lotIndex].approvalStatus = _$('rel_approvalStatus')?.value || 'For Signature: RD';
  lots[lotIndex].releaseStatus  = _$('rel_releaseStatus')?.value  || 'Pending Release';
  lots[lotIndex].releasedTo     = (_$('rel_releasedTo')?.value    || '').trim();
  lots[lotIndex].releaseDate    = _$('rel_releaseDate')?.value     || '';
  lots[lotIndex].signedBy       = (_$('rel_signedBy')?.value      || '').trim();
  lots[lotIndex].signedDate     = _$('rel_signedDate')?.value      || '';
  lots[lotIndex].releaseRemarks = (_$('rel_remarks')?.value       || '').trim();

  try {
    showSaving(true);
    await BudgetAPI.updateEarmark(earmarkId, {
      date:          em.date,
      quarter:       em.quarter,
      earmarkNumber: em.earmark_number,
      rcId:          em.rc_id,
      particulars:   em.particulars,
      totalAmount:   em.total_amount,
      lots,
    });
    await loadAll();
    closeReleaseModal();
    toast('Release status updated');

    // Refresh whichever view is open
    if (_$('sec-prmonitor')?.classList.contains('active')) {
      renderPRMonitoring();
    }
    const viewModal = _$('viewModal');
    if (viewModal?.classList.contains('open')) {
      viewRecord('earmark', earmarkId);
    }

    if (andPrint) setTimeout(() => printReleaseForm(earmarkId, lotIndex), 400);
  } catch(err) {
    toast(err.message, 'error');
  } finally {
    showSaving(false);
  }
}

// ══════════════════════════════════════════════════════════════
//  BULK UPDATE MODAL
// ══════════════════════════════════════════════════════════════
function openBulkReleaseModal() {
  if (_prSelected.size === 0) { toast('Select at least one PR first', 'error'); return; }

  const filterFY = _$('fy-select')?.value || '';
  const allRows  = buildAllPRs(filterFY);
  const targets  = allRows.filter(r => _prSelected.has(`${r.earmarkId}:${r.lotIndex}`));

  const mkOpts = (opts, placeholder) =>
    `<option value="">— ${placeholder} —</option>` +
    opts.map(o => `<option value="${o}">${o}</option>`).join('');

  let modal = _$('releaseBulkModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'releaseBulkModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal" style="max-width:680px;">
      <div class="modal-header">
        <h2>📤 Bulk Update — ${targets.length} PR${targets.length !== 1 ? 's' : ''}</h2>
        <button class="modal-close" onclick="closeBulkReleaseModal()">✕</button>
      </div>
      <div class="modal-body" style="padding:20px;">

        <!-- List of selected PRs -->
        <div style="border:1px solid var(--border);border-radius:var(--radius);max-height:160px;overflow-y:auto;margin-bottom:16px;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead><tr style="background:var(--surface);">
              <th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text2);border-bottom:1px solid var(--border)">PR #</th>
              <th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text2);border-bottom:1px solid var(--border)">RC</th>
              <th style="padding:7px 10px;font-size:10px;font-weight:600;color:var(--text2);border-bottom:1px solid var(--border)">Current Status</th>
            </tr></thead>
            <tbody>
              ${targets.map(r => `<tr style="border-bottom:1px solid var(--border)">
                <td style="padding:6px 10px;font-family:var(--mono);font-size:11px;font-weight:700;color:var(--blue)">${r.prNum}</td>
                <td style="padding:6px 10px;font-size:11px">${r.rcName}</td>
                <td style="padding:6px 10px">${prStatusBadge(r.prStatus)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>

        <div style="font-size:12px;color:var(--text2);margin-bottom:12px;">
          Leave a field at <em>— no change —</em> to keep the existing value.
        </div>

        <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label>Registry Status</label>
            <select id="bulk_regStatus">${mkOpts(REG_STATUS_OPTS, 'no change')}</select>
          </div>
          <div class="form-group">
            <label>PR Status</label>
            <select id="bulk_prStatus">${mkOpts(PR_STATUS_OPTS, 'no change')}</select>
          </div>
          <div class="form-group">
            <label>Approval Status</label>
            <select id="bulk_approvalStatus">${mkOpts(APPROVAL_STATUS_OPTS, 'no change')}</select>
          </div>
          <div class="form-group">
            <label>Release Status</label>
            <select id="bulk_releaseStatus">${mkOpts(RELEASE_STATUS_OPTS, 'no change')}</select>
          </div>
          <div class="form-group">
            <label>Released To</label>
            <input type="text" id="bulk_releasedTo" placeholder="Leave blank = no change">
          </div>
          <div class="form-group">
            <label>Release Date</label>
            <input type="date" id="bulk_releaseDate">
          </div>
          <div class="form-group">
            <label>Signed By</label>
            <input type="text" id="bulk_signedBy" placeholder="Leave blank = no change">
          </div>
          <div class="form-group">
            <label>Date Signed</label>
            <input type="date" id="bulk_signedDate">
          </div>
          <div class="form-group" style="grid-column:1/-1;">
            <label>Remarks (appended)</label>
            <textarea id="bulk_remarks" rows="2" placeholder="Optional — appended to existing remarks"></textarea>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeBulkReleaseModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveBulkRelease()">Apply to ${targets.length} PR${targets.length !== 1 ? 's' : ''}</button>
      </div>
    </div>`;

  modal.classList.add('open');
}

function closeBulkReleaseModal() {
  const m = _$('releaseBulkModal');
  if (m) m.classList.remove('open');
}

document.addEventListener('click', e => {
  if (e.target.id === 'releaseBulkModal') closeBulkReleaseModal();
});

async function saveBulkRelease() {
  const filterFY = _$('fy-select')?.value || '';
  const allRows  = buildAllPRs(filterFY);
  const targets  = allRows.filter(r => _prSelected.has(`${r.earmarkId}:${r.lotIndex}`));
  if (!targets.length) return;

  const regSt   = _$('bulk_regStatus')?.value   || '';
  const prSt    = _$('bulk_prStatus')?.value    || '';
  const apSt    = _$('bulk_approvalStatus')?.value || '';
  const relSt   = _$('bulk_releaseStatus')?.value  || '';
  const relTo   = (_$('bulk_releasedTo')?.value   || '').trim();
  const relDate = _$('bulk_releaseDate')?.value   || '';
  const signBy  = (_$('bulk_signedBy')?.value     || '').trim();
  const signDt  = _$('bulk_signedDate')?.value    || '';
  const rmk     = (_$('bulk_remarks')?.value      || '').trim();

  // Group targets by earmarkId
  const byEarmark = {};
  targets.forEach(r => {
    if (!byEarmark[r.earmarkId]) byEarmark[r.earmarkId] = [];
    byEarmark[r.earmarkId].push(r.lotIndex);
  });

  try {
    showSaving(true);
    for (const [emId, lotIdxs] of Object.entries(byEarmark)) {
      const em = DATA.earmark.find(x => x.id == emId);
      if (!em) continue;
      const lots = JSON.parse(JSON.stringify(em.lots || []));
      lotIdxs.forEach(li => {
        const lot = lots[li];
        if (!lot) return;
        if (regSt)   lot.registryStatus = regSt;
        if (prSt)    lot.prStatus       = prSt;
        if (apSt)    lot.approvalStatus = apSt;
        if (relSt)   lot.releaseStatus  = relSt;
        if (relTo)   lot.releasedTo     = relTo;
        if (relDate) lot.releaseDate    = relDate;
        if (signBy)  lot.signedBy       = signBy;
        if (signDt)  lot.signedDate     = signDt;
        if (rmk)     lot.releaseRemarks = lot.releaseRemarks ? lot.releaseRemarks + '; ' + rmk : rmk;
      });
      await BudgetAPI.updateEarmark(parseInt(emId), {
        date:          em.date,
        quarter:       em.quarter,
        earmarkNumber: em.earmark_number,
        rcId:          em.rc_id,
        particulars:   em.particulars,
        totalAmount:   em.total_amount,
        lots,
      });
    }
    await loadAll();
    closeBulkReleaseModal();
    _prSelected.clear();
    renderPRMonitoring();
    toast(`${targets.length} PR${targets.length !== 1 ? 's' : ''} updated`);
  } catch(err) {
    toast(err.message, 'error');
  } finally {
    showSaving(false);
  }
}

// ══════════════════════════════════════════════════════════════
//  INLINE RELEASE TABLE (inside earmark view modal)
// ══════════════════════════════════════════════════════════════
function emBuildReleaseTable(em) {
  const lots = em.lots || [];
  if (!lots.length) return '';

  const rc = getRCById(em.rc_id);

  const rows = lots.map((lot, li) => {
    const items       = lot.items || [];
    const lotAmt      = items.reduce((s, i) => s + (parseFloat(i.amount || i.totalCost) || 0), 0);
    const particulars = items.map(i => i.particulars).filter(Boolean).join('; ') || '—';
    const lotNum      = lot.lotNumber || li + 1;
    const prNum       = lot.prNumber || `${em.earmark_number}-${String(lotNum).padStart(2,'0')}`;
    const regSt       = deriveRegistryStatus(lot);
    const prSt        = lot.prStatus || 'Pending';
    const apSt        = lot.approvalStatus || 'For Signature: RD';
    const relSt       = lot.releaseStatus || 'Pending Release';
    const signedBy    = lot.signedBy || '—';

    return `<tr style="border-bottom:1px solid var(--border);vertical-align:middle;">
      <td style="padding:8px 10px;font-family:var(--mono);font-weight:700;font-size:11px;white-space:nowrap;color:var(--blue)">${prNum}</td>
      <td style="padding:8px 10px;font-size:11px;font-weight:600">${rc?.responsibility_center || '—'}</td>
      <td style="padding:8px 10px;font-size:11px;max-width:200px;line-height:1.4">
        <div style="font-weight:500">Lot ${lotNum}: ${particulars.substring(0,70)}${particulars.length>70?'…':''}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:1px">${items.length} entr${items.length===1?'y':'ies'} · ${fmt.cur(lotAmt)}</div>
      </td>
      <td style="padding:8px 10px;font-size:11px;white-space:nowrap">${lot.requisitioner || '—'}</td>
      <td style="padding:8px 10px;font-family:var(--mono);font-size:11px;font-weight:600;white-space:nowrap;text-align:right">${fmt.cur(lotAmt)}</td>
      <td style="padding:8px 10px;white-space:nowrap">${regStatusBadge(regSt)}</td>
      <td style="padding:8px 10px;white-space:nowrap">${prStatusBadge(prSt)}</td>
      <td style="padding:8px 10px;white-space:nowrap">${approvalStatusBadge(apSt)}</td>
      <td style="padding:8px 10px;white-space:nowrap">${releaseStatusBadge(relSt)}</td>
      <td style="padding:8px 10px;font-size:11px;white-space:nowrap">${lot.releaseDate ? fmt.date(lot.releaseDate) : '—'}</td>
      <td style="padding:8px 10px;font-size:11px;white-space:nowrap">${signedBy}</td>
      <td style="padding:8px 10px;white-space:nowrap">
        <div style="display:flex;gap:4px;">
          <button class="act-btn a-edit" style="font-size:10px;padding:3px 8px"
            onclick="openReleaseUpdateModal(${em.id},${li})">Update</button>
          <button class="act-btn a-print" style="font-size:10px;padding:3px 8px;background:var(--green-light);color:var(--green);border-color:var(--green-mid)"
            onclick="printReleaseForm(${em.id},${li})">🖨</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const grandTotal = lots.reduce((s, lot) =>
    s + (lot.items||[]).reduce((ss, i) => ss + (parseFloat(i.amount||i.totalCost)||0), 0), 0);

  return `
    <div style="margin-top:20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;">📤 PR Release Monitoring</span>
          <span class="badge b-cyan" style="font-size:10px">${lots.length} PR${lots.length!==1?'s':''}</span>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-outline btn-sm" onclick="nav('prmonitor')" style="font-size:11px">
            📊 Full Monitoring
          </button>
          <button class="btn btn-success btn-sm" onclick="printAllReleaseForms(${em.id})" style="font-size:11px">
            🖨 Print All
          </button>
        </div>
      </div>
      <div style="border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;">
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:1050px;">
            <thead>
              <tr style="background:#1e3a5f;">
                <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;border-right:1px solid #2d5382">PR No.</th>
                <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:.04em;border-right:1px solid #2d5382">Responsibility Center</th>
                <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:.04em;border-right:1px solid #2d5382">Particulars</th>
                <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;border-right:1px solid #2d5382">Requisitioner</th>
                <th style="padding:8px 10px;text-align:right;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;border-right:1px solid #2d5382">Amount</th>
                <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;border-right:1px solid #2d5382">Registry Status</th>
                <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;border-right:1px solid #2d5382">PR Status</th>
                <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;border-right:1px solid #2d5382">Approval Status</th>
                <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;border-right:1px solid #2d5382">Release</th>
                <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;border-right:1px solid #2d5382">Date</th>
                <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;border-right:1px solid #2d5382">Sign</th>
                <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Action</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr style="background:var(--green-light);border-top:2px solid var(--green-mid);">
                <td colspan="4" style="padding:8px 10px;font-weight:700;font-size:12px;color:var(--green);">Grand Total</td>
                <td style="padding:8px 10px;font-family:var(--mono);font-weight:700;text-align:right;color:var(--green);font-size:13px;">${fmt.cur(grandTotal)}</td>
                <td colspan="7"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
//  PRINT — SINGLE PR FORM
// ══════════════════════════════════════════════════════════════
function printReleaseForm(earmarkId, lotIndex) {
  const em  = DATA.earmark.find(x => x.id == earmarkId);
  if (!em) return;
  const lot = (em.lots || [])[lotIndex];
  if (!lot) return;

  const rc    = getRCById(em.rc_id);
  const prefs = JSON.parse(localStorage.getItem('budget_registry_prefs') || '{}');
  const agency = prefs.agencyName || 'Republic of the Philippines';
  const region = prefs.region     || '';
  const office = prefs.office     || '';

  const lotNum      = lot.lotNumber || lotIndex + 1;
  const prNum       = lot.prNumber  || `${em.earmark_number}-${String(lotNum).padStart(2,'0')}`;
  const items       = lot.items     || [];
  const lotAmt      = items.reduce((s, i) => s + (parseFloat(i.amount || i.totalCost) || 0), 0);
  const prStatus    = lot.prStatus       || 'Pending';
  const apStatus    = lot.approvalStatus || 'For Signature: RD';
  const relStatus   = lot.releaseStatus  || 'Pending Release';
  const regStatus   = deriveRegistryStatus(lot);
  const requisitioner = lot.requisitioner || '___________________________';
  const releasedTo  = lot.releasedTo     || '___________________________';
  const releaseDate = lot.releaseDate    ? fmt.date(lot.releaseDate) : '_______________';
  const signedBy    = lot.signedBy       || '___________________________';
  const signedDate  = lot.signedDate     ? fmt.date(lot.signedDate) : '_______________';
  const remarks     = lot.releaseRemarks || '';

  const sigs   = rc?.signatories || [];
  const cert   = sigs[0] || { name: '___________________________', position: 'Budget Officer' };
  const approv = sigs[1] || { name: '___________________________', position: 'Regional Director' };

  // Status color helpers (print-safe)
  const stColor = s => {
    if (['Approved','Released to: RDO','Released to: BAC','Released to: End-User','Budget Approved'].includes(s)) return '#16a34a';
    if (['Not-Approved','Cancelled','Return to End-User','Return to BAC'].includes(s)) return '#dc2626';
    if (['Pending','For Signature: RD','Pending Release'].includes(s)) return '#d97706';
    return '#2563eb';
  };

  const itemRows = items.map((item, ii) => `
    <tr>
      <td style="padding:5px 8px;text-align:center;border:1px solid #ccc;font-size:8.5pt">${ii + 1}</td>
      <td style="padding:5px 8px;border:1px solid #ccc;font-size:8.5pt">${item.particulars || '—'}</td>
      <td style="padding:5px 8px;border:1px solid #ccc;font-size:8.5pt">${item.expenseClass || '—'}</td>
      <td style="padding:5px 8px;border:1px solid #ccc;font-size:8.5pt">${item.accountCode || item.account_code || '—'}</td>
      <td style="padding:5px 8px;border:1px solid #ccc;font-size:8.5pt">${item.activity || '—'}</td>
      <td style="padding:5px 8px;text-align:right;border:1px solid #ccc;font-family:Courier,monospace;font-size:8.5pt">${fmt.cur(item.amount || item.totalCost || 0)}</td>
    </tr>`).join('');

  const w = window.open('', '_blank', 'width=950,height=800');
  w.document.write(`<!DOCTYPE html><html><head>
  <title>PR Release Form – ${prNum}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Arial',sans-serif;font-size:10pt;color:#000;background:#fff;padding:12mm 16mm;}
    .wrap{max-width:740px;margin:0 auto;}
    .agency-header{text-align:center;margin-bottom:14px;padding-bottom:10px;border-bottom:3px solid #1e3a5f;}
    .agency-header .dept{font-size:8.5pt;text-transform:uppercase;letter-spacing:1px;color:#555;}
    .agency-header .name{font-size:13pt;font-weight:bold;text-transform:uppercase;margin:4px 0;}
    .form-title{background:#1e3a5f;color:white;text-align:center;padding:8px 14px;margin-bottom:12px;}
    .form-title h2{font-size:11.5pt;font-weight:bold;text-transform:uppercase;letter-spacing:1px;}
    .form-title p{font-size:8.5pt;opacity:.8;margin-top:2px;}
    .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:12px;}
    .meta-item{display:flex;gap:6px;align-items:baseline;font-size:9pt;}
    .meta-item .lbl{font-weight:bold;white-space:nowrap;min-width:90px;color:#444;}
    .meta-item .val{border-bottom:1px solid #aaa;flex:1;padding:1px 3px;min-height:16px;}
    .status-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px;}
    .status-box{border:1px solid #ccc;padding:7px 10px;text-align:center;}
    .status-box .slbl{font-size:7.5pt;font-weight:bold;text-transform:uppercase;color:#666;margin-bottom:3px;}
    .status-box .sval{font-size:9.5pt;font-weight:bold;}
    table.items{width:100%;border-collapse:collapse;margin-bottom:12px;}
    table.items th{background:#1e3a5f;color:white;padding:6px 8px;border:1px solid #2d5382;text-align:left;font-size:8pt;text-transform:uppercase;}
    table.items tfoot td{background:#f0f0f0;font-weight:bold;padding:6px 8px;border:1px solid #ccc;}
    .section-title{font-size:9pt;font-weight:bold;text-transform:uppercase;border-bottom:2px solid #1e3a5f;padding-bottom:2px;margin:12px 0 7px;color:#1e3a5f;}
    .sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:18px;}
    .sig-block{text-align:center;}
    .sig-line{border-top:1px solid #000;margin:28px 6px 4px;padding-top:4px;}
    .sig-name{font-weight:bold;font-size:10pt;}
    .sig-pos{font-size:8pt;color:#444;}
    .sig-label{font-size:7.5pt;font-style:italic;color:#666;margin-top:2px;}
    .footer-note{font-size:7pt;color:#888;text-align:center;margin-top:14px;border-top:1px dashed #ccc;padding-top:6px;}
    .remarks-box{border:1px solid #ccc;padding:7px 10px;min-height:35px;font-size:9pt;background:#fafafa;}
    @media print{body{padding:0;}@page{margin:12mm 14mm;size:A4;}}
  </style></head><body>
  <div class="wrap">
    <div class="agency-header">
      <div class="dept">Republic of the Philippines</div>
      <div class="name">${agency}</div>
      ${region ? `<div style="font-size:9.5pt;color:#333">${region}${office?' — '+office:''}</div>` : ''}
    </div>
    <div class="form-title">
      <h2>Purchase Request Release Form</h2>
      <p>Budget Earmark Release Monitoring &nbsp;·&nbsp; Registry System v3.0</p>
    </div>
    <div class="meta-grid">
      <div class="meta-item"><span class="lbl">PR Number:</span><span class="val"><strong>${prNum}</strong></span></div>
      <div class="meta-item"><span class="lbl">Earmark #:</span><span class="val">${em.earmark_number}</span></div>
      <div class="meta-item"><span class="lbl">Responsibility Center:</span><span class="val">${rc?.responsibility_center||'—'}</span></div>
      <div class="meta-item"><span class="lbl">Fund Cluster:</span><span class="val">${rc?.fund_cluster||'—'}</span></div>
      <div class="meta-item"><span class="lbl">Quarter:</span><span class="val">${em.quarter||'—'}</span></div>
      <div class="meta-item"><span class="lbl">Earmark Date:</span><span class="val">${fmt.date(em.date)}</span></div>
      <div class="meta-item"><span class="lbl">Requisitioner:</span><span class="val">${requisitioner}</span></div>
      <div class="meta-item"><span class="lbl">Release Date:</span><span class="val">${releaseDate}</span></div>
      <div class="meta-item"><span class="lbl">Released To:</span><span class="val">${releasedTo}</span></div>
      <div class="meta-item"><span class="lbl">Date Signed:</span><span class="val">${signedDate}</span></div>
    </div>
    <div class="status-grid">
      <div class="status-box">
        <div class="slbl">Registry Status</div>
        <div class="sval" style="color:${stColor(regStatus)}">${regStatus}</div>
      </div>
      <div class="status-box">
        <div class="slbl">PR Status</div>
        <div class="sval" style="color:${stColor(prStatus)}">${prStatus}</div>
      </div>
      <div class="status-box">
        <div class="slbl">Approval Status</div>
        <div class="sval" style="color:${stColor(apStatus)}">${apStatus}</div>
      </div>
      <div class="status-box">
        <div class="slbl">Release Status</div>
        <div class="sval" style="color:${stColor(relStatus)}">${relStatus}</div>
      </div>
    </div>
    <div class="section-title">Lot ${lotNum} — Item Details</div>
    <table class="items">
      <thead><tr>
        <th style="width:28px;text-align:center">#</th>
        <th>Particulars</th>
        <th style="width:120px">Expense Class</th>
        <th style="width:140px">Account Code</th>
        <th style="width:110px">Activity</th>
        <th style="width:90px;text-align:right">Amount</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
      <tfoot><tr>
        <td colspan="5" style="text-align:right;font-size:9pt">Total Lot Amount:</td>
        <td style="text-align:right;font-family:Courier,monospace">${fmt.cur(lotAmt)}</td>
      </tr></tfoot>
    </table>
    ${remarks ? `<div class="section-title">Remarks</div><div class="remarks-box">${remarks}</div>` : ''}
    <div class="section-title">Certification &amp; Approval</div>
    <p style="font-size:8.5pt;color:#444;line-height:1.6;margin-bottom:14px;">
      This certifies that the Purchase Request listed above has been reviewed, verified against the
      budget earmark, and the allotment is available in accordance with existing laws and regulations.
    </p>
    <div class="sig-grid">
      <div class="sig-block">
        <div style="font-size:8.5pt;text-align:left;margin-bottom:6px;color:#555">Signed By: <strong>${signedBy}</strong></div>
        <div class="sig-line">
          <div class="sig-name">${cert.name}</div>
          <div class="sig-pos">${cert.position}</div>
          <div class="sig-label">Certified: Allotment Available</div>
        </div>
      </div>
      <div class="sig-block">
        <div style="font-size:8.5pt;text-align:left;margin-bottom:6px;color:#555">&nbsp;</div>
        <div class="sig-line">
          <div class="sig-name">${approv.name}</div>
          <div class="sig-pos">${approv.position}</div>
          <div class="sig-label">Approving Authority</div>
        </div>
      </div>
    </div>
    <div class="footer-note">
      Printed: ${new Date().toLocaleString('en-PH',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})}
      &nbsp;·&nbsp; Budget Registry System v3.0 &nbsp;·&nbsp; ${agency}
    </div>
  </div>
  <script>window.onload=()=>window.print();<\/script>
  </body></html>`);
  w.document.close();
}

// ══════════════════════════════════════════════════════════════
//  PRINT — ALL PRs SUMMARY (per earmark)
// ══════════════════════════════════════════════════════════════
function printAllReleaseForms(earmarkId) {
  const em   = DATA.earmark.find(x => x.id == earmarkId);
  if (!em) return;
  const lots = em.lots || [];
  if (!lots.length) { toast('No lots to print', 'error'); return; }

  const rc     = getRCById(em.rc_id);
  const prefs  = JSON.parse(localStorage.getItem('budget_registry_prefs') || '{}');
  const agency = prefs.agencyName || 'Republic of the Philippines';
  const region = prefs.region     || '';
  const office = prefs.office     || '';
  const sigs   = rc?.signatories  || [];
  const cert   = sigs[0] || { name: '___________________________', position: 'Budget Officer' };
  const approv = sigs[1] || { name: '___________________________', position: 'Regional Director' };

  const stBg = s => {
    if (['Approved','Released to: RDO','Released to: BAC','Released to: End-User','Budget Approved','Earmarked'].includes(s)) return '#d1fae5;color:#065f46';
    if (['Not-Approved','Cancelled','Return to End-User','Return to BAC','Not Earmarked'].includes(s)) return '#fee2e2;color:#991b1b';
    if (['Pending','For Signature: RD','Pending Release'].includes(s)) return '#fef3c7;color:#92400e';
    return '#dbeafe;color:#1e40af';
  };

  const pill = (s) => s
    ? `<span style="background:${stBg(s)};border-radius:20px;padding:1px 8px;font-size:7.5pt;font-weight:600;white-space:nowrap">${s}</span>`
    : '—';

  const rows = lots.map((lot, li) => {
    const items   = lot.items || [];
    const lotAmt  = items.reduce((s, i) => s + (parseFloat(i.amount || i.totalCost) || 0), 0);
    const parts   = items.map(i => i.particulars).filter(Boolean).join('; ') || '—';
    const lotNum  = lot.lotNumber || li + 1;
    const prNum   = lot.prNumber  || `${em.earmark_number}-${String(lotNum).padStart(2,'0')}`;
    const regSt   = deriveRegistryStatus(lot);
    return `<tr style="border-bottom:1px solid #ddd;font-size:8pt;vertical-align:middle">
      <td style="padding:6px 8px;border:1px solid #ddd;font-family:Courier,monospace;font-weight:bold;color:#1e3a5f;white-space:nowrap">${prNum}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;font-size:7.5pt">${rc?.responsibility_center||'—'}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;max-width:160px">${parts.substring(0,60)}${parts.length>60?'…':''}</td>
      <td style="padding:6px 8px;border:1px solid #ddd">${lot.requisitioner||'—'}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier,monospace;font-weight:bold">${fmt.cur(lotAmt)}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:center">${pill(regSt)}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:center">${pill(lot.prStatus||'Pending')}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:center">${pill(lot.approvalStatus||'For Signature: RD')}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:center">${pill(lot.releaseStatus||'Pending Release')}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;font-size:7.5pt;white-space:nowrap">${lot.releaseDate?fmt.date(lot.releaseDate):'—'}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;font-size:7.5pt">${lot.signedBy||'—'}</td>
    </tr>`;
  }).join('');

  const grandTotal = lots.reduce((s, lot) =>
    s + (lot.items||[]).reduce((ss,i)=>ss+(parseFloat(i.amount||i.totalCost)||0),0), 0);

  const w = window.open('', '_blank', 'width=1100,height=800');
  w.document.write(`<!DOCTYPE html><html><head>
  <title>PR Summary – ${em.earmark_number}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Arial',sans-serif;font-size:9pt;color:#000;background:#fff;padding:10mm 14mm;}
    .agency-header{text-align:center;margin-bottom:12px;padding-bottom:8px;border-bottom:3px solid #1e3a5f;}
    .agency-header .name{font-size:12pt;font-weight:bold;text-transform:uppercase;margin:3px 0;}
    .form-title{background:#1e3a5f;color:white;text-align:center;padding:7px 12px;margin-bottom:10px;}
    .form-title h2{font-size:11pt;font-weight:bold;text-transform:uppercase;}
    .meta-strip{display:flex;gap:18px;flex-wrap:wrap;margin-bottom:10px;font-size:8.5pt;background:#f0f4ff;padding:7px 10px;border:1px solid #c7d2fe;}
    .mi{display:flex;gap:5px;}.mi .lbl{font-weight:bold;color:#374151;}
    .sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:16px;}
    .sig-block{text-align:center;}
    .sig-line{border-top:1px solid #000;margin:24px 6px 4px;padding-top:4px;}
    .sig-name{font-weight:bold;font-size:10pt;}
    .sig-pos{font-size:8pt;color:#444;}
    .sig-label{font-size:7.5pt;font-style:italic;color:#666;margin-top:2px;}
    .footer-note{font-size:7pt;color:#888;text-align:center;margin-top:14px;border-top:1px dashed #ccc;padding-top:5px;}
    @media print{body{padding:0;}@page{margin:10mm 12mm;size:A4 landscape;}}
  </style></head><body>
  <div class="agency-header">
    <div style="font-size:8pt;text-transform:uppercase;letter-spacing:1px;color:#555">Republic of the Philippines</div>
    <div class="name">${agency}</div>
    ${region?`<div style="font-size:9pt;color:#333">${region}${office?' — '+office:''}</div>`:''}
  </div>
  <div class="form-title">
    <h2>Purchase Request Release Monitoring Summary</h2>
    <p style="font-size:8pt;opacity:.85">Earmark ${em.earmark_number} &nbsp;·&nbsp; ${em.quarter||''} &nbsp;·&nbsp; ${fmt.date(em.date)}</p>
  </div>
  <div class="meta-strip">
    <div class="mi"><span class="lbl">Earmark #:</span><span>${em.earmark_number}</span></div>
    <div class="mi"><span class="lbl">RC:</span><span>${rc?.responsibility_center||'—'}</span></div>
    <div class="mi"><span class="lbl">Total Amount:</span><span><strong>${fmt.cur(em.total_amount)}</strong></span></div>
    <div class="mi"><span class="lbl">Total PRs:</span><span>${lots.length}</span></div>
    <div class="mi"><span class="lbl">Date Printed:</span><span>${new Date().toLocaleDateString('en-PH')}</span></div>
  </div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:8pt;">
    <thead><tr style="background:#1e3a5f;">
      <th style="padding:7px 8px;text-align:left;color:white;border:1px solid #2d5382;white-space:nowrap">PR No.</th>
      <th style="padding:7px 8px;text-align:left;color:white;border:1px solid #2d5382">Responsibility Center</th>
      <th style="padding:7px 8px;text-align:left;color:white;border:1px solid #2d5382">Particulars</th>
      <th style="padding:7px 8px;text-align:left;color:white;border:1px solid #2d5382;white-space:nowrap">Requisitioner</th>
      <th style="padding:7px 8px;text-align:right;color:white;border:1px solid #2d5382;white-space:nowrap">Amount</th>
      <th style="padding:7px 8px;text-align:center;color:white;border:1px solid #2d5382;white-space:nowrap">Registry Status</th>
      <th style="padding:7px 8px;text-align:center;color:white;border:1px solid #2d5382;white-space:nowrap">PR Status</th>
      <th style="padding:7px 8px;text-align:center;color:white;border:1px solid #2d5382;white-space:nowrap">Approval Status</th>
      <th style="padding:7px 8px;text-align:center;color:white;border:1px solid #2d5382;white-space:nowrap">Release</th>
      <th style="padding:7px 8px;text-align:left;color:white;border:1px solid #2d5382;white-space:nowrap">Date</th>
      <th style="padding:7px 8px;text-align:left;color:white;border:1px solid #2d5382;white-space:nowrap">Sign</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr style="background:#f0f0f0;font-weight:bold;">
      <td colspan="4" style="padding:6px 8px;border:1px solid #ccc;text-align:right;font-size:8.5pt;">Grand Total:</td>
      <td style="padding:6px 8px;border:1px solid #ccc;text-align:right;font-family:Courier,monospace;font-size:9pt;">${fmt.cur(grandTotal)}</td>
      <td colspan="6" style="border:1px solid #ccc;"></td>
    </tr></tfoot>
  </table>
  <div class="sig-grid">
    <div class="sig-block">
      <div class="sig-line">
        <div class="sig-name">${cert.name}</div>
        <div class="sig-pos">${cert.position}</div>
        <div class="sig-label">Certified: Allotment Available</div>
      </div>
    </div>
    <div class="sig-block">
      <div class="sig-line">
        <div class="sig-name">${approv.name}</div>
        <div class="sig-pos">${approv.position}</div>
        <div class="sig-label">Approving Authority</div>
      </div>
    </div>
  </div>
  <div class="footer-note">
    Printed: ${new Date().toLocaleString('en-PH',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})}
    &nbsp;·&nbsp; Budget Registry System v3.0 &nbsp;·&nbsp; ${agency}
  </div>
  <script>window.onload=()=>window.print();<\/script>
  </body></html>`);
  w.document.close();
}

// ══════════════════════════════════════════════════════════════
//  PATCH viewRecord() — inject release table into earmark view
// ══════════════════════════════════════════════════════════════
(function patchViewRecord() {
  const _tryPatch = () => {
    if (typeof viewRecord !== 'function') { setTimeout(_tryPatch, 100); return; }
    const _orig = viewRecord;
    window.viewRecord = function(type, id) {
      _orig(type, id);
      if (type === 'earmark') {
        const em   = DATA.earmark.find(x => x.id == id);
        if (!em) return;
        const body = _$('viewBody');
        if (!body) return;
        const html = emBuildReleaseTable(em);
        if (html) {
          const div = document.createElement('div');
          div.innerHTML = html;
          body.appendChild(div);
          const vm    = _$('viewModal');
          const inner = vm?.querySelector('.modal');
          if (inner) inner.style.maxWidth = '1140px';
        }
      }
    };
  };
  _tryPatch();
})();

// ══════════════════════════════════════════════════════════════
//  PATCH renderEarmark() — add Release Status summary column
// ══════════════════════════════════════════════════════════════
(function patchRenderEarmark() {
  const _tryPatch = () => {
    if (typeof renderEarmark !== 'function') { setTimeout(_tryPatch, 100); return; }
    const _origRender = renderEarmark;
    window.renderEarmark = function() {
      _origRender();
      const thead = document.querySelector('#sec-earmarked table thead tr');
      if (thead && !thead.querySelector('.release-col-header')) {
        const actTh = [...thead.querySelectorAll('th')].find(th => th.textContent.trim() === 'Actions');
        if (actTh) {
          const th = document.createElement('th');
          th.className = 'release-col-header';
          th.textContent = 'Release Status';
          th.style.whiteSpace = 'nowrap';
          thead.insertBefore(th, actTh);
        }
      }
      const tbody = _$('em-tbody');
      if (!tbody) return;
      tbody.querySelectorAll('tr').forEach((tr, ri) => {
        if (tr.classList.contains('empty-row')) return;
        if (tr.querySelector('.release-status-cell')) return;
        const em   = DATA.earmark[ri];
        if (!em) return;
        const lots = em.lots || [];
        const tot  = lots.length;
        const rel  = lots.filter(l => (l.releaseStatus || '').startsWith('Released')).length;
        const appr = lots.filter(l => ['Approved','Budget Approved'].includes(l.prStatus)).length;
        const notAppr = lots.filter(l => l.prStatus === 'Not-Approved').length;
        let badge = '';
        if (!tot)          badge = `<span style="color:var(--text3);font-size:11px">No PRs</span>`;
        else if (rel===tot) badge = `<span class="badge b-green" style="font-size:10px">All Released (${rel})</span>`;
        else if (rel>0)     badge = `<span class="badge b-cyan" style="font-size:10px">${rel}/${tot} Released</span>`;
        else if (notAppr>0) badge = `<span class="badge b-red" style="font-size:10px">${notAppr} Not Approved</span>`;
        else if (appr>0)    badge = `<span class="badge b-blue" style="font-size:10px">${appr}/${tot} Approved</span>`;
        else                badge = `<span class="badge b-yellow" style="font-size:10px">Pending (${tot})</span>`;
        const td = document.createElement('td');
        td.className = 'release-status-cell';
        td.innerHTML = badge;
        const tds = tr.querySelectorAll('td');
        tr.insertBefore(td, tds[tds.length - 1]);
      });
    };
  };
  _tryPatch();
})();

// ══════════════════════════════════════════════════════════════
//  INJECT PR MONITORING NAV + SECTION + CSS
//  Called at DOMContentLoaded (below) after all scripts load
// ══════════════════════════════════════════════════════════════
function injectPRMonitoringModule() {
  // ── 1. Add CSS ─────────────────────────────────────────────
  if (!_$('prm-style')) {
    const style = document.createElement('style');
    style.id = 'prm-style';
    style.textContent = `
      #sec-prmonitor .prm-selected td { background: var(--blue-light) !important; }
      .prm-cb { width:14px; height:14px; cursor:pointer; accent-color:var(--blue); }
      .prm-kpi-grid { display:grid; grid-template-columns:repeat(6,1fr); gap:10px; margin-bottom:16px; }
      .prm-kpi { background:var(--white); border:1px solid var(--border); border-radius:var(--radius-lg); padding:14px 16px; box-shadow:var(--shadow); }
      .prm-kpi h3 { font-size:11px; color:var(--text2); font-weight:500; text-transform:uppercase; letter-spacing:.04em; margin-bottom:4px; }
      .prm-kpi p  { font-size:20px; font-weight:700; font-family:var(--mono); color:var(--text); }
      .prm-filters { display:grid; grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr 1fr; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
      .prm-bulk-bar { display:none; align-items:center; gap:8px; padding:8px 12px; background:var(--blue-light); border:1px solid var(--blue-mid); border-radius:var(--radius); margin-bottom:10px; }
      .prm-bulk-bar span { font-size:12px; color:var(--blue); font-weight:500; flex:1; }
    `;
    document.head.appendChild(style);
  }

  // ── 2. Add nav item ────────────────────────────────────────
  if (!_$('nav-prmonitor')) {
    const nav = document.querySelector('nav.nav-section');
    if (nav) {
      // Insert after the earmarked nav item
      const earmarkedItem = _$('nav-earmarked');
      const prItem = document.createElement('div');
      prItem.className = 'nav-item';
      prItem.id = 'nav-prmonitor';
      prItem.innerHTML = `<span class="nav-icon">📤</span><span class="nav-text">PR Monitoring</span><span class="nav-badge" id="badge-prmonitor">0</span>`;
      prItem.onclick = () => {
        if (typeof nav === 'function') nav('prmonitor');
        else {
          document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
          document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
          prItem.classList.add('active');
          _$('sec-prmonitor').classList.add('active');
          _$('topbar-title').textContent = 'PR Monitoring';
          renderPRMonitoring();
        }
      };
      if (earmarkedItem?.nextSibling) {
        nav.insertBefore(prItem, earmarkedItem.nextSibling);
      } else {
        nav.appendChild(prItem);
      }
    }
  }

  // ── 3. Add nav + SEC_MAP entries ──────────────────────────
  if (typeof SECTION_NAMES !== 'undefined') {
    SECTION_NAMES['prmonitor'] = 'PR Monitoring';
    SEC_MAP['prmonitor']       = 'sec-prmonitor';
  }

  // Patch nav() to call renderPRMonitoring on tab switch
  if (typeof nav === 'function' && !window._navPRPatched) {
    window._navPRPatched = true;
    const _origNav = nav;
    window.nav = function(key) {
      _origNav(key);
      if (key === 'prmonitor') setTimeout(renderPRMonitoring, 50);
    };
  }

  // ── 4. Build section HTML ──────────────────────────────────
  if (!_$('sec-prmonitor')) {
    const content = document.querySelector('.content');
    if (!content) return;

    const sec = document.createElement('div');
    sec.className = 'section';
    sec.id = 'sec-prmonitor';
    sec.innerHTML = `
      <!-- Section Header -->
      <div class="section-header">
        <h1>PR Release Monitoring</h1>
        <p>Track Purchase Request status, approval, and release across all earmarks</p>
      </div>

      <!-- KPI Cards -->
      <div class="prm-kpi-grid" id="prm-kpis">
        <div class="prm-kpi"><h3>Total PRs</h3><p id="prm-kpi-total">0</p></div>
        <div class="prm-kpi"><h3>Pending</h3><p id="prm-kpi-pending" style="color:var(--yellow)">0</p></div>
        <div class="prm-kpi"><h3>Approved</h3><p id="prm-kpi-approved" style="color:var(--green)">0</p></div>
        <div class="prm-kpi"><h3>Released</h3><p id="prm-kpi-released" style="color:var(--cyan)">0</p></div>
        <div class="prm-kpi"><h3>Not Approved</h3><p id="prm-kpi-notappr" style="color:var(--red)">0</p></div>
        <div class="prm-kpi"><h3>Total Amount</h3><p id="prm-kpi-amt" style="font-size:15px">₱0</p></div>
      </div>

      <!-- Toolbar -->
      <div class="toolbar" style="margin-bottom:10px">
        <div class="search-wrap" style="flex:2">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input class="search-input" id="prm-search" placeholder="Search PR #, earmark, RC, particulars, requisitioner..." oninput="renderPRMonitoring()">
        </div>
        <button class="btn btn-primary" onclick="openBulkReleaseModal()">📤 Bulk Update</button>
        <button class="btn btn-outline" onclick="prmExportCSV()">↓ Export CSV</button>
        <button class="btn btn-outline" onclick="printAllPRsReport()">🖨 Print Report</button>
      </div>

      <!-- Filters -->
      <div class="prm-filters">
        <select id="prm-f-rc" onchange="renderPRMonitoring()" style="font-size:12px;padding:7px 10px;border:1px solid var(--border2);border-radius:var(--radius);font-family:var(--font)">
          <option value="">All RCs</option>
        </select>
        <select id="prm-f-qtr" onchange="renderPRMonitoring()" style="font-size:12px;padding:7px 10px;border:1px solid var(--border2);border-radius:var(--radius);font-family:var(--font)">
          <option value="">All Quarters</option>
          <option>1ST Qtr</option><option>2ND Qtr</option><option>3RD Qtr</option><option>4TH Qtr</option>
        </select>
        <select id="prm-f-regstatus" onchange="renderPRMonitoring()" style="font-size:12px;padding:7px 10px;border:1px solid var(--border2);border-radius:var(--radius);font-family:var(--font)">
          <option value="">Registry Status</option>
          ${REG_STATUS_OPTS.map(s=>`<option>${s}</option>`).join('')}
        </select>
        <select id="prm-f-prstatus" onchange="renderPRMonitoring()" style="font-size:12px;padding:7px 10px;border:1px solid var(--border2);border-radius:var(--radius);font-family:var(--font)">
          <option value="">PR Status</option>
          ${PR_STATUS_OPTS.map(s=>`<option>${s}</option>`).join('')}
        </select>
        <select id="prm-f-apstatus" onchange="renderPRMonitoring()" style="font-size:12px;padding:7px 10px;border:1px solid var(--border2);border-radius:var(--radius);font-family:var(--font)">
          <option value="">Approval Status</option>
          ${APPROVAL_STATUS_OPTS.map(s=>`<option>${s}</option>`).join('')}
        </select>
        <select id="prm-f-relstatus" onchange="renderPRMonitoring()" style="font-size:12px;padding:7px 10px;border:1px solid var(--border2);border-radius:var(--radius);font-family:var(--font)">
          <option value="">Release Status</option>
          ${RELEASE_STATUS_OPTS.map(s=>`<option>${s}</option>`).join('')}
        </select>
        <button class="btn btn-outline btn-sm" onclick="prmResetFilters()">↺ Reset</button>
      </div>

      <!-- Bulk bar -->
      <div class="prm-bulk-bar" id="prm-bulk-bar">
        <span id="prm-bulk-count">0 selected</span>
        <button class="btn btn-outline btn-sm" onclick="prmClearSelection()">Clear</button>
        <button class="btn btn-primary btn-sm" onclick="openBulkReleaseModal()">📤 Bulk Update Selected</button>
      </div>

      <!-- Table -->
      <div class="table-card">
        <div class="table-card-header">
          <h3>PR Records</h3>
          <span id="prm-row-count" style="font-size:12px;color:var(--text3)"></span>
        </div>
        <div class="table-scroll">
          <table style="min-width:1100px">
            <thead>
              <tr>
                <th style="width:36px"><input type="checkbox" class="prm-cb" id="prm-select-all" onchange="prmToggleAll(this.checked)"></th>
                <th onclick="prmSortBy('prNum')" style="cursor:pointer;white-space:nowrap">PR No. ↕</th>
                <th onclick="prmSortBy('rcName')" style="cursor:pointer">RC ↕</th>
                <th onclick="prmSortBy('particulars')" style="cursor:pointer">Particulars ↕</th>
                <th onclick="prmSortBy('requisitioner')" style="cursor:pointer">Requisitioner ↕</th>
                <th onclick="prmSortBy('amount')" style="cursor:pointer;text-align:right">Amount ↕</th>
                <th onclick="prmSortBy('registryStatus')" style="cursor:pointer">Registry Status ↕</th>
                <th onclick="prmSortBy('prStatus')" style="cursor:pointer">PR Status ↕</th>
                <th onclick="prmSortBy('approvalStatus')" style="cursor:pointer">Approval Status ↕</th>
                <th onclick="prmSortBy('releaseStatus')" style="cursor:pointer">Release Status ↕</th>
                <th onclick="prmSortBy('releaseDate')" style="cursor:pointer">Date ↕</th>
                <th onclick="prmSortBy('signedBy')" style="cursor:pointer">Sign ↕</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="prm-tbody"></tbody>
          </table>
        </div>
        <div id="prm-pager" class="table-pager"></div>
      </div>
    `;
    content.appendChild(sec);
  }
}

function prmResetFilters() {
  ['prm-search','prm-f-rc','prm-f-qtr','prm-f-regstatus',
   'prm-f-prstatus','prm-f-apstatus','prm-f-relstatus'].forEach(id => {
    const el = _$(id);
    if (el) el.value = '';
  });
  _prPage = 1;
  renderPRMonitoring();
}

// Print full PR report (all earmarks, all PRs)
function printAllPRsReport() {
  const filterFY = _$('fy-select')?.value || '';
  const all = buildAllPRs(filterFY);
  if (!all.length) { toast('No PR records to print', 'error'); return; }

  const prefs  = JSON.parse(localStorage.getItem('budget_registry_prefs') || '{}');
  const agency = prefs.agencyName || 'Republic of the Philippines';
  const region = prefs.region     || '';

  const stBg = s => {
    if (['Approved','Released to: RDO','Released to: BAC','Released to: End-User','Budget Approved','Earmarked'].includes(s)) return '#d1fae5;color:#065f46';
    if (['Not-Approved','Cancelled','Return to End-User','Return to BAC','Not Earmarked'].includes(s)) return '#fee2e2;color:#991b1b';
    if (['Pending','For Signature: RD','Pending Release'].includes(s)) return '#fef3c7;color:#92400e';
    return '#dbeafe;color:#1e40af';
  };
  const pill = s => s ? `<span style="background:${stBg(s)};border-radius:20px;padding:1px 7px;font-size:7pt;font-weight:600;white-space:nowrap">${s}</span>` : '—';

  const rows = all.map(r => `
    <tr style="border-bottom:1px solid #ddd;font-size:7.5pt;vertical-align:middle">
      <td style="padding:5px 7px;border:1px solid #ddd;font-family:Courier,monospace;font-weight:bold;color:#1e3a5f;white-space:nowrap">${r.prNum}</td>
      <td style="padding:5px 7px;border:1px solid #ddd;font-size:7pt">${r.rcName}</td>
      <td style="padding:5px 7px;border:1px solid #ddd;max-width:140px">${r.particulars.substring(0,50)}${r.particulars.length>50?'…':''}</td>
      <td style="padding:5px 7px;border:1px solid #ddd">${r.requisitioner||'—'}</td>
      <td style="padding:5px 7px;border:1px solid #ddd;text-align:right;font-family:Courier,monospace;font-weight:bold">${fmt.cur(r.amount)}</td>
      <td style="padding:5px 7px;border:1px solid #ddd;text-align:center">${pill(r.registryStatus)}</td>
      <td style="padding:5px 7px;border:1px solid #ddd;text-align:center">${pill(r.prStatus)}</td>
      <td style="padding:5px 7px;border:1px solid #ddd;text-align:center">${pill(r.approvalStatus)}</td>
      <td style="padding:5px 7px;border:1px solid #ddd;text-align:center">${pill(r.releaseStatus)}</td>
      <td style="padding:5px 7px;border:1px solid #ddd;font-size:7pt;white-space:nowrap">${r.releaseDate?fmt.date(r.releaseDate):'—'}</td>
      <td style="padding:5px 7px;border:1px solid #ddd;font-size:7pt">${r.signedBy||'—'}</td>
    </tr>`).join('');

  const grandTotal = all.reduce((s, r) => s + r.amount, 0);

  const w = window.open('', '_blank', 'width=1200,height=850');
  w.document.write(`<!DOCTYPE html><html><head><title>PR Release Report</title>
  <style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,sans-serif;font-size:8.5pt;color:#000;padding:8mm 12mm;}
  .hdr{text-align:center;margin-bottom:10px;padding-bottom:8px;border-bottom:3px solid #1e3a5f;}
  .title{background:#1e3a5f;color:white;text-align:center;padding:6px 12px;margin-bottom:8px;}
  @media print{body{padding:0;}@page{margin:8mm 10mm;size:A4 landscape;}}
  </style></head><body>
  <div class="hdr">
    <div style="font-size:7.5pt;text-transform:uppercase;color:#666">Republic of the Philippines</div>
    <div style="font-size:12pt;font-weight:bold;text-transform:uppercase;margin:3px 0">${agency}</div>
    ${region?`<div style="font-size:8.5pt;color:#333">${region}</div>`:''}
  </div>
  <div class="title">
    <h2 style="font-size:10.5pt;text-transform:uppercase;letter-spacing:1px">PR Release Monitoring Report${filterFY?' — FY '+filterFY:''}</h2>
    <p style="font-size:7.5pt;opacity:.85">Printed: ${new Date().toLocaleString('en-PH',{year:'numeric',month:'long',day:'numeric'})}</p>
  </div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
    <thead><tr style="background:#1e3a5f;">
      <th style="padding:6px 7px;text-align:left;color:white;border:1px solid #2d5382;font-size:7pt;white-space:nowrap">PR No.</th>
      <th style="padding:6px 7px;text-align:left;color:white;border:1px solid #2d5382;font-size:7pt">RC</th>
      <th style="padding:6px 7px;text-align:left;color:white;border:1px solid #2d5382;font-size:7pt">Particulars</th>
      <th style="padding:6px 7px;text-align:left;color:white;border:1px solid #2d5382;font-size:7pt;white-space:nowrap">Requisitioner</th>
      <th style="padding:6px 7px;text-align:right;color:white;border:1px solid #2d5382;font-size:7pt;white-space:nowrap">Amount</th>
      <th style="padding:6px 7px;text-align:center;color:white;border:1px solid #2d5382;font-size:7pt;white-space:nowrap">Registry</th>
      <th style="padding:6px 7px;text-align:center;color:white;border:1px solid #2d5382;font-size:7pt;white-space:nowrap">PR Status</th>
      <th style="padding:6px 7px;text-align:center;color:white;border:1px solid #2d5382;font-size:7pt;white-space:nowrap">Approval</th>
      <th style="padding:6px 7px;text-align:center;color:white;border:1px solid #2d5382;font-size:7pt;white-space:nowrap">Release</th>
      <th style="padding:6px 7px;text-align:left;color:white;border:1px solid #2d5382;font-size:7pt;white-space:nowrap">Date</th>
      <th style="padding:6px 7px;text-align:left;color:white;border:1px solid #2d5382;font-size:7pt;white-space:nowrap">Sign</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr style="background:#f0f0f0;font-weight:bold;">
      <td colspan="4" style="padding:6px 7px;border:1px solid #ccc;text-align:right;font-size:8pt">Grand Total:</td>
      <td style="padding:6px 7px;border:1px solid #ccc;text-align:right;font-family:Courier,monospace;font-size:8.5pt">${fmt.cur(grandTotal)}</td>
      <td colspan="6" style="border:1px solid #ccc;"></td>
    </tr></tfoot>
  </table>
  <div style="font-size:7pt;color:#888;text-align:center;margin-top:10px;border-top:1px dashed #ccc;padding-top:5px">
    Budget Registry System v3.0 &nbsp;·&nbsp; ${agency} &nbsp;·&nbsp; Total PRs: ${all.length}
  </div>
  <script>window.onload=()=>window.print();<\/script>
  </body></html>`);
  w.document.close();
}

// Update badge count in sidebar
function updatePRMonitorBadge() {
  const badge = _$('badge-prmonitor');
  if (badge) badge.textContent = buildAllPRs('').length;
}

// ── Wire up on DOMContentLoaded ───────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    injectPRMonitoringModule();
    updatePRMonitorBadge();
  }, 200);
});

// Also update badge whenever data reloads
const _origLoadAll2 = typeof loadAll === 'function' ? loadAll : null;
if (_origLoadAll2 && !window._prMonitorLoadPatched) {
  window._prMonitorLoadPatched = true;
  const __origLoadAll = loadAll;
  window.loadAll = async function() {
    await __origLoadAll();
    updatePRMonitorBadge();
    if (_$('sec-prmonitor')?.classList.contains('active')) {
      renderPRMonitoring();
    }
  };
}
