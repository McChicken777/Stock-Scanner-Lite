import { Router, type IRouter } from "express";
import { db, attendanceLogsTable, companiesTable, usersTable, companyHolidaysTable } from "@workspace/db";
import { eq, and, gte, lte, asc, isNull, desc } from "drizzle-orm";
import { z } from "zod";
import PDFDocument from "pdfkit";
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

/** Returns 0 if the given date string (YYYY-MM-DD) is a weekend or company holiday, else the normal threshold. */
async function getEffectiveThresholdSeconds(companyId: number, dateStr: string): Promise<number> {
  const [company] = await db.select({
    wh: companiesTable.workHoursPerDay,
    weekendOvertimeEnabled: companiesTable.weekendOvertimeEnabled,
  }).from(companiesTable).where(eq(companiesTable.id, companyId));

  if (!company) return 480 * 60;

  // Weekend check
  if (company.weekendOvertimeEnabled) {
    const d = new Date(dateStr + "T00:00:00Z");
    const dow = d.getUTCDay(); // 0=Sun, 6=Sat
    if (dow === 0 || dow === 6) return 0;
  }

  // Holiday check
  const [holiday] = await db.select({ id: companyHolidaysTable.id })
    .from(companyHolidaysTable)
    .where(and(eq(companyHolidaysTable.companyId, companyId), eq(companyHolidaysTable.date, dateStr)));
  if (holiday) return 0;

  return (company.wh ?? 480) * 60;
}

router.get("/status", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const companyId = req.session.companyId!;
    const [open] = await db.select({ id: attendanceLogsTable.id })
      .from(attendanceLogsTable)
      .where(and(
        eq(attendanceLogsTable.userId, userId),
        eq(attendanceLogsTable.companyId, companyId),
        eq(attendanceLogsTable.type, "work"),
        isNull(attendanceLogsTable.clockOut),
      ))
      .limit(1);
    res.json({ clockedIn: !!open });
  } catch (err) {
    req.log.error({ err }, "Failed to get attendance status");
    res.status(500).json({ error: "Failed to get attendance status" });
  }
});

router.get("/auto-close-notice", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const companyId = req.session.companyId!;
    const [log] = await db.select({
      id: attendanceLogsTable.id,
      date: attendanceLogsTable.date,
      clockIn: attendanceLogsTable.clockIn,
      clockOut: attendanceLogsTable.clockOut,
      workSeconds: attendanceLogsTable.workSeconds,
    }).from(attendanceLogsTable)
      .where(and(
        eq(attendanceLogsTable.userId, userId),
        eq(attendanceLogsTable.companyId, companyId),
        eq(attendanceLogsTable.autoClosed, true),
        isNull(attendanceLogsTable.autoCloseAcknowledgedAt),
      ))
      .orderBy(desc(attendanceLogsTable.date))
      .limit(1);
    res.json(log ?? null);
  } catch (err) {
    req.log.error({ err }, "Failed to load auto-close notice");
    res.status(500).json({ error: "Failed to load auto-close notice" });
  }
});

