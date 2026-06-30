import { useGetDashboardSummary } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import {
  Package, MapPin, AlertTriangle, Activity,
  FileText, Users, Zap, Clock, CheckCircle2, UserCheck, Calendar,
  Flag, AlertCircle, Inbox, FolderKanban, ScanLine, Scale,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth";
import { usePlan } from "@/contexts/auth";
import { useLang } from "@/contexts/lang";


interface AttendanceLiveRow {
  userId: number;
  username: string;
  role: string;
  status: "clocked_in" | "clocked_out" | "sick" | "vacation" | "absent";
  clockIn: string | null;
  workSeconds: number;
  note: string | null;
}

interface Task {
  id: number;
  projectId: number;
  status: "not_started" | "in_progress" | "completed";
  procedureName: string;
  itemName: string;
  roleName: string;
  readyStatus: "READY" | "BLOCKED";
  blockedReason: string;
  deadline: string;
  priority: "low" | "normal" | "high" | "urgent";
  isOverdue: boolean;
}

interface PendingLeave {
  id: number;
  username: string;
  type: "sick" | "vacation";
  startDate: string;
  endDate: string;
  status: "pending";
}

interface WorkProject {
  id: number;
  status: string;
}

const ATTENDANCE_STYLES: Record<AttendanceLiveRow["status"], { cls: string }> = {
  clocked_in: { cls: "bg-green-100 text-green-700 border-green-300" },
  clocked_out: { cls: "bg-gray-100 text-gray-700 border-gray-300" },
  sick: { cls: "bg-orange-100 text-orange-700 border-orange-300" },
  vacation: { cls: "bg-blue-100 text-blue-700 border-blue-300" },
  absent: { cls: "bg-red-50 text-red-600 border-red-200" },
};

function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function Dashboard() {
  const { t } = useLang();
  const { user } = useAuth();
  const { atLeast } = usePlan();
  const isAdmin = user?.role === "admin";

  const attLabel = (status: AttendanceLiveRow["status"]): string => ({
    clocked_in: t("attStatusIn"),
    clocked_out: t("attStatusOut"),
    sick: t("attStatusSick"),
    vacation: t("attStatusVac"),
    absent: t("attStatusAbsent"),
  }[status]);

  const { data: summary, isLoading, isError } = useGetDashboardSummary();
  const { data: quoteCounts } = useQuery<Record<string, number>>({
    queryKey: ["/api/quotes/counts"],
    queryFn: async () => {
      const res = await fetch("/api/quotes/counts", { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
  });

  // Admin-only queries
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks/tasks"],
    queryFn: async () => {
      const res = await fetch("/api/tasks/tasks", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 10000,
    enabled: isAdmin && atLeast("standard"),
  });

  const { data: live = [] } = useQuery<AttendanceLiveRow[]>({
    queryKey: ["/api/attendance/live"],
    queryFn: async () => {
      const res = await fetch("/api/attendance/live", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 15000,
    enabled: isAdmin && atLeast("standard"),
  });

  const { data: pendingLeave = [] } = useQuery<PendingLeave[]>({
    queryKey: ["/api/leave/pending"],
    queryFn: async () => {
      const res = await fetch("/api/leave/pending", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAdmin && atLeast("standard"),
  });

  const { data: projects = [] } = useQuery<WorkProject[]>({
    queryKey: ["/api/work/projects"],
    queryFn: async () => {
      const res = await fetch("/api/work/projects", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAdmin && atLeast("standard"),
  });
  const openProjects = projects.filter((p) => p.status !== "completed" && p.status !== "cancelled");

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <h1 className="text-2xl font-bold tracking-tight px-1 pt-2">{t("dashOverview")}</h1>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-64 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive mb-4" />
        <h2 className="text-lg font-semibold">{t("dashFailedLoad")}</h2>
        <p className="text-muted-foreground text-sm">{t("dashRetryLater")}</p>
      </div>
    );
  }

  // Admin task buckets
  const ready = tasks.filter((t) => t.readyStatus === "READY" && t.status === "not_started");
  const blocked = tasks.filter((t) => t.readyStatus === "BLOCKED" && t.status === "not_started");
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const completed = tasks.filter((t) => t.status === "completed");

  return (
    <div className="p-4 space-y-6 pb-24">
      <div className="px-1 pt-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t("dashOverview")}</h1>
      </div>

      {/* ── Stock metrics ── */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/locations">
          <Card className="bg-card border-2 border-border hover:bg-muted/50 transition-colors cursor-pointer active:scale-95 duration-200">
            <CardContent className="p-4 flex flex-col gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <div className="space-y-0.5">
                <p className="text-3xl font-black">{summary.totalLocations}</p>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("dashLocations")}</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/products">
          <Card className="bg-card border-2 border-border hover:bg-muted/50 transition-colors cursor-pointer active:scale-95 duration-200">
            <CardContent className="p-4 flex flex-col gap-2">
              <Package className="h-5 w-5 text-primary" />
              <div className="space-y-0.5">
                <p className="text-3xl font-black">{summary.totalProducts}</p>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("dashProducts")}</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* ── Lite quick action ── */}
      {!atLeast("standard") && (
        <Link href="/scan">
          <div className="rounded-xl bg-primary text-primary-foreground p-4 flex items-center gap-3 cursor-pointer active:scale-95 transition-transform">
            <ScanLine className="h-7 w-7 flex-shrink-0" />
            <div>
              <p className="font-bold text-base">{t("dashScanLocation")}</p>
              <p className="text-xs opacity-75">{t("dashScanLocationSub")}</p>
            </div>
          </div>
        </Link>
      )}

      {quoteCounts && (
        <Card className="border-2 border-purple-200 bg-purple-50/40 dark:bg-purple-500/[0.07]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-purple-800">
              <FileText className="h-4 w-4" /> {t("dashQuotesPipeline")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`grid ${atLeast("standard") ? "grid-cols-4" : "grid-cols-3"} gap-2 mb-3`}>
              {[
                { key: "draft", label: t("statusDraft"), color: "text-slate-700" },
                { key: "sent", label: t("statusSent"), color: "text-blue-700" },
                { key: "approved", label: t("statusApproved"), color: "text-green-700" },
                // "Converted" means a quote became a work order — a Standard/Pro flow
                // Lite cannot perform, so it's hidden to avoid a confusing dead-end.
                ...(atLeast("standard")
                  ? [{ key: "converted", label: t("statusConverted"), color: "text-purple-700" }]
                  : []),
              ].map((s) => (
                <div key={s.key} className="bg-background border border-border rounded-lg p-2 text-center">
                  <p className={`text-xl font-black font-mono ${s.color}`}>{quoteCounts[s.key] ?? 0}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/quotes" className="text-xs font-semibold text-purple-700 bg-purple-100 hover:bg-purple-200 rounded-lg py-2 text-center flex items-center justify-center gap-1">
                <FileText className="h-3.5 w-3.5" /> {t("navQuotes")}
              </Link>
              <Link href="/customers" className="text-xs font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg py-2 text-center flex items-center justify-center gap-1">
                <Users className="h-3.5 w-3.5" /> {t("navCustomers")}
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Admin sections (Standard+ only) ── */}
      {isAdmin && atLeast("standard") && (
        <>
          {/* Open Projects KPI */}
          <Link href="/work/projects">
            <Card className="bg-secondary text-secondary-foreground border-none hover:bg-secondary/90 transition-colors cursor-pointer active:scale-95 duration-200">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center">
                    <FolderKanban className="h-5 w-5 text-primary" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium uppercase tracking-wider text-secondary-foreground/70">{t("dashOpenProjects")}</p>
                    <p className="text-3xl font-black leading-tight">{openProjects.length}</p>
                  </div>
                </div>
                {projects.length > 0 && (
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-secondary-foreground/70">{t("dashTotal")}</p>
                    <p className="text-sm font-bold">{projects.length}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>

          {/* Task Overview */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{t("dashProductionTasks")}</p>
            {tasksLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Link href="/tasks">
                  <div className="bg-card border-2 border-green-200 rounded-xl p-3 cursor-pointer hover:border-green-400 transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="h-4 w-4 text-green-600" />
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">{t("dashReady")}</p>
                    </div>
                    <p className="text-2xl font-black text-green-600">{ready.length}</p>
                  </div>
                </Link>
                <div className="bg-card border-2 border-red-200 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">{t("statusBlocked")}</p>
                  </div>
                  <p className="text-2xl font-black text-red-600">{blocked.length}</p>
                </div>
                <div className="bg-card border-2 border-orange-200 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-4 w-4 text-orange-600" />
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">{t("statusInProgress")}</p>
                  </div>
                  <p className="text-2xl font-black text-orange-600">{inProgress.length}</p>
                </div>
                <div className="bg-card border-2 border-border rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="h-4 w-4 text-green-700" />
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">{t("statusCompleted")}</p>
                  </div>
                  <p className="text-2xl font-black text-green-700">{completed.length}</p>
                </div>
              </div>
            )}
          </div>

          {/* Who's In Today */}
          {live.length > 0 && (() => {
            const counts = live.reduce((acc, r) => {
              acc[r.status] = (acc[r.status] ?? 0) + 1; return acc;
            }, {} as Record<string, number>);
            return (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-primary" /> {t("dashWhosInToday")}
                    </span>
                    <Link href="/attendance/live">
                      <span className="text-[10px] font-bold uppercase text-primary hover:underline">{t("dashViewAll")}</span>
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex gap-2 text-[10px] font-bold flex-wrap">
                    <span className="px-2 py-0.5 rounded border bg-green-100 text-green-700 border-green-300">{t("attStatusIn")} {counts.clocked_in ?? 0}</span>
                    <span className="px-2 py-0.5 rounded border bg-gray-100 text-gray-700 border-gray-300">{t("attStatusOut")} {counts.clocked_out ?? 0}</span>
                    <span className="px-2 py-0.5 rounded border bg-orange-100 text-orange-700 border-orange-300">{t("attStatusSick")} {counts.sick ?? 0}</span>
                    <span className="px-2 py-0.5 rounded border bg-blue-100 text-blue-700 border-blue-300">{t("attStatusVac")} {counts.vacation ?? 0}</span>
                    <span className="px-2 py-0.5 rounded border bg-red-50 text-red-600 border-red-200">{t("attStatusAbsent")} {counts.absent ?? 0}</span>
                  </div>
                  <div className="space-y-1 max-h-[180px] overflow-y-auto">
                    {live.map((r) => {
                      const s = ATTENDANCE_STYLES[r.status];
                      return (
                        <div key={r.userId} className="flex items-center justify-between py-1 px-2 rounded bg-muted/40 border text-[12px]">
                          <span className="font-bold truncate">{r.username}</span>
                          <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${s.cls}`}>{attLabel(r.status)}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Pending Leave Approvals */}
          {pendingLeave.length > 0 && (
            <Link href="/admin/leave-inbox">
              <Card className="border-2 border-amber-200 bg-amber-50/50 dark:bg-amber-500/[0.07] cursor-pointer hover:border-amber-400 transition-colors active:scale-95">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center">
                      <Inbox className="h-4 w-4 text-amber-700" />
                    </div>
                    <div>
                      <p className="font-bold text-amber-900 text-sm">{t("dashLeaveRequests")}</p>
                      <p className="text-xs text-amber-700">{pendingLeave.length} {t("dashPendingApproval")}</p>
                    </div>
                  </div>
                  <div className="space-y-0.5 text-right max-w-[160px]">
                    {pendingLeave.slice(0, 2).map((r) => (
                      <p key={r.id} className="text-[11px] text-amber-800 truncate">
                        {r.username} · {fmtDate(r.startDate)}{r.startDate !== r.endDate ? `–${fmtDate(r.endDate)}` : ""}
                      </p>
                    ))}
                    {pendingLeave.length > 2 && (
                      <p className="text-[11px] text-amber-700">+{pendingLeave.length - 2} more</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Blocked Tasks */}
          {blocked.length > 0 && (
            <Card className={`border-2 ${blocked.some((t) => t.isOverdue) ? "border-red-400 bg-red-50 dark:bg-red-500/[0.07]" : "border-red-200 bg-red-50/50 dark:bg-red-500/[0.07]"}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-red-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /> {t("dashBlockedTasks")} ({blocked.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[180px] overflow-y-auto">
                  {blocked.map((task) => (
                    <div key={task.id} className={`p-2 rounded border-l-4 text-[11px] ${task.isOverdue ? "bg-red-200 border-red-700" : "bg-white border-red-500"}`}>
                      <div className="flex items-start justify-between gap-1 mb-0.5">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold">{task.procedureName}</p>
                          <p className="text-[10px] text-muted-foreground">{task.itemName}</p>
                        </div>
                        {task.priority === "urgent" && <Flag className="h-3 w-3 text-red-700 flex-shrink-0" />}
                      </div>
                      <p className={`text-[10px] font-medium ${task.isOverdue ? "text-red-700" : "text-red-600"}`}>
                        {task.blockedReason}
                      </p>
                      <div className="flex items-center gap-1 text-[10px] mt-0.5">
                        <Calendar className="h-3 w-3" />
                        <span className={task.isOverdue ? "font-bold text-red-700" : "text-muted-foreground"}>
                          {new Date(task.deadline).toLocaleDateString()}{task.isOverdue ? " (OVERDUE)" : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── Low stock & activity (all admins/supervisors) ── */}
      {summary.lowStockProducts.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {t("dashLowStockAlerts")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(summary.lowStockProducts as unknown as Array<{ id: number; name: string; category: string; quantityNeeded: number | null; flaggedBy: string | null }>).slice(0, 3).map((flag) => (
                <div key={flag.id} className="flex justify-between items-center bg-background rounded-lg p-3 shadow-sm border border-border">
                  <div>
                    <p className="font-semibold text-sm">{flag.name}</p>
                    {flag.category && <p className="text-xs text-muted-foreground">{flag.category}</p>}
                  </div>
                  <div className="text-right">
                    {flag.quantityNeeded ? <p className="font-bold text-amber-600">×{flag.quantityNeeded}</p> : null}
                    {flag.flaggedBy && <p className="text-[10px] text-muted-foreground">by {flag.flaggedBy}</p>}
                  </div>
                </div>
              ))}
              {summary.lowStockProducts.length > 3 && (
                <Link href="/admin/suppliers" className="text-xs font-semibold text-primary block text-center mt-2">
                  View all {summary.lowStockProducts.length} flagged
                </Link>
              )}
              <Link href="/sourcing" className="mt-1 flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-secondary hover:bg-secondary/90 rounded-lg py-2.5">
                <Scale className="h-3.5 w-3.5" /> {t("dashGetQuotes")}
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            {t("dashRecentActivity")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {summary.recentActivity.slice(0, 5).map((entry) => (
              <div key={entry.id} className="flex gap-3 relative before:absolute before:left-[11px] before:top-6 before:bottom-[-16px] before:w-[2px] before:bg-muted last:before:hidden">
                <div className="mt-1">
                  <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold z-10 relative">
                    {atLeast("standard") ? (entry.delta > 0 ? "+" : "") : <span className="h-2 w-2 rounded-full bg-primary" />}
                  </div>
                </div>
                <div className="flex-1 pb-1">
                  <div className="flex justify-between items-start">
                    <p className="text-sm font-semibold">{entry.productName}</p>
                    {atLeast("standard") && (
                      <span className={`text-sm font-bold ${entry.delta > 0 ? "text-green-600" : "text-destructive"}`}>
                        {entry.delta > 0 ? "+" : ""}{entry.delta}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center mt-0.5 text-xs text-muted-foreground">
                    <span>{t("dashLoc")}: {entry.locationName || entry.locationId}</span>
                    <span>{new Date(entry.changedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
              </div>
            ))}
            {summary.recentActivity.length === 0 && (
              <p className="text-sm text-muted-foreground py-2 text-center">{t("dashNoRecentActivity")}</p>
            )}
          </div>
          {summary.recentActivity.length > 0 && (
            <Link href="/history" className="text-xs font-semibold text-primary block text-center mt-4">
              {t("dashViewFullHistory")}
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
