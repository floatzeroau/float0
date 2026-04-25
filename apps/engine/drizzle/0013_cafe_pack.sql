-- Drop old prepaid pack tables (hard cutover, no production data)
DROP TABLE IF EXISTS "balance_transactions";--> statement-breakpoint
DROP TABLE IF EXISTS "customer_balances";--> statement-breakpoint
DROP TABLE IF EXISTS "prepaid_packs";--> statement-breakpoint

-- Add allow_as_pack column to products
ALTER TABLE "products" ADD COLUMN "allow_as_pack" boolean NOT NULL DEFAULT false;--> statement-breakpoint

-- Pack status enum
CREATE TYPE "pack_status" AS ENUM ('active', 'expired', 'consumed', 'refunded');--> statement-breakpoint
CREATE TYPE "pack_transaction_type" AS ENUM ('purchase', 'serve', 'refund', 'admin_adjust');--> statement-breakpoint

-- Packs table (replaces customer_balances)
CREATE TABLE "packs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "product_snapshot" jsonb NOT NULL,
  "total_quantity" integer NOT NULL,
  "remaining_quantity" integer NOT NULL,
  "price_paid" double precision NOT NULL,
  "unit_value" double precision NOT NULL,
  "expiry_date" timestamp with time zone,
  "status" "pack_status" NOT NULL DEFAULT 'active',
  "source_order_id" uuid REFERENCES "orders"("id"),
  "purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
  "_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE INDEX "packs_organization_id_idx" ON "packs" ("organization_id");--> statement-breakpoint
CREATE INDEX "packs_customer_id_idx" ON "packs" ("customer_id");--> statement-breakpoint
CREATE INDEX "packs_status_idx" ON "packs" ("status");--> statement-breakpoint

-- Pack serve records (operational log)
CREATE TABLE "pack_serve_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
  "pack_id" uuid NOT NULL REFERENCES "packs"("id"),
  "product_snapshot" jsonb,
  "quantity_served" integer NOT NULL DEFAULT 1,
  "served_at" timestamp with time zone DEFAULT now() NOT NULL,
  "barista_id" uuid,
  "terminal_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX "pack_serve_records_pack_id_idx" ON "pack_serve_records" ("pack_id");--> statement-breakpoint
CREATE INDEX "pack_serve_records_organization_id_idx" ON "pack_serve_records" ("organization_id");--> statement-breakpoint

-- Pack transactions (audit ledger)
CREATE TABLE "pack_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "pack_id" uuid NOT NULL REFERENCES "packs"("id"),
  "type" "pack_transaction_type" NOT NULL,
  "quantity" integer NOT NULL,
  "amount" double precision,
  "reference_id" uuid,
  "staff_id" uuid,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX "pack_transactions_pack_id_idx" ON "pack_transactions" ("pack_id");--> statement-breakpoint
CREATE INDEX "pack_transactions_organization_id_idx" ON "pack_transactions" ("organization_id");
