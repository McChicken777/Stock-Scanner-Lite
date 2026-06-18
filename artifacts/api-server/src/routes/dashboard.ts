import { Router, type IRouter } from "express";
import { db, productsTable, stockTable, locationsTable, historyTable, shortageFlagsTable } from "@workspace/db";
import { eq, sql, desc, and, isNull } from "drizzle-orm";

const router: IRouter = Router();

router.get("/summary", async (req, res) => {
  try {
    const companyId = req.session.companyId!;

    const [locationCountRow] = await db
      .select({ count: sql<number>`COUNT(*)`.as("count") })
      .from(locationsTable)
      .where(eq(locationsTable.companyId, companyId));
    const totalLocations = Number(locationCountRow?.count ?? 0);

    const products = await db.select().from(productsTable).where(eq(productsTable.companyId, companyId));
    const totalProducts = products.length;

    const stockTotals = await db
      .select({
        productId: stockTable.productId,
        total: sql<number>`COALESCE(SUM(${stockTable.quantity}), 0)`.as("total"),
      })
      .from(stockTable)
      .innerJoin(productsTable, eq(stockTable.productId, productsTable.id))
      .where(eq(productsTable.companyId, companyId))
      .groupBy(stockTable.productId);

    const totalsMap = new Map(stockTotals.map((s) => [s.productId, Number(s.total)]));

    const productsWithStock = products.map((p) => {
      const totalStock = totalsMap.get(p.id) ?? 0;
      return { ...p, totalStock };
    });

    // Low stock is now flag-driven: open shortage flags (resolvedAt IS NULL).
    const openFlags = await db
      .select({
        id: shortageFlagsTable.id,
        productId: shortageFlagsTable.productId,
        productName: shortageFlagsTable.productName,
        quantityNeeded: shortageFlagsTable.quantityNeeded,
        flaggedBy: shortageFlagsTable.flaggedByUsername,
        createdAt: shortageFlagsTable.createdAt,
      })
      .from(shortageFlagsTable)
      .where(and(eq(shortageFlagsTable.companyId, companyId), isNull(shortageFlagsTable.resolvedAt)))
      .orderBy(desc(shortageFlagsTable.createdAt));

    const categoryByProduct = new Map(products.map((p) => [p.id, p.category]));
    const lowStockProducts = openFlags.map((f) => ({
      id: f.id,
      name: f.productName,
      category: f.productId != null ? (categoryByProduct.get(f.productId) ?? "") : "",
      quantityNeeded: f.quantityNeeded,
      flaggedBy: f.flaggedBy,
    }));

    const recentActivity = await db
      .select({
        id: historyTable.id,
        locationId: historyTable.locationId,
        productId: historyTable.productId,
        productName: productsTable.name,
        previousQuantity: historyTable.previousQuantity,
        newQuantity: historyTable.newQuantity,
        delta: historyTable.delta,
        changedBy: historyTable.changedBy,
        changedAt: historyTable.changedAt,
      })
      .from(historyTable)
      .innerJoin(productsTable, eq(historyTable.productId, productsTable.id))
      .where(and(eq(historyTable.companyId, companyId), eq(productsTable.companyId, companyId)))
      .orderBy(desc(historyTable.changedAt))
      .limit(10);

    const categoryBreakdown: { category: string; productCount: number; totalStock: number }[] = [];
    const catMap = new Map<string, { productCount: number; totalStock: number }>();
    for (const p of productsWithStock) {
      const existing = catMap.get(p.category) ?? { productCount: 0, totalStock: 0 };
      catMap.set(p.category, {
        productCount: existing.productCount + 1,
        totalStock: existing.totalStock + p.totalStock,
      });
    }
    for (const [category, data] of catMap.entries()) {
      categoryBreakdown.push({ category, ...data });
    }
    categoryBreakdown.sort((a, b) => a.category.localeCompare(b.category));

    res.json({ totalLocations, totalProducts, lowStockProducts, recentActivity, categoryBreakdown });
  } catch (err) {
    req.log.error({ err }, "Failed to get dashboard summary");
    res.status(500).json({ error: "Failed to get dashboard summary" });
  }
});

export default router;
