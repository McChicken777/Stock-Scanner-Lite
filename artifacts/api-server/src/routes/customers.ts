import { Router, type IRouter } from "express";
import { db, customersTable, quotesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

const customerSchema = z.object({
  name: z.string().trim().min(1),
  contactPerson: z.string().nullable().optional(),
  email: z.string().email().or(z.literal("")).nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

router.get("/", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const rows = await db.select().from(customersTable)
      .where(eq(customersTable.companyId, companyId))
      .orderBy(customersTable.name);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list customers");
    res.status(500).json({ error: "Failed to list customers" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = customerSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const d = parsed.data;
    const [row] = await db.insert(customersTable).values({
      name: d.name,
      contactPerson: d.contactPerson ?? null,
      email: d.email || null,
      phone: d.phone ?? null,
      address: d.address ?? null,
      notes: d.notes ?? null,
      companyId,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create customer");
    res.status(500).json({ error: "Failed to create customer" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;
    const [row] = await db.select().from(customersTable)
      .where(and(eq(customersTable.id, id), eq(customersTable.companyId, companyId)));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to get customer");
    res.status(500).json({ error: "Failed to get customer" });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;
    const parsed = customerSchema.partial().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const d = parsed.data;
    const updates: Record<string, unknown> = {};
    if (d.name !== undefined) updates.name = d.name;
    if (d.contactPerson !== undefined) updates.contactPerson = d.contactPerson ?? null;
    if (d.email !== undefined) updates.email = d.email || null;
    if (d.phone !== undefined) updates.phone = d.phone ?? null;
    if (d.address !== undefined) updates.address = d.address ?? null;
    if (d.notes !== undefined) updates.notes = d.notes ?? null;

    const [row] = await db.update(customersTable).set(updates)
      .where(and(eq(customersTable.id, id), eq(customersTable.companyId, companyId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update customer");
    res.status(500).json({ error: "Failed to update customer" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;
    const result = await db.delete(customersTable)
      .where(and(eq(customersTable.id, id), eq(customersTable.companyId, companyId)))
      .returning();
    if (result.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete customer");
    res.status(500).json({ error: "Failed to delete customer" });
  }
});

router.get("/:id/quotes", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;
    const rows = await db.select().from(quotesTable)
      .where(and(eq(quotesTable.customerId, id), eq(quotesTable.companyId, companyId)))
      .orderBy(desc(quotesTable.createdAt));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list customer quotes");
    res.status(500).json({ error: "Failed to list customer quotes" });
  }
});

export default router;
