# UX audit: seamless, fun, easy

**Date:** 24 October 2026 · **Build audited:** `develop` @ `05d0df3` · **Status:** findings only, nothing implemented.

This audit walks every screen of Socialz.id (public site, creator console `/app`, staff back-office `/admin`) on a phone (Pixel 7, 412 px) and a desktop (1440 px), and asks three questions of each one:

1. **Seamless:** does the creator ever hit a dead end, a surprise, or a wait with no explanation?
2. **Easy:** is the next step obvious to a first-time affiliate creator on a phone, with no docs?
3. **Fun:** does the app *respond* when the creator does something that matters?

Screenshots live in [`screenshots/`](screenshots/) (`public/`, `app/`, `admin/`); the capture manifests are [`MANIFEST-app.md`](screenshots/MANIFEST-app.md) and [`MANIFEST-admin.md`](screenshots/MANIFEST-admin.md). Recommendations reference the code with `file:line` where it helps.

**Priority:** P1 = hurts the newcomer path or trust, do first · P2 = clear friction · P3 = polish.
**Effort:** S ≤ ½ day · M ≈ 1–3 days · L > 3 days.

---

## Contents

1. [The 12 things to do first](#1-the-12-things-to-do-first)
2. [Feedback and delight system](#2-feedback-and-delight-system)
3. [Drag, gestures and direct manipulation](#3-drag-gestures-and-direct-manipulation)
4. [Cross-cutting issues](#4-cross-cutting-issues)
5. [Screen by screen](#5-screen-by-screen)
6. [Roadmap](#6-roadmap)
7. [Method, coverage and caveats](#7-method-coverage-and-caveats)

---

## 1. The 12 things to do first

| # | Finding | Fix | P | Effort |
|---|---|---|---|---|
| 1 | **The first big win is a toast.** Scheduling a post (`app/pages/app/compose.vue:219`) shows a toast and jumps to `/app/posts`. The "first scheduled post in 5 minutes" promise lands with no moment of success. | A **success sheet** after "Jadwalkan" (post preview, "Terbit Sabtu 19.00 · 4 jam lagi", next-step buttons) plus a one-time **confetti burst** for the first post. See [§2.4](#24-milestone-moments). | P1 | M |
| 2 | **The newcomer checklist puts the goal last.** Steps run Hubungkan akun → Buat Etalase → Tambah produk → Jadwalkan postingan (`app/pages/app/index.vue:14-19`). Two optional-feeling steps sit between the creator and the 5-minute promise. When all four are done the card stays, struck through, with one green sentence. | Reorder to **Hubungkan akun → Jadwalkan postingan** (the composer already has "Tambah link produk") **→ Etalase → Balas Otomatis**. On 4/4, play the celebration once, then collapse the card into a small "Panduan selesai 🎉" chip that disappears after a day. | P1 | S |
| 3 | **Empty states are a single grey sentence.** There's no `UEmpty`; every list falls back to a `<p>` (posts, links, media, analytics, calendar, Bank Ide). This breaks SCREENS principle 8 ("every empty state teaches the next step, with a single button"). | One `EmptyState` component: small illustration (reuse the landing art style), one-line why, **one button**. Copy per screen in [§4.3](#43-empty-states). | P1 | M |
| 4 | **Broken images have no fallback.** Product, post, media and Etalase thumbnails show the browser's broken-image icon with alt text spilling over the card (`app-links-phone`, `app-posts-phone`, `app-media-desktop`, `app-bio-desktop`). On phone, a broken product image is a 340 px grey square. The dev media host causes part of this, but a creator will meet it too (expired marketplace images, failed uploads). | `<SmartImage>` with `@error` → a tinted tile showing the marketplace logo or a 🛍 glyph and the first letter of the title. Use compact 64 px thumbnails in phone lists. | P1 | S |
| 5 | **Phone layout breaks on Akun Sosial.** The Instagram row loses its handle, the "Perlu dihubungkan ulang" badge overlaps "Instagram", "Putuskan" drops onto its own line, and the Facebook name truncates to "Toko …" (`app-accounts-phone`). | Two-line row: avatar + name/handle + platform on the left, status chip under the name, actions in a `⋯` menu. "Hubungkan ulang" stays as the single visible button. | P1 | S |
| 6 | **The floating "+" covers content and competes with each page's main action.** It shows on every phone page except the composer (`app/components/CreatorShell.vue:172-179`). It covers the DM textarea in the Balas Otomatis editor, the theme picker in Etalase, and chart labels. On Link Produk it sits under "+ Tambah Produk" but does something else. | Hide it on editor and form pages (bio, link detail, auto-reply editor, settings, billing). Shrink it to an icon pill that tucks away on scroll down. Add `pb-24` to the shell's scroll area so the last card clears it. | P1 | S |
| 7 | **Statuses aren't honest about time.** A post due 16 Oktober still reads "Terjadwal" on 24 Oktober, with "Perlu hubungkan ulang" as a small chip (`app-posts-phone`). Beranda's "Postingan berikutnya" lists it as the *next* post, "8 hari yang lalu" (`app-dashboard-phone-tall`). The real state is "tertunda". | Show an **overdue** state ("Tertunda 8 hari · Hubungkan ulang Instagram supaya terbit") with the fix as a solid button on the card, plus a one-tap "Terbitkan sekarang" once reconnected. | P1 | S |
| 8 | **Work is easy to lose.** There's no unsaved-changes guard anywhere (no `onBeforeRouteLeave` or `beforeunload`), and the composer keeps nothing locally. A caption typed on a phone is gone after a back-swipe, a tap on the "+" or a tab reload. | Autosave the composer to `localStorage` per workspace (restore with "Lanjutkan tulisan tadi?"). Add a leave guard on compose, bio, link detail and the auto-reply editor. | P1 | M |
| 9 | **Reordering and moving things is fiddly on phone.** Etalase uses ▲▼ chevrons (`app/pages/app/bio.vue:476-495`), though SCREENS #23 says "drag to reorder". Calendar drag is desktop-only, because native HTML5 DnD doesn't fire on touch. Media has no drop zone or paste. | Pointer-based drag with a handle, long-press to pick up on phone, and haptic ticks. See [§3](#3-drag-gestures-and-direct-manipulation). | P2 | M |
| 10 | **Dark mode ignores the phone's setting.** `nuxt.config.ts:25` sets `colorMode: { preference: 'light', fallback: 'light' }`, so a phone set to dark still opens white screens (the `-dark` screenshots, which use the system dark preference, match the light ones). Dark mode itself exists: "Mode gelap" in the user menu (`app-user-menu-open-phone`) and the sun icon on auth pages. | Set `preference: 'system'` after a dark pass of every page (CLAUDE.md asks for one anyway). The manual toggle keeps working as an override. | P2 | S–M |
| 11 | **A wrong URL says "Segera hadir".** `/app/does-not-exist` falls into `app/pages/app/[...slug].vue`, a leftover placeholder from early milestones. | Replace with a real not-found ("Halaman ini tidak ada") that suggests the 3 most likely pages. Drop the hammer icon. | P2 | S |
| 12 | **Notifications hide their fix.** Each template has an `actionUrl` (for example `/app/accounts`, `shared/utils/templates.ts:150`), so tapping the card goes to the right place, but the card shows no button, so it reads as information, not a task (SCREENS #32 asks for a fix button). Two identical "Akun turun ke paket Gratis" rows show, and the templates say "Data **Anda**" while the app says "kamu" (`shared/utils/templates.ts:96,150`, 6 occurrences). | Render the action as a visible button per type (Hubungkan ulang, Bayar sekarang, Pilih akun). Collapse duplicates ("2×"). Change the copy to "kamu"; templates are reference data, so this means a migration plus a seed change (CLAUDE.md rule 14). | P2 | S |

---

## 2. Feedback and delight system

### 2.1 What exists today

From the code sweep (`app/**`):

- **Toasts everywhere:** about 97 `toast.add` calls in the creator console. Good coverage, but they're all the same weight: scheduling your first post feels the same as saving a setting.
- **Loading:** about 40 `:loading` buttons and about 29 `USkeleton` blocks. Solid.
- **Confirm dialog:** one shared `ConfirmDialog`, 12 call sites.
- **Motion:** only on the landing page (`.reveal` fade-up and `art-float`, `app/assets/css/main.css:35-76`), with `prefers-reduced-motion` handled correctly. **The app itself has none:** no `<Transition>` or `<TransitionGroup>`, no page transitions, no list animation.
- **Celebration, haptics, sound:** none.
- **Optimistic UI:** only the auto-reply on/off toggle (with rollback) and marking notifications as read.
- **Undo:** none.
- **Silent successes:** Etalase reorder, pin, hide and remove (`bio.vue:132-138`, `522-528`); archiving a link (`links/index.vue:74-77`, which also has no `try/catch`); capturing an idea in Bank Ide (`IdeaBankPanel.vue:24-31`).

The base is sturdy. What's missing is a **graded response**: small things get small feedback, big moments get a big one.

### 2.2 Principles

1. **Proportional.** Feedback strength matches the moment: a press gets a tap, a save gets a check, a milestone gets a celebration. Never confetti for a settings save.
2. **Fast.** Micro feedback under 200 ms, celebrations under 1.2 s. Nothing blocks input or delays navigation.
3. **Once.** Milestones fire once per workspace, recorded server-side next to the existing `profile.onboarding` flags, so a second device doesn't replay them.
4. **Respectful.** `prefers-reduced-motion: reduce` swaps motion for a static badge or a colour flash. Sound stays off. Haptics stay short (≤ 15 ms) and only on Android (`navigator.vibrate`; iOS Safari ignores it, which is fine).
5. **Local voice.** Short, warm, Bahasa: "Mantap!", "Siap tayang!", "Cuan pertama 🎉". Never English slang, never "Anda".
6. **Light.** No heavy animation framework. `@vueuse/core` 14 and `motion-v` are already in `node_modules` through Nuxt UI. Load a confetti library (about 6 KB gz for `canvas-confetti`) lazily, only when a milestone fires.

### 2.3 Building blocks

| Block | Where | Spec |
|---|---|---|
| **Press feedback** | Every `UButton` with `color="primary"` and `variant="solid"`, plus bottom-nav cells | `active:scale-[0.97]` + `transition-transform duration-100` through `app.config.ts` button slots; one global change. Bottom-nav icon does a 1-frame "pop" (`scale 1 → 1.12 → 1`, 180 ms) on activation. |
| **Spark burst** (the "splash sparkle on important clicks") | Jadwalkan, Posting sekarang, the auto-reply toggle turning on, first Etalase publish, Simpan pilihan on upgrade, "Siapkan konten" on a shopping moment | 8–10 small brand-coloured dots and stars from the click point, 450–600 ms, Web Animations API, about 1 KB hand-rolled (no dependency). Fired from a `v-spark` directive so any button can opt in. Reduced motion: a ring pulse on the button instead. |
| **Morphing confirm** | "Salin link", "Salin link Etalase", "Unduh QR", copy buttons everywhere | Label and icon swap to ✓ "Tersalin!" for 1.5 s, button goes `success` color, 10 ms vibrate. Today copy feedback is a toast at the far edge of the screen, away from the thumb. |
| **Check-pop on save** | Simpan buttons (bio, link detail, settings, profile) | After success the button shows ✓ "Tersimpan" for 1.2 s, then returns. Saves a toast for routine saves; keep toasts for errors and anything with a follow-up action. |
| **Optimistic + undo** | Archive link, hide/remove an Etalase item, delete media, cancel a scheduled post, archive an idea, mark all notifications read | Apply instantly and show a toast "Produk diarsipkan · **Urungkan**" (6 s). Replaces confirm dialogs for **reversible** actions. Keep `ConfirmDialog` for irreversible ones (delete a published post, disconnect an account, cancel a subscription). |
| **List motion** | Posts list, links grid, Etalase items, Bank Ide, notifications, media grid | `<TransitionGroup>` with FLIP move (200 ms), fade+slide-in for added rows, collapse for removed rows. Reorder then *shows* the item moving instead of teleporting. |
| **Number tick-up** | Beranda stat cards, Statistik totals, link "klik minggu ini", the Kalender weekly target | Count up from the previous value over 600 ms (`useTransition` from VueUse). A value that went up gets a small ▲ in green. |
| **Progress fill** | Checklist bar, "0/3 terisi minggu ini", storage meter, plan usage meters | Animate width on change (CSS `transition: width 400ms`). On hitting the target: a short glow and the label swaps to "Target minggu ini tercapai 🎯". |
| **Page transition** | Creator console route changes | 120 ms opacity fade via `app.pageTransition` in `nuxt.config.ts`. The View Transitions API (`experimental.viewTransition`) is a progressive extra for calendar Minggu↔Bulan and tab swaps. Never slide whole pages; it feels slow on low-end Android. |
| **Skeleton → content** | Everywhere `USkeleton` is used | Cross-fade (150 ms) instead of the hard swap, so lists don't flash. |
| **Busy labels** | Primary buttons while `loading` | Verb in progress: "Menjadwalkan…", "Menyimpan…", "Mengunggah 42%…". Today the spinner replaces meaning. |
| **Haptics** | Successful schedule, drag pick-up and drop, toggle on, copy | `useVibrate` from VueUse: 10 ms tick for pick-up/copy, `[12, 40, 12]` for success. Off when reduced motion is set. |
| **Sound** | none | Skip. Creators work in public places; unexpected sound reads as a bug. Revisit only as an opt-in setting. |

### 2.4 Milestone moments

Each fires **once per workspace**. Store `milestones: { firstPostScheduled: '2026-…', … }` next to `profile.onboarding` so `useCreatorAuth` already has it.

| Moment | Trigger | What the creator sees | Copy (Bahasa) |
|---|---|---|---|
| **First account connected** | Return from Meta with the first active account | The account card slides into "Akun terhubung" with a spark burst on its avatar; a banner offers the next step | "Instagram tersambung! Sekarang jadwalkan postingan pertamamu." **[Buat postingan]** |
| **First post scheduled** ⭐ | `submit('schedule')` succeeds and `onboarding.postScheduled` was false | **Full success sheet** (bottom sheet on phone, dialog on desktop): confetti burst, a mini preview of the post, a live countdown "Terbit dalam 4 jam 12 menit", and three buttons | "Siap tayang! 🎉 Postinganmu akan terbit **Sabtu, 19.00**." Buttons: **[Pasang Balas Otomatis]** (replaces today's 10 s toast, `compose.vue:139-151`), **[Jadwalkan lagi]**, **[Lihat di Kalender]** |
| **Every later post** | Any successful schedule | Spark burst on the button + a compact sheet or toast with the time and "Lihat di Kalender" | "Terjadwal Sabtu 19.00 ✓" |
| **First post published** | Next app open after the first `post_target` goes `published` | A dismissible card at the top of Beranda with a link to the live post | "Postingan pertamamu sudah tayang di Instagram 🚀 **[Lihat]**" |
| **First click on a product link** | `clicks7d` crosses 0 | Stat card ticks 0 → 1 with a sparkle; Beranda card | "Ada yang klik produkmu! Klik pertama dari Etalase." |
| **First auto DM sent** | `autoReplies7d` crosses 0 | Same pattern on the DM card | "Balas Otomatis bekerja: 1 DM terkirim saat kamu sibuk 💬" |
| **Checklist 4/4** | Last step completes | Confetti once, card collapses to a chip | "Semua langkah beres. Kamu resmi jalan otomatis!" |
| **Weekly target hit** | `n/target` reaches target in Kalender | Ring glow + toast; tracks a **streak** of weeks | "Target minggu ini tercapai 🎯 · 3 minggu berturut-turut" |
| **Etalase published first time** | First save that makes the Etalase live | A share sheet: big QR, "Salin link", **Web Share API** button, and a 3-step "Pasang di bio Instagram" mini-guide | "Etalasemu sudah online! Pasang link ini di bio Instagram." |
| **Upgrade paid** | Billing return with `getStatus` = paid | Confetti, unlocked features listed with ticks, the lock icons in the nav animate open | "Selamat datang di Kreator ✨ Semua fitur sudah terbuka." |
| **Round numbers** | 100 / 1.000 / 10.000 total clicks | Beranda card with a shareable image ("100 klik!") | "100 klik ke produkmu. Lanjutkan!" |

**Implementation sketch** (illustrative, not built):

```ts
// app/composables/useCelebrate.ts
export function useCelebrate() {
  const reduced = usePreferredReducedMotion()
  const { vibrate } = useVibrate({ pattern: [12, 40, 12] })
  async function burst(origin?: { x: number, y: number }) {
    vibrate()
    if (reduced.value === 'reduce') return
    const confetti = (await import('canvas-confetti')).default
    confetti({ particleCount: 70, spread: 70, origin, colors: ['#e6114f', '#f93466', '#ffd166'] })
  }
  return { burst }
}
```

---

## 3. Drag, gestures and direct manipulation

Native HTML5 drag-and-drop (`draggable` + `dragstart`/`drop`) is what the calendar uses today (`CalendarPostChip.vue:13`, `CalendarWeek.vue:22`). **It doesn't fire on touch screens**, which is why the phone agenda has no drag at all, on a product whose users "mostly work from a phone". Use pointer events: `useSortable` from `@vueuse/integrations` (SortableJS, touch-ready), or a small hand-rolled pointer drag for the calendar.

| Interaction | Screen | Behaviour | P | Effort |
|---|---|---|---|---|
| **Drag to reorder products** | Etalase editor (`bio.vue:476-495`) | `⋮⋮` handle; long-press 300 ms on phone to lift (scale 1.03, shadow, 10 ms vibrate), neighbours slide aside, drop saves with ✓ "Urutan disimpan". Keep ▲▼ for keyboard and screen readers. The live preview reorders at the same time. | P2 | M |
| **Move a post on phone** | Kalender agenda (`CalendarAgenda.vue`) | Long-press a post chip → bottom sheet "Pindahkan ke…" with day chips (Hari ini, Besok, Sab 26…) and a time picker. Drag between day sections is a bonus. | P2 | M |
| **Drag ideas onto days** | Kalender, Bank Ide | Already on desktop. Add a drop-target highlight (day column tints primary/10, "Lepas di sini" ghost) and a spring settle on drop. On phone: "Jadwalkan ide ini" sheet, as above. | P3 | S |
| **Drop zone + paste** | Composer media, Galeri Media, Etalase photo | Whole card becomes a drop target while dragging files ("Lepas foto di sini"). **Paste (Ctrl/⌘+V) an image** into the composer. Multiple files at once, each with its own progress ring. | P2 | M |
| **Reorder carousel media** | Composer | Drag thumbnails to set the carousel order; the first one gets a "Sampul" badge. | P3 | M |
| **Swipe actions** | Postingan list, Notifikasi | Swipe left on a card reveals Duplikat / Batalkan (posts) or Tandai dibaca (notifications). Always mirrored in the `⋯` menu. Optional; do it after drag. | P3 | M |
| **Pull to refresh** | Postingan list | Pull down to re-sync statuses (today: a one-off `setTimeout(list.refresh, 10_000)` after sync, `posts/index.vue:65`). Better still: poll every 15 s while any post is `publishing`. | P3 | S |
| **Media editor** | `MediaEditor.vue` (Konva) | Pinch to zoom the crop on phone; snap guides at centre and thirds with a light vibrate on snap. | P3 | M |

Drag feedback contract (use everywhere):

1. **Pick up:** scale 1.03, shadow-lg, 10 ms vibrate, cursor `grabbing`.
2. **Over target:** target tints, a placeholder gap opens.
3. **Invalid target** (a past day): target shakes 2 px, tooltip "Tidak bisa ke tanggal lewat". The check exists at `calendar.vue:103`; only the feedback is missing.
4. **Drop:** spring settle (200 ms), ✓ toast with **Urungkan** for moves.

---

## 4. Cross-cutting issues

### 4.1 Phone shell

- **Bottom nav** = Beranda · Kalender · Link Produk · Etalase · Lainnya (`shared/utils/menus.ts:99-109`). **Postingan** (where failures and statuses live) and **Balas Otomatis** are hidden in "Lainnya". For an affiliate creator, Postingan matters more than Link Produk day to day. Consider: Beranda · Kalender · **[Buat]** (centre, raised, replacing the floating "+") · Postingan · Lainnya. The centre button removes the FAB and its overlap problem (Top 12 #6).
- **Primary actions below the fold.** On the phone composer the order is Posting ke → Caption → Foto → **Opsi lanjutan** → Kapan diposting → Pratinjau (`app-compose-phone-tall`), so "Jadwalkan" sits about 1.5 screens down, after the advanced options. At minimum, move "Kapan diposting?" above "Opsi lanjutan". Make the schedule block a **sticky bottom bar** on phone: suggested time chip + "Jadwalkan" (solid) + `⋯` (Posting sekarang, Simpan draf, Simpan sebagai ide). The same sticky save bar suits the Etalase editor, link detail and the auto-reply editor.
- **One thing, three names.** The plan page is "Upgrade" in the desktop rail, "Langganan" in the user menu (`app-user-menu-open-phone`) and "Paket & Pembayaran" as its title. Pick one label ("Paket") everywhere, and keep "Upgrade" only as a call to action.
- **Header** shows only the logo, the bell and the initials. Page titles scroll away; a compact sticky title would help on long pages.

### 4.2 Images

See Top 12 #4. Also: product cards on phone use a full-width square image (`app-links-phone`), so one product fills the screen. Use a 2-column grid or 72 px-thumbnail rows, and keep the full card for the public Etalase.

### 4.3 Empty states

One component, one button, one picture. Suggested copy:

| Screen | Title | Button |
|---|---|---|
| Postingan · Terjadwal | "Belum ada postingan terjadwal" · "Jadwalkan sekali, terbit sendiri." | **Buat postingan** |
| Postingan · Gagal | "Tidak ada yang gagal. Mantap! ✨" | (none; a happy state) |
| Link Produk | "Tempel link Shopee atau TikTok Shop pertamamu" · "Judul, foto dan harga terisi sendiri." | **Tambah produk** (+ a paste field right in the empty state) |
| Galeri Media | "Galeri masih kosong" · "Foto dan video yang kamu unggah tersimpan di sini." | **Unggah** (+ drop zone) |
| Statistik | A **ghost chart** (grey sample line labelled "contoh") + "Klik akan muncul di sini setelah link-mu dibagikan." | **Salin link Etalase** |
| Bank Ide | "Simpan ide kapan saja" + 3 tappable starter ideas ("Review produk terlaris minggu ini", "Unboxing paket gajian", "Racun 11.11") | (tapping one adds it) |
| Kalender week empty | Day columns show a faint "+ Isi" (already there). Add a single line above: "Minggu ini masih kosong. Mulai dari ide atau momen belanja." | **Siapkan konten** |
| Notifikasi | "Semua beres 🎉 Tidak ada yang perlu kamu urus." | (none) |
| Public Etalase 404 (`/bio/<unknown>`) | "Etalase ini belum ada" | **Buat Etalase-mu sendiri, gratis** → `/app/auth/register` (a growth loop; today it's a dead end, `public-bio-phone`) |

### 4.4 Errors and status language

- **"Terjadi kesalahan. Coba lagi sebentar lagi."** is the login fallback (`auth-login-wrong-password-error-phone`, here triggered by the origin check). Check that real causes map to specific copy: wrong password → "Email atau kata sandi salah"; too many attempts → "Coba lagi dalam 5 menit"; offline → "Kamu sedang offline".
- **The red hashtag rule appears while typing** ("Terlalu banyak tagar: 2, maksimal 1." in `app-compose-caption-desktop`). Make it amber while typing (red only after "Jadwalkan"), and give it a one-tap fix: **[Hapus #afiliasi]**.
- **Formal "Anda"** in the downgrade email and notification templates (`shared/utils/templates.ts:96,150`) and in `server/core/context.ts:72` ("Anda tidak punya akses…"). Everything else says "kamu". Sweep the templates and server error strings.
- **English in the staff UI:** "Payment gateway", "Payment callback", "Impersonate", "Test environment", "Superadmin". That's acceptable for staff, but CLAUDE.md rule 13 says users read Bahasa; decide and be consistent.

### 4.5 Dark mode

See Top 12 #10. The manual "Mode gelap" toggle works today. After switching the default to `system`, check the Etalase themes, the landing art (`main.css:88-94` already has dark art tokens), chart colours, and the amber warning cards, which have low contrast on dark.

### 4.6 Speed you can feel

- First load through the tunnel took ~25 s before anything was visible (dev server + Vite modules over the tunnel; ~3 s on localhost). That's not production, but it means **nothing tells the user the app is loading**: the screen is blank white. Add an inline HTML/CSS splash in `app.vue` (logo + subtle pulse) that renders before hydration.
- Landing on phone took 8–12 s to settle in dev. Re-measure on a production build; if heavy, lazy-load the below-fold art.

---

## 5. Screen by screen

### 5.1 Public

**Landing** (`public-landing-desktop`, `public-landing-phone`). Strong: beginner framing, pain-point cards, 3 steps, pricing, FAQ, contact form.
- P3 · The hero phone mock is static. Animate one loop: a comment "mau kak" arrives → a DM bubble pops in with the product link → "+1 klik". This shows Balas Otomatis in 3 seconds without words.
- P3 · "Coba gratis" CTA: add the spark burst and an arrow nudge on hover/focus.
- P3 · No social proof section yet (SCREENS #1 lists testimonials). Even "Dipakai 120+ kreator pemula" helps once true.

**Harga** (`public-harga-phone`).
- P2 · Show the yearly plan as a monthly figure ("Rp 40.833/bulan, dibayar tahunan") and animate the price swap on the toggle (number roll, 250 ms).
- P3 · Add the FAQ (SCREENS #2) and a 3-row comparison ("Cocok kalau kamu…").
- P3 · On phone the Kreator card sits below Gratis. Put the recommended plan first, or open the page scrolled to it.

**Daftar / Masuk / Lupa kata sandi** (`auth-*`).
- P2 · Add a show/hide toggle on the password field (phones mistype).
- P2 · Register: inline checks as you type (email shape, password ≥ 8 with a small meter), and the terms checkbox could be replaced by "Dengan mendaftar kamu setuju…" under the button (one less tap).
- P2 · After "Buat akun": a short welcome sheet ("Halo Kreator! 3 langkah lagi") rather than landing cold on Beranda.
- P3 · The auth cards are plain white. Reuse one small landing illustration to keep the brand feeling.

**Etalase publik** (`/bio/<handle>`). The not-found page is a dead end (§4.3). The demo Etalase with data is captured in the editor preview (`app-bio-desktop`).
- P2 · "Beli" tap: a quick press state and a "Membuka Shopee…" hint, because the outbound redirect can take a second on mobile data.
- P3 · Product cards: lazy images with a blur-up placeholder; "Terlaris" badge already exists, keep it.

### 5.2 Creator console

**Beranda** (`app-dashboard-phone`, `app-dashboard-desktop`).
- P1 · Checklist order and completion (Top 12 #2).
- P1 · "Postingan berikutnya" shows an overdue post ("8 hari yang lalu") as the next one (Top 12 #7). Split it: overdue posts go in the problem area with a fix button; "berikutnya" only lists future posts.
- P3 · "Minggu ini" repeats the Kalender's weekly target and shopping moment. That's good for discovery, but give it the same animated fill (§2.3) so both places feel alive.
- P2 · The stat cards say "0 klik link minggu ini" in large type. A zero should encourage: "Belum ada klik. Bagikan link Etalase-mu → [Salin]".
- P2 · The reconnect alert ("1 akun perlu dihubungkan ulang") uses an outline amber button. Make it solid; it's the most important action on the page.
- P3 · On desktop the content is a narrow 3xl column with empty space on both sides. Use 2 columns (Panduan/Postingan berikutnya left, stats/tip right).

**Buat Postingan** (`app-compose-phone`, `app-compose-desktop`, `app-compose-caption-desktop`).
- P1 · Success sheet and first-post celebration (Top 12 #1, §2.4).
- P1 · Autosave and a leave guard (Top 12 #8).
- P1 · Sticky "Jadwalkan" bar on phone (§4.1).
- P2 · **Time as chips, not a date input.** Above the native date/time fields: "Nanti malam 19.00" (the existing `suggestedSlot`, `utils/schedule.ts:21-27`), "Besok siang 12.00", "Sabtu 19.00", "Pilih sendiri…". One tap, no keyboard.
- P2 · **Hidden accounts.** Only Threads is offered because Instagram needs reconnecting. Show it greyed out with "Hubungkan ulang" inline instead of hiding it; otherwise the creator wonders where Instagram went.
- P2 · **The "Tambah link produk" picker only lists saved products** (`app-compose-link-picker-phone`). A creator holding a fresh Shopee link has to leave the composer, add it in Link Produk, and come back. Put a "Tempel link baru…" field at the top of the picker that creates the product in place.
- P2 · **Raw links.** A pasted marketplace URL (`https://…`) should offer "Jadikan link produk? Kliknya tercatat" (SCREENS principle 4: automatic short links).
- P2 · **Preview** is a plain text box. Render a platform-faithful mock (avatar, handle, image crop at the real ratio, "…lainnya" truncation at the real caption cutoff) so the creator sees what followers will see.
- P3 · "Saran tagar" before any caption only says "Tulis caption dulu" (`app-compose-hashtag-suggest-phone`). Seed it from the workspace niche (Pengaturan already stores it) so the sheet is useful from the first tap; animate chips in as the caption grows.
- P3 · Character counter: a small ring that fills and turns amber at 90%.
- P3 · Caption templates (SCREENS principle 9) as chips under the textarea: "Diskon", "Review", "Unboxing".

**Kalender** (`app-calendar-desktop`, `app-calendar-phone`).
- P2 · Phone move (§3) and drop feedback on desktop.
- P2 · "0/3 terisi minggu ini": animated fill, celebration and streak at target (§2.4).
- P2 · **"Ide baru" is a 6-field form for "one sentence"** (`app-calendar-new-idea-phone`): Ide, Catatan, Rencana tanggal (native dd/mm/yyyy), Jenis konten, Produk, Foto, plus two solid buttons ("Jadikan postingan" inside the body and "Simpan" in the footer). Keep only the idea field and date chips (Tanpa tanggal · Besok · Sabtu · Pilih…); put the rest behind "Opsi lanjutan"; make "Simpan" the only primary, with "Jadikan postingan" as a secondary.
- P3 · Month view: show dots or thumbnails for busy days and a "hari ini" pulse.
- P3 · Shopping moments ("Gajian", "Promo 11.11") are a great hook. Add a countdown chip ("18 hari lagi") with a gentle pulse when ≤ 3 days.

**Postingan** (`app-posts-phone`) and **Detail postingan** (`app-post-detail-desktop`).
- P1 · Overdue status (Top 12 #7).
- P2 · Live status: when a post is `publishing`, show an animated progress line on the card and poll; flip to "Terbit ✓" with a check-pop when done.
- P2 · Detail: "Batalkan" and "Hapus" are both red text side by side. Batalkan (reversible, back to draft) should be neutral with an undo toast; keep Hapus red with a confirm.
- P3 · Tab counts in the segmented control ("Terjadwal 3 · Gagal 1").

**Galeri Media** (`app-media-desktop`).
- P2 · Drop zone + paste + multi-upload progress (§3).
- P2 · Broken thumbnails (Top 12 #4).
- P3 · Long-press (phone) or checkbox-on-hover (desktop) for multi-select → "Pakai di postingan" / "Hapus".
- P3 · The `⋮` button on every tile adds noise. Show it on hover (desktop); on phone, tap the tile to open a sheet.

**Link Produk** (`app-links-phone`) and **Statistik produk** (`app-link-detail-phone`).
- P1 · Compact phone cards and image fallback (§4.2).
- P2 · "Salin link" morph-confirm (§2.3). It's probably the most pressed button in the app.
- Works well: "Tambah produk" is a one-field slide-over with the paste field focused (`app-links-add-dialog-desktop`).
- P2 · Add a **"Tempel" button** inside that field that reads the clipboard (`navigator.clipboard.readText()`, behind the browser's permission prompt). On a phone, the creator copies the link in the Shopee app, opens Socialz and taps once: no long-press, no keyboard. Then show a shimmer card while the title and photo load, and a spark burst when the product appears.
- P2 · Paste-to-add: a paste field at the top of the list ("Tempel link produk…") that creates the product in place with a shimmer while the title and photo are fetched, instead of a dialog.
- P2 · Price field uses a −/+ stepper (`Harga (Rp)`, 159.000). A stepper makes no sense for money; use a plain numeric input with an `Rp` prefix and thousand separators.
- P3 · Archive (`links/index.vue:74-77`): no toast, no error handling. Add optimistic archive with "Urungkan".

**Etalase editor** (`app-bio-desktop`, `app-bio-phone`).
- P2 · Drag to reorder with a synchronized preview (§3).
- P2 · On phone the preview is a "Pratinjau" button at the very bottom of the page, after every product (`app-bio-phone-tall`). Make it a sticky pill that opens the preview in a bottom sheet, and animate the preview when a field changes (a brief highlight on the changed part).
- P2 · Each product row shows a Label input and a Kategori select inline (`app-bio-phone-tall`), so six products make a very long form. Show a clean row (thumb, title, price, chips) and edit label and category in a bottom sheet on tap.
- P2 · Theme swatches: tapping one should morph the preview colours (200 ms cross-fade) and fire a light spark. It's the most "fun" control on the page; make it feel that way.
- P2 · Remove item (`bio.vue:528`): "Hapus" in the item menu (`app-bio-item-menu-phone`) acts immediately, with no confirm and no undo. Add an Urungkan toast.
- P3 · The top row (Salin link, Unduh QR, Sembunyikan) takes three buttons before any content on phone. Group them as a "Bagikan" button + `⋯`.

**Balas Otomatis** (`app-auto-reply-desktop`, `app-auto-reply-new-phone`).
- Works well: numbered steps, comment-reply variations "so it doesn't look like spam", a **Coba** test button, the Instagram rules note, and a clear "Aktifkan" primary (`app-auto-reply-new-phone-tall`).
- P2 · Add a **live chat preview**: a comment bubble ("mau kak 😍") → the DM reply rendered with the real product card. `{nama}` and `{link}` should render as chips, not raw braces.
- P2 · Turning a rule on: spark burst on the toggle + the toast "Aktif! Komen 'mau' akan dibalas DM otomatis."
- P3 · The list card shows "2 DM terkirim · 0 minggu ini". Add a tiny 7-day sparkline and tick-up.
- P3 · The starter template chips are excellent; give them illustrations and a "Paling populer" badge on "mau".

**Akun Sosial** (`app-accounts-phone`) and the **downgrade gate** (`app-downgrade-gate-phone`).
- P1 · Row layout (Top 12 #5).
- P2 · Downgrade gate: it blocks every route (any `/app/*` redirects to `/app/accounts`) and preselects only 1 of 2 allowed slots. Preselect up to the limit using the accounts with the most scheduled posts or active rules. Show that per row ("3 postingan terjadwal · 1 aturan aktif") so the choice is informed. Let the creator browse read-only with a sticky banner instead of a hard modal. On open, the focus ring lands on the secondary "Upgrade" button; focus the primary.
- P3 · "Hubungkan Instagram": after returning from Meta, the account should animate into the list (§2.4 first account).

**Statistik** (`app-analytics-phone`).
- P2 · Ghost chart and a CTA when empty (§4.3).
- P3 · Animate bars on range change; a tooltip on tap (phone) per day.

**Paket & Pembayaran** (`app-billing-desktop`).
- P2 · Show **usage meters** for the current plan (for example "postingan 2/20 · akun 2/2 · DM 0/100") like the staff workspace view already does (`admin-workspaces-detail-desktop`). This makes the upgrade reason obvious at the moment of need.
- P2 · **Explain the current plan.** The page says "Paket kamu: Gratis" right above two paid "Kreator · Bulanan · Lunas" rows (`app-billing-phone-tall`); the reason (renewal not paid by 21 Oktober → turned to Gratis on 22 Oktober) only appears in Notifikasi. Show a one-line history on the plan card ("Turun ke Gratis 22 Okt karena perpanjangan belum dibayar") with **[Aktifkan lagi Kreator]**. Since renewal is a manual checkout (no auto-debit), a renewal countdown on Beranda ("Kreator berakhir 3 hari lagi · Perpanjang") does more than emails.
- P2 · After a successful payment: celebration and unlocked features (§2.4).
- P3 · The current-plan card is a lot of white space; fold it into a compact header.

**Tim** (`app-team-desktop`). The locked state is clear. P3 · Show what a teammate could do (an "Editor bisa menjadwalkan, tidak bisa membayar" preview) to make the upsell concrete.

**Notifikasi** (`app-notifications-phone`). Top 12 #12. Also P3 · group by "Hari ini / Minggu ini", and animate read state (dot shrinks away).

**Bantuan** (`app-help-phone`). P2 · The "Mulai dalam 5 menit" steps are text. Make each step a button that opens the screen ("Buka Akun Sosial →") and ticks itself off from `profile.onboarding`. P3 · The WhatsApp support button (`help.vue:12,59`) only shows when the admin setting "WhatsApp dukungan" is filled; it's empty in dev. Fill it before launch, since a beginner in trouble wants a human.

**Pengaturan / Profil / Ubah kata sandi** (`app-settings-*`, `app-profile-*`, `app-change-password-*`). Plain forms; fine. P3 · Check-pop save (§2.3) and a leave guard.

**404** (`app-does-not-exist-phone`). Top 12 #11.

### 5.3 Staff back-office

Staff aren't the delight audience; the goal is **fast and unambiguous**.

- P2 · **Health card contradicts itself** (`admin-dashboard-desktop`): "Sehat" next to "Media processor 11843 menit lalu". Turn the processor line amber/red past a threshold and show human time ("8 hari lalu"). "0 terbit · 0 gagal (100%)" should read "—" when there's nothing to rate.
- P2 · **Postingan gagal** (`admin-publish-failures-desktop`): "Coba lagi" is the primary button even for `auth` failures, which a retry can't fix. For auth: primary = "Kirim pengingat hubungkan ulang", retry disabled with a tooltip. Map the raw `auth` code chip to a label.
- P2 · **Tables on phone** (`admin-users-phone`) cut off columns ("Pe…"). Use card rows under `sm`.
- P3 · The workspace detail header puts Impersonate, Ubah paket, Tangguhkan and Hapus side by side (`admin-workspaces-detail-desktop`). Move Tangguhkan and Hapus into a "Bahaya" `⋯` menu.
- P3 · The sidebar collapse state persists in a cookie (later screenshots stay collapsed). Icons need tooltips when collapsed.
- P3 · Dark mode (forced light, §4.5).

---

## 6. Roadmap

**Week 1: quick wins (all S)**
1. Image fallback component (Top 12 #4).
2. Akun Sosial row layout; FAB hidden on forms + bottom padding (#5, #6).
3. Overdue post status with a solid fix button (#7).
4. Real 404 (#11); notification action buttons, dedupe, "kamu" copy (#12).
5. Checklist reorder + collapse on completion (#2).
6. Press feedback on buttons (one `app.config.ts` change); copy-button morph; check-pop on save.
7. Busy-verb labels on primary buttons.

**Weeks 2–3: the delight layer (M)**
1. `useCelebrate()` + milestone flags; first-post success sheet; checklist and first-click moments (#1).
2. `v-spark` directive on the important buttons.
3. Composer autosave + leave guards (#8); sticky schedule bar on phone; time chips.
4. Empty-state component across all lists (#3).
5. `<TransitionGroup>` on lists; page fade; skeleton cross-fade; number tick-up.
6. Optimistic actions with Urungkan for reversible actions.

**Weeks 3–5: direct manipulation (M–L)**
1. Pointer drag: Etalase reorder with synced preview; phone "Pindahkan ke…" in the calendar; drop feedback (#9).
2. Media drop zone, paste and multi-upload.
3. Platform-faithful composer preview; live chat preview in Balas Otomatis.
4. Dark mode on (`system`) after a full pass (#10).
5. Bottom nav rework with a centre "Buat" button.

**Guardrails for every item:** reduced-motion fallback; no new step on the newcomer path (CLAUDE.md rule 1); Bahasa copy through i18n; check phone, tablet, desktop and dark; keep animation code client-only (no server or runtime impact, so the serverless contract is unaffected).

---

## 7. Method, coverage and caveats

**How screenshots were taken.** Playwright (Chromium) against the local dev server through its Cloudflare tunnel (`https://socialz.fajrsyauqi.com`), because the CSRF origin check (`server/middleware/origin-check.ts`) only accepts the configured site origin. Phone = Pixel 7 emulation, desktop = 1440×900, locale `id-ID`, time zone Asia/Jakarta. Logins: `demo@socialz.local` (creator) and `admin@socialz.local` (staff). Navigation was read-only: dialogs were opened and cancelled, nothing was scheduled, published, paid or deleted.

**One data change was made, with approval.** The demo workspace had 3 accounts on a 2-account plan, so every `/app` route was locked behind the downgrade dialog. As approved, Instagram and Threads were kept active and the Facebook Page "Toko Kreator Demo" was deactivated (not deleted; it returns on upgrade).

**Coverage.**

| Area | Screens | Files |
|---|---|---|
| Public + auth | Landing, Harga, Privasi, Syarat, Penghapusan data, Hapus akun, Bantuan page, Kebijakan pembayaran, Masuk, Daftar, Lupa kata sandi, Etalase 404 | `screenshots/public/` |
| Creator console | Every `/app` page except `accounts/pick` (needs a live Meta connect), incl. post, link and rule details, 404 and the downgrade gate, plus interactive states where captured | `screenshots/app/` |
| Staff back-office | Every `/admin` route in the menu incl. workspace and page details, plus nav, search, pagination and row-menu states | `screenshots/admin/` |

**Caveats.**
- **Phone screenshots of the console show the first screen only**, because the creator shell scrolls inside an inner container, so `fullPage` stops at the viewport. Files ending `-phone-tall.jpg` (where present) use a 2600 px tall viewport to show whole pages.
- **The Nuxt DevTools pill** (bottom centre, "… ms") is dev-only and covers the middle bottom-nav cell (Link Produk) in phone shots. Ignore it.
- **Broken images** are partly the dev media host (`socialz-media.fajrsyauqi.com`). The *missing fallback* is real either way; re-check the rest on staging.
- **Dark-mode screenshots look identical to light** because `colorMode` is forced to light; that is finding #10, not a capture error.
- **The public Etalase with real products** was reviewed through the editor's live preview; the capture of `/bio/kreator.demo` itself depends on the dev media host.
- **Staff "create plan" dialog** didn't open in the capture (the shot shows the plans list); the plans page itself was reviewed.
