import {cfg, uid, today, csvParse} from './utils.js';
const KEY='portfolio_command_center_v1';
let supabaseClient=null;
function defaultState(){return {instruments:[],transactions:[],manualAnnouncements:[],settings:{mode:cfg.DEFAULT_MODE||'local'}}}
function localState(){try{return {...defaultState(),...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return defaultState()}}
function saveLocal(state){localStorage.setItem(KEY,JSON.stringify(state))}
export function isCloudConfigured(){return Boolean(cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY)}
export function supabase(){
  if(!isCloudConfigured()||!window.supabase)return null;
  if(!supabaseClient)supabaseClient=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  return supabaseClient;
}
export async function session(){const sb=supabase(); if(!sb)return null; const {data}=await sb.auth.getSession();return data.session}
export async function signIn(email,password){const sb=supabase();if(!sb)throw new Error('Supabase is not configured in config.js');const {data,error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;return data}
export async function signOut(){const sb=supabase();if(sb)await sb.auth.signOut()}
export async function mode(){const s=await session();return s?'cloud':'local'}
export async function loadCore(){
  const s=await session();
  if(!s)return localState();
  const sb=supabase();
  const [{data:instruments,error:e1},{data:transactions,error:e2},{data:manualAnnouncements,error:e3}]=await Promise.all([
    sb.from('instruments').select('*').order('symbol'),sb.from('transactions').select('*').order('trade_date',{ascending:false}),sb.from('announcements').select('*').eq('is_manual',true).order('published_at',{ascending:false})
  ]);
  if(e1||e2||e3)throw e1||e2||e3;
  return {instruments:instruments||[],transactions:transactions||[],manualAnnouncements:manualAnnouncements||[],settings:{mode:'cloud'}};
}
export function aggregateHoldings(instruments,transactions){
  const map=new Map();
  for(const ins of instruments)map.set(ins.symbol,{...ins,quantity:0,totalCost:0,realizedPnl:0});
  const sorted=[...transactions].sort((a,b)=>String(a.trade_date).localeCompare(String(b.trade_date)));
  for(const t of sorted){
    const symbol=String(t.symbol||'').toUpperCase();
    if(!map.has(symbol))map.set(symbol,{symbol,yahoo_symbol:`${symbol}.NS`,name:symbol,quantity:0,totalCost:0,realizedPnl:0,active:true});
    const p=map.get(symbol),q=Number(t.quantity||0),price=Number(t.price||0),fees=Number(t.fees||0),type=String(t.transaction_type||'buy').toLowerCase();
    if(['buy','opening','bonus'].includes(type)){
      p.quantity+=q; p.totalCost+=type==='bonus'?fees:q*price+fees;
    } else if(type==='sell'){
      const avg=p.quantity?p.totalCost/p.quantity:0; const sellQ=Math.min(q,p.quantity); p.realizedPnl+=sellQ*(price-avg)-fees; p.quantity-=sellQ;p.totalCost-=sellQ*avg;
    } else if(type==='split'){
      p.quantity+=q;
    } else if(type==='adjustment'){
      p.quantity+=q;p.totalCost+=q*price+fees;
    }
  }
  return [...map.values()].filter(p=>p.active!==false&&p.quantity>0.000001).map(p=>({...p,avgCost:p.quantity?p.totalCost/p.quantity:0}));
}
export async function upsertInstrument(record){
  record={...record,symbol:String(record.symbol).trim().toUpperCase(),yahoo_symbol:String(record.yahoo_symbol||`${record.symbol}.NS`).trim().toUpperCase(),active:record.active!==false};
  const s=await session();
  if(!s){const st=localState();const i=st.instruments.findIndex(x=>x.symbol===record.symbol);if(i>=0)st.instruments[i]={...st.instruments[i],...record};else st.instruments.push({...record,id:uid()});saveLocal(st);return}
  const {error}=await supabase().from('instruments').upsert(record,{onConflict:'user_id,symbol'});if(error)throw error;
}
export async function addTransaction(record){
  const clean={...record,symbol:String(record.symbol).trim().toUpperCase(),quantity:Number(record.quantity),price:Number(record.price||0),fees:Number(record.fees||0),trade_date:record.trade_date||today()};
  const s=await session();
  if(!s){const st=localState();st.transactions.push({...clean,id:uid(),created_at:new Date().toISOString()});saveLocal(st);return}
  const {error}=await supabase().from('transactions').insert(clean);if(error)throw error;
}
export async function deleteTransaction(id){const s=await session();if(!s){const st=localState();st.transactions=st.transactions.filter(x=>x.id!==id);saveLocal(st);return}const {error}=await supabase().from('transactions').delete().eq('id',id);if(error)throw error}
export async function saveManualAnnouncement(record){const s=await session();if(!s){const st=localState();st.manualAnnouncements.unshift({...record,id:uid(),is_manual:true,published_at:record.published_at||new Date().toISOString()});saveLocal(st);return}const {error}=await supabase().from('announcements').insert({...record,is_manual:true});if(error)throw error}
export async function importBrokerCsv(text){
  const rows=csvParse(text),state=localState(),s=await session(),ins=[],tx=[];
  for(const r of rows){
    const symbol=(r.Instrument||r.Symbol||'').trim().toUpperCase();if(!symbol)continue;
    const base=symbol.replace(/-(BE|SM|BZ|BL)$/,'');
    ins.push({symbol,yahoo_symbol:`${base}.NS`,name:symbol,exchange:'NSE',active:true});
    tx.push({symbol,transaction_type:'opening',trade_date:today(),quantity:Number(r['Qty.']||r.Quantity||0),price:Number(r['Avg. cost']||r['Avg Cost']||0),fees:0,notes:'Imported opening holding'});
  }
  if(!s){
    for(const x of ins){const i=state.instruments.findIndex(v=>v.symbol===x.symbol);if(i<0)state.instruments.push({...x,id:uid()})}
    state.transactions=state.transactions.filter(t=>t.notes!=='Imported opening holding');
    state.transactions.push(...tx.map(x=>({...x,id:uid(),created_at:new Date().toISOString()})));saveLocal(state);return {count:ins.length};
  }
  const sb=supabase();const {data:user}=await sb.auth.getUser();const user_id=user.user.id;
  const {error:e1}=await sb.from('instruments').upsert(ins.map(x=>({...x,user_id})),{onConflict:'user_id,symbol'});if(e1)throw e1;
  await sb.from('transactions').delete().eq('notes','Imported opening holding');
  const {error:e2}=await sb.from('transactions').insert(tx.map(x=>({...x,user_id})));if(e2)throw e2;return {count:ins.length};
}
export async function fetchJson(url,fallback=[]){try{if(!location.pathname.includes('/pages/')&&url.startsWith('../'))url=url.slice(3);const r=await fetch(`${url}?v=${Date.now()}`);if(!r.ok)throw new Error(r.status);return await r.json()}catch{return fallback}}
export async function loadMarket(){
  const s=await session();
  if(s){const {data,error}=await supabase().from('latest_market_snapshots').select('*');if(!error&&data)return data}
  return fetchJson(cfg.MARKET_DATA_URL||'../data/market.json',[]);
}
export async function loadResults(){
  const s=await session();
  if(s){const {data,error}=await supabase().from('financial_results').select('*').order('period_end',{ascending:false});if(!error&&data)return data}
  return fetchJson(cfg.RESULTS_DATA_URL||'../data/results.json',[]);
}
export async function loadAnnouncements(){
  const s=await session();
  if(s){const {data,error}=await supabase().from('announcements').select('*').order('published_at',{ascending:false}).limit(500);if(!error&&data)return data}
  const auto=await fetchJson(cfg.ANNOUNCEMENTS_DATA_URL||'../data/announcements.json',[]);return [...localState().manualAnnouncements,...auto];
}
export function exportLocal(){return JSON.stringify(localState(),null,2)}
export function importLocal(json){const obj=JSON.parse(json);saveLocal({...defaultState(),...obj})}
export function resetLocal(){localStorage.removeItem(KEY)}
