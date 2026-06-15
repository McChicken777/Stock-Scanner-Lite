-- Company branding for quote PDFs: a logo (base64 data URL) and a typed signer name.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS quote_signer_name TEXT;
