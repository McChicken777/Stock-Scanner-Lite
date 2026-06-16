import { Router, type IRouter } from "express";
import {
  db, quotesTable, quoteItemsTable, quoteRevisionsTable, customersTable,
  productsTable, workProjectsTable, workProjectItemsTable, workItemStepsTable,
  workTemplatesTable, workStepsTable, productComponentsTable, companiesTable,
  rolesTable, inboundTable, templateStepDependenciesTable, stepDependenciesTable,
} from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const itemInputSchema = z.object({
  id: z.number().int().optional(),
  productId: z.number().int().nullable().optional(),
  name: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  quantity: z.number().min(0),
  unitPrice: z.number().min(0),
  sortOrder: z.number().int().optional(),
});

const quoteSchema = z.object({
  customerId: z.number().int().nullable().optional(),
  customerName: z.string().nullable().optional(),
  customerContact: z.string().nullable().optional(),
  customerEmail: z.string().nullable().optional(),
  customerPhone: z.string().nullable().optional(),
  customerAddress: z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  discount: z.number().min(0).default(0),
  taxRate: z.number().min(0).max(100).default(0),
  items: z.array(itemInputSchema).default([]),
  revisionNote: z.string().nullable().optional(),
});

function computeTotals(items: { quantity: number; unitPrice: number }[], discount: number, taxRate: number) {
  const subtotal = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
  const afterDiscount = Math.max(0, subtotal - discount);
  const taxAmount = +(afterDiscount * (taxRate / 100)).toFixed(2);
  const total = +(afterDiscount + taxAmount).toFixed(2);
  return { subtotal: +subtotal.toFixed(2), taxAmount, total };
}

async function assertItemProductsOwnership(
  items: Array<{ productId?: number | null }>,
  companyId: number,
): Promise<true | string> {
  const ids = Array.from(
    new Set(items.map((it) => it.productId).filter((v): v is number => typeof v === "number")),
  );
  if (ids.length === 0) return true;
  const rows = await db.select({ id: productsTable.id })
    .from(productsTable)
    .where(and(inArray(productsTable.id, ids), eq(productsTable.companyId, companyId)));
  if (rows.length !== ids.length) return "One or more productId values are invalid";
  return true;
}

async function assertCustomerOwnership(customerId: number | null | undefined, companyId: number): Promise<true | string> {
  if (customerId === null || customerId === undefined) return true;
  const [c] = await db.select({ id: customersTable.id }).from(customersTable)
    .where(and(eq(customersTable.id, customerId), eq(customersTable.companyId, companyId)));
  return c ? true : "Invalid customerId";
}

async function nextQuoteNumber(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  companyId: number,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `Q-${year}-`;
  // Use the existing max sequence rather than a count, so deletes
  // never cause a duplicate. Combined with the unique index on
  // (company_id, quote_number) this is concurrency-safe; on conflict
  // the caller will simply retry.
  const startPos = prefix.length + 1;
  const [{ max }] = await tx.select({
    max: sql<number>`COALESCE(MAX(CAST(SUBSTRING(${quotesTable.quoteNumber} FROM ${sql.raw(String(startPos))}) AS INTEGER)), 0)`,
  })
    .from(quotesTable)
    .where(and(
      eq(quotesTable.companyId, companyId),
      sql`${quotesTable.quoteNumber} LIKE ${prefix + "%"}`,
    ));
  const seq = (Number(max) + 1).toString().padStart(4, "0");
  return `${prefix}${seq}`;
}

async function loadQuoteFull(quoteId: number, companyId: number) {
  const [quote] = await db.select().from(quotesTable)
    .where(and(eq(quotesTable.id, quoteId), eq(quotesTable.companyId, companyId)));
  if (!quote) return null;
  const items = await db.select().from(quoteItemsTable)
    .where(eq(quoteItemsTable.quoteId, quoteId))
    .orderBy(quoteItemsTable.sortOrder);
  let customer = null;
  if (quote.customerId) {
    const [c] = await db.select().from(customersTable)
      .where(and(eq(customersTable.id, quote.customerId), eq(customersTable.companyId, companyId)));
    customer = c ?? null;
  }
  const revisions = await db.select().from(quoteRevisionsTable)
    .where(eq(quoteRevisionsTable.quoteId, quoteId))
    .orderBy(desc(quoteRevisionsTable.revisionNumber));
  return { ...quote, items, customer, revisions };
}

