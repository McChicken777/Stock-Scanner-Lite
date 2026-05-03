import { Router, type IRouter } from "express";
import { db, attendanceLogsTable, companiesTable, usersTable } from "@workspace/db";
import { eq, and, gte, lte, asc, isNull, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function getCompanyThresholdSeconds(companyId: number): Promise<number> {
  const [c] = await db.select({ wh: companiesTable.workHoursPerDay }).from(companiesTable).where(eq(companiesTable.id, companyId));
  return (c?.wh ?? 480) * 60;
}

router.get("/today", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const companyId = req.session.companyId!;
    const today = todayStr();
    const [log] = await db.select().from(attendanceLogsTable)
      .where(and(
        eq(attendanceLogsTable.userId, userId),
        eq(attendanceLogsTable.companyId, companyId),
        eq(attendanceLogsTable.date, today),
      ));
    res.json(log ?? null);
  } catch (err) {
    req.log.error({ err }, "Failed to get today's attendance");
    res.status(500).json({ error: "Failed to get today's attendance" });
  }
});

router.post("/clock-in", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const companyId = req.session.companyId!;
    const today = todayStr();

    // Block if there's any open shift on any date (e.g. forgot to clock out yesterday)
    const [openShift] = await db.select().from(attendanceLogsTable)
      .where(and(
        eq(attendanceLogsTable.userId, userId),
        eq(attendanceLogsTable.companyId, companyId),
        eq(attendanceLogsTable.type, "work"),
        isNull(attendanceLogsTable.clockOut),
      ))
      .orderBy(desc(attendanceLogsTable.date))
      .limit(1);
    // openShift with clockIn means an active session
    if (openShift && openShift.clockIn) {
      if (openShift.date === today) {
        res.status(409).json({ error: "Already clocked in" });
        return;
      }
      res.status(409).json({ error: `You have an open shift from ${openShift.date}. Clock out first.` });
      return;
    }

    const [existing] = await db.select().from(attendanceLogsTable)
      .where(and(
        eq(attendanceLogsTable.userId, userId),
        eq(attendanceLogsTable.companyId, companyId),
        eq(attendanceLogsTable.date, today),
      ));

    if (existing) {
      if (existing.type !== "work") {
        res.status(409).json({ error: `You already declared ${existing.type} today` });
        return;
      }
      // Resume: clear clockOut, keep workSeconds accumulated
      const [updated] = await db.update(attendanceLogsTable)
        .set({ clockIn: new Date(), clockOut: null })
        .where(and(eq(attendanceLogsTable.id, existing.id), eq(attendanceLogsTable.companyId, companyId)))
        .returning();
      res.json(updated);
      return;
    }

    try {
      const [created] = await db.insert(attendanceLogsTable).values({
        userId, companyId, date: today, type: "work", clockIn: new Date(),
      }).returning();
      res.status(201).json(created);
    } catch (err: unknown) {
      // Handle race-condition: unique constraint hit means another request just created the row
      if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
        res.status(409).json({ error: "Already clocked in" });
        return;
      }
      throw err;
    }
  } catch (err) {
    req.log.error({ err }, "Failed to clock in");
    res.status(500).json({ error: "Failed to clock in" });
  }
});

router.post("/clock-out", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const companyId = req.session.companyId!;

    // Find the most recent open work shift for this user (handles overnight crossover)
    const [open] = await db.select().from(attendanceLogsTable)
      .where(and(
        eq(attendanceLogsTable.userId, userId),
        eq(attendanceLogsTable.companyId, companyId),
        eq(attendanceLogsTable.type, "work"),
        isNull(attendanceLogsTable.clockOut),
      ))
      .orderBy(desc(attendanceLogsTable.date))
      .limit(1);

    if (!open || !open.clockIn) {
      res.status(404).json({ error: "Not currently clocked in" });
      return;
    }

    const now = new Date();
    const sessionSeconds = Math.max(0, Math.round((now.getTime() - open.clockIn.getTime()) / 1000));
    const totalWork = (open.workSeconds ?? 0) + sessionSeconds;
    const threshold = await getCompanyThresholdSeconds(companyId);
    const overtime = Math.max(0, totalWork - threshold);

    const [updated] = await db.update(attendanceLogsTable)
      .set({ clockOut: now, workSeconds: totalWork, overtimeSeconds: overtime })
      .where(and(eq(attendanceLogsTable.id, open.id), eq(attendanceLogsTable.companyId, companyId)))
      .returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to clock out");
    res.status(500).json({ error: "Failed to clock out" });
  }
});

