import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, usePlan } from "@/contexts/auth";
import { useLang } from "@/contexts/lang";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Loader2, Calendar, FolderPlus, Minus, Plus, Palette, PackageCheck, Zap, X, ListPlus, AlertTriangle, Sparkles, BookOpen, Check, ArrowUp, ArrowDown, Package, Settings2, ChevronDown, Wrench } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AiTipsPanel } from "@/components/ai-tips-panel";

interface Template {
  id: number;
  name: string;
  stepCount?: number;
}

interface QuickStep {
  name: string;
  roleId: number | null;
}

interface Role {
  id: number;
  name: string;
}

interface ProcedureOption {
  id: number;
  name: string;
  roleId: number | null;
  roleName: string | null;
}

interface BomShortage { productId: number; productName: string; needed: number; have: number; shortfall: number }
interface BomCheckResult { ok: boolean; shortages: BomShortage[] }

async function fetchTemplates(): Promise<Template[]> {
  const res = await fetch("/api/work/templates", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load templates");
  return res.json();
}

async function fetchRoles(): Promise<Role[]> {
  const res = await fetch("/api/tasks/roles", { credentials: "include" });
  if (!res.ok) return [];
  return res.json();
}

async function fetchProcedures(): Promise<ProcedureOption[]> {
  const res = await fetch("/api/tasks/procedures", { credentials: "include" });
  if (!res.ok) return [];
  return res.json();
}

const priorities = [
  { value: "low", label: "Low", color: "border-blue-400 bg-blue-50 text-blue-700" },
  { value: "normal", label: "Normal", color: "border-orange-400 bg-orange-50 text-orange-700" },
  { value: "high", label: "High", color: "border-red-400 bg-red-50 text-red-700" },
  { value: "urgent", label: "Urgent", color: "border-rose-600 bg-rose-50 text-rose-700" },
];

function RalColorInput({
  value,
  onChange,
  placeholder = "e.g. RAL9005",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [raw, setRaw] = useState(() => {
    const m = value?.match(/^RAL(\d+)$/i);
    return m ? m[1] : value || "";
  });

  const handleChange = (v: string) => {
    const num = v.replace(/\D/g, "");
    setRaw(num);
    onChange(num ? `RAL${num}` : "");
  };

  return (
    <div className="flex items-center border-2 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary/30 bg-background">
      <span className="px-3 py-2.5 bg-muted font-bold text-sm text-muted-foreground border-r-2 border-border">RAL</span>
      <input
        type="text"
        inputMode="numeric"
        value={raw}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder.replace(/^RAL/, "")}
        className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none"
      />
    </div>
  );
}

export { RalColorInput };

// Shared deadline/priority fields used by both the Make dialog and Quick Job view.
function PriorityPicker({ priority, setPriority }: {
  priority: "low" | "normal" | "high" | "urgent";
  setPriority: (p: "low" | "normal" | "high" | "urgent") => void;
}) {
  const { t } = useLang();
  const priorityLabels: Record<string, string> = {
    low: t("priorityLow"),
    normal: t("priorityNormal"),
    high: t("priorityHigh"),
    urgent: t("priorityUrgent"),
  };
  return (
    <div className="grid grid-cols-4 gap-2">
      {priorities.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => setPriority(p.value as typeof priority)}
          className={cn(
            "h-11 rounded-lg border-2 font-bold text-xs transition-all",
            priority === p.value ? p.color + " border-current" : "bg-muted/30 text-muted-foreground border-border"
          )}
        >
          {priorityLabels[p.value]}
        </button>
      ))}
    </div>
  );
}

interface SelectedItem { template: Template; quantity: number }

