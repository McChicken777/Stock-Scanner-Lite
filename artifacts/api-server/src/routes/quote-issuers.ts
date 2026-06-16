import { Router, type IRouter } from "express";
import { db, quoteIssuersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

const issuerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
});

router.get("/", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const rows = await db.select().from(quoteIssuersTable)
      .where(and(eq(quoteIssuersTable.companyId, companyId), eq(quoteIssuersTable.isActive, true)));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list quote issuers");
    res.status(500).json({ error: "Failed to list quote issuers" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = issuerSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const [issuer] = await db.insert(quoteIssuersTable).values({
      companyId,
      name: parsed.data.name,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
    }).returning();
    res.status(201).json(issuer);
  } catch (err) {
    req.log.error({ err }, "Failed to create quote issuer");
    res.status(500).json({ error: "Failed to create quote issuer" });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const id = Number(req.params.id);
    const parsed = issuerSchema.partial().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const [issuer] = await db.update(quoteIssuersTable)
      .set(parsed.data as Record<string, unknown>)
      .where(and(eq(quoteIssuersTable.id, id), eq(quoteIssuersTable.companyId, companyId)))
      .returning();
    if (!issuer) { res.status(404).json({ error: "Not found" }); return; }
    res.json(issuer);
  } catch (err) {
    req.log.error({ err }, "Failed to update quote issuer");
    res.status(500).json({ error: "Failed to update quote issuer" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const id = Number(req.params.id);
    await db.update(quoteIssuersTable)
      .set({ isActive: false })
      .where(and(eq(quoteIssuersTable.id, id), eq(quoteIssuersTable.companyId, companyId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete quote issuer");
    res.status(500).json({ error: "Failed to delete quote issuer" });
  }
});

export default router;
