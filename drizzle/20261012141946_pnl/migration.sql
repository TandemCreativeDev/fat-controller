CREATE TABLE "account_group" (
	"account_id" uuid PRIMARY KEY,
	"group" text NOT NULL,
	"source" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xero_pnl_line" (
	"period_start" date,
	"account_id" uuid,
	"account_name" text NOT NULL,
	"section" text NOT NULL,
	"amount" numeric(14,2) NOT NULL,
	CONSTRAINT "xero_pnl_line_pkey" PRIMARY KEY("period_start","account_id")
);
--> statement-breakpoint
ALTER TABLE "account_group" ADD CONSTRAINT "account_group_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE VIEW "v_pnl_monthly" AS (
  with months as (
    select generate_series(
      date_trunc('month', now() at time zone 'Europe/London') - interval '12 months',
      date_trunc('month', now() at time zone 'Europe/London'),
      interval '1 month'
    )::date as month
  ),
  rate as (
    select coalesce(
      (select (value #>> '{}')::numeric from settings where key = 'ct_set_aside_rate'),
      0.2
    ) as r
  ),
  agg as (
    select
      l.period_start,
      coalesce(sum(l.amount) filter (where g."group" = 'sales'), 0) as sales,
      coalesce(sum(l.amount) filter (where g."group" = 'people'), 0) as people,
      coalesce(sum(l.amount) filter (where g."group" = 'other'), 0) as other
    from xero_pnl_line l
    join account_group g on g.account_id = l.account_id
    group by l.period_start
  ),
  snap as (
    select period_start, max(fetched_at) as as_of
    from xero_report_snapshot
    where report = 'ProfitAndLoss'
    group by period_start
  )
  select
    m.month,
    coalesce(a.sales, 0)::numeric(14, 2) as sales,
    coalesce(a.people, 0)::numeric(14, 2) as people_costs,
    coalesce(a.other, 0)::numeric(14, 2) as other_costs,
    (coalesce(a.sales, 0) - coalesce(a.people, 0) - coalesce(a.other, 0))::numeric(14, 2) as profit,
    case when coalesce(a.sales, 0) <> 0
      then round((a.sales - a.people - a.other) / a.sales, 4)
    end as margin,
    round(coalesce(a.sales, 0) * rate.r, 2)::numeric(14, 2) as ct_set_aside,
    s.as_of
  from months m
  cross join rate
  left join agg a on a.period_start = m.month
  left join snap s on s.period_start = m.month
  order by m.month
);