import cron from "node-cron";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import {
  db,
  attendanceLogsTable,
  companiesTable,
  companyHolidaysTable,
  companyShiftsTable,
  usersTable,
} from "@workspace/db";
import { logger } from "./logger";
import { runAnalyticsJob, getProCompanyIds } from "./analyticsJob";

const GRACE_HOURS = 2;

interface OpenLogRow {
  id: number;
  userId: number;
  companyId: number;
  date: string;
  clockIn: Date;
  workSeconds: number;
}

interface CompanySettings {
  workHoursPerDay: number;
  weekendOvertimeEnabled: boolean;
  timezone: string;
}

async function getCompanySettings(companyId: number): Promise<CompanySettings> {
  const [c] = await db
    .select({
      wh: companiesTable.workHoursPerDay,
      weekendOvertimeEnabled: companiesTable.weekendOvertimeEnabled,
      timezone: companiesTable.timezone,
    })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId));
  return {
    workHoursPerDay: c?.wh ?? 480,
    weekendOvertimeEnabled: c?.weekendOvertimeEnabled ?? true,
    timezone: c?.timezone ?? "UTC",
  };
}

async function effectiveThresholdSeconds(
  companyId: number,
  dateStr: string,
  settings: CompanySettings,
): Promise<number> {
  if (settings.weekendOvertimeEnabled) {
    const tz = settings.timezone || "UTC";
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date(dateStr + "T12:00:00Z"));
    if (weekday === "Sat" || weekday === "Sun") return 0;
  }
  const [holiday] = await db
    .select({ id: companyHolidaysTable.id })
    .from(companyHolidaysTable)
    .where(
      and(
        eq(companyHolidaysTable.companyId, companyId),
        eq(companyHolidaysTable.date, dateStr),
      ),
    );
  if (holiday) return 0;
  return settings.workHoursPerDay * 60;
}

