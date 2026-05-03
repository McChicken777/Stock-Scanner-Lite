-- Migration: customers + quotes (Task #28)
-- Idempotent. Hand-written because this repo has historically used
-- `drizzle-kit push` for schema sync; this is the first committed
-- migration file and only contains the new objects introduced by
-- the customers/quotes feature.

DO $$ BEGIN
  CREATE TYPE quote_status AS ENUM ('draft', 'sent', 'approved', 'rejected', 'converted');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS customers (
  id serial PRIMARY KEY,
  name text NOT NULL,
  contact_person text,
  email text,
  phone text,
  address text,
  notes text,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotes (
  id serial PRIMARY KEY,
  quote_number text NOT NULL,
  status quote_status NOT NULL DEFAULT 'draft',
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text,
  customer_contact text,
  customer_email text,
  customer_phone text,
  customer_address text,
  valid_until timestamp,
  notes text,
  terms text,
  subtotal numeric(12, 2) NOT NULL DEFAULT 0,
  discount numeric(12, 2) NOT NULL DEFAULT 0,
  tax_rate numeric(5, 2) NOT NULL DEFAULT 0,
  tax_amount numeric(12, 2) NOT NULL DEFAULT 0,
  total numeric(12, 2) NOT NULL DEFAULT 0,
  work_project_id integer REFERENCES work_projects(id) ON DELETE SET NULL,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quote_items (
  id serial PRIMARY KEY,
  quote_id integer NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_id integer REFERENCES products(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  quantity numeric(12, 2) NOT NULL DEFAULT 1,
  unit_price numeric(12, 2) NOT NULL DEFAULT 0,
  line_total numeric(12, 2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quote_revisions (
  id serial PRIMARY KEY,
  quote_id integer NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  revision_number integer NOT NULL DEFAULT 1,
  snapshot jsonb NOT NULL,
  note text,
  created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customers_company_id_idx ON customers(company_id);
CREATE INDEX IF NOT EXISTS quotes_company_id_idx ON quotes(company_id);
CREATE INDEX IF NOT EXISTS quotes_customer_id_idx ON quotes(customer_id);
CREATE INDEX IF NOT EXISTS quotes_work_project_id_idx ON quotes(work_project_id);
CREATE INDEX IF NOT EXISTS quote_items_quote_id_idx ON quote_items(quote_id);
CREATE INDEX IF NOT EXISTS quote_revisions_quote_id_idx ON quote_revisions(quote_id);

-- Guarantee uniqueness of generated quote numbers per company so
-- concurrent creates can never reuse a number (the server retries
-- on conflict).
CREATE UNIQUE INDEX IF NOT EXISTS quotes_company_quote_number_uq
  ON quotes(company_id, quote_number);
