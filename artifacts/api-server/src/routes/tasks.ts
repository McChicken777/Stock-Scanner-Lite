import { Router, type IRouter } from "express";
import { db, rolesTable, userRolesTable, proceduresTable, itemProceduresTable, tasksTable, workProjectItemsTable, inboundTable, procedureInputsTable, productsTable, stockTable, workProjectsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

// Helper: check if item type is a purchased/stocked item
function isPurchasedType(itemType: string | null) {
  return itemType === "purchase" || itemType === "purchased_part";
}

// Helper: check if item type is a manufactured/production item
function isManufacturedType(itemType: string | null) {
  return itemType === "production" || itemType === "manufactured_part";
}

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
      requiresComponents: z.boolean().optional(),
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
      requiresComponents: z.boolean().optional(),
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

// GET /api/procedures/:procId/inputs
router.get("/procedures/:procId/inputs", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const procId = Number(req.params.procId);
    
    const inputs = await db.select({
      input: procedureInputsTable,
      productName: productsTable.name,
      itemType: productsTable.itemType,
    }).from(procedureInputsTable)
      .innerJoin(productsTable, eq(procedureInputsTable.itemId, productsTable.id))
      .where(and(
        eq(procedureInputsTable.procedureId, procId),
        eq(procedureInputsTable.companyId, companyId),
      ));
    
    res.json(inputs.map((i) => ({
      ...i.input,
      productName: i.productName,
      itemType: i.itemType,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list procedure inputs");
    res.status(500).json({ error: "Failed to list inputs" });
  }
});

// POST /api/procedures/:procId/inputs
router.post("/procedures/:procId/inputs", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const procId = Number(req.params.procId);
    const parsed = z.object({
      itemId: z.number(),
      quantityRequired: z.number().int().min(1),
    }).safeParse(req.body);
    
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    
    const [input] = await db.insert(procedureInputsTable).values({
      procedureId: procId,
      itemId: parsed.data.itemId,
      quantityRequired: parsed.data.quantityRequired,
      companyId,
    }).returning();
    
    res.status(201).json(input);
  } catch (err) {
    req.log.error({ err }, "Failed to create procedure input");
    res.status(500).json({ error: "Failed to create input" });
  }
});

// DELETE /api/procedures/inputs/:inputId
router.delete("/procedures/inputs/:inputId", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const inputId = Number(req.params.inputId);
    
    await db.delete(procedureInputsTable)
      .where(and(
        eq(procedureInputsTable.id, inputId),
        eq(procedureInputsTable.companyId, companyId),
      ));
    
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete procedure input");
    res.status(500).json({ error: "Failed to delete input" });
  }
});

// Shared helper: compute blocked reason for a task
async function computeBlockedReason(
  task: { id: number; status: string; itemId: number; procedureId: number; projectId: number },
  companyId: number,
  proc: { requiresComponents: boolean },
): Promise<string> {
  if (task.status !== "not_started") return "";

  // Check previous procedures in item order
  const itemProcs = await db.select().from(itemProceduresTable)
    .where(eq(itemProceduresTable.itemId, task.itemId))
    .orderBy(itemProceduresTable.orderIndex);
  
  const currentOrder = itemProcs.find((ip) => ip.procedureId === task.procedureId)?.orderIndex ?? 999;
  const previousProcs = itemProcs.filter((ip) => ip.orderIndex < currentOrder);
  
  if (previousProcs.length > 0) {
    const prevTasks = await db.select().from(tasksTable)
      .where(and(
        eq(tasksTable.itemId, task.itemId),
        inArray(tasksTable.procedureId, previousProcs.map((p) => p.procedureId)),
      ));
    
    const incompleteProc = prevTasks.find((pt) => pt.status !== "completed");
    if (incompleteProc) {
      return "Waiting for previous procedures";
    }
  }

  // Check required components (only if procedure.requiresComponents = true)
  if (proc.requiresComponents) {
    const inputs = await db.select({
      input: procedureInputsTable,
      product: productsTable,
    }).from(procedureInputsTable)
      .innerJoin(productsTable, eq(procedureInputsTable.itemId, productsTable.id))
      .where(and(
        eq(procedureInputsTable.procedureId, task.procedureId),
        eq(procedureInputsTable.companyId, companyId),
      ));
    
    for (const inp of inputs) {
      if (isPurchasedType(inp.product.itemType)) {
        // Check stock for purchased parts
        const [stock] = await db.select().from(stockTable)
          .where(eq(stockTable.productId, inp.input.itemId));
        
        if (!stock || stock.quantity < inp.input.quantityRequired) {
          return `Missing stock: ${inp.product.name} (need ${inp.input.quantityRequired}, have ${stock?.quantity ?? 0})`;
        }
      } else if (isManufacturedType(inp.product.itemType)) {
        // Check if related task is completed
        const relatedTask = await db.select().from(tasksTable)
          .where(and(
            eq(tasksTable.procedureId, inp.input.itemId),
            eq(tasksTable.projectId, task.projectId),
          ));
        
        if (relatedTask.length === 0 || relatedTask[0].status !== "completed") {
          return `Waiting for: ${inp.product.name}`;
        }
      }
    }
  }

  return "";
}

