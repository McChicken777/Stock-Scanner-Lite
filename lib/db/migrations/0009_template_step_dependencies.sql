-- Migration: template-level step dependencies
-- Defines execution order within a template; auto-copied to live step_dependencies on project creation.
-- Idempotent.

CREATE TABLE IF NOT EXISTS template_step_dependencies (
  id serial PRIMARY KEY,
  template_id integer NOT NULL REFERENCES work_templates(id) ON DELETE CASCADE,
  blocker_step_id integer NOT NULL REFERENCES work_steps(id) ON DELETE CASCADE,
  blocked_step_id integer NOT NULL REFERENCES work_steps(id) ON DELETE CASCADE,
  UNIQUE(blocker_step_id, blocked_step_id)
);

CREATE INDEX IF NOT EXISTS idx_tmpl_step_dep_template ON template_step_dependencies(template_id);
CREATE INDEX IF NOT EXISTS idx_tmpl_step_dep_blocker ON template_step_dependencies(blocker_step_id);
CREATE INDEX IF NOT EXISTS idx_tmpl_step_dep_blocked ON template_step_dependencies(blocked_step_id);