async function recordRevision(quoteId: number, userId: number | undefined, note: string | null) {
  const full = await db.select().from(quotesTable).where(eq(quotesTable.id, quoteId));
  if (!full[0]) return;
  const items = await db.select().from(quoteItemsTable).where(eq(quoteItemsTable.quoteId, quoteId));
  const [{ max }] = await db.select({ max: sql<number>`COALESCE(MAX(${quoteRevisionsTable.revisionNumber}), 0)` })
    .from(quoteRevisionsTable).where(eq(quoteRevisionsTable.quoteId, quoteId));
  await db.insert(quoteRevisionsTable).values({
    quoteId,
    revisionNumber: Number(max) + 1,
    snapshot: { quote: full[0], items },
    note,
    createdByUserId: userId ?? null,
  });
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// LIST
router.get("/", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const customerId = req.query.customerId ? Number(req.query.customerId) : undefined;
    const workProjectId = req.query.workProjectId ? Number(req.query.workProjectId) : undefined;
    const fromDate = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
    const toDate = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;

    const conds = [eq(quotesTable.companyId, companyId)];
    if (status) conds.push(eq(quotesTable.status, status as "draft" | "sent" | "approved" | "rejected" | "converted"));
    if (customerId) conds.push(eq(quotesTable.customerId, customerId));
    if (workProjectId) conds.push(eq(quotesTable.workProjectId, workProjectId));
    if (fromDate && !Number.isNaN(fromDate.getTime())) conds.push(sql`${quotesTable.createdAt} >= ${fromDate}`);
    if (toDate && !Number.isNaN(toDate.getTime())) conds.push(sql`${quotesTable.createdAt} <= ${toDate}`);

    const rows = await db.select({
      id: quotesTable.id,
      quoteNumber: quotesTable.quoteNumber,
      status: quotesTable.status,
      customerId: quotesTable.customerId,
      customerName: quotesTable.customerName,
      customerNameLookup: customersTable.name,
      total: quotesTable.total,
      validUntil: quotesTable.validUntil,
      workProjectId: quotesTable.workProjectId,
      createdAt: quotesTable.createdAt,
      updatedAt: quotesTable.updatedAt,
    })
      .from(quotesTable)
      .leftJoin(
        customersTable,
        and(eq(quotesTable.customerId, customersTable.id), eq(customersTable.companyId, companyId)),
      )
      .where(and(...conds))
      .orderBy(desc(quotesTable.createdAt));

    res.json(rows.map((r) => ({
      ...r,
      customerDisplayName: r.customerNameLookup ?? r.customerName ?? "—",
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list quotes");
    res.status(500).json({ error: "Failed to list quotes" });
  }
});

// COUNTS by status
router.get("/counts", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const rows = await db.select({
      status: quotesTable.status,
      count: sql<number>`COUNT(*)`,
    })
      .from(quotesTable)
      .where(eq(quotesTable.companyId, companyId))
      .groupBy(quotesTable.status);
    const counts: Record<string, number> = { draft: 0, sent: 0, approved: 0, rejected: 0, converted: 0 };
    for (const r of rows) counts[r.status] = Number(r.count);
    res.json(counts);
  } catch (err) {
    req.log.error({ err }, "Failed to get quote counts");
    res.status(500).json({ error: "Failed to get quote counts" });
  }
});

// CREATE
router.post("/", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = quoteSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const d = parsed.data;

    const ownOk = await assertCustomerOwnership(d.customerId, companyId);
    if (ownOk !== true) { res.status(400).json({ error: ownOk }); return; }

    if (!d.customerId && !(d.customerName && d.customerName.trim())) {
      res.status(400).json({ error: "Either customerId or customerName is required" });
      return;
    }

    const prodOk = await assertItemProductsOwnership(d.items, companyId);
    if (prodOk !== true) { res.status(400).json({ error: prodOk }); return; }

    const totals = computeTotals(d.items, d.discount, d.taxRate);

    const insertQuote = async () => db.transaction(async (tx) => {
      const quoteNumber = await nextQuoteNumber(tx, companyId);
      const [q] = await tx.insert(quotesTable).values({
        quoteNumber,
        status: "draft",
        customerId: d.customerId ?? null,
        customerName: d.customerName ?? null,
        customerContact: d.customerContact ?? null,
        customerEmail: d.customerEmail ?? null,
        customerPhone: d.customerPhone ?? null,
        customerAddress: d.customerAddress ?? null,
        validUntil: d.validUntil ? new Date(d.validUntil) : null,
        notes: d.notes ?? null,
        terms: d.terms ?? null,
        subtotal: totals.subtotal,
        discount: d.discount,
        taxRate: d.taxRate,
        taxAmount: totals.taxAmount,
        total: totals.total,
        companyId,
      }).returning();

      if (d.items.length > 0) {
        await tx.insert(quoteItemsTable).values(
          d.items.map((it, idx) => ({
            quoteId: q.id,
            productId: it.productId ?? null,
            name: it.name,
            description: it.description ?? null,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            lineTotal: +(it.quantity * it.unitPrice).toFixed(2),
            sortOrder: it.sortOrder ?? idx,
          })),
        );
      }
      return q;
    });

    // Retry up to 5 times on quote_number unique conflict (concurrent creates).
    let quote: Awaited<ReturnType<typeof insertQuote>> | undefined;
    let lastErr: unknown = undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        quote = await insertQuote();
        break;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("quotes_company_quote_number_uq")) {
          lastErr = e;
          continue;
        }
        throw e;
      }
    }
    if (!quote) {
      req.log.error({ err: lastErr }, "Quote number contention exhausted retries");
      res.status(409).json({ error: "Quote number contention, please retry" });
      return;
    }

    const full = await loadQuoteFull(quote.id, companyId);
    res.status(201).json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to create quote");
    res.status(500).json({ error: "Failed to create quote" });
  }
});

