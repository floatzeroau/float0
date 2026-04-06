ALTER TYPE "public"."order_status" ADD VALUE 'submitted' BEFORE 'completed';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'in_progress' BEFORE 'completed';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'ready' BEFORE 'completed';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'cancelled' BEFORE 'refunded';--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "discount_amount" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "discount_type" varchar(50);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "discount_value" double precision;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "discount_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_type" varchar(50);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_value" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "held_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "receipt_json" text;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "variance_notes" text;