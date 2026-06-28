import { Router, type IRouter } from "express";
import {
  db, quotesTable, quoteItemsTable, companiesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

// ─── GET QUOTE (public, token-validated) ──────────────────────────────────────
router.get("/:token", async (req, res) => {
  try {
    const [quote] = await db.select().from(quotesTable)
      .where(eq(quotesTable.publicToken, req.params.token));
    if (!quote) { res.status(404).json({ valid: false, reason: "not_found" }); return; }

    const [company] = await db.select({
      name: companiesTable.name, plan: companiesTable.plan,
      currency: companiesTable.currency, country: companiesTable.country,
    }).from(companiesTable).where(eq(companiesTable.id, quote.companyId));

    if (company?.plan === "lite") {
      res.json({ valid: false, reason: "plan_not_supported" });
      return;
    }

    const expired = quote.validUntil != null && new Date(quote.validUntil) < new Date();
    const items = await db.select().from(quoteItemsTable)
      .where(eq(quoteItemsTable.quoteId, quote.id))
      .orderBy(quoteItemsTable.sortOrder);

    res.json({
      valid: true,
      expired,
      status: quote.status,
      currency: company?.currency ?? "EUR",
      language: company?.country === "SI" ? "sl" : "en",
      companyName: company?.name ?? null,
      customerName: quote.customerName,
      quoteNumber: quote.quoteNumber,
      validUntil: quote.validUntil,
      subtotal: quote.subtotal,
      discount: quote.discount,
      taxRate: quote.taxRate,
      taxAmount: quote.taxAmount,
      total: quote.total,
      notes: quote.notes,
      terms: quote.terms,
      items: items.map((it) => ({
        name: it.name,
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        lineTotal: it.lineTotal,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load public quote");
    res.status(500).json({ error: "Failed" });
  }
});

// ─── RESPOND (accept / reject) ────────────────────────────────────────────────
router.post("/:token/respond", async (req, res) => {
  try {
    const parsed = z.object({ action: z.enum(["accept", "reject"]) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "action must be accept or reject" }); return; }

    const [quote] = await db.select().from(quotesTable)
      .where(eq(quotesTable.publicToken, req.params.token));
    if (!quote) { res.status(404).json({ error: "Not found" }); return; }

    const [company] = await db.select({ plan: companiesTable.plan })
      .from(companiesTable).where(eq(companiesTable.id, quote.companyId));
    if (company?.plan === "lite") {
      res.status(403).json({ error: "plan_not_supported" });
      return;
    }

    if (quote.status !== "sent") {
      res.status(409).json({ error: "Quote is not awaiting response", status: quote.status });
      return;
    }
    if (quote.validUntil != null && new Date(quote.validUntil) < new Date()) {
      res.status(410).json({ error: "Quote has expired" });
      return;
    }

    const newStatus = parsed.data.action === "accept" ? "approved" : "rejected";
    await db.update(quotesTable)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(quotesTable.id, quote.id));

    res.json({ ok: true, status: newStatus });
  } catch (err) {
    req.log.error({ err }, "Failed to process quote response");
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
