# Portfolio Dashboard v3.3 — Edit Manual Transactions

This update adds safe editing for transactions entered through **+ New transaction**.

## Changes

- **Edit** button for manually entered buy, sell, bonus, split and adjustment records.
- Edit form is pre-filled with symbol, type, date, quantity, price, fees and notes.
- Updating a record immediately recalculates holdings, average cost, realised/unrealised P&L and transaction charts.
- Buy and sell entries can no longer be saved with a blank or zero price.
- Quantity must be greater than zero.
- A warning panel highlights existing manual buy/sell records with a zero price and provides a direct **Fix** button.
- Imported Zerodha history and imported opening holdings remain read-only to avoid breaking reconciliation with their source CSV files.
- Works in Local mode and Supabase cloud mode. No SQL migration is required because the existing schema already permits transaction updates.

## Upload

Upload the complete `assets` folder into the root of the existing GitHub repository and commit directly to `main`.

Suggested commit message:

`Add edit and validation for manual transactions`

Wait for **Deploy dashboard** to complete, then hard-refresh the live Transactions page with `Ctrl + Shift + R`.
