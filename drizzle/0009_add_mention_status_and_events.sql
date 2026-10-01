CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mentions" ADD COLUMN "status" text DEFAULT 'published' NOT NULL;--> statement-breakpoint
CREATE INDEX "events_event_created_idx" ON "events" USING btree ("event","created_at");