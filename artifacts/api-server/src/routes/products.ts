import { Router, type IRouter } from "express";
import { db, productsTable, stockTable, insertProductSchema, productComponentsTable, productProceduresTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const products = await db.select().from(productsTable)
      .where(eq(productsTable.companyId, companyId))
      .orderBy(productsTable.name);
    const stockTotals = await db
      .select({
        productId: stockTable.productId,
        total: sql<number>`COALESCE(SUM(${stockTable.quantity}), 0)`.as("total"),
      })
      .from(stockTable)
      .innerJoin(productsTable, eq(stockTable.productId, productsTable.id))
      .where(eq(productsTable.companyId, companyId))
      .groupBy(stockTable.productId);
    const totalsMap = new Map(stockTotals.map((s) => [s.productId, s.total]));
    const result = products.map((p) => {
      const totalStock = Number(totalsMap.get(p.id) ?? 0);
      return { ...p, totalStock, isLowStock: totalStock < p.bufferStock };
    });
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list products");
    res.status(500).json({ error: "Failed to list products" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const body = { ...req.body, companyId, category: req.body.category ?? "" };
    const parsed = insertProductSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [product] = await db.insert(productsTable).values(parsed.data).returning();
    res.status(201).json(product);
  } catch (err) {
    req.log.error({ err }, "Failed to create product");
    res.status(500).json({ error: "Failed to create product" });
  }
});

router.get("/:productId", requireAuth, async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const companyId = req.session.companyId!;
    const [product] = await db.select().from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.companyId, companyId)));
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    const [stockRow] = await db
      .select({ total: sql<number>`COALESCE(SUM(${stockTable.quantity}), 0)`.as("total") })
      .from(stockTable)
      .where(eq(stockTable.productId, productId));
    const totalStock = Number(stockRow?.total ?? 0);
    res.json({ ...product, totalStock, isLowStock: totalStock < product.bufferStock });
  } catch (err) {
    req.log.error({ err }, "Failed to get product");
    res.status(500).json({ error: "Failed to get product" });
  }
});

const updateProductSchema = z.object({
  name: z.string().optional(),
  category: z.string().optional(),
  itemType: z.enum(["purchase", "production", "final_product", "manufactured_part", "purchased_part"]).optional(),
  bufferStock: z.number().int().min(0).optional(),
  targetStock: z.number().int().min(0).optional(),
  alertEmail: z.string().email().nullable().optional(),
  supplierId: z.number().int().nullable().optional(),
  supplierProductName: z.string().nullable().optional(),
  supplierSku: z.string().nullable().optional(),
});

router.put("/:productId", requireAdmin, async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const companyId = req.session.companyId!;
    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [product] = await db
      .update(productsTable)
      .set(parsed.data)
      .where(and(eq(productsTable.id, productId), eq(productsTable.companyId, companyId)))
      .returning();
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.json(product);
  } catch (err) {
    req.log.error({ err }, "Failed to update product");
    res.status(500).json({ error: "Failed to update product" });
  }
});

router.delete("/:productId", requireAdmin, async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const companyId = req.session.companyId!;
    await db.delete(productsTable).where(and(eq(productsTable.id, productId), eq(productsTable.companyId, companyId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete product");
    res.status(500).json({ error: "Failed to delete product" });
  }
});

// ─── PRODUCT COMPONENTS (BOM) ──────────────────────────────────────────────────

router.get("/:productId/components", requireAuth, async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const companyId = req.session.companyId!;
    const [product] = await db.select().from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.companyId, companyId)));
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }

    const components = await db.select().from(productComponentsTable)
      .where(eq(productComponentsTable.parentProductId, productId))
      .orderBy(productComponentsTable.sortOrder);

    const componentsWithDetails = await Promise.all(
      components.map(async (comp) => {
        const [compProduct] = await db.select().from(productsTable).where(eq(productsTable.id, comp.componentProductId));
        const procedures = await db.select().from(productProceduresTable)
          .where(eq(productProceduresTable.productId, comp.componentProductId))
          .orderBy(productProceduresTable.sortOrder);
        return { ...comp, product: compProduct, procedures };
      }),
    );

    res.json(componentsWithDetails);
  } catch (err) {
    req.log.error({ err }, "Failed to list components");
    res.status(500).json({ error: "Failed to list components" });
  }
});

