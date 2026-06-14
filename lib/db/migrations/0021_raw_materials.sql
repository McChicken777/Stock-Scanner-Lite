-- Raw material catalogue per company
CREATE TABLE IF NOT EXISTS raw_materials (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  unit        TEXT NOT NULL DEFAULT 'kg',
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link templates to a raw material + qty per piece
ALTER TABLE work_templates
  ADD COLUMN IF NOT EXISTS raw_material_id      INTEGER REFERENCES raw_materials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS material_qty_per_piece NUMERIC(12,3);

-- Copy material info onto project items at job-creation time
ALTER TABLE work_project_items
  ADD COLUMN IF NOT EXISTS raw_material_id      INTEGER REFERENCES raw_materials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS material_qty_per_piece NUMERIC(12,3);
