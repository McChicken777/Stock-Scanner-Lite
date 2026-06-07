import { Router, type IRouter } from "express";
import {
  db, stationTypesTable, workstationsTable, workItemStepsTable,
  workProjectItemsTable, workProjectsTable, workTimeLogsTable, usersTable,
  rolesTable, userRolesTable,
} from "@workspace/db";
import { eq, and, asc, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// ─── Station Types ────────────────────────────────────────────────────────────

router.get("/types", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const userId = req.session.userId!;

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

    // Count pending (not_started + in_progress) steps per station type across active projects
    const pendingCounts = typeIds.length
      ? await db
          .select({
            stationTypeId: workItemStepsTable.stationTypeId,
            count: sql<number>`count(*)::int`,
          })
          .from(workItemStepsTable)
          .innerJoin(workProjectItemsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
          .innerJoin(workProjectsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
          .where(
            and(
              inArray(workItemStepsTable.stationTypeId, typeIds),
              inArray(workItemStepsTable.status, ["not_started", "in_progress"]),
              eq(workProjectsTable.status, "in_progress"),
              eq(workProjectsTable.companyId, companyId),
            )
          )
          .groupBy(workItemStepsTable.stationTypeId)
      : [];
    const pendingCountMap = new Map(pendingCounts.map((r) => [r.stationTypeId, r.count]));

    // Role names for display
    const allRoles = await db.select({ id: rolesTable.id, name: rolesTable.name })
      .from(rolesTable).where(eq(rolesTable.companyId, companyId));
    const roleNameMap = new Map(allRoles.map((r) => [r.id, r.name]));

    // Current user's assigned role IDs — used to flag "my stations"
    const myRoleIds = new Set(
      (await db.select({ roleId: userRolesTable.roleId })
        .from(userRolesTable).where(eq(userRolesTable.userId, userId)))
        .map((r) => r.roleId)
    );

    const result = types.map((t) => ({
      ...t,
      workstations: workstations.filter((w) => w.stationTypeId === t.id),
      pendingCount: pendingCountMap.get(t.id) ?? 0,
      roleName: t.roleId ? (roleNameMap.get(t.roleId) ?? null) : null,
      isMyStation: t.roleId != null ? myRoleIds.has(t.roleId) : false,
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
      roleId: z.number().int().nullable().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Name required" }); return; }

    // Append at end of flow
    const existing = await db.select().from(stationTypesTable)
      .where(eq(stationTypesTable.companyId, companyId));
    const [type] = await db.insert(stationTypesTable).values({
      companyId,
      name: parsed.data.name,
      color: parsed.data.color,
      roleId: parsed.data.roleId ?? null,
      flowOrder: existing.length,
    }).returning();
    res.status(201).json({ ...type, workstations: [], roleName: null, isMyStation: false });
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
      roleId: z.number().int().nullable().optional(),
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

    // Get all not_started + in_progress steps for this station type in active projects
    const candidateSteps = await db
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
        startTime: sql<string | null>`(
          SELECT start_time FROM work_time_logs
          WHERE step_id = ${workItemStepsTable.id} AND end_time IS NULL
          ORDER BY start_time DESC LIMIT 1
        )`,
      })
      .from(workItemStepsTable)
      .innerJoin(workProjectItemsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
      .innerJoin(workProjectsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
      .where(
        and(
          eq(workItemStepsTable.stationTypeId, typeId),
          inArray(workItemStepsTable.status, ["not_started", "in_progress"]),
          eq(workProjectsTable.status, "in_progress"),
          eq(workProjectsTable.companyId, companyId),
        )
      )
      .orderBy(
        asc(workProjectsTable.deadline),
        asc(workProjectItemsTable.sortOrder),
        asc(workItemStepsTable.sortOrder),
      );

    // Prerequisite gating: for each item, fetch all step statuses so we can check if
    // prior steps (lower sortOrder) are all completed before showing a not_started step.
    const itemIds = [...new Set(candidateSteps.map((s) => s.itemId))];
    const allItemSteps = itemIds.length
      ? await db
          .select({ id: workItemStepsTable.id, itemId: workItemStepsTable.itemId, sortOrder: workItemStepsTable.sortOrder, status: workItemStepsTable.status })
          .from(workItemStepsTable)
          .where(inArray(workItemStepsTable.itemId, itemIds))
      : [];

    // Build a map: itemId → sorted step statuses
    const itemStepMap = new Map<number, typeof allItemSteps>();
    for (const s of allItemSteps) {
      if (!itemStepMap.has(s.itemId)) itemStepMap.set(s.itemId, []);
      itemStepMap.get(s.itemId)!.push(s);
    }

    // Get open time logs for claimed steps (in_progress) to show who's working
    const stepIds = candidateSteps.map((s) => s.stepId);
    const openLogs = stepIds.length
      ? await db
          .select({ stepId: workTimeLogsTable.stepId, username: usersTable.username })
          .from(workTimeLogsTable)
          .innerJoin(usersTable, eq(workTimeLogsTable.userId, usersTable.id))
          .where(and(inArray(workTimeLogsTable.stepId, stepIds), isNull(workTimeLogsTable.endTime)))
      : [];
    const claimedByMap = new Map(openLogs.map((l) => [l.stepId, l.username]));

    // Filter: keep in_progress always; keep not_started only if all prior steps completed
    const steps = candidateSteps.filter((s) => {
      if (s.status === "in_progress") return true;
      const siblings = itemStepMap.get(s.itemId) ?? [];
      const priorIncomplete = siblings.filter(
        (sib) => sib.sortOrder < s.sortOrder && sib.status !== "completed"
      );
      return priorIncomplete.length === 0;
    }).map((s) => ({ ...s, claimedByUsername: claimedByMap.get(s.stepId) ?? null }));

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
