// REFERENCE DATA — DB PERSISTENCE
// ══════════════════════════════════════════

function fundDataToItems(){
  const items=[];
  Object.entries(FUND_DATA).forEach(([fcCode,fc])=>{
    items.push({type:'fund_cluster',code:fcCode,name:fc.name});
    Object.entries(fc.authCodes||{}).forEach(([acCode,ac])=>{
      items.push({type:'auth_code',code:acCode,name:ac.name,parentCode:fcCode});
      Object.entries(ac.cats||{}).forEach(([catCode,catName])=>{
        items.push({type:'fund_category',code:catCode,name:catName,parentCode:acCode,parentCode2:fcCode});
      });
    });
  });
  return items;
}

function projectDataToItems(){
  const items=[];
  Object.entries(PROJECT_DATA).forEach(([projCode,proj])=>{
    items.push({type:'project',code:projCode,name:proj.name});
    Object.entries(proj.cats||{}).forEach(([catCode,cat])=>{
      items.push({type:'project_category',code:catCode,name:cat.name||catCode,parentCode:projCode});
      Object.entries(cat.subs||{}).forEach(([subCode,subName])=>{
        items.push({type:'project_sub',code:subCode,name:subName,parentCode:catCode,parentCode2:projCode});
      });
    });
  });
  return items;
}

function accountCodesToItems(){
  const items=[];
  [1,2,3].forEach(n=>{
    (ACCOUNT_CODES[n]||[]).forEach((code,i)=>{
      items.push({type:'account_code',code:code.split('–')[0].trim()||code,name:code,expenseClassNum:n,sortOrder:i});
    });
  });
  return items;
}

function rcActivitiesToItems(){
  const items=[];
  Object.entries(RC_ACTIVITIES).forEach(([rcName,acts])=>{
    (acts||[]).forEach((act,i)=>{
      items.push({type:'activity',code:act,name:act,parentCode:rcName,sortOrder:i});
    });
  });
  return items;
}

async function persistRefType(dataType){
  try{
    let byType={};
    if(dataType==='all_fund'){
      const items=fundDataToItems();
      items.forEach(item=>{ if(!byType[item.type])byType[item.type]=[]; byType[item.type].push(item); });
    } else if(dataType==='all_project'){
      const items=projectDataToItems();
      items.forEach(item=>{ if(!byType[item.type])byType[item.type]=[]; byType[item.type].push(item); });
    } else if(dataType==='account_code'){
      byType['account_code']=accountCodesToItems();
    } else if(dataType==='activity'){
      byType['activity']=rcActivitiesToItems();
    }
    await Promise.all(Object.entries(byType).map(([t,its])=>BudgetAPI.bulkSaveRefType(t,its)));
  } catch(err){
    console.warn('Ref data DB sync failed:',err.message);
  }
}

// ══════════════════════════════════════════
// REFERENCE DATA CRUD
// ══════════════════════════════════════════

