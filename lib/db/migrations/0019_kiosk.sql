-- Kiosk station tokens: permanent tablet ↔ workstation binding
CREATE TABLE kiosk_stations (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workstation_id integer NOT NULL REFERENCES workstations(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  label text,
  last_seen_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

-- NFC card ↔ worker mapping
CREATE TABLE nfc_cards (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  card_uid text NOT NULL UNIQUE,
  created_at timestamp NOT NULL DEFAULT now()
);

-- Web Push subscriptions for worker phone notifications
CREATE TABLE push_subscriptions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

-- 4-digit kiosk PIN per worker (hashed)
ALTER TABLE users ADD COLUMN kiosk_pin_hash text;
