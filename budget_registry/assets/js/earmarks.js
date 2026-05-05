// EARMARK CRUD  — Per-lot obligated tracking
// ══════════════════════════════════════════
function populateEarmarkRCDD(){
  const s=$('em_rcId');
  const rcWithAl=DATA.allotment.map(a=>a.rc_id);
  s.innerHTML='<option value="">Select RC (must have allotment)</option>';
  DATA.rc.filter(r=>rcWithAl.includes(r.id)).forEach(r=>s.innerHTML+=`<option value="${r.id}">${r.responsibility_center}</option>`);
}

function emUpdateQuarter(){const d=$('em_date').value;if(!d)return;$('em_quarter').value=fmt.qtr(d);if(!$('em_editId').value)$('em_number').value=fmt.emNum(d);}

function emLoadRC(){
  const rcId=$('em_rcId').value;const rc=getRCById(rcId);
  if(!rc){['em_cat2','em_cat3'].forEach(id=>$(id).style.display='none');return;}
  $('em_fundCluster').value=`${rc.fund_cluster} – ${FUND_DATA[rc.fund_cluster]?.name||''}`;
  $('em_authCode').value=rc.auth_code;$('em_fundCat').value=rc.fund_category;$('em_rcName').value=rc.responsibility_center;
  ['em_cat2','em_cat3'].forEach(id=>$(id).style.display='');
  if(!_emLots.length)emAddLot();
  emUpdateTotal();
  emCheckBalance();
}

let _emLots=[];
let _emLotId=0;
let _emSubId=0;

function emAddLot(){
  const lotId=++_emLotId;
  _emLots.push({id:lotId,items:[]});
  const lotIdx=_emLots.length-1;
  _emAddSubToLot(lotIdx);
  emRenderLots();
}

function _emAddSubToLot(lotIdx){
  const subId=++_emSubId;
  _emLots[lotIdx].items.push({id:subId,particulars:'',expenseClass:'',accountCode:'',activity:'',amount:0});
}

function emAddItem(lotIdx){_emAddSubToLot(lotIdx);emRenderLots();}
function emRemoveLot(lotIdx){_emLots.splice(lotIdx,1);emRenderLots();}
function emRemoveItem(lotIdx,itemIdx){_emLots[lotIdx].items.splice(itemIdx,1);if(!_emLots[lotIdx].items.length)_emAddSubToLot(lotIdx);emRenderLots();}

// ── EC helpers for earmark lots ──────────────────────────────
const EM_EC_MAP = {
  '1': '1 - Personnel Services',
  '2': '2 - Maintenance and Other Operating Expenses',
  '3': '3 - Capital Outlay',
};
const EM_EC_LABELS = {
  '1 - Personnel Services':                        {num:'1', label:'1 – Personnel Services'},
  '2 - Maintenance and Other Operating Expenses':  {num:'2', label:'2 – MOOE'},
  '2 - MOOE':                                      {num:'2', label:'2 – MOOE'},
  '3 - Capital Outlay':                            {num:'3', label:'3 – Capital Outlay'},
};

// Get the EC number (1/2/3) from a full EC string
function emECNum(ecStr) {
  return EM_EC_LABELS[ecStr]?.num || (ecStr ? ecStr.charAt(0) : null);
}

// Get account codes that belong to a specific EC number, filtered to RC's registered codes
function emCodesForEC(rcAccountCodes, ecNum) {
  if (!ecNum) return rcAccountCodes;
  const globalCodes = ACCOUNT_CODES[parseInt(ecNum)] || [];
  return rcAccountCodes.filter(code => {
    if (globalCodes.includes(code)) return true;
    const stripped = code.split('–')[0].trim();
    if (ecNum === '1' && stripped.startsWith('5-01')) return true;
    if (ecNum === '2' && stripped.startsWith('5-02')) return true;
    if (ecNum === '3' && stripped.startsWith('5-06')) return true;
    return false;
  });
}

// Called when expense class changes — re-renders to filter account codes
function emOnECChange(li, ii, ecVal) {
  _emLots[li].items[ii].expenseClass = ecVal;
  // Clear account code if it no longer belongs to the new EC
  const rc = getRCById($('em_rcId').value);
  const allCodes = rc?.account_codes || [];
  const ecNum = emECNum(ecVal);
  const validCodes = ecNum ? emCodesForEC(allCodes, ecNum) : allCodes;
  const curCode = _emLots[li].items[ii].accountCode;
  if (curCode && !validCodes.includes(curCode)) {
    _emLots[li].items[ii].accountCode = '';
  }
  emRenderLots();
}

