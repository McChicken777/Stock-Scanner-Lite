import { Router, type IRouter } from "express";
import { db, leaveRequestsTable, attendanceLogsTable, usersTable } from "@workspace/db";
import { eq, and, desc, asc, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const createLeaveSchema = z.object({
  type: z.enum(["sick", "vacation"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).optional(),
});

function dateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cur = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  while (cur <= end) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cur.getUTCDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

async function insertAttendanceDays(userId: number, companyId: number, type: "sick" | "vacation", dates: string[], note?: string): Promise<void> {
  for (const date of dates) {
    const [existing] = await db.select().from(attendanceLogsTable)
      .where(and(
        eq(attendanceLogsTable.userId, userId),
        eq(attendanceLogsTable.companyId, companyId),
        eq(attendanceLogsTable.date, date),
      ));
    if (existing) {
      // Only overwrite if it's not a real worked day
      if (!(existing.type === "work" && (existing.clockIn || existing.workSeconds > 0))) {
        await db.update(attendanceLogsTable)
          .set({ type, status: "approved", note: note ?? null, clockIn: null, clockOut: null, workSeconds: 0, overtimeSeconds: 0 })
          .where(eq(attendanceLogsTable.id, existing.id));
      }
    } else {
      try {
        await db.insert(attendanceLogsTable).values({ userId, companyId, date, type, status: "approved", note: note ?? null });
      } catch {
        // Ignore unique constraint violations (race condition)
      }
    }
  }
}

router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const companyId = req.session.companyId!;
    const parsed = createLeaveSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const { type, startDate, endDate, note } = parsed.data;

    const todayStr = new Date().toISOString().slice(0, 10);
    if (startDate <= todayStr) {
      res.status(400).json({ error: "startDate must be in the future (tomorrow or later)" });
      return;
    }
    if (endDate < startDate) {
      res.status(400).json({ error: "endDate must be >= startDate" });
      return;
    }

    const status = type === "sick" ? "approved" : "pending";

    const [request] = await db.insert(leaveRequestsTable).values({
      companyId, userId, type, startDate, endDate, status,
      managerNote: null,
    }).returning();

    // Sick days: apply immediately to attendance logs
    if (type === "sick") {
      const dates = dateRange(startDate, endDate);
      await insertAttendanceDays(userId, companyId, "sick", dates, note);
    }

    res.status(201).json(request);
  } catch (err) {
    req.log.error({ err }, "Failed to create leave request");
    res.status(500).json({ error: "Failed to create leave request" });
  }
});

router.get("/mine", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const companyId = req.session.companyId!;
    const rows = await db.select().from(leaveRequestsTable)
      .where(and(eq(leaveRequestsTable.userId, userId), eq(leaveRequestsTable.companyId, companyId)))
      .orderBy(desc(leaveRequestsTable.createdAt));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to get leave requests");
    res.status(500).json({ error: "Failed to get leave requests" });
  }
});

