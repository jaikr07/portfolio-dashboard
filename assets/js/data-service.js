import {cfg, uid, today, csvParse} from './utils.js';

const KEY = 'portfolio_command_center_v1';
const ETF_DEFAULTS = {
  LIQUIDCASE: {sector:'ETF / Cash & Commodities', asset_type:'ETF'},
  SILVER: {sector:'ETF / Cash & Commodities', asset_type:'ETF'},
};
let supabaseClient = null;

function defaultState(){
  return {instruments:[], transactions:[], manualAnnouncements:[], settings:{mode:cfg.DEFAULT_MODE||'local'}};
}
function localState(){
  try { return {...defaultState(), ...JSON.parse(localStorage.getItem(KEY)||'{}')}; }
  catch { return defaultState(); }
}
function saveLocal(state){ localStorage.setItem(KEY, JSON.stringify(state)); }

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

export function aggregateHoldings(instruments,transactions){
  const map=new Map();
  for(const ins of instruments)map.set(ins.symbol,{...ins,quantity:0,totalCost:0,realizedPnl:0});
  const sorted=[...transactions].sort((a,b)=>String(a.trade_date).localeCompare(String(b.trade_date)));
  for(const t of sorted){
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
  record={...record,symbol:String(record.symbol).trim().toUpperCase(),yahoo_symbol:String(record.yahoo_symbol||`${record.symbol}.NS`).trim().toUpperCase(),sector:String(record.sector||'Unclassified').trim(),asset_type:String(record.asset_type||'Equity').trim(),active:record.active!==false};
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
    if(existing.analytics_only===true||String(existing.analytics_only).toLowerCase()==='true'||String(existing.source||'')==='zerodha_tradebook')throw new Error('Imported tradebook rows are read-only. Correct the source CSV and re-import it instead.');
    if(String(existing.transaction_type||'').toLowerCase()==='opening'||String(existing.source||'')==='holdings_snapshot')throw new Error('Opening holdings are read-only. Re-import the holdings CSV to correct them.');
    st.transactions[index]={...existing,...clean,updated_at:new Date().toISOString()};
    saveLocal(st);
    return;
  }
  const sb=supabase();
  const {data:existing,error:readError}=await sb.from('transactions').select('analytics_only,source,transaction_type').eq('id',id).single();
  if(readError)throw readError;
  if(existing?.analytics_only===true||String(existing?.source||'')==='zerodha_tradebook')throw new Error('Imported tradebook rows are read-only. Correct the source CSV and re-import it instead.');
  if(String(existing?.transaction_type||'').toLowerCase()==='opening'||String(existing?.source||'')==='holdings_snapshot')throw new Error('Opening holdings are read-only. Re-import the holdings CSV to correct them.');
  const {error}=await sb.from('transactions').update(clean).eq('id',id);
  if(error)throw error;
}

export async function deleteTransaction(id){const s=await session();if(!s){const st=localState();st.transactions=st.transactions.filter(x=>x.id!==id);saveLocal(st);return;}const {error}=await supabase().from('transactions').delete().eq('id',id);if(error)throw error;}
export async function saveManualAnnouncement(record){const s=await session();if(!s){const st=localState();st.manualAnnouncements.unshift({...record,id:uid(),is_manual:true,published_at:record.published_at||new Date().toISOString()});saveLocal(st);return;}const {error}=await supabase().from('announcements').insert({...record,is_manual:true});if(error)throw error;}

export async function importBrokerCsv(text){
  const rows=csvParse(text),state=localState(),s=await session(),ins=[],tx=[];
  for(const r of rows){
    const symbol=(r.Instrument||r.Symbol||'').trim().toUpperCase();if(!symbol)continue;
    const base=symbol.replace(/-(BE|SM|BZ|BL)$/,'');
    const defaults=ETF_DEFAULTS[symbol]||{};
    ins.push({symbol,yahoo_symbol:`${base}.NS`,name:symbol,exchange:'NSE',sector:defaults.sector||'Unclassified',asset_type:defaults.asset_type||'Equity',active:true});
    tx.push({symbol,transaction_type:'opening',trade_date:today(),quantity:Number(r['Qty.']||r.Quantity||0),price:Number(r['Avg. cost']||r['Avg Cost']||0),fees:0,notes:'Imported opening holding',analytics_only:false,source:'holdings_snapshot'});
  }
  if(!s){
    for(const x of ins){const i=state.instruments.findIndex(v=>v.symbol===x.symbol);if(i<0)state.instruments.push({...x,id:uid()});else state.instruments[i]={...state.instruments[i],...x};}
    state.transactions=state.transactions.filter(t=>t.notes!=='Imported opening holding');
    state.transactions.push(...tx.map(x=>({...x,id:uid(),created_at:new Date().toISOString()})));saveLocal(state);return {count:ins.length};
  }
  const sb=supabase();const {data:user}=await sb.auth.getUser();const user_id=user.user.id;
  const {error:e1}=await sb.from('instruments').upsert(ins.map(x=>({...x,user_id})),{onConflict:'user_id,symbol'});if(e1)throw e1;
  await sb.from('transactions').delete().eq('notes','Imported opening holding');
  const {error:e2}=await sb.from('transactions').insert(tx.map(x=>({...x,user_id})));if(e2)throw e2;return {count:ins.length};
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
export async function importTradebookCsv(text){
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
    const external_trade_id=String(r.trade_id||`${symbol}-${type}-${trade_date}-${r.order_execution_time||''}-${quantity}-${price}`).trim();
    const exchange=String(r.exchange||'NSE').toUpperCase();
    records.push({
      symbol, transaction_type:type, trade_date, quantity, price, fees:0,
      notes:`Tradebook history · ${external_trade_id}`,
      analytics_only:true, external_trade_id, source:'zerodha_tradebook',
      created_at:r.order_execution_time||new Date().toISOString(),
    });
    if(!instruments.has(symbol))instruments.set(symbol,{symbol,yahoo_symbol:yahooMapping(symbol,exchange),name:symbol,exchange,sector:ETF_DEFAULTS[symbol]?.sector||'Unclassified',asset_type:inferredAssetType(symbol),active:true});
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

export async function fetchJson(url,fallback=[]){try{if(!location.pathname.includes('/pages/')&&url.startsWith('../'))url=url.slice(3);const r=await fetch(`${url}?v=${Date.now()}`);if(!r.ok)throw new Error(r.status);return await r.json();}catch{return fallback;}}
export async function loadMarket(){const s=await session();if(s){const {data,error}=await supabase().from('latest_market_snapshots').select('*');if(!error&&data)return data;}return fetchJson(cfg.MARKET_DATA_URL||'../data/market.json',[]);}
export async function loadResults(){const s=await session();if(s){const {data,error}=await supabase().from('financial_results').select('*').order('period_end',{ascending:false});if(!error&&data)return data;}return fetchJson(cfg.RESULTS_DATA_URL||'../data/results.json',[]);}
export async function loadAnnouncements(){const s=await session();if(s){const {data,error}=await supabase().from('announcements').select('*').order('published_at',{ascending:false}).limit(500);if(!error&&data)return data;}const auto=await fetchJson(cfg.ANNOUNCEMENTS_DATA_URL||'../data/announcements.json',[]);return [...localState().manualAnnouncements,...auto];}
export function exportLocal(){return JSON.stringify(localState(),null,2);}
export function importLocal(json){const obj=JSON.parse(json);saveLocal({...defaultState(),...obj});}
export function resetLocal(){localStorage.removeItem(KEY);}
