import { pgTable, text, timestamp, integer, serial, pgEnum, numeric, jsonb } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { customersTable } from "./customers";
import { productsTable } from "./products";
import { workProjectsTable } from "./work";
import { usersTable } from "./users";
import { quoteIssuersTable } from "./quote-issuers";

export const quoteStatusEnum = pgEnum("quote_status", ["draft", "sent", "approved", "rejected", "converted", "delivered"]);

export const quotesTable = pgTable("quotes", {
  id: serial("id").primaryKey(),
  quoteNumber: text("quote_number").notNull(),
  status: quoteStatusEnum("status").notNull().default("draft"),
  customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  // Inline customer fields (for ad-hoc quick quotes, or denormalized snapshot)
  customerName: text("customer_name"),
  customerContact: text("customer_contact"),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  customerAddress: text("customer_address"),
  validUntil: timestamp("valid_until"),
  notes: text("notes"),
  terms: text("terms"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2, mode: "number" }).notNull().default(0),
  discount: numeric("discount", { precision: 12, scale: 2, mode: "number" }).notNull().default(0),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2, mode: "number" }).notNull().default(0),
  total: numeric("total", { precision: 12, scale: 2, mode: "number" }).notNull().default(0),
  issuerId: integer("issuer_id").references(() => quoteIssuersTable.id, { onDelete: "set null" }),
  workProjectId: integer("work_project_id").references(() => workProjectsTable.id, { onDelete: "set null" }),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const quoteItemsTable = pgTable("quote_items", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull().references(() => quotesTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  quantity: numeric("quantity", { precision: 12, scale: 2, mode: "number" }).notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2, mode: "number" }).notNull().default(0),
  lineTotal: numeric("line_total", { precision: 12, scale: 2, mode: "number" }).notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const quoteRevisionsTable = pgTable("quote_revisions", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull().references(() => quotesTable.id, { onDelete: "cascade" }),
  revisionNumber: integer("revision_number").notNull().default(1),
  snapshot: jsonb("snapshot").notNull(),
  note: text("note"),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Quote = typeof quotesTable.$inferSelect;
export type QuoteItem = typeof quoteItemsTable.$inferSelect;
export type QuoteRevision = typeof quoteRevisionsTable.$inferSelect;
