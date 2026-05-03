import { useState, useEffect, useRef } from "react";
import { useRoute, Link, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Play, Square, Clock, CheckCircle2, Circle, AlertCircle,
  ChevronDown, ChevronUp, RotateCcw, Pencil, Trash2, Plus, Palette, X, Check,
  PackageCheck, Truck, Printer, FileText,
} from "lucide-react";
import { format, differenceInDays, isPast } from "date-fns";
import { cn } from "@/lib/utils";
import { RalColorInput } from "./project-form";

interface Procedure {
  id: number;
  name: string;
  status: "not_started" | "in_progress" | "completed";
  sortOrder: number;
  totalTimeSeconds: number;
  requiresInbound: boolean;
}

interface ProjectItem {
  id: number;
  name: string;
  sortOrder: number;
  progress: number;
  paintColor: string | null;
  procedures: Procedure[];
}

interface InboundRecord {
  id: number;
  status: "expected" | "arrived" | "stored" | "in_production";
  locationId: string | null;
  assignedProcedure: string | null;
  receivedAt: string | null;
}

interface Project {
  id: number;
  name: string;
  deadline: string;
  priority: "low" | "medium" | "high";
  status: "in_progress" | "completed";
  progress: number;
  totalProcedures: number;
  completedProcedures: number;
  paintColor: string | null;
  requiresExternalParts: boolean;
  inbound: InboundRecord | null;
  items: ProjectItem[];
}

interface ActiveTimer {
  log: { id: number; procedureId: number; startTime: string };
  procedure: Procedure;
}

interface Template {
  id: number;
  name: string;
  procedures: { id: number; name: string }[];
}

