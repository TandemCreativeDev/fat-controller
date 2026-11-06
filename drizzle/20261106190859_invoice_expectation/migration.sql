CREATE TABLE "invoice_expectation" (
	"invoice_key" text PRIMARY KEY,
	"excluded" boolean DEFAULT false NOT NULL,
	"expected_on" date,
	"note" text,
	"created_by" text
);
--> statement-breakpoint
ALTER TABLE "invoice_expectation" ADD CONSTRAINT "invoice_expectation_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;