import { pgTable, text, timestamp, integer, serial, pgEnum, boolean } from "drizzle-orm/pg-core";
import { workProjectsTable, proceduresTable } from "./work";
import { locationsTable } from "./locations";
import { companiesTable } from "./companies";

export const inboundStatusEnum = pgEnum("inbound_status", [
  "expected",
  "arrived",
  "stored",
  "in_production",
]);

export const inboundTable = pgTable("inbound", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => workProjectsTable.id, { onDelete: "cascade" }),
  status: inboundStatusEnum("status").notNull().default("expected"),
  locationId: text("location_id").references(() => locationsTable.id, { onDelete: "set null" }),
  assignedProcedure: text("assigned_procedure"),
  procedureId: integer("procedure_id").references(() => proceduresTable.id, { onDelete: "set null" }),
  receivedAt: timestamp("received_at"),
  notes: text("notes"),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Inbound = typeof inboundTable.$inferSelect;
