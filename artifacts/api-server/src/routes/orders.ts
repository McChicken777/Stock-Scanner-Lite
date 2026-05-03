import { Router, type IRouter } from "express";
import { db, ordersTable, orderItemsTable, productsTable, stockTable, suppliersTable } from "@workspace/db";
import { eq, and, inArray, isNotNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

// GET /api/orders/orders - List all orders
router.get("/orders", requireAuth, async (req, res) => {
  try {
    const { companyId } = req.session;

    const orders = await db.select({
      id: ordersTable.id,
      supplier: ordersTable.supplier,
      status: ordersTable.status,
      createdAt: ordersTable.createdAt,
      companyId: ordersTable.companyId,
      itemCount: sql<number>`COUNT(${orderItemsTable.id})`,
    })
      .from(ordersTable)
      .leftJoin(orderItemsTable, eq(ordersTable.id, orderItemsTable.orderId))
      .where(eq(ordersTable.companyId, companyId))
      .groupBy(ordersTable.id)
      .orderBy(ordersTable.createdAt);

    res.json(orders);
  } catch (err) {
    req.log.error({ err }, "Failed to list orders");
    res.status(500).json({ error: "Failed to list orders" });
  }
});

// GET /api/orders/:id - Get order with items
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const { companyId } = req.session;
    const { id } = req.params;

    const order = await db.query.ordersTable.findFirst({
      where: and(
        eq(ordersTable.id, parseInt(id)),
        eq(ordersTable.companyId, companyId)
      ),
    });

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const items = await db.select({
      id: orderItemsTable.id,
      orderId: orderItemsTable.orderId,
      productId: orderItemsTable.productId,
      quantity: orderItemsTable.quantity,
      unitCost: orderItemsTable.unitCost,
      salePrice: orderItemsTable.salePrice,
      productName: productsTable.name,
      supplierProductName: productsTable.supplierProductName,
      supplierSku: productsTable.supplierSku,
    })
      .from(orderItemsTable)
      .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
      .where(eq(orderItemsTable.orderId, parseInt(id)));

    res.json({ ...order, items });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch order");
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// POST /api/orders/generate-drafts - Generate order drafts for all low-stock items
router.post("/generate-drafts", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = req.session;

    // Get all purchase items below buffer stock with suppliers
    const lowStockItems = await db.select({
      product: productsTable,
      supplier: suppliersTable,
      totalStock: sql<number>`COALESCE(SUM(${stockTable.quantity}), 0)`,
    })
      .from(productsTable)
      .leftJoin(stockTable, eq(productsTable.id, stockTable.productId))
      .leftJoin(suppliersTable, eq(productsTable.supplierId, suppliersTable.id))
      .where(
        and(
          eq(productsTable.companyId, companyId),
          eq(productsTable.itemType, "purchase"),
          isNotNull(productsTable.supplierId)
        )
      )
      .groupBy(productsTable.id, suppliersTable.id)
      .having(sql`COALESCE(SUM(${stockTable.quantity}), 0) < ${productsTable.bufferStock}`);

    // Group by supplierId and create orders
    const ordersBySupplier = new Map<number, typeof lowStockItems>();
    lowStockItems.forEach((item) => {
      if (item.supplier) {
        const supplierId = item.supplier.id;
        if (!ordersBySupplier.has(supplierId)) {
          ordersBySupplier.set(supplierId, []);
        }
        ordersBySupplier.get(supplierId)!.push(item);
      }
    });

    const createdOrders = [];

    for (const [supplierId, items] of ordersBySupplier.entries()) {
      const supplierName = items[0]?.supplier?.name || "Unknown";
      
      // Check if draft already exists for this supplier
      const existing = await db.query.ordersTable.findFirst({
        where: and(
          eq(ordersTable.companyId, companyId),
          eq(ordersTable.supplier, supplierName),
          eq(ordersTable.status, "draft")
        ),
      });

      let orderId: number;
      if (existing) {
        orderId = existing.id;
      } else {
        const [inserted] = await db.insert(ordersTable).values({
          supplier: supplierName,
          status: "draft",
          companyId,
        }).returning();
        orderId = inserted.id;
      }

      // Add items to order
      for (const item of items) {
        const restockAmount = item.product.targetStock - (item.totalStock || 0);
        if (restockAmount > 0) {
          // Check if item already in order
          const existingItem = await db.query.orderItemsTable.findFirst({
            where: and(
              eq(orderItemsTable.orderId, orderId),
              eq(orderItemsTable.productId, item.product.id)
            ),
          });

          if (!existingItem) {
            await db.insert(orderItemsTable).values({
              orderId,
              productId: item.product.id,
              quantity: restockAmount,
              unitCost: Number(item.product.unitCost ?? 0),
              salePrice: Number(item.product.salePrice ?? 0),
              companyId,
            });
          }
        }
      }

      createdOrders.push({
        id: orderId,
        supplier: supplierName,
        itemCount: items.length,
      });
    }

    res.json({
      message: "Order drafts generated",
      orders: createdOrders,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to generate order drafts");
    res.status(500).json({ error: "Failed to generate order drafts" });
  }
});

// PUT /api/orders/:id/items/:itemId - Update order item quantity
router.put("/:id/items/:itemId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = req.session;
    const { id, itemId } = req.params;
    const { quantity } = req.body;

    if (!Number.isInteger(quantity) || quantity < 0) {
      res.status(400).json({ error: "Invalid quantity" });
      return;
    }

    const item = await db.query.orderItemsTable.findFirst({
      where: and(
        eq(orderItemsTable.id, parseInt(itemId)),
        eq(orderItemsTable.orderId, parseInt(id)),
        eq(orderItemsTable.companyId, companyId)
      ),
    });

    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    await db.update(orderItemsTable)
      .set({ quantity })
      .where(eq(orderItemsTable.id, parseInt(itemId)));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to update order item");
    res.status(500).json({ error: "Failed to update order item" });
  }
});

// DELETE /api/orders/:id/items/:itemId - Remove item from order
router.delete("/:id/items/:itemId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = req.session;
    const { id, itemId } = req.params;

    const item = await db.query.orderItemsTable.findFirst({
      where: and(
        eq(orderItemsTable.id, parseInt(itemId)),
        eq(orderItemsTable.orderId, parseInt(id)),
        eq(orderItemsTable.companyId, companyId)
      ),
    });

    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    await db.delete(orderItemsTable).where(eq(orderItemsTable.id, parseInt(itemId)));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to remove order item");
    res.status(500).json({ error: "Failed to remove order item" });
  }
});

// PUT /api/orders/:id/mark-sent - Mark order as sent
router.put("/:id/mark-sent", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = req.session;
    const { id } = req.params;

    const order = await db.query.ordersTable.findFirst({
      where: and(
        eq(ordersTable.id, parseInt(id)),
        eq(ordersTable.companyId, companyId)
      ),
    });

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    await db.update(ordersTable)
      .set({ status: "sent" })
      .where(eq(ordersTable.id, parseInt(id)));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to mark order as sent");
    res.status(500).json({ error: "Failed to mark order as sent" });
  }
});

export default router;
