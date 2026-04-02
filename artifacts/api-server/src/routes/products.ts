import { Router, type IRouter } from "express";
import { db, productsTable, stockTable, insertProductSchema } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/", async (req, res) => {
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
    const parsed = insertProductSchema.safeParse({ ...req.body, companyId });
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

router.get("/:productId", async (req, res) => {
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
  bufferStock: z.number().int().min(0).optional(),
  alertEmail: z.string().email().nullable().optional(),
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

export default router;
