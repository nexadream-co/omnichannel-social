# 14 — Landing Site & Public Surface

Socialz.id has two public surfaces:
- **`socialz.id`**: the marketing site, CMS/legal pages, and the contact form.
- **`{{SHORT_DOMAIN}}`**: short link redirects (`/{slug}`) and public Etalase pages (`/@{handle}`). These pages are what creators' followers see, so they are the most performance-sensitive pages in the product.

## 1. Pages

| Route | Rendering | Content source |
|---|---|---|
| `/` | SSR, indexable, layout `public.vue` | `GET /api/public/landing` (plans, FAQ, company, `registrationOpen`) |
| `/harga` | SSR | same endpoint (pricing section as its own page, for ads and links) |
| `/page/:slug` | SSR | `GET /api/public/pages/:slug` (published `pages` row) |
| `/privacy`, `/terms` | SSR | the `pages` rows with those slugs |
| `/hapus-akun` | SSR | `GET /api/public/site` privacy commitments: how to delete a Socialz.id account |
| `/legal/data-deletion?code=` | SSR, noindex | Meta data deletion status page: shows the confirmation code and status from `data_deletion_requests` |
| `{{SHORT_DOMAIN}}/@{handle}` → `/bio/[handle]` | SSR, layout `bio.vue` | public Etalase (§4) |
| `{{SHORT_DOMAIN}}/{slug}` → `/r/[slug]` | server route | short link redirect (§5) |
| `[...slug].vue` | catch-all | 404 page; on the short domain, a friendly "Link tidak ditemukan" |

Nothing about pricing, plan limits, FAQ or legal copy is hard-coded in pages. It all comes from the DB and is editable in `/admin`. The privacy policy, terms and data deletion pages are **required by Meta App Review**, so they must exist (seeded) before the first review submission.

The landing is Bahasa by default with an English version under `/en/` (`prefix_except_default`). Etalase pages are always in the creator's chosen language (Bahasa default), never prefixed.

## 2. Landing page structure

