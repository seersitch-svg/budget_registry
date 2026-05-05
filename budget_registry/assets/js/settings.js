// PIN OVERRIDE SYSTEM
// ══════════════════════════════════════════

// Default PIN — stored in localStorage so it persists across sessions
const OVERRIDE_PIN_KEY = 'budget_registry_override_pin';
function getOverridePin() {
  return localStorage.getItem(OVERRIDE_PIN_KEY) || '1234';
}
function setOverridePin(pin) {
  if (pin && /^\d{4,8}$/.test(pin)) {
    localStorage.setItem(OVERRIDE_PIN_KEY, pin);
    return true;
  }
  return false;
}

// Track PIN state
let _pinEntry = '';
let _pinTarget = null;   // field ID being unlocked
let _pinResolve = null;  // promise resolver

// Track which fields are currently unlocked
const _unlockedFields = new Set();

// Open PIN dialog for a specific field
function triggerPinOverride(fieldId) {
  const field = $(fieldId);
  if (!field) return;

  // If already unlocked → re-lock it
  if (_unlockedFields.has(fieldId)) {
    lockField(fieldId);
    return;
  }

  _pinTarget = fieldId;
  _pinEntry = '';
  pinRenderDots();
  $('pinErr').textContent = '';
  $('pinTitle').textContent = 'Supervisor Override';
  $('pinDesc').textContent =
    fieldId === 'em_number'
      ? 'Enter the supervisor PIN to manually edit the Earmark Number.'
      : 'Enter the supervisor PIN to manually edit the OBR Number.';
  $('pinOverlay').classList.add('open');

  // Focus trap: catch keyboard
  $('pinOverlay').addEventListener('keydown', pinHandleKey);
}

function closePin() {
  $('pinOverlay').classList.remove('open');
  $('pinOverlay').removeEventListener('keydown', pinHandleKey);
  _pinEntry = '';
  _pinTarget = null;
  pinRenderDots();
  $('pinErr').textContent = '';
}

function pinHandleKey(e) {
  if (e.key >= '0' && e.key <= '9') pinKey(e.key);
  else if (e.key === 'Backspace') pinBackspace();
  else if (e.key === 'Escape') pinCancel();
}

function pinKey(digit) {
  if (_pinEntry.length >= 8) return;
  _pinEntry += digit;
  pinRenderDots();
  $('pinErr').textContent = '';

  // Auto-submit when PIN length matches stored PIN length
  const storedPin = getOverridePin();
  if (_pinEntry.length === storedPin.length) {
    pinSubmit();
  }
}

function pinBackspace() {
  _pinEntry = _pinEntry.slice(0, -1);
  pinRenderDots();
  $('pinErr').textContent = '';
}

function pinCancel() {
  closePin();
}

function pinSubmit() {
  const storedPin = getOverridePin();
  if (_pinEntry === storedPin) {
    // Correct PIN — unlock the target field
    const fieldId = _pinTarget;
    closePin();
    unlockField(fieldId);
    toast('Field unlocked. Edit carefully — this is an override.');
  } else {
    // Wrong PIN — shake and clear
    $('pinErr').textContent = 'Incorrect PIN. Try again.';
    const dots = document.querySelectorAll('.pin-dot');
    dots.forEach(d => { d.classList.add('error'); d.classList.remove('filled'); });
    setTimeout(() => {
      dots.forEach(d => d.classList.remove('error'));
      _pinEntry = '';
      pinRenderDots();
      $('pinErr').textContent = '';
    }, 700);
  }
}

function pinRenderDots() {
  const storedPin = getOverridePin();
  const len = storedPin.length;
  // Show correct number of dots
  const container = $('pinDots');
  if (!container) return;
  // Ensure we have enough dots
  while (container.children.length < len) {
    const d = document.createElement('div');
    d.className = 'pin-dot';
    container.appendChild(d);
  }
  while (container.children.length > len) {
    container.removeChild(container.lastChild);
  }
  Array.from(container.children).forEach((dot, i) => {
    dot.className = 'pin-dot' + (i < _pinEntry.length ? ' filled' : '');
  });
}

