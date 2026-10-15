CREATE TYPE "public"."auth_audience" AS ENUM('creator', 'staff');--> statement-breakpoint
CREATE TYPE "public"."billing_period" AS ENUM('monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."contact_message_status" AS ENUM('new', 'read', 'replied', 'archived');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'done', 'dead', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'failed', 'expired', 'refunded', 'cancelled', 'challenge');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'cancelled', 'downgraded', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."usage_device" AS ENUM('phone', 'tablet', 'desktop');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."workspace_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('uploading', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('instagram', 'threads', 'facebook', 'tiktok', 'youtube', 'x');--> statement-breakpoint
CREATE TYPE "public"."post_format" AS ENUM('feed', 'carousel', 'reel', 'story', 'text');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('draft', 'scheduled', 'publishing', 'published', 'partial', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."post_target_status" AS ENUM('draft', 'scheduled', 'preparing', 'processing', 'publishing', 'published', 'publish_unknown', 'retrying', 'quota_deferred', 'needs_reauth', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."social_account_status" AS ENUM('active', 'needs_reauth', 'revoked', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."bio_item_type" AS ENUM('product', 'link', 'header', 'social');--> statement-breakpoint
CREATE TYPE "public"."in_app_browser" AS ENUM('ig', 'threads', 'fb', 'none');--> statement-breakpoint
CREATE TYPE "public"."link_merchant" AS ENUM('shopee', 'tokopedia', 'tiktok_shop', 'lazada', 'other');--> statement-breakpoint
CREATE TYPE "public"."short_link_source" AS ENUM('vault', 'post', 'bio', 'dm');--> statement-breakpoint
CREATE TYPE "public"."dm_event_status" AS ENUM('matched', 'dm_sent', 'replied', 'skipped', 'skipped_dup', 'skipped_expired', 'rate_limited', 'failed');--> statement-breakpoint
CREATE TYPE "public"."dm_match_mode" AS ENUM('exact', 'contains');--> statement-breakpoint
CREATE TYPE "public"."dm_paused_reason" AS ENUM('plan_limit', 'kill_switch', 'account_disabled');--> statement-breakpoint
CREATE TYPE "public"."dm_rule_scope" AS ENUM('post', 'global');--> statement-breakpoint
CREATE TYPE "public"."data_deletion_status" AS ENUM('pending', 'completed');--> statement-breakpoint
CREATE TABLE "menus" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text,
	"label" text NOT NULL,
	"slug" text NOT NULL,
	"path" text,
	"icon" text,
	"permission_key" text,
	"order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menus_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"group" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" text NOT NULL,
	"permission_id" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "staff_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"account_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_invitations_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "staff_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"role_id" text NOT NULL,
	"last_login_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "staff_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"account_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"active_workspace_id" text,
	"impersonated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"locale" text DEFAULT 'id' NOT NULL,
	"last_login_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trial_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"email_normalized" text NOT NULL,
	"workspace_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trial_claims_emailNormalized_unique" UNIQUE("email_normalized"),
	CONSTRAINT "trial_claims_workspaceId_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" "workspace_role" DEFAULT 'editor' NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_invitations_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "workspace_role" DEFAULT 'owner' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"invited_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"status" "workspace_status" DEFAULT 'active' NOT NULL,
	"suspended_at" timestamp with time zone,
	"suspended_reason" text,
	"data_consent_accepted_at" timestamp with time zone,
	"onboarding_completed_at" timestamp with time zone,
	"downgrade_resolved_at" timestamp with time zone,
	"entitlements_version" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_requested_at" timestamp with time zone,
	"niche" text,
	"affiliate_programs" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "payment_gateways" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"label" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"is_sandbox" boolean DEFAULT true NOT NULL,
	"server_key" text,
	"client_key" text,
	"merchant_id" text,
	"base_url" text,
	"order_prefix" text,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_gateways_provider_unique" UNIQUE("provider")
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"order_id" text,
	"payload" jsonb NOT NULL,
	"headers" jsonb,
	"processed_at" timestamp with time zone,
	"error" text,
	"replay_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_webhook_events_dedupeKey_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"subscription_id" text,
	"order_id" text NOT NULL,
	"gateway_order_id" text,
	"provider" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"raw_status" text,
	"payment_type" text,
	"period" "billing_period" DEFAULT 'monthly' NOT NULL,
	"plan_slug" text,
	"redirect_url" text,
	"paid_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_orderId_unique" UNIQUE("order_id"),
	CONSTRAINT "payments_gatewayOrderId_unique" UNIQUE("gateway_order_id")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_monthly" numeric(14, 2) NOT NULL,
	"price_yearly" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"limits" jsonb NOT NULL,
	"features" jsonb NOT NULL,
	"trial_days" integer DEFAULT 14 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subscription_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"transition" text NOT NULL,
	"from_status" "subscription_status",
	"to_status" "subscription_status" NOT NULL,
	"from_plan_slug" text,
	"to_plan_slug" text NOT NULL,
	"period" "billing_period" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"status" "subscription_status" DEFAULT 'trialing' NOT NULL,
	"period" "billing_period" DEFAULT 'monthly' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"grace_ends_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"downgraded_at" timestamp with time zone,
	"provider_ref" text,
	"provider" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_workspaceId_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"audience" "auth_audience" NOT NULL,
	"actor_id" text,
	"actor_name" text,
	"impersonator_id" text,
	"workspace_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"description" text,
	"variables" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_templates_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"action_label" text,
	"action_url" text,
	"icon" text,
	"level" text DEFAULT 'info' NOT NULL,
	"variables" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_templates_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"audience" "auth_audience" NOT NULL,
	"staff_user_id" text,
	"user_id" text,
	"workspace_id" text,
	"template_key" text,
	"dedupe_key" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"action_url" text,
	"icon" text,
	"level" text DEFAULT 'info' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNLOGGED TABLE "rate_limit_buckets" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_buckets_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text,
	"group" text NOT NULL,
	"type" text DEFAULT 'string' NOT NULL,
	"label" text NOT NULL,
	"is_secret" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"subject" text,
	"message" text NOT NULL,
	"status" "contact_message_status" DEFAULT 'new' NOT NULL,
	"ip" text,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" text PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"category" text DEFAULT 'umum' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"excerpt" text,
	"meta_title" text,
	"meta_description" text,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "usage_daily" (
	"date_key" text NOT NULL,
	"device" "usage_device" NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_daily_date_key_device_pk" PRIMARY KEY("date_key","device")
);
--> statement-breakpoint
CREATE TABLE "job_schedules" (
	"name" text PRIMARY KEY NOT NULL,
	"cron" text NOT NULL,
	"tz" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"last_slot" timestamp with time zone,
	"last_job_id" text,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"queue" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"workspace_id" text,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"lease_until" timestamp with time zone,
	"singleton_key" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "system_heartbeat" (
	"name" text PRIMARY KEY NOT NULL,
	"beat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"info" jsonb
);
--> statement-breakpoint
CREATE TABLE "insight_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"post_target_id" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metrics" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"r2_key" text NOT NULL,
	"public_url" text,
	"mime" text NOT NULL,
	"kind" "media_kind" NOT NULL,
	"bytes" bigint DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"codec" text,
	"sha256" text,
	"status" "media_status" DEFAULT 'uploading' NOT NULL,
	"processor_ref" text,
	"processor_submitted_at" timestamp with time zone,
	"variants" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_r2Key_unique" UNIQUE("r2_key"),
	CONSTRAINT "media_assets_workspaceId_id_unique" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "platform_publish_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"social_account_id" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_media" (
	"workspace_id" text NOT NULL,
	"post_id" text NOT NULL,
	"position" integer NOT NULL,
	"media_id" text NOT NULL,
	CONSTRAINT "post_media_post_id_position_pk" PRIMARY KEY("post_id","position")
);
--> statement-breakpoint
CREATE TABLE "post_targets" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"post_id" text NOT NULL,
	"social_account_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"format" "post_format" NOT NULL,
	"caption_override" text,
	"media_override" jsonb,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "post_target_status" DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"container_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"step" text,
	"external_id" text,
	"permalink" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"last_error_msg" text,
	"job_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_targets_workspaceId_id_unique" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"author_user_id" text,
	"base_caption" text DEFAULT '' NOT NULL,
	"status" "post_status" DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_workspaceId_id_unique" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "publish_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"post_target_id" text NOT NULL,
	"attempt_no" integer NOT NULL,
	"step" text NOT NULL,
	"http_status" integer,
	"error_code" text,
	"error_subcode" text,
	"fbtrace_id" text,
	"response" jsonb,
	"outcome" text NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"external_id" text NOT NULL,
	"username" text,
	"avatar_url" text,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"token_expires_at" timestamp with time zone,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "social_account_status" DEFAULT 'active' NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_accounts_workspaceId_id_unique" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"workspace_id" text NOT NULL,
	"period_start" text NOT NULL,
	"metric" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_counters_workspace_id_period_start_metric_pk" PRIMARY KEY("workspace_id","period_start","metric")
);
--> statement-breakpoint
CREATE TABLE "bio_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"bio_page_id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bio_categories_workspaceId_id_unique" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "bio_items" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"bio_page_id" text NOT NULL,
	"category_id" text,
	"type" "bio_item_type" NOT NULL,
	"link_id" text,
	"short_link_id" text,
	"title" text,
	"image_url" text,
	"price_label" text,
	"badge" text,
	"pinned" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bio_pages" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"handle" text NOT NULL,
	"title" text,
	"bio" text,
	"avatar_media_id" text,
	"theme" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"seo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bio_pages_workspaceId_id_unique" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "link_click_daily" (
	"day" text NOT NULL,
	"workspace_id" text NOT NULL,
	"short_link_id" text NOT NULL,
	"channel" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"device" text DEFAULT '' NOT NULL,
	"referrer_domain" text DEFAULT '' NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"uniques" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "link_click_daily_day_short_link_id_channel_country_device_referrer_domain_pk" PRIMARY KEY("day","short_link_id","channel","country","device","referrer_domain")
);
--> statement-breakpoint
CREATE TABLE "link_clicks" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"short_link_id" text NOT NULL,
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_hash" text,
	"country" text,
	"region" text,
	"city" text,
	"device" text,
	"os" text,
	"in_app" "in_app_browser" DEFAULT 'none' NOT NULL,
	"referrer_domain" text,
	"is_bot" boolean DEFAULT false NOT NULL,
	"is_unique_day" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "links" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"destination_url" text NOT NULL,
	"merchant" "link_merchant" DEFAULT 'other' NOT NULL,
	"title" text,
	"image_url" text,
	"price_idr" bigint,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "links_workspaceId_id_unique" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "short_links" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"slug" text NOT NULL,
	"domain" text NOT NULL,
	"link_id" text NOT NULL,
	"post_target_id" text,
	"channel" text,
	"source" "short_link_source" DEFAULT 'vault' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "short_links_slug_unique" UNIQUE("slug"),
	CONSTRAINT "short_links_workspaceId_id_unique" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "dm_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"rule_id" text,
	"social_account_id" text NOT NULL,
	"comment_id" text NOT NULL,
	"commenter_id" text NOT NULL,
	"commenter_username" text,
	"media_id" text,
	"comment_text" text,
	"status" "dm_event_status" DEFAULT 'matched' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dm_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"social_account_id" text NOT NULL,
	"name" text NOT NULL,
	"scope" "dm_rule_scope" DEFAULT 'global' NOT NULL,
	"external_media_id" text,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"match_mode" "dm_match_mode" DEFAULT 'contains' NOT NULL,
	"dm_message" text NOT NULL,
	"link_id" text,
	"public_reply_variants" text[] DEFAULT '{}'::text[] NOT NULL,
	"daily_cap" integer,
	"active" boolean DEFAULT true NOT NULL,
	"paused_reason" "dm_paused_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dm_rules_workspaceId_id_unique" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "data_deletion_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" "platform" NOT NULL,
	"platform_user_id" text NOT NULL,
	"confirmation_code" text NOT NULL,
	"status" "data_deletion_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_deletion_requests_confirmationCode_unique" UNIQUE("confirmation_code")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"topic" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "menus" ADD CONSTRAINT "menus_parent_id_menus_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_accounts" ADD CONSTRAINT "staff_accounts_user_id_staff_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_invited_by_id_staff_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_user_id_staff_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_claims" ADD CONSTRAINT "trial_claims_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_snapshots" ADD CONSTRAINT "insight_snapshots_workspace_id_post_target_id_post_targets_workspace_id_id_fk" FOREIGN KEY ("workspace_id","post_target_id") REFERENCES "public"."post_targets"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_publish_ledger" ADD CONSTRAINT "platform_publish_ledger_workspace_id_social_account_id_social_accounts_workspace_id_id_fk" FOREIGN KEY ("workspace_id","social_account_id") REFERENCES "public"."social_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_workspace_id_post_id_posts_workspace_id_id_fk" FOREIGN KEY ("workspace_id","post_id") REFERENCES "public"."posts"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_workspace_id_media_id_media_assets_workspace_id_id_fk" FOREIGN KEY ("workspace_id","media_id") REFERENCES "public"."media_assets"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_targets" ADD CONSTRAINT "post_targets_workspace_id_post_id_posts_workspace_id_id_fk" FOREIGN KEY ("workspace_id","post_id") REFERENCES "public"."posts"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_targets" ADD CONSTRAINT "post_targets_workspace_id_social_account_id_social_accounts_workspace_id_id_fk" FOREIGN KEY ("workspace_id","social_account_id") REFERENCES "public"."social_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_workspace_id_post_target_id_post_targets_workspace_id_id_fk" FOREIGN KEY ("workspace_id","post_target_id") REFERENCES "public"."post_targets"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bio_categories" ADD CONSTRAINT "bio_categories_workspace_id_bio_page_id_bio_pages_workspace_id_id_fk" FOREIGN KEY ("workspace_id","bio_page_id") REFERENCES "public"."bio_pages"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bio_items" ADD CONSTRAINT "bio_items_workspace_id_bio_page_id_bio_pages_workspace_id_id_fk" FOREIGN KEY ("workspace_id","bio_page_id") REFERENCES "public"."bio_pages"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bio_items" ADD CONSTRAINT "bio_items_workspace_id_category_id_bio_categories_workspace_id_id_fk" FOREIGN KEY ("workspace_id","category_id") REFERENCES "public"."bio_categories"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bio_items" ADD CONSTRAINT "bio_items_workspace_id_link_id_links_workspace_id_id_fk" FOREIGN KEY ("workspace_id","link_id") REFERENCES "public"."links"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bio_items" ADD CONSTRAINT "bio_items_workspace_id_short_link_id_short_links_workspace_id_id_fk" FOREIGN KEY ("workspace_id","short_link_id") REFERENCES "public"."short_links"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bio_pages" ADD CONSTRAINT "bio_pages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bio_pages" ADD CONSTRAINT "bio_pages_workspace_id_avatar_media_id_media_assets_workspace_id_id_fk" FOREIGN KEY ("workspace_id","avatar_media_id") REFERENCES "public"."media_assets"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_links" ADD CONSTRAINT "short_links_workspace_id_link_id_links_workspace_id_id_fk" FOREIGN KEY ("workspace_id","link_id") REFERENCES "public"."links"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_links" ADD CONSTRAINT "short_links_workspace_id_post_target_id_post_targets_workspace_id_id_fk" FOREIGN KEY ("workspace_id","post_target_id") REFERENCES "public"."post_targets"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_events" ADD CONSTRAINT "dm_events_workspace_id_rule_id_dm_rules_workspace_id_id_fk" FOREIGN KEY ("workspace_id","rule_id") REFERENCES "public"."dm_rules"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_events" ADD CONSTRAINT "dm_events_workspace_id_social_account_id_social_accounts_workspace_id_id_fk" FOREIGN KEY ("workspace_id","social_account_id") REFERENCES "public"."social_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_rules" ADD CONSTRAINT "dm_rules_workspace_id_social_account_id_social_accounts_workspace_id_id_fk" FOREIGN KEY ("workspace_id","social_account_id") REFERENCES "public"."social_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_rules" ADD CONSTRAINT "dm_rules_workspace_id_link_id_links_workspace_id_id_fk" FOREIGN KEY ("workspace_id","link_id") REFERENCES "public"."links"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "menus_parent_id_index" ON "menus" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "menus_order_index" ON "menus" USING btree ("order");--> statement-breakpoint
CREATE INDEX "permissions_group_index" ON "permissions" USING btree ("group");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_id_index" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "staff_accounts_user_id_index" ON "staff_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "staff_invitations_email_index" ON "staff_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "staff_invitations_role_id_index" ON "staff_invitations" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "staff_sessions_user_id_index" ON "staff_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "staff_sessions_expires_at_index" ON "staff_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "staff_users_role_id_index" ON "staff_users" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "staff_users_is_active_index" ON "staff_users" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "staff_verifications_identifier_index" ON "staff_verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "staff_verifications_expires_at_index" ON "staff_verifications" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_id_account_id_index" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "accounts_user_id_index" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_index" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_index" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "users_is_active_index" ON "users" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "verifications_identifier_index" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "verifications_expires_at_index" ON "verifications" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invitations_workspace_id_email_index" ON "workspace_invitations" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE INDEX "workspace_invitations_workspace_id_index" ON "workspace_invitations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_invitations_email_index" ON "workspace_invitations" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_workspace_id_user_id_index" ON "workspace_members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "workspace_members_user_id_index" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workspace_members_workspace_id_index" ON "workspace_members" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspaces_status_index" ON "workspaces" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workspaces_deleted_at_index" ON "workspaces" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "workspaces_created_at_index" ON "workspaces" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "payment_webhook_events_provider_index" ON "payment_webhook_events" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "payment_webhook_events_order_id_index" ON "payment_webhook_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_webhook_events_created_at_index" ON "payment_webhook_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "payments_workspace_id_index" ON "payments" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "payments_subscription_id_index" ON "payments" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "payments_status_index" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_workspace_id_created_at_index" ON "payments" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "subscription_events_created_at_index" ON "subscription_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "subscription_events_workspace_id_created_at_index" ON "subscription_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "subscriptions_plan_id_index" ON "subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_index" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_trial_ends_at_index" ON "subscriptions" USING btree ("trial_ends_at");--> statement-breakpoint
CREATE INDEX "subscriptions_grace_ends_at_index" ON "subscriptions" USING btree ("grace_ends_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_id_index" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_workspace_id_index" ON "audit_logs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_index" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_index" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_staff_user_id_read_at_index" ON "notifications" USING btree ("staff_user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_user_id_read_at_index" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_workspace_id_index" ON "notifications" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "notifications_created_at_index" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_expires_at_index" ON "rate_limit_buckets" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "app_settings_group_index" ON "app_settings" USING btree ("group");--> statement-breakpoint
CREATE INDEX "contact_messages_status_index" ON "contact_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "contact_messages_created_at_index" ON "contact_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "faqs_order_index" ON "faqs" USING btree ("order");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_queue_singleton_live_idx" ON "jobs" USING btree ("queue","singleton_key") WHERE "jobs"."status" in ('queued', 'running') and "jobs"."singleton_key" is not null;--> statement-breakpoint
CREATE INDEX "jobs_status_run_at_index" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "jobs_queue_status_index" ON "jobs" USING btree ("queue","status");--> statement-breakpoint
CREATE INDEX "jobs_workspace_id_index" ON "jobs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "insight_snapshots_post_target_id_captured_at_index" ON "insight_snapshots" USING btree ("post_target_id","captured_at");--> statement-breakpoint
CREATE INDEX "media_assets_workspace_id_created_at_index" ON "media_assets" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "media_assets_status_index" ON "media_assets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "platform_publish_ledger_social_account_id_published_at_index" ON "platform_publish_ledger" USING btree ("social_account_id","published_at");--> statement-breakpoint
CREATE INDEX "post_media_media_id_index" ON "post_media" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "post_targets_status_scheduled_at_index" ON "post_targets" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "post_targets_social_account_id_published_at_index" ON "post_targets" USING btree ("social_account_id","published_at");--> statement-breakpoint
CREATE INDEX "post_targets_post_id_index" ON "post_targets" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "posts_workspace_id_scheduled_at_index" ON "posts" USING btree ("workspace_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "publish_attempts_post_target_id_index" ON "publish_attempts" USING btree ("post_target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_accounts_platform_external_live_idx" ON "social_accounts" USING btree ("platform","external_id") WHERE "social_accounts"."status" <> 'revoked';--> statement-breakpoint
CREATE INDEX "social_accounts_token_expiry_active_idx" ON "social_accounts" USING btree ("token_expires_at") WHERE "social_accounts"."status" = 'active';--> statement-breakpoint
CREATE INDEX "social_accounts_workspace_id_index" ON "social_accounts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "bio_categories_bio_page_id_index" ON "bio_categories" USING btree ("bio_page_id");--> statement-breakpoint
CREATE INDEX "bio_items_bio_page_id_position_index" ON "bio_items" USING btree ("bio_page_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "bio_pages_handle_lower_idx" ON "bio_pages" USING btree (lower("handle"));--> statement-breakpoint
CREATE INDEX "bio_pages_workspace_id_index" ON "bio_pages" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "link_click_daily_workspace_id_day_index" ON "link_click_daily" USING btree ("workspace_id","day");--> statement-breakpoint
CREATE INDEX "link_clicks_short_link_id_clicked_at_index" ON "link_clicks" USING btree ("short_link_id","clicked_at");--> statement-breakpoint
CREATE INDEX "link_clicks_workspace_id_clicked_at_index" ON "link_clicks" USING btree ("workspace_id","clicked_at");--> statement-breakpoint
CREATE INDEX "link_clicks_clicked_at_brin_idx" ON "link_clicks" USING brin ("clicked_at");--> statement-breakpoint
CREATE INDEX "links_workspace_id_created_at_index" ON "links" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "short_links_link_id_index" ON "short_links" USING btree ("link_id");--> statement-breakpoint
CREATE INDEX "short_links_workspace_id_index" ON "short_links" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dm_events_social_account_id_comment_id_index" ON "dm_events" USING btree ("social_account_id","comment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dm_events_one_dm_per_commenter_idx" ON "dm_events" USING btree ("rule_id","commenter_id") WHERE "dm_events"."status" = 'dm_sent';--> statement-breakpoint
CREATE INDEX "dm_events_workspace_id_created_at_index" ON "dm_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "dm_rules_social_account_id_active_index" ON "dm_rules" USING btree ("social_account_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_dedupe_key_index" ON "webhook_events" USING btree ("provider","dedupe_key");--> statement-breakpoint
CREATE INDEX "webhook_events_received_at_index" ON "webhook_events" USING btree ("received_at");