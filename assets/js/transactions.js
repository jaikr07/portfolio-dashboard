import {mountShell} from './shell.js';
import {loadCore,aggregateHoldings,addTransaction,upsertInstrument,deleteTransaction,importTradebookCsv} from './data-service.js';
import {fmtMoney,fmtNum,esc,today} from './utils.js';
import {updateModeBadge,bindModal} from './common.js';

mountShell('transactions','Transactions & Capital Deployment');
const root=document.getElementById('pageContent');

const amount=t=>Number(t.quantity||0)*Number(t.price||0)+Number(t.fees||0);
const cleanDate=v=>{const d=new Date(`${String(v).slice(0,10)}T00:00:00`);return Number.isFinite(d.getTime())?d:null;};
const monthKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const monthLabel=k=>new Date(`${k}-01T00:00:00`).toLocaleDateString('en-IN',{month:'short',year:'2-digit'});

function deploymentHistory(transactions){
  const cutoff=new Date(); cutoff.setDate(cutoff.getDate()-365);
  return transactions.filter(t=>{
    const type=String(t.transaction_type||'').toLowerCase(); const d=cleanDate(t.trade_date);
    return d&&d>=cutoff&&['buy','sell'].includes(type);
  });
}
function monthlySeries(history){
  const byMonth=new Map();
  for(const t of history){
    const d=cleanDate(t.trade_date),key=monthKey(d); if(!byMonth.has(key))byMonth.set(key,{buy:0,sell:0});
    byMonth.get(key)[String(t.transaction_type).toLowerCase()]+=amount(t);
  }
  const labels=[]; const buys=[]; const sells=[]; const cumulative=[]; let running=0;
  if(history.length){
    const start=new Date(Math.min(...history.map(t=>cleanDate(t).getTime()))); start.setDate(1);
    const end=new Date(); end.setDate(1);
    for(let d=new Date(start);d<=end;d.setMonth(d.getMonth()+1)){
      const key=monthKey(d),v=byMonth.get(key)||{buy:0,sell:0};
      labels.push(monthLabel(key)); buys.push(v.buy); sells.push(-v.sell); running+=v.buy-v.sell; cumulative.push(running);
    }
  }
  return {labels,buys,sells,cumulative};
}
function typeBadge(t){
  const type=String(t.transaction_type||'').toLowerCase();
  if(type==='sell')return 'negative'; if(type==='buy')return 'positive'; return 'neutral';
}

