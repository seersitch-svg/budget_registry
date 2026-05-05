// ALLOTMENT CRUD
// ══════════════════════════════════════════
function populateAllotmentRCDD(){const s=$('al_rcId');const cv=s.value;s.innerHTML='<option value="">Select RC</option>';DATA.rc.forEach(r=>s.innerHTML+=`<option value="${r.id}">${r.responsibility_center}</option>`);if(cv)s.value=cv;}
function alLoadRC(){
  const rcId=$('al_rcId').value;
  const rc=getRCById(rcId);
  if(!rc){['al_cat2','al_cat3','al_cat4','al_cat5','al_cat6'].forEach(id=>$(id).style.display='none');return;}
  $('al_fundCluster').value=`${rc.fund_cluster} – ${FUND_DATA[rc.fund_cluster]?.name||''}`;
  $('al_authCode').value=rc.auth_code;
  $('al_fundCat').value=rc.fund_category;
  $('al_rcName').value=rc.responsibility_center;
  $('al_project').value=PROJECT_DATA[rc.project_program]?.name||rc.project_program||'';
  $('al_projectCat').value=rc.project_category||'';
  $('al_projectSub').value=rc.project_sub_category||'';
  $('al_activity').value=(rc.activity_levels||[]).join(', ');
  ['al_cat2','al_cat3','al_cat4','al_cat5','al_cat6'].forEach(id=>$(id).style.display='');
  // Reset S5/S6 selections when RC changes and re-render from RC data
  _alAC=[];_alAct=[];
  alRenderAC();
  alRenderAct();
  alCalc();
  alCheckBalance();
}
function alCalc(){
  const a=fmtVal($('al_authApp')),j=fmtVal($('al_adjust')),r=fmtVal($('al_received'));
  $('al_adjApp').value=fmt.num(a+j);
  $('al_unrel').value=fmt.num(a+j-r);
  $('al_perRC').value=fmt.num(a);
  alUpdateTotals();
  alCheckBalance();
}
let _alAC=[], _alAct=[];

// ── EC icon/color helpers ─────────────────────────────────────
const AL_EC_META = {
  1: {icon:'👤', cls:'ec-icon-1', label:'Personnel Services'},
  2: {icon:'🔧', cls:'ec-icon-2', label:'MOOE'},
  3: {icon:'🏗️', cls:'ec-icon-3', label:'Capital Outlay'},
};

