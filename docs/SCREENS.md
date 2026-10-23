# Screens — Socialz.id Design Brief (v1)

This brief can be sent straight to a designer or design tool. It covers what each screen needs and why it exists, not the layout.

## Product context
- **Product:** Socialz.id, a SaaS for Indonesian affiliate creators (Shopee Affiliate, TikTok Shop and similar). Users schedule posts to Instagram, Threads and Facebook Pages, manage product links with click tracking, run a link-in-bio storefront ("Etalase"), and auto-send product links by Instagram DM when someone comments a keyword.
- **Users:** **Anyone starting affiliate marketing**, including complete beginners. They are not big agencies. Most work from a phone.
- **Language:** Bahasa Indonesia by default, English available. **Currency:** IDR.

## Design principles (apply to every screen)
1. **A newcomer reaches the first scheduled post in under 5 minutes**, with no docs.
2. **Plain Bahasa, no tech words.** Use "Jadwalkan", "Etalase", "Balas Otomatis", "Link Produk", "Hubungkan Akun". Never show "webhook", "token", "API", "slug" or "UTM".
3. **One primary action per screen.** Advanced options stay hidden behind "Opsi lanjutan".
4. **Smart defaults.** Post to all accounts, a suggested time, automatic short links, a default theme.
5. **The app fixes problems for you.** Auto-crop and auto-compress media. Warn before posting, don't fail after.
6. **Friendly errors with a fix button** ("Hubungkan ulang", "Coba lagi").
7. **Mobile-first and one-handed.** Bottom navigation on phones.
8. **Every empty state teaches** the next step, with a single button.
9. **Templates over blank pages:** caption templates and auto-reply templates.

---

## A. Public

**1. Landing page.** Purpose: turn beginners into sign-ups.
Needs: a simple value statement ("Jadwalkan konten, kumpulkan link produk, balas komentar otomatis"), 3 features with visuals, platform logos, a beginner-friendly "how it works in 3 steps", testimonials, pricing preview, FAQ, sign-up CTA, language switch.

**2. Pricing.** Purpose: an easy choice.
Needs: 2 plans (Gratis, Kreator) in IDR, a monthly/yearly toggle, limits written in plain words ("5 akun", "300 postingan/bulan"), a "start free, no card needed" message, FAQ.

**3. Public Etalase page.** Purpose: the page a creator's followers see from the bio link. Most important for conversions.
Needs: avatar, name, short bio, social icons, product cards (image, title, price, marketplace badge, "Beli" button), category tabs, search, pinned products, a small "dibuat dengan Socialz.id" footer on the free plan. Very fast, phone-first.

**4. Link not found.** Purpose: fallback for a broken or disabled link.
Needs: a friendly message and a link to the creator's Etalase if known.

**5. Legal pages.** Purpose: required by Meta.
Needs: privacy policy, terms, data deletion instructions, and a deletion status page (shows a request code and its status).

## B. Account and onboarding

**6. Sign up.** Needs: name, email, password, a "Lanjutkan dengan Google" button, terms checkbox. Short and clear.

**7. Log in.** Needs: email and password, Google button, forgot password link.

**8. Verify email.** Needs: a "check your inbox" message, resend button, change email option.

**9. Forgot / reset password.** Needs: email form, then a new password form, plus success states.

**10. Onboarding checklist.** Purpose: get a beginner to first value fast.
Needs:
- 4 steps with progress: (1) Hubungkan akun, (2) Buat Etalase (pick a handle and preset theme), (3) Tambah produk pertama (paste a link), (4) Jadwalkan postingan pertama.
- Each step is skippable.
- A short explanation of why each step matters.
- A celebration when all steps are done.

## C. Core app

**11. App shell.** Needs: nav (Beranda, Buat Postingan, Kalender, Postingan, Link Produk, Etalase, Balas Otomatis, Statistik, Akun), a big "+ Buat Postingan" button, notifications bell, plan badge, profile menu. Bottom nav plus a floating create button on mobile.

**12. Home (Beranda).** Purpose: "what do I do today?"
Needs: the onboarding checklist (until done), today's and upcoming posts, alerts that need action (failed post, account needs reconnecting) with fix buttons, clicks this week, top 3 products, auto-replies sent, a tip of the day. Once the checklist is done or hidden: a "Minggu ini" card (posts and planned ideas vs the weekly target, ideas waiting in Bank Ide, the next shopping moment with "Siapkan konten").

