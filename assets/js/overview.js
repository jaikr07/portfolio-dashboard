import {ensureAuthenticated} from './auth-gate.js?v=4.0';
await ensureAuthenticated();
import {mountShell} from './shell.js';
import {loadCore, aggregateHoldings, loadMarket, loadAnnouncements, availableAccounts} from './data-service.js?v=4.0';
import {fmtMoney, fmtPct, esc, trendClass, impactClass, safeUrl} from './utils.js';
import {updateModeBadge} from './common.js';

mountShell('overview','Portfolio Overview','Loading…');
const root=document.getElementById('pageContent');
const has=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const num=v=>has(v)?Number(v):0;

function withinDays(date,days){const t=new Date(date).getTime();return Number.isFinite(t)&&t>=Date.now()-days*86400000;}
function trendBucket(label=''){const x=String(label).toLowerCase();if(x.includes('bull'))return 'bullish';if(x.includes('bear'))return 'bearish';if(x.includes('watch')||x.includes('neutral')||x.includes('mixed'))return 'neutral';return 'unavailable';}
function decisionReason(a){const score=Number(a.impact_score||0);return a.impact_reason||(score<0?'Potential downside to earnings, execution, cash flow or governance; verify the original filing.':score>0?'Potential positive effect, but quantify the revenue, margin, cash-flow or balance-sheet contribution.':'The business effect is not yet quantified and should be monitored.');}
function aggregateSectors(joined){
  const map=new Map();
  for(const x of joined){
    const sector=x.sector||x.market.sector||(String(x.asset_type||x.market.asset_type).toLowerCase()==='etf'?'ETF / Funds':'Unclassified');
    const value=x.quantity*num(x.market.close||x.avgCost);
    if(!map.has(sector))map.set(sector,{sector,value:0,holdings:0,r3Num:0,r3Den:0,r1Num:0,r1Den:0});
    const s=map.get(sector);s.value+=value;s.holdings++;
    if(has(x.market.return_3m_pct)){s.r3Num+=num(x.market.return_3m_pct)*value;s.r3Den+=value;}
    if(has(x.market.return_1y_pct)){s.r1Num+=num(x.market.return_1y_pct)*value;s.r1Den+=value;}
  }
  const total=[...map.values()].reduce((a,x)=>a+x.value,0);
  return [...map.values()].map(x=>({...x,allocation:total?x.value/total*100:0,return3m:x.r3Den?x.r3Num/x.r3Den:null,return1y:x.r1Den?x.r1Num/x.r1Den:null})).sort((a,b)=>b.value-a.value);
}
function classifyAlert(text=''){
  const x=text.toLowerCase();
  if(x.includes('below')||x.includes('death')||x.includes('breakdown'))return 'risk';
  if(x.includes('breakout')||x.includes('golden')||x.includes('above'))return 'opportunity';
  return 'watch';
}
function alertCard(a){const icon=a.kind==='risk'?'↓':a.kind==='opportunity'?'↑':'•';return `<div class="action-item ${a.kind}"><span class="action-icon">${icon}</span><div><strong>${esc(a.symbol)}</strong><p>${esc(a.text)}</p></div></div>`;}
function announcementCard(a){
  const url=safeUrl(a.source_url),score=Number(a.impact_score||0);
  return `<article class="news-card ${score<0?'news-risk':score>0?'news-positive':''}"><div class="news-meta"><span class="badge neutral">${esc(a.symbol)}</span><span>${esc(String(a.published_at||'').slice(0,10))}</span><span class="impact-score ${impactClass(score)}">${score>0?'+':''}${score}</span></div><h4>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(a.title)} ↗</a>`:esc(a.title)}</h4><p>${esc(decisionReason(a))}</p>${a.watch_items?`<small><strong>Verify:</strong> ${esc(a.watch_items)}</small>`:''}</article>`;
}
function performerCard(x,weak=false){
  return `<div class="performer-row"><div><span class="symbol">${esc(x.symbol)}</span><small>${esc(x.sector||x.market.sector||'Unclassified')}</small></div><div class="align-right"><strong class="${x.pnlPct>=0?'positive':'negative'}">${fmtPct(x.pnlPct)}</strong><small>${fmtMoney(x.market.close||x.avgCost,2)}</small></div></div>`;
}

async function run(){
  const [core,market,allAnnouncements]=await Promise.all([loadCore(),loadMarket(),loadAnnouncements()]);
  const accounts=availableAccounts(core.transactions);let selectedAccount=localStorage.getItem('portfolioAccountFilter')||'All accounts';if(selectedAccount!=='All accounts'&&!accounts.includes(selectedAccount))selectedAccount='All accounts';
  const holdings=aggregateHoldings(core.instruments,core.transactions,selectedAccount);const active=new Set(holdings.map(x=>x.symbol));const mm=new Map(market.map(x=>[x.symbol,x]));
  const joined=holdings.map(h=>({...h,market:mm.get(h.symbol)||{}}));const announcements=allAnnouncements.filter(x=>active.has(x.symbol));
  const invested=joined.reduce((s,x)=>s+x.totalCost,0);const current=joined.reduce((s,x)=>s+x.quantity*num(x.market.close||x.avgCost),0);const pnl=current-invested;const pct=invested?pnl/invested*100:0;
  const sectors=aggregateSectors(joined);const etfs=joined.filter(x=>String(x.asset_type||x.market.asset_type||'').toLowerCase()==='etf');const etfValue=etfs.reduce((s,x)=>s+x.quantity*num(x.market.close||x.avgCost),0);const liquidHoldings=joined.filter(x=>String(x.symbol).toUpperCase()==='LIQUIDCASE'||String(x.asset_type||'').toLowerCase().includes('cash'));const liquidValue=liquidHoldings.reduce((s,x)=>s+x.quantity*num(x.market.close||x.avgCost),0);const otherEtfValue=Math.max(0,etfValue-liquidValue);const deployedValue=Math.max(0,current-liquidValue);
  const breadth=joined.reduce((a,x)=>{a[trendBucket(x.market.trend_label)]++;return a;},{bullish:0,bearish:0,neutral:0,unavailable:0});
  const allAlerts=joined.flatMap(x=>(x.market.alerts||[]).map(text=>({symbol:x.symbol,text,kind:classifyAlert(text),value:x.quantity*num(x.market.close||x.avgCost)}))).sort((a,b)=>b.value-a.value);
  const riskAlerts=allAlerts.filter(x=>x.kind==='risk'),opportunityAlerts=allAlerts.filter(x=>x.kind==='opportunity'),watchAlerts=allAlerts.filter(x=>x.kind==='watch');
  const performers=[...joined].map(x=>({...x,pnlPct:x.avgCost?(num(x.market.close||x.avgCost)-x.avgCost)/x.avgCost*100:0})).sort((a,b)=>b.pnlPct-a.pnlPct);
  const recent=announcements.filter(a=>withinDays(a.published_at,7)).sort((a,b)=>String(b.published_at).localeCompare(String(a.published_at)));
  const recentRisks=recent.filter(a=>Number(a.impact_score||0)<0).sort((a,b)=>Number(a.impact_score||0)-Number(b.impact_score||0));
  const recentMaterial=[...recent].sort((a,b)=>Math.abs(Number(b.impact_score||0))-Math.abs(Number(a.impact_score||0))).slice(0,6);

  root.innerHTML=`
    <div class="hero modern-hero"><div><span class="eyebrow">Decision dashboard</span><h2>Your portfolio at a glance</h2><p>A visual summary of capital, risk concentration, technical breadth and developments that may require action.</p></div><div class="hero-actions"><label class="account-picker"><span>Account</span><select id="accountFilter" class="input"><option>All accounts</option>${accounts.map(a=>`<option ${a===selectedAccount?'selected':''}>${esc(a)}</option>`).join('')}</select></label><a class="btn primary" href="pages/transactions.html">+ Add transaction</a></div></div>
    ${joined.length?'':`<div class="notice warning">No portfolio ledger is loaded. Open <a href="pages/settings.html"><strong>Settings</strong></a> and import your holdings CSV.</div>`}
    <div class="grid kpis executive-kpis"><div class="card accent-card"><div class="kpi-label">Portfolio value</div><div class="kpi-value money">${fmtMoney(current)}</div><div class="kpi-sub">${joined.length} active positions</div></div><div class="card"><div class="kpi-label">Unrealised return</div><div class="kpi-value ${pnl>=0?'positive':'negative'}">${fmtPct(pct)}</div><div class="kpi-sub money ${pnl>=0?'positive':'negative'}">${fmtMoney(pnl)}</div></div><div class="card"><div class="kpi-label">Risk alerts</div><div class="kpi-value ${riskAlerts.length?'negative':'positive'}">${riskAlerts.length}</div><div class="kpi-sub">${opportunityAlerts.length} positive technical signals</div></div><div class="card"><div class="kpi-label">ETF / fund allocation</div><div class="kpi-value">${current?fmtPct(etfValue/current*100):'—'}</div><div class="kpi-sub">${etfs.map(x=>esc(x.symbol)).join(', ')||'No ETFs classified'}</div></div></div>
    <section class="card capital-availability"><div class="section-heading"><div><h3>Capital availability</h3><p>Separate deployable liquid reserve from market-exposed capital and other ETFs.</p></div><span class="badge neutral">${esc(selectedAccount)}</span></div><div class="capital-split"><div><span>Capital deployed</span><strong class="money">${fmtMoney(deployedValue)}</strong><small>${current?fmtPct(deployedValue/current*100):'—'} of portfolio</small></div><div><span>Liquid reserve</span><strong class="money">${fmtMoney(liquidValue)}</strong><small>${current?fmtPct(liquidValue/current*100):'—'} · ${liquidHoldings.map(x=>esc(x.symbol)).join(', ')||'No liquid ETF'}</small></div><div><span>Other ETFs</span><strong class="money">${fmtMoney(otherEtfValue)}</strong><small>${current?fmtPct(otherEtfValue/current*100):'—'} of portfolio</small></div></div><div class="capital-stack"><span class="deployed" style="width:${current?deployedValue/current*100:0}%"></span><span class="liquid" style="width:${current?liquidValue/current*100:0}%"></span><span class="other-etf" style="width:${current?otherEtfValue/current*100:0}%"></span></div></section>

    <div class="dashboard-grid overview-visuals">
      <section class="card chart-card"><div class="section-heading"><div><h3>Capital allocation</h3><p>Current market value by broad sector.</p></div><span class="badge neutral">${sectors.length} sectors</span></div><div class="chart-box overview-donut"><canvas id="sectorAllocationChart"></canvas></div><div class="chart-legend-list">${sectors.slice(0,6).map(s=>`<div><span>${esc(s.sector)}</span><strong>${fmtPct(s.allocation)}</strong></div>`).join('')}</div></section>
      <section class="card chart-card"><div class="section-heading"><div><h3>Technical breadth</h3><p>How many holdings are bullish, neutral or bearish—not just the first few alerts.</p></div><a href="pages/technicals.html" class="text-link">Open all technicals →</a></div><div class="chart-box overview-donut"><canvas id="technicalBreadthChart"></canvas></div><div class="breadth-summary"><div class="positive"><strong>${breadth.bullish}</strong><span>Bullish</span></div><div class="warning"><strong>${breadth.neutral}</strong><span>Neutral</span></div><div class="negative"><strong>${breadth.bearish}</strong><span>Bearish</span></div><div class="muted"><strong>${breadth.unavailable}</strong><span>No data</span></div></div></section>
    </div>

    <section class="card action-centre"><div class="section-heading"><div><span class="eyebrow">Action centre</span><h3>What needs attention now</h3><p>Signals are grouped by meaning; counts include the entire portfolio and cards show the most material positions first.</p></div><a href="pages/technicals.html" class="btn small">View all ${allAlerts.length} alerts</a></div><div class="action-columns"><div><div class="action-column-title"><span class="status-dot negative-bg"></span><strong>Risk warnings</strong><b>${riskAlerts.length}</b></div>${riskAlerts.slice(0,5).map(alertCard).join('')||'<div class="empty compact">No risk warnings.</div>'}</div><div><div class="action-column-title"><span class="status-dot positive-bg"></span><strong>Positive signals</strong><b>${opportunityAlerts.length}</b></div>${opportunityAlerts.slice(0,5).map(alertCard).join('')||'<div class="empty compact">No positive signals.</div>'}</div><div><div class="action-column-title"><span class="status-dot warning-bg"></span><strong>Monitor</strong><b>${watchAlerts.length}</b></div>${watchAlerts.slice(0,5).map(alertCard).join('')||'<div class="empty compact">No monitor signals.</div>'}</div></div></section>

    <section class="card sector-section"><div class="section-heading"><div><h3>Sector exposure & momentum</h3><p>Allocation and market-price momentum shown as visual tiles instead of a spreadsheet.</p></div><a href="pages/settings.html" class="text-link">Edit classifications →</a></div><div class="sector-tile-grid">${sectors.map(s=>`<article class="sector-tile"><div><span>${esc(s.sector)}</span><strong>${fmtPct(s.allocation)}</strong></div><div class="sector-bar"><span style="width:${Math.max(2,s.allocation)}%"></span></div><footer><small>${s.holdings} holding${s.holdings===1?'':'s'}</small><span class="${num(s.return1y)>=0?'positive':'negative'}">1Y ${fmtPct(s.return1y)}</span><span class="${num(s.return3m)>=0?'positive':'negative'}">3M ${fmtPct(s.return3m)}</span></footer></article>`).join('')||'<div class="empty">Sector data appears after a market refresh.</div>'}</div></section>

    <div class="dashboard-grid news-overview">
      <section class="card ${recentRisks.length?'risk-panel':''}"><div class="section-heading"><div><h3>Negative developments · last 7 days</h3><p>Placed first so adverse company updates are harder to miss.</p></div><span class="badge ${recentRisks.length?'negative':'positive'}">${recentRisks.length} flags</span></div><div class="news-card-list">${recentRisks.slice(0,5).map(announcementCard).join('')||'<div class="empty compact">No negative-scored developments in the available feed.</div>'}</div></section>
      <section class="card"><div class="section-heading"><div><h3>Material developments · last 7 days</h3><p>Highest absolute impact scores across your holdings.</p></div><a href="pages/announcements.html" class="text-link">Open news →</a></div><div class="news-card-list">${recentMaterial.map(announcementCard).join('')||'<div class="empty compact">No recent announcements loaded.</div>'}</div></section>
    </div>

    <div class="dashboard-grid performer-grid"><section class="card"><div class="section-heading"><div><h3>Leaders</h3><p>Best price returns versus your average cost.</p></div></div>${performers.slice(0,6).map(performerCard).join('')}</section><section class="card"><div class="section-heading"><div><h3>Weakest positions</h3><p>Positions requiring closer fundamental review.</p></div></div>${[...performers].reverse().slice(0,6).map(x=>performerCard(x,true)).join('')}</section></div>`;

  document.getElementById('accountFilter').addEventListener('change',e=>{localStorage.setItem('portfolioAccountFilter',e.target.value);location.reload();});
  if(window.Chart&&sectors.length){
    const palette=['#56c2ff','#7b61ff','#42d392','#f6c85f','#ff6b7a','#38bdf8','#a78bfa','#34d399','#f59e0b','#fb7185','#60a5fa','#c084fc','#2dd4bf','#fbbf24','#94a3b8'];
    new Chart(document.getElementById('sectorAllocationChart'),{type:'doughnut',data:{labels:sectors.map(x=>x.sector),datasets:[{data:sectors.map(x=>x.value),backgroundColor:sectors.map((_,i)=>palette[i%palette.length]),borderWidth:0,hoverOffset:7}]},options:{responsive:true,maintainAspectRatio:false,cutout:'68%',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.label}: ${fmtPct(sectors[c.dataIndex].allocation)}`}}}}});
  }
  if(window.Chart){
    new Chart(document.getElementById('technicalBreadthChart'),{type:'doughnut',data:{labels:['Bullish','Neutral','Bearish','No data'],datasets:[{data:[breadth.bullish,breadth.neutral,breadth.bearish,breadth.unavailable],backgroundColor:['#42d392','#f6c85f','#ff6b7a','#64748b'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:'72%',plugins:{legend:{display:false}}}});
  }
  await updateModeBadge(market.map(x=>x.as_of).filter(Boolean).sort().at(-1));
}
run().catch(e=>root.innerHTML=`<div class="notice warning">${esc(e.message)}</div>`);