// Unlock a field: remove readonly, style as editable, show badge
function unlockField(fieldId) {
  const field = $(fieldId);
  const btn = $(fieldId + '_lock');
  const badge = $(fieldId + '_badge');
  if (!field) return;

  _unlockedFields.add(fieldId);
  field.removeAttribute('readonly');
  field.style.borderColor = 'var(--yellow)';
  field.style.background = 'var(--yellow-light)';
  field.style.fontWeight = '600';
  field.focus();
  field.select();

  if (btn) {
    btn.textContent = '🔓';
    btn.classList.add('unlocked');
    btn.title = 'Click to re-lock this field';
  }
  if (badge) badge.classList.add('show');
}

// Lock a field: restore readonly and styling
function lockField(fieldId) {
  const field = $(fieldId);
  const btn = $(fieldId + '_lock');
  const badge = $(fieldId + '_badge');
  if (!field) return;

  _unlockedFields.delete(fieldId);
  field.setAttribute('readonly', 'readonly');
  field.style.borderColor = '';
  field.style.background = '';
  field.style.fontWeight = '';

  if (btn) {
    btn.textContent = '🔒';
    btn.classList.remove('unlocked');
    btn.title = 'Click to override with supervisor PIN';
  }
  // Keep badge visible so it's clear this was edited
}

// Re-lock all override fields (called on modal close/reset)
function lockAllOverrideFields() {
  [..._unlockedFields].forEach(id => lockField(id));
  // Also hide badges on fresh open
  ['em_number_badge', 'ob_obrNum_badge'].forEach(id => {
    const el = $(id);
    if (el) el.classList.remove('show');
  });
}

// ── PIN Change (in Settings) ──────────────────────────────────
function openChangePinDialog() {
  const current = prompt('Enter current PIN:');
  if (current === null) return;
  if (current !== getOverridePin()) {
    toast('Incorrect current PIN', 'error');
    return;
  }
  const newPin = prompt('Enter new PIN (4-8 digits):');
  if (newPin === null) return;
  if (!/^\d{4,8}$/.test(newPin)) {
    toast('PIN must be 4-8 digits', 'error');
    return;
  }
  const confirm2pin = prompt('Confirm new PIN:');
  if (confirm2pin !== newPin) {
    toast('PINs do not match', 'error');
    return;
  }
  setOverridePin(newPin);
  toast('Override PIN updated successfully');
}


// ══════════════════════════════════════════
// BUDGET BALANCE CHECKER
// Formula: Balance = Allotment Received - Total Earmarked - Total Obligated
// Shows warning/error when adding earmark or obligation would go negative
// ══════════════════════════════════════════

/**
 * Get budget balance summary for a given RC.
 * @param {number} rcId - The RC id to check
 * @param {object} opts - {excludeEarmarkId, excludeObligationId, pendingEarmark, pendingObligation}
 * pendingEarmark/pendingObligation = amount about to be saved (for preview)
 */
function getRCBalance(rcId, opts = {}) {
  const allotment = DATA.allotment.find(a => a.rc_id == rcId);
  const allotmentAmt = parseFloat(allotment?.allotment_received) || 0;

  // Total earmarks for this RC (exclude the one being edited if editing)
  const totalEarmarked = DATA.earmark
    .filter(em => em.rc_id == rcId && em.id != opts.excludeEarmarkId)
    .reduce((s, em) => {
      // Use remaining_amount for partial earmarks (only unobligated portion ties up allotment)
      const remaining = em.remaining_amount != null
        ? parseFloat(em.remaining_amount)
        : parseFloat(em.total_amount) || 0;
      return s + remaining;
    }, 0);

  // Total obligations for this RC (exclude the one being edited if editing)
  const totalObligated = DATA.obligation
    .filter(ob => ob.rc_id == rcId && ob.id != opts.excludeObligationId)
    .reduce((s, ob) => s + (parseFloat(ob.obligation_incurred) || 0), 0);

  const usedAmt   = totalEarmarked + totalObligated;
  const balance   = allotmentAmt - usedAmt;

  // What balance would be after adding the pending amount
  const pending   = (opts.pendingEarmark || 0) + (opts.pendingObligation || 0);
  const projected = balance - pending;

  return {
    allotmentAmt,
    totalEarmarked,
    totalObligated,
    usedAmt,
    balance,
    pending,
    projected,
    hasAllotment: !!allotment,
  };
}

