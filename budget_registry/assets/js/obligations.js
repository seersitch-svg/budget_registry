// OBLIGATION CRUD — Fixed version
// Fixes:
//  1. parsedEntries scope bug in obEditRestoreCreditor
//  2. obCheckBalance wired to amount oninput for MC types
//  3. Disbursement lookup map to avoid N×M scan
// ══════════════════════════════════════════
function obPopulateRCDD(){const s=$('ob_rcId');s.innerHTML='<option value="">Select RC</option>';DATA.rc.forEach(r=>s.innerHTML+=`<option value="${r.id}">${r.responsibility_center}</option>`);}
function obPopulateEarmarkDD(includeEarmarkId=null){
  const s=$('ob_earmarkId');
  s.innerHTML='<option value="">Select Earmark</option>';
  DATA.earmark.forEach(e=>{
    const isCurrentEdit = includeEarmarkId && e.id == includeEarmarkId;
    const fullyObl = e.is_obligated==1||e.is_obligated===true;
    const remainingAmt = parseFloat(e.remaining_amount!=null?e.remaining_amount:e.total_amount)||0;
    const obligatedAmt = parseFloat(e.obligated_amount)||0;
    const isPartial = !fullyObl && obligatedAmt>0;
    if(!isCurrentEdit && fullyObl) return;
    const rc=getRCById(e.rc_id);
    let label=e.earmark_number;
    if(isCurrentEdit)  label+=' [Current]';
    if(isPartial)      label+=` [Partial – ${fmt.cur(remainingAmt)} remaining]`;
    const amt = isPartial ? remainingAmt : e.total_amount;
    s.innerHTML+=`<option value="${e.id}">${label} – ${rc?.responsibility_center||'?'} (${fmt.cur(amt)})</option>`;
  });
}

function obHandleType(){
  const t=$('ob_type').value;
  const isMC=(t==='Mandatory'||t==='Claims');
  const isCred=(t==='Creditor');
  const isMand=(t==='Mandatory');
  $('ob_rcField').style.display=isMC?'':'none';
  $('ob_earmarkField').style.display=isCred?'':'none';
  $('ob_pojoField').style.display=isCred?'':'none';
  $('ob_rcId').required=isMC;
  $('ob_earmarkId').required=isCred;
  $('ob_pojo').required=isCred;
  $('ob_lotSection').style.display='none';
  $('ob_lotCards').innerHTML='';
  if(typeof _obSelected!=='undefined') _obSelected.clear();
  if(typeof _obLotData!=='undefined') Object.keys(_obLotData).forEach(k=>delete _obLotData[k]);
  const tot=$('ob_selected_total');if(tot)tot.textContent='₱0.00';
  if(!t){$('ob_cat2').style.display='none';$('ob_cat3').style.display='none';return;}
  if(isCred){
    $('ob_cat2').style.display='none';$('ob_cat3').style.display='none';
    $('ob_cat3_earmark_info').style.display='none';$('ob_utility_section').style.display='none';
    $('ob_amount_hint').style.display='none';
    if($('ob_cat3_title'))$('ob_cat3_title').textContent='Obligation Details';
    if($('ob_cat2_title'))$('ob_cat2_title').innerHTML='RC / Fund Details <span class="tag tag-ro" style="margin-left:6px">FROM EARMARK</span>';
  } else if(isMC){
    $('ob_cat2').style.display='';$('ob_cat3').style.display='';
    $('ob_cat3_earmark_info').style.display='none';
    if($('ob_cat2_title'))$('ob_cat2_title').textContent='RC / Fund Details';
    if($('ob_cat3_title'))$('ob_cat3_title').textContent='Obligation Details';
    $('ob_accountCode').disabled=false;
    const actSel=$('ob_activity');
    if(actSel) actSel.innerHTML='<option value="">Select Activity</option>';
    const actLbl=$('ob_act_label');if(actLbl) actLbl.textContent='Activity Level 2';
    const acLbl=$('ob_ac_label');if(acLbl) acLbl.textContent='Account Code';
    $('ob_accountCode').innerHTML='<option value="">Select Account Code</option>';
    const expSel=$('ob_expClass');
    expSel.disabled=false;
    expSel.innerHTML=`<option value="">Select Expense Class</option>
      <option value="1 - Personnel Services">1 – Personnel Services</option>
      <option value="2 - MOOE">2 – Maintenance &amp; Other Operating Expenses</option>
      <option value="3 - Capital Outlay">3 – Capital Outlay</option>`;
    const ecLbl=$('ob_ec_label');if(ecLbl) ecLbl.textContent='Expense Class';
    $('ob_amount_hint').style.display='none';
    $('ob_utility_section').style.display=isMand?'':'none';
    obPopulateACDD(null);
  }
}

function obPopulateACDD(rc) {
  const s = $('ob_accountCode');
  s.innerHTML = '<option value="">Select Account Code</option>';
  const codes = rc?.account_codes?.length ? rc.account_codes : Object.values(ACCOUNT_CODES).flat();
  codes.forEach(code => s.innerHTML += `<option value="${code}">${code}</option>`);
  if (codes.length === 1) {
    s.value = codes[0];
    const lbl = $('ob_ac_label');if(lbl) lbl.innerHTML = 'Account Code <span class="tag tag-auto">AUTO</span>';
    obUpdateACHint(); obDeriveExpenseClassFromAC(codes[0]);
  } else {
    const lbl = $('ob_ac_label');if(lbl) lbl.textContent = 'Account Code';
  }
}

function obLoadRC() {
  const rcId = $('ob_rcId').value;
  const rc = getRCById(rcId);
  if (!rc) return;
  $('ob_rcName').value = rc.responsibility_center;
  $('ob_fundCluster').value = rc.fund_cluster;
  $('ob_authCode').value = rc.auth_code;
  $('ob_accountCode').disabled = false;
  $('ob_expClass').disabled = false;
  $('ob_cat3_earmark_info').style.display = 'none';
  const t = $('ob_type').value;
  $('ob_utility_section').style.display = t==='Mandatory' ? '' : 'none';
  obPopulateACDD(rc);
  obPopulateActivityDD(rc);
  obAutoSetExpenseClass(rc);
  obUpdateACHint();
  obCheckBalance();
}

function obPopulateActivityDD(rc) {
  const sel = $('ob_activity');if(!sel) return;
  const acts = rc?.activity_levels?.length ? rc.activity_levels : (RC_ACTIVITIES[rc?.responsibility_center] || []);
  sel.innerHTML = '<option value="">Select Activity</option>';
  acts.forEach(a => sel.innerHTML += `<option value="${a}">${a}</option>`);
  if (acts.length === 1) {
    sel.value = acts[0];
    const lbl=$('ob_act_label');if(lbl) lbl.innerHTML='Activity Level 2 <span class="tag tag-auto">AUTO</span>';
  } else {
    const lbl=$('ob_act_label');if(lbl) lbl.textContent='Activity Level 2';
  }
}

function obAutoSetExpenseClass(rc) {
  const expSel=$('ob_expClass');if(!expSel||!rc)return;
  const ecs=rc.expense_classes||[];
  const ecMap={'1':'1 - Personnel Services','2':'2 - MOOE','3':'3 - Capital Outlay'};
  const registered=[...new Set(ecs.map(e=>e.charAt(0)).filter(n=>ecMap[n]))];
  if(registered.length===1){
    expSel.value=ecMap[registered[0]];expSel.disabled=true;
    const lbl=$('ob_ec_label');if(lbl)lbl.innerHTML='Expense Class <span class="tag tag-auto">AUTO</span>';
  } else if(registered.length>1){
    expSel.innerHTML='<option value="">Select Expense Class</option>';
    registered.forEach(n=>expSel.innerHTML+=`<option value="${ecMap[n]}">${n==='1'?'1 – Personnel Services':n==='2'?'2 – Maintenance & Other Operating Expenses':'3 – Capital Outlay'}</option>`);
    expSel.disabled=false;
    const lbl=$('ob_ec_label');if(lbl)lbl.textContent='Expense Class';
  } else {
    expSel.innerHTML=`<option value="">Select Expense Class</option>
      <option value="1 - Personnel Services">1 – Personnel Services</option>
      <option value="2 - MOOE">2 – Maintenance & Other Operating Expenses</option>
      <option value="3 - Capital Outlay">3 – Capital Outlay</option>`;
    expSel.disabled=false;
  }
}

