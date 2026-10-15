# Changelog

## 0.1.0 (Draft)

- Project foundation: Nuxt 4 app with the landing page, creator console (`/app`) and staff back-office (`/admin`) shells, in Bahasa Indonesia and English, with dark mode.
- Creators can sign up with email and password (or Google when configured), verify their email, sign in, reset their password and sign out. Every new creator gets a workspace with a 14-day Kreator trial.
- Staff can sign in to the back-office, which shows the sidebar their role allows.
- Background jobs run from a Postgres job table, triggered by a per-minute tick and immediate kicks, on any serverless host. `/healthz` reports database and tick health.
- Database schema for the platform and domain layers, with seeded permissions, roles, menus, settings, templates, plans, job schedules and legal pages.
