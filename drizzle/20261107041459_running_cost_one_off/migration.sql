CREATE TABLE "running_cost_one_off" (
	"source_id" text PRIMARY KEY,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "running_cost_one_off" ADD CONSTRAINT "running_cost_one_off_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;