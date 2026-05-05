import { pgTable, text, timestamp, serial, integer, date, pgEnum, index } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

export const leaveStatusEnum = pgEnum("leave_status", ["pending", "approved", "rejected"]);
export const leaveTypeEnum = pgEnum("leave_type", ["sick", "vacation"]);

export const leaveRequestsTable = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: leaveTypeEnum("type").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: leaveStatusEnum("status").notNull().default("pending"),
  managerNote: text("manager_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  companyUserIdx: index("leave_requests_company_user_idx").on(t.companyId, t.userId),
  companyStatusIdx: index("leave_requests_company_status_idx").on(t.companyId, t.status),
}));

export type LeaveRequest = typeof leaveRequestsTable.$inferSelect;
