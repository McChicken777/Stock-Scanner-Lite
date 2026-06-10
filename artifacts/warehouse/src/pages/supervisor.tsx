import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useLang } from "@/contexts/lang";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle, Calendar, CheckSquare, Clock, Flag, MoreVertical, PackageCheck,
  SkipForward, Truck, User, UserCog, Zap, MapPin,
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
  roleId: number | null;
  roleName: string | null;
  durationEstimate: number | null;
  status: "not_started" | "in_progress";
}

interface RoleOption { id: number; name: string }

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

interface UnloggedPart {
  stepId: number;
  stepName: string;
  itemName: string;
  projectId: number;
  projectName: string;
  deadline: string;
  lastWorker: string | null;
  completedAt: string | null;
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

function StepActionsMenu({
  step,
  roles,
  projectPriority,
}: {
  step: DailyPlanStep;
  roles: RoleOption[];
  projectPriority: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useLang();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/work/supervisor/daily-plan"] });
    queryClient.invalidateQueries({ queryKey: ["/api/work/supervisor/bottlenecks"] });
    queryClient.invalidateQueries({ queryKey: [`/api/work/projects/${step.projectId}`] });
  };

  const handleErr = (err: unknown) =>
    toast({ title: err instanceof Error ? err.message : "Action failed", variant: "destructive" });

  const reassignMutation = useMutation({
    mutationFn: async (roleId: number | null) => {
      const r = await fetch(`/api/work/steps/${step.id}/role`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Failed to reassign");
      return d;
    },
    onSuccess: () => { invalidate(); toast({ title: "Step reassigned" }); },
    onError: handleErr,
  });

  const skipMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/work/steps/${step.id}/skip`, {
        method: "PATCH", credentials: "include",
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Failed to skip");
      return d;
    },
    onSuccess: () => { invalidate(); toast({ title: "Step skipped" }); },
    onError: handleErr,
  });

  const urgentMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/work/projects/${step.projectId}/priority`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: "urgent" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Failed to mark urgent");
      return d;
    },
    onSuccess: () => { invalidate(); toast({ title: "Project marked urgent" }); },
    onError: handleErr,
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Step actions"
          onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0 p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()} className="w-52">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {t("supervisorChangeRole")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <UserCog className="h-4 w-4 mr-2" /> {t("supervisorChangeRole")}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="max-h-72 overflow-auto">
              <DropdownMenuItem
                disabled={reassignMutation.isPending || step.roleId === null}
                onClick={() => reassignMutation.mutate(null)}
              >
                {t("supervisorUnassigned")} {step.roleId === null && "✓"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {roles.length === 0 && (
                <DropdownMenuItem disabled>{t("supervisorNoRoles")}</DropdownMenuItem>
              )}
              {roles.map((r) => (
                <DropdownMenuItem
                  key={r.id}
                  disabled={reassignMutation.isPending || step.roleId === r.id}
                  onClick={() => reassignMutation.mutate(r.id)}
                >
                  {r.name} {step.roleId === r.id && "✓"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuItem
          disabled={urgentMutation.isPending || projectPriority === "urgent"}
          onClick={() => urgentMutation.mutate()}
        >
          <Zap className="h-4 w-4 mr-2 text-rose-500" />
          {t("supervisorMarkUrgent")} {projectPriority === "urgent" && "✓"}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={skipMutation.isPending}
          onClick={() => {
            if (window.confirm(`Skip "${step.name}"? It will be marked completed without a time log.`)) {
              skipMutation.mutate();
            }
          }}
          className="text-amber-700 focus:text-amber-700"
        >
          <SkipForward className="h-4 w-4 mr-2" /> {t("supervisorSkipStep")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DailyPlanSection({ plan, roles }: { plan: DailyPlan; roles: RoleOption[] }) {
  const [, navigate] = useLocation();
  const { t } = useLang();

  if (plan.totalReady + plan.totalInProgress === 0) {
    return (
      <div className="text-center py-12 bg-muted/30 rounded-xl border border-dashed">
        <CheckSquare className="h-8 w-8 text-green-500 mx-auto mb-2" />
        <p className="font-semibold text-muted-foreground">{t("supervisorAllClear")}</p>
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
              {group.roleName ?? t("supervisorUnassigned")}
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
                <div
                  key={step.id}
                  className={`rounded-lg border px-3 py-2.5 space-y-1 ${
                    step.status === "in_progress"
                      ? "bg-orange-50 border-orange-200"
                      : dl.overdue ? "bg-red-50 border-red-200" : "bg-card border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      className="flex-1 min-w-0 text-left active:scale-[0.99] transition-transform"
                      onClick={() => navigate(`/work/projects/${step.projectId}`)}
                    >
                      <p className="text-sm font-semibold leading-tight truncate">{step.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{step.itemName} · {step.projectName}</p>
                    </button>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {step.status === "in_progress" && (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" /> Active
                        </span>
                      )}
                      <StepActionsMenu step={step} roles={roles} projectPriority={step.priority} />
                    </div>
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
                </div>
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
  const { t } = useLang();
  const hasIssues = report.roleBottlenecks.length > 0 || report.overdueProjects.length > 0
    || report.allBlockedItems.length > 0 || (report.inboundDelays?.length ?? 0) > 0;

  if (!hasIssues) {
    return (
      <div className="text-center py-10 bg-green-50 rounded-xl border border-green-200">
        <p className="font-semibold text-green-700">{t("supervisorNoBottlenecks")}</p>
        <p className="text-xs text-green-600 mt-1">{t("supervisorAllFlowing")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {report.overdueProjects.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-red-600 flex items-center gap-1.5">
            <Flag className="h-3.5 w-3.5" /> {t("supervisorOverProjects")} ({report.overdueProjects.length})
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
            <AlertTriangle className="h-3.5 w-3.5" /> {t("supervisorRoleQueuePressure")}
          </h3>
          <div className="space-y-1.5">
            {report.roleBottlenecks.map((b) => (
              <div key={b.roleId ?? "unassigned"} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{b.roleName ?? t("supervisorUnassigned")}</p>
                  <div className="flex gap-2 text-xs">
                    <span className="font-bold text-green-700">{b.readyCount} {t("statusReady")}</span>
                    <span className="font-bold text-red-600">{b.blockedCount} {t("statusBlocked")}</span>
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
            <AlertTriangle className="h-3.5 w-3.5" /> {t("supervisorAllBlockedItems")} ({report.allBlockedItems.length})
          </h3>
          <p className="text-xs text-muted-foreground">{t("supervisorAllBlockedDesc")}</p>
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
            <Truck className="h-3.5 w-3.5" /> {t("supervisorStalledInbound")} ({report.inboundDelays.length})
          </h3>
          <p className="text-xs text-muted-foreground">{t("supervisorStalledDesc")}</p>
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

function UnloggedPartsSection({ parts }: { parts: UnloggedPart[] }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { t } = useLang();

  const copyReminder = (part: UnloggedPart, e: React.MouseEvent) => {
    e.stopPropagation();
    const msg = `Reminder: Please log the location for "${part.stepName}" on "${part.itemName}" (project: ${part.projectName}). Open the task in the app and tap "Log Location".`;
    navigator.clipboard.writeText(msg).then(() => {
      toast({ title: "Reminder copied", description: `Message for ${part.lastWorker ?? "worker"} copied to clipboard` });
    }).catch(() => {
      toast({ title: msg.slice(0, 80), description: "Copy manually if clipboard is unavailable" });
    });
  };

  if (parts.length === 0) {
    return (
      <div className="text-center py-10 bg-green-50 rounded-xl border border-green-200">
        <p className="font-semibold text-green-700">{t("supervisorAllPartsLogged")}</p>
        <p className="text-xs text-green-600 mt-1">{t("supervisorNoUnlogged")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {t("supervisorUnloggedDesc")}
      </p>
      {parts.map((part) => {
        const completedAgo = part.completedAt
          ? (() => {
              const mins = Math.round((Date.now() - new Date(part.completedAt).getTime()) / 60000);
              if (mins < 60) return `${mins}m ago`;
              if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
              return `${Math.round(mins / 1440)}d ago`;
            })()
          : null;

        return (
          <div
            key={part.stepId}
            className="rounded-xl border-2 border-amber-200 bg-amber-50 px-3 py-2.5 space-y-1"
          >
            <button
              className="w-full text-left active:scale-[0.99] transition-transform"
              onClick={() => navigate(`/work/projects/${part.projectId}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{part.itemName}</p>
                  <p className="text-xs text-muted-foreground truncate">{part.stepName} · {part.projectName}</p>
                </div>
                <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-full">
                  <MapPin className="h-3 w-3" /> No location
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground mt-1">
                {part.lastWorker && <span className="flex items-center gap-0.5"><User className="h-3 w-3" />{part.lastWorker}</span>}
                {completedAgo && <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{completedAgo}</span>}
              </div>
            </button>
            <div className="flex justify-end pt-1">
              <button
                onClick={(e) => copyReminder(part, e)}
                className="text-[11px] font-bold text-amber-700 border border-amber-300 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg transition-colors"
              >
                {t("supervisorRemindWorker")}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function SupervisorPage() {
  const { user } = useAuth();
  const { t } = useLang();
  const [tab, setTab] = useState<"plan" | "bottlenecks" | "unlogged">("plan");

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

  const { data: unloggedParts = [], isLoading: unloggedLoading } = useQuery<UnloggedPart[]>({
    queryKey: ["/api/work/supervisor/unlogged-parts"],
    queryFn: () => apiFetch("/api/work/supervisor/unlogged-parts"),
    refetchInterval: 60000,
  });

  const { data: roles = [] } = useQuery<RoleOption[]>({
    queryKey: ["/api/tasks/roles"],
    queryFn: () => apiFetch("/api/tasks/roles"),
  });

  if (!user?.isSupervisor && user?.role !== "admin") {
    return <div className="p-6 text-center text-muted-foreground">{t("supervisorAccessOnly")}</div>;
  }

  const overdueCount = bottlenecks?.overdueProjects.length ?? 0;
  const bottleneckCount = (bottlenecks?.roleBottlenecks.length ?? 0)
    + (bottlenecks?.allBlockedItems.length ?? 0)
    + (bottlenecks?.inboundDelays?.length ?? 0);

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="pt-2">
        <h1 className="text-2xl font-black">{t("supervisorTitle")}</h1>
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
          {t("supervisorSubtitle")}
        </p>
      </div>

      <div className="flex gap-1 bg-muted/50 border rounded-xl p-1">
        <button
          onClick={() => setTab("plan")}
          className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            tab === "plan" ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("jobsDailyPlan")}
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
          {t("jobsBottlenecks")}
          {(overdueCount + bottleneckCount) > 0 && (
            <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold">
              {overdueCount + bottleneckCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("unlogged")}
          className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            tab === "unlogged" ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("jobsUnlogged")}
          {unloggedParts.length > 0 && (
            <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold">
              {unloggedParts.length}
            </span>
          )}
        </button>
      </div>

      {tab === "plan" ? (
        planLoading
          ? <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
          : plan ? <DailyPlanSection plan={plan} roles={roles} /> : null
      ) : tab === "bottlenecks" ? (
        bottlenecksLoading
          ? <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
          : bottlenecks ? <BottlenecksSection report={bottlenecks} /> : null
      ) : (
        unloggedLoading
          ? <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
          : <UnloggedPartsSection parts={unloggedParts} />
      )}
    </div>
  );
}
