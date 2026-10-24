-- Expand: a new column with a default; the previous release ignores it.
ALTER TABLE "workspaces" ADD COLUMN "milestones" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- Backfill: a workspace that already passed a first-time moment must not get its celebration late.
-- The existing value wins on a re-run, so the first timestamp is always kept.
-- Click totals are counted once per workspace and capped at the top threshold, so a huge link_clicks table stays cheap.
WITH "click_counts" AS (
  SELECT w.id, (SELECT count(*) FROM (SELECT 1 FROM "link_clicks" lc WHERE lc.workspace_id = w.id AND NOT lc.is_bot LIMIT 10000) capped) AS n
  FROM "workspaces" w WHERE w.deleted_at IS NULL
)
UPDATE "workspaces" w SET "milestones" = jsonb_strip_nulls(jsonb_build_object(
  'firstAccountConnected', (SELECT to_jsonb(min(sa.created_at)) FROM "social_accounts" sa WHERE sa.workspace_id = w.id),
  'firstPostScheduled', (SELECT to_jsonb(min(pt.created_at)) FROM "post_targets" pt WHERE pt.workspace_id = w.id AND pt.status IN ('scheduled', 'published')),
  'firstPostPublished', (SELECT to_jsonb(min(pt.published_at)) FROM "post_targets" pt WHERE pt.workspace_id = w.id AND pt.status = 'published'),
  'firstClick', (SELECT to_jsonb(min(lc.clicked_at)) FROM "link_clicks" lc WHERE lc.workspace_id = w.id AND NOT lc.is_bot),
  'firstAutoDm', (SELECT to_jsonb(min(de.updated_at)) FROM "dm_events" de WHERE de.workspace_id = w.id AND de.status = 'dm_sent'),
  'etalasePublished', (SELECT to_jsonb(now()) WHERE EXISTS (SELECT 1 FROM "bio_pages" bp WHERE bp.workspace_id = w.id AND bp.published)),
  'upgradePaid', (SELECT to_jsonb(min(p.paid_at)) FROM "payments" p WHERE p.workspace_id = w.id AND p.status = 'paid'),
  'checklistComplete', CASE
    WHEN w.onboarding_completed_at IS NOT NULL THEN to_jsonb(w.onboarding_completed_at)
    WHEN EXISTS (SELECT 1 FROM "social_accounts" sa WHERE sa.workspace_id = w.id AND sa.status = 'active')
      AND EXISTS (SELECT 1 FROM "post_targets" pt WHERE pt.workspace_id = w.id AND pt.status IN ('scheduled', 'published'))
      AND EXISTS (SELECT 1 FROM "bio_pages" bp WHERE bp.workspace_id = w.id AND bp.published)
      AND EXISTS (SELECT 1 FROM "dm_rules" dr WHERE dr.workspace_id = w.id AND dr.active)
    THEN to_jsonb(now())
  END,
  'clicks100', (SELECT to_jsonb(now()) WHERE cc.n >= 100),
  'clicks1000', (SELECT to_jsonb(now()) WHERE cc.n >= 1000),
  'clicks10000', (SELECT to_jsonb(now()) WHERE cc.n >= 10000)
)) || w."milestones" FROM "click_counts" cc WHERE cc.id = w.id;
