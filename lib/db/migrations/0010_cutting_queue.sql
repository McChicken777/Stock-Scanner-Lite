-- Add material consumption tracking to template steps and live steps
ALTER TABLE work_steps
  ADD COLUMN IF NOT EXISTS consumes_product_id integer REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consumes_quantity numeric(12,3) NOT NULL DEFAULT 0;

ALTER TABLE work_item_steps
  ADD COLUMN IF NOT EXISTS consumes_product_id integer REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consumes_quantity numeric(12,3) NOT NULL DEFAULT 0;

-- Link work project items back to their source product (enables cutting queue routing)
ALTER TABLE work_project_items
  ADD COLUMN IF NOT EXISTS product_id integer REFERENCES products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_steps_consumes ON work_steps(consumes_product_id) WHERE consumes_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_item_steps_consumes ON work_item_steps(consumes_product_id) WHERE consumes_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_project_items_product ON work_project_items(product_id) WHERE product_id IS NOT NULL;
