import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const catalogCategoriesTable = pgTable("catalog_categories", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  parentId: integer("parent_id"), // self-reference; no FK here to avoid circular import
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const catalogItemsTable = pgTable("catalog_items", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  categoryId: integer("category_id"), // FK to catalog_categories; omitted to avoid circular
  name: text("name").notNull(),
  description: text("description"),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2, mode: "number" }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CatalogCategory = typeof catalogCategoriesTable.$inferSelect;
export type CatalogItem = typeof catalogItemsTable.$inferSelect;
