# Changelog

## 0.1.0 (Draft)

- Project foundation: Nuxt 4 app with the landing page, creator console (`/app`) and staff back-office (`/admin`) shells, in Bahasa Indonesia and English, with dark mode.
- Creators can sign up with email and password (or Google when configured), verify their email, sign in, reset their password and sign out. Every new creator gets a workspace with a 14-day Kreator trial.
- Staff can sign in to the back-office, which shows the sidebar their role allows.
- Background jobs run from a Postgres job table, triggered by a per-minute tick and immediate kicks, on any serverless host. `/healthz` reports database and tick health.
- Notification bell and notifications page for creators and staff, refreshed every minute.
- Back-office: settings editor (grouped by topic, kill switches ask for confirmation, test email), email template editor with live preview, notification template editor, kill-switch banner and a "Test environment" badge.
- The error page sends visitors back to the console they came from.
- Creators and staff can edit their profile (name, phone shown as 0812-…, photo resized in the browser) and change their password; Google-only creators can create one.
- Workspace settings (name, time zone, niche, affiliate programs), a one-click data export, and an account deletion request; the public /hapus-akun page explains the process in both languages.
- Team: owners on plans with team access invite editors or viewers, manage roles, deactivate members; invitees accept from the emailed link. Plan-gated menu entries show a lock.
- Meta data deletion and deauthorize callbacks, with a public status page.
- The onboarding guide on Beranda can be hidden.
- Akun Sosial: connect Instagram (Business/Creator), Threads and Facebook Pages, pick which Pages to add, reconnect and disconnect; clear messages for personal Instagram accounts, plan limits and accounts already used elsewhere. TikTok, YouTube and X show "Segera hadir".
- Tokens are stored encrypted and bound to their account; tokens near expiry refresh automatically every hour, and the owner is told when an account needs reconnecting.
- Media uploads go straight to storage; photos are converted to JPEG and videos (including iPhone HEVC) to H.264 MP4 ready for Reels, automatically.
- Database schema for the platform and domain layers, with seeded permissions, roles, menus, settings, templates, plans, job schedules and legal pages.
