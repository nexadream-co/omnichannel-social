CREATE TABLE "channel_connect_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"payload_enc" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_connect_sessions" ADD CONSTRAINT "channel_connect_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channel_connect_sessions_workspace_id_index" ON "channel_connect_sessions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "channel_connect_sessions_expires_at_index" ON "channel_connect_sessions" USING btree ("expires_at");--> statement-breakpoint
-- Reference data ships in migrations too (CLAUDE.md rule 14): the token refresh schedule is live from M2.
UPDATE "job_schedules" SET "enabled" = true WHERE "name" = 'token.refresh';