/** Given a date string and HH:MM time, return the UTC Date for that local time in tz. */
function shiftTimeToDate(dateStr: string, timeHHMM: string, tz: string, addDays = 0): Date {
  const [hh, mm] = timeHHMM.split(":").map(Number);
  // Build an ISO-like string that Intl can resolve in the target timezone
  const [y, mo, d] = dateStr.split("-").map(Number);
  const day = d + addDays;
  const localStr = `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
  // Use Temporal-style trick: find what UTC time equals localStr in tz
  const probe = new Date(localStr + "Z"); // parse as UTC first
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = formatter.formatToParts(probe);
  const pv = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const probeLocal = `${pv("year")}-${pv("month")}-${pv("day")}T${pv("hour")}:${pv("minute")}:00`;
  const diffMs = new Date(localStr).getTime() - new Date(probeLocal).getTime();
  return new Date(probe.getTime() + diffMs);
}

/**
 * Close any open clock-in older than (work_hours_per_day + GRACE_HOURS).
 * The clockOut is stamped at clockIn + work_hours_per_day so the recorded
 * duration matches the worker's scheduled day instead of running until "now".
 */
export async function runAttendanceAutoClose(): Promise<{ closed: number }> {
  const now = new Date();
  const settingsCache = new Map<number, CompanySettings>();

  // Fetch all currently open work shifts, joining user shift assignment.
  const openLogs = await db
    .select({
      id: attendanceLogsTable.id,
      userId: attendanceLogsTable.userId,
      companyId: attendanceLogsTable.companyId,
      date: attendanceLogsTable.date,
      clockIn: attendanceLogsTable.clockIn,
      workSeconds: attendanceLogsTable.workSeconds,
      shiftStartTime: companyShiftsTable.startTime,
      shiftEndTime: companyShiftsTable.endTime,
    })
    .from(attendanceLogsTable)
    .leftJoin(usersTable, eq(attendanceLogsTable.userId, usersTable.id))
    .leftJoin(companyShiftsTable, eq(usersTable.shiftId, companyShiftsTable.id))
    .where(
      and(
        eq(attendanceLogsTable.type, "work"),
        isNotNull(attendanceLogsTable.clockIn),
        isNull(attendanceLogsTable.clockOut),
      ),
    );

  let closed = 0;
  for (const log of openLogs) {
    if (!log.clockIn) continue;
    let settings = settingsCache.get(log.companyId);
    if (!settings) {
      settings = await getCompanySettings(log.companyId);
      settingsCache.set(log.companyId, settings);
    }

    let clockOut: Date;
    let graceSec = GRACE_HOURS * 3600;

    if (log.shiftEndTime && log.shiftStartTime) {
      // Worker has an assigned shift — close at shift end time.
      const crossesMidnight = log.shiftEndTime < log.shiftStartTime;
      const addDays = crossesMidnight ? 1 : 0;
      const shiftEnd = shiftTimeToDate(log.date, log.shiftEndTime, settings.timezone, addDays);
      const msSinceShiftEnd = now.getTime() - shiftEnd.getTime();
      if (msSinceShiftEnd <= graceSec * 1000) continue; // not past grace yet
      clockOut = shiftEnd;
    } else {
      // No shift assigned — fall back to clockIn + scheduled work day.
      const scheduledSec = settings.workHoursPerDay * 60;
      const ageSec = Math.floor((now.getTime() - log.clockIn.getTime()) / 1000);
      if (ageSec <= scheduledSec + graceSec) continue;
      clockOut = new Date(log.clockIn.getTime() + scheduledSec * 1000);
    }

    const sessionSec = Math.max(0, Math.round((clockOut.getTime() - log.clockIn.getTime()) / 1000));
    const totalWork = (log.workSeconds ?? 0) + sessionSec;
    const threshold = await effectiveThresholdSeconds(log.companyId, log.date, settings);
    const overtime = Math.max(0, totalWork - threshold);

    await db
      .update(attendanceLogsTable)
      .set({
        clockOut,
        workSeconds: totalWork,
        overtimeSeconds: overtime,
        autoClosed: true,
        autoCloseAcknowledgedAt: null,
      })
      .where(
        and(
          eq(attendanceLogsTable.id, log.id),
          isNull(attendanceLogsTable.clockOut),
        ),
      );

    closed += 1;
    logger.info(
      { attendanceLogId: log.id, userId: log.userId, companyId: log.companyId, date: log.date, workSeconds: totalWork },
      "Auto-closed forgotten attendance shift",
    );
  }
  return { closed };
}

let started = false;

/**
 * Run once shortly after boot to catch up on stale shifts, then daily at
 * 03:15 server time. Re-running mid-day is safe: only shifts older than
 * the scheduled day + grace are closed.
 */
export function startAttendanceAutoCloseScheduler(): void {
  if (started) return;
  started = true;

  // Catch-up pass on boot.
  setTimeout(() => {
    runAttendanceAutoClose()
      .then(({ closed }) => {
        if (closed > 0) {
          logger.info({ closed }, "Auto-close startup pass complete");
        }
      })
      .catch((err) => {
        logger.error({ err }, "Auto-close startup pass failed");
      });
  }, 30_000);

  // Daily at 03:15.
  cron.schedule("15 3 * * *", () => {
    runAttendanceAutoClose()
      .then(({ closed }) => {
        logger.info({ closed }, "Auto-close daily job complete");
      })
      .catch((err) => {
        logger.error({ err }, "Auto-close daily job failed");
      });
  });

  logger.info("Attendance auto-close scheduler started");
}

let analyticsStarted = false;

/**
 * Run weekly analytics snapshot for all Pro companies.
 * Schedules a cron that runs every Sunday at 02:00 server time.
 * On-demand snapshots are triggered via POST /api/analytics/refresh.
 */
export function startAnalyticsScheduler(): void {
  if (analyticsStarted) return;
  analyticsStarted = true;

  async function runForAllProCompanies(): Promise<void> {
    const companyIds = await getProCompanyIds();
    if (companyIds.length === 0) return;
    for (const companyId of companyIds) {
      try {
        const { insightCount } = await runAnalyticsJob(companyId, "cron");
        logger.info({ companyId, insightCount }, "Weekly analytics snapshot done");
      } catch (err) {
        logger.error({ err, companyId }, "Weekly analytics snapshot failed for company");
      }
    }
  }

  // Weekly at Sunday 02:00.
  cron.schedule("0 2 * * 0", () => {
    runForAllProCompanies().catch((err) => {
      logger.error({ err }, "Analytics weekly cron failed");
    });
  });

  logger.info("Analytics scheduler started");
}
