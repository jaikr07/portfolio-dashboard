import {cfg, uid, today, csvParse} from './utils.js';

const KEY = 'portfolio_command_center_v1';
const ETF_DEFAULTS = {
  LIQUIDCASE: {sector:'ETF / Cash & Commodities', asset_type:'ETF'},
  SILVER: {sector:'ETF / Cash & Commodities', asset_type:'ETF'},
};

const SECURITY_CATALOG = {
  "AARTIIND": {"yahoo_symbol": "AARTIIND.NS", "name": "AARTIIND", "sector": "Chemicals", "asset_type": "Equity", "exchange": "NSE"},
  "AARTIPHARM": {"yahoo_symbol": "AARTIPHARM.NS", "name": "Aarti Pharmalabs", "sector": "Healthcare & Pharmaceuticals", "asset_type": "Equity", "exchange": "NSE"},
  "ADANIGREEN": {"yahoo_symbol": "ADANIGREEN.NS", "name": "ADANIGREEN", "sector": "Renewable Energy & Power", "asset_type": "Equity", "exchange": "NSE"},
  "AEROENTER": {"yahoo_symbol": "AEROENTER.NS", "name": "Aeroflex Enterprises", "sector": "Metals & Materials", "asset_type": "Equity", "exchange": "NSE"},
  "AFFLE": {"yahoo_symbol": "AFFLE.NS", "name": "Affle India", "sector": "Technology & Software", "asset_type": "Equity", "exchange": "NSE"},
  "AGOL": {"yahoo_symbol": "AGOL.BO", "name": "Ashapuri Gold Ornament", "sector": "Consumer", "asset_type": "Equity", "exchange": "BSE"},
  "AURUM": {"yahoo_symbol": "AURUM.NS", "name": "AURUM", "sector": "Technology & Software", "asset_type": "Equity", "exchange": "NSE"},
  "BEWLTD-SM": {"yahoo_symbol": "BEWLTD.NS", "name": "BEWLTD-SM", "sector": "Industrial & Capital Goods", "asset_type": "Equity", "exchange": "NSE"},
  "BLUEJET": {"yahoo_symbol": "BLUEJET.NS", "name": "BLUEJET", "sector": "Healthcare & Pharmaceuticals", "asset_type": "Equity", "exchange": "NSE"},
  "CAMS": {"yahoo_symbol": "CAMS.NS", "name": "CAMS", "sector": "Financial Services", "asset_type": "Equity", "exchange": "NSE"},
  "CHEMTECH": {"yahoo_symbol": "CHEMTECH.NS", "name": "CHEMTECH", "sector": "Industrial & Capital Goods", "asset_type": "Equity", "exchange": "NSE"},
  "CTLLAB": {"yahoo_symbol": "CTLLAB.NS", "name": "CTLLAB", "sector": "Healthcare & Pharmaceuticals", "asset_type": "Equity", "exchange": "NSE"},
  "CYBERTECH-BE": {"yahoo_symbol": "CYBERTECH.NS", "name": "CYBERTECH-BE", "sector": "Technology & Software", "asset_type": "Equity", "exchange": "NSE"},
  "CYIENT": {"yahoo_symbol": "CYIENT.NS", "name": "CYIENT", "sector": "Technology & Software", "asset_type": "Equity", "exchange": "NSE"},
  "EDELWEISS": {"yahoo_symbol": "EDELWEISS.NS", "name": "EDELWEISS", "sector": "Financial Services", "asset_type": "Equity", "exchange": "NSE"},
  "EIEL": {"yahoo_symbol": "EIEL.NS", "name": "EIEL", "sector": "Infrastructure & Environment", "asset_type": "Equity", "exchange": "NSE"},
  "ELECTCAST": {"yahoo_symbol": "ELECTCAST.NS", "name": "ELECTCAST", "sector": "Metals & Materials", "asset_type": "Equity", "exchange": "NSE"},
  "ELLEN": {"yahoo_symbol": "ELLEN.NS", "name": "ELLEN", "sector": "Industrial & Capital Goods", "asset_type": "Equity", "exchange": "NSE"},
  "FAIRCHEMOR-BE": {"yahoo_symbol": "FAIRCHEMOR.NS", "name": "FAIRCHEMOR-BE", "sector": "Chemicals", "asset_type": "Equity", "exchange": "NSE"},
  "FLORACORP": {"yahoo_symbol": "FLORACORP.NS", "name": "FLORACORP", "sector": "Other / Review", "asset_type": "Equity", "exchange": "NSE"},
  "GEMAROMA": {"yahoo_symbol": "GEMAROMA.NS", "name": "Gem Aromatics", "sector": "Chemicals", "asset_type": "Equity", "exchange": "NSE"},
  "GLAND": {"yahoo_symbol": "GLAND.NS", "name": "GLAND", "sector": "Healthcare & Pharmaceuticals", "asset_type": "Equity", "exchange": "NSE"},
  "HDFCAMC": {"yahoo_symbol": "HDFCAMC.NS", "name": "HDFCAMC", "sector": "Financial Services", "asset_type": "Equity", "exchange": "NSE"},
  "IEX": {"yahoo_symbol": "IEX.NS", "name": "IEX", "sector": "Renewable Energy & Power", "asset_type": "Equity", "exchange": "NSE"},
  "IKIO": {"yahoo_symbol": "IKIO.NS", "name": "IKIO Technologies", "sector": "Industrial & Capital Goods", "asset_type": "Equity", "exchange": "NSE"},
  "IMAGICAA": {"yahoo_symbol": "IMAGICAA.NS", "name": "IMAGICAA", "sector": "Media & Leisure", "asset_type": "Equity", "exchange": "NSE"},
  "JTLIND": {"yahoo_symbol": "JTLIND.NS", "name": "JTL Industries", "sector": "Metals & Materials", "asset_type": "Equity", "exchange": "NSE"},
  "KOTAKBANK": {"yahoo_symbol": "KOTAKBANK.NS", "name": "KOTAKBANK", "sector": "Financial Services", "asset_type": "Equity", "exchange": "NSE"},
  "LANDMARK": {"yahoo_symbol": "LANDMARK.NS", "name": "Landmark Cars", "sector": "Auto & Components", "asset_type": "Equity", "exchange": "NSE"},
  "LIQUIDCASE": {"yahoo_symbol": "LIQUIDCASE.NS", "name": "LIQUIDCASE", "sector": "ETF / Cash & Commodities", "asset_type": "ETF", "exchange": "NSE"},
  "MAYURUNIQ": {"yahoo_symbol": "MAYURUNIQ.NS", "name": "MAYURUNIQ", "sector": "Auto & Components", "asset_type": "Equity", "exchange": "NSE"},
  "MSPL": {"yahoo_symbol": "MSPL.NS", "name": "MSPL", "sector": "Metals & Materials", "asset_type": "Equity", "exchange": "NSE"},
  "NEWGEN": {"yahoo_symbol": "NEWGEN.NS", "name": "NEWGEN", "sector": "Technology & Software", "asset_type": "Equity", "exchange": "NSE"},
  "OSWALPUMPS": {"yahoo_symbol": "OSWALPUMPS.NS", "name": "OSWALPUMPS", "sector": "Industrial & Capital Goods", "asset_type": "Equity", "exchange": "NSE"},
  "PAUSHAKLTD": {"yahoo_symbol": "PAUSHAKLTD.NS", "name": "Paushak", "sector": "Chemicals", "asset_type": "Equity", "exchange": "NSE"},
  "PERSISTENT": {"yahoo_symbol": "PERSISTENT.NS", "name": "PERSISTENT", "sector": "Technology & Software", "asset_type": "Equity", "exchange": "NSE"},
  "PRERINFRA": {"yahoo_symbol": "PRERINFRA.NS", "name": "PRERINFRA", "sector": "Infrastructure & Environment", "asset_type": "Equity", "exchange": "NSE"},
  "PRITIKAUTO": {"yahoo_symbol": "PRITIKAUTO.NS", "name": "PRITIKAUTO", "sector": "Auto & Components", "asset_type": "Equity", "exchange": "NSE"},
  "PVRINOX": {"yahoo_symbol": "PVRINOX.NS", "name": "PVRINOX", "sector": "Media & Leisure", "asset_type": "Equity", "exchange": "NSE"},
  "RADHEDE": {"yahoo_symbol": "RADHEDE.NS", "name": "RADHEDE", "sector": "Real Estate", "asset_type": "Equity", "exchange": "NSE"},
  "RAIN": {"yahoo_symbol": "RAIN.NS", "name": "Rain Industries", "sector": "Metals & Materials", "asset_type": "Equity", "exchange": "NSE"},
  "RAYMONDLSL": {"yahoo_symbol": "RAYMONDLSL.NS", "name": "RAYMONDLSL", "sector": "Consumer", "asset_type": "Equity", "exchange": "NSE"},
  "RELAXO": {"yahoo_symbol": "RELAXO.NS", "name": "RELAXO", "sector": "Consumer", "asset_type": "Equity", "exchange": "NSE"},
  "RELIANCE": {"yahoo_symbol": "RELIANCE.NS", "name": "RELIANCE", "sector": "Diversified", "asset_type": "Equity", "exchange": "NSE"},
  "SARLAPOLY": {"yahoo_symbol": "SARLAPOLY.NS", "name": "Sarla Performance Fibers", "sector": "Consumer", "asset_type": "Equity", "exchange": "NSE"},
  "SEYAIND-BE": {"yahoo_symbol": "SEYAIND.NS", "name": "SEYAIND-BE", "sector": "Chemicals", "asset_type": "Equity", "exchange": "NSE"},
  "SGFIN": {"yahoo_symbol": "SGFIN.NS", "name": "SGFIN", "sector": "Financial Services", "asset_type": "Equity", "exchange": "NSE"},
  "SGMART": {"yahoo_symbol": "SGMART.NS", "name": "SGMART", "sector": "Industrial & Capital Goods", "asset_type": "Equity", "exchange": "NSE"},
  "SILVER": {"yahoo_symbol": "SILVER.NS", "name": "SILVER", "sector": "ETF / Cash & Commodities", "asset_type": "ETF", "exchange": "NSE"},
  "SONACOMS": {"yahoo_symbol": "SONACOMS.NS", "name": "SONACOMS", "sector": "Auto & Components", "asset_type": "Equity", "exchange": "NSE"},
  "SONATSOFTW": {"yahoo_symbol": "SONATSOFTW.NS", "name": "Sonata Software", "sector": "Technology & Software", "asset_type": "Equity", "exchange": "NSE"},
  "STYL": {"yahoo_symbol": "STYL.NS", "name": "STYL", "sector": "Consumer", "asset_type": "Equity", "exchange": "NSE"},
  "SUNTECK": {"yahoo_symbol": "SUNTECK.NS", "name": "Sunteck Realty", "sector": "Real Estate", "asset_type": "Equity", "exchange": "NSE"},
  "SUPRIYA": {"yahoo_symbol": "SUPRIYA.NS", "name": "SUPRIYA", "sector": "Healthcare & Pharmaceuticals", "asset_type": "Equity", "exchange": "NSE"},
  "SWSOLAR": {"yahoo_symbol": "SWSOLAR.NS", "name": "SWSOLAR", "sector": "Renewable Energy & Power", "asset_type": "Equity", "exchange": "NSE"},
  "TARSONS": {"yahoo_symbol": "TARSONS.NS", "name": "TARSONS", "sector": "Healthcare & Pharmaceuticals", "asset_type": "Equity", "exchange": "NSE"},
  "TIIL": {"yahoo_symbol": "TIIL.NS", "name": "TIIL", "sector": "Industrial & Capital Goods", "asset_type": "Equity", "exchange": "NSE"},
  "TMCV": {"yahoo_symbol": "TMCV.NS", "name": "TMCV", "sector": "Auto & Components", "asset_type": "Equity", "exchange": "NSE"},
  "TMPV": {"yahoo_symbol": "TMPV.NS", "name": "TMPV", "sector": "Auto & Components", "asset_type": "Equity", "exchange": "NSE"},
  "TRANSWORLD": {"yahoo_symbol": "TRANSWORLD.NS", "name": "TRANSWORLD", "sector": "Logistics & Shipping", "asset_type": "Equity", "exchange": "NSE"},
  "VIYASH": {"yahoo_symbol": "VIYASH.NS", "name": "VIYASH", "sector": "Healthcare & Pharmaceuticals", "asset_type": "Equity", "exchange": "NSE"},
  "WCIL": {"yahoo_symbol": "WCIL.NS", "name": "WCIL", "sector": "Logistics & Shipping", "asset_type": "Equity", "exchange": "NSE"},
};

