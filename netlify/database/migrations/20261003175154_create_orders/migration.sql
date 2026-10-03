CREATE TABLE "orders" (
	"id" serial PRIMARY KEY,
	"reference" text NOT NULL UNIQUE,
	"status" text DEFAULT 'pending' NOT NULL,
	"items" jsonb NOT NULL,
	"total_amount" integer NOT NULL,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_city" text NOT NULL,
	"customer_address" text NOT NULL,
	"payment_method" text NOT NULL,
	"payment_phone" text NOT NULL,
	"provider_reference" text,
	"status_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" ("status");--> statement-breakpoint
CREATE INDEX "orders_provider_reference_idx" ON "orders" ("provider_reference");