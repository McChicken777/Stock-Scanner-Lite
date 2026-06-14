import { Router, type IRouter } from "express";
import {
  db, purchaseOrdersTable, purchaseOrderItemsTable, productsTable,
  stockTable, locationsTable, suppliersTable, workItemStepsTable, productComponentsTable,
  workProjectsTable, workProjectItemsTable, stockReservationsTable,
  restockRequestsTable, supplierProductsTable, usersTable,
} from "@workspace/db";
import { eq, and, sum, sql, inArray, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

// ─── LIST PURCHASE ORDERS ──────────────────────────────────────────────────────

router.get("/", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const pos = await db.select({
      po: purchaseOrdersTable,
      supplierName: suppliersTable.name,
    })
      .from(purchaseOrdersTable)
      .leftJoin(suppliersTable, eq(purchaseOrdersTable.supplierId, suppliersTable.id))
      .where(eq(purchaseOrdersTable.companyId, companyId))
      .orderBy(sql`${purchaseOrdersTable.createdAt} desc`);

    // Get item counts per PO
    const poIds = pos.map((p) => p.po.id);
    const itemCounts = poIds.length > 0
      ? await db.select({
          poId: purchaseOrderItemsTable.poId,
          itemCount: sql<number>`count(*)::int`,
          totalOrdered: sum(purchaseOrderItemsTable.quantityOrdered),
        })
          .from(purchaseOrderItemsTable)
          .where(inArray(purchaseOrderItemsTable.poId, poIds))
          .groupBy(purchaseOrderItemsTable.poId)
      : [];

    const countMap = new Map(itemCounts.map((ic) => [ic.poId, ic]));

    res.json(pos.map((p) => ({
      ...p.po,
      supplierName: p.supplierName ?? null,
      itemCount: countMap.get(p.po.id)?.itemCount ?? 0,
      totalOrdered: Number(countMap.get(p.po.id)?.totalOrdered ?? 0),
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list purchase orders");
    res.status(500).json({ error: "Failed to list purchase orders" });
  }
});

// ─── CREATE PURCHASE ORDER ─────────────────────────────────────────────────────

router.post("/", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = z.object({
      supplierId: z.number().int().nullable().optional(),
      expectedDate: z.string().nullable().optional(),
      notes: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [po] = await db.insert(purchaseOrdersTable).values({
      supplierId: parsed.data.supplierId ?? null,
      expectedDate: parsed.data.expectedDate ? new Date(parsed.data.expectedDate) : null,
      notes: parsed.data.notes ?? null,
      companyId,
      status: "draft",
    }).returning();

    res.status(201).json(po);
  } catch (err) {
    req.log.error({ err }, "Failed to create purchase order");
    res.status(500).json({ error: "Failed to create purchase order" });
  }
});

// ─── BATCH CREATE PO WITH ITEMS ───────────────────────────────────────────────
// Creates a PO and adds all line items in one request — used by the supplier order view.

router.post("/batch", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = z.object({
      supplierId: z.number().int().nullable().optional(),
      expectedDate: z.string().nullable().optional(),
      notes: z.string().optional(),
      items: z.array(z.object({
        productId: z.number().int(),
        quantityOrdered: z.number().int().min(1),
        unitPrice: z.number().min(0).nullable().optional(),
      })).min(1),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const { supplierId, expectedDate, notes, items } = parsed.data;

    const [po] = await db.insert(purchaseOrdersTable).values({
      supplierId: supplierId ?? null,
      expectedDate: expectedDate ? new Date(expectedDate) : null,
      notes: notes ?? null,
      companyId,
      status: "draft",
    }).returning();

    const insertedItems = await db.insert(purchaseOrderItemsTable).values(
      items.map((item) => ({
        poId: po.id,
        productId: item.productId,
        quantityOrdered: item.quantityOrdered,
        quantityArrived: 0,
        unitPrice: item.unitPrice ?? null,
        companyId,
      }))
    ).returning();

    res.status(201).json({ ...po, items: insertedItems });
  } catch (err) {
    req.log.error({ err }, "Failed to batch-create purchase order");
    res.status(500).json({ error: "Failed to create purchase order" });
  }
});

// ─── GET SINGLE PO WITH ITEMS ──────────────────────────────────────────────────

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const id = Number(req.params.id);

    const [poRow] = await db.select({
      po: purchaseOrdersTable,
      supplierName: suppliersTable.name,
    })
      .from(purchaseOrdersTable)
      .leftJoin(suppliersTable, eq(purchaseOrdersTable.supplierId, suppliersTable.id))
      .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.companyId, companyId)));

    if (!poRow) { res.status(404).json({ error: "Not found" }); return; }

    const items = await db.select({
      item: purchaseOrderItemsTable,
      productName: productsTable.name,
      productCategory: productsTable.category,
      supplierSku: productsTable.supplierSku,
    })
      .from(purchaseOrderItemsTable)
      .innerJoin(productsTable, eq(purchaseOrderItemsTable.productId, productsTable.id))
      .where(eq(purchaseOrderItemsTable.poId, id));

    // For each PO item, find which projects have active reservations for that product
    const productIds = items.map((i) => i.item.productId);
    const waitingReservations = productIds.length > 0
      ? await db.select({
          productId: stockReservationsTable.productId,
          workOrderId: stockReservationsTable.workOrderId,
          projectName: workProjectsTable.name,
          quantity: stockReservationsTable.quantity,
        })
          .from(stockReservationsTable)
          .innerJoin(workProjectsTable, eq(stockReservationsTable.workOrderId, workProjectsTable.id))
          .where(and(
            eq(stockReservationsTable.companyId, companyId),
            eq(stockReservationsTable.status, "active"),
            inArray(stockReservationsTable.productId, productIds),
          ))
      : [];

    // Group by productId
    const waitingByProduct = new Map<number, { projectId: number; projectName: string; quantity: number }[]>();
    for (const r of waitingReservations) {
      if (r.workOrderId == null) continue;
      const existing = waitingByProduct.get(r.productId) ?? [];
      existing.push({ projectId: r.workOrderId, projectName: r.projectName, quantity: r.quantity });
      waitingByProduct.set(r.productId, existing);
    }

    res.json({
      ...poRow.po,
      supplierName: poRow.supplierName ?? null,
      items: items.map((i) => ({
        ...i.item,
        productName: i.productName,
        productCategory: i.productCategory,
        supplierSku: i.supplierSku,
        waitingProjects: waitingByProduct.get(i.item.productId) ?? [],
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get purchase order");
    res.status(500).json({ error: "Failed to get purchase order" });
  }
});

// ─── UPDATE PO STATUS ──────────────────────────────────────────────────────────

router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const id = Number(req.params.id);
    const parsed = z.object({
      status: z.enum(["draft", "ordered", "partially_arrived", "arrived", "cancelled"]).optional(),
      supplierId: z.number().int().nullable().optional(),
      expectedDate: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
    if (parsed.data.supplierId !== undefined) updateData.supplierId = parsed.data.supplierId;
    if (parsed.data.expectedDate !== undefined) updateData.expectedDate = parsed.data.expectedDate ? new Date(parsed.data.expectedDate) : null;
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;

    const [updated] = await db.update(purchaseOrdersTable)
      .set(updateData)
      .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.companyId, companyId)))
      .returning();

    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update purchase order");
    res.status(500).json({ error: "Failed to update purchase order" });
  }
});

