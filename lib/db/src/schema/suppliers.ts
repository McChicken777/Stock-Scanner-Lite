import { pgTable, text, timestamp, integer, serial } from "drizzle-orm/pg-core";
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
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Supplier = typeof suppliersTable.$inferSelect;
