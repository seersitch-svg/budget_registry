// DISBURSEMENT CRUD
// ══════════════════════════════════════════
function dbPopulateObligDD(){const s=$('db_obligId');const cv=s.value;s.innerHTML='<option value="">Select Obligation (OBR #)</option>';DATA.obligation.forEach(o=>{const rc=getRCById(o.rc_id);s.innerHTML+=`<option value="${o.id}">${o.obr_number} – ${o.payee} (${rc?.responsibility_center||'?'})</option>`;});if(cv)s.value=cv;}
function dbLoadObligation(){const id=$('db_obligId').value;const o=getObligationById(parseInt(id));if(!o){['db_cat2','db_cat3'].forEach(x=>$(x).style.display='none');return;}const rc=getRCById(o.rc_id);$('db_obrNum').value=o.obr_number;$('db_payee').value=o.payee;$('db_rc').value=rc?.responsibility_center||'—';$('db_obligAmt').value=fmt.cur(o.obligation_incurred);['db_cat2','db_cat3'].forEach(x=>$(x).style.display='');}
function dbCalc(){const n=fmtVal($('db_net')),t=fmtVal($('db_tra'));$('db_total').value=fmt.num(n+t);}

function openDisbursementModal(){if(!DATA.obligation.length){toast('Create at least one Obligation first','error');return;}document.getElementById('disbursementForm').reset();$('db_editId').value='';$('dbModalTitle').textContent='Add Disbursement';['db_cat2','db_cat3'].forEach(id=>$(id).style.display='none');$('db_date').value=new Date().toISOString().split('T')[0];$('db_tra').value='0';setTimeout(()=>{ fmtWrapAll($('disbursementModal')); const t=$('db_tra');if(t&&t.value==='0')t.value='0'; },50);dbPopulateObligDD();openModal('disbursementModal');setTimeout(()=>fmtWrapAll($('disbursementModal')),50);}
function editDisbursement(id){
  const d=DATA.disbursement.find(x=>x.id==id);
  if(!d)return;
  openDisbursementModal();
  $('dbModalTitle').textContent='Edit Disbursement';
  $('db_editId').value=id;
  $('db_obligId').value=d.obligation_id;
  dbLoadObligation();
  $('db_date').value=d.date;
  $('db_checkNum').value=d.check_number;
  setFmtInput($('db_net'),d.net_disbursement);
  setFmtInput($('db_tra'),d.tra_amount);
  dbCalc();
  setTimeout(()=>fmtWrapAll($('disbursementModal')),60);
}

async function saveDisbursement(e){
  e.preventDefault();showSaving(true);
  const f=document.getElementById('disbursementForm');const fd=new FormData(f);const editId=$('db_editId').value;
  const obligationId=parseInt(fd.get('obligationId'));const obligation=getObligationById(obligationId);
  if(!obligation){toast('Please select an obligation','error');showSaving(false);return;}
  const net=fmt.parse($('db_net').value);
  if(net<=0){toast('Net disbursement must be greater than zero','error');showSaving(false);return;}
  if(!fd.get('checkNumber')?.trim()){toast('Check/LDDAP-ADA number is required','error');showSaving(false);return;}
  const tra=fmt.parse($('db_tra').value);
  const total=fmt.parse($('db_total').value);
  const data={obligationId,obrNumber:obligation.obr_number,payee:obligation.payee,rcId:obligation.rc_id,date:fd.get('date'),checkNumber:fd.get('checkNumber').trim(),netDisbursement:net,traAmount:tra,totalDisbursement:total,obligationAmount:obligation.obligation_incurred};
  try{if(editId){await BudgetAPI.updateDisbursement(editId,data);toast('Disbursement updated');}else{await BudgetAPI.createDisbursement(data);toast('Disbursement created');}await loadAll();saveClose('disbursementModal');renderAll();}
  catch(err){toast(err.message,'error');}finally{showSaving(false);}
}

async function deleteDisbursement(id){
  const d=DATA.disbursement.find(x=>x.id==id);if(!d)return;
  const ok=await confirm2('Delete Disbursement',`Delete disbursement for "${d.payee}"?`);if(!ok)return;
  try{showSaving(true);await BudgetAPI.deleteDisbursement(id);await loadAll();renderAll();toast('Disbursement deleted','error');}catch(err){toast(err.message,'error');}finally{showSaving(false);}
}

// ══════════════════════════════════════════
