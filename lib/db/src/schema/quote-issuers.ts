import { pgTable, text, timestamp, integer, serial, boolean } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const quoteIssuersTable = pgTable("quote_issuers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type QuoteIssuer = typeof quoteIssuersTable.$inferSelect;
