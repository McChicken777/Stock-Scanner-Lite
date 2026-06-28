import { Router, type IRouter } from "express";
import { db, historyTable, productsTable, locationsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
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
    const companyId = req.session.companyId!;

    const entries = await db
      .select({
        id: historyTable.id,
        locationId: historyTable.locationId,
        locationName: locationsTable.description,
        productId: historyTable.productId,
        productName: productsTable.name,
        previousQuantity: historyTable.previousQuantity,
        newQuantity: historyTable.newQuantity,
        delta: historyTable.delta,
        changedBy: historyTable.changedBy,
        reason: historyTable.reason,
        changedAt: historyTable.changedAt,
      })
      .from(historyTable)
      .innerJoin(productsTable, eq(historyTable.productId, productsTable.id))
      .leftJoin(locationsTable, eq(historyTable.locationId, locationsTable.id))
      .where(and(
        eq(historyTable.companyId, companyId),
        ...(productId ? [eq(historyTable.productId, productId)] : []),
        ...(locationId ? [eq(historyTable.locationId, locationId)] : []),
      ))
      .orderBy(desc(historyTable.changedAt))
      .limit(limit);

    res.json(entries);
  } catch (err) {
    req.log.error({ err }, "Failed to list history");
    res.status(500).json({ error: "Failed to list history" });
  }
});

export default router;
