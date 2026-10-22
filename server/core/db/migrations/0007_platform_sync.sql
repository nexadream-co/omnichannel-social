-- After publishing, the platform is the source of truth: syncs keep the caption as the platform has it, mark posts
-- deleted there and log what changed. Expand-only: older releases ignore the new columns and table.
CREATE TYPE "public"."post_target_change_kind" AS ENUM('caption_changed', 'removed', 'restored');--> statement-breakpoint
CREATE TABLE "post_target_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"post_target_id" text NOT NULL,
	"kind" "post_target_change_kind" NOT NULL,
	"before" text,
	"after" text,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_targets" ADD COLUMN "platform_caption" text;--> statement-breakpoint
ALTER TABLE "post_targets" ADD COLUMN "synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "post_targets" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "post_target_changes" ADD CONSTRAINT "post_target_changes_workspace_id_post_target_id_post_targets_workspace_id_id_fk" FOREIGN KEY ("workspace_id","post_target_id") REFERENCES "public"."post_targets"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_target_changes_post_target_id_detected_at_index" ON "post_target_changes" USING btree ("post_target_id","detected_at");--> statement-breakpoint
-- The nightly sync moves to 02:00 WIB, the time the app tells creators.
UPDATE "job_schedules" SET "cron" = '0 2 * * *' WHERE "name" = 'insights.daily';
