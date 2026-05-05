// ════════════════════════════════════════════════════════════
//  BUDGET EXECUTION REPORT  v3.0
//  Matches the reference screenshot layout exactly.
//
//  8 Columns:
//   C1  CODES  (hierarchy + account codes)
//   C2  Allotment Received per RC
//   C3  Current Year Obligations
//   C4  Current Year Disbursement
//   C5  Unpaid Obligations          = C3 − C4
//   C6  Unobligated Balance per RC  = C2 − C3
//   C7  Earmarked
//   C8  Remaining Balance           = C6 − C7
//
//  Hierarchy rows (L0–L6): show ALL 8 columns aggregated.
//  L7  Responsibility Center:       show ALL 8 columns.
//  L8  Expense Class:               ALL 8 columns (allot=sum of AC allotments, earn=dash).
//  L9  Account Code:                C2(allotted),C3,C4,C5,C6,C8 per-code amounts.
// ════════════════════════════════════════════════════════════

// ── Saved view presets ────────────────────────────────────────
let _rptPresets = [];
try { _rptPresets = JSON.parse(localStorage.getItem('rpt_presets') || '[]'); } catch(e) {}

function rptSavePreset() {
  const name = prompt('Name this saved view:');
  if (!name) return;
  const filters = {
    rc:   $('rpt-filter-rc')?.value   || '',
    fc:   $('rpt-filter-fc')?.value   || '',
    ec:   $('rpt-filter-ec')?.value   || '',
    qtr:  $('rpt-filter-qtr')?.value  || '',
    type: $('rpt-filter-type')?.value || '',
  };
  _rptPresets.push({name, filters});
  localStorage.setItem('rpt_presets', JSON.stringify(_rptPresets));
  rptRenderPresets();
  toast('View saved: ' + name);
}

function rptLoadPreset(idx) {
  const p = _rptPresets[idx];
  if (!p) return;
  const map = {rc:'rpt-filter-rc', fc:'rpt-filter-fc', ec:'rpt-filter-ec',
               qtr:'rpt-filter-qtr', type:'rpt-filter-type'};
  Object.entries(p.filters).forEach(([k,v]) => {
    const el = $(map[k]); if (el) el.value = v;
  });
  rptRender();
}

function rptDeletePreset(idx) {
  _rptPresets.splice(idx, 1);
  localStorage.setItem('rpt_presets', JSON.stringify(_rptPresets));
  rptRenderPresets();
}

function rptRenderPresets() {
  const el = $('rpt-presets-list');
  if (!el) return;
  if (!_rptPresets.length) {
    el.innerHTML = '<span style="font-size:11px;color:var(--text3)">No saved presets</span>';
    return;
  }
  el.innerHTML = _rptPresets.map((p,i) =>
    `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--blue-light);
      border:1px solid var(--blue-mid);border-radius:20px;padding:2px 10px;font-size:11px;
      color:var(--blue);cursor:pointer;" onclick="rptLoadPreset(${i})">
      ⭐ ${p.name}
      <button onclick="event.stopPropagation();rptDeletePreset(${i})"
        style="background:none;border:none;cursor:pointer;color:var(--blue);font-size:11px;
        padding:0 0 0 4px;line-height:1">✕</button>
    </span>`
  ).join('');
}

// ── Filter dropdowns ─────────────────────────────────────────
function rptPopulateFilters() {
  const rcSel = $('rpt-filter-rc');
  if (rcSel) {
    const cv = rcSel.value;
    rcSel.innerHTML = '<option value="">All RCs</option>';
    DATA.rc.forEach(r =>
      rcSel.innerHTML += `<option value="${r.id}">${r.responsibility_center}</option>`
    );
    rcSel.value = cv;
  }
  const fcSel = $('rpt-filter-fc');
  if (fcSel) {
    const cv = fcSel.value;
    fcSel.innerHTML = '<option value="">All Clusters</option>';
    [...new Set(DATA.rc.map(r => r.fund_cluster).filter(Boolean))].forEach(fc => {
      fcSel.innerHTML += `<option value="${fc}">${fc} – ${FUND_DATA[fc]?.name||fc}</option>`;
    });
    fcSel.value = cv;
  }
  rptRenderPresets();
}

function rptResetFilters() {
  ['rpt-filter-rc','rpt-filter-fc','rpt-filter-ec','rpt-filter-qtr','rpt-filter-type']
    .forEach(id => { const el=$(id); if(el) el.value=''; });
  rptRender();
}

// ── Currency helpers ──────────────────────────────────────────
const _c  = v => fmt.cur(v);
const _dc = v => v === 0
  ? '<span style="color:var(--text3);font-family:var(--mono)">-</span>'
  : fmt.cur(v);
const _neg = v => v < 0 ? ' rpt-neg' : '';
const _wrap = v => v < 0
  ? `<span class="rpt-neg">(${fmt.cur(Math.abs(v))})</span>`
  : _dc(v);

