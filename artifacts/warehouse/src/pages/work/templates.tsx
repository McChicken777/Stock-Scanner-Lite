import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Loader2, Package, ChevronDown, ChevronRight,
  Wrench, ShoppingCart, X, ListPlus, GripVertical,
  Copy, Sparkles, Undo2, BookOpen, BookPlus, Zap, Check,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AiTipsPanel } from "@/components/ai-tips-panel";

interface Role { id: number; name: string; }
interface Product { id: number; name: string; itemType: string; }
interface Procedure {
  id: number; productId: number; name: string; sortOrder: number;
  roleId: number | null; batchMode: string; durationEstimate: number | null;
}
interface TemplateProcedure {
  id: number; templateId: number; name: string; sortOrder: number;
  requiresInbound: boolean; roleId: number | null; batchMode: string; durationEstimate: number | null;
  consumesProductId: number | null; consumesQuantity: number | null;
}
interface ComponentEntry {
  id: number; parentProductId: number; componentProductId: number;
  quantity: number; sortOrder: number;
  product: Product; procedures: TemplateProcedure[];
}
interface Template { id: number; name: string; productId: number | null; }
interface StepPresetEntry { id: number; name: string; roleId: number | null; batchMode: string; sortOrder: number; durationEstimate: number | null; }
interface StepPreset { id: number; name: string; entries: StepPresetEntry[]; }

const BATCH_OPTIONS = [
  { value: "individual", label: "Individual" },
  { value: "free_batch", label: "Batch (any mix)" },
  { value: "type_batch", label: "Batch (same type)" },
];

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || "Failed");
  }
  return res.json();
}

function RolePicker({ roles, value, onChange }: { roles: Role[]; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className="text-xs rounded border border-border bg-background px-1.5 py-0.5 min-w-0 max-w-[120px] truncate"
    >
      <option value="">No role</option>
      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
    </select>
  );
}

// ─── Template Top-level Procedures Editor ────────────────────────────────────

