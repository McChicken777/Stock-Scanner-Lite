import { Router, type IRouter } from "express";
import { db, workTemplatesTable, workTemplateProceduresTable, workProjectsTable, workProjectItemsTable, workItemProceduresTable, workTimeLogsTable } from "@workspace/db";
import { eq, and, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

// ─── TEMPLATES ────────────────────────────────────────────────────────────────

router.get("/templates", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const templates = await db.select().from(workTemplatesTable)
      .where(eq(workTemplatesTable.companyId, companyId))
      .orderBy(workTemplatesTable.name);
    const procedures = await db.select().from(workTemplateProceduresTable)
      .orderBy(workTemplateProceduresTable.sortOrder);
    const result = templates.map((t) => ({
      ...t,
      procedures: procedures.filter((p) => p.templateId === t.id),
    }));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list templates");
    res.status(500).json({ error: "Failed to list templates" });
  }
});

router.post("/templates", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Name required" }); return; }
    const [t] = await db.insert(workTemplatesTable).values({ name: parsed.data.name, companyId }).returning();
    res.status(201).json({ ...t, procedures: [] });
  } catch (err) {
    req.log.error({ err }, "Failed to create template");
    res.status(500).json({ error: "Failed to create template" });
  }
});

router.put("/templates/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;
    const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Name required" }); return; }
    const [t] = await db.update(workTemplatesTable).set({ name: parsed.data.name })
      .where(and(eq(workTemplatesTable.id, id), eq(workTemplatesTable.companyId, companyId))).returning();
    if (!t) { res.status(404).json({ error: "Not found" }); return; }
    res.json(t);
  } catch (err) {
    req.log.error({ err }, "Failed to update template");
    res.status(500).json({ error: "Failed to update template" });
  }
});

router.delete("/templates/:id", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    await db.delete(workTemplatesTable)
      .where(and(eq(workTemplatesTable.id, Number(req.params.id)), eq(workTemplatesTable.companyId, companyId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete template");
    res.status(500).json({ error: "Failed to delete template" });
  }
});

router.post("/templates/:id/procedures", requireAdmin, async (req, res) => {
  try {
    const templateId = Number(req.params.id);
    const parsed = z.object({ name: z.string().min(1), sortOrder: z.number().int().optional() }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Name required" }); return; }
    const [p] = await db.insert(workTemplateProceduresTable).values({
      templateId, name: parsed.data.name, sortOrder: parsed.data.sortOrder ?? 0,
    }).returning();
    res.status(201).json(p);
  } catch (err) {
    req.log.error({ err }, "Failed to add procedure");
    res.status(500).json({ error: "Failed to add procedure" });
  }
});

router.delete("/templates/:templateId/procedures/:procId", requireAdmin, async (req, res) => {
  try {
    await db.delete(workTemplateProceduresTable).where(eq(workTemplateProceduresTable.id, Number(req.params.procId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete procedure");
    res.status(500).json({ error: "Failed to delete procedure" });
  }
});

// ─── PROJECTS ─────────────────────────────────────────────────────────────────

async function getProjectWithItems(projectId: number) {
  const [project] = await db.select().from(workProjectsTable).where(eq(workProjectsTable.id, projectId));
  if (!project) return null;

  const items = await db.select().from(workProjectItemsTable)
    .where(eq(workProjectItemsTable.projectId, projectId))
    .orderBy(workProjectItemsTable.sortOrder);
  const itemIds = items.map((i) => i.id);

  let procedures: (typeof workItemProceduresTable.$inferSelect)[] = [];
  if (itemIds.length > 0) {
    procedures = await db.select().from(workItemProceduresTable).where(
      sql`${workItemProceduresTable.itemId} = ANY(${sql.raw(`ARRAY[${itemIds.join(",")}]::int[]`)})`,
    ).orderBy(workItemProceduresTable.sortOrder);
  }

  const itemsWithProcs = items.map((item) => {
    const procs = procedures.filter((p) => p.itemId === item.id);
    const completed = procs.filter((p) => p.status === "completed").length;
    return {
      ...item,
      procedures: procs,
      progress: procs.length > 0 ? Math.round((completed / procs.length) * 100) : 0,
    };
  });

  const totalProcs = procedures.length;
  const completedProcs = procedures.filter((p) => p.status === "completed").length;

  return {
    ...project,
    items: itemsWithProcs,
    totalProcedures: totalProcs,
    completedProcedures: completedProcs,
    progress: totalProcs > 0 ? Math.round((completedProcs / totalProcs) * 100) : 0,
  };
}

// templateItems: [{templateId, quantity}]
const createProjectSchema = z.object({
  name: z.string().min(1),
  deadline: z.string(),
  priority: z.enum(["low", "medium", "high"]),
  paintColor: z.string().nullable().optional(),
  templateItems: z.array(z.object({
    templateId: z.number().int(),
    quantity: z.number().int().min(1).max(100),
  })),
});

router.get("/projects", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const projects = await db.select().from(workProjectsTable)
      .where(eq(workProjectsTable.companyId, companyId))
      .orderBy(workProjectsTable.deadline);
    const projectsWithProgress = await Promise.all(
      projects.map(async (project) => {
        const items = await db.select().from(workProjectItemsTable).where(eq(workProjectItemsTable.projectId, project.id));
        const itemIds = items.map((i) => i.id);
        let totalProcedures = 0;
        let completedProcedures = 0;
        if (itemIds.length > 0) {
          const procs = await db.select().from(workItemProceduresTable).where(
            sql`${workItemProceduresTable.itemId} = ANY(${sql.raw(`ARRAY[${itemIds.join(",")}]::int[]`)})`,
          );
          totalProcedures = procs.length;
          completedProcedures = procs.filter((p) => p.status === "completed").length;
        }
        return {
          ...project,
          itemCount: items.length,
          totalProcedures,
          completedProcedures,
          progress: totalProcedures > 0 ? Math.round((completedProcedures / totalProcedures) * 100) : 0,
        };
      }),
    );
    res.json(projectsWithProgress);
  } catch (err) {
    req.log.error({ err }, "Failed to list projects");
    res.status(500).json({ error: "Failed to list projects" });
  }
});

router.post("/projects", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const { name, deadline, priority, paintColor, templateItems } = parsed.data;

    const [project] = await db.insert(workProjectsTable).values({
      name, deadline: new Date(deadline), priority, paintColor: paintColor ?? null, companyId,
    }).returning();

    let sortOrder = 0;
    for (const { templateId, quantity } of templateItems) {
      const [template] = await db.select().from(workTemplatesTable).where(eq(workTemplatesTable.id, templateId));
      if (!template) continue;

      const templateProcs = await db.select().from(workTemplateProceduresTable)
        .where(eq(workTemplateProceduresTable.templateId, templateId))
        .orderBy(workTemplateProceduresTable.sortOrder);

      for (let i = 1; i <= quantity; i++) {
        const itemName = quantity > 1 ? `${template.name} #${i}` : template.name;
        const [item] = await db.insert(workProjectItemsTable).values({
          projectId: project.id, name: itemName, sortOrder,
        }).returning();
        sortOrder++;

        for (const proc of templateProcs) {
          await db.insert(workItemProceduresTable).values({
            itemId: item.id, name: proc.name, sortOrder: proc.sortOrder,
          });
        }
      }
    }

    const full = await getProjectWithItems(project.id);
    res.status(201).json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to create project");
    res.status(500).json({ error: "Failed to create project" });
  }
});

router.get("/projects/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;
    const full = await getProjectWithItems(id);
    if (!full || full.companyId !== companyId) { res.status(404).json({ error: "Not found" }); return; }
    res.json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to get project");
    res.status(500).json({ error: "Failed to get project" });
  }
});