// ── Build per-RC data records ────────────────────────────────
function rptBuildRCRecords() {
  const fRC   = $('rpt-filter-rc')?.value   || '';
  const fFC   = $('rpt-filter-fc')?.value   || '';
  const fEC   = $('rpt-filter-ec')?.value   || '';
  const fQtr  = $('rpt-filter-qtr')?.value  || '';
  const fType = $('rpt-filter-type')?.value || '';

  const records = [];

  DATA.rc.forEach(rc => {
    if (fRC && rc.id != fRC)             return;
    if (fFC && rc.fund_cluster !== fFC)  return;

    const allotRow = DATA.allotment.find(a => a.rc_id === rc.id);
    const allotAmt = parseFloat(allotRow?.allotment_received) || 0;

    // Per-account-code allotment lookup
    const acAllotMap = {};
    (allotRow?.account_allocations || []).forEach(a => {
      if (a.code) acAllotMap[a.code] = (acAllotMap[a.code] || 0) + (parseFloat(a.amount) || 0);
    });

    // Filtered obligations
    const obligs = DATA.obligation.filter(o => {
      if (o.rc_id !== rc.id)                                   return false;
      if (fQtr  && o.quarter !== fQtr)                         return false;
      if (fType && o.obligation_type !== fType)                return false;
      if (fEC   && (o.expense_class?.charAt(0)||'') !== fEC)   return false;
      return true;
    });

    const totOblig = obligs.reduce((s,o) => s+(parseFloat(o.obligation_incurred)||0), 0);
    const totDisb  = obligs.reduce((s,o) => {
      return s + DATA.disbursement
        .filter(d => d.obligation_id === o.id)
        .reduce((ss,d) => ss+(parseFloat(d.total_disbursement)||0), 0);
    }, 0);

    // C7 Earmarked = only the UNOBLIGATED remaining portion of each earmark.
    // When a Creditor obligation is created, that amount moves to C3 (Obligations),
    // so it must NOT also appear in C7. We use remaining_amount for partial earmarks
    // and 0 for fully obligated ones.
    const totEarmark = DATA.earmark
      .filter(e => e.rc_id === rc.id)
      .reduce((s, e) => {
        const fullyObl = e.is_obligated == 1 || e.is_obligated === true;
        if (fullyObl) return s; // fully obligated → 0 in earmark column
        const remaining = e.remaining_amount != null
          ? parseFloat(e.remaining_amount)
          : parseFloat(e.total_amount) || 0;
        return s + remaining;
      }, 0);

    // Skip if nothing to show under active filters
    if (!allotAmt && !totOblig && (fQtr || fType || fEC)) return;

    // ── EC label constants (match exactly what rc.expense_classes stores) ──
    const EC_LABELS = {
      1: '1 - Personnel Services',
      2: '2 - Maintenance and Other Operating Expenses',
      3: '3 - Capital Outlay',
    };

    // Derive EC number (1/2/3) from an account code string
    // Strips em-dash/en-dash suffixes (e.g. "5-02-01-018 – Traveling Expenses")
    // then checks the numeric prefix, then falls back to ACCOUNT_CODES bucket scan.
    function ecNumFromCode(code) {
      if (!code) return null;
      // Strip everything after the first dash-description separator (– or —)
      // and after any trailing spaces, so we get just the code part e.g. "5-02-01-018"
      const codeOnly = code.replace(/\s*[–—]\s*.*/u, '').trim();
      // Split on hyphen and take first two segments → "5-01", "5-02", "5-06"
      const parts = codeOnly.split('-');
      if (parts.length >= 2) {
        const prefix = parts[0] + '-' + parts[1]; // e.g. "5-01"
        if (prefix === '5-01') return 1;
        if (prefix === '5-02') return 2;
        if (prefix === '5-06') return 3;
      }
      // Fallback: scan ACCOUNT_CODES buckets (match on stored full string)
      return [1,2,3].find(n => (ACCOUNT_CODES[n]||[]).some(c => c === code || c.startsWith(codeOnly))) || null;
    }

    // Derive EC number from the stored expense_class string (e.g. "1 - Personnel Services")
    function ecNumFromClass(cls) {
      if (!cls) return null;
      const c = parseInt(cls.charAt(0));
      return [1,2,3].includes(c) ? c : null;
    }

    // Which ECs does this RC have registered? (from rc.expense_classes)
    const rcECNums = new Set(
      (rc.expense_classes || []).map(ecNumFromClass).filter(Boolean)
    );

    // Build per-code EC assignment: first from the RC's registered codes
    // stored in rc.account_codes (flat array, all ECs mixed together)
    // We match each code to EC by prefix, then by ACCOUNT_CODES bucket.
    const codeToEC = {}; // code string → EC num (1/2/3)
    (rc.account_codes || []).forEach(code => {
      const n = ecNumFromCode(code);
      if (n) codeToEC[code] = n;
    });

    // ── Build Expense Class → Account Code map ───────────────
    // EC num → Map(acCode → {ob, disb, allot, earn})
    // We use EC num as the map key internally, render as EC_LABELS[n].
    const ecMapByNum = new Map(); // Map<ecNum, Map<code, {ob,disb,allot,earn}>>

    // Helper: ensure a slot exists
    function ecEnsure(ecNum, acKey, allot) {
      if (!ecMapByNum.has(ecNum)) ecMapByNum.set(ecNum, new Map());
      const acGroup = ecMapByNum.get(ecNum);
      if (!acGroup.has(acKey)) {
        acGroup.set(acKey, { ob: 0, disb: 0, allot: allot || 0, earn: 0 });
      } else if (allot > 0 && acGroup.get(acKey).allot === 0) {
        acGroup.get(acKey).allot = allot;
      }
    }

    // Step 1 — Seed EC groups that are registered on this RC
    // (even if no codes or obligations, the EC header will show)
    rcECNums.forEach(n => {
      if (!ecMapByNum.has(n)) ecMapByNum.set(n, new Map());
    });

    // Step 2 — Seed ALL account codes from rc.account_codes
    (rc.account_codes || []).forEach(code => {
      const n = codeToEC[code] || ecNumFromCode(code);
      if (!n) {
        // Can't determine EC — put under first registered EC or create unknown
        const fallbackN = rcECNums.size > 0 ? [...rcECNums][0] : 0;
        ecEnsure(fallbackN || 'unknown', code, acAllotMap[code] || 0);
        return;
      }
      ecEnsure(n, code, acAllotMap[code] || 0);
    });

    // Step 3 — Add codes from allotment account_allocations
    (allotRow?.account_allocations || []).forEach(a => {
      if (!a.code) return;
      const n = ecNumFromCode(a.code) || ecNumFromClass(
        (rc.expense_classes||[]).find(e => ecNumFromClass(e) === ecNumFromCode(a.code))
      );
      if (n) ecEnsure(n, a.code, parseFloat(a.amount) || 0);
    });

    // Step 4 — Add obligations: accumulate ob/disb into the right EC+code slot
    obligs.forEach(o => {
      const disbTotal = DATA.disbursement
        .filter(d => d.obligation_id === o.id)
        .reduce((ss,d) => ss+(parseFloat(d.total_disbursement)||0), 0);

      // For Creditor obligations, the account code lives in selected_entries JSON
      // (the obligation's own account_code field is an aggregate/summary — may be wrong).
      // ALWAYS parse per-lot entries for Creditor type so each lot maps to its own
      // account code and expense class correctly.
      if (o.obligation_type === 'Creditor') {
        let entries = [];
        try {
          const raw = o.selected_entries || '[]';
          entries = Array.isArray(raw) ? raw : JSON.parse(raw);
        } catch(e) {}

        if (entries.length > 0) {
          // Group entries by lotIdx so each lot's obligationIncurred is counted once
          const lotsSeen = new Map(); // lotIdx → {acKey, ecN, obAmt}
          entries.forEach(en => {
            const lotKey = en.lotIdx ?? 0;
            const acKey  = en.accountCode || en.account_code || '(No Account Code)';
            // Priority: expenseClass stored on entry → derive from accountCode prefix → RC single EC → unknown
            // ecNumFromClass handles both "1 - Personnel Services" and "2 - MOOE" / "2 - Maintenance..."
            const ecN = ecNumFromClass(en.expenseClass)
                     || ecNumFromCode(acKey)
                     || ecNumFromClass(o.expense_class)
                     || (rcECNums.size === 1 ? [...rcECNums][0] : 'unknown');

            if (!lotsSeen.has(lotKey)) {
              lotsSeen.set(lotKey, { acKey, ecN, obAmt: 0 });
            }
            // obligationIncurred is stored on the first entry of each lot
            if (en.obligationIncurred != null && lotsSeen.get(lotKey).obAmt === 0) {
              lotsSeen.get(lotKey).obAmt = parseFloat(en.obligationIncurred) || 0;
            }
          });

          // If no per-lot obligationIncurred was found, fall back to total / lotCount
          const lotsArr = [...lotsSeen.values()];
          const totalRecorded = lotsArr.reduce((s,l)=>s+l.obAmt, 0);
          const fallbackAmt = totalRecorded > 0
            ? 0  // all good
            : parseFloat(o.obligation_incurred) / Math.max(lotsArr.length, 1);

          lotsArr.forEach(lot => {
            const obAmt = lot.obAmt || fallbackAmt;
            ecEnsure(lot.ecN, lot.acKey, acAllotMap[lot.acKey] || 0);
            const entry = ecMapByNum.get(lot.ecN).get(lot.acKey);
            entry.ob += obAmt;
          });

          // Attribute disbursements proportionally to the first (or only) lot
          if (lotsArr.length > 0) {
            const firstLot = lotsArr[0];
            ecEnsure(firstLot.ecN, firstLot.acKey, acAllotMap[firstLot.acKey] || 0);
            ecMapByNum.get(firstLot.ecN).get(firstLot.acKey).disb += disbTotal;
          }
          return; // skip the generic path below
        }
      }

      // Generic path: use obligation's own account_code / expense_class
      const acKey = o.account_code || '(No Account Code)';
      let n = ecNumFromClass(o.expense_class) || ecNumFromCode(acKey);
      if (!n && rcECNums.size === 1) n = [...rcECNums][0];
      if (!n) n = 'unknown';
      ecEnsure(n, acKey, acAllotMap[acKey] || 0);
      const entry = ecMapByNum.get(n).get(acKey);
      entry.ob   += parseFloat(o.obligation_incurred) || 0;
      entry.disb += disbTotal;
    });

    // Step 4b — Distribute earmark remaining amounts per account code and EC
    // Each unobligated (or partially obligated) earmark's lots carry account codes
    // and expense classes. We attribute the *remaining* (unobligated) lot amount to
    // the correct EC+AC bucket so C7 and C8 show correctly at every level.
    DATA.earmark
      .filter(e => e.rc_id === rc.id)
      .forEach(em => {
        const fullyObl = em.is_obligated == 1 || em.is_obligated === true;
        if (fullyObl) return; // fully obligated → no earmark amount left to show

        const lots = em.lots || [];

        if (lots.length === 0) {
          // No lot structure — attribute entire remaining amount to the RC's
          // first registered EC and first account code (best-effort fallback)
          const remaining = parseFloat(
            em.remaining_amount != null ? em.remaining_amount : em.total_amount
          ) || 0;
          if (remaining <= 0) return;
          const fallbackEC = rcECNums.size > 0 ? [...rcECNums][0] : 'unknown';
          const fallbackAC = rc.account_codes?.[0] || '(No Account Code)';
          ecEnsure(fallbackEC, fallbackAC, acAllotMap[fallbackAC] || 0);
          ecMapByNum.get(fallbackEC).get(fallbackAC).earn += remaining;
          return;
        }

        lots.forEach(lot => {
          // Skip lots that are already obligated — their amount is in C3
          if (lot.is_obligated === true || lot.is_obligated == 1) return;

          const items = lot.items || [];
          items.forEach(item => {
            const itemAmt = parseFloat(item.amount || item.totalCost || 0);
            if (itemAmt <= 0) return;

            // Resolve account code and expense class from the item
            const acKey = item.accountCode || item.account_code || '(No Account Code)';
            const ecFromClass = ecNumFromClass(item.expenseClass || '');
            const ecFromCode  = ecNumFromCode(acKey);
            let ecN = ecFromClass || ecFromCode;
            if (!ecN && rcECNums.size === 1) ecN = [...rcECNums][0];
            if (!ecN) ecN = 'unknown';

            ecEnsure(ecN, acKey, acAllotMap[acKey] || 0);
            ecMapByNum.get(ecN).get(acKey).earn += itemAmt;
          });
        });
      });

    // Step 5 — Convert to the ecMap format used by render (string label keys)
    // Sort EC groups: 1 → 2 → 3 → unknown last
    const ecMap = new Map();
    [1, 2, 3, 'unknown'].forEach(n => {
      if (!ecMapByNum.has(n)) return;
      const acGroup = ecMapByNum.get(n);
      // Filter out placeholder '(No Account Code)' entries with zero amounts
      for (const [k, v] of acGroup) {
        if (k === '(No Account Code)' && v.ob === 0 && v.disb === 0 && v.allot === 0 && v.earn === 0) {
          acGroup.delete(k);
        }
      }
      if (acGroup.size === 0) return; // skip empty EC groups
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

// ── Aggregation ───────────────────────────────────────────────
function _agg(recs) {
  const allot  = recs.reduce((s,r) => s+r.allot,   0);
  const oblig  = recs.reduce((s,r) => s+r.oblig,   0);
  const disb   = recs.reduce((s,r) => s+r.disb,    0);
  const earn   = recs.reduce((s,r) => s+r.earmark, 0);
  const unpaid = oblig - disb;
  const unob   = allot - oblig;
  const bal    = unob - earn;
  return { allot, oblig, disb, earn, unpaid, unob, bal };
}

// ── Group helper ──────────────────────────────────────────────
function _grp(recs, fn) {
  const m = new Map();
  recs.forEach(r => {
    const {k, lbl} = fn(r);
    if (!m.has(k)) m.set(k, {k, lbl, records:[]});
    m.get(k).records.push(r);
  });
  return [...m.values()].sort((a,b) => (a.k||'').localeCompare(b.k||''));
}

// ── Row builders ─────────────────────────────────────────────

// Standard 8-col row (hierarchy levels L0-L7)
function _rowFull(cls, indent, label, s, labelBold=false) {
  const lbl = labelBold ? `<strong>${label}</strong>` : label;
  return `<tr class="${cls}">
    <td style="padding-left:${indent}px">${lbl}</td>
    <td class="rpt-num">${_wrap(s.allot)}</td>
    <td class="rpt-num">${_dc(s.oblig)}</td>
    <td class="rpt-num">${_dc(s.disb)}</td>
    <td class="rpt-num${_neg(s.unpaid)}">${_wrap(s.unpaid)}</td>
    <td class="rpt-num${_neg(s.unob)}">${_wrap(s.unob)}</td>
    <td class="rpt-num">${_dc(s.earn)}</td>
    <td class="rpt-num${_neg(s.bal)}">${_wrap(s.bal)}</td>
  </tr>`;
}

// Expense Class row (L8): shows allotment total for this EC in C2, ob/disb/unpaid/unob/earn/bal
function _rowEC(label, ecAllot, ecOb, ecDisb, ecEarn) {
  const unpaid = ecOb - ecDisb;
  const unob   = ecAllot - ecOb;
  const bal    = unob - ecEarn;
  return `<tr class="rpt-row-l8">
    <td style="padding-left:118px"><em>${label}</em></td>
    <td class="rpt-num">${ecAllot > 0 ? _c(ecAllot) : '<span style="color:var(--text3)">-</span>'}</td>
    <td class="rpt-num">${_dc(ecOb)}</td>
    <td class="rpt-num">${_dc(ecDisb)}</td>
    <td class="rpt-num${_neg(unpaid)}">${_wrap(unpaid)}</td>
    <td class="rpt-num${_neg(unob)}">${ecAllot > 0 ? _wrap(unob) : '<span style="color:var(--text3)">-</span>'}</td>
    <td class="rpt-num">${ecEarn > 0 ? _c(ecEarn) : '<span style="color:var(--text3)">-</span>'}</td>
    <td class="rpt-num${_neg(bal)}">${ecAllot > 0 || ecEarn > 0 ? _wrap(bal) : '<span style="color:var(--text3)">-</span>'}</td>
  </tr>`;
}

// Account Code row (L9): allot per-code, ob, disb, unpaid, unob per-code, earn, bal per-code
function _rowAC(label, acAllot, acOb, acDisb, acEarn) {
  const unpaid = acOb - acDisb;
  const unob   = acAllot - acOb;
  const bal    = unob - acEarn;
  return `<tr class="rpt-row-l9">
    <td style="padding-left:136px;font-family:var(--mono);font-size:11px">${label}</td>
    <td class="rpt-num" style="font-size:11px">${acAllot > 0 ? _c(acAllot) : '<span style="color:var(--text3)">-</span>'}</td>
    <td class="rpt-num" style="font-size:11px">${_dc(acOb)}</td>
    <td class="rpt-num" style="font-size:11px">${_dc(acDisb)}</td>
    <td class="rpt-num${_neg(unpaid)}" style="font-size:11px">${_wrap(unpaid)}</td>
    <td class="rpt-num${_neg(unob)}" style="font-size:11px">${acAllot > 0 ? _wrap(unob) : '<span style="color:var(--text3)">-</span>'}</td>
    <td class="rpt-num" style="font-size:11px">${acEarn > 0 ? _c(acEarn) : '<span style="color:var(--text3)">-</span>'}</td>
    <td class="rpt-num${_neg(bal)}" style="font-size:11px">${acAllot > 0 || acEarn > 0 ? _wrap(bal) : '<span style="color:var(--text3)">-</span>'}</td>
  </tr>`;
}

// Subtotal row
function _rowSub(label, s) {
  return `<tr class="rpt-row-sub">
    <td>${label}</td>
    <td class="rpt-num">${_c(s.allot)}</td>
    <td class="rpt-num">${_c(s.oblig)}</td>
    <td class="rpt-num">${_c(s.disb)}</td>
    <td class="rpt-num${_neg(s.unpaid)}">${_wrap(s.unpaid)}</td>
    <td class="rpt-num${_neg(s.unob)}">${_wrap(s.unob)}</td>
    <td class="rpt-num">${_c(s.earn)}</td>
    <td class="rpt-num${_neg(s.bal)}">${_wrap(s.bal)}</td>
  </tr>`;
}

// Spacer row between fund clusters
const _spacer = () =>
  `<tr class="rpt-spacer"><td colspan="8" style="height:10px;background:var(--bg)"></td></tr>`;

// Spacer row between different Responsibility Centers
const _rcSpacer = () =>
  `<tr class="rpt-spacer"><td colspan="8" style="height:8px;background:#f8fafc;border-top:2px dashed #e2e8f0;"></td></tr>`;

// Spacer row between Expense Class groups within an RC
const _ecSpacer = () =>
  `<tr class="rpt-spacer"><td colspan="8" style="height:5px;background:#f8fafc;"></td></tr>`;

// ── Grand Total row ───────────────────────────────────────────
function _rowGrand(s) {
  return `<tr class="rpt-row-grand">
    <td><strong>Grand total</strong></td>
    <td class="rpt-num">${_c(s.allot)}</td>
    <td class="rpt-num">${_c(s.oblig)}</td>
    <td class="rpt-num">${_c(s.disb)}</td>
    <td class="rpt-num${_neg(s.unpaid)}">${_wrap(s.unpaid)}</td>
    <td class="rpt-num${_neg(s.unob)}">${_wrap(s.unob)}</td>
    <td class="rpt-num">${_c(s.earn)}</td>
    <td class="rpt-num${_neg(s.bal)}">${_wrap(s.bal)}</td>
  </tr>`;
}

// ── Main render ───────────────────────────────────────────────
function rptRender() {
  if (!$('sec-reports')?.classList.contains('active')) return;
  rptPopulateFilters();

  const records = rptBuildRCRecords();
  const grand   = _agg(records);

  // Summary cards
  const upd = (id,v) => { const el=$(id); if(el) el.textContent=_c(v); };
  upd('rpt-s-allotment',     grand.allot);
  upd('rpt-s-earmarked',     grand.earn);
  upd('rpt-s-obligations',   grand.oblig);
  upd('rpt-s-disbursements', grand.disb);
  upd('rpt-s-unpaid',        grand.unpaid);
  upd('rpt-s-unobligated',   grand.unob);
  const balEl=$('rpt-s-balance'); if(balEl) balEl.textContent=_c(grand.bal);

  // Table header
  $('rpt-thead').innerHTML = `<tr class="rpt-header-row">
    <th class="rpt-th-codes">CODES</th>
    <th class="rpt-th-num">Allotment Received<br>per Responsibility Center</th>
    <th class="rpt-th-num">Current Year<br>Obligations</th>
    <th class="rpt-th-num">Current Year<br>Disbursement</th>
    <th class="rpt-th-num">Unpaid<br>Obligations</th>
    <th class="rpt-th-num">Unobligated Balance<br>per Responsibility Center</th>
    <th class="rpt-th-num">Earmarked</th>
    <th class="rpt-th-num">Remaining<br>Balance</th>
  </tr>`;

  if (!records.length) {
    $('rpt-tbody').innerHTML =
      `<tr><td colspan="8" class="rpt-empty">
         No data found. Add Responsibility Centers and Allotments to see the report.
       </td></tr>`;
    $('rpt-tfoot').innerHTML = '';
    $('rpt-row-count').textContent = '0 rows';
    return;
  }

  const rows = [];
  let rowCount = 0;

  // ═══════════ L0: Fund Cluster ════════════════════════════════
  const byFC = _grp(records, r => ({
    k:   r.fcCode || '(none)',
    lbl: r.fcCode
      ? `Fund Cluster: ${r.fcCode} - ${r.fcName || r.fcCode}`
      : '(No Fund Cluster)',
  }));

  byFC.forEach((fc, fi) => {
    if (fi > 0) rows.push(_spacer());

    const s0 = _agg(fc.records);
    rows.push(_rowFull('rpt-row-l0', 8, fc.lbl, s0, true));
    rowCount++;

    // ═══ L1: Financing Source ════════════════════════════════
    const byFS = _grp(fc.records, r => ({
      k:   r.fcName || r.fcCode || '(none)',
      lbl: r.fcCode && r.fcName
        ? `Financing Source: ${r.fcCode}00 - ${r.fcName}`
        : `Financing Source: ${r.fcName || r.fcCode || '(none)'}`,
    }));

    byFS.forEach(fs => {
      const s1 = _agg(fs.records);
      rows.push(_rowFull('rpt-row-l1', 20, fs.lbl, s1, true));
      rowCount++;

      // ═══ L2: Authorization Code ══════════════════════════
      const byAC2 = _grp(fs.records, r => ({
        k:   r.acCode || '(none)',
        lbl: r.acCode
          ? `Authorization Code: ${r.acCode} - ${r.acName || r.acCode}`
          : '(No Auth Code)',
      }));

      byAC2.forEach(ac2 => {
        const s2 = _agg(ac2.records);
        rows.push(_rowFull('rpt-row-l2', 34, ac2.lbl, s2, true));
        rowCount++;

        // ═══ L3: Fund Category ═══════════════════════════
        const byCat = _grp(ac2.records, r => ({
          k:   r.catCode || '(none)',
          lbl: r.catCode
            ? `Fund Category: ${r.catCode} - ${r.catName || r.catCode}`
            : '(No Fund Category)',
        }));

        byCat.forEach(cat => {
          const s3 = _agg(cat.records);
          rows.push(_rowFull('rpt-row-l3', 48, cat.lbl, s3, true));
          rowCount++;

          // ═══ L4: Programs/Projects ════════════════════
          const byProj = _grp(cat.records, r => ({
            k:   r.projCode || '(none)',
            lbl: r.projCode
              ? `Programs/Projects: ${r.projCode} - ${r.projName || r.projCode}`
              : '(No Project)',
          }));

          byProj.forEach(proj => {
            const s4 = _agg(proj.records);
            rows.push(_rowFull('rpt-row-l4', 62, proj.lbl, s4, true));
            rowCount++;

            // ═══ L5: Project Category ═════════════════
            const byPC = _grp(proj.records, r => ({
              k:   r.pCatCode || '(blank)',
              lbl: r.pCatCode && r.pCatCode !== '(blank)'
                ? `Project Category: ${r.pCatCode} - ${r.pCatName || r.pCatCode}`
                : 'Project Category: (blank)',
            }));

            byPC.forEach(pc => {
              const s5 = _agg(pc.records);
              rows.push(_rowFull('rpt-row-l5', 76, pc.lbl, s5, true));
              rowCount++;

              // ═══ L6: PAP/Sub-Category ═════════════
              const bySub = _grp(pc.records, r => ({
                k:   r.subCode || '(none)',
                lbl: r.subCode
                  ? `PAP/Project Sub-Category: ${r.subCode} - ${r.subName || r.subCode}`
                  : 'PAP/Project Sub-Category: (none)',
              }));

              bySub.forEach(sub => {
                const s6 = _agg(sub.records);
                rows.push(_rowFull('rpt-row-l6', 90, sub.lbl, s6, true));
                rowCount++;

                // ═══ L7: Responsibility Center ════════
                const byRC = _grp(sub.records, r => ({
                  k:   String(r.rcId),
                  lbl: `Responsibility Center: ${r.rcName}`,
                }));

                byRC.forEach((rcGrp, rcIdx) => {
                  // ── Blank spacer row BETWEEN different RCs ──────────
                  if (rcIdx > 0) {
                    rows.push(_rcSpacer());
                  }

                  const s7 = _agg(rcGrp.records);
                  rows.push(_rowFull('rpt-row-l7', 104, rcGrp.lbl, s7, true));
                  rowCount++;

                  // ═══ L8: Expense Class & L9: Account Codes
                  rcGrp.records.forEach(rec => {
                    const sortedEC = [...rec.ecMap.entries()]
                      .sort((a,b) => a[0].localeCompare(b[0]));

                    sortedEC.forEach(([ecLabel, acGrp], ecIdx) => {
                      // ── Spacer between different EC groups ──────────
                      if (ecIdx > 0) {
                        rows.push(_ecSpacer());
                      }

                      // EC totals
                      let ecOb=0, ecDisb=0, ecAllot=0, ecEarn=0;
                      acGrp.forEach(v => { ecOb+=v.ob; ecDisb+=v.disb; ecAllot+=v.allot; ecEarn+=v.earn; });

                      rows.push(_rowEC(
                        `Expense Class: ${ecLabel}`,
                        ecAllot, ecOb, ecDisb, ecEarn
                      ));
                      rowCount++;

                      // Account Codes under this EC
                      [...acGrp.entries()]
                        .sort((a,b) => a[0].localeCompare(b[0]))
                        .forEach(([acCode, acData]) => {
                          rows.push(_rowAC(acCode, acData.allot, acData.ob, acData.disb, acData.earn));
                          rowCount++;
                        });
                    });
                  });

                  // ── Trailing spacer after the last EC/AC block of each RC ──
                  rows.push(_ecSpacer());
                }); // RC
              }); // sub
            }); // pc
          }); // proj
        }); // cat
      }); // ac2
    }); // fs

    // Subtotal per fund cluster
    rows.push(_rowSub(
      `Subtotal – ${fc.records[0]?.fcCode||''} ${fc.records[0]?.fcName||''}`,
      s0
    ));
    rowCount++;

  }); // fc

  $('rpt-tbody').innerHTML = rows.join('');
  $('rpt-tfoot').innerHTML = _rowGrand(grand);
  $('rpt-row-count').textContent = `${rowCount} row${rowCount!==1?'s':''}`;
}

// ── CSV Export ────────────────────────────────────────────────
function rptExportCSV() {
  const records = rptBuildRCRecords();
  const grand   = _agg(records);
  const esc = s => '"' + String(s||'').replace(/<[^>]*>/g,'').replace(/"/g,"''") + '"';
  const n   = v => v === 0 ? '-' : v.toFixed(2);
  const ind = (lv, s) => esc('  '.repeat(lv) + s.replace(/<[^>]*>/g,''));

  const hdr = [
    '"CODES"',
    '"Allotment Received per RC"',
    '"Current Year Obligations"',
    '"Current Year Disbursement"',
    '"Unpaid Obligations"',
    '"Unobligated Balance per RC"',
    '"Earmarked"',
    '"Remaining Balance"',
  ].join(',');
  const lines = [hdr];

  const add = (lv, lbl, allot, ob, disb, earn) => {
    const unpaid = ob - disb;
    const unob   = allot - ob;
    const bal    = unob - earn;
    lines.push([ind(lv,lbl), n(allot), n(ob), n(disb), n(unpaid), n(unob), n(earn), n(bal)].join(','));
  };

  const byFC = _grp(records, r=>({k:r.fcCode||'(none)',lbl:`Fund Cluster: ${r.fcCode} - ${r.fcName||''}`}));
  byFC.forEach(fc => {
    const s0 = _agg(fc.records);
    add(0, fc.lbl, s0.allot, s0.oblig, s0.disb, s0.earn);

    const byFS = _grp(fc.records, r=>({k:r.fcName||r.fcCode||'(none)',lbl:`Financing Source: ${r.fcCode}00 - ${r.fcName||''}`}));
    byFS.forEach(fs => {
      const s1 = _agg(fs.records);
      add(1, fs.lbl, s1.allot, s1.oblig, s1.disb, s1.earn);

      const byAC2 = _grp(fs.records, r=>({k:r.acCode||'(none)',lbl:`Authorization Code: ${r.acCode} - ${r.acName||''}`}));
      byAC2.forEach(ac2 => {
        const s2 = _agg(ac2.records);
        add(2, ac2.lbl, s2.allot, s2.oblig, s2.disb, s2.earn);

        const byCat = _grp(ac2.records, r=>({k:r.catCode||'(none)',lbl:`Fund Category: ${r.catCode} - ${r.catName||''}`}));
        byCat.forEach(cat => {
          const s3 = _agg(cat.records);
          add(3, cat.lbl, s3.allot, s3.oblig, s3.disb, s3.earn);

          const byP = _grp(cat.records, r=>({k:r.projCode||'(none)',lbl:`Programs/Projects: ${r.projCode} - ${r.projName||''}`}));
          byP.forEach(proj => {
            const s4 = _agg(proj.records);
            add(4, proj.lbl, s4.allot, s4.oblig, s4.disb, s4.earn);

            const byPC = _grp(proj.records, r=>({k:r.pCatCode||'(blank)',lbl:`Project Category: ${r.pCatCode||'(blank)'} - ${r.pCatName||''}`}));
            byPC.forEach(pc => {
              const s5 = _agg(pc.records);
              add(5, pc.lbl, s5.allot, s5.oblig, s5.disb, s5.earn);

              const bySub = _grp(pc.records, r=>({k:r.subCode||'(none)',lbl:`PAP/Sub-Category: ${r.subCode||''} - ${r.subName||''}`}));
              bySub.forEach(sub => {
                const s6 = _agg(sub.records);
                add(6, sub.lbl, s6.allot, s6.oblig, s6.disb, s6.earn);

                const byRC = _grp(sub.records, r=>({k:String(r.rcId),lbl:`Responsibility Center: ${r.rcName}`}));
                byRC.forEach(rcGrp => {
                  const s7 = _agg(rcGrp.records);
                  add(7, rcGrp.lbl, s7.allot, s7.oblig, s7.disb, s7.earn);

                  rcGrp.records.forEach(rec => {
                    const sortedEC = [...rec.ecMap.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
                    sortedEC.forEach(([ecLabel, acGrp]) => {
                      let ecOb=0, ecDisb=0, ecAllot=0, ecEarn=0;
                      acGrp.forEach(v=>{ecOb+=v.ob; ecDisb+=v.disb; ecAllot+=v.allot; ecEarn+=v.earn;});
                      const ecUnob = ecAllot - ecOb;
                      const ecBal  = ecUnob - ecEarn;
                      lines.push([ind(8,`Expense Class: ${ecLabel}`), ecAllot>0?n(ecAllot):'-', n(ecOb), n(ecDisb), n(ecOb-ecDisb), ecAllot>0?n(ecUnob):'-', ecEarn>0?n(ecEarn):'-', (ecAllot>0||ecEarn>0)?n(ecBal):'-'].join(','));

                      [...acGrp.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([ac,d]) => {
                        const unpaid=d.ob-d.disb, unob=d.allot-d.ob, bal=unob-d.earn;
                        lines.push([ind(9,ac), n(d.allot), n(d.ob), n(d.disb), n(unpaid), n(unob), d.earn>0?n(d.earn):'-', (d.allot>0||d.earn>0)?n(bal):'-'].join(','));
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });

    add(0, `Subtotal – ${fc.records[0]?.fcCode||''} ${fc.records[0]?.fcName||''}`, s0.allot, s0.oblig, s0.disb, s0.earn);
    lines.push('');
  });

  // Grand total
  lines.push([esc('Grand total'),
    grand.allot.toFixed(2), grand.oblig.toFixed(2), grand.disb.toFixed(2),
    grand.unpaid.toFixed(2), grand.unob.toFixed(2), grand.earn.toFixed(2), grand.bal.toFixed(2)
  ].join(','));

  const blob = new Blob([lines.join('\n')], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `budget_report_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Report exported to CSV');
}

function rptPrint() { window.print(); }
