import { Router, type IRouter } from "express";
import { db, rawMaterialsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const materialSchema = z.object({
  name: z.string().min(1).max(200),
  shape: z.string().max(30).optional(),
  profile: z.string().max(50).optional(),
  profileMm: z.number().positive().nullable().optional(),
  unit: z.string().min(1).max(20).default("mm"),
  notes: z.string().max(500).optional(),
});

router.get("/", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const materials = await db.select().from(rawMaterialsTable)
      .where(eq(rawMaterialsTable.companyId, companyId))
      .orderBy(rawMaterialsTable.name);
    res.json(materials);
  } catch (err) {
    req.log.error({ err }, "Failed to list raw materials");
    res.status(500).json({ error: "Failed to list materials" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = materialSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const [m] = await db.insert(rawMaterialsTable).values({
      companyId,
      name: parsed.data.name,
      shape: parsed.data.shape ?? null,
      profile: parsed.data.profile ?? null,
      profileMm: parsed.data.profileMm ?? null,
      unit: parsed.data.unit,
      notes: parsed.data.notes ?? null,
    }).returning();
    res.status(201).json(m);
  } catch (err) {
    req.log.error({ err }, "Failed to create raw material");
    res.status(500).json({ error: "Failed to create material" });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;
    const parsed = materialSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const [m] = await db.update(rawMaterialsTable)
      .set({
        name: parsed.data.name,
        shape: parsed.data.shape ?? null,
        profile: parsed.data.profile ?? null,
        profileMm: parsed.data.profileMm ?? null,
        unit: parsed.data.unit,
        notes: parsed.data.notes ?? null,
      })
      .where(and(eq(rawMaterialsTable.id, id), eq(rawMaterialsTable.companyId, companyId)))
      .returning();
    if (!m) { res.status(404).json({ error: "Not found" }); return; }
    res.json(m);
  } catch (err) {
    req.log.error({ err }, "Failed to update raw material");
    res.status(500).json({ error: "Failed to update material" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;
    await db.delete(rawMaterialsTable)
      .where(and(eq(rawMaterialsTable.id, id), eq(rawMaterialsTable.companyId, companyId)));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Failed to delete raw material");
    res.status(500).json({ error: "Failed to delete material" });
  }
});

export default router;