// ─── DELETE PO ─────────────────────────────────────────────────────────────────

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const id = Number(req.params.id);
    await db.delete(purchaseOrdersTable)
      .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.companyId, companyId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete purchase order");
    res.status(500).json({ error: "Failed to delete purchase order" });
  }
});

// ─── ADD ITEM TO PO ────────────────────────────────────────────────────────────

router.post("/:id/items", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const poId = Number(req.params.id);

    const [po] = await db.select().from(purchaseOrdersTable)
      .where(and(eq(purchaseOrdersTable.id, poId), eq(purchaseOrdersTable.companyId, companyId)));
    if (!po) { res.status(404).json({ error: "PO not found" }); return; }
    if (po.status === "arrived" || po.status === "cancelled") {
      res.status(400).json({ error: "Cannot add items to a closed PO" }); return;
    }

    const parsed = z.object({
      productId: z.number().int(),
      quantityOrdered: z.number().int().min(1),
      unitPrice: z.number().min(0).nullable().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [item] = await db.insert(purchaseOrderItemsTable).values({
      poId,
      productId: parsed.data.productId,
      quantityOrdered: parsed.data.quantityOrdered,
      quantityArrived: 0,
      unitPrice: parsed.data.unitPrice ?? null,
      companyId,
    }).returning();

    res.status(201).json(item);
  } catch (err) {
    req.log.error({ err }, "Failed to add PO item");
    res.status(500).json({ error: "Failed to add PO item" });
  }
});

