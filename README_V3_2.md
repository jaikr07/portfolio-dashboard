# Transactions v3.2 update

This update replaces the confusing 365-day gross-activity page with a recent-additions dashboard.

## Changes

- Default view is the latest 3 months, with 1M, 3M, 6M and 1Y selectors.
- Imported tradebook rows are included only for stocks currently held.
- Future manual buys and sells stay visible even after a later full exit.
- Gross purchases, disposal proceeds and net cash added are recalculated for the selected period.
- Sell fees are deducted from disposal proceeds instead of added.
- Stock-wise vertical bar chart shows which current holdings received or released capital.
- Time chart shows purchases, disposals and cumulative net additions.
- The page clearly separates recent tradebook activity from lifetime portfolio cost basis.

## Upload

Upload the `assets` folder to the root of the existing GitHub repository and overwrite the two changed files. Commit, wait for `Deploy dashboard`, then hard-refresh the Transactions page with Ctrl+Shift+R.

No market-data refresh and no tradebook re-import are required.
