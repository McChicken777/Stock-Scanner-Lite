-- Migration: attendance_logs.status column for vacation approval workflow (Task #21)
-- Idempotent.

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS status attendance_status NOT NULL DEFAULT 'approved';
