import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, companiesTable, workItemStepsTable, workProjectsTable, workProjectItemsTable, stationTypesTable, workTemplatesTable } from "@workspace/db";
import { eq, and, inArray, sql, lte, gt, isNotNull } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { runAnalyticsJob, getLatestSnapshot } from "../lib/analyticsJob";

const router: IRouter = Router();

const requireStandardPlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.session.companyId!;
    const [company] = await db.select({ plan: companiesTable.plan })
      .from(companiesTable).where(eq(companiesTable.id, companyId));
    if (!company || company.plan === "lite" || company.plan == null) {
      res.status(403).json({ error: "Insights require a Standard or Pro plan", planRequired: "standard" });
      return;
    }
    next();
  } catch {
    res.status(500).json({ error: "Failed to verify plan" });
  }
};

const requireProPlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.session.companyId!;
    const [company] = await db.select({ plan: companiesTable.plan })
      .from(companiesTable).where(eq(companiesTable.id, companyId));
    if (!company || company.plan !== "pro") {
      res.status(403).json({ error: "AI Analytics requires a Pro plan", planRequired: "pro" });
      return;
    }
    next();
  } catch {
    res.status(500).json({ error: "Failed to verify plan" });
  }
};

// GET /analytics/insights — latest AI-generated insight cards for this company
router.get("/insights", requireAuth, requireAdmin, requireProPlan, async (req, res) => {
  try {
    const snapshot = await getLatestSnapshot(req.session.companyId!);
    if (!snapshot) {
      res.json({ insights: [], snapshotAt: null, triggeredBy: null });
      return;
    }
    res.json({
      insights: snapshot.insights,
      snapshotAt: snapshot.createdAt,
      triggeredBy: snapshot.triggeredBy,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch analytics insights");
    res.status(500).json({ error: "Failed to fetch insights" });
  }
});

// GET /analytics/charts — latest aggregated chart data
router.get("/charts", requireAuth, requireAdmin, requireProPlan, async (req, res) => {
  try {
    const snapshot = await getLatestSnapshot(req.session.companyId!);
    if (!snapshot) {
      res.json({ charts: null, snapshotAt: null });
      return;
    }
    res.json({ charts: snapshot.charts, snapshotAt: snapshot.createdAt });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch analytics charts");
    res.status(500).json({ error: "Failed to fetch charts" });
  }
});

// POST /analytics/refresh — on-demand analytics job (admin-only, Pro)
router.post("/refresh", requireAuth, requireAdmin, requireProPlan, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    req.log.info({ companyId }, "Manual analytics refresh triggered");
    const { insightCount } = await runAnalyticsJob(companyId, "manual");
    res.json({ ok: true, insightCount });
  } catch (err) {
    req.log.error({ err }, "Analytics refresh failed");
    res.status(500).json({ error: "Failed to generate analytics. Please try again." });
  }
});

// GET /analytics/template-duration?templateId=X — avg days to complete a template (Standard+)
router.get("/template-duration", requireAuth, requireAdmin, requireStandardPlan, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const templateId = Number(req.query.templateId);
    if (!templateId) { res.status(400).json({ error: "templateId required" }); return; }

    const [template] = await db
      .select({ productId: workTemplatesTable.productId })
      .from(workTemplatesTable)
      .where(and(eq(workTemplatesTable.id, templateId), eq(workTemplatesTable.companyId, companyId)));

    if (!template?.productId) { res.json({ avgDays: null, jobCount: 0 }); return; }

    const [row] = await db
      .select({
        avgDays: sql<number>`round(avg(extract(epoch from (${workProjectsTable.completedAt} - ${workProjectsTable.createdAt})) / 86400.0), 1)`,
        jobCount: sql<number>`count(distinct ${workProjectsTable.id})::int`,
      })
      .from(workProjectsTable)
      .innerJoin(workProjectItemsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
      .where(
        and(
          eq(workProjectsTable.companyId, companyId),
          eq(workProjectsTable.status, "completed"),
          isNotNull(workProjectsTable.completedAt),
          eq(workProjectItemsTable.productId, template.productId),
        )
      );

    res.json({ avgDays: row?.avgDays ?? null, jobCount: row?.jobCount ?? 0 });
  } catch (err) {
    req.log.error({ err }, "Failed to get template duration");
    res.status(500).json({ error: "Failed to get template duration" });
  }
});

