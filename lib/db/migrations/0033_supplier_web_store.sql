-- Add web store ordering fields to suppliers
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS order_method TEXT NOT NULL DEFAULT 'email';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS store_url TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS store_platform TEXT;

-- Add per-product store product ID to supplier_products
ALTER TABLE supplier_products ADD COLUMN IF NOT EXISTS store_product_id TEXT;
