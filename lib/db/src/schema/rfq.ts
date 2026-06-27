import { pgTable, text, timestamp, integer, serial, pgEnum, numeric } from "drizzle-orm/pg-core";
// price history relies on quote_request_supplier_lines.createdAt (added in migration 0039)
import { companiesTable } from "./companies";
import { productsTable } from "./products";
import { suppliersTable } from "./suppliers";
import { usersTable } from "./users";
import { shortageFlagsTable, purchaseOrdersTable } from "./purchasing";
import { relations } from "drizzle-orm";

export const quoteRequestStatusEnum = pgEnum("quote_request_status", [
  "open", "ordered", "cancelled",
]);

export const quoteRequestSupplierStatusEnum = pgEnum("quote_request_supplier_status", [
  "invited", "submitted", "declined",
]);

export const quoteRequestsTable = pgTable("quote_requests", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  status: quoteRequestStatusEnum("status").notNull().default("open"),
  note: text("note"),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  decidedSupplierId: integer("decided_supplier_id").references(() => suppliersTable.id, { onDelete: "set null" }),
  poId: integer("po_id").references(() => purchaseOrdersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const quoteRequestItemsTable = pgTable("quote_request_items", {
  id: serial("id").primaryKey(),
  rfqId: integer("rfq_id").notNull().references(() => quoteRequestsTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  flagId: integer("flag_id").references(() => shortageFlagsTable.id, { onDelete: "set null" }),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
});

export const quoteRequestSuppliersTable = pgTable("quote_request_suppliers", {
  id: serial("id").primaryKey(),
  rfqId: integer("rfq_id").notNull().references(() => quoteRequestsTable.id, { onDelete: "cascade" }),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  status: quoteRequestSupplierStatusEnum("status").notNull().default("invited"),
  leadTimeDays: integer("lead_time_days"),
  note: text("note"),
  submittedAt: timestamp("submitted_at"),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
});

export const quoteRequestSupplierLinesTable = pgTable("quote_request_supplier_lines", {
  id: serial("id").primaryKey(),
  rfqSupplierId: integer("rfq_supplier_id").notNull().references(() => quoteRequestSuppliersTable.id, { onDelete: "cascade" }),
  rfqItemId: integer("rfq_item_id").notNull().references(() => quoteRequestItemsTable.id, { onDelete: "cascade" }),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2, mode: "number" }),
  supplierSku: text("supplier_sku"),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const quoteRequestsRelations = relations(quoteRequestsTable, ({ many, one }) => ({
  items: many(quoteRequestItemsTable),
  suppliers: many(quoteRequestSuppliersTable),
  decidedSupplier: one(suppliersTable, { fields: [quoteRequestsTable.decidedSupplierId], references: [suppliersTable.id] }),
}));

export const quoteRequestItemsRelations = relations(quoteRequestItemsTable, ({ one }) => ({
  rfq: one(quoteRequestsTable, { fields: [quoteRequestItemsTable.rfqId], references: [quoteRequestsTable.id] }),
  product: one(productsTable, { fields: [quoteRequestItemsTable.productId], references: [productsTable.id] }),
}));

export const quoteRequestSuppliersRelations = relations(quoteRequestSuppliersTable, ({ one, many }) => ({
  rfq: one(quoteRequestsTable, { fields: [quoteRequestSuppliersTable.rfqId], references: [quoteRequestsTable.id] }),
  supplier: one(suppliersTable, { fields: [quoteRequestSuppliersTable.supplierId], references: [suppliersTable.id] }),
  lines: many(quoteRequestSupplierLinesTable),
}));

export const quoteRequestSupplierLinesRelations = relations(quoteRequestSupplierLinesTable, ({ one }) => ({
  rfqSupplier: one(quoteRequestSuppliersTable, { fields: [quoteRequestSupplierLinesTable.rfqSupplierId], references: [quoteRequestSuppliersTable.id] }),
  item: one(quoteRequestItemsTable, { fields: [quoteRequestSupplierLinesTable.rfqItemId], references: [quoteRequestItemsTable.id] }),
}));

export type QuoteRequest = typeof quoteRequestsTable.$inferSelect;
export type QuoteRequestItem = typeof quoteRequestItemsTable.$inferSelect;
export type QuoteRequestSupplier = typeof quoteRequestSuppliersTable.$inferSelect;
export type QuoteRequestSupplierLine = typeof quoteRequestSupplierLinesTable.$inferSelect;
