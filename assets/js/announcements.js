import {mountShell} from './shell.js';
import {loadCore, aggregateHoldings, loadAnnouncements, saveManualAnnouncement, availableAccounts} from './data-service.js';
import {esc, impactClass, today, safeUrl} from './utils.js';
import {updateModeBadge, bindModal} from './common.js';

mountShell('announcements', 'News & Corporate Announcements');
const root = document.getElementById('pageContent');

function fallbackDecision(a) {
  const score = Number(a.impact_score || 0);
  const category = a.category || 'Other';
  const reason = score >= 2
    ? 'This appears directionally positive, but the financial benefit should be confirmed through quantified revenue, margin, cash-flow or balance-sheet effects.'
    : score <= -2
      ? 'This may create earnings, execution, balance-sheet or governance risk. The original filing should be checked before drawing a conclusion.'
      : category.includes('MOU')
        ? 'An MOU may build a future opportunity pipeline, but it is usually non-binding and should not be counted as confirmed revenue.'
        : 'The available headline does not yet show a clear change in earnings power, cash flow or competitive position.';
  return {
    reason: a.impact_reason || reason,
    watch: a.watch_items || 'Verify the original source, financial materiality, timeline, execution conditions and management guidance.',
    horizon: a.time_horizon || 'Unclear',
    materiality: a.materiality || (Math.abs(score) >= 4 ? 'High' : Math.abs(score) >= 2 ? 'Medium' : 'Low / unquantified')
  };
}

