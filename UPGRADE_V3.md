# Portfolio Command Center v3 upgrade

This update turns the spreadsheet-style views into a visual decision dashboard and adds a safe Zerodha tradebook importer.

## What changes

- Overview: sector doughnut, technical breadth, grouped action centre, sector tiles, negative-news panel, leader/laggard cards.
- Holdings: card layout, exact trend/asset filters, counts, search and sorting. A detailed table remains available in an expandable section.
- Technicals: visual signal cards with 20/50/200 DMA posture, RSI, 52-week gap, volume and alerts.
- Transactions: vertical monthly buy/sell bars, cumulative net-deployment line, 365-day KPIs and direct Zerodha EQ tradebook import.
- Results: company scorecards and corrected cash-flow extraction. Quarterly cards use trailing-four-quarter cash flow matched to the nearest statement dates; annual cash flow is used as a fallback.
- ETFs: remain in holdings/technicals but are excluded from operating-company financial metrics.

## Important privacy design for the tradebook

Do not upload the tradebook CSV to GitHub. Import it inside the live website.

The tradebook is imported as **history only**. It drives the capital-deployment chart but does not alter the current quantity and average cost already loaded from the holdings snapshot. This avoids double-counting partial historical data.

## Upload to the existing repository

1. Extract `portfolio-dashboard-v3-update.zip`.
2. Open the existing `portfolio-dashboard` repository on GitHub.
3. Select **Add file → Upload files**.
4. Drag these folders from the extracted update into the upload area:
   - `assets`
   - `scripts`
   - `supabase`
5. Also drag `UPGRADE_V3.md`.
6. Commit directly to `main` with the message `Upgrade portfolio dashboard to visual v3`.
7. Wait for **Deploy dashboard** to finish successfully.
8. Run **Refresh portfolio data** with both skip options unchecked. The full refresh is required to produce the new TTM cash-flow metrics.
9. Hard-refresh the live website with `Ctrl + Shift + R`.

## Import the uploaded tradebook

1. Open **Transactions** in the live dashboard.
2. Under **Zerodha EQ tradebook**, select the original `tradebook-UUH519-EQ.csv`.
3. Select **Import transaction history**.
4. The page should report 506 imported executions the first time. A repeat import should report 506 duplicates and import zero new records.
5. Export a JSON backup from **Settings** after the import because local-mode data is stored in this browser.

The uploaded file spans 25 July 2025 to 14 July 2026 and contains 416 buy executions and 90 sell executions across 61 symbols. The chart should show approximately ₹44.77 lakh of gross purchases, ₹19.10 lakh of gross disposals and ₹25.67 lakh of net deployment.

## Supabase cloud-mode users

Before importing the tradebook, run `supabase/upgrade_v3.sql` in the Supabase SQL Editor. It adds:

- `analytics_only`
- `external_trade_id`
- `source`
- trade-ID deduplication
- cash-flow basis/coverage fields

Local mode does not require this SQL step.

## Financial-data limitation

The updater now fixes the previous exact-date matching problem and uses TTM cash flow. Some companies may still show a source-coverage warning when Yahoo does not publish a usable cash-flow statement. Financial businesses are explicitly marked **Not applicable** for OCF/capex ratios rather than showing unexplained blanks.
