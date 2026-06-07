import { Router, type IRouter } from "express";
import { db, leaveRequestsTable, productsTable, stockTable, attendanceLogsTable } from "@workspace/db";
import { eq, and, sql, isNull, ne } from "drizzle-orm";
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

    // Count pending leave requests
    const pendingLeave = await db
      .select({ id: leaveRequestsTable.id })
      .from(leaveRequestsTable)
      .where(and(
        eq(leaveRequestsTable.companyId, companyId),
        eq(leaveRequestsTable.status, "pending"),
      ));
    const leaveRequests = pendingLeave.length;

    // Count low-stock products (totalStock < bufferStock)
    const stockRows = await db
      .select({
        productId: stockTable.productId,
        total: sql<number>`COALESCE(SUM(${stockTable.quantity}), 0)::int`.as("total"),
      })
      .from(stockTable)
      .innerJoin(productsTable, eq(stockTable.productId, productsTable.id))
      .where(eq(productsTable.companyId, companyId))
      .groupBy(stockTable.productId);

    const stockMap = new Map(stockRows.map((r) => [r.productId, r.total]));

    const allProducts = await db
      .select({ id: productsTable.id, bufferStock: productsTable.bufferStock })
      .from(productsTable)
      .where(eq(productsTable.companyId, companyId));

    const lowStock = allProducts.filter((p) => p.bufferStock > 0 && (stockMap.get(p.id) ?? 0) < p.bufferStock).length;

    res.json({ total: leaveRequests + lowStock, leaveRequests, lowStock });
  } catch (err: any) {
    console.error("attention endpoint error:", err?.message ?? err);
    res.status(500).json({ error: "Failed to get attention counts" });
  }
});

// GET /api/admin/worker-notifications — unread notifications for current worker
router.get("/worker-notifications", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const companyId = req.session.companyId!;

    // Unacknowledged auto-closed shifts
    const autoClosedRows = await db
      .select({ id: attendanceLogsTable.id })
      .from(attendanceLogsTable)
      .where(and(
        eq(attendanceLogsTable.userId, userId),
        eq(attendanceLogsTable.companyId, companyId),
        eq(attendanceLogsTable.autoClosed, true),
        isNull(attendanceLogsTable.autoCloseAcknowledgedAt),
      ));
    const autoClosed = autoClosedRows.length;

    // Leave requests with a manager decision not yet seen by worker
    const decidedLeave = await db
      .select({ id: leaveRequestsTable.id })
      .from(leaveRequestsTable)
      .where(and(
        eq(leaveRequestsTable.userId, userId),
        eq(leaveRequestsTable.companyId, companyId),
        ne(leaveRequestsTable.status, "pending"),
        isNull(leaveRequestsTable.workerAcknowledgedAt),
      ));
    const leaveDecisions = decidedLeave.length;

    res.json({ total: autoClosed + leaveDecisions, autoClosed, leaveDecisions });
  } catch (err: any) {
    console.error("worker-notifications error:", err?.message ?? err);
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
