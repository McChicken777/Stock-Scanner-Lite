import { pgTable, serial, integer, timestamp, text, jsonb } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export interface AnalyticsInsight {
  id: string;
  category: "efficiency" | "bottleneck" | "deadline" | "worker";
  headline: string;
  explanation: string;
  metric: string;
}

export interface BottleneckRow {
  name: string;
  avgMinutes: number;
  count: number;
}

export interface EfficiencyMonthRow {
  month: string;
  [key: string]: number | string;
}

export interface DeadlineRow {
  month: string;
  total: number;
  completed: number;
  rate: number;
}

export interface AnalyticsChartsData {
  efficiencyByMonth: EfficiencyMonthRow[];
  topProcedures: string[];
  bottlenecks: BottleneckRow[];
  deadlineAccuracy: DeadlineRow[];
}

export const analyticsSnapshotsTable = pgTable("analytics_snapshots", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  triggeredBy: text("triggered_by").notNull().default("cron"),
  insights: jsonb("insights").notNull().$type<AnalyticsInsight[]>().$defaultFn(() => []),
  charts: jsonb("charts").notNull().$type<AnalyticsChartsData>().$defaultFn(() => ({
    efficiencyByMonth: [],
    topProcedures: [],
    bottlenecks: [],
    deadlineAccuracy: [],
  })),
});
