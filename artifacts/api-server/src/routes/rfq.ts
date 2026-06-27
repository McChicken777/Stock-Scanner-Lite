import { Router, type IRouter } from "express";
import {
  db, quoteRequestsTable, quoteRequestItemsTable, quoteRequestSuppliersTable,
  quoteRequestSupplierLinesTable, suppliersTable, companiesTable, productsTable,
  purchaseOrdersTable, purchaseOrderItemsTable, shortageFlagsTable,
} from "@workspace/db";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "../middlewares/auth";
import { sendRfqRequestEmail, sendSupplierOrderEmail } from "../lib/email";
import { decryptSecret } from "../lib/crypto";

const router: IRouter = Router();

// Resolve a company's SMTP config (or null if not configured).
async function getSmtp(companyId: number) {
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId));
  if (!company) return { company: null, smtp: null };
  const pass = decryptSecret(company.smtpPassEnc);
  if (!company.smtpHost || !company.smtpPort || !company.smtpUser || !pass) {
    return { company, smtp: null };
  }
  return {
    company,
    smtp: { host: company.smtpHost, port: company.smtpPort, user: company.smtpUser, pass, fromName: company.emailFromName },
  };
}

// ─── CREATE RFQ + INVITE SUPPLIERS ─────────────────────────────────────────────
router.post("/", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const userId = req.session.userId!;
    const parsed = z.object({
      items: z.array(z.object({
        productId: z.number().int().nullable().optional(),
        productName: z.string().trim().min(1),
        quantity: z.number().int().min(1),
        flagId: z.number().int().nullable().optional(),
      })).min(1),
      supplierIds: z.array(z.number().int()).min(1),
      note: z.string().trim().optional(),
      origin: z.string().trim().url().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const { items, supplierIds, note, origin } = parsed.data;

    // Only suppliers that belong to this company.
    const suppliers = await db.select()
      .from(suppliersTable)
      .where(and(eq(suppliersTable.companyId, companyId), inArray(suppliersTable.id, supplierIds)));
    if (suppliers.length === 0) { res.status(400).json({ error: "No valid suppliers" }); return; }

    const [rfq] = await db.insert(quoteRequestsTable).values({
      companyId, status: "open", note: note ?? null, createdByUserId: userId,
    }).returning();

    await db.insert(quoteRequestItemsTable).values(
      items.map((i) => ({
        rfqId: rfq.id,
        productId: i.productId ?? null,
        productName: i.productName,
        quantity: i.quantity,
        flagId: i.flagId ?? null,
        companyId,
      }))
    );

    const insertedSuppliers = await db.insert(quoteRequestSuppliersTable).values(
      suppliers.map((s) => ({
        rfqId: rfq.id, supplierId: s.id, token: randomUUID(), status: "invited" as const, companyId,
      }))
    ).returning();

    // Send each supplier their private quote link (best-effort).
    const { company, smtp } = await getSmtp(companyId);
    const sent: { supplierId: number; supplierName: string; email: string | null; sent: boolean; token: string }[] = [];
    for (const rs of insertedSuppliers) {
      const supplier = suppliers.find((s) => s.id === rs.supplierId)!;
      const quoteUrl = origin ? `${origin.replace(/\/$/, "")}/rfq/${rs.token}` : `/rfq/${rs.token}`;
      let ok = false;
      if (smtp && supplier.email) {
        ok = await sendRfqRequestEmail({
          smtp,
          supplierName: supplier.name,
          supplierEmail: supplier.email,
          quoteUrl,
          companyName: company?.name ?? null,
          lang: supplier.language === "sl" ? "sl" : "en",
          items: items.map((i) => ({ name: i.productName, quantity: i.quantity })),
        });
      }
      sent.push({ supplierId: rs.supplierId, supplierName: supplier.name, email: supplier.email, sent: ok, token: rs.token });
    }

    res.status(201).json({ id: rfq.id, suppliers: sent });
  } catch (err) {
    req.log.error({ err }, "Failed to create RFQ");
    res.status(500).json({ error: "Failed to create sourcing request" });
  }
});

