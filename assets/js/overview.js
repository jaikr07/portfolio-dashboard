import {mountShell} from './shell.js';
import {loadCore, aggregateHoldings, loadMarket, loadAnnouncements} from './data-service.js';
import {fmtMoney, fmtPct, esc, trendClass, impactClass, safeUrl} from './utils.js';
import {updateModeBadge} from './common.js';

mountShell('overview', 'Portfolio Overview', 'Loading…');
const root = document.getElementById('pageContent');
const has = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

function withinDays(date, days) {
  const t = new Date(date).getTime();
  return Number.isFinite(t) && t >= Date.now() - days * 86400000;
}

function decisionReason(a) {
  const score = Number(a.impact_score || 0);
  return a.impact_reason || (score < 0
    ? 'Potential downside to earnings, execution, cash flow or governance; verify the original source.'
    : score > 0
      ? 'Potential positive effect, but quantify the revenue, margin, cash-flow or balance-sheet contribution.'
      : 'The business effect is not yet quantified and should be monitored.');
}

function aggregateSectors(joined) {
  const map = new Map();
  for (const x of joined) {
    const sector = x.sector || x.market.sector || (String(x.asset_type || x.market.asset_type).toLowerCase() === 'etf' ? 'ETF / Funds' : 'Unclassified');
    const value = x.quantity * Number(x.market.close || x.avgCost || 0);
    if (!map.has(sector)) map.set(sector, {sector, value:0, holdings:0, r3Num:0, r3Den:0, r1Num:0, r1Den:0, r2Num:0, r2Den:0});
    const s = map.get(sector);
    s.value += value;
    s.holdings += 1;
    for (const [field, num, den] of [['return_3m_pct','r3Num','r3Den'],['return_1y_pct','r1Num','r1Den'],['return_2y_pct','r2Num','r2Den']]) {
      if (has(x.market[field])) { s[num] += Number(x.market[field]) * value; s[den] += value; }
    }
  }
  const total = [...map.values()].reduce((sum,x)=>sum+x.value,0);
  return [...map.values()].map(x => ({
    ...x,
    allocation: total ? x.value / total * 100 : 0,
    return3m: x.r3Den ? x.r3Num / x.r3Den : null,
    return1y: x.r1Den ? x.r1Num / x.r1Den : null,
    return2y: x.r2Den ? x.r2Num / x.r2Den : null,
  })).sort((a,b)=>b.value-a.value);
}

