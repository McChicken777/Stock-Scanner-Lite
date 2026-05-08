import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, Square, SquareCheck, Play, Palette, Calendar, Flag,
  MapPin, Clock, X, AlertTriangle,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { format, isPast, differenceInDays } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaintItem {
  id: number;
  stepName: string;
  status: "not_started" | "in_progress";
  durationEstimate: number | null;
  itemId: number;
  itemName: string;
  projectId: number;
  projectName: string;
  deadline: string;
  priority: string;
  paintColor: string | null;
  wipLocation: string | null;
}

interface ProductionZone { id: number; name: string }

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

function formatDeadline(dateStr: string) {
  const d = new Date(dateStr);
  if (isPast(d)) {
    const days = differenceInDays(new Date(), d);
    return { label: `${days}d overdue`, overdue: true };
  }
  const days = differenceInDays(d, new Date());
  if (days === 0) return { label: "Due today", overdue: false };
  if (days === 1) return { label: "Due tomorrow", overdue: false };
  return { label: `${days}d left`, overdue: false };
}

function ColorSwatch({ color }: { color: string | null }) {
  if (!color) return <span className="text-xs text-muted-foreground italic">No color</span>;
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="h-4 w-4 rounded-full border border-black/10 flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-xs font-medium">{color}</span>
    </div>
  );
}

// ─── Location dialog after completing batch ───────────────────────────────────

interface LocationEntry {
  stepId: number;
  itemName: string;
  locationType: "warehouse" | "zone" | "with_worker";
  locationValue: string;
  sizeNote: string;
}