// GET ONE
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;
    const full = await loadQuoteFull(id, companyId);
    if (!full) { res.status(404).json({ error: "Not found" }); return; }
    res.json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to get quote");
    res.status(500).json({ error: "Failed to get quote" });
  }
});

// UPDATE
router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;
    const parsed = quoteSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [existing] = await db.select().from(quotesTable)
      .where(and(eq(quotesTable.id, id), eq(quotesTable.companyId, companyId)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (existing.status === "converted") {
      res.status(400).json({ error: "Cannot edit a converted quote" });
      return;
    }

    const ownOk = await assertCustomerOwnership(parsed.data.customerId, companyId);
    if (ownOk !== true) { res.status(400).json({ error: ownOk }); return; }

    if (!parsed.data.customerId && !(parsed.data.customerName && parsed.data.customerName.trim())) {
      res.status(400).json({ error: "Either customerId or customerName is required" });
      return;
    }

    const prodOk = await assertItemProductsOwnership(parsed.data.items, companyId);
    if (prodOk !== true) { res.status(400).json({ error: prodOk }); return; }

    // If quote was already sent, or the user supplied a revision note,
    // snapshot the previous state so the boss can see what changed.
    if (existing.status !== "draft" || parsed.data.revisionNote) {
      await recordRevision(id, req.session.userId, parsed.data.revisionNote ?? "Edited after send");
    }

    const d = parsed.data;
    const totals = computeTotals(d.items, d.discount, d.taxRate);

    await db.update(quotesTable).set({
      customerId: d.customerId ?? null,
      customerName: d.customerName ?? null,
      customerContact: d.customerContact ?? null,
      customerEmail: d.customerEmail ?? null,
      customerPhone: d.customerPhone ?? null,
      customerAddress: d.customerAddress ?? null,
      validUntil: d.validUntil ? new Date(d.validUntil) : null,
      notes: d.notes ?? null,
      terms: d.terms ?? null,
      subtotal: totals.subtotal,
      discount: d.discount,
      taxRate: d.taxRate,
      taxAmount: totals.taxAmount,
      total: totals.total,
      updatedAt: new Date(),
    }).where(eq(quotesTable.id, id));

    // Replace items
    await db.delete(quoteItemsTable).where(eq(quoteItemsTable.quoteId, id));
    if (d.items.length > 0) {
      await db.insert(quoteItemsTable).values(
        d.items.map((it, idx) => ({
          quoteId: id,
          productId: it.productId ?? null,
          name: it.name,
          description: it.description ?? null,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          lineTotal: +(it.quantity * it.unitPrice).toFixed(2),
          sortOrder: it.sortOrder ?? idx,
        })),
      );
    }

    const full = await loadQuoteFull(id, companyId);
    res.json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to update quote");
    res.status(500).json({ error: "Failed to update quote" });
  }
});

