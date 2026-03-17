ALTER TABLE "organizations" ADD COLUMN "gst_rate" double precision DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_gst_free" boolean DEFAULT false NOT NULL;