import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Play, CheckCircle2, AlertCircle, Calendar, Flag, Timer, User,
  Layers, ChevronDown, ChevronRight, SquareCheck, Square,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MyStep {
  id: number; itemId: number; name: string;
  status: "not_started" | "in_progress" | "completed";
  sortOrder: number; totalTimeSeconds: number;
  roleId: number | null; roleName: string | null;
  batchMode: string; durationEstimate: number | null;
  stepStatus: "ready" | "blocked";
  blockedByStep: { id: number; name: string } | null;
  item: { id: number; name: string };
  project: { id: number; name: string; deadline: string; priority: string };
}

interface BatchItem {
  id: number; name: string; stepName: string; batchMode: string;
  roleId: number | null; roleName: string | null;
  projectId: number; projectName: string; priority: string; deadline: string;
  durationEstimate: number | null;
}

interface FreeBatchGroup {
  stepName: string; roleId: number | null; roleName: string | null;
  topPriority: string; items: BatchItem[];
}

interface TypeBatchGroup {
  templateName: string; stepName: string; roleId: number | null; roleName: string | null;
  topPriority: string; items: BatchItem[];
}

interface BatchQueue {
  freeBatchGroups: FreeBatchGroup[];
  typeBatchGroups: TypeBatchGroup[];
  totalCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
  return res.json();
}

const priorityColors: Record<string, string> = {
  urgent: "bg-rose-100 text-rose-700 border-rose-300",
  high: "bg-orange-100 text-orange-700 border-orange-300",
  normal: "bg-blue-100 text-blue-700 border-blue-300",
  low: "bg-gray-100 text-gray-600 border-gray-300",
};

const priorityBg: Record<string, string> = {
  urgent: "bg-rose-50 border-rose-200",
  high: "bg-orange-50 border-orange-200",
  normal: "bg-blue-50 border-blue-100",
  low: "bg-gray-50 border-gray-200",
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

const batchLabels: Record<string, string> = {
  free_batch: "Batch", type_batch: "Type batch", individual: "",
};

// ─── My Steps Tab ────────────────────────────────────────────────────────────

function MyStepsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: steps = [], isLoading } = useQuery<MyStep[]>({
    queryKey: ["/api/work/my-steps"],
    queryFn: () => apiFetch("/api/work/my-steps"),
    refetchInterval: 15000,
  });

  const startMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/work/procedures/${id}/start`, { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/work/my-steps"] }); toast({ title: "Step started — timer running" }); },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const stopMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/work/procedures/${id}/stop`, { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/work/my-steps"] }); toast({ title: "Step completed!" }); },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const inProgress = steps.filter((s) => s.status === "in_progress");
  const ready = steps.filter((s) => s.status === "not_started" && s.stepStatus === "ready");
  const blocked = steps.filter((s) => s.status === "not_started" && s.stepStatus === "blocked");

  const StepCard = ({ step, variant }: { step: MyStep; variant: "ready" | "inProgress" | "blocked" }) => {
    const dl = formatDeadline(step.project.deadline);
    const bg = variant === "inProgress" ? "bg-orange-50 border-orange-300"
      : variant === "blocked" ? "bg-red-50 border-red-200"
      : dl.overdue ? "bg-red-50 border-red-300" : "bg-green-50 border-green-200";
    return (
      <div className={`rounded-xl border-2 p-3 space-y-2 ${bg}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm leading-tight">{step.name}</p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{step.item.name}</p>
            <p className="text-xs text-muted-foreground/80 truncate">{step.project.name}</p>
          </div>
          {step.project.priority === "urgent" && <Flag className="h-4 w-4 text-rose-600 flex-shrink-0 mt-0.5" />}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <div className={`flex items-center gap-1 ${dl.overdue ? "text-red-700 font-bold" : "text-muted-foreground"}`}>
            <Calendar className="h-3 w-3" /><span>{dl.label}</span>
          </div>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold capitalize border ${priorityColors[step.project.priority] ?? "bg-gray-100 text-gray-600"}`}>
            {step.project.priority}
          </span>
          {step.roleName && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold">
              <User className="h-2.5 w-2.5" /> {step.roleName}
            </span>
          )}
          {batchLabels[step.batchMode] && (
            <span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-semibold">
              {batchLabels[step.batchMode]}
            </span>
          )}
          {step.durationEstimate && (
            <span className="flex items-center gap-0.5 text-muted-foreground">
              <Timer className="h-3 w-3" /> ~{step.durationEstimate}m
            </span>
          )}
        </div>
        {variant === "blocked" && step.blockedByStep && (
          <p className="text-xs text-red-600 font-medium flex items-center gap-1">
            <AlertCircle className="h-3 w-3 flex-shrink-0" />Waiting for: {step.blockedByStep.name}
          </p>
        )}
        {variant === "inProgress" && (
          <Button size="sm" onClick={() => stopMutation.mutate(step.id)} disabled={stopMutation.isPending}
            className="w-full bg-green-600 hover:bg-green-700 font-bold">
            <CheckCircle2 className="h-4 w-4 mr-1.5" /> Mark Complete
          </Button>
        )}
        {variant === "ready" && (
          <Button size="sm" onClick={() => startMutation.mutate(step.id)} disabled={startMutation.isPending}
            className="w-full bg-green-600 hover:bg-green-700 font-bold">
            <Play className="h-4 w-4 mr-1.5" /> Start
          </Button>
        )}
      </div>
    );
  };

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>;
  if (steps.length === 0) return (
    <div className="text-center py-16 px-4 bg-muted/30 rounded-xl border border-dashed">
      <p className="font-semibold text-muted-foreground">No steps assigned to your roles</p>
      <p className="text-sm text-muted-foreground mt-1">Steps appear here when work orders are created with role assignments.</p>
    </div>
  );

  return (
    <div className="space-y-5">
      {inProgress.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-orange-600 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
            In Progress ({inProgress.length})
          </h2>
          {inProgress.map((s) => <StepCard key={s.id} step={s} variant="inProgress" />)}
        </div>
      )}
      {ready.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-green-700">Ready to Start ({ready.length})</h2>
          {ready.map((s) => <StepCard key={s.id} step={s} variant="ready" />)}
        </div>
      )}
      {blocked.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-red-600">Blocked ({blocked.length})</h2>
          {blocked.map((s) => <StepCard key={s.id} step={s} variant="blocked" />)}
        </div>
      )}
    </div>
  );
}

