import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle2, Clock, Zap, Users, Wrench } from "lucide-react";
import { Link } from "wouter";

interface Task {
  id: number;
  projectId: number;
  status: "not_started" | "in_progress" | "completed";
  procedureName: string;
  itemName: string;
  roleName: string;
  readyStatus: "READY" | "BLOCKED";
  blockedReason: string;
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
        <div className="grid grid-cols-3 gap-2">
          <Link href="/admin/users">
            <button className="flex items-center justify-center gap-1 p-2 bg-blue-50 border-2 border-blue-200 rounded-lg hover:border-blue-400 transition-colors text-center text-[11px] font-bold">
              <Users className="h-4 w-4 text-blue-600" />
              <span>Users</span>
            </button>
          </Link>
          <Link href="/admin/roles">
            <button className="flex items-center justify-center gap-1 p-2 bg-purple-50 border-2 border-purple-200 rounded-lg hover:border-purple-400 transition-colors text-center text-[11px] font-bold">
              <Wrench className="h-4 w-4 text-purple-600" />
              <span>Roles</span>
            </button>
          </Link>
          <Link href="/admin/procedures">
            <button className="flex items-center justify-center gap-1 p-2 bg-indigo-50 border-2 border-indigo-200 rounded-lg hover:border-indigo-400 transition-colors text-center text-[11px] font-bold">
              <Wrench className="h-4 w-4 text-indigo-600" />
              <span>Procedures</span>
            </button>
          </Link>
        </div>
      </div>

      {/* Blocked Tasks Section */}
      {blocked.length > 0 && (
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 space-y-2">
          <p className="text-xs font-bold uppercase text-red-700">⚠️ Blocked Tasks ({blocked.length})</p>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {blocked.map((task) => (
              <div key={task.id} className="bg-white p-2 rounded border-l-4 border-red-500 text-[11px]">
                <p className="font-bold">{task.procedureName}</p>
                <p className="text-[10px] text-muted-foreground">{task.itemName}</p>
                <p className="text-[10px] text-red-700 font-medium">{task.blockedReason}</p>
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
        <div className="bg-green-50 border-2 border-green-200 rounded-lg p-3 space-y-2">
          <p className="text-xs font-bold uppercase text-green-700">✓ Ready Tasks ({ready.length})</p>
          <div className="space-y-1 max-h-[150px] overflow-y-auto">
            {ready.slice(0, 5).map((task) => (
              <div key={task.id} className="bg-white p-2 rounded border-l-4 border-green-500 text-[11px]">
                <p className="font-bold">{task.procedureName}</p>
                <p className="text-[10px] text-muted-foreground">{task.itemName} • {task.roleName}</p>
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
