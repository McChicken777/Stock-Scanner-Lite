import { Router, type IRouter } from "express";
import { db, locationsTable, stockTable, productsTable, insertLocationSchema } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  try {
    const locations = await db.select().from(locationsTable).orderBy(locationsTable.id);
    res.json(locations);
  } catch (err) {
    req.log.error({ err }, "Failed to list locations");
    res.status(500).json({ error: "Failed to list locations" });
  }
});

router.post("/", async (req, res) => {
  try {
    const parsed = insertLocationSchema.safeParse(req.body);
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
    const [location] = await db
      .select()
      .from(locationsTable)
      .where(eq(locationsTable.id, locationId));
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
      .where(eq(stockTable.locationId, locationId));
    res.json({ ...location, stock });
  } catch (err) {
    req.log.error({ err }, "Failed to get location");
    res.status(500).json({ error: "Failed to get location" });
  }
});

router.delete("/:locationId", async (req, res) => {
  try {
    const { locationId } = req.params;
    await db.delete(locationsTable).where(eq(locationsTable.id, locationId));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete location");
    res.status(500).json({ error: "Failed to delete location" });
  }
});

export default router;