router.get("/all", requireAuth, async (req, res) => {
  try {
    if (req.session.role !== "admin") {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const companyId = req.session.companyId!;

    const statusFilter = req.query.status as string | undefined;
    const userIdFilter = req.query.userId ? Number(req.query.userId) : undefined;

    const conditions = [eq(leaveRequestsTable.companyId, companyId)];
    if (statusFilter && ["pending", "approved", "rejected"].includes(statusFilter)) {
      conditions.push(eq(leaveRequestsTable.status, statusFilter as "pending" | "approved" | "rejected"));
    }
    if (userIdFilter) {
      conditions.push(eq(leaveRequestsTable.userId, userIdFilter));
    }

    const rows = await db.select({
      id: leaveRequestsTable.id,
      userId: leaveRequestsTable.userId,
      type: leaveRequestsTable.type,
      startDate: leaveRequestsTable.startDate,
      endDate: leaveRequestsTable.endDate,
      status: leaveRequestsTable.status,
      managerNote: leaveRequestsTable.managerNote,
      createdAt: leaveRequestsTable.createdAt,
      username: usersTable.username,
    })
      .from(leaveRequestsTable)
      .innerJoin(usersTable, eq(usersTable.id, leaveRequestsTable.userId))
      .where(and(...conditions))
      .orderBy(desc(leaveRequestsTable.createdAt));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to get all leave requests");
    res.status(500).json({ error: "Failed to get all leave requests" });
  }
});

router.get("/users", requireAuth, async (req, res) => {
  try {
    if (req.session.role !== "admin") {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const companyId = req.session.companyId!;
    const rows = await db.select({ id: usersTable.id, username: usersTable.username })
      .from(usersTable)
      .where(eq(usersTable.companyId, companyId))
      .orderBy(asc(usersTable.username));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to get users for leave inbox");
    res.status(500).json({ error: "Failed to get users" });
  }
});

router.get("/pending", requireAuth, async (req, res) => {
  try {
    if (req.session.role !== "admin" && !req.session.isSupervisor) {
      res.status(403).json({ error: "Admin or supervisor only" });
      return;
    }
    const companyId = req.session.companyId!;
    const rows = await db.select({
      id: leaveRequestsTable.id,
      userId: leaveRequestsTable.userId,
      type: leaveRequestsTable.type,
      startDate: leaveRequestsTable.startDate,
      endDate: leaveRequestsTable.endDate,
      status: leaveRequestsTable.status,
      managerNote: leaveRequestsTable.managerNote,
      createdAt: leaveRequestsTable.createdAt,
      username: usersTable.username,
    })
      .from(leaveRequestsTable)
      .innerJoin(usersTable, eq(usersTable.id, leaveRequestsTable.userId))
      .where(and(eq(leaveRequestsTable.companyId, companyId), eq(leaveRequestsTable.status, "pending")))
      .orderBy(leaveRequestsTable.startDate);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to get pending leave requests");
    res.status(500).json({ error: "Failed to get pending leave requests" });
  }
});

const approveSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  managerNote: z.string().max(500).optional(),
});

router.patch("/:id", requireAuth, async (req, res) => {
  try {
    if (req.session.role !== "admin" && !req.session.isSupervisor) {
      res.status(403).json({ error: "Admin or supervisor only" });
      return;
    }
    const companyId = req.session.companyId!;
    const id = Number(req.params.id);
    const parsed = approveSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [request] = await db.select().from(leaveRequestsTable)
      .where(and(eq(leaveRequestsTable.id, id), eq(leaveRequestsTable.companyId, companyId)));
    if (!request) { res.status(404).json({ error: "Not found" }); return; }
    if (request.status !== "pending") {
      res.status(409).json({ error: "Request is already resolved" });
      return;
    }

    const [updated] = await db.update(leaveRequestsTable)
      .set({ status: parsed.data.status, managerNote: parsed.data.managerNote ?? null, updatedAt: new Date() })
      .where(and(eq(leaveRequestsTable.id, id), eq(leaveRequestsTable.companyId, companyId)))
      .returning();

    // On approval, write attendance log entries for each day in the range
    if (parsed.data.status === "approved") {
      const dates = dateRange(request.startDate, request.endDate);
      await insertAttendanceDays(request.userId, companyId, request.type, dates);
    }

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update leave request");
    res.status(500).json({ error: "Failed to update leave request" });
  }
});

// GET /api/leave/worker-notifications — unread decision count for current worker
router.get("/worker-notifications", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const companyId = req.session.companyId!;
    const decided = await db
      .select({ id: leaveRequestsTable.id })
      .from(leaveRequestsTable)
      .where(and(
        eq(leaveRequestsTable.userId, userId),
        eq(leaveRequestsTable.companyId, companyId),
        ne(leaveRequestsTable.status, "pending"),
        isNull(leaveRequestsTable.workerAcknowledgedAt),
      ));
    res.json({ leaveDecisions: decided.length });
  } catch (err) {
    req.log.error({ err }, "Failed to get worker notifications");
    res.status(500).json({ error: "Failed" });
  }
});

// POST /api/leave/worker-notifications/ack — mark all decisions as seen
router.post("/worker-notifications/ack", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const companyId = req.session.companyId!;
    await db
      .update(leaveRequestsTable)
      .set({ workerAcknowledgedAt: new Date() })
      .where(and(
        eq(leaveRequestsTable.userId, userId),
        eq(leaveRequestsTable.companyId, companyId),
        ne(leaveRequestsTable.status, "pending"),
        isNull(leaveRequestsTable.workerAcknowledgedAt),
      ));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to ack worker notifications");
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