function emRenderLots(){
  const rcId=$('em_rcId').value;const rc=getRCById(rcId);
  const dbActivities=rc?.activity_levels||[];
  const fallbackActivities=RC_ACTIVITIES[rc?.responsibility_center]||[];
  const activities=[...new Set([...dbActivities,...fallbackActivities])];
  const allAccountCodes=rc?.account_codes||[];

  // Determine which expense classes are registered on this RC
  const rcECs = rc?.expense_classes || [];
  const rcECNums = [...new Set(rcECs.map(e => e.charAt(0)).filter(n => ['1','2','3'].includes(n)))];
  const singleEC = rcECNums.length === 1 ? rcECNums[0] : null;

  $('em_lotList').innerHTML=_emLots.map((lot,li)=>`
    <div class="lot-card">
      <div class="lot-card-head">
        <h4>Lot ${li+1}</h4>
        <button type="button" class="btn btn-ghost btn-xs" onclick="emRemoveLot(${li})">Remove Lot</button>
      </div>
      <div class="lot-card-body">
        ${lot.items.map((item,ii)=>{
          // Resolve current EC: stored value or auto if single EC
          const curEC = item.expenseClass || (singleEC ? EM_EC_MAP[singleEC] : '');
          if (singleEC && !item.expenseClass) {
            _emLots[li].items[ii].expenseClass = EM_EC_MAP[singleEC] || '';
          }
          const curECNum = emECNum(curEC);
          const filteredCodes = curECNum ? emCodesForEC(allAccountCodes, curECNum) : allAccountCodes;
          const isAutoEC = singleEC && rcECNums.length === 1;

          // Expense class label for display
          const ecDisplayLabel = curEC
            ? (curEC.startsWith('1') ? '1 – Personnel Services'
               : curEC.startsWith('2') ? '2 – MOOE'
               : curEC.startsWith('3') ? '3 – Capital Outlay' : curEC)
            : '';

          return `
          <div class="sublot-item">
            <div class="sublot-head">
              <span>Entry ${ii+1}</span>
              <button type="button" class="btn btn-ghost btn-xs" onclick="emRemoveItem(${li},${ii})">Remove</button>
            </div>

            <!-- Row 1: Particulars (full width) -->
            <div class="form-grid" style="grid-template-columns:1fr;margin-bottom:10px;">
              <div class="form-group">
                <label class="req">Particulars</label>
                <textarea rows="2" placeholder="Purpose of the procurement"
                  oninput="_emLots[${li}].items[${ii}].particulars=this.value"
                >${item.particulars}</textarea>
              </div>
            </div>

            <!-- Row 2: Expense Class → Account Code → Activity (3 columns) -->
            <div class="form-grid" style="grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px;">

              <!-- Expense Class — always first -->
              <div class="form-group">
                <label class="req">
                  Expense Class
                  ${isAutoEC ? `<span class="tag tag-auto">AUTO</span>` : ''}
                  ${rcECs.length===0 ? '<span style="font-size:10px;color:var(--red)">⚠ None in RC</span>' : ''}
                </label>
                <select onchange="emOnECChange(${li},${ii},this.value)" ${isAutoEC?'disabled':''}>
                  <option value="">Select Expense Class</option>
                  ${rcECNums.length>0
                    ? rcECNums.map(n=>{
                        const fullVal=EM_EC_MAP[n]||'';
                        const sel=curEC===fullVal?'selected':'';
                        return `<option value="${fullVal}" ${sel}>${n} – ${n==='1'?'Personnel Services':n==='2'?'MOOE':'Capital Outlay'}</option>`;
                      }).join('')
                    : `<option value="1 - Personnel Services" ${curEC==='1 - Personnel Services'?'selected':''}>1 – Personnel Services</option>
                       <option value="2 - Maintenance and Other Operating Expenses" ${curEC==='2 - Maintenance and Other Operating Expenses'?'selected':''}>2 – MOOE</option>
                       <option value="3 - Capital Outlay" ${curEC==='3 - Capital Outlay'?'selected':''}>3 – Capital Outlay</option>`
                  }
                </select>
                ${isAutoEC && ecDisplayLabel
                  ? `<small style="color:var(--blue);font-size:10px;margin-top:2px">Auto: ${ecDisplayLabel}</small>`
                  : rcECs.length===0
                  ? `<small style="color:var(--text3);font-size:10px">No EC in RC — all codes shown</small>`
                  : ''}
              </div>

              <!-- Account Code — second, filtered by EC -->
              <div class="form-group">
                <label class="req">
                  Account Code
                  ${curECNum ? `<span style="font-size:10px;color:var(--text3)">(filtered by EC)</span>` : ''}
                </label>
                <select onchange="_emLots[${li}].items[${ii}].accountCode=this.value">
                  <option value="">Select Account Code</option>
                  ${filteredCodes.map(c=>`<option value="${c}" ${item.accountCode===c?'selected':''}>${c}</option>`).join('')}
                </select>
                ${filteredCodes.length===0 && allAccountCodes.length>0
                  ? `<small style="color:var(--yellow);font-size:10px">⚠ No codes for this EC in RC</small>`
                  : allAccountCodes.length===0
                  ? `<small style="color:var(--red);font-size:11px">⚠ No account codes in RC.</small>`
                  : ''}
              </div>

              <!-- Activity Level 2 — third -->
              <div class="form-group">
                <label class="req">Activity Level 2</label>
                <select onchange="_emLots[${li}].items[${ii}].activity=this.value">
                  <option value="">Select Activity</option>
                  ${activities.map(a=>`<option value="${a}" ${item.activity===a?'selected':''}>${a}</option>`).join('')}
                </select>
                ${activities.length===0
                  ? `<small style="color:var(--red);font-size:11px">⚠ No activities in RC.</small>`
                  : ''}
              </div>
            </div>

            <!-- Row 3: Amount (full width) -->
            <div class="form-grid" style="grid-template-columns:1fr;margin-bottom:4px;">
              <div class="form-group">
                <label class="req">Amount</label>
                <input type="text" inputmode="decimal" placeholder="0.00"
                  value="${item.amount||''}"
                  data-fmt="num" autocomplete="off"
                  oninput="_emLots[${li}].items[${ii}].amount=fmt.parse(this.value);emUpdateTotal()">
              </div>
            </div>

          </div>`;
        }).join('')}
        <button type="button" class="btn btn-outline btn-sm" style="margin-top:6px" onclick="emAddItem(${li})">+ Add Entry</button>
      </div>
    </div>`).join('');
  emUpdateTotal();
  setTimeout(()=>fmtWrapAll($('em_lotList')),10);
}