function obLoadEarmark() {
  const id=$('ob_earmarkId').value;
  const em=getEarmarkById(parseInt(id));
  if(!em){$('ob_lotSection').style.display='none';$('ob_cat2').style.display='none';$('ob_cat3').style.display='none';return;}
  const rc=getRCById(em.rc_id);
  const lots=em.lots||[];

  // Populate RC / Fund Details (Section 2)
  $('ob_rcName').value=rc?.responsibility_center||'';
  $('ob_fundCluster').value=rc?.fund_cluster||'';
  $('ob_authCode').value=rc?.auth_code||'';
  $('ob_cat2').style.display='';
  $('ob_em_total').value=fmt.cur(em.total_amount);
  $('ob_cat3_earmark_info').style.display='';

  // Populate Account Codes, Activities, and Expense Class from RC (like Mandatory/Claims)
  obPopulateACDD(rc);
  obPopulateActivityDD(rc);
  obAutoSetExpenseClass(rc);

  // Pre-fill payee from earmark RC payee if not yet entered
  if (rc?.payee && !$('ob_payee').value.trim()) {
    $('ob_payee').value = rc.payee;
  }

  if(lots.length===0){
    $('ob_lotSection').style.display='none';obApplyLotToSection3(em,null,1);$('ob_cat3').style.display='';
  } else if(lots.length===1&&(lots[0].items||[]).length<=1){
    $('ob_lotSection').style.display='none';obApplyLotToSection3(em,lots[0],1);$('ob_cat3').style.display='';
  } else {
    $('ob_lotSection').style.display='';obRenderLotCards(em,lots);$('ob_cat3').style.display='none';obClearSection3();
  }
  obCheckBalance();
}

// ══════════════════════════════════════════
// PRINT OBR DOCUMENT — Official Government Form
// Matches Appendix 11: Obligation Request and Status (BURS layout)
// ══════════════════════════════════════════