// ── Section 5: Allotment per Account Code ─────────────────────
// Auto-populates from RC's registered expense classes & account codes
// grouped by expense class. User checks codes and enters amounts.
function alRenderAC() {
  const auth = parseFloat($('al_authApp').value) || 0;
  const rcId = $('al_rcId').value;
  const rc = getRCById(rcId);
  const list = $('al_acList');
  const empty = $('al_ac_empty');

  // Get RC-registered codes (from expense classes selected in RC form)
  const rcCodes  = rc?.account_codes   || [];
  const rcECs    = rc?.expense_classes || [];

  // Build the combined list: RC codes first (grouped), then custom entries
  // Group RC codes by expense class (1, 2, 3)
  const grouped = {1:[], 2:[], 3:[]};
  rcCodes.forEach(code => {
    const ecNum = [1,2,3].find(n => (ACCOUNT_CODES[n]||[]).includes(code));
    if (ecNum) grouped[ecNum].push(code);
    else grouped[1].push(code); // fallback to PS if not found in global list
  });

  // Ensure custom-added entries are preserved
  // Custom = entries in _alAC that are NOT in rcCodes
  const customEntries = _alAC.filter(e => e.custom);

  // Show empty hint if no RC codes AND no custom
  const hasRCCodes = rcCodes.length > 0;
  if (empty) empty.style.display = hasRCCodes || customEntries.length ? 'none' : '';

  if (!hasRCCodes && !customEntries.length) {
    list.innerHTML = '';
    alUpdateTotals();
    return;
  }

  let html = '';

  // Render grouped RC codes
  [1, 2, 3].forEach(n => {
    const codes = grouped[n];
    // Only show group if this expense class is registered in RC OR has codes
    const ecSelected = rcECs.some(e => e.startsWith(String(n)));
    if (!codes.length && !ecSelected) return;

    const meta = AL_EC_META[n];
    // Sum for this group from _alAC
    const groupSum = _alAC
      .filter(e => !e.custom && codes.includes(e.code))
      .reduce((s, e) => s + (e.amount || 0), 0);

    html += `<div class="al-ec-group">
      <div class="al-ec-group-head">
        <div class="ec-icon ${meta.cls}">${meta.icon}</div>
        <strong>${n} – ${meta.label}</strong>
        <span class="al-ec-sum">${groupSum > 0 ? fmt.cur(groupSum) : ''}</span>
      </div>
      <div class="al-ec-group-body">`;

    if (codes.length === 0) {
      html += `<div class="al-ac-row"><span style="font-size:12px;color:var(--text3);grid-column:1/-1;padding:4px 0">No account codes in this expense class. Add codes in the RC form.</span></div>`;
    } else {
      codes.forEach(code => {
        const entry = _alAC.find(e => e.code === code && !e.custom);
        const checked = !!entry;
        const amt = entry?.amount || '';
        html += `<div class="al-ac-row${!checked?' disabled':''}">
          <input type="checkbox" class="al-ac-check" ${checked?'checked':''}
            onchange="alToggleACCode('${code.replace(/'/g,"\\'")}', this.checked)">
          <span class="al-ac-label" title="${code}">${code}</span>
          <input type="text" inputmode="decimal" placeholder="0.00" class="al-ac-input" data-fmt="num" autocomplete="off"
            value="${amt?fmt.num(amt):''}" ${!checked?'disabled':''}
            oninput="alSetACAmount('${code.replace(/'/g,"\\'")}', fmt.parse(this.value))">
          <span></span>
        </div>`;
      });
    }
    html += `</div></div>`;
  });

  // Render custom entries (manually added via + Add Custom)
  if (customEntries.length) {
    html += `<div class="al-ec-group">
      <div class="al-ec-group-head">
        <div class="ec-icon" style="background:var(--purple-light);font-size:13px">✏️</div>
        <strong>Custom Entries</strong>
      </div>
      <div class="al-ec-group-body">`;
    customEntries.forEach((item, ci) => {
      const globalIdx = _alAC.indexOf(item);
      html += `<div class="al-ac-row">
        <span></span>
        <input type="text" class="al-ac-input" style="width:100%;font-family:var(--font)"
          placeholder="Account code / description" value="${item.code}"
          oninput="_alAC[${globalIdx}].code=this.value">
        <input type="text" inputmode="decimal" placeholder="0.00" class="al-ac-input"
          value="${item.amount||''}"
          data-fmt="num" autocomplete="off" oninput="_alAC[${globalIdx}].amount=fmt.parse(this.value);alUpdateTotals()">
        <button type="button" class="al-ac-del" onclick="_alAC.splice(${globalIdx},1);alRenderAC()">✕</button>
      </div>`;
    });
    html += `</div></div>`;
  }

  list.innerHTML = html;
  alUpdateTotals();
  setTimeout(()=>fmtWrapAll($('al_acList')),10);
}

// Toggle a RC-registered account code on/off
function alToggleACCode(code, checked) {
  if (checked) {
    if (!_alAC.find(e => e.code === code && !e.custom)) {
      _alAC.push({code, amount: 0, custom: false});
    }
  } else {
    const idx = _alAC.findIndex(e => e.code === code && !e.custom);
    if (idx > -1) _alAC.splice(idx, 1);
  }
  alRenderAC();
}

// Set amount for a RC-registered code
function alSetACAmount(code, amount) {
  const entry = _alAC.find(e => e.code === code && !e.custom);
  if (entry) entry.amount = amount;
  alUpdateTotals();
}

// Add a custom account code entry (not from RC)
function alAddAccountCode() {
  _alAC.push({code: '', amount: 0, custom: true});
  alRenderAC();
}

