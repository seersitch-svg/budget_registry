// RENDER TABLES
// ══════════════════════════════════════════
const emptyRow=cols=>`<tr class="empty-row"><td colspan="${cols}">No records found.</td></tr>`;

function renderRC(){
  const q=$('rc-search').value.toLowerCase();
  const rows=DATA.rc.filter(r=>(r.responsibility_center||'').toLowerCase().includes(q)||(r.payee||'').toLowerCase().includes(q)||(r.auth_type||'').toLowerCase().includes(q));
  $('rc-count-lbl').textContent=`${rows.length} record${rows.length!==1?'s':''}`;
  $('rc-tbody').innerHTML=rows.length?rows.map(r=>`<tr>
    <td>${fmt.date(r.date)}</td>
    <td><span class="badge ${r.auth_type==='GAA'?'b-blue':r.auth_type==='SARO'?'b-green':'b-yellow'}">${r.auth_type}</span></td>
    <td style="font-family:var(--mono);font-size:11px">${r.auth_reference||'—'}</td>
    <td><strong>${r.payee}</strong></td>
    <td>${r.responsibility_center}</td>
    <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2)">${PROJECT_DATA[r.project_program]?.name||r.project_program||'—'}</td>
    <td>${(r.expense_classes||[]).map(e=>`<span class="badge b-purple" style="margin:1px">${e.split(' - ')[0]}</span>`).join('')||'—'}</td>
    <td><div class="row-actions">
      <button class="act-btn a-view" onclick="viewRecord('rc',${r.id})">View</button>
      <button class="act-btn a-edit" onclick="editRC(${r.id})">Edit</button>
      <button class="act-btn a-del" onclick="deleteRC(${r.id})">Del</button>
    </div></td>
  </tr>`).join(''):emptyRow(8);
}

function renderAllotment(){
  const q=$('al-search').value.toLowerCase();
  const rows=DATA.allotment.filter(a=>{const rc=getRCById(a.rc_id);return(rc?.responsibility_center||'').toLowerCase().includes(q)||(a.fund_cluster||'').toLowerCase().includes(q);});
  $('al-tbody').innerHTML=rows.length?rows.map(a=>{const rc=getRCById(a.rc_id);return`<tr>
    <td><strong>${rc?.responsibility_center||'Unknown RC'}</strong></td>
    <td style="font-size:12px;color:var(--text2)">${a.fund_cluster||'—'}</td>
    <td class="amt">${fmt.cur(a.authorized_appropriation)}</td>
    <td class="amt ${parseFloat(a.adjustment)>=0?'amt-pos':'amt-neg'}">${fmt.cur(a.adjustment)}</td>
    <td class="amt">${fmt.cur(a.adjusted_appropriation)}</td>
    <td class="amt">${fmt.cur(a.allotment_received)}</td>
    <td class="amt ${parseFloat(a.unreleased_appropriation)>0?'amt-neg':''}">${fmt.cur(a.unreleased_appropriation)}</td>
    <td><div class="row-actions">
      <button class="act-btn a-view" onclick="viewRecord('allotment',${a.id})">View</button>
      <button class="act-btn a-edit" onclick="editAllotment(${a.id})">Edit</button>
      <button class="act-btn a-del" onclick="deleteAllotment(${a.id})">Del</button>
    </div></td>
  </tr>`;}).join(''):emptyRow(8);
}

