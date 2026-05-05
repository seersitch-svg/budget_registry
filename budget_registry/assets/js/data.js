// DATA CACHE
// ══════════════════════════════════════════
let DATA={rc:[],allotment:[],earmark:[],obligation:[],disbursement:[]};

const FUND_DATA={
  '01000000':{name:'Regular Agency Fund',authCodes:{'01101000':{name:'New General Appropriations',cats:{'01101101':'Specific Budget of the Agency (Current)'}},'01102000':{name:'Continuing Appropriations',cats:{'01102101':'Specific Budget of the Agency (Continuing)'}}}},
  '02000000':{name:'Foreign Assisted Fund',authCodes:{'02101000':{name:'New General Appropriations',cats:{'02101151':'GOP Counterpart Funds','02101163':'IBRD'}}}}
};
const PROJECT_DATA={
  '1000000000':{name:'General Administration and Support (GAS)',cats:{'Blank/None':{name:'Blank/None',subs:{'100000100002':'Administration of Personnel Benefits','100000100001':'General Management and Supervision'}}}},
  '310100000000':{name:'Fisheries Development Program',cats:{'310102000000':{name:'Aquaculture Sub-Program',subs:{'310102100001':'Fisheries Production and Distribution'}},'310104000000':{name:'Market Development Sub-Program',subs:{'310104100001':'Market Development Services'}}}}
};
const ACCOUNT_CODES={
  1:['5-01-01-010 – Salaries and Wages','5-01-02-010 – Other Compensation','5-01-03-010 – Personnel Benefits'],
  2:['5-02-01-010 – Traveling Expenses','5-02-03-220-01 – Office Supplies','5-02-03-990 – Other Supplies','5-02-05-010 – Utility Expenses'],
  3:['5-06-01-010 – Property, Plant & Equipment','5-06-03-010 – Office Equipment','5-06-04-010 – ICT Equipment']
};
// ── Organisation Unit Codes ──────────────────────────────────
// Each level: { code: 'XX-XXX-XX-XXXXX', name: 'Full Name' }
// These are used in Section 2 of the RC form and can be managed
// via inline quick-add panels.
const ORG_UNITS = {
  dept: {
    '05-000-00-00000': 'Department of Agriculture',
  },
  agency: {
    '05-003-00-00000': 'BUREAU OF FISHERIES AND AQUATIC RESOURCES',
  },
  operatingUnit: {
    '05-003-03-00000': 'Regional Offices',
  },
  lowerUnit: {
    '05-003-03-00008': 'Region VIII',
  },
};

const RC_ACTIVITIES={
  'LH – SAMAR':['Marine Hatchery Operations','Fishpond Development','Aquaculture Extension'],
  'CICA – GASS':['Office Equipment Procurement','Administrative Support','ICT Infrastructure'],
  'HAB':['Harmful Algal Bloom Monitoring','Laboratory Testing','PSP Analysis']
};

