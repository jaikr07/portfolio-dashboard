import {mountShell} from './shell.js';
import {loadCore, aggregateHoldings, loadMarket, availableAccounts} from './data-service.js';
import {fmtMoney, fmtNum, fmtPct, esc, trendClass, debounce} from './utils.js';
import {updateModeBadge} from './common.js';

mountShell('holdings','Holdings & Performance');
const root=document.getElementById('pageContent');
let rows=[];
let selectedTrend='all';
let selectedAsset='all';

const number=v=>Number.isFinite(Number(v))?Number(v):0;
function trendBucket(label=''){
  const x=String(label).toLowerCase();
  if(x.includes('bull'))return 'bullish';
  if(x.includes('bear'))return 'bearish';
  if(x.includes('watch')||x.includes('neutral')||x.includes('mixed'))return 'neutral';
  return 'unavailable';
}
function assetBucket(row){
  const type=String(row.asset_type||row.market.asset_type||'').toLowerCase();
  const label=`${row.symbol} ${row.name||''}`.toLowerCase();
  if(type.includes('etf')||/\betf\b|liquidcase|silver/.test(label))return 'etf';
  if(type.includes('reit')||type.includes('invit'))return 'reit';
  return 'equity';
}
function enriched(row){
  const price=number(row.market.close||row.avgCost);
  const value=row.quantity*price;
  const pnl=value-row.totalCost;
  const pct=row.totalCost?pnl/row.totalCost*100:0;
  return {...row,price,value,pnl,pct,trendBucket:trendBucket(row.market.trend_label),assetBucket:assetBucket(row)};
}
function allocationBar(value,max){return `<div class="mini-progress"><span style="width:${max?Math.max(2,value/max*100):0}%"></span></div>`;}

function render(){
  const q=document.getElementById('search').value.trim().toLowerCase();
  const sort=document.getElementById('sortBy').value;
  let filtered=rows.map(enriched).filter(x=>{
    const hay=`${x.symbol} ${x.name||''} ${x.sector||x.market.sector||''}`.toLowerCase();
    return (!q||hay.includes(q)) && (selectedTrend==='all'||x.trendBucket===selectedTrend) && (selectedAsset==='all'||x.assetBucket===selectedAsset);
  });
  const sorters={
    value:(a,b)=>b.value-a.value,
    return:(a,b)=>b.pct-a.pct,
    returnAsc:(a,b)=>a.pct-b.pct,
    day:(a,b)=>number(b.market.daily_change_pct)-number(a.market.daily_change_pct),
    symbol:(a,b)=>a.symbol.localeCompare(b.symbol),
  };
  filtered.sort(sorters[sort]||sorters.value);
  const maxValue=Math.max(0,...filtered.map(x=>x.value));
  document.getElementById('resultCount').textContent=`${filtered.length} of ${rows.length} holdings`;

  root.querySelector('#holdingCards').innerHTML=filtered.map(x=>{
    const asset=x.assetBucket==='etf'?'ETF':x.assetBucket==='reit'?'REIT / InvIT':'Equity';
    const alerts=(x.market.alerts||[]).slice(0,2);
    return `<article class="holding-card ${x.pnl<0?'loss-card':''}">
      <div class="holding-card-head">
        <div><div class="symbol-line"><span class="symbol-lg">${esc(x.symbol)}</span><span class="asset-chip ${x.assetBucket}">${asset}</span></div><div class="holding-sector">${esc(x.sector||x.market.sector||x.name||'Unclassified')}</div></div>
        <span class="badge ${trendClass(x.market.trend_label)}">${esc(x.market.trend_label||'No technical data')}</span>
      </div>
      <div class="holding-price-row"><div><span class="metric-label">Latest</span><strong>${fmtMoney(x.price,2)}</strong><small class="${number(x.market.daily_change_pct)>=0?'positive':'negative'}">${fmtPct(x.market.daily_change_pct)} today</small></div><div class="align-right"><span class="metric-label">Return</span><strong class="${x.pct>=0?'positive':'negative'}">${fmtPct(x.pct)}</strong><small class="money ${x.pnl>=0?'positive':'negative'}">${fmtMoney(x.pnl)}</small></div></div>
      ${allocationBar(x.value,maxValue)}
      <div class="holding-stats"><div><span>Quantity</span><strong>${fmtNum(x.quantity,3)}</strong></div><div><span>Avg cost</span><strong class="money">${fmtMoney(x.avgCost,2)}</strong></div><div><span>Invested</span><strong class="money">${fmtMoney(x.totalCost)}</strong></div><div><span>Value</span><strong class="money">${fmtMoney(x.value)}</strong></div></div>
      ${alerts.length?`<div class="holding-alerts">${alerts.map(a=>`<span>⚑ ${esc(a)}</span>`).join('')}</div>`:''}
    </article>`;
  }).join('')||'<div class="empty-state"><strong>No holdings match these filters.</strong><span>Clear a filter or try another search term.</span></div>';

  root.querySelector('#holdingsBody').innerHTML=filtered.map(x=>`<tr><td><span class="symbol">${esc(x.symbol)}</span><span class="subtext">${esc(x.sector||x.market.sector||'Unclassified')}</span></td><td>${x.assetBucket==='etf'?'ETF':x.assetBucket==='reit'?'REIT / InvIT':'Equity'}</td><td>${fmtNum(x.quantity,3)}</td><td class="money">${fmtMoney(x.avgCost,2)}</td><td>${fmtMoney(x.price,2)}</td><td class="money">${fmtMoney(x.totalCost)}</td><td class="money">${fmtMoney(x.value)}</td><td class="money ${x.pnl>=0?'positive':'negative'}">${fmtMoney(x.pnl)}</td><td class="${x.pct>=0?'positive':'negative'}">${fmtPct(x.pct)}</td><td><span class="badge ${trendClass(x.market.trend_label)}">${esc(x.market.trend_label||'No data')}</span></td></tr>`).join('')||'<tr><td colspan="10" class="empty">No matching holdings.</td></tr>';
}

