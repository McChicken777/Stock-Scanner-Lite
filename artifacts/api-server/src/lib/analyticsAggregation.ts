import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type {
  AnalyticsChartsData,
  BottleneckHeatmapCell,
  DeadlineRow,
  EfficiencyMonthRow,
} from "@workspace/db";

export async function aggregateProductionData(companyId: number): Promise<AnalyticsChartsData> {
  // ── 1. Efficiency: avg session duration per step name per month (last 6 months) ─────────────
  const efficiencyRaw = await db.execute<{
    step_name: string;
    month: string;
    month_ts: Date;
    avg_minutes: string;
  }>(sql`
    SELECT
      wis.name AS step_name,
      TO_CHAR(DATE_TRUNC('month', wtl.start_time), 'Mon YYYY') AS month,
      DATE_TRUNC('month', wtl.start_time) AS month_ts,
      ROUND(AVG(wtl.duration_seconds) / 60.0, 1) AS avg_minutes
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

  // ── 2. Bottleneck Heatmap: wait time before pickup per step per month ──────────────────────
  //   For each step, wait = time between:
  //     • previous step's last end (or project created_at if first step)
  //     • this step's first time-log start
  //   Grouped by step name × month, shown as a colour-coded heatmap.
  const waitRaw = await db.execute<{
    step_name: string;
    month: string;
    month_ts: Date;
    avg_wait_minutes: string;
    count: string;
  }>(sql`
    WITH step_starts AS (
      SELECT step_id, MIN(start_time) AS first_start
      FROM work_time_logs
      WHERE start_time > NOW() - INTERVAL '6 months'
      GROUP BY step_id
    ),
    prev_step_end AS (
      SELECT
        curr.id AS curr_step_id,
        MAX(wtl_prev.end_time) AS prev_last_end
      FROM work_item_steps curr
      JOIN work_item_steps prev
        ON prev.item_id = curr.item_id AND prev.sort_order = curr.sort_order - 1
      JOIN work_time_logs wtl_prev
        ON wtl_prev.step_id = prev.id AND wtl_prev.end_time IS NOT NULL
      GROUP BY curr.id
    )
    SELECT
      wis.name AS step_name,
      TO_CHAR(DATE_TRUNC('month', ss.first_start), 'Mon YYYY') AS month,
      DATE_TRUNC('month', ss.first_start) AS month_ts,
      ROUND(AVG(
        EXTRACT(EPOCH FROM (ss.first_start - COALESCE(pse.prev_last_end, wp.created_at))) / 60.0
      ), 1) AS avg_wait_minutes,
      COUNT(*) AS count
    FROM work_item_steps wis
    JOIN step_starts ss ON ss.step_id = wis.id
    JOIN work_project_items wpi ON wpi.id = wis.item_id
    JOIN work_projects wp ON wp.id = wpi.project_id
    LEFT JOIN prev_step_end pse ON pse.curr_step_id = wis.id
    WHERE wp.company_id = ${companyId}
      AND EXTRACT(EPOCH FROM (ss.first_start - COALESCE(pse.prev_last_end, wp.created_at))) > 0
    GROUP BY wis.name, DATE_TRUNC('month', ss.first_start)
    HAVING COUNT(*) >= 2
    ORDER BY DATE_TRUNC('month', ss.first_start), avg_wait_minutes DESC
  `);

  // Build heatmap: top 8 step names (by total wait) × chronological months
  const stepTotalWait = new Map<string, number>();
  for (const row of waitRaw.rows) {
    stepTotalWait.set(row.step_name, (stepTotalWait.get(row.step_name) ?? 0) + Number(row.avg_wait_minutes));
  }
  const heatmapStepNames = [...stepTotalWait.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name]) => name);

  const waitMonthOrder = new Map<string, number>();
  for (const row of waitRaw.rows) {
    if (!waitMonthOrder.has(row.month)) waitMonthOrder.set(row.month, new Date(row.month_ts).getTime());
  }
  const heatmapMonths = [...waitMonthOrder.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m);

  const cells: BottleneckHeatmapCell[] = waitRaw.rows
    .filter((r) => heatmapStepNames.includes(r.step_name))
    .map((r) => ({
      stepName: r.step_name,
      month: r.month,
      avgWaitMinutes: Number(r.avg_wait_minutes),
      count: Number(r.count),
    }));

  const maxWait = cells.length > 0 ? Math.max(...cells.map((c) => c.avgWaitMinutes)) : 0;

  const bottleneckHeatmap = { stepNames: heatmapStepNames, months: heatmapMonths, cells, maxWait };

  // ── 3. Deadline accuracy: % of projects completed on time (completed_at ≤ deadline) ────────
  const deadlineRaw = await db.execute<{
    month: string;
    month_ts: Date;
    total: string;
    completed: string;
    on_time: string;
  }>(sql`
    SELECT
      TO_CHAR(DATE_TRUNC('month', wp.deadline), 'Mon YYYY') AS month,
      DATE_TRUNC('month', wp.deadline) AS month_ts,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE wp.completed_at IS NOT NULL) AS completed,
      COUNT(*) FILTER (WHERE wp.completed_at IS NOT NULL AND wp.completed_at <= wp.deadline) AS on_time
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
    const onTime = Number(r.on_time);
    return {
      month: r.month,
      total,
      completed,
      onTime,
      rate: total > 0 ? Math.round((onTime / total) * 100) : 0,
    };
  });

  return { efficiencyByMonth, topProcedures, bottleneckHeatmap, deadlineAccuracy };
}