// ─── UPDATE PO ITEM ────────────────────────────────────────────────────────────

router.put("/:id/items/:itemId", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const itemId = Number(req.params.itemId);
    const parsed = z.object({
      quantityOrdered: z.number().int().min(1).optional(),
      unitPrice: z.number().min(0).nullable().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const updateSet: Record<string, unknown> = {};
    if (parsed.data.quantityOrdered !== undefined) updateSet.quantityOrdered = parsed.data.quantityOrdered;
    if (parsed.data.unitPrice !== undefined) updateSet.unitPrice = parsed.data.unitPrice;

    const [updated] = await db.update(purchaseOrderItemsTable)
      .set(updateSet)
      .where(and(eq(purchaseOrderItemsTable.id, itemId), eq(purchaseOrderItemsTable.companyId, companyId)))
      .returning();

    if (!updated) { res.status(404).json({ error: "Item not found" }); return; }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update PO item");
    res.status(500).json({ error: "Failed to update PO item" });
  }
});

// ─── DELETE PO ITEM ────────────────────────────────────────────────────────────

router.delete("/:id/items/:itemId", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const itemId = Number(req.params.itemId);
    await db.delete(purchaseOrderItemsTable)
      .where(and(eq(purchaseOrderItemsTable.id, itemId), eq(purchaseOrderItemsTable.companyId, companyId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete PO item");
    res.status(500).json({ error: "Failed to delete PO item" });
  }
});

// ─── MARK ITEM ARRIVED → INCREMENT STOCK ──────────────────────────────────────

router.put("/:id/items/:itemId/arrive", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const poId = Number(req.params.id);
    const itemId = Number(req.params.itemId);

    const parsed = z.object({
      quantityArrived: z.number().int().min(1),
      locationId: z.string().min(1),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [poItem] = await db.select({
      item: purchaseOrderItemsTable,
      po: purchaseOrdersTable,
    })
      .from(purchaseOrderItemsTable)
      .innerJoin(purchaseOrdersTable, eq(purchaseOrderItemsTable.poId, purchaseOrdersTable.id))
      .where(and(
        eq(purchaseOrderItemsTable.id, itemId),
        eq(purchaseOrderItemsTable.poId, poId),
        eq(purchaseOrderItemsTable.companyId, companyId),
      ));

    if (!poItem) { res.status(404).json({ error: "Item not found" }); return; }

    const totalArrived = poItem.item.quantityArrived + parsed.data.quantityArrived;
    if (totalArrived > poItem.item.quantityOrdered) {
      res.status(400).json({ error: `Cannot arrive more than ordered (${poItem.item.quantityOrdered})` }); return;
    }

    // Verify location exists AND belongs to this company (prevents cross-tenant stock updates)
    const [loc] = await db.select().from(locationsTable).where(
      and(eq(locationsTable.id, parsed.data.locationId), eq(locationsTable.companyId, companyId))
    );
    if (!loc) { res.status(400).json({ error: "Location not found" }); return; }

    // Upsert stock at location
    await db.insert(stockTable).values({
      locationId: parsed.data.locationId,
      productId: poItem.item.productId,
      quantity: parsed.data.quantityArrived,
    }).onConflictDoUpdate({
      target: [stockTable.locationId, stockTable.productId],
      set: { quantity: sql`${stockTable.quantity} + ${parsed.data.quantityArrived}` },
    });

    // Update item quantity arrived
    const [updatedItem] = await db.update(purchaseOrderItemsTable)
      .set({ quantityArrived: totalArrived })
      .where(and(eq(purchaseOrderItemsTable.id, itemId), eq(purchaseOrderItemsTable.companyId, companyId)))
      .returning();

    // Auto-suggest unit cost from PO unit price when product has no cost yet
    let unitCostUpdated = false;
    if (poItem.item.unitPrice != null && poItem.item.unitPrice > 0) {
      const [prod] = await db.select({ id: productsTable.id, unitCost: productsTable.unitCost })
        .from(productsTable)
        .where(and(eq(productsTable.id, poItem.item.productId), eq(productsTable.companyId, companyId)));
      if (prod && (prod.unitCost == null || Number(prod.unitCost) === 0)) {
        await db.update(productsTable)
          .set({ unitCost: poItem.item.unitPrice })
          .where(eq(productsTable.id, prod.id));
        unitCostUpdated = true;
      }
    }

    // Recompute PO status
    const allItems = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.poId, poId));
    const allArrived = allItems.every((i) => i.quantityArrived >= i.quantityOrdered);
    const someArrived = allItems.some((i) => i.quantityArrived > 0);
    const newPoStatus = allArrived ? "arrived" : someArrived ? "partially_arrived" : poItem.po.status;

    await db.update(purchaseOrdersTable)
      .set({ status: newPoStatus })
      .where(eq(purchaseOrdersTable.id, poId));

    // ── Recompute step readiness after stock arrives ──────────────────────────
    // Find templates whose BOM includes the arrived product. Then find any
    // not_started work item steps for those templates that were put in this
    // company's projects — they can now potentially proceed.
    try {
      const arrivedProductId = poItem.item.productId;

      // Products that use the arrived item as a BOM component
      const parentProductIds = (await db.select({ parentProductId: productComponentsTable.parentProductId })
        .from(productComponentsTable)
        .where(eq(productComponentsTable.componentProductId, arrivedProductId)))
        .map((r) => r.parentProductId);

      if (parentProductIds.length > 0) {
        // Templates linked to those parent products
        const { workTemplatesTable } = await import("@workspace/db");
        const templateIds = (await db.select({ id: workTemplatesTable.id })
          .from(workTemplatesTable)
          .where(inArray(workTemplatesTable.productId, parentProductIds)))
          .map((r) => r.id);

        if (templateIds.length > 0) {
          // Work item steps whose templateStepId belongs to those templates' steps
          // and are currently not_started in active projects for this company
          const { workStepsTable } = await import("@workspace/db");
          const templateStepIds = (await db.select({ id: workStepsTable.id })
            .from(workStepsTable)
            .where(inArray(workStepsTable.templateId, templateIds)))
            .map((r) => r.id);

          if (templateStepIds.length > 0) {
            // Find active projects for this company
            const activeProjectIds = (await db.select({ id: workProjectsTable.id })
              .from(workProjectsTable)
              .where(eq(workProjectsTable.companyId, companyId)))
              .map((r) => r.id);

            if (activeProjectIds.length > 0) {
              // Get items in those projects
              const itemIds = (await db.select({ id: workProjectItemsTable.id })
                .from(workProjectItemsTable)
                .where(inArray(workProjectItemsTable.projectId, activeProjectIds)))
                .map((r) => r.id);

              if (itemIds.length > 0) {
                // Mark affected not_started steps as in_progress-eligible by keeping them
                // not_started — step readiness is computed dynamically at query time.
                // Log for monitoring: steps that could now proceed
                const affectedCount = await db.select({ count: sql<number>`count(*)::int` })
                  .from(workItemStepsTable)
                  .where(and(
                    inArray(workItemStepsTable.itemId, itemIds),
                    inArray(workItemStepsTable.templateStepId, templateStepIds),
                    eq(workItemStepsTable.status, "not_started"),
                  ));
                const count = affectedCount[0]?.count ?? 0;
                req.log.info(
                  { arrivedProductId, affectedSteps: count },
                  "PO arrive: stock incremented; affected not_started steps will be re-evaluated on next load"
                );
                // Store for response so caller can inform admin
                (res as { locals: Record<string, unknown> }).locals.affectedStepCount = count;
              }
            }
          }
        }
      }
    } catch (err) {
      req.log.warn({ err }, "Non-fatal: failed to log affected steps after PO arrive");
    }

    const affectedStepCount = (res as { locals?: Record<string, unknown> }).locals?.affectedStepCount;
    res.json({
      item: updatedItem,
      poStatus: newPoStatus,
      affectedStepCount: typeof affectedStepCount === "number" ? affectedStepCount : 0,
      unitCostUpdated,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to mark item as arrived");
    res.status(500).json({ error: "Failed to mark item as arrived" });
  }
});

// ─── RESTOCK REQUESTS ─────────────────────────────────────────────────────────

// POST /purchase-orders/restock-requests — any logged-in worker submits a request
router.post("/restock-requests", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const userId = req.session.userId!;
    const parsed = z.object({
      productId: z.number().int().nullable().optional(),
      productName: z.string().min(1),
      quantity: z.number().int().min(1),
      notes: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [row] = await db.insert(restockRequestsTable).values({
      companyId,
      userId,
      productId: parsed.data.productId ?? null,
      productName: parsed.data.productName,
      quantity: parsed.data.quantity,
      notes: parsed.data.notes ?? null,
      status: "pending",
    }).returning();

    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create restock request");
    res.status(500).json({ error: "Failed to create restock request" });
  }
});

// GET /purchase-orders/restock-requests — admin views all pending, grouped by supplier
router.get("/restock-requests", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const status = (req.query.status as string) ?? "pending";

    const rows = await db
      .select({
        rr: restockRequestsTable,
        username: usersTable.username,
        supplierName: suppliersTable.name,
        supplierId: supplierProductsTable.supplierId,
      })
      .from(restockRequestsTable)
      .leftJoin(usersTable, eq(restockRequestsTable.userId, usersTable.id))
      .leftJoin(supplierProductsTable, and(
        eq(supplierProductsTable.productId, restockRequestsTable.productId!),
        eq(supplierProductsTable.companyId, companyId),
      ))
      .leftJoin(suppliersTable, eq(supplierProductsTable.supplierId, suppliersTable.id))
      .where(and(
        eq(restockRequestsTable.companyId, companyId),
        eq(restockRequestsTable.status, status as "pending" | "approved" | "ordered" | "dismissed"),
      ))
      .orderBy(desc(restockRequestsTable.createdAt));

    // Group by supplier
    const supplierMap = new Map<string, { supplierId: number | null; supplierName: string | null; requests: object[] }>();
    for (const row of rows) {
      const key = row.supplierId != null ? String(row.supplierId) : "none";
      if (!supplierMap.has(key)) {
        supplierMap.set(key, {
          supplierId: row.supplierId ?? null,
          supplierName: row.supplierName ?? null,
          requests: [],
        });
      }
      supplierMap.get(key)!.requests.push({
        ...row.rr,
        username: row.username,
      });
    }

    res.json(Array.from(supplierMap.values()));
  } catch (err) {
    req.log.error({ err }, "Failed to list restock requests");
    res.status(500).json({ error: "Failed to list restock requests" });
  }
});

// PUT /purchase-orders/restock-requests/:id — admin approves/dismisses
router.put("/restock-requests/:id", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const id = parseInt(req.params.id, 10);
    const parsed = z.object({
      status: z.enum(["approved", "ordered", "dismissed"]),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [updated] = await db
      .update(restockRequestsTable)
      .set({ status: parsed.data.status, resolvedAt: new Date() })
      .where(and(eq(restockRequestsTable.id, id), eq(restockRequestsTable.companyId, companyId)))
      .returning();

    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update restock request");
    res.status(500).json({ error: "Failed to update restock request" });
  }
});

export default router;
