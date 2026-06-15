import { pgTable, text, integer, numeric, primaryKey } from "drizzle-orm/pg-core";
import { locationsTable } from "./locations";
import { productsTable } from "./products";

export const stockTable = pgTable(
  "stock",
  {
    locationId: text("location_id")
      .notNull()
      .references(() => locationsTable.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    // Numeric so fractional stock (mm/m/kg/L) is supported, not just whole units.
    quantity: numeric("quantity", { precision: 14, scale: 3, mode: "number" }).notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.locationId, table.productId] })]
);

export type Stock = typeof stockTable.$inferSelect;