async function run(){
  const core=await loadCore(),holdings=aggregateHoldings(core.instruments,core.transactions);
  const history=deploymentHistory(core.transactions);
  const grossBuys=history.filter(t=>t.transaction_type==='buy').reduce((s,t)=>s+amount(t),0);
  const grossSells=history.filter(t=>t.transaction_type==='sell').reduce((s,t)=>s+amount(t),0);
  const net=grossBuys-grossSells;
  const series=monthlySeries(history);
  const importedCount=core.transactions.filter(t=>t.analytics_only===true||String(t.analytics_only).toLowerCase()==='true').length;

  root.innerHTML=`
    <div class="hero modern-hero"><div><span class="eyebrow">Capital deployment</span><h2>Where and when you invested</h2><p>Monthly buys, disposals and cumulative net deployment across the last 365 days. Tradebook history is kept separate from your current-holdings snapshot, so quantities are not double-counted.</p></div><button class="btn primary" id="openTx">+ New transaction</button></div>
    <div class="grid kpis deployment-kpis">
      <div class="card accent-card"><div class="kpi-label">Gross purchases · 365 days</div><div class="kpi-value money">${fmtMoney(grossBuys)}</div><div class="kpi-sub">Cash deployed into buy trades</div></div>
      <div class="card"><div class="kpi-label">Gross disposals · 365 days</div><div class="kpi-value money">${fmtMoney(grossSells)}</div><div class="kpi-sub">Sale value before charges</div></div>
      <div class="card"><div class="kpi-label">Net capital deployed</div><div class="kpi-value money ${net>=0?'positive':'negative'}">${fmtMoney(net)}</div><div class="kpi-sub">Purchases minus disposals</div></div>
      <div class="card"><div class="kpi-label">Trade executions imported</div><div class="kpi-value">${importedCount}</div><div class="kpi-sub">${history.length} buy/sell fills in the 365-day chart</div></div>
    </div>
    <div class="grid two transaction-layout">
      <div class="card chart-card"><div class="section-heading"><div><h3>Monthly capital deployment</h3><p>Vertical bars show buys above zero and sells below zero; the line is cumulative net deployment.</p></div><span class="badge neutral">Last 365 days</span></div><div class="chart-box deployment-chart"><canvas id="deploymentChart"></canvas></div>${history.length?'':'<div class="empty compact">Import your Zerodha tradebook to populate this chart.</div>'}</div>
      <div class="card import-card"><span class="eyebrow">One-time import</span><h3>Zerodha EQ tradebook</h3><p>Upload the original tradebook CSV. These records build the historical deployment chart but do not change current quantities already loaded from your holdings snapshot.</p><label class="drop-zone" for="tradebookFile"><strong>Choose tradebook CSV</strong><span>Expected columns: symbol, trade_date, trade_type, quantity and price</span><input type="file" id="tradebookFile" accept=".csv" hidden></label><button class="btn primary" id="importTradebook">Import transaction history</button><div id="tradebookMsg" class="import-message"></div><div class="notice" style="margin-top:14px;margin-bottom:0">Future buys and sells entered with “New transaction” will update both the chart and your holdings.</div></div>
    </div>
    <div class="card timeline-card"><div class="section-heading"><div><h3>Recent activity</h3><p>Latest executions and manual transactions.</p></div><span class="badge neutral">${core.transactions.length} total records</span></div><div class="activity-list">${[...core.transactions].filter(t=>String(t.transaction_type)!=='opening').sort((a,b)=>String(b.trade_date).localeCompare(String(a.trade_date))||String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0,12).map(t=>`<div class="activity-row"><div class="activity-date"><strong>${esc(String(t.trade_date).slice(8,10))}</strong><span>${esc(new Date(`${t.trade_date}T00:00:00`).toLocaleDateString('en-IN',{month:'short'}))}</span></div><div class="activity-main"><div><span class="symbol">${esc(t.symbol)}</span><span class="badge ${typeBadge(t)}">${esc(t.transaction_type)}</span>${t.analytics_only?'<span class="badge neutral">Tradebook history</span>':''}</div><small>${fmtNum(t.quantity,3)} shares at ${fmtMoney(t.price,2)}</small></div><strong class="money ${t.transaction_type==='sell'?'negative':'positive'}">${t.transaction_type==='sell'?'-':'+'}${fmtMoney(amount(t))}</strong></div>`).join('')||'<div class="empty compact">No buy or sell activity yet.</div>'}</div></div>
    <details class="details-panel"><summary>Open complete transaction ledger</summary><div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Symbol</th><th>Type</th><th>Quantity</th><th>Price</th><th>Trade value</th><th>Source / notes</th><th></th></tr></thead><tbody>${[...core.transactions].sort((a,b)=>String(b.trade_date).localeCompare(String(a.trade_date))).map(t=>`<tr><td style="text-align:left">${esc(t.trade_date)}</td><td><span class="symbol">${esc(t.symbol)}</span></td><td><span class="badge ${typeBadge(t)}">${esc(t.transaction_type)}</span></td><td>${fmtNum(t.quantity,3)}</td><td>${fmtMoney(t.price,2)}</td><td class="money">${fmtMoney(amount(t))}</td><td style="text-align:left">${t.analytics_only?'<span class="badge neutral">History only</span> ':''}${esc(t.notes||'')}</td><td><button class="btn danger small del" data-id="${esc(t.id)}">Delete</button></td></tr>`).join('')||'<tr><td colspan="8" class="empty">No transactions yet.</td></tr>'}</tbody></table></div></details>
    <div class="modal-backdrop" id="txModal"><div class="modal"><h3>Add transaction</h3><form id="txForm" class="form-grid"><div class="field"><label>Symbol</label><input class="input" name="symbol" list="symbols" required><datalist id="symbols">${core.instruments.map(x=>`<option value="${esc(x.symbol)}">`).join('')}</datalist></div><div class="field"><label>Yahoo symbol mapping</label><input class="input" name="yahoo_symbol" placeholder="e.g. RELIANCE.NS"></div><div class="field"><label>Transaction type</label><select class="input" name="transaction_type"><option value="buy">Buy</option><option value="sell">Sell</option><option value="bonus">Bonus</option><option value="split">Split adjustment</option><option value="adjustment">Other adjustment</option></select></div><div class="field"><label>Trade date</label><input type="date" class="input" name="trade_date" value="${today()}" required></div><div class="field"><label>Quantity</label><input type="number" step="any" min="0" class="input" name="quantity" required></div><div class="field"><label>Price per share</label><input type="number" step="any" min="0" class="input" name="price" value="0"></div><div class="field"><label>Fees / taxes</label><input type="number" step="any" min="0" class="input" name="fees" value="0"></div><div class="field full"><label>Notes</label><textarea class="input" name="notes" rows="3"></textarea></div><div class="full modal-actions"><button type="button" class="btn" id="closeTx">Cancel</button><button class="btn primary">Save transaction</button></div></form></div></div>`;

  if(window.Chart&&history.length){
    new Chart(document.getElementById('deploymentChart'),{
      data:{labels:series.labels,datasets:[
        {type:'bar',label:'Purchases',data:series.buys,borderRadius:7,borderSkipped:false,backgroundColor:'rgba(66,211,146,.72)'},
        {type:'bar',label:'Disposals',data:series.sells,borderRadius:7,borderSkipped:false,backgroundColor:'rgba(255,107,122,.72)'},
        {type:'line',label:'Cumulative net deployed',data:series.cumulative,yAxisID:'y1',borderColor:'#56c2ff',backgroundColor:'#56c2ff',pointRadius:2,pointHoverRadius:5,tension:.3,borderWidth:2},
      ]},
      options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{labels:{color:'#c8d3df',usePointStyle:true}},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${fmtMoney(Math.abs(ctx.raw))}`}}},scales:{x:{stacked:true,grid:{display:false},ticks:{color:'#8ea1b6'}},y:{stacked:true,grid:{color:'rgba(142,161,182,.12)'},ticks:{color:'#8ea1b6',callback:v=>new Intl.NumberFormat('en-IN',{notation:'compact',maximumFractionDigits:1}).format(v)}},y1:{position:'right',grid:{display:false},ticks:{color:'#56c2ff',callback:v=>new Intl.NumberFormat('en-IN',{notation:'compact',maximumFractionDigits:1}).format(v)}}}}
    });
  }

  bindModal('txModal','openTx',['closeTx']);
  document.getElementById('txForm').addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));const sym=f.symbol.trim().toUpperCase();if(!core.instruments.some(x=>x.symbol===sym))await upsertInstrument({symbol:sym,yahoo_symbol:f.yahoo_symbol||`${sym.replace(/-(BE|SM|BZ|BL)$/,'')}.NS`,name:sym,exchange:'NSE'});delete f.yahoo_symbol;await addTransaction(f);location.reload();});
  document.getElementById('importTradebook').addEventListener('click',async()=>{
    const file=document.getElementById('tradebookFile').files[0]; const msg=document.getElementById('tradebookMsg');
    if(!file){msg.className='import-message negative';msg.textContent='Choose the tradebook CSV first.';return;}
    try{msg.className='import-message';msg.textContent='Importing and checking duplicates…';const result=await importTradebookCsv(await file.text());msg.className='import-message positive';msg.textContent=`Imported ${result.imported} executions (${result.duplicates} duplicates skipped), covering ${result.start} to ${result.end}. Reloading…`;setTimeout(()=>location.reload(),900);}catch(err){msg.className='import-message negative';msg.textContent=err.message;}
  });
  document.querySelectorAll('.del').forEach(b=>b.addEventListener('click',async()=>{if(confirm('Delete this transaction record?')){await deleteTransaction(b.dataset.id);location.reload();}}));
  await updateModeBadge();
}
run().catch(e=>root.innerHTML=`<div class="notice warning">${esc(e.message)}</div>`);
