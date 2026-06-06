import { Router, type IRouter } from "express";
import {
  db, stationTypesTable, workstationsTable, workItemStepsTable,
  workProjectItemsTable, workProjectsTable,
} from "@workspace/db";
import { eq, and, asc, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// ─── Station Types ────────────────────────────────────────────────────────────

router.get("/types", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const types = await db.select().from(stationTypesTable)
      .where(eq(stationTypesTable.companyId, companyId))
      .orderBy(asc(stationTypesTable.flowOrder));

    // Attach workstations to each type
    const typeIds = types.map((t) => t.id);
    const workstations = typeIds.length
      ? await db.select().from(workstationsTable)
          .where(inArray(workstationsTable.stationTypeId, typeIds))
          .orderBy(asc(workstationsTable.priority))
      : [];

    const result = types.map((t) => ({
      ...t,
      workstations: workstations.filter((w) => w.stationTypeId === t.id),
    }));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list station types");
    res.status(500).json({ error: "Failed to list station types" });
  }
});

router.post("/types", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = z.object({
      name: z.string().min(1),
      color: z.string().default("#6366f1"),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Name required" }); return; }

    // Append at end of flow
    const existing = await db.select().from(stationTypesTable)
      .where(eq(stationTypesTable.companyId, companyId));
    const [type] = await db.insert(stationTypesTable).values({
      companyId,
      name: parsed.data.name,
      color: parsed.data.color,
      flowOrder: existing.length,
    }).returning();
    res.status(201).json({ ...type, workstations: [] });
  } catch (err) {
    req.log.error({ err }, "Failed to create station type");
    res.status(500).json({ error: "Failed to create station type" });
  }
});

router.put("/types/reorder", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = z.object({
      order: z.array(z.object({ id: z.number().int(), flowOrder: z.number().int() })),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid order" }); return; }
    for (const { id, flowOrder } of parsed.data.order) {
      await db.update(stationTypesTable).set({ flowOrder })
        .where(and(eq(stationTypesTable.id, id), eq(stationTypesTable.companyId, companyId)));
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reorder station types");
    res.status(500).json({ error: "Failed to reorder" });
  }
});

router.put("/types/:id", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const id = Number(req.params.id);
    const parsed = z.object({
      name: z.string().min(1).optional(),
      color: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid data" }); return; }
    const [type] = await db.update(stationTypesTable).set(parsed.data)
      .where(and(eq(stationTypesTable.id, id), eq(stationTypesTable.companyId, companyId)))
      .returning();
    if (!type) { res.status(404).json({ error: "Not found" }); return; }
    res.json(type);
  } catch (err) {
    req.log.error({ err }, "Failed to update station type");
    res.status(500).json({ error: "Failed to update station type" });
  }
});

router.delete("/types/:id", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const id = Number(req.params.id);
    await db.delete(stationTypesTable)
      .where(and(eq(stationTypesTable.id, id), eq(stationTypesTable.companyId, companyId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete station type");
    res.status(500).json({ error: "Failed to delete station type" });
  }
});

// ─── Workstations ─────────────────────────────────────────────────────────────

router.post("/workstations", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = z.object({
      stationTypeId: z.number().int(),
      name: z.string().min(1),
      priority: z.number().int().min(1).default(1),
      notes: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "name and stationTypeId required" }); return; }

    // Verify station type belongs to company
    const [type] = await db.select().from(stationTypesTable)
      .where(and(eq(stationTypesTable.id, parsed.data.stationTypeId), eq(stationTypesTable.companyId, companyId)));
    if (!type) { res.status(404).json({ error: "Station type not found" }); return; }

    const [ws] = await db.insert(workstationsTable).values({
      companyId,
      stationTypeId: parsed.data.stationTypeId,
      name: parsed.data.name,
      priority: parsed.data.priority,
      notes: parsed.data.notes ?? null,
    }).returning();
    res.status(201).json(ws);
  } catch (err) {
    req.log.error({ err }, "Failed to create workstation");
    res.status(500).json({ error: "Failed to create workstation" });
  }
});

router.put("/workstations/:id", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const id = Number(req.params.id);
    const parsed = z.object({
      name: z.string().min(1).optional(),
      priority: z.number().int().min(1).optional(),
      isActive: z.boolean().optional(),
      notes: z.string().nullable().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid data" }); return; }
    const [ws] = await db.update(workstationsTable).set(parsed.data)
      .where(and(eq(workstationsTable.id, id), eq(workstationsTable.companyId, companyId)))
      .returning();
    if (!ws) { res.status(404).json({ error: "Not found" }); return; }
    res.json(ws);
  } catch (err) {
    req.log.error({ err }, "Failed to update workstation");
    res.status(500).json({ error: "Failed to update workstation" });
  }
});

