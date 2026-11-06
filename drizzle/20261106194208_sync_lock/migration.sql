CREATE TABLE "sync_lock" (
	"id" text PRIMARY KEY DEFAULT 'sync',
	"token" uuid NOT NULL,
	"locked_until" timestamp with time zone NOT NULL
);
