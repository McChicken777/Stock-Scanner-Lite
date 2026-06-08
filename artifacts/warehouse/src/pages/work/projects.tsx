import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus, AlertTriangle, Clock, CheckCircle2, User, Zap, ShieldAlert, Flame, Radio,
  Calendar, CheckSquare, Flag, MoreVertical, PackageCheck, SkipForward, Truck, UserCog, MapPin,
  ChevronDown, ChevronUp,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { differenceInDays, isPast } from "date-fns";
import { useToast } from "@/hooks/use-toast";

// ─── Project types ─────────────────────────────────────────────────────────────

interface Project {
  id: number;
  name: string;
  deadline: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: "in_progress" | "completed";
  itemCount: number;
  totalProcedures: number;
  completedProcedures: number;
  inProgressCount: number;
  blockedCount: number;
  activeWorkers: string[];
  itemNames: string[];
  progress: number;
}

interface StationBoard {
  id: number;
  name: string;
  color: string;
  activeSteps: number;
  pendingSteps: number;
  activeWorkers: string[];
  projectNames: string[];
}

// ─── Supervisor types ──────────────────────────────────────────────────────────

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

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function fetchProjects(): Promise<Project[]> {
  const res = await fetch("/api/work/projects", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load projects");
  return res.json();
}

async function apiFetch(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
  return res.json();
}

function urgencyInfo(deadline: string, status: string) {
  if (status === "completed") return { label: "Completed", color: "text-green-600", bg: "border-green-300", badge: null };
  const days = differenceInDays(new Date(deadline), new Date());
  if (isPast(new Date(deadline))) return { label: "OVERDUE", color: "text-red-600", bg: "border-red-400 bg-red-50/40", badge: "overdue" };
  if (days === 0) return { label: "Due today!", color: "text-red-600", bg: "border-red-300 bg-red-50/20", badge: "today" };
  if (days < 3) return { label: `${days}d left`, color: "text-orange-600", bg: "border-orange-300", badge: "soon" };
  if (days < 7) return { label: `${days}d left`, color: "text-amber-600", bg: "border-amber-200", badge: null };
  return { label: `${days}d left`, color: "text-muted-foreground", bg: "border-border", badge: null };
}

const priorityColors: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  normal: "bg-blue-100 text-blue-700 border-blue-200",
  low: "bg-gray-100 text-gray-600 border-gray-200",
};

const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function sortByUrgency(a: Project, b: Project) {
  const da = differenceInDays(new Date(a.deadline), new Date());
  const db2 = differenceInDays(new Date(b.deadline), new Date());
  if (da !== db2) return da - db2;
  return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
}

function formatDeadline(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, overdue: true };
  if (diff === 0) return { label: "Due today", overdue: false };
  if (diff === 1) return { label: "Due tomorrow", overdue: false };
  return { label: `Due in ${diff}d`, overdue: false };
}

const DEFAULT_VISIBLE = 5;

// ─── Station strip ─────────────────────────────────────────────────────────────

