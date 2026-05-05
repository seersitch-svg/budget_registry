// RC FORM HELPERS
// ══════════════════════════════════════════

// ── Helper: build a <select> from an object {code: name} ───────
function _buildOrgSelect(selId, data, placeholder) {
  const s = $(selId);
  if (!s) return;
  const cv = s.value;
  s.innerHTML = `<option value="">${placeholder}</option>`;
  Object.entries(data).forEach(([code, name]) => {
    s.innerHTML += `<option value="${code}">${code} – ${name}</option>`;
  });
  if (cv) s.value = cv;
}

// ── Fund Cluster changed → update Financing Source + Auth Codes ─
function rcUpdateFundCluster() {
  const fc = $('rc_fundCluster').value;
  const fsEl = $('rc_financingSource');
  if (fsEl) {
    const cv = fsEl.value;
    fsEl.innerHTML = '<option value="">Select Financing Source</option>';
    // Populate from ORG_UNITS.financingSource (code → name)
    if (typeof ORG_UNITS !== 'undefined' && ORG_UNITS.financingSource) {
      Object.entries(ORG_UNITS.financingSource).forEach(([code, name]) => {
        fsEl.innerHTML += `<option value="${code}">${code} – ${name}</option>`;
      });
    }
    // Also add the fund cluster's own name as a fallback option if not already listed
    if (fc && FUND_DATA[fc] && FUND_DATA[fc].name) {
      const fname = FUND_DATA[fc].name;
      if (!Array.from(fsEl.options).find(o => o.value === fname)) {
        fsEl.innerHTML += `<option value="${fname}">${fname}</option>`;
      }
    }
    if (cv) fsEl.value = cv;
  }
  rcUpdateAuthCodes();
}

// ── Rebuild Financing Source dropdown (called after quick-add) ─
function rcRebuildFinancingSourceDD(selectValue) {
  const fsEl = $('rc_financingSource');
  if (!fsEl) return;
  const cv = selectValue || fsEl.value;
  fsEl.innerHTML = '<option value="">Select Financing Source</option>';
  if (typeof ORG_UNITS !== 'undefined' && ORG_UNITS.financingSource) {
    Object.entries(ORG_UNITS.financingSource).forEach(([code, name]) => {
      fsEl.innerHTML += `<option value="${code}">${code} – ${name}</option>`;
    });
  }
  const fc = $('rc_fundCluster')?.value;
  if (fc && FUND_DATA[fc]?.name) {
    const fname = FUND_DATA[fc].name;
    if (!Array.from(fsEl.options).find(o => o.value === fname)) {
      fsEl.innerHTML += `<option value="${fname}">${fname}</option>`;
    }
  }
  if (cv) fsEl.value = cv;
}

function rcHandleAuthType(){const t=$('rc_authType').value;$('rc_saroField').style.display=t==='SARO'?'':'none';$('rc_asaField').style.display=t==='ASA'?'':'none';}
function rcUpdateAuthCodes(){const c=$('rc_fundCluster').value;const s=$('rc_authCode');s.innerHTML='<option value="">Select Auth Code</option>';if(c&&FUND_DATA[c])Object.entries(FUND_DATA[c].authCodes).forEach(([k,v])=>s.innerHTML+=`<option value="${k}">${k} – ${v.name}</option>`);rcUpdateFundCats();}
function rcUpdateFundCats(){const c=$('rc_fundCluster').value,a=$('rc_authCode').value;const s=$('rc_fundCategory');s.innerHTML='<option value="">Select Fund Category</option>';if(c&&a&&FUND_DATA[c]?.authCodes[a])Object.entries(FUND_DATA[c].authCodes[a].cats).forEach(([k,v])=>s.innerHTML+=`<option value="${k}">${k} – ${v}</option>`);rcUpdateFullFunding();}
function rcUpdateFullFunding(){const cat=$('rc_fundCategory').value;$('rc_fullFunding').value=cat?cat.substring(1):'';}
function rcUpdateProjectCats(){const p=$('rc_project').value;const s=$('rc_projectCat');s.innerHTML='<option value="">Select Category</option>';if(p&&PROJECT_DATA[p])Object.entries(PROJECT_DATA[p].cats).forEach(([k,v])=>s.innerHTML+=`<option value="${k}">${v.name||k}</option>`);rcUpdateProjectSubs();}
function rcUpdateProjectSubs(){const p=$('rc_project').value,c=$('rc_projectCat').value;const s=$('rc_projectSub');s.innerHTML='<option value="">Select Sub-Category</option>';if(p&&c&&PROJECT_DATA[p]?.cats[c])Object.entries(PROJECT_DATA[p].cats[c].subs||{}).forEach(([k,v])=>s.innerHTML+=`<option value="${k}">${k} – ${v}</option>`);}
function rcUpdateActivities(){const rc=$('rc_rcName').value;const s=$('rc_activity');s.innerHTML='';(RC_ACTIVITIES[rc]||[]).forEach(a=>s.innerHTML+=`<option value="${a}">${a}</option>`);}

