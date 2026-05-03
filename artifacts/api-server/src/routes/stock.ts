import { Router, type IRouter } from "express";
import { db, stockTable, productsTable, historyTable, locationsTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { z } from "zod";
import { sendLowStockAlert } from "../lib/email";

const router: IRouter = Router();

router.get("/valuation", async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const products = await db.select().from(productsTable)
      .where(eq(productsTable.companyId, companyId));
    const totals = await db
      .select({
        productId: stockTable.productId,
        totalQty: sql<number>`COALESCE(SUM(${stockTable.quantity}), 0)::int`.as("total_qty"),
      })
      .from(stockTable)
      .innerJoin(locationsTable, eq(stockTable.locationId, locationsTable.id))
      .where(eq(locationsTable.companyId, companyId))
      .groupBy(stockTable.productId);
    const totalsMap = new Map(totals.map((t) => [t.productId, Number(t.totalQty)]));
    const rows = products.map((p) => ({
      productId: p.id,
      name: p.name,
      category: p.category,
      unitCost: p.unitCost,
      salePrice: (p as typeof p & { salePrice?: number }).salePrice ?? 0,
      totalQty: totalsMap.get(p.id) ?? 0,
    }));

    const catMap = new Map<string, {
      category: string;
      productCount: number;
      totalQty: number;
      totalValue: number;
      totalRevenue: number;
      totalMargin: number;
      products: { productId: number; name: string; totalQty: number; unitCost: number; salePrice: number; totalValue: number; totalRevenue: number; totalMargin: number }[];
    }>();
    let totalValue = 0;
    let totalRevenue = 0;
    let totalMargin = 0;
    let totalQty = 0;
    let productsWithoutCost = 0;
    let productsWithoutSalePrice = 0;
    for (const r of rows) {
      const qty = Number(r.totalQty ?? 0);
      const cost = Number(r.unitCost ?? 0);
      const price = Number(r.salePrice ?? 0);
      const value = qty * cost;
      const revenue = qty * price;
      const margin = revenue - value;
      totalQty += qty;
      totalValue += value;
      totalRevenue += revenue;
      totalMargin += margin;
      if (cost <= 0) productsWithoutCost += 1;
      if (price <= 0) productsWithoutSalePrice += 1;
      const cat = r.category || "Uncategorised";
      const entry = catMap.get(cat) ?? { category: cat, productCount: 0, totalQty: 0, totalValue: 0, totalRevenue: 0, totalMargin: 0, products: [] };
      entry.productCount += 1;
      entry.totalQty += qty;
      entry.totalValue += value;
      entry.totalRevenue += revenue;
      entry.totalMargin += margin;
      entry.products.push({ productId: r.productId, name: r.name, totalQty: qty, unitCost: cost, salePrice: price, totalValue: value, totalRevenue: revenue, totalMargin: margin });
      catMap.set(cat, entry);
    }
    const categories = Array.from(catMap.values())
      .map((c) => ({ ...c, products: c.products.sort((a, b) => b.totalValue - a.totalValue) }))
      .sort((a, b) => b.totalValue - a.totalValue);

    res.json({ totalValue, totalRevenue, totalMargin, totalQty, totalProducts: rows.length, productsWithoutCost, productsWithoutSalePrice, categories });
  } catch (err) {
    req.log.error({ err }, "Failed to get stock valuation");
    res.status(500).json({ error: "Failed to get stock valuation" });
  }
});

router.get("/:locationId", async (req, res) => {
  try {
    const { locationId } = req.params;
    const companyId = req.session.companyId!;
    // Verify location belongs to this company
    const [location] = await db.select().from(locationsTable)
      .where(and(eq(locationsTable.id, locationId), eq(locationsTable.companyId, companyId)));
    if (!location) { res.status(404).json({ error: "Location not found" }); return; }

    const stock = await db
      .select({
        locationId: stockTable.locationId,
        productId: stockTable.productId,
        quantity: stockTable.quantity,
        productName: productsTable.name,
        productCategory: productsTable.category,
        bufferStock: productsTable.bufferStock,
      })
      .from(stockTable)
      .innerJoin(productsTable, eq(stockTable.productId, productsTable.id))
      .where(and(eq(stockTable.locationId, locationId), eq(productsTable.companyId, companyId)));
    res.json(stock);
  } catch (err) {
    req.log.error({ err }, "Failed to get stock at location");
    res.status(500).json({ error: "Failed to get stock" });
  }
});

const updateStockSchema = z.object({
  quantity: z.number().int().min(0).optional(),
  delta: z.number().int().optional(),
  changedBy: z.string().nullable().optional(),
});

router.put("/:locationId/:productId", async (req, res) => {
  try {
    const { locationId } = req.params;
    const productId = Number(req.params.productId);
    const companyId = req.session.companyId!;

    const parsed = updateStockSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { quantity, delta, changedBy } = parsed.data;

    if (quantity === undefined && delta === undefined) {
      res.status(400).json({ error: "Provide either quantity or delta" });
      return;
    }

    const [product] = await db.select().from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.companyId, companyId)));
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }

    const [location] = await db.select().from(locationsTable)
      .where(and(eq(locationsTable.id, locationId), eq(locationsTable.companyId, companyId)));
    if (!location) { res.status(404).json({ error: "Location not found" }); return; }

    const [existingStock] = await db
      .select()
      .from(stockTable)
      .where(and(eq(stockTable.locationId, locationId), eq(stockTable.productId, productId)));

    const previousQuantity = existingStock?.quantity ?? 0;
    let newQuantity: number;

    if (quantity !== undefined) {
      newQuantity = quantity;
    } else {
      newQuantity = previousQuantity + (delta ?? 0);
    }

    if (newQuantity < 0) {
      res.status(400).json({ error: "Stock cannot be negative" });
      return;
    }

    if (newQuantity === 0) {
      await db.delete(stockTable)
        .where(and(eq(stockTable.locationId, locationId), eq(stockTable.productId, productId)));
    } else if (existingStock) {
      await db.update(stockTable)
        .set({ quantity: newQuantity })
        .where(and(eq(stockTable.locationId, locationId), eq(stockTable.productId, productId)));
    } else {
      await db.insert(stockTable).values({ locationId, productId, quantity: newQuantity });
    }

    const actualDelta = newQuantity - previousQuantity;
    await db.insert(historyTable).values({
      locationId,
      productId,
      previousQuantity,
      newQuantity,
      delta: actualDelta,
      changedBy: changedBy ?? null,
      companyId,
    });

    const [totalRow] = await db
      .select({ total: sql<number>`COALESCE(SUM(${stockTable.quantity}), 0)`.as("total") })
      .from(stockTable)
      .where(eq(stockTable.productId, productId));

    const totalStock = Number(totalRow?.total ?? 0);
    const isLowStock = totalStock < product.bufferStock;

    let alertSent = false;
    if (isLowStock && product.alertEmail && actualDelta <= 0 && req.session.features?.alerts) {
      alertSent = await sendLowStockAlert({
        productName: product.name,
        category: product.category,
        totalStock,
        bufferStock: product.bufferStock,
        alertEmail: product.alertEmail,
      });
    }

    res.json({ locationId, productId, quantity: newQuantity, totalStock, isLowStock, alertSent });
  } catch (err) {
    req.log.error({ err }, "Failed to update stock");
    res.status(500).json({ error: "Failed to update stock" });
  }
});

export default router;