router.put("/projects/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;
    const parsed = z.object({
      name: z.string().min(1).optional(),
      deadline: z.string().optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      status: z.enum(["in_progress", "completed"]).optional(),
      paintColor: z.string().nullable().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.deadline) updates.deadline = new Date(parsed.data.deadline);
    const [project] = await db.update(workProjectsTable).set(updates as never)
      .where(and(eq(workProjectsTable.id, id), eq(workProjectsTable.companyId, companyId))).returning();
    if (!project) { res.status(404).json({ error: "Not found" }); return; }
    res.json(project);
  } catch (err) {
    req.log.error({ err }, "Failed to update project");
    res.status(500).json({ error: "Failed to update project" });
  }
});

router.delete("/projects/:id", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    await db.delete(workProjectsTable)
      .where(and(eq(workProjectsTable.id, Number(req.params.id)), eq(workProjectsTable.companyId, companyId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete project");
    res.status(500).json({ error: "Failed to delete project" });
  }
});

// ─── PROJECT ITEMS (add/remove/update after creation) ─────────────────────────

router.post("/projects/:id/items", requireAdmin, async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    const companyId = req.session.companyId!;
    const [project] = await db.select().from(workProjectsTable)
      .where(and(eq(workProjectsTable.id, projectId), eq(workProjectsTable.companyId, companyId)));
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }

    const parsed = z.object({
      templateId: z.number().int(),
      quantity: z.number().int().min(1).max(100),
      paintColor: z.string().nullable().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const { templateId, quantity, paintColor } = parsed.data;
    const [template] = await db.select().from(workTemplatesTable).where(eq(workTemplatesTable.id, templateId));
    if (!template) { res.status(404).json({ error: "Template not found" }); return; }

    const templateProcs = await db.select().from(workTemplateProceduresTable)
      .where(eq(workTemplateProceduresTable.templateId, templateId))
      .orderBy(workTemplateProceduresTable.sortOrder);

    // Get current max sort order
    const existingItems = await db.select().from(workProjectItemsTable).where(eq(workProjectItemsTable.projectId, projectId));
    let sortOrder = existingItems.length;

    const newItems = [];
    for (let i = 1; i <= quantity; i++) {
      const itemName = quantity > 1 ? `${template.name} #${i}` : template.name;
      const [item] = await db.insert(workProjectItemsTable).values({
        projectId, name: itemName, paintColor: paintColor ?? null, sortOrder,
      }).returning();
      sortOrder++;

      for (const proc of templateProcs) {
        await db.insert(workItemProceduresTable).values({
          itemId: item.id, name: proc.name, sortOrder: proc.sortOrder,
        });
      }
      newItems.push(item);
    }

    res.status(201).json(newItems);
  } catch (err) {
    req.log.error({ err }, "Failed to add items");
    res.status(500).json({ error: "Failed to add items" });
  }
});

