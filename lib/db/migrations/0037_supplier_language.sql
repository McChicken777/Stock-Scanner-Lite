-- Language used when emailing this supplier their orders ('en' | 'sl')
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';