function BatchCompleteDialog({
  items,
  zones,
  onConfirm,
  onCancel,
  isPending,
}: {
  items: PaintItem[];
  zones: ProductionZone[];
  onConfirm: (locations: LocationEntry[]) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [entries, setEntries] = useState<LocationEntry[]>(
    items.map((item) => ({ stepId: item.id, itemName: item.itemName, locationType: "warehouse", locationValue: "", sizeNote: "" }))
  );

  const update = (idx: number, patch: Partial<LocationEntry>) =>
    setEntries((prev) => prev.map((e, i) => i === idx ? { ...e, ...patch } : e));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-background rounded-2xl border-2 shadow-xl p-5 space-y-4 animate-in slide-in-from-bottom-4 max-h-[85dvh] flex flex-col">
        <div className="flex items-center justify-between flex-shrink-0">
          <div>
            <p className="font-black text-base">Log Storage Locations</p>
            <p className="text-xs text-muted-foreground">Where did you put each painted part?</p>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4">
          {entries.map((entry, idx) => (
            <div key={entry.stepId} className="space-y-2 border rounded-xl p-3">
              <p className="text-sm font-semibold truncate">{entry.itemName}</p>
              <div className="grid grid-cols-3 gap-1.5">
                {(["warehouse", "zone", "with_worker"] as const).map((type) => {
                  const labels = { warehouse: "Shelf/Rack", zone: "Zone", with_worker: "With me" };
                  return (
                    <button
                      key={type}
                      onClick={() => update(idx, { locationType: type, locationValue: "" })}
                      className={`py-2 rounded-lg border text-[11px] font-bold transition-all ${
                        entry.locationType === type
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {labels[type]}
                    </button>
                  );
                })}
              </div>
              {entry.locationType === "zone" && zones.length > 0 && (
                <Select value={entry.locationValue} onValueChange={(v) => update(idx, { locationValue: v })}>
                  <SelectTrigger className="h-9 border-2 text-xs">
                    <SelectValue placeholder="Pick zone…" />
                  </SelectTrigger>
                  <SelectContent>
                    {zones.map((z) => <SelectItem key={z.id} value={z.name}>{z.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {entry.locationType === "warehouse" && (
                <input
                  type="text"
                  placeholder="Shelf, rack, area (e.g. A-03)"
                  value={entry.locationValue}
                  onChange={(e) => update(idx, { locationValue: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg border-2 border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              )}
              <input
                type="text"
                placeholder="Size/weight note (e.g. large panel, 12 kg) — optional"
                value={entry.sizeNote}
                onChange={(e) => update(idx, { sizeNote: e.target.value })}
                className="w-full h-9 px-3 rounded-lg border border-input bg-muted/50 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background"
              />
            </div>
          ))}
        </div>

        <div className="flex-shrink-0">
          <Button
            className="w-full h-11 font-bold bg-green-600 hover:bg-green-700"
            disabled={isPending}
            onClick={() => onConfirm(entries)}
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            {isPending ? "Saving…" : "Log Locations & Mark Complete"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Paint Queue Page ─────────────────────────────────────────────────────────

export default function PaintQueuePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [completeItems, setCompleteItems] = useState<PaintItem[]>([]);

  const isAdmin = user?.role === "admin";

  const { data: items = [], isLoading, error } = useQuery<PaintItem[]>({
    queryKey: ["/api/work/paint-queue"],
    queryFn: () => apiFetch("/api/work/paint-queue"),
    refetchInterval: 30000,
  });

  const { data: zones = [] } = useQuery<ProductionZone[]>({
    queryKey: ["/api/work/production-zones"],
    queryFn: () => apiFetch("/api/work/production-zones"),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/work/paint-queue"] });
    queryClient.invalidateQueries({ queryKey: ["/api/work/my-steps"] });
  };

  const startBatch = useMutation({
    mutationFn: (stepIds: number[]) => apiFetch("/api/work/paint-queue/batch-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepIds }),
    }),
    onSuccess: (data: { started: number }) => {
      invalidate();
      setSelectedIds(new Set());
      toast({ title: `Batch started — ${data.started} item${data.started !== 1 ? "s" : ""} now in painting` });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const completeBatch = useMutation({
    mutationFn: (payload: { stepIds: number[]; locations: LocationEntry[] }) =>
      apiFetch("/api/work/paint-queue/batch-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: (data: { completed: number }) => {
      invalidate();
      setSelectedIds(new Set());
      setShowCompleteDialog(false);
      toast({ title: `${data.completed} item${data.completed !== 1 ? "s" : ""} marked complete` });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const toggle = (id: number) => setSelectedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = (ids: number[]) => {
    const allSelected = ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleStartBatch = () => {
    const toStart = items.filter((i) => i.status === "not_started" && (selectedIds.size === 0 || selectedIds.has(i.id)));
    if (toStart.length === 0) { toast({ title: "No ready items selected" }); return; }
    startBatch.mutate(toStart.map((i) => i.id));
  };

  const handleCompleteRequest = () => {
    const toComplete = items.filter((i) => i.status === "in_progress" && (selectedIds.size === 0 || selectedIds.has(i.id)));
    if (toComplete.length === 0) { toast({ title: "No in-progress items selected" }); return; }
    setCompleteItems(toComplete);
    setShowCompleteDialog(true);
  };

  // Group by paint color
  const colorGroups = new Map<string, PaintItem[]>();
  for (const item of items) {
    const key = item.paintColor ?? "—";
    if (!colorGroups.has(key)) colorGroups.set(key, []);
    colorGroups.get(key)!.push(item);
  }

  const inProgress = items.filter((i) => i.status === "in_progress");
  const ready = items.filter((i) => i.status === "not_started");
  const selectedCount = selectedIds.size;

  const readyColorGroups = new Map<string, PaintItem[]>();
  for (const item of ready) {
    const key = item.paintColor ?? "—";
    if (!readyColorGroups.has(key)) readyColorGroups.set(key, []);
    readyColorGroups.get(key)!.push(item);
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-3 pb-24">
        <div className="pt-2">
          <h1 className="text-2xl font-black">Paint Shop</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Paint queue</p>
        </div>
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
      </div>
    );
  }

  if (error) {
    const msg = (error as Error).message ?? "";
    const isPro = msg.toLowerCase().includes("pro");
    const isRole = msg.toLowerCase().includes("painter") || msg.toLowerCase().includes("role");
    return (
      <div className="p-6 text-center space-y-3">
        <Palette className="h-12 w-12 mx-auto text-muted-foreground" />
        {isPro ? (
          <>
            <h2 className="font-bold text-lg">Paint Queue is a Pro feature</h2>
            <p className="text-sm text-muted-foreground">Upgrade your plan to access the Paint Shop view with batch tracking and color grouping.</p>
          </>
        ) : isRole ? (
          <>
            <h2 className="font-bold text-lg">Access Restricted</h2>
            <p className="text-sm text-muted-foreground">Paint Shop is available to admins, supervisors, and workers with a Painter role. Contact your admin to request access.</p>
          </>
        ) : (
          <>
            <h2 className="font-bold text-lg">Failed to load paint queue</h2>
            <p className="text-sm text-muted-foreground">{msg}</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-32">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Palette className="h-6 w-6 text-primary" /> Paint Shop
          </h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
            {items.length} item{items.length !== 1 ? "s" : ""} in queue
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 px-4 bg-muted/30 rounded-xl border border-dashed">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500" />
          <p className="font-semibold">All clear — nothing to paint</p>
          <p className="text-sm text-muted-foreground mt-1">Items appear here once all upstream steps are complete.</p>
        </div>
      ) : (
        <>
          {/* Action bar */}
          {(inProgress.length > 0 || ready.length > 0) && (
            <div className="flex gap-2 sticky top-14 z-30 bg-background/95 backdrop-blur-sm py-2 -mx-4 px-4">
              {ready.length > 0 && (
                <Button
                  size="sm"
                  className="flex-1 font-bold gap-1.5 bg-primary"
                  disabled={startBatch.isPending}
                  onClick={handleStartBatch}
                >
                  <Play className="h-3.5 w-3.5" />
                  {selectedCount > 0 ? `Start (${selectedCount})` : `Start All Ready (${ready.filter(i => selectedIds.size === 0 || selectedIds.has(i.id)).length})`}
                </Button>
              )}
              {inProgress.length > 0 && (
                <Button
                  size="sm"
                  className="flex-1 font-bold gap-1.5 bg-green-600 hover:bg-green-700"
                  disabled={completeBatch.isPending}
                  onClick={handleCompleteRequest}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {selectedCount > 0 ? `Done (${selectedCount})` : `Finish All (${inProgress.length})`}
                </Button>
              )}
            </div>
          )}

          {/* In-progress section */}
          {inProgress.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-orange-600 flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                In Painting ({inProgress.length})
              </h2>
              <div className="space-y-1.5">
                {inProgress.map((item) => {
                  const dl = formatDeadline(item.deadline);
                  const checked = selectedIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl border-2 p-3 space-y-2 cursor-pointer transition-all ${
                        checked ? "border-green-400 bg-green-50" : "border-orange-300 bg-orange-50"
                      }`}
                      onClick={() => toggle(item.id)}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-shrink-0 pt-0.5">
                          {checked
                            ? <SquareCheck className="h-4 w-4 text-green-600" />
                            : <Square className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm leading-tight">{item.itemName}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.projectName} · {item.stepName}</p>
                        </div>
                        <ColorSwatch color={item.paintColor} />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold capitalize border ${priorityColors[item.priority] ?? "bg-gray-100 text-gray-600"}`}>
                          {item.priority}
                        </span>
                        <span className={`text-[10px] flex items-center gap-0.5 ${dl.overdue ? "text-red-600 font-bold" : "text-muted-foreground"}`}>
                          <Calendar className="h-3 w-3" /> {dl.label}
                        </span>
                        {item.durationEstimate && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Clock className="h-3 w-3" /> ~{item.durationEstimate}m
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ready sections grouped by color */}
          {ready.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-green-700">
                Ready to Paint ({ready.length})
              </h2>
              {[...readyColorGroups.entries()].map(([color, colorItems]) => {
                const allIds = colorItems.map((i) => i.id);
                const allSelected = allIds.every((id) => selectedIds.has(id));
                return (
                  <div key={color} className="space-y-1.5">
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        {color !== "—" ? (
                          <div className="h-4 w-4 rounded-full border border-black/20" style={{ backgroundColor: color }} />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                          {color} ({colorItems.length})
                        </span>
                      </div>
                      <button
                        onClick={() => toggleAll(allIds)}
                        className="text-[11px] text-primary font-bold hover:underline"
                      >
                        {allSelected ? "Deselect all" : "Select all"}
                      </button>
                    </div>
                    {colorItems.map((item) => {
                      const dl = formatDeadline(item.deadline);
                      const checked = selectedIds.has(item.id);
                      return (
                        <div
                          key={item.id}
                          className={`rounded-xl border-2 p-3 space-y-2 cursor-pointer transition-all ${
                            checked
                              ? "border-primary bg-primary/5"
                              : dl.overdue ? "border-red-300 bg-red-50" : "border-border bg-card"
                          }`}
                          onClick={() => toggle(item.id)}
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex-shrink-0 pt-0.5">
                              {checked
                                ? <SquareCheck className="h-4 w-4 text-primary" />
                                : <Square className="h-4 w-4 text-muted-foreground" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm leading-tight">{item.itemName}</p>
                              <p className="text-xs text-muted-foreground truncate">{item.projectName} · {item.stepName}</p>
                            </div>
                            {item.priority === "urgent" && <Flag className="h-4 w-4 text-rose-600 flex-shrink-0 mt-0.5" />}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold capitalize border ${priorityColors[item.priority] ?? "bg-gray-100 text-gray-600"}`}>
                              {item.priority}
                            </span>
                            <span className={`text-[10px] flex items-center gap-0.5 ${dl.overdue ? "text-red-600 font-bold" : "text-muted-foreground"}`}>
                              <Calendar className="h-3 w-3" /> {dl.label}
                            </span>
                            {item.wipLocation && (
                              <span className="text-[10px] text-blue-700 flex items-center gap-0.5">
                                <MapPin className="h-3 w-3" /> {item.wipLocation}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {showCompleteDialog && (
        <BatchCompleteDialog
          items={completeItems}
          zones={zones}
          onCancel={() => setShowCompleteDialog(false)}
          isPending={completeBatch.isPending}
          onConfirm={(locations) => completeBatch.mutate({
            stepIds: completeItems.map((i) => i.id),
            locations: locations.map((l) => ({
              ...l,
              locationValue: l.sizeNote
                ? `${l.locationValue || l.locationType} — ${l.sizeNote}`
                : l.locationValue,
            })),
          })}
        />
      )}
    </div>
  );
}
