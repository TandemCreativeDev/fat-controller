CREATE TABLE "reserve_correction" (
	"source_id" text PRIMARY KEY,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reserve_correction" ADD CONSTRAINT "reserve_correction_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fc_analyst') THEN GRANT SELECT ON "reserve_correction" TO fc_analyst; END IF; END $$;
