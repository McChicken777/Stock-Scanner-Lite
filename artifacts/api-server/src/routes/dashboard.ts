import { Router, type IRouter } from "express";
import { db, productsTable, stockTable, locationsTable, historyTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/summary", async (req, res) => {
  try {
    const [locationCountRow] = await db
      .select({ count: sql<number>`COUNT(*)`.as("count") })
      .from(locationsTable);
    const totalLocations = Number(locationCountRow?.count ?? 0);

    const products = await db.select().from(productsTable);
    const totalProducts = products.length;

    const stockTotals = await db
      .select({
        productId: stockTable.productId,
        total: sql<number>`COALESCE(SUM(${stockTable.quantity}), 0)`.as("total"),
      })
      .from(stockTable)
      .groupBy(stockTable.productId);

    const totalsMap = new Map(stockTotals.map((s) => [s.productId, Number(s.total)]));

    const productsWithStock = products.map((p) => {
      const totalStock = totalsMap.get(p.id) ?? 0;
      return { ...p, totalStock, isLowStock: totalStock < p.bufferStock };
    });

    const lowStockProducts = productsWithStock.filter((p) => p.isLowStock);

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

    res.json({
      totalLocations,
      totalProducts,
      lowStockProducts,
      recentActivity,
      categoryBreakdown,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get dashboard summary");
    res.status(500).json({ error: "Failed to get dashboard summary" });
  }
});

export default router;
