# Platform Constraints — Socialz.id (verified 2026-10-12)

Facts from official docs that shape the design. Re-verify before each milestone, because these APIs change often. Confidence: **H** high, **M** medium, **L** low.

## Instagram (v1)
- **API:** Instagram API with Instagram Login. No Facebook Page needed. Scopes: `instagram_business_basic`, `instagram_business_content_publish`. (H)
- **Formats:** feed image (**JPEG only**), video, carousel (≤10 items, counts as 1 post), Reels, Stories. Shopping tags, filters and Story stickers are not supported. (H)
- **Publish limit:** 50–100 API posts per rolling 24h; plan for 50. Check with `GET /<IG_ID>/content_publishing_limit`. (M)
- **Reels:** 3s–15min, ≤300 MB, MP4/MOV, H.264 or HEVC, 23–60 fps, 9:16 recommended. **Stories video:** 3–60s, ≤100 MB. (H)
- **Caption:** 2,200 chars, **5 hashtags** per feed post or Reel (since 18 Dec 2025, was 30; hashtags in comments count toward the same 5; Stories keep their own allowance), 20 mentions. **Links are not clickable.** Some Meta developer pages still say 30; the Help Center says 5. (H, checked 2026-10-22)
- **Hashtag search** (`ig_hashtag_search`, `top_media` / `recent_media`) exists **only for Instagram API with Facebook Login** and needs the "Instagram Public Content Access" feature (App Review). At most 30 unique hashtags per Instagram account per rolling 7 days; no post counts, only media. We use Instagram Login, so tag research doesn't use it (phase 2: an optional "connect via Facebook" step). (H, checked 2026-10-22)
- **Flow:** create a container from a public media URL → poll `status_code` until `FINISHED` → `media_publish`. (H)
- **Private replies (comment-to-DM):** within **7 days** of the comment, **one message per commenter**, follow-ups only within 24h after the user replies. Needs `instagram_business_manage_comments`, `instagram_business_manage_messages` and the `comments` webhook. (H)
- **Webhook signatures** for Instagram Login use the **Instagram app secret**. (H)
- Docs: https://developers.facebook.com/docs/instagram-platform/content-publishing/ · https://developers.facebook.com/docs/instagram-platform/private-replies

## Threads (v1)
- **Formats:** text, image (JPEG/PNG ≤8 MB), video (≤5 min, ≤1 GB), carousel (2–20). 500 chars, 1 topic tag. (H)
- **Keyword / tag search:** `GET /keyword_search?q=…&search_mode=TAG&search_type=TOP|RECENT` (optional `since`, `until`, `limit`, author filter since Jan 2026). Needs `threads_keyword_search` (App Review); **without it the search silently covers only the user's own posts**. 2,200 queries per user per rolling 24h; empty results don't count. Returns posts, not view counts. (H, checked 2026-10-22)
- **Links:** `link_attachment` only on text posts. **Max 5 unique links per post** (since Dec 2025, error `THREADS_API__LINK_LIMIT_EXCEEDED`). (H)
- **Limits per 24h:** 250 posts, 1,000 replies, 100 deletes. (H)
- **Scopes:** `threads_basic`, `threads_content_publish`, `threads_manage_replies`, `threads_read_replies`, `threads_manage_insights`. Each needs App Review. Long-lived tokens last 60 days and can be refreshed. (H)
- **Insights:** views, likes, replies, reposts, quotes, shares; account clicks per URL; demographics need ≥100 followers. (H)
- Docs: https://developers.facebook.com/docs/threads

## Facebook Pages (v1)
- **API:** Facebook Login for Business with Page tokens. Scopes: `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`. (H)
- Links in posts are clickable. Reels go through `/{page-id}/video_reels`. Use `appsecret_proof`. (H)

## Meta app gate (critical path)
1. **Business Verification** (legal entity documents)
2. **App Review:** one screencast per permission, with an English UI and a test login for the reviewer
3. **Access Verification (Tech Provider):** required for apps serving other businesses with `instagram_*`, `threads_*` or `pages_*` permissions, **not only WhatsApp**. Outside users get **error 100** until it's done. (H)
- Until then, only users with an app role or tester role can connect. Development mode needs no review.
- You also need: privacy policy URL, terms URL, data deletion callback, deauthorize callback.
- Docs: https://developers.facebook.com/docs/development/release/access-verification

