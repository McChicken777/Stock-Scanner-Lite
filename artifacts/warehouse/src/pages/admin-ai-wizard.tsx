import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Loader2, Check, Clock, User, Layers, FileText,
  RotateCcw, Copy, Plus, Trash2, ChevronRight,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RawMaterial {
  id: number;
  name: string;
  unit: string;
}

interface FormData {
  partName: string;
  materialId: number | null;
  materialName: string;
  operations: string[];
  surfaceFinish: string[];
  batchQty: string;
  materialQtyPerPiece: string;
  notes: string;
}

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

interface BatchResult {
  item: FormData;
  result: WizardResult | null;
  error: string | null;
  saved: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FINISH_OPTIONS = ["Raw", "Painted", "Galvanized"];

const EMPTY_FORM: FormData = {
  partName: "", materialId: null, materialName: "", operations: [],
  surfaceFinish: [], batchQty: "1", materialQtyPerPiece: "", notes: "",
};

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Failed");
  return d;
}

// ─── Chip toggle helper ────────────────────────────────────────────────────

function ChipSelect({
  options, selected, onToggle,
}: {
  options: string[]; selected: string[]; onToggle: (v: string) => void;
}) {
  if (options.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No station types configured yet — add them in Admin → Stations first.
      </p>
    );
  }
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
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
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

// ─── Single Result Card ────────────────────────────────────────────────────

function ResultCard({
  result,
  sourceItem,
  onSaved,
}: {
  result: WizardResult;
  sourceItem: FormData;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const roleMap = new Map(result.roles.map((r) => [r.id, r.name]));
  const stationMap = new Map(result.stationTypes.map((s) => [s.id, s.name]));

  const copyToClipboard = () => {
    const text = result.steps
      .map((s, i) => `${i + 1}. ${s.name}${s.durationEstimate ? ` (~${s.durationEstimate}min)` : ""}${s.notes ? `\n   ${s.notes}` : ""}`)
      .join("\n");
    navigator.clipboard
      .writeText(`${result.templateName}\n\n${text}`)
      .then(() => toast({ title: "Copied to clipboard" }))
      .catch(() => toast({ title: "Copy failed", variant: "destructive" }));
  };

  const saveAsTemplate = async () => {
    setSaving(true);
    try {
      const tmpl = await apiFetch("/api/work/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: result.templateName,
          rawMaterialId: sourceItem.materialId ?? null,
          materialQtyPerPiece: sourceItem.materialQtyPerPiece ? Number(sourceItem.materialQtyPerPiece) : null,
        }),
      });
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
      onSaved();
      toast({ title: `Template "${result.templateName}" saved!` });
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border-2 border-border bg-card p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">AI Suggestion</p>
          <h3 className="text-sm font-black mt-0.5">{result.templateName}</h3>
        </div>
        <button
          type="button"
          onClick={copyToClipboard}
          className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-1.5">
        {result.steps.map((step, i) => (
          <div key={i} className="rounded-lg border border-border bg-background px-2.5 py-2 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <p className="text-xs font-semibold truncate">{step.name}</p>
              </div>
              {step.durationEstimate && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full flex-shrink-0">
                  <Clock className="h-2.5 w-2.5" /> {step.durationEstimate}m
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
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
              <p className="text-[10px] text-muted-foreground leading-snug flex items-start gap-1">
                <FileText className="h-3 w-3 flex-shrink-0 mt-0.5" />
                {step.notes}
              </p>
            )}
          </div>
        ))}
      </div>

      {saved ? (
        <div className="flex items-center gap-1.5 text-green-700 font-bold text-xs py-1">
          <Check className="h-4 w-4" /> Saved! Find it in Job Templates.
        </div>
      ) : (
        <Button size="sm" className="w-full h-9 text-xs font-bold" disabled={saving} onClick={saveAsTemplate}>
          {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
          {saving ? "Saving…" : `Save "${result.templateName}"`}
        </Button>
      )}
    </div>
  );
}

// ─── Form section ─────────────────────────────────────────────────────────

