-- Migration 0039: timestamp each quote line for price history & trends

ALTER TABLE quote_request_supplier_lines
  ADD COLUMN created_at timestamp NOT NULL DEFAULT now();

CREATE INDEX quote_request_supplier_lines_company_idx
  ON quote_request_supplier_lines (company_id);