function normalizedSymbol(value){
  return String(value||'').trim().toUpperCase();
}
function catalogInstrument(symbol,fallback={}){
  symbol=normalizedSymbol(symbol);
  const catalog=SECURITY_CATALOG[symbol]||{};
  const exchange=String(catalog.exchange||fallback.exchange||'NSE').toUpperCase();
  const base=symbol.replace(/-(BE|SM|BZ|BL)$/,'');
  const defaultYahoo=`${base}.${exchange==='BSE'?'BO':'NS'}`;
  return {
    ...fallback,
    symbol,
    yahoo_symbol:catalog.yahoo_symbol||fallback.yahoo_symbol||defaultYahoo,
    name:catalog.name||fallback.name||symbol,
    exchange,
    sector:catalog.sector||fallback.sector||ETF_DEFAULTS[symbol]?.sector||'Unclassified',
    asset_type:catalog.asset_type||fallback.asset_type||ETF_DEFAULTS[symbol]?.asset_type||(/ETF|LIQUID|SILVER|GOLD/i.test(symbol)?'ETF':'Equity'),
    active:fallback.active!==false,
  };
}
function normalizeInstrumentRecord(record={}){
  const symbol=normalizedSymbol(record.symbol);
  if(!symbol)return record;
  const catalog=SECURITY_CATALOG[symbol]||{};
  const localSector=String(record.sector||'').trim();
  const localName=String(record.name||'').trim();
  const localAsset=String(record.asset_type||'').trim();
  const preferred=catalogInstrument(symbol,record);
  return {
    ...record,
    symbol,
    yahoo_symbol:catalog.yahoo_symbol||record.yahoo_symbol||preferred.yahoo_symbol,
    name:(!localName||localName===symbol)?preferred.name:localName,
    exchange:catalog.exchange||record.exchange||preferred.exchange,
    sector:(!localSector||/^unclassified$/i.test(localSector)||/^other \/ review$/i.test(localSector))?preferred.sector:localSector,
    asset_type:(!localAsset)?preferred.asset_type:localAsset,
    active:record.active!==false,
  };
}
let supabaseClient = null;

