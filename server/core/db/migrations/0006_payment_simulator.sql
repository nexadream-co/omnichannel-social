CREATE TABLE "payment_simulations" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"gateway_order_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"item_name" text NOT NULL,
	"customer_name" text,
	"finish_url" text,
	"payment_type" text,
	"metadata" jsonb,
	"expires_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_simulations_orderId_unique" UNIQUE("order_id"),
	CONSTRAINT "payment_simulations_gatewayOrderId_unique" UNIQUE("gateway_order_id")
);
--> statement-breakpoint
CREATE INDEX "payment_simulations_status_index" ON "payment_simulations" USING btree ("status");--> statement-breakpoint
-- Reference data: the simulator gateway row ships inactive; it can only be activated outside production.
INSERT INTO "payment_gateways" ("id", "provider", "label", "is_active", "is_sandbox") VALUES ('gateway-simulator', 'simulator', 'Simulator pembayaran', false, true) ON CONFLICT ("id") DO NOTHING;
