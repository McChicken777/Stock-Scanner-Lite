-- Add email + email_verified to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Company invite tokens (owner creates, fabricators use to self-register)
CREATE TABLE IF NOT EXISTS company_invites (
  id SERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  company_name TEXT,
  plan TEXT NOT NULL DEFAULT 'lite',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