**13. Connected accounts.** Purpose: connect and manage social accounts.
Needs: big "Hubungkan Instagram / Threads / Facebook" buttons with a one-line explanation each, connected accounts with a status ("Aktif" or "Perlu dihubungkan ulang"), reconnect and disconnect, a "Segera hadir" badge on TikTok, YouTube and X, a help link ("Akun Instagram harus Bisnis/Kreator. Cara ubah →").

**14. Account picker (after connecting).** Purpose: choose which Pages or Instagram accounts to add.
Needs: a selectable list, friendly errors with a how-to-fix guide (e.g., "Akun pribadi tidak didukung. Ubah ke akun Kreator dalam 1 menit →").

**15. Composer (Buat Postingan).** Purpose: write once, post everywhere. The most important app screen.
- **Default view:**
  - Account selector (all selected).
  - One caption box with a character counter.
  - Media upload (drag or tap) with automatic fixing.
  - "Tambah link produk" (choose from Link Produk or paste a new one).
  - Hashtags: the caption's hashtags as chips colored by quality (tap for the reason and "Hapus"); set-level hints, including "Buat versi Threads dengan 1 tagar". "Saran tagar" opens a panel with Saran (ideas from the tag list, free), Riset (own results and Threads activity, paid) and Set tersimpan (free), plus "Tambah tagar sendiri" with a live check. Never required.
  - Template picker.
  - Live preview per platform.
  - Actions: "Jadwalkan" (suggested time pre-filled) and "Posting sekarang". Saving as draft is secondary.
- **"Opsi lanjutan" (collapsed):** a different caption per platform, Instagram format (Feed, Reel, Story), first comment, alt text, attach an auto-reply rule.
- **Friendly hints:**
  - Instagram links aren't clickable: "Link di caption Instagram tidak bisa diklik — kami tambahkan ke Etalase & Balas Otomatis?"
  - Caption too long for Threads.
  - Daily posting limit reached.

**16. Calendar (Kalender) = the content planner.** Purpose: decide what to post and when, then see and move it.
Needs: week view (default) and month view, a day list on phones; posts as solid chips (color by platform, status icons) and planned ideas as dashed chips, both dragged to another day (never into the past). **Momen belanja** strip (11.11, gajian, Lebaran…, coming 30 days) with "Siapkan konten" = three dated ideas (teaser, review, day-of). **Target per minggu** ("2/3 terisi minggu ini", default 3). **Bank Ide** beside the calendar on desktop, a tab on phones and tablets: one-line capture ("Tulis ide konten, lalu tekan Enter"), views Belum ada tanggal / Sudah ada tanggal / Sudah jadi postingan / Arsip, cards draggable onto a day. Idea editor (slideover): idea, note, date, Jenis konten, products, media from Galeri, "Jadikan postingan" (opens the composer pre-filled), Arsipkan / Pulihkan. "+" on a day: with ideas waiting it offers them ("Isi"), otherwise it opens the composer on that date as before. Free on every plan; never part of onboarding.

**16a. Shopping moments (back-office, `/admin/moments`).** Purpose: keep the creators' shopping calendar right (Ramadan and Lebaran move every year). Needs: upcoming / all list, add and edit (name in Bahasa and English, kind, dates, preparation days), switch off instead of delete.

**17. Posts list (Postingan).** Purpose: manage all posts.
Needs: tabs (Terjadwal, Draf, Terbit, Gagal), simple filters, status per platform, a "Coba lagi" button on failed posts, empty states that teach.

**18. Post detail.** Purpose: what happened to one post.
Needs: preview, per-platform status in plain words, a reason and fix button for failures, a link to the live post, basic numbers (views, likes, comments), clicks on attached links, auto-replies sent, edit, duplicate, "Jadikan ide lagi" (back to Bank Ide with its words, media and products) and delete.

**19. Media library (Galeri Media, `/app/media`).** Purpose: reuse photos and videos.
Needs: grid with a Semua/Foto/Video filter, upload, edit (saves a copy), "Pakai di postingan", delete (refused while a post uses it), storage used, and "Jadikan ide": pick up to 10, then one idea each on the next empty days or one carousel idea. The composer opens it as "Pilih dari Galeri". No search: media has no names worth searching.

