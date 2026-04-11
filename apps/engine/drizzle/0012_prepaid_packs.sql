-- Prepaid packs
CREATE TABLE "prepaid_packs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" varchar(255) NOT NULL,
  "description" text,
  "pack_size" integer NOT NULL,
  "price" double precision NOT NULL,
  "per_item_value" double precision NOT NULL,
  "eligible_product_ids" jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "allow_custom_size" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE INDEX "prepaid_packs_organization_id_idx" ON "prepaid_packs" ("organization_id");--> statement-breakpoint

-- Customer balances
CREATE TABLE "customer_balances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "pack_id" uuid NOT NULL REFERENCES "prepaid_packs"("id"),
  "remaining_count" integer NOT NULL,
  "original_count" integer NOT NULL,
  "price_paid" double precision NOT NULL,
  "discount_type" varchar(50),
  "discount_value" double precision,
  "purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX "customer_balances_customer_id_idx" ON "customer_balances" ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_balances_organization_id_idx" ON "customer_balances" ("organization_id");--> statement-breakpoint

-- Balance transactions
CREATE TABLE "balance_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_balance_id" uuid NOT NULL REFERENCES "customer_balances"("id"),
  "type" varchar(50) NOT NULL,
  "quantity" integer NOT NULL,
  "order_id" uuid REFERENCES "orders"("id"),
  "staff_id" uuid,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX "balance_transactions_customer_balance_id_idx" ON "balance_transactions" ("customer_balance_id");--> statement-breakpoint
CREATE INDEX "balance_transactions_order_id_idx" ON "balance_transactions" ("order_id");
