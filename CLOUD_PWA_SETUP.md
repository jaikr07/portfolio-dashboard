# Cloud Login + Phone App Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL Editor.
3. Create one confirmed Auth user and disable public sign-ups.
4. Put the Project URL and publishable key in `assets/js/config.js`; set `DEFAULT_MODE` to `cloud`.
5. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as GitHub Actions repository secrets.
6. Deploy, sign in on the existing computer, and choose **Move browser portfolio to cloud** in Settings.
7. Run the full Refresh portfolio data workflow.
8. Sign in on the phone and use Chrome's Install app option.
