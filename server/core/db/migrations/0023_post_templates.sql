CREATE TABLE "post_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"caption" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_templates_workspaceId_id_unique" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "post_templates" ADD CONSTRAINT "post_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_templates_workspace_id_updated_at_index" ON "post_templates" USING btree ("workspace_id","updated_at");