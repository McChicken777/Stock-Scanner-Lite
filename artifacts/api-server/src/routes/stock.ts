import { Router, type IRouter } from "express";
import { db, stockTable, productsTable, historyTable, locationsTable, stockReservationsTable } from "@workspace/db";
import { eq, sql, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { sendLowStockAlert } from "../lib/email";

const router: IRouter = Router();

// Resolve a scanned code to a bin location or a product (scan-the-item flow).
router.get("/resolve/:code", async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const code = req.params.code.trim();

    const [loc] = await db.select({ id: locationsTable.id }).from(locationsTable)
      .where(and(eq(locationsTable.id, code), eq(locationsTable.companyId, companyId)));
    if (loc) { res.json({ type: "location", id: loc.id }); return; }

    const [byBarcode] = await db.select({ id: productsTable.id, name: productsTable.name }).from(productsTable)
      .where(and(eq(productsTable.barcode, code), eq(productsTable.companyId, companyId)));
    if (byBarcode) { res.json({ type: "product", productId: byBarcode.id, productName: byBarcode.name }); return; }

    if (/^\d+$/.test(code)) {
      const [byId] = await db.select({ id: productsTable.id, name: productsTable.name }).from(productsTable)
        .where(and(eq(productsTable.id, Number(code)), eq(productsTable.companyId, companyId)));
      if (byId) { res.json({ type: "product", productId: byId.id, productName: byId.name }); return; }
    }

    res.json({ type: "none" });
  } catch (err) {
    req.log.error({ err }, "Failed to resolve scan code");
    res.status(500).json({ error: "Failed to resolve code" });
  }
});

// Product stock across all locations + reserved/available (item action page).
router.get("/product/:productId", async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const productId = Number(req.params.productId);

    const [product] = await db.select().from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.companyId, companyId)));
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }

    const locs = await db.select({ locationId: stockTable.locationId, quantity: stockTable.quantity })
      .from(stockTable).where(eq(stockTable.productId, productId)).orderBy(stockTable.locationId);
    const totalStock = locs.reduce((s, l) => s + Number(l.quantity), 0);

    const [resv] = await db
      .select({ reserved: sql<number>`COALESCE(SUM(${stockReservationsTable.quantity}), 0)`.as("reserved") })
      .from(stockReservationsTable)
      .where(and(
        eq(stockReservationsTable.companyId, companyId),
        eq(stockReservationsTable.status, "active"),
        eq(stockReservationsTable.productId, productId),
      ));
    const reserved = Number(resv?.reserved ?? 0);

    res.json({
      productId: product.id,
      name: product.name,
      category: product.category,
      bufferStock: product.bufferStock,
      totalStock,
      reserved,
      available: Math.max(0, totalStock - reserved),
      locations: locs.map((l) => ({ locationId: l.locationId, quantity: Number(l.quantity) })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get product stock");
    res.status(500).json({ error: "Failed to get product stock" });
  }
});

router.get("/valuation", async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const products = await db.select().from(productsTable)
      .where(eq(productsTable.companyId, companyId));
    const totals = await db
      .select({
        productId: stockTable.productId,
        totalQty: sql<number>`COALESCE(SUM(${stockTable.quantity}), 0)::numeric`.as("total_qty"),
      })
      .from(stockTable)
      .innerJoin(locationsTable, eq(stockTable.locationId, locationsTable.id))
      .where(eq(locationsTable.companyId, companyId))
      .groupBy(stockTable.productId);
    const totalsMap = new Map(totals.map((t) => [t.productId, Number(t.totalQty)]));
    const rows = products.map((p) => ({
      productId: p.id,
      name: p.name,
      category: p.category,
      unitCost: p.unitCost,
      salePrice: (p as typeof p & { salePrice?: number }).salePrice ?? 0,
      totalQty: totalsMap.get(p.id) ?? 0,
    }));

    const catMap = new Map<string, {
      category: string;
      productCount: number;
      totalQty: number;
      totalValue: number;
      totalRevenue: number;
      totalMargin: number;
      products: { productId: number; name: string; totalQty: number; unitCost: number; salePrice: number; totalValue: number; totalRevenue: number; totalMargin: number }[];
    }>();
    let totalValue = 0;
    let totalRevenue = 0;
    let totalMargin = 0;
    let totalQty = 0;
    let productsWithoutCost = 0;
    let productsWithoutSalePrice = 0;
    for (const r of rows) {
      const qty = Number(r.totalQty ?? 0);
      const cost = Number(r.unitCost ?? 0);
      const price = Number(r.salePrice ?? 0);
      const value = qty * cost;
      const revenue = qty * price;
      const margin = revenue - value;
      totalQty += qty;
      totalValue += value;
      totalRevenue += revenue;
      totalMargin += margin;
      if (cost <= 0) productsWithoutCost += 1;
      if (price <= 0) productsWithoutSalePrice += 1;
      const cat = r.category || "Uncategorised";
      const entry = catMap.get(cat) ?? { category: cat, productCount: 0, totalQty: 0, totalValue: 0, totalRevenue: 0, totalMargin: 0, products: [] };
      entry.productCount += 1;
      entry.totalQty += qty;
      entry.totalValue += value;
      entry.totalRevenue += revenue;
      entry.totalMargin += margin;
      entry.products.push({ productId: r.productId, name: r.name, totalQty: qty, unitCost: cost, salePrice: price, totalValue: value, totalRevenue: revenue, totalMargin: margin });
      catMap.set(cat, entry);
    }
    const categories = Array.from(catMap.values())
      .map((c) => ({ ...c, products: c.products.sort((a, b) => b.totalValue - a.totalValue) }))
      .sort((a, b) => b.totalValue - a.totalValue);

    res.json({ totalValue, totalRevenue, totalMargin, totalQty, totalProducts: rows.length, productsWithoutCost, productsWithoutSalePrice, categories });
  } catch (err) {
    req.log.error({ err }, "Failed to get stock valuation");
    res.status(500).json({ error: "Failed to get stock valuation" });
  }
});

