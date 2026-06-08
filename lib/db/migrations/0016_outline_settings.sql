-- Add outline_settings JSONB column to companies for the smart template outline editor
ALTER TABLE companies ADD COLUMN IF NOT EXISTS outline_settings JSONB NOT NULL DEFAULT '{}';