// ─── Batch Queue Tab ──────────────────────────────────────────────────────────

interface ConfirmState { stepIds: number[]; label: string }

function BatchQueueTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const { data: queue, isLoading } = useQuery<BatchQueue>({
    queryKey: ["/api/work/batch-queue"],
    queryFn: () => apiFetch("/api/work/batch-queue"),
    refetchInterval: 15000,
  });

  const batchComplete = useMutation({
    mutationFn: (stepIds: number[]) => apiFetch("/api/work/batch-complete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepIds }),
    }),
    onSuccess: (data: { completed: number; alreadyDone: number }, stepIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/work/batch-queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work/my-steps"] });
      setSelectedIds((prev) => { const next = new Set(prev); stepIds.forEach((id) => next.delete(id)); return next; });
      setConfirm(null);
      const msg = data.alreadyDone > 0
        ? `${data.completed} done · ${data.alreadyDone} already complete`
        : `${data.completed} step${data.completed !== 1 ? "s" : ""} marked complete`;
      toast({ title: msg });
    },
    onError: (err: Error) => { setConfirm(null); toast({ title: err.message, variant: "destructive" }); },
  });

  const requestComplete = (stepIds: number[], label: string) => setConfirm({ stepIds, label });

  const toggle = (id: number) => setSelectedIds((prev) => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const toggleGroup = (ids: number[], allSelected: boolean) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (allSelected) ids.forEach((id) => next.delete(id)); else ids.forEach((id) => next.add(id));
    return next;
  });

  const toggleExpand = (key: string) => setExpandedGroups((prev) => {
    const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next;
  });

  if (isLoading) return <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}</div>;

  const { freeBatchGroups = [], typeBatchGroups = [], totalCount = 0 } = queue ?? {};

  if (totalCount === 0) return (
    <div className="text-center py-16 px-4 bg-muted/30 rounded-xl border border-dashed">
      <Layers className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
      <p className="font-semibold text-muted-foreground">No batch steps ready</p>
      <p className="text-sm text-muted-foreground mt-1">Steps marked as "Batch" appear here once they're unblocked.</p>
    </div>
  );

  const PriorityBadge = ({ p }: { p: string }) => (
    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold capitalize border ${priorityColors[p] ?? "bg-gray-100 text-gray-600"}`}>{p}</span>
  );

  return (
    <div className="space-y-5">
      {/* Confirmation dialog */}
      {confirm && (
        <div className="sticky top-16 z-30 rounded-xl border-2 border-green-400 bg-green-50 px-4 py-3 shadow-lg space-y-2">
          <p className="text-sm font-bold text-green-900">Mark {confirm.stepIds.length} step{confirm.stepIds.length !== 1 ? "s" : ""} complete?</p>
          <p className="text-xs text-green-700 leading-snug">{confirm.label}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs flex-1"
              onClick={() => setConfirm(null)} disabled={batchComplete.isPending}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs flex-1 bg-green-600 hover:bg-green-700 font-bold"
              onClick={() => batchComplete.mutate(confirm.stepIds)} disabled={batchComplete.isPending}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              {batchComplete.isPending ? "Saving…" : "Confirm Done"}
            </Button>
          </div>
        </div>
      )}

      {/* Selection action bar (when no confirm is active) */}
      {selectedIds.size > 0 && !confirm && (
        <div className="sticky top-16 z-30 flex items-center justify-between gap-2 bg-purple-700 text-white rounded-xl px-3 py-2 shadow-lg">
          <span className="text-sm font-bold">{selectedIds.size} selected</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs text-purple-700 border-white bg-white hover:bg-purple-50"
              onClick={() => setSelectedIds(new Set())}>Clear</Button>
            <Button size="sm" className="h-7 text-xs bg-white text-purple-700 hover:bg-purple-50 font-bold"
              onClick={() => requestComplete([...selectedIds], `${selectedIds.size} selected step${selectedIds.size !== 1 ? "s" : ""} across all groups`)}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark All Done
            </Button>
          </div>
        </div>
      )}

      {/* Free-batch groups */}
      {freeBatchGroups.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-purple-700 flex items-center gap-1.5">
            <Layers className="h-4 w-4" /> Free Batch — any mix
          </h2>
          {freeBatchGroups.map((group) => {
            const allIds = group.items.map((i) => i.id);
            const allSelected = allIds.every((id) => selectedIds.has(id));
            const projectSummary = [...new Map(group.items.map((i) => [i.projectId, i])).values()]
              .map((i) => i.projectName).join(", ");
            return (
              <div key={group.stepName} className={`rounded-xl border-2 overflow-hidden ${priorityBg[group.topPriority]}`}>
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-white/60">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <button onClick={() => toggleGroup(allIds, allSelected)} className="flex-shrink-0">
                      {allSelected ? <SquareCheck className="h-4 w-4 text-purple-600" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                    </button>
                    <div className="min-w-0">
                      <p className="font-bold text-sm leading-tight truncate">{group.stepName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {group.items.length} item{group.items.length !== 1 ? "s" : ""}
                        {group.roleName ? ` · ${group.roleName}` : ""}
                        {" · "}{projectSummary}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <PriorityBadge p={group.topPriority} />
                    <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 font-bold"
                      onClick={() => requestComplete(allIds, `"${group.stepName}" for ${group.items.length} item${group.items.length !== 1 ? "s" : ""} across ${projectSummary}`)}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Done ({group.items.length})
                    </Button>
                  </div>
                </div>
                <div className="divide-y divide-border/40">
                  {group.items.map((item) => {
                    const dl = formatDeadline(item.deadline);
                    return (
                      <div key={item.id} className="flex items-center gap-2.5 px-3 py-2 bg-white/30">
                        <button onClick={() => toggle(item.id)} className="flex-shrink-0">
                          {selectedIds.has(item.id) ? <SquareCheck className="h-4 w-4 text-purple-600" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.projectName}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <PriorityBadge p={item.priority} />
                          <span className={`text-[10px] ${dl.overdue ? "text-red-600 font-bold" : "text-muted-foreground"}`}>{dl.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Type-batch groups */}
      {typeBatchGroups.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
            <Layers className="h-4 w-4" /> Type Batch — same part
          </h2>
          {typeBatchGroups.map((group) => {
            const key = `type:${group.templateName}:${group.stepName}`;
            const expanded = expandedGroups.has(key);
            const allIds = group.items.map((i) => i.id);
            const allSelected = allIds.every((id) => selectedIds.has(id));
            // Project/priority summary: deduplicate projects, show each with its priority
            const projectSummaryParts = [...new Map(group.items.map((i) => [i.projectId, i])).values()]
              .map((i) => `${i.projectName} (${i.priority})`);
            const projectSummary = projectSummaryParts.join(", ");
            return (
              <div key={key} className={`rounded-xl border-2 overflow-hidden ${priorityBg[group.topPriority]}`}>
                <div className="flex items-center gap-2 px-3 py-2.5 bg-white/60">
                  <button onClick={() => toggleGroup(allIds, allSelected)} className="flex-shrink-0">
                    {allSelected ? <SquareCheck className="h-4 w-4 text-indigo-600" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  <button className="flex-1 min-w-0 text-left" onClick={() => toggleExpand(key)}>
                    <p className="font-bold text-sm leading-tight truncate">{group.templateName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {group.stepName} · {group.items.length} item{group.items.length !== 1 ? "s" : ""}
                      {group.roleName ? ` · ${group.roleName}` : ""}
                    </p>
                    <p className="text-[10px] text-muted-foreground/80 truncate mt-0.5">{projectSummary}</p>
                  </button>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <PriorityBadge p={group.topPriority} />
                    <button onClick={() => toggleExpand(key)} className="text-muted-foreground">
                      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 font-bold"
                      onClick={() => requestComplete(allIds, `"${group.stepName}" for ${group.items.length} ${group.templateName} item${group.items.length !== 1 ? "s" : ""} — ${projectSummary}`)}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Done ({group.items.length})
                    </Button>
                  </div>
                </div>
                {expanded && (
                  <div className="divide-y divide-border/40">
                    {group.items.map((item) => {
                      const dl = formatDeadline(item.deadline);
                      return (
                        <div key={item.id} className="flex items-center gap-2.5 px-3 py-2 bg-white/30">
                          <button onClick={() => toggle(item.id)} className="flex-shrink-0">
                            {selectedIds.has(item.id) ? <SquareCheck className="h-4 w-4 text-indigo-600" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{item.projectName}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <PriorityBadge p={item.priority} />
                            <span className={`text-[10px] ${dl.overdue ? "text-red-600 font-bold" : "text-muted-foreground"}`}>{dl.label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TasksDashboardPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"my-steps" | "batch">("my-steps");

  const { data: batchQueueData } = useQuery<BatchQueue>({
    queryKey: ["/api/work/batch-queue"],
    queryFn: () => apiFetch("/api/work/batch-queue"),
    refetchInterval: 15000,
  });
  const batchCount = batchQueueData?.totalCount ?? 0;

  return (
    <div className="p-4 space-y-4 pb-24">
      <div>
        <h1 className="text-2xl font-bold">My Queue</h1>
        <p className="text-xs text-muted-foreground">
          {user?.username ? `${user.username} · ` : ""}Production steps across all active orders
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-muted/50 border rounded-xl p-1">
        <button
          onClick={() => setTab("my-steps")}
          className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-all ${
            tab === "my-steps" ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          My Steps
        </button>
        <button
          onClick={() => setTab("batch")}
          className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            tab === "batch" ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Batch Queue
          {batchCount > 0 && (
            <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-purple-600 text-white text-[10px] font-bold">
              {batchCount}
            </span>
          )}
        </button>
      </div>

      {tab === "my-steps" ? <MyStepsTab /> : <BatchQueueTab />}
    </div>
  );
}
