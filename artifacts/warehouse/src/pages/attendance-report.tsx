import { useMemo, useState, useEffect } from "react";
import { Link, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, BarChart3, Download, Heart, Plane, Briefcase, Zap, Info } from "lucide-react";

interface UserOption { id: number; username: string; role: string }
interface DayRow {
  id: number; userId: number; username: string; date: string;
  type: "work" | "sick" | "vacation";
  clockIn: string | null; clockOut: string | null;
  workSeconds: number; overtimeSeconds: number; note: string | null;
  isHoliday: boolean; holidayLabel: string | null; isWeekend: boolean;
}
interface Summary {
  userId: number; username: string;
  daysWorked: number; sickDays: number; vacationDays: number;
  totalWorkSeconds: number; overtimeSeconds: number;
}
interface Report {
  month: string;
  thresholdSeconds: number;
  weekendOvertimeEnabled: boolean;
  holidayCount: number;
  summaries: Summary[];
  days: DayRow[];
}

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
  return res.json();
}

function fmtHours(seconds: number) {
  if (!seconds) return "0h";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function csvEscape(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseQuery(s: string): URLSearchParams {
  return new URLSearchParams(s.startsWith("?") ? s.slice(1) : s);
}

const TYPE_BADGE: Record<string, { bg: string; label: string }> = {
  work: { bg: "bg-green-100 text-green-700 border-green-300", label: "Work" },
  sick: { bg: "bg-rose-100 text-rose-700 border-rose-300", label: "Sick" },
  vacation: { bg: "bg-sky-100 text-sky-700 border-sky-300", label: "Vacation" },
};

export default function AttendanceReportPage() {
  const { user } = useAuth();
  const search = useSearch();
  const params = useMemo(() => parseQuery(search), [search]);

  const isAdmin = user?.role === "admin" || !!user?.isSupervisor;

  const initialMonth = (() => {
    const m = params.get("month");
    if (m && /^\d{4}-\d{2}$/.test(m)) return m;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  const initialUserId = (() => {
    const u = params.get("userId");
    if (!isAdmin) return String(user?.id ?? "");
    if (u) return u;
    return String(user?.id ?? "");
  })();

  const [month, setMonth] = useState(initialMonth);
  const [userId, setUserId] = useState(initialUserId);

  useEffect(() => {
    if (!isAdmin && user?.id) setUserId(String(user.id));
  }, [isAdmin, user?.id]);

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ["/api/attendance/users"],
    queryFn: () => api("/api/attendance/users"),
    enabled: isAdmin,
  });

  const queryUrl = `/api/attendance/report?month=${month}&userId=${encodeURIComponent(userId)}`;
  const { data, isLoading, error } = useQuery<Report>({
    queryKey: [queryUrl],
    queryFn: () => api(queryUrl),
    enabled: !!month && !!userId,
  });

  const downloadCsv = () => {
    if (!data) return;
    const header = ["Date", "Employee", "Type", "Clock In", "Clock Out", "Hours Worked", "Overtime Hours", "Note"];
    const rows = data.days.map(d => [
      d.date,
      d.username,
      d.type,
      fmtTime(d.clockIn),
      fmtTime(d.clockOut),
      (d.workSeconds / 3600).toFixed(2),
      (d.overtimeSeconds / 3600).toFixed(2),
      d.note ?? "",
    ]);
    const totals: (string | number)[][] = [];
    if (data.summaries.length > 0) {
      totals.push([]);
      totals.push(["SUMMARY"]);
      totals.push(["Employee", "Days Worked", "Sick Days", "Vacation Days", "Total Hours", "Overtime Hours"]);
      for (const s of data.summaries) {
        totals.push([
          s.username, s.daysWorked, s.sickDays, s.vacationDays,
          (s.totalWorkSeconds / 3600).toFixed(2),
          (s.overtimeSeconds / 3600).toFixed(2),
        ]);
      }
    }
    const csv = [header, ...rows, ...totals]
      .map(row => row.map(csvEscape).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${data.month}${userId !== "all" ? `-${data.summaries[0]?.username ?? "user"}` : "-all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Group days by user for display
  const daysByUser = useMemo(() => {
    if (!data) return new Map<number, DayRow[]>();
    const m = new Map<number, DayRow[]>();
    for (const d of data.days) {
      if (!m.has(d.userId)) m.set(d.userId, []);
      m.get(d.userId)!.push(d);
    }
    return m;
  }, [data]);

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm flex items-center gap-3">
        <Link href="/attendance" className="p-2 -ml-2 rounded-full hover:bg-secondary-foreground/10">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <BarChart3 className="h-5 w-5" />
        <h1 className="text-xl font-bold">Monthly Report</h1>
      </div>

      <div className="p-4 space-y-4 pb-24">
        {/* Filters */}
        <div className="bg-card border-2 border-border rounded-xl p-3 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Month</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="mt-1 w-full h-10 px-3 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          {isAdmin && (
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Employee</label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger className="mt-1 h-10 border-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All employees</SelectItem>
                  {users.map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={downloadCsv} disabled={!data || data.days.length === 0} className="h-11 font-bold">
              <Download className="h-4 w-4 mr-2" /> Download CSV
            </Button>
            <Button
              onClick={() => {
                const url = `/api/attendance/report/pdf?month=${month}&userId=${encodeURIComponent(userId)}`;
                window.location.assign(url);
              }}
              disabled={!month || !userId}
              variant="secondary"
              className="h-11 font-bold"
            >
              <Download className="h-4 w-4 mr-2" /> Download PDF
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 text-center">{(error as Error).message}</p>}

        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
        ) : !data || data.summaries.length === 0 ? (
          <div className="text-center py-12 bg-muted/30 rounded-xl border border-dashed">
            <p className="text-muted-foreground">No attendance recorded for this period.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            {data.summaries.map(s => (
              <div key={s.userId} className="bg-card border-2 border-border rounded-xl overflow-hidden">
                <div className="bg-muted/30 px-4 py-2 border-b">
                  <p className="font-black text-base">{s.username}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 p-3">
                  <div className="rounded-lg border bg-background p-2">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground"><Briefcase className="h-3 w-3" /> Days worked</div>
                    <p className="font-black text-xl mt-0.5">{s.daysWorked}</p>
                  </div>
                  <div className="rounded-lg border bg-background p-2">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground"><Briefcase className="h-3 w-3" /> Total hours</div>
                    <p className="font-black text-xl mt-0.5">{fmtHours(s.totalWorkSeconds)}</p>
                  </div>
                  <div className="rounded-lg border bg-background p-2">
                    <div className="flex items-center gap-1 text-xs text-orange-600"><Zap className="h-3 w-3" /> Overtime</div>
                    <p className="font-black text-xl mt-0.5 text-orange-700">{fmtHours(s.overtimeSeconds)}</p>
                  </div>
                  <div className="rounded-lg border bg-background p-2 grid grid-cols-2 gap-1">
                    <div>
                      <div className="flex items-center gap-1 text-xs text-rose-600"><Heart className="h-3 w-3" /> Sick</div>
                      <p className="font-black text-lg mt-0.5">{s.sickDays}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-xs text-sky-600"><Plane className="h-3 w-3" /> Vac.</div>
                      <p className="font-black text-lg mt-0.5">{s.vacationDays}</p>
                    </div>
                  </div>
                </div>

                {/* Day-by-day */}
                <div className="border-t divide-y">
                  {(daysByUser.get(s.userId) ?? []).map(d => {
                    const badge = TYPE_BADGE[d.type];
                    const rowBg = d.isHoliday
                      ? "bg-amber-50"
                      : d.isWeekend ? "bg-blue-50/50" : "";
                    return (
                      <div key={d.id} className={`px-3 py-2 flex items-center justify-between gap-2 text-sm ${rowBg}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold tabular-nums text-xs">{d.date.slice(8, 10)}</span>
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg}`}>
                              {badge.label}
                            </span>
                            {d.isHoliday && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold border bg-amber-100 text-amber-700 border-amber-300">
                                {d.holidayLabel ?? "Holiday"}
                              </span>
                            )}
                            {!d.isHoliday && d.isWeekend && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold border bg-blue-100 text-blue-700 border-blue-300">
                                Weekend OT
                              </span>
                            )}
                          </div>
                          {d.type === "work" && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {fmtTime(d.clockIn)} – {fmtTime(d.clockOut)}
                            </p>
                          )}
                          {d.note && <p className="text-xs text-muted-foreground italic truncate">"{d.note}"</p>}
                        </div>
                        {d.type === "work" && (
                          <div className="text-right flex-shrink-0">
                            <p className="font-bold tabular-nums">{fmtHours(d.workSeconds)}</p>
                            {d.overtimeSeconds > 0 && (
                              <p className="text-[10px] text-orange-600 font-bold">+{fmtHours(d.overtimeSeconds)} OT</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Legend / overtime rules explanation */}
            <div className="bg-card border-2 border-border rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                <Info className="h-3.5 w-3.5" /> Overtime Rules
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm bg-background border border-border flex-shrink-0" />
                  <span>Regular day — overtime starts after <strong className="text-foreground">{fmtHours(data.thresholdSeconds)}</strong> worked</span>
                </div>
                {data.weekendOvertimeEnabled && (
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-300 flex-shrink-0" />
                    <span>Weekend — <strong className="text-foreground">all hours count as overtime</strong> (threshold: 0h)</span>
                  </div>
                )}
                {data.holidayCount > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300 flex-shrink-0" />
                    <span>Company holiday — <strong className="text-foreground">all hours count as overtime</strong> (threshold: 0h)</span>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-0.5">
                  <Zap className="h-3 w-3 text-orange-500 flex-shrink-0" />
                  <span>Orange <strong className="text-foreground">+OT</strong> label appears on any day with overtime hours logged</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