// ── Org Unit cascading dropdowns ─────────────────────────────
function rcPopulateDeptCodes() {
  _buildOrgSelect('rc_deptCode', ORG_UNITS.dept, 'Select Department Code');
}
function rcUpdateAgencyCodes() {
  _buildOrgSelect('rc_agencyCode', ORG_UNITS.agency, 'Select Agency Code');
}
function rcUpdateOperatingUnits() {
  _buildOrgSelect('rc_operatingUnit', ORG_UNITS.operatingUnit, 'Select Operating Unit');
}
function rcUpdateLowerUnits() {
  _buildOrgSelect('rc_lowerUnit', ORG_UNITS.lowerUnit, 'Select Lower Level Unit');
}

// ── Modern EC card toggle ──
function toggleEC(num){
  const card=$('ec_card_'+num);
  const chk=$('ec_chk_'+num);
  const isSelected=card.classList.contains('selected');
  if(isSelected){
    card.classList.remove('selected');
    chk.checked=false;
    ecCloseAddPanel(num);
  } else {
    card.classList.add('selected');
    chk.checked=true;
    renderACList(num);
  }
  ecUpdateBadge(num);
}

function ecUpdateBadge(num){
  const list=$('ac_list_'+num);
  const total=ACCOUNT_CODES[num]?.length||0;
  const checked=list.querySelectorAll('input[type=checkbox]:checked').length;
  const badge=$('ec_badge_'+num);
  badge.textContent=checked>0
    ? `${checked} of ${total} selected`
    : total>0 ? `${total} available` : '0 codes';
  const emptyHint=$('ec_empty_'+num);
  if(emptyHint) emptyHint.style.display=total===0?'':'none';
}

function renderACList(num){
  const codes=ACCOUNT_CODES[num]||[];
  const grid=$('ac_list_'+num);
  if(codes.length===0){
    grid.innerHTML='';
    ecUpdateBadge(num);
    return;
  }
  const prevChecked=new Set(
    Array.from(grid.querySelectorAll('input[type=checkbox]:checked')).map(cb=>cb.value)
  );
  grid.innerHTML=codes.map((c,i)=>{
    const isChecked=prevChecked.has(c);
    return `<label class="ac-chip${isChecked?' checked':''}" onclick="setTimeout(()=>ecUpdateBadge(${num}),0)">
      <input type="checkbox" name="ac_${num}" value="${c}"${isChecked?' checked':''}>
      <span title="${c}">${c}</span>
      <button type="button" class="ac-chip-del" onclick="ecDeleteCode(${num},${i},event)" title="Remove code">✕</button>
    </label>`;
  }).join('');
  ecUpdateBadge(num);
}

function ecToggleAddPanel(num, evt){
  if(evt) evt.stopPropagation();
  const panel=$('ec_qa_'+num);
  const isOpen=panel.style.display!=='none';
  [1,2,3].forEach(n=>{ if(n!==num) ecCloseAddPanel(n); });
  if(isOpen){ ecCloseAddPanel(num); }
  else {
    panel.style.display='';
    const codeInput=$('ec_qa_code_'+num);
    if(codeInput) setTimeout(()=>codeInput.focus(),50);
  }
}

function ecCloseAddPanel(num){
  const panel=$('ec_qa_'+num);
  if(panel){ panel.style.display='none'; }
  const ci=$('ec_qa_code_'+num);
  const di=$('ec_qa_desc_'+num);
  if(ci) ci.value='';
  if(di) di.value='';
}

function ecQuickAddSave(num){
  const codeEl=$('ec_qa_code_'+num);
  const descEl=$('ec_qa_desc_'+num);
  const code=(codeEl?.value||'').trim();
  const desc=(descEl?.value||'').trim();
  if(!code){ toast('Account code is required','error'); codeEl?.focus(); return; }
  const fullEntry=desc ? `${code} – ${desc}` : code;
  if(ACCOUNT_CODES[num].includes(fullEntry)){
    toast('This code already exists','error'); codeEl?.focus(); return;
  }
  const codePrefix=code.split('–')[0].trim().toLowerCase();
  const dupPrefix=ACCOUNT_CODES[num].some(c=>c.split('–')[0].trim().toLowerCase()===codePrefix);
  if(dupPrefix){ toast('A code with this number already exists','error'); codeEl?.focus(); return; }
  ACCOUNT_CODES[num].push(fullEntry);
  renderACList(num);
  ecUpdateBadge(num);
  ecCloseAddPanel(num);
  toast(`Code "${fullEntry}" added`);
  persistRefType('account_code');
  setTimeout(()=>{
    const newCb=$('ac_list_'+num).querySelector(`input[value="${CSS.escape(fullEntry)}"]`);
    if(newCb){ newCb.checked=true; newCb.closest('.ac-chip').classList.add('checked'); ecUpdateBadge(num); }
  },30);
  if(typeof renderRefAccountCodes==='function') renderRefAccountCodes();
}

