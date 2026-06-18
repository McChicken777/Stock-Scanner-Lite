-- Per-product web-store link, set on the product page for web-store suppliers
ALTER TABLE products ADD COLUMN IF NOT EXISTS store_product_url TEXT;
