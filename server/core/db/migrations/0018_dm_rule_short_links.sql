-- Auto-reply DM links per rule and per post: short_links.dm_rule_id (no foreign key, rules are hard-deleted and sent links must keep working),
-- the caption-link unique index now covers source = 'post' only so a DM link can share a post target and product, and a lookup index
-- for post_targets by platform media id. Expand/contract-safe: the previous release only inserts post links and legacy per-product DM links
-- (dm_rule_id null, post_target_id null), both still valid under the new indexes; the new column is nullable and unread by it.
DROP INDEX "short_links_target_link_idx";--> statement-breakpoint
ALTER TABLE "short_links" ADD COLUMN "dm_rule_id" text;--> statement-breakpoint
CREATE INDEX "post_targets_social_account_id_external_id_index" ON "post_targets" USING btree ("social_account_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "short_links_dm_rule_idx" ON "short_links" USING btree ("dm_rule_id","link_id",coalesce("post_target_id", '')) WHERE "short_links"."dm_rule_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "short_links_target_link_idx" ON "short_links" USING btree ("post_target_id","link_id") WHERE "short_links"."post_target_id" is not null and "short_links"."source" = 'post';