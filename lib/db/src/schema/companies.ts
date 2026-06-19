import { pgTable, text, timestamp, serial, jsonb, pgEnum, integer, boolean } from "drizzle-orm/pg-core";

export const companyPlanEnum = pgEnum("company_plan", ["lite", "standard", "pro"]);

export interface CompanyFeatures {
  inventory: boolean;
  alerts: boolean;
  work_orders: boolean;
  progress_tracking: boolean;
  deadline_alerts: boolean;
  time_tracking: boolean;
}

export const PLAN_FEATURES: Record<"lite" | "standard" | "pro", CompanyFeatures> = {
  lite: {
    inventory: true,
    alerts: false,
    work_orders: false,
    progress_tracking: false,
    deadline_alerts: false,
    time_tracking: false,
  },
  standard: {
    inventory: true,
    alerts: true,
    work_orders: true,
    progress_tracking: true,
    deadline_alerts: true,
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

export interface OutlineOpCode {
  stationTypeId: number;
  stationTypeName: string;
}

export interface OutlineConditionalExclusion {
  excludeCode: string;
  ifHasCode: string;
}

export interface OutlineSettings {
  opCodes: Record<string, OutlineOpCode>;
  defaultOpCodes: string[];
  conditionalExclusions: OutlineConditionalExclusion[];
  profiles: Record<string, string[]>;
}

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  plan: companyPlanEnum("plan").notNull().default("standard"),
  features: jsonb("features").notNull().$type<CompanyFeatures>().$defaultFn(() => ({ ...PLAN_FEATURES.pro })),
  workHoursPerDay: integer("work_hours_per_day").notNull().default(480),
  weekendOvertimeEnabled: boolean("weekend_overtime_enabled").notNull().default(true),
  country: text("country"),
  timezone: text("timezone").notNull().default("UTC"),
  // Branding for quote PDFs: logo is a base64 data URL; quoteSignerName is the typed signer.
  logo: text("logo"),
  quoteSignerName: text("quote_signer_name"),
  currency: text("currency").notNull().default("USD"),
  // Per-company SMTP for sending supplier order emails from the company's own address.
  // smtpPassEnc is the app-password encrypted at rest (never returned to the client).
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpUser: text("smtp_user"),
  smtpPassEnc: text("smtp_pass_enc"),
  emailFromName: text("email_from_name"),
  outlineSettings: jsonb("outline_settings").notNull().$type<OutlineSettings>().$defaultFn(() => ({
    opCodes: {}, defaultOpCodes: [], conditionalExclusions: [], profiles: {},
  })),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Company = typeof companiesTable.$inferSelect;