**19a. Media editor.** Purpose: fix and dress up a photo or video before posting, without leaving the app.
Needs: full screen, phone first; preview on top, one tool row at the bottom: Durasi (video), Potong (plain-language shapes: Kotak 1:1, Feed 4:5, Reels/Story 9:16…, Putar, Cermin, "Pas + latar blur"), Sesuaikan (3 sliders; hue/sepia/black-and-white under "Opsi lanjutan"), Filter (one-tap looks), Teks (fonts, Polos/Kotak/Garis, colours), Stiker (price tag, discount, "Link di bio"…, price from a product link), Logo (workspace logo from Pengaturan → Tanda air), Sampul and Suara (video). Save makes a new copy; the original stays and a re-edit restores every step. Opened from a composer tile ("Edit"), from the composer hints ("Atur potongan", "Potong video") and from Galeri Media.

## D. Product links (Link Produk)

**20. Product links list.** Purpose: all affiliate products in one place.
Needs: cards with product image, title, price, marketplace badge, a copy-link button, clicks this week, "Tampil di Etalase" toggle, search, a big "+ Tambah Produk" button.

**21. Add / edit product link.** Purpose: one paste does everything.
- **Default:** paste a Shopee or TikTok Shop link, title, image and price fill in automatically, choose a category, "show in Etalase" is on by default, save.
- **"Opsi lanjutan":** custom short link name, tags, enable/disable.

**22. Product link stats.** Purpose: is this product working?
Needs: a clicks-over-time chart, which posts and platforms brought clicks, a device and city summary, QR code download, copy link.

## E. Etalase

**23. Etalase editor.** Purpose: build the storefront without design skills.
Needs: a live phone preview, profile (photo, name, bio, social links), product list with drag to reorder, categories, pin, 3 preset themes, the handle (SHORT_DOMAIN/@nama), and buttons to publish, copy the link and download a QR code.

## F. Auto reply (Balas Otomatis, Instagram comment-to-DM)

**24. Auto-reply rules list.** Purpose: manage automation simply.
Needs: rule cards (keyword, which post, which product, on/off toggle, DMs sent), ready-made templates ("Komentar 'mau' → kirim link produk"), a "+ Buat Aturan" button, an empty state that explains the feature with an example.

**25. Auto-reply rule editor.** Purpose: set up a rule in 3 steps.
Steps:
1. Choose the post (or "semua postingan").
2. Keyword(s).
3. Message + product link.

Plus:
- A pre-filled friendly DM template.
- An optional public reply ("Cek DM ya kak!").
- A short note on Instagram limits in plain words ("1 DM per orang, maksimal 7 hari setelah komentar").
- A "Coba" (test) button and an Activate button.

**26. Auto-reply activity.** Purpose: trust and debugging.
Needs: a list of who commented, what they said, and whether a DM was sent (with the reason when skipped, in plain words), plus clicks from those DMs.

## G. Stats

**27. Stats (Statistik).** Purpose: which content brings clicks.
Needs: date range (presets 7 or 30 days), total clicks, top products, top posts by clicks (each with "Jadikan ide lagi"), clicks by platform, simple post performance. No complicated charts. Export is a secondary action.

## H. Settings and billing

**28. Profile settings.** Needs: name, email, password, Google login, language, timezone (auto-detected), email notifications (failed posts, reconnect needed), delete account.

**29. Plan and billing.** Purpose: understand and pay.
Needs: current plan, active-until date, usage bars against limits in plain words, an upgrade button, payment history, a reminder that renewal is manual ("Perpanjang sekarang"), and any unfinished payment to continue.

**30. Checkout.** Needs: plan summary, monthly/yearly choice, total in IDR, payment on the hosted Nexadream checkout page (QRIS, VA, e-wallet, card).

**31. Payment result.** Needs: success, pending (how to pay by VA or QRIS) and failed states, each with a next action.

**32. Notifications.** Purpose: alerts in one place.
Needs: failed posts, reconnect needed, limit reached, payment reminders, mark as read, each with a fix button.

## I. Shared components and states
- Upgrade modal (only when a limit is hit, with a friendly tone)
- Reconnect banner
- Empty states for every list
- Toasts
- Confirm dialog
- Platform badges and status badges (Draf, Terjadwal, Diproses, Terbit, Gagal)
- Tooltip and help ("?") pattern, with an optional 30-second video
- WhatsApp support button
- 404, 500 and maintenance pages

## Design priority
1. **First:** 15 Composer, 10 Onboarding, 3 Public Etalase, 23 Etalase editor, 12 Home, 25 Auto-reply editor, 21 Add product link
2. **Next:** the remaining screens in C–F
3. **Last:** G–H, legal
