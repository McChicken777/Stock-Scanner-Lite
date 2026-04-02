import { Router, type IRouter } from "express";
import { db, rolesTable, userRolesTable, proceduresTable, itemProceduresTable, tasksTable, workProjectItemsTable, inboundTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

// GET /api/roles
router.get("/roles", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const roles = await db.select().from(rolesTable)
      .where(eq(rolesTable.companyId, companyId))
      .orderBy(rolesTable.name);
    res.json(roles);
  } catch (err) {
    req.log.error({ err }, "Failed to list roles");
    res.status(500).json({ error: "Failed to list roles" });
  }
});

// POST /api/roles
router.post("/roles", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Name required" }); return; }
    const [role] = await db.insert(rolesTable).values({ name: parsed.data.name, companyId }).returning();
    res.status(201).json(role);
  } catch (err) {
    req.log.error({ err }, "Failed to create role");
    res.status(500).json({ error: "Failed to create role" });
  }
});

// GET /api/roles/for-user/:userId
router.get("/roles/for-user/:userId", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const userId = Number(req.params.userId);
    const roles = await db.select().from(rolesTable)
      .where(eq(rolesTable.companyId, companyId))
      .orderBy(rolesTable.name);
    
    const assigned = await db.select({ roleId: userRolesTable.roleId, priority: userRolesTable.priority })
      .from(userRolesTable)
      .where(eq(userRolesTable.userId, userId));
    
    res.json({
      available: roles,
      assigned: assigned,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list roles for user");
    res.status(500).json({ error: "Failed to list roles" });
  }
});