/**
 * Render a balance bar element with the given balance info.
 * @param {string} barId - element id of the balance bar div
 * @param {object} bal   - result from getRCBalance()
 * @param {string} mode  - 'allotment' | 'earmark' | 'obligation'
 */
function renderBalanceBar(barId, bal, mode) {
  const bar = $(barId);
  if (!bar) return;

  if (!bal.hasAllotment) {
    bar.style.display = 'none';
    return;
  }

  bar.style.display = '';

  const isDanger  = bal.projected < 0;
  const isWarn    = bal.projected >= 0 && bal.balance < bal.allotmentAmt * 0.1; // within 10%
  const isOk      = !isDanger && !isWarn;

  bar.className = 'balance-bar ' + (isDanger ? 'danger' : isWarn ? 'warn' : 'ok');

  const icon   = isDanger ? '⛔' : isWarn ? '⚠️' : '✅';
  const status = isDanger
    ? 'Allotment will be <strong>EXCEEDED</strong>'
    : isWarn
    ? 'Allotment is running low'
    : 'Allotment balance is sufficient';

  let pendingLine = '';
  if (bal.pending > 0) {
    pendingLine = `<div class="bal-breakdown">
      Allotment: ${fmt.cur(bal.allotmentAmt)} &nbsp;|&nbsp;
      Earmarked: ${fmt.cur(bal.totalEarmarked)} &nbsp;|&nbsp;
      Obligated: ${fmt.cur(bal.totalObligated)} &nbsp;|&nbsp;
      This ${mode}: ${fmt.cur(bal.pending)}
    </div>`;
  } else {
    pendingLine = `<div class="bal-breakdown">
      Allotment: ${fmt.cur(bal.allotmentAmt)} &nbsp;|&nbsp;
      Earmarked: ${fmt.cur(bal.totalEarmarked)} &nbsp;|&nbsp;
      Obligated: ${fmt.cur(bal.totalObligated)}
    </div>`;
  }

  bar.innerHTML = `
    <span class="bal-icon">${icon}</span>
    <span class="bal-text">
      ${status}
      ${pendingLine}
    </span>
    <span class="bal-amount">${fmt.cur(bal.projected)}</span>
  `;
}

// ── Live balance check for Earmark modal ──────────────────────
function emCheckBalance() {
  const rcId   = parseInt($('em_rcId').value);
  const editId = $('em_editId').value;
  if (!rcId) { const b=$('em_balance_bar'); if(b)b.style.display='none'; return; }

  const pending = emGetTotal();
  const bal = getRCBalance(rcId, {
    excludeEarmarkId: editId ? parseInt(editId) : null,
    pendingEarmark: pending,
  });
  renderBalanceBar('em_balance_bar', bal, 'earmark');
}

// ── Live balance check for Obligation modal ───────────────────
function obCheckBalance() {
  const type   = $('ob_type').value;
  const editId = $('ob_editId').value;
  let rcId = null;

  if (type === 'Creditor') {
    const emId = parseInt($('ob_earmarkId').value);
    const em   = getEarmarkById(emId);
    rcId = em?.rc_id || null;
  } else if (type === 'Mandatory' || type === 'Claims') {
    rcId = parseInt($('ob_rcId').value) || null;
  }

  if (!rcId) { const b=$('ob_balance_bar'); if(b)b.style.display='none'; return; }

  const pending = fmt.parse($('ob_amount').value) || 0;
  const bal = getRCBalance(rcId, {
    excludeObligationId: editId ? parseInt(editId) : null,
    pendingObligation: pending,
  });
  renderBalanceBar('ob_balance_bar', bal, 'obligation');
}

