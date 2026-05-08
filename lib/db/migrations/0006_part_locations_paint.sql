-- Task #60: dedicated part_locations table and size_weight field on work_item_steps

-- New part_locations table: richer model for tracking component locations after step completion.
-- Includes itemId (component reference) and notes, unlike the legacy wip_locations table.
CREATE TABLE IF NOT EXISTS part_locations (
  id serial PRIMARY KEY,
  step_id integer NOT NULL REFERENCES work_item_steps(id) ON DELETE CASCADE,
  item_id integer NOT NULL REFERENCES work_project_items(id) ON DELETE CASCADE,
  location_type wip_location_type NOT NULL,
  location_value text,
  notes text,
  set_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  set_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS part_locations_step_id_idx ON part_locations(step_id);
CREATE INDEX IF NOT EXISTS part_locations_item_id_idx ON part_locations(item_id);

-- Size/weight free text field on each work item step (e.g. "Small", "5 kg", "Large panel")
ALTER TABLE work_item_steps ADD COLUMN IF NOT EXISTS size_weight text;
