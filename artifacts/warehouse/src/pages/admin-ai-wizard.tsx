import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Sparkles, ChevronRight, ChevronLeft, Loader2, Check,
  Clock, User, Layers, FileText, RotateCcw, Copy,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface WizardStep {
  name: string;
  roleId: number | null;
  stationTypeId: number | null;
  durationEstimate: number | null;
  notes: string | null;
}

interface WizardResult {
  templateName: string;
  steps: WizardStep[];
  roles: { id: number; name: string }[];
  stationTypes: { id: number; name: string }[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MATERIAL_OPTIONS = [
  "Steel (structural)", "Steel (sheet)", "Stainless steel", "Aluminium",
  "Galvanized steel", "Copper", "Wood", "Plywood", "Plastic", "Other",
];

const OPERATION_OPTIONS = [
  "Cutting / sawing", "CNC milling", "CNC turning", "Laser cutting",
  "Plasma cutting", "Bending / rolling", "Welding (MIG)", "Welding (TIG)",
  "Welding (spot)", "Drilling / tapping", "Grinding / deburring",
  "Assembly / fitting", "Painting", "Powder coating", "Sandblasting",
  "Anodizing", "Galvanizing", "Inspection / QC",
];

const FINISH_OPTIONS = [
  "Raw / unfinished", "Sandblasted", "Painted (brush)", "Painted (spray)",
  "Powder coated", "Anodized", "Hot-dip galvanized", "Zinc plated", "Polished",
];

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Failed");
  return d;
}

// ─── Chip toggle helper ────────────────────────────────────────────────────

function ChipSelect({
  options, selected, onToggle, multi = true,
}: {
  options: string[]; selected: string[]; onToggle: (v: string) => void; multi?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all ${
              active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {active && <Check className="inline h-3 w-3 mr-1" />}
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// ─── Result View ──────────────────────────────────────────────────────────────

function ResultView({
  result,
  onReset,
}: {
  result: WizardResult;
  onReset: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const roleMap = new Map(result.roles.map((r) => [r.id, r.name]));
  const stationMap = new Map(result.stationTypes.map((s) => [s.id, s.name]));

  const copyToClipboard = () => {
    const text = result.steps.map((s, i) =>
      `${i + 1}. ${s.name}${s.durationEstimate ? ` (~${s.durationEstimate}min)` : ""}${s.notes ? `\n   ${s.notes}` : ""}`
    ).join("\n");
    navigator.clipboard.writeText(`${result.templateName}\n\n${text}`)
      .then(() => toast({ title: "Copied to clipboard" }))
      .catch(() => toast({ title: "Copy failed", variant: "destructive" }));
  };

  const saveAsTemplate = async () => {
    setSaving(true);
    try {
      // 1. Create blank template
      const tmpl = await apiFetch("/api/work/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: result.templateName }),
      });
      // 2. Add each step
      for (let i = 0; i < result.steps.length; i++) {
        const s = result.steps[i];
        await apiFetch(`/api/work/templates/${tmpl.id}/procedures`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: s.name,
            sortOrder: i,
            roleId: s.roleId,
            stationTypeId: s.stationTypeId,
            durationEstimate: s.durationEstimate,
          }),
        });
      }
      setSaved(true);
      toast({ title: `Template "${result.templateName}" saved!` });
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">AI Suggestion</p>
          <h2 className="text-lg font-black mt-0.5">{result.templateName}</h2>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={copyToClipboard}>
            <Copy className="h-3.5 w-3.5 mr-1" /> Copy
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onReset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> New
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {result.steps.map((step, i) => (
          <div key={i} className="rounded-xl border-2 border-border bg-card px-3 py-2.5 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <p className="text-sm font-semibold truncate">{step.name}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {step.durationEstimate && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                    <Clock className="h-3 w-3" /> {step.durationEstimate}m
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {step.roleId != null && roleMap.has(step.roleId) && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full">
                  <User className="h-2.5 w-2.5" /> {roleMap.get(step.roleId)}
                </span>
              )}
              {step.stationTypeId != null && stationMap.has(step.stationTypeId) && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full">
                  <Layers className="h-2.5 w-2.5" /> {stationMap.get(step.stationTypeId)}
                </span>
              )}
            </div>
            {step.notes && (
              <p className="text-xs text-muted-foreground leading-snug flex items-start gap-1">
                <FileText className="h-3 w-3 flex-shrink-0 mt-0.5" />
                {step.notes}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
        <p className="font-bold mb-1">This is an AI suggestion — review before using.</p>
        <p>Verify step order and durations match your actual workflow. You can edit all steps after saving.</p>
      </div>

      {!saved ? (
        <Button
          className="w-full h-11 font-bold"
          disabled={saving}
          onClick={saveAsTemplate}
        >
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          {saving ? "Saving…" : `Save as Template "${result.templateName}"`}
        </Button>
      ) : (
        <div className="flex items-center justify-center gap-2 py-3 text-green-700 font-bold text-sm">
          <Check className="h-5 w-5" /> Template saved! Find it in Job Templates.
        </div>
      )}
    </div>
  );
}

// ─── Wizard Form ──────────────────────────────────────────────────────────────

export default function AdminAiWizardPage() {
  const { toast } = useToast();

  const [partName, setPartName] = useState("");
  const [material, setMaterial] = useState<string[]>([]);
  const [operations, setOperations] = useState<string[]>([]);
  const [surfaceFinish, setSurfaceFinish] = useState<string[]>([]);
  const [batchQty, setBatchQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<WizardResult | null>(null);

  const generateMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/work/ai-template-wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partName: partName.trim(),
          material: material.join(", "),
          operations,
          surfaceFinish: surfaceFinish[0] ?? undefined,
          batchQuantity: Number(batchQty) || 1,
          notes: notes.trim() || undefined,
        }),
      }),
    onSuccess: (data: WizardResult) => setResult(data),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const reset = () => {
    setResult(null);
    setPartName("");
    setMaterial([]);
    setOperations([]);
    setSurfaceFinish([]);
    setBatchQty("1");
    setNotes("");
  };

  const toggleMaterial = (v: string) =>
    setMaterial((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [v]);

  const toggleFinish = (v: string) =>
    setSurfaceFinish((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [v]);

  const toggleOp = (v: string) =>
    setOperations((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);

  const canGenerate = partName.trim().length >= 2 && material.length > 0 && operations.length > 0;

  return (
    <div className="p-4 space-y-5 pb-24 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black">AI Template Wizard</h1>
            <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-amber-400 text-amber-900 rounded-full">TEST</span>
          </div>
          <p className="text-xs text-muted-foreground">Answer 6 questions → get a template step suggestion</p>
        </div>
      </div>

      {result ? (
        <ResultView result={result} onReset={reset} />
      ) : (
        <div className="space-y-5">
          {/* Q1: Part name */}
          <div className="space-y-2">
            <label className="text-sm font-bold">1. What is this part called?</label>
            <input
              type="text"
              value={partName}
              onChange={(e) => setPartName(e.target.value)}
              placeholder="e.g. Bracket arm, Gate frame, Shelf support…"
              className="w-full h-11 px-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none"
            />
          </div>

          {/* Q2: Material */}
          <div className="space-y-2">
            <label className="text-sm font-bold">2. Material</label>
            <ChipSelect options={MATERIAL_OPTIONS} selected={material} onToggle={toggleMaterial} multi={false} />
          </div>

          {/* Q3: Operations */}
          <div className="space-y-2">
            <label className="text-sm font-bold">3. Required operations <span className="font-normal text-muted-foreground">(select all that apply)</span></label>
            <ChipSelect options={OPERATION_OPTIONS} selected={operations} onToggle={toggleOp} />
          </div>

          {/* Q4: Surface finish */}
          <div className="space-y-2">
            <label className="text-sm font-bold">4. Surface finish <span className="font-normal text-muted-foreground">(optional)</span></label>
            <ChipSelect options={FINISH_OPTIONS} selected={surfaceFinish} onToggle={toggleFinish} multi={false} />
          </div>

          {/* Q5: Batch quantity */}
          <div className="space-y-2">
            <label className="text-sm font-bold">5. Typical batch quantity</label>
            <div className="flex gap-2">
              {["1", "5", "10", "25", "50"].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setBatchQty(q)}
                  className={`flex-1 h-10 rounded-lg text-sm font-bold border-2 transition-all ${batchQty === q ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"}`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Q6: Notes */}
          <div className="space-y-2">
            <label className="text-sm font-bold">6. Anything else the AI should know? <span className="font-normal text-muted-foreground">(optional)</span></label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. parts come pre-cut, tight tolerance holes, client provides own paint…"
              rows={3}
              className="w-full px-3 py-2 rounded-xl border-2 border-input bg-background text-sm resize-none focus:border-primary focus:outline-none"
            />
          </div>

          <Button
            className="w-full h-12 font-bold text-base"
            disabled={!canGenerate || generateMutation.isPending}
            onClick={() => generateMutation.mutate()}
          >
            {generateMutation.isPending ? (
              <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Generating…</>
            ) : (
              <><Sparkles className="h-5 w-5 mr-2" /> Generate Template Steps</>
            )}
          </Button>

          {!canGenerate && (
            <p className="text-xs text-center text-muted-foreground">
              Fill in part name, material, and at least one operation to continue.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
