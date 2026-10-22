-- Media editor (ARCHITECTURE §8.5): an edit is a new media_assets row pointing at its untouched source, with the recipe;
-- workspaces keep the watermark logo. Expand-only: older releases ignore the new columns.
ALTER TABLE "workspaces" ADD COLUMN "watermark" jsonb;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "source_media_id" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "edit_spec" jsonb;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_source_media_id_media_assets_id_fk" FOREIGN KEY ("source_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_assets_source_media_id_index" ON "media_assets" USING btree ("source_media_id");