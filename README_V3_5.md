# Portfolio Dashboard v3.5 — m.Stock repair

This repair addresses three separate problems:

1. The m.Stock trade-history uploader was positioned below the charts, so it looked missing. It is now shown near the top of Transactions, especially when m.Stock has zero imported executions.
2. The m.Stock-only companies were not present in the static updater's `setup/symbols.csv`, leaving prices, technicals and results blank. The repaired symbol list includes all 15 m.Stock holdings.
3. Existing locally imported instruments were stored as `Unclassified`. The dashboard now repairs names, sectors, asset types and Yahoo mappings automatically without deleting holdings or transactions.

## Tested against the uploaded m.Stock files

- `portfolio_report.xlsx`: 15 current holdings
- `TradeHistory_23Nov24_to_16Jul26_MA1539350.xlsx`: 1,035 valid executions
- Trade coverage detected: 13 January 2025 to 15 July 2026
- 121 imported executions match 13 of the 15 currently held m.Stock symbols

Historical executions remain analytics-only and do not alter the quantities from the current-holdings workbook.

## Upload

Upload all folders in this update to the repository root:

- `assets`
- `pages`
- `scripts`
- `setup`
- `supabase`

Commit message: `Repair m.Stock history and market-data coverage`

Then run:

1. Actions → Deploy dashboard
2. Actions → Refresh portfolio data
3. Leave both skip options unchecked
4. Hard refresh the website with Ctrl+Shift+R

On Transactions, select m.Stock and use the visible `Import m.Stock history` control near the top. Re-importing the same workbook skips duplicate trade IDs.
