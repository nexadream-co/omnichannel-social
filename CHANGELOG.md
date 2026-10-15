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
- Plans: what a workspace may do follows its plan in force; a lapsed trial falls back to Gratis immediately. Limits show friendly messages, a quiet trial/grace banner sits under the top bar, an upgrade dialog opens only when a limit is hit, and the rail shows an Upgrade button when there is something to upgrade to.
- Back-office plan editor: prices, trial days, every limit (with "Tanpa batas") and every feature; plans in use or the default plan can't be deleted.
- Buat Postingan: write once for every connected account (all selected by default), upload photos and videos that are fixed automatically, see per-platform character counts and friendly hints (for example, Instagram links aren't clickable), pick a suggested time, then Jadwalkan, Posting sekarang or save a draft. Per-platform caption, format, first comment and alt text sit under "Opsi lanjutan".
- Postingan list with Terjadwal / Draf / Terbit / Gagal tabs, per-account status in plain words, "Coba lagi" on failures; post detail with reasons and fix buttons; duplicate, edit, cancel and delete.
- Kalender: month view with drag-to-reschedule on desktop and a day list on phones; tap a day to create a post for it.
- Posts publish automatically and reliably: a lost platform response is reconciled instead of posting twice, daily platform limits reschedule instead of failing, expired accounts pause their posts and ask for a reconnect, and the monthly plan allowance is shown before scheduling.
- Beranda shows upcoming posts and a fix-it alert for failed posts.
- Link Produk: paste a Shopee, Tokopedia, Lazada, TikTok Shop or other shop link and get a short link that counts clicks; the product name, photo and price fill in automatically. Copy, QR code, archive, and a per-product statistics page.
- "Tambah link produk" in Buat Postingan puts a product's short link in the caption; each post and platform gets its own link, so clicks show which post sold.
- Etalase: pick a name, and every product appears on one phone-first page for the bio link. Three themes, photo, short description, social links, categories, pin, labels, hide and reorder, a live preview, publish/hide, copy link and QR. The public page loads without any JavaScript, with search and category tabs.
- Statistik: total and unique clicks per day, top products, top posts, and clicks by source, platform, device and city, for 7, 30 or 90 days (limited to the plan's history, with a note when shortened).
- Clicks from bots and link previews are not counted; visitor IPs are never stored (daily salted hashes only).
- Balas Otomatis: when someone comments a keyword on an Instagram post, they get the product link by DM within seconds, plus an optional public reply picked at random from a few variations. Rules are set up in three steps (post, keywords, message + product) or from ready-made examples, with a "Coba" button that previews the DM without sending. An activity page shows who commented and whether the DM went out, with the reason in plain words when it didn't.
- Instagram's rules are enforced automatically: one DM per person, only for comments from the last 7 days, an hourly limit per account, an optional daily limit per rule, the plan's monthly DM allowance (the owner is told once when it runs out) and an emergency off switch for staff. Repeated notifications from Instagram never send a second DM.
- Database schema for the platform and domain layers, with seeded permissions, roles, menus, settings, templates, plans, job schedules and legal pages.
