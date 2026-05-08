-- Migration: BOM parent hierarchy + step-level DAG dependencies (Task #58)
-- Idempotent.

-- Parent-child relationship for project items (BOM hierarchy)
ALTER TABLE work_project_items
  ADD COLUMN IF NOT EXISTS parent_item_id integer REFERENCES work_project_items(id) ON DELETE CASCADE;

-- Step-to-step explicit dependency graph (DAG)
CREATE TABLE IF NOT EXISTS step_dependencies (
  id serial PRIMARY KEY,
  blocker_step_id integer NOT NULL REFERENCES work_item_steps(id) ON DELETE CASCADE,
  blocked_step_id integer NOT NULL REFERENCES work_item_steps(id) ON DELETE CASCADE,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE(blocker_step_id, blocked_step_id)
);

CREATE INDEX IF NOT EXISTS idx_step_dep_blocked ON step_dependencies(blocked_step_id);
CREATE INDEX IF NOT EXISTS idx_step_dep_blocker ON step_dependencies(blocker_step_id);
CREATE INDEX IF NOT EXISTS idx_step_dep_company ON step_dependencies(company_id);
