-- Record WHY stock changed (received / consumed / counted / adjusted / transfer_*)
-- alongside the existing who (changed_by), for an auditable movement log.
ALTER TABLE stock_history ADD COLUMN IF NOT EXISTS reason TEXT;

-- Scannable code for items so a worker can scan a product/material label (not just
-- a bin) and act on it directly.
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;
CREATE INDEX IF NOT EXISTS products_company_barcode_idx ON products (company_id, barcode);
