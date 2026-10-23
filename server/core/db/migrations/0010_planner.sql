-- Rencana konten (ARCHITECTURE §8.8): ideas, shopping moments, a pillar on posts and the weekly target.
-- Expand-only: older releases ignore the new tables and columns.
CREATE TYPE "public"."content_pillar" AS ENUM('promo', 'review', 'edukasi', 'hiburan', 'cerita');--> statement-breakpoint
CREATE TYPE "public"."idea_status" AS ENUM('open', 'used', 'archived');--> statement-breakpoint
CREATE TYPE "public"."moment_kind" AS ENUM('twin_date', 'payday', 'holiday', 'campaign');--> statement-breakpoint
CREATE TABLE "content_idea_links" (
	"workspace_id" text NOT NULL,
	"idea_id" text NOT NULL,
	"link_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "content_idea_links_idea_id_link_id_pk" PRIMARY KEY("idea_id","link_id")
);
--> statement-breakpoint
CREATE TABLE "content_idea_media" (
	"workspace_id" text NOT NULL,
	"idea_id" text NOT NULL,
	"media_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "content_idea_media_idea_id_media_id_pk" PRIMARY KEY("idea_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "content_ideas" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"author_user_id" text,
	"title" text NOT NULL,
	"note" text,
	"pillar" "content_pillar",
	"planned_on" date,
	"status" "idea_status" DEFAULT 'open' NOT NULL,
	"post_id" text,
	"moment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_ideas_workspaceId_id_unique" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "shopping_moments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"kind" "moment_kind" NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"prep_days" integer DEFAULT 3 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "posts_per_week" smallint;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "pillar" "content_pillar";--> statement-breakpoint
ALTER TABLE "content_idea_links" ADD CONSTRAINT "content_idea_links_workspace_id_idea_id_content_ideas_workspace_id_id_fk" FOREIGN KEY ("workspace_id","idea_id") REFERENCES "public"."content_ideas"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_idea_links" ADD CONSTRAINT "content_idea_links_workspace_id_link_id_links_workspace_id_id_fk" FOREIGN KEY ("workspace_id","link_id") REFERENCES "public"."links"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_idea_media" ADD CONSTRAINT "content_idea_media_workspace_id_idea_id_content_ideas_workspace_id_id_fk" FOREIGN KEY ("workspace_id","idea_id") REFERENCES "public"."content_ideas"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_idea_media" ADD CONSTRAINT "content_idea_media_workspace_id_media_id_media_assets_workspace_id_id_fk" FOREIGN KEY ("workspace_id","media_id") REFERENCES "public"."media_assets"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_moment_id_shopping_moments_id_fk" FOREIGN KEY ("moment_id") REFERENCES "public"."shopping_moments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_idea_links_link_id_index" ON "content_idea_links" USING btree ("link_id");--> statement-breakpoint
CREATE INDEX "content_idea_media_media_id_index" ON "content_idea_media" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "content_ideas_workspace_id_planned_on_index" ON "content_ideas" USING btree ("workspace_id","planned_on");--> statement-breakpoint
CREATE INDEX "content_ideas_workspace_id_status_created_at_index" ON "content_ideas" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE INDEX "content_ideas_post_id_index" ON "content_ideas" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "shopping_moments_starts_on_ends_on_index" ON "shopping_moments" USING btree ("starts_on","ends_on");--> statement-breakpoint
-- Reference data (docs/blueprint/19 §2): shopping moments for 2026–2027 (same ids as scripts/seed.ts), staff
-- permissions and the admin menu entry. Inserts never overwrite admin edits.
INSERT INTO "shopping_moments" ("id", "name", "name_en", "kind", "starts_on", "ends_on", "prep_days") VALUES
  ('moment-gajian-2026-10', 'Gajian', 'Payday', 'payday', '2026-10-25', '2026-11-01', 2),
  ('moment-1111-2026', 'Promo 11.11', '11.11 Sale', 'twin_date', '2026-11-11', '2026-11-11', 3),
  ('moment-gajian-2026-11', 'Gajian', 'Payday', 'payday', '2026-11-25', '2026-12-01', 2),
  ('moment-blackfriday-2026', 'Black Friday', 'Black Friday', 'campaign', '2026-11-27', '2026-11-30', 3),
  ('moment-1212-2026', 'Promo 12.12 Harbolnas', '12.12 Harbolnas', 'twin_date', '2026-12-12', '2026-12-12', 5),
  ('moment-hariibu-2026', 'Hari Ibu', 'Mother''s Day', 'holiday', '2026-12-22', '2026-12-22', 5),
  ('moment-gajian-2026-12', 'Gajian', 'Payday', 'payday', '2026-12-25', '2027-01-01', 2),
  ('moment-natal-2026', 'Natal', 'Christmas', 'holiday', '2026-12-25', '2026-12-25', 7),
  ('moment-0101-2027', 'Promo 1.1', '1.1 Sale', 'twin_date', '2027-01-01', '2027-01-01', 3),
  ('moment-gajian-2027-01', 'Gajian', 'Payday', 'payday', '2027-01-25', '2027-02-01', 2),
  ('moment-0202-2027', 'Promo 2.2', '2.2 Sale', 'twin_date', '2027-02-02', '2027-02-02', 3),
  ('moment-imlek-2027', 'Imlek', 'Chinese New Year', 'holiday', '2027-02-06', '2027-02-06', 7),
  ('moment-ramadan-2027', 'Ramadan', 'Ramadan', 'holiday', '2027-02-08', '2027-03-09', 7),
  ('moment-valentine-2027', 'Valentine', 'Valentine''s Day', 'holiday', '2027-02-14', '2027-02-14', 5),
  ('moment-gajian-2027-02', 'Gajian', 'Payday', 'payday', '2027-02-25', '2027-03-01', 2),
  ('moment-0303-2027', 'Promo 3.3', '3.3 Sale', 'twin_date', '2027-03-03', '2027-03-03', 3),
  ('moment-lebaran-2027', 'Lebaran', 'Eid al-Fitr', 'holiday', '2027-03-10', '2027-03-11', 14),
  ('moment-gajian-2027-03', 'Gajian', 'Payday', 'payday', '2027-03-25', '2027-04-01', 2),
  ('moment-0404-2027', 'Promo 4.4', '4.4 Sale', 'twin_date', '2027-04-04', '2027-04-04', 3),
  ('moment-gajian-2027-04', 'Gajian', 'Payday', 'payday', '2027-04-25', '2027-05-01', 2),
  ('moment-0505-2027', 'Promo 5.5', '5.5 Sale', 'twin_date', '2027-05-05', '2027-05-05', 3),
  ('moment-iduladha-2027', 'Iduladha', 'Eid al-Adha', 'holiday', '2027-05-17', '2027-05-17', 5),
  ('moment-gajian-2027-05', 'Gajian', 'Payday', 'payday', '2027-05-25', '2027-06-01', 2),
  ('moment-0606-2027', 'Promo 6.6', '6.6 Sale', 'twin_date', '2027-06-06', '2027-06-06', 3),
  ('moment-gajian-2027-06', 'Gajian', 'Payday', 'payday', '2027-06-25', '2027-07-01', 2),
  ('moment-0707-2027', 'Promo 7.7', '7.7 Sale', 'twin_date', '2027-07-07', '2027-07-07', 3),
  ('moment-sekolah-2027', 'Tahun ajaran baru', 'Back to school', 'campaign', '2027-07-12', '2027-07-18', 7),
  ('moment-gajian-2027-07', 'Gajian', 'Payday', 'payday', '2027-07-25', '2027-08-01', 2),
  ('moment-0808-2027', 'Promo 8.8', '8.8 Sale', 'twin_date', '2027-08-08', '2027-08-08', 3),
  ('moment-hutri-2027', 'HUT RI', 'Independence Day', 'holiday', '2027-08-17', '2027-08-17', 5),
  ('moment-gajian-2027-08', 'Gajian', 'Payday', 'payday', '2027-08-25', '2027-09-01', 2),
  ('moment-0909-2027', 'Promo 9.9', '9.9 Sale', 'twin_date', '2027-09-09', '2027-09-09', 3),
  ('moment-gajian-2027-09', 'Gajian', 'Payday', 'payday', '2027-09-25', '2027-10-01', 2),
  ('moment-1010-2027', 'Promo 10.10', '10.10 Sale', 'twin_date', '2027-10-10', '2027-10-10', 3),
  ('moment-gajian-2027-10', 'Gajian', 'Payday', 'payday', '2027-10-25', '2027-11-01', 2),
  ('moment-1111-2027', 'Promo 11.11', '11.11 Sale', 'twin_date', '2027-11-11', '2027-11-11', 3),
  ('moment-gajian-2027-11', 'Gajian', 'Payday', 'payday', '2027-11-25', '2027-12-01', 2),
  ('moment-blackfriday-2027', 'Black Friday', 'Black Friday', 'campaign', '2027-11-26', '2027-11-29', 3),
  ('moment-1212-2027', 'Promo 12.12 Harbolnas', '12.12 Harbolnas', 'twin_date', '2027-12-12', '2027-12-12', 5),
  ('moment-hariibu-2027', 'Hari Ibu', 'Mother''s Day', 'holiday', '2027-12-22', '2027-12-22', 5),
  ('moment-gajian-2027-12', 'Gajian', 'Payday', 'payday', '2027-12-25', '2028-01-01', 2),
  ('moment-natal-2027', 'Natal', 'Christmas', 'holiday', '2027-12-25', '2027-12-25', 7)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "permissions" ("id", "key", "group", "description") VALUES
  (gen_random_uuid()::text, 'moments.read', 'moments', 'Lihat momen belanja'),
  (gen_random_uuid()::text, 'moments.write', 'moments', 'Ubah momen belanja')
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.role_id, p.id
FROM (VALUES ('role-superadmin', 'moments.read'), ('role-superadmin', 'moments.write'), ('role-admin', 'moments.read'), ('role-admin', 'moments.write'), ('role-support', 'moments.read')) AS r (role_id, key)
JOIN "permissions" p ON p.key = r.key
JOIN "roles" ON "roles"."id" = r.role_id
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "menus" ("id", "parent_id", "label", "slug", "path", "icon", "permission_key", "order")
SELECT 'menu-moments', 'menu-content', 'Momen belanja', 'moments', '/admin/moments', 'i-lucide-calendar-heart', 'moments.read', 6
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'menu-content')
ON CONFLICT DO NOTHING;
