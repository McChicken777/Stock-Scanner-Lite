-- Migration 0020: Worker restock requests

CREATE TYPE restock_request_status AS ENUM ('pending','approved','ordered','dismissed');

CREATE TABLE restock_requests (
  id                serial PRIMARY KEY,
  company_id        integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id           integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id        integer REFERENCES products(id) ON DELETE SET NULL,
  product_name      text NOT NULL,
  quantity          integer NOT NULL,
  notes             text,
  status            restock_request_status NOT NULL DEFAULT 'pending',
  created_at        timestamp NOT NULL DEFAULT now(),
  resolved_at       timestamp
);

CREATE INDEX restock_requests_company_status_idx ON restock_requests (company_id, status);