async function fetchProject(id: number): Promise<Project> {
  const res = await fetch(`/api/work/projects/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load project");
  return res.json();
}

async function fetchActiveTimer(): Promise<ActiveTimer | null> {
  const res = await fetch("/api/work/active-timer", { credentials: "include" });
  if (!res.ok) return null;
  return res.json();
}

async function fetchTemplates(): Promise<Template[]> {
  const res = await fetch("/api/work/templates", { credentials: "include" });
  if (!res.ok) return [];
  return res.json();
}

function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const priorityColors: Record<string, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-orange-100 text-orange-700 border-orange-200",
  low: "bg-blue-100 text-blue-700 border-blue-200",
};

function ProcedureRow({
  proc, isAdmin, activeTimerProcedureId, hasAnyActiveTimer, projectId, inboundStatus,
}: {
  proc: Procedure; isAdmin: boolean; activeTimerProcedureId: number | null;
  hasAnyActiveTimer: boolean; projectId: number;
  inboundStatus?: string | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isActive = activeTimerProcedureId === proc.id;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/work/projects/${projectId}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/work/active-timer"] });
  };

  const startMutation = useMutation({
    mutationFn: () => fetch(`/api/work/procedures/${proc.id}/start`, { method: "POST", credentials: "include" }).then(async (r) => {
      const d = await r.json(); if (!r.ok) throw new Error(d.error); return d;
    }),
    onSuccess: invalidate,
    onError: (err) => toast({ title: err instanceof Error ? err.message : "Error", variant: "destructive" }),
  });

  const stopMutation = useMutation({
    mutationFn: () => fetch(`/api/work/procedures/${proc.id}/stop`, { method: "POST", credentials: "include" }).then(async (r) => {
      const d = await r.json(); if (!r.ok) throw new Error(d.error); return d;
    }),
    onSuccess: invalidate,
    onError: (err) => toast({ title: err instanceof Error ? err.message : "Error", variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: () => fetch(`/api/work/procedures/${proc.id}/reset`, { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: invalidate,
    onError: (err) => toast({ title: err instanceof Error ? err.message : "Error", variant: "destructive" }),
  });

  const statusIcon = {
    not_started: <Circle className="h-4 w-4 text-muted-foreground" />,
    in_progress: <AlertCircle className="h-4 w-4 text-orange-500" />,
    completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  }[proc.status];

  const inboundBlocked = proc.requiresInbound && inboundStatus === "expected";

  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg border",
      inboundBlocked ? "bg-orange-50/60 border-orange-200 opacity-80" :
      isActive ? "bg-orange-50 border-orange-300" : proc.status === "completed" ? "bg-green-50/50 border-green-200/50" : "bg-background border-border"
    )}>
      {statusIcon}
      <div className="flex-1 min-w-0">
        <p className={cn("font-medium text-sm", proc.status === "completed" && "line-through text-muted-foreground")}>{proc.name}</p>
        {proc.requiresInbound && (
          <p className={cn("text-[10px] font-bold flex items-center gap-0.5 mt-0.5",
            inboundBlocked ? "text-orange-600" : "text-green-600"
          )}>
            <PackageCheck className="h-3 w-3" />
            {inboundBlocked ? "Waiting for parts" : "Parts available"}
          </p>
        )}
        {proc.totalTimeSeconds > 0 && (
          <p className="text-xs text-muted-foreground"><Clock className="inline h-3 w-3 mr-0.5" />{formatSeconds(proc.totalTimeSeconds)}</p>
        )}
        {isActive && <p className="text-xs text-orange-600 font-semibold animate-pulse">Running…</p>}
      </div>
      <div className="flex items-center gap-1.5">
        {isActive ? (
          <Button size="sm" onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending} className="h-9 px-3 bg-red-600 hover:bg-red-700 font-bold gap-1">
            <Square className="h-3.5 w-3.5" /> Stop
          </Button>
        ) : proc.status !== "completed" ? (
          <Button size="sm" onClick={() => startMutation.mutate()} disabled={hasAnyActiveTimer || startMutation.isPending || inboundBlocked}
            className={cn("h-9 px-3 font-bold gap-1", inboundBlocked ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-green-600 hover:bg-green-700")}>
            {inboundBlocked ? <PackageCheck className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {inboundBlocked ? "Waiting" : "Start"}
          </Button>
        ) : isAdmin ? (
          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => resetMutation.mutate()} title="Reset procedure">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ItemCard({
  item, isAdmin, activeTimerProcedureId, projectId, editMode, onDelete, onColorChange, inboundStatus,
}: {
  item: ProjectItem; isAdmin: boolean; activeTimerProcedureId: number | null;
  projectId: number; editMode: boolean; onDelete: () => void; onColorChange: (color: string | null) => void;
  inboundStatus?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingColor, setEditingColor] = useState(false);
  const [colorDraft, setColorDraft] = useState(item.paintColor ?? "");
  const hasActiveTimer = activeTimerProcedureId !== null;

  const effectiveColor = item.paintColor;

  return (
    <div className={cn("bg-card border-2 border-border rounded-xl overflow-hidden", editMode && "border-dashed border-orange-400/60")}>
      <button className="w-full p-4 flex items-center gap-3 text-left" onClick={() => !editMode && setExpanded((e) => !e)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-base">{item.name}</p>
            {effectiveColor && (
              <span className="text-xs font-bold bg-muted border border-border rounded px-1.5 py-0.5 flex items-center gap-1">
                <Palette className="h-3 w-3" />{effectiveColor}
              </span>
            )}
          </div>
          {!editMode && (
            <div className="mt-2 space-y-1">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full transition-all", item.progress === 100 ? "bg-green-500" : "bg-primary")} style={{ width: `${item.progress}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">{item.procedures.filter((p) => p.status === "completed").length} / {item.procedures.length} done</p>
            </div>
          )}
        </div>
        <div className="flex-shrink-0 flex items-center gap-2">
          {editMode ? (
            <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-700" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : (
            expanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </button>

      {editMode && (
        <div className="px-4 pb-3 border-t border-dashed border-border pt-2">
          <p className="text-xs font-bold text-muted-foreground mb-1.5">Item paint color override</p>
          {editingColor ? (
            <div className="flex gap-2">
              <div className="flex-1">
                <RalColorInput value={colorDraft} onChange={setColorDraft} />
              </div>
              <Button size="icon" className="h-10 w-10" onClick={() => { onColorChange(colorDraft || null); setEditingColor(false); }}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline" className="h-10 w-10" onClick={() => setEditingColor(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <button onClick={() => setEditingColor(true)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Palette className="h-3.5 w-3.5" />
              {effectiveColor ? <span className="font-semibold">{effectiveColor}</span> : <span>Set color…</span>}
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {!editMode && expanded && (
        <div className="px-4 pb-4 space-y-2 border-t border-border pt-3">
          {item.procedures.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No procedures</p>
          ) : item.procedures.map((proc) => (
            <ProcedureRow key={proc.id} proc={proc} isAdmin={isAdmin}
              activeTimerProcedureId={activeTimerProcedureId} hasAnyActiveTimer={hasActiveTimer}
              projectId={projectId} inboundStatus={inboundStatus} />
          ))}
        </div>
      )}
    </div>
  );
}

function AddItemsModal({
  projectId, templates, onClose,
}: {
  projectId: number; templates: Template[]; onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [color, setColor] = useState("");

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplateId) return;
      const res = await fetch(`/api/work/projects/${projectId}/items`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: selectedTemplateId, quantity, paintColor: color || null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      return d;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/work/projects/${projectId}`] });
      toast({ title: "Items added!" });
      onClose();
    },
    onError: (err) => toast({ title: err instanceof Error ? err.message : "Error", variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-t-3xl w-full max-w-md p-5 space-y-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Add Items</h2>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-bold text-muted-foreground">Template</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {templates.map((t) => (
              <button key={t.id} onClick={() => setSelectedTemplateId(t.id)}
                className={cn("w-full text-left p-2.5 rounded-lg border-2 transition-all text-sm",
                  selectedTemplateId === t.id ? "border-primary bg-primary/5 font-bold" : "border-border")}>
                {t.name} <span className="text-muted-foreground font-normal">· {t.procedures.length} steps</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-bold text-muted-foreground">Quantity</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="h-10 w-10 border-2 rounded-lg flex items-center justify-center font-bold">−</button>
            <input type="number" min={1} max={100} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-16 text-center text-lg font-black border-2 rounded-lg h-10 outline-none" />
            <button onClick={() => setQuantity((q) => Math.min(100, q + 1))} className="h-10 w-10 border-2 rounded-lg flex items-center justify-center font-bold">+</button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-bold text-muted-foreground flex items-center gap-1"><Palette className="h-3.5 w-3.5" /> Paint color (optional)</p>
          <RalColorInput value={color} onChange={setColor} />
        </div>

        <Button className="w-full h-12 font-bold" disabled={!selectedTemplateId || addMutation.isPending} onClick={() => addMutation.mutate()}>
          {addMutation.isPending ? "Adding…" : `Add ${quantity} item${quantity !== 1 ? "s" : ""}`}
        </Button>
      </div>
    </div>
  );
}

export default function WorkProjectDetailPage() {
  const [, params] = useRoute("/work/projects/:id");
  const projectId = Number(params?.id);
  const search = useSearch();
  const deepLinkItemId = new URLSearchParams(search).get("item");
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [showAddItems, setShowAddItems] = useState(false);
  const [editingProjectColor, setEditingProjectColor] = useState(false);
  const [projectColorDraft, setProjectColorDraft] = useState("");

  const { data: project, isLoading } = useQuery({
    queryKey: [`/api/work/projects/${projectId}`],
    queryFn: () => fetchProject(projectId),
    refetchInterval: editMode ? false : 10000,
    enabled: !!projectId,
  });

  const { data: activeTimer } = useQuery({
    queryKey: ["/api/work/active-timer"],
    queryFn: fetchActiveTimer,
    refetchInterval: 5000,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["/api/work/templates"],
    queryFn: fetchTemplates,
    enabled: editMode,
  });

  const { data: originQuotes = [] } = useQuery<Array<{ id: number; quoteNumber: string }>>({
    queryKey: [`/api/quotes?workProjectId=${projectId}`],
    queryFn: async () => {
      const r = await fetch(`/api/quotes?workProjectId=${projectId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!projectId,
  });
  const originQuote = originQuotes[0];

  const completeMutation = useMutation({
    mutationFn: () => fetch(`/api/work/projects/${projectId}`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/work/projects/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/work/projects"] });
      toast({ title: "Project marked as complete!" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: number) => fetch(`/api/work/project-items/${itemId}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/work/projects/${projectId}`] }),
    onError: () => toast({ title: "Failed to remove item", variant: "destructive" }),
  });

  const updateItemColorMutation = useMutation({
    mutationFn: ({ itemId, paintColor }: { itemId: number; paintColor: string | null }) =>
      fetch(`/api/work/project-items/${itemId}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paintColor }),
      }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/work/projects/${projectId}`] }),
    onError: () => toast({ title: "Failed to update color", variant: "destructive" }),
  });

  const updateProjectColorMutation = useMutation({
    mutationFn: (paintColor: string | null) => fetch(`/api/work/projects/${projectId}`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paintColor }),
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/work/projects/${projectId}`] });
      setEditingProjectColor(false);
    },
    onError: () => toast({ title: "Failed to update color", variant: "destructive" }),
  });

  const activeTimerProcedureId = activeTimer?.log?.procedureId ?? null;

  // Scroll to deep-linked item when data loads
  useEffect(() => {
    if (!deepLinkItemId || !project) return;
    const id = Number(deepLinkItemId);
    const el = itemRefs.current.get(id);
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    }
  }, [deepLinkItemId, project]);

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!project) {
    return <div className="p-6 text-center text-muted-foreground">Project not found.</div>;
  }

  const daysLeft = differenceInDays(new Date(project.deadline), new Date());
  const isOverdue = isPast(new Date(project.deadline)) && project.status !== "completed";

  return (
    <div className="flex flex-col min-h-full pb-24">
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm flex items-center gap-3">
        <Link href="/work/projects" className="p-2 -ml-2 rounded-full hover:bg-secondary-foreground/10 transition-colors">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{project.name}</h1>
        </div>
        <Badge className={priorityColors[project.priority] + " text-xs font-bold uppercase"}>
          {project.priority}
        </Badge>
        <Link href={`/work/projects/${projectId}/print-tag`}>
          <button className="p-2 rounded-full hover:bg-secondary-foreground/10 transition-colors" title="Print job tags">
            <Printer className="h-4 w-4" />
          </button>
        </Link>
        {isAdmin && (
          <button
            onClick={() => setEditMode((e) => !e)}
            className={cn("p-2 rounded-full transition-colors", editMode ? "bg-orange-500 text-white" : "hover:bg-secondary-foreground/10")}
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>

      {originQuote && (
        <Link href={`/quotes/${originQuote.id}`}>
          <div className="bg-purple-50 border-b border-purple-200 px-4 py-2 flex items-center gap-2 hover:bg-purple-100 transition-colors cursor-pointer">
            <FileText className="h-4 w-4 text-purple-700 flex-shrink-0" />
            <p className="text-xs text-purple-800">
              From quote <span className="font-bold">{originQuote.quoteNumber}</span> — tap to view
            </p>
          </div>
        </Link>
      )}

      {editMode && (
        <div className="bg-orange-50 border-b border-orange-200 px-4 py-2 flex items-center justify-between gap-3">
          <p className="text-xs font-bold text-orange-700 uppercase tracking-wide">Edit Mode — tap 🗑 to remove items</p>
          <Button size="sm" variant="outline" className="h-8 border-orange-400 text-orange-700" onClick={() => setShowAddItems(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Items
          </Button>
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Project overview */}
        <div className={cn(
          "rounded-xl border-2 p-4 space-y-3",
          isOverdue ? "bg-red-50 border-red-300" : project.status === "completed" ? "bg-green-50 border-green-300" : "bg-card border-border"
        )}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-3xl font-black">{project.progress}%</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">complete</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-sm">{format(new Date(project.deadline), "dd MMM yyyy")}</p>
              <p className={cn("text-xs font-semibold", isOverdue ? "text-red-600" : daysLeft < 5 ? "text-orange-600" : "text-green-600")}>
                {project.status === "completed" ? "Completed ✓" : isOverdue ? "Overdue!" : `${daysLeft} days left`}
              </p>
            </div>
          </div>
          <div className="h-3 bg-black/10 rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full transition-all", project.progress === 100 ? "bg-green-500" : "bg-primary")} style={{ width: `${project.progress}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            {project.completedProcedures} / {project.totalProcedures} procedures · {project.items.length} items
          </p>

          {/* Project-level paint color */}
          <div className="pt-1 border-t border-border/50">
            {editingProjectColor ? (
              <div className="flex gap-2">
                <div className="flex-1">
                  <RalColorInput value={projectColorDraft} onChange={setProjectColorDraft} />
                </div>
                <Button size="icon" className="h-10 w-10" onClick={() => updateProjectColorMutation.mutate(projectColorDraft || null)}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" className="h-10 w-10" onClick={() => setEditingProjectColor(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                onClick={() => { if (isAdmin) { setProjectColorDraft(project.paintColor ?? ""); setEditingProjectColor(true); } }}
                className={cn("flex items-center gap-2 text-sm", isAdmin ? "hover:opacity-70 cursor-pointer" : "cursor-default")}
              >
                <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                {project.paintColor ? (
                  <span className="font-bold">{project.paintColor}</span>
                ) : (
                  <span className="text-muted-foreground">{isAdmin ? "Set project paint color…" : "No paint color set"}</span>
                )}
                {isAdmin && <Pencil className="h-3 w-3 text-muted-foreground" />}
              </button>
            )}
          </div>
        </div>

        {/* Inbound status banner */}
        {project.inbound && (
          <div className={cn(
            "rounded-xl border-2 p-3 flex items-center gap-3",
            project.inbound.status === "expected" ? "bg-blue-50 border-blue-200" :
            project.inbound.status === "arrived" ? "bg-orange-50 border-orange-300" :
            project.inbound.status === "in_production" ? "bg-purple-50 border-purple-200" :
            "bg-green-50 border-green-200"
          )}>
            {project.inbound.status === "expected" ? <PackageCheck className="h-4 w-4 text-blue-600 flex-shrink-0" /> :
             project.inbound.status === "arrived" ? <Truck className="h-4 w-4 text-orange-600 flex-shrink-0 animate-pulse" /> :
             <PackageCheck className="h-4 w-4 text-green-600 flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className={cn("text-xs font-bold uppercase tracking-wide",
                project.inbound.status === "expected" ? "text-blue-700" :
                project.inbound.status === "arrived" ? "text-orange-700" :
                project.inbound.status === "in_production" ? "text-purple-700" :
                "text-green-700"
              )}>
                Parts: {project.inbound.status === "expected" ? "Awaiting arrival" :
                        project.inbound.status === "arrived" ? "Arrived — needs routing" :
                        project.inbound.status === "stored" ? "Stored in warehouse" :
                        "Sent to production"}
              </p>
              {project.inbound.receivedAt && (
                <p className="text-[10px] text-muted-foreground">
                  Received {new Date(project.inbound.receivedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Active timer banner */}
        {activeTimer && activeTimerProcedureId && (
          <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-orange-600 flex-shrink-0" />
            <p className="text-sm text-orange-700 font-medium">
              Task running: <strong>{activeTimer.procedure?.name}</strong>
            </p>
          </div>
        )}

        {/* Items */}
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Items</p>
          {project.items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-xl">
              {editMode ? "No items — tap + Add Items above" : "No items in this project."}
            </div>
          ) : (
            project.items.map((item) => (
              <div
                key={item.id}
                ref={(el) => { if (el) itemRefs.current.set(item.id, el); else itemRefs.current.delete(item.id); }}
                className={cn(
                  "rounded-xl transition-all",
                  deepLinkItemId && Number(deepLinkItemId) === item.id ? "ring-2 ring-primary ring-offset-1" : "",
                )}
              >
                <ItemCard
                  item={item}
                  isAdmin={isAdmin}
                  activeTimerProcedureId={activeTimerProcedureId}
                  projectId={projectId}
                  editMode={editMode}
                  onDelete={() => deleteItemMutation.mutate(item.id)}
                  onColorChange={(color) => updateItemColorMutation.mutate({ itemId: item.id, paintColor: color })}
                  inboundStatus={project.inbound?.status ?? null}
                />
              </div>
            ))
          )}
        </div>

        {isAdmin && project.status === "in_progress" && project.progress === 100 && !editMode && (
          <Button
            className="w-full h-14 bg-green-600 hover:bg-green-700 font-bold text-base gap-2"
            onClick={() => completeMutation.mutate()}
            disabled={completeMutation.isPending}
          >
            <CheckCircle2 className="h-5 w-5" /> Mark Project Complete
          </Button>
        )}
      </div>

      {showAddItems && (
        <AddItemsModal
          projectId={projectId}
          templates={templates}
          onClose={() => setShowAddItems(false)}
        />
      )}
    </div>
  );
}
