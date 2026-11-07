CREATE TABLE "visitor_reports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"restaurant_id" bigint NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"proposed_name" text,
	"proposed_location" text,
	"proposed_street" text,
	"proposed_cuisine" text,
	"proposed_lat" real,
	"proposed_lng" real,
	"proposed_maps_url" text,
	"field_decisions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "visitor_reports_type_check" CHECK ("visitor_reports"."type" IN ('closed', 'moved', 'wrong_detail', 'chain')),
	CONSTRAINT "visitor_reports_status_check" CHECK ("visitor_reports"."status" IN ('pending', 'accepted', 'dismissed'))
);
--> statement-breakpoint
ALTER TABLE "visitor_reports" ADD CONSTRAINT "visitor_reports_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visitor_reports_restaurant_idx" ON "visitor_reports" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "visitor_reports_status_created_idx" ON "visitor_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "visitor_reports_one_pending" ON "visitor_reports" USING btree ("restaurant_id","type") WHERE "visitor_reports"."status" = 'pending';