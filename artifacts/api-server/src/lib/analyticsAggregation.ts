import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { AnalyticsChartsData, BottleneckRow, DeadlineRow, EfficiencyMonthRow } from "@workspace/db";

export async function aggregateProductionData(companyId: number): Promise<AnalyticsChartsData> {
  // 1. Task duration by step name and calendar month (last 6 months)
  const efficiencyRaw = await db.execute<{
    step_name: string;
    month: string;
    month_ts: Date;
    avg_minutes: string;
    session_count: string;
  }>(sql`
    SELECT
      wis.name AS step_name,
      TO_CHAR(DATE_TRUNC('month', wtl.start_time), 'Mon YYYY') AS month,
      DATE_TRUNC('month', wtl.start_time) AS month_ts,
      ROUND(AVG(wtl.duration_seconds) / 60.0, 1) AS avg_minutes,
      COUNT(*) AS session_count
    FROM work_item_steps wis
    JOIN work_time_logs wtl ON wtl.step_id = wis.id
    JOIN work_project_items wpi ON wpi.id = wis.item_id
    JOIN work_projects wp ON wp.id = wpi.project_id
    WHERE wp.company_id = ${companyId}
      AND wtl.start_time > NOW() - INTERVAL '6 months'
      AND wtl.duration_seconds IS NOT NULL
      AND wtl.duration_seconds > 0
    GROUP BY wis.name, DATE_TRUNC('month', wtl.start_time)
    ORDER BY DATE_TRUNC('month', wtl.start_time), avg_minutes DESC
  `);

  const procedureTotals = new Map<string, number>();
  for (const row of efficiencyRaw.rows) {
    procedureTotals.set(row.step_name, (procedureTotals.get(row.step_name) ?? 0) + Number(row.avg_minutes));
  }
  const topProcedures = [...procedureTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  const monthOrder = new Map<string, number>();
  for (const row of efficiencyRaw.rows) {
    if (!monthOrder.has(row.month)) monthOrder.set(row.month, new Date(row.month_ts).getTime());
  }
  const months = [...monthOrder.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m);

  const efficiencyByMonth: EfficiencyMonthRow[] = months.map((month) => {
    const entry: EfficiencyMonthRow = { month };
    for (const proc of topProcedures) {
      const found = efficiencyRaw.rows.find((r) => r.month === month && r.step_name === proc);
      entry[proc] = found ? Number(found.avg_minutes) : 0;
    }
    return entry;
  });

  // 2. Bottlenecks — procedure names with highest average actual time spent
  const bottleneckRaw = await db.execute<{
    step_name: string;
    avg_minutes: string;
    count: string;
  }>(sql`
    SELECT
      wis.name AS step_name,
      ROUND(AVG(wis.total_time_seconds) / 60.0, 1) AS avg_minutes,
      COUNT(*) AS count
    FROM work_item_steps wis
    JOIN work_project_items wpi ON wpi.id = wis.item_id
    JOIN work_projects wp ON wp.id = wpi.project_id
    WHERE wp.company_id = ${companyId}
      AND wis.status = 'completed'
      AND wis.total_time_seconds > 0
    GROUP BY wis.name
    HAVING COUNT(*) >= 2
    ORDER BY avg_minutes DESC
    LIMIT 10
  `);

  const bottlenecks: BottleneckRow[] = bottleneckRaw.rows.map((r) => ({
    name: r.step_name,
    avgMinutes: Number(r.avg_minutes),
    count: Number(r.count),
  }));

  // 3. Deadline accuracy by month — projects grouped by deadline month
  const deadlineRaw = await db.execute<{
    month: string;
    month_ts: Date;
    total: string;
    completed: string;
  }>(sql`
    SELECT
      TO_CHAR(DATE_TRUNC('month', wp.deadline), 'Mon YYYY') AS month,
      DATE_TRUNC('month', wp.deadline) AS month_ts,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE wp.status = 'completed') AS completed
    FROM work_projects wp
    WHERE wp.company_id = ${companyId}
      AND wp.deadline > NOW() - INTERVAL '6 months'
      AND wp.deadline <= NOW() + INTERVAL '1 month'
    GROUP BY DATE_TRUNC('month', wp.deadline)
    ORDER BY DATE_TRUNC('month', wp.deadline)
  `);

  const deadlineAccuracy: DeadlineRow[] = deadlineRaw.rows.map((r) => {
    const total = Number(r.total);
    const completed = Number(r.completed);
    return { month: r.month, total, completed, rate: total > 0 ? Math.round((completed / total) * 100) : 0 };
  });

  return { efficiencyByMonth, topProcedures, bottlenecks, deadlineAccuracy };
}
