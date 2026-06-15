-- Lite quote lifecycle ends at "Delivered" (parts made + handed over) so shops can
-- track done vs outstanding work without pushing quotes into production.
ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'delivered';
