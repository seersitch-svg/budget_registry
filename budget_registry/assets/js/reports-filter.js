// ============================================================
//  REPORTS — ADVANCED FILTER PANEL  v1.0
//
//  Replaces the basic single-select filters with:
//   • Multi-select chips for every filter category
//   • Full hierarchy coverage (L0–L9)
//   • Active-filter badge count
//   • Collapsible panel with clear-all
//   • Preset save/load updated to handle arrays
//   • Patches rptBuildRCRecords + rptPopulateFilters
// ============================================================

// ── State ─────────────────────────────────────────────────────
const RPT_FILTERS = {
  fc:       new Set(),   // L0  Fund Cluster codes
  fs:       new Set(),   // L1  Financing Source names
  ac:       new Set(),   // L2  Authorization Code codes
  cat:      new Set(),   // L3  Fund Category codes
  proj:     new Set(),   // L4  Project/Program codes
  pcat:     new Set(),   // L5  Project Category codes
  sub:      new Set(),   // L6  PAP/Sub-Category codes
  rc:       new Set(),   // L7  RC ids (strings)
  ec:       new Set(),   // L8  Expense Class nums ("1","2","3")
  qtr:      new Set(),   // Quarter labels
  type:     new Set(),   // Obligation types
};

let _rptPanelOpen = true;

// ── Helpers ───────────────────────────────────────────────────
function _rptActiveCount() {
  return Object.values(RPT_FILTERS).reduce((s, set) => s + set.size, 0);
}

function _rptToggle(key, value) {
  const s = RPT_FILTERS[key];
  if (s.has(value)) s.delete(value); else s.add(value);
  rptFilterRebuildChips(key);
  rptFilterUpdateBadge();
  rptRender();
}

function _rptClearAll() {
  Object.values(RPT_FILTERS).forEach(s => s.clear());
  rptFilterRebuild();
  rptFilterUpdateBadge();
  rptRender();
}

function _rptClearKey(key) {
  RPT_FILTERS[key].clear();
  rptFilterRebuildChips(key);
  rptFilterUpdateBadge();
  rptRender();
}

