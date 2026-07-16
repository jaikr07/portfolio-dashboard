# JKR Investments v4.2 — Branding, themes and mobile update

This interface-only update:
- renames the website and installed PWA to **JKR Investments**;
- adds the supplied JKR icon for the website, login screen, favicon and phone app;
- adds **System / Dark / Light** theme selection;
- improves mobile navigation, cards, charts, forms and touch targets.

## Important
This update intentionally does **not** contain `assets/js/config.js`, so your live Supabase URL and publishable key are not overwritten.

## Install
Upload every file and folder in this update to the root of the existing GitHub repository. Commit to `main`, wait for **Deploy dashboard**, then hard-refresh the site.

No database migration, broker re-import or market-data refresh is required.

On Android, uninstall and reinstall the old PWA only if the launcher keeps the old name/icon after the new service worker has updated.
