import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, Calendar, CheckSquare, Clock, Flag, PackageCheck, Truck, User, Zap,
} from "lucide-react";

interface DailyPlanStep {
  id: number;
  name: string;
  itemName: string;
  itemId: number;
  projectName: string;
  projectId: number;
  deadline: string;
  priority: string;
  roleName: string | null;
  durationEstimate: number | null;
  status: "not_started" | "in_progress";
}

interface RoleGroup {
  roleId: number | null;
  roleName: string | null;
  steps: DailyPlanStep[];
  totalMinutes: number;
  overCapacity: boolean;
}

interface DailyPlan {
  roleGroups: RoleGroup[];
  totalReady: number;
  totalInProgress: number;
}

interface Bottleneck {
  roleId: number | null;
  roleName: string | null;
  blockedCount: number;
  readyCount: number;
}

interface InboundDelay {
  id: number;
  projectId: number | null;
  projectName: string | null;
  status: "expected" | "arrived";
  daysPending: number;
}

interface BottleneckReport {
  roleBottlenecks: Bottleneck[];
  overdueProjects: { id: number; name: string; deadline: string; priority: string }[];
  allBlockedItems: { id: number; name: string; projectName: string; blockedStep: string }[];
  inboundDelays: InboundDelay[];
}

async function apiFetch(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
  return res.json();
}

const priorityColors: Record<string, string> = {
  urgent: "bg-rose-100 text-rose-700 border-rose-300",
  high: "bg-orange-100 text-orange-700 border-orange-300",
  normal: "bg-blue-100 text-blue-700 border-blue-300",
  low: "bg-gray-100 text-gray-600 border-gray-300",
};

function formatDeadline(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, overdue: true };
  if (diff === 0) return { label: "Due today", overdue: false };
  if (diff === 1) return { label: "Due tomorrow", overdue: false };
  return { label: `Due in ${diff}d`, overdue: false };
}

