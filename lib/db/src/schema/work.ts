import { pgTable, text, timestamp, integer, serial, pgEnum, boolean, jsonb, numeric, type AnyPgColumn } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { companiesTable } from "./companies";
import { productsTable } from "./products";
import { locationsTable } from "./locations";

export const workPriorityEnum = pgEnum("work_priority", ["low", "normal", "high", "urgent"]);
export const workProjectStatusEnum = pgEnum("work_project_status", ["in_progress", "completed"]);
export const workProcedureStatusEnum = pgEnum("work_procedure_status", ["not_started", "in_progress", "completed"]);

// Raw material catalogue: company-specific material specs (steel grades, profiles, etc.)
// shape: rod | hex | sheet | plate | flat_bar | tube_round | tube_sq | angle | channel | other
// profile: human-readable dimension string ("30" for Ø30 rod, "3" for 3mm sheet, "50×10" for flat bar)
// profileMm: primary numeric dimension in mm (diameter for rod, thickness for sheet, etc.)
//            stored for future cutting-optimization and stock deduction
// stockMm: current stock length/quantity in mm (rods/bars) or pcs (sheets) — reserved for future
export const rawMaterialsTable = pgTable("raw_materials", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  displayName: text("display_name"),
  shape: text("shape"),
  profile: text("profile"),
  profileMm: numeric("profile_mm", { precision: 10, scale: 2, mode: "number" }),
  unit: text("unit").notNull().default("mm"),
  notes: text("notes"),
  // Linked stock item: each raw-material size owns a products row that holds its
  // on-hand quantity, location stock and valuation. Created automatically by the API.
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type RawMaterial = typeof rawMaterialsTable.$inferSelect;
// Item templates (admin-configurable blueprints)
export const workTemplatesTable = pgTable("work_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "cascade" }),
  rawMaterialId: integer("raw_material_id").references(() => rawMaterialsTable.id, { onDelete: "set null" }),
  materialQtyPerPiece: numeric("material_qty_per_piece", { precision: 12, scale: 3, mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Station types: company-defined production flow stations (Cutting, CNC, Welding, …)
export const stationTypesTable = pgTable("station_types", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),
  flowOrder: integer("flow_order").notNull().default(0),
  roleId: integer("role_id").references(() => rolesTable.id, { onDelete: "set null" }),
  defaultOutputLocationId: text("default_output_location_id").references(() => locationsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Physical workstations (CNC Machine 1, Bandsaw 2, …) under a station type
export const workstationsTable = pgTable("workstations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  stationTypeId: integer("station_type_id").notNull().references(() => stationTypesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priority: integer("priority").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Production steps defined per template; templateComponentId links to a BOM sub-component (null = top-level step)
export const workStepsTable = pgTable("work_steps", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => workTemplatesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  requiresInbound: boolean("requires_inbound").notNull().default(false),
  roleId: integer("role_id").references(() => rolesTable.id, { onDelete: "set null" }),
  batchMode: text("batch_mode").notNull().default("individual"),
  durationEstimate: integer("duration_estimate"),
  templateComponentId: integer("template_component_id"),
  consumesProductId: integer("consumes_product_id").references(() => productsTable.id, { onDelete: "set null" }),
  consumesQuantity: numeric("consumes_quantity", { precision: 12, scale: 3, mode: "number" }).notNull().default(0),
  stationTypeId: integer("station_type_id").references(() => stationTypesTable.id, { onDelete: "set null" }),
  qcEnabled: boolean("qc_enabled").notNull().default(false),
  qcInstructions: text("qc_instructions"),
  qcPhotoUrl: text("qc_photo_url"),
});

/** @deprecated use workStepsTable */
export const workTemplateProceduresTable = workStepsTable;

// Projects / Work Orders
export const workProjectsTable = pgTable("work_projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  deadline: timestamp("deadline").notNull(),
  priority: workPriorityEnum("priority").notNull().default("normal"),
  status: workProjectStatusEnum("status").notNull().default("in_progress"),
  paintColor: text("paint_color"),
  requiresExternalParts: boolean("requires_external_parts").notNull().default(false),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Items within a project (copied from templates at creation time)
// parentItemId links sub-components to their parent item (BOM hierarchy); null = top-level item
export const workProjectItemsTable = pgTable("work_project_items", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => workProjectsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  paintColor: text("paint_color"),
  sortOrder: integer("sort_order").notNull().default(0),
  parentItemId: integer("parent_item_id").references((): AnyPgColumn => workProjectItemsTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  rawMaterialId: integer("raw_material_id").references(() => rawMaterialsTable.id, { onDelete: "set null" }),
  materialQtyPerPiece: numeric("material_qty_per_piece", { precision: 12, scale: 3, mode: "number" }),
});

// Steps for each project item, instantiated from work_steps at project creation time
export const workItemStepsTable = pgTable("work_item_steps", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => workProjectItemsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: workProcedureStatusEnum("status").notNull().default("not_started"),
  sortOrder: integer("sort_order").notNull().default(0),
  totalTimeSeconds: integer("total_time_seconds").notNull().default(0),
  requiresInbound: boolean("requires_inbound").notNull().default(false),
  roleId: integer("role_id").references(() => rolesTable.id, { onDelete: "set null" }),
  batchMode: text("batch_mode").notNull().default("individual"),
  durationEstimate: integer("duration_estimate"),
  sizeWeight: text("size_weight"),
  templateStepId: integer("template_step_id").references(() => workStepsTable.id, { onDelete: "set null" }),
  consumesProductId: integer("consumes_product_id").references(() => productsTable.id, { onDelete: "set null" }),
  consumesQuantity: numeric("consumes_quantity", { precision: 12, scale: 3, mode: "number" }).notNull().default(0),
  stationTypeId: integer("station_type_id").references(() => stationTypesTable.id, { onDelete: "set null" }),
  workstationId: integer("workstation_id").references(() => workstationsTable.id, { onDelete: "set null" }),
  qcEnabled: boolean("qc_enabled").notNull().default(false),
  qcInstructions: text("qc_instructions"),
  qcPhotoUrl: text("qc_photo_url"),
});

/** @deprecated use workItemStepsTable */
export const workItemProceduresTable = workItemStepsTable;

// Time log: individual start/stop sessions per step per user
export const workTimeLogsTable = pgTable("work_time_logs", {
  id: serial("id").primaryKey(),
  stepId: integer("step_id").notNull().references(() => workItemStepsTable.id, { onDelete: "cascade" }),
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

// Procedures: admin-defined production procedures with role assignment (legacy global system)
export const proceduresTable = pgTable("procedures", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  roleId: integer("role_id").notNull().references(() => rolesTable.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull().default(0),
  requiresInbound: boolean("requires_inbound").notNull().default(false),
  requiresComponents: boolean("requires_components").notNull().default(false),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Link procedures to items: each item has its own set of procedures (legacy)
export const itemProceduresTable = pgTable("item_procedures", {
  itemId: integer("item_id").notNull().references(() => workProjectItemsTable.id, { onDelete: "cascade" }),
  procedureId: integer("procedure_id").notNull().references(() => proceduresTable.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull().default(0),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
});

// Tasks: generated when project is created, one per (item, procedure) pair (legacy)
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

// Procedure inputs: what items are required for a procedure (legacy)
export const procedureInputsTable = pgTable("procedure_inputs", {
  id: serial("id").primaryKey(),
  procedureId: integer("procedure_id").notNull().references(() => proceduresTable.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  quantityRequired: integer("quantity_required").notNull().default(1),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Step presets: saved reusable step sequences for fast template building
export const stepPresetsTable = pgTable("step_presets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const stepPresetEntriesTable = pgTable("step_preset_entries", {
  id: serial("id").primaryKey(),
  presetId: integer("preset_id").notNull().references(() => stepPresetsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  roleId: integer("role_id").references(() => rolesTable.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").notNull().default(0),
  batchMode: text("batch_mode").notNull().default("individual"),
  durationEstimate: integer("duration_estimate"),
});

// Production zones: named physical areas in the warehouse (e.g. "CNC Bay", "Paint Booth")
export const productionZonesTable = pgTable("production_zones", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// WIP location type: where in the factory a work-item-step currently lives
export const wipLocationTypeEnum = pgEnum("wip_location_type", ["warehouse", "zone", "with_worker"]);

// WIP locations: tracks where a step's output is currently located (legacy — kept for backward compat)
export const wipLocationsTable = pgTable("wip_locations", {
  id: serial("id").primaryKey(),
  stepId: integer("step_id").notNull().references(() => workItemStepsTable.id, { onDelete: "cascade" }),
  locationType: wipLocationTypeEnum("location_type").notNull(),
  locationValue: text("location_value"),
  setByUserId: integer("set_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  setAt: timestamp("set_at").defaultNow().notNull(),
});

// Part locations: dedicated model for tracking where a part/component is after step completion.
// Captures richer metadata (itemId, notes) compared to the legacy wip_locations table.
export const partLocationsTable = pgTable("part_locations", {
  id: serial("id").primaryKey(),
  stepId: integer("step_id").notNull().references(() => workItemStepsTable.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => workProjectItemsTable.id, { onDelete: "cascade" }),
  locationType: wipLocationTypeEnum("location_type").notNull(),
  locationValue: text("location_value"),
  notes: text("notes"),
  setByUserId: integer("set_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  setAt: timestamp("set_at").defaultNow().notNull(),
});
export type PartLocation = typeof partLocationsTable.$inferSelect;

// AI snapshots: stores previous template/item state for undo after AI edits
export const aiSnapshotsTable = pgTable("ai_snapshots", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// DAG step-to-step dependencies (Task #58)
// blockerStepId must complete before blockedStepId becomes READY
// Company-scoping invariant: blocker/blocked steps MUST belong to the same company.
// Enforced at the application layer (POST handler verifies both step IDs via JOIN to
// workProjectsTable.companyId before inserting). A DB-level composite FK is not feasible
// in PostgreSQL without a compound PK on work_item_steps; the companyId column + app checks
// are the canonical enforcement mechanism. The UNIQUE index on (blockerStepId, blockedStepId)
// prevents duplicate edges regardless of order.
export const stepDependenciesTable = pgTable("step_dependencies", {
  id: serial("id").primaryKey(),
  blockerStepId: integer("blocker_step_id").notNull().references(() => workItemStepsTable.id, { onDelete: "cascade" }),
  blockedStepId: integer("blocked_step_id").notNull().references(() => workItemStepsTable.id, { onDelete: "cascade" }),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
}, (t) => [{ unique: [t.blockerStepId, t.blockedStepId] }]);

// Template-level step dependencies: defines which steps must precede others within a template.
// When a project is created from a template these edges are automatically copied to
// stepDependenciesTable for the newly created live steps (templateStepId mapping).
export const templateStepDependenciesTable = pgTable("template_step_dependencies", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => workTemplatesTable.id, { onDelete: "cascade" }),
  blockerStepId: integer("blocker_step_id").notNull().references(() => workStepsTable.id, { onDelete: "cascade" }),
  blockedStepId: integer("blocked_step_id").notNull().references(() => workStepsTable.id, { onDelete: "cascade" }),
}, (t) => [{ unique: [t.blockerStepId, t.blockedStepId] }]);

export type WorkTemplate = typeof workTemplatesTable.$inferSelect;
export type WorkStep = typeof workStepsTable.$inferSelect;
/** @deprecated use WorkStep */
export type WorkTemplateProcedure = WorkStep;
export type WorkProject = typeof workProjectsTable.$inferSelect;
export type WorkProjectItem = typeof workProjectItemsTable.$inferSelect;
export type WorkItemStep = typeof workItemStepsTable.$inferSelect;
/** @deprecated use WorkItemStep */
export type WorkItemProcedure = WorkItemStep;
export type WorkTimeLog = typeof workTimeLogsTable.$inferSelect;
export type Role = typeof rolesTable.$inferSelect;
export type UserRoleRecord = typeof userRolesTable.$inferSelect;
export type Procedure = typeof proceduresTable.$inferSelect;
export type ItemProcedure = typeof itemProceduresTable.$inferSelect;
export type Task = typeof tasksTable.$inferSelect;
export type ProcedureInput = typeof procedureInputsTable.$inferSelect;
export type StepPreset = typeof stepPresetsTable.$inferSelect;
export type StepPresetEntry = typeof stepPresetEntriesTable.$inferSelect;
export type AiSnapshot = typeof aiSnapshotsTable.$inferSelect;
export type ProductionZone = typeof productionZonesTable.$inferSelect;
export type WipLocation = typeof wipLocationsTable.$inferSelect;
export type StepDependency = typeof stepDependenciesTable.$inferSelect;
export type TemplateStepDependency = typeof templateStepDependenciesTable.$inferSelect;
export type StationType = typeof stationTypesTable.$inferSelect;
export type Workstation = typeof workstationsTable.$inferSelect;