// ── Inject panel HTML ─────────────────────────────────────────
function rptFilterInject() {
  const sec = document.getElementById('sec-reports');
  if (!sec) return;

  // Remove old report-controls block and replace
  const oldCtrl = sec.querySelector('.report-controls');
  if (!oldCtrl) return;

  const panel = document.createElement('div');
  panel.id = 'rpt-adv-panel';
  panel.style.cssText = `
    background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);
    padding:0;margin-bottom:16px;box-shadow:var(--shadow);overflow:hidden;
  `;

  panel.innerHTML = `
    <!-- Panel header -->
    <div id="rpt-adv-header" style="
      display:flex;align-items:center;gap:10px;padding:12px 16px;
      background:var(--surface);border-bottom:1px solid var(--border);
      cursor:pointer;user-select:none;
    " onclick="rptFilterTogglePanel()">
      <span style="font-size:13px;font-weight:700;color:var(--text)">🔍 Filters &amp; Hierarchy</span>
      <span id="rpt-adv-badge" style="
        display:none;background:var(--blue);color:white;border-radius:20px;
        padding:1px 9px;font-size:11px;font-weight:700;
      ">0</span>
      <div style="flex:1"></div>
      <button onclick="event.stopPropagation();_rptClearAll()" class="btn btn-outline btn-sm"
        style="font-size:11px;padding:4px 10px;">↺ Clear All</button>
      <button class="btn btn-outline btn-sm" style="font-size:11px;padding:4px 10px;"
        onclick="event.stopPropagation();rptSavePreset()">⭐ Save View</button>
      <button class="btn btn-primary btn-sm" style="font-size:11px;padding:4px 10px;"
        onclick="event.stopPropagation();rptExportCSV()">↓ CSV</button>
      <button class="btn btn-success btn-sm" style="font-size:11px;padding:4px 10px;"
        onclick="event.stopPropagation();rptPrint()">🖨 Print</button>
      <span id="rpt-adv-arrow" style="font-size:12px;color:var(--text3);transition:transform .2s">▲</span>
    </div>

    <!-- Hierarchy breadcrumb -->
    <div style="padding:8px 16px;background:var(--blue-light);border-bottom:1px solid var(--blue-mid);
      font-size:11px;color:var(--blue);font-weight:500;line-height:1.6;display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
      <span style="font-weight:700;color:#1e3a5f;margin-right:4px">Filter by hierarchy level:</span>
      ${['Fund Cluster','Financing Source','Authorization Code','Fund Category',
         'Programs/Projects','Project Category','PAP/Sub-Category',
         '🏢 Responsibility Center','Expense Class','Account Code']
        .map((l,i) => `<span>${l}</span>${i<9?'<span style="opacity:.4">›</span>':''}`)
        .join('')}
    </div>

    <!-- Filter body -->
    <div id="rpt-adv-body" style="padding:14px 16px;display:flex;flex-direction:column;gap:10px;">

      <!-- Row 1: L0-L3 (Fund hierarchy) -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;">
        ${_rptFilterGroup('fc',   'L0 · Fund Cluster',       'rpt-chips-fc')}
        ${_rptFilterGroup('fs',   'L1 · Financing Source',    'rpt-chips-fs')}
        ${_rptFilterGroup('ac',   'L2 · Authorization Code',  'rpt-chips-ac')}
        ${_rptFilterGroup('cat',  'L3 · Fund Category',       'rpt-chips-cat')}
      </div>

      <!-- Row 2: L4-L7 (Project + RC) -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;">
        ${_rptFilterGroup('proj', 'L4 · Programs / Projects', 'rpt-chips-proj')}
        ${_rptFilterGroup('pcat', 'L5 · Project Category',    'rpt-chips-pcat')}
        ${_rptFilterGroup('sub',  'L6 · PAP / Sub-Category',  'rpt-chips-sub')}
        ${_rptFilterGroup('rc',   'L7 · Responsibility Center','rpt-chips-rc')}
      </div>

      <!-- Row 3: L8 + Obligation filters -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
        ${_rptFilterGroup('ec',   'L8 · Expense Class',       'rpt-chips-ec')}
        ${_rptFilterGroup('qtr',  'Quarter',                  'rpt-chips-qtr')}
        ${_rptFilterGroup('type', 'Obligation Type',          'rpt-chips-type')}
      </div>

    </div>

    <!-- Presets row -->
    <div style="padding:8px 16px;border-top:1px solid var(--border);background:var(--surface);
      display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <span style="font-size:11px;font-weight:600;color:var(--text2)">Saved Views:</span>
      <div id="rpt-presets-list" style="display:flex;gap:6px;flex-wrap:wrap;">
        <span style="font-size:11px;color:var(--text3)">No saved presets</span>
      </div>
    </div>
  `;

  oldCtrl.replaceWith(panel);

  // Also fix the hidden legacy filter selects so rptRender still works
  _rptEnsureLegacySelects();
}

function _rptFilterGroup(key, label, chipsId) {
  return `
    <div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;
        padding:5px 10px;background:var(--surface);border-bottom:1px solid var(--border);">
        <span style="font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;
          letter-spacing:.05em">${label}</span>
        <button onclick="_rptClearKey('${key}')" style="background:none;border:none;
          cursor:pointer;color:var(--text3);font-size:11px;padding:0;line-height:1"
          title="Clear this filter">✕</button>
      </div>
      <div id="${chipsId}" style="padding:7px 8px;min-height:36px;max-height:120px;
        overflow-y:auto;display:flex;flex-wrap:wrap;gap:4px;">
        <span style="font-size:11px;color:var(--text3);font-style:italic">Loading…</span>
      </div>
    </div>`;
}