router.put("/project-items/:itemId", requireAdmin, async (req, res) => {
  try {
    const itemId = Number(req.params.itemId);
    const parsed = z.object({
      name: z.string().min(1).optional(),
      paintColor: z.string().nullable().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const [item] = await db.update(workProjectItemsTable).set(parsed.data)
      .where(eq(workProjectItemsTable.id, itemId)).returning();
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }
    res.json(item);
  } catch (err) {
    req.log.error({ err }, "Failed to update item");
    res.status(500).json({ error: "Failed to update item" });
  }
});

router.delete("/project-items/:itemId", requireAdmin, async (req, res) => {
  try {
    await db.delete(workProjectItemsTable).where(eq(workProjectItemsTable.id, Number(req.params.itemId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete item");
    res.status(500).json({ error: "Failed to delete item" });
  }
});

// ─── TIMER ────────────────────────────────────────────────────────────────────

router.get("/active-timer", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const [active] = await db.select().from(workTimeLogsTable).where(
      and(eq(workTimeLogsTable.userId, userId), isNull(workTimeLogsTable.endTime))
    );
    if (!active) { res.json(null); return; }
    const [procedure] = await db.select().from(workItemProceduresTable).where(eq(workItemProceduresTable.id, active.procedureId));
    res.json({ log: active, procedure });
  } catch (err) {
    req.log.error({ err }, "Failed to get active timer");
    res.status(500).json({ error: "Failed to get active timer" });
  }
});

router.post("/procedures/:procedureId/start", requireAuth, async (req, res) => {
  try {
    const procedureId = Number(req.params.procedureId);
    const userId = req.session.userId!;

    const [existing] = await db.select().from(workTimeLogsTable).where(
      and(eq(workTimeLogsTable.userId, userId), isNull(workTimeLogsTable.endTime))
    );
    if (existing) {
      res.status(409).json({ error: "You already have a running task. Stop it first." });
      return;
    }

    const [procedure] = await db.select().from(workItemProceduresTable).where(eq(workItemProceduresTable.id, procedureId));
    if (!procedure) { res.status(404).json({ error: "Procedure not found" }); return; }

    await db.update(workItemProceduresTable).set({ status: "in_progress" }).where(eq(workItemProceduresTable.id, procedureId));
    const [log] = await db.insert(workTimeLogsTable).values({ procedureId, userId, startTime: new Date() }).returning();
    res.status(201).json(log);
  } catch (err) {
    req.log.error({ err }, "Failed to start timer");
    res.status(500).json({ error: "Failed to start timer" });
  }
});

router.post("/procedures/:procedureId/stop", requireAuth, async (req, res) => {
  try {
    const procedureId = Number(req.params.procedureId);
    const userId = req.session.userId!;

    const [activeLog] = await db.select().from(workTimeLogsTable).where(
      and(eq(workTimeLogsTable.userId, userId), eq(workTimeLogsTable.procedureId, procedureId), isNull(workTimeLogsTable.endTime))
    );
    if (!activeLog) { res.status(404).json({ error: "No active timer for this procedure" }); return; }

    const endTime = new Date();
    const durationSeconds = Math.round((endTime.getTime() - activeLog.startTime.getTime()) / 1000);
    const [log] = await db.update(workTimeLogsTable).set({ endTime, durationSeconds })
      .where(eq(workTimeLogsTable.id, activeLog.id)).returning();

    const [proc] = await db.update(workItemProceduresTable)
      .set({ status: "completed", totalTimeSeconds: sql`${workItemProceduresTable.totalTimeSeconds} + ${durationSeconds}` })
      .where(eq(workItemProceduresTable.id, procedureId)).returning();

    res.json({ log, procedure: proc });
  } catch (err) {
    req.log.error({ err }, "Failed to stop timer");
    res.status(500).json({ error: "Failed to stop timer" });
  }
});

router.post("/procedures/:procedureId/reset", requireAdmin, async (req, res) => {
  try {
    const procedureId = Number(req.params.procedureId);
    const [proc] = await db.update(workItemProceduresTable)
      .set({ status: "not_started", totalTimeSeconds: 0 })
      .where(eq(workItemProceduresTable.id, procedureId)).returning();
    res.json(proc);
  } catch (err) {
    req.log.error({ err }, "Failed to reset procedure");
    res.status(500).json({ error: "Failed to reset procedure" });
  }
});

export default router;
