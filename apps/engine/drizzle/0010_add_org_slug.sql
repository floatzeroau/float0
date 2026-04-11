ALTER TABLE "organizations" ADD COLUMN "slug" varchar(100);--> statement-breakpoint

-- Back-fill existing orgs: use lower-cased name with non-alnum replaced by hyphens
UPDATE "organizations"
SET "slug" = LOWER(
  TRIM(BOTH '-' FROM REGEXP_REPLACE(REGEXP_REPLACE("name", '[^a-zA-Z0-9]+', '-', 'g'), '-{2,}', '-', 'g'))
)
WHERE "slug" IS NULL;--> statement-breakpoint

-- Handle any empty slugs from the backfill
UPDATE "organizations"
SET "slug" = 'org-' || LEFT(id::text, 8)
WHERE "slug" IS NULL OR LENGTH("slug") < 3;--> statement-breakpoint

-- Make column NOT NULL and add unique constraint
ALTER TABLE "organizations" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_slug_unique" UNIQUE("slug");
