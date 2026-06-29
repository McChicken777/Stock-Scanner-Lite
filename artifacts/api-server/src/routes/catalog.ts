import { Router, type IRouter } from "express";
import { db, catalogCategoriesTable, catalogItemsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

// ─── CATEGORIES ───────────────────────────────────────────────────────────────

router.get("/categories", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const rows = await db.select().from(catalogCategoriesTable)
      .where(eq(catalogCategoriesTable.companyId, companyId))
      .orderBy(asc(catalogCategoriesTable.parentId), asc(catalogCategoriesTable.sortOrder), asc(catalogCategoriesTable.name));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list catalog categories");
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/categories", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = z.object({
      name: z.string().trim().min(1),
      parentId: z.number().int().nullable().optional(),
      sortOrder: z.number().int().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const [row] = await db.insert(catalogCategoriesTable).values({
      companyId,
      name: parsed.data.name,
      parentId: parsed.data.parentId ?? null,
      sortOrder: parsed.data.sortOrder ?? 0,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create catalog category");
    res.status(500).json({ error: "Failed" });
  }
});

router.put("/categories/:id", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const id = Number(req.params.id);
    const parsed = z.object({
      name: z.string().trim().min(1).optional(),
      parentId: z.number().int().nullable().optional(),
      sortOrder: z.number().int().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const set: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) set.name = parsed.data.name;
    if (parsed.data.parentId !== undefined) set.parentId = parsed.data.parentId;
    if (parsed.data.sortOrder !== undefined) set.sortOrder = parsed.data.sortOrder;
    const [row] = await db.update(catalogCategoriesTable)
      .set(set)
      .where(and(eq(catalogCategoriesTable.id, id), eq(catalogCategoriesTable.companyId, companyId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update catalog category");
    res.status(500).json({ error: "Failed" });
  }
});

router.delete("/categories/:id", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const id = Number(req.params.id);
    await db.delete(catalogCategoriesTable)
      .where(and(eq(catalogCategoriesTable.id, id), eq(catalogCategoriesTable.companyId, companyId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete catalog category");
    res.status(500).json({ error: "Failed" });
  }
});

// ─── ITEMS ────────────────────────────────────────────────────────────────────

router.get("/items", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
    const rows = await db.select().from(catalogItemsTable)
      .where(and(
        eq(catalogItemsTable.companyId, companyId),
        ...(categoryId !== undefined ? [eq(catalogItemsTable.categoryId, categoryId)] : []),
      ))
      .orderBy(asc(catalogItemsTable.sortOrder), asc(catalogItemsTable.name));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list catalog items");
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/items", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = z.object({
      name: z.string().trim().min(1),
      description: z.string().nullable().optional(),
      unitPrice: z.number().min(0).nullable().optional(),
      categoryId: z.number().int().nullable().optional(),
      sortOrder: z.number().int().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const [row] = await db.insert(catalogItemsTable).values({
      companyId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      unitPrice: parsed.data.unitPrice ?? null,
      categoryId: parsed.data.categoryId ?? null,
      sortOrder: parsed.data.sortOrder ?? 0,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create catalog item");
    res.status(500).json({ error: "Failed" });
  }
});

router.put("/items/:id", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const id = Number(req.params.id);
    const parsed = z.object({
      name: z.string().trim().min(1).optional(),
      description: z.string().nullable().optional(),
      unitPrice: z.number().min(0).nullable().optional(),
      categoryId: z.number().int().nullable().optional(),
      sortOrder: z.number().int().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const set: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) set.name = parsed.data.name;
    if (parsed.data.description !== undefined) set.description = parsed.data.description;
    if (parsed.data.unitPrice !== undefined) set.unitPrice = parsed.data.unitPrice;
    if (parsed.data.categoryId !== undefined) set.categoryId = parsed.data.categoryId;
    if (parsed.data.sortOrder !== undefined) set.sortOrder = parsed.data.sortOrder;
    const [row] = await db.update(catalogItemsTable)
      .set(set)
      .where(and(eq(catalogItemsTable.id, id), eq(catalogItemsTable.companyId, companyId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update catalog item");
    res.status(500).json({ error: "Failed" });
  }
});

router.delete("/items/:id", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const id = Number(req.params.id);
    await db.delete(catalogItemsTable)
      .where(and(eq(catalogItemsTable.id, id), eq(catalogItemsTable.companyId, companyId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete catalog item");
    res.status(500).json({ error: "Failed" });
  }
});

// ─── CSV IMPORT ───────────────────────────────────────────────────────────────

router.post("/items/import", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = z.object({
      categoryId: z.number().int().nullable().optional(),
      items: z.array(z.object({
        name: z.string().trim().min(1),
        description: z.string().nullable().optional(),
        unitPrice: z.number().nullable().optional(),
      })).min(1),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

    const toInsert = parsed.data.items.map((item, i) => ({
      companyId,
      categoryId: parsed.data.categoryId ?? null,
      name: item.name,
      description: item.description ?? null,
      unitPrice: item.unitPrice ?? null,
      sortOrder: i,
    }));
    const inserted = await db.insert(catalogItemsTable).values(toInsert).returning({ id: catalogItemsTable.id });
    res.json({ imported: inserted.length, ids: inserted.map((r) => r.id) });
  } catch (err) {
    req.log.error({ err }, "Failed to import catalog items");
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
