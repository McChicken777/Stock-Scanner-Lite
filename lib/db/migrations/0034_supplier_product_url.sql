-- Per-product direct store link for custom-store suppliers
ALTER TABLE supplier_products ADD COLUMN IF NOT EXISTS store_product_url TEXT;