router.post("/:productId/components", requireAdmin, async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const companyId = req.session.companyId!;
    const [product] = await db.select().from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.companyId, companyId)));
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }

    const parsed = z.object({
      componentProductId: z.number().int(),
      quantity: z.number().int().min(1).default(1),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const { componentProductId, quantity } = parsed.data;
    const [compProduct] = await db.select().from(productsTable)
      .where(and(eq(productsTable.id, componentProductId), eq(productsTable.companyId, companyId)));
    if (!compProduct) { res.status(404).json({ error: "Component product not found" }); return; }

    const existing = await db.select().from(productComponentsTable)
      .where(eq(productComponentsTable.parentProductId, productId))
      .orderBy(productComponentsTable.sortOrder);
    const sortOrder = existing.length;

    const [comp] = await db.insert(productComponentsTable).values({
      parentProductId: productId, componentProductId, quantity, sortOrder,
    }).returning();

    const procedures = await db.select().from(productProceduresTable)
      .where(eq(productProceduresTable.productId, componentProductId))
      .orderBy(productProceduresTable.sortOrder);

    res.status(201).json({ ...comp, product: compProduct, procedures });
  } catch (err) {
    req.log.error({ err }, "Failed to add component");
    res.status(500).json({ error: "Failed to add component" });
  }
});

router.delete("/:productId/components/:componentId", requireAdmin, async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const componentId = Number(req.params.componentId);
    const companyId = req.session.companyId!;
    const [product] = await db.select().from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.companyId, companyId)));
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }

    await db.delete(productComponentsTable)
      .where(and(eq(productComponentsTable.id, componentId), eq(productComponentsTable.parentProductId, productId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to remove component");
    res.status(500).json({ error: "Failed to remove component" });
  }
});

router.put("/:productId/components/reorder", requireAdmin, async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const companyId = req.session.companyId!;
    const [product] = await db.select().from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.companyId, companyId)));
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }

    const parsed = z.object({
      order: z.array(z.object({ id: z.number().int(), sortOrder: z.number().int() })),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    for (const { id, sortOrder } of parsed.data.order) {
      await db.update(productComponentsTable).set({ sortOrder })
        .where(and(eq(productComponentsTable.id, id), eq(productComponentsTable.parentProductId, productId)));
    }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to reorder components");
    res.status(500).json({ error: "Failed to reorder components" });
  }
});

// ─── PRODUCT PROCEDURES (for manufactured_parts) ───────────────────────────────

router.get("/:productId/procedures", requireAuth, async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const companyId = req.session.companyId!;
    const [product] = await db.select().from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.companyId, companyId)));
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }

    const procedures = await db.select().from(productProceduresTable)
      .where(eq(productProceduresTable.productId, productId))
      .orderBy(productProceduresTable.sortOrder);
    res.json(procedures);
  } catch (err) {
    req.log.error({ err }, "Failed to list procedures");
    res.status(500).json({ error: "Failed to list procedures" });
  }
});

router.post("/:productId/procedures", requireAdmin, async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const companyId = req.session.companyId!;
    const [product] = await db.select().from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.companyId, companyId)));
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }

    const parsed = z.object({
      name: z.string().min(1),
      sortOrder: z.number().int().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    let sortOrder = parsed.data.sortOrder;
    if (sortOrder === undefined) {
      const existing = await db.select().from(productProceduresTable)
        .where(eq(productProceduresTable.productId, productId));
      sortOrder = existing.length;
    }

    const [proc] = await db.insert(productProceduresTable).values({
      productId, name: parsed.data.name, sortOrder,
    }).returning();
    res.status(201).json(proc);
  } catch (err) {
    req.log.error({ err }, "Failed to add procedure");
    res.status(500).json({ error: "Failed to add procedure" });
  }
});

router.put("/:productId/procedures/reorder", requireAdmin, async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const companyId = req.session.companyId!;
    const [product] = await db.select().from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.companyId, companyId)));
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }

    const parsed = z.object({
      order: z.array(z.object({ id: z.number().int(), sortOrder: z.number().int() })),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    for (const { id, sortOrder } of parsed.data.order) {
      await db.update(productProceduresTable).set({ sortOrder })
        .where(and(eq(productProceduresTable.id, id), eq(productProceduresTable.productId, productId)));
    }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to reorder procedures");
    res.status(500).json({ error: "Failed to reorder procedures" });
  }
});

router.delete("/:productId/procedures/:procedureId", requireAdmin, async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const procedureId = Number(req.params.procedureId);
    const companyId = req.session.companyId!;
    const [product] = await db.select().from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.companyId, companyId)));
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }

    await db.delete(productProceduresTable)
      .where(and(eq(productProceduresTable.id, procedureId), eq(productProceduresTable.productId, productId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to remove procedure");
    res.status(500).json({ error: "Failed to remove procedure" });
  }
});

export default router;