// Move stock from one location to another in a single atomic operation, writing
// linked transfer_out / transfer_in history rows.
const transferSchema = z.object({
  fromLocationId: z.string().min(1),
  toLocationId: z.string().min(1),
  productId: z.number().int(),
  quantity: z.number().positive(),
  changedBy: z.string().nullable().optional(),
});

router.post("/transfer", async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = transferSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const { fromLocationId, toLocationId, productId, quantity, changedBy } = parsed.data;
    if (fromLocationId === toLocationId) { res.status(400).json({ error: "Source and destination must differ" }); return; }

    const [product] = await db.select().from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.companyId, companyId)));
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }

    const locs = await db.select({ id: locationsTable.id }).from(locationsTable)
      .where(and(eq(locationsTable.companyId, companyId), inArray(locationsTable.id, [fromLocationId, toLocationId])));
    const locSet = new Set(locs.map((l) => l.id));
    if (!locSet.has(fromLocationId) || !locSet.has(toLocationId)) { res.status(400).json({ error: "Location not found" }); return; }

    const who = changedBy ?? req.session.username ?? null;

    const result = await db.transaction(async (tx) => {
      const [src] = await tx.select().from(stockTable)
        .where(and(eq(stockTable.locationId, fromLocationId), eq(stockTable.productId, productId)));
      const srcPrev = src?.quantity ?? 0;
      if (srcPrev < quantity) throw new Error(`Only ${srcPrev} available at ${fromLocationId}`);
      const srcNew = srcPrev - quantity;

      if (srcNew === 0) {
        await tx.delete(stockTable).where(and(eq(stockTable.locationId, fromLocationId), eq(stockTable.productId, productId)));
      } else {
        await tx.update(stockTable).set({ quantity: srcNew })
          .where(and(eq(stockTable.locationId, fromLocationId), eq(stockTable.productId, productId)));
      }

      const [dst] = await tx.select().from(stockTable)
        .where(and(eq(stockTable.locationId, toLocationId), eq(stockTable.productId, productId)));
      const dstPrev = dst?.quantity ?? 0;
      const dstNew = dstPrev + quantity;
      if (dst) {
        await tx.update(stockTable).set({ quantity: dstNew })
          .where(and(eq(stockTable.locationId, toLocationId), eq(stockTable.productId, productId)));
      } else {
        await tx.insert(stockTable).values({ locationId: toLocationId, productId, quantity: dstNew });
      }

      await tx.insert(historyTable).values([
        { locationId: fromLocationId, productId, previousQuantity: srcPrev, newQuantity: srcNew, delta: -quantity, changedBy: who, reason: "transfer_out", companyId },
        { locationId: toLocationId, productId, previousQuantity: dstPrev, newQuantity: dstNew, delta: quantity, changedBy: who, reason: "transfer_in", companyId },
      ]);

      return { fromQuantity: srcNew, toQuantity: dstNew };
    });

    res.json({ fromLocationId, toLocationId, productId, quantity, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to transfer stock";
    req.log.error({ err }, "Failed to transfer stock");
    res.status(/available at/.test(msg) ? 400 : 500).json({ error: msg });
  }
});

router.get("/:locationId", async (req, res) => {
  try {
    const { locationId } = req.params;
    const companyId = req.session.companyId!;
    // Verify location belongs to this company
    const [location] = await db.select().from(locationsTable)
      .where(and(eq(locationsTable.id, locationId), eq(locationsTable.companyId, companyId)));
    if (!location) { res.status(404).json({ error: "Location not found" }); return; }

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
    res.json(stock);
  } catch (err) {
    req.log.error({ err }, "Failed to get stock at location");
    res.status(500).json({ error: "Failed to get stock" });
  }
});

