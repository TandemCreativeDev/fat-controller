CREATE TABLE "custom_invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"label" text NOT NULL,
	"amount_gbp" numeric(14,2) NOT NULL,
	"contractor_cost_gbp" numeric(14,2) DEFAULT '0' NOT NULL,
	"lands_on" date NOT NULL,
	"note" text,
	"created_by" text
);
--> statement-breakpoint
ALTER TABLE "custom_invoice" ADD CONSTRAINT "custom_invoice_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;