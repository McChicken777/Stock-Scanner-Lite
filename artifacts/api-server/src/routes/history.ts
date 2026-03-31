import { Router, type IRouter } from "express";
import { db, historyTable, productsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const querySchema = z.object({
  productId: z.coerce.number().int().optional(),
  locationId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
});

router.get("/", async (req, res) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { productId, locationId, limit } = parsed.data;

    let query = db
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
      .limit(limit);

    const entries = await query;

    const filtered = entries.filter((e) => {
      if (productId && e.productId !== productId) return false;
      if (locationId && e.locationId !== locationId) return false;
      return true;
    });

    res.json(filtered);
  } catch (err) {
    req.log.error({ err }, "Failed to list history");
    res.status(500).json({ error: "Failed to list history" });
  }
});

export default router;
