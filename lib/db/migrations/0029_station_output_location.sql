ALTER TABLE station_types
  ADD COLUMN IF NOT EXISTS default_output_location_id TEXT REFERENCES locations(id) ON DELETE SET NULL;
