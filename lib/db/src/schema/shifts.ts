import { pgTable, text, timestamp, serial, integer } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const companyShiftsTable = pgTable("company_shifts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  startTime: text("start_time").notNull(), // HH:MM 24h
  endTime: text("end_time").notNull(),     // HH:MM 24h
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CompanyShift = typeof companyShiftsTable.$inferSelect;