function bindFilterButtons(group,callback){
  document.querySelectorAll(`[data-${group}]`).forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll(`[data-${group}]`).forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); callback(btn.dataset[group]); render();
  }));
}

async function run(){
  const [core,market]=await Promise.all([loadCore(),loadMarket()]);
  const mm=new Map(market.map(x=>[x.symbol,x]));
  const accounts=availableAccounts(core.transactions);let selectedAccount=localStorage.getItem('portfolioAccountFilter')||'All accounts';if(selectedAccount!=='All accounts'&&!accounts.includes(selectedAccount))selectedAccount='All accounts';
  rows=aggregateHoldings(core.instruments,core.transactions,selectedAccount).map(h=>({...h,market:mm.get(h.symbol)||{}}));
  const counts=rows.map(enriched).reduce((a,x)=>{a.trend[x.trendBucket]=(a.trend[x.trendBucket]||0)+1;a.asset[x.assetBucket]=(a.asset[x.assetBucket]||0)+1;return a;},{trend:{},asset:{}});
  root.innerHTML=`
    <div class="hero modern-hero"><div><span class="eyebrow">Portfolio composition</span><h2>Holdings command board</h2><p>Scan performance visually, then open the detailed ledger only when you need exact numbers.</p></div><div class="hero-actions"><label class="account-picker"><span>Account</span><select id="accountFilter" class="input"><option>All accounts</option>${accounts.map(a=>`<option ${a===selectedAccount?'selected':''}>${esc(a)}</option>`).join('')}</select></label><a class="btn primary" href="transactions.html">+ Add transaction</a></div></div>
    <div class="filter-panel">
      <div class="search-control"><span>⌕</span><input id="search" class="input" placeholder="Search company, symbol or sector"></div>
      <div class="filter-group"><span class="filter-label">Trend</span><div class="segmented"><button class="active" data-trend="all">All <b>${rows.length}</b></button><button data-trend="bullish">Bullish <b>${counts.trend.bullish||0}</b></button><button data-trend="bearish">Bearish <b>${counts.trend.bearish||0}</b></button><button data-trend="neutral">Neutral <b>${counts.trend.neutral||0}</b></button><button data-trend="unavailable">No data <b>${counts.trend.unavailable||0}</b></button></div></div>
      <div class="filter-group"><span class="filter-label">Asset</span><div class="segmented"><button class="active" data-asset="all">All</button><button data-asset="equity">Equities <b>${counts.asset.equity||0}</b></button><button data-asset="etf">ETFs <b>${counts.asset.etf||0}</b></button><button data-asset="reit">REIT / InvIT <b>${counts.asset.reit||0}</b></button></div></div>
      <div class="sort-control"><label for="sortBy">Sort</label><select id="sortBy" class="input"><option value="value">Largest value</option><option value="return">Best return</option><option value="returnAsc">Weakest return</option><option value="day">Best day</option><option value="symbol">A–Z</option></select></div>
      <div id="resultCount" class="filter-count"></div>
    </div>
    <div id="holdingCards" class="holding-card-grid"></div>
    <details class="details-panel"><summary>Open detailed holdings table</summary><div class="table-wrap"><table class="data-table"><thead><tr><th>Instrument / sector</th><th>Asset</th><th>Qty</th><th>Avg cost</th><th>Latest</th><th>Invested</th><th>Value</th><th>P&amp;L</th><th>Return</th><th>Technical</th></tr></thead><tbody id="holdingsBody"></tbody></table></div></details>`;
  document.getElementById('accountFilter').addEventListener('change',e=>{localStorage.setItem('portfolioAccountFilter',e.target.value);location.reload();});
  document.getElementById('search').addEventListener('input',debounce(render));
  document.getElementById('sortBy').addEventListener('change',render);
  bindFilterButtons('trend',v=>selectedTrend=v);
  bindFilterButtons('asset',v=>selectedAsset=v);
  render();
  await updateModeBadge(market.map(x=>x.as_of).filter(Boolean).sort().at(-1));
}
run().catch(e=>root.innerHTML=`<div class="notice warning">${esc(e.message)}</div>`);
