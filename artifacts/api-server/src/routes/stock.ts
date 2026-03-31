import { Router, type IRouter } from "express";
import { db, stockTable, productsTable, historyTable, locationsTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { z } from "zod";
import { sendLowStockAlert } from "../lib/email";

const router: IRouter = Router();

router.get("/:locationId", async (req, res) => {
  try {
    const { locationId } = req.params;
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
      .where(eq(stockTable.locationId, locationId));
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

    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const [location] = await db.select().from(locationsTable).where(eq(locationsTable.id, locationId));
    if (!location) {
      res.status(404).json({ error: "Location not found" });
      return;
    }

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
      // Delete stock entry if quantity reaches 0
      await db
        .delete(stockTable)
        .where(and(eq(stockTable.locationId, locationId), eq(stockTable.productId, productId)));
    } else if (existingStock) {
      await db
        .update(stockTable)
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
    });

    const [totalRow] = await db
      .select({ total: sql<number>`COALESCE(SUM(${stockTable.quantity}), 0)`.as("total") })
      .from(stockTable)
      .where(eq(stockTable.productId, productId));

    const totalStock = Number(totalRow?.total ?? 0);
    const isLowStock = totalStock < product.bufferStock;

    let alertSent = false;
    if (isLowStock && product.alertEmail && actualDelta <= 0) {
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
