import { pgTable, text, timestamp, integer, serial } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const companyInvitesTable = pgTable("company_invites", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  companyName: text("company_name"),
  plan: text("plan").notNull().default("lite"),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  usedAt: timestamp("used_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CompanyInvite = typeof companyInvitesTable.$inferSelect;
