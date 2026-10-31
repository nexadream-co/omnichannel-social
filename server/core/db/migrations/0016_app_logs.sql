CREATE TABLE "app_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"level" text NOT NULL,
	"msg" text NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"staff_user_id" text,
	"request_id" text,
	"path" text,
	"fields" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "app_logs_created_at_index" ON "app_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "app_logs_user_id_created_at_index" ON "app_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "app_logs_workspace_id_created_at_index" ON "app_logs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "app_logs_msg_index" ON "app_logs" USING btree ("msg");--> statement-breakpoint
-- Reference data (docs/blueprint/19 §2): the admin-only logs.read permission (no Support grant) and its menu entry.
INSERT INTO "permissions" ("id", "key", "group", "description") VALUES
  (gen_random_uuid()::text, 'logs.read', 'logs', 'Lihat log error')
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.role_id, p.id
FROM (VALUES ('role-superadmin', 'logs.read'), ('role-admin', 'logs.read')) AS r (role_id, key)
JOIN "permissions" p ON p.key = r.key
JOIN "roles" ON "roles"."id" = r.role_id
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "menus" ("id", "parent_id", "label", "slug", "path", "icon", "permission_key", "order")
SELECT 'menu-logs', 'menu-system', 'Log error', 'logs', '/admin/system/logs', 'i-lucide-bug', 'logs.read', 3
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'menu-system')
ON CONFLICT DO NOTHING;
