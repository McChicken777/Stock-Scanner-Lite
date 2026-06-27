-- Migration 0038: Supplier quote requests (RFQ) — sourcing & comparison

CREATE TYPE quote_request_status AS ENUM ('open','ordered','cancelled');
CREATE TYPE quote_request_supplier_status AS ENUM ('invited','submitted','declined');

CREATE TABLE quote_requests (
  id                   serial PRIMARY KEY,
  company_id           integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status               quote_request_status NOT NULL DEFAULT 'open',
  note                 text,
  created_by_user_id   integer REFERENCES users(id) ON DELETE SET NULL,
  decided_supplier_id  integer REFERENCES suppliers(id) ON DELETE SET NULL,
  po_id                integer REFERENCES purchase_orders(id) ON DELETE SET NULL,
  created_at           timestamp NOT NULL DEFAULT now()
);

CREATE TABLE quote_request_items (
  id            serial PRIMARY KEY,
  rfq_id        integer NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
  product_id    integer REFERENCES products(id) ON DELETE SET NULL,
  product_name  text NOT NULL,
  quantity      integer NOT NULL DEFAULT 1,
  flag_id       integer REFERENCES shortage_flags(id) ON DELETE SET NULL,
  company_id    integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE quote_request_suppliers (
  id              serial PRIMARY KEY,
  rfq_id          integer NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
  supplier_id     integer NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  token           text NOT NULL UNIQUE,
  status          quote_request_supplier_status NOT NULL DEFAULT 'invited',
  lead_time_days  integer,
  note            text,
  submitted_at    timestamp,
  company_id      integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE quote_request_supplier_lines (
  id                 serial PRIMARY KEY,
  rfq_supplier_id    integer NOT NULL REFERENCES quote_request_suppliers(id) ON DELETE CASCADE,
  rfq_item_id        integer NOT NULL REFERENCES quote_request_items(id) ON DELETE CASCADE,
  unit_price         numeric(12,2),
  supplier_sku       text,
  company_id         integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX quote_requests_company_status_idx ON quote_requests (company_id, status);
CREATE INDEX quote_request_items_rfq_idx ON quote_request_items (rfq_id);
CREATE INDEX quote_request_suppliers_rfq_idx ON quote_request_suppliers (rfq_id);
CREATE INDEX quote_request_supplier_lines_supplier_idx ON quote_request_supplier_lines (rfq_supplier_id);