// ── Chip renderer per group ───────────────────────────────────
const RPT_CHIP_DEFS = {
  fc:   { containerId: 'rpt-chips-fc',   color: 'var(--blue)',   bg: 'var(--blue-light)',   border: 'var(--blue-mid)'   },
  fs:   { containerId: 'rpt-chips-fs',   color: 'var(--cyan)',   bg: 'var(--cyan-light)',   border: 'var(--cyan-mid)'   },
  ac:   { containerId: 'rpt-chips-ac',   color: '#0369a1',       bg: '#f0f9ff',             border: '#bae6fd'           },
  cat:  { containerId: 'rpt-chips-cat',  color: 'var(--text2)',  bg: 'var(--surface)',      border: 'var(--border2)'    },
  proj: { containerId: 'rpt-chips-proj', color: 'var(--text)',   bg: '#fafafa',             border: 'var(--border2)'    },
  pcat: { containerId: 'rpt-chips-pcat', color: 'var(--text2)',  bg: 'var(--surface)',      border: 'var(--border2)'    },
  sub:  { containerId: 'rpt-chips-sub',  color: 'var(--text2)',  bg: 'var(--surface)',      border: 'var(--border2)'    },
  rc:   { containerId: 'rpt-chips-rc',   color: 'var(--green)',  bg: 'var(--green-light)',  border: 'var(--green-mid)'  },
  ec:   { containerId: 'rpt-chips-ec',   color: 'var(--yellow)', bg: 'var(--yellow-light)', border: 'var(--yellow-mid)' },
  qtr:  { containerId: 'rpt-chips-qtr',  color: 'var(--cyan)',   bg: 'var(--cyan-light)',   border: 'var(--cyan-mid)'   },
  type: { containerId: 'rpt-chips-type', color: 'var(--purple)', bg: 'var(--purple-light)', border: 'var(--purple-mid)' },
};