// ── Section 6: Allotment per Activity ─────────────────────────
// Auto-populates from RC's registered activity_levels.
function alRenderAct() {
  const auth  = parseFloat($('al_authApp').value) || 0;
  const rcId  = $('al_rcId').value;
  const rc    = getRCById(rcId);
  const list  = $('al_actList');
  const empty = $('al_act_empty');

  // RC activities: from rc.activity_levels (saved in DB) + fallback RC_ACTIVITIES map
  const dbActs       = rc?.activity_levels || [];
  const fallbackActs = RC_ACTIVITIES[rc?.responsibility_center] || [];
  const rcActs       = [...new Set([...dbActs, ...fallbackActs])];

  // Custom entries (manually added)
  const customEntries = _alAct.filter(e => e.custom);

  const hasRCActs = rcActs.length > 0;
  if (empty) empty.style.display = hasRCActs || customEntries.length ? 'none' : '';

  if (!hasRCActs && !customEntries.length) {
    list.innerHTML = '';
    alUpdateTotals();
    return;
  }

  let html = '';

  if (hasRCActs) {
    html += `<div class="al-ec-group">
      <div class="al-ec-group-head">
        <div class="ec-icon" style="background:var(--cyan-light);font-size:13px">📌</div>
        <strong>Registered Activities</strong>
        <span class="al-ec-sum" id="al_act_rcsum"></span>
      </div>
      <div class="al-ec-group-body">`;

    rcActs.forEach(act => {
      const entry = _alAct.find(e => e.activity === act && !e.custom);
      const checked = !!entry;
      const amt = entry?.amount || '';
      html += `<div class="al-act-row${!checked?' disabled':''}">
        <div class="al-act-label">
          <input type="checkbox" class="al-ac-check" ${checked?'checked':''}
            onchange="alToggleActivity('${act.replace(/'/g,"\\'")}', this.checked)"
            style="margin-right:4px">
          <span style="font-size:12px;color:var(--text)">${act}</span>
        </div>
        <input type="text" inputmode="decimal" placeholder="0.00" class="al-ac-input" data-fmt="num" autocomplete="off"
          value="${amt?fmt.num(amt):''}" ${!checked?'disabled':''}
          oninput="alSetActAmount('${act.replace(/'/g,"\\'")}', fmt.parse(this.value))">
        <span style="width:22px"></span>
      </div>`;
    });
    html += `</div></div>`;
  }

  // Custom activity entries
  if (customEntries.length) {
    html += `<div class="al-ec-group">
      <div class="al-ec-group-head">
        <div class="ec-icon" style="background:var(--purple-light);font-size:13px">✏️</div>
        <strong>Custom Activities</strong>
      </div>
      <div class="al-ec-group-body">`;
    customEntries.forEach(item => {
      const globalIdx = _alAct.indexOf(item);
      html += `<div class="al-act-row">
        <input type="text" class="al-ac-input" style="width:100%;font-family:var(--font)"
          placeholder="Activity name" value="${item.activity}"
          oninput="_alAct[${globalIdx}].activity=this.value">
        <input type="text" inputmode="decimal" placeholder="0.00" class="al-ac-input"
          value="${item.amount||''}"
          data-fmt="num" autocomplete="off" oninput="_alAct[${globalIdx}].amount=fmt.parse(this.value);alUpdateTotals()">
        <button type="button" class="al-ac-del" onclick="_alAct.splice(${globalIdx},1);alRenderAct()">✕</button>
      </div>`;
    });
    html += `</div></div>`;
  }

  list.innerHTML = html;
  alUpdateTotals();
  setTimeout(()=>fmtWrapAll($('al_actList')),10);
}

// Toggle a RC-registered activity on/off
function alToggleActivity(act, checked) {
  if (checked) {
    if (!_alAct.find(e => e.activity === act && !e.custom)) {
      _alAct.push({activity: act, amount: 0, custom: false});
    }
  } else {
    const idx = _alAct.findIndex(e => e.activity === act && !e.custom);
    if (idx > -1) _alAct.splice(idx, 1);
  }
  alRenderAct();
}

// Set amount for a RC-registered activity
function alSetActAmount(act, amount) {
  const entry = _alAct.find(e => e.activity === act && !e.custom);
  if (entry) entry.amount = amount;
  alUpdateTotals();
}

// Add a custom activity entry
function alAddActivity() {
  _alAct.push({activity: '', amount: 0, custom: true});
  alRenderAct();
}