async function ecDeleteCode(num, idx, evt){
  if(evt){ evt.preventDefault(); evt.stopPropagation(); }
  const code=ACCOUNT_CODES[num][idx];
  const ok=await confirm2('Remove Account Code',`Remove "${code}" from the list?\n\nThis will uncheck it from this form and remove it from the global list.`);
  if(!ok) return;
  ACCOUNT_CODES[num].splice(idx,1);
  renderACList(num);
  ecUpdateBadge(num);
  if(typeof renderRefAccountCodes==='function') renderRefAccountCodes();
  toast('Code removed','error');
  persistRefType('account_code');
}

function addAccountCode(num){
  if(!$('ec_card_'+num).classList.contains('selected')){
    $('ec_card_'+num).classList.add('selected');
    $('ec_chk_'+num).checked=true;
    renderACList(num);
  }
  ecToggleAddPanel(num, null);
}

document.addEventListener('keydown', e=>{
  if(e.key==='Escape'){
    [1,2,3].forEach(n=>ecCloseAddPanel(n));
    return;
  }
  if(e.key==='Enter' && e.target.classList.contains('qa-input') && e.target.id?.startsWith('ec_qa_')){
    e.preventDefault();
    const num=parseInt(e.target.id.split('_').pop());
    if(num) ecQuickAddSave(num);
  }
});

function populateProjectDD(selId){
  const s=$(selId);const cv=s.value;
  s.innerHTML='<option value="">Select Project</option>';
  Object.entries(PROJECT_DATA).forEach(([k,v])=>s.innerHTML+=`<option value="${k}">${k} – ${v.name}</option>`);
  if(cv)s.value=cv;
}

// ══════════════════════════════════════════
// RC CRUD
// ══════════════════════════════════════════
function openRCModal(){
  document.getElementById('rcForm').reset();
  $('rc_editId').value='';$('rcModalTitle').textContent='Add Responsibility Center';
  $('rc_date').value=new Date().toISOString().split('T')[0];
  $('rc_saroField').style.display='none';$('rc_asaField').style.display='none';
  // Clear any validation highlights
  ['rc_date','rc_authType','rc_payee','rc_particulars','rc_fundCluster','rc_financingSource',
   'rc_authCode','rc_fundCategory','rc_rcName','rc_project'].forEach(id=>{
    const el=$(id);if(el){el.style.borderColor='';el.style.boxShadow='';}
  });
  [1,2,3].forEach(n=>{
    $('ec_card_'+n).classList.remove('selected');
    $('ec_chk_'+n).checked=false;
    ecCloseAddPanel(n);
    const grid=$('ac_list_'+n); if(grid) grid.innerHTML='';
    ecUpdateBadge(n);
  });
  _rcSignatories=[];
  rcRenderSignatories();
  rcRebuildFundClusterDD();
  rcRebuildFinancingSourceDD();
  populateProjectDD('rc_project');
  // Populate org unit dropdowns
  rcPopulateDeptCodes();
  rcUpdateAgencyCodes();
  rcUpdateOperatingUnits();
  rcUpdateLowerUnits();
  openModal('rcModal');
}

function editRC(id){
  const r=DATA.rc.find(x=>x.id==id);if(!r)return;
  openRCModal();
  $('rcModalTitle').textContent='Edit Responsibility Center';
  $('rc_editId').value=id;

  // ── Section 1 ──────────────────────────────────────────────
  $('rc_date').value=r.date;
  $('rc_authType').value=r.auth_type;
  rcHandleAuthType();
  if(r.auth_type==='SARO') $('rc_saroNum').value=r.auth_reference||'';
  if(r.auth_type==='ASA')  $('rc_asaNum').value=r.auth_reference||'';
  $('rc_payee').value=r.payee;
  $('rc_particulars').value=r.particulars||'';

  // ── Section 2: Fund Source ─────────────────────────────────
  $('rc_fundCluster').value=r.fund_cluster;
  rcUpdateFundCluster(); // populates financing source + auth codes
  rcRebuildFinancingSourceDD(r.financing_source||'');
  $('rc_financingSource').value=r.financing_source||'';
  $('rc_authCode').value=r.auth_code;
  rcUpdateFundCats();
  $('rc_fundCategory').value=r.fund_category;
  rcUpdateFullFunding();

  // Org unit fields
  $('rc_deptCode').value=r.dept_code||'';
  $('rc_agencyCode').value=r.agency_code||'';
  $('rc_operatingUnit').value=r.operating_unit||'';
  $('rc_lowerUnit').value=r.lower_unit||'';
  $('rc_rcName').value=r.responsibility_center;

  // ── Section 3: Project ─────────────────────────────────────
  populateProjectDD('rc_project');
  $('rc_project').value=r.project_program;
  rcUpdateProjectCats();
  $('rc_projectCat').value=r.project_category||'';
  rcUpdateProjectSubs();
  $('rc_projectSub').value=r.project_sub_category||'';

  rcUpdateActivities();
  setTimeout(()=>{
    const actSel=$('rc_activity');
    const savedActs=r.activity_levels||[];
    savedActs.forEach(a=>{
      let opt=Array.from(actSel.options).find(o=>o.value===a);
      if(!opt){ opt=document.createElement('option');opt.value=a;opt.text=a;actSel.appendChild(opt); }
      opt.selected=true;
    });
  },100);

  // ── Section 4: Expense Classes & Account Codes ─────────────
  [1,2,3].forEach(num=>{
    const hasEC=(r.expense_classes||[]).some(e=>e.startsWith(String(num)));
    if(hasEC){
      $('ec_card_'+num).classList.add('selected');
      $('ec_chk_'+num).checked=true;
      renderACList(num);
    }
    setTimeout(()=>{
      const savedCodes=(r.account_codes||[]);
      savedCodes.forEach(code=>{
        if(!ACCOUNT_CODES[num].includes(code)){
          ACCOUNT_CODES[num].push(code);
          renderACList(num);
        }
        const cb=$('ac_list_'+num).querySelector(`input[value="${code}"]`);
        if(cb){
          cb.checked=true;
          cb.closest('.ac-chip')?.classList.add('checked');
        }
      });
      ecUpdateBadge(num);
    },150);
  });

  // ── Section 5: Signatories ─────────────────────────────────
  _rcSignatories=[];
  (r.signatories||[]).forEach(s=>rcAddSignatory(s));
}

