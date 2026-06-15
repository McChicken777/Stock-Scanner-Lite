-- Link each raw-material size to a products row so it becomes a real stock item
-- (trackable quantity + location + valuation + scanning). The product is created
-- automatically by the API; this column ties the catalogue entry to its stock item.
ALTER TABLE raw_materials
  ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES products(id) ON DELETE SET NULL;
