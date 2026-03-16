CREATE TYPE "public"."conflict_resolution" AS ENUM('server_wins', 'device_wins');--> statement-breakpoint
CREATE TABLE "sync_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid NOT NULL,
	"local_version" integer NOT NULL,
	"server_version" integer NOT NULL,
	"resolution" "conflict_resolution" NOT NULL,
	"local_data" jsonb NOT NULL,
	"server_data" jsonb NOT NULL,
	"terminal_id" varchar(255),
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_conflicts_organization_id_idx" ON "sync_conflicts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "sync_conflicts_entity_type_entity_id_idx" ON "sync_conflicts" USING btree ("entity_type","entity_id");