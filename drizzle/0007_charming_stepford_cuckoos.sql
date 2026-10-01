CREATE TABLE "merge_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"winner_id" bigint NOT NULL,
	"loser_id" bigint NOT NULL,
	"loser_slug" text NOT NULL,
	"loser_name" text NOT NULL,
	"loser_location" text,
	"loser_street" text,
	"loser_lat" real,
	"loser_lng" real,
	"moved_mention_ids" bigint[] NOT NULL,
	"deleted_mention_ids" bigint[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_aliases" (
	"slug" text PRIMARY KEY NOT NULL,
	"restaurant_id" bigint NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "restaurant_aliases" ADD CONSTRAINT "restaurant_aliases_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;