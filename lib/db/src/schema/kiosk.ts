import { pgTable, text, timestamp, integer, serial } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { workstationsTable } from "./work";
import { usersTable } from "./users";

export const kioskStationsTable = pgTable("kiosk_stations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  workstationId: integer("workstation_id").notNull().references(() => workstationsTable.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  label: text("label"),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const nfcCardsTable = pgTable("nfc_cards", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  cardUid: text("card_uid").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type KioskStation = typeof kioskStationsTable.$inferSelect;
export type NfcCard = typeof nfcCardsTable.$inferSelect;
export type KioskPushSubscription = typeof pushSubscriptionsTable.$inferSelect;