function announcementCard(a, compact=false) {
  const url = safeUrl(a.source_url);
  return `<div class="announcement ${compact ? 'compact-announcement' : ''}" style="grid-template-columns:${compact ? '74px 1fr auto' : '90px 1fr auto'}">
    <div><span class="badge neutral">${esc(a.symbol)}</span><span class="subtext">${esc(String(a.published_at || '').slice(0,10))}</span></div>
    <div><h4>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(a.title)} ↗</a>` : esc(a.title)}</h4><p>${esc(decisionReason(a))}</p></div>
    <div><div class="impact-score ${impactClass(a.impact_score)}">${Number(a.impact_score||0)>0?'+':''}${Number(a.impact_score||0)}</div><span class="badge ${impactClass(a.impact_score)}">${esc(a.impact_label || 'Neutral')}</span></div>
  </div>`;
}

async function run() {
  const [core, market, allAnnouncements] = await Promise.all([loadCore(), loadMarket(), loadAnnouncements()]);
  const holdings = aggregateHoldings(core.instruments, core.transactions);
  const active = new Set(holdings.map(x => x.symbol));
  const marketMap = new Map(market.map(x => [x.symbol, x]));
  const joined = holdings.map(h => ({...h, market:marketMap.get(h.symbol)||{}}));
  const announcements = allAnnouncements.filter(x => active.has(x.symbol));

  const invested = joined.reduce((s,x)=>s+x.totalCost,0);
  const current = joined.reduce((s,x)=>s+x.quantity*Number(x.market.close||x.avgCost),0);
  const pnl = current-invested;
  const pct = invested ? pnl/invested*100 : 0;
  const alerts = joined.flatMap(x => (x.market.alerts||[]).map(a => ({symbol:x.symbol,text:a,severity:a.toLowerCase().includes('below')||a.toLowerCase().includes('death')||a.toLowerCase().includes('breakdown')?'negative':a.toLowerCase().includes('breakout')||a.toLowerCase().includes('golden')?'positive':'warning'}))).slice(0,12);
  const top = [...joined].map(x => ({...x,pnlPct:x.avgCost?(Number(x.market.close||x.avgCost)-x.avgCost)/x.avgCost*100:0})).sort((a,b)=>b.pnlPct-a.pnlPct).slice(0,8);
  const sectors = aggregateSectors(joined);
  const etfs = joined.filter(x => String(x.asset_type || x.market.asset_type || '').toLowerCase() === 'etf');
  const etfValue = etfs.reduce((s,x)=>s+x.quantity*Number(x.market.close||x.avgCost),0);
  const recent = announcements.filter(a=>withinDays(a.published_at,7)).sort((a,b)=>String(b.published_at).localeCompare(String(a.published_at)));
  const recentRisks = recent.filter(a=>Number(a.impact_score||0)<0).sort((a,b)=>Number(a.impact_score||0)-Number(b.impact_score||0));
  const recentMaterial = [...recent].sort((a,b)=>Math.abs(Number(b.impact_score||0))-Math.abs(Number(a.impact_score||0)) || String(b.published_at).localeCompare(String(a.published_at))).slice(0,6);

  root.innerHTML = `
    <div class="hero"><div><h2>Your portfolio at a glance</h2><p>End-of-day performance, sector exposure, technical posture and the latest decision-relevant developments across all active positions.</p></div><a class="btn primary" href="pages/transactions.html">+ Add transaction</a></div>
    ${joined.length ? '' : `<div class="notice warning">No portfolio ledger is loaded in this browser yet. Open <a href="pages/settings.html"><strong>Settings</strong></a> and import your broker CSV.</div>`}
    <div class="grid kpis">
      <div class="card"><div class="kpi-label">Invested capital</div><div class="kpi-value money">${fmtMoney(invested)}</div><div class="kpi-sub">Across ${joined.length} active holdings</div></div>
      <div class="card"><div class="kpi-label">Current value</div><div class="kpi-value money">${fmtMoney(current)}</div><div class="kpi-sub">Based on latest available close</div></div>
      <div class="card"><div class="kpi-label">Unrealised P&amp;L</div><div class="kpi-value money ${pnl>=0?'positive':'negative'}">${fmtMoney(pnl)}</div><div class="kpi-sub ${pnl>=0?'positive':'negative'}">${fmtPct(pct)}</div></div>
      <div class="card"><div class="kpi-label">ETF / fund allocation</div><div class="kpi-value">${current ? fmtPct(etfValue/current*100) : '—'}</div><div class="kpi-sub">${etfs.length} holding${etfs.length===1?'':'s'}: ${etfs.map(x=>esc(x.symbol)).join(', ') || 'none'}</div></div>
    </div>

    <div class="card risk-overview ${recentRisks.length ? 'has-risk' : ''}">
      <div class="section-heading"><div><h3>Recent negative developments — last 7 days</h3><p>These are placed first because they may require faster verification.</p></div><span class="badge ${recentRisks.length?'negative':'positive'}">${recentRisks.length} risk flag${recentRisks.length===1?'':'s'}</span></div>
      ${recentRisks.length ? recentRisks.slice(0,5).map(a=>announcementCard(a,true)).join('') : '<div class="empty compact">No negative-scored developments found in the available feed during the last 7 days.</div>'}
    </div>

    <div class="grid two" style="margin-top:16px">
      <div class="card"><h3>Sector capital allocation</h3><p class="card-intro">Broad sectors are editable in Settings. ETFs are separated from operating companies.</p><div class="chart-box"><canvas id="sectorAllocationChart"></canvas></div></div>
      <div class="card"><h3>Sector price performance</h3><p class="card-intro">Current-value-weighted price return of the holdings in each sector; this is not portfolio IRR.</p><div class="chart-box"><canvas id="sectorPerformanceChart"></canvas></div></div>
    </div>

    <div class="card" style="margin-top:16px"><h3>Sector summary</h3><div class="table-wrap"><table class="data-table sector-table"><thead><tr><th>Sector</th><th>Holdings</th><th>Allocation</th><th>3 months</th><th>1 year</th><th>2 years</th></tr></thead><tbody>${sectors.map(s=>`<tr><td><span class="symbol">${esc(s.sector)}</span></td><td>${s.holdings}</td><td>${fmtPct(s.allocation)}</td><td class="${Number(s.return3m)>=0?'positive':'negative'}">${fmtPct(s.return3m)}</td><td class="${Number(s.return1y)>=0?'positive':'negative'}">${fmtPct(s.return1y)}</td><td class="${Number(s.return2y)>=0?'positive':'negative'}">${fmtPct(s.return2y)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sector data will appear after a market refresh.</td></tr>'}</tbody></table></div></div>

    <div class="grid two" style="margin-top:16px">
      <div class="card"><h3>Technical alerts</h3><div class="signal-list">${alerts.length?alerts.map(a=>`<div class="signal-item"><div><strong>${esc(a.symbol)}</strong><p>${esc(a.text)}</p></div><span class="badge ${a.severity}">${a.severity}</span></div>`).join(''):'<div class="empty">No technical alerts in the latest snapshot.</div>'}</div></div>
      <div class="card"><h3>Latest material developments — last 7 days</h3>${recentMaterial.length?recentMaterial.map(a=>announcementCard(a,true)).join(''):'<div class="empty">No recent announcements loaded in the available feed.</div>'}</div>
    </div>

    <div class="card" style="margin-top:16px"><h3>Best / weakest performers</h3><div class="table-wrap"><table class="data-table" style="min-width:650px"><thead><tr><th>Holding</th><th>Price</th><th>P&amp;L %</th><th>Sector</th><th>Trend</th></tr></thead><tbody>${top.map(x=>`<tr><td><span class="symbol">${esc(x.symbol)}</span>${String(x.asset_type||x.market.asset_type).toLowerCase()==='etf'?'<span class="badge neutral" style="margin-left:7px">ETF</span>':''}</td><td>${fmtMoney(x.market.close||x.avgCost,2)}</td><td class="${x.pnlPct>=0?'positive':'negative'}">${fmtPct(x.pnlPct)}</td><td>${esc(x.sector||x.market.sector||'Unclassified')}</td><td><span class="badge ${trendClass(x.market.trend_label)}">${esc(x.market.trend_label||'No data')}</span></td></tr>`).join('')}</tbody></table></div></div>`;

  if (window.Chart && sectors.length) {
    new Chart(document.getElementById('sectorAllocationChart'), {
      type:'bar',
      data:{labels:sectors.map(x=>x.sector),datasets:[{label:'Allocation %',data:sectors.map(x=>x.allocation),borderWidth:1}]},
      options:{indexAxis:'y',maintainAspectRatio:false,scales:{x:{beginAtZero:true,ticks:{color:'#93a4b8',callback:v=>`${v}%`},grid:{color:'rgba(147,164,184,.12)'}},y:{ticks:{color:'#cbd6e2'},grid:{display:false}}},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.raw.toFixed(2)}% (${fmtMoney(sectors[c.dataIndex].value)})`}}}}
    });
    new Chart(document.getElementById('sectorPerformanceChart'), {
      type:'bar',
      data:{labels:sectors.map(x=>x.sector),datasets:[{label:'3M',data:sectors.map(x=>x.return3m)},{label:'1Y',data:sectors.map(x=>x.return1y)},{label:'2Y',data:sectors.map(x=>x.return2y)}]},
      options:{maintainAspectRatio:false,scales:{x:{ticks:{color:'#cbd6e2',maxRotation:55,minRotation:25},grid:{display:false}},y:{ticks:{color:'#93a4b8',callback:v=>`${v}%`},grid:{color:'rgba(147,164,184,.12)'}}},plugins:{legend:{labels:{color:'#cbd6e2'}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${has(c.raw)?Number(c.raw).toFixed(2)+'%':'—'}`}}}}
    });
  }
  const latest = market.map(x=>x.as_of).filter(Boolean).sort().at(-1);
  await updateModeBadge(latest);
}

run().catch(e => {root.innerHTML=`<div class="notice warning">Could not load dashboard: ${esc(e.message)}</div>`;console.error(e)});
