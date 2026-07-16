import {ensureAuthenticated} from './auth-gate.js?v=4.0';
await ensureAuthenticated();
import {mountShell} from './shell.js';
import {loadCore, aggregateHoldings, loadResults, availableAccounts} from './data-service.js?v=4.0';
import {fmtPct, esc} from './utils.js';
import {updateModeBadge} from './common.js';

mountShell('results','Financial Performance & Cash Quality');
const root=document.getElementById('pageContent');
const has=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const canonicalSymbol=value=>String(value||'').trim().toUpperCase().replace(/-(BE|SM|BZ|BL)$/,'');
const num=v=>has(v)?Number(v):null;
const metricClass=v=>!has(v)?'muted':Number(v)>0?'positive':Number(v)<0?'negative':'muted';
const pp=v=>has(v)?`${Number(v)>0?'+':''}${Number(v).toFixed(2)} pp`:'—';
const qualityClass=score=>Number(score)>=70?'positive':Number(score)<40?'negative':'warning';
const median=values=>{const clean=values.filter(has).map(Number).sort((a,b)=>a-b);if(!clean.length)return null;const m=Math.floor(clean.length/2);return clean.length%2?clean[m]:(clean[m-1]+clean[m])/2;};

function sortedRows(rows,type){return rows.filter(x=>x.period_type===type).sort((a,b)=>String(b.period_end).localeCompare(String(a.period_end)));}
function latest(rows,type){return sortedRows(rows,type)[0]||null;}
function firstWith(rows,fields){return rows.find(row=>fields.some(field=>has(row[field])))||null;}
function metric(label,value,format='pct',tone=true,sub=''){
  const shown=format==='pp'?pp(value):fmtPct(value);
  return `<div class="result-metric"><span>${esc(label)}</span><strong class="${tone?metricClass(value):''}">${shown}</strong>${sub?`<small>${esc(sub)}</small>`:''}</div>`;
}
function insight(q,cash){
  const rev=num(q?.revenue_yoy),profit=num(q?.net_income_yoy),margin=num(q?.operating_margin_change_yoy_pp),conversion=num(cash?.cash_conversion_pct),fcf=num(cash?.fcf_margin_pct);
  const positives=[];const risks=[];
  if(rev!==null)(rev>=15?positives:rev<0?risks:[]).push(rev>=15?'strong revenue growth':'revenue contraction');
  if(profit!==null)(profit>=15?positives:profit<0?risks:[]).push(profit>=15?'strong profit growth':'profit contraction');
  if(margin!==null)(margin>0?positives:margin<=-1?risks:[]).push(margin>0?'margin expansion':'margin pressure');
  if(conversion!==null)(conversion>=70?positives:conversion<40?risks:[]).push(conversion>=70?'healthy cash conversion':'weak cash conversion');
  if(fcf!==null)(fcf>0?positives:risks).push(fcf>0?'positive free cash flow':'negative free cash flow');
  if(risks.length)return `Watch ${risks.slice(0,2).join(' and ')}${positives.length?`; offset partly by ${positives[0]}`:''}.`;
  if(positives.length)return `Positive setup: ${positives.slice(0,3).join(', ')}.`;
  return 'Insufficient comparable data for a strong conclusion; use the original filing for confirmation.';
}
function cashAvailability(row){
  if(row?.cash_metrics_applicable===false||String(row?.cash_flow_basis).toLowerCase()==='not applicable')return {status:'not-applicable',message:row.cash_flow_note||'Cash-flow ratios are not comparable for this financial business.'};
  if(row&&['ocf_margin_pct','cash_conversion_pct','capex_intensity_pct','fcf_margin_pct'].some(f=>has(row[f])))return {status:'available',message:row.cash_flow_note||`${row.cash_flow_basis||'Reported'} cash-flow metrics.`};
  return {status:'missing',message:'The provider did not return a usable cash-flow statement for this period. This is a source-coverage gap, not a zero.'};
}
function companyCard(item){
  const {symbol,q,cash,annual,sector}=item; const score=q?.quality_score??cash?.quality_score; const availability=cashAvailability(cash);
  const cashBasis=cash?.period_type==='annual'&&q?.period_type==='quarterly'?'Latest annual fallback':cash?.cash_flow_basis||cash?.period_type||'Unavailable';
  const coverage=[q?.revenue_yoy,q?.net_income_yoy,q?.operating_margin_pct,cash?.ocf_margin_pct,cash?.cash_conversion_pct,cash?.capex_intensity_pct,cash?.fcf_margin_pct].filter(has).length;
  return `<article class="company-result-card" data-symbol="${esc(symbol)}" data-quality="${esc(String(q?.quality_label||cash?.quality_label||'').toLowerCase())}">
    <header><div><div class="result-symbol-line"><span class="symbol-lg">${esc(symbol)}</span><span class="badge neutral">${esc(sector||'Unclassified')}</span></div><small>Latest quarter ${esc(q?.period_end||'unavailable')}</small></div><div class="quality-orb ${qualityClass(score)}"><strong>${has(score)?Math.round(Number(score)):'—'}</strong><span>${esc(q?.quality_label||cash?.quality_label||'Awaiting data')}</span></div></header>
    <div class="result-insight ${insight(q,cash).startsWith('Watch')?'risk-insight':''}"><span>Decision read</span><p>${esc(insight(q,cash))}</p></div>
    <div class="result-pillars">
      <section><h4>Growth momentum</h4><div class="result-metric-grid">${metric('Revenue YoY',q?.revenue_yoy)}${metric('Revenue QoQ',q?.revenue_qoq)}${metric('Operating profit YoY',q?.operating_income_yoy)}${metric('Net profit YoY',q?.net_income_yoy)}</div></section>
      <section><h4>Margins</h4><div class="result-metric-grid">${metric('Operating margin',q?.operating_margin_pct)}${metric('Margin change YoY',q?.operating_margin_change_yoy_pp,'pp')}${metric('Net margin',q?.net_margin_pct)}</div></section>
      <section class="cash-pillar ${availability.status}"><div class="pillar-heading"><h4>Cash quality</h4><span class="badge ${availability.status==='available'?'positive':availability.status==='not-applicable'?'neutral':'warning'}">${esc(cashBasis)}</span></div>${availability.status==='not-applicable'?`<div class="metric-explanation">${esc(availability.message)}</div>`:`<div class="result-metric-grid">${metric('OCF growth YoY',cash?.ocf_yoy)}${metric('OCF margin',cash?.ocf_margin_pct)}${metric('Cash conversion',cash?.cash_conversion_pct,false)}${metric('Capex intensity',cash?.capex_intensity_pct,false)}${metric('FCF margin',cash?.fcf_margin_pct)}</div><small class="cash-note">${esc(availability.message)}</small>`}</section>
    </div>
    <footer><span>Data coverage: <strong>${coverage}/7</strong> decision fields</span>${annual?`<span>Latest annual: ${esc(annual.period_end)}</span>`:''}</footer>
  </article>`;
}