// ── Live balance check for Allotment modal ────────────────────
function alCheckBalance() {
  const rcId   = parseInt($('al_rcId').value);
  const editId = $('al_editId').value;
  if (!rcId) { const b=$('al_balance_bar'); if(b)b.style.display='none'; return; }

  const rec = fmtVal($('al_received'));
  if (rec <= 0) { const b=$('al_balance_bar'); if(b)b.style.display='none'; return; }

  // For allotment: show how much of the allotment_received is already used
  const bal = getRCBalance(rcId, {
    // When editing allotment, we don't exclude anything —
    // the new value IS the allotment_received, so balance = rec - earmarked - obligated
    pendingEarmark: 0,
    pendingObligation: 0,
  });
  // Override allotmentAmt with the value being entered (since it may differ from stored)
  const altBal = { ...bal, allotmentAmt: rec, balance: rec - bal.totalEarmarked - bal.totalObligated, projected: rec - bal.totalEarmarked - bal.totalObligated, pending: 0 };
  renderBalanceBar('al_balance_bar', altBal, 'allotment');
}


// ══════════════════════════════════════════
// SYSTEM SETTINGS
// ══════════════════════════════════════════

const PREFS_KEY = 'budget_registry_prefs';

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
}
function savePrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}
function savePref(key, value) {
  const p = loadPrefs(); p[key] = value; savePrefs(p);
}
function getPref(key, def) {
  const p = loadPrefs(); return key in p ? p[key] : def;
}

// ── Tab switcher ─────────────────────────────────────────────
function sysTab(tab) {
  document.querySelectorAll('.ss-nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.ss-panel').forEach(p => p.classList.remove('active'));
  const btn = $('stab-' + tab);
  const panel = $('spanel-' + tab);
  if (btn) btn.classList.add('active');
  if (panel) panel.classList.add('active');
  // Lazy init per panel
  if (tab === 'database')  initDBPanel();
  if (tab === 'fiscal')    initFiscalPanel();
  if (tab === 'security')  initSecurityPanel();
  if (tab === 'display')   initDisplayPanel();
  if (tab === 'general')   initGeneralPanel();
  if (tab === 'about')     initAboutPanel();
}

// ── Agency Information ────────────────────────────────────────
function initGeneralPanel() {
  const p = loadPrefs();
  ['agencyName','region','office','address1','address2','telephone','email','website'].forEach(k => {
    const el = $('cfg_' + k);
    if (el && p[k]) el.value = p[k];
  });
}
function saveAgencyInfo() {
  const keys = ['agencyName','region','office','address1','address2','telephone','email','website'];
  const p = loadPrefs();
  keys.forEach(k => { const el = $('cfg_' + k); if (el) p[k] = el.value.trim(); });
  savePrefs(p);
  toast('Agency information saved');
}

