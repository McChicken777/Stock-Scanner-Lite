CREATE TABLE supplier_categories (
  id serial PRIMARY KEY,
  supplier_id integer NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  category text NOT NULL,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE (supplier_id, category, company_id)
);
CREATE INDEX ON supplier_categories (company_id, category);
