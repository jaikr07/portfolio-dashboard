# Portfolio Command Center

A GitHub Pages dashboard for an Indian equity portfolio. It tracks holdings, weighted average cost, unrealised and realised P&L, daily technical levels, alerts, quarterly/annual results, and summarized company news.

## What is already included

- Seven pages: Overview, Holdings, Technicals, Transactions, Results, News & Announcements, Settings.
- Your 49 stock symbols are already listed in `setup/symbols.csv` for automated price refreshes. Quantities and cost prices are deliberately **not** stored in the repository.
- Broker CSV import directly inside the website.
- Buy, sell, bonus, split and adjustment transactions.
- SMA 20/50/200, EMA 20/50, RSI 14, 52-week levels, volume ratio, golden/death cross, breakout and breakdown alerts.
- Quarterly and annual revenue, operating income, net income, EPS and YoY change where the market-data provider supplies them.
- News summarization and impact scoring from −5 to +5. OpenAI enrichment is optional; a deterministic keyword classifier is the free fallback.
- Browser-only local mode and authenticated Supabase cloud mode.
- Scheduled GitHub Action at 18:17 Asia/Kolkata on weekdays, plus manual runs.
- One GitHub issue when a new 200-DMA break, golden/death cross, 52-week breakout or breakdown first appears. Set repository variable `CREATE_GITHUB_ALERT_ISSUES=false` to disable these issue notifications.

## Recommended setup: secure cloud mode

### 1. Create the GitHub repository

Create a repository and upload the contents of this folder. A public code repository is fine because the broker export is not included. Do **not** upload a CSV containing quantities, average costs or invested value.

In **Settings → Pages**, choose **GitHub Actions** as the source.

### 2. Create Supabase

Create a Supabase project, open **SQL Editor**, and run the complete file:

```text
supabase/schema.sql
```

In **Authentication → Users**, create your own email/password user. For a personal dashboard, keep public sign-up disabled.

### 3. Connect the website

Open `assets/js/config.js` and fill only:

```js
SUPABASE_URL: "https://YOUR_PROJECT.supabase.co",
SUPABASE_ANON_KEY: "YOUR_PUBLISHABLE_OR_ANON_KEY",
DEFAULT_MODE: "cloud",
```

The browser key is protected by Row Level Security. Never put the service-role key here.

### 4. Add GitHub secrets

In **Settings → Secrets and variables → Actions**, create:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY` — optional, only for better announcement summaries

Optional repository variables:

- `OPENAI_MODEL` (default `gpt-5-mini`)
- `AI_MAX_ITEMS` (default `15` new articles per run)

### 5. Import holdings

Open the live website → **Settings** → sign in → upload your broker CSV. The provided separate file `portfolio-holdings-import.csv` is ready for this import.

### 6. Run the first refresh

Open the GitHub **Actions** tab → **Refresh portfolio data** → **Run workflow**.

After the run, prices, technicals, results and news should appear. The scheduled run then executes on weekdays after Indian market hours.

## Fast setup: local mode

No account or backend is required. Open **Settings**, upload the broker CSV, and the transactions stay in that browser's local storage. The tracked symbol list still gets end-of-day market updates through GitHub Actions.

Limitations of local mode:

- Portfolio quantities do not sync across devices.
- Clearing browser storage removes the local portfolio unless you exported a JSON backup.
- A newly added stock needs to be added to `setup/symbols.csv` for the nightly updater to fetch it. Cloud mode discovers new instruments automatically.

## Symbol mapping

Yahoo Finance symbols are stored separately from your broker symbols. Examples:

```csv
symbol,yahoo_symbol,name
AARTIIND,AARTIIND.NS,Aarti Industries
RELIANCE,RELIANCE.NS,Reliance Industries
```

SME, BE-series, renamed or newly demerged companies may need correction. Edit `setup/symbols.csv` in local mode, or the `instruments` row in Supabase cloud mode. The updater also tries NSE, BSE and Yahoo search fallbacks.

## Data-source limitations

`yfinance` is convenient but is not an exchange-authorized paid feed. Data can be delayed, temporarily unavailable, or incomplete for Indian SME stocks, recent listings and corporate financial statements. The announcement page uses public news search rather than guaranteed exchange-filings coverage. Material decisions should be verified against the original NSE/BSE/company filing.

For higher reliability later, replace the provider functions in `scripts/update_market.py` with a licensed market-data or corporate-filings API. The frontend and database schema do not need to change.

## Privacy rules

- The deployment workflow excludes `setup/`, `scripts/`, and `supabase/` from the published Pages artifact.
- Do not commit broker exports. `.gitignore` blocks common holdings filenames, but always verify the commit before pushing.
- The Supabase service-role key belongs only in GitHub Actions secrets.
- The frontend must contain only the publishable/anon key, with RLS enabled.
- The Privacy button visually masks money values on screen; it is not a substitute for authentication.

## Alert interpretation

- **Below 200 DMA:** long-term price trend warning, not an automatic sell.
- **Golden/death cross:** 50 DMA crossing 200 DMA.
- **52-week breakout/breakdown:** latest adjusted close exceeds the prior 52-week range.
- **High volume:** at least 1.8× the 20-day average.
- **RSI:** above 75 is flagged as overbought risk; below 30 as oversold.
- **Impact score:** estimated business materiality from −5 to +5, not a price target or recommendation.

## Official references

- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- Scheduled Actions: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase browser client: https://supabase.com/docs/reference/javascript/initializing
- yfinance API reference: https://ranaroussi.github.io/yfinance/reference/index.html
