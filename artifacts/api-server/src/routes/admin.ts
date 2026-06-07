import { Router, type IRouter } from "express";
import { db, leaveRequestsTable, productsTable, stockTable } from "@workspace/db";
import { eq, and, sql, lt } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// GET /api/admin/attention — aggregate count of items needing manager action
router.get("/attention", requireAuth, async (req, res) => {
  try {
    if (req.session.role !== "admin" && !req.session.isSupervisor) {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const companyId = req.session.companyId!;

    // Pending leave requests
    const [{ leaveRequests }] = await db
      .select({ leaveRequests: sql<number>`COUNT(*)::int` })
      .from(leaveRequestsTable)
      .where(and(eq(leaveRequestsTable.companyId, companyId), eq(leaveRequestsTable.status, "pending")));

    // Low stock: products where sum(stock) < bufferStock
    const stockTotals = await db
      .select({
        productId: stockTable.productId,
        total: sql<number>`COALESCE(SUM(${stockTable.quantity}), 0)`.as("total"),
      })
      .from(stockTable)
      .innerJoin(productsTable, eq(stockTable.productId, productsTable.id))
      .where(eq(productsTable.companyId, companyId))
      .groupBy(stockTable.productId);

    const stockMap = new Map(stockTotals.map((r) => [r.productId, r.total]));
    const products = await db.select({ id: productsTable.id, bufferStock: productsTable.bufferStock })
      .from(productsTable).where(eq(productsTable.companyId, companyId));

    const lowStock = products.filter((p) => (stockMap.get(p.id) ?? 0) < p.bufferStock).length;

    const total = leaveRequests + lowStock;
    res.json({ total, leaveRequests, lowStock });
  } catch (err) {
    res.status(500).json({ error: "Failed to get attention counts" });
  }
});

export default router;