// ── Tab switching ──────────────────────────
function refTab(tab) {
  ['fund','project','accounts'].forEach(t => {
    $('ref-'+t).style.display = t===tab ? '' : 'none';
    const btn = $('rtab-'+t);
    if(btn) { btn.className = t===tab ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'; }
  });
  if(tab==='fund')     { populateRefFCFilter(); renderRefFundClusters(); renderRefAuthCodes(); renderRefFundCats(); }
  if(tab==='project')  { populateRefProjFilter(); populateRefRCFilter(); renderRefProjects(); renderRefProjCats(); renderRefActivities(); }
  if(tab==='accounts') { renderRefAccountCodes(); }
}

// ── Populate filter dropdowns ──────────────
function populateRefFCFilter() {
  const s = $('ref-fc-filter'); const cv = s.value;
  s.innerHTML = '<option value="">All Fund Clusters</option>';
  Object.keys(FUND_DATA).forEach(k => s.innerHTML += `<option value="${k}">${k}</option>`);
  if(cv) s.value = cv;

  const s2 = $('ref-ac-filter'); const cv2 = s2.value;
  s2.innerHTML = '<option value="">All Auth Codes</option>';
  Object.values(FUND_DATA).forEach(fc =>
    Object.keys(fc.authCodes).forEach(k => s2.innerHTML += `<option value="${k}">${k}</option>`)
  );
  if(cv2) s2.value = cv2;
}

function populateRefProjFilter() {
  const s = $('ref-proj-filter'); const cv = s.value;
  s.innerHTML = '<option value="">All Projects</option>';
  Object.entries(PROJECT_DATA).forEach(([k,v]) => s.innerHTML += `<option value="${k}">${v.name}</option>`);
  if(cv) s.value = cv;
}

function populateRefRCFilter() {
  const s = $('ref-rc-filter'); const cv = s.value;
  s.innerHTML = '<option value="">All RCs</option>';
  Object.keys(RC_ACTIVITIES).forEach(rc => s.innerHTML += `<option value="${rc}">${rc}</option>`);
  if(cv) s.value = cv;
}

// ── Render tables ──────────────────────────
function renderRefFundClusters() {
  const tb = $('ref-fc-tbody');
  const entries = Object.entries(FUND_DATA);
  tb.innerHTML = entries.length ? entries.map(([k,v]) => `<tr>
    <td><strong style="font-family:var(--mono);font-size:12px">${k}</strong></td>
    <td>${v.name}</td>
    <td><div class="row-actions">
      <button class="act-btn a-edit" onclick="openRefModal('fundCluster','${k}')">Edit</button>
      <button class="act-btn a-del" onclick="deleteRefItem('fundCluster','${k}')">Del</button>
    </div></td>
  </tr>`).join('') : '<tr class="empty-row"><td colspan="3">No fund clusters. Add one above.</td></tr>';
}

function renderRefAuthCodes() {
  const tb = $('ref-ac-tbody');
  const filter = $('ref-fc-filter').value;
  const rows = [];
  Object.entries(FUND_DATA).forEach(([fcKey, fc]) => {
    if(filter && fcKey !== filter) return;
    Object.entries(fc.authCodes).forEach(([k,v]) => rows.push({k, name:v.name, fc:fcKey}));
  });
  tb.innerHTML = rows.length ? rows.map(r => `<tr>
    <td><strong style="font-family:var(--mono);font-size:11px">${r.k}</strong></td>
    <td>${r.name}</td>
    <td style="font-size:11px;color:var(--text3)">${r.fc}</td>
    <td><div class="row-actions">
      <button class="act-btn a-edit" onclick="openRefModal('authCode','${r.k}','${r.fc}')">Edit</button>
      <button class="act-btn a-del" onclick="deleteRefItem('authCode','${r.k}','${r.fc}')">Del</button>
    </div></td>
  </tr>`).join('') : '<tr class="empty-row"><td colspan="4">No auth codes yet.</td></tr>';
}

function renderRefFundCats() {
  const tb = $('ref-cat-tbody');
  const filter = $('ref-ac-filter').value;
  const rows = [];
  Object.entries(FUND_DATA).forEach(([fcKey, fc]) => {
    Object.entries(fc.authCodes).forEach(([acKey,ac]) => {
      if(filter && acKey !== filter) return;
      Object.entries(ac.cats).forEach(([k,name]) => rows.push({k, name, acKey}));
    });
  });
  tb.innerHTML = rows.length ? rows.map(r => `<tr>
    <td><strong style="font-family:var(--mono);font-size:11px">${r.k}</strong></td>
    <td>${r.name}</td>
    <td style="font-size:11px;color:var(--text3)">${r.acKey}</td>
    <td><div class="row-actions">
      <button class="act-btn a-edit" onclick="openRefModal('fundCategory','${r.k}','${r.acKey}')">Edit</button>
      <button class="act-btn a-del" onclick="deleteRefItem('fundCategory','${r.k}','${r.acKey}')">Del</button>
    </div></td>
  </tr>`).join('') : '<tr class="empty-row"><td colspan="4">No categories yet.</td></tr>';
}

function renderRefProjects() {
  const tb = $('ref-proj-tbody');
  const entries = Object.entries(PROJECT_DATA);
  tb.innerHTML = entries.length ? entries.map(([k,v]) => `<tr>
    <td><strong style="font-family:var(--mono);font-size:11px">${k}</strong></td>
    <td>${v.name}</td>
    <td><div class="row-actions">
      <button class="act-btn a-edit" onclick="openRefModal('project','${k}')">Edit</button>
      <button class="act-btn a-del" onclick="deleteRefItem('project','${k}')">Del</button>
    </div></td>
  </tr>`).join('') : '<tr class="empty-row"><td colspan="3">No projects yet.</td></tr>';
}

function renderRefProjCats() {
  const tb = $('ref-projcat-tbody');
  const filter = $('ref-proj-filter').value;
  const rows = [];
  Object.entries(PROJECT_DATA).forEach(([projKey,proj]) => {
    if(filter && projKey !== filter) return;
    Object.entries(proj.cats).forEach(([k,cat]) => rows.push({k, name:cat.name||k, projKey}));
  });
  tb.innerHTML = rows.length ? rows.map(r => `<tr>
    <td><strong style="font-family:var(--mono);font-size:11px">${r.k}</strong></td>
    <td>${r.name}</td>
    <td style="font-size:11px;color:var(--text3)">${PROJECT_DATA[r.projKey]?.name||r.projKey}</td>
    <td><div class="row-actions">
      <button class="act-btn a-edit" onclick="openRefModal('projectCat','${r.k}','${r.projKey}')">Edit</button>
      <button class="act-btn a-del" onclick="deleteRefItem('projectCat','${r.k}','${r.projKey}')">Del</button>
    </div></td>
  </tr>`).join('') : '<tr class="empty-row"><td colspan="4">No categories yet.</td></tr>';
}

function renderRefActivities() {
  const tb = $('ref-act-tbody');
  const filter = $('ref-rc-filter').value;
  const rows = [];
  Object.entries(RC_ACTIVITIES).forEach(([rc, acts]) => {
    if(filter && rc !== filter) return;
    acts.forEach(a => rows.push({a, rc}));
  });
  tb.innerHTML = rows.length ? rows.map(r => `<tr>
    <td>${r.a}</td>
    <td style="font-size:11px;color:var(--text3)">${r.rc}</td>
    <td><div class="row-actions">
      <button class="act-btn a-del" onclick="deleteRefItem('activity','${r.a.replace(/'/g,"\'")}','${r.rc.replace(/'/g,"\'")}')">Del</button>
    </div></td>
  </tr>`).join('') : '<tr class="empty-row"><td colspan="3">No activities yet.</td></tr>';
}

function renderRefAccountCodes() {
  [1,2,3].forEach(n => {
    const tb = $('ref-ac'+n+'-tbody');
    const codes = ACCOUNT_CODES[n] || [];
    tb.innerHTML = codes.length ? codes.map((c,i) => `<tr>
      <td style="font-family:var(--mono);font-size:12px">${c}</td>
      <td><div class="row-actions">
        <button class="act-btn a-del" onclick="deleteRefItem('accountCode',${i},${n})">Del</button>
      </div></td>
    </tr>`).join('') : '<tr class="empty-row"><td colspan="2">No codes yet.</td></tr>';
  });
}

// ── Open modal ─────────────────────────────
function openRefModal(type, editKey, parentKey) {
  $('ref_type').value = type;
  $('ref_editKey').value = editKey || '';
  $('ref_ecNum').value = parentKey || '';
  const isEdit = !!editKey;
  let title = '', fields = '';

  if(type === 'fundCluster') {
    title = isEdit ? 'Edit Fund Cluster' : 'Add Fund Cluster';
    const existing = isEdit ? FUND_DATA[editKey] : null;
    fields = `
      <div class="form-group"><label class="req">Fund Cluster Code</label>
        <input type="text" id="ref_f1" placeholder="e.g. 03000000" value="${isEdit ? editKey : ''}" ${isEdit?'readonly':''} required></div>
      <div class="form-group"><label class="req">Name</label>
        <input type="text" id="ref_f2" placeholder="e.g. Special Purpose Fund" value="${existing?.name||''}" required></div>`;
  }
  else if(type === 'authCode') {
    title = isEdit ? 'Edit Authorization Code' : 'Add Authorization Code';
    const fcOpts = Object.keys(FUND_DATA).map(k => `<option value="${k}" ${k===(parentKey||'')? 'selected':''}>${k}</option>`).join('');
    let existingName = '';
    if(isEdit && parentKey && FUND_DATA[parentKey]?.authCodes[editKey]) existingName = FUND_DATA[parentKey].authCodes[editKey].name;
    fields = `
      <div class="form-group"><label class="req">Fund Cluster</label>
        <select id="ref_f0" required><option value="">Select</option>${fcOpts}</select></div>
      <div class="form-group"><label class="req">Auth Code</label>
        <input type="text" id="ref_f1" placeholder="e.g. 01103000" value="${isEdit ? editKey : ''}" ${isEdit?'readonly':''} required></div>
      <div class="form-group"><label class="req">Name</label>
        <input type="text" id="ref_f2" placeholder="e.g. Automatic Appropriations" value="${existingName}" required></div>`;
  }
  else if(type === 'fundCategory') {
    title = isEdit ? 'Edit Fund Category' : 'Add Fund Category';
    const acOpts = [];
    Object.entries(FUND_DATA).forEach(([fc,fcv]) =>
      Object.keys(fcv.authCodes).forEach(k => acOpts.push(`<option value="${k}" ${k===(parentKey||'')?'selected':''}>${k}</option>`))
    );
    let existingName = '';
    if(isEdit && parentKey) {
      Object.values(FUND_DATA).forEach(fc => { if(fc.authCodes[parentKey]?.cats[editKey]) existingName = fc.authCodes[parentKey].cats[editKey]; });
    }
    fields = `
      <div class="form-group"><label class="req">Authorization Code</label>
        <select id="ref_f0" required><option value="">Select</option>${acOpts.join('')}</select></div>
      <div class="form-group"><label class="req">Category Code</label>
        <input type="text" id="ref_f1" placeholder="e.g. 01101102" value="${isEdit ? editKey : ''}" ${isEdit?'readonly':''} required></div>
      <div class="form-group"><label class="req">Name</label>
        <input type="text" id="ref_f2" placeholder="e.g. Specific Budget (Continuing)" value="${existingName}" required></div>`;
  }
  else if(type === 'project') {
    title = isEdit ? 'Edit Project' : 'Add Project / Program';
    const existing = isEdit ? PROJECT_DATA[editKey] : null;
    fields = `
      <div class="form-group"><label class="req">Project Code</label>
        <input type="text" id="ref_f1" placeholder="e.g. 320100000000" value="${isEdit ? editKey : ''}" ${isEdit?'readonly':''} required></div>
      <div class="form-group"><label class="req">Name</label>
        <input type="text" id="ref_f2" placeholder="e.g. Aquaculture Program" value="${existing?.name||''}" required></div>`;
  }
  else if(type === 'projectCat') {
    title = isEdit ? 'Edit Project Category' : 'Add Project Category';
    const projOpts = Object.entries(PROJECT_DATA).map(([k,v]) => `<option value="${k}" ${k===(parentKey||'')?'selected':''}>${v.name}</option>`).join('');
    let existingName = '';
    if(isEdit && parentKey && PROJECT_DATA[parentKey]?.cats[editKey]) existingName = PROJECT_DATA[parentKey].cats[editKey].name || editKey;
    fields = `
      <div class="form-group"><label class="req">Project / Program</label>
        <select id="ref_f0" required><option value="">Select</option>${projOpts}</select></div>
      <div class="form-group"><label class="req">Category Code</label>
        <input type="text" id="ref_f1" placeholder="e.g. 310103000000" value="${isEdit ? editKey : ''}" ${isEdit?'readonly':''} required></div>
      <div class="form-group"><label class="req">Name</label>
        <input type="text" id="ref_f2" placeholder="e.g. Capture Fisheries Sub-Program" value="${existingName}" required></div>`;
  }
  else if(type === 'activity') {
    title = 'Add Activity Level 2';
    const rcOpts = DATA.rc.map(r => `<option value="${r.responsibility_center}">${r.responsibility_center}</option>`).join('');
    fields = `
      <div class="form-group"><label class="req">Responsibility Center</label>
        <select id="ref_f0" required><option value="">Select RC</option>${rcOpts}</select></div>
      <div class="form-group"><label class="req">Activity Name</label>
        <input type="text" id="ref_f1" placeholder="e.g. Fish Cage Operations" required></div>`;
  }
  else if(type === 'accountCode') {
    title = 'Add Account Code';
    const ecNum = parentKey || editKey;
    const ecNames = {1:'Personnel Services',2:'MOOE',3:'Capital Outlay'};
    fields = `
      <div class="form-group"><label>Expense Class</label>
        <input type="text" value="${ecNum} – ${ecNames[ecNum]||''}" readonly></div>
      <div class="form-group"><label class="req">Account Code</label>
        <input type="text" id="ref_f1" placeholder="e.g. 5-02-02-010 – Representation" required></div>`;
    $('ref_ecNum').value = ecNum;
  }

  $('refModalTitle').textContent = title;
  $('refFormFields').innerHTML = `<div class="form-grid">${fields}</div>`;
  openModal('refModal');
}

// ── Save ref item ──────────────────────────
function saveRefItem(e) {
  e.preventDefault();
  const type = $('ref_type').value;
  const editKey = $('ref_editKey').value;
  const ecNum = $('ref_ecNum').value;

  const f1 = ($('ref_f1')?.value || '').trim();
  const f2 = ($('ref_f2')?.value || '').trim();
  const f0 = ($('ref_f0')?.value || '').trim();

  if(type === 'fundCluster') {
    if(!f1 || !f2) return;
    if(!FUND_DATA[f1]) FUND_DATA[f1] = {name: f2, authCodes: {}};
    else FUND_DATA[f1].name = f2;
    toast(editKey ? 'Fund Cluster updated' : 'Fund Cluster added');
    renderRefFundClusters(); populateRefFCFilter();
    rebuildRCDropdowns();
    persistRefType('all_fund');
  }
  else if(type === 'authCode') {
    if(!f0 || !f1 || !f2) return;
    if(!FUND_DATA[f0]) { toast('Select a valid Fund Cluster','error'); return; }
    if(!FUND_DATA[f0].authCodes[f1]) FUND_DATA[f0].authCodes[f1] = {name: f2, cats: {}};
    else FUND_DATA[f0].authCodes[f1].name = f2;
    toast(editKey ? 'Auth Code updated' : 'Auth Code added');
    renderRefAuthCodes(); populateRefFCFilter();
    rebuildRCDropdowns();
    persistRefType('all_fund');
  }
  else if(type === 'fundCategory') {
    if(!f0 || !f1 || !f2) return;
    let found = false;
    Object.values(FUND_DATA).forEach(fc => { if(fc.authCodes[f0]) { fc.authCodes[f0].cats[f1] = f2; found = true; } });
    if(!found) { toast('Auth Code not found','error'); return; }
    toast(editKey ? 'Fund Category updated' : 'Fund Category added');
    renderRefFundCats(); populateRefFCFilter();
    rebuildRCDropdowns();
    persistRefType('all_fund');
  }
  else if(type === 'project') {
    if(!f1 || !f2) return;
    if(!PROJECT_DATA[f1]) PROJECT_DATA[f1] = {name: f2, cats: {}};
    else PROJECT_DATA[f1].name = f2;
    toast(editKey ? 'Project updated' : 'Project added');
    renderRefProjects(); populateRefProjFilter();
    rebuildRCDropdowns();
    persistRefType('all_project');
  }
  else if(type === 'projectCat') {
    if(!f0 || !f1 || !f2) return;
    if(!PROJECT_DATA[f0]) { toast('Select a valid Project','error'); return; }
    if(!PROJECT_DATA[f0].cats[f1]) PROJECT_DATA[f0].cats[f1] = {name: f2, subs: {}};
    else PROJECT_DATA[f0].cats[f1].name = f2;
    toast(editKey ? 'Category updated' : 'Category added');
    renderRefProjCats(); populateRefProjFilter();
    rebuildRCDropdowns();
    persistRefType('all_project');
  }
  else if(type === 'activity') {
    if(!f0 || !f1) return;
    if(!RC_ACTIVITIES[f0]) RC_ACTIVITIES[f0] = [];
    if(!RC_ACTIVITIES[f0].includes(f1)) { RC_ACTIVITIES[f0].push(f1); toast('Activity added'); }
    else { toast('Activity already exists','error'); return; }
    renderRefActivities(); populateRefRCFilter();
    persistRefType('activity');
  }
  else if(type === 'accountCode') {
    if(!f1) return;
    const n = parseInt(ecNum);
    if(!ACCOUNT_CODES[n]) ACCOUNT_CODES[n] = [];
    if(!ACCOUNT_CODES[n].includes(f1)) { ACCOUNT_CODES[n].push(f1); toast('Account code added'); }
    else { toast('Code already exists','error'); return; }
    renderRefAccountCodes();
    persistRefType('account_code');
  }

  closeModal('refModal');
}

// ── Delete ref item ────────────────────────
async function deleteRefItem(type, key, parentKey) {
  const ok = await confirm2('Delete Reference', `Remove this ${type.replace(/([A-Z])/g,' $1').toLowerCase()} entry?`);
  if(!ok) return;

  if(type === 'fundCluster') {
    delete FUND_DATA[key];
    renderRefFundClusters(); renderRefAuthCodes(); renderRefFundCats(); populateRefFCFilter();
    persistRefType('all_fund');
  }
  else if(type === 'authCode') {
    if(FUND_DATA[parentKey]?.authCodes[key]) { delete FUND_DATA[parentKey].authCodes[key]; }
    renderRefAuthCodes(); renderRefFundCats(); populateRefFCFilter();
    persistRefType('all_fund');
  }
  else if(type === 'fundCategory') {
    Object.values(FUND_DATA).forEach(fc => { if(fc.authCodes[parentKey]) delete fc.authCodes[parentKey].cats[key]; });
    renderRefFundCats();
    persistRefType('all_fund');
  }
  else if(type === 'project') {
    delete PROJECT_DATA[key];
    renderRefProjects(); renderRefProjCats(); populateRefProjFilter();
    persistRefType('all_project');
  }
  else if(type === 'projectCat') {
    if(PROJECT_DATA[parentKey]?.cats[key]) delete PROJECT_DATA[parentKey].cats[key];
    renderRefProjCats();
    persistRefType('all_project');
  }
  else if(type === 'activity') {
    if(RC_ACTIVITIES[parentKey]) { RC_ACTIVITIES[parentKey] = RC_ACTIVITIES[parentKey].filter(a => a !== key); }
    renderRefActivities();
    persistRefType('activity');
  }
  else if(type === 'accountCode') {
    const n = parseInt(parentKey);
    ACCOUNT_CODES[n].splice(parseInt(key), 1);
    renderRefAccountCodes();
    persistRefType('account_code');
  }
  rebuildRCDropdowns();
  toast('Deleted', 'error');
}

// ── Rebuild RC form dropdowns after ref data changes ──
function rebuildRCDropdowns() {
  // Rebuild fund cluster options
  const fc = $('rc_fundCluster');
  if(fc) {
    const cv = fc.value;
    fc.innerHTML = '<option value="">Select Fund Cluster</option>';
    Object.entries(FUND_DATA).forEach(([k,v]) => fc.innerHTML += `<option value="${k}">${k} – ${v.name}</option>`);
    if(cv) fc.value = cv;
    rcUpdateAuthCodes();
  }
  // Rebuild project options
  populateProjectDD('rc_project');
}



// ══════════════════════════════════════════