const absenceSchema = z.object({
  type: z.enum(["sick", "vacation"]),
  note: z.string().max(500).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.post("/absence", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const companyId = req.session.companyId!;
    const parsed = absenceSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const date = parsed.data.date ?? todayStr();
    const [existing] = await db.select().from(attendanceLogsTable)
      .where(and(
        eq(attendanceLogsTable.userId, userId),
        eq(attendanceLogsTable.companyId, companyId),
        eq(attendanceLogsTable.date, date),
      ));

    if (existing) {
      if (existing.type === "work" && (existing.clockIn || existing.workSeconds > 0)) {
        res.status(409).json({ error: "You already worked on this day" });
        return;
      }
      const [updated] = await db.update(attendanceLogsTable)
        .set({ type: parsed.data.type, note: parsed.data.note ?? null, clockIn: null, clockOut: null, workSeconds: 0, overtimeSeconds: 0 })
        .where(and(eq(attendanceLogsTable.id, existing.id), eq(attendanceLogsTable.companyId, companyId)))
        .returning();
      res.json(updated);
      return;
    }

    try {
      const [created] = await db.insert(attendanceLogsTable).values({
        userId, companyId, date, type: parsed.data.type, note: parsed.data.note ?? null,
      }).returning();
      res.status(201).json(created);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
        res.status(409).json({ error: "An attendance record already exists for that day" });
        return;
      }
      throw err;
    }
  } catch (err) {
    req.log.error({ err }, "Failed to record absence");
    res.status(500).json({ error: "Failed to record absence" });
  }
});

router.get("/live", requireAuth, async (req, res) => {
  try {
    if (req.session.role !== "admin" && !req.session.isSupervisor) {
      res.status(403).json({ error: "Admin or supervisor only" });
      return;
    }
    const companyId = req.session.companyId!;
    const today = todayStr();

    const users = await db.select({ id: usersTable.id, username: usersTable.username, role: usersTable.role })
      .from(usersTable).where(eq(usersTable.companyId, companyId)).orderBy(usersTable.username);

    const logs = await db.select().from(attendanceLogsTable)
      .where(and(eq(attendanceLogsTable.companyId, companyId), eq(attendanceLogsTable.date, today)));
    const byUser = new Map(logs.map(l => [l.userId, l]));

    const rows = users
      .filter(u => u.role !== "owner")
      .map(u => {
        const log = byUser.get(u.id) ?? null;
        let status: "clocked_in" | "clocked_out" | "sick" | "vacation" | "absent" = "absent";
        if (log) {
          if (log.type === "sick") status = "sick";
          else if (log.type === "vacation") status = "vacation";
          else if (log.clockIn && !log.clockOut) status = "clocked_in";
          else if (log.clockOut) status = "clocked_out";
        }
        return {
          userId: u.id, username: u.username, role: u.role, status,
          clockIn: log?.clockIn ?? null, clockOut: log?.clockOut ?? null,
          workSeconds: log?.workSeconds ?? 0, note: log?.note ?? null,
        };
      });
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to load live attendance");
    res.status(500).json({ error: "Failed to load live attendance" });
  }
});