const updateStockSchema = z.object({
  quantity: z.number().min(0).optional(),
  delta: z.number().optional(),
  changedBy: z.string().nullable().optional(),
  reason: z.string().max(40).nullable().optional(),
});

router.put("/:locationId/:productId", async (req, res) => {
  try {
    const { locationId } = req.params;
    const productId = Number(req.params.productId);
    const companyId = req.session.companyId!;

    const parsed = updateStockSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { quantity, delta, changedBy, reason } = parsed.data;

    if (quantity === undefined && delta === undefined) {
      res.status(400).json({ error: "Provide either quantity or delta" });
      return;
    }

    const [product] = await db.select().from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.companyId, companyId)));
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }

    const [location] = await db.select().from(locationsTable)
      .where(and(eq(locationsTable.id, locationId), eq(locationsTable.companyId, companyId)));
    if (!location) { res.status(404).json({ error: "Location not found" }); return; }

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
      await db.delete(stockTable)
        .where(and(eq(stockTable.locationId, locationId), eq(stockTable.productId, productId)));
    } else if (existingStock) {
      await db.update(stockTable)
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
      changedBy: changedBy ?? req.session.username ?? null,
      reason: reason ?? null,
      companyId,
    });

    const [totalRow] = await db
      .select({ total: sql<number>`COALESCE(SUM(${stockTable.quantity}), 0)`.as("total") })
      .from(stockTable)
      .where(eq(stockTable.productId, productId));

    const totalStock = Number(totalRow?.total ?? 0);
    const isLowStock = totalStock < product.bufferStock;

    let alertSent = false;
    if (isLowStock && product.alertEmail && actualDelta <= 0 && req.session.features?.alerts) {
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

// Bulk upsert — set quantities for multiple product+location pairs in one call.
// Used for initial stock setup and the multi-product location fill dialog.
const bulkStockSchema = z.object({
  entries: z.array(z.object({
    locationId: z.string().min(1).max(50),
    productId: z.number().int().positive(),
    quantity: z.number().min(0),
    changedBy: z.string().nullable().optional(),
  })).min(1).max(500),
  reason: z.enum(["initial_entry", "received", "counted"]).default("initial_entry"),
});

router.post("/bulk", async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = bulkStockSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }

    const { entries, reason } = parsed.data;

    // Verify all locationIds and productIds belong to this company
    const locationIds = [...new Set(entries.map((e) => e.locationId))];
    const productIds = [...new Set(entries.map((e) => e.productId))];

    const validLocations = await db
      .select({ id: locationsTable.id })
      .from(locationsTable)
      .where(and(inArray(locationsTable.id, locationIds), eq(locationsTable.companyId, companyId)));
    const validLocationSet = new Set(validLocations.map((l) => l.id));

    const validProducts = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(and(inArray(productsTable.id, productIds), eq(productsTable.companyId, companyId)));
    const validProductSet = new Set(validProducts.map((p) => p.id));

    const validEntries = entries.filter(
      (e) => validLocationSet.has(e.locationId) && validProductSet.has(e.productId),
    );
    const skipped = entries.length - validEntries.length;

    let inserted = 0;
    let updated = 0;
    let deleted = 0;

    for (const entry of validEntries) {
      const [existing] = await db
        .select({ quantity: stockTable.quantity })
        .from(stockTable)
        .where(and(eq(stockTable.locationId, entry.locationId), eq(stockTable.productId, entry.productId)));

      const previousQuantity = existing ? Number(existing.quantity) : 0;
      const newQuantity = entry.quantity;
      const delta = newQuantity - previousQuantity;

      if (newQuantity === 0) {
        if (existing) {
          await db.delete(stockTable)
            .where(and(eq(stockTable.locationId, entry.locationId), eq(stockTable.productId, entry.productId)));
          deleted++;
        }
      } else if (existing) {
        await db.update(stockTable)
          .set({ quantity: newQuantity })
          .where(and(eq(stockTable.locationId, entry.locationId), eq(stockTable.productId, entry.productId)));
        updated++;
      } else {
        await db.insert(stockTable).values({
          locationId: entry.locationId,
          productId: entry.productId,
          quantity: newQuantity,
        });
        inserted++;
      }

      if (delta !== 0) {
        await db.insert(historyTable).values({
          locationId: entry.locationId,
          productId: entry.productId,
          previousQuantity,
          newQuantity,
          delta,
          changedBy: entry.changedBy ?? req.session.username ?? null,
          reason,
          companyId,
        });
      }
    }

    res.json({ inserted, updated, deleted, skipped });
  } catch (err) {
    req.log.error({ err }, "Failed to bulk update stock");
    res.status(500).json({ error: "Failed to bulk update stock" });
  }
});

export default router;
