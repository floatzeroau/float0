ALTER TABLE "order_items" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "void_reason" text;