function emUpdateTotal(){
  const total=_emLots.reduce((s,l)=>s+l.items.reduce((ss,i)=>ss+(i.amount||0),0),0);
  $('em_totalBox').style.display='';
  $('em_totalBox').textContent=`Grand Total (editable lots): ${fmt.cur(total)}`;
  emCheckBalance();
}

function emGetParticulars(){return _emLots.flatMap(l=>l.items.map(i=>i.particulars)).filter(Boolean).join(', ');}
function emGetTotal(){return _emLots.reduce((s,l)=>s+l.items.reduce((ss,i)=>ss+(i.amount||0),0),0);}

function emGetLots(){
  return _emLots.map((lot,li)=>({
    lotNumber:lot._origLotNumber||(li+1),
    items:lot.items.map(item=>({
      particulars:item.particulars,
      expenseClass:item.expenseClass||'',
      accountCode:item.accountCode,
      activity:item.activity,
      amount:item.amount,
      totalCost:item.amount
    }))
  }));
}

function openEarmarkModal(){
  document.getElementById('earmarkForm').reset();
  $('em_editId').value='';$('emModalTitle').textContent='Add Earmark';
  _emLots=[];_emLotId=0;_emSubId=0;
  $('em_lotList').innerHTML='';
  ['em_cat2','em_cat3'].forEach(id=>$(id).style.display='none');
  const embb=$('em_balance_bar');if(embb)embb.style.display='none';
  $('em_totalBox').style.display='none';
  $('em_date').value=new Date().toISOString().split('T')[0];
  emUpdateQuarter();
  lockAllOverrideFields();
  populateEarmarkRCDD();openModal('earmarkModal');
}

