import { pgTable, text, timestamp, integer, serial, pgEnum, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { relations } from "drizzle-orm";

export const itemTypeEnum = pgEnum("item_type", [
  "purchase",
  "production",
  "final_product",
  "manufactured_part",
  "purchased_part",
]);

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default(""),
  itemType: itemTypeEnum("item_type").notNull().default("purchased_part"),
  /** minStock: the reorder point — trigger reorder when available stock falls below this */
  minStock: integer("min_stock").notNull().default(0),
  bufferStock: integer("buffer_stock").notNull().default(0),
  targetStock: integer("target_stock").notNull().default(0),
  supplierId: integer("supplier_id"),
  supplierProductName: text("supplier_product_name"),
  supplierSku: text("supplier_sku"),
  alertEmail: text("alert_email"),
  // Scannable code (barcode/QR payload) so this item can be scanned directly.
  barcode: text("barcode"),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2, mode: "number" }).notNull().default(0),
  salePrice: numeric("sale_price", { precision: 12, scale: 2, mode: "number" }).notNull().default(0),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;

export const productComponentsTable = pgTable("product_components", {
  id: serial("id").primaryKey(),
  parentProductId: integer("parent_product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  componentProductId: integer("component_product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const productProceduresTable = pgTable("product_procedures", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  roleId: integer("role_id"),
  batchMode: text("batch_mode").notNull().default("individual"),
  durationEstimate: integer("duration_estimate"),
});

export const productsRelations = relations(productsTable, ({ many }) => ({
  components: many(productComponentsTable, { relationName: "parentComponents" }),
  usedIn: many(productComponentsTable, { relationName: "childComponents" }),
  procedures: many(productProceduresTable),
}));

export const productComponentsRelations = relations(productComponentsTable, ({ one }) => ({
  parent: one(productsTable, { fields: [productComponentsTable.parentProductId], references: [productsTable.id], relationName: "parentComponents" }),
  component: one(productsTable, { fields: [productComponentsTable.componentProductId], references: [productsTable.id], relationName: "childComponents" }),
}));

export const productProceduresRelations = relations(productProceduresTable, ({ one }) => ({
  product: one(productsTable, { fields: [productProceduresTable.productId], references: [productsTable.id] }),
}));