function renderEarmark(){
  const q=$('em-search').value.toLowerCase();
  const rows=DATA.earmark.filter(e=>{const rc=getRCById(e.rc_id);return(e.earmark_number||'').toLowerCase().includes(q)||(rc?.responsibility_center||'').toLowerCase().includes(q)||(e.particulars||'').toLowerCase().includes(q);});
  $('em-tbody').innerHTML=rows.length?rows.map(e=>{
    const rc=getRCById(e.rc_id);
    const fullyObl=e.is_obligated==1||e.is_obligated===true;
    const obligatedAmt=parseFloat(e.obligated_amount)||0;
    const remainingAmt=parseFloat(e.remaining_amount!=null?e.remaining_amount:e.total_amount)||0;
    const isPartial=!fullyObl&&obligatedAmt>0;
    const canEdit=!fullyObl&&obligatedAmt===0;
    const statusBadge=fullyObl
      ?'<span class="badge b-purple">Fully Obligated</span>'
      :isPartial
        ?`<span class="badge b-yellow">Partial</span>`
        :'<span class="badge b-green">Available</span>';
    const amtCell=isPartial
      ?`<span class="amt">${fmt.cur(remainingAmt)}</span> <small style="color:var(--text3)">/ ${fmt.cur(e.total_amount)}</small>`
      :`<span class="amt">${fmt.cur(e.total_amount)}</span>`;
    return`<tr>
    <td>${fmt.date(e.date)}</td>
    <td><strong style="font-family:var(--mono)">${e.earmark_number||'—'}</strong></td>
    <td><span class="badge b-cyan">${e.quarter||'—'}</span></td>
    <td>${rc?.responsibility_center||'Unknown'}</td>
    <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2)">${e.particulars||'—'}</td>
    <td>${amtCell}</td>
    <td>${statusBadge}</td>
    <td><div class="row-actions">
      <button class="act-btn a-view" onclick="viewRecord('earmark',${e.id})">View</button>
      <button class="act-btn a-edit" onclick="editEarmark(${e.id})" ${canEdit?'':'disabled'}>Edit</button>
      <button class="act-btn a-del" onclick="deleteEarmark(${e.id})" ${canEdit?'':'disabled'}>Del</button>
    </div></td>
  </tr>`;}).join(''):emptyRow(8);
}

function renderObligation(){
  const q=$('ob-search').value.toLowerCase();
  const rows=DATA.obligation.filter(o=>{const rc=getRCById(o.rc_id);return(o.obr_number||'').toLowerCase().includes(q)||(o.payee||'').toLowerCase().includes(q)||(rc?.responsibility_center||'').toLowerCase().includes(q);});
  $('ob-tbody').innerHTML=rows.length?rows.map(o=>{
    const rc=getRCById(o.rc_id);
    const disbursed=DATA.disbursement.filter(d=>d.obligation_id==o.id).reduce((s,d)=>s+(parseFloat(d.total_disbursement)||0),0);
    const obligated=parseFloat(o.obligation_incurred)||0;
    const balance=obligated-disbursed;
    const balColor=balance<=0?'color:var(--green)':disbursed>0?'color:var(--yellow)':'';
    return`<tr>
    <td style="white-space:nowrap">${fmt.date(o.date)}</td>
    <td><strong style="font-family:var(--mono);font-size:12px">${o.obr_number||'—'}</strong></td>
    <td><span class="badge b-cyan">${o.quarter||'—'}</span></td>
    <td><span class="badge ${o.obligation_type==='Creditor'?'b-purple':o.obligation_type==='Mandatory'?'b-blue':'b-yellow'}">${o.obligation_type}</span></td>
    <td><strong>${o.payee}</strong></td>
    <td style="color:var(--text2)">${rc?.responsibility_center||'—'}</td>
    <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2)">${o.particulars||'—'}</td>
    <td class="amt" style="text-align:right;font-family:var(--mono);font-weight:600">${fmt.cur(obligated)}</td>
    <td class="amt" style="text-align:right;font-family:var(--mono);font-weight:600;color:var(--cyan)">${disbursed>0?fmt.cur(disbursed):'<span style="color:var(--text3)">—</span>'}</td>
    <td class="amt" style="text-align:right;font-family:var(--mono);font-weight:600;${balColor}">${fmt.cur(balance)}</td>
    <td style="text-align:right"><div class="row-actions" style="justify-content:flex-end">
      <button class="act-btn a-view" onclick="viewRecord('obligation',${o.id})">View</button>
      <button class="act-btn a-print" onclick="openOBRPreview(${o.id})" title="Print OBR Form">🖨 OBR</button>
      <button class="act-btn a-edit" onclick="editObligation(${o.id})">Edit</button>
      <button class="act-btn a-del" onclick="deleteObligation(${o.id})">Del</button>
    </div></td>
  </tr>`;}).join(''):emptyRow(11);
}

