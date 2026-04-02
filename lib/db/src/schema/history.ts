import { pgTable, text, integer, serial, timestamp } from "drizzle-orm/pg-core";
import { locationsTable } from "./locations";
import { productsTable } from "./products";
import { companiesTable } from "./companies";

export const historyTable = pgTable("stock_history", {
  id: serial("id").primaryKey(),
  locationId: text("location_id")
    .notNull()
    .references(() => locationsTable.id, { onDelete: "cascade" }),
  productId: integer("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  previousQuantity: integer("previous_quantity").notNull(),
  newQuantity: integer("new_quantity").notNull(),
  delta: integer("delta").notNull(),
  changedBy: text("changed_by"),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "set null" }),
});

export type HistoryEntry = typeof historyTable.$inferSelect;
