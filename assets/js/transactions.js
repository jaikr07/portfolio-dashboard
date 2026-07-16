import { mountShell } from './shell.js';
import {
  loadCore,
  aggregateHoldings,
  addTransaction,
  updateTransaction,
  upsertInstrument,
  deleteTransaction,
  importTradebookCsv,
  importMstockTradeWorkbook,
  availableAccounts,
  accountOf,
} from './data-service.js?v=3.5';
import { fmtMoney, fmtNum, esc, today } from './utils.js';
import { updateModeBadge } from './common.js';

mountShell('transactions', 'Transactions & Recent Additions');
const root = document.getElementById('pageContent');

const WINDOWS = {
  '1m': { label: '1 month', short: '1M', days: 31 },
  '3m': { label: '3 months', short: '3M', days: 92 },
  '6m': { label: '6 months', short: '6M', days: 183 },
  '1y': { label: '1 year', short: '1Y', days: 365 },
};

const cleanDate = value => {
  const raw = String(value || '').slice(0, 10);
  const date = new Date(`${raw}T00:00:00`);
  return Number.isFinite(date.getTime()) ? date : null;
};

const canonicalSymbol = symbol =>
  String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/-(BE|SM|BZ|BL)$/, '');

const isHistoryOnly = transaction =>
  transaction.analytics_only === true ||
  String(transaction.analytics_only).toLowerCase() === 'true';

const isEditableManual = transaction =>
  !isHistoryOnly(transaction) &&
  !String(transaction.source || '').endsWith('_holdings_snapshot') &&
  !String(transaction.source || '').endsWith('_tradebook') &&
  String(transaction.transaction_type || '').toLowerCase() !== 'opening';

const transactionType = transaction =>
  String(transaction.transaction_type || '').trim().toLowerCase();

const purchaseCash = transaction =>
  Number(transaction.quantity || 0) * Number(transaction.price || 0) +
  Number(transaction.fees || 0);

const disposalCash = transaction =>
  Math.max(
    0,
    Number(transaction.quantity || 0) * Number(transaction.price || 0) -
      Number(transaction.fees || 0),
  );

const tradeCash = transaction =>
  transactionType(transaction) === 'sell'
    ? disposalCash(transaction)
    : purchaseCash(transaction);

const signedCash = transaction =>
  transactionType(transaction) === 'sell'
    ? -disposalCash(transaction)
    : purchaseCash(transaction);

const typeBadge = transaction => {
  const type = transactionType(transaction);
  if (type === 'sell') return 'negative';
  if (type === 'buy') return 'positive';
  return 'neutral';
};

const compactMoney = value =>
  new Intl.NumberFormat('en-IN', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value || 0));

function displayDate(date) {
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function cutoffFor(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days + 1);
  return date;
}

function buildEligibleTransactions(core, holdings) {
  const currentSymbolMap = new Map(
    holdings.map(holding => [canonicalSymbol(holding.symbol), holding.symbol]),
  );

  return core.transactions
    .filter(transaction => {
      const type = transactionType(transaction);
      const date = cleanDate(transaction.trade_date);
      if (!date || !['buy', 'sell'].includes(type)) return false;

      // Imported tradebook rows are shown only when the company is still held.
      // Manual transactions remain visible even after a future full exit.
      if (isHistoryOnly(transaction)) {
        return currentSymbolMap.has(canonicalSymbol(transaction.symbol));
      }
      return true;
    })
    .map(transaction => ({
      ...transaction,
      display_symbol:
        currentSymbolMap.get(canonicalSymbol(transaction.symbol)) ||
        String(transaction.symbol || '').toUpperCase(),
      parsed_date: cleanDate(transaction.trade_date),
    }))
    .sort((a, b) => b.parsed_date - a.parsed_date);
}

function transactionsForWindow(transactions, windowKey) {
  const cutoff = cutoffFor(WINDOWS[windowKey].days);
  return transactions.filter(transaction => transaction.parsed_date >= cutoff);
}

function summarize(transactions) {
  const purchases = transactions
    .filter(transaction => transactionType(transaction) === 'buy')
    .reduce((sum, transaction) => sum + purchaseCash(transaction), 0);
  const disposals = transactions
    .filter(transaction => transactionType(transaction) === 'sell')
    .reduce((sum, transaction) => sum + disposalCash(transaction), 0);
  const addedSymbols = new Set(
    transactions
      .filter(transaction => transactionType(transaction) === 'buy')
      .map(transaction => transaction.display_symbol),
  );

  return {
    purchases,
    disposals,
    net: purchases - disposals,
    addedSymbols: addedSymbols.size,
    executions: transactions.length,
  };
}

