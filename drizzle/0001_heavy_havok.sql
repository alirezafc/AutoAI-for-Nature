CREATE TABLE "post_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"label" text DEFAULT 'Edited by human' NOT NULL,
	"actor" text DEFAULT 'admin' NOT NULL,
	"title" text,
	"excerpt" text,
	"content" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_revisions_post_idx" ON "post_revisions" USING btree ("post_id");