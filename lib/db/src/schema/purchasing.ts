import { pgTable, text, timestamp, integer, serial, pgEnum } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { productsTable } from "./products";
import { suppliersTable } from "./suppliers";

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
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
});

export const shortageFlagsTable = pgTable("shortage_flags", {
  id: serial("id").primaryKey(),
  stepId: integer("step_id"),
  productName: text("product_name").notNull(),
  note: text("note"),
  resolvedAt: timestamp("resolved_at"),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PurchaseOrder = typeof purchaseOrdersTable.$inferSelect;
export type PurchaseOrderItem = typeof purchaseOrderItemsTable.$inferSelect;
export type ShortageFlag = typeof shortageFlagsTable.$inferSelect;