// ── Totals ─────────────────────────────────────────────────────
function alUpdateTotals() {
  const auth = fmtVal($('al_authApp'));
  const acT  = _alAC.reduce((s, i) => s + (i.amount || 0), 0);
  const actT = _alAct.reduce((s, i) => s + (i.amount || 0), 0);
  const ab  = $('al_acTotal');
  const atb = $('al_actTotal');

  if (_alAC.length) {
    ab.style.display = '';
    const over = acT > auth;
    ab.textContent = `Total: ${fmt.cur(acT)} / Authorized: ${fmt.cur(auth)}${over?' ⚠ Exceeds authorization':''}`;
    ab.className = `total-box ${over ? 'tb-red' : acT === auth ? 'tb-green' : 'tb-yellow'}`;
  } else {
    ab.style.display = 'none';
  }

  if (_alAct.length) {
    atb.style.display = '';
    const over = actT > auth;
    atb.textContent = `Total: ${fmt.cur(actT)} / Authorized: ${fmt.cur(auth)}${over?' ⚠ Exceeds authorization':''}`;
    atb.className = `total-box ${over ? 'tb-red' : actT === auth ? 'tb-green' : 'tb-yellow'}`;
  } else {
    atb.style.display = 'none';
  }

  // Update group sums
  [1,2,3].forEach(n => {
    const codes = (ACCOUNT_CODES[n]||[]);
    const sum = _alAC.filter(e=>!e.custom && codes.includes(e.code)).reduce((s,e)=>s+(e.amount||0),0);
    // Update header sum display (re-rendered on next alRenderAC call — totals box is sufficient)
  });
}
function openAllotmentModal(){
  document.getElementById('allotmentForm').reset();
  $('al_editId').value='';
  $('alModalTitle').textContent='Add Allotment';
  _alAC=[];_alAct=[];
  $('al_acList').innerHTML='';
  $('al_actList').innerHTML='';
  ['al_cat2','al_cat3','al_cat4','al_cat5','al_cat6','al_acTotal','al_actTotal'].forEach(id=>$(id).style.display='none');
  const albb=$('al_balance_bar');if(albb)albb.style.display='none';
  const emp1=$('al_ac_empty'); if(emp1) emp1.style.display='none';
  const emp2=$('al_act_empty'); if(emp2) emp2.style.display='none';
  populateAllotmentRCDD();
  openModal('allotmentModal');
  setTimeout(()=>{
    fmtWrapAll($('allotmentModal'));
    // Init adjustment field to 0 (form reset clears it)
    const adj=$('al_adjust'); if(adj && !adj.value) adj.value='0';
  },50);
}
function editAllotment(id){
  const a=DATA.allotment.find(x=>x.id==id);
  if(!a)return;
  openAllotmentModal();
  $('alModalTitle').textContent='Edit Allotment';
  $('al_editId').value=id;
  $('al_rcId').value=a.rc_id;
  // Load RC display fields first without resetting _alAC/_alAct
  const rc=getRCById(a.rc_id);
  if(rc){
    $('al_fundCluster').value=`${rc.fund_cluster} – ${FUND_DATA[rc.fund_cluster]?.name||''}`;
    $('al_authCode').value=rc.auth_code;
    $('al_fundCat').value=rc.fund_category;
    $('al_rcName').value=rc.responsibility_center;
    $('al_project').value=PROJECT_DATA[rc.project_program]?.name||rc.project_program||'';
    $('al_projectCat').value=rc.project_category||'';
    $('al_projectSub').value=rc.project_sub_category||'';
    $('al_activity').value=(rc.activity_levels||[]).join(', ');
    ['al_cat2','al_cat3','al_cat4','al_cat5','al_cat6'].forEach(id=>$(id).style.display='');
  }
  setFmtInput($('al_authApp'),a.authorized_appropriation);
  setFmtInput($('al_adjust'), a.adjustment === 0 || a.adjustment === '0' || !a.adjustment ? 0 : a.adjustment);
  setFmtInput($('al_received'),a.allotment_received);alCalc();
  // Restore saved allocations preserving custom flag
  const rcCodes=rc?.account_codes||[];
  _alAC=(a.account_allocations||[]).map(e=>({
    code:e.code, amount:e.amount||0,
    custom: e.custom!==undefined ? e.custom : !rcCodes.includes(e.code)
  }));
  const rcActs=[...(rc?.activity_levels||[]),...(RC_ACTIVITIES[rc?.responsibility_center]||[])];
  const rcActSet=new Set(rcActs);
  _alAct=(a.activity_allocations||[]).map(e=>({
    activity:e.activity, amount:e.amount||0,
    custom: e.custom!==undefined ? e.custom : !rcActSet.has(e.activity)
  }));
  alRenderAC();
  alRenderAct();
  // Wrap dynamic amount inputs for live comma formatting
  setTimeout(()=>{
    fmtWrapAll($('allotmentModal'));
    alCheckBalance();
  },60);
}