function groupBySymbol(transactions) {
  const groups = new Map();
  for (const transaction of transactions) {
    const symbol = transaction.display_symbol;
    if (!groups.has(symbol)) {
      groups.set(symbol, {
        symbol,
        purchases: 0,
        disposals: 0,
        executions: 0,
        lastDate: transaction.parsed_date,
      });
    }
    const row = groups.get(symbol);
    row.executions += 1;
    if (transaction.parsed_date > row.lastDate) row.lastDate = transaction.parsed_date;
    if (transactionType(transaction) === 'buy') {
      row.purchases += purchaseCash(transaction);
    } else {
      row.disposals += disposalCash(transaction);
    }
  }

  return [...groups.values()]
    .map(row => ({ ...row, net: row.purchases - row.disposals }))
    .sort(
      (a, b) =>
        b.purchases + b.disposals - (a.purchases + a.disposals) ||
        b.net - a.net,
    );
}

function bucketStart(date, mode) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  if (mode === 'week') {
    const day = result.getDay();
    const adjustment = day === 0 ? -6 : 1 - day;
    result.setDate(result.getDate() + adjustment);
  } else if (mode === 'month') {
    result.setDate(1);
  }
  return result;
}

function bucketKey(date, mode) {
  const start = bucketStart(date, mode);
  return start.toISOString().slice(0, 10);
}