function StationStrip({ stations }: { stations: StationBoard[] }) {
  if (stations.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1.5">
        <Radio className="h-3 w-3 text-green-500" /> Live Stations
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        {stations.map((s) => {
          const busy = s.activeSteps > 0;
          return (
            <Link key={s.id} href={`/work/queue/${s.id}`}>
              <div className="flex-shrink-0 w-36 rounded-xl border-2 p-3 space-y-1.5 cursor-pointer hover:border-primary/40 transition-colors"
                style={{ borderColor: busy ? s.color + "88" : undefined, backgroundColor: busy ? s.color + "11" : undefined }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold truncate" style={{ color: s.color }}>{s.name}</span>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${busy ? "bg-green-500 animate-pulse" : "bg-gray-300"}`} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {busy ? `${s.activeSteps} active` : "Idle"}{s.pendingSteps > 0 ? ` · ${s.pendingSteps} queued` : ""}
                </p>
                {s.activeWorkers.length > 0 && (
                  <p className="text-[10px] font-semibold truncate" style={{ color: s.color }}>
                    {s.activeWorkers.map((w) => w.split(" ")[0]).join(", ")}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Board card ────────────────────────────────────────────────────────────────

function BoardCard({ project }: { project: Project }) {
  const urgency = urgencyInfo(project.deadline, project.status);
  const priorityBorderColors: Record<string, string> = {
    urgent: "border-l-red-500", high: "border-l-orange-400",
    normal: "border-l-blue-400", low: "border-l-gray-300",
  };
  return (
    <Link href={`/work/projects/${project.id}`}>
      <div className={`bg-card border border-border border-l-4 ${priorityBorderColors[project.priority] ?? priorityBorderColors.normal} rounded-xl p-3 space-y-2 active:opacity-80`}>
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold text-sm leading-tight truncate flex-1">{project.name}</p>
          <span className={`text-[10px] font-bold flex-shrink-0 ${urgency.color}`}>{urgency.label}</span>
        </div>
        <div className="h-1.5 bg-black/10 rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full" style={{ width: `${project.progress}%` }} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {project.blockedCount > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-600">
                <ShieldAlert className="h-3 w-3" />{project.blockedCount}
              </span>
            )}
            {project.activeWorkers.length > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <User className="h-3 w-3" />{project.activeWorkers.map((w) => w.split(" ")[0]).join(", ")}
              </span>
            )}
          </div>
          <span className="text-[10px] font-black text-muted-foreground">{project.progress}%</span>
        </div>
      </div>
    </Link>
  );
}

// ─── Show-more group ───────────────────────────────────────────────────────────

function JobGroup({
  label, labelClass, icon, items, sectionKey, expandedSections, onToggle,
}: {
  label: string;
  labelClass: string;
  icon: React.ReactNode;
  items: Project[];
  sectionKey: string;
  expandedSections: Set<string>;
  onToggle: (key: string) => void;
}) {
  if (items.length === 0) return null;
  const expanded = expandedSections.has(sectionKey);
  const visible = expanded ? items : items.slice(0, DEFAULT_VISIBLE);
  const hiddenCount = items.length - DEFAULT_VISIBLE;

  return (
    <div className="space-y-2">
      <p className={`text-[10px] font-black uppercase tracking-wider px-1 flex items-center gap-1 ${labelClass}`}>
        {icon} {label}
      </p>
      {visible.map((p) => <BoardCard key={p.id} project={p} />)}
      {hiddenCount > 0 && !expanded && (
        <button
          onClick={() => onToggle(sectionKey)}
          className="w-full text-xs font-semibold text-muted-foreground hover:text-foreground border border-dashed rounded-lg py-1.5 flex items-center justify-center gap-1 transition-colors"
        >
          <ChevronDown className="h-3.5 w-3.5" /> Show {hiddenCount} more
        </button>
      )}
      {expanded && items.length > DEFAULT_VISIBLE && (
        <button
          onClick={() => onToggle(sectionKey)}
          className="w-full text-xs font-semibold text-muted-foreground hover:text-foreground border border-dashed rounded-lg py-1.5 flex items-center justify-center gap-1 transition-colors"
        >
          <ChevronUp className="h-3.5 w-3.5" /> Show less
        </button>
      )}
    </div>
  );
}

// ─── Supervisor: step actions menu ─────────────────────────────────────────────

function StepActionsMenu({ step, roles, projectPriority }: {
  step: DailyPlanStep;
  roles: RoleOption[];
  projectPriority: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
      const r = await fetch(`/api/work/steps/${step.id}/skip`, { method: "PATCH", credentials: "include" });
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
          Step actions
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <UserCog className="h-4 w-4 mr-2" /> Change role
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="max-h-72 overflow-auto">
              <DropdownMenuItem
                disabled={reassignMutation.isPending || step.roleId === null}
                onClick={() => reassignMutation.mutate(null)}
              >
                Unassigned {step.roleId === null && "✓"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {roles.length === 0 && <DropdownMenuItem disabled>No roles defined</DropdownMenuItem>}
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
          Mark urgent {projectPriority === "urgent" && "✓"}
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
          <SkipForward className="h-4 w-4 mr-2" /> Skip step
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Supervisor: daily plan ────────────────────────────────────────────────────

function DailyPlanSection({ plan, roles }: { plan: DailyPlan; roles: RoleOption[] }) {
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
              {group.overCapacity && <Zap className="h-3.5 w-3.5 text-red-500" />}
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

// ─── Supervisor: bottlenecks ───────────────────────────────────────────────────

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
                    {d.status === "arrived" ? <PackageCheck className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
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

// ─── Supervisor: unlogged parts ────────────────────────────────────────────────

function UnloggedPartsSection({ parts }: { parts: UnloggedPart[] }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();

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
        <p className="font-semibold text-green-700">All parts have locations logged</p>
        <p className="text-xs text-green-600 mt-1">No completed steps are missing a WIP location in the last 7 days.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Steps completed in the last 7 days without a stored location. Tap a card to go to the project, or tap "Remind" to copy a message for the worker.
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
          <div key={part.stepId} className="rounded-xl border-2 border-amber-200 bg-amber-50 px-3 py-2.5 space-y-1">
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
                Remind worker
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Embedded supervisor section ───────────────────────────────────────────────

function EmbeddedSupervisorSection() {
  const { user } = useAuth();
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

  if (!user?.isSupervisor && user?.role !== "admin") return null;

  const overdueCount = bottlenecks?.overdueProjects.length ?? 0;
  const bottleneckCount = (bottlenecks?.roleBottlenecks.length ?? 0)
    + (bottlenecks?.allBlockedItems.length ?? 0)
    + (bottlenecks?.inboundDelays?.length ?? 0);

  return (
    <div className="space-y-4 border-t-2 border-border pt-5">
      <div>
        <h2 className="text-xl font-black">Supervisor View</h2>
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
        <button
          onClick={() => setTab("unlogged")}
          className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            tab === "unlogged" ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Unlogged
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

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function WorkProjectsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const { data: projects, isLoading } = useQuery({
    queryKey: ["/api/work/projects"],
    queryFn: fetchProjects,
    refetchInterval: 15000,
  });

  const { data: stationBoard = [] } = useQuery<StationBoard[]>({
    queryKey: ["/api/stations/board"],
    queryFn: async () => {
      const r = await fetch("/api/stations/board", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    refetchInterval: 15000,
  });

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-black">Work Orders</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Projects</p>
        </div>
        {isAdmin && (
          <Link href="/work/projects/new">
            <Button size="sm" className="font-bold gap-1">
              <Plus className="h-4 w-4" /> New
            </Button>
          </Link>
        )}
      </div>

      <input
        type="search"
        placeholder="Search jobs…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full h-10 px-3 rounded-xl border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      ) : projects && projects.length > 0 ? (
        <div className="space-y-4">
          <StationStrip stations={stationBoard} />

          {/* Summary chips */}
          {(() => {
            const q = search.trim().toLowerCase(); const filtered = q ? projects.filter((p) => p.name.toLowerCase().includes(q) || p.itemNames.some((n) => n.toLowerCase().includes(q))) : projects;
            const active = filtered.filter((p) => p.status === "in_progress");
            const overdue = active.filter((p) => isPast(new Date(p.deadline)));
            const blocked = active.filter((p) => p.blockedCount > 0);
            return (
              <div className="flex gap-2 flex-wrap">
                <span className="text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-2.5 py-1">{active.length} active</span>
                {overdue.length > 0 && <span className="text-xs font-semibold bg-red-100 text-red-700 border border-red-200 rounded-full px-2.5 py-1">{overdue.length} overdue</span>}
                {blocked.length > 0 && <span className="text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200 rounded-full px-2.5 py-1">{blocked.length} blocked</span>}
              </div>
            );
          })()}

          {/* Jobs grouped by urgency */}
          {(() => {
            const q = search.trim().toLowerCase(); const filtered = q ? projects.filter((p) => p.name.toLowerCase().includes(q) || p.itemNames.some((n) => n.toLowerCase().includes(q))) : projects;
            const active = filtered.filter((p) => p.status === "in_progress").sort(sortByUrgency);
            const overdue = active.filter((p) => isPast(new Date(p.deadline)));
            const today = active.filter((p) => { const d = differenceInDays(new Date(p.deadline), new Date()); return !isPast(new Date(p.deadline)) && d <= 1; });
            const soon = active.filter((p) => { const d = differenceInDays(new Date(p.deadline), new Date()); return d > 1 && d < 7; });
            const normal = active.filter((p) => differenceInDays(new Date(p.deadline), new Date()) >= 7);
            const done = filtered.filter((p) => p.status === "completed");
            return (
              <div className="space-y-4">
                <JobGroup
                  sectionKey="overdue"
                  label="Overdue"
                  labelClass="text-red-600"
                  icon={<Flame className="h-3 w-3" />}
                  items={overdue}
                  expandedSections={expandedSections}
                  onToggle={toggleSection}
                />
                <JobGroup
                  sectionKey="today"
                  label="Due Today / Tomorrow"
                  labelClass="text-orange-600"
                  icon={<AlertTriangle className="h-3 w-3" />}
                  items={today}
                  expandedSections={expandedSections}
                  onToggle={toggleSection}
                />
                <JobGroup
                  sectionKey="week"
                  label="Due This Week"
                  labelClass="text-amber-600"
                  icon={<Clock className="h-3 w-3" />}
                  items={soon}
                  expandedSections={expandedSections}
                  onToggle={toggleSection}
                />
                <JobGroup
                  sectionKey="progress"
                  label="In Progress"
                  labelClass="text-muted-foreground"
                  icon={null}
                  items={normal}
                  expandedSections={expandedSections}
                  onToggle={toggleSection}
                />
                {done.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">Completed</p>
                    {(expandedSections.has("completed") ? done : done.slice(0, DEFAULT_VISIBLE)).map((p) => (
                      <Link key={p.id} href={`/work/projects/${p.id}`}>
                        <div className="bg-card border border-border rounded-xl p-3 opacity-60 flex items-center justify-between">
                          <p className="text-sm font-semibold">{p.name}</p>
                          <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                        </div>
                      </Link>
                    ))}
                    {done.length > DEFAULT_VISIBLE && !expandedSections.has("completed") && (
                      <button
                        onClick={() => toggleSection("completed")}
                        className="w-full text-xs font-semibold text-muted-foreground hover:text-foreground border border-dashed rounded-lg py-1.5 flex items-center justify-center gap-1 transition-colors"
                      >
                        <ChevronDown className="h-3.5 w-3.5" /> Show {done.length - DEFAULT_VISIBLE} more
                      </button>
                    )}
                    {expandedSections.has("completed") && done.length > DEFAULT_VISIBLE && (
                      <button
                        onClick={() => toggleSection("completed")}
                        className="w-full text-xs font-semibold text-muted-foreground hover:text-foreground border border-dashed rounded-lg py-1.5 flex items-center justify-center gap-1 transition-colors"
                      >
                        <ChevronUp className="h-3.5 w-3.5" /> Show less
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          <EmbeddedSupervisorSection />
        </div>
      ) : (
        <div className="text-center py-16 px-4 bg-muted/30 rounded-xl border border-dashed">
          <Clock className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="font-semibold">No projects yet</p>
          {isAdmin && <p className="text-sm text-muted-foreground mt-1">Create your first work order to get started.</p>}
        </div>
      )}
    </div>
  );
}