function editEarmark(id){
  const em=DATA.earmark.find(x=>x.id==id);if(!em)return;

  const lots=em.lots||[];
  const freeLots=lots.filter(l=>!l.is_obligated&&!l.obligation_id);
  const obligatedLots=lots.filter(l=>l.is_obligated||l.obligation_id);

  if(freeLots.length===0 && obligatedLots.length>0){
    toast('Cannot edit: all lots in this earmark are already obligated. Cancel obligations first.','error');
    return;
  }

  openEarmarkModal();
  $('emModalTitle').textContent='Edit Earmark';
  $('em_editId').value=id;
  $('em_date').value=em.date;emUpdateQuarter();
  $('em_number').value=em.earmark_number;
  $('em_rcId').value=em.rc_id;

  const autoNum=fmt.emNum(em.date);
  if(em.earmark_number && em.earmark_number!==autoNum){
    const badge=$('em_number_badge');if(badge)badge.classList.add('show');
  }

  const rc=getRCById(em.rc_id);
  if(rc){
    $('em_fundCluster').value=`${rc.fund_cluster} – ${FUND_DATA[rc.fund_cluster]?.name||''}`;
    $('em_authCode').value=rc.auth_code;
    $('em_fundCat').value=rc.fund_category;
    $('em_rcName').value=rc.responsibility_center;
    ['em_cat2','em_cat3'].forEach(id=>$(id).style.display='');
  }

  if(obligatedLots.length>0){
    const banner=document.createElement('div');
    banner.id='em_partial_notice';
    banner.className='alert alert-info';
    banner.style.marginBottom='12px';
    banner.innerHTML=`ℹ️ <strong>${obligatedLots.length} lot${obligatedLots.length>1?'s are':' is'} already obligated</strong> and cannot be edited. Only free lots are shown below.`;
    const form=document.getElementById('earmarkForm');
    const balBar=$('em_balance_bar');
    if(balBar) form.insertBefore(banner, balBar.nextSibling);
    else form.insertBefore(banner, form.firstChild);
  }

  _emLots=[];
  freeLots.forEach(lot=>{
    const lotId=++_emLotId;
    const items=(lot.items||[]).map(item=>({
      id:++_emSubId,
      particulars:item.particulars||'',
      expenseClass:item.expenseClass||'',
      accountCode:item.accountCode||item.account_code||'',
      activity:item.activity||'',
      amount:parseFloat(item.amount||item.totalCost||0)
    }));
    _emLots.push({
      id:lotId,
      _origLotNumber:lot.lotNumber,
      items:items.length?items:[{id:++_emSubId,particulars:'',expenseClass:'',accountCode:'',activity:'',amount:0}]
    });
  });
  if(!_emLots.length){
    const lotId=++_emLotId;
    _emLots.push({id:lotId,items:[{id:++_emSubId,particulars:'',expenseClass:'',accountCode:'',activity:'',amount:0}]});
  }

  emRenderLots();
  setTimeout(()=>{fmtWrapAll($('earmarkModal'));emCheckBalance();},60);
}

async function saveEarmark(e){
  e.preventDefault();showSaving(true);
  const f=document.getElementById('earmarkForm');const fd=new FormData(f);
  const editId=$('em_editId').value;const rcId=parseInt(fd.get('rcId'));
  if(!getRCById(rcId)){toast('Please select a valid RC','error');showSaving(false);return;}
  if(!_emLots.length){toast('Please add at least one lot/item','error');showSaving(false);return;}
  const editableTotal=emGetTotal();
  if(editableTotal<=0){toast('Total amount must be greater than zero','error');showSaving(false);return;}

  let lotsToSave=emGetLots();
  if(editId){
    const existing=DATA.earmark.find(x=>x.id==editId);
    if(existing){
      const obligatedLots=(existing.lots||[]).filter(l=>l.is_obligated||l.obligation_id);
      lotsToSave=[...obligatedLots, ...lotsToSave];
    }
  }

  const existingEm=editId?DATA.earmark.find(x=>x.id==editId):null;
  const obligatedAmt=parseFloat(existingEm?.obligated_amount||0);
  const grandTotal=obligatedAmt+editableTotal;

  {
    const bal=getRCBalance(rcId,{excludeEarmarkId:editId?parseInt(editId):null,pendingEarmark:grandTotal});
    if(!bal.hasAllotment){toast('No allotment found for this RC. Create an allotment first.','error');showSaving(false);return;}
    if(bal.projected<0){
      const over=fmt.cur(Math.abs(bal.projected));
      toast(`Cannot save: allotment would be exceeded by ${over}.`,'error');
      showSaving(false);return;
    }
  }

  const data={
    date:fd.get('date'),
    quarter:$('em_quarter').value,
    earmarkNumber:$('em_number').value,
    rcId,
    particulars:emGetParticulars()||'No particulars',
    totalAmount:grandTotal,
    lots:lotsToSave
  };

  try{
    if(editId){await BudgetAPI.updateEarmark(editId,data);toast('Earmark updated');}
    else{await BudgetAPI.createEarmark(data);toast('Earmark created');}
    await loadAll();saveClose('earmarkModal');renderAll();
  }
  catch(err){toast(err.message,'error');}
  finally{showSaving(false);}
}

async function deleteEarmark(id){
  const em=DATA.earmark.find(x=>x.id==id);if(!em)return;
  const lots=em.lots||[];
  const hasObligated=lots.some(l=>l.is_obligated||l.obligation_id);
  if(hasObligated){
    toast('Cannot delete: this earmark has obligated lots. Cancel those obligations first.','error');
    return;
  }
  const ok=await confirm2('Delete Earmark',`Delete earmark "${em.earmark_number}"?`);if(!ok)return;
  try{showSaving(true);await BudgetAPI.deleteEarmark(id);await loadAll();renderAll();toast('Earmark deleted','error');}
  catch(err){toast(err.message,'error');}finally{showSaving(false);}
}

// ══════════════════════════════════════════
