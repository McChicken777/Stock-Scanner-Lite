-- Allow fractional stock quantities so raw materials measured in mm/m/kg/L can be
-- tracked accurately (e.g. 2.5 m, 1250.5 mm). Integers stay valid.
ALTER TABLE stock         ALTER COLUMN quantity          TYPE NUMERIC(14,3) USING quantity::numeric;
ALTER TABLE stock         ALTER COLUMN quantity          SET DEFAULT 0;

ALTER TABLE stock_history ALTER COLUMN previous_quantity TYPE NUMERIC(14,3) USING previous_quantity::numeric;
ALTER TABLE stock_history ALTER COLUMN new_quantity       TYPE NUMERIC(14,3) USING new_quantity::numeric;
ALTER TABLE stock_history ALTER COLUMN delta              TYPE NUMERIC(14,3) USING delta::numeric;