async function saveRC(e){
  e.preventDefault();showSaving(false);
  const f=document.getElementById('rcForm');const fd=new FormData(f);const editId=$('rc_editId').value;
  const authType=fd.get('authType');
  const authRef=authType==='SARO'?fd.get('saroNumber')||'':authType==='ASA'?fd.get('asaNumber')||'':'';

  // ── Required field validation with inline warnings ─────────
  const errs = [];
  const _mark = (id, msg) => {
    const el = $(id);
    if(el) { el.style.borderColor = 'var(--red)'; el.style.boxShadow = '0 0 0 3px rgba(220,38,38,.1)'; }
    errs.push(msg);
  };
  const _clear = id => {
    const el = $(id);
    if(el) { el.style.borderColor = ''; el.style.boxShadow = ''; }
  };

  // Clear previous marks
  ['rc_date','rc_authType','rc_payee','rc_particulars','rc_fundCluster','rc_financingSource',
   'rc_authCode','rc_fundCategory','rc_rcName','rc_project'].forEach(_clear);

  if(!fd.get('date'))               _mark('rc_date',           'Date is required');
  if(!authType)                     _mark('rc_authType',        'Authorization type is required');
  if(authType==='SARO'&&!authRef.trim()) _mark('rc_saroNum',   'SARO Number is required');
  if(authType==='ASA'&&!authRef.trim())  _mark('rc_asaNum',    'ASA Number is required');
  if(!fd.get('payee')?.trim())      _mark('rc_payee',          'Payee is required');
  if(!fd.get('particulars')?.trim()) _mark('rc_particulars',   'Particulars are required');
  if(!fd.get('fundCluster'))        _mark('rc_fundCluster',     'Fund Cluster is required');
  if(!fd.get('financingSource'))    _mark('rc_financingSource', 'Financing Source is required');
  if(!fd.get('authCode'))           _mark('rc_authCode',        'Authorization Code is required');
  if(!fd.get('fundCategory'))       _mark('rc_fundCategory',    'Fund Category is required');
  if(!fd.get('responsibilityCenter')?.trim()) _mark('rc_rcName','Responsibility Center Name is required');
  if(!fd.get('projectProgram'))     _mark('rc_project',         'Project/Program is required');

  if(errs.length) {
    toast(errs[0], 'error');
    showSaving(false);
    return;
  }

  showSaving(true);
  const expClasses=[];[1,2,3].forEach(n=>{if($('ec_chk_'+n).checked)expClasses.push($('ec_chk_'+n).value);});
  const accountCodes=[];[1,2,3].forEach(n=>{$('ac_list_'+n).querySelectorAll('input[type=checkbox]:checked').forEach(cb=>accountCodes.push(cb.value));});
  const activities=Array.from($('rc_activity').selectedOptions).map(o=>o.value);
  const rcName=fd.get('responsibilityCenter');
  const fundCluster=fd.get('fundCluster');
  const financingSource=fd.get('financingSource')||'';
  const authCode=fd.get('authCode');
  const fundCategory=fd.get('fundCategory');
  const projectProgram=fd.get('projectProgram');
  const projectCategory=fd.get('projectCategory')||null;
  const projectSubCategory=fd.get('projectSubCategory')||null;
  const deptCode=fd.get('deptCode')||null;
  const agencyCode=fd.get('agencyCode')||null;
  const operatingUnit=fd.get('operatingUnit')||null;
  const lowerUnit=fd.get('lowerUnit')||null;

  const data={
    date:fd.get('date'),authType,authReference:authRef,payee:fd.get('payee'),
    particulars:fd.get('particulars'),fundCluster,financingSource,authCode,fundCategory,
    fullFundingSource:fd.get('fullFundingSource'),
    deptCode,agencyCode,operatingUnit,lowerUnit,
    responsibilityCenter:rcName,
    projectProgram,projectCategory,projectSubCategory,
    activityLevels:activities,expenseClasses:expClasses,accountCodes,
    signatories:rcGetSignatories()
  };

  try{
    if(editId){await BudgetAPI.updateRC(editId,data);toast('RC updated');}
    else{await BudgetAPI.createRC(data);toast('RC created');}

    await rcSyncRefData({
      rcName, fundCluster, financingSource, authCode, fundCategory,
      projectProgram, projectCategory, projectSubCategory,
      activities, accountCodes, expClasses,
      deptCode, agencyCode, operatingUnit, lowerUnit
    });

    await loadAll();
    if(typeof rebuildRCDropdowns==='function') rebuildRCDropdowns();
    saveClose('rcModal');
    renderAll();
  }
  catch(err){toast(err.message,'error');}
  finally{showSaving(false);}
}