router.get("/report", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const callerId = req.session.userId!;
    const isAdmin = req.session.role === "admin" || !!req.session.isSupervisor;

    const monthRaw = String(req.query.month ?? "");
    if (!/^\d{4}-\d{2}$/.test(monthRaw)) { res.status(400).json({ error: "month=YYYY-MM required" }); return; }

    const targetUserIdRaw = req.query.userId;
    let targetUserId: number | "all" = callerId;
    if (targetUserIdRaw !== undefined && targetUserIdRaw !== "") {
      if (targetUserIdRaw === "all") {
        if (!isAdmin) { res.status(403).json({ error: "Admin only for all users" }); return; }
        targetUserId = "all";
      } else {
        const n = Number(targetUserIdRaw);
        if (!Number.isFinite(n)) { res.status(400).json({ error: "Invalid userId" }); return; }
        if (n !== callerId && !isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }
        targetUserId = n;
      }
    }

    const [yStr, mStr] = monthRaw.split("-");
    const y = Number(yStr); const m = Number(mStr);
    const start = `${monthRaw}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const end = `${monthRaw}-${String(lastDay).padStart(2, "0")}`;
    const threshold = await getCompanyThresholdSeconds(companyId);

    const baseConds = [
      eq(attendanceLogsTable.companyId, companyId),
      gte(attendanceLogsTable.date, start),
      lte(attendanceLogsTable.date, end),
    ];
    if (targetUserId !== "all") baseConds.push(eq(attendanceLogsTable.userId, targetUserId));

    const logs = await db.select({
      id: attendanceLogsTable.id, userId: attendanceLogsTable.userId, date: attendanceLogsTable.date,
      type: attendanceLogsTable.type, clockIn: attendanceLogsTable.clockIn, clockOut: attendanceLogsTable.clockOut,
      workSeconds: attendanceLogsTable.workSeconds, overtimeSeconds: attendanceLogsTable.overtimeSeconds,
      note: attendanceLogsTable.note, username: usersTable.username,
    })
      .from(attendanceLogsTable)
      .innerJoin(usersTable, eq(usersTable.id, attendanceLogsTable.userId))
      .where(and(...baseConds))
      .orderBy(asc(attendanceLogsTable.date), asc(usersTable.username));

    const usersById = new Map<number, { userId: number; username: string; daysWorked: number; sickDays: number; vacationDays: number; totalWorkSeconds: number; overtimeSeconds: number }>();
    for (const l of logs) {
      let u = usersById.get(l.userId);
      if (!u) {
        u = { userId: l.userId, username: l.username, daysWorked: 0, sickDays: 0, vacationDays: 0, totalWorkSeconds: 0, overtimeSeconds: 0 };
        usersById.set(l.userId, u);
      }
      if (l.type === "sick") u.sickDays += 1;
      else if (l.type === "vacation") u.vacationDays += 1;
      else {
        let work = l.workSeconds ?? 0;
        if (l.clockIn && !l.clockOut) {
          work += Math.max(0, Math.round((Date.now() - l.clockIn.getTime()) / 1000));
        }
        if (work > 0) u.daysWorked += 1;
        u.totalWorkSeconds += work;
        u.overtimeSeconds += Math.max(0, work - threshold);
      }
    }

    res.json({
      month: monthRaw,
      thresholdSeconds: threshold,
      summaries: Array.from(usersById.values()).sort((a, b) => a.username.localeCompare(b.username)),
      days: logs.map(l => {
        let work = l.workSeconds ?? 0;
        if (l.type === "work" && l.clockIn && !l.clockOut) {
          work += Math.max(0, Math.round((Date.now() - l.clockIn.getTime()) / 1000));
        }
        const overtime = l.type === "work" ? Math.max(0, work - threshold) : 0;
        return {
          id: l.id, userId: l.userId, username: l.username, date: l.date, type: l.type,
          clockIn: l.clockIn, clockOut: l.clockOut, workSeconds: work, overtimeSeconds: overtime, note: l.note,
        };
      }),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to build report");
    res.status(500).json({ error: "Failed to build report" });
  }
});

router.get("/users", requireAuth, async (req, res) => {
  try {
    if (req.session.role !== "admin" && !req.session.isSupervisor) {
      res.status(403).json({ error: "Admin or supervisor only" }); return;
    }
    const companyId = req.session.companyId!;
    const users = await db.select({ id: usersTable.id, username: usersTable.username, role: usersTable.role })
      .from(usersTable).where(eq(usersTable.companyId, companyId)).orderBy(usersTable.username);
    res.json(users.filter(u => u.role !== "owner"));
  } catch (err) {
    req.log.error({ err }, "Failed to list users");
    res.status(500).json({ error: "Failed to list users" });
  }
});

export default router;
