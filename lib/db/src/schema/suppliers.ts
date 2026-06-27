import { pgTable, text, timestamp, integer, serial, uniqueIndex } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const suppliersTable = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  notes: text("notes"),
  orderMethod: text("order_method").notNull().default("email"),
  storeUrl: text("store_url"),
  storePlatform: text("store_platform"),
  // Language for order emails sent to this supplier ('en' | 'sl').
  language: text("language").notNull().default("en"),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Supplier = typeof suppliersTable.$inferSelect;

export const supplierCategoriesTable = pgTable("supplier_categories", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
}, (t) => ({
  uniq: uniqueIndex("supplier_categories_uniq").on(t.supplierId, t.category, t.companyId),
}));
