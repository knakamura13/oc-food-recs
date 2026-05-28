CREATE TABLE "mentions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"restaurant_id" bigint NOT NULL,
	"thread_id" text NOT NULL,
	"comment_id" text NOT NULL,
	"permalink" text,
	"author" text NOT NULL,
	"body" text NOT NULL,
	"score" integer NOT NULL,
	"role" text NOT NULL,
	"classification" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"location" text,
	"cuisine" text,
	"lat" real,
	"lng" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" text PRIMARY KEY NOT NULL,
	"subreddit" text NOT NULL,
	"post_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"comment_count" integer NOT NULL,
	"max_depth" integer NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"included_in_publish" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mentions_thread_comment_restaurant_unique" ON "mentions" USING btree ("thread_id","comment_id","restaurant_id");--> statement-breakpoint
CREATE INDEX "mentions_restaurant_idx" ON "mentions" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "mentions_thread_idx" ON "mentions" USING btree ("thread_id");