async function rcSyncRefData({rcName, fundCluster, financingSource, authCode, fundCategory,
  projectProgram, projectCategory, projectSubCategory,
  activities, accountCodes, expClasses,
  deptCode, agencyCode, operatingUnit, lowerUnit}){

  let changed = false;
  const optText = (selId, val) => {
    const sel = $(selId);
    if(!sel) return val;
    const opt = Array.from(sel.options).find(o => o.value === val);
    return opt ? opt.text.replace(/^[^ ]+ – /, '') : val;
  };

  // ── Fund Cluster ───────────────────────────────────────────
  if(fundCluster && !FUND_DATA[fundCluster]){
    const fcName = optText('rc_fundCluster', fundCluster);
    FUND_DATA[fundCluster] = {name: financingSource || fcName, authCodes: {}};
    changed = true;
  } else if(fundCluster && financingSource && FUND_DATA[fundCluster]) {
    // Update the financing source name if user changed it
    if(FUND_DATA[fundCluster].name !== financingSource){
      FUND_DATA[fundCluster].name = financingSource;
      changed = true;
    }
  }

  // ── Financing Source: store in ORG_UNITS for dropdown persistence ─
  if(financingSource) {
    if(!ORG_UNITS.financingSource) ORG_UNITS.financingSource = {};
    // financingSource value may be the code or the name
    if(!ORG_UNITS.financingSource[financingSource]) {
      ORG_UNITS.financingSource[financingSource] = financingSource;
      changed = true;
    }
  }

  // ── Authorization Code ─────────────────────────────────────
  if(fundCluster && authCode && FUND_DATA[fundCluster]){
    if(!FUND_DATA[fundCluster].authCodes[authCode]){
      const acName = optText('rc_authCode', authCode);
      FUND_DATA[fundCluster].authCodes[authCode] = {name: acName, cats: {}};
      changed = true;
    }
    if(fundCategory){
      const ac = FUND_DATA[fundCluster].authCodes[authCode];
      if(!ac.cats[fundCategory]){
        const catName = optText('rc_fundCategory', fundCategory);
        ac.cats[fundCategory] = catName;
        changed = true;
      }
    }
  }

  // ── Project / Program ──────────────────────────────────────
  if(projectProgram && !PROJECT_DATA[projectProgram]){
    const projName = optText('rc_project', projectProgram);
    PROJECT_DATA[projectProgram] = {name: projName, cats: {}};
    changed = true;
  }
  if(projectProgram && projectCategory && PROJECT_DATA[projectProgram]){
    if(!PROJECT_DATA[projectProgram].cats[projectCategory]){
      const catName = optText('rc_projectCat', projectCategory);
      PROJECT_DATA[projectProgram].cats[projectCategory] = {name: catName, subs: {}};
      changed = true;
    }
    if(projectSubCategory){
      const cat = PROJECT_DATA[projectProgram].cats[projectCategory];
      if(cat && !cat.subs[projectSubCategory]){
        const subName = optText('rc_projectSub', projectSubCategory);
        cat.subs[projectSubCategory] = subName;
        changed = true;
      }
    }
  }

  // ── Org Unit fields → persist to ORG_UNITS ────────────────
  const orgChanges = [
    ['dept',          deptCode,       $('rc_deptCode')],
    ['agency',        agencyCode,     $('rc_agencyCode')],
    ['operatingUnit', operatingUnit,  $('rc_operatingUnit')],
    ['lowerUnit',     lowerUnit,      $('rc_lowerUnit')],
  ];
  orgChanges.forEach(([key, code, sel]) => {
    if(!code) return;
    if(!ORG_UNITS[key]) ORG_UNITS[key] = {};
    if(!ORG_UNITS[key][code]) {
      // Get display name from the select option (strip code prefix)
      const opt = sel ? Array.from(sel.options).find(o => o.value === code) : null;
      const name = opt ? opt.text.replace(/^[^ ]+ – /, '') : code;
      ORG_UNITS[key][code] = name;
      changed = true;
    }
  });

  // ── Activities ─────────────────────────────────────────────
  if(rcName && activities.length > 0){
    if(!RC_ACTIVITIES[rcName]) RC_ACTIVITIES[rcName] = [];
    let actChanged = false;
    activities.forEach(act => {
      if(!RC_ACTIVITIES[rcName].includes(act)){
        RC_ACTIVITIES[rcName].push(act);
        actChanged = true;
      }
    });
    if(actChanged) await persistRefType('activity');
  }

  // ── Account Codes ─────────────────────────────────────────
  if(accountCodes.length > 0){
    let acChanged = false;
    [1,2,3].forEach(ecNum => {
      ($('ac_list_'+ecNum)||{querySelectorAll:()=>[]})
        .querySelectorAll('input[type=checkbox]:checked')
        .forEach(cb => {
          const code = cb.value;
          if(code && !ACCOUNT_CODES[ecNum].includes(code)){
            ACCOUNT_CODES[ecNum].push(code);
            acChanged = true;
          }
        });
    });
    if(acChanged) await persistRefType('account_code');
  }

  if(changed){
    await persistRefType('all_fund');
    await persistRefType('all_project');
    if(typeof renderRefFundClusters==='function') renderRefFundClusters();
    if(typeof renderRefProjects==='function')     renderRefProjects();
    if(typeof renderRefActivities==='function')   renderRefActivities();
    if(typeof renderRefAccountCodes==='function') renderRefAccountCodes();
    if(typeof populateRefFCFilter==='function')   populateRefFCFilter();
    if(typeof populateRefProjFilter==='function') populateRefProjFilter();
    if(typeof populateRefRCFilter==='function')   populateRefRCFilter();
  }
}