function bucketLabel(date, mode) {
  if (mode === 'day') {
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }
  if (mode === 'week') {
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }
  return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

function timeSeries(transactions, windowKey) {
  const mode = windowKey === '1m' ? 'day' : windowKey === '3m' ? 'week' : 'month';
  const cutoff = cutoffFor(WINDOWS[windowKey].days);
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = bucketStart(cutoff, mode);
  const byBucket = new Map();

  for (const transaction of transactions) {
    const key = bucketKey(transaction.parsed_date, mode);
    if (!byBucket.has(key)) byBucket.set(key, { purchases: 0, disposals: 0 });
    const row = byBucket.get(key);
    if (transactionType(transaction) === 'buy') {
      row.purchases += purchaseCash(transaction);
    } else {
      row.disposals += disposalCash(transaction);
    }
  }

  const labels = [];
  const purchases = [];
  const disposals = [];
  const cumulative = [];
  let running = 0;

  for (let cursor = new Date(start); cursor <= end; ) {
    const key = bucketKey(cursor, mode);
    const row = byBucket.get(key) || { purchases: 0, disposals: 0 };
    labels.push(bucketLabel(cursor, mode));
    purchases.push(row.purchases);
    disposals.push(-row.disposals);
    running += row.purchases - row.disposals;
    cumulative.push(running);

    if (mode === 'day') cursor.setDate(cursor.getDate() + 1);
    else if (mode === 'week') cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }

  return { labels, purchases, disposals, cumulative, mode };
}

function importCoverage(transactions) {
  const imported = transactions.filter(isHistoryOnly);
  const dates = imported.map(transaction => cleanDate(transaction.trade_date)).filter(Boolean);
  if (!dates.length) return null;
  return {
    start: new Date(Math.min(...dates.map(date => date.getTime()))),
    end: new Date(Math.max(...dates.map(date => date.getTime()))),
    executions: imported.length,
    symbols: new Set(imported.map(transaction => canonicalSymbol(transaction.symbol))).size,
  };
}

function renderActivity(transactions) {
  const rows = transactions.slice(0, 12);
  if (!rows.length) return '<div class="empty compact">No matching buy or sell activity yet.</div>';

  return rows
    .map(
      transaction => `
        <div class="activity-row">
          <div class="activity-date">
            <strong>${esc(String(transaction.trade_date).slice(8, 10))}</strong>
            <span>${esc(
              transaction.parsed_date.toLocaleDateString('en-IN', { month: 'short' }),
            )}</span>
          </div>
          <div class="activity-main">
            <div>
              <span class="symbol">${esc(transaction.display_symbol)}</span>
              <span class="badge ${typeBadge(transaction)}">${esc(
                transactionType(transaction),
              )}</span>
              ${isHistoryOnly(transaction) ? '<span class="badge neutral">Imported history</span>' : '<span class="badge warning">Manual</span>'}<span class="badge neutral">${esc(accountOf(transaction))}</span>
            </div>
            <small>${fmtNum(transaction.quantity, 3)} shares at ${fmtMoney(
              transaction.price,
              2,
            )}</small>
          </div>
          <div class="activity-actions">
            <strong class="money ${transactionType(transaction) === 'sell' ? 'negative' : 'positive'}">
              ${transactionType(transaction) === 'sell' ? '-' : '+'}${fmtMoney(
                tradeCash(transaction),
              )}
            </strong>
            ${
              isEditableManual(transaction)
                ? `<button type="button" class="btn small edit-tx" data-id="${esc(
                    transaction.id,
                  )}">Edit</button>`
                : ''
            }
          </div>
        </div>`,
    )
    .join('');
}

function renderLedger(transactions) {
  if (!transactions.length) {
    return '<tr><td colspan="8" class="empty">No matching transactions.</td></tr>';
  }

  return transactions
    .map(
      transaction => `
        <tr>
          <td style="text-align:left">${esc(transaction.trade_date)}</td>
          <td><span class="symbol">${esc(transaction.display_symbol)}</span></td>
          <td><span class="badge ${typeBadge(transaction)}">${esc(
            transactionType(transaction),
          )}</span></td>
          <td>${fmtNum(transaction.quantity, 3)}</td>
          <td>${fmtMoney(transaction.price, 2)}</td>
          <td class="money">${fmtMoney(tradeCash(transaction))}</td>
          <td style="text-align:left">
            ${isHistoryOnly(transaction) ? '<span class="badge neutral">History only</span> ' : ''}<span class="badge neutral">${esc(accountOf(transaction))}</span>
            ${esc(transaction.notes || '')}
          </td>
          <td>
            <div class="row-actions">
              ${
                isEditableManual(transaction)
                  ? `<button type="button" class="btn small edit-tx" data-id="${esc(
                      transaction.id,
                    )}">Edit</button>`
                  : '<span class="subtext">Read-only import</span>'
              }
              <button type="button" class="btn danger small del" data-id="${esc(
                transaction.id,
              )}">Delete</button>
            </div>
          </td>
        </tr>`,
    )
    .join('');
}

async function run() {
  const core = await loadCore();
  const accounts = availableAccounts(core.transactions);
  let selectedAccount = localStorage.getItem('portfolioAccountFilter') || 'All accounts';
  if(selectedAccount!=='All accounts' && !accounts.includes(selectedAccount))selectedAccount='All accounts';
  const scopedTransactions = selectedAccount==='All accounts' ? core.transactions : core.transactions.filter(t=>accountOf(t)===selectedAccount);
  const scopedCore = {...core,transactions:scopedTransactions};
  const holdings = aggregateHoldings(core.instruments, core.transactions, selectedAccount);
  const eligible = buildEligibleTransactions(scopedCore, holdings);
  const coverage = importCoverage(scopedTransactions);
  const currentHoldingCount = holdings.length;
  const matchedImported = eligible.filter(isHistoryOnly);
  const matchedImportedSymbols = new Set(
    matchedImported.map(transaction => canonicalSymbol(transaction.display_symbol)),
  ).size;
  const manualPriceIssues = scopedTransactions.filter(
    transaction =>
      isEditableManual(transaction) &&
      ['buy', 'sell'].includes(transactionType(transaction)) &&
      Number(transaction.price || 0) <= 0,
  );
  const mstockHistoryCount=core.transactions.filter(transaction=>isHistoryOnly(transaction)&&accountOf(transaction)==='m.Stock').length;
  const zerodhaHistoryCount=core.transactions.filter(transaction=>isHistoryOnly(transaction)&&accountOf(transaction)==='Zerodha').length;
  const selectedHistoryCount=selectedAccount==='m.Stock'?mstockHistoryCount:selectedAccount==='Zerodha'?zerodhaHistoryCount:mstockHistoryCount+zerodhaHistoryCount;

  root.innerHTML = `
    <div class="hero modern-hero">
      <div>
        <span class="eyebrow">Recent portfolio activity</span>
        <h2>What you are adding now</h2>
        <p>This page tracks recent buys and sells in companies you currently hold. It is separate from your total portfolio cost basis, which can include positions bought before the uploaded tradebook begins.</p>
      </div>
      <div class="hero-actions"><label class="account-picker"><span>Account</span><select id="accountFilter" class="input"><option>All accounts</option>${accounts.map(a=>`<option ${a===selectedAccount?'selected':''}>${esc(a)}</option>`).join('')}</select></label><button class="btn primary" id="openTx">+ New transaction</button></div>
    </div>

    <div class="transaction-context card">
      <div>
        <span class="context-icon">i</span>
        <div>
          <strong>How to read these numbers</strong>
          <p>Gross purchases count every buy execution, including repeated averaging. Net cash added equals purchases minus disposal proceeds inside the selected period. It is not the lifetime amount invested in your portfolio.</p>
        </div>
      </div>
      <div class="context-facts">
        <span><b>${currentHoldingCount}</b> current holdings · ${esc(selectedAccount)}</span>
        <span><b>${matchedImportedSymbols}</b> current holdings found in the tradebook</span>
        <span><b>${matchedImported.length}</b> matching imported executions</span>
      </div>
      ${
        coverage
          ? `<div class="coverage-note">Uploaded tradebook coverage: <strong>${displayDate(
              coverage.start,
            )}</strong> to <strong>${displayDate(
              coverage.end,
            )}</strong>. Purchases before this start date cannot appear here.</div>`
          : '<div class="coverage-note">No tradebook history has been imported yet. Future manual transactions will still appear here.</div>'
      }
    </div>

    <div class="card broker-import-card ${selectedHistoryCount===0?'attention-card':''}">
      <div class="section-heading broker-import-heading">
        <div>
          <span class="eyebrow">Broker history import</span>
          <h3>${selectedAccount==='m.Stock'?'Import m.Stock trade history':selectedAccount==='Zerodha'?'Import Zerodha trade history':'Import trade history by broker'}</h3>
          <p>${selectedHistoryCount===0?'No historical executions are loaded for this view, so all recent-addition charts are zero. Upload the broker file below.':'Historical executions are loaded. Re-importing the same file safely skips duplicate trade IDs.'}</p>
        </div>
        <span class="badge ${selectedHistoryCount?'positive':'warning'}">${selectedHistoryCount} imported executions</span>
      </div>
      <div class="broker-import-options">
        <div class="broker-import-option ${selectedAccount==='m.Stock'?'featured':''}">
          <span class="broker-pill mstock">m.Stock</span>
          <strong>TradeHistory…xlsx</strong>
          <p>Reads Trade Date, Buy / Sell, Scrip / Contract, Qty, Price and Trade Id. The client-information header is ignored.</p>
          <label class="drop-zone compact-drop" for="mstockTradeFile"><strong>Choose m.Stock Excel file</strong><span>.xlsx or .xls</span><input type="file" id="mstockTradeFile" accept=".xlsx,.xls" hidden></label>
          <button class="btn primary" id="importMstockTradebook">Import m.Stock history</button>
          <div id="mstockTradeMsg" class="import-message"></div>
        </div>
        <div class="broker-import-option ${selectedAccount==='Zerodha'?'featured':''}">
          <span class="broker-pill zerodha">Zerodha</span>
          <strong>EQ tradebook CSV</strong>
          <p>Imports historical executions for analytics without changing quantities from the current-holdings snapshot.</p>
          <label class="drop-zone compact-drop" for="tradebookFile"><strong>Choose Zerodha tradebook CSV</strong><span>.csv</span><input type="file" id="tradebookFile" accept=".csv" hidden></label>
          <button class="btn primary" id="importTradebook">Import Zerodha history</button>
          <div id="tradebookMsg" class="import-message"></div>
        </div>
      </div>
    </div>

    ${
      manualPriceIssues.length
        ? `<div class="notice warning transaction-correction-panel">
            <div>
              <strong>${manualPriceIssues.length} manual transaction${manualPriceIssues.length === 1 ? '' : 's'} need${manualPriceIssues.length === 1 ? 's' : ''} correction</strong>
              <p>A buy or sell was saved with a zero price. This understates the cost basis and recent deployment. Edit the record before using the portfolio totals.</p>
            </div>
            <div class="correction-actions">
              ${manualPriceIssues
                .slice(0, 5)
                .map(
                  transaction => `<button type="button" class="btn small edit-tx" data-id="${esc(
                    transaction.id,
                  )}">Fix ${esc(transaction.symbol)} · ${esc(transaction.trade_date)}</button>`,
                )
                .join('')}
            </div>
          </div>`
        : ''
    }

    <div class="period-control-row">
      <div>
        <span class="eyebrow">Analysis window</span>
        <h3>Choose how recent you want the activity to be</h3>
      </div>
      <div class="period-switch" id="periodSwitch">
        ${Object.entries(WINDOWS)
          .map(
            ([key, window]) =>
              `<button data-window="${key}" class="${key === '3m' ? 'active' : ''}">${window.short}<span>${window.label}</span></button>`,
          )
          .join('')}
      </div>
    </div>

    <div id="periodDashboard"></div>

    <div class="card timeline-card transaction-activity-wide">
      <div class="section-heading">
        <div>
          <h3>Recent activity in current holdings</h3>
          <p>Imported trades in exited companies are intentionally hidden. Future manual sells remain visible even after a full exit.</p>
        </div>
        <span class="badge neutral">${eligible.length} relevant records</span>
      </div>
      <div class="activity-list">${renderActivity(eligible)}</div>
    </div>

    <details class="details-panel">
      <summary>Open relevant transaction ledger</summary>
      <div class="ledger-note">This ledger shows buy and sell records used by the page: imported history for current holdings, plus manual transactions. Opening-balance rows and exited historical positions are hidden.</div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Date</th><th>Symbol</th><th>Type</th><th>Quantity</th><th>Price</th><th>Cash value</th><th>Source / notes</th><th></th></tr></thead>
          <tbody>${renderLedger(eligible)}</tbody>
        </table>
      </div>
    </details>

    <div class="modal-backdrop" id="txModal">
      <div class="modal">
        <span class="eyebrow" id="txModalEyebrow">Manual portfolio entry</span>
        <h3 id="txModalTitle">Add transaction</h3>
        <p class="modal-copy" id="txModalCopy">New buys and sells update both your holdings and recent-deployment charts.</p>
        <form id="txForm" class="form-grid">
          <div class="field"><label>Symbol</label><input class="input" name="symbol" list="symbols" required><datalist id="symbols">${core.instruments
            .map(instrument => `<option value="${esc(instrument.symbol)}">`)
            .join('')}</datalist></div>
          <div class="field"><label>Yahoo symbol mapping</label><input class="input" name="yahoo_symbol" placeholder="e.g. RELIANCE.NS"></div><div class="field"><label>Broker account</label><select class="input" name="account">${[...new Set([...accounts,'Zerodha','m.Stock'])].map(a=>`<option>${esc(a)}</option>`).join('')}</select></div>
          <div class="field"><label>Transaction type</label><select class="input" id="txType" name="transaction_type"><option value="buy">Buy</option><option value="sell">Sell</option><option value="bonus">Bonus</option><option value="split">Split adjustment</option><option value="adjustment">Other adjustment</option></select></div>
          <div class="field"><label>Trade date</label><input type="date" class="input" name="trade_date" value="${today()}" required></div>
          <div class="field"><label>Quantity</label><input type="number" step="any" min="0.000001" class="input" name="quantity" required></div>
          <div class="field"><label>Price per share</label><input type="number" step="any" min="0.0001" class="input" id="txPrice" name="price" placeholder="Required for buy and sell"><small id="priceHelp">Buy and sell transactions require a price above zero.</small></div>
          <div class="field"><label>Fees / taxes</label><input type="number" step="any" min="0" class="input" name="fees" value="0"></div>
          <div class="field full"><label>Notes</label><textarea class="input" name="notes" rows="3"></textarea></div>
          <div class="full modal-actions"><button type="button" class="btn" id="closeTx">Cancel</button><button class="btn primary" id="txSubmit">Save transaction</button></div>
        </form>
      </div>
    </div>`;

  let selectedWindow = '3m';
  let flowChart = null;
  let symbolChart = null;

  function renderPeriod(windowKey) {
    selectedWindow = windowKey;
    document.querySelectorAll('#periodSwitch button').forEach(button => {
      button.classList.toggle('active', button.dataset.window === windowKey);
    });

    if (flowChart) { flowChart.destroy(); flowChart = null; }
    if (symbolChart) { symbolChart.destroy(); symbolChart = null; }

    const periodTransactions = transactionsForWindow(eligible, windowKey);
    const summary = summarize(periodTransactions);
    const grouped = groupBySymbol(periodTransactions);
    const topGroups = grouped.slice(0, 12);
    const series = timeSeries(periodTransactions, windowKey);
    const windowSummaries = Object.fromEntries(
      Object.keys(WINDOWS).map(key => [key, summarize(transactionsForWindow(eligible, key))]),
    );

    document.getElementById('periodDashboard').innerHTML = `
      <div class="period-summary-grid">
        ${Object.entries(WINDOWS)
          .map(([key, window]) => {
            const row = windowSummaries[key];
            return `<button class="period-summary-card ${key === windowKey ? 'active' : ''}" data-summary-window="${key}">
              <span>${window.short} net addition</span>
              <strong class="money ${row.net >= 0 ? 'positive' : 'negative'}">${fmtMoney(
                row.net,
              )}</strong>
              <small>${row.executions} executions · ${row.addedSymbols} holdings bought</small>
            </button>`;
          })
          .join('')}
      </div>

      <div class="grid kpis deployment-kpis">
        <div class="card accent-card"><div class="kpi-label">Purchases · ${WINDOWS[windowKey].label}</div><div class="kpi-value money">${fmtMoney(
          summary.purchases,
        )}</div><div class="kpi-sub">Every buy execution in current holdings</div></div>
        <div class="card"><div class="kpi-label">Disposal proceeds · ${WINDOWS[windowKey].label}</div><div class="kpi-value money">${fmtMoney(
          summary.disposals,
        )}</div><div class="kpi-sub">Sales in the same relevant set</div></div>
        <div class="card"><div class="kpi-label">Net cash added · ${WINDOWS[windowKey].label}</div><div class="kpi-value money ${
          summary.net >= 0 ? 'positive' : 'negative'
        }">${fmtMoney(summary.net)}</div><div class="kpi-sub">Recent additions, not lifetime invested capital</div></div>
        <div class="card"><div class="kpi-label">Current holdings added to</div><div class="kpi-value">${summary.addedSymbols}</div><div class="kpi-sub">${summary.executions} buy/sell executions in this window</div></div>
      </div>

      <div class="transaction-chart-grid">
        <div class="card chart-card">
          <div class="section-heading">
            <div><h3>Cash flow over time</h3><p>Bars show purchases and disposals; the line shows cumulative net cash added during the selected window.</p></div>
            <span class="badge neutral">${WINDOWS[windowKey].label}</span>
          </div>
          <div class="chart-box deployment-chart"><canvas id="flowChart"></canvas></div>
          ${periodTransactions.length ? '' : '<div class="empty compact">No matching transactions in this period.</div>'}
        </div>

        <div class="card chart-card">
          <div class="section-heading">
            <div><h3>Which current holdings received capital</h3><p>Net purchases by stock. Positive bars indicate accumulation; negative bars indicate net selling.</p></div>
            <span class="badge neutral">Top ${Math.min(12, topGroups.length)} by activity</span>
          </div>
          <div class="chart-box deployment-chart"><canvas id="symbolChart"></canvas></div>
          ${topGroups.length ? '' : '<div class="empty compact">No stock-level activity in this period.</div>'}
        </div>
      </div>

      <div class="card additions-card">
        <div class="section-heading">
          <div><h3>Most active current positions</h3><p>A decision-friendly view of where capital was added or reduced during ${WINDOWS[windowKey].label}.</p></div>
          <span class="badge neutral">${grouped.length} active holdings</span>
        </div>
        <div class="addition-grid">
          ${
            grouped
              .slice(0, 10)
              .map(
                row => `<div class="addition-item">
                  <div><span class="symbol">${esc(row.symbol)}</span><small>${row.executions} executions · latest ${displayDate(
                    row.lastDate,
                  )}</small></div>
                  <div class="addition-values"><span>Buys <b>${fmtMoney(
                    row.purchases,
                  )}</b></span><span>Sales <b>${fmtMoney(row.disposals)}</b></span></div>
                  <strong class="money ${row.net >= 0 ? 'positive' : 'negative'}">${
                    row.net >= 0 ? '+' : ''
                  }${fmtMoney(row.net)}</strong>
                </div>`,
              )
              .join('') || '<div class="empty compact">No activity to rank.</div>'
          }
        </div>
      </div>`;

    document.querySelectorAll('[data-summary-window]').forEach(button => {
      button.addEventListener('click', () => renderPeriod(button.dataset.summaryWindow));
    });

    if (window.Chart && periodTransactions.length) {
      flowChart = new Chart(document.getElementById('flowChart'), {
        data: {
          labels: series.labels,
          datasets: [
            {
              type: 'bar',
              label: 'Purchases',
              data: series.purchases,
              borderRadius: 7,
              borderSkipped: false,
              backgroundColor: 'rgba(66,211,146,.72)',
            },
            {
              type: 'bar',
              label: 'Disposals',
              data: series.disposals,
              borderRadius: 7,
              borderSkipped: false,
              backgroundColor: 'rgba(255,107,122,.72)',
            },
            {
              type: 'line',
              label: 'Cumulative net added',
              data: series.cumulative,
              yAxisID: 'y1',
              borderColor: '#56c2ff',
              backgroundColor: 'rgba(86,194,255,.12)',
              fill: true,
              pointRadius: series.mode === 'day' ? 0 : 2,
              pointHoverRadius: 5,
              tension: 0.28,
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { color: '#c8d3df', usePointStyle: true } },
            tooltip: {
              callbacks: {
                label: context => `${context.dataset.label}: ${fmtMoney(Math.abs(context.raw))}`,
              },
            },
          },
          scales: {
            x: {
              stacked: false,
              grid: { display: false },
              ticks: { color: '#8ea1b6', maxRotation: 0, autoSkip: true },
            },
            y: {
              grid: { color: 'rgba(142,161,182,.12)' },
              ticks: { color: '#8ea1b6', callback: compactMoney },
            },
            y1: {
              position: 'right',
              grid: { display: false },
              ticks: { color: '#56c2ff', callback: compactMoney },
            },
          },
        },
      });
    }

    if (window.Chart && topGroups.length) {
      symbolChart = new Chart(document.getElementById('symbolChart'), {
        type: 'bar',
        data: {
          labels: topGroups.map(row => row.symbol),
          datasets: [
            {
              label: 'Net cash added',
              data: topGroups.map(row => row.net),
              backgroundColor: topGroups.map(row =>
                row.net >= 0 ? 'rgba(66,211,146,.74)' : 'rgba(255,107,122,.74)',
              ),
              borderRadius: 7,
              borderSkipped: false,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                afterLabel: context => {
                  const row = topGroups[context.dataIndex];
                  return [
                    `Purchases: ${fmtMoney(row.purchases)}`,
                    `Disposals: ${fmtMoney(row.disposals)}`,
                    `Executions: ${row.executions}`,
                  ];
                },
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#8ea1b6', maxRotation: 48, minRotation: 25 },
            },
            y: {
              grid: { color: 'rgba(142,161,182,.12)' },
              ticks: { color: '#8ea1b6', callback: compactMoney },
            },
          },
        },
      });
    }
  }

  document.querySelectorAll('#periodSwitch button').forEach(button => {
    button.addEventListener('click', () => renderPeriod(button.dataset.window));
  });
  renderPeriod(selectedWindow);

  const modal = document.getElementById('txModal');
  const transactionForm = document.getElementById('txForm');
  const transactionTypeInput = document.getElementById('txType');
  const priceInput = document.getElementById('txPrice');
  const priceHelp = document.getElementById('priceHelp');
  let editingTransactionId = null;

  function setPriceRule() {
    const type = String(transactionTypeInput.value || '').toLowerCase();
    const priceRequired = ['buy', 'sell'].includes(type);
    priceInput.required = priceRequired;
    priceInput.min = priceRequired ? '0.0001' : '0';
    priceInput.placeholder = priceRequired
      ? 'Required for buy and sell'
      : 'Zero is allowed for bonus or split';
    priceHelp.textContent = priceRequired
      ? 'Buy and sell transactions require a price above zero.'
      : 'A zero price is valid for bonus and split adjustments.';
    if (!priceRequired && priceInput.value === '') priceInput.value = '0';
    priceInput.setCustomValidity('');
  }

  function closeTransactionModal() {
    modal.classList.remove('open');
  }

  function openNewTransaction() {
    editingTransactionId = null;
    transactionForm.reset();
    transactionForm.elements.trade_date.value = today();
    transactionForm.elements.transaction_type.value = 'buy';
    transactionForm.elements.fees.value = '0';
    transactionForm.elements.account.value = selectedAccount==='All accounts'?(accounts[0]||'Zerodha'):selectedAccount;
    document.getElementById('txModalTitle').textContent = 'Add transaction';
    document.getElementById('txModalCopy').textContent =
      'New buys and sells update both your holdings and recent-deployment charts.';
    document.getElementById('txSubmit').textContent = 'Save transaction';
    setPriceRule();
    modal.classList.add('open');
  }

  function openEditTransaction(transaction) {
    if (!isEditableManual(transaction)) return;
    editingTransactionId = transaction.id;
    const instrument = core.instruments.find(
      row => canonicalSymbol(row.symbol) === canonicalSymbol(transaction.symbol),
    );
    transactionForm.elements.symbol.value = transaction.symbol || '';
    transactionForm.elements.yahoo_symbol.value = instrument?.yahoo_symbol || '';
    transactionForm.elements.transaction_type.value = transactionType(transaction);
    transactionForm.elements.trade_date.value = String(transaction.trade_date || '').slice(0, 10);
    transactionForm.elements.quantity.value = Number(transaction.quantity || 0);
    transactionForm.elements.price.value = Number(transaction.price || 0);
    transactionForm.elements.fees.value = Number(transaction.fees || 0);
    transactionForm.elements.notes.value = transaction.notes || '';
    transactionForm.elements.account.value = accountOf(transaction);
    document.getElementById('txModalTitle').textContent = `Edit ${transaction.symbol} transaction`;
    document.getElementById('txModalCopy').textContent =
      'Correcting this record will immediately recalculate quantity, average cost, P&L and recent-deployment charts.';
    document.getElementById('txSubmit').textContent = 'Update transaction';
    setPriceRule();
    modal.classList.add('open');
  }

  document.getElementById('accountFilter').addEventListener('change',e=>{localStorage.setItem('portfolioAccountFilter',e.target.value);location.reload();});
  document.getElementById('openTx').addEventListener('click', openNewTransaction);
  document.getElementById('closeTx').addEventListener('click', closeTransactionModal);
  modal.addEventListener('click', event => {
    if (event.target === modal) closeTransactionModal();
  });
  transactionTypeInput.addEventListener('change', setPriceRule);

  document.querySelectorAll('.edit-tx').forEach(button =>
    button.addEventListener('click', () => {
      const transaction = core.transactions.find(
        row => String(row.id) === String(button.dataset.id),
      );
      if (transaction) openEditTransaction(transaction);
    }),
  );

  transactionForm.addEventListener('submit', async event => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target));
    const type = String(form.transaction_type || '').toLowerCase();
    const price = Number(form.price || 0);
    const quantity = Number(form.quantity || 0);
    if (quantity <= 0) {
      transactionForm.elements.quantity.setCustomValidity('Enter a quantity above zero.');
      transactionForm.elements.quantity.reportValidity();
      return;
    }
    transactionForm.elements.quantity.setCustomValidity('');
    if (['buy', 'sell'].includes(type) && price <= 0) {
      priceInput.setCustomValidity('Enter the executed price. Buy and sell prices cannot be zero.');
      priceInput.reportValidity();
      return;
    }
    priceInput.setCustomValidity('');

    const symbol = form.symbol.trim().toUpperCase();
    if (!core.instruments.some(instrument => instrument.symbol === symbol)) {
      await upsertInstrument({
        symbol,
        yahoo_symbol:
          form.yahoo_symbol || `${symbol.replace(/-(BE|SM|BZ|BL)$/, '')}.NS`,
        name: symbol,
        exchange: 'NSE',
      });
    }
    delete form.yahoo_symbol;
    if (editingTransactionId) await updateTransaction(editingTransactionId, form);
    else await addTransaction(form);
    location.reload();
  });

  document.getElementById('importTradebook').addEventListener('click', async () => {
    const file = document.getElementById('tradebookFile').files[0];
    const message = document.getElementById('tradebookMsg');
    if (!file) {
      message.className = 'import-message negative';
      message.textContent = 'Choose the tradebook CSV first.';
      return;
    }
    try {
      message.className = 'import-message';
      message.textContent = 'Importing and checking duplicates…';
      const result = await importTradebookCsv(await file.text(),'Zerodha');
      message.className = 'import-message positive';
      message.textContent = `Imported ${result.imported} executions (${result.duplicates} duplicates skipped), covering ${result.start} to ${result.end}. Only current-holding history will be shown. Reloading…`;
      setTimeout(() => location.reload(), 900);
    } catch (error) {
      message.className = 'import-message negative';
      message.textContent = error.message;
    }
  });

  document.getElementById('importMstockTradebook').addEventListener('click', async () => {
    const file=document.getElementById('mstockTradeFile').files[0];
    const message=document.getElementById('mstockTradeMsg');
    if(!file){message.className='import-message negative';message.textContent='Choose the m.Stock trade-history Excel file first.';return;}
    try{message.className='import-message';message.textContent='Reading m.Stock executions and checking duplicates…';const result=await importMstockTradeWorkbook(await file.arrayBuffer());message.className='import-message positive';message.textContent=`Imported ${result.imported} m.Stock executions (${result.duplicates} duplicates skipped), covering ${result.start} to ${result.end}. Reloading…`;setTimeout(()=>location.reload(),900);}catch(error){message.className='import-message negative';message.textContent=error.message;}
  });

  document.querySelectorAll('.del').forEach(button =>
    button.addEventListener('click', async () => {
      if (confirm('Delete this transaction record?')) {
        await deleteTransaction(button.dataset.id);
        location.reload();
      }
    }),
  );

  await updateModeBadge();
}

run().catch(error => {
  root.innerHTML = `<div class="notice warning">${esc(error.message)}</div>`;
});
