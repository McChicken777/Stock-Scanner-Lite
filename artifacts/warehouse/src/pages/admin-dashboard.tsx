import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle2, Clock, Zap, Users, Wrench, Calendar, Flag, UserCheck, BookTemplate } from "lucide-react";
import { Link } from "wouter";

interface AttendanceLiveRow {
  userId: number;
  username: string;
  role: string;
  status: "clocked_in" | "clocked_out" | "sick" | "vacation" | "absent";
  clockIn: string | null;
  workSeconds: number;
  note: string | null;
}

async function fetchLive(): Promise<AttendanceLiveRow[]> {
  const res = await fetch("/api/attendance/live", { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

const STATUS_STYLES: Record<AttendanceLiveRow["status"], { label: string; cls: string }> = {
  clocked_in: { label: "In", cls: "bg-green-100 text-green-700 border-green-300" },
  clocked_out: { label: "Out", cls: "bg-gray-100 text-gray-700 border-gray-300" },
  sick: { label: "Sick", cls: "bg-orange-100 text-orange-700 border-orange-300" },
  vacation: { label: "Vacation", cls: "bg-blue-100 text-blue-700 border-blue-300" },
  absent: { label: "Absent", cls: "bg-red-50 text-red-600 border-red-200" },
};

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

async function fetchTasks(): Promise<Task[]> {
  const res = await fetch("/api/tasks/tasks", { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const { data: tasks = [], isLoading, isError, error } = useQuery({
    queryKey: ["/api/tasks/tasks"],
    queryFn: fetchTasks,
    refetchInterval: 10000,
  });
  const { data: live = [] } = useQuery({
    queryKey: ["/api/attendance/live"],
    queryFn: fetchLive,
    refetchInterval: 15000,
    enabled: user?.role === "admin",
  });

  if (user?.role !== "admin") {
    return <div className="p-6 text-center text-muted-foreground">Admin access required</div>;
  }

  if (isError) {
    return (
      <div className="p-6 text-center">
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
          <AlertCircle className="h-8 w-8 text-red-600 mx-auto mb-2" />
          <p className="text-red-700 font-bold">Failed to load dashboard</p>
          <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      </div>
    );
  }

  const ready = tasks.filter((t) => t.readyStatus === "READY" && t.status === "not_started");
  const blocked = tasks.filter((t) => t.readyStatus === "BLOCKED" && t.status === "not_started");
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const completed = tasks.filter((t) => t.status === "completed");

  return (
    <div className="p-4 space-y-4 pb-24">
      <div>
        <h1 className="text-2xl font-black">Admin Dashboard</h1>
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
          Full company overview
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/tasks">
          <div className="bg-card border-2 border-border rounded-lg p-3 cursor-pointer hover:border-primary transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-green-600" />
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Ready</p>
            </div>
            <p className="text-2xl font-black text-green-600">{ready.length}</p>
          </div>
        </Link>

        <div className="bg-card border-2 border-red-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Blocked</p>
          </div>
          <p className="text-2xl font-black text-red-600">{blocked.length}</p>
        </div>

        <div className="bg-card border-2 border-orange-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-orange-600" />
            <p className="text-[10px] font-bold uppercase text-muted-foreground">In Progress</p>
          </div>
          <p className="text-2xl font-black text-orange-600">{inProgress.length}</p>
        </div>

        <div className="bg-card border-2 border-green-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-4 w-4 text-green-700" />
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Completed</p>
          </div>
          <p className="text-2xl font-black text-green-700">{completed.length}</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-card border-2 border-border rounded-lg p-3 space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quick Access</p>
        <div className="grid grid-cols-2 gap-2">
          <Link href="/admin/users">
            <button className="w-full flex items-center justify-center gap-1 p-2 bg-blue-50 border-2 border-blue-200 rounded-lg hover:border-blue-400 transition-colors text-center text-[11px] font-bold">
              <Users className="h-4 w-4 text-blue-600" />
              <span>Users</span>
            </button>
          </Link>
          <Link href="/admin/roles">
            <button className="w-full flex items-center justify-center gap-1 p-2 bg-purple-50 border-2 border-purple-200 rounded-lg hover:border-purple-400 transition-colors text-center text-[11px] font-bold">
              <Wrench className="h-4 w-4 text-purple-600" />
              <span>Roles</span>
            </button>
          </Link>
          <Link href="/admin/procedures">
            <button className="w-full flex items-center justify-center gap-1 p-2 bg-indigo-50 border-2 border-indigo-200 rounded-lg hover:border-indigo-400 transition-colors text-center text-[11px] font-bold">
              <Wrench className="h-4 w-4 text-indigo-600" />
              <span>Procedures</span>
            </button>
          </Link>
          <Link href="/work/templates">
            <button className="w-full flex items-center justify-center gap-1 p-2 bg-emerald-50 border-2 border-emerald-200 rounded-lg hover:border-emerald-400 transition-colors text-center text-[11px] font-bold">
              <BookTemplate className="h-4 w-4 text-emerald-600" />
              <span>Templates</span>
            </button>
          </Link>
        </div>
      </div>

      {/* Who's In Today */}
      {live.length > 0 && (() => {
        const counts = live.reduce((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);
        return (
          <div className="bg-card border-2 border-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <UserCheck className="h-4 w-4" /> Who's In Today
              </p>
              <Link href="/attendance/live">
                <button className="text-[10px] font-bold uppercase text-primary hover:underline">View all</button>
              </Link>
            </div>
            <div className="flex gap-2 text-[10px] font-bold flex-wrap">
              <span className="px-2 py-0.5 rounded border bg-green-100 text-green-700 border-green-300">In {counts.clocked_in ?? 0}</span>
              <span className="px-2 py-0.5 rounded border bg-gray-100 text-gray-700 border-gray-300">Out {counts.clocked_out ?? 0}</span>
              <span className="px-2 py-0.5 rounded border bg-orange-100 text-orange-700 border-orange-300">Sick {counts.sick ?? 0}</span>
              <span className="px-2 py-0.5 rounded border bg-blue-100 text-blue-700 border-blue-300">Vac {counts.vacation ?? 0}</span>
              <span className="px-2 py-0.5 rounded border bg-red-50 text-red-600 border-red-200">Absent {counts.absent ?? 0}</span>
            </div>
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {live.map((r) => {
                const s = STATUS_STYLES[r.status];
                return (
                  <div key={r.userId} className="flex items-center justify-between py-1 px-2 rounded bg-background border text-[12px]">
                    <span className="font-bold truncate">{r.username}</span>
                    <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${s.cls}`}>{s.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Blocked Tasks Section */}
      {blocked.length > 0 && (
        <div className={`border-2 rounded-lg p-3 space-y-2 ${
          blocked.some((t) => t.isOverdue) ? "bg-red-100 border-red-400" : "bg-red-50 border-red-200"
        }`}>
          <p className="text-xs font-bold uppercase text-red-700">⚠️ Blocked Tasks ({blocked.length})</p>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {blocked.map((task) => (
              <div
                key={task.id}
                className={`p-2 rounded border-l-4 text-[11px] ${
                  task.isOverdue ? "bg-red-200 border-red-700" : "bg-white border-red-500"
                }`}
              >
                <div className="flex items-start justify-between gap-1 mb-1">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold">{task.procedureName}</p>
                    <p className="text-[10px] text-muted-foreground">{task.itemName}</p>
                  </div>
                  {task.priority === "urgent" && <Flag className="h-3 w-3 text-red-700 flex-shrink-0" />}
                </div>
                <p className={`text-[10px] font-medium ${task.isOverdue ? "text-red-700" : "text-red-600"}`}>
                  {task.blockedReason}
                </p>
                <div className="flex items-center gap-2 text-[10px] mt-1">
                  <Calendar className="h-3 w-3" />
                  <span className={task.isOverdue ? "font-bold text-red-700" : "text-muted-foreground"}>
                    {new Date(task.deadline).toLocaleDateString()}
                    {task.isOverdue ? " (OVERDUE)" : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ready Tasks */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : ready.length > 0 ? (
        <div className={`border-2 rounded-lg p-3 space-y-2 ${
          ready.some((t) => t.isOverdue) ? "bg-orange-50 border-orange-200" : "bg-green-50 border-green-200"
        }`}>
          <p className={`text-xs font-bold uppercase ${ready.some((t) => t.isOverdue) ? "text-orange-700" : "text-green-700"}`}>
            ✓ Ready Tasks ({ready.length})
          </p>
          <div className="space-y-1 max-h-[150px] overflow-y-auto">
            {ready.slice(0, 5).map((task) => (
              <div
                key={task.id}
                className={`p-2 rounded border-l-4 text-[11px] ${
                  task.isOverdue
                    ? "bg-red-100 border-red-500"
                    : task.priority === "urgent"
                      ? "bg-orange-100 border-orange-500"
                      : "bg-white border-green-500"
                }`}
              >
                <div className="flex items-start justify-between gap-1 mb-0.5">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold">{task.procedureName}</p>
                    <p className="text-[10px] text-muted-foreground">{task.itemName}</p>
                  </div>
                  {task.priority === "urgent" && <Flag className="h-3 w-3 text-red-600 flex-shrink-0" />}
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <Calendar className="h-3 w-3" />
                  <span className={task.isOverdue ? "font-bold text-red-700" : "text-muted-foreground"}>
                    {new Date(task.deadline).toLocaleDateString()}
                    {task.isOverdue ? " (OVERDUE)" : ""}
                  </span>
                </div>
              </div>
            ))}
            {ready.length > 5 && (
              <p className="text-[10px] text-muted-foreground py-1">+{ready.length - 5} more</p>
            )}
          </div>
        </div>
      ) : null}

      {/* Stats */}
      {tasks.length > 0 && (
        <div className="bg-muted/30 border-2 border-border rounded-lg p-3 text-[11px] space-y-1">
          <p className="font-bold">Company Statistics</p>
          <p>Total Tasks: <span className="font-bold">{tasks.length}</span></p>
          <p>Completion Rate: <span className="font-bold">{((completed.length / tasks.length) * 100).toFixed(0)}%</span></p>
          <p>Blocked Rate: <span className="font-bold">{((blocked.length / tasks.length) * 100).toFixed(0)}%</span></p>
        </div>
      )}
    </div>
  );
}