function TemplateProceduresEditor({ template, roles, presets }: {
  template: Template; roles: Role[]; presets: StepPreset[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = [`/api/work/templates/${template.id}/procedures`];
  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const [newProcName, setNewProcName] = useState("");
  const [aiInstruction, setAiInstruction] = useState("");
  const [canUndo, setCanUndo] = useState(false);
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  const [savingPresetName, setSavingPresetName] = useState("");
  const [showSavePreset, setShowSavePreset] = useState(false);
  const dragIdx = useRef<number | null>(null);

  const { data: procsData, isLoading } = useQuery<{ procedures: TemplateProcedure[]; hasSnapshot: boolean }>({
    queryKey: key,
    queryFn: () => apiFetch(`/api/work/templates/${template.id}/procedures`),
    select: (data) => {
      if (Array.isArray(data)) return { procedures: data, hasSnapshot: false };
      return data as { procedures: TemplateProcedure[]; hasSnapshot: boolean };
    },
  });
  const procs = procsData?.procedures ?? [];
  const hasServerSnapshot = procsData?.hasSnapshot ?? false;
  const showUndo = canUndo || hasServerSnapshot;

  const addProc = useMutation({
    mutationFn: (name: string) => apiFetch(`/api/work/templates/${template.id}/procedures`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, sortOrder: procs.length }),
    }),
    onSuccess: () => { invalidate(); setNewProcName(""); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateProc = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TemplateProcedure> }) =>
      apiFetch(`/api/work/templates/${template.id}/procedures/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: invalidate,
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteProc = useMutation({
    mutationFn: (id: number) => fetch(`/api/work/templates/${template.id}/procedures/${id}`, {
      method: "DELETE", credentials: "include",
    }).then(() => {}),
    onSuccess: invalidate,
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleDragStart = (idx: number) => { dragIdx.current = idx; };
  const handleDrop = (targetIdx: number) => {
    const from = dragIdx.current;
    if (from === null || from === targetIdx) return;
    dragIdx.current = null;
    const reordered = [...procs];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(targetIdx, 0, moved);
    const order = reordered.map((p, i) => ({ id: p.id, sortOrder: i }));
    apiFetch(`/api/work/templates/${template.id}/procedures/reorder`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    }).then(invalidate).catch((e: Error) => toast({ title: e.message, variant: "destructive" }));
  };

  const aiEdit = useMutation({
    mutationFn: (instruction: string) => apiFetch(`/api/work/templates/${template.id}/ai-edit`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction, existingRoles: roles }),
    }),
    onSuccess: (data) => {
      invalidate();
      setAiInstruction("");
      setCanUndo(data.canUndo ?? false);
      toast({ title: "AI edited steps" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const undoEdit = useMutation({
    mutationFn: () => apiFetch(`/api/work/templates/${template.id}/undo`, {
      method: "POST", headers: { "Content-Type": "application/json" },
    }),
    onSuccess: () => { invalidate(); setCanUndo(false); toast({ title: "Undone" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const applyPreset = useMutation({
    mutationFn: ({ presetId, append }: { presetId: number; append: boolean }) =>
      apiFetch(`/api/work/templates/${template.id}/apply-preset`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetId, append }),
      }),
    onSuccess: () => { invalidate(); setShowPresetPicker(false); toast({ title: "Preset applied" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const saveAsPreset = useMutation({
    mutationFn: (name: string) => apiFetch("/api/work/step-presets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        entries: procs.map((p) => ({ name: p.name, roleId: p.roleId, batchMode: p.batchMode, durationEstimate: p.durationEstimate })),
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/work/step-presets"] });
      setShowSavePreset(false);
      setSavingPresetName("");
      toast({ title: "Saved as preset" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-2">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Top-level Steps</p>
        <div className="flex items-center gap-1.5">
          {procs.length > 0 && (
            <button
              onClick={() => setShowSavePreset(true)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 px-2 py-0.5 rounded border border-border hover:bg-muted"
            >
              <BookPlus className="h-3 w-3" /> Save preset
            </button>
          )}
          {presets.length > 0 && (
            <button
              onClick={() => setShowPresetPicker(!showPresetPicker)}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5 px-2 py-0.5 rounded border border-blue-200 hover:bg-blue-50"
            >
              <BookOpen className="h-3 w-3" /> Apply preset
            </button>
          )}
        </div>
      </div>

      {/* Preset picker */}
      {showPresetPicker && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3 space-y-2">
          <p className="text-xs font-bold text-blue-800">Apply a step preset</p>
          {presets.map((preset) => (
            <div key={preset.id} className="flex items-center justify-between gap-2 bg-white rounded border border-blue-100 px-2 py-1.5">
              <div>
                <p className="text-sm font-medium">{preset.name}</p>
                <p className="text-xs text-muted-foreground">{preset.entries.length} steps</p>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="h-7 text-xs px-2"
                  onClick={() => applyPreset.mutate({ presetId: preset.id, append: true })}
                  disabled={applyPreset.isPending}>Append</Button>
                <Button size="sm" className="h-7 text-xs px-2"
                  onClick={() => applyPreset.mutate({ presetId: preset.id, append: false })}
                  disabled={applyPreset.isPending}>Replace</Button>
              </div>
            </div>
          ))}
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowPresetPicker(false)}>Cancel</Button>
        </div>
      )}

      {/* Save as preset form */}
      {showSavePreset && (
        <div className="bg-muted/30 border border-border rounded-lg p-2 flex gap-2 items-center">
          <Input
            value={savingPresetName}
            onChange={(e) => setSavingPresetName(e.target.value)}
            placeholder="Preset name…"
            className="h-7 text-xs border"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && savingPresetName.trim()) saveAsPreset.mutate(savingPresetName.trim()); if (e.key === "Escape") setShowSavePreset(false); }}
          />
          <Button size="sm" className="h-7 text-xs px-2" disabled={!savingPresetName.trim() || saveAsPreset.isPending}
            onClick={() => saveAsPreset.mutate(savingPresetName.trim())}>Save</Button>
          <button onClick={() => setShowSavePreset(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Step list */}
      {isLoading ? (
        <div className="h-10 bg-muted/40 rounded animate-pulse" />
      ) : procs.length === 0 ? (
        <p className="text-xs text-muted-foreground italic pl-1">No steps yet. Add steps below or apply a preset.</p>
      ) : (
        <div className="space-y-1.5">
          {procs.map((proc, idx) => (
            <div
              key={proc.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(idx)}
              className="flex items-start gap-2 bg-white border-2 border-slate-100 rounded-lg px-2 py-1.5 cursor-grab active:cursor-grabbing active:border-blue-300 active:bg-blue-50/30"
            >
              <GripVertical className="h-4 w-4 text-slate-300 mt-1 flex-shrink-0" />
              <span className="text-xs text-muted-foreground font-mono w-4 mt-1.5">{idx + 1}.</span>
              <div className="flex-1 min-w-0 space-y-1">
                <input
                  defaultValue={proc.name}
                  className="text-sm font-medium bg-transparent border-0 outline-none w-full"
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== proc.name) {
                      updateProc.mutate({ id: proc.id, data: { name: e.target.value.trim() } });
                    }
                  }}
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  <RolePicker roles={roles} value={proc.roleId}
                    onChange={(v) => updateProc.mutate({ id: proc.id, data: { roleId: v } })} />
                  <select
                    value={proc.batchMode ?? "individual"}
                    onChange={(e) => updateProc.mutate({ id: proc.id, data: { batchMode: e.target.value } })}
                    className="text-xs rounded border border-border bg-background px-1.5 py-0.5"
                  >
                    {BATCH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      placeholder="min"
                      defaultValue={proc.durationEstimate ?? ""}
                      className="text-xs rounded border border-border bg-background px-1.5 py-0.5 w-14 text-center"
                      onBlur={(e) => {
                        const v = e.target.value ? Number(e.target.value) : null;
                        if (v !== proc.durationEstimate) updateProc.mutate({ id: proc.id, data: { durationEstimate: v } });
                      }}
                    />
                    <span className="text-xs text-muted-foreground">min</span>
                  </div>
                </div>
              </div>
              <button onClick={() => deleteProc.mutate(proc.id)}
                className="text-muted-foreground hover:text-destructive p-0.5 rounded flex-shrink-0 mt-1">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add step */}
      <div className="flex gap-2">
        <Input
          value={newProcName}
          onChange={(e) => setNewProcName(e.target.value)}
          placeholder="Add step (e.g. Sandblast, Weld, Prime)…"
          className="h-8 text-sm border-2"
          onKeyDown={(e) => { if (e.key === "Enter" && newProcName.trim()) addProc.mutate(newProcName.trim()); }}
        />
        <Button size="sm" className="h-8 px-2 flex-shrink-0"
          disabled={!newProcName.trim() || addProc.isPending}
          onClick={() => addProc.mutate(newProcName.trim())}>
          {addProc.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        </Button>
      </div>

      {/* AI Edit */}
      <div className="space-y-1.5">
        <div className="flex gap-2">
          <Input
            value={aiInstruction}
            onChange={(e) => setAiInstruction(e.target.value)}
            placeholder="AI: e.g. Add a quality check after welding…"
            className="h-8 text-sm border border-purple-200 bg-purple-50/30"
            onKeyDown={(e) => { if (e.key === "Enter" && aiInstruction.trim()) aiEdit.mutate(aiInstruction.trim()); }}
          />
          <Button
            size="sm"
            className="h-8 px-2 flex-shrink-0 bg-purple-600 hover:bg-purple-700"
            disabled={!aiInstruction.trim() || aiEdit.isPending}
            onClick={() => aiEdit.mutate(aiInstruction.trim())}
          >
            {aiEdit.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          </Button>
          {showUndo && (
            <Button size="sm" variant="outline" className="h-8 px-2 flex-shrink-0 border-orange-300 text-orange-700"
              disabled={undoEdit.isPending} onClick={() => undoEdit.mutate()}>
              {undoEdit.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
            </Button>
          )}
        </div>
        <AiTipsPanel context="edit" />
      </div>
    </div>
  );
}

// ─── BOM Component Procedures (enhanced with role pickers) ───────────────────

function ComponentProcedureList({ templateId, comp, roles, presets, products, onInvalidate }: {
  templateId: number; comp: ComponentEntry; roles: Role[]; presets: StepPreset[]; products: Product[]; onInvalidate: () => void;
}) {
  const { toast } = useToast();
  const [addingProc, setAddingProc] = useState(false);
  const [newProcName, setNewProcName] = useState("");
  const [showPresetPicker, setShowPresetPicker] = useState(false);

  const base = `/api/work/templates/${templateId}/components/${comp.id}/steps`;

  const updateProc = useMutation({
    mutationFn: ({ procId, data }: { procId: number; data: object }) =>
      apiFetch(`${base}/${procId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: onInvalidate,
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const addProc = useMutation({
    mutationFn: (name: string) => apiFetch(base, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
    onSuccess: () => { onInvalidate(); setAddingProc(false); setNewProcName(""); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteProc = useMutation({
    mutationFn: (procId: number) => fetch(`${base}/${procId}`, {
      method: "DELETE", credentials: "include",
    }).then(() => {}),
    onSuccess: onInvalidate,
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const applyPreset = useMutation({
    mutationFn: ({ presetId, append }: { presetId: number; append: boolean }) =>
      apiFetch(`/api/work/templates/${templateId}/components/${comp.id}/apply-preset`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetId, append }),
      }),
    onSuccess: () => { onInvalidate(); setShowPresetPicker(false); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const compDragIdx = useRef<number | null>(null);
  const handleCompProcDrop = (targetIdx: number) => {
    const from = compDragIdx.current;
    if (from === null || from === targetIdx) return;
    compDragIdx.current = null;
    const reordered = [...comp.procedures];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(targetIdx, 0, moved);
    const order = reordered.map((p, i) => ({ id: p.id, sortOrder: i }));
    apiFetch(`${base}/reorder`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    }).then(onInvalidate).catch((e: Error) => toast({ title: e.message, variant: "destructive" }));
  };

  return (
    <div className="space-y-1.5 pl-6">
      {comp.procedures.length === 0 && !addingProc && (
        <p className="text-xs text-muted-foreground italic">No steps defined</p>
      )}
      {comp.procedures.map((proc, procIndex) => (
        <div
          key={proc.id}
          draggable
          onDragStart={() => { compDragIdx.current = procIndex; }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleCompProcDrop(procIndex)}
          className="flex items-start gap-1.5 bg-white rounded px-2 py-1.5 border border-blue-100 cursor-grab active:cursor-grabbing active:border-blue-300"
        >
          <GripVertical className="h-3.5 w-3.5 text-slate-300 mt-1 flex-shrink-0" />
          <span className="text-xs text-muted-foreground font-mono w-4 mt-1">{procIndex + 1}.</span>
          <div className="flex-1 min-w-0 space-y-1">
            <input
              defaultValue={proc.name}
              className="text-sm bg-transparent border-0 outline-none w-full"
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== proc.name) {
                  updateProc.mutate({ procId: proc.id, data: { name: e.target.value.trim() } });
                }
              }}
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <RolePicker roles={roles} value={proc.roleId}
                onChange={(v) => updateProc.mutate({ procId: proc.id, data: { roleId: v } })} />
              <select
                value={proc.batchMode ?? "individual"}
                onChange={(e) => updateProc.mutate({ procId: proc.id, data: { batchMode: e.target.value } })}
                className="text-xs rounded border border-border bg-background px-1.5 py-0.5"
              >
                {BATCH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  placeholder="min"
                  defaultValue={proc.durationEstimate ?? ""}
                  className="text-xs rounded border border-border bg-background px-1.5 py-0.5 w-14 text-center"
                  onBlur={(e) => {
                    const v = e.target.value ? Number(e.target.value) : null;
                    if (v !== proc.durationEstimate) updateProc.mutate({ procId: proc.id, data: { durationEstimate: v } });
                  }}
                />
                <span className="text-xs text-muted-foreground">min</span>
              </div>
              {/* Material consumption — for cutting/sawing steps */}
              <div className="flex items-center gap-1 flex-wrap">
                <select
                  value={proc.consumesProductId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value ? Number(e.target.value) : null;
                    updateProc.mutate({ procId: proc.id, data: { consumesProductId: v } });
                  }}
                  className="text-xs rounded border border-border bg-background px-1.5 py-0.5 max-w-[120px]"
                >
                  <option value="">— no material —</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {proc.consumesProductId && (
                  <>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      placeholder="qty"
                      defaultValue={proc.consumesQuantity ?? ""}
                      className="text-xs rounded border border-border bg-background px-1.5 py-0.5 w-16 text-center"
                      onBlur={(e) => {
                        const v = e.target.value ? Number(e.target.value) : 0;
                        if (v !== (proc.consumesQuantity ?? 0)) updateProc.mutate({ procId: proc.id, data: { consumesQuantity: v } });
                      }}
                    />
                    <span className="text-xs text-muted-foreground">mm</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button onClick={() => deleteProc.mutate(proc.id)}
            className="text-muted-foreground hover:text-destructive p-0.5 rounded flex-shrink-0 mt-1">
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}

      {addingProc ? (
        <div className="flex gap-2 items-center">
          <Input
            value={newProcName}
            onChange={(e) => setNewProcName(e.target.value)}
            placeholder="e.g. CNC Milling"
            className="h-8 text-sm border-2"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && newProcName.trim()) addProc.mutate(newProcName.trim());
              if (e.key === "Escape") { setAddingProc(false); setNewProcName(""); }
            }}
          />
          <Button size="sm" className="h-8 px-2" disabled={!newProcName.trim() || addProc.isPending}
            onClick={() => addProc.mutate(newProcName.trim())}>
            {addProc.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </Button>
          <Button size="sm" variant="ghost" className="h-8 px-2"
            onClick={() => { setAddingProc(false); setNewProcName(""); }}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setAddingProc(true); setNewProcName(""); }}
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
          >
            <Plus className="h-3 w-3" /> Add step
          </button>
          {presets.length > 0 && (
            <button
              onClick={() => setShowPresetPicker((v) => !v)}
              className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium"
            >
              <ListPlus className="h-3 w-3" /> Preset
            </button>
          )}
        </div>
      )}

      {showPresetPicker && presets.length > 0 && (
        <div className="mt-1 bg-indigo-50 border border-indigo-200 rounded-lg p-2 space-y-1.5">
          <p className="text-xs font-semibold text-indigo-700">Apply preset:</p>
          {presets.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2">
              <span className="text-xs">{p.name}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-6 text-[10px] px-1.5"
                  disabled={applyPreset.isPending}
                  onClick={() => applyPreset.mutate({ presetId: p.id, append: false })}>Replace</Button>
                <Button size="sm" variant="outline" className="h-6 text-[10px] px-1.5"
                  disabled={applyPreset.isPending}
                  onClick={() => applyPreset.mutate({ presetId: p.id, append: true })}>Append</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── BOM (existing, enhanced) ────────────────────────────────────────────────

function TemplateBOM({ template, allProducts, roles, presets }: {
  template: Template; allProducts: Product[]; roles: Role[]; presets: StepPreset[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const productId = template.productId;

  const [addingComponent, setAddingComponent] = useState(false);
  const [selectedComponentId, setSelectedComponentId] = useState<number | "new">("new");
  const [newPartName, setNewPartName] = useState("");
  const [componentQty, setComponentQty] = useState(1);

  const compKey = [`/api/work/templates/${template.id}/components`];
  const { data: components = [], isLoading } = useQuery<ComponentEntry[]>({
    queryKey: compKey,
    queryFn: () => apiFetch(`/api/work/templates/${template.id}/components`),
    enabled: !!productId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: compKey });

  const addComponentMutation = useMutation({
    mutationFn: ({ componentProductId, quantity }: { componentProductId: number; quantity: number }) =>
      apiFetch(`/api/products/${productId}/components`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ componentProductId, quantity }),
      }),
    onSuccess: () => { invalidate(); setAddingComponent(false); setSelectedComponentId("new"); setNewPartName(""); setComponentQty(1); toast({ title: "Component added" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const createPartAndAddMutation = useMutation({
    mutationFn: async ({ name, quantity }: { name: string; quantity: number }) => {
      const newPart: Product = await apiFetch("/api/products", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, itemType: "manufactured_part", bufferStock: 0, targetStock: 0 }),
      });
      return apiFetch(`/api/products/${productId}/components`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ componentProductId: newPart.id, quantity }),
      });
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setAddingComponent(false); setSelectedComponentId("new"); setNewPartName(""); setComponentQty(1);
      toast({ title: "Manufactured part created and added" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const removeComponentMutation = useMutation({
    mutationFn: (componentId: number) => fetch(`/api/products/${productId}/components/${componentId}`, {
      method: "DELETE", credentials: "include",
    }).then(() => {}),
    onSuccess: () => { invalidate(); toast({ title: "Component removed" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const reorderComponentsMutation = useMutation({
    mutationFn: (order: { id: number; sortOrder: number }[]) =>
      apiFetch(`/api/products/${productId}/components/reorder`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      }),
    onSuccess: invalidate,
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const bomDragIdx = useRef<number | null>(null);
  const handleBomDrop = (targetIdx: number) => {
    const from = bomDragIdx.current;
    if (from === null || from === targetIdx) return;
    bomDragIdx.current = null;
    const reordered = [...components];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(targetIdx, 0, moved);
    const order = reordered.map((c, i) => ({ id: c.id, sortOrder: i }));
    reorderComponentsMutation.mutate(order);
  };

  const availableParts = [...allProducts.filter((p) => p.itemType === "manufactured_part" || p.itemType === "purchased_part" || p.itemType === "purchase")]
    .filter((p) => !components.some((c) => c.componentProductId === p.id));

  if (!productId) return null;
  if (isLoading) return <div className="px-4 pb-4"><div className="h-16 bg-muted/40 rounded-lg animate-pulse" /></div>;

  return (
    <div className="px-4 pb-4 space-y-3">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Sub-parts (BOM)</p>
      {components.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No sub-parts yet.</p>
      )}

      {components.map((comp, compIndex) => {
        const isManufactured = comp.product?.itemType === "manufactured_part";
        const isPurchased = !isManufactured;
        return (
          <div
            key={comp.id}
            draggable={isManufactured}
            onDragStart={() => { if (isManufactured) bomDragIdx.current = compIndex; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => isManufactured && handleBomDrop(compIndex)}
            className={`rounded-lg border-2 p-3 space-y-2 ${isManufactured ? "border-blue-200 bg-blue-50/40 cursor-grab active:cursor-grabbing active:border-blue-400" : "border-orange-200 bg-orange-50/40"}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isManufactured && (
                  <GripVertical className="h-4 w-4 text-slate-300 flex-shrink-0 cursor-grab" />
                )}
                {isManufactured ? <Wrench className="h-4 w-4 text-blue-600" /> : <ShoppingCart className="h-4 w-4 text-orange-600" />}
                <span className="font-bold text-sm">{comp.product?.name ?? "Unknown"}</span>
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${isManufactured ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                  {isManufactured ? "Manufactured" : "Purchased"}
                </span>
                {comp.quantity > 1 && (
                  <span className="text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">×{comp.quantity}</span>
                )}
              </div>
              {isManufactured && (
                <button onClick={() => removeComponentMutation.mutate(comp.id)} disabled={removeComponentMutation.isPending}
                  className="text-destructive hover:text-destructive/80 p-1 rounded">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {isManufactured && (
              <ComponentProcedureList templateId={template.id} comp={comp} roles={roles} presets={presets} products={allProducts} onInvalidate={invalidate} />
            )}
            {isPurchased && (
              <p className="pl-6 text-xs text-muted-foreground italic">Tracked via stock / inbound</p>
            )}
          </div>
        );
      })}

      {addingComponent ? (
        <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 p-3 space-y-3">
          <p className="text-sm font-bold">Add Component</p>
          <select
            value={selectedComponentId}
            onChange={(e) => setSelectedComponentId(e.target.value === "new" ? "new" : Number(e.target.value))}
            className="w-full rounded-md border-2 border-border bg-background px-3 py-2 text-sm"
          >
            <option value="new">+ Create new manufactured part</option>
            {availableParts.length > 0 && <option disabled>── Existing parts ──</option>}
            {availableParts.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.itemType === "manufactured_part" ? "Manufactured" : "Purchased"})</option>
            ))}
          </select>
          {selectedComponentId === "new" && (
            <Input value={newPartName} onChange={(e) => setNewPartName(e.target.value)}
              placeholder="e.g. Steel Bracket, Frame" className="h-9 border-2" autoFocus />
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">Qty:</span>
            <Input type="number" min={1} value={componentQty}
              onChange={(e) => setComponentQty(Math.max(1, Number(e.target.value)))}
              className="h-9 border-2 w-20" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-9 font-bold"
              disabled={(selectedComponentId === "new" && !newPartName.trim()) || addComponentMutation.isPending || createPartAndAddMutation.isPending}
              onClick={() => {
                if (selectedComponentId === "new") {
                  if (!newPartName.trim()) return;
                  createPartAndAddMutation.mutate({ name: newPartName.trim(), quantity: componentQty });
                } else {
                  addComponentMutation.mutate({ componentProductId: selectedComponentId as number, quantity: componentQty });
                }
              }}>
              {(addComponentMutation.isPending || createPartAndAddMutation.isPending) ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
              Add
            </Button>
            <Button size="sm" variant="outline" className="h-9"
              onClick={() => { setAddingComponent(false); setSelectedComponentId("new"); setNewPartName(""); setComponentQty(1); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddingComponent(true)}
          className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-primary border-2 border-dashed border-primary/30 rounded-lg py-2.5 hover:border-primary/60 hover:bg-primary/5 transition-all"
        >
          <ListPlus className="h-4 w-4" /> Add sub-part
        </button>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function WorkTemplatesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newTemplateName, setNewTemplateName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [aiGenerateOpen, setAiGenerateOpen] = useState(false);
  const [aiDescription, setAiDescription] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  type AiPreview = {
    name: string;
    parts: { name: string; itemType: string; procedures: { name: string; roleId: number | null; batchMode: string; durationEstimate: number | null }[] }[];
    topProcedures: { name: string; roleId: number | null; batchMode: string; durationEstimate: number | null }[];
  };
  const [aiPreview, setAiPreview] = useState<AiPreview | null>(null);

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["/api/work/templates"],
    queryFn: () => apiFetch("/api/work/templates"),
  });

  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: () => apiFetch("/api/products"),
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/tasks/roles"],
    queryFn: () => apiFetch("/api/tasks/roles"),
  });

  const { data: presets = [] } = useQuery<StepPreset[]>({
    queryKey: ["/api/work/step-presets"],
    queryFn: () => apiFetch("/api/work/step-presets"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/work/templates"] });

  const createTemplate = useMutation({
    mutationFn: (name: string) => apiFetch("/api/work/templates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
    onSuccess: (data: Template) => {
      invalidate();
      setCreateOpen(false);
      setNewTemplateName("");
      setExpandedId(data.id);
      toast({ title: "Template created" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: number) => fetch(`/api/work/templates/${id}`, { method: "DELETE", credentials: "include" }).then(() => {}),
    onSuccess: () => { invalidate(); toast({ title: "Template deleted" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const cloneTemplate = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/work/templates/${id}/clone`, {
      method: "POST", headers: { "Content-Type": "application/json" },
    }),
    onSuccess: (data: Template) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setExpandedId(data.id);
      toast({ title: "Template cloned" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const aiGenerate = useMutation({
    mutationFn: (description: string) => apiFetch("/api/work/templates/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, existingRoles: roles }),
    }),
    onSuccess: (data: { preview: AiPreview }) => {
      setAiPreview(data.preview);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const confirmGenerate = useMutation({
    mutationFn: (payload: AiPreview) => apiFetch("/api/work/templates/confirm-generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    onSuccess: (data: { template: Template }) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setAiGenerateOpen(false);
      setAiPreview(null);
      setAiDescription("");
      setExpandedId(data.template.id);
      toast({ title: "Template saved!" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const seedStarterPack = useMutation({
    mutationFn: () => apiFetch("/api/work/templates/seed-starter-pack", {
      method: "POST", headers: { "Content-Type": "application/json" },
    }),
    onSuccess: (data: { seeded: number }) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: `${data.seeded} starter templates added!` });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deletePreset = useMutation({
    mutationFn: (id: number) => fetch(`/api/work/step-presets/${id}`, { method: "DELETE", credentials: "include" }).then(() => {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/work/step-presets"] }); toast({ title: "Preset deleted" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (user?.role !== "admin") {
    return <div className="p-6 text-center text-muted-foreground mt-20"><p>Admin only</p></div>;
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-black">Item Templates</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Admin Only</p>
        </div>
        <div className="flex items-center gap-2">
          {/* AI Generate */}
          <Dialog open={aiGenerateOpen} onOpenChange={(o) => { setAiGenerateOpen(o); if (!o) setAiPreview(null); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1 bg-purple-600 hover:bg-purple-700 text-white font-bold">
                <Sparkles className="h-3.5 w-3.5" /> Create with AI
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[90vw] max-w-md rounded-xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-600" /> Generate Template with AI
                </DialogTitle>
              </DialogHeader>

              {!aiPreview ? (
                /* Step 1: describe */
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold">Describe what you're making</label>
                    <Textarea
                      value={aiDescription}
                      onChange={(e) => setAiDescription(e.target.value)}
                      placeholder="e.g. A welded steel gate with CNC-machined latch brackets, powder coated finish…"
                      className="border-2 min-h-[100px] text-sm"
                      rows={4}
                    />
                  </div>
                  <AiTipsPanel context="template" defaultOpen />
                  <p className="text-xs text-muted-foreground">
                    AI will generate a template with sub-parts and production steps for review before saving.
                  </p>
                  <Button
                    className="w-full h-11 font-bold bg-purple-600 hover:bg-purple-700"
                    disabled={!aiDescription.trim() || aiGenerate.isPending}
                    onClick={() => aiGenerate.mutate(aiDescription.trim())}
                  >
                    {aiGenerate.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…</> : <><Sparkles className="mr-2 h-4 w-4" /> Generate Preview</>}
                  </Button>
                </div>
              ) : (
                /* Step 2: review preview before saving */
                <div className="space-y-3">
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2 max-h-72 overflow-y-auto">
                    <p className="font-bold text-sm">{aiPreview.name}</p>
                    {aiPreview.topProcedures.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Top-level steps</p>
                        <ul className="space-y-0.5">
                          {aiPreview.topProcedures.map((p, i) => (
                            <li key={i} className="text-xs text-foreground flex items-center gap-1.5">
                              <span className="text-muted-foreground font-mono">{i + 1}.</span> {p.name}
                              {p.roleId && <span className="text-purple-600 text-[10px]">({roles.find(r => r.id === p.roleId)?.name})</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {aiPreview.parts.map((part, pi) => (
                      <div key={pi}>
                        <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">{part.name}</p>
                        <ul className="space-y-0.5 pl-2">
                          {part.procedures.map((p, i) => (
                            <li key={i} className="text-xs text-foreground flex items-center gap-1.5">
                              <span className="text-muted-foreground font-mono">{i + 1}.</span> {p.name}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Review the steps above. Click Save to create the template, or go back to try a different description.</p>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setAiPreview(null)} disabled={confirmGenerate.isPending}>
                      ← Edit description
                    </Button>
                    <Button
                      className="flex-1 font-bold bg-purple-600 hover:bg-purple-700"
                      disabled={confirmGenerate.isPending}
                      onClick={() => confirmGenerate.mutate(aiPreview)}
                    >
                      {confirmGenerate.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : <><Check className="mr-2 h-4 w-4" /> Save Template</>}
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* New Template */}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="font-bold gap-1">
                <Plus className="h-4 w-4" /> New
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[90vw] max-w-sm rounded-xl">
              <DialogHeader>
                <DialogTitle>New Item Template</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="e.g. Standard Gate, Widget A"
                  className="h-12 border-2"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter" && newTemplateName.trim()) createTemplate.mutate(newTemplateName.trim()); }}
                />
                <Button
                  className="w-full h-12 font-bold"
                  disabled={!newTemplateName.trim() || createTemplate.isPending}
                  onClick={() => createTemplate.mutate(newTemplateName.trim())}
                >
                  {createTemplate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Create Template
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Step presets panel */}
      {presets.length > 0 && (
        <details className="rounded-xl border border-border bg-muted/20">
          <summary className="px-4 py-2.5 text-sm font-bold cursor-pointer flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Step Presets ({presets.length})
          </summary>
          <div className="px-4 pb-3 space-y-2">
            {presets.map((preset) => (
              <div key={preset.id} className="flex items-center justify-between bg-card border rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{preset.name}</p>
                  <p className="text-xs text-muted-foreground">{preset.entries.map((e) => e.name).join(" → ")}</p>
                </div>
                <button onClick={() => deletePreset.mutate(preset.id)}
                  className="text-muted-foreground hover:text-destructive p-1 rounded">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Info banner / starter pack prompt */}
      {isLoading ? null : templates.length === 0 ? (
        <div className="text-center py-16 px-4 bg-muted/30 rounded-xl border border-dashed space-y-4">
          <Package className="h-10 w-10 mx-auto text-muted-foreground" />
          <div>
            <p className="font-semibold">No templates yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create a template or start from our starter pack.</p>
          </div>
          <div className="flex flex-col gap-2 max-w-xs mx-auto">
            <Button
              className="w-full font-bold gap-2 bg-purple-600 hover:bg-purple-700"
              onClick={() => setAiGenerateOpen(true)}
            >
              <Sparkles className="h-4 w-4" /> Create with AI
            </Button>
            <Button
              className="w-full font-bold gap-2 bg-green-600 hover:bg-green-700"
              onClick={() => seedStarterPack.mutate()}
              disabled={seedStarterPack.isPending}
            >
              {seedStarterPack.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Load 6 Starter Templates
            </Button>
            <Button variant="outline" className="w-full gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Create Blank Template
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            <p className="font-semibold mb-0.5">How templates work</p>
            <p className="text-xs">Each template defines the production steps for a final product. Assign roles to steps for worker routing. Sub-parts are created as separate work items when you start a work order.</p>
          </div>

          <div className="space-y-3">
            {templates.map((template) => {
              const isExpanded = expandedId === template.id;
              return (
                <div key={template.id} className="bg-card border-2 border-border rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                    <div
                      className="flex items-center gap-3 flex-1 cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpandedId(isExpanded ? null : template.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpandedId(isExpanded ? null : template.id); }}
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <div>
                        <h3 className="font-bold text-base">{template.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">Final product</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg"
                        title="Clone template"
                        onClick={() => {
                          if (!cloneTemplate.isPending) cloneTemplate.mutate(template.id);
                        }}
                        disabled={cloneTemplate.isPending}
                      >
                        {cloneTemplate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                      </button>
                      <button
                        className="p-2 text-destructive hover:text-destructive/80 hover:bg-destructive/10 rounded-lg"
                        onClick={() => {
                          if (confirm(`Delete template "${template.name}"?`)) {
                            deleteTemplate.mutate(template.id);
                            if (expandedId === template.id) setExpandedId(null);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t-2 border-border divide-y-2 divide-border">
                      {/* Production Steps (top-level template procedures) */}
                      <div className="px-4 py-3">
                        <TemplateProceduresEditor template={template} roles={roles} presets={presets} />
                      </div>
                      {/* BOM */}
                      <TemplateBOM template={template} allProducts={allProducts} roles={roles} presets={presets} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
