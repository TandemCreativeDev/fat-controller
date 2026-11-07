CREATE TABLE "running_cost_fixed" (
	"supplier_key" text PRIMARY KEY,
	"amount_gbp" numeric(14,2) NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "running_cost_fixed" ADD CONSTRAINT "running_cost_fixed_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;