router.delete("/workstations/:id", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const id = Number(req.params.id);
    await db.delete(workstationsTable)
      .where(and(eq(workstationsTable.id, id), eq(workstationsTable.companyId, companyId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete workstation");
    res.status(500).json({ error: "Failed to delete workstation" });
  }
});

// ─── Station Queue ─────────────────────────────────────────────────────────────
// Returns all not_started steps for a station type, grouped by project → item

router.get("/queue/:typeId", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const typeId = Number(req.params.typeId);

    // Verify type belongs to company
    const [type] = await db.select().from(stationTypesTable)
      .where(and(eq(stationTypesTable.id, typeId), eq(stationTypesTable.companyId, companyId)));
    if (!type) { res.status(404).json({ error: "Station type not found" }); return; }

    // Get workstations for this type
    const workstations = await db.select().from(workstationsTable)
      .where(and(eq(workstationsTable.stationTypeId, typeId), eq(workstationsTable.companyId, companyId)))
      .orderBy(asc(workstationsTable.priority));

    // Get all not_started steps for this station type
    const steps = await db
      .select({
        stepId: workItemStepsTable.id,
        stepName: workItemStepsTable.name,
        sortOrder: workItemStepsTable.sortOrder,
        status: workItemStepsTable.status,
        durationEstimate: workItemStepsTable.durationEstimate,
        batchMode: workItemStepsTable.batchMode,
        workstationId: workItemStepsTable.workstationId,
        itemId: workProjectItemsTable.id,
        itemName: workProjectItemsTable.name,
        projectId: workProjectsTable.id,
        projectName: workProjectsTable.name,
        projectDeadline: workProjectsTable.deadline,
        projectPriority: workProjectsTable.priority,
        projectStatus: workProjectsTable.status,
      })
      .from(workItemStepsTable)
      .innerJoin(workProjectItemsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
      .innerJoin(workProjectsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
      .where(
        and(
          eq(workItemStepsTable.stationTypeId, typeId),
          eq(workItemStepsTable.status, "not_started"),
          eq(workProjectsTable.status, "in_progress"),
          eq(workProjectsTable.companyId, companyId),
        )
      )
      .orderBy(
        asc(workProjectsTable.deadline),
        asc(workProjectItemsTable.sortOrder),
        asc(workItemStepsTable.sortOrder),
      );

    // Group by project → items → steps
    const projectMap = new Map<number, {
      projectId: number; projectName: string; projectDeadline: Date;
      projectPriority: string; items: Map<number, { itemId: number; itemName: string; steps: typeof steps }>;
    }>();

    for (const s of steps) {
      if (!projectMap.has(s.projectId)) {
        projectMap.set(s.projectId, {
          projectId: s.projectId, projectName: s.projectName,
          projectDeadline: s.projectDeadline, projectPriority: s.projectPriority,
          items: new Map(),
        });
      }
      const proj = projectMap.get(s.projectId)!;
      if (!proj.items.has(s.itemId)) {
        proj.items.set(s.itemId, { itemId: s.itemId, itemName: s.itemName, steps: [] });
      }
      proj.items.get(s.itemId)!.steps.push(s);
    }

    const result = Array.from(projectMap.values()).map((p) => ({
      ...p,
      items: Array.from(p.items.values()),
    }));

    res.json({ type, workstations, projects: result });
  } catch (err) {
    req.log.error({ err }, "Failed to get station queue");
    res.status(500).json({ error: "Failed to get station queue" });
  }
});

// Assign a step to a workstation
router.put("/queue/assign/:stepId", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const stepId = Number(req.params.stepId);
    const parsed = z.object({
      workstationId: z.number().int().nullable(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid" }); return; }

    // Verify step belongs to company via project
    const [row] = await db
      .select({ stepId: workItemStepsTable.id })
      .from(workItemStepsTable)
      .innerJoin(workProjectItemsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
      .innerJoin(workProjectsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
      .where(and(eq(workItemStepsTable.id, stepId), eq(workProjectsTable.companyId, companyId)));
    if (!row) { res.status(404).json({ error: "Step not found" }); return; }

    const [step] = await db.update(workItemStepsTable)
      .set({ workstationId: parsed.data.workstationId })
      .where(eq(workItemStepsTable.id, stepId))
      .returning();
    res.json(step);
  } catch (err) {
    req.log.error({ err }, "Failed to assign workstation");
    res.status(500).json({ error: "Failed to assign" });
  }
});

export default router;
