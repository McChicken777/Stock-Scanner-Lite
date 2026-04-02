import { pgTable, text, timestamp, integer, serial, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

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
  bufferStock: integer("buffer_stock").notNull().default(0),
  targetStock: integer("target_stock").notNull().default(0),
  supplierId: integer("supplier_id"),
  supplierProductName: text("supplier_product_name"),
  supplierSku: text("supplier_sku"),
  alertEmail: text("alert_email"),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
