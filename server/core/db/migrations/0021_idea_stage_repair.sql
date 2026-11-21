-- Data only (works with the previous and the next release): Terjadwal, Tayang and Gagal now follow the post, so cards
-- that were moved there by hand go back where their post (or their content) says. Each repaired card goes to the top.
UPDATE "content_ideas" ci SET "stage" = (CASE
  WHEN p."status" IN ('scheduled', 'publishing') THEN 'scheduled'
  WHEN p."status" IN ('published', 'partial') THEN 'published'
  WHEN p."status" = 'failed' THEN 'failed'
  ELSE 'drafting'
END)::"idea_stage", "stage_changed_at" = now(), "board_order" = -1024
FROM "posts" p
WHERE ci."post_id" = p."id" AND ci."stage" IS DISTINCT FROM (CASE
  WHEN p."status" IN ('scheduled', 'publishing') THEN 'scheduled'
  WHEN p."status" IN ('published', 'partial') THEN 'published'
  WHEN p."status" = 'failed' THEN 'failed'
  ELSE 'drafting'
END)::"idea_stage";--> statement-breakpoint
UPDATE "content_ideas" SET "stage" = 'drafting', "stage_changed_at" = now(), "board_order" = -1024
WHERE "post_id" IS NULL AND "stage" IN ('scheduled', 'published', 'failed');