export const DEFAULT_ACCOUNT = 'Zerodha';
export function accountOf(transaction){
  const explicit=String(transaction?.account||'').trim();
  if(explicit)return explicit;
  const source=String(transaction?.source||'').toLowerCase();
  return source.includes('mstock')?'m.Stock':DEFAULT_ACCOUNT;
}
export function availableAccounts(transactions=[]){
  return [...new Set(transactions.map(accountOf).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}

function defaultState(){
  return {instruments:[], transactions:[], manualAnnouncements:[], settings:{mode:cfg.DEFAULT_MODE||'local'}};
}
function localState(){
  try {
    const state={...defaultState(), ...JSON.parse(localStorage.getItem(KEY)||'{}')};
    const before=JSON.stringify(state.instruments||[]);
    state.instruments=(state.instruments||[]).map(normalizeInstrumentRecord);
    state.transactions=(state.transactions||[]).map(t=>({...t,account:accountOf(t)}));
    if(before!==JSON.stringify(state.instruments))localStorage.setItem(KEY,JSON.stringify(state));
    return state;
  } catch { return defaultState(); }
}
function saveLocal(state){
  state={...state,instruments:(state.instruments||[]).map(normalizeInstrumentRecord),transactions:(state.transactions||[]).map(t=>({...t,account:accountOf(t)}))};
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function isCloudConfigured(){ return Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY); }
export function supabase(){
  if(!isCloudConfigured() || !window.supabase) return null;
  if(!supabaseClient) supabaseClient = window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  return supabaseClient;
}
export async function session(){ const sb=supabase(); if(!sb)return null; const {data}=await sb.auth.getSession(); return data.session; }
export async function signIn(email,password){ const sb=supabase(); if(!sb)throw new Error('Supabase is not configured in config.js'); const {data,error}=await sb.auth.signInWithPassword({email,password}); if(error)throw error; return data; }
export async function signOut(){ const sb=supabase(); if(sb)await sb.auth.signOut(); }
export async function mode(){ const s=await session(); return s?'cloud':'local'; }

export async function loadCore(){
  const s=await session();
  if(!s)return localState();
  const sb=supabase();
  const [{data:instruments,error:e1},{data:transactions,error:e2},{data:manualAnnouncements,error:e3}]=await Promise.all([
    sb.from('instruments').select('*').order('symbol'),
    sb.from('transactions').select('*').order('trade_date',{ascending:false}),
    sb.from('announcements').select('*').eq('is_manual',true).order('published_at',{ascending:false}),
  ]);
  if(e1||e2||e3)throw e1||e2||e3;
  return {instruments:instruments||[],transactions:transactions||[],manualAnnouncements:manualAnnouncements||[],settings:{mode:'cloud'}};
}

export function aggregateHoldings(instruments,transactions,accountFilter='All accounts'){
  const map=new Map();
  for(const ins of instruments)map.set(ins.symbol,{...ins,quantity:0,totalCost:0,realizedPnl:0});
  const sorted=[...transactions].sort((a,b)=>String(a.trade_date).localeCompare(String(b.trade_date)));
  for(const t of sorted){
    if(accountFilter!=='All accounts' && accountOf(t)!==accountFilter)continue;
    // A broker tradebook imported after a current-holdings snapshot is history-only.
    // It is used for the deployment chart, but must not double-count current holdings.
    if(t.analytics_only===true || String(t.analytics_only).toLowerCase()==='true') continue;
    const symbol=String(t.symbol||'').toUpperCase();
    if(!map.has(symbol)){
      const d=ETF_DEFAULTS[symbol]||{};
      map.set(symbol,{symbol,yahoo_symbol:`${symbol}.NS`,name:symbol,sector:d.sector||'Unclassified',asset_type:d.asset_type||'Equity',quantity:0,totalCost:0,realizedPnl:0,active:true});
    }
    const p=map.get(symbol),q=Number(t.quantity||0),price=Number(t.price||0),fees=Number(t.fees||0),type=String(t.transaction_type||'buy').toLowerCase();
    if(['buy','opening','bonus'].includes(type)){
      p.quantity+=q; p.totalCost+=type==='bonus'?fees:q*price+fees;
    } else if(type==='sell'){
      const avg=p.quantity?p.totalCost/p.quantity:0; const sellQ=Math.min(q,p.quantity);
      p.realizedPnl+=sellQ*(price-avg)-fees; p.quantity-=sellQ; p.totalCost-=sellQ*avg;
    } else if(type==='split'){
      p.quantity+=q;
    } else if(type==='adjustment'){
      p.quantity+=q; p.totalCost+=q*price+fees;
    }
  }
  return [...map.values()].filter(p=>p.active!==false&&p.quantity>0.000001).map(p=>({...p,avgCost:p.quantity?p.totalCost/p.quantity:0}));
}

export async function upsertInstrument(record){
  record=normalizeInstrumentRecord({...record,symbol:normalizedSymbol(record.symbol),yahoo_symbol:String(record.yahoo_symbol||'').trim().toUpperCase(),sector:String(record.sector||'').trim(),asset_type:String(record.asset_type||'').trim(),active:record.active!==false});
  const s=await session();
  if(!s){const st=localState();const i=st.instruments.findIndex(x=>x.symbol===record.symbol);if(i>=0)st.instruments[i]={...st.instruments[i],...record};else st.instruments.push({...record,id:uid()});saveLocal(st);return;}
  const {error}=await supabase().from('instruments').upsert(record,{onConflict:'user_id,symbol'});if(error)throw error;
}

function cleanManualTransaction(record){
  return {
    symbol:String(record.symbol||'').trim().toUpperCase(),
    transaction_type:String(record.transaction_type||'buy').trim().toLowerCase(),
    quantity:Number(record.quantity),
    price:Number(record.price||0),
    fees:Number(record.fees||0),
    trade_date:record.trade_date||today(),
    notes:String(record.notes||'').trim(),
    account:String(record.account||DEFAULT_ACCOUNT).trim()||DEFAULT_ACCOUNT,
  };
}

export async function addTransaction(record){
  const clean=cleanManualTransaction(record);
  const s=await session();
  if(!s){const st=localState();st.transactions.push({...clean,id:uid(),created_at:new Date().toISOString()});saveLocal(st);return;}
  const {error}=await supabase().from('transactions').insert(clean);if(error)throw error;
}

export async function updateTransaction(id,record){
  if(!id)throw new Error('Transaction ID is missing.');
  const clean=cleanManualTransaction(record);
  const s=await session();
  if(!s){
    const st=localState();
    const index=st.transactions.findIndex(x=>String(x.id)===String(id));
    if(index<0)throw new Error('Transaction record was not found.');
    const existing=st.transactions[index];
    if(existing.analytics_only===true||String(existing.analytics_only).toLowerCase()==='true'||/_tradebook$/.test(String(existing.source||'')))throw new Error('Imported tradebook rows are read-only. Correct the source CSV and re-import it instead.');
    if(String(existing.transaction_type||'').toLowerCase()==='opening'||String(existing.source||'').endsWith('_holdings_snapshot'))throw new Error('Opening holdings are read-only. Re-import the holdings CSV to correct them.');
    st.transactions[index]={...existing,...clean,updated_at:new Date().toISOString()};
    saveLocal(st);
    return;
  }
  const sb=supabase();
  const {data:existing,error:readError}=await sb.from('transactions').select('analytics_only,source,transaction_type').eq('id',id).single();
  if(readError)throw readError;
  if(existing?.analytics_only===true||/_tradebook$/.test(String(existing?.source||'')))throw new Error('Imported tradebook rows are read-only. Correct the source CSV and re-import it instead.');
  if(String(existing?.transaction_type||'').toLowerCase()==='opening'||String(existing?.source||'').endsWith('_holdings_snapshot'))throw new Error('Opening holdings are read-only. Re-import the holdings CSV to correct them.');
  const {error}=await sb.from('transactions').update(clean).eq('id',id);
  if(error)throw error;
}

export async function deleteTransaction(id){const s=await session();if(!s){const st=localState();st.transactions=st.transactions.filter(x=>x.id!==id);saveLocal(st);return;}const {error}=await supabase().from('transactions').delete().eq('id',id);if(error)throw error;}
export async function saveManualAnnouncement(record){const s=await session();if(!s){const st=localState();st.manualAnnouncements.unshift({...record,id:uid(),is_manual:true,published_at:record.published_at||new Date().toISOString()});saveLocal(st);return;}const {error}=await supabase().from('announcements').insert({...record,is_manual:true});if(error)throw error;}

export async function importBrokerCsv(text,account=DEFAULT_ACCOUNT){
  const rows=csvParse(text),state=localState(),s=await session(),ins=[],tx=[];
  const source=`${String(account).toLowerCase().replace(/[^a-z0-9]+/g,'_')}_holdings_snapshot`;
  for(const r of rows){
    const symbol=(r.Instrument||r.Symbol||'').trim().toUpperCase();if(!symbol)continue;
    const base=symbol.replace(/-(BE|SM|BZ|BL)$/,'');
    const defaults=ETF_DEFAULTS[symbol]||{};
    ins.push(catalogInstrument(symbol,{yahoo_symbol:`${base}.NS`,name:symbol,exchange:'NSE',sector:defaults.sector||'Unclassified',asset_type:defaults.asset_type||'Equity',active:true}));
    tx.push({symbol,transaction_type:'opening',trade_date:today(),quantity:Number(r['Qty.']||r.Quantity||0),price:Number(r['Avg. cost']||r['Avg Cost']||0),fees:0,notes:`Imported opening holding · ${account}`,analytics_only:false,source,account});
  }
  if(!s){
    for(const x of ins){const i=state.instruments.findIndex(v=>v.symbol===x.symbol);if(i<0)state.instruments.push({...x,id:uid()});else state.instruments[i]={...state.instruments[i],...x};}
    state.transactions=state.transactions.filter(t=>!(String(t.transaction_type).toLowerCase()==='opening'&&accountOf(t)===account));
    state.transactions.push(...tx.map(x=>({...x,id:uid(),created_at:new Date().toISOString()})));saveLocal(state);return {count:ins.length,account};
  }
  const sb=supabase();const {data:user}=await sb.auth.getUser();const user_id=user.user.id;
  const {error:e1}=await sb.from('instruments').upsert(ins.map(x=>({...x,user_id})),{onConflict:'user_id,symbol'});if(e1)throw e1;
  await sb.from('transactions').delete().eq('transaction_type','opening').eq('account',account);
  const {error:e2}=await sb.from('transactions').insert(tx.map(x=>({...x,user_id})));if(e2)throw e2;return {count:ins.length,account};
}

function workbookRows(buffer,sheetHint){
  if(!window.XLSX)throw new Error('Excel reader did not load. Refresh the page and try again.');
  const workbook=window.XLSX.read(buffer,{type:'array',cellDates:false});
  const sheetName=workbook.SheetNames.find(name=>name.toLowerCase().includes(String(sheetHint||'').toLowerCase()))||workbook.SheetNames[0];
  return window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,raw:false,defval:''});
}
function mstockSymbol(value){return String(value||'').trim().toUpperCase().replace(/-EQ$/,'');}
function parseIndianDate(value){
  const raw=String(value||'').trim();
  const m=raw.match(/^(\d{1,2})[-\/]([A-Za-z]{3}|\d{1,2})[-\/](\d{2,4})$/);
  if(!m)return toIsoDate(raw);
  const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  const day=Number(m[1]);const month=/[A-Za-z]/.test(m[2])?months[m[2].toLowerCase()]:Number(m[2]);let year=Number(m[3]);if(year<100)year+=2000;
  if(!day||!month||!year)return '';
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
async function saveImportedHoldings(ins,tx,account){
  const s=await session();
  if(!s){const state=localState();for(const x of ins){const i=state.instruments.findIndex(v=>v.symbol===x.symbol);if(i<0)state.instruments.push({...x,id:uid()});else state.instruments[i]={...state.instruments[i],...x};}state.transactions=state.transactions.filter(t=>!(String(t.transaction_type).toLowerCase()==='opening'&&accountOf(t)===account));state.transactions.push(...tx.map(x=>({...x,id:uid(),created_at:new Date().toISOString()})));saveLocal(state);return;}
  const sb=supabase();const {data:user}=await sb.auth.getUser();const user_id=user.user.id;const {error:e1}=await sb.from('instruments').upsert(ins.map(x=>({...x,user_id})),{onConflict:'user_id,symbol'});if(e1)throw e1;await sb.from('transactions').delete().eq('transaction_type','opening').eq('account',account);const {error:e2}=await sb.from('transactions').insert(tx.map(x=>({...x,user_id})));if(e2)throw e2;
}
export async function importMstockHoldingsWorkbook(buffer){
  const account='m.Stock';const rows=workbookRows(buffer,'Holdings');const header=rows.findIndex(r=>String(r[0]).trim().toLowerCase()==='scrip name');if(header<0)throw new Error('The m.Stock holdings header “Scrip Name” was not found.');
  const ins=[];const tx=[];
  for(const r of rows.slice(header+1)){const symbol=mstockSymbol(r[0]);if(!symbol||symbol==='TOTAL')break;const quantity=Number(String(r[1]).replace(/,/g,''));const price=Number(String(r[2]).replace(/,/g,''));if(!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(price))continue;const base=symbol.replace(/-(BE|SM|BZ|BL)$/,'');ins.push(catalogInstrument(symbol,{yahoo_symbol:`${base}.NS`,name:symbol,exchange:'NSE',sector:ETF_DEFAULTS[symbol]?.sector||'Unclassified',asset_type:inferredAssetType(symbol),active:true}));tx.push({symbol,transaction_type:'opening',trade_date:today(),quantity,price,fees:0,notes:'Imported opening holding · m.Stock',analytics_only:false,source:'mstock_holdings_snapshot',account});}
  if(!ins.length)throw new Error('No current m.Stock holdings were found in the workbook.');await saveImportedHoldings(ins,tx,account);return {count:ins.length,account};
}
async function saveHistoryRecords(records,instruments){
  const s=await session();
  if(!s){const st=localState();for(const ins of instruments.values()){const i=st.instruments.findIndex(x=>x.symbol===ins.symbol);if(i<0)st.instruments.push({...normalizeInstrumentRecord(ins),active:false,id:uid()});else st.instruments[i]=normalizeInstrumentRecord({...st.instruments[i],...ins,active:st.instruments[i].active!==false});}const existing=new Set(st.transactions.map(t=>String(t.external_trade_id||'')).filter(Boolean));const fresh=records.filter(x=>!existing.has(x.external_trade_id)).map(x=>({...x,id:uid()}));st.transactions.push(...fresh);saveLocal(st);return {imported:fresh.length,duplicates:records.length-fresh.length};}
  const sb=supabase();const {data:user}=await sb.auth.getUser();const user_id=user.user.id;const {data:existingRows,error:existingError}=await sb.from('instruments').select('symbol');if(existingError)throw existingError;const existingSymbols=new Set((existingRows||[]).map(x=>x.symbol));const missing=[...instruments.values()].filter(x=>!existingSymbols.has(x.symbol)).map(x=>({...x,active:false,user_id}));if(missing.length){const {error:e1}=await sb.from('instruments').insert(missing);if(e1)throw e1;}const {error:e2}=await sb.from('transactions').upsert(records.map(x=>({...x,user_id})),{onConflict:'user_id,external_trade_id',ignoreDuplicates:true});if(e2&&/account|external_trade_id|analytics_only|source/i.test(e2.message||''))throw new Error('Cloud schema needs the multi-account upgrade. Run supabase/upgrade_v3_4.sql, then import again.');if(e2)throw e2;return {imported:records.length,duplicates:0};
}
export async function importMstockTradeWorkbook(buffer){
  const account='m.Stock';
  const rows=workbookRows(buffer,'Trade History');
  const header=rows.findIndex(row=>row.some(cell=>String(cell||'').trim().toLowerCase()==='trade date'));
  if(header<0)throw new Error('The m.Stock “Trade Date” header was not found.');

  const headers=rows[header].map(value=>String(value||'').trim().toLowerCase());
  const column=(...names)=>headers.findIndex(value=>names.includes(value));
  const dateCol=column('trade date');
  const exchangeCol=column('exchange');
  const typeCol=column('buy / sell','buy/sell');
  const symbolCol=column('scrip / contract','scrip/contract','scrip name');
  const qtyCol=column('qty','quantity');
  const priceCol=column('price','trade price');
  const idCol=column('trade id','trade no','trade number');
  if([dateCol,typeCol,symbolCol,qtyCol,priceCol].some(index=>index<0)){
    throw new Error('The m.Stock trade-history columns could not be identified. Expected Trade Date, Buy / Sell, Scrip / Contract, Qty and Price.');
  }

  const records=[];
  const instruments=new Map();
  for(const row of rows.slice(header+1)){
    const trade_date=parseIndianDate(row[dateCol]);
    const type=String(row[typeCol]||'').trim().toLowerCase();
    const symbol=mstockSymbol(row[symbolCol]);
    const quantity=Number(String(row[qtyCol]||'').replace(/,/g,''));
    const price=Number(String(row[priceCol]||'').replace(/,/g,''));
    const tradeId=idCol>=0?String(row[idCol]||'').trim():'';
    const exchange=exchangeCol>=0?String(row[exchangeCol]||'NSE').toUpperCase():'NSE';
    if(!trade_date||!symbol||!['buy','sell'].includes(type)||!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(price)||price<=0)continue;
    const rawId=tradeId||'generated';
    const external_trade_id=`mstock-${trade_date}-${exchange}-${rawId}-${symbol}-${type}-${quantity}-${price}`;
    records.push({
      symbol,transaction_type:type,trade_date,quantity,price,fees:0,
      notes:`m.Stock trade history · ${tradeId||'generated ID'}`,
      analytics_only:true,external_trade_id,source:'mstock_tradebook',account,
      created_at:new Date().toISOString(),
    });
    if(!instruments.has(symbol)){
      instruments.set(symbol,catalogInstrument(symbol,{
        yahoo_symbol:yahooMapping(symbol,exchange.includes('BSE')?'BSE':'NSE'),
        name:symbol,
        exchange:exchange.includes('BSE')?'BSE':'NSE',
        active:true,
      }));
    }
  }
  if(!records.length)throw new Error('No valid m.Stock buy or sell executions were found.');
  const normalizedRecords=uniqueExternalTradeIds(records);
  const saved=await saveHistoryRecords(normalizedRecords,instruments);
  const dates=normalizedRecords.map(row=>row.trade_date).sort();
  return {rows:normalizedRecords.length,...saved,start:dates[0],end:dates.at(-1),account};
}

function toIsoDate(value){
  const raw=String(value||'').trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
  const parsed=new Date(raw); return Number.isFinite(parsed.getTime())?parsed.toISOString().slice(0,10):'';
}
function inferredAssetType(symbol){ return ETF_DEFAULTS[symbol]?.asset_type || (/ETF|LIQUID|SILVER|GOLD/i.test(symbol)?'ETF':'Equity'); }
function yahooMapping(symbol,exchange){
  const base=String(symbol||'').toUpperCase().replace(/-(BE|SM|BZ|BL)$/,'');
  return `${base}.${String(exchange||'NSE').toUpperCase()==='BSE'?'BO':'NS'}`;
}

/** Import a Zerodha-style EQ tradebook as history-only transactions.
 * Current quantities remain driven by the imported holdings snapshot, avoiding
 * double-counting when the tradebook covers only part of the portfolio history.
 */
export async function importTradebookCsv(text,account=DEFAULT_ACCOUNT){
  const rows=csvParse(text);
  const required=['symbol','trade_date','trade_type','quantity','price'];
  if(!rows.length || required.some(k=>!(k in rows[0]))) throw new Error(`This does not look like a Zerodha tradebook. Required columns: ${required.join(', ')}.`);
  const records=[]; const instruments=new Map();
  for(const r of rows){
    const symbol=String(r.symbol||'').trim().toUpperCase();
    const type=String(r.trade_type||'').trim().toLowerCase();
    const trade_date=toIsoDate(r.trade_date);
    const quantity=Number(r.quantity); const price=Number(r.price);
    if(!symbol || !['buy','sell'].includes(type) || !trade_date || !Number.isFinite(quantity) || quantity<=0 || !Number.isFinite(price))continue;
    const rawTradeId=String(r.trade_id||`${symbol}-${type}-${trade_date}-${r.order_execution_time||''}-${quantity}-${price}`).trim();
    const external_trade_id=`zerodha-${rawTradeId}`;
    const exchange=String(r.exchange||'NSE').toUpperCase();
    records.push({
      symbol, transaction_type:type, trade_date, quantity, price, fees:0,
      notes:`Tradebook history · ${external_trade_id}`,
      analytics_only:true, external_trade_id, source:'zerodha_tradebook', account,
      created_at:r.order_execution_time||new Date().toISOString(),
    });
    if(!instruments.has(symbol))instruments.set(symbol,catalogInstrument(symbol,{yahoo_symbol:yahooMapping(symbol,exchange),name:symbol,exchange,sector:ETF_DEFAULTS[symbol]?.sector||'Unclassified',asset_type:inferredAssetType(symbol),active:true}));
  }
  if(!records.length)throw new Error('No valid buy or sell rows were found in the tradebook.');

  const s=await session();
  if(!s){
    const st=localState();
    for(const ins of instruments.values()){
      const i=st.instruments.findIndex(x=>x.symbol===ins.symbol);
      if(i<0)st.instruments.push({...ins,active:false,id:uid()});
    }
    const existing=new Set(st.transactions.map(t=>String(t.external_trade_id||'')).filter(Boolean));
    const fresh=records.filter(x=>!existing.has(x.external_trade_id)).map(x=>({...x,id:uid()}));
    st.transactions.push(...fresh); saveLocal(st);
    return {rows:records.length, imported:fresh.length, duplicates:records.length-fresh.length, start:records.map(x=>x.trade_date).sort()[0], end:records.map(x=>x.trade_date).sort().at(-1)};
  }

  const sb=supabase(); const {data:user}=await sb.auth.getUser(); const user_id=user.user.id;
  const {data:existingRows,error:existingError}=await sb.from('instruments').select('symbol');
  if(existingError)throw existingError;
  const existingSymbols=new Set((existingRows||[]).map(x=>x.symbol));
  const missing=[...instruments.values()].filter(x=>!existingSymbols.has(x.symbol)).map(x=>({...x,active:false,user_id}));
  if(missing.length){const {error:e1}=await sb.from('instruments').insert(missing);if(e1)throw e1;}
  const payload=records.map(x=>({...x,user_id}));
  const {error:e2}=await sb.from('transactions').upsert(payload,{onConflict:'user_id,external_trade_id',ignoreDuplicates:true});
  if(e2 && /external_trade_id|analytics_only|source/i.test(e2.message||'')) throw new Error('Cloud schema needs the v3 upgrade. Run supabase/upgrade_v3.sql in Supabase SQL Editor, then import again.');
  if(e2)throw e2;
  return {rows:records.length, imported:records.length, duplicates:0, start:records.map(x=>x.trade_date).sort()[0], end:records.map(x=>x.trade_date).sort().at(-1)};
}


export function localDataSummary(){
  const state=localState();
  return {
    instruments:(state.instruments||[]).length,
    transactions:(state.transactions||[]).length,
    manualAnnouncements:(state.manualAnnouncements||[]).length,
    accounts:availableAccounts(state.transactions||[]),
    migratedAt:localStorage.getItem('portfolioCloudMigrationAt')||'',
  };
}

function batches(values,size=250){
  const out=[];
  for(let i=0;i<values.length;i+=size)out.push(values.slice(i,i+size));
  return out;
}

function safeIdPart(value){
  return String(value??'').trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);
}

