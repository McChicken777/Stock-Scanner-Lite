import { Router, type IRouter } from "express";
import {
  db, quoteRequestsTable, quoteRequestItemsTable, quoteRequestSuppliersTable,
  quoteRequestSupplierLinesTable, suppliersTable, companiesTable, supplierProductsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

// ─── GET QUOTE FORM (public, token-validated) ──────────────────────────────────
// No auth: a supplier opens their private link. Returns who's asking, the items,
// their known SKU per item (prefilled from supplier_products), and any prior answer.
router.get("/:token", async (req, res) => {
  try {
    const [rfqSupplier] = await db.select()
      .from(quoteRequestSuppliersTable)
      .where(eq(quoteRequestSuppliersTable.token, req.params.token));
    if (!rfqSupplier) { res.status(404).json({ valid: false, reason: "not_found" }); return; }

    const [rfq] = await db.select()
      .from(quoteRequestsTable)
      .where(eq(quoteRequestsTable.id, rfqSupplier.rfqId));
    if (!rfq) { res.status(404).json({ valid: false, reason: "not_found" }); return; }

    const [company] = await db.select({ name: companiesTable.name })
      .from(companiesTable).where(eq(companiesTable.id, rfqSupplier.companyId));
    const [supplier] = await db.select({ name: suppliersTable.name, language: suppliersTable.language })
      .from(suppliersTable).where(eq(suppliersTable.id, rfqSupplier.supplierId));

    const items = await db.select()
      .from(quoteRequestItemsTable)
      .where(eq(quoteRequestItemsTable.rfqId, rfq.id));

    // Prefill known SKUs for this supplier from past data.
    const knownSku = new Map<number, string | null>();
    const productIds = items.map((i) => i.productId).filter((id): id is number => id != null);
    if (productIds.length > 0) {
      const sp = await db.select({ productId: supplierProductsTable.productId, supplierSku: supplierProductsTable.supplierSku })
        .from(supplierProductsTable)
        .where(and(
          eq(supplierProductsTable.supplierId, rfqSupplier.supplierId),
          eq(supplierProductsTable.companyId, rfqSupplier.companyId),
        ));
      for (const r of sp) knownSku.set(r.productId, r.supplierSku);
    }

    // Any prior submission (so we can pre-fill on re-open).
    const priorLines = await db.select()
      .from(quoteRequestSupplierLinesTable)
      .where(eq(quoteRequestSupplierLinesTable.rfqSupplierId, rfqSupplier.id));
    const priorByItem = new Map(priorLines.map((l) => [l.rfqItemId, l]));

    res.json({
      valid: true,
      closed: rfq.status !== "open",
      companyName: company?.name ?? null,
      supplierName: supplier?.name ?? null,
      language: supplier?.language === "sl" ? "sl" : "en",
      status: rfqSupplier.status,
      leadTimeDays: rfqSupplier.leadTimeDays,
      note: rfqSupplier.note,
      items: items.map((i) => ({
        rfqItemId: i.id,
        productName: i.productName,
        quantity: i.quantity,
        supplierSku: priorByItem.get(i.id)?.supplierSku ?? knownSku.get(i.productId ?? -1) ?? null,
        unitPrice: priorByItem.get(i.id)?.unitPrice ?? null,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load RFQ quote form");
    res.status(500).json({ error: "Failed to load quote" });
  }
});

// ─── SUBMIT QUOTE (public, token-validated) ────────────────────────────────────
// No auth. Idempotent while the RFQ is open (a supplier can re-submit to correct).
router.post("/:token", async (req, res) => {
  try {
    const parsed = z.object({
      lines: z.array(z.object({
        rfqItemId: z.number().int(),
        unitPrice: z.number().min(0).nullable().optional(),
        supplierSku: z.string().trim().optional(),
      })),
      leadTimeDays: z.number().int().min(0).nullable().optional(),
      note: z.string().trim().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [rfqSupplier] = await db.select()
      .from(quoteRequestSuppliersTable)
      .where(eq(quoteRequestSuppliersTable.token, req.params.token));
    if (!rfqSupplier) { res.status(404).json({ error: "Invalid link" }); return; }

    const [rfq] = await db.select()
      .from(quoteRequestsTable)
      .where(eq(quoteRequestsTable.id, rfqSupplier.rfqId));
    if (!rfq || rfq.status !== "open") { res.status(410).json({ error: "This request is closed" }); return; }

    // Valid item ids for this RFQ (prevents writing arbitrary lines).
    const items = await db.select({ id: quoteRequestItemsTable.id, productId: quoteRequestItemsTable.productId })
      .from(quoteRequestItemsTable)
      .where(eq(quoteRequestItemsTable.rfqId, rfq.id));
    const itemById = new Map(items.map((i) => [i.id, i]));

    // Replace prior lines for this supplier.
    await db.delete(quoteRequestSupplierLinesTable)
      .where(eq(quoteRequestSupplierLinesTable.rfqSupplierId, rfqSupplier.id));

    const toInsert = parsed.data.lines
      .filter((l) => itemById.has(l.rfqItemId))
      .map((l) => ({
        rfqSupplierId: rfqSupplier.id,
        rfqItemId: l.rfqItemId,
        unitPrice: l.unitPrice ?? null,
        supplierSku: l.supplierSku?.trim() || null,
        companyId: rfqSupplier.companyId,
      }));
    if (toInsert.length > 0) {
      await db.insert(quoteRequestSupplierLinesTable).values(toInsert);
    }

    await db.update(quoteRequestSuppliersTable)
      .set({
        status: "submitted",
        leadTimeDays: parsed.data.leadTimeDays ?? null,
        note: parsed.data.note?.trim() || null,
        submittedAt: new Date(),
      })
      .where(eq(quoteRequestSuppliersTable.id, rfqSupplier.id));

    // Enrich supplier_products: remember SKU + latest quoted price per product.
    for (const l of parsed.data.lines) {
      const item = itemById.get(l.rfqItemId);
      if (!item?.productId) continue;
      const sku = l.supplierSku?.trim() || null;
      const price = l.unitPrice ?? null;
      if (sku == null && price == null) continue;

      const [existing] = await db.select({ id: supplierProductsTable.id })
        .from(supplierProductsTable)
        .where(and(
          eq(supplierProductsTable.supplierId, rfqSupplier.supplierId),
          eq(supplierProductsTable.productId, item.productId),
          eq(supplierProductsTable.companyId, rfqSupplier.companyId),
        ));
      if (existing) {
        const set: Record<string, unknown> = {};
        if (sku != null) set.supplierSku = sku;
        if (price != null) set.unitPrice = price;
        if (Object.keys(set).length > 0) {
          await db.update(supplierProductsTable).set(set).where(eq(supplierProductsTable.id, existing.id));
        }
      } else {
        await db.insert(supplierProductsTable).values({
          supplierId: rfqSupplier.supplierId,
          productId: item.productId,
          supplierSku: sku,
          unitPrice: price,
          companyId: rfqSupplier.companyId,
        });
      }
    }

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to submit RFQ quote");
    res.status(500).json({ error: "Failed to submit quote" });
  }
});

export default router;
