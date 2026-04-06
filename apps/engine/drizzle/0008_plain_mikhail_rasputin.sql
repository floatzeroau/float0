CREATE TYPE "public"."cash_movement_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"direction" "cash_movement_direction" NOT NULL,
	"amount" double precision NOT NULL,
	"reason" varchar(255) NOT NULL,
	"staff_id" uuid NOT NULL,
	"manager_approver_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "address" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "website" varchar(255);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "logo" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "tendered_amount" double precision;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "change_given" double precision;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "rounding_amount" double precision;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "card_type" varchar(50);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "last_four" varchar(4);--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_movements_organization_id_idx" ON "cash_movements" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "cash_movements_shift_id_idx" ON "cash_movements" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "cash_movements_updated_at_idx" ON "cash_movements" USING btree ("updated_at");