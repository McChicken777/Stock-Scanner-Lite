-- Add lite and standard to the company_plan enum
ALTER TYPE company_plan ADD VALUE IF NOT EXISTS 'lite';
ALTER TYPE company_plan ADD VALUE IF NOT EXISTS 'standard';

-- Migrate existing 'basic' companies to 'standard'
UPDATE companies SET plan = 'standard' WHERE plan = 'basic';