function renderDisbursement(){
  const q=$('db-search').value.toLowerCase();
  const rows=DATA.disbursement.filter(d=>(d.obr_number||'').toLowerCase().includes(q)||(d.payee||'').toLowerCase().includes(q)||(d.check_number||'').toLowerCase().includes(q));
  $('db-tbody').innerHTML=rows.length?rows.map(d=>`<tr>
    <td>${fmt.date(d.date)}</td>
    <td><strong style="font-family:var(--mono)">${d.obr_number||'—'}</strong></td>
    <td><strong>${d.payee||'—'}</strong></td>
    <td style="font-family:var(--mono)">${d.check_number||'—'}</td>
    <td class="amt">${fmt.cur(d.net_disbursement)}</td>
    <td class="amt">${fmt.cur(d.tra_amount)}</td>
    <td class="amt amt-pos">${fmt.cur(d.total_disbursement)}</td>
    <td><div class="row-actions">
      <button class="act-btn a-view" onclick="viewRecord('disbursement',${d.id})">View</button>
      <button class="act-btn a-edit" onclick="editDisbursement(${d.id})">Edit</button>
      <button class="act-btn a-del" onclick="deleteDisbursement(${d.id})">Del</button>
    </div></td>
  </tr>`).join(''):emptyRow(8);
}

function renderAll(){renderRC();renderAllotment();renderEarmark();renderObligation();renderDisbursement();updateAll();rptRender();}

