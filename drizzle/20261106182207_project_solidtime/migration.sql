CREATE TABLE "project_solidtime" (
	"solidtime_project_id" uuid PRIMARY KEY,
	"project_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" DROP CONSTRAINT "project_solidtime_project_id_key";--> statement-breakpoint
ALTER TABLE "project" DROP COLUMN "solidtime_project_id";--> statement-breakpoint
ALTER TABLE "project_solidtime" ADD CONSTRAINT "project_solidtime_project_id_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE;