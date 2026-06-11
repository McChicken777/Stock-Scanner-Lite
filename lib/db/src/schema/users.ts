import { pgTable, text, timestamp, integer, serial, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { companyShiftsTable } from "./shifts";

export const roleEnum = pgEnum("user_role", ["owner", "admin", "worker"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("worker"),
  isSupervisor: boolean("is_supervisor").notNull().default(false),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "set null" }),
  shiftId: integer("shift_id").references(() => companyShiftsTable.id, { onDelete: "set null" }),
  kioskPinHash: text("kiosk_pin_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
export type UserRole = "owner" | "admin" | "worker";