// ─── LIST RFQs ─────────────────────────────────────────────────────────────────
router.get("/", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const rfqs = await db.select()
      .from(quoteRequestsTable)
      .where(eq(quoteRequestsTable.companyId, companyId))
      .orderBy(desc(quoteRequestsTable.createdAt));

    const ids = rfqs.map((r) => r.id);
    const itemCounts = ids.length > 0
      ? await db.select({ rfqId: quoteRequestItemsTable.rfqId, c: sql<number>`count(*)::int` })
          .from(quoteRequestItemsTable).where(inArray(quoteRequestItemsTable.rfqId, ids))
          .groupBy(quoteRequestItemsTable.rfqId)
      : [];
    const supplierStats = ids.length > 0
      ? await db.select({
          rfqId: quoteRequestSuppliersTable.rfqId,
          invited: sql<number>`count(*)::int`,
          responded: sql<number>`count(*) filter (where ${quoteRequestSuppliersTable.status} = 'submitted')::int`,
        })
          .from(quoteRequestSuppliersTable).where(inArray(quoteRequestSuppliersTable.rfqId, ids))
          .groupBy(quoteRequestSuppliersTable.rfqId)
      : [];
    const itemMap = new Map(itemCounts.map((r) => [r.rfqId, r.c]));
    const supMap = new Map(supplierStats.map((r) => [r.rfqId, r]));

    res.json(rfqs.map((r) => ({
      ...r,
      itemCount: itemMap.get(r.id) ?? 0,
      invitedCount: supMap.get(r.id)?.invited ?? 0,
      respondedCount: supMap.get(r.id)?.responded ?? 0,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list RFQs");
    res.status(500).json({ error: "Failed to list sourcing requests" });
  }
});

// ─── GET RFQ DETAIL (comparison data) ──────────────────────────────────────────
router.get("/:id", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const id = Number(req.params.id);

    const [rfq] = await db.select()
      .from(quoteRequestsTable)
      .where(and(eq(quoteRequestsTable.id, id), eq(quoteRequestsTable.companyId, companyId)));
    if (!rfq) { res.status(404).json({ error: "Not found" }); return; }

    const items = await db.select()
      .from(quoteRequestItemsTable)
      .where(eq(quoteRequestItemsTable.rfqId, id));

    const supplierRows = await db.select({
      rs: quoteRequestSuppliersTable,
      supplierName: suppliersTable.name,
    })
      .from(quoteRequestSuppliersTable)
      .leftJoin(suppliersTable, eq(quoteRequestSuppliersTable.supplierId, suppliersTable.id))
      .where(eq(quoteRequestSuppliersTable.rfqId, id));

    const rsIds = supplierRows.map((r) => r.rs.id);
    const lines = rsIds.length > 0
      ? await db.select().from(quoteRequestSupplierLinesTable)
          .where(inArray(quoteRequestSupplierLinesTable.rfqSupplierId, rsIds))
      : [];

    res.json({
      ...rfq,
      items,
      suppliers: supplierRows.map((r) => ({
        id: r.rs.id,
        supplierId: r.rs.supplierId,
        supplierName: r.supplierName ?? null,
        status: r.rs.status,
        leadTimeDays: r.rs.leadTimeDays,
        note: r.rs.note,
        submittedAt: r.rs.submittedAt,
        lines: lines
          .filter((l) => l.rfqSupplierId === r.rs.id)
          .map((l) => ({ rfqItemId: l.rfqItemId, unitPrice: l.unitPrice, supplierSku: l.supplierSku })),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get RFQ");
    res.status(500).json({ error: "Failed to load sourcing request" });
  }
});

// ─── DECIDE → CREATE PO + ORDER EMAIL ──────────────────────────────────────────
router.post("/:id/decide", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const id = Number(req.params.id);
    const parsed = z.object({ supplierId: z.number().int() }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [rfq] = await db.select()
      .from(quoteRequestsTable)
      .where(and(eq(quoteRequestsTable.id, id), eq(quoteRequestsTable.companyId, companyId)));
    if (!rfq) { res.status(404).json({ error: "Not found" }); return; }
    if (rfq.status !== "open") { res.status(400).json({ error: "Already decided" }); return; }

    const [rfqSupplier] = await db.select()
      .from(quoteRequestSuppliersTable)
      .where(and(
        eq(quoteRequestSuppliersTable.rfqId, id),
        eq(quoteRequestSuppliersTable.supplierId, parsed.data.supplierId),
      ));
    if (!rfqSupplier) { res.status(400).json({ error: "Supplier was not invited to this request" }); return; }

    const items = await db.select()
      .from(quoteRequestItemsTable)
      .where(eq(quoteRequestItemsTable.rfqId, id));
    const lines = await db.select()
      .from(quoteRequestSupplierLinesTable)
      .where(eq(quoteRequestSupplierLinesTable.rfqSupplierId, rfqSupplier.id));
    const priceByItem = new Map(lines.map((l) => [l.rfqItemId, l.unitPrice]));

    // Only items that map to a real product can become PO lines.
    const poItems = items
      .filter((i) => i.productId != null)
      .map((i) => ({ productId: i.productId!, quantityOrdered: i.quantity, unitPrice: priceByItem.get(i.id) ?? null }));
    if (poItems.length === 0) {
      res.status(400).json({ error: "None of the items are linked to products, so no order can be created" });
      return;
    }

    const [po] = await db.insert(purchaseOrdersTable).values({
      supplierId: parsed.data.supplierId,
      companyId,
      status: "ordered",
      notes: rfq.note ?? null,
      expectedDate: rfqSupplier.leadTimeDays != null
        ? new Date(Date.now() + rfqSupplier.leadTimeDays * 86400000)
        : null,
    }).returning();

    await db.insert(purchaseOrderItemsTable).values(
      poItems.map((i) => ({
        poId: po.id, productId: i.productId, quantityOrdered: i.quantityOrdered,
        quantityArrived: 0, unitPrice: i.unitPrice, companyId,
      }))
    );

    // Resolve any source shortage flags.
    const flagIds = items.map((i) => i.flagId).filter((f): f is number => f != null);
    if (flagIds.length > 0) {
      await db.update(shortageFlagsTable)
        .set({ resolvedAt: new Date() })
        .where(and(inArray(shortageFlagsTable.id, flagIds), eq(shortageFlagsTable.companyId, companyId)));
    }

    await db.update(quoteRequestsTable)
      .set({ status: "ordered", decidedSupplierId: parsed.data.supplierId, poId: po.id })
      .where(eq(quoteRequestsTable.id, id));

    // Send the order email (best-effort).
    const [supplier] = await db.select({ name: suppliersTable.name, email: suppliersTable.email, language: suppliersTable.language })
      .from(suppliersTable)
      .where(and(eq(suppliersTable.id, parsed.data.supplierId), eq(suppliersTable.companyId, companyId)));
    const { company, smtp } = await getSmtp(companyId);

    let emailSent = false;
    if (smtp && supplier?.email) {
      const named = await db.select({
        name: productsTable.name, sku: productsTable.supplierSku, quantity: purchaseOrderItemsTable.quantityOrdered,
        unitCost: purchaseOrderItemsTable.unitPrice,
      })
        .from(purchaseOrderItemsTable)
        .innerJoin(productsTable, eq(purchaseOrderItemsTable.productId, productsTable.id))
        .where(eq(purchaseOrderItemsTable.poId, po.id));
      emailSent = await sendSupplierOrderEmail({
        smtp,
        supplierName: supplier.name,
        supplierEmail: supplier.email,
        poId: po.id,
        companyName: company?.name ?? null,
        lang: supplier.language === "sl" ? "sl" : "en",
        items: named.map((i) => ({ name: i.name, sku: i.sku, quantity: i.quantity, unitCost: i.unitCost })),
      });
    }

    res.json({ ok: true, poId: po.id, emailSent });
  } catch (err) {
    req.log.error({ err }, "Failed to decide RFQ");
    res.status(500).json({ error: "Failed to create order" });
  }
});

// ─── REMIND NON-RESPONDERS ─────────────────────────────────────────────────────
router.post("/:id/remind", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const id = Number(req.params.id);
    const parsed = z.object({ origin: z.string().trim().url().optional() }).safeParse(req.body);
    const origin = parsed.success ? parsed.data.origin : undefined;

    const [rfq] = await db.select()
      .from(quoteRequestsTable)
      .where(and(eq(quoteRequestsTable.id, id), eq(quoteRequestsTable.companyId, companyId)));
    if (!rfq) { res.status(404).json({ error: "Not found" }); return; }

    const items = await db.select()
      .from(quoteRequestItemsTable)
      .where(eq(quoteRequestItemsTable.rfqId, id));

    const pending = await db.select({
      rs: quoteRequestSuppliersTable,
      name: suppliersTable.name, email: suppliersTable.email, language: suppliersTable.language,
    })
      .from(quoteRequestSuppliersTable)
      .leftJoin(suppliersTable, eq(quoteRequestSuppliersTable.supplierId, suppliersTable.id))
      .where(and(
        eq(quoteRequestSuppliersTable.rfqId, id),
        eq(quoteRequestSuppliersTable.status, "invited"),
      ));

    const { company, smtp } = await getSmtp(companyId);
    let count = 0;
    if (smtp) {
      for (const p of pending) {
        if (!p.email) continue;
        const quoteUrl = origin ? `${origin.replace(/\/$/, "")}/rfq/${p.rs.token}` : `/rfq/${p.rs.token}`;
        const ok = await sendRfqRequestEmail({
          smtp,
          supplierName: p.name ?? "",
          supplierEmail: p.email,
          quoteUrl,
          companyName: company?.name ?? null,
          lang: p.language === "sl" ? "sl" : "en",
          items: items.map((i) => ({ name: i.productName, quantity: i.quantity })),
        });
        if (ok) count++;
      }
    }
    res.json({ ok: true, reminded: count });
  } catch (err) {
    req.log.error({ err }, "Failed to send reminders");
    res.status(500).json({ error: "Failed to send reminders" });
  }
});

// ─── CANCEL / DELETE RFQ ───────────────────────────────────────────────────────
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const id = Number(req.params.id);
    await db.delete(quoteRequestsTable)
      .where(and(eq(quoteRequestsTable.id, id), eq(quoteRequestsTable.companyId, companyId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete RFQ");
    res.status(500).json({ error: "Failed to delete sourcing request" });
  }
});

export default router;