Sections, each with an anchor id used by the header nav (`scroll-mt-*` so the sticky header doesn't cover headings). Copy is written for **beginners**: plain words, no jargon.

1. **Hero** (`#beranda`): headline ("Jadwalkan konten, kumpulkan link produk, balas komentar otomatis"), `company.tagline`, primary CTA "Coba gratis" → `/app/auth/register` (hidden or replaced when `registrationOpen` is false), secondary CTA "Masuk", phone mockup of the composer and an Etalase.
2. **Features** (`#fitur`): three cards (Jadwalkan Postingan, Link Produk & Etalase, Balas Otomatis) with visuals.
3. **How it works** (`#cara-kerja`): three steps a beginner understands (Hubungkan Instagram → Tempel link produk → Jadwalkan).
4. **Supported platforms**: Instagram, Threads, Facebook; TikTok, YouTube, X shown as "Segera hadir".
5. **Pricing** (`#harga`): one card per active + public plan, monthly/yearly toggle (yearly shows the saving), limits via `formatLimit` and features via `FEATURE_META` labels, trial days on the trial plan, "Mulai gratis, tanpa kartu" message. Prices formatted `Rp 49.000`.
6. **Testimonials** (optional, hidden when empty).
7. **FAQ** (`#faq`): active FAQ rows ordered.
8. **Contact** (`#kontak`): company email, WhatsApp, and the contact form.
9. **Final CTA** band, then the shared **footer** (company identity, social icons only when set, links to legal pages and `/hapus-akun`).

Motion: a reveal-on-scroll directive (500 ms ease-out) with two safety guards: the hidden state applies only once a runtime class is set on `<html>` (content never stays hidden if JS fails), and only under `prefers-reduced-motion: no-preference`. The directive's plugin must be **universal** (SSR needs `getSSRProps` returning `{}`), not `.client`.

## 3. Public endpoints

```
GET  /api/public/landing       → { plans[], faqs[], company{…}, registrationOpen }
GET  /api/public/site          → { company{name, tagline, email, whatsapp, address, socials…},
                                   privacy{contactEmail, deleteRequestSlaDays, auditRetentionDays,
                                           backupRetentionDays, financialRetentionYears} }
GET  /api/public/pages/:slug   → published page (404 otherwise)
GET  /api/public/bio/:handle   → published Etalase payload (used by the SSR page; 404 if unpublished or workspace not active)
POST /api/contact              → contact form
```

`/api/public/site` is deliberately smaller than `/landing`, because every public page footer fetches it. `getAllSettings()` is cached, so these reads are cheap.

### Contact form — `POST /api/contact`

```ts
z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter'),
  email: z.email('Email tidak valid'),
  phone: z.string().optional(),
  subject: z.string().optional(),
  message: z.string().min(10, 'Pesan minimal 10 karakter'),
  website: z.string().max(0).optional()   // honeypot: bots fill it, humans never see it
})
```

1. Rate limit per IP: setting `app.contactRateLimitPerHour` per hour.
2. Store `contact_messages` (email lowercased, phone normalized, IP).
3. Email `contact_enquiry` to `company.email` (if set).
4. `notifyStaff('messages.read', { templateKey: 'admin_new_message' })`: bell only.
5. Staff handle it at `/admin/messages`.

## 4. Public Etalase — `{{SHORT_DOMAIN}}/@{handle}`

The Etalase is the creator's storefront: avatar, name, bio, social icons, product cards (image, title, price, marketplace badge, "Beli" button), category tabs, search, pinned products.

Rules:
- **SSR, fast, phone-first.** Target: largest contentful paint under 1.5 s on a mid-range Android phone on 4G. No client-side data fetch for the first render; images lazy-loaded with fixed aspect ratios (no layout shift); minimal JS (category tabs and search are the only interactive parts).
- **Caching:** the rendered page is cached for 60 s (`routeRules` `swr: 60` on `/bio/**`) and the payload is invalidated on publish from the editor. A creator who presses "Terbitkan" sees the change within seconds (explicit purge of the cache key on publish).
- **Visibility:** only `bio_pages.published = true` and workspace `status = 'active'` render. A suspended or deleted workspace shows the generic "Etalase tidak tersedia" page (no detail).
- **Text only.** Creator-supplied fields render as plain text, never HTML. **Strict CSP** on `/bio/**`: `default-src 'self'; img-src 'self' https://{{MEDIA_DOMAIN}} data:; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'`.
- **Every product button goes through a short link** (`short_links.source = 'bio'`), so Etalase clicks are tracked. Buttons are plain `<a href="https://{{SHORT_DOMAIN}}/{slug}" rel="nofollow noopener">`.
- **Branding footer:** "dibuat dengan Socialz.id" (linking to the landing with a referral parameter) is shown unless the workspace's plan has feature `removeBranding`. Reading the feature goes through the entitlements module; when a plan downgrades, the footer simply reappears (degrade silently).
- **SEO:** `useSeoMeta` with the creator's name, bio and avatar as OG image; indexable unless the creator turns off "Tampilkan di mesin pencari" (adds `noindex`).
- **Handles** are `citext` unique, 3–30 chars `[a-z0-9._]`, with a reserved list (`app`, `admin`, `api`, `r`, `bio`, `socialz`, `help`, `bantuan`, legal words, platform names).

## 5. Short link redirect — `{{SHORT_DOMAIN}}/{slug}`

Implemented in `server/routes/r/[slug].get.ts`. Full design in `../ARCHITECTURE.md` §10. Summary:

1. Resolve the slug through the per-instance cache (30 s TTL, best effort, `01` §7); on a miss, one indexed query.
2. Unknown or disabled slug → the friendly 404 ("Link tidak ditemukan"), with a link to the creator's Etalase when the slug belonged to one.
3. Respond **302** to the full original destination with `Cache-Control: no-store`. No framing, no cloaking, no interstitial.
4. Record the click asynchronously (geo from Cloudflare headers, device, in-app browser, referrer, bot flag, `ip_hash`). Bots and prefetches are redirected but flagged and excluded from stats.
5. Destinations are restricted to the affiliate-domain allowlist (setting `channels.links.affiliateAllowlist`) for plans without the `anyDestination` feature (while `channels.links.freePlanAllowlistOnly` is on); all destinations are checked when saved, never at redirect time.

## 6. SEO

- `useSeoMeta` per page (title, description, OG tags); `htmlAttrs.lang` set from the active locale; `hreflang` alternates for `id` and `en` on the landing.
- Landing emits JSON-LD (`Organization` and `SoftwareApplication`).
- `server/routes/robots.txt.ts`, which answers per host:

  ```
  # socialz.id
  User-agent: *
  Allow: /
  Disallow: /app/
  Disallow: /admin/
  Disallow: /api/
  Disallow: /r/
  Disallow: /legal/data-deletion
  Sitemap: https://socialz.id/sitemap.xml

  # {{SHORT_DOMAIN}}
  User-agent: *
  Allow: /@
  Disallow: /
  ```

- `server/routes/sitemap.xml.ts` (main domain only): `/`, `/harga`, `/hapus-akun`, and every published `pages` row (`/privacy` and `/terms` mapped to their short routes, others at `/page/:slug`), with `lastmod` from `updatedAt`. Etalase pages are not listed in the main sitemap.
- Favicons and touch icons in `public/`.

## 7. CMS content seeded at install

| Page slug | Purpose |
|---|---|
| `privacy` | privacy policy: personal data, data received from Meta (what, why, retention), click data (hashed IPs), rights, contact |
| `terms` | terms of service: subscription, trial, renewal, cancellation, refunds, acceptable use (no spam, no prohibited products, platform rules) |
| `kebijakan-pembayaran` | how payments, manual renewals and refunds work |
| `bantuan` | getting-started guide (connect Instagram, create Etalase, first post) |

Plus a starter FAQ set: Apa itu Socialz.id? · Apakah gratis? · Akun Instagram apa yang didukung? · Kenapa link di caption Instagram tidak bisa diklik? · Bagaimana cara bayar? · Bagaimana cara berhenti langganan? · Apakah data saya aman? · Bagaimana cara menghubungi tim? All editable at `/admin/pages` and `/admin/faq`.
