import { pgTable, text, timestamp, serial, jsonb, pgEnum, integer, boolean } from "drizzle-orm/pg-core";

export const companyPlanEnum = pgEnum("company_plan", ["basic", "pro"]);

export interface CompanyFeatures {
  inventory: boolean;
  alerts: boolean;
  work_orders: boolean;
  progress_tracking: boolean;
  deadline_alerts: boolean;
  time_tracking: boolean;
}

export const PLAN_FEATURES: Record<"basic" | "pro", CompanyFeatures> = {
  basic: {
    inventory: true,
    alerts: false,
    work_orders: true,
    progress_tracking: false,
    deadline_alerts: false,
    time_tracking: false,
  },
  pro: {
    inventory: true,
    alerts: true,
    work_orders: true,
    progress_tracking: true,
    deadline_alerts: true,
    time_tracking: true,
  },
};

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  plan: companyPlanEnum("plan").notNull().default("pro"),
  features: jsonb("features").notNull().$type<CompanyFeatures>().$defaultFn(() => ({ ...PLAN_FEATURES.pro })),
  workHoursPerDay: integer("work_hours_per_day").notNull().default(480),
  weekendOvertimeEnabled: boolean("weekend_overtime_enabled").notNull().default(true),
  country: text("country"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Company = typeof companiesTable.$inferSelect;
