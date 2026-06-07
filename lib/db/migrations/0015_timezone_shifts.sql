-- Add timezone to companies (IANA timezone string, defaults to UTC)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

-- Company shifts table
CREATE TABLE IF NOT EXISTS company_shifts (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  start_time  TEXT NOT NULL,  -- HH:MM 24h
  end_time    TEXT NOT NULL,  -- HH:MM 24h
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Assign a shift to a user (nullable — unassigned means no fixed shift)
ALTER TABLE users ADD COLUMN IF NOT EXISTS shift_id INTEGER REFERENCES company_shifts(id) ON DELETE SET NULL;
