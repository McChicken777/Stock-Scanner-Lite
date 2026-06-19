-- Per-company SMTP so each tenant sends order emails from their own address
ALTER TABLE companies ADD COLUMN IF NOT EXISTS smtp_host TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS smtp_port INTEGER;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS smtp_user TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS smtp_pass_enc TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS email_from_name TEXT;
