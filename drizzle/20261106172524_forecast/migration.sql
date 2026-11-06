CREATE TABLE "xero_bank_transfer" (
	"bank_transfer_id" uuid PRIMARY KEY,
	"date" date,
	"from_account_id" uuid,
	"to_account_id" uuid,
	"amount" numeric(14,2),
	"from_bank_transaction_id" uuid,
	"to_bank_transaction_id" uuid,
	"status" text,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_balance" (
	"as_of" date,
	"account_id" uuid,
	"source" text,
	"period_start" date,
	"opening_gbp" numeric(14,2),
	"closing_gbp" numeric(14,2) NOT NULL,
	CONSTRAINT "bank_balance_pkey" PRIMARY KEY("as_of","account_id","source")
);
--> statement-breakpoint
CREATE TABLE "bank_holiday" (
	"date" date PRIMARY KEY,
	"title" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_adjustment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"date" date NOT NULL,
	"label" text NOT NULL,
	"amount_gbp" numeric(14,2) NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "contractor_bill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"person_id" uuid NOT NULL,
	"issued_on" date NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"amount_gbp" numeric(14,2) NOT NULL,
	"due_on" date NOT NULL,
	"pay_order" integer,
	"planned_pay_on" date,
	"paid_on" date,
	"paid_amount_gbp" numeric(14,2),
	"paid_by_bank_transaction_id" uuid,
	"paid_source" text,
	CONSTRAINT "contractor_bill_person_id_issued_on_unique" UNIQUE("person_id","issued_on")
);
--> statement-breakpoint
CREATE TABLE "contractor_payment_exclusion" (
	"bank_transaction_id" uuid PRIMARY KEY,
	"person_id" uuid NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forecast_override" (
	"project_id" uuid,
	"period_end" date,
	"days" numeric(10,4),
	"amount_gbp" numeric(14,2),
	"note" text,
	"created_by" text,
	CONSTRAINT "forecast_override_pkey" PRIMARY KEY("project_id","period_end")
);
--> statement-breakpoint
CREATE TABLE "forecast_snapshot" (
	"snapshot_date" date,
	"project_id" uuid,
	"invoice_date" date,
	"amount_gbp" numeric(14,2) NOT NULL,
	CONSTRAINT "forecast_snapshot_pkey" PRIMARY KEY("snapshot_date","project_id","invoice_date")
);
--> statement-breakpoint
CREATE TABLE "hold_back" (
	"month" date PRIMARY KEY,
	"amount_gbp" numeric(14,2) NOT NULL,
	"note" text,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "pay_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"person_id" uuid NOT NULL,
	"project_id" uuid,
	"day_rate_gbp" numeric(14,2) NOT NULL,
	CONSTRAINT "pay_rate_person_id_project_id_unique" UNIQUE NULLS NOT DISTINCT("person_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"solidtime_user_id" uuid UNIQUE,
	"solidtime_member_id" uuid,
	"xero_contact_id" uuid,
	"kind" text NOT NULL,
	"bill_cycle" text DEFAULT 'last_friday_of_month' NOT NULL,
	"bill_terms_days" integer DEFAULT 30 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"kind" text DEFAULT 'client' NOT NULL,
	"code" text UNIQUE,
	"name" text NOT NULL,
	"xero_contact_id" uuid,
	"solidtime_project_id" uuid UNIQUE,
	"charge_rate_gbp" numeric(14,2),
	"invoice_anchor_date" date,
	"invoice_interval_days" integer DEFAULT 14 NOT NULL,
	"extra_invoice_dates" date[] DEFAULT '{}'::date[] NOT NULL,
	"skipped_invoice_dates" date[] DEFAULT '{}'::date[] NOT NULL,
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solidtime_member" (
	"id" uuid PRIMARY KEY,
	"user_id" uuid NOT NULL UNIQUE,
	"name" text NOT NULL,
	"role" text,
	"is_placeholder" boolean DEFAULT false NOT NULL,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solidtime_project" (
	"id" uuid PRIMARY KEY,
	"name" text NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solidtime_time_entry" (
	"id" uuid PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"start" timestamp with time zone NOT NULL,
	"end" timestamp with time zone,
	"duration_seconds" integer NOT NULL,
	"billable" boolean NOT NULL,
	"type" text,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "xero_bank_transfer_from_idx" ON "xero_bank_transfer" ("from_bank_transaction_id");--> statement-breakpoint
CREATE INDEX "xero_bank_transfer_to_idx" ON "xero_bank_transfer" ("to_bank_transaction_id");--> statement-breakpoint
CREATE INDEX "solidtime_time_entry_start_idx" ON "solidtime_time_entry" ("start");--> statement-breakpoint
CREATE INDEX "solidtime_time_entry_project_idx" ON "solidtime_time_entry" ("project_id");--> statement-breakpoint
ALTER TABLE "contractor_bill" ADD CONSTRAINT "contractor_bill_person_id_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_payment_exclusion" ADD CONSTRAINT "contractor_payment_exclusion_person_id_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_payment_exclusion" ADD CONSTRAINT "contractor_payment_exclusion_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "forecast_override" ADD CONSTRAINT "forecast_override_project_id_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "forecast_override" ADD CONSTRAINT "forecast_override_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "forecast_snapshot" ADD CONSTRAINT "forecast_snapshot_project_id_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hold_back" ADD CONSTRAINT "hold_back_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "pay_rate" ADD CONSTRAINT "pay_rate_person_id_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pay_rate" ADD CONSTRAINT "pay_rate_project_id_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE VIEW "v_forecast_sales_invoice" AS (
  select
    invoice_id,
    invoice_number,
    contact_id,
    date as invoice_date,
    due_date,
    round(coalesce(sub_total, 0) / coalesce(nullif(currency_rate, 0), 1), 2)::numeric(14, 2) as sub_total,
    round(coalesce(total_tax, 0) / coalesce(nullif(currency_rate, 0), 1), 2)::numeric(14, 2) as total_tax,
    round(coalesce(total, 0) / coalesce(nullif(currency_rate, 0), 1), 2)::numeric(14, 2) as total,
    round(coalesce(amount_paid, 0) / coalesce(nullif(currency_rate, 0), 1), 2)::numeric(14, 2) as amount_paid,
    round(coalesce(amount_due, 0) / coalesce(nullif(currency_rate, 0), 1), 2)::numeric(14, 2) as outstanding_gbp
  from xero_invoice
  where type = 'ACCREC' and status not in ('DELETED', 'VOIDED') and date is not null
);