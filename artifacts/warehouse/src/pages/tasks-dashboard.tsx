import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Play, CheckCircle2, AlertCircle, Calendar, Flag, Timer, User,
  Layers, ChevronDown, ChevronRight, SquareCheck, Square, Zap, MapPin, X, AlertTriangle, TrendingDown,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Types ───────────────────────────────────────────────────────────────────

interface WipLocation { locationType: string; locationValue: string }

interface PartNeeded { partName: string; quantity: number; itemType: string; location: string | null }

interface MyStep {
  id: number; itemId: number; name: string;
  status: "not_started" | "in_progress" | "completed";
  sortOrder: number; totalTimeSeconds: number;
  roleId: number | null; roleName: string | null;
  batchMode: string; durationEstimate: number | null;
  stepStatus: "ready" | "blocked";
  blockedByStep: { id: number; name: string } | null;
  wipLocation: WipLocation | null;
  previousWip: WipLocation | null;
  partsNeeded: PartNeeded[];
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

interface ActiveBatchGroup {
  stepName: string; roleId: number | null; roleName: string | null;
  topPriority: string; groupType: "free_batch" | "type_batch";
  templateName?: string; items: BatchItem[];
}

interface BatchQueue {
  freeBatchGroups: FreeBatchGroup[];
  typeBatchGroups: TypeBatchGroup[];
  activeBatchGroups: ActiveBatchGroup[];
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

// ─── WIP Location Dialog ─────────────────────────────────────────────────────

interface ProductionZone { id: number; name: string }

function WipLocationDialog({
  stepId,
  open,
  onClose,
}: {
  stepId: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [locationType, setLocationType] = useState<"warehouse" | "zone" | "with_worker">("warehouse");
  const [zoneId, setZoneId] = useState<string>("");
  const [warehouseNote, setWarehouseNote] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const { data: zones = [] } = useQuery<ProductionZone[]>({
    queryKey: ["/api/work/production-zones"],
    queryFn: () => apiFetch("/api/work/production-zones"),
    enabled: open,
  });

  if (!open || stepId === null) return null;

  const save = async () => {
    setSaving(true);
    try {
      const locationValue = locationType === "zone"
        ? (zones.find((z) => z.id === Number(zoneId))?.name ?? zoneId)
        : locationType === "with_worker" ? "With worker"
        : warehouseNote.trim() ? warehouseNote.trim() : "General warehouse area";
      await apiFetch(`/api/work/steps/${stepId}/wip-location`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationType, locationValue }),
      });
      toast({ title: "Location recorded" });
      onClose();
    } catch {
      toast({ title: "Failed to save location", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-background rounded-2xl border-2 shadow-xl p-5 space-y-4 animate-in slide-in-from-bottom-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-black text-base">Where is this part now?</p>
            <p className="text-xs text-muted-foreground">Optional — helps supervisors track WIP</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(["warehouse", "zone", "with_worker"] as const).map((type) => {
            const labels: Record<string, string> = { warehouse: "Warehouse", zone: "Zone", with_worker: "With me" };
            const icons: Record<string, React.ReactNode> = {
              warehouse: <MapPin className="h-5 w-5" />,
              zone: <MapPin className="h-5 w-5" />,
              with_worker: <User className="h-5 w-5" />,
            };
            return (
              <button
                key={type}
                onClick={() => setLocationType(type)}
                className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-xs font-bold transition-all ${
                  locationType === type
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {icons[type]}
                {labels[type]}
              </button>
            );
          })}
        </div>

        {locationType === "zone" && zones.length > 0 && (
          <Select value={zoneId} onValueChange={setZoneId}>
            <SelectTrigger className="h-11 border-2">
              <SelectValue placeholder="Select zone…" />
            </SelectTrigger>
            <SelectContent>
              {zones.map((z) => (
                <SelectItem key={z.id} value={String(z.id)}>{z.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {locationType === "warehouse" && (
          <input
            type="text"
            placeholder="Shelf / rack / area (optional, e.g. A-12)"
            value={warehouseNote}
            onChange={(e) => setWarehouseNote(e.target.value)}
            className="w-full h-11 px-3 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        )}

        {locationType === "zone" && zones.length === 0 && (
          <p className="text-xs text-muted-foreground text-center">No zones configured. Ask an admin to add production zones.</p>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 h-11" onClick={onClose}>Skip</Button>
          <Button
            className="flex-1 h-11 font-bold"
            disabled={saving || (locationType === "zone" && !zoneId && zones.length > 0)}
            onClick={save}
          >
            {saving ? "Saving…" : "Save Location"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Shortage Flag Dialog ─────────────────────────────────────────────────────

function ShortageFlagDialog({ stepId, onClose }: { stepId: number; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [productName, setProductName] = useState("");
  const [quantityNeeded, setQuantityNeeded] = useState("");
  const [note, setNote] = useState("");

  const flagMutation = useMutation({
    mutationFn: (data: { productName: string; quantityNeeded?: number; note?: string; stepId?: number }) =>
      fetch("/api/work/shortage-flags", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async (r) => {
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work/shortage-flags"] });
      toast({ title: "Shortage flagged — admin will be notified" });
      onClose();
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-background rounded-2xl border-2 border-rose-300 shadow-xl p-5 space-y-3 animate-in slide-in-from-bottom-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-black text-base flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-600" /> Flag Shortage
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Report a missing or low part to admin</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <input
          type="text"
          placeholder="Part / product name (required)"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          className="w-full h-11 px-3 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
          autoFocus
        />
        <div className="flex gap-2">
          <input
            type="number"
            min="1"
            placeholder="Qty needed"
            value={quantityNeeded}
            onChange={(e) => setQuantityNeeded(e.target.value)}
            className="w-28 h-11 px-3 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
          <input
            type="text"
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="flex-1 h-11 px-3 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 h-11" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1 h-11 font-bold bg-rose-600 hover:bg-rose-700"
            disabled={!productName.trim() || flagMutation.isPending}
            onClick={() => flagMutation.mutate({
              productName: productName.trim(),
              quantityNeeded: quantityNeeded ? Number(quantityNeeded) : undefined,
              note: note.trim() || undefined,
              stepId,
            })}
          >
            <AlertTriangle className="h-4 w-4 mr-1.5" />
            {flagMutation.isPending ? "Flagging…" : "Flag Shortage"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── My Steps Tab ────────────────────────────────────────────────────────────

function MyStepsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [wipStepId, setWipStepId] = useState<number | null>(null);
  const [shortageStepId, setShortageStepId] = useState<number | null>(null);

  const { data: steps = [], isLoading } = useQuery<MyStep[]>({
    queryKey: ["/api/work/my-steps"],
    queryFn: () => apiFetch("/api/work/my-steps"),
    refetchInterval: 15000,
  });

  const startMutation = useMutation({
    mutationFn: async (id: number) => {
      // Auto clock-in before starting the step
      try {
        const status = await fetch("/api/attendance/status", { credentials: "include" }).then(r => r.json());
        if (!status?.clockedIn) {
          const res = await fetch("/api/attendance/clock-in", { method: "POST", credentials: "include" });
          if (res.ok) {
            queryClient.invalidateQueries({ queryKey: ["/api/attendance/today"] });
            toast({ title: "Clocked in automatically" });
          }
        }
      } catch {
        // Non-fatal — clock-in is best effort, proceed to start the step
      }
      return apiFetch(`/api/work/procedures/${id}/start`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work/my-steps"] });
      toast({ title: "Step started — timer running" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const stopMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/work/procedures/${id}/stop`, { method: "POST" }),
    onSuccess: (_, id) => {
      setWipStepId(id);
      queryClient.invalidateQueries({ queryKey: ["/api/work/my-steps"] });
      toast({ title: "Step completed!" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const inProgress = steps.filter((s) => s.status === "in_progress");
  const ready = steps.filter((s) => s.status === "not_started" && s.stepStatus === "ready");

  const StepCard = ({ step, variant }: { step: MyStep; variant: "ready" | "inProgress" }) => {
    const dl = formatDeadline(step.project.deadline);
    const bg = variant === "inProgress" ? "bg-orange-50 border-orange-300"
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
        {step.partsNeeded.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider font-bold text-amber-700 flex items-center gap-1">
              <Layers className="h-3 w-3" /> Parts needed
            </p>
            {step.partsNeeded.map((part, i) => (
              <div key={i} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-amber-900 font-medium truncate">{part.partName}</p>
                  {part.location && (
                    <p className="text-[10px] text-amber-700 flex items-center gap-0.5 mt-0.5">
                      <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
                      <span className="truncate">{part.location}</span>
                    </p>
                  )}
                </div>
                <span className="text-amber-700 font-bold text-xs flex-shrink-0">×{part.quantity}</span>
              </div>
            ))}
          </div>
        )}
        {step.previousWip && variant === "ready" && (
          <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1.5 flex items-center gap-1">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">Part is at: <strong>{step.previousWip.locationValue}</strong></span>
          </p>
        )}
        {variant === "inProgress" && step.wipLocation && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">Logged: {step.wipLocation.locationValue}</span>
          </p>
        )}
        {variant === "inProgress" && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => stopMutation.mutate(step.id)} disabled={stopMutation.isPending}
              className="flex-1 bg-green-600 hover:bg-green-700 font-bold">
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Mark Complete
            </Button>
            <Button size="sm" variant="outline" className="h-8 w-8 flex-shrink-0 border-rose-200 text-rose-600 hover:bg-rose-50 p-0"
              onClick={() => setShortageStepId(step.id)}>
              <AlertTriangle className="h-4 w-4" />
            </Button>
          </div>
        )}
        {variant === "ready" && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => startMutation.mutate(step.id)} disabled={startMutation.isPending}
              className="flex-1 bg-green-600 hover:bg-green-700 font-bold">
              <Play className="h-4 w-4 mr-1.5" /> Start
            </Button>
            <Button size="sm" variant="outline" className="h-8 w-8 flex-shrink-0 border-rose-200 text-rose-600 hover:bg-rose-50 p-0"
              onClick={() => setShortageStepId(step.id)}>
              <AlertTriangle className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    );
  };

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>;
  if (inProgress.length === 0 && ready.length === 0) return (
    <div className="text-center py-16 px-4 bg-muted/30 rounded-xl border border-dashed">
      <p className="font-semibold text-muted-foreground">No steps ready for your roles</p>
      <p className="text-sm text-muted-foreground mt-1">Steps appear here once earlier steps in the sequence are completed.</p>
    </div>
  );

  return (
    <>
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
      </div>
      <WipLocationDialog stepId={wipStepId} open={wipStepId !== null} onClose={() => setWipStepId(null)} />
      {shortageStepId !== null && (
        <ShortageFlagDialog stepId={shortageStepId} onClose={() => setShortageStepId(null)} />
      )}
    </>
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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/work/batch-queue"] });
    queryClient.invalidateQueries({ queryKey: ["/api/work/my-steps"] });
  };

  const batchStart = useMutation({
    mutationFn: (stepIds: number[]) => apiFetch("/api/work/batch-start", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepIds }),
    }),
    onSuccess: (data: { started: number }, stepIds) => {
      invalidate();
      setSelectedIds((prev) => { const next = new Set(prev); stepIds.forEach((id) => next.delete(id)); return next; });
      toast({ title: `Batch started — ${data.started} step${data.started !== 1 ? "s" : ""} now in progress` });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const batchComplete = useMutation({
    mutationFn: (stepIds: number[]) => apiFetch("/api/work/batch-complete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepIds }),
    }),
    onSuccess: (data: { completed: number; alreadyDone: number }, stepIds) => {
      invalidate();
      setConfirm(null);
      setSelectedIds((prev) => { const next = new Set(prev); stepIds.forEach((id) => next.delete(id)); return next; });
      const msg = data.alreadyDone > 0
        ? `${data.completed} done · ${data.alreadyDone} already complete`
        : `${data.completed} step${data.completed !== 1 ? "s" : ""} marked complete`;
      toast({ title: msg });
    },
    onError: (err: Error) => { setConfirm(null); toast({ title: err.message, variant: "destructive" }); },
  });

  const requestComplete = (stepIds: number[], label: string) => setConfirm({ stepIds, label });
  const isPending = batchStart.isPending || batchComplete.isPending;

  const toggleItem = (id: number) => setSelectedIds((prev) => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const toggleGroupAll = (ids: number[]) => {
    const allSelected = ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleExpand = (key: string) => setExpandedGroups((prev) => {
    const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next;
  });

  // Determine which IDs to act on: selected IDs within a group, or all IDs if none selected
  const actionIds = (allGroupIds: number[]) => {
    const inGroup = allGroupIds.filter((id) => selectedIds.has(id));
    return inGroup.length > 0 ? inGroup : allGroupIds;
  };

  if (isLoading) return (
    <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}</div>
  );

  const { freeBatchGroups = [], typeBatchGroups = [], activeBatchGroups = [], totalCount = 0 } = queue ?? {};

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

  const projectSummaryFor = (items: BatchItem[]) =>
    [...new Map(items.map((i) => [i.projectId, i])).values()]
      .map((i) => `${i.projectName} (${i.priority})`).join(", ");

  // Shared item row with checkbox
  const ItemRow = ({ item, checkColor }: { item: BatchItem; checkColor: string }) => {
    const dl = formatDeadline(item.deadline);
    const checked = selectedIds.has(item.id);
    return (
      <div
        className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${checked ? "bg-white/60" : "bg-white/20 hover:bg-white/40"}`}
        onClick={() => toggleItem(item.id)}
      >
        <div className="flex-shrink-0">
          {checked
            ? <SquareCheck className={`h-4 w-4 ${checkColor}`} />
            : <Square className="h-4 w-4 text-muted-foreground" />}
        </div>
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
  };

  // Group header checkbox state
  const groupCheckState = (ids: number[]) => {
    const selected = ids.filter((id) => selectedIds.has(id)).length;
    return selected === 0 ? "none" : selected === ids.length ? "all" : "partial";
  };

  const GroupCheckbox = ({ ids, color }: { ids: number[]; color: string }) => {
    const state = groupCheckState(ids);
    return (
      <button onClick={(e) => { e.stopPropagation(); toggleGroupAll(ids); }} className="flex-shrink-0 p-0.5">
        {state === "all"
          ? <SquareCheck className={`h-4 w-4 ${color}`} />
          : state === "partial"
          ? <SquareCheck className="h-4 w-4 text-muted-foreground opacity-50" />
          : <Square className="h-4 w-4 text-muted-foreground" />}
      </button>
    );
  };

  return (
    <div className="space-y-5">
      {/* Confirmation dialog — sticky */}
      {confirm && (
        <div className="sticky top-16 z-30 rounded-xl border-2 border-green-400 bg-green-50 px-4 py-3 shadow-lg space-y-2">
          <p className="text-sm font-bold text-green-900">
            Mark {confirm.stepIds.length} step{confirm.stepIds.length !== 1 ? "s" : ""} complete?
          </p>
          <p className="text-xs text-green-700 leading-snug">{confirm.label}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs flex-1"
              onClick={() => setConfirm(null)} disabled={isPending}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs flex-1 bg-green-600 hover:bg-green-700 font-bold"
              onClick={() => batchComplete.mutate(confirm.stepIds)} disabled={isPending}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              {batchComplete.isPending ? "Saving…" : "Confirm Done"}
            </Button>
          </div>
        </div>
      )}

      {/* ── ACTIVE BATCHES (in_progress) ── */}
      {activeBatchGroups.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-orange-600 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
            Active Batches ({activeBatchGroups.reduce((n, g) => n + g.items.length, 0)})
          </h2>
          {activeBatchGroups.map((group) => {
            const key = `active:${group.stepName}:${group.templateName ?? "free"}`;
            const expanded = expandedGroups.has(key);
            const allIds = group.items.map((i) => i.id);
            const ids = actionIds(allIds);
            const hasSelection = allIds.some((id) => selectedIds.has(id));
            const summary = projectSummaryFor(group.items);
            const label = `"${group.stepName}" — ${ids.length} of ${group.items.length} item${group.items.length !== 1 ? "s" : ""} — ${summary}`;
            return (
              <div key={key} className="rounded-xl border-2 border-orange-300 overflow-hidden bg-orange-50">
                <div className="flex items-center gap-2 px-3 py-2.5 bg-orange-100/60">
                  <GroupCheckbox ids={allIds} color="text-orange-600" />
                  <button className="flex-1 min-w-0 text-left" onClick={() => toggleExpand(key)}>
                    <p className="font-bold text-sm leading-tight truncate">
                      {group.groupType === "type_batch" && group.templateName ? group.templateName : group.stepName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {group.stepName} · {group.items.length} item{group.items.length !== 1 ? "s" : ""}
                      {group.roleName ? ` · ${group.roleName}` : ""}
                    </p>
                    <p className="text-[10px] text-muted-foreground/80 truncate mt-0.5">{summary}</p>
                  </button>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <PriorityBadge p={group.topPriority} />
                    <button onClick={() => toggleExpand(key)} className="text-muted-foreground">
                      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 font-bold"
                      onClick={() => requestComplete(ids, label)} disabled={isPending}>
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {hasSelection ? `Finish (${ids.length})` : `Finish All (${allIds.length})`}
                    </Button>
                  </div>
                </div>
                {expanded && (
                  <div className="divide-y divide-border/40">
                    {group.items.map((item) => <ItemRow key={item.id} item={item} checkColor="text-orange-600" />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── FREE-BATCH READY (not_started) ── */}
      {freeBatchGroups.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-purple-700 flex items-center gap-1.5">
            <Layers className="h-4 w-4" /> Free Batch — any mix
          </h2>
          {freeBatchGroups.map((group) => {
            const key = `free:${group.stepName}`;
            const expanded = expandedGroups.has(key);
            const allIds = group.items.map((i) => i.id);
            const ids = actionIds(allIds);
            const hasSelection = allIds.some((id) => selectedIds.has(id));
            const summary = [...new Map(group.items.map((i) => [i.projectId, i])).values()]
              .map((i) => i.projectName).join(", ");
            return (
              <div key={key} className={`rounded-xl border-2 overflow-hidden ${priorityBg[group.topPriority]}`}>
                <div className="flex items-center gap-2 px-3 py-2.5 bg-white/60">
                  <GroupCheckbox ids={allIds} color="text-purple-600" />
                  <button className="flex-1 min-w-0 text-left" onClick={() => toggleExpand(key)}>
                    <p className="font-bold text-sm leading-tight truncate">{group.stepName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {group.items.length} item{group.items.length !== 1 ? "s" : ""}
                      {group.roleName ? ` · ${group.roleName}` : ""} · {summary}
                    </p>
                  </button>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <PriorityBadge p={group.topPriority} />
                    <button onClick={() => toggleExpand(key)} className="text-muted-foreground">
                      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <Button size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700 font-bold"
                      onClick={() => batchStart.mutate(ids)} disabled={isPending}>
                      <Zap className="h-3 w-3 mr-1" />
                      {hasSelection ? `Start (${ids.length})` : `Start All (${allIds.length})`}
                    </Button>
                  </div>
                </div>
                {/* Always show items for free-batch so workers can choose a subset */}
                <div className="divide-y divide-border/40">
                  {group.items.map((item) => <ItemRow key={item.id} item={item} checkColor="text-purple-600" />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TYPE-BATCH READY (not_started) ── */}
      {typeBatchGroups.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
            <Layers className="h-4 w-4" /> Type Batch — same part
          </h2>
          {typeBatchGroups.map((group) => {
            const key = `type:${group.templateName}:${group.stepName}`;
            const expanded = expandedGroups.has(key);
            const allIds = group.items.map((i) => i.id);
            const ids = actionIds(allIds);
            const hasSelection = allIds.some((id) => selectedIds.has(id));
            const projectSummary = projectSummaryFor(group.items);
            return (
              <div key={key} className={`rounded-xl border-2 overflow-hidden ${priorityBg[group.topPriority]}`}>
                <div className="flex items-center gap-2 px-3 py-2.5 bg-white/60">
                  <GroupCheckbox ids={allIds} color="text-indigo-600" />
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
                    <Button size="sm" className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 font-bold"
                      onClick={() => batchStart.mutate(ids)} disabled={isPending}>
                      <Zap className="h-3 w-3 mr-1" />
                      {hasSelection ? `Start (${ids.length})` : `Start All (${allIds.length})`}
                    </Button>
                  </div>
                </div>
                {/* Collapsed by default; expand to see individual items and select a subset */}
                {expanded && (
                  <div className="divide-y divide-border/40">
                    {group.items.map((item) => <ItemRow key={item.id} item={item} checkColor="text-indigo-600" />)}
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
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">My Queue</h1>
          <p className="text-xs text-muted-foreground">
            {user?.username ? `${user.username} · ` : ""}Production steps across all active orders
          </p>
        </div>
        <Link href="/work/reorder-queue">
          <Button size="sm" variant="outline" className="h-8 font-bold text-xs border-rose-200 text-rose-700 hover:bg-rose-50 flex-shrink-0">
            <TrendingDown className="h-3.5 w-3.5 mr-1" /> Reorder
          </Button>
        </Link>
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
