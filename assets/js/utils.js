export const cfg = window.PORTFOLIO_CONFIG || {};
const present = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
export const fmtMoney = (v, digits=0) => present(v) ? new Intl.NumberFormat(cfg.LOCALE || 'en-IN', {style:'currency',currency:cfg.CURRENCY || 'INR',maximumFractionDigits:digits}).format(Number(v)) : '—';
export const fmtNum = (v, digits=2) => present(v) ? new Intl.NumberFormat(cfg.LOCALE || 'en-IN',{maximumFractionDigits:digits}).format(Number(v)) : '—';
export const fmtPct = (v, digits=2) => present(v) ? `${Number(v).toFixed(digits)}%` : '—';
export const esc = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
export const safeUrl = (s='') => { try { const u=new URL(String(s), location.href); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
export const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
export const today = () => new Date().toISOString().slice(0,10);
export function csvParse(text){
  const rows=[]; let row=[], cell='', quote=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i], next=text[i+1];
    if(ch==='"' && quote && next==='"'){cell+='"';i++;continue}
    if(ch==='"'){quote=!quote;continue}
    if(ch===',' && !quote){row.push(cell);cell='';continue}
    if((ch==='\n'||ch==='\r')&&!quote){if(ch==='\r'&&next==='\n')i++;row.push(cell);cell='';if(row.some(x=>x.trim()!==''))rows.push(row);row=[];continue}
    cell+=ch;
  }
  if(cell||row.length){row.push(cell);rows.push(row)}
  const headers=rows.shift().map(h=>h.trim());
  return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]||'').trim()])));
}
export function download(name, content, type='application/json'){
  const blob=new Blob([content],{type}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href);
}
export function impactClass(score){score=Number(score||0); return score>=2?'positive':score<=-2?'negative':score!==0?'warning':'neutral'}
export function trendClass(label=''){label=label.toLowerCase(); return label.includes('bull')?'positive':label.includes('bear')?'negative':label.includes('watch')?'warning':'neutral'}
export function debounce(fn,wait=250){let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),wait)}}