// GET /api/tasks
router.get("/tasks", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const userId = req.session.userId!;
    const isAdmin = req.session.role === "admin" || req.session.role === "owner";
    
    // Get user's roles with priority
    const userRoles = await db.select({ roleId: userRolesTable.roleId, priority: userRolesTable.priority })
      .from(userRolesTable)
      .where(eq(userRolesTable.userId, userId));
    const roleIds = userRoles.map((r) => r.roleId);
    
    // If not admin and has no roles, return empty
    if (!isAdmin && roleIds.length === 0) {
      res.json([]);
      return;
    }

    // Create priority map
    const priorityMap = new Map<number, number>();
    const priorityOrder = { primary: 0, secondary: 1, substitution: 2 };
    userRoles.forEach((ur) => {
      priorityMap.set(ur.roleId, priorityOrder[ur.priority as keyof typeof priorityOrder]);
    });

    // Get tasks for user's roles (or all tasks if admin)
    const tasks = await db.select({
      task: tasksTable,
      procedureName: proceduresTable.name,
      requiresComponents: proceduresTable.requiresComponents,
      itemName: workProjectItemsTable.name,
      roleName: rolesTable.name,
      roleId: rolesTable.id,
      projectDeadline: workProjectsTable.deadline,
      projectPriority: workProjectsTable.priority,
    }).from(tasksTable)
      .innerJoin(proceduresTable, eq(tasksTable.procedureId, proceduresTable.id))
      .innerJoin(workProjectItemsTable, eq(tasksTable.itemId, workProjectItemsTable.id))
      .innerJoin(rolesTable, eq(proceduresTable.roleId, rolesTable.id))
      .innerJoin(workProjectsTable, eq(tasksTable.projectId, workProjectsTable.id))
      .where(
        isAdmin
          ? eq(tasksTable.companyId, companyId)
          : and(
              eq(tasksTable.companyId, companyId),
              inArray(proceduresTable.roleId, roleIds),
            )
      );

    // Compute READY/BLOCKED status for each task
    const tasksWithStatus = await Promise.all(tasks.map(async (t) => {
      const blockedReason = await computeBlockedReason(
        { ...t.task },
        companyId,
        { requiresComponents: t.requiresComponents },
      );
      
      return {
        ...t,
        readyStatus: blockedReason ? "BLOCKED" : "READY",
        blockedReason,
      };
    }));

    // Add deadline and priority to tasks, compute overdue
    const now = new Date();
    const tasksWithDeadline = tasksWithStatus.map((t) => ({
      ...t,
      deadline: t.projectDeadline,
      priority: t.projectPriority,
      isOverdue: new Date(t.projectDeadline) < now,
    }));

    // Sort: READY first, BLOCKED below. Within each: by priority (urgent→high→normal→low), then by deadline
    const taskPriorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    const sorted = tasksWithDeadline.sort((a, b) => {
      const readyOrder = { READY: 0, BLOCKED: 1 };
      const aReadyOrder = readyOrder[a.readyStatus as keyof typeof readyOrder];
      const bReadyOrder = readyOrder[b.readyStatus as keyof typeof readyOrder];
      if (aReadyOrder !== bReadyOrder) return aReadyOrder - bReadyOrder;
      
      const aPriorityOrder = taskPriorityOrder[a.priority as keyof typeof taskPriorityOrder] ?? 999;
      const bPriorityOrder = taskPriorityOrder[b.priority as keyof typeof taskPriorityOrder] ?? 999;
      if (aPriorityOrder !== bPriorityOrder) return aPriorityOrder - bPriorityOrder;
      
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });

    res.json(sorted.map((t) => ({
      ...t.task,
      procedureName: t.procedureName,
      requiresComponents: t.requiresComponents,
      itemName: t.itemName,
      roleName: t.roleName,
      readyStatus: t.readyStatus,
      blockedReason: t.blockedReason,
      deadline: t.deadline,
      priority: t.priority,
      isOverdue: t.isOverdue,
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

    const [task] = await db.select().from(tasksTable)
      .where(and(eq(tasksTable.id, id), eq(tasksTable.companyId, companyId)));
    if (!task) { res.status(404).json({ error: "Not found" }); return; }
    
    // Get procedure (for requiresComponents and requiresInbound)
    const [proc] = await db.select().from(proceduresTable)
      .where(eq(proceduresTable.id, task.procedureId));
    if (!proc) { res.status(404).json({ error: "Procedure not found" }); return; }

    // Compute blocked reason
    const blockedReason = await computeBlockedReason(
      { ...task },
      companyId,
      { requiresComponents: proc.requiresComponents },
    );
    
    if (blockedReason) {
      res.status(403).json({ error: `Cannot start: ${blockedReason}` });
      return;
    }

    // Check inbound if required
    if (proc.requiresInbound) {
      const [inbound] = await db.select().from(inboundTable)
        .where(and(eq(inboundTable.projectId, task.projectId), eq(inboundTable.companyId, companyId)));
      if (inbound && inbound.status === "expected") {
        res.status(403).json({ error: "Cannot start: waiting for inbound parts" });
        return;
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
