import { Router, type IRouter } from "express";
import { db, suppliersTable, supplierProductsTable, supplierCategoriesTable, productsTable, stockTable, purchaseOrdersTable, quoteRequestSuppliersTable, quoteRequestsTable } from "@workspace/db";
import { eq, and, sql, isNotNull, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

const createSupplierSchema = z.object({
  name: z.string().min(1, "Name required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  language: z.enum(["en", "sl"]).optional().default("en"),
});

// GET /api/suppliers - List suppliers
router.get("/", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;

    const suppliers = await db.query.suppliersTable.findMany({
      where: eq(suppliersTable.companyId, companyId),
    });

    res.json(suppliers);
  } catch (err) {
    req.log.error({ err }, "Failed to list suppliers");
    res.status(500).json({ error: "Failed to list suppliers" });
  }
});

// POST /api/suppliers - Create supplier
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const data = createSupplierSchema.parse(req.body);

    const [supplier] = await db.insert(suppliersTable).values({
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      notes: data.notes || null,
      language: data.language ?? "en",
      companyId,
    }).returning();

    res.status(201).json(supplier);
  } catch (err: any) {
    if (err.name === "ZodError") {
      res.status(400).json({ error: err.errors[0].message });
    } else {
      req.log.error({ err }, "Failed to create supplier");
      res.status(500).json({ error: "Failed to create supplier" });
    }
  }
});

// PUT /api/suppliers/:id - Update supplier
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const id = parseInt(req.params.id as string, 10);
    const data = createSupplierSchema.parse(req.body);

    const supplier = await db.query.suppliersTable.findFirst({
      where: and(
        eq(suppliersTable.id, id),
        eq(suppliersTable.companyId, companyId)
      ),
    });

    if (!supplier) {
      res.status(404).json({ error: "Supplier not found" });
      return;
    }

    const [updated] = await db.update(suppliersTable)
      .set({
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        notes: data.notes || null,
        language: data.language ?? "en",
      })
      .where(and(eq(suppliersTable.id, id), eq(suppliersTable.companyId, companyId)))
      .returning();

    res.json(updated);
  } catch (err: any) {
    if (err.name === "ZodError") {
      res.status(400).json({ error: err.errors[0].message });
    } else {
      req.log.error({ err }, "Failed to update supplier");
      res.status(500).json({ error: "Failed to update supplier" });
    }
  }
});

// DELETE /api/suppliers/:id - Delete supplier
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const id = parseInt(req.params.id as string, 10);

    const supplier = await db.query.suppliersTable.findFirst({
      where: and(
        eq(suppliersTable.id, id),
        eq(suppliersTable.companyId, companyId)
      ),
    });

    if (!supplier) {
      res.status(404).json({ error: "Supplier not found" });
      return;
    }

    await db.delete(suppliersTable).where(and(eq(suppliersTable.id, id), eq(suppliersTable.companyId, companyId)));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete supplier");
    res.status(500).json({ error: "Failed to delete supplier" });
  }
});

// ─── SUPPLIER STATS ────────────────────────────────────────────────────────────
// Returns per-supplier counts: orders placed, quotes sent, quotes accepted.

router.get("/stats", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const [orders, quotesSent, quotesAccepted] = await Promise.all([
      db.select({ supplierId: purchaseOrdersTable.supplierId, count: sql<number>`count(*)::int` })
        .from(purchaseOrdersTable)
        .where(eq(purchaseOrdersTable.companyId, companyId))
        .groupBy(purchaseOrdersTable.supplierId),
      db.select({ supplierId: quoteRequestSuppliersTable.supplierId, count: sql<number>`count(*)::int` })
        .from(quoteRequestSuppliersTable)
        .where(eq(quoteRequestSuppliersTable.companyId, companyId))
        .groupBy(quoteRequestSuppliersTable.supplierId),
      db.select({ supplierId: quoteRequestsTable.decidedSupplierId, count: sql<number>`count(*)::int` })
        .from(quoteRequestsTable)
        .where(and(eq(quoteRequestsTable.companyId, companyId), isNotNull(quoteRequestsTable.decidedSupplierId)))
        .groupBy(quoteRequestsTable.decidedSupplierId),
    ]);
    const stats: Record<number, { ordersPlaced: number; quotesSent: number; quotesAccepted: number }> = {};
    for (const r of orders) if (r.supplierId != null) (stats[r.supplierId] ??= { ordersPlaced: 0, quotesSent: 0, quotesAccepted: 0 }).ordersPlaced = r.count;
    for (const r of quotesSent) (stats[r.supplierId] ??= { ordersPlaced: 0, quotesSent: 0, quotesAccepted: 0 }).quotesSent = r.count;
    for (const r of quotesAccepted) if (r.supplierId != null) (stats[r.supplierId] ??= { ordersPlaced: 0, quotesSent: 0, quotesAccepted: 0 }).quotesAccepted = r.count;
    res.json(stats);
  } catch (err) {
    req.log.error({ err }, "Failed to load supplier stats");
    res.status(500).json({ error: "Failed to load supplier stats" });
  }
});

