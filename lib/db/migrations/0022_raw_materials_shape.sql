-- Add shape, profile and future stock fields to raw_materials
ALTER TABLE raw_materials
  ADD COLUMN IF NOT EXISTS shape       TEXT,
  ADD COLUMN IF NOT EXISTS profile     TEXT,
  ADD COLUMN IF NOT EXISTS profile_mm  NUMERIC(10,2),
  -- stock_mm reserved for future cutting-list / stock tracking feature
  -- stores length in mm for rods/bars, piece count for sheets
  ADD COLUMN IF NOT EXISTS stock_mm    NUMERIC(12,2);

-- Change default unit from kg to mm (most raw stock is tracked by length)
ALTER TABLE raw_materials ALTER COLUMN unit SET DEFAULT 'mm';