## TikTok (later)
- **Content Posting API:** Direct Post (`video.publish`) or Upload to the creator's inbox as a draft. (H)
- **Before audit:** posts are `SELF_ONLY`, at most 5 users per 24h, and the accounts must be private. (H)
- **Caps:** about 15 Direct Posts per creator per 24h, **shared across all apps**; 6 init requests/min per token. (H)
- **Required UX:** query creator info first; disclosure toggles `brand_content_toggle`, `brand_organic_toggle`, `is_aigc`. (H)
- **No API field for product links or TikTok Shop anchors.** (H)
- **TikTok Shop Affiliate APIs** exist through Partner Center; Indonesia coverage is unclear. (L–M)

## YouTube (later)
- **Since Jun 2026:** 100 `videos.insert` calls/day **per Google Cloud project** (shared across all tenants). One upload now costs about 100 units. (H)
- **Private lock for unverified projects:** sources conflict, so test it. Quota increases need an audit. (L)
- Shorts are classified automatically (vertical or square, ≤3 min). YouTube Shopping tags can't be set through the API. (M)

## X (later)
- **Pay-per-use** with prepaid credits: $0.015 per post, **$0.20 per post containing a URL**, $0.005 per post read. The free tier is closed to new signups. (H / M)
- Media upload v2: `initialize` → `append` (≤5 MB chunks) → `finalize` → status poll. (H)

## Affiliate programs (later)
- **Shopee Affiliate Open API:** GraphQL, AppId/Secret with HMAC-SHA256. Offers, `generateShortLink`, conversion reports (~90 days). Access by application. (M)
- **Involve Asia:** publisher API (JWT that lasts 2h, conversions, deeplinks, ~60 req/min). Also covers Lazada. (M)
- **Lazada Affiliate API:** only third-party sources. (L)

## Neon
- **Pooled URL** (PgBouncer transaction mode): no LISTEN/NOTIFY, session advisory locks or prepared statements. The job system (`blueprint/15`) uses none of these. (H)
- **Pooled URL is used by all runtime code** (functions and job runs), which fits serverless: many short-lived instances with small pools. Transactions work in transaction mode. (H)
- **Direct URL:** migrations only, from CI. (H)
- **Scale-to-zero** after 5 min idle drops connections. The per-minute tick queries the DB, so compute stays awake, about $19/mo on the Launch plan, the same as the old polling worker. (H / M)
- `@neondatabase/serverless` (WebSocket `Pool`, transactions supported) is the fallback driver for runtimes without TCP sockets. (M, verify in the M1 spike)

## Serverless hosts and cron (checked 2026-10-15)
The design only needs, from any host: an HTTPS cron that can send a header every minute, a function duration of at least 60 s for `/api/internal/**`, `waitUntil` (optional), and a Singapore region. See `blueprint/19` §4.
- **Vercel Cron:** sends an HTTP `GET` to the production deployment path; with `CRON_SECRET` set it sends `Authorization: Bearer <CRON_SECRET>`; user agent `vercel-cron/1.0`; header `x-vercel-cron-schedule`. (H)
- **Vercel Cron limits:** 100 cron jobs per project on every plan. **Hobby: once per day minimum, invoked anywhere within the hour (±59 min).** Pro / Enterprise: once per minute, invoked within the scheduled minute. Expressions are **UTC only**, no `MON`/`JAN` names, and day-of-month and day-of-week can't both be set. (H)
- **Vercel Cron delivery:** best effort. A run can be **missed** (no log), **delivered twice**, or **overlap** the previous run; failed runs are **not retried**; redirects are not followed; duration limits are the function's. Vercel advises idempotent, reconciliation-based jobs plus a lock. This is why the tick processes everything due and claims with `SKIP LOCKED` + leases. (H)
- **Vercel request body limit** for functions: 4.5 MB. AWS Lambda synchronous payload: 6 MB. Hence the 4 MB request cap (`blueprint/19` §2). (M)
- **Netlify Scheduled Functions:** short execution limit (verify the current value at M1); keep `JOBS_TIME_BUDGET_MS` below it. (L)
- **Cloudflare Workers:** Cron Triggers available; `pg` needs `nodejs_compat` TCP sockets, otherwise the Neon serverless driver. Verify in a spike before use. (M)
- **AWS Lambda:** max 15 min per invocation (also for container images); EventBridge Scheduler supports per-minute rates. (H)

## Payments
- **Socialz.id uses the Nexadream Payment Hub** (hosted checkout, no recurring, no sandbox; callbacks are unsigned, so status is re-read from the hub). See `blueprint/08`.

### Midtrans (reference only, not used)
- **Subscription API:** cards (needs a recurring MID from the bank, activated by Midtrans) and GoPay tokenization. Has retry schedules. (H)
- QRIS and VA are one-time payments only, not recurring. (M)
- **Notification signature:** `SHA512(order_id + status_code + gross_amount + server_key)`. (H)