// ─── SUPPLIERS BY CATEGORY ────────────────────────────────────────────────────
// GET /api/suppliers/by-categories?cats[]=Screws&cats[]=Welding
// Returns suppliers that handle any of the given category names.
// Must be registered before /:id routes.

router.get("/by-categories", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const raw = req.query["cats[]"];
    const cats: string[] = Array.isArray(raw)
      ? (raw as string[]).filter(Boolean)
      : raw ? [raw as string] : [];

    if (cats.length === 0) { res.json([]); return; }

    const rows = await db.select({
      supplierId: supplierCategoriesTable.supplierId,
      category: supplierCategoriesTable.category,
      name: suppliersTable.name,
      email: suppliersTable.email,
      language: suppliersTable.language,
    })
      .from(supplierCategoriesTable)
      .innerJoin(suppliersTable, eq(supplierCategoriesTable.supplierId, suppliersTable.id))
      .where(and(
        eq(supplierCategoriesTable.companyId, companyId),
        inArray(supplierCategoriesTable.category, cats),
      ));

    const byId = new Map<number, { id: number; name: string; email: string | null; language: string; categories: string[] }>();
    for (const r of rows) {
      if (!byId.has(r.supplierId)) {
        byId.set(r.supplierId, { id: r.supplierId, name: r.name, email: r.email, language: r.language, categories: [] });
      }
      byId.get(r.supplierId)!.categories.push(r.category);
    }

    res.json(Array.from(byId.values()));
  } catch (err) {
    req.log.error({ err }, "Failed to get suppliers by category");
    res.status(500).json({ error: "Failed to get suppliers by category" });
  }
});

// ─── SUPPLIER CATEGORY CRUD ───────────────────────────────────────────────────

router.get("/:id/categories", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const supplierId = parseInt(req.params.id as string, 10);

    const supplier = await db.query.suppliersTable.findFirst({
      where: and(eq(suppliersTable.id, supplierId), eq(suppliersTable.companyId, companyId)),
    });
    if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }

    const rows = await db.select({ category: supplierCategoriesTable.category })
      .from(supplierCategoriesTable)
      .where(and(
        eq(supplierCategoriesTable.supplierId, supplierId),
        eq(supplierCategoriesTable.companyId, companyId),
      ));

    res.json(rows.map((r) => r.category));
  } catch (err) {
    req.log.error({ err }, "Failed to list supplier categories");
    res.status(500).json({ error: "Failed to list supplier categories" });
  }
});

router.post("/:id/categories", requireAuth, requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const supplierId = parseInt(req.params.id as string, 10);
    const { category } = z.object({ category: z.string().min(1) }).parse(req.body);

    const supplier = await db.query.suppliersTable.findFirst({
      where: and(eq(suppliersTable.id, supplierId), eq(suppliersTable.companyId, companyId)),
    });
    if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }

    await db.insert(supplierCategoriesTable).values({ supplierId, category, companyId })
      .onConflictDoNothing();

    res.status(201).json({ category });
  } catch (err: any) {
    if (err.name === "ZodError") { res.status(400).json({ error: err.errors[0].message }); return; }
    req.log.error({ err }, "Failed to add supplier category");
    res.status(500).json({ error: "Failed to add supplier category" });
  }
});

