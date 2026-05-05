// TOAST & CONFIRM
// ══════════════════════════════════════════
function toast(msg,type='success'){
  const c=$('toastContainer'),t=document.createElement('div');
  t.className=`toast ${type}`;
  t.innerHTML=`<span class="t-icon">${type==='success'?'✓':'✗'}</span><span>${msg}</span>`;
  c.appendChild(t);setTimeout(()=>t.remove(),3500);
}
let _cr=null;
function confirm2(title,msg){return new Promise(r=>{_cr=r;$('confirmTitle').textContent=title;$('confirmMsg').textContent=msg;$('confirmOverlay').classList.add('open');});}
function confirmResolve(v){$('confirmOverlay').classList.remove('open');if(_cr)_cr(v);_cr=null;}


// ══════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════
function dashRender() {
  if (!$('sec-dashboard')?.classList.contains('active')) return;

  // KPI totals
  const totAllot   = DATA.allotment.reduce((s,a)=>s+(parseFloat(a.allotment_received)||0),0);
  const totOblig   = DATA.obligation.reduce((s,o)=>s+(parseFloat(o.obligation_incurred)||0),0);
  const totDisb    = DATA.disbursement.reduce((s,d)=>s+(parseFloat(d.total_disbursement)||0),0);
  const totUnob    = totAllot - totOblig;

  $('dash-kpi-allotment').textContent    = fmt.cur(totAllot);
  $('dash-kpi-obligated').textContent    = fmt.cur(totOblig);
  $('dash-kpi-disbursed').textContent    = fmt.cur(totDisb);
  $('dash-kpi-unobligated').textContent  = fmt.cur(totUnob);

  // ── Utilization gauges ────────────────────────────────────────
  const utilPct  = totAllot  > 0 ? Math.min(100, totOblig/totAllot*100)  : 0;
  const disbPct  = totOblig  > 0 ? Math.min(100, totDisb/totOblig*100)   : 0;
  const unpaidPct= totOblig  > 0 ? Math.min(100, (totOblig-totDisb)/totOblig*100) : 0;

  const mkGauge = (label, pct, color, value, max) => `
    <div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
        <span style="font-weight:500;color:var(--text)">${label}</span>
        <span style="font-weight:700;color:${color};font-family:var(--mono)">${pct.toFixed(1)}%</span>
      </div>
      <div style="background:var(--surface);border-radius:6px;height:10px;overflow:hidden;border:1px solid var(--border)">
        <div style="width:${pct}%;height:100%;background:${color};border-radius:6px;transition:width .5s"></div>
      </div>
      <div style="font-size:10px;color:var(--text3);margin-top:3px">${fmt.cur(value)} of ${fmt.cur(max)}</div>
    </div>`;

  const utilColor = utilPct>=75?'var(--green)':utilPct>=50?'var(--yellow)':'var(--red)';
  const disbColor = disbPct>=75?'var(--cyan)':disbPct>=50?'var(--blue)':'var(--orange)';

  $('dash-util-bars').innerHTML =
    mkGauge('Obligation Rate (Obligations / Allotment)', utilPct, utilColor, totOblig, totAllot) +
    mkGauge('Disbursement Rate (Disbursed / Obligated)', disbPct, disbColor, totDisb, totOblig) +
    mkGauge('Unpaid Obligations', unpaidPct, 'var(--orange)', totOblig-totDisb, totOblig);

  // ── By Type ────────────────────────────────────────────────────
  const byType = {Mandatory:0, Claims:0, Creditor:0};
  DATA.obligation.forEach(o => { if(byType[o.obligation_type]!=null) byType[o.obligation_type]+=(parseFloat(o.obligation_incurred)||0); });
  const typeColors = {Mandatory:'var(--blue)',Claims:'var(--yellow)',Creditor:'var(--purple)'};
  $('dash-ob-type-bars').innerHTML = Object.entries(byType).map(([type,amt])=>{
    const pct = totOblig>0?amt/totOblig*100:0;
    return mkGauge(type, pct, typeColors[type], amt, totOblig);
  }).join('');

  // ── Top 5 RCs by obligation ───────────────────────────────────
  const rcTotals = {};
  DATA.obligation.forEach(o => {
    if (!o.rc_id) return;
    rcTotals[o.rc_id] = (rcTotals[o.rc_id]||0) + (parseFloat(o.obligation_incurred)||0);
  });
  const top5 = Object.entries(rcTotals)
    .sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxTop = top5[0]?.[1] || 1;

  $('dash-top-rcs').innerHTML = top5.length ? top5.map(([rcId, amt])=>{
    const rc = getRCById(parseInt(rcId));
    const pct = amt/maxTop*100;
    const al = DATA.allotment.find(a=>a.rc_id==rcId);
    const allot = parseFloat(al?.allotment_received)||0;
    const utilPct = allot>0?Math.min(100,amt/allot*100):0;
    return `<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
        <span style="font-weight:500;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${rc?.responsibility_center||'RC '+rcId}</span>
        <span style="font-family:var(--mono);font-weight:600;color:var(--blue);margin-left:8px">${fmt.cur(amt)}</span>
      </div>
      <div style="background:var(--surface);border-radius:4px;height:7px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:var(--blue);border-radius:4px"></div>
      </div>
      <div style="font-size:10px;color:var(--text3);margin-top:2px">Utilized ${utilPct.toFixed(1)}% of allotment</div>
    </div>`;
  }).join('') : '<div style="color:var(--text3);font-size:13px">No obligations recorded yet.</div>';

  // ── Alerts ─────────────────────────────────────────────────────
  const alerts = [];

  // RCs with negative unobligated balance
  DATA.allotment.forEach(al => {
    const rc = getRCById(al.rc_id);
    const rcOblig = DATA.obligation.filter(o=>o.rc_id===al.rc_id).reduce((s,o)=>s+(parseFloat(o.obligation_incurred)||0),0);
    const unob = (parseFloat(al.allotment_received)||0) - rcOblig;
    if (unob < -0.005) {
      alerts.push({type:'error', icon:'🔴',
        msg:`<strong>${rc?.responsibility_center||'RC'}</strong> — Over-obligated by <strong>${fmt.cur(Math.abs(unob))}</strong>`});
    }
  });

  // Earmarks available but no obligation
  const availEarmarks = DATA.earmark.filter(e=>!(e.is_obligated==1)&&(parseFloat(e.total_amount)||0)>0);
  if (availEarmarks.length > 0) {
    alerts.push({type:'warn', icon:'🟡',
      msg:`<strong>${availEarmarks.length}</strong> earmark${availEarmarks.length>1?'s':''} with unobligated funds totalling <strong>${fmt.cur(availEarmarks.reduce((s,e)=>s+(parseFloat(e.remaining_amount??e.total_amount)||0),0))}</strong>`});
  }

  // Obligations with no disbursements
  const undisburged = DATA.obligation.filter(o=>!DATA.disbursement.some(d=>d.obligation_id===o.id));
  if (undisburged.length > 0) {
    alerts.push({type:'info', icon:'🔵',
      msg:`<strong>${undisburged.length}</strong> obligation${undisburged.length>1?'s':''} have not been disbursed yet`});
  }

  $('dash-alerts').innerHTML = alerts.length
    ? alerts.map(a=>`<div style="display:flex;gap:8px;align-items:flex-start;padding:8px;border-radius:var(--radius);margin-bottom:6px;background:var(--surface);border:1px solid var(--border);font-size:12px">
        <span>${a.icon}</span><span>${a.msg}</span>
      </div>`).join('')
    : '<div style="color:var(--green);font-size:13px;font-weight:500">✅ No budget alerts — all looks good!</div>';

  // ── Recent obligations ─────────────────────────────────────────
  const recent = [...DATA.obligation].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,8);
  $('dash-recent-ob').innerHTML = recent.length
    ? recent.map(o=>{
        const rc=getRCById(o.rc_id);
        const disbursed=DATA.disbursement.filter(d=>d.obligation_id===o.id).reduce((s,d)=>s+(parseFloat(d.total_disbursement)||0),0);
        return `<tr>
          <td>${fmt.date(o.date)}</td>
          <td style="font-family:var(--mono);font-size:11px">${o.obr_number||'—'}</td>
          <td><span class="badge ${o.obligation_type==='Creditor'?'b-purple':o.obligation_type==='Mandatory'?'b-blue':'b-yellow'}">${o.obligation_type}</span></td>
          <td><strong>${o.payee}</strong></td>
          <td style="color:var(--text2)">${rc?.responsibility_center||'—'}</td>
          <td class="amt">${fmt.cur(o.obligation_incurred)}</td>
          <td class="amt amt-pos">${disbursed>0?fmt.cur(disbursed):'<span style="color:var(--text3)">—</span>'}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text3)">No obligations yet.</td></tr>';
}


// ── Debounce (for search inputs) ─────────────────────────────
function debounce(fn, ms=200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), ms); };
}

// ── Sort state per module ─────────────────────────────────────
const _sortState = {};
function getSort(mod) { return _sortState[mod] || {col:null, dir:1}; }
function setSort(mod, col) {
  const cur = _sortState[mod];
  if (cur?.col === col) { _sortState[mod] = {col, dir: cur.dir * -1}; }
  else { _sortState[mod] = {col, dir: 1}; }
}
function sortIndicator(mod, col) {
  const s = _sortState[mod];
  if (s?.col !== col) return '<span style="color:var(--border2);font-size:9px">⇅</span>';
  return s.dir === 1 ? '↑' : '↓';
}
function sortRows(rows, mod) {
  const {col, dir} = getSort(mod);
  if (!col) return rows;
  return [...rows].sort((a,b)=>{
    let av=a[col], bv=b[col];
    if (av==null) av=''; if (bv==null) bv='';
    const an=parseFloat(av), bn=parseFloat(bv);
    if (!isNaN(an)&&!isNaN(bn)) return (an-bn)*dir;
    return String(av).localeCompare(String(bv))*dir;
  });
}


// ── Keyboard Shortcuts ───────────────────────────────────────
document.addEventListener('keydown', e => {
  // Escape closes modal (with unsaved-changes guard)
  if (e.key==='Escape') {
    const openModals = [...document.querySelectorAll('.modal-overlay.open')];
    if (openModals.length) {
      const top = openModals[openModals.length - 1];
      if (top.id === 'pinOverlay' || top.id === 'confirmOverlay') return;
      if (window._modalGuard && window._modalGuard.isDataEntry(top.id) && window._modalGuard.isDirty(top.id)) {
        window._modalGuard.confirmDiscard(top.id).then(ok => { if (ok) window._modalGuard.forceClose(top.id); });
      } else {
        window._modalGuard ? window._modalGuard.forceClose(top.id) : top.classList.remove('open');
      }
    }
    return;
  }
  // Alt + number → navigate to module
  if (e.altKey && !e.ctrlKey && !e.shiftKey) {
    const keyMap = {'1':'dashboard','2':'rc','3':'allotment','4':'earmarked','5':'obligations','6':'disbursement','7':'reports'};
    if (keyMap[e.key]) { e.preventDefault(); nav(keyMap[e.key]); return; }
    // Alt+N → open Add modal for current section
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      const active = document.querySelector('.nav-item.active')?.id?.replace('nav-','');
      if (active==='rc')           openRCModal();
      else if (active==='allotment')  openAllotmentModal();
      else if (active==='earmarked')  openEarmarkModal();
      else if (active==='obligations') openObligationModal();
      else if (active==='disbursement') openDisbursementModal();
    }
  }
});





// ══════════════════════════════════════════
// AUTH — LOGIN / LOGOUT
// ══════════════════════════════════════════
let _currentUser = null;

async function doLogin() {
  const btn=$('loginBtn'),err=$('loginError');
  const user=$('loginUser').value.trim(),pass=$('loginPass').value;
  if(!user||!pass){err.style.display='';err.textContent='Please enter username and password.';return;}
  btn.textContent='Signing in…';btn.disabled=true;
  try{
    const res=await fetch(`${API_BASE}/auth.php?action=login`,
      {method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},credentials:'include',body:JSON.stringify({username:user,password:pass})});
    const json=await res.json();
    if(json.success){
      _currentUser=json.data;
      $('loginOverlay').style.display='none';
      $('topbar-user').style.display='flex';
      $('topbar-username').textContent=json.data.fullName||json.data.username;
      err.style.display='none';
      btn.textContent='Sign In'; btn.disabled=false;
      await bootApp(); return;
    } else {
      err.style.display='';
      err.textContent=json.message||'Incorrect username or password.';
    }
  } catch(e){
    // Auth server not reachable — offline mode
    _currentUser={username:'offline',role:'admin',fullName:'Offline Mode'};
    $('loginOverlay').style.display='none';
    $('topbar-user').style.display='flex';
    $('topbar-username').textContent='Offline Mode';
    btn.textContent='Sign In'; btn.disabled=false;
    await bootApp(); return;
  }
  btn.textContent='Sign In'; btn.disabled=false;
}

async function doLogout(){
  try{await fetch(`${API_BASE}/auth.php?action=logout`,{credentials:'include',headers:{'X-Requested-With':'XMLHttpRequest'}});}catch(e){}
  _currentUser=null;
  $('loginOverlay').style.display='flex';
  $('topbar-user').style.display='none';
}

function isViewer(){return _currentUser?.role==='viewer';}

// ── Fiscal Year Filter ────────────────────────────────────────
let _activeFY = ''; // '' = all years

function buildFYOptions() {
  const sel = $('fy-select');
  if (!sel) return;
  // Collect all years from all dated records
  const years = new Set();
  [...DATA.rc, ...DATA.obligation, ...DATA.earmark, ...DATA.disbursement]
    .forEach(r => { if(r.date) years.add(new Date(r.date+'T00:00').getFullYear()); });
  const sorted = [...years].sort((a,b)=>b-a);
  const cur = sel.value;
  sel.innerHTML = '<option value="">All Years</option>';
  sorted.forEach(y => sel.innerHTML += `<option value="${y}" ${y==cur?'selected':''}>${y}</option>`);
  if (cur) sel.value = cur;
}

function applyFYFilter() {
  _activeFY = $('fy-select')?.value || '';
  renderAll();
}

function fyMatch(record) {
  if (!_activeFY) return true;
  if (!record?.date) return true;
  return new Date(record.date+'T00:00').getFullYear() == parseInt(_activeFY);
}


// ══════════════════════════════════════════
// CSV IMPORT
// ══════════════════════════════════════════
const IMPORT_TEMPLATES = {
  rc: {
    headers: ['date','auth_type','auth_reference','payee','particulars','fund_cluster','auth_code','fund_category','responsibility_center','project_program','project_category','project_sub_category','activity_levels','expense_classes','account_codes'],
    sample:  ['2026-01-15','GAA','','Juan Dela Cruz','Budget allocation','01000000','01101000','01101101','Finance Division','1000000000','Blank/None','100000100001','General Management','2 - MOOE','5-02-01-010']
  },
  obligation: {
    headers: ['date','obr_number','obligation_type','payee','particulars','obligation_incurred','account_code','expense_class','activity'],
    sample:  ['2026-01-15','OBR-26-01-0001','Mandatory','Juan Dela Cruz','Office supplies','2250.00','5-02-03-220-01','2 - MOOE','Activity Name']
  },
  disbursement: {
    headers: ['date','obr_number','check_number','net_disbursement','tra_amount'],
    sample:  ['2026-01-20','OBR-26-01-0001','CHK-2026-001','2000.00','250.00']
  }
};

let _importRows = [];

function openImportModal(mod) {
  _importRows = [];
  $('import-module').value = mod || 'rc';
  $('import-file').value = '';
  $('import-preview').innerHTML = '';
  $('import-save-btn').disabled = true;
  openModal('importModal');
}

function importUpdateTemplate() {
  $('import-file').value = '';
  $('import-preview').innerHTML = '';
  $('import-save-btn').disabled = true;
  _importRows = [];
}

function importDownloadTemplate() {
  const mod = $('import-module').value;
  const tmpl = IMPORT_TEMPLATES[mod];
  if (!tmpl) return;
  const csv = [tmpl.headers.join(','), tmpl.sample.join(',')].join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `template_${mod}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
}

function importPreview() {
  const file = $('import-file').files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const lines = e.target.result.split('\n').map(l=>l.trim()).filter(Boolean);
    if (lines.length < 2) { $('import-preview').innerHTML='<p style="color:var(--red);font-size:12px">File is empty or has no data rows.</p>'; return; }
    const headers = lines[0].split(',').map(h=>h.replace(/^"|"$/g,'').trim());
    _importRows = lines.slice(1).map(line => {
      const vals = line.split(',').map(v=>v.replace(/^"|"$/g,'').trim());
      const row = {};
      headers.forEach((h,i) => row[h] = vals[i]||'');
      return row;
    });
    // Preview table
    const preview = `
      <div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;max-height:220px;overflow-y:auto">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr>${headers.map(h=>`<th style="background:var(--surface);padding:6px 8px;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap">${h}</th>`).join('')}</tr></thead>
          <tbody>${_importRows.slice(0,10).map(row=>`<tr>${headers.map(h=>`<td style="padding:5px 8px;border-bottom:1px solid var(--border)">${row[h]||''}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
      <p style="font-size:11px;color:var(--text3);margin-top:6px">${_importRows.length} row${_importRows.length!==1?'s':''} ready to import${_importRows.length>10?' (showing first 10)':''}</p>`;
    $('import-preview').innerHTML = preview;
    $('import-save-btn').disabled = false;
  };
  reader.readAsText(file);
}

async function importSave() {
  const mod = $('import-module').value;
  if (!_importRows.length) return;
  showSaving(true);
  let success = 0, failed = 0;
  for (const row of _importRows) {
    try {
      if (mod === 'rc') {
        await BudgetAPI.createRC({
          date: row.date, authType: row.auth_type, authReference: row.auth_reference||'',
          payee: row.payee, particulars: row.particulars,
          fundCluster: row.fund_cluster, authCode: row.auth_code, fundCategory: row.fund_category,
          fullFundingSource: '', responsibilityCenter: row.responsibility_center,
          projectProgram: row.project_program, projectCategory: row.project_category||null,
          projectSubCategory: row.project_sub_category||null,
          activityLevels: row.activity_levels?[row.activity_levels]:[],
          expenseClasses: row.expense_classes?[row.expense_classes]:[],
          accountCodes: row.account_codes?[row.account_codes]:[], signatories:[]
        });
      } else if (mod === 'obligation') {
        const rcId = DATA.rc.find(r=>r.responsibility_center===row.rc_name)?.id||null;
        await BudgetAPI.createObligation({
          date:row.date, obrNumber:row.obr_number, obligationType:row.obligation_type,
          payee:row.payee, particulars:row.particulars,
          obligationIncurred:parseFloat(row.obligation_incurred)||0,
          accountCode:row.account_code||null, expenseClass:row.expense_class||null,
          activity:row.activity||null, rcId, quarter:fmt.qtr(row.date)
        });
      }
      success++;
    } catch(e) { failed++; }
  }
  showSaving(false);
  await loadAll(); renderAll();
  closeModal('importModal');
  toast(`Imported ${success} record${success!==1?'s':''}${failed?` (${failed} failed)`:''}`);
  _importRows = [];
}

// ══════════════════════════════════════════
// AUDIT TRAIL
// ══════════════════════════════════════════
async function auditLog(action, module, recordId, recordRef, summary) {
  try {
    await fetch(`${typeof API_BASE!=='undefined'?API_BASE:'http://localhost/budget_registry/api'}/audit.php`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({action, module, recordId, recordRef, summary})
    });
  } catch(e) { /* Non-blocking — never fail the main save */ }
}

// Convenience wrappers per module
const Audit = {
  rc:          (act,id,ref,sum) => auditLog(act,'RC',id,ref,sum),
  allotment:   (act,id,ref,sum) => auditLog(act,'Allotment',id,ref,sum),
  earmark:     (act,id,ref,sum) => auditLog(act,'Earmark',id,ref,sum),
  obligation:  (act,id,ref,sum) => auditLog(act,'Obligation',id,ref,sum),
  disbursement:(act,id,ref,sum) => auditLog(act,'Disbursement',id,ref,sum),
};

// ══════════════════════════════════════════
// PAGINATION
// ══════════════════════════════════════════
const PAGE_SIZE = 25;
const _pages = {rc:1, allotment:1, earmarked:1, ob:1, disbursement:1};

function mkPager(mod, totalRows, renderFn) {
  const total = Math.ceil(totalRows / PAGE_SIZE) || 1;
  const cur   = Math.min(_pages[mod], total);
  _pages[mod] = cur;
  if (total <= 1) return '';
  const pages = [];
  for (let i=1; i<=total; i++) {
    if (i===1||i===total||Math.abs(i-cur)<=1) pages.push(i);
    else if (pages[pages.length-1]!=='…') pages.push('…');
  }
  return `<div class="pager">
    <button class="pager-btn" ${cur===1?'disabled':''} onclick="_pages.${mod}=${cur-1};${renderFn}()">‹</button>
    ${pages.map(p=>p==='…'
      ?`<span class="pager-ellipsis">…</span>`
      :`<button class="pager-btn ${p===cur?'active':''}" onclick="_pages.${mod}=${p};${renderFn}()">${p}</button>`
    ).join('')}
    <button class="pager-btn" ${cur===total?'disabled':''} onclick="_pages.${mod}=${cur+1};${renderFn}()">›</button>
    <span class="pager-info">${((cur-1)*PAGE_SIZE)+1}–${Math.min(cur*PAGE_SIZE,totalRows)} of ${totalRows}</span>
  </div>`;
}

function paginateRows(rows, mod) {
  const cur = _pages[mod] || 1;
  return rows.slice((cur-1)*PAGE_SIZE, cur*PAGE_SIZE);
}

// ══════════════════════════════════════════
// MODALS & NAV
// ══════════════════════════════════════════
function openModal(id){
  $(id).classList.add('open');
  if (window._modalGuard) window._modalGuard.clearDirty(id);
}

// Called after a successful save — clears dirty flag so no discard prompt appears
function saveClose(id){
  if (window._modalGuard) window._modalGuard.clearDirty(id);
  if (window._modalGuard) window._modalGuard.forceClose(id);
  else $(id).classList.remove('open');
  if(id==='rcModal' && typeof _qaOpen !== 'undefined') _qaOpen.forEach(t => rcQuickClose(t));
  if((id==='earmarkModal'||id==='obligationModal') && typeof lockAllOverrideFields==='function'){
    lockAllOverrideFields();
  }
}

async function closeModal(id){
  if (window._modalGuard && window._modalGuard.isDataEntry(id) && window._modalGuard.isDirty(id)) {
    const ok = await window._modalGuard.confirmDiscard(id);
    if (!ok) return;
  }
  window._modalGuard ? window._modalGuard.forceClose(id) : $(id).classList.remove('open');
  // Close any open quick-add panels when RC modal closes
  if(id==='rcModal' && typeof _qaOpen !== 'undefined') _qaOpen.forEach(t => rcQuickClose(t));
  // Re-lock any unlocked override fields
  if((id==='earmarkModal'||id==='obligationModal') && typeof lockAllOverrideFields==='function'){
    lockAllOverrideFields();
  }
}
document.addEventListener('click', async e => {
  if (!e.target.classList.contains('modal-overlay')) return;
  if (!e.target.classList.contains('open')) return;
  const modalId = e.target.id;
  if (window._modalGuard && window._modalGuard.isDataEntry(modalId) && window._modalGuard.isDirty(modalId)) {
    const ok = await window._modalGuard.confirmDiscard(modalId);
    if (!ok) return;
  }
  window._modalGuard ? window._modalGuard.forceClose(modalId) : e.target.classList.remove('open');
});
function showSaving(v){$('savingIndicator').classList.toggle('show',v);}

const SECTION_NAMES={dashboard:'Dashboard',rc:'Responsibility Centers',allotment:'Allotments',earmarked:'Earmarked Funds',obligations:'Obligations',disbursement:'Disbursements',settings:'Reference Data',sysconfig:'System Settings',reports:'Reports'};
const SEC_MAP={dashboard:'sec-dashboard',rc:'sec-rc',allotment:'sec-allotment',earmarked:'sec-earmarked',obligations:'sec-obligations',disbursement:'sec-disbursement',settings:'sec-settings',sysconfig:'sec-sysconfig',reports:'sec-reports'};
function nav(key){
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  $('nav-'+key).classList.add('active');
  $(SEC_MAP[key]).classList.add('active');
  $('topbar-title').textContent=SECTION_NAMES[key];
  if(key==='sysconfig') setTimeout(refreshDBStats, 100);
  if(key==='reports')   setTimeout(rptRender, 50);
  if(key==='dashboard') setTimeout(dashRender, 50);
}

// ══════════════════════════════════════════

// LOAD DATA
// ══════════════════════════════════════════
async function loadAll(){
  const[rcs,allots,earmarks,obligs,disbs,refData]=await Promise.all([
    BudgetAPI.getRCs(),
    BudgetAPI.getAllotments(),
    BudgetAPI.getEarmarks(),
    BudgetAPI.getObligations(),
    BudgetAPI.getDisbursements(),
    BudgetAPI.getRefData().catch(()=>null), // graceful fallback if table not yet created
  ]);
  DATA.rc=rcs||[];
  DATA.allotment=allots||[];
  DATA.earmark=earmarks||[];
  DATA.obligation=obligs||[];
  DATA.disbursement=disbs||[];
  // Merge DB ref data into the live objects (DB overrides seeds)
  if(refData){
    applyRefData(refData);
  }
  // Merge RC activity_levels and account_codes into global lookup objects
  mergeRCActivities();
  // Rebuild all dynamic datalists from fresh data
  rebuildDataLists();
  // Refresh report filters if on reports tab
  rptPopulateFilters();
}

// Apply ref data fetched from DB into FUND_DATA / PROJECT_DATA / ACCOUNT_CODES / RC_ACTIVITIES
function applyRefData(refData){
  // Replace with DB version (DB is source of truth)
  if(refData.fundData && Object.keys(refData.fundData).length > 0){
    Object.keys(FUND_DATA).forEach(k=>delete FUND_DATA[k]);
    Object.assign(FUND_DATA, refData.fundData);
  }
  if(refData.projectData && Object.keys(refData.projectData).length > 0){
    Object.keys(PROJECT_DATA).forEach(k=>delete PROJECT_DATA[k]);
    Object.assign(PROJECT_DATA, refData.projectData);
  }
  if(refData.accountCodes){
    [1,2,3].forEach(n=>{
      if(refData.accountCodes[n] && refData.accountCodes[n].length > 0){
        ACCOUNT_CODES[n] = refData.accountCodes[n];
      }
    });
  }
  if(refData.rcActivities && Object.keys(refData.rcActivities).length > 0){
    Object.keys(RC_ACTIVITIES).forEach(k=>delete RC_ACTIVITIES[k]);
    Object.assign(RC_ACTIVITIES, refData.rcActivities);
  }
}

// After DATA is loaded, merge RC activity_levels into RC_ACTIVITIES
// so that activities registered directly on an RC are available system-wide
function mergeRCActivities(){
  DATA.rc.forEach(r=>{
    if(!r.responsibility_center) return;
    const acts = r.activity_levels || [];
    if(!RC_ACTIVITIES[r.responsibility_center]) RC_ACTIVITIES[r.responsibility_center] = [];
    acts.forEach(a=>{
      if(!RC_ACTIVITIES[r.responsibility_center].includes(a)){
        RC_ACTIVITIES[r.responsibility_center].push(a);
      }
    });
  });
  // Also merge account codes from RCs into ACCOUNT_CODES global
  DATA.rc.forEach(r=>{
    (r.account_codes||[]).forEach(code=>{
      const ecNum = [1,2,3].find(n=>(ACCOUNT_CODES[n]||[]).includes(code));
      if(!ecNum){
        // Unknown which EC — add to MOOE (2) as a reasonable default or skip
        // Better: check the code prefix
        const firstChar = code.charAt(0);
        const n = firstChar==='5' ? (
          code.startsWith('5-01') ? 1 :
          code.startsWith('5-02') ? 2 :
          code.startsWith('5-06') ? 3 : 2
        ) : null;
        if(n && !ACCOUNT_CODES[n].includes(code)) ACCOUNT_CODES[n].push(code);
      }
    });
  });
}

// ══════════════════════════════════════════

// STATS
// ══════════════════════════════════════════
function updateAll(){
  $('badge-rc').textContent=DATA.rc.length;$('badge-allotment').textContent=DATA.allotment.length;$('badge-earmarked').textContent=DATA.earmark.length;$('badge-obligations').textContent=DATA.obligation.length;$('badge-disbursement').textContent=DATA.disbursement.length;
  $('rc-total').textContent=DATA.rc.length;$('rc-gaa').textContent=DATA.rc.filter(r=>r.auth_type==='GAA').length;$('rc-saro').textContent=DATA.rc.filter(r=>r.auth_type==='SARO').length;$('rc-asa').textContent=DATA.rc.filter(r=>r.auth_type==='ASA').length;
  const sa=k=>DATA.allotment.reduce((s,a)=>s+(parseFloat(a[k])||0),0);
  $('al-authorized').textContent=fmt.cur(sa('authorized_appropriation'));$('al-adjusted').textContent=fmt.cur(sa('adjusted_appropriation'));$('al-allotted').textContent=fmt.cur(sa('allotment_received'));$('al-unreleased').textContent=fmt.cur(sa('unreleased_appropriation'));
  const emT=DATA.earmark.reduce((s,e)=>s+(parseFloat(e.total_amount)||0),0);
  const emFullyObl=DATA.earmark.filter(e=>e.is_obligated==1||e.is_obligated===true).length;
  const emPartial=DATA.earmark.filter(e=>!(e.is_obligated==1||e.is_obligated===true)&&(parseFloat(e.obligated_amount)||0)>0).length;
  $('em-total').textContent=fmt.cur(emT);
  $('em-count').textContent=DATA.earmark.length;
  $('em-free').textContent=DATA.earmark.filter(e=>!(e.is_obligated==1||e.is_obligated===true)&&!(parseFloat(e.obligated_amount)||0)).length;
  $('em-obligated').textContent=emFullyObl+emPartial;
  const obT=DATA.obligation.reduce((s,o)=>s+(parseFloat(o.obligation_incurred)||0),0);
  $('ob-total').textContent=fmt.cur(obT);$('ob-count').textContent=DATA.obligation.length;$('ob-creditor').textContent=DATA.obligation.filter(o=>o.obligation_type==='Creditor').length;$('ob-mandatory').textContent=DATA.obligation.filter(o=>o.obligation_type!=='Creditor').length;
  const dbT=DATA.disbursement.reduce((s,d)=>s+(parseFloat(d.total_disbursement)||0),0);const dbN=DATA.disbursement.reduce((s,d)=>s+(parseFloat(d.net_disbursement)||0),0);const dbTR=DATA.disbursement.reduce((s,d)=>s+(parseFloat(d.tra_amount)||0),0);
  $('db-total').textContent=fmt.cur(dbT);$('db-count').textContent=DATA.disbursement.length;$('db-net').textContent=fmt.cur(dbN);$('db-tra').textContent=fmt.cur(dbTR);
}

// ══════════════════════════════════════════

// CHIP CHECK SYNC
// ══════════════════════════════════════════
document.addEventListener('change',e=>{
  if(e.target.matches('.ac-chip input[type=checkbox]')){
    e.target.closest('.ac-chip').classList.toggle('checked',e.target.checked);
  }
});

// ══════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════
function exportData(type){
  const key={rc:'rc',allotment:'allotment',earmark:'earmark',obligation:'obligation',disbursement:'disbursement'}[type];
  const data=DATA[key]||[];
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`budget_${type}_${new Date().toISOString().split('T')[0]}.json`;a.click();URL.revokeObjectURL(a.href);
  toast(`${data.length} records exported`);
}


// ══════════════════════════════════════════

// ══════════════════════════════════════════

// DYNAMIC DATALISTS — rebuilt after every loadAll
// Ensures all saved data is available as suggestions
// in payee, RC name, and check number fields
// ══════════════════════════════════════════
function rebuildDataLists() {
  // ── Payee datalist — all unique payees from RC + Obligation records ──
  const payeeDL = $('dl_payee');
  if (payeeDL) {
    const payees = new Set();
    DATA.rc.forEach(r => { if (r.payee) payees.add(r.payee); });
    DATA.obligation.forEach(o => { if (o.payee) payees.add(o.payee); });
    payeeDL.innerHTML = [...payees].sort()
      .map(p => `<option value="${p.replace(/"/g,'&quot;')}">`)
      .join('');
  }

  // ── RC Name datalist — all saved RC names ────────────────────────────
  const rcDL = $('dl_rc');
  if (rcDL) {
    rcDL.innerHTML = DATA.rc
      .map(r => `<option value="${r.responsibility_center.replace(/"/g,'&quot;')}">`)
      .join('');
  }

  // ── Check number datalist — past check/LDDAP-ADA numbers ─────────────
  const checkDL = $('dl_check_number');
  if (checkDL) {
    const checks = new Set(DATA.disbursement.map(d => d.check_number).filter(Boolean));
    checkDL.innerHTML = [...checks].sort()
      .map(ch => `<option value="${ch.replace(/"/g,'&quot;')}">`)
      .join('');
  }

  // ── RC Section 2: rebuild fund cluster dropdown from live FUND_DATA ──
  // (called from openRCModal, but also ensure it runs after applyRefData)
  const fcSel = $('rc_fundCluster');
  if (fcSel) {
    const cv = fcSel.value;
    fcSel.innerHTML = '<option value="">Select Fund Cluster</option>';
    Object.entries(FUND_DATA).forEach(([k, v]) =>
      fcSel.innerHTML += `<option value="${k}">${k} – ${v.name}</option>`
    );
    if (cv) { fcSel.value = cv; rcUpdateAuthCodes(); }
  }
}

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  // ── Enable login button now that all scripts are loaded ──
  const loginBtn = $('loginBtn');
  if (loginBtn) {
    loginBtn.disabled = false;
    loginBtn.style.cursor = 'pointer';
    loginBtn.style.opacity = '1';
    loginBtn.textContent = 'Sign In';
  }
  // ── Also allow Enter key on password field ──
  const loginPass = $('loginPass');
  if (loginPass) loginPass.addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
  const loginUser = $('loginUser');
  if (loginUser) loginUser.addEventListener('keydown', e => { if(e.key==='Enter' && $('loginPass')) $('loginPass').focus(); });

  // ── Check existing session, then show login or boot ──
  try {
    const meRes = await fetch(`${API_BASE}/auth.php?action=me`,{credentials:'include',headers:{'X-Requested-With':'XMLHttpRequest'}});
    const meJson = await meRes.json();
    if (meJson.success) {
      _currentUser = meJson.data;
      $('loginOverlay').style.display = 'none';
      $('topbar-user').style.display  = 'flex';
      $('topbar-username').textContent = meJson.data.fullName || meJson.data.username;
      await bootApp(); return;
    }
    // else: show login overlay
  } catch(e) {
    // Auth server not available or network error — offline mode
    // Still show login briefly to confirm, then auto-proceed
    const lo = $('loginOverlay');
    if (lo) {
      // Show offline indicator on login screen
      const errEl = $('loginError');
      if (errEl) {
        errEl.style.display = '';
        errEl.style.background = 'var(--yellow-light)';
        errEl.style.borderColor = 'var(--yellow-mid)';
        errEl.style.color = 'var(--yellow)';
        errEl.textContent = '⚠️ Running in offline mode (auth server not found). Click Sign In to continue.';
      }
      // Auto-proceed after 1.5s if still on login screen
      setTimeout(() => {
        if (lo.style.display !== 'none') {
          lo.style.display = 'none';
          bootApp();
        }
      }, 1500);
    } else {
      await bootApp();
    }
  }
});

