CREATE TABLE "geocode_cache" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"query" text NOT NULL,
	"provider" text NOT NULL,
	"lat" real,
	"lng" real,
	"detail" text,
	"geocoded_city" text,
	"retry_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "geocode_cache_query_unique" ON "geocode_cache" USING btree ("query");