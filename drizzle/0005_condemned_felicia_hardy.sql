CREATE TABLE "excluded_brands" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"brand_name" text NOT NULL,
	"reason" text NOT NULL,
	"group_name" text,
	"normalized_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "excluded_brands_normalized_name_unique" UNIQUE("normalized_name")
);
--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "exclusion_reason" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "reviewed_at" timestamp with time zone;