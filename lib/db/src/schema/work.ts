import { pgTable, text, timestamp, integer, serial, pgEnum, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { companiesTable } from "./companies";

export const workPriorityEnum = pgEnum("work_priority", ["low", "medium", "high"]);
export const workProjectStatusEnum = pgEnum("work_project_status", ["in_progress", "completed"]);
export const workProcedureStatusEnum = pgEnum("work_procedure_status", ["not_started", "in_progress", "completed"]);

// Item templates (admin-configurable blueprints)
export const workTemplatesTable = pgTable("work_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Procedures defined per template
export const workTemplateProceduresTable = pgTable("work_template_procedures", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => workTemplatesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  requiresInbound: boolean("requires_inbound").notNull().default(false),
});

// Projects / Work Orders
export const workProjectsTable = pgTable("work_projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  deadline: timestamp("deadline").notNull(),
  priority: workPriorityEnum("priority").notNull().default("medium"),
  status: workProjectStatusEnum("status").notNull().default("in_progress"),
  paintColor: text("paint_color"),
  requiresExternalParts: boolean("requires_external_parts").notNull().default(false),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Items within a project (copied from templates at creation time)
export const workProjectItemsTable = pgTable("work_project_items", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => workProjectsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  paintColor: text("paint_color"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Procedures for each project item (copied from template procedures)
export const workItemProceduresTable = pgTable("work_item_procedures", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => workProjectItemsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: workProcedureStatusEnum("status").notNull().default("not_started"),
  sortOrder: integer("sort_order").notNull().default(0),
  totalTimeSeconds: integer("total_time_seconds").notNull().default(0),
  requiresInbound: boolean("requires_inbound").notNull().default(false),
});

// Time log: individual start/stop sessions per procedure per user
export const workTimeLogsTable = pgTable("work_time_logs", {
  id: serial("id").primaryKey(),
  procedureId: integer("procedure_id").notNull().references(() => workItemProceduresTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  durationSeconds: integer("duration_seconds"),
});

// Flexible roles (e.g. welding, CNC, sandblasting)
export const rolesTable = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Many-to-many: users can have multiple roles with priority levels
export const userRolePriorityEnum = pgEnum("user_role_priority", ["primary", "secondary", "substitution"]);
export const userRolesTable = pgTable("user_roles", {
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  roleId: integer("role_id").notNull().references(() => rolesTable.id, { onDelete: "cascade" }),
  priority: userRolePriorityEnum("priority").notNull().default("primary"),
});

// Procedures: admin-defined production procedures with role assignment
export const proceduresTable = pgTable("procedures", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  roleId: integer("role_id").notNull().references(() => rolesTable.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull().default(0),
  requiresInbound: boolean("requires_inbound").notNull().default(false),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Link procedures to items: each item has its own set of procedures
export const itemProceduresTable = pgTable("item_procedures", {
  itemId: integer("item_id").notNull().references(() => workProjectItemsTable.id, { onDelete: "cascade" }),
  procedureId: integer("procedure_id").notNull().references(() => proceduresTable.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull().default(0),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
});

// Tasks: generated when project is created, one per (item, procedure) pair
export const taskStatusEnum = pgEnum("task_status", ["not_started", "in_progress", "completed"]);
export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => workProjectsTable.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => workProjectItemsTable.id, { onDelete: "cascade" }),
  procedureId: integer("procedure_id").notNull().references(() => proceduresTable.id, { onDelete: "cascade" }),
  status: taskStatusEnum("status").notNull().default("not_started"),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type WorkTemplate = typeof workTemplatesTable.$inferSelect;
export type WorkTemplateProcedure = typeof workTemplateProceduresTable.$inferSelect;
export type WorkProject = typeof workProjectsTable.$inferSelect;
export type WorkProjectItem = typeof workProjectItemsTable.$inferSelect;
export type WorkItemProcedure = typeof workItemProceduresTable.$inferSelect;
export type WorkTimeLog = typeof workTimeLogsTable.$inferSelect;
export type Role = typeof rolesTable.$inferSelect;
export type UserRole = typeof userRolesTable.$inferSelect;
export type Procedure = typeof proceduresTable.$inferSelect;
export type ItemProcedure = typeof itemProceduresTable.$inferSelect;
export type Task = typeof tasksTable.$inferSelect;
