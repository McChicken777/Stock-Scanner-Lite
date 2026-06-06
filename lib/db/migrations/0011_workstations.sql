-- Station types: company-defined production flow stations (Cutting, CNC, Welding, etc.)
CREATE TABLE station_types (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#6366f1',
  flow_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Physical workstations (CNC Machine 1, Bandsaw 2, …) under a station type
CREATE TABLE workstations (
  id               SERIAL PRIMARY KEY,
  company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  station_type_id  INTEGER NOT NULL REFERENCES station_types(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  priority         INTEGER NOT NULL DEFAULT 1,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link template steps to a station type
ALTER TABLE work_steps
  ADD COLUMN station_type_id INTEGER REFERENCES station_types(id) ON DELETE SET NULL;

-- Link live project steps to a station type + optionally a specific workstation
ALTER TABLE work_item_steps
  ADD COLUMN station_type_id INTEGER REFERENCES station_types(id) ON DELETE SET NULL,
  ADD COLUMN workstation_id  INTEGER REFERENCES workstations(id)  ON DELETE SET NULL;