async function run(){
  const [core,res]=await Promise.all([loadCore(),loadResults()]);const accounts=availableAccounts(core.transactions);let selectedAccount=localStorage.getItem('portfolioAccountFilter')||'All accounts';if(selectedAccount!=='All accounts'&&!accounts.includes(selectedAccount))selectedAccount='All accounts';const holdings=aggregateHoldings(core.instruments,core.transactions,selectedAccount);const active=new Set(holdings.map(x=>x.symbol));const insMap=new Map();for(const instrument of core.instruments){insMap.set(instrument.symbol,instrument);insMap.set(canonicalSymbol(instrument.symbol),instrument);}const etfs=holdings.filter(x=>String(x.asset_type||'').toLowerCase()==='etf').map(x=>x.symbol);
  const activeCanonical=new Set([...active].map(canonicalSymbol));const rows=res.filter(x=>active.has(x.symbol)||activeCanonical.has(canonicalSymbol(x.symbol)));const symbols=[...new Set(holdings.map(x=>x.symbol))].sort();
  const items=symbols.filter(s=>!etfs.includes(s)).map(symbol=>{
    const company=rows.filter(x=>x.symbol===symbol||canonicalSymbol(x.symbol)===canonicalSymbol(symbol));const quarters=sortedRows(company,'quarterly');const annuals=sortedRows(company,'annual');const q=quarters[0]||annuals[0]||null;
    const cash=firstWith(quarters,['ocf_margin_pct','cash_conversion_pct','capex_intensity_pct','fcf_margin_pct'])||firstWith(annuals,['ocf_margin_pct','cash_conversion_pct','capex_intensity_pct','fcf_margin_pct'])||q;
    return {symbol,q,cash,annual:annuals[0]||null,quarters,annuals,sector:(insMap.get(symbol)||insMap.get(canonicalSymbol(symbol)))?.sector||'Unclassified'};
  });
  const availableItems=items.filter(x=>x.q);const latestRows=availableItems.map(x=>x.q);const cashAvailable=items.filter(x=>cashAvailability(x.cash).status==='available').length;const cashNA=items.filter(x=>cashAvailability(x.cash).status==='not-applicable').length;const improving=latestRows.filter(x=>Number(x.quality_score)>=70).length;const weakening=latestRows.filter(x=>has(x.quality_score)&&Number(x.quality_score)<40).length;const medGrowth=median(latestRows.map(x=>x.revenue_yoy));

  root.innerHTML=`
    <div class="hero modern-hero"><div><span class="eyebrow">Fundamental health</span><h2>Financial decision dashboard</h2><p>Company cards prioritize growth, margin direction, cash conversion and reinvestment intensity. Missing fields are explained instead of being shown as meaningless dashes.</p></div><label class="account-picker"><span>Account</span><select id="accountFilter" class="input"><option>All accounts</option>${accounts.map(a=>`<option ${a===selectedAccount?'selected':''}>${esc(a)}</option>`).join('')}</select></label></div>
    ${availableItems.length<items.length?`<div class="notice warning"><strong>Financial-data coverage:</strong> ${availableItems.length}/${items.length} companies have a result record. The m.Stock-only companies will remain blank until the repaired <code>setup/symbols.csv</code> is committed and “Refresh portfolio data” is run with financial results enabled.</div>`:''}
    ${etfs.length?`<div class="notice"><strong>ETF treatment:</strong> ${etfs.map(esc).join(', ')} remain in holdings and technicals but are excluded here because operating revenue, OCF and capex are company metrics.</div>`:''}
    <div class="grid kpis"><div class="card accent-card"><div class="kpi-label">Median revenue growth</div><div class="kpi-value ${metricClass(medGrowth)}">${fmtPct(medGrowth)}</div><div class="kpi-sub">Latest reported quarter</div></div><div class="card"><div class="kpi-label">Improving quality</div><div class="kpi-value positive">${improving}</div><div class="kpi-sub">Score 70 or above</div></div><div class="card"><div class="kpi-label">Weakening quality</div><div class="kpi-value ${weakening?'negative':'positive'}">${weakening}</div><div class="kpi-sub">Score below 40</div></div><div class="card"><div class="kpi-label">Cash-flow coverage</div><div class="kpi-value">${cashAvailable}/${items.length}</div><div class="kpi-sub">${cashNA} financial businesses marked not applicable</div></div></div>
    <div class="filter-panel result-filter-panel"><div class="search-control"><span>⌕</span><input id="resultSearch" class="input" placeholder="Search company or sector"></div><div class="filter-group"><span class="filter-label">Signal</span><div class="segmented"><button class="active" data-quality="all">All</button><button data-quality="improving">Improving</button><button data-quality="mixed">Mixed</button><button data-quality="weakening">Weakening</button><button data-quality="missing">Missing data</button></div></div><div id="resultCount" class="filter-count"></div></div>
    <div id="companyResults" class="company-results-grid"></div>
    <details class="details-panel"><summary>Open quarterly and annual metric history</summary><div class="table-wrap"><table class="data-table result-history-table"><thead><tr><th>Company</th><th>Period</th><th>Revenue YoY</th><th>Revenue QoQ</th><th>Op. margin</th><th>Margin change</th><th>Net profit YoY</th><th>OCF margin</th><th>Cash conversion</th><th>Capex intensity</th><th>FCF margin</th><th>Cash basis</th></tr></thead><tbody>${rows.sort((a,b)=>String(b.period_end).localeCompare(String(a.period_end))).map(x=>`<tr><td><span class="symbol">${esc(x.symbol)}</span><span class="subtext">${esc(x.period_type)}</span></td><td>${esc(x.period_end)}</td><td class="${metricClass(x.revenue_yoy)}">${fmtPct(x.revenue_yoy)}</td><td class="${metricClass(x.revenue_qoq)}">${fmtPct(x.revenue_qoq)}</td><td>${fmtPct(x.operating_margin_pct)}</td><td class="${metricClass(x.operating_margin_change_yoy_pp)}">${pp(x.operating_margin_change_yoy_pp)}</td><td class="${metricClass(x.net_income_yoy)}">${fmtPct(x.net_income_yoy)}</td><td>${fmtPct(x.ocf_margin_pct)}</td><td>${fmtPct(x.cash_conversion_pct)}</td><td>${fmtPct(x.capex_intensity_pct)}</td><td class="${metricClass(x.fcf_margin_pct)}">${fmtPct(x.fcf_margin_pct)}</td><td>${esc(x.cash_flow_basis||'Reported')}</td></tr>`).join('')||'<tr><td colspan="12" class="empty">No financial rows available. Run a full refresh with financial results enabled.</td></tr>'}</tbody></table></div></details>`;

  document.getElementById('accountFilter').addEventListener('change',e=>{localStorage.setItem('portfolioAccountFilter',e.target.value);location.reload();});
  let quality='all';
  const render=()=>{const q=document.getElementById('resultSearch').value.toLowerCase();const filtered=items.filter(item=>{const hay=`${item.symbol} ${item.sector}`.toLowerCase();const label=String(item.q?.quality_label||'').toLowerCase();const noData=!item.q;return (!q||hay.includes(q))&&(quality==='all'||quality==='missing'&&noData||label.includes(quality));});document.getElementById('resultCount').textContent=`${filtered.length} of ${items.length} companies`;document.getElementById('companyResults').innerHTML=filtered.map(companyCard).join('')||'<div class="empty-state"><strong>No companies match this view.</strong><span>Try another signal or search.</span></div>';};
  document.getElementById('resultSearch').addEventListener('input',render);document.querySelectorAll('[data-quality]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('[data-quality]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');quality=btn.dataset.quality;render();}));render();
  await updateModeBadge(rows.map(x=>x.fetched_at).filter(Boolean).sort().at(-1));
}
run().catch(e=>root.innerHTML=`<div class="notice warning">${esc(e.message)}</div>`);
