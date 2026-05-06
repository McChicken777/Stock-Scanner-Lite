-- Migration: auto-closed attendance flag (Task #23)
-- Idempotent.

ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS auto_closed boolean NOT NULL DEFAULT false;

ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS auto_close_acknowledged_at timestamp;
