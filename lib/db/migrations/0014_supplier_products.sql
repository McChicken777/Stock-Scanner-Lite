CREATE TABLE IF NOT EXISTS supplier_products (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_sku TEXT,
  unit_price NUMERIC(12, 2),
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_products_supplier_product_uniq
  ON supplier_products (supplier_id, product_id);