function openOBRPreview(id) {
  const o = DATA.obligation.find(x => x.id == id);
  if (!o) return;

  const rc          = getRCById(o.rc_id);
  const prefs       = JSON.parse(localStorage.getItem('budget_registry_prefs') || '{}');
  const agency      = prefs.agencyName || 'Republic of the Philippines';
  const region      = prefs.region     || '';
  const office      = prefs.office     || '';
  const address1    = prefs.address1   || '';

  const signatories = rc?.signatories || [];
  const sigA        = signatories[0]  || { name: '', position: '' };
  const sigB        = signatories[1]  || { name: '', position: '' };

  // Build entry rows — for Creditor types pull per-lot entries, otherwise single row
  let entryRows = [];
  if (o.obligation_type === 'Creditor') {
    let entries = [];
    try {
      const raw = o.selected_entries || '[]';
      entries = Array.isArray(raw) ? raw : JSON.parse(raw);
    } catch(e) { entries = []; }

    if (entries.length > 0) {
      // Group by lotIdx so we show one row per lot with its obligation amount
      const byLot = new Map();
      entries.forEach(en => {
        const k = en.lotIdx ?? 0;
        if (!byLot.has(k)) byLot.set(k, { particulars: [], accountCode: en.accountCode || '', activity: en.activity || '', expenseClass: en.expenseClass || '', obAmt: en.obligationIncurred ?? null });
        byLot.get(k).particulars.push(en.particulars || '');
        if (byLot.get(k).obAmt === null && en.obligationIncurred != null) byLot.get(k).obAmt = parseFloat(en.obligationIncurred);
      });
      byLot.forEach((lot, lotIdx) => {
        entryRows.push({
          rc: rc?.responsibility_center || '',
          particulars: lot.particulars.filter(Boolean).join('; '),
          mfoPap: o.activity || lot.activity || '',
          uacsCode: o.account_code || lot.accountCode || '',
          amount: (lot.obAmt ?? parseFloat(o.obligation_incurred)) || 0,
        });
      });
    }
  }

  // Fallback: single-row entry for Mandatory / Claims / Creditor with no entries
  if (entryRows.length === 0) {
    entryRows.push({
      rc: rc?.responsibility_center || '',
      particulars: o.particulars || '',
      mfoPap: o.activity || '',
      uacsCode: o.account_code || '',
      amount: parseFloat(o.obligation_incurred) || 0,
    });
  }

  const totalAmt = entryRows.reduce((s, r) => s + r.amount, 0);

  // Disbursements for Section C (Status of Utilization)
  const disbs = DATA.disbursement.filter(d => d.obligation_id === o.id);
  const totalDisb = disbs.reduce((s, d) => s + (parseFloat(d.total_disbursement) || 0), 0);
  const payable   = parseFloat(o.obligation_incurred) || 0;
  const balNotYet = payable - totalDisb;

  // Render the entry rows (padded to at least 5 rows for the form look)
  const ENTRY_MIN_ROWS = 6;
  let entryHtml = entryRows.map(r => `
    <tr>
      <td style="border:1px solid #000;padding:3px 5px;font-size:8.5pt;vertical-align:top;min-width:80px">${r.rc}</td>
      <td style="border:1px solid #000;padding:3px 5px;font-size:8.5pt;vertical-align:top">${r.particulars}</td>
      <td style="border:1px solid #000;padding:3px 5px;font-size:8.5pt;vertical-align:top;text-align:center;min-width:70px">${r.mfoPap}</td>
      <td style="border:1px solid #000;padding:3px 5px;font-size:8.5pt;vertical-align:top;text-align:center;min-width:120px">${r.uacsCode}</td>
      <td style="border:1px solid #000;padding:3px 5px;font-size:8.5pt;vertical-align:top;text-align:right;min-width:80px;font-family:Courier,monospace">${r.amount > 0 ? r.amount.toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2}) : ''}</td>
    </tr>`).join('');

  // Blank filler rows
  const fillerCount = Math.max(0, ENTRY_MIN_ROWS - entryRows.length);
  for (let i = 0; i < fillerCount; i++) {
    entryHtml += `<tr>
      <td style="border:1px solid #000;padding:3px 5px;height:22px">&nbsp;</td>
      <td style="border:1px solid #000;padding:3px 5px">&nbsp;</td>
      <td style="border:1px solid #000;padding:3px 5px">&nbsp;</td>
      <td style="border:1px solid #000;padding:3px 5px">&nbsp;</td>
      <td style="border:1px solid #000;padding:3px 5px">&nbsp;</td>
    </tr>`;
  }

  // Disbursement rows for Section C
  let disbHtml = disbs.length ? disbs.map(d => `
    <tr>
      <td style="border:1px solid #000;padding:3px 5px;font-size:8pt">${fmt.date(d.date)}</td>
      <td style="border:1px solid #000;padding:3px 5px;font-size:8pt" colspan="3">${d.check_number || '—'}</td>
      <td style="border:1px solid #000;padding:3px 5px;font-size:8pt;text-align:right;font-family:Courier,monospace">${(parseFloat(d.total_disbursement)||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
      <td style="border:1px solid #000;padding:3px 5px;font-size:8pt;text-align:right"></td>
      <td style="border:1px solid #000;padding:3px 5px;font-size:8pt;text-align:right;font-family:Courier,monospace">${(parseFloat(d.net_disbursement)||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
      <td style="border:1px solid #000;padding:3px 5px;font-size:8pt;text-align:right"></td>
      <td style="border:1px solid #000;padding:3px 5px;font-size:8pt;text-align:right"></td>
    </tr>`).join('') : `
    <tr>
      <td style="border:1px solid #000;padding:3px 5px;height:22px">&nbsp;</td>
      <td style="border:1px solid #000" colspan="3">&nbsp;</td>
      <td style="border:1px solid #000">&nbsp;</td>
      <td style="border:1px solid #000">&nbsp;</td>
      <td style="border:1px solid #000">&nbsp;</td>
      <td style="border:1px solid #000;text-align:right;padding:3px 5px;font-size:8pt;font-family:Courier,monospace">${payable.toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
      <td style="border:1px solid #000">&nbsp;</td>
    </tr>`;

  // ── Inject the preview overlay ──────────────────────────────
  // Remove any existing OBR preview
  const existing = document.getElementById('obrPreviewOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'obrPreviewOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:1000;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto;backdrop-filter:blur(2px)';

  overlay.innerHTML = `
    <!-- Toolbar -->
    <div style="position:fixed;top:0;left:0;right:0;height:52px;background:#1e3a5f;display:flex;align-items:center;justify-content:space-between;padding:0 24px;z-index:1001;box-shadow:0 2px 8px rgba(0,0,0,.3)">
      <div style="display:flex;align-items:center;gap:12px">
        <span style="color:white;font-weight:700;font-size:14px">🖨 OBR Preview</span>
        <span style="color:#93c5fd;font-family:monospace;font-size:13px;font-weight:600">${o.obr_number}</span>
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="printOBRForm()" style="background:#2563eb;color:white;border:none;border-radius:7px;padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px">
          🖨 Print
        </button>
        <button onclick="document.getElementById('obrPreviewOverlay').remove()" style="background:rgba(255,255,255,.15);color:white;border:1px solid rgba(255,255,255,.25);border-radius:7px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer">
          ✕ Close
        </button>
      </div>
    </div>

    <!-- OBR Form Paper -->
    <div id="obrFormPaper" style="margin-top:60px;background:white;width:270mm;min-height:350mm;padding:12mm 14mm;box-shadow:0 8px 40px rgba(0,0,0,.25);font-family:Arial,sans-serif;font-size:9pt;color:#000;position:relative">

      <!-- Appendix label -->
      <div style="text-align:right;font-size:8pt;margin-bottom:2px">Appendix 11</div>

      <!-- Agency header row: agency on left, OBR No + Date + Fund Cluster on right -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:0">
        <tr>
          <td style="width:60%;vertical-align:top;padding-bottom:2px">
            <div style="font-size:8.5pt;font-weight:bold;text-transform:uppercase">${agency}</div>
            ${region ? `<div style="font-size:8pt">${region}</div>` : ''}
            ${address1 ? `<div style="font-size:8pt">${address1}</div>` : ''}
          </td>
          <td style="width:40%;vertical-align:top;font-size:8.5pt">
            <table style="width:100%">
              <tr><td style="white-space:nowrap;padding-bottom:3px">OBR No. : <span style="display:inline-block;min-width:120px;border-bottom:1px solid #000;font-weight:bold;font-family:Courier,monospace">&nbsp;${o.obr_number}&nbsp;</span></td></tr>
              <tr><td style="white-space:nowrap;padding-bottom:3px">Date : <span style="display:inline-block;min-width:130px;border-bottom:1px solid #000">&nbsp;${fmt.date(o.date)}&nbsp;</span></td></tr>
              <tr><td style="white-space:nowrap">Fund Cluster : <span style="display:inline-block;min-width:110px;border-bottom:1px solid #000">&nbsp;${rc?.fund_cluster || ''}&nbsp;</span></td></tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Title bar -->
      <div style="text-align:center;font-size:11pt;font-weight:bold;text-transform:uppercase;border:2px solid #000;padding:5px;margin:6px 0;letter-spacing:.04em">
        OBLIGATION REQUEST AND STATUS
      </div>

      <!-- Payee / Office / Address -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:0;font-size:8.5pt">
        <tr>
          <td style="white-space:nowrap;width:110px;padding:3px 0">Payee :</td>
          <td style="border-bottom:1px solid #000;padding:3px 6px;font-weight:bold">${o.payee}</td>
        </tr>
        <tr>
          <td style="white-space:nowrap;padding:3px 0">Office :</td>
          <td style="border-bottom:1px solid #000;padding:3px 6px">${office || rc?.responsibility_center || ''}</td>
        </tr>
        <tr>
          <td style="white-space:nowrap;padding:3px 0">Address :</td>
          <td style="border-bottom:1px solid #000;padding:3px 6px">${address1}</td>
        </tr>
      </table>

      <!-- Entry table header -->
      <table style="width:100%;border-collapse:collapse;margin-top:8px">
        <thead>
          <tr style="background:#e8e8e8">
            <th style="border:1px solid #000;padding:4px 5px;font-size:8pt;text-align:center;width:14%">Responsibility<br>Center</th>
            <th style="border:1px solid #000;padding:4px 5px;font-size:8pt;text-align:center">Particulars</th>
            <th style="border:1px solid #000;padding:4px 5px;font-size:8pt;text-align:center;width:10%">MFO/PAP</th>
            <th style="border:1px solid #000;padding:4px 5px;font-size:8pt;text-align:center;width:18%">UACS Object Code /<br>Expenditures</th>
            <th style="border:1px solid #000;padding:4px 5px;font-size:8pt;text-align:center;width:12%">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${entryHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4" style="border:1px solid #000;padding:4px 8px;font-size:8.5pt;text-align:right;font-weight:bold">Total</td>
            <td style="border:1px solid #000;padding:4px 5px;font-size:8.5pt;text-align:right;font-weight:bold;font-family:Courier,monospace">${totalAmt.toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
          </tr>
        </tfoot>
      </table>

      <!-- Certification blocks A and B -->
      <table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:8.5pt">
        <tr style="vertical-align:top">
          <td style="width:50%;padding-right:10px">
            <div style="font-weight:bold;margin-bottom:4px">A.</div>
            <div>Certified:</div>
            <div style="margin-top:4px;line-height:1.5">
              Charges to appropriation/budget necessary,<br>
              lawful and under my direct supervision; and supporting<br>
              documents valid, proper and legal
            </div>
            <div style="margin-top:22px">
              <div style="display:flex;gap:8px;margin-bottom:4px"><span style="white-space:nowrap">Signature :</span><span style="flex:1;border-bottom:1px solid #000">&nbsp;${sigA.name ? '' : ''}</span></div>
              <div style="margin-left:80px;font-size:8pt;font-weight:bold">${sigA.name || ''}</div>
              <div style="display:flex;gap:8px;margin-top:8px;margin-bottom:4px"><span style="white-space:nowrap">Printed Name :</span><span style="flex:1;border-bottom:1px solid #000">&nbsp;</span></div>
              <div style="margin-left:104px;font-size:7.5pt">${sigA.name || ''}</div>
              <div style="display:flex;gap:8px;margin-top:8px;margin-bottom:4px"><span style="white-space:nowrap">Position :</span><span style="flex:1;border-bottom:1px solid #000">&nbsp;</span></div>
              <div style="margin-left:62px;font-size:7.5pt">${sigA.position || 'Head, Requesting Office/Authorized Representative'}</div>
              <div style="display:flex;gap:8px;margin-top:8px"><span style="white-space:nowrap">Date :</span><span style="flex:1;border-bottom:1px solid #000">&nbsp;</span></div>
            </div>
          </td>
          <td style="width:50%;padding-left:10px;border-left:1px solid #ccc">
            <div style="font-weight:bold;margin-bottom:4px">B.</div>
            <div>Certified:</div>
            <div style="margin-top:4px;line-height:1.5">
              Budget available and utilized for<br>
              the purpose/adjustment necessary as<br>
              indicated above
            </div>
            <div style="margin-top:22px">
              <div style="display:flex;gap:8px;margin-bottom:4px"><span style="white-space:nowrap">Signature :</span><span style="flex:1;border-bottom:1px solid #000">&nbsp;</span></div>
              <div style="margin-left:80px;font-size:8pt;font-weight:bold">${sigB.name || ''}</div>
              <div style="display:flex;gap:8px;margin-top:8px;margin-bottom:4px"><span style="white-space:nowrap">Printed Name :</span><span style="flex:1;border-bottom:1px solid #000">&nbsp;</span></div>
              <div style="margin-left:104px;font-size:7.5pt">${sigB.name || ''}</div>
              <div style="display:flex;gap:8px;margin-top:8px;margin-bottom:4px"><span style="white-space:nowrap">Position :</span><span style="flex:1;border-bottom:1px solid #000">&nbsp;</span></div>
              <div style="margin-left:62px;font-size:7.5pt">${sigB.position || 'Head, Budget Division/Unit/Authorized Representative'}</div>
              <div style="display:flex;gap:8px;margin-top:8px"><span style="white-space:nowrap">Date :</span><span style="flex:1;border-bottom:1px solid #000">&nbsp;</span></div>
            </div>
          </td>
        </tr>
      </table>

      <!-- Section C: Status of Utilization -->
      <div style="margin-top:14px">
        <div style="font-size:8.5pt;margin-bottom:4px"><strong>C. &nbsp; STATUS OF UTILIZATION</strong></div>
        <table style="width:100%;border-collapse:collapse;font-size:8pt">
          <thead>
            <tr style="background:#e8e8e8">
              <th rowspan="2" style="border:1px solid #000;padding:3px 5px;text-align:center;width:9%">Date</th>
              <th rowspan="2" style="border:1px solid #000;padding:3px 5px;text-align:center;width:20%">Particulars</th>
              <th rowspan="2" style="border:1px solid #000;padding:3px 5px;text-align:center;width:14%">BURS/JEV/RCI/<br>RADAI/RTRAI No.</th>
              <th colspan="2" style="border:1px solid #000;padding:3px 5px;text-align:center;width:24%">Amount</th>
              <th rowspan="2" style="border:1px solid #000;padding:3px 5px;text-align:center;width:10%">Payment</th>
              <th colspan="2" style="border:1px solid #000;padding:3px 5px;text-align:center;width:23%">Balance</th>
            </tr>
            <tr style="background:#e8e8e8">
              <th style="border:1px solid #000;padding:3px 5px;text-align:center">Utilization<br>(a)</th>
              <th style="border:1px solid #000;padding:3px 5px;text-align:center">Payable<br>(b)</th>
              <th style="border:1px solid #000;padding:3px 5px;text-align:center">Not Yet Due<br>(a-b)</th>
              <th style="border:1px solid #000;padding:3px 5px;text-align:center">Due and<br>Demandable<br>(b-c)</th>
            </tr>
          </thead>
          <tbody>
            ${disbHtml}
            <!-- Totals / initial obligation row when no disbs -->
            ${disbs.length === 0 ? '' : `
            <tr>
              <td colspan="3" style="border:1px solid #000;padding:3px 5px;font-weight:bold;text-align:right">Total</td>
              <td style="border:1px solid #000;padding:3px 5px;text-align:right;font-family:Courier,monospace">${totalDisb.toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
              <td style="border:1px solid #000;padding:3px 5px;text-align:right;font-family:Courier,monospace">${payable.toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
              <td style="border:1px solid #000;padding:3px 5px"></td>
              <td style="border:1px solid #000;padding:3px 5px;text-align:right;font-family:Courier,monospace">${balNotYet.toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
              <td style="border:1px solid #000;padding:3px 5px"></td>
            </tr>`}
            <!-- Obligation incurred row (always shows) -->
            <tr>
              <td colspan="3" style="border:1px solid #000;padding:3px 5px;font-size:7.5pt;text-align:right;font-style:italic;color:#555">Obligation Incurred:</td>
              <td style="border:1px solid #000;padding:3px 5px"></td>
              <td style="border:1px solid #000;padding:3px 5px;text-align:right;font-weight:bold;font-family:Courier,monospace">${payable.toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
              <td style="border:1px solid #000;padding:3px 5px"></td>
              <td style="border:1px solid #000;padding:3px 5px"></td>
              <td style="border:1px solid #000;padding:3px 5px"></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Footer note -->
      <div style="margin-top:10px;font-size:7pt;color:#555;text-align:center;border-top:1px dashed #ccc;padding-top:6px">
        Budget Registry System v3.0 &nbsp;·&nbsp; Printed: ${new Date().toLocaleString('en-PH')}
        &nbsp;·&nbsp; ${o.obligation_type} Obligation
      </div>

    </div><!-- end paper -->
  `;

  // Inject into body
  document.body.appendChild(overlay);

  // Close on backdrop click
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });
  // Close on Escape
  const escHandler = e => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);
}

// ── Trigger actual print of the form paper ──────────────────
function printOBRForm() {
  const paper = document.getElementById('obrFormPaper');
  if (!paper) return;
  const html = paper.outerHTML;
  const w = window.open('', '_blank', 'width=960,height=800');
  w.document.write(`<!DOCTYPE html><html><head>
    <title>OBR Form</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{background:white;font-family:Arial,sans-serif;}
      @media print{@page{size:A4;margin:10mm;} body{margin:0;}}
    </style>
  </head><body>${html}<script>window.onload=function(){window.focus();window.print();window.onafterprint=function(){window.close();};};<\/script></body></html>`);
  w.document.close();
}

// Legacy alias kept for any existing calls
function printOBR(id) { openOBRPreview(id); }

// ══════════════════════════════════════════
// MULTI-SELECT LOT/ENTRY SYSTEM
// ══════════════════════════════════════════
const _obSelected = new Set();
const _obLotData = {};

function obRenderLotCards(em, lots, skipClear=false) {
  if(!skipClear){_obSelected.clear();Object.keys(_obLotData).forEach(k=>delete _obLotData[k]);}
  const container=$('ob_lotCards');
  container.innerHTML=lots.map((lot,li)=>{
    const items=lot.items||[];
    const lotTotal=items.reduce((s,i)=>s+(parseFloat(i.amount||i.totalCost)||0),0);
    const lotLabel=`Lot ${lot.lotNumber||li+1}`;
    const lotObligated=lot.is_obligated===true||lot.is_obligated===1;
    const lotObligatedBy=lot.obligation_id||null;
    const isEditingThatObligation=skipClear&&lotObligatedBy&&lotObligatedBy==($('ob_editId').value||0);
    const lotLocked=lotObligated&&!isEditingThatObligation;
    const lotCodes=[...new Set(items.map(i=>i.accountCode||i.account_code||'').filter(Boolean))];
    const lotActivities=[...new Set(items.map(i=>i.activity||'').filter(Boolean))];
    const lotCode=lotCodes.length===1?lotCodes[0]:(lotCodes[0]||'');
    const lotActivity=lotActivities.length===1?lotActivities[0]:(lotActivities[0]||'');
    const lotEC=lotCode.startsWith('5-01')?'1 - Personnel Services':lotCode.startsWith('5-02')?'2 - MOOE':lotCode.startsWith('5-06')?'3 - Capital Outlay':'';
    const entriesHtml=items.map((item,ii)=>{
      const amt=parseFloat(item.amount||item.totalCost)||0;
      return `<div class="ob-entry-row${lotLocked?' ob-entry-locked':''}" id="ob_erow_${li}_${ii}" onclick="obToggleEntry(${li},${ii},event)">
        <input type="checkbox" class="ob-entry-check" id="ob_eck_${li}_${ii}" onchange="obToggleEntry(${li},${ii},event)" onclick="event.stopPropagation()" ${lotLocked?'disabled':''}>
        <span class="ob-entry-num">${ii+1}</span>
        <span class="ob-entry-particulars">${item.particulars||'—'}</span>
        <span class="ob-entry-code" title="${item.accountCode||item.account_code||''}">${item.accountCode||item.account_code||'—'}</span>
        <span class="ob-entry-activity" title="${item.activity||''}">${item.activity||'—'}</span>
        <span class="ob-entry-amt">${fmt.cur(amt)}</span>
      </div>`;
    }).join('');
    const savedLotData=_obLotData[String(li)]||{};
    const lotInputPanel=`
      <div class="ob-lot-input-panel" id="ob_lot_panel_${li}" style="display:none;">
        <div style="font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)">${lotLabel} — Obligation Details</div>
        <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group">
            <label class="req" style="font-size:11px">Obligation Incurred</label>
            <input type="text" inputmode="decimal" data-fmt="num" autocomplete="off" id="ob_lot_amt_${li}" placeholder="0.00"
              value="${savedLotData.obligationIncurred!=null?fmt.num(savedLotData.obligationIncurred):fmt.num(lotTotal)}"
              oninput="obLotDataChange(${li})" style="font-family:var(--mono)">
            <small style="color:var(--text3);font-size:10px;margin-top:2px">Max: <span style="font-weight:600">${fmt.cur(lotTotal)}</span></small>
            <small id="ob_lot_amt_err_${li}" style="color:var(--red);font-size:10px;display:none">Cannot exceed lot total of ${fmt.cur(lotTotal)}</small>
          </div>
          <div class="form-group">
            <label style="font-size:11px">Account Code <span class="tag tag-ro">AUTO</span></label>
            <input type="text" id="ob_lot_ac_${li}" value="${savedLotData.accountCode||lotCode}" readonly style="background:var(--surface);color:var(--text2);font-size:12px" title="${lotCodes.join(', ')||'No account code in earmark'}">
          </div>
          <div class="form-group">
            <label style="font-size:11px">Activity Level 2</label>
            <input type="text" id="ob_lot_act_${li}" value="${savedLotData.activity!=null?savedLotData.activity:lotActivity}" placeholder="Enter or edit activity" oninput="obLotDataChange(${li})" style="font-size:12px">
          </div>
          <div class="form-group">
            <label style="font-size:11px">Expense Class <span class="tag tag-ro">AUTO</span></label>
            <input type="text" id="ob_lot_ec_${li}" value="${savedLotData.expenseClass||lotEC}" readonly style="background:var(--surface);color:var(--text2);font-size:12px">
          </div>
        </div>
      </div>`;
    return `<div class="ob-lot-card" id="ob_lotcard_${li}">
      <div class="ob-lot-card-head ${lotLocked?'ob-lot-locked':''}" onclick="${lotLocked?'':'obToggleLotAll('+li+')'}">
        <input type="checkbox" class="ob-lot-check" id="ob_lck_${li}" onchange="obToggleLotAll(${li})" onclick="event.stopPropagation()" ${lotLocked?'disabled':''}>
        <span class="ob-lot-title">${lotLabel}</span>
        <span class="ob-lot-meta">${items.length} entr${items.length===1?'y':'ies'}</span>
        ${lotLocked?'<span class="badge b-purple" style="font-size:10px;padding:1px 7px">Already Obligated</span>':'<span class="ob-lot-sel-count" id="ob_lsel_'+li+'"></span>'}
        <span class="ob-lot-total">${fmt.cur(lotTotal)}</span>
      </div>
      <div class="ob-lot-body">
        <div style="display:grid;grid-template-columns:auto auto 1fr auto auto auto;gap:8px;padding:6px 14px;font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;background:var(--surface);border-bottom:1px solid var(--border);">
          <span></span><span>#</span><span>Particulars</span><span>Account Code</span><span>Activity</span><span>Amount</span>
        </div>
        ${entriesHtml}
        <div class="ob-lot-foot"><span class="ob-lot-foot-sel" id="ob_lfoot_${li}">None selected</span><span class="ob-lot-foot-total">Lot Total: ${fmt.cur(lotTotal)}</span></div>
        ${lotInputPanel}
      </div>
    </div>`;
  }).join('');
  obUpdateSelectionSummary(em,lots);
}

function obLotDataChange(li){
  const em=getEarmarkById(parseInt($('ob_earmarkId').value));
  const lots=em?.lots||[];const lot=lots[li];
  const lotTotal=(lot?.items||[]).reduce((s,i)=>s+(parseFloat(i.amount||i.totalCost)||0),0);
  const amtInput=$(`ob_lot_amt_${li}`);const actInput=$(`ob_lot_act_${li}`);
  const acInput=$(`ob_lot_ac_${li}`);const ecInput=$(`ob_lot_ec_${li}`);const errEl=$(`ob_lot_amt_err_${li}`);
  const enteredAmt=fmt.parse(amtInput?.value||'0');
  if(errEl){if(enteredAmt>lotTotal+0.005){errEl.style.display='';if(amtInput)amtInput.style.borderColor='var(--red)';} else {errEl.style.display='none';if(amtInput)amtInput.style.borderColor='';}}
  if(!_obLotData[String(li)])_obLotData[String(li)]={};
  _obLotData[String(li)].obligationIncurred=Math.min(enteredAmt,lotTotal);
  _obLotData[String(li)].activity=actInput?.value||'';
  _obLotData[String(li)].accountCode=acInput?.value||'';
  _obLotData[String(li)].expenseClass=ecInput?.value||'';
  obUpdateSelectionSummary(em,lots);
}

function obToggleLotPanel(li,show){
  const panel=$(`ob_lot_panel_${li}`);
  if(panel){
    panel.style.display=show?'':'none';
    if(show){
      const em=getEarmarkById(parseInt($('ob_earmarkId').value));
      const lots=em?.lots||[];const lot=lots[li];
      if(lot&&!_obLotData[String(li)]){
        const items=lot.items||[];
        const lotTotal=items.reduce((s,i)=>s+(parseFloat(i.amount||i.totalCost)||0),0);
        const code=items.find(i=>i.accountCode||i.account_code)?.accountCode||items.find(i=>i.account_code)?.account_code||'';
        const act=items.find(i=>i.activity)?.activity||'';
        const ec=code.startsWith('5-01')?'1 - Personnel Services':code.startsWith('5-02')?'2 - MOOE':code.startsWith('5-06')?'3 - Capital Outlay':'';
        _obLotData[String(li)]={obligationIncurred:lotTotal,accountCode:code,activity:act,expenseClass:ec};
        const amtI=$(`ob_lot_amt_${li}`);const actI=$(`ob_lot_act_${li}`);
        if(amtI&&!amtI.value)amtI.value=fmt.num(lotTotal);
        if(actI&&!actI.value)actI.value=act;
        fmtInputWrap(amtI);
      }
    }
  }
}

function obToggleEntry(li,ii,event){
  if(event&&event.target.classList.contains('ob-entry-check')&&event.type==='click')return;
  const key=`${li}:${ii}`;const cb=$(`ob_eck_${li}_${ii}`);const row=$(`ob_erow_${li}_${ii}`);
  if(_obSelected.has(key)){_obSelected.delete(key);if(cb)cb.checked=false;if(row)row.classList.remove('entry-checked');}
  else{_obSelected.add(key);if(cb)cb.checked=true;if(row)row.classList.add('entry-checked');}
  const emId=parseInt($('ob_earmarkId').value);const em=getEarmarkById(emId);const lots=em?.lots||[];
  obUpdateLotHeader(li,lots[li]);
  const lot=lots[li];const anySelected=(lot?.items||[]).some((_,ii)=>_obSelected.has(`${li}:${ii}`));
  obToggleLotPanel(li,anySelected);obUpdateSelectionSummary(em,lots);
}

function obToggleLotAll(li){
  const emId=parseInt($('ob_earmarkId').value);const em=getEarmarkById(emId);const lots=em?.lots||[];
  const lot=lots[li];if(!lot)return;const items=lot.items||[];
  const allSelected=items.every((_,ii)=>_obSelected.has(`${li}:${ii}`));
  items.forEach((_,ii)=>{
    const key=`${li}:${ii}`;const cb=$(`ob_eck_${li}_${ii}`);const row=$(`ob_erow_${li}_${ii}`);
    if(allSelected){_obSelected.delete(key);if(cb)cb.checked=false;if(row)row.classList.remove('entry-checked');}
    else{_obSelected.add(key);if(cb)cb.checked=true;if(row)row.classList.add('entry-checked');}
  });
  const lotCb=$(`ob_lck_${li}`);if(lotCb)lotCb.checked=!allSelected;
  obUpdateLotHeader(li,lot);
  const anySelected=items.some((_,ii)=>_obSelected.has(`${li}:${ii}`));
  obToggleLotPanel(li,anySelected);obUpdateSelectionSummary(em,lots);
}

function obUpdateLotHeader(li,lot){
  if(!lot)return;const items=lot.items||[];
  const selCount=items.filter((_,ii)=>_obSelected.has(`${li}:${ii}`)).length;
  const selTotal=items.reduce((s,item,ii)=>_obSelected.has(`${li}:${ii}`)?s+(parseFloat(item.amount||item.totalCost)||0):s,0);
  const card=$(`ob_lotcard_${li}`);const selBadge=$(`ob_lsel_${li}`);const foot=$(`ob_lfoot_${li}`);const lotCb=$(`ob_lck_${li}`);
  if(card)card.classList.toggle('has-selection',selCount>0);
  if(selBadge)selBadge.textContent=selCount>0?`${selCount} selected`:'';
  if(foot)foot.textContent=selCount>0?`${selCount} of ${items.length} selected — ${fmt.cur(selTotal)}`:'None selected';
  if(lotCb){lotCb.checked=selCount===items.length&&items.length>0;lotCb.indeterminate=selCount>0&&selCount<items.length;}
}

function obGetSelectedEntries(lots){
  const selected=[];const processedLots=new Set();
  lots.forEach((lot,li)=>{
    const lotKey=String(li);const lotData=_obLotData[lotKey]||{};const lotItems=lot.items||[];
    const lotTotal=lotItems.reduce((s,i)=>s+(parseFloat(i.amount||i.totalCost)||0),0);
    const hasSelection=lotItems.some((_,ii)=>_obSelected.has(`${li}:${ii}`));
    if(!hasSelection)return;
    const lotObligationAmt=lotData.obligationIncurred!=null?Math.min(parseFloat(lotData.obligationIncurred)||0,lotTotal):lotTotal;
    const lotAccountCode=lotData.accountCode||lotItems.find(i=>i.accountCode||i.account_code)?.accountCode||lotItems.find(i=>i.account_code)?.account_code||'';
    const lotActivity=lotData.activity!=null?lotData.activity:(lotItems.find(i=>i.activity)?.activity||'');
    // Derive expense class: use _obLotData override first, then earmark item.expenseClass, then code prefix
    const itemEC=lotItems.find(i=>i.expenseClass)?.expenseClass||'';
    const lotExpClass=lotData.expenseClass||itemEC
      ||(lotAccountCode.startsWith('5-01')?'1 - Personnel Services'
        :lotAccountCode.startsWith('5-02')?'2 - MOOE'
        :lotAccountCode.startsWith('5-06')?'3 - Capital Outlay':'');
    lotItems.forEach((item,ii)=>{
      if(!_obSelected.has(`${li}:${ii}`))return;
      selected.push({
        lotIdx:li,entryIdx:ii,lotNumber:lot.lotNumber||li+1,entryNumber:ii+1,
        particulars:item.particulars||'',accountCode:lotAccountCode,activity:lotActivity,
        expenseClass:lotExpClass,amount:parseFloat(item.amount||item.totalCost)||0,
        obligationIncurred:!processedLots.has(li)?lotObligationAmt:null,
      });
      processedLots.add(li);
    });
  });
  return selected;
}

function obUpdateSelectionSummary(em,lots){
  const entries=obGetSelectedEntries(lots);
  const earmarkTotal=entries.reduce((s,e)=>s+e.amount,0);
  const obligationTotal=entries.reduce((s,e)=>s+(e.obligationIncurred!=null?e.obligationIncurred:0),0);
  const totEl=$('ob_selected_total');if(totEl)totEl.textContent=fmt.cur(obligationTotal||earmarkTotal);
  if(entries.length===0){
    $('ob_cat3').style.display='none';$('ob_cat3_earmark_info').style.display='none';
    $('ob_amount').value='';$('ob_selected_entries_json').value='[]';return;
  }
  $('ob_cat3').style.display='';$('ob_cat3_earmark_info').style.display='';
  $('ob_em_total').value=fmt.cur(em.total_amount);
  const lotNums=[...new Set(entries.map(e=>`Lot ${e.lotNumber}`))];
  $('ob_em_lot').value=lotNums.join(', ')+` (${entries.length} entr${entries.length===1?'y':'ies'})`;
  $('ob_em_lot_total').value=fmt.cur(obligationTotal||earmarkTotal);
  const tbody=$('ob_selected_entries_body');
  if(tbody){
    const byLot=new Map();
    entries.forEach(e=>{
      if(!byLot.has(e.lotNumber))byLot.set(e.lotNumber,{entries:[],obAmt:0,lotIdx:e.lotIdx});
      byLot.get(e.lotNumber).entries.push(e);
      if(e.obligationIncurred!=null)byLot.get(e.lotNumber).obAmt=e.obligationIncurred;
    });
    let rowsHtml='';
    byLot.forEach((lotGroup,lotNum)=>{
      const lotData=_obLotData[String(lotGroup.lotIdx)]||{};
      const lotObAmt=lotData.obligationIncurred!=null?lotData.obligationIncurred:lotGroup.entries.reduce((s,e)=>s+e.amount,0);
      rowsHtml+=`<div style="background:var(--blue-light);padding:5px 12px;font-size:11px;font-weight:600;color:var(--blue);display:flex;justify-content:space-between;border-top:1px solid var(--blue-mid)"><span>Lot ${lotNum}</span><span>Obligated: ${fmt.cur(lotObAmt)}</span></div>`;
      lotGroup.entries.forEach(e=>{rowsHtml+=`<div class="ob-sel-entry-row"><span class="ob-sel-idx">${e.entryNumber}</span><span class="ob-sel-particulars">${e.particulars||'—'}</span><span class="ob-sel-code">${e.accountCode||'—'}</span><span class="ob-sel-activity">${e.activity||'—'}</span><span class="ob-sel-amt">${fmt.cur(e.amount)}</span></div>`;});
    });
    rowsHtml+=`<div style="display:grid;grid-template-columns:1fr auto;gap:8px;padding:8px 12px;background:var(--surface);border-top:2px solid var(--border2);font-size:12px;font-weight:700;"><span style="color:var(--text2)">Total Obligation Incurred</span><span style="font-family:var(--mono);color:var(--green)">${fmt.cur(obligationTotal||earmarkTotal)}</span></div>`;
    tbody.innerHTML=rowsHtml;
  }
  if($('ob_cat3_title'))$('ob_cat3_title').innerHTML='Obligation Details <span class="tag tag-ro" style="margin-left:6px">FROM EARMARK</span>';
  obCheckBalance();
  if($('ob_ac_label'))$('ob_ac_label').innerHTML='Account Code <span class="tag tag-ro">FROM EARMARK</span>';
  if($('ob_act_label'))$('ob_act_label').innerHTML='Activity <span class="tag tag-ro">FROM EARMARK</span>';
  if($('ob_ec_label'))$('ob_ec_label').innerHTML='Expense Class <span class="tag tag-ro">FROM EARMARK</span>';
  $('ob_amount_hint').style.display='';$('ob_utility_section').style.display='none';
  $('ob_amount').value=fmt.num(obligationTotal||earmarkTotal);
  $('ob_particulars').value=entries.map(e=>e.particulars).filter(Boolean).join('; ');
  const firstActivity=entries.find(e=>e.activity)?.activity||'';
  $('ob_activity').value=firstActivity;$('ob_activity').setAttribute('readonly','readonly');
  const uniqueCodes=[...new Set(entries.map(e=>e.accountCode).filter(Boolean))];
  const acSel=$('ob_accountCode');acSel.disabled=false;
  if(uniqueCodes.length===1){
    let found=Array.from(acSel.options).find(o=>o.value===uniqueCodes[0]);
    if(!found){const opt=document.createElement('option');opt.value=uniqueCodes[0];opt.text=uniqueCodes[0];acSel.appendChild(opt);found=opt;}
    acSel.value=uniqueCodes[0];acSel.disabled=true;
  } else if(uniqueCodes.length>1){
    acSel.value='';acSel.disabled=false;
    if(!acSel.querySelector('option[value="__mixed__"]')){const hint=document.createElement('option');hint.value='';hint.text=`Mixed codes (${uniqueCodes.length}) — select one`;acSel.insertBefore(hint,acSel.firstChild);}
  } else {acSel.value='';}
  // Derive expense class from entries: use stored expenseClass first, then ACCOUNT_CODES bucket
  const uniqueECs=[...new Set(entries.map(e=>{
    // 1. Use the expenseClass stored directly on the earmark entry
    if(e.expenseClass && /^[123]/.test(e.expenseClass)) return e.expenseClass;
    // 2. Derive from account code prefix (5-01=PS, 5-02=MOOE, 5-06=CO)
    const ac=e.accountCode||'';
    if(ac.startsWith('5-01')) return '1 - Personnel Services';
    if(ac.startsWith('5-02')) return '2 - MOOE';
    if(ac.startsWith('5-06')) return '3 - Capital Outlay';
    // 3. Fall back to ACCOUNT_CODES bucket lookup
    const n=[1,2,3].find(x=>(ACCOUNT_CODES[x]||[]).includes(ac));
    return n?{1:'1 - Personnel Services',2:'2 - MOOE',3:'3 - Capital Outlay'}[n]:'';
  }).filter(Boolean))];
  const expSel=$('ob_expClass');
  if(uniqueECs.length===1){
    // Ensure the option exists
    if(!Array.from(expSel.options).find(o=>o.value===uniqueECs[0])){
      const opt=document.createElement('option');opt.value=uniqueECs[0];opt.text=uniqueECs[0];expSel.appendChild(opt);
    }
    expSel.value=uniqueECs[0];expSel.disabled=true;
    const ecLbl=$('ob_ec_label');if(ecLbl)ecLbl.innerHTML='Expense Class <span class="tag tag-ro">FROM EARMARK</span>';
  } else{expSel.value='';expSel.disabled=false;}
  $('ob_selected_entries_json').value=JSON.stringify(entries);
}

function obApplyLotToSection3(em,lot,lotNumber){
  _obSelected.clear();const lots=em.lots||[];const li=lot?lots.indexOf(lot):0;
  if(lot)(lot.items||[]).forEach((_,ii)=>_obSelected.add(`${li}:${ii}`));
  obUpdateSelectionSummary(em,lots.length?lots:(lot?[lot]:[]));
}

function obClearSection3(){
  _obSelected.clear();
  $('ob_particulars').value='';$('ob_activity').value='';$('ob_activity').setAttribute('readonly','readonly');
  $('ob_accountCode').value='';$('ob_accountCode').disabled=true;$('ob_expClass').value='';$('ob_expClass').disabled=true;
  $('ob_amount').value='';$('ob_em_lot').value='';$('ob_em_lot_total').value='';$('ob_selected_entries_json').value='[]';
  const tbody=$('ob_selected_entries_body');if(tbody)tbody.innerHTML='';
  const tot=$('ob_selected_total');if(tot)tot.textContent='₱0.00';
}

function obUpdateQuarterOBR(){const d=$('ob_date').value;if(!d)return;$('ob_quarter').value=fmt.qtr(d);if(!$('ob_editId').value)$('ob_obrNum').value=fmt.obrNum(d);}

function openObligationModal(includeEarmarkId=null){
  document.getElementById('obligationForm').reset();
  $('ob_editId').value='';$('obModalTitle').textContent='Add Obligation';
  $('ob_date').value=new Date().toISOString().split('T')[0];obUpdateQuarterOBR();
  ['ob_rcField','ob_earmarkField','ob_pojoField','ob_cat2','ob_cat3','ob_cat3_earmark_info'].forEach(id=>$(id).style.display='none');
  $('ob_lotSection').style.display='none';$('ob_lotCards').innerHTML='';
  if(typeof _obSelected!=='undefined')_obSelected.clear();
  const tot=$('ob_selected_total');if(tot)tot.textContent='₱0.00';
  $('ob_rcId').required=false;$('ob_earmarkId').required=false;$('ob_pojo').required=false;
  $('ob_accountCode').disabled=false;$('ob_expClass').disabled=false;
  $('ob_utility_section').style.display='none';$('ob_elec_acct').value='';$('ob_water_acct').value='';
  $('ob_amount_hint').style.display='none';
  if($('ob_cat2_title'))$('ob_cat2_title').textContent='RC / Fund Details';
  if($('ob_cat3_title'))$('ob_cat3_title').textContent='Obligation Details';
  if($('ob_ac_label'))$('ob_ac_label').textContent='Account Code';
  if($('ob_act_label'))$('ob_act_label').textContent='Activity';
  if($('ob_ec_label'))$('ob_ec_label').textContent='Expense Class';
  const prevNotice=$('ob_edit_notice');if(prevNotice)prevNotice.remove();
  const actSel2=$('ob_activity');if(actSel2)actSel2.innerHTML='<option value="">Select Activity</option>';
  obPopulateRCDD();obPopulateEarmarkDD(includeEarmarkId);lockAllOverrideFields();
  const obbb=$('ob_balance_bar');if(obbb)obbb.style.display='none';
  openModal('obligationModal');
  setTimeout(()=>{
    fmtWrapAll($('obligationModal'));
    // ── FIX: wire obCheckBalance to amount oninput for MC types ──
    const amtEl=$('ob_amount');
    if(amtEl && !amtEl.dataset.balWired){
      amtEl.dataset.balWired='1';
      amtEl.addEventListener('input',()=>{
        const t=$('ob_type').value;
        if(t==='Mandatory'||t==='Claims') obCheckBalance();
      });
    }
  },50);
}

function editObligation(id){
  const o=DATA.obligation.find(x=>x.id==id);if(!o)return;
  openObligationModal(o.earmark_id||null);
  $('obModalTitle').textContent='Edit Obligation';$('ob_editId').value=id;
  $('ob_date').value=o.date;obUpdateQuarterOBR();
  $('ob_obrNum').value=o.obr_number;
  {const auto=fmt.obrNum(o.date);if(o.obr_number&&o.obr_number!==auto){const b=$('ob_obrNum_badge');if(b)b.classList.add('show');}}
  $('ob_type').value=o.obligation_type;obHandleType();
  $('ob_payee').value=o.payee;$('ob_particulars').value=o.particulars||'';
  if(o.obligation_type==='Creditor'){obEditRestoreCreditor(o);}else{obEditRestoreMC(o);}
}

// ── FIX: parsedEntries scope bug resolved ──────────────────────
// parsedEntries is now declared at function scope, accessible throughout
function obEditRestoreCreditor(o){
  if(!o.earmark_id)return;
  const em=getEarmarkById(o.earmark_id);const lots=em?.lots||[];

  // Edit mode notice
  const existingNotice=$('ob_edit_notice');
  if(!existingNotice){
    const notice=document.createElement('div');notice.id='ob_edit_notice';notice.className='alert alert-info';notice.style.marginBottom='12px';
    notice.innerHTML='✏️ <strong>Edit Mode</strong> — Lot entries and amounts are pre-selected from the saved obligation.';
    const form=document.getElementById('obligationForm');const balanceBar=$('ob_balance_bar');
    if(balanceBar)form.insertBefore(notice,balanceBar.nextSibling);else form.insertBefore(notice,form.firstChild);
  }

  $('ob_earmarkId').value=o.earmark_id;
  const rc=getRCById(em?.rc_id);
  $('ob_rcName').value=rc?.responsibility_center||'';$('ob_fundCluster').value=rc?.fund_cluster||'';$('ob_authCode').value=rc?.auth_code||'';
  $('ob_cat2').style.display='';$('ob_em_total').value=fmt.cur(em?.total_amount||0);$('ob_cat3_earmark_info').style.display='';
  obPopulateACDD(rc);
  if(o.pojo_number)$('ob_pojo').value=o.pojo_number;
  _obSelected.clear();

  // ── FIX: declare parsedEntries at this function's scope ──────
  let parsedEntries = [];
  try {
    const raw=o.selected_entries??o.selected_entries_json??'[]';
    parsedEntries=Array.isArray(raw)?raw:JSON.parse(raw||'[]');
  } catch(e){ parsedEntries=[]; }

  // Restore checkbox selections
  if(parsedEntries.length>0&&lots.length>0){
    parsedEntries.forEach(saved=>{
      const li=lots.findIndex(l=>(l.lotNumber!=null?l.lotNumber:lots.indexOf(l)+1)===(saved.lotNumber??saved.lotIdx+1));
      if(li<0)return;const lot=lots[li];const items=lot.items||[];
      const ii=saved.entryNumber!=null?saved.entryNumber-1:(saved.entryIdx??-1);
      if(ii>=0&&ii<items.length)_obSelected.add(`${li}:${ii}`);
    });
  } else if(o.lot_number!=null&&lots.length>0){
    const li=lots.findIndex(l=>(l.lotNumber??lots.indexOf(l)+1)===o.lot_number);
    if(li>=0)(lots[li].items||[]).forEach((_,ii)=>_obSelected.add(`${li}:${ii}`));
  } else if(parsedEntries.length>0&&lots.length===0){
    _obSelected.add('0:0');
  } else if(parsedEntries.length===0&&lots.length>0){
    lots.forEach((lot,li)=>(lot.items||[]).forEach((_,ii)=>_obSelected.add(`${li}:${ii}`)));
  }

  // Render UI
  if(lots.length===0){
    $('ob_lotSection').style.display='none';obApplyLotToSection3(em,null,1);
    $('ob_cat3').style.display='';$('ob_cat3_earmark_info').style.display='';
  } else if(lots.length===1&&(lots[0].items||[]).length<=1){
    $('ob_lotSection').style.display='none';_obSelected.add('0:0');obApplyLotToSection3(em,lots[0],1);$('ob_cat3').style.display='';
  } else {
    $('ob_lotSection').style.display='';obRenderLotCards(em,lots,true);
    const uniqueLots=new Set();
    _obSelected.forEach(key=>{const[li,ii]=key.split(':').map(Number);const cb=$('ob_eck_'+li+'_'+ii);const row=$('ob_erow_'+li+'_'+ii);if(cb)cb.checked=true;if(row)row.classList.add('entry-checked');uniqueLots.add(li);});
    uniqueLots.forEach(li=>{if(lots[li])obUpdateLotHeader(li,lots[li]);});
    obUpdateSelectionSummary(em,lots);$('ob_cat3').style.display=_obSelected.size>0?'':'none';
  }

  // ── FIX: parsedEntries now in scope here ────────────────────
  if(parsedEntries.length>0&&lots.length>0){
    const savedByLot={};
    parsedEntries.forEach(e=>{
      const key=String(e.lotIdx??(e.lotNumber?e.lotNumber-1:0));
      if(!savedByLot[key])savedByLot[key]={obligationIncurred:e.obligationIncurred??null,accountCode:e.accountCode||'',activity:e.activity||'',expenseClass:e.expenseClass||''};
      if(e.obligationIncurred!=null&&savedByLot[key].obligationIncurred==null)savedByLot[key].obligationIncurred=e.obligationIncurred;
    });
    Object.entries(savedByLot).forEach(([k,v])=>{_obLotData[k]=v;});
    [...new Set(parsedEntries.map(e=>e.lotIdx??0))].forEach(li=>{
      obToggleLotPanel(li,true);
      const amtI=$(`ob_lot_amt_${li}`);const actI=$(`ob_lot_act_${li}`);const v=_obLotData[String(li)];
      if(amtI&&v?.obligationIncurred!=null){amtI.value=fmt.num(v.obligationIncurred);fmtInputWrap(amtI);}
      if(actI&&v?.activity!=null)actI.value=v.activity;
    });
  }

  setTimeout(()=>{
    if(o.account_code){const acSel=$('ob_accountCode');if(acSel){let found=Array.from(acSel.options).find(op=>op.value===o.account_code);if(!found){const opt=document.createElement('option');opt.value=o.account_code;opt.text=o.account_code;acSel.appendChild(opt);}acSel.value=o.account_code;acSel.disabled=false;}}
    if(o.expense_class){const ec=$('ob_expClass');if(ec){ec.disabled=false;if(!Array.from(ec.options).find(op=>op.value===o.expense_class)){const opt=document.createElement('option');opt.value=o.expense_class;opt.text=o.expense_class;ec.appendChild(opt);}ec.value=o.expense_class;}}
    if(o.activity){const actSel=$('ob_activity');if(actSel){if(!Array.from(actSel.options).find(op=>op.value===o.activity)){const opt=document.createElement('option');opt.value=o.activity;opt.text=o.activity;actSel.appendChild(opt);}actSel.value=o.activity;}}
    if(o.particulars)$('ob_particulars').value=o.particulars;
    $('ob_amount').value=fmt.num(o.obligation_incurred);fmtInputWrap($('ob_amount'));obCheckBalance();
  },200);
}

function obEditRestoreMC(o){
  if(o.rc_id){$('ob_rcId').value=o.rc_id;obLoadRC();}
  setTimeout(()=>{
    if(o.account_code){const acSel=$('ob_accountCode');if(acSel){let found=Array.from(acSel.options).find(op=>op.value===o.account_code);if(!found){const opt=document.createElement('option');opt.value=o.account_code;opt.text=o.account_code;acSel.appendChild(opt);}acSel.value=o.account_code;}}
    if(o.expense_class){const ec=$('ob_expClass');if(ec){ec.disabled=false;if(!Array.from(ec.options).find(op=>op.value===o.expense_class)){const opt=document.createElement('option');opt.value=o.expense_class;opt.text=o.expense_class;ec.appendChild(opt);}ec.value=o.expense_class;const ecLbl=$('ob_ec_label');if(ecLbl)ecLbl.textContent='Expense Class';}}
    if(o.activity){const actSel=$('ob_activity');if(actSel){if(!Array.from(actSel.options).find(op=>op.value===o.activity)){const opt=document.createElement('option');opt.value=o.activity;opt.text=o.activity;actSel.appendChild(opt);}actSel.value=o.activity;const actLbl=$('ob_act_label');if(actLbl)actLbl.textContent='Activity Level 2';}}
    if(o.particulars)$('ob_particulars').value=o.particulars;
    if(o.obligation_type==='Mandatory'){$('ob_elec_acct').value=o.utility_elec_acct||'';$('ob_water_acct').value=o.utility_water_acct||'';$('ob_utility_section').style.display='';}
    $('ob_amount').value=fmt.num(o.obligation_incurred);fmtInputWrap($('ob_amount'));obCheckBalance();
  },120);
}

async function saveObligation(e){
  e.preventDefault();showSaving(true);
  const f=document.getElementById('obligationForm');const fd=new FormData(f);const editId=$('ob_editId').value;const type=fd.get('obligationType');
  const isCred=type==='Creditor';const isMC=(type==='Mandatory'||type==='Claims');const isMand=(type==='Mandatory');
  const earmarkId=isCred?parseInt(fd.get('earmarkId'))||null:null;
  const rcIdRaw=isMC?parseInt(fd.get('rcId'))||null:null;
  if(isMC&&!rcIdRaw){toast('Please select a Responsibility Center','error');showSaving(false);return;}
  if(isCred&&!earmarkId){toast('Please select an Earmark','error');showSaving(false);return;}
  const em=earmarkId?getEarmarkById(earmarkId):null;
  const rc=rcIdRaw?getRCById(rcIdRaw):(em?getRCById(em.rc_id):null);
  let selectedEntriesJson='[]';let lotNumber=null;
  if(isCred){
    const em2=earmarkId?getEarmarkById(earmarkId):null;
    const lots2=em2?.lots||[];
    const entriesJson=$('ob_selected_entries_json')?.value||'[]';
    let parsedEntries=[];try{parsedEntries=JSON.parse(entriesJson);}catch(e){}
    if(lots2.length>0&&parsedEntries.length===0&&_obSelected.size===0){toast('Please select at least one entry to obligate','error');showSaving(false);return;}
    if(_obSelected.size>0)parsedEntries=obGetSelectedEntries(lots2);
    const uniqueLotIdxs=[...new Set(parsedEntries.map(e=>e.lotIdx))];
    for(const li of uniqueLotIdxs){
      const lot=lots2[li];if(!lot)continue;
      const lotTotal=(lot.items||[]).reduce((s,i)=>s+(parseFloat(i.amount||i.totalCost)||0),0);
      const lotObAmt=(_obLotData[String(li)]?.obligationIncurred??lotTotal);
      if(lotObAmt>lotTotal+0.005){toast(`Lot ${lot.lotNumber||li+1}: Obligation Incurred (${fmt.cur(lotObAmt)}) exceeds lot total (${fmt.cur(lotTotal)})`,'error');showSaving(false);return;}
    }
    const processedLots=new Set();
    const perLotTotal=parsedEntries.reduce((s,e)=>{if(e.obligationIncurred!=null&&!processedLots.has(e.lotIdx)){processedLots.add(e.lotIdx);return s+e.obligationIncurred;}return s;},0);
    if(perLotTotal>0)$('ob_amount').value=fmt.num(perLotTotal);
    selectedEntriesJson=JSON.stringify(parsedEntries);
    if(parsedEntries.length>0){const uniqueLots2=[...new Set(parsedEntries.map(e=>e.lotNumber))];lotNumber=uniqueLots2.length===1?uniqueLots2[0]:null;}
  }
  if(rc?.id){
    const editId2=$('ob_editId').value;const obAmt=fmt.parse($('ob_amount').value);
    const bal=getRCBalance(rc.id,{excludeObligationId:editId2?parseInt(editId2):null,pendingObligation:obAmt});
    if(bal.hasAllotment&&bal.projected<0){
      const over=fmt.cur(Math.abs(bal.projected));
      const ok=await confirm2('Allotment Will Be Exceeded',`This obligation would exceed the available allotment by ${over}.\n\nBalance: ${fmt.cur(bal.balance)}\nThis obligation: ${fmt.cur(obAmt)}\nProjected balance: ${fmt.cur(bal.projected)}\n\nProceed anyway?`);
      if(!ok){showSaving(false);return;}
    }
  }
  const data={date:fd.get('date'),quarter:$('ob_quarter').value,obrNumber:$('ob_obrNum').value,obligationType:type,payee:fd.get('payee'),rcId:rc?.id||null,earmarkId,lotNumber,selectedEntriesJson:isCred?selectedEntriesJson:null,pojoNumber:fd.get('pojoNumber')||null,particulars:fd.get('particulars'),obligationIncurred:fmt.parse($('ob_amount').value),accountCode:fd.get('accountCode')||null,expenseClass:fd.get('expenseClass')||null,activity:fd.get('activity')||null,utilityElecAcct:isMand?(fd.get('utilityElecAcct')||null):null,utilityWaterAcct:isMand?(fd.get('utilityWaterAcct')||null):null};
  try{
    if(editId){
      await BudgetAPI.updateObligation(editId,data);
      Audit.obligation('UPDATE',parseInt(editId),data.obrNumber,`Updated OBR ${data.obrNumber} – ${data.payee}`);
      toast('Obligation updated');
    } else {
      const obsRes=await BudgetAPI.createObligation(data);
      Audit.obligation('CREATE',obsRes?.id||0,data.obrNumber,`Created OBR ${data.obrNumber} – ${data.payee} – ${fmt.cur(data.obligationIncurred)}`);
      toast('Obligation created');
    }
    // Smart reload: only obligations + earmarks (earmark remaining_amount changes)
    await reloadModules('obligation','earmark');
    saveClose('obligationModal');
  }
  catch(err){toast(err.message,'error');}finally{showSaving(false);}
}

async function deleteObligation(id){
  const o=DATA.obligation.find(x=>x.id==id);if(!o)return;
  const ok=await confirm2('Delete Obligation',`Delete obligation "${o.obr_number}"?`);if(!ok)return;
  try{
    showSaving(true);await BudgetAPI.deleteObligation(id);
    Audit.obligation('DELETE',id,o.obr_number,`Deleted OBR ${o.obr_number} – ${o.payee}`);
    await reloadModules('obligation','earmark');
    toast('Obligation deleted','error');
  }catch(err){toast(err.message,'error');}finally{showSaving(false);}
}

// ══════════════════════════════════════════
// OBR PICKER MODAL
// Toolbar "Print OBR" button → select OBR → preview form
// ══════════════════════════════════════════
function openOBRSelectModal() {
  const searchEl = $('obr-picker-search');
  if (searchEl) searchEl.value = '';
  obrPickerFilter();
  openModal('obrSelectModal');
  setTimeout(() => { if (searchEl) searchEl.focus(); }, 80);
}

function obrPickerFilter() {
  const q = ($('obr-picker-search')?.value || '').toLowerCase().trim();
  const list = $('obr-picker-list');
  if (!list) return;

  const sorted = [...DATA.obligation].sort((a, b) => {
    // Most recent date first
    return new Date(b.date) - new Date(a.date);
  });

  const filtered = sorted.filter(o => {
    if (!q) return true;
    const rc = getRCById(o.rc_id);
    return (
      (o.obr_number || '').toLowerCase().includes(q) ||
      (o.payee      || '').toLowerCase().includes(q) ||
      (o.particulars|| '').toLowerCase().includes(q) ||
      (rc?.responsibility_center || '').toLowerCase().includes(q) ||
      (o.obligation_type || '').toLowerCase().includes(q)
    );
  });

  if (!filtered.length) {
    list.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text3);font-size:13px">
      No obligations found${q ? ` matching "<strong>${q}</strong>"` : ''}.
    </div>`;
    return;
  }

  const typeColor = t => t === 'Creditor' ? 'b-purple' : t === 'Mandatory' ? 'b-blue' : 'b-yellow';

  list.innerHTML = filtered.map(o => {
    const rc      = getRCById(o.rc_id);
    const disbs   = DATA.disbursement.filter(d => d.obligation_id === o.id);
    const disbAmt = disbs.reduce((s, d) => s + (parseFloat(d.total_disbursement) || 0), 0);
    const balance = (parseFloat(o.obligation_incurred) || 0) - disbAmt;
    const hasDisbursed = disbAmt > 0;

    return `
      <div class="obr-picker-row" onclick="obrPickerSelect(${o.id})"
        style="display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;
               padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;
               transition:background .12s;background:white"
        onmouseover="this.style.background='var(--blue-light)'"
        onmouseout="this.style.background='white'">

        <!-- Left: OBR # + date -->
        <div style="min-width:130px">
          <div style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--text)">${o.obr_number || '—'}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${fmt.date(o.date)}</div>
          <div style="margin-top:4px"><span class="badge ${typeColor(o.obligation_type)}" style="font-size:10px">${o.obligation_type}</span></div>
        </div>

        <!-- Middle: Payee + particulars + RC -->
        <div style="overflow:hidden">
          <div style="font-weight:600;font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${o.payee}</div>
          <div style="font-size:11px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">${o.particulars || '—'}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">🏢 ${rc?.responsibility_center || '—'}</div>
        </div>

        <!-- Right: Amount + status + print hint -->
        <div style="text-align:right;min-width:120px">
          <div style="font-family:var(--mono);font-size:13px;font-weight:700;color:var(--text)">${fmt.cur(o.obligation_incurred)}</div>
          ${hasDisbursed
            ? `<div style="font-size:11px;color:var(--green);margin-top:2px">Bal: ${fmt.cur(balance)}</div>`
            : `<div style="font-size:11px;color:var(--text3);margin-top:2px">Not yet disbursed</div>`
          }
          <div style="margin-top:6px;display:inline-flex;align-items:center;gap:4px;
                      background:var(--green-light);border:1px solid var(--green-mid);
                      color:var(--green);border-radius:5px;padding:2px 8px;font-size:10px;font-weight:600">
            🖨 Preview
          </div>
        </div>

      </div>`;
  }).join('');
}

function obrPickerSelect(id) {
  closeModal('obrSelectModal');
  // Small delay so modal close animation completes before overlay opens
  setTimeout(() => openOBRPreview(id), 150);
}
// ══════════════════════════════════════════
