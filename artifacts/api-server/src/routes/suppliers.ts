import { Router, type IRouter } from "express";
import { db, suppliersTable, supplierProductsTable, productsTable, stockTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

const createSupplierSchema = z.object({
  name: z.string().min(1, "Name required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  orderMethod: z.enum(["email", "web_store"]).optional().default("email"),
  storeUrl: z.string().url().optional().or(z.literal("")),
  storePlatform: z.enum(["shopify", "woocommerce", "custom"]).optional().or(z.literal("")).nullable(),
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
      orderMethod: data.orderMethod ?? "email",
      storeUrl: data.storeUrl || null,
      storePlatform: (data.storePlatform || null) as string | null,
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
        orderMethod: data.orderMethod ?? "email",
        storeUrl: data.storeUrl || null,
        storePlatform: (data.storePlatform || null) as string | null,
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

// ─── LIST PRODUCTS LINKED TO SUPPLIER ─────────────────────────────────────────

router.get("/:id/products", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const supplierId = parseInt(req.params.id as string, 10);

    const supplier = await db.query.suppliersTable.findFirst({
      where: and(eq(suppliersTable.id, supplierId), eq(suppliersTable.companyId, companyId)),
    });
    if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }

    const links = await db.select({
      id: supplierProductsTable.id,
      productId: supplierProductsTable.productId,
      supplierSku: supplierProductsTable.supplierSku,
      unitPrice: supplierProductsTable.unitPrice,
      storeProductId: supplierProductsTable.storeProductId,
      storeProductUrl: supplierProductsTable.storeProductUrl,
      productName: productsTable.name,
      productCategory: productsTable.category,
      productItemType: productsTable.itemType,
      bufferStock: productsTable.bufferStock,
      totalStock: sql<number>`COALESCE((
        SELECT SUM(${stockTable.quantity}) FROM ${stockTable}
        WHERE ${stockTable.productId} = ${productsTable.id}
      ), 0)`.as("total_stock"),
    })
      .from(supplierProductsTable)
      .innerJoin(productsTable, eq(supplierProductsTable.productId, productsTable.id))
      .where(and(
        eq(supplierProductsTable.supplierId, supplierId),
        eq(supplierProductsTable.companyId, companyId),
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
