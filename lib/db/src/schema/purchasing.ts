import { pgTable, text, timestamp, integer, serial, pgEnum, varchar, numeric } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { productsTable } from "./products";
import { suppliersTable } from "./suppliers";
import { usersTable } from "./users";
import { relations } from "drizzle-orm";

export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", [
  "draft", "ordered", "partially_arrived", "arrived", "cancelled",
]);

export const purchaseOrdersTable = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").references(() => suppliersTable.id, { onDelete: "set null" }),
  status: purchaseOrderStatusEnum("status").notNull().default("draft"),
  expectedDate: timestamp("expected_date"),
  notes: text("notes"),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const purchaseOrderItemsTable = pgTable("purchase_order_items", {
  id: serial("id").primaryKey(),
  poId: integer("po_id").notNull().references(() => purchaseOrdersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  quantityOrdered: integer("quantity_ordered").notNull().default(1),
  quantityArrived: integer("quantity_arrived").notNull().default(0),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2, mode: "number" }),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
});

export const shortageFlagsTable = pgTable("shortage_flags", {
  id: serial("id").primaryKey(),
  stepId: integer("step_id"),
  productName: text("product_name").notNull(),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  quantityNeeded: integer("quantity_needed"),
  projectId: integer("project_id"),
  flaggedByUsername: varchar("flagged_by_username", { length: 100 }),
  note: text("note"),
  resolvedAt: timestamp("resolved_at"),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const stockReservationsTable = pgTable("stock_reservations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(1),
  workOrderId: integer("work_order_id"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const supplierProductsTable = pgTable("supplier_products", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  supplierSku: text("supplier_sku"),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2, mode: "number" }),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const supplierProductsRelations = relations(supplierProductsTable, ({ one }) => ({
  supplier: one(suppliersTable, { fields: [supplierProductsTable.supplierId], references: [suppliersTable.id] }),
  product: one(productsTable, { fields: [supplierProductsTable.productId], references: [productsTable.id] }),
}));

export const restockRequestStatusEnum = pgEnum("restock_request_status", [
  "pending", "approved", "ordered", "dismissed",
]);

export const restockRequestsTable = pgTable("restock_requests", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  notes: text("notes"),
  status: restockRequestStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

export type PurchaseOrder = typeof purchaseOrdersTable.$inferSelect;
export type PurchaseOrderItem = typeof purchaseOrderItemsTable.$inferSelect;
export type ShortageFlag = typeof shortageFlagsTable.$inferSelect;
export type StockReservation = typeof stockReservationsTable.$inferSelect;
export type SupplierProduct = typeof supplierProductsTable.$inferSelect;
export type RestockRequest = typeof restockRequestsTable.$inferSelect;
