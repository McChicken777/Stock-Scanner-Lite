import { pgTable, text, serial, integer, date, index } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const companyHolidaysTable = pgTable("company_holidays", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  label: text("label").notNull().default("Holiday"),
}, (t) => ({
  companyDateIdx: index("company_holidays_company_date_idx").on(t.companyId, t.date),
}));

export type CompanyHoliday = typeof companyHolidaysTable.$inferSelect;