function _rptChip(key, value, label, active) {
  const d = RPT_CHIP_DEFS[key];
  const baseStyle = `display:inline-flex;align-items:center;gap:4px;padding:3px 9px;
    border-radius:20px;font-size:11px;font-weight:500;cursor:pointer;
    border:1px solid;transition:all .12s;white-space:nowrap;`;
  const activeStyle = `background:${d.color};color:white;border-color:${d.color};`;
  const inactiveStyle = `background:${d.bg};color:${d.color};border-color:${d.border};`;
  const escaped = value.toString().replace(/'/g, "\\'");
  const escapedLabel = label.replace(/"/g, '&quot;');
  return `<span style="${baseStyle}${active ? activeStyle : inactiveStyle}"
    onclick="_rptToggle('${key}','${escaped}')"
    title="${escapedLabel}">
    ${active ? '✓ ' : ''}${label}
  </span>`;
}

// Build options for each filter key from live data
function _rptGetOptions(key) {
  const opts = []; // [{value, label}]
  switch (key) {
    case 'fc':
      [...new Set(DATA.rc.map(r => r.fund_cluster).filter(Boolean))].sort().forEach(fc => {
        opts.push({ value: fc, label: `${fc} – ${FUND_DATA[fc]?.name || fc}` });
      });
      break;
    case 'fs':
      [...new Set(DATA.rc.map(r => r.fund_cluster).filter(Boolean))].forEach(fc => {
        const name = FUND_DATA[fc]?.name;
        if (name && !opts.find(o => o.value === name)) opts.push({ value: name, label: name });
      });
      opts.sort((a, b) => a.label.localeCompare(b.label));
      break;
    case 'ac':
      [...new Set(DATA.rc.map(r => r.auth_code).filter(Boolean))].sort().forEach(ac => {
        const fc = DATA.rc.find(r => r.auth_code === ac)?.fund_cluster;
        const name = fc ? FUND_DATA[fc]?.authCodes?.[ac]?.name || ac : ac;
        opts.push({ value: ac, label: `${ac} – ${name}` });
      });
      break;
    case 'cat':
      [...new Set(DATA.rc.map(r => r.fund_category).filter(Boolean))].sort().forEach(cat => {
        opts.push({ value: cat, label: cat });
      });
      break;
    case 'proj':
      [...new Set(DATA.rc.map(r => r.project_program).filter(Boolean))].sort().forEach(p => {
        opts.push({ value: p, label: `${p} – ${PROJECT_DATA[p]?.name || p}` });
      });
      break;
    case 'pcat':
      [...new Set(DATA.rc.map(r => r.project_category).filter(Boolean))].sort().forEach(pc => {
        opts.push({ value: pc, label: pc });
      });
      break;
    case 'sub':
      [...new Set(DATA.rc.map(r => r.project_sub_category).filter(Boolean))].sort().forEach(s => {
        opts.push({ value: s, label: s });
      });
      break;
    case 'rc':
      DATA.rc.slice().sort((a, b) =>
        (a.responsibility_center||'').localeCompare(b.responsibility_center||'')
      ).forEach(r => {
        opts.push({ value: String(r.id), label: r.responsibility_center });
      });
      break;
    case 'ec':
      [
        { value: '1', label: '1 – Personnel Services' },
        { value: '2', label: '2 – MOOE' },
        { value: '3', label: '3 – Capital Outlay' },
      ].forEach(o => opts.push(o));
      break;
    case 'qtr':
      ['1ST Qtr', '2ND Qtr', '3RD Qtr', '4TH Qtr'].forEach(q => {
        opts.push({ value: q, label: q });
      });
      break;
    case 'type':
      ['Mandatory', 'Claims', 'Creditor'].forEach(t => {
        opts.push({ value: t, label: t });
      });
      break;
  }
  return opts;
}

function rptFilterRebuildChips(key) {
  const d = RPT_CHIP_DEFS[key];
  const el = document.getElementById(d.containerId);
  if (!el) return;
  const opts = _rptGetOptions(key);
  if (!opts.length) {
    el.innerHTML = '<span style="font-size:11px;color:var(--text3);font-style:italic">No data</span>';
    return;
  }
  el.innerHTML = opts.map(o =>
    _rptChip(key, o.value, o.label, RPT_FILTERS[key].has(o.value))
  ).join('');
}

function rptFilterRebuild() {
  Object.keys(RPT_CHIP_DEFS).forEach(k => rptFilterRebuildChips(k));
}

function rptFilterUpdateBadge() {
  const n = _rptActiveCount();
  const badge = document.getElementById('rpt-adv-badge');
  if (!badge) return;
  if (n > 0) {
    badge.style.display = '';
    badge.textContent = n + ' active';
  } else {
    badge.style.display = 'none';
  }
}

function rptFilterTogglePanel() {
  _rptPanelOpen = !_rptPanelOpen;
  const body  = document.getElementById('rpt-adv-body');
  const arrow = document.getElementById('rpt-adv-arrow');
  if (body) body.style.display = _rptPanelOpen ? '' : 'none';
  if (arrow) arrow.style.transform = _rptPanelOpen ? '' : 'rotate(180deg)';
}

// Keep legacy hidden <select> elements so rptRender() / rptExportCSV()
// can still call $('rpt-filter-rc').value — we park them off-screen.
function _rptEnsureLegacySelects() {
  const ids = ['rpt-filter-rc','rpt-filter-fc','rpt-filter-ec',
               'rpt-filter-qtr','rpt-filter-type'];
  ids.forEach(id => {
    if (!document.getElementById(id)) {
      const s = document.createElement('select');
      s.id = id;
      s.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px';
      document.body.appendChild(s);
    }
  });
}

// ── Patch rptBuildRCRecords ───────────────────────────────────
// Override the data-build function to use RPT_FILTERS sets instead of
// single-value selects. Fully backward-compatible: if sets are empty,
// behaves identically to before.
const _origRptBuildRCRecords = typeof rptBuildRCRecords === 'function'
  ? rptBuildRCRecords : null;

function rptBuildRCRecords() {
  // Use multi-select sets; fall back to legacy selects if filter panel not injected yet
  const hasPanel = !!document.getElementById('rpt-adv-panel');

  const mFC   = RPT_FILTERS.fc;
  const mFS   = RPT_FILTERS.fs;
  const mAC2  = RPT_FILTERS.ac;
  const mCat  = RPT_FILTERS.cat;
  const mProj = RPT_FILTERS.proj;
  const mPCat = RPT_FILTERS.pcat;
  const mSub  = RPT_FILTERS.sub;
  const mRC   = RPT_FILTERS.rc;
  const mEC   = RPT_FILTERS.ec;
  const mQtr  = RPT_FILTERS.qtr;
  const mType = RPT_FILTERS.type;

  // Legacy single-select fallback (when panel not yet injected)
  const fEC   = $('rpt-filter-ec')?.value   || '';
  const fQtr  = $('rpt-filter-qtr')?.value  || '';
  const fType = $('rpt-filter-type')?.value || '';

  const records = [];

  DATA.rc.forEach(rc => {
    // ── Hierarchy filters ──────────────────────────────────
    if (mFC.size   && !mFC.has(rc.fund_cluster))        return;
    if (mFS.size   && !mFS.has(FUND_DATA[rc.fund_cluster]?.name)) return;
    if (mAC2.size  && !mAC2.has(rc.auth_code))          return;
    if (mCat.size  && !mCat.has(rc.fund_category))      return;
    if (mProj.size && !mProj.has(rc.project_program))   return;
    if (mPCat.size && !mPCat.has(rc.project_category))  return;
    if (mSub.size  && !mSub.has(rc.project_sub_category)) return;
    if (mRC.size   && !mRC.has(String(rc.id)))           return;

    const allotRow = DATA.allotment.find(a => a.rc_id === rc.id);
    const allotAmt = parseFloat(allotRow?.allotment_received) || 0;

    const acAllotMap = {};
    (allotRow?.account_allocations || []).forEach(a => {
      if (a.code) acAllotMap[a.code] = (acAllotMap[a.code] || 0) + (parseFloat(a.amount) || 0);
    });

    // Obligation filters — multi or single
    const obligs = DATA.obligation.filter(o => {
      if (o.rc_id !== rc.id) return false;
      if (mQtr.size)  { if (!mQtr.has(o.quarter))                              return false; }
      else if (fQtr)  { if (o.quarter !== fQtr)                                return false; }
      if (mType.size) { if (!mType.has(o.obligation_type))                     return false; }
      else if (fType) { if (o.obligation_type !== fType)                       return false; }
      if (mEC.size)   { if (!mEC.has(o.expense_class?.charAt(0)||''))          return false; }
      else if (fEC)   { if ((o.expense_class?.charAt(0)||'') !== fEC)          return false; }
      return true;
    });

    const totOblig = obligs.reduce((s,o) => s+(parseFloat(o.obligation_incurred)||0), 0);
    const totDisb  = obligs.reduce((s,o) => {
      return s + DATA.disbursement
        .filter(d => d.obligation_id === o.id)
        .reduce((ss,d) => ss+(parseFloat(d.total_disbursement)||0), 0);
    }, 0);

    const totEarmark = DATA.earmark
      .filter(e => e.rc_id === rc.id)
      .reduce((s, e) => {
        const fullyObl = e.is_obligated == 1 || e.is_obligated === true;
        if (fullyObl) return s;
        const remaining = e.remaining_amount != null
          ? parseFloat(e.remaining_amount)
          : parseFloat(e.total_amount) || 0;
        return s + remaining;
      }, 0);

    if (!allotAmt && !totOblig &&
        (mQtr.size || mType.size || mEC.size || fQtr || fType || fEC)) return;

    // ── Below this line: identical to original rptBuildRCRecords ──────────
    const EC_LABELS = {
      1: '1 - Personnel Services',
      2: '2 - Maintenance and Other Operating Expenses',
      3: '3 - Capital Outlay',
    };

    function ecNumFromCode(code) {
      if (!code) return null;
      const codeOnly = code.replace(/\s*[–—]\s*.*/u, '').trim();
      const parts = codeOnly.split('-');
      if (parts.length >= 2) {
        const prefix = parts[0] + '-' + parts[1];
        if (prefix === '5-01') return 1;
        if (prefix === '5-02') return 2;
        if (prefix === '5-06') return 3;
      }
      return [1,2,3].find(n => (ACCOUNT_CODES[n]||[]).some(c => c === code || c.startsWith(codeOnly))) || null;
    }
    function ecNumFromClass(cls) {
      if (!cls) return null;
      const c = parseInt(cls.charAt(0));
      return [1,2,3].includes(c) ? c : null;
    }

    const rcECNums = new Set(
      (rc.expense_classes || []).map(ecNumFromClass).filter(Boolean)
    );

    // Filter EC groups if multi-select active
    const activeECNums = mEC.size
      ? new Set([...mEC].map(n => parseInt(n)))
      : null; // null = no filter

    const codeToEC = {};
    (rc.account_codes || []).forEach(code => {
      const n = ecNumFromCode(code);
      if (n) codeToEC[code] = n;
    });

    const ecMapByNum = new Map();

    function ecEnsure(ecNum, acKey, allot) {
      // Respect EC filter
      if (activeECNums && ecNum !== 'unknown' && !activeECNums.has(ecNum)) return;
      if (!ecMapByNum.has(ecNum)) ecMapByNum.set(ecNum, new Map());
      const acGroup = ecMapByNum.get(ecNum);
      if (!acGroup.has(acKey)) {
        acGroup.set(acKey, { ob: 0, disb: 0, allot: allot || 0, earn: 0 });
      } else if (allot > 0 && acGroup.get(acKey).allot === 0) {
        acGroup.get(acKey).allot = allot;
      }
    }

    rcECNums.forEach(n => {
      if (activeECNums && !activeECNums.has(n)) return;
      if (!ecMapByNum.has(n)) ecMapByNum.set(n, new Map());
    });

    (rc.account_codes || []).forEach(code => {
      const n = codeToEC[code] || ecNumFromCode(code);
      if (!n) { ecEnsure(rcECNums.size > 0 ? [...rcECNums][0] : 0, code, acAllotMap[code] || 0); return; }
      ecEnsure(n, code, acAllotMap[code] || 0);
    });

    (allotRow?.account_allocations || []).forEach(a => {
      if (!a.code) return;
      const n = ecNumFromCode(a.code);
      if (n) ecEnsure(n, a.code, parseFloat(a.amount) || 0);
    });

    obligs.forEach(o => {
      const disbTotal = DATA.disbursement
        .filter(d => d.obligation_id === o.id)
        .reduce((ss,d) => ss+(parseFloat(d.total_disbursement)||0), 0);

      if (o.obligation_type === 'Creditor') {
        let entries = [];
        try { const raw = o.selected_entries || '[]'; entries = Array.isArray(raw) ? raw : JSON.parse(raw); } catch(e) {}
        if (entries.length > 0) {
          const lotsSeen = new Map();
          entries.forEach(en => {
            const lotKey = en.lotIdx ?? 0;
            const acKey  = en.accountCode || en.account_code || '(No Account Code)';
            const ecN = ecNumFromClass(en.expenseClass) || ecNumFromCode(acKey)
                     || ecNumFromClass(o.expense_class) || (rcECNums.size === 1 ? [...rcECNums][0] : 'unknown');
            if (!lotsSeen.has(lotKey)) lotsSeen.set(lotKey, { acKey, ecN, obAmt: 0 });
            if (en.obligationIncurred != null && lotsSeen.get(lotKey).obAmt === 0)
              lotsSeen.get(lotKey).obAmt = parseFloat(en.obligationIncurred) || 0;
          });
          const lotsArr = [...lotsSeen.values()];
          const totalRecorded = lotsArr.reduce((s,l)=>s+l.obAmt, 0);
          const fallbackAmt = totalRecorded > 0 ? 0 : parseFloat(o.obligation_incurred) / Math.max(lotsArr.length, 1);
          lotsArr.forEach(lot => {
            const obAmt = lot.obAmt || fallbackAmt;
            ecEnsure(lot.ecN, lot.acKey, acAllotMap[lot.acKey] || 0);
            const entry = ecMapByNum.get(lot.ecN)?.get(lot.acKey);
            if (entry) entry.ob += obAmt;
          });
          if (lotsArr.length > 0) {
            const fl = lotsArr[0];
            ecEnsure(fl.ecN, fl.acKey, acAllotMap[fl.acKey] || 0);
            const entry = ecMapByNum.get(fl.ecN)?.get(fl.acKey);
            if (entry) entry.disb += disbTotal;
          }
          return;
        }
      }

      const acKey = o.account_code || '(No Account Code)';
      let n = ecNumFromClass(o.expense_class) || ecNumFromCode(acKey);
      if (!n && rcECNums.size === 1) n = [...rcECNums][0];
      if (!n) n = 'unknown';
      ecEnsure(n, acKey, acAllotMap[acKey] || 0);
      const entry = ecMapByNum.get(n)?.get(acKey);
      if (entry) { entry.ob += parseFloat(o.obligation_incurred) || 0; entry.disb += disbTotal; }
    });

    // Step 4b: earmark remaining distribution
    DATA.earmark.filter(e => e.rc_id === rc.id).forEach(em => {
      const fullyObl = em.is_obligated == 1 || em.is_obligated === true;
      if (fullyObl) return;
      const lots = em.lots || [];
      if (lots.length === 0) {
        const remaining = parseFloat(em.remaining_amount != null ? em.remaining_amount : em.total_amount) || 0;
        if (remaining <= 0) return;
        const fallbackEC = rcECNums.size > 0 ? [...rcECNums][0] : 'unknown';
        const fallbackAC = rc.account_codes?.[0] || '(No Account Code)';
        ecEnsure(fallbackEC, fallbackAC, acAllotMap[fallbackAC] || 0);
        const entry = ecMapByNum.get(fallbackEC)?.get(fallbackAC);
        if (entry) entry.earn += remaining;
        return;
      }
      lots.forEach(lot => {
        if (lot.is_obligated === true || lot.is_obligated == 1) return;
        (lot.items || []).forEach(item => {
          const itemAmt = parseFloat(item.amount || item.totalCost || 0);
          if (itemAmt <= 0) return;
          const acKey = item.accountCode || item.account_code || '(No Account Code)';
          const ecN = ecNumFromClass(item.expenseClass || '') || ecNumFromCode(acKey)
                   || (rcECNums.size === 1 ? [...rcECNums][0] : 'unknown');
          ecEnsure(ecN, acKey, acAllotMap[acKey] || 0);
          const entry = ecMapByNum.get(ecN)?.get(acKey);
          if (entry) entry.earn += itemAmt;
        });
      });
    });

    const ecMap = new Map();
    [1, 2, 3, 'unknown'].forEach(n => {
      if (!ecMapByNum.has(n)) return;
      const acGroup = ecMapByNum.get(n);
      for (const [k, v] of acGroup) {
        if (k === '(No Account Code)' && v.ob === 0 && v.disb === 0 && v.allot === 0 && v.earn === 0)
          acGroup.delete(k);
      }
      if (acGroup.size === 0) return;
      const label = EC_LABELS[n] || 'Other Expenses';
      ecMap.set(label, acGroup);
    });

    const fcCode   = rc.fund_cluster         || '';
    const fcName   = FUND_DATA[fcCode]?.name || '';
    const acCode   = rc.auth_code            || '';
    const acName   = FUND_DATA[fcCode]?.authCodes?.[acCode]?.name || '';
    const catCode  = rc.fund_category        || '';
    const catName  = FUND_DATA[fcCode]?.authCodes?.[acCode]?.cats?.[catCode] || catCode;
    const projCode = rc.project_program      || '';
    const projName = PROJECT_DATA[projCode]?.name || projCode;
    const pCatCode = rc.project_category     || '';
    const pCatName = PROJECT_DATA[projCode]?.cats?.[pCatCode]?.name || pCatCode;
    const subCode  = rc.project_sub_category || '';
    const subName  = PROJECT_DATA[projCode]?.cats?.[pCatCode]?.subs?.[subCode] || subCode;

    records.push({
      fcCode, fcName, acCode, acName, catCode, catName,
      projCode, projName, pCatCode, pCatName, subCode, subName,
      rcId:    rc.id,
      rcName:  rc.responsibility_center,
      allot:   allotAmt,
      oblig:   totOblig,
      disb:    totDisb,
      earmark: totEarmark,
      ecMap,
    });
  });

  return records;
}

// ── Patch rptPopulateFilters ──────────────────────────────────
const _origRptPopulateFilters = typeof rptPopulateFilters === 'function'
  ? rptPopulateFilters : () => {};

function rptPopulateFilters() {
  _origRptPopulateFilters();   // keep old behavior (fills hidden selects, presets)
  rptFilterRebuild();          // rebuild multi-select chips
  rptFilterUpdateBadge();
}

// ── Patch rptSavePreset to save Sets as arrays ────────────────
function rptSavePreset() {
  const name = prompt('Name this saved view:');
  if (!name) return;
  const filters = {};
  Object.entries(RPT_FILTERS).forEach(([k, s]) => { filters[k] = [...s]; });
  _rptPresets.push({ name, filters });
  localStorage.setItem('rpt_presets', JSON.stringify(_rptPresets));
  rptRenderPresets();
  toast('View saved: ' + name);
}

function rptLoadPreset(idx) {
  const p = _rptPresets[idx];
  if (!p) return;
  // Support both old string format and new array format
  Object.entries(RPT_FILTERS).forEach(([k, s]) => {
    s.clear();
    const saved = p.filters[k];
    if (Array.isArray(saved)) saved.forEach(v => s.add(v));
    else if (saved) s.add(saved);
  });
  rptFilterRebuild();
  rptFilterUpdateBadge();
  rptRender();
}

function rptResetFilters() {
  _rptClearAll();
}

// ── Wire up on reports tab activation ─────────────────────────
(function patchNavForReports() {
  function _tryPatch() {
    if (typeof nav !== 'function') { setTimeout(_tryPatch, 100); return; }
    if (window._navReportsFilterPatched) return;
    window._navReportsFilterPatched = true;
    const _orig = nav;
    window.nav = function(key) {
      _orig(key);
      if (key === 'reports') {
        setTimeout(() => {
          if (!document.getElementById('rpt-adv-panel')) {
            rptFilterInject();
          }
          rptFilterRebuild();
          rptFilterUpdateBadge();
        }, 60);
      }
    };
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _tryPatch);
  } else {
    _tryPatch();
  }
})();

// Also inject immediately if reports section is already active
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (document.getElementById('sec-reports')?.classList.contains('active')) {
      if (!document.getElementById('rpt-adv-panel')) rptFilterInject();
      rptFilterRebuild();
      rptFilterUpdateBadge();
    }
  }, 500);
});
