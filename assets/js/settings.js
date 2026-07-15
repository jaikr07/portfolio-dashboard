import {mountShell} from './shell.js';
import {isCloudConfigured, session, signIn, signOut, importBrokerCsv, exportLocal, importLocal, resetLocal, loadCore, loadMarket, upsertInstrument} from './data-service.js';
import {download, esc} from './utils.js';
import {updateModeBadge} from './common.js';

mountShell('settings','Settings & Data Import');
const root=document.getElementById('pageContent');

async function run(){
  const [sess,core,market]=await Promise.all([session(),loadCore(),loadMarket()]);
  const mm=new Map(market.map(x=>[x.symbol,x]));
  const instruments=core.instruments.map(x=>({...x,market:mm.get(x.symbol)||{}}));
  root.innerHTML=`
    <div class="hero"><div><h2>Setup and privacy</h2><p>Import your current holdings, open the tradebook importer, export backups and manage symbol, sector and ETF mappings.</p></div></div>
    <div class="grid two">
      <div class="card"><h3>1. Import your holdings CSV</h3><p class="muted">Supports Instrument, Qty. and Avg. cost. Importing replaces earlier imported opening balances but keeps transactions entered manually.</p><input type="file" id="csvFile" accept=".csv" class="input" style="width:100%;margin:12px 0"><button class="btn primary" id="importCsv">Import CSV</button><div id="csvMsg" class="kpi-sub"></div></div>
      <div class="card"><h3>2. Cloud sync ${isCloudConfigured()?'<span class="badge positive">Configured</span>':'<span class="badge warning">Not configured</span>'}</h3>${sess?`<p>Signed in as <strong>${esc(sess.user.email)}</strong>.</p><button class="btn danger" id="logout">Sign out</button>`:`<p class="muted">Optional. Add your Supabase project URL and publishable key in <code>assets/js/config.js</code>, then sign in below.</p><form id="loginForm" class="form-grid"><div class="field full"><label>Email</label><input type="email" name="email" class="input" required></div><div class="field full"><label>Password</label><input type="password" name="password" class="input" required></div><div class="full"><button class="btn primary">Sign in</button></div></form>`}</div>
    </div>
    <div class="card" style="margin-top:16px"><div class="section-heading"><div><h3>Import your past 365-day transaction history</h3><p>The Zerodha tradebook importer is on the Transactions page. Imported history powers the deployment chart without double-counting your current holdings snapshot.</p></div><a class="btn primary" href="transactions.html">Open tradebook importer →</a></div></div>
    <div class="grid two" style="margin-top:16px">
      <div class="card"><h3>Backup local data</h3><div class="toolbar"><button class="btn" id="exportBtn">Export JSON backup</button><label class="btn">Import JSON<input type="file" id="jsonFile" accept=".json" hidden></label><button class="btn danger" id="resetBtn">Reset local data</button></div></div>
      <div class="card"><h3>Current data status</h3><div class="signal-list"><div class="signal-item"><div><strong>${core.instruments.length} instruments</strong><p>Symbol, sector and provider mappings</p></div></div><div class="signal-item"><div><strong>${core.transactions.length} transactions</strong><p>Opening balances, buys, sells and adjustments</p></div></div></div></div>
    </div>
    <div class="card" style="margin-top:16px"><h3>Instrument, sector and market-data mappings</h3><p class="muted">Broad sectors drive the Overview charts. Review “Other / Review” classifications and mark every fund as ETF. Current holdings LIQUIDCASE and SILVER are preconfigured as ETFs.</p><div class="table-wrap"><table class="data-table mapping-table"><thead><tr><th>Portfolio symbol</th><th>Yahoo symbol</th><th>Company name</th><th>Sector</th><th>Asset type</th><th>Exchange</th><th></th></tr></thead><tbody>${instruments.map(x=>{const sector=x.sector||x.market.sector||'Unclassified',asset=x.asset_type||x.market.asset_type||'Equity';return `<tr><td><span class="symbol">${esc(x.symbol)}</span></td><td><input class="input map-yahoo" data-symbol="${esc(x.symbol)}" value="${esc(x.yahoo_symbol||'')}"></td><td><input class="input map-name" data-symbol="${esc(x.symbol)}" value="${esc(x.name||x.symbol)}"></td><td><input class="input map-sector" data-symbol="${esc(x.symbol)}" value="${esc(sector)}"></td><td><select class="input map-asset" data-symbol="${esc(x.symbol)}"><option ${asset==='Equity'?'selected':''}>Equity</option><option ${asset==='ETF'?'selected':''}>ETF</option><option ${asset==='REIT / InvIT'?'selected':''}>REIT / InvIT</option><option ${asset==='Other'?'selected':''}>Other</option></select></td><td><input class="input map-exchange" data-symbol="${esc(x.symbol)}" value="${esc(x.exchange||'NSE')}"></td><td><button class="btn small save-map" data-symbol="${esc(x.symbol)}">Save</button></td></tr>`}).join('')||'<tr><td colspan="7" class="empty">Import a holdings CSV to create mappings.</td></tr>'}</tbody></table></div></div>
    <div class="card" style="margin-top:16px"><h3>One-time cloud setup</h3><div class="setup-steps"><div class="setup-step"><h4>Create a Supabase project</h4><p>Open SQL Editor and run <code>supabase/schema.sql</code>. Existing users should also run <code>supabase/upgrade_decision_dashboard.sql</code> and then <code>supabase/upgrade_v3.sql</code>.</p></div><div class="setup-step"><h4>Create your login</h4><p>In Supabase Authentication, create one user with your email and password. Keep public sign-up disabled for a personal dashboard.</p></div><div class="setup-step"><h4>Add two frontend values</h4><p>Copy the project URL and publishable/anon key into <code>assets/js/config.js</code>.</p></div><div class="setup-step"><h4>Add GitHub Actions secrets</h4><p>Add <code>SUPABASE_URL</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code>, and optionally <code>OPENAI_API_KEY</code> for richer company-specific announcement reasoning.</p></div></div></div>`;

  document.getElementById('importCsv').addEventListener('click',async()=>{const file=document.getElementById('csvFile').files[0];if(!file)return alert('Choose a CSV file first.');const result=await importBrokerCsv(await file.text());document.getElementById('csvMsg').textContent=`Imported ${result.count} holdings. Refreshing…`;setTimeout(()=>location.reload(),600)});
  document.getElementById('exportBtn').addEventListener('click',()=>download('portfolio-backup.json',exportLocal()));
  document.getElementById('jsonFile').addEventListener('change',async e=>{importLocal(await e.target.files[0].text());location.reload()});
  document.getElementById('resetBtn').addEventListener('click',()=>{if(confirm('Delete all browser-only portfolio data?')){resetLocal();location.reload()}});
  document.querySelectorAll('.save-map').forEach(btn=>btn.addEventListener('click',async()=>{
    const symbol=btn.dataset.symbol;
    const pick=cls=>document.querySelector(`${cls}[data-symbol="${CSS.escape(symbol)}"]`).value;
    await upsertInstrument({symbol,yahoo_symbol:pick('.map-yahoo'),name:pick('.map-name'),sector:pick('.map-sector'),asset_type:pick('.map-asset'),exchange:pick('.map-exchange'),active:true});
    btn.textContent='Saved';setTimeout(()=>btn.textContent='Save',900);
  }));
  document.getElementById('loginForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{await signIn(f.email,f.password);location.reload()}catch(err){alert(err.message)}});
  document.getElementById('logout')?.addEventListener('click',async()=>{await signOut();location.reload()});
  await updateModeBadge();
}
run().catch(e=>root.innerHTML=`<div class="notice warning">${esc(e.message)}</div>`);
