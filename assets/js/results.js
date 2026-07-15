import {mountShell} from './shell.js';
import {loadCore, aggregateHoldings, loadResults} from './data-service.js';
import {fmtPct, esc} from './utils.js';
import {updateModeBadge} from './common.js';

mountShell('results', 'Decision-Focused Financial Performance');
const root = document.getElementById('pageContent');

const has = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const metricClass = value => !has(value) ? 'muted' : Number(value) > 0 ? 'positive' : Number(value) < 0 ? 'negative' : 'muted';
const pp = value => has(value) ? `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(2)} pp` : '—';
const qualityClass = score => Number(score) >= 70 ? 'positive' : Number(score) < 40 ? 'negative' : 'warning';
const median = values => {
  const clean = values.filter(has).map(Number).sort((a,b)=>a-b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
};

function latestBySymbol(rows, periodType='quarterly') {
  const map = new Map();
  rows.filter(x => x.period_type === periodType)
    .sort((a,b) => String(b.period_end).localeCompare(String(a.period_end)))
    .forEach(row => { if (!map.has(row.symbol)) map.set(row.symbol, row); });
  return [...map.values()];
}

function tableRows(list) {
  return list.map(x => `
    <tr>
      <td><span class="symbol">${esc(x.symbol)}</span><span class="subtext">${esc(x.period_type)}</span></td>
      <td style="text-align:left">${esc(x.period_end)}</td>
      <td class="${metricClass(x.revenue_yoy)}">${fmtPct(x.revenue_yoy)}</td>
      <td class="${metricClass(x.revenue_qoq)}">${x.period_type === 'quarterly' ? fmtPct(x.revenue_qoq) : '—'}</td>
      <td class="${metricClass(x.operating_income_yoy)}">${fmtPct(x.operating_income_yoy)}</td>
      <td class="${metricClass(x.operating_margin_pct)}">${fmtPct(x.operating_margin_pct)}</td>
      <td class="${metricClass(x.operating_margin_change_yoy_pp)}">${pp(x.operating_margin_change_yoy_pp)}</td>
      <td class="${metricClass(x.net_income_yoy)}">${fmtPct(x.net_income_yoy)}</td>
      <td class="${metricClass(x.ocf_yoy)}">${fmtPct(x.ocf_yoy)}</td>
      <td class="${metricClass(x.ocf_margin_pct)}">${fmtPct(x.ocf_margin_pct)}</td>
      <td class="${metricClass(Number(x.cash_conversion_pct) - 70)}">${fmtPct(x.cash_conversion_pct)}</td>
      <td>${fmtPct(x.capex_intensity_pct)}</td>
      <td class="${metricClass(x.fcf_margin_pct)}">${fmtPct(x.fcf_margin_pct)}</td>
      <td><div class="result-score ${qualityClass(x.quality_score)}">${has(x.quality_score) ? Math.round(Number(x.quality_score)) : '—'}</div><span class="subtext">${esc(x.quality_label || 'Awaiting data')}</span></td>
    </tr>`).join('') || '<tr><td colspan="14" class="empty">No decision metrics are available yet. Run a full portfolio refresh with “Skip financial result refresh” left unchecked.</td></tr>';
}

async function run() {
  const [core, res] = await Promise.all([loadCore(), loadResults()]);
  const holdings = aggregateHoldings(core.instruments, core.transactions);
  const active = new Set(holdings.map(x => x.symbol));
  const etfs = holdings.filter(x => String(x.asset_type || '').toLowerCase() === 'etf').map(x => x.symbol);
  const rows = res.filter(x => active.has(x.symbol));
  const symbols = [...new Set(rows.map(x => x.symbol))].sort();

  root.innerHTML = `
    <div class="hero">
      <div>
        <h2>Financial decision dashboard</h2>
        <p>Growth, margin direction, operating cash flow, cash conversion, capex intensity and free-cash-flow quality—without cluttering the page with absolute revenue or profit values.</p>
      </div>
    </div>
    <div class="notice">Interpretation guide: revenue and profit growth show momentum; margin change shows pricing/cost strength; cash conversion and free cash flow test earnings quality; capex intensity shows how much reinvestment is required.</div>
    ${etfs.length ? `<div class="notice warning"><strong>ETF treatment:</strong> ${etfs.map(esc).join(', ')} are excluded because company income statements and operating cash flow are not applicable to ETFs.</div>` : ''}
    <div id="resultKpis" class="grid kpis"></div>
    <div class="card">
      <div class="toolbar">
        <select class="input" id="resultView">
          <option value="latest-quarter">Latest quarter for each company</option>
          <option value="quarterly">Quarterly history</option>
          <option value="annual">Annual history</option>
        </select>
        <select class="input" id="resultSymbol"><option value="">All companies</option>${symbols.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select>
        <select class="input" id="qualityFilter">
          <option value="">All quality signals</option>
          <option value="improving">Improving</option>
          <option value="mixed">Mixed / stable</option>
          <option value="weakening">Weakening</option>
        </select>
      </div>
      <div class="table-wrap">
        <table class="data-table decision-results">
          <thead><tr>
            <th>Company</th><th>Period</th><th>Revenue YoY</th><th>Revenue QoQ</th>
            <th>Operating profit YoY</th><th>Operating margin</th><th>Margin change YoY</th>
            <th>Net profit YoY</th><th>OCF YoY</th><th>OCF margin</th><th>Cash conversion</th>
            <th>Capex intensity</th><th>FCF margin</th><th>Quality score</th>
          </tr></thead>
          <tbody id="resultsBody"></tbody>
        </table>
      </div>
    </div>`;

  const render = () => {
    const view = document.getElementById('resultView').value;
    const symbol = document.getElementById('resultSymbol').value;
    const quality = document.getElementById('qualityFilter').value;
    let list = view === 'latest-quarter' ? latestBySymbol(rows) : rows.filter(x => x.period_type === view);
    list = list.filter(x => !symbol || x.symbol === symbol);
    list = list.filter(x => !quality || String(x.quality_label || '').toLowerCase().includes(quality === 'mixed' ? 'mixed' : quality));
    list.sort((a,b) => view === 'latest-quarter' ? a.symbol.localeCompare(b.symbol) : String(b.period_end).localeCompare(String(a.period_end)) || a.symbol.localeCompare(b.symbol));
    document.getElementById('resultsBody').innerHTML = tableRows(list);

    const latest = latestBySymbol(rows);
    const improving = latest.filter(x => Number(x.quality_score) >= 70).length;
    const weakening = latest.filter(x => has(x.quality_score) && Number(x.quality_score) < 40).length;
    const positiveCash = latest.filter(x => Number(x.ocf_margin_pct) > 0).length;
    const medGrowth = median(latest.map(x => x.revenue_yoy));
    document.getElementById('resultKpis').innerHTML = `
      <div class="card"><div class="kpi-label">Median revenue growth</div><div class="kpi-value ${metricClass(medGrowth)}">${fmtPct(medGrowth)}</div><div class="kpi-sub">Latest reported quarter</div></div>
      <div class="card"><div class="kpi-label">Improving quality</div><div class="kpi-value positive">${improving}</div><div class="kpi-sub">Score of 70 or above</div></div>
      <div class="card"><div class="kpi-label">Weakening quality</div><div class="kpi-value ${weakening ? 'negative' : 'positive'}">${weakening}</div><div class="kpi-sub">Score below 40</div></div>
      <div class="card"><div class="kpi-label">Positive OCF margin</div><div class="kpi-value">${positiveCash}/${latest.length || 0}</div><div class="kpi-sub">Latest quarter with available cash flow</div></div>`;
  };

  ['resultView','resultSymbol','qualityFilter'].forEach(id => document.getElementById(id).addEventListener('change', render));
  render();
  await updateModeBadge(rows.map(x => x.fetched_at).filter(Boolean).sort().at(-1));
}

run().catch(e => root.innerHTML = `<div class="notice warning">${esc(e.message)}</div>`);
