import { Router, type IRouter } from "express";
import { db, companiesTable, PLAN_FEATURES } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import type { CompanyFeatures } from "@workspace/db";

const router: IRouter = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId));
    if (!company) { res.status(404).json({ error: "Company not found" }); return; }
    res.json(company);
  } catch (err) {
    req.log.error({ err }, "Failed to get company");
    res.status(500).json({ error: "Failed to get company" });
  }
});

router.put("/", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const schema = z.object({
      name: z.string().min(1).optional(),
      plan: z.enum(["basic", "pro"]).optional(),
      workHoursPerDay: z.number().int().min(60).max(1440).optional(),
      weekendOvertimeEnabled: z.boolean().optional(),
      country: z.string().max(10).nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const updates: Record<string, unknown> = {};
    if (parsed.data.name) updates.name = parsed.data.name;
    if (parsed.data.plan) {
      updates.plan = parsed.data.plan;
      updates.features = { ...PLAN_FEATURES[parsed.data.plan] };
    }
    if (parsed.data.workHoursPerDay !== undefined) updates.workHoursPerDay = parsed.data.workHoursPerDay;

    const [company] = await db.update(companiesTable).set(updates as never).where(eq(companiesTable.id, companyId)).returning();
    // Update session features
    req.session.features = company.features as CompanyFeatures;
    res.json(company);
  } catch (err) {
    req.log.error({ err }, "Failed to update company");
    res.status(500).json({ error: "Failed to update company" });
  }
});

const featuresSchema = z.object({
  inventory: z.boolean().optional(),
  alerts: z.boolean().optional(),
  work_orders: z.boolean().optional(),
  progress_tracking: z.boolean().optional(),
  deadline_alerts: z.boolean().optional(),
  time_tracking: z.boolean().optional(),
});

router.put("/features", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = featuresSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [current] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId));
    if (!current) { res.status(404).json({ error: "Company not found" }); return; }

    const newFeatures = { ...(current.features as CompanyFeatures), ...parsed.data };
    const [company] = await db.update(companiesTable)
      .set({ features: newFeatures })
      .where(eq(companiesTable.id, companyId))
      .returning();

    req.session.features = newFeatures;
    res.json(company);
  } catch (err) {
    req.log.error({ err }, "Failed to update features");
    res.status(500).json({ error: "Failed to update features" });
  }
});

export default router;
