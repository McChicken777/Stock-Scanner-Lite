import { Router, type IRouter } from "express";
import { db, locationsTable, stockTable, productsTable, stockReservationsTable, insertLocationSchema } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
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

router.post("/bulk", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const body = req.body as { locations?: unknown };
    if (!Array.isArray(body.locations) || body.locations.length === 0) {
      res.status(400).json({ error: "locations array required" });
      return;
    }
    if (body.locations.length > 200) {
      res.status(400).json({ error: "Maximum 200 locations per request" });
      return;
    }
    const rows = (body.locations as { id?: unknown; description?: unknown }[]).map((r) => ({
      id: String(r.id ?? "").trim().toUpperCase(),
      description: r.description ? String(r.description).trim() || null : null,
      companyId,
    })).filter((r) => r.id.length >= 2);

    if (rows.length === 0) {
      res.status(400).json({ error: "No valid location IDs provided" });
      return;
    }

    const inserted = await db
      .insert(locationsTable)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: locationsTable.id });

    res.json({ created: inserted.length, skipped: rows.length - inserted.length });
  } catch (err) {
    req.log.error({ err }, "Failed to bulk create locations");
    res.status(500).json({ error: "Failed to bulk create locations" });
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

    // Enrich each entry with product-level reserved / total on-hand / available so
    // the floor can see what's committed to jobs and what's actually free to take.
    const productIds = [...new Set(stock.map((s) => s.productId))];
    const reservedMap = new Map<number, number>();
    const onHandMap = new Map<number, number>();
    if (productIds.length > 0) {
      const reservations = await db
        .select({
          productId: stockReservationsTable.productId,
          reserved: sql<number>`COALESCE(SUM(${stockReservationsTable.quantity}), 0)`.as("reserved"),
        })
        .from(stockReservationsTable)
        .where(and(
          eq(stockReservationsTable.companyId, companyId),
          eq(stockReservationsTable.status, "active"),
          inArray(stockReservationsTable.productId, productIds),
        ))
        .groupBy(stockReservationsTable.productId);
      for (const r of reservations) reservedMap.set(r.productId, Number(r.reserved));

      const onHand = await db
        .select({
          productId: stockTable.productId,
          total: sql<number>`COALESCE(SUM(${stockTable.quantity}), 0)`.as("total"),
        })
        .from(stockTable)
        .where(inArray(stockTable.productId, productIds))
        .groupBy(stockTable.productId);
      for (const r of onHand) onHandMap.set(r.productId, Number(r.total));
    }

    const enriched = stock.map((s) => {
      const reserved = reservedMap.get(s.productId) ?? 0;
      const totalStock = onHandMap.get(s.productId) ?? Number(s.quantity);
      const available = Math.max(0, totalStock - reserved);
      return { ...s, reserved, totalStock, available };
    });

    res.json({ ...location, stock: enriched });
  } catch (err) {
    req.log.error({ err }, "Failed to get location");
    res.status(500).json({ error: "Failed to get location" });
  }
});

router.delete("/:locationId", requireAdmin, async (req, res) => {
  try {
    const locationId = String(req.params.locationId);
    const companyId = req.session.companyId!;
    await db.delete(locationsTable).where(and(eq(locationsTable.id, locationId), eq(locationsTable.companyId, companyId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete location");
    res.status(500).json({ error: "Failed to delete location" });
  }
});

export default router;
