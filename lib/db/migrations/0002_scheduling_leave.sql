-- Migration: scheduling rules + leave requests (Task #32)
-- Idempotent.

-- Add scheduling columns to companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS weekend_overtime_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS country text;

-- Company holidays table
CREATE TABLE IF NOT EXISTS company_holidays (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  date date NOT NULL,
  label text NOT NULL DEFAULT 'Holiday'
);
CREATE INDEX IF NOT EXISTS company_holidays_company_date_idx ON company_holidays(company_id, date);

-- Leave request enums
DO $$ BEGIN
  CREATE TYPE leave_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE leave_type AS ENUM ('sick', 'vacation');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Leave requests table
CREATE TABLE IF NOT EXISTS leave_requests (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type leave_type NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status leave_status NOT NULL DEFAULT 'pending',
  manager_note text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leave_requests_company_user_idx ON leave_requests(company_id, user_id);
CREATE INDEX IF NOT EXISTS leave_requests_company_status_idx ON leave_requests(company_id, status);