// POST /api/roles/assign
router.post("/roles/assign", requireAdmin, async (req, res) => {
  try {
    const parsed = z.object({
      userId: z.number(),
      roleId: z.number(),
      priority: z.enum(["primary", "secondary", "substitution"]),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    
    // Delete existing if any
    await db.delete(userRolesTable)
      .where(and(eq(userRolesTable.userId, parsed.data.userId), eq(userRolesTable.roleId, parsed.data.roleId)));
    
    // Insert new
    const [assigned] = await db.insert(userRolesTable).values({
      userId: parsed.data.userId,
      roleId: parsed.data.roleId,
      priority: parsed.data.priority,
    }).returning();
    res.status(201).json(assigned);
  } catch (err) {
    req.log.error({ err }, "Failed to assign role");
    res.status(500).json({ error: "Failed to assign role" });
  }
});

// DELETE /api/roles/unassign
router.delete("/roles/unassign", requireAdmin, async (req, res) => {
  try {
    const parsed = z.object({
      userId: z.number(),
      roleId: z.number(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    
    await db.delete(userRolesTable)
      .where(and(eq(userRolesTable.userId, parsed.data.userId), eq(userRolesTable.roleId, parsed.data.roleId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to unassign role");
    res.status(500).json({ error: "Failed to unassign role" });
  }
});

// GET /api/procedures
router.get("/procedures", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const procs = await db.select({
      proc: proceduresTable,
      roleName: rolesTable.name,
    }).from(proceduresTable)
      .innerJoin(rolesTable, eq(proceduresTable.roleId, rolesTable.id))
      .where(eq(proceduresTable.companyId, companyId))
      .orderBy(proceduresTable.orderIndex);
    res.json(procs.map((p) => ({ ...p.proc, roleName: p.roleName })));
  } catch (err) {
    req.log.error({ err }, "Failed to list procedures");
    res.status(500).json({ error: "Failed to list procedures" });
  }
});

// POST /api/procedures
router.post("/procedures", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = z.object({
      name: z.string().min(1),
      roleId: z.number().int(),
      orderIndex: z.number().int().optional(),
      requiresInbound: z.boolean().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const [proc] = await db.insert(proceduresTable).values({
      ...parsed.data, companyId, orderIndex: parsed.data.orderIndex ?? 0,
    }).returning();
    res.status(201).json(proc);
  } catch (err) {
    req.log.error({ err }, "Failed to create procedure");
    res.status(500).json({ error: "Failed to create procedure" });
  }
});

// PUT /api/procedures/:id
router.put("/procedures/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;
    const parsed = z.object({
      name: z.string().min(1).optional(),
      roleId: z.number().int().optional(),
      orderIndex: z.number().int().optional(),
      requiresInbound: z.boolean().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const [proc] = await db.update(proceduresTable).set(parsed.data)
      .where(and(eq(proceduresTable.id, id), eq(proceduresTable.companyId, companyId))).returning();
    if (!proc) { res.status(404).json({ error: "Not found" }); return; }
    res.json(proc);
  } catch (err) {
    req.log.error({ err }, "Failed to update procedure");
    res.status(500).json({ error: "Failed to update procedure" });
  }
});

// DELETE /api/procedures/:id
router.delete("/procedures/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;
    await db.delete(proceduresTable)
      .where(and(eq(proceduresTable.id, id), eq(proceduresTable.companyId, companyId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete procedure");
    res.status(500).json({ error: "Failed to delete procedure" });
  }
});

// GET /api/tasks
router.get("/tasks", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const userId = req.session.userId!;
    
    // Get user's roles with priority
    const userRoles = await db.select({ roleId: userRolesTable.roleId, priority: userRolesTable.priority })
      .from(userRolesTable)
      .where(eq(userRolesTable.userId, userId));
    const roleIds = userRoles.map((r) => r.roleId);
    
    if (roleIds.length === 0) {
      res.json([]);
      return;
    }

    // Create priority map
    const priorityMap = new Map<number, number>();
    const priorityOrder = { primary: 0, secondary: 1, substitution: 2 };
    userRoles.forEach((ur) => {
      priorityMap.set(ur.roleId, priorityOrder[ur.priority as keyof typeof priorityOrder]);
    });

    // Get tasks for user's roles
    const tasks = await db.select({
      task: tasksTable,
      procedureName: proceduresTable.name,
      itemName: workProjectItemsTable.name,
      roleName: rolesTable.name,
      roleId: rolesTable.id,
    }).from(tasksTable)
      .innerJoin(proceduresTable, eq(tasksTable.procedureId, proceduresTable.id))
      .innerJoin(workProjectItemsTable, eq(tasksTable.itemId, workProjectItemsTable.id))
      .innerJoin(rolesTable, eq(proceduresTable.roleId, rolesTable.id))
      .where(and(
        eq(tasksTable.companyId, companyId),
        inArray(proceduresTable.roleId, roleIds),
      ));

    // Sort by role priority then status (not_started/in_progress first) then createdAt
    const sorted = tasks.sort((a, b) => {
      const aPriority = priorityMap.get(a.roleId) ?? 999;
      const bPriority = priorityMap.get(b.roleId) ?? 999;
      if (aPriority !== bPriority) return aPriority - bPriority;
      
      const statusOrder = { not_started: 0, in_progress: 1, completed: 2 };
      const aStatusOrder = statusOrder[a.task.status as keyof typeof statusOrder];
      const bStatusOrder = statusOrder[b.task.status as keyof typeof statusOrder];
      if (aStatusOrder !== bStatusOrder) return aStatusOrder - bStatusOrder;
      
      return new Date(a.task.createdAt).getTime() - new Date(b.task.createdAt).getTime();
    });

    res.json(sorted.map((t) => ({
      ...t.task,
      procedureName: t.procedureName,
      itemName: t.itemName,
      roleName: t.roleName,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list tasks");
    res.status(500).json({ error: "Failed to list tasks" });
  }
});

// PUT /api/tasks/:id/start
router.put("/tasks/:id/start", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;

    // Get task with procedure info
    const [task] = await db.select().from(tasksTable)
      .where(and(eq(tasksTable.id, id), eq(tasksTable.companyId, companyId)));
    if (!task) { res.status(404).json({ error: "Not found" }); return; }

    // Get procedure with inbound check
    const [proc] = await db.select().from(proceduresTable)
      .where(eq(proceduresTable.id, task.procedureId));
    if (!proc) { res.status(404).json({ error: "Procedure not found" }); return; }

    // Check inbound if required
    if (proc.requiresInbound) {
      const [inbound] = await db.select().from(inboundTable)
        .where(and(eq(inboundTable.projectId, task.projectId), eq(inboundTable.companyId, companyId)));
      if (inbound && inbound.status === "expected") {
        res.status(403).json({ error: "Cannot start: waiting for inbound parts" });
        return;
      }
    }

    // Check if previous procedures are completed
    const [item] = await db.select().from(workProjectItemsTable)
      .where(eq(workProjectItemsTable.id, task.itemId));
    if (item) {
      const itemProcs = await db.select().from(itemProceduresTable)
        .where(eq(itemProceduresTable.itemId, task.itemId))
        .orderBy(itemProceduresTable.orderIndex);
      
      const currentProcOrder = itemProcs.find((ip) => ip.procedureId === task.procedureId)?.orderIndex ?? 999;
      const previousProcs = itemProcs.filter((ip) => ip.orderIndex < currentProcOrder);
      
      if (previousProcs.length > 0) {
        const previousTasks = await db.select().from(tasksTable)
          .where(and(
            eq(tasksTable.itemId, task.itemId),
            inArray(tasksTable.procedureId, previousProcs.map((p) => p.procedureId)),
          ));
        const allPreviousDone = previousTasks.every((t) => t.status === "completed");
        if (!allPreviousDone) {
          res.status(403).json({ error: "Cannot start: previous procedures not completed" });
          return;
        }
      }
    }

    const [updated] = await db.update(tasksTable).set({ status: "in_progress" })
      .where(eq(tasksTable.id, id)).returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to start task");
    res.status(500).json({ error: "Failed to start task" });
  }
});

// PUT /api/tasks/:id/complete
router.put("/tasks/:id/complete", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;
    const [updated] = await db.update(tasksTable).set({ status: "completed" })
      .where(and(eq(tasksTable.id, id), eq(tasksTable.companyId, companyId))).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to complete task");
    res.status(500).json({ error: "Failed to complete task" });
  }
});

export default router;
