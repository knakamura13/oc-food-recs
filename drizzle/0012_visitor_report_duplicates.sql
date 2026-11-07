ALTER TABLE "visitor_reports" DROP CONSTRAINT "visitor_reports_type_check";--> statement-breakpoint
ALTER TABLE "visitor_reports" ADD COLUMN "duplicate_restaurant_id" bigint;--> statement-breakpoint
ALTER TABLE "visitor_reports" ADD COLUMN "duplicate_name" text;--> statement-breakpoint
ALTER TABLE "visitor_reports" ADD COLUMN "duplicate_slug" text;--> statement-breakpoint
ALTER TABLE "visitor_reports" ADD COLUMN "subject_name" text;--> statement-breakpoint
ALTER TABLE "visitor_reports" ADD COLUMN "subject_slug" text;--> statement-breakpoint
ALTER TABLE "visitor_reports" ADD CONSTRAINT "visitor_reports_duplicate_restaurant_id_restaurants_id_fk" FOREIGN KEY ("duplicate_restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_reports" ADD CONSTRAINT "visitor_reports_type_check" CHECK ("visitor_reports"."type" IN ('closed', 'moved', 'wrong_detail', 'chain', 'duplicate'));