// ── Fiscal Year ───────────────────────────────────────────────
function initFiscalPanel() {
  const p = loadPrefs();
  const sel = $('cfg_fiscalYear');
  if (sel && sel.options.length === 0) {
    const cur = new Date().getFullYear();
    for (let y = cur + 1; y >= cur - 3; y--) {
      const opt = document.createElement('option');
      opt.value = y; opt.textContent = y;
      if (y === (p.fiscalYear || cur)) opt.selected = true;
      sel.appendChild(opt);
    }
  }
  // Quarter labels
  ['q1','q2','q3','q4'].forEach(k => {
    const el = $('cfg_' + k);
    if (el && p[k]) el.value = p[k];
  });
  // OBR prefix
  const pfx = $('cfg_obrPrefix');
  if (pfx && p.obrPrefix) pfx.value = p.obrPrefix;
  updateFYPreview();
}
function updateFYPreview() {
  const sel = $('cfg_fiscalYear');
  const fy = sel ? String(sel.value).slice(-2) : String(new Date().getFullYear()).slice(-2);
  const mo = String(new Date().getMonth()+1).padStart(2,'0');
  const el = $('cfg_fy_preview');
  if (el) el.textContent = fy + '-' + mo + '-0001';
}
function saveFiscalSettings() {
  const p = loadPrefs();
  const sel = $('cfg_fiscalYear');
  if (sel) p.fiscalYear = parseInt(sel.value);
  ['q1','q2','q3','q4'].forEach(k => { const el=$('cfg_'+k); if(el) p[k]=el.value.trim(); });
  const pfx = $('cfg_obrPrefix');
  if (pfx) p.obrPrefix = pfx.value.trim() || 'OBR';
  savePrefs(p);
  toast('Fiscal year settings saved');
}

// ── Security ──────────────────────────────────────────────────
function initSecurityPanel() {
  const pin = getOverridePin();
  const dots = $('cfg_pin_dots');
  if (dots) dots.textContent = '•'.repeat(pin.length);
}
function resetOverridePIN() {
  confirm2('Reset Override PIN', 'Reset the supervisor PIN back to the default "1234"?').then(ok => {
    if (!ok) return;
    setOverridePin('1234');
    initSecurityPanel();
    toast('Override PIN reset to 1234');
  });
}

// ── Display Preferences ───────────────────────────────────────
function initDisplayPanel() {
  const p = loadPrefs();
  const map = {
    cfg_currency:     ['currency', '₱'],
    cfg_dateFormat:   ['dateFormat', 'MMM D, YYYY'],
    cfg_pageSize:     ['pageSize', '50'],
    cfg_showWorkflow: ['showWorkflow', true],
    cfg_compactRows:  ['compactRows', false],
    cfg_showTimestamp:['showTimestamp', true],
    cfg_confirmDelete:['confirmDelete', true],
    cfg_balanceWarn:  ['balanceWarn', true],
  };
  Object.entries(map).forEach(([id, [key, def]]) => {
    const el = $(id);
    if (!el) return;
    const val = getPref(key, def);
    if (el.type === 'checkbox') el.checked = val;
    else el.value = val;
  });
}
function saveDisplayPrefs() {
  const p = loadPrefs();
  const controls = ['cfg_currency','cfg_dateFormat','cfg_pageSize'];
  controls.forEach(id => {
    const el = $(id);
    if (el) p[id.replace('cfg_','')] = el.value;
  });
  savePrefs(p);
  toast('Display preferences saved');
}
function toggleWorkflowSidebar(show) {
  savePref('showWorkflow', show);
  const footer = document.querySelector('.sidebar-footer');
  if (footer) footer.style.display = show ? '' : 'none';
}
function toggleCompactRows(compact) {
  savePref('compactRows', compact);
  document.body.classList.toggle('compact-rows', compact);
}