function DailyPlanSection({ plan }: { plan: DailyPlan }) {
  const [, navigate] = useLocation();

  if (plan.totalReady + plan.totalInProgress === 0) {
    return (
      <div className="text-center py-12 bg-muted/30 rounded-xl border border-dashed">
        <CheckSquare className="h-8 w-8 text-green-500 mx-auto mb-2" />
        <p className="font-semibold text-muted-foreground">All clear — no pending steps</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {plan.roleGroups.map((group) => (
        <div key={group.roleId ?? "unassigned"} className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className={`text-sm font-bold uppercase tracking-wider flex items-center gap-1.5 ${group.overCapacity ? "text-red-600" : "text-foreground"}`}>
              <User className="h-3.5 w-3.5 text-blue-500" />
              {group.roleName ?? "Unassigned"}
              {group.overCapacity && <Zap className="h-3.5 w-3.5 text-red-500" aria-label="Over 8h capacity" />}
            </h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-semibold">{group.steps.length} step{group.steps.length !== 1 ? "s" : ""}</span>
              {group.totalMinutes > 0 && (
                <span className={`flex items-center gap-0.5 ${group.overCapacity ? "text-red-600 font-bold" : ""}`}>
                  <Clock className="h-3 w-3" /> ~{group.totalMinutes >= 60 ? `${Math.round(group.totalMinutes / 60 * 10) / 10}h` : `${group.totalMinutes}m`}
                  {group.overCapacity && " ⚠"}
                </span>
              )}
            </div>
          </div>
          {group.overCapacity && (
            <p className="text-[11px] text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
              Over 8h of work queued for this role — consider re-assigning some steps.
            </p>
          )}
          <div className="space-y-1.5">
            {group.steps.map((step) => {
              const dl = formatDeadline(step.deadline);
              return (
                <button
                  key={step.id}
                  onClick={() => navigate(`/work/projects/${step.projectId}`)}
                  className={`w-full text-left rounded-lg border px-3 py-2.5 space-y-1 transition-colors active:scale-[0.99] ${
                    step.status === "in_progress"
                      ? "bg-orange-50 border-orange-200"
                      : dl.overdue ? "bg-red-50 border-red-200" : "bg-card border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-tight truncate">{step.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{step.itemName} · {step.projectName}</p>
                    </div>
                    {step.status === "in_progress" && (
                      <span className="flex-shrink-0 flex items-center gap-0.5 text-[10px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" /> Active
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold capitalize border ${priorityColors[step.priority] ?? "bg-gray-100 text-gray-600"}`}>
                      {step.priority}
                    </span>
                    <span className={`text-[10px] flex items-center gap-0.5 ${dl.overdue ? "text-red-600 font-bold" : "text-muted-foreground"}`}>
                      <Calendar className="h-3 w-3" /> {dl.label}
                    </span>
                    {step.durationEstimate && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Clock className="h-3 w-3" /> {step.durationEstimate}m
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function BottlenecksSection({ report }: { report: BottleneckReport }) {
  const [, navigate] = useLocation();
  const hasIssues = report.roleBottlenecks.length > 0 || report.overdueProjects.length > 0
    || report.allBlockedItems.length > 0 || (report.inboundDelays?.length ?? 0) > 0;

  if (!hasIssues) {
    return (
      <div className="text-center py-10 bg-green-50 rounded-xl border border-green-200">
        <p className="font-semibold text-green-700">No bottlenecks detected</p>
        <p className="text-xs text-green-600 mt-1">All projects are flowing normally.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {report.overdueProjects.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-red-600 flex items-center gap-1.5">
            <Flag className="h-3.5 w-3.5" /> Overdue Projects ({report.overdueProjects.length})
          </h3>
          <div className="space-y-1.5">
            {report.overdueProjects.map((p) => {
              const dl = formatDeadline(p.deadline);
              return (
                <div key={p.id} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="text-xs text-red-600 font-medium">{dl.label}</p>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold capitalize border flex-shrink-0 ${priorityColors[p.priority] ?? ""}`}>
                    {p.priority}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {report.roleBottlenecks.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Role Queue Pressure
          </h3>
          <div className="space-y-1.5">
            {report.roleBottlenecks.map((b) => (
              <div key={b.roleId ?? "unassigned"} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{b.roleName ?? "Unassigned"}</p>
                  <div className="flex gap-2 text-xs">
                    <span className="font-bold text-green-700">{b.readyCount} ready</span>
                    <span className="font-bold text-red-600">{b.blockedCount} blocked</span>
                  </div>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-amber-200 overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (b.blockedCount / Math.max(1, b.readyCount + b.blockedCount)) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.allBlockedItems.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> All-Blocked Items ({report.allBlockedItems.length})
          </h3>
          <p className="text-xs text-muted-foreground">Items where every remaining step is blocked</p>
          <div className="space-y-1.5">
            {report.allBlockedItems.map((item) => (
              <div key={item.id} className="rounded-lg border px-3 py-2.5 bg-card">
                <p className="text-sm font-semibold truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground truncate">{item.projectName}</p>
                <p className="text-xs text-red-600 mt-0.5">Waiting: {item.blockedStep}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {(report.inboundDelays?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-purple-700 flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5" /> Stalled Inbound ({report.inboundDelays.length})
          </h3>
          <p className="text-xs text-muted-foreground">Pallets unrouted for 2+ days</p>
          <div className="space-y-1.5">
            {report.inboundDelays.map((d) => (
              <button
                key={d.id}
                onClick={() => navigate("/work/inbound")}
                className="w-full text-left rounded-lg border border-purple-200 bg-purple-50 px-3 py-2.5 flex items-center justify-between gap-2 active:scale-[0.99] transition-transform"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{d.projectName ?? "Manual entry"}</p>
                  <p className="text-xs text-purple-700 flex items-center gap-1 mt-0.5">
                    {d.status === "arrived"
                      ? <PackageCheck className="h-3 w-3" />
                      : <Truck className="h-3 w-3" />
                    }
                    {d.status === "arrived" ? "Arrived, not routed" : "Expected, not arrived"} · {d.daysPending}d waiting
                  </p>
                </div>
                <span className="flex-shrink-0 text-[10px] font-bold text-purple-700 bg-purple-100 border border-purple-200 px-1.5 py-0.5 rounded-full">
                  {d.daysPending}d
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SupervisorPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"plan" | "bottlenecks">("plan");

  const { data: plan, isLoading: planLoading } = useQuery<DailyPlan>({
    queryKey: ["/api/work/supervisor/daily-plan"],
    queryFn: () => apiFetch("/api/work/supervisor/daily-plan"),
    refetchInterval: 30000,
  });

  const { data: bottlenecks, isLoading: bottlenecksLoading } = useQuery<BottleneckReport>({
    queryKey: ["/api/work/supervisor/bottlenecks"],
    queryFn: () => apiFetch("/api/work/supervisor/bottlenecks"),
    refetchInterval: 30000,
  });

  if (!user?.isSupervisor && user?.role !== "admin") {
    return <div className="p-6 text-center text-muted-foreground">Supervisor access only.</div>;
  }

  const overdueCount = bottlenecks?.overdueProjects.length ?? 0;
  const bottleneckCount = (bottlenecks?.roleBottlenecks.length ?? 0)
    + (bottlenecks?.allBlockedItems.length ?? 0)
    + (bottlenecks?.inboundDelays?.length ?? 0);

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="pt-2">
        <h1 className="text-2xl font-black">Supervisor View</h1>
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
          Daily plan &amp; bottleneck alerts
        </p>
      </div>

      <div className="flex gap-1 bg-muted/50 border rounded-xl p-1">
        <button
          onClick={() => setTab("plan")}
          className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            tab === "plan" ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Daily Plan
          {plan && (plan.totalReady + plan.totalInProgress) > 0 && (
            <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold">
              {plan.totalReady + plan.totalInProgress}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("bottlenecks")}
          className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            tab === "bottlenecks" ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Bottlenecks
          {(overdueCount + bottleneckCount) > 0 && (
            <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold">
              {overdueCount + bottleneckCount}
            </span>
          )}
        </button>
      </div>

      {tab === "plan" ? (
        planLoading
          ? <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
          : plan ? <DailyPlanSection plan={plan} /> : null
      ) : (
        bottlenecksLoading
          ? <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
          : bottlenecks ? <BottlenecksSection report={bottlenecks} /> : null
      )}
    </div>
  );
}
