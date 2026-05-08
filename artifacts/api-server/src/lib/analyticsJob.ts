import { db, analyticsSnapshotsTable, companiesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { aggregateProductionData } from "./analyticsAggregation";
import { logger } from "./logger";
import type { AnalyticsInsight } from "@workspace/db";

function friendlyAiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/timeout|timed out|etimedout/i.test(msg)) return "AI timed out";
  if (/api key|unauthorized|401|not configured|missing/i.test(msg)) return "AI not configured";
  if (/rate|429/i.test(msg)) return "AI rate limited";
  return "AI unavailable";
}

export async function runAnalyticsJob(
  companyId: number,
  triggeredBy: "cron" | "manual" = "cron",
): Promise<{ insightCount: number }> {
  const charts = await aggregateProductionData(companyId);

  const dataSummary = {
    efficiencyByMonth: charts.efficiencyByMonth.slice(-3),
    topProcedures: charts.topProcedures,
    bottleneckHeatmap: {
      stepNames: charts.bottleneckHeatmap.stepNames,
      topCells: charts.bottleneckHeatmap.cells.slice(0, 10),
      maxWaitMinutes: charts.bottleneckHeatmap.maxWait,
    },
    deadlineAccuracy: charts.deadlineAccuracy.slice(-3),
  };

  let insights: AnalyticsInsight[] = [];

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: `You are a production analytics AI for a warehouse management system.
Based on the aggregated production data below, generate 3-6 plain-language insight cards.
Each card should surface a meaningful pattern, risk, or opportunity.

Data:
${JSON.stringify(dataSummary, null, 2)}

Notes:
- efficiencyByMonth: average active-work minutes per step type per month (0 = no data)
- bottleneckHeatmap: wait-time before pickup per step/month; topCells sorted by worst wait; maxWaitMinutes = scale max
- deadlineAccuracy: per month — total projects, completed with completed_at stamp, onTime = completed_at ≤ deadline, rate = onTime/total %

Respond ONLY with a valid JSON array (no markdown, no explanation):
[
  {
    "id": "unique_snake_case_id",
    "category": "efficiency|bottleneck|deadline|worker",
    "headline": "Short headline (max 80 chars)",
    "explanation": "One sentence with specific numbers from the data",
    "metric": "The key number or stat (e.g. '4.1h avg', '68% on time')"
  }
]

Rules:
- id must be unique and descriptive (e.g. "welding_duration_high")
- Use specific numbers from the data in explanation and metric
- If data is sparse or empty, generate 1-2 encouraging/informational insights about getting started
- Do not mention internal field names like "efficiencyByMonth" in the output`,
      }],
    });

    const block = message.content[0];
    if (block?.type === "text") {
      const cleaned = block.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed: unknown = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        insights = parsed
          .filter((i): i is AnalyticsInsight =>
            i && typeof i === "object" &&
            typeof i.id === "string" &&
            typeof i.headline === "string" &&
            typeof i.explanation === "string" &&
            typeof i.metric === "string",
          )
          .slice(0, 6);
      }
    }
  } catch (aiErr) {
    logger.warn({ err: aiErr, reason: friendlyAiError(aiErr) }, "AI call failed for analytics — saving charts without insights");
    insights = [];
  }

  await db.insert(analyticsSnapshotsTable).values({
    companyId,
    triggeredBy,
    insights,
    charts,
  });

  logger.info({ companyId, insightCount: insights.length, triggeredBy }, "Analytics snapshot saved");
  return { insightCount: insights.length };
}

/** Get all Pro company IDs that should have analytics computed. */
export async function getProCompanyIds(): Promise<number[]> {
  const rows = await db
    .select({ id: companiesTable.id })
    .from(companiesTable)
    .where(eq(companiesTable.plan, "pro"));
  return rows.map((r) => r.id);
}

/** Get the latest snapshot for a company, or null if none exists. */
export async function getLatestSnapshot(companyId: number) {
  const [row] = await db
    .select()
    .from(analyticsSnapshotsTable)
    .where(eq(analyticsSnapshotsTable.companyId, companyId))
    .orderBy(desc(analyticsSnapshotsTable.createdAt))
    .limit(1);
  return row ?? null;
}