async function deleteRC(id){
  const r=DATA.rc.find(x=>x.id==id);if(!r)return;
  const deps=[];if(DATA.allotment.some(a=>a.rc_id==id))deps.push('Allotments');if(DATA.earmark.some(e=>e.rc_id==id))deps.push('Earmarks');if(DATA.obligation.some(o=>o.rc_id==id))deps.push('Obligations');
  const ok=await confirm2('Delete RC',`Delete "${r.responsibility_center}"?${deps.length?'\n\nLinked records: '+deps.join(', '):''}`);
  if(!ok)return;
  try{showSaving(true);await BudgetAPI.deleteRC(id);await loadAll();renderAll();toast('RC deleted','error');}catch(err){toast(err.message,'error');}finally{showSaving(false);}
}

// ══════════════════════════════════════════
// RC SIGNATORIES
// ══════════════════════════════════════════
let _rcSignatories = [];

function rcAddSignatory(data) {
  _rcSignatories.push({name: data?.name||'', position: data?.position||''});
  rcRenderSignatories();
}
function rcRemoveSignatory(idx) {
  _rcSignatories.splice(idx, 1);
  rcRenderSignatories();
}
function rcRenderSignatories() {
  const list=$('rc_signatoryList');
  const empty=$('rc_signatory_empty');
  if(!list) return;
  if(_rcSignatories.length===0){
    list.innerHTML='';
    if(empty) empty.style.display='';
    return;
  }
  if(empty) empty.style.display='none';
  list.innerHTML=_rcSignatories.map((s,i)=>`
    <div class="sign-card">
      <div class="form-group" style="margin:0">
        <label style="font-size:11px;margin-bottom:3px">Name <span style="color:var(--red)">*</span></label>
        <input type="text" placeholder="e.g. Juan Dela Cruz" value="${s.name.replace(/"/g,'&quot;')}"
          oninput="_rcSignatories[${i}].name=this.value" style="font-size:13px">
      </div>
      <div class="form-group" style="margin:0">
        <label style="font-size:11px;margin-bottom:3px">Position / Designation <span style="color:var(--red)">*</span></label>
        <input type="text" placeholder="e.g. Regional Director" value="${s.position.replace(/"/g,'&quot;')}"
          oninput="_rcSignatories[${i}].position=this.value" style="font-size:13px">
      </div>
      <button type="button" class="sign-del" onclick="rcRemoveSignatory(${i})" title="Remove">✕</button>
    </div>`).join('');
}
function rcGetSignatories() {
  return _rcSignatories.filter(s=>s.name.trim()||s.position.trim());
}

// ══════════════════════════════════════════
// RC INLINE QUICK-ADD
// ══════════════════════════════════════════
const _qaOpen = new Set();

function rcQuickAdd(type) {
  _qaOpen.forEach(t => { if(t !== type) rcQuickClose(t); });
  const panel = $('qa-' + type);
  if(!panel) return;
  const isOpen = panel.style.display !== 'none';
  if(isOpen) { rcQuickClose(type); return; }
  panel.style.display = '';
  _qaOpen.add(type);
  const first = panel.querySelector('.qa-input');
  if(first) setTimeout(() => first.focus(), 50);
}

