-- Customer auth columns
ALTER TABLE "customers" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "email_verified" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint

-- Partial unique index: one email per org (only where email is set)
CREATE UNIQUE INDEX "customers_org_email_unique" ON "customers" ("organization_id", "email") WHERE "email" IS NOT NULL;--> statement-breakpoint

-- Customer refresh tokens (separate from staff refresh_tokens)
CREATE TABLE "customer_refresh_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
  "token_hash" varchar(255) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone
);--> statement-breakpoint

CREATE INDEX "customer_refresh_tokens_customer_id_idx" ON "customer_refresh_tokens" ("customer_id");