// ══════════════════════════════════════════
// VIEW RECORD
// ══════════════════════════════════════════
function viewRecord(type,id){
  let title='',body='';
  if(type==='rc'){const r=DATA.rc.find(x=>x.id==id);if(!r)return;title='Responsibility Center';body=vGrid([
    ['Date',fmt.date(r.date)],
    ['Auth Type',r.auth_type],
    ['Reference',r.auth_reference||'—'],
    ['Payee',r.payee],
    ['RC Name',r.responsibility_center],
    ['Fund Cluster',r.fund_cluster||'—'],
    ['Financing Source',r.financing_source||'—'],
    ['Auth Code',r.auth_code||'—'],
    ['Fund Category',r.fund_category||'—'],
    ['Full Funding Source',r.full_funding_source||'—'],
    ['Department Code',r.dept_code||'—'],
    ['Agency Code',r.agency_code||'—'],
    ['Operating Unit Classification',r.operating_unit||'—'],
    ['Lower Level Operating Unit',r.lower_unit||'—'],
    ['Project',PROJECT_DATA[r.project_program]?.name||r.project_program||'—'],
    ['Expense Classes',(r.expense_classes||[]).join(', ')||'—'],
    ['Account Codes',(r.account_codes||[]).join(', ')||'—'],
    ['Activities',(r.activity_levels||[]).join(', ')||'—'],
    ['Signatories',(r.signatories||[]).map(s=>`${s.name} (${s.position})`).join('; ')||'—'],
  ]);}
  else if(type==='allotment'){const a=DATA.allotment.find(x=>x.id==id);if(!a)return;const rc=getRCById(a.rc_id);title='Allotment';body=vGrid([['RC',rc?.responsibility_center||'—'],['Fund Cluster',a.fund_cluster||'—'],['Authorized Appropriation',fmt.cur(a.authorized_appropriation)],['Adjustment',fmt.cur(a.adjustment)],['Adjusted Appropriation',fmt.cur(a.adjusted_appropriation)],['Allotment Received',fmt.cur(a.allotment_received)],['Unreleased Appropriation',fmt.cur(a.unreleased_appropriation)]]);}

  // ════════════════════════════════════════════════════════
  // EARMARK VIEW — detailed lot/entry breakdown
  // ════════════════════════════════════════════════════════
  else if(type==='earmark'){
    const e=DATA.earmark.find(x=>x.id==id);if(!e)return;
    const rc=getRCById(e.rc_id);
    title='Earmark';
    const fullyObl=e.is_obligated==1||e.is_obligated===true;
    const obligatedAmt=parseFloat(e.obligated_amount)||0;
    const remainingAmt=parseFloat(e.remaining_amount!=null?e.remaining_amount:e.total_amount)||0;
    const isPartial=!fullyObl&&obligatedAmt>0;
    const status=fullyObl?'Fully Obligated':isPartial?`Partial (${fmt.cur(remainingAmt)} remaining)`:'Available';
    const statusColor=fullyObl?'var(--purple)':isPartial?'var(--yellow)':'var(--green)';

    // ── Summary grid ──────────────────────────────────────
    body = `<div class="view-grid" style="margin-bottom:16px;">
      <div class="view-row"><span class="view-label">Date</span><span class="view-val">${fmt.date(e.date)}</span></div>
      <div class="view-row"><span class="view-label">Earmark #</span><span class="view-val" style="font-family:var(--mono);font-weight:700">${e.earmark_number||'—'}</span></div>
      <div class="view-row"><span class="view-label">Quarter</span><span class="view-val"><span class="badge b-cyan">${e.quarter||'—'}</span></span></div>
      <div class="view-row"><span class="view-label">Responsibility Center</span><span class="view-val">${rc?.responsibility_center||'—'}</span></div>
      <div class="view-row" style="grid-column:1/-1"><span class="view-label">Particulars</span><span class="view-val">${e.particulars||'—'}</span></div>
      <div class="view-row"><span class="view-label">Total Amount</span><span class="view-val" style="font-family:var(--mono);font-weight:700;color:var(--text)">${fmt.cur(e.total_amount)}</span></div>
      <div class="view-row"><span class="view-label">Obligated</span><span class="view-val" style="font-family:var(--mono);font-weight:600;color:var(--purple)">${fmt.cur(obligatedAmt)}</span></div>
      <div class="view-row"><span class="view-label">Remaining</span><span class="view-val" style="font-family:var(--mono);font-weight:600;color:var(--green)">${fmt.cur(remainingAmt)}</span></div>
      <div class="view-row"><span class="view-label">Status</span><span class="view-val" style="font-weight:600;color:${statusColor}">${status}</span></div>
    </div>`;

    // ── Lots & Entries breakdown ──────────────────────────
    const lots=e.lots||[];
    if(lots.length>0){
      body += `<div style="margin-top:4px;">
        <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;display:flex;align-items:center;gap:8px;">
          <span>📋 Lots &amp; Entries</span>
          <span style="font-size:10px;font-weight:500;color:var(--text3);text-transform:none;letter-spacing:0">${lots.length} lot${lots.length!==1?'s':''}</span>
        </div>`;

      lots.forEach((lot,li)=>{
        const lotAmt=((lot.items||[]).reduce((s,i)=>s+(parseFloat(i.amount||i.totalCost)||0),0));
        const lotObl=lot.is_obligated===true||lot.is_obligated==1;
        const lotObId=lot.obligation_id;
        const obRecord=lotObId?DATA.obligation.find(o=>o.id==lotObId):null;
        const lotStatusBadge=lotObl
          ?`<span class="badge b-purple" style="font-size:10px">Obligated${obRecord?' – OBR '+obRecord.obr_number:''}</span>`
          :'<span class="badge b-green" style="font-size:10px">Available</span>';
        const cancelBtn=lotObl&&obRecord
          ?`<button class="act-btn a-del" style="font-size:10px;padding:2px 7px;margin-left:4px"
              onclick="emCancelLot(${e.id},${li},${lotObId})">Cancel Lot</button>`
          :'';

        body+=`<div style="border:1px solid var(--border);border-radius:var(--radius-lg);margin-bottom:10px;overflow:hidden;">

          <!-- Lot header -->
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:${lotObl?'var(--purple-light)':'var(--surface)'};border-bottom:1px solid var(--border);">
            <div style="width:26px;height:26px;border-radius:6px;background:${lotObl?'var(--purple-mid)':'var(--green-mid)'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${lotObl?'var(--purple)':'var(--green)'};flex-shrink:0">
              ${lot.lotNumber||li+1}
            </div>
            <span style="font-weight:700;font-size:13px;color:var(--text);flex:1">Lot ${lot.lotNumber||li+1}</span>
            <span style="font-size:11px;color:var(--text3)">${(lot.items||[]).length} entr${(lot.items||[]).length===1?'y':'ies'}</span>
            <span style="font-family:var(--mono);font-weight:700;font-size:13px;color:var(--green)">${fmt.cur(lotAmt)}</span>
            ${lotStatusBadge}${cancelBtn}
          </div>

          <!-- Entry details table -->`;

        const items=lot.items||[];
        if(items.length>0){
          body+=`<div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
              <thead>
                <tr style="background:var(--surface2);">
                  <th style="padding:7px 10px;text-align:center;font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--border);width:32px">#</th>
                  <th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--border);min-width:180px">Particulars</th>
                  <th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--border);white-space:nowrap">Expense Class</th>
                  <th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--border);white-space:nowrap">Account Code</th>
                  <th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--border);white-space:nowrap">Activity</th>
                  <th style="padding:7px 10px;text-align:right;font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--border);white-space:nowrap">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((item,ii)=>{
                  const ecStr=item.expenseClass||'';
                  const ecNum=ecStr.charAt(0);
                  const ecShort=ecStr.startsWith('1')?'1 – PS'
                    :ecStr.startsWith('2')?'2 – MOOE'
                    :ecStr.startsWith('3')?'3 – CO'
                    :ecStr||'—';
                  const ecBadgeCls=ecStr.startsWith('1')?'b-blue':ecStr.startsWith('2')?'b-cyan':ecStr.startsWith('3')?'b-purple':'';
                  const acCode=item.accountCode||item.account_code||'';
                  const acShort=acCode.split('–')[0].trim()||acCode;
                  const rowBg=ii%2===1?'background:var(--surface)':'';
                  return `<tr style="border-bottom:1px solid var(--border);${rowBg}">
                    <td style="padding:8px 10px;text-align:center;color:var(--text3);font-weight:600;font-size:11px">${ii+1}</td>
                    <td style="padding:8px 10px;color:var(--text);line-height:1.5;font-size:12px">${item.particulars||'—'}</td>
                    <td style="padding:8px 10px;white-space:nowrap">
                      ${ecStr
                        ? `<span class="badge ${ecBadgeCls}" style="font-size:10px">${ecShort}</span>
                           <div style="font-size:10px;color:var(--text3);margin-top:2px;max-width:120px;white-space:normal;line-height:1.3">${ecStr}</div>`
                        : '<span style="color:var(--text3)">—</span>'}
                    </td>
                    <td style="padding:8px 10px">
                      ${acCode
                        ? `<span style="font-family:var(--mono);font-size:11px;font-weight:600;color:var(--text);display:block">${acShort}</span>
                           ${acCode!==acShort?`<span style="font-size:10px;color:var(--text3)">${acCode}</span>`:''}`
                        : '<span style="color:var(--text3)">—</span>'}
                    </td>
                    <td style="padding:8px 10px;font-size:11px;color:var(--text2)">${item.activity||'—'}</td>
                    <td style="padding:8px 10px;font-family:var(--mono);font-weight:700;text-align:right;color:var(--text)">${fmt.cur(item.amount||item.totalCost||0)}</td>
                  </tr>`;
                }).join('')}
              </tbody>
              <tfoot>
                <tr style="background:var(--green-light);border-top:2px solid var(--green-mid);">
                  <td colspan="5" style="padding:8px 10px;font-weight:700;font-size:12px;color:var(--green);">Lot ${lot.lotNumber||li+1} Total</td>
                  <td style="padding:8px 10px;font-family:var(--mono);font-weight:700;text-align:right;color:var(--green);font-size:13px;">${fmt.cur(lotAmt)}</td>
                </tr>
              </tfoot>
            </table>
          </div>`;
        } else {
          body+=`<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;font-style:italic">No entries in this lot.</div>`;
        }
        body+='</div>';
      });

      // Grand total row
      const grandTotal=(lots).reduce((s,lot)=>s+(lot.items||[]).reduce((ss,i)=>ss+(parseFloat(i.amount||i.totalCost)||0),0),0);
      body+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--blue-light);border:1px solid var(--blue-mid);border-radius:var(--radius);margin-top:4px;">
        <span style="font-size:13px;font-weight:700;color:var(--blue)">Grand Total (All Lots)</span>
        <span style="font-family:var(--mono);font-size:16px;font-weight:700;color:var(--blue)">${fmt.cur(grandTotal)}</span>
      </div>`;

      body+='</div>';
    } else {
      body+='<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;background:var(--surface);border-radius:var(--radius);border:1px dashed var(--border2)">No lots/entries recorded for this earmark.</div>';
    }
  }

  else if(type==='obligation'){const o=DATA.obligation.find(x=>x.id==id);if(!o)return;const rc=getRCById(o.rc_id);title='Obligation';body=vGrid([['Date',fmt.date(o.date)],['OBR Number',o.obr_number||'—'],['Quarter',o.quarter||'—'],['Type',o.obligation_type],['Payee',o.payee],['RC',rc?.responsibility_center||'—'],['Obligation Incurred',fmt.cur(o.obligation_incurred)],['Account Code',o.account_code||'—'],['Expense Class',o.expense_class||'—'],['Particulars',o.particulars||'—']]);}
  else if(type==='disbursement'){const d=DATA.disbursement.find(x=>x.id==id);if(!d)return;const rc=getRCById(d.rc_id);title='Disbursement';body=vGrid([['Date',fmt.date(d.date)],['OBR Number',d.obr_number||'—'],['Payee',d.payee||'—'],['RC',rc?.responsibility_center||'—'],['Check/LDDAP-ADA #',d.check_number||'—'],['Obligation Amount',fmt.cur(d.obligation_amount)],['Net Disbursement',fmt.cur(d.net_disbursement)],['TRA',fmt.cur(d.tra_amount)],['Total Disbursement',fmt.cur(d.total_disbursement)]]);}

  $('viewTitle').textContent=title;
  $('viewBody').innerHTML=body;
  // Use wider modal for earmarks (they have entry tables)
  const vm=document.getElementById('viewModal');
  const inner=vm?.querySelector('.modal');
  if(inner) inner.style.maxWidth = type==='earmark' ? '960px' : '';

  // Add Print OBR button to footer when viewing obligations
  const viewFooter = vm?.querySelector('.modal-footer');
  if (viewFooter) {
    // Remove any existing print button first
    const existingPrint = viewFooter.querySelector('.view-print-obr-btn');
    if (existingPrint) existingPrint.remove();

    if (type === 'obligation') {
      const printBtn = document.createElement('button');
      printBtn.className = 'btn view-print-obr-btn';
      printBtn.style.cssText = 'background:var(--green-light);color:var(--green);border:1px solid var(--green-mid)';
      printBtn.innerHTML = '🖨 Print OBR Form';
      printBtn.onclick = () => {
        closeModal('viewModal');
        setTimeout(() => openOBRPreview(id), 150);
      };
      // Insert before the Close button
      viewFooter.insertBefore(printBtn, viewFooter.firstChild);
    }
  }

  openModal('viewModal');
}
function vGrid(rows){return`<div class="view-grid">${rows.map(([l,v])=>`<div class="view-row"><span class="view-label">${l}</span><span class="view-val">${v}</span></div>`).join('')}</div>`;}

// ══════════════════════════════════════════