// ─── Review & create dialog ─────────────────────────────────────────────────
// Shared job details for one OR MANY selected templates. The boss assembles an
// order from the catalog (e.g. roll cage + engine protection + step) and this
// dialog collects the order-level details and creates a single work order.
function ReviewJobDialog({ items, onClose, onCreated }: {
  items: SelectedItem[];
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { atLeast } = usePlan();

  const [name, setName] = useState(items.length === 1 ? items[0].template.name : "");
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [paintColor, setPaintColor] = useState("");
  const [requiresExternalParts, setRequiresExternalParts] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [bomConfirmed, setBomConfirmed] = useState(false);
  // Order multiplier: the per-product quantities form one "package"; this many packages are made.
  const [packages, setPackages] = useState(1);

  // Effective quantity of a product across the whole order (per-package qty × packages).
  const effectiveQty = (perPackage: number) => perPackage * packages;

  // Delivery date prediction for single-template jobs (Standard+)
  const singleTemplateId = items.length === 1 ? items[0].template.id : null;
  const { data: durationData } = useQuery<{ avgDays: number | null; jobCount: number }>({
    queryKey: ["/api/analytics/template-duration", singleTemplateId],
    queryFn: () =>
      fetch(`/api/analytics/template-duration?templateId=${singleTemplateId}`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!singleTemplateId && atLeast("standard"),
  });

  // Combined stock check across every selected item, scaled by the package multiplier.
  const { data: bomResults = [] } = useQuery<BomCheckResult[]>({
    queryKey: ["/api/work/bom-check", items.map((i) => [i.template.id, i.quantity]), packages],
    queryFn: async () => Promise.all(items.map(async (it) => {
      const res = await fetch(`/api/work/bom-check?templateId=${it.template.id}&quantity=${effectiveQty(it.quantity)}`, { credentials: "include" });
      if (!res.ok) return { ok: true, shortages: [] };
      return res.json();
    })),
  });

  // Merge shortages by product so the same part across two items shows once.
  const shortageMap = new Map<number, BomShortage>();
  for (const s of bomResults.flatMap((r) => r.shortages)) {
    const existing = shortageMap.get(s.productId);
    if (existing) { existing.needed += s.needed; existing.shortfall += s.shortfall; }
    else shortageMap.set(s.productId, { ...s });
  }
  const shortages = [...shortageMap.values()];

  const totalItems = items.reduce((sum, it) => sum + effectiveQty(it.quantity), 0);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/work/projects", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), deadline, priority,
          paintColor: paintColor || null,
          requiresExternalParts,
          quickJob: false,
          templateItems: items.map((it) => ({ templateId: it.template.id, quantity: effectiveQty(it.quantity) })),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to create work order");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/work/projects"] });
      const actions: { type: string; productName: string; shortfall: number; poId?: number }[] = data.procurementActions ?? [];
      const pos = actions.filter((a) => a.type === "draft_po");
      const cnc = actions.filter((a) => a.type === "cnc_task_flagged");
      if (pos.length > 0 || cnc.length > 0) {
        const lines: string[] = [];
        if (pos.length > 0) lines.push(`Draft PO created for: ${pos.map((a) => a.productName).join(", ")}`);
        if (cnc.length > 0) lines.push(`CNC tasks flagged: ${cnc.map((a) => a.productName).join(", ")}`);
        toast({ title: "Work order created — stock shortages detected", description: lines.join(" · ") });
      } else {
        toast({ title: "Work order created!" });
      }
      onCreated(data.id);
    },
    onError: (err) => toast({ title: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  const canSubmit = !!name.trim() && !!deadline;
  const hasUnconfirmedShortages = shortages.length > 0 && !bomConfirmed;

  const handleSubmit = () => {
    if (hasUnconfirmedShortages) { setBomConfirmed(true); return; }
    createMutation.mutate();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[92vw] max-w-md rounded-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" /> {t("jobsReviewOrder")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Items summary */}
          <div className="rounded-xl border-2 border-border bg-muted/20 p-3 space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {items.length} product{items.length !== 1 ? "s" : ""} · {totalItems} item{totalItems !== 1 ? "s" : ""}
            </p>
            {items.map((it) => (
              <div key={it.template.id} className="flex items-center justify-between text-sm">
                <span className="font-medium truncate">{it.template.name}</span>
                <span className="text-muted-foreground font-bold flex-shrink-0 ml-2">
                  ×{it.quantity}
                  {packages > 1 && <span className="text-primary"> → {effectiveQty(it.quantity)}</span>}
                </span>
              </div>
            ))}
          </div>

          {/* Order multiplier */}
          <div className="flex items-center justify-between rounded-xl border-2 border-border bg-card p-3">
            <div className="min-w-0">
              <p className="font-bold text-sm">{t("jobsPackages")}</p>
              <p className="text-xs text-muted-foreground">Make this whole set this many times</p>
            </div>
            <div className="flex items-center gap-1 bg-background border-2 border-primary/20 rounded-lg flex-shrink-0">
              <button type="button" className="p-2 hover:bg-muted rounded-l-lg" onClick={() => setPackages((p) => Math.max(1, p - 1))}>
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number" min={1} max={100} value={packages}
                onChange={(e) => setPackages(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                className="w-12 text-center text-lg font-black bg-transparent outline-none py-1"
              />
              <button type="button" className="p-2 hover:bg-muted rounded-r-lg" onClick={() => setPackages((p) => Math.min(100, p + 1))}>
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Job name */}
          <div className="space-y-2">
            <Label className="text-sm font-bold">{t("jobsJobName")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11 border-2 text-base" placeholder="e.g. Smith roll cage order" />
          </div>

          {/* Deadline */}
          <div className="space-y-2">
            <Label className="text-sm font-bold flex items-center gap-2"><Calendar className="h-4 w-4" /> {t("fieldDeadline")}</Label>
            <Input
              type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)}
              className="h-11 border-2 text-base" min={new Date().toISOString().split("T")[0]}
            />
            {durationData && durationData.jobCount >= 3 && durationData.avgDays != null && (
              <div className="flex items-center gap-2 text-xs bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-muted-foreground">
                  Avg <span className="font-semibold text-foreground">{durationData.avgDays}d</span> based on {durationData.jobCount} similar jobs
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + Math.ceil(durationData.avgDays!));
                    setDeadline(d.toISOString().split("T")[0]);
                  }}
                  className="ml-auto text-primary hover:underline font-semibold whitespace-nowrap"
                >
                  Suggest →
                </button>
              </div>
            )}
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label className="text-sm font-bold">{t("fieldPriority")}</Label>
            <PriorityPicker priority={priority} setPriority={setPriority} />
          </div>

          {/* More options (paint + external parts) */}
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            <Settings2 className="h-4 w-4" />
            {t("jobsMoreOptions")}
            <ChevronDown className={cn("h-4 w-4 transition-transform", showMore && "rotate-180")} />
          </button>

          {showMore && (
            <div className="space-y-4 border-l-2 border-muted pl-3">
              <div className="space-y-2">
                <Label className="text-sm font-bold flex items-center gap-2"><Palette className="h-4 w-4" /> Paint color (whole order)</Label>
                <RalColorInput value={paintColor} onChange={setPaintColor} placeholder="RAL9005" />
                <p className="text-xs text-muted-foreground">Leave blank if no paint or items have individual colors.</p>
              </div>

              <div
                className={`rounded-xl border-2 p-3 flex items-start gap-3 cursor-pointer transition-all ${requiresExternalParts ? "border-orange-400 bg-orange-50" : "border-border bg-muted/20"}`}
                onClick={() => setRequiresExternalParts((v) => !v)}
              >
                <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${requiresExternalParts ? "bg-orange-500 border-orange-500" : "border-muted-foreground/40 bg-background"}`}>
                  {requiresExternalParts && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <PackageCheck className={`h-4 w-4 ${requiresExternalParts ? "text-orange-600" : "text-muted-foreground"}`} />
                    <p className={`font-bold text-sm ${requiresExternalParts ? "text-orange-700" : "text-foreground"}`}>Requires external parts</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Creates an inbound record to track when parts arrive.</p>
                </div>
              </div>
            </div>
          )}

          {/* BOM shortage warning */}
          {shortages.length > 0 && !bomConfirmed && (
            <div className="border-2 border-amber-300 bg-amber-50 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <p className="font-bold text-sm text-amber-800">Stock shortage warning</p>
              </div>
              <p className="text-xs text-amber-700">These parts are insufficient (available after reservations):</p>
              <div className="space-y-1">
                {shortages.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-amber-100 rounded-lg px-2.5 py-1.5">
                    <span className="font-medium text-amber-900 truncate">{s.productName}</span>
                    <span className="text-amber-700 font-bold flex-shrink-0 ml-2">need {s.needed}, available {s.have}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasUnconfirmedShortages ? (
            <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full h-12 font-bold bg-amber-600 hover:bg-amber-700">
              <AlertTriangle className="mr-2 h-5 w-5" /> Continue despite shortage
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!canSubmit || createMutation.isPending} className="w-full h-12 font-bold text-base">
              {createMutation.isPending
                ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Creating…</>
                : <><FolderPlus className="mr-2 h-5 w-5" /> Create Work Order</>}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Quick one-off job view ─────────────────────────────────────────────────
// Full-screen flow for jobs that don't have a template (one-off repairs etc.).
function QuickJobView({ roles, onClose, onCreated }: {
  roles: Role[];
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [paintColor, setPaintColor] = useState("");
  const [requiresExternalParts, setRequiresExternalParts] = useState(false);
  const [quickSteps, setQuickSteps] = useState<QuickStep[]>([]);
  const [newStepName, setNewStepName] = useState("");
  const [showProcedurePicker, setShowProcedurePicker] = useState(false);
  const [procedureSearch, setProcedureSearch] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiDescription, setAiDescription] = useState("");
  const [aiPreviewSteps, setAiPreviewSteps] = useState<QuickStep[] | null>(null);

  const { data: procedures = [] } = useQuery<ProcedureOption[]>({
    queryKey: ["/api/tasks/procedures"],
    queryFn: fetchProcedures,
  });

  const aiGenerate = useMutation({
    mutationFn: async (description: string) => {
      const res = await fetch("/api/work/quick-steps/generate", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "AI couldn't generate steps. Please try again.");
      }
      return res.json() as Promise<{ steps: QuickStep[] }>;
    },
    onSuccess: (data) => setAiPreviewSteps(data.steps),
    onError: (e) => toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/work/projects", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), deadline, priority,
          paintColor: paintColor || null,
          requiresExternalParts,
          quickJob: true,
          quickJobName: name.trim(),
          quickSteps: quickSteps.filter((s) => s.name.trim()),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to create work order");
      }
      return res.json();
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/work/projects"] });
      toast({ title: "Work order created!" });
      onCreated(project.id);
    },
    onError: (err) => toast({ title: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  const addQuickStep = () => {
    if (!newStepName.trim()) return;
    setQuickSteps((prev) => [...prev.filter((s) => s.name.trim()), { name: newStepName.trim(), roleId: null }]);
    setNewStepName("");
  };
  const removeQuickStep = (idx: number) => setQuickSteps((prev) => prev.filter((_, i) => i !== idx));
  const updateQuickStep = (idx: number, updates: Partial<QuickStep>) =>
    setQuickSteps((prev) => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));

  const validSteps = quickSteps.filter((s) => s.name.trim());
  const canSubmit = !!name.trim() && !!deadline && validSteps.length > 0;

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm flex items-center gap-3">
        <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-secondary-foreground/10 transition-colors">
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="text-xl font-bold flex items-center gap-2"><Zap className="h-5 w-5" /> Quick One-off Job</h1>
      </div>

      <div className="p-4 space-y-6 pb-24">
        <div className="space-y-2">
          <Label className="text-sm font-bold">Job name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gate repair #12" className="h-12 border-2 text-base" />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-bold flex items-center gap-2"><Calendar className="h-4 w-4" /> Deadline</Label>
          <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="h-12 border-2 text-base" min={new Date().toISOString().split("T")[0]} />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-bold">Priority</Label>
          <PriorityPicker priority={priority} setPriority={setPriority} />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-bold flex items-center gap-2"><Palette className="h-4 w-4" /> Paint color (whole order)</Label>
          <RalColorInput value={paintColor} onChange={setPaintColor} placeholder="RAL9005" />
        </div>

        <div
          className={`rounded-xl border-2 p-4 flex items-start gap-3 cursor-pointer transition-all ${requiresExternalParts ? "border-orange-400 bg-orange-50" : "border-border bg-muted/20"}`}
          onClick={() => setRequiresExternalParts((v) => !v)}
        >
          <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${requiresExternalParts ? "bg-orange-500 border-orange-500" : "border-muted-foreground/40 bg-background"}`}>
            {requiresExternalParts && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <PackageCheck className={`h-4 w-4 ${requiresExternalParts ? "text-orange-600" : "text-muted-foreground"}`} />
              <p className={`font-bold text-sm ${requiresExternalParts ? "text-orange-700" : "text-foreground"}`}>Requires external parts</p>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Creates an inbound record to track when parts arrive.</p>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-bold">Production steps</Label>
            <span className="text-xs text-muted-foreground">{validSteps.length} step{validSteps.length !== 1 ? "s" : ""}</span>
          </div>

          <div className="space-y-2">
            {validSteps.map((step, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-card border-2 border-border rounded-lg px-3 py-2">
                <span className="text-muted-foreground font-mono text-xs w-5 flex-shrink-0">{idx + 1}.</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{step.name}</p>
                  {roles.length > 0 && (
                    <select
                      value={step.roleId ?? ""}
                      onChange={(e) => updateQuickStep(idx, { roleId: e.target.value ? Number(e.target.value) : null })}
                      className="mt-1 w-full text-xs rounded border border-border bg-background px-2 py-0.5"
                    >
                      <option value="">No role assigned</option>
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  )}
                </div>
                <button onClick={() => removeQuickStep(idx)} className="p-1 text-muted-foreground hover:text-destructive rounded">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              value={newStepName}
              onChange={(e) => setNewStepName(e.target.value)}
              placeholder="e.g. Weld frame, Sandblast…"
              className="h-10 border-2 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") addQuickStep(); }}
            />
            <Button size="sm" variant="outline" className="h-10 px-3 flex-shrink-0" onClick={addQuickStep} disabled={!newStepName.trim()}>
              <ListPlus className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button" size="sm" variant="outline"
              className="h-10 gap-1.5 border-indigo-300 text-indigo-700 hover:bg-indigo-50"
              onClick={() => { setShowProcedurePicker((v) => !v); setProcedureSearch(""); }}
            >
              <BookOpen className="h-3.5 w-3.5" />
              {showProcedurePicker ? "Hide" : "Pick from procedures"}
            </Button>
            <Button
              type="button" size="sm"
              className="h-10 gap-1.5 bg-purple-600 hover:bg-purple-700"
              onClick={() => { setAiOpen(true); setAiPreviewSteps(null); }}
            >
              <Sparkles className="h-3.5 w-3.5" /> Generate with AI
            </Button>
          </div>

          {showProcedurePicker && (
            <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Saved procedures</p>
                <Link href="/admin/procedures" className="text-[10px] font-bold text-indigo-700 hover:underline uppercase">Manage →</Link>
              </div>
              {procedures.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No saved procedures yet.{" "}
                  <Link href="/admin/procedures" className="text-indigo-700 font-semibold underline">Create some first.</Link>
                </p>
              ) : (
                <>
                  <Input value={procedureSearch} onChange={(e) => setProcedureSearch(e.target.value)} placeholder="Search procedures…" className="h-9 border-2 text-sm bg-background" />
                  <div className="max-h-56 overflow-y-auto space-y-1.5">
                    {procedures
                      .filter((p) => !procedureSearch || p.name.toLowerCase().includes(procedureSearch.toLowerCase()))
                      .map((p) => {
                        const alreadyAdded = quickSteps.some((s) => s.name.trim().toLowerCase() === p.name.toLowerCase());
                        return (
                          <button
                            key={p.id}
                            type="button"
                            disabled={alreadyAdded}
                            onClick={() => setQuickSteps((prev) => [...prev.filter((s) => s.name.trim()), { name: p.name, roleId: p.roleId ?? null }])}
                            className={cn(
                              "w-full text-left flex items-center justify-between gap-2 px-2.5 py-1.5 rounded border bg-background transition-colors",
                              alreadyAdded ? "opacity-50 cursor-not-allowed" : "hover:border-indigo-400 hover:bg-indigo-50",
                            )}
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{p.name}</p>
                              {p.roleName && <p className="text-[10px] text-muted-foreground">{p.roleName}</p>}
                            </div>
                            {alreadyAdded ? <span className="text-[10px] text-muted-foreground font-bold">ADDED</span> : <Plus className="h-3.5 w-3.5 text-indigo-600 flex-shrink-0" />}
                          </button>
                        );
                      })}
                  </div>
                </>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Quick jobs create a single item with the steps you define. Great for one-off repairs or small custom jobs.
          </p>
        </div>

        <Button
          onClick={() => createMutation.mutate()}
          disabled={!canSubmit || createMutation.isPending}
          className="w-full h-14 font-bold text-base"
        >
          {createMutation.isPending
            ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Creating…</>
            : <><FolderPlus className="mr-2 h-5 w-5" /> Create Work Order</>}
        </Button>
      </div>

      {/* AI generate dialog */}
      <Dialog open={aiOpen} onOpenChange={(o) => { setAiOpen(o); if (!o) { setAiPreviewSteps(null); setAiDescription(""); } }}>
        <DialogContent className="w-[90vw] max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-purple-600" /> Generate Steps with AI</DialogTitle>
          </DialogHeader>

          {!aiPreviewSteps ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold">Describe the job</label>
                <Textarea
                  value={aiDescription}
                  onChange={(e) => setAiDescription(e.target.value)}
                  placeholder="e.g. Repair a damaged steel railing — sand rust, weld broken section, repaint black"
                  className="border-2 min-h-[100px] text-sm"
                  rows={4}
                />
              </div>
              <AiTipsPanel context="quick-job" defaultOpen />
              <p className="text-xs text-muted-foreground">AI will suggest a list of steps for you to review before they're added.</p>
              <Button
                className="w-full h-11 font-bold bg-purple-600 hover:bg-purple-700"
                disabled={!aiDescription.trim() || aiGenerate.isPending}
                onClick={() => aiGenerate.mutate(aiDescription.trim())}
              >
                {aiGenerate.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…</> : <><Sparkles className="mr-2 h-4 w-4" /> Generate Preview</>}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2 max-h-80 overflow-y-auto">
                <p className="text-xs font-bold uppercase tracking-wider text-purple-700">Review & edit suggested steps</p>
                {aiPreviewSteps.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No steps left. Go back and try again.</p>
                ) : (
                  <ol className="space-y-1.5">
                    {aiPreviewSteps.map((s, i) => (
                      <li key={i} className="bg-background border border-purple-200 rounded p-2 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground font-mono text-xs w-5 flex-shrink-0">{i + 1}.</span>
                          <Input
                            value={s.name}
                            onChange={(e) => setAiPreviewSteps((prev) => prev?.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x) ?? null)}
                            className="h-7 text-xs border-purple-200"
                          />
                          <button type="button" disabled={i === 0} onClick={() => setAiPreviewSteps((prev) => { if (!prev) return prev; const arr = [...prev]; [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; return arr; })} className="p-1 text-muted-foreground hover:text-purple-700 disabled:opacity-30" title="Move up">
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button type="button" disabled={i === aiPreviewSteps.length - 1} onClick={() => setAiPreviewSteps((prev) => { if (!prev) return prev; const arr = [...prev]; [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; return arr; })} className="p-1 text-muted-foreground hover:text-purple-700 disabled:opacity-30" title="Move down">
                            <ArrowDown className="h-3 w-3" />
                          </button>
                          <button type="button" onClick={() => setAiPreviewSteps((prev) => prev?.filter((_, idx) => idx !== i) ?? null)} className="p-1 text-muted-foreground hover:text-destructive" title="Remove">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {roles.length > 0 && (
                          <div className="flex items-center gap-1.5 pl-7">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground">Role:</span>
                            <select
                              value={s.roleId ?? ""}
                              onChange={(e) => setAiPreviewSteps((prev) => prev?.map((x, idx) => idx === i ? { ...x, roleId: e.target.value ? Number(e.target.value) : null } : x) ?? null)}
                              className="flex-1 text-xs rounded border border-purple-200 bg-background px-1.5 py-0.5"
                            >
                              <option value="">No role</option>
                              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Edit names, change roles, reorder, or remove any step before applying.</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setAiPreviewSteps(null)}>← Edit description</Button>
                <Button
                  className="flex-1 font-bold bg-purple-600 hover:bg-purple-700"
                  disabled={aiPreviewSteps.length === 0}
                  onClick={() => {
                    setQuickSteps((prev) => [...prev.filter((s) => s.name.trim()), ...aiPreviewSteps]);
                    setAiOpen(false);
                    setAiPreviewSteps(null);
                    setAiDescription("");
                    toast({ title: `${aiPreviewSteps.length} step${aiPreviewSteps.length !== 1 ? "s" : ""} added` });
                  }}
                >
                  <Check className="mr-1.5 h-4 w-4" /> Apply Steps
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Catalog page (default export) ──────────────────────────────────────────
export default function WorkProjectFormPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Selected items accumulate as the boss taps catalog cards. Keyed by templateId.
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [reviewing, setReviewing] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["/api/work/templates"],
    queryFn: fetchTemplates,
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/tasks/roles"],
    queryFn: fetchRoles,
  });

  if (user?.role !== "admin") {
    return <div className="p-6 text-center text-muted-foreground mt-20"><p>Admin only</p></div>;
  }

  const goToProject = (id: number) => setLocation(`/work/projects/${id}`);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id]; else next[id] = 1;
      return next;
    });
  const setQty = (id: number, qty: number) =>
    setSelected((prev) => ({ ...prev, [id]: Math.max(1, Math.min(100, qty)) }));

  const selectedItems: SelectedItem[] = templates
    .filter((t) => selected[t.id])
    .map((t) => ({ template: t, quantity: selected[t.id] }));
  const totalItems = selectedItems.reduce((sum, it) => sum + it.quantity, 0);

  if (quickOpen) {
    return <QuickJobView roles={roles} onClose={() => setQuickOpen(false)} onCreated={goToProject} />;
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm flex items-center gap-3">
        <Link href="/work/projects" className="p-2 -ml-2 rounded-full hover:bg-secondary-foreground/10 transition-colors">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-xl font-bold">What are we making?</h1>
      </div>

      <div className="p-4 space-y-4 pb-28">
        {/* Quick one-off job */}
        <button
          onClick={() => setQuickOpen(true)}
          className="w-full rounded-xl border-2 border-dashed border-purple-300 bg-purple-50/50 p-4 flex items-center gap-3 text-left hover:bg-purple-50 transition-colors"
        >
          <div className="h-11 w-11 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Zap className="h-5 w-5 text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">Quick one-off job</p>
            <p className="text-xs text-muted-foreground">No template — define steps yourself or with AI</p>
          </div>
          <Plus className="h-5 w-5 text-purple-400 flex-shrink-0" />
        </button>

        <div className="flex items-center justify-between pt-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Tap to add products</h2>
          <Link href="/work/templates" className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
            <Wrench className="h-3 w-3" /> Manage templates
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-32 bg-muted/40 rounded-xl animate-pulse" />)}
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-10 px-4 bg-muted/30 rounded-xl border border-dashed">
            <Package className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="font-semibold text-muted-foreground">No templates yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Templates are the things you make regularly.{" "}
              <Link href="/work/templates" className="text-primary font-semibold">Create your first one.</Link>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {templates.map((template) => {
              const qty = selected[template.id];
              const isSelected = !!qty;
              return (
                <div
                  key={template.id}
                  onClick={() => { if (!isSelected) toggle(template.id); }}
                  className={cn(
                    "rounded-xl border-2 p-4 flex flex-col items-start text-left transition-all min-h-32 cursor-pointer",
                    isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:border-primary/50",
                  )}
                >
                  <div className="flex items-start justify-between w-full">
                    <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                      <Package className="h-5 w-5 text-primary" />
                    </div>
                    {isSelected && (
                      <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                  </div>
                  <p className="font-bold text-sm leading-tight line-clamp-2">{template.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {template.stepCount ?? 0} step{(template.stepCount ?? 0) !== 1 ? "s" : ""}
                  </p>

                  {isSelected ? (
                    <div className="mt-auto pt-2 flex items-center gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 bg-background border-2 border-primary/20 rounded-lg">
                        <button type="button" className="p-1.5 hover:bg-muted rounded-l-lg" onClick={() => setQty(template.id, qty - 1)}>
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-7 text-center text-sm font-black">{qty}</span>
                        <button type="button" className="p-1.5 hover:bg-muted rounded-r-lg" onClick={() => setQty(template.id, qty + 1)}>
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button type="button" onClick={() => toggle(template.id)} className="p-1 text-muted-foreground hover:text-destructive ml-auto">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <span className="mt-auto pt-2 inline-flex items-center gap-1 text-xs font-bold text-primary">
                      <Plus className="h-3.5 w-3.5" /> Add
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky review bar */}
      {selectedItems.length > 0 && (
        <div className="sticky bottom-0 z-20 p-3 bg-background/95 backdrop-blur border-t-2 border-border">
          <Button onClick={() => setReviewing(true)} className="w-full h-14 font-bold text-base">
            <FolderPlus className="mr-2 h-5 w-5" />
            Review &amp; Create · {selectedItems.length} product{selectedItems.length !== 1 ? "s" : ""} ({totalItems} item{totalItems !== 1 ? "s" : ""})
          </Button>
        </div>
      )}

      {reviewing && selectedItems.length > 0 && (
        <ReviewJobDialog
          items={selectedItems}
          onClose={() => setReviewing(false)}
          onCreated={goToProject}
        />
      )}
    </div>
  );
}
