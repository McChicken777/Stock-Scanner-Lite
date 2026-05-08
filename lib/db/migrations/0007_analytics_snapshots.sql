CREATE TABLE IF NOT EXISTS "analytics_snapshots" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "triggered_by" text DEFAULT 'cron' NOT NULL,
  "insights" jsonb DEFAULT '[]' NOT NULL,
  "charts" jsonb DEFAULT '{}' NOT NULL
);
