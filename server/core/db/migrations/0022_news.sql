CREATE TYPE "public"."news_region" AS ENUM('id', 'world');--> statement-breakpoint
CREATE TABLE "news_items" (
	"id" text PRIMARY KEY NOT NULL,
	"region" "news_region" NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"source" text,
	"url" text NOT NULL,
	"published_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_count" integer DEFAULT 1 NOT NULL,
	"last_rank" integer NOT NULL,
	"best_rank" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "news_items_region_external_id_index" ON "news_items" USING btree ("region","external_id");--> statement-breakpoint
CREATE INDEX "news_items_region_last_seen_at_index" ON "news_items" USING btree ("region","last_seen_at");--> statement-breakpoint
CREATE INDEX "news_items_region_first_seen_at_index" ON "news_items" USING btree ("region","first_seen_at");--> statement-breakpoint
-- Reference data (also in scripts/seed.ts): the hourly read and its kill switch. Inserts never overwrite admin edits.
-- last_slot = now(): the first read waits for the next real slot.
INSERT INTO "job_schedules" ("name", "cron", "tz", "enabled", "last_slot")
VALUES ('news.refresh', '7 * * * *', 'Asia/Jakarta', true, now())
ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
INSERT INTO "app_settings" ("key", "value", "group", "type", "label")
VALUES ('app.news.enabled', 'true', 'app', 'boolean', 'Kartu "Lagi rame" di Beranda')
ON CONFLICT ("key") DO NOTHING;
