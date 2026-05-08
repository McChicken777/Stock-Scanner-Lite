import { pgTable, serial, integer, timestamp, text, jsonb } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export interface AnalyticsInsight {
  id: string;
  category: "efficiency" | "bottleneck" | "deadline" | "worker";
  headline: string;
  explanation: string;
  metric: string;
}

export interface EfficiencyMonthRow {
  month: string;
  [key: string]: number | string;
}

/** One cell in the bottleneck wait-time heatmap (step × month). */
export interface BottleneckHeatmapCell {
  stepName: string;
  month: string;
  avgWaitMinutes: number;
  count: number;
}

/** Full heatmap payload: step names (y), months (x), cells, and scale max. */
export interface BottleneckHeatmapData {
  stepNames: string[];
  months: string[];
  cells: BottleneckHeatmapCell[];
  maxWait: number;
}

export interface DeadlineRow {
  month: string;
  total: number;
  completed: number;
  onTime: number;
  rate: number;
}

export interface AnalyticsChartsData {
  efficiencyByMonth: EfficiencyMonthRow[];
  topProcedures: string[];
  bottleneckHeatmap: BottleneckHeatmapData;
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
    bottleneckHeatmap: { stepNames: [], months: [], cells: [], maxWait: 0 },
    deadlineAccuracy: [],
  })),
});