// ══════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════
const $=id=>document.getElementById(id);
const MO=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const fmt={
  date(d){if(!d)return'';const dt=new Date(d+'T00:00:00');return`${MO[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;},
  cur(n){
    const v=Number(n||0);
    return '₱'+v.toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
  },
  // Format a number with commas + 2 decimals (no ₱ sign, for display/input)
  num(n){
    if(n===''||n===null||n===undefined)return'';
    const v=Number(n)||0;
    return v.toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
  },
  // Parse a comma-formatted string back to float
  parse(s){return parseFloat(String(s).replace(/,/g,''))||0;},
  qtr(d){const m=new Date(d+'T00:00:00').getMonth();return m<3?'1ST Qtr':m<6?'2ND Qtr':m<9?'3RD Qtr':'4TH Qtr';},
  obrNum(d){const dt=new Date(d+'T00:00:00');const y=String(dt.getFullYear()).slice(-2),mo=String(dt.getMonth()+1).padStart(2,'0');const pre=`OBR-${y}-${mo}`;const ex=DATA.obligation.filter(o=>o.obr_number&&o.obr_number.startsWith(pre)).map(o=>parseInt(o.obr_number.split('-')[3])).filter(n=>!isNaN(n));const seq=ex.length?Math.max(...ex)+1:1;return`${pre}-${String(seq).padStart(4,'0')}`;},
  emNum(d){const dt=new Date(d+'T00:00:00');const y=String(dt.getFullYear()).slice(-2),mo=String(dt.getMonth()+1).padStart(2,'0');const pre=`${y}-${mo}`;const ex=DATA.earmark.filter(e=>e.earmark_number&&e.earmark_number.startsWith(pre)).map(e=>parseInt((e.earmark_number.split('-')[2]||''))).filter(n=>!isNaN(n));const seq=ex.length?Math.max(...ex)+1:1;return`${pre}-${String(seq).padStart(4,'0')}`;}
};
// ── Formatted Number Input Helpers ───────────────────────────
// Wrap a plain number <input> so it shows comma-formatted value
// while keeping the raw numeric value accessible via fmtVal()
function fmtInputWrap(inputEl) {
  if (!inputEl || inputEl.dataset.fmtWrapped) return;
  inputEl.dataset.fmtWrapped = '1';

  // ── Live formatting as user types ─────────────────────────
  inputEl.addEventListener('input', () => {
    if (inputEl.readOnly) return;
    const raw = inputEl.value;
    // Allow typing: keep cursor position after re-formatting
    const pos = inputEl.selectionStart;
    const oldLen = raw.length;

    // Strip anything that's not digit, dot, or minus
    let clean = raw.replace(/[^0-9.\-]/g, '');

    // Handle negative sign only at start
    const isNeg = clean.startsWith('-');
    if (isNeg) clean = '-' + clean.slice(1).replace(/-/g, '');

    // Split on decimal point — keep only one
    const parts = clean.split('.');
    const intPart = parts[0].replace(/-/g, '');
    const decPart = parts.length > 1 ? '.' + parts.slice(1).join('').slice(0, 2) : '';

    // Add thousands commas to integer part
    const intFormatted = intPart === '' || intPart === '-'
      ? intPart
      : Number(intPart).toLocaleString('en-PH');

    const formatted = (isNeg ? '-' : '') + intFormatted + decPart;

    // Only update if value changed (prevents cursor jumping on non-digit keys)
    if (formatted !== raw) {
      inputEl.value = formatted;
      // Restore cursor: account for added/removed commas
      const newLen = formatted.length;
      const delta = newLen - oldLen;
      try { inputEl.setSelectionRange(pos + delta, pos + delta); } catch(e){}
    }
  });

  // ── On blur: fully normalize (add .00 if missing decimal) ──
  inputEl.addEventListener('blur', () => {
    const raw = fmt.parse(inputEl.value);
    if (inputEl.value.trim() !== '' && !isNaN(raw)) {
      inputEl.value = raw === 0 ? '' : fmt.num(raw);
    }
  });

  // ── On focus: keep formatted — user types over it ─────────
  // No stripping needed — the live input handler handles it

  // ── Block invalid keys ────────────────────────────────────
  inputEl.addEventListener('keydown', e => {
    const allowed = ['Backspace','Delete','Tab','Enter','Escape',
                     'ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
                     'Home','End','a','c','v','x','z'];
    if (e.ctrlKey || e.metaKey) return; // allow copy/paste/undo
    if (allowed.includes(e.key)) return;
    if (/^[0-9.\-]$/.test(e.key)) return;
    e.preventDefault();
  });
}

// Get numeric value from a potentially comma-formatted input
function fmtVal(inputEl) {
  return fmt.parse(inputEl?.value || '0');
}

// Apply fmtInputWrap to all matching inputs in a container (or document)
function fmtWrapAll(container) {
  const el = container || document;
  el.querySelectorAll('input[data-fmt="num"]').forEach(fmtInputWrap);
}

// Format a value into an input element with comma display
function setFmtInput(inputEl, value) {
  if (!inputEl) return;
  const raw = Number(value) || 0;
  inputEl.value = raw === 0 ? '' : fmt.num(raw);
  fmtInputWrap(inputEl);
}

const getRCById=id=>DATA.rc.find(r=>r.id==id)||null;
const getEarmarkById=id=>DATA.earmark.find(e=>e.id==id)||null;
const getObligationById=id=>DATA.obligation.find(o=>o.id==id)||null;

// ══════════════════════════════════════════
