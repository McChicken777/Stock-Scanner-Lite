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

function parseCSVRows(text: string): string[][] {
  const delimiter = text.includes(";") ? ";" : ",";
  return text.trim().split(/\r?\n/).map((line) =>
    line.split(delimiter).map((cell) => cell.trim().replace(/^["']|["']$/g, ""))
  );
}

router.post("/items/import", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = z.object({
      categoryId: z.number().int().nullable().optional(),
      csv: z.string().min(1),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

    const rows = parseCSVRows(parsed.data.csv);
    if (rows.length === 0) { res.json({ imported: 0, skipped: 0, errors: [] }); return; }

    // Detect header row by checking if first cell is non-numeric
    const nameAliases = ["name", "naziv", "item", "artikel"];
    const descAliases = ["description", "opis", "desc"];
    const priceAliases = ["price", "unit_price", "unitprice", "cena", "unit price"];

    let startIdx = 0;
    let nameCol = 0;
    let descCol = 1;
    let priceCol = 2;

    const firstCell = rows[0][0].toLowerCase();
    if (nameAliases.includes(firstCell) || isNaN(Number(firstCell.replace(",", ".")))) {
      startIdx = 1;
      const header = rows[0].map((h) => h.toLowerCase().trim());
      const ni = header.findIndex((h) => nameAliases.includes(h));
      const di = header.findIndex((h) => descAliases.includes(h));
      const pi = header.findIndex((h) => priceAliases.includes(h));
      if (ni !== -1) nameCol = ni;
      if (di !== -1) descCol = di;
      if (pi !== -1) priceCol = pi;
      // 2-column fallback: name, price (no description)
      if (di === -1 && pi !== -1 && rows[0].length === 2) {
        descCol = -1;
        priceCol = 1;
      }
    } else if (rows[0].length === 2) {
      // 2-column positional: name, price
      descCol = -1;
      priceCol = 1;
    }

    const toInsert: { companyId: number; name: string; description: string | null; unitPrice: number | null; categoryId: number | null; sortOrder: number }[] = [];
    const errors: string[] = [];
    let skipped = 0;

    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i];
      const name = row[nameCol]?.trim();
      if (!name) { skipped++; continue; }
      const desc = descCol >= 0 ? (row[descCol]?.trim() || null) : null;
      const rawPrice = priceCol >= 0 ? row[priceCol]?.trim().replace(",", ".") : undefined;
      const unitPrice = rawPrice ? parseFloat(rawPrice) : null;
      if (rawPrice && isNaN(unitPrice!)) {
        errors.push(`Row ${i + 1}: invalid price "${row[priceCol]}"`);
        skipped++;
        continue;
      }
      toInsert.push({ companyId, name, description: desc, unitPrice: unitPrice ?? null, categoryId: parsed.data.categoryId ?? null, sortOrder: i });
    }

    if (toInsert.length > 0) {
      await db.insert(catalogItemsTable).values(toInsert);
    }

    res.json({ imported: toInsert.length, skipped, errors });
  } catch (err) {
    req.log.error({ err }, "Failed to import catalog items");
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
