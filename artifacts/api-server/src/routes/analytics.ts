import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { runAnalyticsJob, getLatestSnapshot } from "../lib/analyticsJob";

const router: IRouter = Router();

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

export default router;