async function bootApp() {
  const now = new Date();
  $('topbar-date').textContent = `${MO[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
  populateProjectDD('rc_project');
  rcRebuildFundClusterDD();

  // ── Helper: immediately show the app (hides loader regardless) ──
  function showApp() {
    const loader = $('appLoader');
    loader.style.display = 'none'; // force hide even if .hide class fails
    loader.classList.add('hide');
  }

  // ── Helper: show DB status banner ──
  function setDBStatus(connected, label) {
    const dot = $('dbDot');
    dot.className = 'db-dot' + (connected ? ' connected' : ' error');
    $('dbStatusText').textContent = label;
  }

  // ── Try connecting with a short 3-second timeout ──
  try {
    $('loaderText').textContent = 'Connecting to database...';

    // Try ping first; if it fails but data loads anyway, still show as connected
    const pingResult = await Promise.race([
      BudgetAPI.ping(),
      new Promise(resolve => setTimeout(() => resolve(false), 3000))
    ]);

    // Always attempt to load data — even if ping fails (credentials mismatch can cause false negatives)
    $('loaderText').textContent = 'Loading records...';
    await loadAll();

    // If loadAll succeeded (no exception), DB is connected regardless of ping
    setDBStatus(true, 'MySQL Connected');
    renderAll();
    showApp();

    // Remove any leftover DB error banner
    const oldBanner = document.getElementById('db-banner');
    if (oldBanner) oldBanner.remove();

  } catch (err) {
    const isOffline = err.message === 'offline' || err.message.includes('fetch') || err.message.includes('network') || err.message.includes('Failed');
    setDBStatus(false, isOffline ? 'Offline Mode' : 'DB Error');
    renderAll(); // render empty tables so app is usable
    showApp();   // ALWAYS show the app — never stay stuck on loader

    // Show a dismissible banner instead of blocking the whole screen
    const banner = document.createElement('div');
    banner.id = 'db-banner';
    banner.style.cssText = 'position:fixed;top:52px;left:0;right:0;z-index:400;background:#fef3c7;border-bottom:1px solid #fde68a;padding:10px 20px;display:flex;align-items:center;gap:12px;font-size:13px;';
    banner.innerHTML = `
      <span style="font-size:16px">⚠️</span>
      <span style="color:#92400e;flex:1">
        <strong>Database not connected.</strong>
        ${isOffline
          ? ' Make sure XAMPP is running (Apache + MySQL), then <a href="http://localhost/budget_registry/" style="color:#2563eb;font-weight:600">open the correct URL</a> or '
          : ' '}
        <button onclick="location.reload()" style="background:#f59e0b;color:white;border:none;border-radius:5px;padding:3px 12px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit">Retry</button>
      </span>
      <button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;font-size:16px;color:#92400e;padding:0 4px;line-height:1">✕</button>
    `;
    document.body.appendChild(banner);
  }

}