router.post("/auto-close-notice/:id/ack", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const companyId = req.session.companyId!;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.update(attendanceLogsTable)
      .set({ autoCloseAcknowledgedAt: new Date() })
      .where(and(
        eq(attendanceLogsTable.id, id),
        eq(attendanceLogsTable.userId, userId),
        eq(attendanceLogsTable.companyId, companyId),
        eq(attendanceLogsTable.autoClosed, true),
        isNull(attendanceLogsTable.autoCloseAcknowledgedAt),
      ));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to acknowledge auto-close notice");
    res.status(500).json({ error: "Failed to acknowledge auto-close notice" });
  }
});

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

    const [openShift] = await db.select().from(attendanceLogsTable)
      .where(and(
        eq(attendanceLogsTable.userId, userId),
        eq(attendanceLogsTable.companyId, companyId),
        eq(attendanceLogsTable.type, "work"),
        isNull(attendanceLogsTable.clockOut),
      ))
      .orderBy(desc(attendanceLogsTable.date))
      .limit(1);
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
      const [updated] = await db.update(attendanceLogsTable)
        .set({ clockIn: new Date(), clockOut: null, status: "approved" })
        .where(and(eq(attendanceLogsTable.id, existing.id), eq(attendanceLogsTable.companyId, companyId)))
        .returning();
      res.json(updated);
      return;
    }

    try {
      const [created] = await db.insert(attendanceLogsTable).values({
        userId, companyId, date: today, type: "work", status: "approved", clockIn: new Date(),
      }).returning();
      res.status(201).json(created);
    } catch (err: unknown) {
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
    const threshold = await getEffectiveThresholdSeconds(companyId, open.date);
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
  type: z.literal("sick"),
  note: z.string().max(500).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.post("/absence", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const companyId = req.session.companyId!;
    if (req.body && req.body.type === "vacation") {
      res.status(400).json({ error: "Vacations require manager approval. Submit a request via /api/leave." });
      return;
    }
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
        .set({ type: parsed.data.type, status: "approved", note: parsed.data.note ?? null, clockIn: null, clockOut: null, workSeconds: 0, overtimeSeconds: 0 })
        .where(and(eq(attendanceLogsTable.id, existing.id), eq(attendanceLogsTable.companyId, companyId)))
        .returning();
      res.json(updated);
      return;
    }

    try {
      const [created] = await db.insert(attendanceLogsTable).values({
        userId, companyId, date, type: parsed.data.type, status: "approved", note: parsed.data.note ?? null,
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
          else if (log.type === "vacation" && log.status === "approved") status = "vacation";
          else if (log.clockIn && !log.clockOut) status = "clocked_in";
          else if (log.clockOut) status = "clocked_out";
        }
        return {
          userId: u.id, username: u.username, role: u.role, status,
          clockIn: log?.clockIn ?? null, clockOut: log?.clockOut ?? null,
          workSeconds: log?.workSeconds ?? 0, note: log?.note ?? null,
          autoClosed: log?.autoClosed ?? false,
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

    // Load company settings and holidays for the month once
    const [company] = await db.select({
      wh: companiesTable.workHoursPerDay,
      weekendOvertimeEnabled: companiesTable.weekendOvertimeEnabled,
    }).from(companiesTable).where(eq(companiesTable.id, companyId));
    const defaultThreshold = (company?.wh ?? 480) * 60;

    const holidays = await db.select({ date: companyHolidaysTable.date, label: companyHolidaysTable.label })
      .from(companyHolidaysTable)
      .where(and(
        eq(companyHolidaysTable.companyId, companyId),
        gte(companyHolidaysTable.date, start),
        lte(companyHolidaysTable.date, end),
      ));
    const holidayMap = new Map(holidays.map(h => [h.date, h.label]));

    function isWeekendDate(dateStr: string): boolean {
      const dow = new Date(dateStr + "T00:00:00Z").getUTCDay();
      return dow === 0 || dow === 6;
    }

    function thresholdForDate(dateStr: string): number {
      if (company?.weekendOvertimeEnabled && isWeekendDate(dateStr)) return 0;
      if (holidayMap.has(dateStr)) return 0;
      return defaultThreshold;
    }

    const baseConds = [
      eq(attendanceLogsTable.companyId, companyId),
      gte(attendanceLogsTable.date, start),
      lte(attendanceLogsTable.date, end),
    ];
    if (targetUserId !== "all") baseConds.push(eq(attendanceLogsTable.userId, targetUserId));

    const logs = await db.select({
      id: attendanceLogsTable.id, userId: attendanceLogsTable.userId, date: attendanceLogsTable.date,
      type: attendanceLogsTable.type, status: attendanceLogsTable.status,
      clockIn: attendanceLogsTable.clockIn, clockOut: attendanceLogsTable.clockOut,
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
      else if (l.type === "vacation") {
        if (l.status === "approved") u.vacationDays += 1;
      }
      else {
        let work = l.workSeconds ?? 0;
        if (l.clockIn && !l.clockOut) {
          work += Math.max(0, Math.round((Date.now() - l.clockIn.getTime()) / 1000));
        }
        const threshold = thresholdForDate(l.date);
        if (work > 0) u.daysWorked += 1;
        u.totalWorkSeconds += work;
        u.overtimeSeconds += Math.max(0, work - threshold);
      }
    }

    res.json({
      month: monthRaw,
      thresholdSeconds: defaultThreshold,
      summaries: Array.from(usersById.values()).sort((a, b) => a.username.localeCompare(b.username)),
      days: logs.map(l => {
        let work = l.workSeconds ?? 0;
        if (l.type === "work" && l.clockIn && !l.clockOut) {
          work += Math.max(0, Math.round((Date.now() - l.clockIn.getTime()) / 1000));
        }
        const threshold = thresholdForDate(l.date);
        const overtime = l.type === "work" ? Math.max(0, work - threshold) : 0;
        const isHoliday = holidayMap.has(l.date);
        const isWeekend = company?.weekendOvertimeEnabled ? isWeekendDate(l.date) : false;
        return {
          id: l.id, userId: l.userId, username: l.username, date: l.date, type: l.type,
          clockIn: l.clockIn, clockOut: l.clockOut, workSeconds: work, overtimeSeconds: overtime, note: l.note,
          isHoliday, holidayLabel: isHoliday ? holidayMap.get(l.date) : null, isWeekend,
        };
      }),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to build report");
    res.status(500).json({ error: "Failed to build report" });
  }
});

function fmtHours(seconds: number): string {
  if (!seconds) return "0h";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtTime(d: Date | null): string {
  if (!d) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function monthLabel(monthRaw: string): string {
  const [y, m] = monthRaw.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

interface PdfDayRow {
  date: string;
  type: "work" | "sick" | "vacation";
  clockIn: Date | null;
  clockOut: Date | null;
  workSeconds: number;
  overtimeSeconds: number;
  note: string | null;
}

interface PdfSummary {
  username: string;
  daysWorked: number;
  sickDays: number;
  vacationDays: number;
  totalWorkSeconds: number;
  overtimeSeconds: number;
}

function renderEmployeeSection(
  doc: InstanceType<typeof PDFDocument>,
  opts: { companyName: string; monthRaw: string; summary: PdfSummary; days: PdfDayRow[] },
  isFirst: boolean,
) {
  if (!isFirst) doc.addPage();

  // Header
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#0f172a").text(opts.companyName, { align: "left" });
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(10).fillColor("#64748b").text("Monthly Attendance Payslip", { align: "left" });
  doc.moveDown(0.8);

  // Employee + month band
  const bandTop = doc.y;
  doc.rect(doc.page.margins.left, bandTop, doc.page.width - doc.page.margins.left - doc.page.margins.right, 50)
    .fillColor("#f1f5f9").fill();
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(13)
    .text(opts.summary.username, doc.page.margins.left + 10, bandTop + 8);
  doc.font("Helvetica").fontSize(10).fillColor("#475569")
    .text(`Period: ${monthLabel(opts.monthRaw)}`, doc.page.margins.left + 10, bandTop + 28);
  doc.y = bandTop + 60;

  // Summary table
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text("Summary");
  doc.moveDown(0.3);
  const sumRows: [string, string][] = [
    ["Days worked", String(opts.summary.daysWorked)],
    ["Total hours", fmtHours(opts.summary.totalWorkSeconds)],
    ["Overtime hours", fmtHours(opts.summary.overtimeSeconds)],
    ["Sick days", String(opts.summary.sickDays)],
    ["Vacation days", String(opts.summary.vacationDays)],
  ];
  doc.font("Helvetica").fontSize(10).fillColor("#0f172a");
  const labelX = doc.page.margins.left + 6;
  const valueX = doc.page.margins.left + 200;
  for (const [k, v] of sumRows) {
    const rowY = doc.y;
    doc.text(k, labelX, rowY, { width: 180 });
    doc.font("Helvetica-Bold").text(v, valueX, rowY);
    doc.font("Helvetica");
    doc.moveDown(0.2);
  }
  doc.moveDown(0.8);

  // Day-by-day table
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text("Day-by-day");
  doc.moveDown(0.3);

  const cols = [
    { label: "Date", x: doc.page.margins.left, w: 70 },
    { label: "Type", x: doc.page.margins.left + 70, w: 60 },
    { label: "In", x: doc.page.margins.left + 130, w: 50 },
    { label: "Out", x: doc.page.margins.left + 180, w: 50 },
    { label: "Hours", x: doc.page.margins.left + 230, w: 60 },
    { label: "Overtime", x: doc.page.margins.left + 290, w: 70 },
    { label: "Note", x: doc.page.margins.left + 360, w: 175 },
  ];

  const drawHeader = () => {
    const hy = doc.y;
    doc.rect(doc.page.margins.left, hy - 2,
      doc.page.width - doc.page.margins.left - doc.page.margins.right, 16)
      .fillColor("#e2e8f0").fill();
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(9);
    for (const c of cols) doc.text(c.label, c.x + 4, hy + 1, { width: c.w - 6 });
    doc.y = hy + 16;
    doc.font("Helvetica").fontSize(9);
  };
  drawHeader();

  for (const d of opts.days) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 60) {
      doc.addPage();
      drawHeader();
    }
    const ry = doc.y;
    doc.fillColor("#0f172a");
    doc.text(d.date, cols[0].x + 4, ry + 2, { width: cols[0].w - 6 });
    doc.text(d.type, cols[1].x + 4, ry + 2, { width: cols[1].w - 6 });
    doc.text(d.type === "work" ? fmtTime(d.clockIn) : "—", cols[2].x + 4, ry + 2, { width: cols[2].w - 6 });
    doc.text(d.type === "work" ? fmtTime(d.clockOut) : "—", cols[3].x + 4, ry + 2, { width: cols[3].w - 6 });
    doc.text(d.type === "work" ? fmtHours(d.workSeconds) : "—", cols[4].x + 4, ry + 2, { width: cols[4].w - 6 });
    doc.text(d.overtimeSeconds > 0 ? fmtHours(d.overtimeSeconds) : "—", cols[5].x + 4, ry + 2, { width: cols[5].w - 6 });
    doc.text(d.note ?? "", cols[6].x + 4, ry + 2, { width: cols[6].w - 6 });
    const rowH = Math.max(14, doc.y - ry);
    doc.y = ry + rowH;
    doc.strokeColor("#e2e8f0").lineWidth(0.5)
      .moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  }

  // Signature
  const minSigSpace = 90;
  if (doc.y > doc.page.height - doc.page.margins.bottom - minSigSpace) doc.addPage();
  doc.moveDown(3);
  const sigY = doc.y;
  const sigW = 220;
  doc.strokeColor("#0f172a").lineWidth(0.8)
    .moveTo(doc.page.margins.left, sigY).lineTo(doc.page.margins.left + sigW, sigY).stroke();
  doc.font("Helvetica").fontSize(9).fillColor("#475569")
    .text("Employee signature", doc.page.margins.left, sigY + 4);

  const sig2X = doc.page.width - doc.page.margins.right - sigW;
  doc.strokeColor("#0f172a").lineWidth(0.8)
    .moveTo(sig2X, sigY).lineTo(sig2X + sigW, sigY).stroke();
  doc.text("Manager signature", sig2X, sigY + 4);

  doc.moveDown(2);
  doc.fontSize(8).fillColor("#94a3b8")
    .text(`Generated ${new Date().toISOString().slice(0, 10)} · ${opts.companyName}`, { align: "center" });
}

router.get("/report/pdf", requireAuth, async (req, res) => {
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

    const [company] = await db.select({
      id: companiesTable.id,
      name: companiesTable.name,
      wh: companiesTable.workHoursPerDay,
      weekendOvertimeEnabled: companiesTable.weekendOvertimeEnabled,
    }).from(companiesTable).where(eq(companiesTable.id, companyId));
    if (!company) { res.status(404).json({ error: "Company not found" }); return; }
    const defaultThreshold = (company.wh ?? 480) * 60;

    const holidays = await db.select({ date: companyHolidaysTable.date })
      .from(companyHolidaysTable)
      .where(and(
        eq(companyHolidaysTable.companyId, companyId),
        gte(companyHolidaysTable.date, start),
        lte(companyHolidaysTable.date, end),
      ));
    const holidaySet = new Set(holidays.map(h => h.date));

    function thresholdForDate(dateStr: string): number {
      if (company?.weekendOvertimeEnabled) {
        const d = new Date(dateStr + "T00:00:00Z");
        const dow = d.getUTCDay();
        if (dow === 0 || dow === 6) return 0;
      }
      if (holidaySet.has(dateStr)) return 0;
      return defaultThreshold;
    }

    const baseConds = [
      eq(attendanceLogsTable.companyId, companyId),
      gte(attendanceLogsTable.date, start),
      lte(attendanceLogsTable.date, end),
    ];
    if (targetUserId !== "all") baseConds.push(eq(attendanceLogsTable.userId, targetUserId));

    const logs = await db.select({
      id: attendanceLogsTable.id, userId: attendanceLogsTable.userId, date: attendanceLogsTable.date,
      type: attendanceLogsTable.type, status: attendanceLogsTable.status,
      clockIn: attendanceLogsTable.clockIn, clockOut: attendanceLogsTable.clockOut,
      workSeconds: attendanceLogsTable.workSeconds, overtimeSeconds: attendanceLogsTable.overtimeSeconds,
      note: attendanceLogsTable.note, username: usersTable.username,
    })
      .from(attendanceLogsTable)
      .innerJoin(usersTable, eq(usersTable.id, attendanceLogsTable.userId))
      .where(and(...baseConds))
      .orderBy(asc(usersTable.username), asc(attendanceLogsTable.date));

    // If a specific user was requested but has no logs, still emit a PDF with their name.
    let userIdsInOrder: number[] = [];
    const usernameById = new Map<number, string>();
    const daysByUser = new Map<number, PdfDayRow[]>();
    const summaryByUser = new Map<number, PdfSummary>();

    for (const l of logs) {
      if (!usernameById.has(l.userId)) {
        usernameById.set(l.userId, l.username);
        userIdsInOrder.push(l.userId);
        summaryByUser.set(l.userId, {
          username: l.username, daysWorked: 0, sickDays: 0, vacationDays: 0,
          totalWorkSeconds: 0, overtimeSeconds: 0,
        });
        daysByUser.set(l.userId, []);
      }
      const sum = summaryByUser.get(l.userId)!;
      let work = l.workSeconds ?? 0;
      if (l.type === "work" && l.clockIn && !l.clockOut) {
        work += Math.max(0, Math.round((Date.now() - l.clockIn.getTime()) / 1000));
      }
      const threshold = thresholdForDate(l.date);
      const overtime = l.type === "work" ? Math.max(0, work - threshold) : 0;
      if (l.type === "sick") sum.sickDays += 1;
      else if (l.type === "vacation") { if (l.status === "approved") sum.vacationDays += 1; }
      else {
        if (work > 0) sum.daysWorked += 1;
        sum.totalWorkSeconds += work;
        sum.overtimeSeconds += overtime;
      }
      daysByUser.get(l.userId)!.push({
        date: l.date, type: l.type, clockIn: l.clockIn, clockOut: l.clockOut,
        workSeconds: work, overtimeSeconds: overtime, note: l.note,
      });
    }

    if (targetUserId !== "all" && userIdsInOrder.length === 0) {
      const [u] = await db.select({ id: usersTable.id, username: usersTable.username })
        .from(usersTable)
        .where(and(eq(usersTable.id, targetUserId), eq(usersTable.companyId, companyId)));
      if (!u) { res.status(404).json({ error: "User not found" }); return; }
      userIdsInOrder = [u.id];
      usernameById.set(u.id, u.username);
      summaryByUser.set(u.id, {
        username: u.username, daysWorked: 0, sickDays: 0, vacationDays: 0,
        totalWorkSeconds: 0, overtimeSeconds: 0,
      });
      daysByUser.set(u.id, []);
    }

    if (targetUserId === "all" && userIdsInOrder.length === 0) {
      // Include all employees in the company so the PDF still has structure
      const allUsers = await db.select({ id: usersTable.id, username: usersTable.username, role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.companyId, companyId))
        .orderBy(usersTable.username);
      for (const u of allUsers.filter(u => u.role !== "owner")) {
        userIdsInOrder.push(u.id);
        usernameById.set(u.id, u.username);
        summaryByUser.set(u.id, {
          username: u.username, daysWorked: 0, sickDays: 0, vacationDays: 0,
          totalWorkSeconds: 0, overtimeSeconds: 0,
        });
        daysByUser.set(u.id, []);
      }
    }

    const filenameUser = targetUserId === "all"
      ? "all"
      : (usernameById.get(targetUserId) ?? `user-${targetUserId}`).replace(/[^a-z0-9_-]+/gi, "_");
    const filename = `attendance-${monthRaw}-${filenameUser}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: "A4", margin: 48 });
    doc.pipe(res);

    let isFirst = true;
    for (const uid of userIdsInOrder) {
      renderEmployeeSection(doc, {
        companyName: company.name,
        monthRaw,
        summary: summaryByUser.get(uid)!,
        days: daysByUser.get(uid)!,
      }, isFirst);
      isFirst = false;
    }

    doc.end();
  } catch (err) {
    req.log.error({ err }, "Failed to build PDF report");
    if (!res.headersSent) res.status(500).json({ error: "Failed to build PDF report" });
    else res.end();
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
