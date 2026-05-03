import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Loader2, Calendar, FolderPlus, Minus, Plus, Palette, PackageCheck, Zap, GripVertical, X, ListPlus, AlertTriangle, Sparkles, BookOpen, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AiTipsPanel } from "@/components/ai-tips-panel";

interface Template {
  id: number;
  name: string;
}

interface TemplateItem {
  templateId: number;
  quantity: number;
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

export default function WorkProjectFormPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [paintColor, setPaintColor] = useState("");
  const [requiresExternalParts, setRequiresExternalParts] = useState(false);
  const [templateItems, setTemplateItems] = useState<TemplateItem[]>([]);

  // Quick job mode
  const [quickJob, setQuickJob] = useState(false);
  const [quickSteps, setQuickSteps] = useState<QuickStep[]>([{ name: "", roleId: null }]);
  const [newStepName, setNewStepName] = useState("");
  const [showProcedurePicker, setShowProcedurePicker] = useState(false);
  const [procedureSearch, setProcedureSearch] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiDescription, setAiDescription] = useState("");
  const [aiPreviewSteps, setAiPreviewSteps] = useState<QuickStep[] | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["/api/work/templates"],
    queryFn: fetchTemplates,
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/tasks/roles"],
    queryFn: fetchRoles,
  });

  const { data: procedures = [] } = useQuery<ProcedureOption[]>({
    queryKey: ["/api/tasks/procedures"],
    queryFn: fetchProcedures,
    enabled: quickJob,
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

  interface BomShortage { productId: number; productName: string; needed: number; have: number; shortfall: number }
  interface BomCheckResult { templateId: number; ok: boolean; shortages: BomShortage[] }

  const { data: bomResults = [] } = useQuery<BomCheckResult[]>({
    queryKey: ["/api/work/bom-check", templateItems],
    queryFn: async () => {
      if (templateItems.length === 0) return [];
      const checks = await Promise.all(
        templateItems.map(async (ti) => {
          const res = await fetch(`/api/work/bom-check?templateId=${ti.templateId}&quantity=${ti.quantity}`, { credentials: "include" });
          if (!res.ok) return { templateId: ti.templateId, ok: true, shortages: [] };
          const data = await res.json();
          return { templateId: ti.templateId, ...data };
        })
      );
      return checks;
    },
    enabled: templateItems.length > 0 && !quickJob,
  });

  const bomShortages = bomResults.flatMap((r) => r.shortages);

  const createMutation = useMutation({
    mutationFn: async (data: object) => {
      const res = await fetch("/api/work/projects", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to create project");
      }
      return res.json();
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/work/projects"] });
      toast({ title: "Work order created!" });
      setLocation(`/work/projects/${project.id}`);
    },
    onError: (err) => toast({ title: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  if (user?.role !== "admin") {
    return <div className="p-6 text-center text-muted-foreground mt-20"><p>Admin only</p></div>;
  }

  const getTemplateItem = (id: number) => templateItems.find((t) => t.templateId === id);

  const toggleTemplate = (id: number) => {
    if (getTemplateItem(id)) {
      setTemplateItems((prev) => prev.filter((t) => t.templateId !== id));
    } else {
      setTemplateItems((prev) => [...prev, { templateId: id, quantity: 1 }]);
    }
  };

  const setQuantity = (id: number, qty: number) => {
    setTemplateItems((prev) =>
      prev.map((t) => t.templateId === id ? { ...t, quantity: Math.max(1, Math.min(100, qty)) } : t)
    );
  };

  const addQuickStep = () => {
    if (!newStepName.trim()) return;
    setQuickSteps((prev) => [...prev.filter((s) => s.name.trim()), { name: newStepName.trim(), roleId: null }]);
    setNewStepName("");
  };

  const removeQuickStep = (idx: number) => {
    setQuickSteps((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateQuickStep = (idx: number, updates: Partial<QuickStep>) => {
    setQuickSteps((prev) => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));
  };

  const canSubmitTemplate = name.trim() && deadline && templateItems.length > 0;
  const canSubmitQuick = name.trim() && deadline && quickSteps.filter((s) => s.name.trim()).length > 0;
  const canSubmit = quickJob ? canSubmitQuick : canSubmitTemplate;
  const [bomConfirmed, setBomConfirmed] = useState(false);
  const hasUnconfirmedShortages = bomShortages.length > 0 && !bomConfirmed && !quickJob;

  const handleSubmit = () => {
    if (hasUnconfirmedShortages) {
      setBomConfirmed(true);
      return;
    }
    if (quickJob) {
      createMutation.mutate({
        name: name.trim(), deadline, priority,
        paintColor: paintColor || null,
        requiresExternalParts,
        quickJob: true,
        quickJobName: name.trim(),
        quickSteps: quickSteps.filter((s) => s.name.trim()),
      });
    } else {
      createMutation.mutate({
        name: name.trim(), deadline, priority,
        paintColor: paintColor || null,
        requiresExternalParts,
        quickJob: false,
        templateItems,
      });
    }
  };

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm flex items-center gap-3">
        <Link href="/work/projects" className="p-2 -ml-2 rounded-full hover:bg-secondary-foreground/10 transition-colors">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-xl font-bold">New Work Order</h1>
      </div>

      <div className="p-4 space-y-6 pb-24">

        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-2 rounded-xl border-2 border-border p-1 bg-muted/30">
          <button
            type="button"
            onClick={() => setQuickJob(false)}
            className={cn(
              "rounded-lg py-2.5 text-sm font-bold transition-all",
              !quickJob ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            From Template
          </button>
          <button
            type="button"
            onClick={() => setQuickJob(true)}
            className={cn(
              "rounded-lg py-2.5 text-sm font-bold transition-all flex items-center justify-center gap-1.5",
              quickJob ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Zap className="h-3.5 w-3.5" /> Quick Job
          </button>
        </div>

        {/* Name */}
        <div className="space-y-2">
          <Label className="text-sm font-bold">Project Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={quickJob ? "e.g. Gate repair #12" : "e.g. Batch #42 Production"}
            className="h-12 border-2 text-base"
          />
        </div>

        {/* Deadline */}
        <div className="space-y-2">
          <Label className="text-sm font-bold flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Deadline
          </Label>
          <Input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="h-12 border-2 text-base"
            min={new Date().toISOString().split("T")[0]}
          />
        </div>

        {/* Priority */}
        <div className="space-y-2">
          <Label className="text-sm font-bold">Priority</Label>
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
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Project-level Paint Color */}
        <div className="space-y-2">
          <Label className="text-sm font-bold flex items-center gap-2">
            <Palette className="h-4 w-4" /> Paint Color (whole order)
          </Label>
          <RalColorInput value={paintColor} onChange={setPaintColor} placeholder="RAL9005" />
          <p className="text-xs text-muted-foreground">Leave blank if no paint or items have individual colors.</p>
        </div>

        {/* Requires External Parts */}
        <div
          className={`rounded-xl border-2 p-4 flex items-start gap-3 cursor-pointer transition-all ${requiresExternalParts ? "border-orange-400 bg-orange-50" : "border-border bg-muted/20"}`}
          onClick={() => setRequiresExternalParts((v) => !v)}
        >
          <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${requiresExternalParts ? "bg-orange-500 border-orange-500" : "border-muted-foreground/40 bg-background"}`}>
            {requiresExternalParts && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <PackageCheck className={`h-4 w-4 ${requiresExternalParts ? "text-orange-600" : "text-muted-foreground"}`} />
              <p className={`font-bold text-sm ${requiresExternalParts ? "text-orange-700" : "text-foreground"}`}>Requires External Parts</p>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Creates an inbound record to track when parts arrive.</p>
          </div>
        </div>

        {/* QUICK JOB MODE */}
        {quickJob ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-bold">Production Steps</Label>
              <span className="text-xs text-muted-foreground">{quickSteps.filter((s) => s.name.trim()).length} step{quickSteps.filter((s) => s.name.trim()).length !== 1 ? "s" : ""}</span>
            </div>

            <div className="space-y-2">
              {quickSteps.filter((s) => s.name.trim()).map((step, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-card border-2 border-border rounded-lg px-3 py-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
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

            {/* Helpers: pick from procedures + AI generate */}
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
                  <Link href="/admin/procedures" className="text-[10px] font-bold text-indigo-700 hover:underline uppercase">
                    Manage →
                  </Link>
                </div>
                {procedures.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No saved procedures yet.{" "}
                    <Link href="/admin/procedures" className="text-indigo-700 font-semibold underline">Create some first.</Link>
                  </p>
                ) : (
                  <>
                    <Input
                      value={procedureSearch}
                      onChange={(e) => setProcedureSearch(e.target.value)}
                      placeholder="Search procedures…"
                      className="h-9 border-2 text-sm bg-background"
                    />
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
                              onClick={() => {
                                setQuickSteps((prev) => [
                                  ...prev.filter((s) => s.name.trim()),
                                  { name: p.name, roleId: p.roleId ?? null },
                                ]);
                              }}
                              className={cn(
                                "w-full text-left flex items-center justify-between gap-2 px-2.5 py-1.5 rounded border bg-background transition-colors",
                                alreadyAdded ? "opacity-50 cursor-not-allowed" : "hover:border-indigo-400 hover:bg-indigo-50",
                              )}
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{p.name}</p>
                                {p.roleName && <p className="text-[10px] text-muted-foreground">{p.roleName}</p>}
                              </div>
                              {alreadyAdded ? (
                                <span className="text-[10px] text-muted-foreground font-bold">ADDED</span>
                              ) : (
                                <Plus className="h-3.5 w-3.5 text-indigo-600 flex-shrink-0" />
                              )}
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

            {/* AI generate dialog */}
            <Dialog open={aiOpen} onOpenChange={(o) => { setAiOpen(o); if (!o) { setAiPreviewSteps(null); setAiDescription(""); } }}>
              <DialogContent className="w-[90vw] max-w-md rounded-xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-600" /> Generate Steps with AI
                  </DialogTitle>
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
                    <p className="text-xs text-muted-foreground">
                      AI will suggest a list of steps for you to review before they're added.
                    </p>
                    <Button
                      className="w-full h-11 font-bold bg-purple-600 hover:bg-purple-700"
                      disabled={!aiDescription.trim() || aiGenerate.isPending}
                      onClick={() => aiGenerate.mutate(aiDescription.trim())}
                    >
                      {aiGenerate.isPending
                        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…</>
                        : <><Sparkles className="mr-2 h-4 w-4" /> Generate Preview</>}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2 max-h-72 overflow-y-auto">
                      <p className="text-xs font-bold uppercase tracking-wider text-purple-700">Suggested steps</p>
                      {aiPreviewSteps.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No steps returned. Try again with more detail.</p>
                      ) : (
                        <ol className="space-y-1.5">
                          {aiPreviewSteps.map((s, i) => (
                            <li key={i} className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground font-mono text-xs">{i + 1}.</span>
                              <span className="flex-1">{s.name}</span>
                              {s.roleId && (
                                <span className="text-[10px] text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                                  {roles.find((r) => r.id === s.roleId)?.name}
                                </span>
                              )}
                              <button
                                onClick={() => setAiPreviewSteps((prev) => prev?.filter((_, idx) => idx !== i) ?? null)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Review and remove any steps you don't want. Click Apply to add them to your job.
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => setAiPreviewSteps(null)}>
                        ← Edit description
                      </Button>
                      <Button
                        className="flex-1 font-bold bg-purple-600 hover:bg-purple-700"
                        disabled={aiPreviewSteps.length === 0}
                        onClick={() => {
                          setQuickSteps((prev) => [
                            ...prev.filter((s) => s.name.trim()),
                            ...aiPreviewSteps,
                          ]);
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
        ) : (
          /* TEMPLATE MODE */
          <div className="space-y-3">
            <Label className="text-sm font-bold">Select Items to Produce</Label>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted/40 rounded-lg animate-pulse" />)}
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8 px-4 bg-muted/30 rounded-xl border border-dashed text-sm text-muted-foreground">
                No item templates created yet.{" "}
                <Link href="/work/templates" className="text-primary font-semibold">Create templates first.</Link>
              </div>
            ) : (
              <div className="space-y-2">
                {templates.map((template) => {
                  const item = getTemplateItem(template.id);
                  const selected = !!item;
                  return (
                    <div
                      key={template.id}
                      className={cn(
                        "rounded-lg border-2 transition-all overflow-hidden",
                        selected ? "border-primary bg-primary/5" : "border-border bg-card"
                      )}
                    >
                      <label className="flex items-start gap-3 p-3 cursor-pointer">
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => toggleTemplate(template.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold">{template.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Template · steps defined in template editor</p>
                        </div>
                      </label>

                      {selected && (
                        <div className="px-3 pb-3 flex items-center gap-3">
                          <span className="text-sm font-semibold text-muted-foreground">Quantity:</span>
                          <div className="flex items-center gap-1 bg-background border-2 border-primary/20 rounded-lg">
                            <button
                              type="button"
                              className="p-2 hover:bg-muted rounded-l-lg transition-colors"
                              onClick={() => setQuantity(template.id, (item?.quantity ?? 1) - 1)}
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={item?.quantity ?? 1}
                              onChange={(e) => setQuantity(template.id, Number(e.target.value))}
                              className="w-14 text-center text-lg font-black bg-transparent outline-none py-1"
                            />
                            <button
                              type="button"
                              className="p-2 hover:bg-muted rounded-r-lg transition-colors"
                              onClick={() => setQuantity(template.id, (item?.quantity ?? 1) + 1)}
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            = {item?.quantity ?? 1} item{(item?.quantity ?? 1) !== 1 ? "s" : ""}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {templateItems.length > 0 && (
              <div className="bg-muted/30 border border-border rounded-xl p-3 text-sm">
                <p className="font-bold mb-1">Summary</p>
                {templateItems.map((ti) => {
                  const t = templates.find((t) => t.id === ti.templateId);
                  return t ? (
                    <p key={ti.templateId} className="text-muted-foreground">
                      • {ti.quantity}× {t.name}
                      {ti.quantity > 1 && <span className="text-xs ml-1">(#{1}–#{ti.quantity})</span>}
                    </p>
                  ) : null;
                })}
                {paintColor && <p className="mt-1 font-medium text-primary">Paint: {paintColor}</p>}
              </div>
            )}

            {bomShortages.length > 0 && !bomConfirmed && (
              <div className="border-2 border-amber-300 bg-amber-50 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                  <p className="font-bold text-sm text-amber-800">Stock shortage warning</p>
                </div>
                <p className="text-xs text-amber-700">The following BOM components are insufficient (available after reservations):</p>
                <div className="space-y-1">
                  {bomShortages.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-amber-100 rounded-lg px-2.5 py-1.5">
                      <span className="font-medium text-amber-900 truncate">{s.productName}</span>
                      <span className="text-amber-700 font-bold flex-shrink-0 ml-2">
                        need {s.needed}, available {s.have}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-amber-600">Pressing "Create Work Order" will ask you to confirm before proceeding.</p>
              </div>
            )}
            {bomShortages.length > 0 && bomConfirmed && (
              <div className="border-2 border-rose-300 bg-rose-50 rounded-xl p-3 space-y-2">
                <p className="font-bold text-sm text-rose-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-600" /> Confirm short stock
                </p>
                <p className="text-xs text-rose-700">Some BOM components are below required levels. Tasks may start blocked until stock arrives. Continue?</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 h-9 border-rose-200 text-rose-700" onClick={() => setBomConfirmed(false)}>
                    Go Back
                  </Button>
                  <Button size="sm" className="flex-1 h-9 font-bold bg-rose-600 hover:bg-rose-700"
                    disabled={createMutation.isPending}
                    onClick={() => createMutation.mutate(
                      quickJob
                        ? { name: name.trim(), deadline, priority, paintColor: paintColor || null, requiresExternalParts, quickJob: true, quickJobName: name.trim(), quickSteps: quickSteps.filter((s) => s.name.trim()) }
                        : { name: name.trim(), deadline, priority, paintColor: paintColor || null, requiresExternalParts, quickJob: false, templateItems }
                    )}>
                    {createMutation.isPending ? "Creating…" : "Create Anyway"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={!canSubmit || createMutation.isPending}
          className="w-full h-14 font-bold text-base"
        >
          {createMutation.isPending ? (
            <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Creating…</>
          ) : (
            <><FolderPlus className="mr-2 h-5 w-5" /> Create Work Order</>
          )}
        </Button>
      </div>
    </div>
  );
}
