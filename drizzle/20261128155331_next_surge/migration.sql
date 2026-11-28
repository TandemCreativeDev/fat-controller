CREATE TABLE "reserve_repayment" (
	"month" date PRIMARY KEY,
	"amount_gbp" numeric(14,2) NOT NULL,
	"created_by" text
);
--> statement-breakpoint
ALTER TABLE "reserve_repayment" ADD CONSTRAINT "reserve_repayment_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;