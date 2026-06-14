-- Add worker-facing display name to raw materials
-- e.g. grade "42CrMo4" → display name "Chrome-moly" (what floor workers call it)
ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS display_name TEXT;
