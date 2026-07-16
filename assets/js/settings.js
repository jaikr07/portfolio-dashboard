import {ensureAuthenticated} from './auth-gate.js?v=4.0';
await ensureAuthenticated();
import {mountShell} from './shell.js';
import {
  isCloudConfigured, session, signIn, signOut,
  importBrokerCsv, importMstockHoldingsWorkbook,
  exportLocal, exportCurrentData, importLocal, resetLocal,
  loadCore, loadMarket, upsertInstrument,
  availableAccounts, accountOf, aggregateHoldings,
  localDataSummary, migrateLocalToCloud,
} from './data-service.js?v=4.0';
import {download, esc, fmtMoney} from './utils.js';
import {updateModeBadge} from './common.js';

mountShell('settings','Settings & Data Import');
const root=document.getElementById('pageContent');
const browserSummary=localDataSummary();

async function run(){
  const [sess,core,market]=await Promise.all([session(),loadCore(),loadMarket()]);
  const mm=new Map(market.map(x=>[x.symbol,x]));
  const instruments=core.instruments.map(x=>({...x,market:mm.get(x.symbol)||{}}));
  const accounts=availableAccounts(core.transactions);
  const accountCards=accounts.map(account=>{
    const holdings=aggregateHoldings(core.instruments,core.transactions,account);
    const invested=holdings.reduce((s,x)=>s+Number(x.totalCost||0),0);
    return `<div class="account-summary"><div><strong>${esc(account)}</strong><span>${holdings.length} current holdings</span></div><b class="money">${fmtMoney(invested)}</b></div>`;
  }).join('')||'<div class="empty compact">No broker account has been imported.</div>';

  root.innerHTML=`
    <div class="hero modern-hero"><div><span class="eyebrow">Data control</span><h2>Broker accounts and privacy</h2><p>Keep Zerodha and m.Stock separate while viewing either account or the combined portfolio.</p></div></div>

    <div class="grid two broker-import-grid">
      <div class="card import-card">
        <span class="broker-pill zerodha">Zerodha</span>
        <h3>Import current holdings</h3>
        <p class="muted">Use the Zerodha holdings CSV with Instrument, Qty. and Avg. cost. Re-importing replaces only the Zerodha opening snapshot.</p>
        <input type="file" id="csvFile" accept=".csv" class="input" style="width:100%;margin:12px 0">
        <button class="btn primary" id="importCsv">Import Zerodha holdings</button>
        <div id="csvMsg" class="import-message"></div>
      </div>
      <div class="card import-card">
        <span class="broker-pill mstock">m.Stock</span>
        <h3>Import current holdings</h3>
        <p class="muted">Use the original m.Stock <strong>portfolio_report.xlsx</strong>. The importer ignores the client-information header and reads only the holdings table.</p>
        <input type="file" id="mstockHoldingsFile" accept=".xlsx,.xls" class="input" style="width:100%;margin:12px 0">
        <button class="btn primary" id="importMstockHoldings">Import m.Stock holdings</button>
        <div id="mstockHoldingsMsg" class="import-message"></div>
      </div>
    </div>

    <div class="grid two" style="margin-top:16px">
      <div class="card"><div class="section-heading"><div><h3>Account overview</h3><p>Opening holdings remain separate by broker; All accounts combines matching symbols.</p></div><a class="btn" href="transactions.html">Import trade histories →</a></div><div class="account-summary-list">${accountCards}</div></div>
      <div class="card"><h3>Cloud sync ${isCloudConfigured()?'<span class="badge positive">Configured</span>':'<span class="badge warning">Not configured</span>'}</h3>${sess?`<p>Signed in as <strong>${esc(sess.user.email)}</strong>.</p><p class="muted">Cloud currently contains ${core.instruments.length} instruments and ${core.transactions.length} transaction records.</p>${browserSummary.migratedAt?`<div class="notice positive">Browser portfolio was moved to cloud on ${new Date(browserSummary.migratedAt).toLocaleString()}. The browser copy is retained as a fallback.</div>`:(browserSummary.transactions||browserSummary.instruments?`<div class="migration-box"><strong>Browser portfolio detected</strong><p>${browserSummary.instruments} instruments and ${browserSummary.transactions} records remain in this browser. Move them once to make the same portfolio available on your phone.</p><button class="btn primary" id="migrateCloudBtn">Move browser portfolio to cloud</button><div id="migrationMsg" class="import-message"></div></div>`:'<div class="notice positive">No unmigrated browser portfolio was detected.</div>')}<button class="btn danger" id="logout">Sign out</button>`:`<p class="muted">Cloud mode adds password login and cross-device syncing. Configure Supabase in <code>assets/js/config.js</code>, then sign in.</p><form id="loginForm" class="form-grid"><div class="field full"><label>Email</label><input type="email" name="email" class="input" required></div><div class="field full"><label>Password</label><input type="password" name="password" class="input" required></div><div class="full"><button class="btn primary">Sign in</button></div></form>`}</div>
    </div>

    <div class="grid two" style="margin-top:16px">
      <div class="card"><h3>Backup local data</h3><p class="muted">Export after each broker import while using Local mode.</p><div class="toolbar"><button class="btn" id="exportBtn">Export JSON backup</button><label class="btn">Import JSON<input type="file" id="jsonFile" accept=".json" hidden></label><button class="btn danger" id="resetBtn">Reset local data</button></div></div>
      <div class="card"><h3>Current data status</h3><div class="signal-list"><div class="signal-item"><div><strong>${core.instruments.length} instruments</strong><p>Unique market symbols across all accounts</p></div></div><div class="signal-item"><div><strong>${core.transactions.length} records</strong><p>Opening balances, manual entries and broker history</p></div></div><div class="signal-item"><div><strong>${accounts.length} broker account${accounts.length===1?'':'s'}</strong><p>${accounts.map(esc).join(', ')||'None imported'}</p></div></div></div></div>
    </div>

    <div class="card" style="margin-top:16px"><h3>Instrument, sector and market-data mappings</h3><p class="muted">A symbol has one market-data mapping even when it is held in both Zerodha and m.Stock.</p><div class="table-wrap"><table class="data-table mapping-table"><thead><tr><th>Portfolio symbol</th><th>Yahoo symbol</th><th>Company name</th><th>Sector</th><th>Asset type</th><th>Exchange</th><th></th></tr></thead><tbody>${instruments.map(x=>{const sector=x.sector||x.market.sector||'Unclassified',asset=x.asset_type||x.market.asset_type||'Equity';return `<tr><td><span class="symbol">${esc(x.symbol)}</span></td><td><input class="input map-yahoo" data-symbol="${esc(x.symbol)}" value="${esc(x.yahoo_symbol||'')}"></td><td><input class="input map-name" data-symbol="${esc(x.symbol)}" value="${esc(x.name||x.symbol)}"></td><td><input class="input map-sector" data-symbol="${esc(x.symbol)}" value="${esc(sector)}"></td><td><select class="input map-asset" data-symbol="${esc(x.symbol)}"><option ${asset==='Equity'?'selected':''}>Equity</option><option ${asset==='ETF'?'selected':''}>ETF</option><option ${asset==='REIT / InvIT'?'selected':''}>REIT / InvIT</option><option ${asset==='Other'?'selected':''}>Other</option></select></td><td><input class="input map-exchange" data-symbol="${esc(x.symbol)}" value="${esc(x.exchange||'NSE')}"></td><td><button class="btn small save-map" data-symbol="${esc(x.symbol)}">Save</button></td></tr>`}).join('')||'<tr><td colspan="7" class="empty">Import holdings to create mappings.</td></tr>'}</tbody></table></div></div>`;

  document.getElementById('importCsv').addEventListener('click',async()=>{const file=document.getElementById('csvFile').files[0];const msg=document.getElementById('csvMsg');if(!file){msg.textContent='Choose the Zerodha holdings CSV first.';msg.className='import-message negative';return;}try{const result=await importBrokerCsv(await file.text(),'Zerodha');msg.textContent=`Imported ${result.count} Zerodha holdings. Reloading…`;msg.className='import-message positive';setTimeout(()=>location.reload(),700)}catch(e){msg.textContent=e.message;msg.className='import-message negative';}});
  document.getElementById('importMstockHoldings').addEventListener('click',async()=>{const file=document.getElementById('mstockHoldingsFile').files[0];const msg=document.getElementById('mstockHoldingsMsg');if(!file){msg.textContent='Choose portfolio_report.xlsx first.';msg.className='import-message negative';return;}try{msg.textContent='Reading m.Stock holdings…';msg.className='import-message';const result=await importMstockHoldingsWorkbook(await file.arrayBuffer());msg.textContent=`Imported ${result.count} m.Stock holdings. Reloading…`;msg.className='import-message positive';setTimeout(()=>location.reload(),700)}catch(e){msg.textContent=e.message;msg.className='import-message negative';}});
  document.getElementById('exportBtn').addEventListener('click',async()=>download(`portfolio-backup-${new Date().toISOString().slice(0,10)}.json`,await exportCurrentData()));
  document.getElementById('jsonFile').addEventListener('change',async e=>{importLocal(await e.target.files[0].text());location.reload()});
  document.getElementById('resetBtn').addEventListener('click',()=>{if(confirm('Delete all browser-only portfolio data?')){resetLocal();location.reload()}});
  document.querySelectorAll('.save-map').forEach(btn=>btn.addEventListener('click',async()=>{const symbol=btn.dataset.symbol;const pick=cls=>document.querySelector(`${cls}[data-symbol="${CSS.escape(symbol)}"]`).value;await upsertInstrument({symbol,yahoo_symbol:pick('.map-yahoo'),name:pick('.map-name'),sector:pick('.map-sector'),asset_type:pick('.map-asset'),exchange:pick('.map-exchange'),active:true});btn.textContent='Saved';setTimeout(()=>btn.textContent='Save',900)}));
  document.getElementById('migrateCloudBtn')?.addEventListener('click',async()=>{const msg=document.getElementById('migrationMsg');if(!confirm('This will replace the signed-in cloud holdings and transactions with the complete portfolio stored in this browser. Continue?'))return;download(`portfolio-before-cloud-${new Date().toISOString().slice(0,10)}.json`,exportLocal());const btn=document.getElementById('migrateCloudBtn');btn.disabled=true;btn.textContent='Moving data…';try{const result=await migrateLocalToCloud();msg.textContent=`Moved ${result.instruments} instruments and ${result.transactions} records to cloud. Reloading…`;msg.className='import-message positive';setTimeout(()=>location.reload(),900)}catch(error){msg.textContent=error.message;msg.className='import-message negative';btn.disabled=false;btn.textContent='Move browser portfolio to cloud';}});
  document.getElementById('loginForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{await signIn(f.email,f.password);location.reload()}catch(err){alert(err.message)}});
  document.getElementById('logout')?.addEventListener('click',async()=>{await signOut();location.reload()});
  await updateModeBadge();
}
run().catch(e=>root.innerHTML=`<div class="notice warning">${esc(e.message)}</div>`);