router.delete("/:id/categories/:category", requireAuth, requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const supplierId = parseInt(req.params.id as string, 10);
    const category = decodeURIComponent(req.params.category as string);

    await db.delete(supplierCategoriesTable).where(and(
      eq(supplierCategoriesTable.supplierId, supplierId),
      eq(supplierCategoriesTable.category, category),
      eq(supplierCategoriesTable.companyId, companyId),
    ));

    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to remove supplier category");
    res.status(500).json({ error: "Failed to remove supplier category" });
  }
});

// ─── LIST PRODUCTS LINKED TO SUPPLIER ─────────────────────────────────────────

router.get("/:id/products", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const supplierId = parseInt(req.params.id as string, 10);

    const supplier = await db.query.suppliersTable.findFirst({
      where: and(eq(suppliersTable.id, supplierId), eq(suppliersTable.companyId, companyId)),
    });
    if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }

    // Products are linked to a supplier directly (products.supplierId), set on the
    // product page. This endpoint is a read-only list for the supplier tab.
    const links = await db.select({
      id: productsTable.id,
      productId: productsTable.id,
      supplierSku: productsTable.supplierSku,
      storeProductUrl: productsTable.storeProductUrl,
      productName: productsTable.name,
      productCategory: productsTable.category,
      productItemType: productsTable.itemType,
      bufferStock: productsTable.bufferStock,
      totalStock: sql<number>`COALESCE((
        SELECT SUM(${stockTable.quantity}) FROM ${stockTable}
        WHERE ${stockTable.productId} = ${productsTable.id}
      ), 0)`.as("total_stock"),
    })
      .from(productsTable)
      .where(and(
        eq(productsTable.supplierId, supplierId),
        eq(productsTable.companyId, companyId),
      ));

    res.json(links.map((l) => ({ ...l, totalStock: Number(l.totalStock ?? 0) })));
  } catch (err) {
    req.log.error({ err }, "Failed to list supplier products");
    res.status(500).json({ error: "Failed to list supplier products" });
  }
});

// ─── LINK PRODUCT TO SUPPLIER ──────────────────────────────────────────────────

router.post("/:id/products", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const supplierId = parseInt(req.params.id as string, 10);

    const parsed = z.object({
      productId: z.number().int(),
      supplierSku: z.string().optional().or(z.literal("")),
      unitPrice: z.number().min(0).nullable().optional(),
      storeProductId: z.string().optional().or(z.literal("")),
      storeProductUrl: z.string().url().optional().or(z.literal("")),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const supplier = await db.query.suppliersTable.findFirst({
      where: and(eq(suppliersTable.id, supplierId), eq(suppliersTable.companyId, companyId)),
    });
    if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }

    const [link] = await db.insert(supplierProductsTable).values({
      supplierId,
      productId: parsed.data.productId,
      supplierSku: parsed.data.supplierSku || null,
      unitPrice: parsed.data.unitPrice ?? null,
      storeProductId: parsed.data.storeProductId || null,
      storeProductUrl: parsed.data.storeProductUrl || null,
      companyId,
    }).onConflictDoUpdate({
      target: [supplierProductsTable.supplierId, supplierProductsTable.productId],
      set: {
        supplierSku: parsed.data.supplierSku || null,
        unitPrice: parsed.data.unitPrice ?? null,
        storeProductId: parsed.data.storeProductId || null,
        storeProductUrl: parsed.data.storeProductUrl || null,
      },
    }).returning();

    res.status(201).json(link);
  } catch (err) {
    req.log.error({ err }, "Failed to link product to supplier");
    res.status(500).json({ error: "Failed to link product to supplier" });
  }
});

// ─── UNLINK PRODUCT FROM SUPPLIER ─────────────────────────────────────────────

router.delete("/:id/products/:productId", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const supplierId = parseInt(req.params.id as string, 10);
    const productId = parseInt(req.params.productId as string, 10);

    await db.delete(supplierProductsTable).where(
      and(
        eq(supplierProductsTable.supplierId, supplierId),
        eq(supplierProductsTable.productId, productId),
        eq(supplierProductsTable.companyId, companyId),
      )
    );
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to unlink supplier product");
    res.status(500).json({ error: "Failed to unlink supplier product" });
  }
});

export default router;