async function saveAllotment(e){
  e.preventDefault();showSaving(true);
  const f=document.getElementById('allotmentForm');const fd=new FormData(f);const editId=$('al_editId').value;const rcId=parseInt(fd.get('rcId'));
  const rc=getRCById(rcId);if(!rc){toast('Please select an RC','error');showSaving(false);return;}
  const auth=fmt.parse($('al_authApp').value);
  if(auth<=0){toast('Authorized appropriation must be greater than zero','error');showSaving(false);return;}
  const adj=fmt.parse($('al_adjust').value),rec=fmt.parse($('al_received').value);
  if(rec<0){toast('Allotment received cannot be negative','error');showSaving(false);return;}
  // Balance check: allotment cannot be less than existing earmarks + obligations
  {
    const editId2=$('al_editId').value;
    // Use rec as the new allotment_received, check against existing earmarks + obligations
    const totalEarmarked=DATA.earmark.filter(em=>em.rc_id==rcId).reduce((s,em)=>s+(parseFloat(em.total_amount)||0),0);
    const totalObligated=DATA.obligation.filter(ob=>ob.rc_id==rcId).reduce((s,ob)=>s+(parseFloat(ob.obligation_incurred)||0),0);
    const usage=totalEarmarked+totalObligated;
    const projectedBal=rec-usage;
    if(usage>0 && projectedBal<0){
      const ok=await confirm2(
        'Allotment Insufficient',
        `The Allotment Received (${fmt.cur(rec)}) is less than existing usage:\n\nTotal Earmarked: ${fmt.cur(totalEarmarked)}\nTotal Obligated: ${fmt.cur(totalObligated)}\nTotal Usage:     ${fmt.cur(usage)}\nShortfall:       ${fmt.cur(Math.abs(projectedBal))}\n\nThis would result in a negative balance. Proceed anyway?`
      );
      if(!ok){showSaving(false);return;}
    }
  }
  const data={rcId,fundCluster:rc.fund_cluster,authCode:rc.auth_code,fundCategory:rc.fund_category,rcName:rc.responsibility_center,projectProgram:rc.project_program,authorizedAppropriation:auth,adjustment:adj,adjustedAppropriation:auth+adj,allotmentReceived:rec,unreleasedAppropriation:auth+adj-rec,accountAllocations:JSON.parse(JSON.stringify(_alAC)),activityAllocations:JSON.parse(JSON.stringify(_alAct))};
  try{if(editId){await BudgetAPI.updateAllotment(editId,data);toast('Allotment updated');}else{await BudgetAPI.createAllotment(data);toast('Allotment created');}await loadAll();saveClose('allotmentModal');renderAll();}
  catch(err){toast(err.message,'error');}finally{showSaving(false);}
}

async function deleteAllotment(id){
  const a=DATA.allotment.find(x=>x.id==id);if(!a)return;
  const rc=getRCById(a.rc_id);const ok=await confirm2('Delete Allotment',`Delete allotment for "${rc?.responsibility_center||'RC'}"?`);
  if(!ok)return;
  try{showSaving(true);await BudgetAPI.deleteAllotment(id);await loadAll();renderAll();toast('Allotment deleted','error');}catch(err){toast(err.message,'error');}finally{showSaving(false);}
}

// ══════════════════════════════════════════