function WizardForm({
  form,
  onChange,
  materials,
  operationOptions,
  onAddToCart,
  onGenerateNow,
  isPending,
  cartCount,
}: {
  form: FormData;
  onChange: (patch: Partial<FormData>) => void;
  materials: RawMaterial[];
  operationOptions: string[];
  onAddToCart: () => void;
  onGenerateNow: () => void;
  isPending: boolean;
  cartCount: number;
}) {
  const canSubmit = form.partName.trim().length >= 2 && form.materialId !== null && form.operations.length > 0;

  const toggleOp = (v: string) => {
    const cur = form.operations;
    onChange({ operations: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };

  const toggleFinish = (v: string) => {
    const cur = form.surfaceFinish;
    onChange({ surfaceFinish: cur.includes(v) ? [] : [v] });
  };

  const selectedMat = materials.find((m) => m.id === form.materialId);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="text-sm font-bold">1. What is this part called?</label>
        <input
          type="text"
          value={form.partName}
          onChange={(e) => onChange({ partName: e.target.value })}
          placeholder="e.g. Bracket arm, Gate frame, Shelf support…"
          className="w-full h-11 px-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold">
          2. Material{" "}
          <a href="/work/materials" className="text-[10px] font-normal text-primary underline">
            manage list
          </a>
        </label>
        {materials.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No materials added yet.{" "}
            <a href="/work/materials" className="text-primary underline">Add materials</a> to your catalogue first.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {materials.map((m) => {
              const active = form.materialId === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onChange({ materialId: active ? null : m.id, materialName: active ? "" : m.name })}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {active && <Check className="inline h-3 w-3 mr-1" />}
                  {m.name}
                  <span className="ml-1 opacity-60">/ {m.unit}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedMat && (
        <div className="space-y-2">
          <label className="text-sm font-bold">
            3. Material quantity per piece{" "}
            <span className="font-normal text-muted-foreground">
              ({selectedMat.unit} — optional)
            </span>
          </label>
          <input
            type="number"
            min="0"
            step="0.001"
            value={form.materialQtyPerPiece}
            onChange={(e) => onChange({ materialQtyPerPiece: e.target.value })}
            placeholder={`e.g. 2.5 ${selectedMat.unit}`}
            className="w-full h-11 px-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none"
          />
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-bold">
          {selectedMat ? "4" : "3"}. Required operations{" "}
          <span className="font-normal text-muted-foreground">(select all that apply)</span>
        </label>
        <ChipSelect
          options={operationOptions}
          selected={form.operations}
          onToggle={toggleOp}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold">
          {selectedMat ? "5" : "4"}. Surface finish{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <ChipSelect
          options={FINISH_OPTIONS}
          selected={form.surfaceFinish}
          onToggle={toggleFinish}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold">{selectedMat ? "6" : "5"}. Typical batch quantity</label>
        <div className="flex gap-2">
          {["1", "5", "10", "25", "50"].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onChange({ batchQty: q })}
              className={`flex-1 h-10 rounded-lg text-sm font-bold border-2 transition-all ${
                form.batchQty === q ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
              }`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold">
          {selectedMat ? "7" : "6"}. Anything else the AI should know?{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          value={form.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="e.g. parts come pre-cut, tight tolerance holes, client provides own paint…"
          rows={3}
          className="w-full px-3 py-2 rounded-xl border-2 border-input bg-background text-sm resize-none focus:border-primary focus:outline-none"
        />
      </div>

      {!canSubmit && (
        <p className="text-xs text-center text-muted-foreground">
          Fill in part name, material, and at least one operation to continue.
        </p>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1 h-12 font-bold text-sm"
          disabled={!canSubmit || isPending}
          onClick={onAddToCart}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Add to Batch
        </Button>
        <Button
          className="flex-1 h-12 font-bold text-sm"
          disabled={!canSubmit || isPending}
          onClick={onGenerateNow}
        >
          {isPending ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Generating…</>
          ) : cartCount > 0 ? (
            <><Sparkles className="h-4 w-4 mr-1.5" /> Generate All ({cartCount + 1})</>
          ) : (
            <><Sparkles className="h-4 w-4 mr-1.5" /> Generate</>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Cart list ────────────────────────────────────────────────────────────

function CartList({
  items,
  onRemove,
}: {
  items: FormData[];
  onRemove: (i: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Batch queue — {items.length} part{items.length !== 1 ? "s" : ""}
      </p>
      {items.map((item, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-2 bg-muted/50 rounded-xl px-3 py-2 border-2 border-border"
        >
          <div className="min-w-0">
            <p className="text-xs font-bold truncate">{item.partName}</p>
            <p className="text-[10px] text-muted-foreground truncate">
              {item.materialName || "—"} · {item.operations.join(", ")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Batch results ────────────────────────────────────────────────────────

function BatchResults({
  results,
  onReset,
}: {
  results: BatchResult[];
  onReset: () => void;
}) {
  const allSaved = results.filter((r) => r.result).every((r) => r.saved);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {results.length} template{results.length !== 1 ? "s" : ""} generated
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onReset}>
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> New batch
        </Button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
        <p className="font-bold mb-0.5">These are AI suggestions — review before using.</p>
        <p>Verify step order and durations match your actual workflow.</p>
      </div>

      <div className="space-y-3">
        {results.map((br, i) => (
          <div key={i}>
            {br.result ? (
              <ResultCard
                result={br.result}
                sourceItem={br.item}
                onSaved={() => {
                  br.saved = true;
                }}
              />
            ) : (
              <div className="rounded-xl border-2 border-destructive/30 bg-destructive/5 p-3">
                <p className="text-xs font-bold text-destructive">{br.item.partName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{br.error}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────

export default function AdminAiWizardPage() {
  const { toast } = useToast();

  const [form, setForm] = useState<FormData>({ ...EMPTY_FORM });
  const [cart, setCart] = useState<FormData[]>([]);
  const [batchResults, setBatchResults] = useState<BatchResult[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const { data: stationTypes = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/stations/types"],
    queryFn: () => fetch("/api/stations/types", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
  });

  const { data: rawMaterials = [] } = useQuery<RawMaterial[]>({
    queryKey: ["/api/raw-materials"],
    queryFn: () => fetch("/api/raw-materials", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
  });

  const operationOptions = stationTypes.map((s) => s.name);

  const patchForm = (patch: Partial<FormData>) => setForm((f) => ({ ...f, ...patch }));

  const canSubmit = form.partName.trim().length >= 2 && form.materialId !== null && form.operations.length > 0;

  const addToCart = () => {
    if (!canSubmit) return;
    setCart((prev) => [...prev, { ...form }]);
    setForm({ ...EMPTY_FORM });
    toast({ title: `"${form.partName}" added to batch` });
  };

  const removeFromCart = (i: number) => setCart((prev) => prev.filter((_, idx) => idx !== i));

  const generateItem = async (item: FormData): Promise<WizardResult> => {
    return apiFetch("/api/work/ai-template-wizard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partName: item.partName.trim(),
        material: item.materialName,
        operations: item.operations,
        surfaceFinish: item.surfaceFinish[0] ?? undefined,
        batchQuantity: Number(item.batchQty) || 1,
        notes: item.notes.trim() || undefined,
      }),
    });
  };

  const generateAll = async () => {
    if (!canSubmit) return;
    const allItems = [...cart, { ...form }];
    setGenerating(true);
    setProgress({ current: 0, total: allItems.length });

    const results: BatchResult[] = [];
    for (let i = 0; i < allItems.length; i++) {
      setProgress({ current: i + 1, total: allItems.length });
      try {
        const result = await generateItem(allItems[i]);
        results.push({ item: allItems[i], result, error: null, saved: false });
      } catch (err: any) {
        results.push({ item: allItems[i], result: null, error: err.message, saved: false });
      }
    }

    setGenerating(false);
    setProgress(null);
    setBatchResults(results);
    setCart([]);
    setForm({ ...EMPTY_FORM });
  };

  const reset = () => {
    setBatchResults(null);
    setCart([]);
    setForm({ ...EMPTY_FORM });
  };

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
            <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-amber-400 text-amber-900 rounded-full">
              TEST
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Fill the form → Add to Batch → Generate All at once
          </p>
        </div>
      </div>

      {batchResults ? (
        <BatchResults results={batchResults} onReset={reset} />
      ) : (
        <>
          {generating && progress && (
            <div className="rounded-xl bg-primary/5 border-2 border-primary/20 p-4 text-center space-y-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
              <p className="text-sm font-bold text-primary">
                Generating {progress.current} of {progress.total}…
              </p>
              <div className="h-1.5 rounded-full bg-primary/20 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          <CartList items={cart} onRemove={removeFromCart} />

          <WizardForm
            form={form}
            onChange={patchForm}
            materials={rawMaterials}
            operationOptions={operationOptions}
            onAddToCart={addToCart}
            onGenerateNow={generateAll}
            isPending={generating}
            cartCount={cart.length}
          />
        </>
      )}
    </div>
  );
}
