import { pgTable, text, integer, primaryKey } from "drizzle-orm/pg-core";
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
    quantity: integer("quantity").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.locationId, table.productId] })]
);

export type Stock = typeof stockTable.$inferSelect;
