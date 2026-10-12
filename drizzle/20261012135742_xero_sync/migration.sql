CREATE TABLE "sync_cursor" (
	"resource" text PRIMARY KEY,
	"modified_since" timestamp with time zone,
	"next_page" integer,
	"high_water" timestamp with time zone,
	"last_completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync_run" (
	"id" serial PRIMARY KEY,
	"trigger" text NOT NULL,
	"resource" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"rows_changed" integer DEFAULT 0 NOT NULL,
	"api_calls" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "xero_account" (
	"account_id" uuid PRIMARY KEY,
	"code" text,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"class" text,
	"tax_type" text,
	"status" text,
	"updated_at" timestamp with time zone,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xero_bank_transaction" (
	"bank_transaction_id" uuid PRIMARY KEY,
	"type" text NOT NULL,
	"contact_id" uuid,
	"bank_account_id" uuid,
	"date" date,
	"status" text,
	"reference" text,
	"is_reconciled" boolean,
	"sub_total" numeric(14,2),
	"total_tax" numeric(14,2),
	"total" numeric(14,2),
	"currency_code" text,
	"currency_rate" numeric(18,10),
	"updated_at" timestamp with time zone,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xero_connection" (
	"id" text PRIMARY KEY DEFAULT 'xero',
	"tenant_id" uuid NOT NULL,
	"tenant_name" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"access_token_enc" text,
	"access_token_expires_at" timestamp with time zone,
	"scopes" text NOT NULL,
	"connected_by" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_refreshed_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "xero_contact" (
	"contact_id" uuid PRIMARY KEY,
	"name" text NOT NULL,
	"is_customer" boolean DEFAULT false NOT NULL,
	"is_supplier" boolean DEFAULT false NOT NULL,
	"status" text,
	"updated_at" timestamp with time zone,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xero_credit_note" (
	"credit_note_id" uuid PRIMARY KEY,
	"type" text NOT NULL,
	"credit_note_number" text,
	"contact_id" uuid,
	"date" date,
	"status" text NOT NULL,
	"sub_total" numeric(14,2),
	"total_tax" numeric(14,2),
	"total" numeric(14,2),
	"remaining_credit" numeric(14,2),
	"currency_code" text,
	"currency_rate" numeric(18,10),
	"updated_at" timestamp with time zone,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xero_invoice" (
	"invoice_id" uuid PRIMARY KEY,
	"type" text NOT NULL,
	"invoice_number" text,
	"reference" text,
	"contact_id" uuid,
	"date" date,
	"due_date" date,
	"status" text NOT NULL,
	"line_amount_types" text,
	"sub_total" numeric(14,2),
	"total_tax" numeric(14,2),
	"total" numeric(14,2),
	"amount_due" numeric(14,2),
	"amount_paid" numeric(14,2),
	"amount_credited" numeric(14,2),
	"currency_code" text,
	"currency_rate" numeric(18,10),
	"fully_paid_on_date" date,
	"updated_at" timestamp with time zone,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xero_invoice_line" (
	"line_item_id" uuid PRIMARY KEY,
	"invoice_id" uuid NOT NULL,
	"description" text,
	"account_code" text,
	"quantity" numeric(18,4),
	"unit_amount" numeric(18,4),
	"line_amount" numeric(14,2),
	"tax_amount" numeric(14,2),
	"tax_type" text,
	"tracking" jsonb DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xero_manual_journal" (
	"manual_journal_id" uuid PRIMARY KEY,
	"date" date,
	"status" text,
	"narration" text,
	"updated_at" timestamp with time zone,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xero_organisation" (
	"organisation_id" uuid PRIMARY KEY,
	"name" text NOT NULL,
	"base_currency" text NOT NULL,
	"financial_year_end_day" integer,
	"financial_year_end_month" integer,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xero_payment" (
	"payment_id" uuid PRIMARY KEY,
	"invoice_id" uuid,
	"credit_note_id" uuid,
	"payment_type" text,
	"date" date,
	"amount" numeric(14,2),
	"currency_rate" numeric(18,10),
	"bank_account_id" uuid,
	"status" text,
	"updated_at" timestamp with time zone,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xero_report_snapshot" (
	"id" serial PRIMARY KEY,
	"report" text NOT NULL,
	"period_start" date,
	"period_end" date,
	"params" jsonb DEFAULT '{}' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sync_run_started_at_idx" ON "sync_run" ("started_at");--> statement-breakpoint
CREATE INDEX "xero_bank_transaction_date_idx" ON "xero_bank_transaction" ("date");--> statement-breakpoint
CREATE INDEX "xero_invoice_contact_idx" ON "xero_invoice" ("contact_id");--> statement-breakpoint
CREATE INDEX "xero_invoice_type_date_idx" ON "xero_invoice" ("type","date");--> statement-breakpoint
CREATE INDEX "xero_invoice_line_invoice_idx" ON "xero_invoice_line" ("invoice_id");--> statement-breakpoint
CREATE INDEX "xero_payment_invoice_idx" ON "xero_payment" ("invoice_id");--> statement-breakpoint
CREATE INDEX "xero_report_snapshot_report_idx" ON "xero_report_snapshot" ("report","fetched_at");--> statement-breakpoint
ALTER TABLE "xero_connection" ADD CONSTRAINT "xero_connection_connected_by_user_id_fkey" FOREIGN KEY ("connected_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "xero_invoice_line" ADD CONSTRAINT "xero_invoice_line_invoice_id_xero_invoice_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "xero_invoice"("invoice_id") ON DELETE CASCADE;