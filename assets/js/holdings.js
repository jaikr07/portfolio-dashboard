import {mountShell} from './shell.js';
import {loadCore, aggregateHoldings, loadMarket} from './data-service.js';
import {fmtMoney, fmtNum, fmtPct, esc, trendClass, debounce} from './utils.js';
import {updateModeBadge} from './common.js';

mountShell('holdings','Holdings & Performance');
const root=document.getElementById('pageContent');
let rows=[];

function render(){
  const q=document.getElementById('search').value.toLowerCase();
  const trend=document.getElementById('trendFilter').value.toLowerCase();
  const asset=document.getElementById('assetFilter').value.toLowerCase();
  const filtered=rows.filter(x=>{
    const label=String(x.market.trend_label||'').toLowerCase();
    const type=String(x.asset_type||x.market.asset_type||'Equity').toLowerCase();
    return (!q||`${x.symbol} ${x.name||''} ${x.sector||x.market.sector||''}`.toLowerCase().includes(q))&&(!trend||label.includes(trend))&&(!asset||type===asset);
  });
  root.querySelector('#holdingsBody').innerHTML=filtered.map(x=>{
    const price=Number(x.market.close||x.avgCost),value=x.quantity*price,pnl=value-x.totalCost,pct=x.totalCost?pnl/x.totalCost*100:0;
    const type=String(x.asset_type||x.market.asset_type||'Equity');
    return `<tr><td><span class="symbol">${esc(x.symbol)}</span>${type.toLowerCase()==='etf'?'<span class="badge neutral" style="margin-left:7px">ETF</span>':''}<span class="subtext">${esc(x.sector||x.market.sector||x.name||x.yahoo_symbol||'Unclassified')}</span></td><td>${fmtNum(x.quantity,3)}</td><td class="money">${fmtMoney(x.avgCost,2)}</td><td>${fmtMoney(price,2)}</td><td class="money">${fmtMoney(x.totalCost)}</td><td class="money">${fmtMoney(value)}</td><td class="money ${pnl>=0?'positive':'negative'}">${fmtMoney(pnl)}</td><td class="${pct>=0?'positive':'negative'}">${fmtPct(pct)}</td><td>${fmtPct(x.market.daily_change_pct)}</td><td><span class="badge ${trendClass(x.market.trend_label)}">${esc(x.market.trend_label||'No data')}</span></td></tr>`;
  }).join('')||'<tr><td colspan="10" class="empty">No matching holdings.</td></tr>';
}

async function run(){
  const [core,market]=await Promise.all([loadCore(),loadMarket()]);
  const mm=new Map(market.map(x=>[x.symbol,x]));
  rows=aggregateHoldings(core.instruments,core.transactions).map(h=>({...h,market:mm.get(h.symbol)||{}}));
  root.innerHTML=`<div class="hero"><div><h2>Current holdings</h2><p>Quantity, average cost, market value, return, sector, ETF status and technical trend in one view.</p></div><a class="btn primary" href="transactions.html">+ Add transaction</a></div><div class="card"><div class="toolbar"><input id="search" class="input" placeholder="Search symbol, company or sector"><select id="trendFilter" class="input"><option value="">All trends</option><option value="bull">Bullish</option><option value="bear">Bearish</option><option value="watch">Neutral / watch</option></select><select id="assetFilter" class="input"><option value="">All assets</option><option value="equity">Equities</option><option value="etf">ETFs</option></select></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Instrument / sector</th><th>Qty</th><th>Avg cost</th><th>Latest</th><th>Invested</th><th>Value</th><th>P&amp;L</th><th>Return</th><th>Day</th><th>Technical</th></tr></thead><tbody id="holdingsBody"></tbody></table></div></div>`;
  document.getElementById('search').addEventListener('input',debounce(render));
  document.getElementById('trendFilter').addEventListener('change',render);
  document.getElementById('assetFilter').addEventListener('change',render);
  render();
  await updateModeBadge(market.map(x=>x.as_of).filter(Boolean).sort().at(-1));
}
run().catch(e=>root.innerHTML=`<div class="notice warning">${esc(e.message)}</div>`);
