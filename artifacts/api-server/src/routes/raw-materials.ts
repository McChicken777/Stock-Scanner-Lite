import { Router, type IRouter } from "express";
import { db, rawMaterialsTable, productsTable, stockTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const RAW_MATERIAL_CATEGORY = "Raw Materials";

const materialSchema = z.object({
  name: z.string().min(1).max(200),
  displayName: z.string().max(100).nullable().optional(),
  shape: z.string().max(30).optional(),
  profile: z.string().max(50).optional(),
  profileMm: z.number().positive().nullable().optional(),
  unit: z.string().min(1).max(20).default("mm"),
  notes: z.string().max(500).optional(),
});

// Display a profile with shape-appropriate prefix (Ø for rod/hex), matching the UI.
function fmtProfile(shape: string | null | undefined, profile: string | null | undefined): string {
  if (!profile || !profile.trim()) return "";
  const p = profile.trim();
  if ((shape === "rod" || shape === "hex") && /^\d/.test(p) && !p.includes("Ø")) return `Ø${p}`;
  return p;
}

// Stock-item name for a raw material: technical grade + formatted size, e.g. "S235 Ø30".
function productNameFor(m: { name: string; shape?: string | null; profile?: string | null }): string {
  const prof = fmtProfile(m.shape, m.profile);
  return prof ? `${m.name} ${prof}` : m.name;
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const materials = await db
      .select({
        id: rawMaterialsTable.id,
        companyId: rawMaterialsTable.companyId,
        name: rawMaterialsTable.name,
        displayName: rawMaterialsTable.displayName,
        shape: rawMaterialsTable.shape,
        profile: rawMaterialsTable.profile,
        profileMm: rawMaterialsTable.profileMm,
        unit: rawMaterialsTable.unit,
        notes: rawMaterialsTable.notes,
        productId: rawMaterialsTable.productId,
        createdAt: rawMaterialsTable.createdAt,
        totalStock: sql<number>`COALESCE((
          SELECT SUM(${stockTable.quantity}) FROM ${stockTable}
          WHERE ${stockTable.productId} = ${rawMaterialsTable.productId}
        ), 0)`.as("total_stock"),
      })
      .from(rawMaterialsTable)
      .where(eq(rawMaterialsTable.companyId, companyId))
      .orderBy(rawMaterialsTable.name);
    res.json(materials.map((m) => ({ ...m, totalStock: Number(m.totalStock ?? 0) })));
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
    const d = parsed.data;

    // Create the linked stock item (a product) first so the material always has one.
    const [product] = await db.insert(productsTable).values({
      companyId,
      name: productNameFor(d),
      category: RAW_MATERIAL_CATEGORY,
      itemType: "purchase",
    }).returning();

    const [m] = await db.insert(rawMaterialsTable).values({
      companyId,
      name: d.name,
      displayName: d.displayName ?? null,
      shape: d.shape ?? null,
      profile: d.profile ?? null,
      profileMm: d.profileMm ?? null,
      unit: d.unit,
      notes: d.notes ?? null,
      productId: product.id,
    }).returning();

    res.status(201).json({ ...m, totalStock: 0 });
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
    const d = parsed.data;

    const [existing] = await db.select().from(rawMaterialsTable)
      .where(and(eq(rawMaterialsTable.id, id), eq(rawMaterialsTable.companyId, companyId)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    // Ensure a linked stock item exists, then keep its name in sync with grade/size.
    let productId = existing.productId;
    if (productId) {
      await db.update(productsTable)
        .set({ name: productNameFor(d) })
        .where(and(eq(productsTable.id, productId), eq(productsTable.companyId, companyId)));
    } else {
      const [product] = await db.insert(productsTable).values({
        companyId,
        name: productNameFor(d),
        category: RAW_MATERIAL_CATEGORY,
        itemType: "purchase",
      }).returning();
      productId = product.id;
    }

    const [m] = await db.update(rawMaterialsTable)
      .set({
        name: d.name,
        displayName: d.displayName ?? null,
        shape: d.shape ?? null,
        profile: d.profile ?? null,
        profileMm: d.profileMm ?? null,
        unit: d.unit,
        notes: d.notes ?? null,
        productId,
      })
      .where(and(eq(rawMaterialsTable.id, id), eq(rawMaterialsTable.companyId, companyId)))
      .returning();

    const [totalRow] = await db
      .select({ total: sql<number>`COALESCE(SUM(${stockTable.quantity}), 0)`.as("total") })
      .from(stockTable)
      .where(eq(stockTable.productId, productId));

    res.json({ ...m, totalStock: Number(totalRow?.total ?? 0) });
  } catch (err) {
    req.log.error({ err }, "Failed to update raw material");
    res.status(500).json({ error: "Failed to update material" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;

    const [existing] = await db.select().from(rawMaterialsTable)
      .where(and(eq(rawMaterialsTable.id, id), eq(rawMaterialsTable.companyId, companyId)));

    await db.delete(rawMaterialsTable)
      .where(and(eq(rawMaterialsTable.id, id), eq(rawMaterialsTable.companyId, companyId)));

    // Remove the linked stock item too (cascades its stock rows).
    if (existing?.productId) {
      await db.delete(productsTable)
        .where(and(eq(productsTable.id, existing.productId), eq(productsTable.companyId, companyId)));
    }

    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Failed to delete raw material");
    res.status(500).json({ error: "Failed to delete material" });
  }
});

export default router;
