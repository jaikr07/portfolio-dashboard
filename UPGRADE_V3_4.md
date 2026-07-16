# Portfolio Dashboard v3.4 — m.Stock + Multi-Account

This update adds separate Zerodha and m.Stock accounts while retaining an **All accounts** combined view.

## What the uploaded m.Stock files contain

- `portfolio_report.xlsx`: 15 current equity holdings, invested value about ₹12.16 lakh and current value about ₹12.60 lakh in the uploaded statement.
- `TradeHistory_23Nov24_to_16Jul26_MA1539350.xlsx`: 1,035 valid buy/sell executions found in the table, dated 13 January 2025 through 15 July 2026.
- AARTIIND and ELECTCAST are present in both the existing Zerodha holdings and m.Stock holdings. The All accounts view combines their quantities and weighted cost; account views keep them separate.

The workbook headers contain personal account information. Never upload the original Excel files to GitHub. Import them only through the live website.

## New features

- Account selector on Overview, Holdings, Technicals, Transactions, Results and News.
- Separate Zerodha and m.Stock opening snapshots.
- Direct m.Stock Excel holdings importer.
- Direct m.Stock Excel trade-history importer.
- Broker field in every new manual transaction.
- Combined weighted quantity/cost for the same stock held through both brokers.
- Account-specific recent-additions charts.
- Capital availability section on Overview:
  - capital deployed;
  - liquid reserve (`LIQUIDCASE`);
  - other ETFs.
- 13 additional m.Stock-only symbols added to `setup/symbols.csv` for local-mode market refreshes.

## Upload

Upload the folders from the update ZIP into the existing repository and commit directly to `main`.

Recommended commit message:

`Add m.Stock and multi-account portfolio support`

Wait for **Deploy dashboard** to succeed.

## Import order in Local mode

1. Open **Settings**.
2. Keep the existing Zerodha data; do not reset it.
3. Under m.Stock, import `portfolio_report.xlsx`.
4. Open **Transactions**.
5. Import the m.Stock `TradeHistory...xlsx` file.
6. Export a new JSON backup from Settings.
7. Run **Refresh portfolio data** once so the additional m.Stock symbols receive prices and technical data.

The m.Stock trade history is analytics-only. It powers recent transaction charts but does not change quantities from the m.Stock holdings snapshot.

## Cloud mode

Before importing m.Stock in Supabase cloud mode, run:

`supabase/upgrade_v3_4.sql`

This adds the `account` column and labels older records as Zerodha.