function render(rows) {
  return rows.map(a => {
    const d = fallbackDecision(a);
    const url = safeUrl(a.source_url);
    return `<article class="announcement decision-announcement">
      <div>
        <span class="badge neutral">${esc(a.symbol)}</span>
        <div class="announcement-meta" style="margin-top:8px">${esc(String(a.published_at || '').slice(0,10))}</div>
      </div>
      <div>
        <h4>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(a.title)} ↗</a>` : esc(a.title)}</h4>
        <p>${esc(a.summary || 'Summary unavailable.')}</p>
        <div class="decision-box"><strong>Why it matters</strong><p>${esc(d.reason)}</p></div>
        <div class="watch-box"><strong>What to verify next</strong><p>${esc(d.watch)}</p></div>
        <div class="announcement-meta" style="margin-top:9px">${esc(a.category || 'Other')} • ${esc(a.source || 'Manual')} • confidence ${esc(a.confidence || 'low')}</div>
      </div>
      <div class="impact-panel">
        <div class="impact-score ${impactClass(a.impact_score)}">${Number(a.impact_score || 0) > 0 ? '+' : ''}${Number(a.impact_score || 0)}</div>
        <span class="badge ${impactClass(a.impact_score)}">${esc(a.impact_label || 'Neutral')}</span>
        <span class="subtext">${esc(d.materiality)} materiality</span>
        <span class="subtext">${esc(d.horizon)}</span>
      </div>
    </article>`;
  }).join('') || '<div class="empty">No announcements found.</div>';
}

async function run() {
  const [core, ann] = await Promise.all([loadCore(), loadAnnouncements()]);
  const accounts=availableAccounts(core.transactions);let selectedAccount=localStorage.getItem('portfolioAccountFilter')||'All accounts';if(selectedAccount!=='All accounts'&&!accounts.includes(selectedAccount))selectedAccount='All accounts';
  const active = new Set(aggregateHoldings(core.instruments, core.transactions, selectedAccount).map(x => x.symbol));
  const rows = ann.filter(x => active.has(x.symbol)).sort((a,b) => String(b.published_at).localeCompare(String(a.published_at)));

  root.innerHTML = `
    <div class="hero"><div><h2>Material developments and decision impact</h2><p>Each item separates the factual summary from the likely business effect, what could invalidate the thesis, and the time horizon.</p></div><div class="hero-actions"><label class="account-picker"><span>Account</span><select id="accountFilter" class="input"><option>All accounts</option>${accounts.map(a=>`<option ${a===selectedAccount?'selected':''}>${esc(a)}</option>`).join('')}</select></label><button class="btn primary" id="openAnn">+ Add manual announcement</button></div></div>
    <div class="notice warning">The score measures likely business materiality from −5 to +5, not a predicted share-price move. “Neutral / monitor” now includes an explicit explanation of what is missing.</div>
    <div class="card">
      <div class="toolbar">
        <input class="input" id="annSearch" placeholder="Search title, reason or symbol">
        <select class="input" id="annImpact"><option value="">All impacts</option><option value="positive">Positive</option><option value="negative">Negative</option><option value="neutral">Neutral</option></select>
        <select class="input" id="annPeriod"><option value="">All dates</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select>
        <select class="input" id="annSort"><option value="recent">Most recent</option><option value="material">Highest materiality first</option><option value="risk">Negative first</option></select>
      </div>
      <div id="annList">${render(rows)}</div>
    </div>
    <div class="modal-backdrop" id="annModal"><div class="modal"><h3>Add a verified announcement</h3>
      <form id="annForm" class="form-grid">
        <div class="field"><label>Symbol</label><input class="input" name="symbol" required></div>
        <div class="field"><label>Date</label><input type="date" class="input" name="published_at" value="${today()}" required></div>
        <div class="field full"><label>Title</label><input class="input" name="title" required></div>
        <div class="field"><label>Category</label><select class="input" name="category"><option>Order / contract</option><option>Acquisition</option><option>Demerger</option><option>Results</option><option>Capacity expansion</option><option>Dividend / bonus</option><option>Capital allocation</option><option>Governance</option><option>MOU / partnership</option><option>Credit / balance sheet</option><option>Other</option></select></div>
        <div class="field"><label>Impact score (−5 to +5)</label><input type="number" min="-5" max="5" class="input" name="impact_score" value="0"></div>
        <div class="field full"><label>Factual summary</label><textarea class="input" rows="3" name="summary" required></textarea></div>
        <div class="field full"><label>Why it matters</label><textarea class="input" rows="3" name="impact_reason" placeholder="How could this affect revenue, margins, cash flow, leverage or competitive position?"></textarea></div>
        <div class="field full"><label>What to verify next</label><textarea class="input" rows="2" name="watch_items"></textarea></div>
        <div class="field"><label>Time horizon</label><select class="input" name="time_horizon"><option>Immediate</option><option>Near term</option><option>Medium term</option><option>Long term</option><option selected>Unclear</option></select></div>
        <div class="field"><label>Materiality</label><select class="input" name="materiality"><option>High</option><option>Medium</option><option selected>Low / unquantified</option></select></div>
        <div class="field full"><label>Source URL</label><input class="input" type="url" name="source_url"></div>
        <div class="full" style="display:flex;justify-content:flex-end;gap:8px"><button type="button" class="btn" id="closeAnn">Cancel</button><button class="btn primary">Save</button></div>
      </form></div></div>`;

  bindModal('annModal', 'openAnn', ['closeAnn']);
  document.getElementById('annForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    f.symbol = f.symbol.toUpperCase();
    f.impact_score = Number(f.impact_score);
    f.impact_label = f.impact_score >= 2 ? 'Bullish' : f.impact_score <= -2 ? 'Bearish' : 'Neutral / monitor';
    f.confidence = 'manual';
    await saveManualAnnouncement(f);
    location.reload();
  });

  const apply = () => {
    const q = document.getElementById('annSearch').value.toLowerCase();
    const imp = document.getElementById('annImpact').value;
    const days = Number(document.getElementById('annPeriod').value || 0);
    const sort = document.getElementById('annSort').value;
    const cutoff = days ? Date.now() - days * 86400000 : 0;
    let list = rows.filter(x => {
      const d = fallbackDecision(x);
      const text = `${x.symbol} ${x.title} ${x.summary} ${d.reason} ${d.watch}`.toLowerCase();
      return (!q || text.includes(q)) && (!imp || impactClass(x.impact_score) === imp) && (!cutoff || new Date(x.published_at).getTime() >= cutoff);
    });
    if (sort === 'material') list.sort((a,b) => Math.abs(Number(b.impact_score || 0)) - Math.abs(Number(a.impact_score || 0)) || String(b.published_at).localeCompare(String(a.published_at)));
    if (sort === 'risk') list.sort((a,b) => Number(a.impact_score || 0) - Number(b.impact_score || 0) || String(b.published_at).localeCompare(String(a.published_at)));
    if (sort === 'recent') list.sort((a,b) => String(b.published_at).localeCompare(String(a.published_at)));
    document.getElementById('annList').innerHTML = render(list);
  };
  document.getElementById('accountFilter').addEventListener('change',e=>{localStorage.setItem('portfolioAccountFilter',e.target.value);location.reload();});
  ['annSearch','annImpact','annPeriod','annSort'].forEach(id => document.getElementById(id).addEventListener(id === 'annSearch' ? 'input' : 'change', apply));
  await updateModeBadge(rows.map(x => x.fetched_at).filter(Boolean).sort().at(-1));
}

run().catch(e => root.innerHTML = `<div class="notice warning">${esc(e.message)}</div>`);