function rcQuickClose(type) {
  const panel = $('qa-' + type);
  if(!panel) return;
  panel.style.display = 'none';
  _qaOpen.delete(type);
  panel.querySelectorAll('.qa-input').forEach(i => i.value = '');
}

function rcQuickSave(type) {
  const fc   = $('rc_fundCluster').value;
  const ac   = $('rc_authCode').value;
  const proj = $('rc_project').value;
  const pcat = $('rc_projectCat').value;
  const rcNm = $('rc_rcName').value.trim();

  if(type === 'fundCluster') {
    const code = $('qa-fc-code').value.trim();
    const name = $('qa-fc-name').value.trim();
    if(!code || !name) { toast('Code and name are required','error'); return; }
    if(FUND_DATA[code]) { toast('Fund Cluster "'+code+'" already exists','error'); return; }
    FUND_DATA[code] = {name, authCodes: {}};
    rcRebuildFundClusterDD(code);
    toast('Fund Cluster "'+code+'" added');
    rcQuickClose('fundCluster');
    persistRefType('all_fund');
  }

  else if(type === 'financingSource') {
    const code = $('qa-fs-code').value.trim();
    const name = $('qa-fs-name').value.trim();
    if(!code || !name) { toast('Code and name are required','error'); return; }
    if(!ORG_UNITS.financingSource) ORG_UNITS.financingSource = {};
    if(ORG_UNITS.financingSource[code]) { toast('Financing Source "'+code+'" already exists','error'); return; }
    ORG_UNITS.financingSource[code] = name;
    // Also update FUND_DATA name for selected fund cluster
    if(fc && FUND_DATA[fc]) {
      FUND_DATA[fc].name = name;
      persistRefType('all_fund');
    }
    rcRebuildFinancingSourceDD(code);
    toast('Financing Source "'+code+'" added');
    rcQuickClose('financingSource');
  }

  else if(type === 'authCode') {
    if(!fc) { toast('Select a Fund Cluster first','error'); return; }
    const code = $('qa-ac-code').value.trim();
    const name = $('qa-ac-name').value.trim();
    if(!code || !name) { toast('Code and name are required','error'); return; }
    if(FUND_DATA[fc].authCodes[code]) { toast('Auth Code "'+code+'" already exists','error'); return; }
    FUND_DATA[fc].authCodes[code] = {name, cats: {}};
    rcUpdateAuthCodes();
    $('rc_authCode').value = code;
    rcUpdateFundCats();
    toast('Auth Code "'+code+'" added');
    rcQuickClose('authCode');
    persistRefType('all_fund');
  }

  else if(type === 'fundCategory') {
    if(!fc || !ac) { toast('Select Fund Cluster and Auth Code first','error'); return; }
    const code = $('qa-cat-code').value.trim();
    const name = $('qa-cat-name').value.trim();
    if(!code || !name) { toast('Code and name are required','error'); return; }
    if(FUND_DATA[fc].authCodes[ac].cats[code]) { toast('Category "'+code+'" already exists','error'); return; }
    FUND_DATA[fc].authCodes[ac].cats[code] = name;
    rcUpdateFundCats();
    $('rc_fundCategory').value = code;
    rcUpdateFullFunding();
    toast('Fund Category "'+code+'" added');
    rcQuickClose('fundCategory');
    persistRefType('all_fund');
  }

  else if(type === 'project') {
    const code = $('qa-proj-code').value.trim();
    const name = $('qa-proj-name').value.trim();
    if(!code || !name) { toast('Code and name are required','error'); return; }
    if(PROJECT_DATA[code]) { toast('Project "'+code+'" already exists','error'); return; }
    PROJECT_DATA[code] = {name, cats: {}};
    populateProjectDD('rc_project');
    $('rc_project').value = code;
    rcUpdateProjectCats();
    toast('Project "'+name+'" added');
    rcQuickClose('project');
    if(typeof renderRefProjects === 'function') renderRefProjects();
    persistRefType('all_project');
  }

  else if(type === 'projectCat') {
    if(!proj) { toast('Select a Project/Program first','error'); return; }
    const code = $('qa-pcat-code').value.trim();
    const name = $('qa-pcat-name').value.trim();
    if(!code || !name) { toast('Code and name are required','error'); return; }
    if(!PROJECT_DATA[proj].cats) PROJECT_DATA[proj].cats = {};
    if(PROJECT_DATA[proj].cats[code]) { toast('Category "'+code+'" already exists','error'); return; }
    PROJECT_DATA[proj].cats[code] = {name, subs: {}};
    rcUpdateProjectCats();
    $('rc_projectCat').value = code;
    rcUpdateProjectSubs();
    toast('Project Category "'+name+'" added');
    rcQuickClose('projectCat');
    if(typeof renderRefProjCats === 'function') renderRefProjCats();
    persistRefType('all_project');
  }

  else if(type === 'projectSub') {
    if(!proj || !pcat) { toast('Select a Project and Category first','error'); return; }
    const code = $('qa-psub-code').value.trim();
    const name = $('qa-psub-name').value.trim();
    if(!code || !name) { toast('Code and name are required','error'); return; }
    if(!PROJECT_DATA[proj].cats[pcat]) { toast('Project Category not found','error'); return; }
    if(!PROJECT_DATA[proj].cats[pcat].subs) PROJECT_DATA[proj].cats[pcat].subs = {};
    if(PROJECT_DATA[proj].cats[pcat].subs[code]) { toast('"'+code+'" already exists','error'); return; }
    PROJECT_DATA[proj].cats[pcat].subs[code] = name;
    rcUpdateProjectSubs();
    $('rc_projectSub').value = code;
    toast('Sub-Category "'+name+'" added');
    rcQuickClose('projectSub');
    persistRefType('all_project');
  }

  else if(type === 'activity') {
    const nm = rcNm || $('rc_rcName').value.trim();
    const actName = $('qa-act-name').value.trim();
    if(!actName) { toast('Activity name is required','error'); return; }
    if(!nm) { toast('Enter the Responsibility Center Name first','error'); return; }
    if(!RC_ACTIVITIES[nm]) RC_ACTIVITIES[nm] = [];
    if(RC_ACTIVITIES[nm].includes(actName)) { toast('Activity already exists','error'); return; }
    RC_ACTIVITIES[nm].push(actName);
    rcUpdateActivities();
    const sel = $('rc_activity');
    Array.from(sel.options).forEach(o => { if(o.value === actName) o.selected = true; });
    toast('Activity "'+actName+'" added');
    rcQuickClose('activity');
    if(typeof renderRefActivities === 'function') renderRefActivities();
    persistRefType('activity');
  }

  // ── Org Unit quick-add handlers ──────────────────────────
  else if(type === 'deptCode') {
    const code = $('qa-dept-code').value.trim();
    const name = $('qa-dept-name').value.trim();
    if(!code || !name) { toast('Code and name are required','error'); return; }
    if(ORG_UNITS.dept[code]) { toast('Department Code "'+code+'" already exists','error'); return; }
    ORG_UNITS.dept[code] = name;
    rcPopulateDeptCodes();
    $('rc_deptCode').value = code;
    toast('Department "'+name+'" added');
    rcQuickClose('deptCode');
  }

  else if(type === 'agencyCode') {
    const code = $('qa-agency-code').value.trim();
    const name = $('qa-agency-name').value.trim();
    if(!code || !name) { toast('Code and name are required','error'); return; }
    if(ORG_UNITS.agency[code]) { toast('Agency Code "'+code+'" already exists','error'); return; }
    ORG_UNITS.agency[code] = name;
    rcUpdateAgencyCodes();
    $('rc_agencyCode').value = code;
    toast('Agency "'+name+'" added');
    rcQuickClose('agencyCode');
  }

  else if(type === 'operatingUnit') {
    const code = $('qa-ou-code').value.trim();
    const name = $('qa-ou-name').value.trim();
    if(!code || !name) { toast('Code and name are required','error'); return; }
    if(ORG_UNITS.operatingUnit[code]) { toast('Operating Unit "'+code+'" already exists','error'); return; }
    ORG_UNITS.operatingUnit[code] = name;
    rcUpdateOperatingUnits();
    $('rc_operatingUnit').value = code;
    toast('Operating Unit "'+name+'" added');
    rcQuickClose('operatingUnit');
  }

  else if(type === 'lowerUnit') {
    const code = $('qa-lu-code').value.trim();
    const name = $('qa-lu-name').value.trim();
    if(!code || !name) { toast('Code and name are required','error'); return; }
    if(ORG_UNITS.lowerUnit[code]) { toast('Lower Unit "'+code+'" already exists','error'); return; }
    ORG_UNITS.lowerUnit[code] = name;
    rcUpdateLowerUnits();
    $('rc_lowerUnit').value = code;
    toast('Lower Level Unit "'+name+'" added');
    rcQuickClose('lowerUnit');
  }
}

function rcRebuildFundClusterDD(selectValue) {
  const s = $('rc_fundCluster');
  s.innerHTML = '<option value="">Select Fund Cluster</option>';
  Object.entries(FUND_DATA).forEach(([k,v]) =>
    s.innerHTML += `<option value="${k}">${k} – ${v.name}</option>`
  );
  if(selectValue) { s.value = selectValue; rcUpdateFundCluster(); }
}

document.addEventListener('click', e => {
  if(_qaOpen.size === 0) return;
  if(!e.target.closest('.qa-panel') && !e.target.closest('.btn-inline-add')) {
    _qaOpen.forEach(t => rcQuickClose(t));
  }
}, true);

document.addEventListener('keydown', e => {
  if(e.key === 'Escape') _qaOpen.forEach(t => rcQuickClose(t));
});

// ══════════════════════════════════════════