/**
 * Older m.Stock exports can reuse the same Trade Id on different dates. The
 * original importer used only that Trade Id, which produced duplicate cloud
 * keys. Preserve every genuine execution by giving repeated IDs a stable,
 * transaction-specific suffix before writing to Supabase.
 */
function uniqueExternalTradeIds(rows){
  const seen=new Map();
  const used=new Set();
  return rows.map((row,index)=>{
    const original=String(row.external_trade_id||'').trim();
    if(!original)return {...row,external_trade_id:null};
    const occurrence=(seen.get(original)||0)+1;
    seen.set(original,occurrence);
    let candidate=original;
    if(occurrence>1 || used.has(candidate)){
      const detail=[
        safeIdPart(row.trade_date),safeIdPart(row.account),safeIdPart(row.symbol),
        safeIdPart(row.transaction_type),safeIdPart(row.quantity),safeIdPart(row.price),occurrence
      ].filter(Boolean).join('-');
      candidate=`${original}-${detail||index+1}`;
      let suffix=2;
      while(used.has(candidate))candidate=`${original}-${detail||index+1}-${suffix++}`;
    }
    used.add(candidate);
    return {...row,external_trade_id:candidate};
  });
}

export async function migrateLocalToCloud(){
  const current=await session();
  if(!current)throw new Error('Sign in before moving browser data to cloud.');
  const state=localState();
  if(!(state.instruments||[]).length && !(state.transactions||[]).length && !(state.manualAnnouncements||[]).length){
    throw new Error('There is no browser-only portfolio data to move.');
  }
  const sb=supabase();
  const user_id=current.user.id;

  // Replace only the signed-in user's private portfolio records.
  for(const table of ['transactions','instruments']){
    const {error}=await sb.from(table).delete().eq('user_id',user_id);
    if(error)throw error;
  }
  const {error:manualDeleteError}=await sb.from('announcements').delete().eq('user_id',user_id).eq('is_manual',true);
  if(manualDeleteError)throw manualDeleteError;

  const instrumentMap=new Map();
  for(const row of state.instruments||[]){
    const item={
      user_id,
      symbol:String(row.symbol||'').toUpperCase(),
      yahoo_symbol:String(row.yahoo_symbol||'').toUpperCase(),
      name:row.name||row.symbol,
      exchange:row.exchange||'NSE',
      sector:row.sector||'Unclassified',
      asset_type:row.asset_type||'Equity',
      active:row.active!==false,
    };
    if(item.symbol&&item.yahoo_symbol)instrumentMap.set(item.symbol,item);
  }
  const instruments=[...instrumentMap.values()];

  const transactions=uniqueExternalTradeIds((state.transactions||[]).map(row=>({
    user_id,
    symbol:String(row.symbol||'').toUpperCase(),
    transaction_type:String(row.transaction_type||'buy').toLowerCase(),
    trade_date:row.trade_date||today(),
    quantity:Number(row.quantity||0),
    price:Number(row.price||0),
    fees:Number(row.fees||0),
    notes:row.notes||null,
    analytics_only:row.analytics_only===true||String(row.analytics_only).toLowerCase()==='true',
    external_trade_id:row.external_trade_id||null,
    source:row.source||null,
    account:accountOf(row),
    created_at:row.created_at||new Date().toISOString(),
  })).filter(row=>row.symbol&&row.quantity>=0));

  const manual=(state.manualAnnouncements||[]).map(row=>({
    user_id,
    symbol:String(row.symbol||'PORTFOLIO').toUpperCase(),
    external_id:row.external_id||null,
    published_at:row.published_at||new Date().toISOString(),
    title:row.title||'Manual note',
    source:row.source||'Manual',
    source_url:row.source_url||null,
    summary:row.summary||null,
    category:row.category||'Manual',
    impact_score:Number(row.impact_score||0),
    impact_label:row.impact_label||null,
    confidence:row.confidence||null,
    impact_reason:row.impact_reason||null,
    watch_items:row.watch_items||null,
    time_horizon:row.time_horizon||null,
    materiality:row.materiality||null,
    is_manual:true,
  }));

  for(const group of batches(instruments)){
    const {error}=await sb.from('instruments').insert(group);if(error)throw error;
  }
  for(const group of batches(transactions)){
    const {error}=await sb.from('transactions').insert(group);if(error)throw error;
  }
  for(const group of batches(manual)){
    const {error}=await sb.from('announcements').insert(group);if(error)throw error;
  }
  localStorage.setItem('portfolioCloudMigrationAt',new Date().toISOString());
  return {instruments:instruments.length,transactions:transactions.length,manualAnnouncements:manual.length};
}