// STATUS CHANGE
router.put("/:id/status", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;
    const parsed = z.object({
      status: z.enum(["draft", "sent", "approved", "rejected", "delivered"]),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [existing] = await db.select().from(quotesTable)
      .where(and(eq(quotesTable.id, id), eq(quotesTable.companyId, companyId)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (existing.status === "converted") {
      res.status(400).json({ error: "Quote already converted" });
      return;
    }
    // Delivered is reachable only from an accepted (approved) quote.
    if (parsed.data.status === "delivered" && existing.status !== "approved" && existing.status !== "delivered") {
      res.status(400).json({ error: "Only an accepted quote can be marked delivered" });
      return;
    }

    await db.update(quotesTable).set({
      status: parsed.data.status,
      updatedAt: new Date(),
    }).where(eq(quotesTable.id, id));

    const full = await loadQuoteFull(id, companyId);
    res.json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to update quote status");
    res.status(500).json({ error: "Failed to update quote status" });
  }
});

// DELETE
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;
    const [existing] = await db.select().from(quotesTable)
      .where(and(eq(quotesTable.id, id), eq(quotesTable.companyId, companyId)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (existing.status === "converted") {
      res.status(400).json({ error: "Cannot delete a converted quote" });
      return;
    }
    await db.delete(quotesTable).where(eq(quotesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete quote");
    res.status(500).json({ error: "Failed to delete quote" });
  }
});

// CONVERT TO WORK ORDER
router.post("/:id/convert", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;
    const parsed = z.object({
      deadline: z.string().min(1),
      priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
      requiresExternalParts: z.boolean().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    // Pushing a quote into production is a Standard+ feature. Lite stops at Delivered.
    const [planRow] = await db.select({ plan: companiesTable.plan })
      .from(companiesTable).where(eq(companiesTable.id, companyId));
    if (!planRow || planRow.plan === "lite" || planRow.plan == null) {
      res.status(403).json({ error: "Converting a quote to a job order requires a Standard or Pro plan", planRequired: "standard" });
      return;
    }

    const project = await db.transaction(async (tx) => {
    const [quote] = await tx.select().from(quotesTable)
      .where(and(eq(quotesTable.id, id), eq(quotesTable.companyId, companyId)))
      .for("update");
    if (!quote) throw new Error("__notfound__");
    if (quote.status !== "approved") throw new Error("__not_approved__");
    if (quote.workProjectId) throw new Error("__already_converted__");

    const items = await tx.select().from(quoteItemsTable)
      .where(eq(quoteItemsTable.quoteId, id))
      .orderBy(quoteItemsTable.sortOrder);

    let resolvedCustomerName = quote.customerName;
    if (!resolvedCustomerName && quote.customerId) {
      const [c] = await tx.select({ name: customersTable.name }).from(customersTable)
        .where(and(eq(customersTable.id, quote.customerId), eq(customersTable.companyId, companyId)));
      resolvedCustomerName = c?.name ?? null;
    }
    const projectName = `${quote.quoteNumber} — ${resolvedCustomerName ?? "Quote"}`;
    const [project] = await tx.insert(workProjectsTable).values({
      name: projectName,
      deadline: new Date(parsed.data.deadline),
      priority: parsed.data.priority,
      requiresExternalParts: parsed.data.requiresExternalParts ?? false,
      companyId,
    }).returning();

    // For each line item, try to find a matching template (by productId) and instantiate;
    // otherwise create a bare item with no steps.
    let sortOrder = 0;
    const companyRoleRows = await tx.select({ id: rolesTable.id }).from(rolesTable)
      .where(eq(rolesTable.companyId, companyId));
    const validRoleIds = new Set(companyRoleRows.map((r) => r.id));

    for (const li of items) {
      const qty = Math.max(1, Math.floor(li.quantity));

      let template = null;
      if (li.productId) {
        const [t] = await tx.select().from(workTemplatesTable)
          .where(and(
            eq(workTemplatesTable.companyId, companyId),
            eq(workTemplatesTable.productId, li.productId),
          ));
        template = t ?? null;
      }

      if (template) {
        const topSteps = await tx.select().from(workStepsTable)
          .where(and(
            eq(workStepsTable.templateId, template.id),
            sql`${workStepsTable.templateComponentId} IS NULL`,
          ))
          .orderBy(workStepsTable.sortOrder);

        const components = template.productId
          ? await tx.select().from(productComponentsTable)
              .where(eq(productComponentsTable.parentProductId, template.productId))
              .orderBy(productComponentsTable.sortOrder)
          : [];

        // Template step dependencies (Step 1 feature) — copied to each item's live
        // steps so quote-converted jobs get the same auto-sequencing as catalog jobs.
        const templateDeps = await tx.select().from(templateStepDependenciesTable)
          .where(eq(templateStepDependenciesTable.templateId, template.id));

        for (let copy = 0; copy < qty; copy++) {
          const itemName = qty > 1 ? `${li.name} #${copy + 1}` : li.name;
          const [pItem] = await tx.insert(workProjectItemsTable).values({
            projectId: project.id, name: itemName, sortOrder: sortOrder++,
          }).returning();

          // Maps top-level templateStepId → this copy's live step id for dependency copying.
          const topStepMap = new Map<number, number>();

          for (const comp of components) {
            const [compProduct] = await tx.select().from(productsTable)
              .where(eq(productsTable.id, comp.componentProductId));
            if (!compProduct) continue;
            const compSteps = await tx.select().from(workStepsTable)
              .where(and(
                eq(workStepsTable.templateId, template.id),
                eq(workStepsTable.templateComponentId, comp.id),
              ))
              .orderBy(workStepsTable.sortOrder);
            for (let q = 0; q < comp.quantity; q++) {
              for (let i = 0; i < compSteps.length; i++) {
                const s = compSteps[i];
                const rid = s.roleId ?? null;
                await tx.insert(workItemStepsTable).values({
                  itemId: pItem.id,
                  name: comp.quantity > 1 ? `${compProduct.name} #${q + 1}: ${s.name}` : `${compProduct.name}: ${s.name}`,
                  sortOrder: i,
                  roleId: rid !== null && validRoleIds.has(rid) ? rid : null,
                  batchMode: s.batchMode,
                  durationEstimate: s.durationEstimate,
                  templateStepId: s.id,
                });
              }
            }
          }

          for (let i = 0; i < topSteps.length; i++) {
            const s = topSteps[i];
            const rid = s.roleId ?? null;
            const [liveStep] = await tx.insert(workItemStepsTable).values({
              itemId: pItem.id,
              name: s.name,
              sortOrder: 1000 + i,
              roleId: rid !== null && validRoleIds.has(rid) ? rid : null,
              batchMode: s.batchMode,
              durationEstimate: s.durationEstimate,
              templateStepId: s.id,
            }).returning({ id: workItemStepsTable.id });
            topStepMap.set(s.id, liveStep.id);
          }

          // Copy template step dependencies onto this item's live steps.
          for (const dep of templateDeps) {
            const liveBlocker = topStepMap.get(dep.blockerStepId);
            const liveBlocked = topStepMap.get(dep.blockedStepId);
            if (liveBlocker && liveBlocked) {
              await tx.insert(stepDependenciesTable).values({
                blockerStepId: liveBlocker,
                blockedStepId: liveBlocked,
                companyId,
              }).onConflictDoNothing();
            }
          }
        }
      } else {
        await tx.insert(workProjectItemsTable).values({
          projectId: project.id,
          name: qty > 1 ? `${li.name} (×${qty})` : li.name,
          sortOrder: sortOrder++,
        });
      }
    }

    if (parsed.data.requiresExternalParts) {
      await tx.insert(inboundTable).values({ projectId: project.id, status: "expected", companyId });
    }

    await tx.update(quotesTable).set({
      status: "converted",
      workProjectId: project.id,
      updatedAt: new Date(),
    }).where(eq(quotesTable.id, id));

    return project;
    });

    const [updatedQuote] = await db.select().from(quotesTable)
      .where(and(eq(quotesTable.id, id), eq(quotesTable.companyId, companyId)));
    res.status(201).json({ quote: updatedQuote, project: { id: project.id, name: project.name } });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "__notfound__") { res.status(404).json({ error: "Not found" }); return; }
    if (msg === "__not_approved__") { res.status(400).json({ error: "Only approved quotes can be sent to production" }); return; }
    if (msg === "__already_converted__") { res.status(400).json({ error: "Quote already converted" }); return; }
    req.log.error({ err }, "Failed to convert quote");
    res.status(500).json({ error: "Failed to convert quote" });
  }
});

// PDF DOWNLOAD
router.get("/:id/pdf", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;
    const full = await loadQuoteFull(id, companyId);
    if (!full) { res.status(404).json({ error: "Not found" }); return; }
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId));

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${full.quoteNumber}.pdf"`);
    doc.pipe(res);

    // Header — embed company logo (PNG/JPG base64) top-left if present
    if (company?.logo) {
      try {
        const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(company.logo);
        if (m) {
          const imgBuf = Buffer.from(m[2], "base64");
          const img = (doc as any).openImage(imgBuf) as { width: number; height: number };
          const MAX_W = 200, MAX_H = 90;
          const scale = Math.min(MAX_W / img.width, MAX_H / img.height, 1);
          const dW = Math.round(img.width * scale);
          const dH = Math.round(img.height * scale);
          doc.image(imgBuf, 50, 45, { width: dW, height: dH });
          doc.y = 45 + dH + 8;
        }
      } catch { /* ignore an unreadable logo */ }
    }
    doc.fontSize(20).font("Helvetica-Bold").text(company?.name ?? "Quote", { align: "left" });
    doc.moveDown(0.3);
    doc.fontSize(22).fillColor("#222").text(`QUOTE ${full.quoteNumber}`, { align: "right" });
    doc.fillColor("black").fontSize(10).font("Helvetica");
    doc.text(`Date: ${new Date(full.createdAt).toLocaleDateString()}`, { align: "right" });
    if (full.validUntil) {
      doc.text(`Valid until: ${new Date(full.validUntil).toLocaleDateString()}`, { align: "right" });
    }
    doc.text(`Status: ${full.status.toUpperCase()}`, { align: "right" });
    doc.moveDown(1);

    // Customer block
    doc.fontSize(11).font("Helvetica-Bold").text("Bill To:");
    doc.font("Helvetica").fontSize(10);
    const cName = full.customer?.name ?? full.customerName ?? "—";
    doc.text(cName);
    const contact = full.customer?.contactPerson ?? full.customerContact;
    if (contact) doc.text(contact);
    const email = full.customer?.email ?? full.customerEmail;
    if (email) doc.text(email);
    const phone = full.customer?.phone ?? full.customerPhone;
    if (phone) doc.text(phone);
    const address = full.customer?.address ?? full.customerAddress;
    if (address) doc.text(address);
    doc.moveDown(1.5);

    // Items table
    const tableTop = doc.y;
    const colX = { name: 50, qty: 320, price: 380, total: 470 };
    doc.font("Helvetica-Bold").fontSize(10);
    doc.text("Description", colX.name, tableTop);
    doc.text("Qty", colX.qty, tableTop, { width: 50, align: "right" });
    doc.text("Price", colX.price, tableTop, { width: 70, align: "right" });
    doc.text("Total", colX.total, tableTop, { width: 80, align: "right" });
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

    doc.font("Helvetica").fontSize(10);
    let y = tableTop + 22;
    for (const it of full.items) {
      if (y > 720) { doc.addPage(); y = 50; }
      const lineTotal = Number(it.quantity) * Number(it.unitPrice);
      doc.text(it.name, colX.name, y, { width: 260 });
      if (it.description) {
        doc.fillColor("#666").fontSize(9).text(it.description, colX.name, doc.y, { width: 260 });
        doc.fillColor("black").fontSize(10);
      }
      doc.text(String(Number(it.quantity)), colX.qty, y, { width: 50, align: "right" });
      doc.text(`$${Number(it.unitPrice).toFixed(2)}`, colX.price, y, { width: 70, align: "right" });
      doc.text(`$${lineTotal.toFixed(2)}`, colX.total, y, { width: 80, align: "right" });
      y = doc.y + 8;
    }

    // Totals
    doc.moveTo(350, y).lineTo(550, y).stroke();
    y += 8;
    doc.font("Helvetica").fontSize(10);
    doc.text("Subtotal:", 350, y, { width: 120, align: "right" });
    doc.text(`$${Number(full.subtotal).toFixed(2)}`, 470, y, { width: 80, align: "right" });
    y += 16;
    if (Number(full.discount) > 0) {
      doc.text("Discount:", 350, y, { width: 120, align: "right" });
      doc.text(`-$${Number(full.discount).toFixed(2)}`, 470, y, { width: 80, align: "right" });
      y += 16;
    }
    if (Number(full.taxRate) > 0) {
      doc.text(`Tax (${Number(full.taxRate)}%):`, 350, y, { width: 120, align: "right" });
      doc.text(`$${Number(full.taxAmount).toFixed(2)}`, 470, y, { width: 80, align: "right" });
      y += 16;
    }
    doc.font("Helvetica-Bold").fontSize(12);
    doc.text("Total:", 350, y, { width: 120, align: "right" });
    doc.text(`$${Number(full.total).toFixed(2)}`, 470, y, { width: 80, align: "right" });
    y += 30;

    // Notes & terms
    if (full.notes) {
      if (y > 700) { doc.addPage(); y = 50; }
      doc.font("Helvetica-Bold").fontSize(10).text("Notes", 50, y); y += 14;
      doc.font("Helvetica").fontSize(9).text(full.notes, 50, y, { width: 500 });
      y = doc.y + 14;
    }
    if (full.terms) {
      if (y > 700) { doc.addPage(); y = 50; }
      doc.font("Helvetica-Bold").fontSize(10).text("Terms & Conditions", 50, y); y += 14;
      doc.font("Helvetica").fontSize(9).text(full.terms, 50, y, { width: 500 });
    }

    // Signature block
    if (company?.quoteSignerName) {
      let sigY = doc.y + 40;
      if (sigY > 740) { doc.addPage(); sigY = 60; }
      doc.moveTo(50, sigY).lineTo(250, sigY).stroke();
      doc.font("Helvetica").fontSize(9).fillColor("#666").text("Signed by", 50, sigY + 4);
      doc.font("Helvetica-Bold").fontSize(11).fillColor("black").text(company.quoteSignerName, 50, sigY + 16);
    }

    doc.end();
  } catch (err) {
    req.log.error({ err }, "Failed to generate PDF");
    if (!res.headersSent) res.status(500).json({ error: "Failed to generate PDF" });
  }
});

export default router;