// ── Database Panel ────────────────────────────────────────────
async function initDBPanel() {
  $('db_info_dot').className = 'db-dot';
  $('db_info_text').textContent = 'Testing connection...';
  $('db_cfg_status').textContent = '...';
  refreshDBStats();
  await pingDB();
}
async function pingDB() {
  try {
    const ok = await BudgetAPI.ping();
    const dot = $('db_info_dot');
    const txt = $('db_info_text');
    const status = $('db_cfg_status');
    if (ok) {
      if (dot) { dot.className = 'db-dot connected'; }
      if (txt) txt.textContent = 'Connected to MySQL — budget_registry';
      if (status) status.textContent = 'Connected ✓';
    } else {
      if (dot) dot.className = 'db-dot';
      if (txt) txt.textContent = 'Cannot reach database';
      if (status) status.textContent = 'Disconnected';
    }
  } catch (e) {
    const dot = $('db_info_dot');
    if (dot) dot.className = 'db-dot';
    $('db_info_text').textContent = 'Connection error: ' + e.message;
  }
}
function refreshDBStats() {
  $('dbs_rc').textContent  = DATA.rc.length;
  $('dbs_al').textContent  = DATA.allotment.length;
  $('dbs_em').textContent  = DATA.earmark.length;
  $('dbs_ob').textContent  = DATA.obligation.length;
  $('dbs_db').textContent  = DATA.disbursement.length;
  // Count reference items
  const refTotal = Object.values(FUND_DATA).reduce((s, fc) => {
    return s + 1 + Object.values(fc.authCodes||{}).reduce((s2, ac) => s2 + 1 + Object.keys(ac.cats||{}).length, 0);
  }, 0) + Object.keys(PROJECT_DATA).length +
    [1,2,3].reduce((s,n) => s + (ACCOUNT_CODES[n]||[]).length, 0) +
    Object.values(RC_ACTIVITIES).reduce((s,a) => s + a.length, 0);
  $('dbs_ref').textContent = refTotal;
}

