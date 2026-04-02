import { Router, type IRouter } from "express";
import { db, locationsTable, stockTable, productsTable, insertLocationSchema } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const locations = await db.select().from(locationsTable)
      .where(eq(locationsTable.companyId, companyId))
      .orderBy(locationsTable.id);
    res.json(locations);
  } catch (err) {
    req.log.error({ err }, "Failed to list locations");
    res.status(500).json({ error: "Failed to list locations" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = insertLocationSchema.safeParse({ ...req.body, companyId });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [location] = await db
      .insert(locationsTable)
      .values(parsed.data)
      .onConflictDoNothing()
      .returning();
    if (!location) {
      res.status(409).json({ error: "Location ID already exists" });
      return;
    }
    res.status(201).json(location);
  } catch (err) {
    req.log.error({ err }, "Failed to create location");
    res.status(500).json({ error: "Failed to create location" });
  }
});

router.get("/:locationId", async (req, res) => {
  try {
    const { locationId } = req.params;
    const companyId = req.session.companyId!;
    const [location] = await db
      .select()
      .from(locationsTable)
      .where(and(eq(locationsTable.id, locationId), eq(locationsTable.companyId, companyId)));
    if (!location) {
      res.status(404).json({ error: "Location not found" });
      return;
    }
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
    res.json({ ...location, stock });
  } catch (err) {
    req.log.error({ err }, "Failed to get location");
    res.status(500).json({ error: "Failed to get location" });
  }
});

router.delete("/:locationId", requireAdmin, async (req, res) => {
  try {
    const { locationId } = req.params;
    const companyId = req.session.companyId!;
    await db.delete(locationsTable).where(and(eq(locationsTable.id, locationId), eq(locationsTable.companyId, companyId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete location");
    res.status(500).json({ error: "Failed to delete location" });
  }
});

export default router;
