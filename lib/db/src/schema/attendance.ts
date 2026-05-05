import { pgTable, text, timestamp, integer, serial, pgEnum, date, index, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { companiesTable } from "./companies";

export const attendanceTypeEnum = pgEnum("attendance_type", ["work", "sick", "vacation"]);
export const attendanceStatusEnum = pgEnum("attendance_status", ["pending", "approved", "rejected"]);

export const attendanceLogsTable = pgTable("attendance_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  type: attendanceTypeEnum("type").notNull(),
  status: attendanceStatusEnum("status").notNull().default("approved"),
  clockIn: timestamp("clock_in"),
  clockOut: timestamp("clock_out"),
  workSeconds: integer("work_seconds").notNull().default(0),
  overtimeSeconds: integer("overtime_seconds").notNull().default(0),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userDateIdx: index("attendance_user_date_idx").on(t.userId, t.date),
  companyDateIdx: index("attendance_company_date_idx").on(t.companyId, t.date),
  companyUserDateUniq: uniqueIndex("attendance_company_user_date_uniq").on(t.companyId, t.userId, t.date),
}));

export type AttendanceLog = typeof attendanceLogsTable.$inferSelect;