// GET /analytics/live-insights — pure-SQL insights (Standard+): duration drift, bottlenecks, at-risk jobs
router.get("/live-insights", requireAuth, requireAdmin, requireStandardPlan, async (req, res) => {
  try {
    const companyId = req.session.companyId!;

    // ── 1. Duration drift: steps where actual >> or << estimate (≥3 completed samples) ──
    const driftRows = await db
      .select({
        stepName: workItemStepsTable.name,
        stationTypeId: workItemStepsTable.stationTypeId,
        stationName: stationTypesTable.name,
        stationColor: stationTypesTable.color,
        sampleCount: sql<number>`count(*)::int`,
        avgActualMin: sql<number>`round(avg(${workItemStepsTable.totalTimeSeconds}) / 60.0, 1)`,
        avgEstimateMin: sql<number>`round(avg(${workItemStepsTable.durationEstimate}), 1)`,
        driftPct: sql<number>`round(
          (avg(${workItemStepsTable.totalTimeSeconds}) / 60.0 - avg(${workItemStepsTable.durationEstimate}))
          / nullif(avg(${workItemStepsTable.durationEstimate}), 0) * 100
        , 0)`,
      })
      .from(workItemStepsTable)
      .leftJoin(stationTypesTable, eq(workItemStepsTable.stationTypeId, stationTypesTable.id))
      .innerJoin(workProjectItemsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
      .innerJoin(workProjectsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
      .where(
        and(
          eq(workProjectsTable.companyId, companyId),
          eq(workItemStepsTable.status, "completed"),
          gt(workItemStepsTable.totalTimeSeconds, 0),
          isNotNull(workItemStepsTable.durationEstimate),
          gt(workItemStepsTable.durationEstimate, 0),
        )
      )
      .groupBy(
        workItemStepsTable.name,
        workItemStepsTable.stationTypeId,
        stationTypesTable.name,
        stationTypesTable.color,
      )
      .having(sql`count(*) >= 3`)
      .orderBy(sql`abs(round(
        (avg(${workItemStepsTable.totalTimeSeconds}) / 60.0 - avg(${workItemStepsTable.durationEstimate}))
        / nullif(avg(${workItemStepsTable.durationEstimate}), 0) * 100
      , 0)) desc`)
      .limit(5);

    // ── 2. Bottleneck stations: highest queue depth on active projects ──
    const bottleneckRows = await db
      .select({
        stationTypeId: stationTypesTable.id,
        stationName: stationTypesTable.name,
        stationColor: stationTypesTable.color,
        queueDepth: sql<number>`count(*)::int`,
      })
      .from(workItemStepsTable)
      .innerJoin(stationTypesTable, eq(workItemStepsTable.stationTypeId, stationTypesTable.id))
      .innerJoin(workProjectItemsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
      .innerJoin(workProjectsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
      .where(
        and(
          eq(workProjectsTable.companyId, companyId),
          eq(workProjectsTable.status, "in_progress"),
          inArray(workItemStepsTable.status, ["not_started", "in_progress"]),
        )
      )
      .groupBy(stationTypesTable.id, stationTypesTable.name, stationTypesTable.color)
      .orderBy(sql`count(*) desc`)
      .limit(6);

    // ── 3. At-risk jobs: deadline ≤ 5 days, still has incomplete steps ──
    const fiveDaysFromNow = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const atRiskRows = await db
      .select({
        projectId: workProjectsTable.id,
        projectName: workProjectsTable.name,
        deadline: workProjectsTable.deadline,
        priority: workProjectsTable.priority,
        incompleteSteps: sql<number>`count(*) filter (where ${workItemStepsTable.status} != 'completed')::int`,
        totalSteps: sql<number>`count(*)::int`,
      })
      .from(workProjectsTable)
      .innerJoin(workProjectItemsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
      .innerJoin(workItemStepsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
      .where(
        and(
          eq(workProjectsTable.companyId, companyId),
          eq(workProjectsTable.status, "in_progress"),
          lte(workProjectsTable.deadline, fiveDaysFromNow),
        )
      )
      .groupBy(workProjectsTable.id, workProjectsTable.name, workProjectsTable.deadline, workProjectsTable.priority)
      .having(sql`count(*) filter (where ${workItemStepsTable.status} != 'completed') > 0`)
      .orderBy(workProjectsTable.deadline)
      .limit(10);

    res.json({
      durationDrift: driftRows,
      bottlenecks: bottleneckRows,
      atRisk: atRiskRows,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to compute live insights");
    res.status(500).json({ error: "Failed to compute insights" });
  }
});

export default router;
