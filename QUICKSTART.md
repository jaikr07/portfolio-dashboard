# 10-minute launch checklist

1. Create a GitHub repository and upload this folder. Do not upload your broker CSV.
2. GitHub → Settings → Pages → Source: **GitHub Actions**.
3. Create a Supabase project.
4. Supabase SQL Editor → run `supabase/schema.sql`.
5. Supabase Authentication → create your email/password user; disable public sign-up.
6. Edit `assets/js/config.js`: add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and set `DEFAULT_MODE: "cloud"`.
7. GitHub Actions secrets → add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; `OPENAI_API_KEY` is optional.
8. Push the config change and open the deployed website.
9. Settings page → sign in → upload `portfolio-holdings-import.csv`.
10. GitHub Actions → **Refresh portfolio data** → Run workflow.

After that, the dashboard refreshes at 18:17 India time on weekdays. Newly triggered 200-DMA breaks, golden/death crosses, and 52-week breakouts/breakdowns create one GitHub issue. Set repository variable `CREATE_GITHUB_ALERT_ISSUES=false` to turn those issue notifications off.
