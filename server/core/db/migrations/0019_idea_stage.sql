CREATE TYPE "public"."idea_stage" AS ENUM('raw', 'drafting', 'scheduled', 'published', 'failed');--> statement-breakpoint
ALTER TABLE "content_ideas" ADD COLUMN "stage" "idea_stage" DEFAULT 'raw' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_ideas" ADD COLUMN "stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "content_ideas" ADD COLUMN "board_order" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "content_ideas_workspace_id_stage_board_order_index" ON "content_ideas" USING btree ("workspace_id","stage","board_order");--> statement-breakpoint
-- Backfill (expand-only): stage follows the linked post, else drafting when the idea has any detail, else raw.
UPDATE "content_ideas" ci SET "stage" = (CASE
  WHEN p."status" IN ('scheduled', 'publishing') THEN 'scheduled'
  WHEN p."status" IN ('published', 'partial') THEN 'published'
  WHEN p."status" = 'failed' THEN 'failed'
  ELSE 'drafting'
END)::"idea_stage"
FROM "posts" p WHERE ci."post_id" = p."id";--> statement-breakpoint
UPDATE "content_ideas" ci SET "stage" = 'drafting'
WHERE ci."post_id" IS NULL AND (
  NULLIF(btrim(ci."note"), '') IS NOT NULL OR ci."pillar" IS NOT NULL OR ci."planned_on" IS NOT NULL OR ci."moment_id" IS NOT NULL
  OR EXISTS (SELECT 1 FROM "content_idea_links" l WHERE l."idea_id" = ci."id")
  OR EXISTS (SELECT 1 FROM "content_idea_media" m WHERE m."idea_id" = ci."id")
);--> statement-breakpoint
UPDATE "content_ideas" ci SET "board_order" = r.rn * 1024
FROM (SELECT "id", row_number() OVER (PARTITION BY "workspace_id", "stage" ORDER BY "stage_changed_at" DESC, "id" DESC) AS rn FROM "content_ideas") r
WHERE ci."id" = r."id";