// ── Backup & Restore ──────────────────────────────────────────
function exportAllData() {
  const all = {
    exportedAt: new Date().toISOString(),
    version: '2.0.0',
    rc:           DATA.rc,
    allotment:    DATA.allotment,
    earmark:      DATA.earmark,
    obligation:   DATA.obligation,
    disbursement: DATA.disbursement,
    refData: {
      fundData:     FUND_DATA,
      projectData:  PROJECT_DATA,
      accountCodes: ACCOUNT_CODES,
      rcActivities: RC_ACTIVITIES,
    },
    settings: loadPrefs(),
  };
  const blob = new Blob([JSON.stringify(all, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `budget_registry_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`Full backup exported (${DATA.rc.length + DATA.allotment.length + DATA.earmark.length + DATA.obligation.length + DATA.disbursement.length} records)`);
}

function importBackupFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      // Restore preferences if present
      if (data.settings) {
        savePrefs({...loadPrefs(), ...data.settings});
        toast('Settings restored from backup');
      }
      // Note: full record import would require server-side merge endpoint
      // For now restore preferences and ref data only
      if (data.refData) {
        if (data.refData.fundData)    { Object.assign(FUND_DATA, data.refData.fundData); }
        if (data.refData.projectData) { Object.assign(PROJECT_DATA, data.refData.projectData); }
        if (data.refData.accountCodes){ [1,2,3].forEach(n=>{ if(data.refData.accountCodes[n]) ACCOUNT_CODES[n]=data.refData.accountCodes[n]; }); }
        if (data.refData.rcActivities){ Object.assign(RC_ACTIVITIES, data.refData.rcActivities); }
        await persistRefType('all_fund');
        await persistRefType('all_project');
        await persistRefType('account_code');
        await persistRefType('activity');
        toast('Reference data restored from backup');
      }
    } catch (err) {
      toast('Failed to parse backup file: ' + err.message, 'error');
    }
    input.value = '';
  };
  reader.readAsText(file);
}

// ── About Panel ───────────────────────────────────────────────
function initAboutPanel() {
  const el = $('about_loaded');
  if (el) el.textContent = new Date().toLocaleString('en-PH');
}

// ── Apply saved prefs on app load ─────────────────────────────
function applyStoredPrefs() {
  const p = loadPrefs();
  if (p.compactRows)  { document.body.classList.add('compact-rows'); }
  if (p.showWorkflow === false) {
    const footer = document.querySelector('.sidebar-footer');
    if (footer) footer.style.display = 'none';
  }
}


// ── Show allotted amount hint for selected account code (MC obligations) ─────
function obUpdateACHint() {
  const hint = $('ob_ac_hint');
  if (!hint) return;
  const rcId = parseInt($('ob_rcId').value);
  const ac = $('ob_accountCode').value;
  if (!rcId || !ac) { hint.style.display = 'none'; return; }

  // Find allotment for this RC
  const allotment = DATA.allotment.find(a => a.rc_id == rcId);
  if (!allotment) { hint.style.display = 'none'; return; }

  // Check account_allocations for this specific code
  const acAlloc = (allotment.account_allocations || []).find(a => a.code === ac);
  if (acAlloc && acAlloc.amount > 0) {
    // Check how much is already obligated against this account code
    const alreadyObligated = DATA.obligation
      .filter(o => o.rc_id == rcId && o.account_code === ac && o.id != ($('ob_editId').value || 0))
      .reduce((s, o) => s + (parseFloat(o.obligation_incurred) || 0), 0);
    const remaining = (acAlloc.amount || 0) - alreadyObligated;
    hint.style.display = '';
    hint.style.color = remaining <= 0 ? 'var(--red)' : 'var(--text3)';
    hint.textContent = `Allotted: ${fmt.cur(acAlloc.amount)} · Already obligated: ${fmt.cur(alreadyObligated)} · Remaining: ${fmt.cur(remaining)}`;
  } else if (allotment.allotment_received > 0) {
    // No per-code allocation — show total allotment balance
    hint.style.display = '';
    hint.style.color = 'var(--text3)';
    hint.textContent = `Allotment received: ${fmt.cur(allotment.allotment_received)} (no per-code breakdown)`;
  } else {
    hint.style.display = 'none';
  }
  // Also trigger the main balance bar
  obCheckBalance();
}



// ── Cancel a specific obligated lot from an earmark ──────────────────────────
async function emCancelLot(earmarkId, lotIndex, obligationId){
  const em = DATA.earmark.find(x=>x.id==earmarkId);
  const ob = DATA.obligation.find(x=>x.id==obligationId);
  if(!em||!ob) return;

  const lot = (em.lots||[])[lotIndex];
  const lotNum = lot?.lotNumber || lotIndex+1;
  const lotAmt = ((lot?.items||[]).reduce((s,i)=>s+(parseFloat(i.amount||i.totalCost)||0),0));

  const ok = await confirm2(
    'Cancel Lot Obligation',
    `Cancel Lot ${lotNum} from earmark ${em.earmark_number}?

` +
    `Lot amount: ${fmt.cur(lotAmt)}
` +
    `This will restore ${fmt.cur(lotAmt)} to the available allotment.

` +
    `Note: The linked obligation (${ob.obr_number}) will still exist — ` +
    `delete the obligation if all its lots are cancelled.`
  );
  if(!ok) return;

  try{
    showSaving(true);
    // Un-obligate this specific lot by calling earmarks PUT special handler
    await BudgetAPI.updateEarmarkLots(earmarkId, [{
      lotIndex, is_obligated: false, obligation_id: null
    }]);
    await loadAll();
    closeModal('viewModal');
    renderAll();
    toast(`Lot ${lotNum} cancelled — ${fmt.cur(lotAmt)} returned to allotment`);
  } catch(err){
    toast(err.message,'error');
  } finally{
    showSaving(false);
  }
}


// ── Derive Expense Class from Account Code prefix ──────────────────────────
// 5-01-xx = PS, 5-02-xx = MOOE, 5-06-xx = CO
function obDeriveExpenseClassFromAC(code) {
  if (!code) return;
  const expSel = $('ob_expClass');
  if (!expSel || expSel.disabled) return; // already locked by obAutoSetExpenseClass
  let derived = null;
  if (code.startsWith('5-01')) derived = '1 - Personnel Services';
  else if (code.startsWith('5-02')) derived = '2 - MOOE';
  else if (code.startsWith('5-06')) derived = '3 - Capital Outlay';
  if (derived) {
    // Only set if the option exists and nothing is chosen yet
    const opt = Array.from(expSel.options).find(o => o.value === derived);
    if (opt && !expSel.value) {
      expSel.value = derived;
    }
  }
}


// ══════════════════════════════════════════