export async function fetchJson(url,fallback=[]){try{if(!location.pathname.includes('/pages/')&&url.startsWith('../'))url=url.slice(3);const r=await fetch(`${url}?v=${Date.now()}`);if(!r.ok)throw new Error(r.status);return await r.json();}catch{return fallback;}}
export async function loadMarket(){const s=await session();if(s){const {data,error}=await supabase().from('latest_market_snapshots').select('*');if(!error&&data)return data;}return fetchJson(cfg.MARKET_DATA_URL||'../data/market.json',[]);}
export async function loadResults(){const s=await session();if(s){const {data,error}=await supabase().from('financial_results').select('*').order('period_end',{ascending:false});if(!error&&data)return data;}return fetchJson(cfg.RESULTS_DATA_URL||'../data/results.json',[]);}
export async function loadAnnouncements(){const s=await session();if(s){const {data,error}=await supabase().from('announcements').select('*').order('published_at',{ascending:false}).limit(500);if(!error&&data)return data;}const auto=await fetchJson(cfg.ANNOUNCEMENTS_DATA_URL||'../data/announcements.json',[]);return [...localState().manualAnnouncements,...auto];}
export async function exportCurrentData(){return JSON.stringify(await loadCore(),null,2);}
export function exportLocal(){return JSON.stringify(localState(),null,2);}
export function importLocal(json){const obj=JSON.parse(json);const state={...defaultState(),...obj};state.instruments=(state.instruments||[]).map(normalizeInstrumentRecord);state.transactions=(state.transactions||[]).map(t=>({...t,account:accountOf(t)}));saveLocal(state);}
export function resetLocal(){localStorage.removeItem(KEY);}
