# Decision Dashboard v2 — browser upload instructions

This upgrade changes the Results, News/Announcements, Overview, Holdings and Settings pages. It also expands the nightly updater.

## Before uploading

- Your current holdings and transactions stored in the browser are not affected.
- Do not upload your broker holdings CSV.
- If you use Supabase cloud mode, run `supabase/upgrade_decision_dashboard.sql` in Supabase SQL Editor before running the refreshed workflow.
- If you use Local mode, no database step is needed.

## Upload through GitHub

1. Extract `portfolio-dashboard-v2-update.zip` on your computer.
2. Open your GitHub repository: `jaikr07/portfolio-dashboard`.
3. Choose **Add file → Upload files**.
4. From inside the extracted update folder, drag these four folders into the GitHub upload area:
   - `assets`
   - `scripts`
   - `setup`
   - `supabase`
5. Also drag `UPGRADE_V2.md` if you want to keep these instructions in the repository.
6. GitHub will show existing files as changed/replaced. Use commit message:
   `Upgrade to decision-focused portfolio dashboard v2`
7. Commit directly to `main`.

## Refresh the data

1. Open **Actions → Refresh portfolio data → Run workflow**.
2. Leave both skip boxes unchecked so financial metrics and announcements are rebuilt.
3. Wait for a green check mark.
4. Open the live website and press `Ctrl + Shift + R`.

## What changes

- Results show growth, margins, operating cash flow, free cash flow, cash conversion and capex intensity as percentages, not raw revenue/profit values.
- News includes “Why it matters”, “What to verify next”, materiality and time horizon.
- Overview puts negative developments from the last seven days first.
- Overview shows broad sector allocation and current-value-weighted 3M/1Y/2Y sector price performance.
- Settings lets you edit sector and asset type.
- LIQUIDCASE and SILVER are preclassified as ETFs and excluded from company financial-result analysis.

## Important interpretation note

The sector-performance chart is the current-value-weighted market-price performance of the securities currently held. It is not a historical portfolio IRR because the imported broker file does not contain the original dates of every purchase.
