CREATE TABLE "ip_salts" (
	"day" text PRIMARY KEY NOT NULL,
	"salt" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "short_links" DROP CONSTRAINT "short_links_workspace_id_post_target_id_post_targets_workspace_id_id_fk";
--> statement-breakpoint
ALTER TABLE "bio_pages" ADD COLUMN "socials" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "short_links" ADD CONSTRAINT "short_links_workspace_id_post_target_id_post_targets_workspace_id_id_fk" FOREIGN KEY ("workspace_id","post_target_id") REFERENCES "public"."post_targets"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "short_links_target_link_idx" ON "short_links" USING btree ("post_target_id","link_id") WHERE "short_links"."post_target_id" is not null;