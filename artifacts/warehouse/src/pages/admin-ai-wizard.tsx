import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Loader2, Check, Clock, User, Layers, FileText,
  RotateCcw, Copy, Plus, Trash2, Eye, X,
} from "lucide-react";
import { MAT_SHAPES } from "@/pages/work/materials";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RawMaterial {
  id: number;
  name: string;          // technical grade: S235, 42CrMo4
  displayName: string | null; // worker name: "Mild steel", "Chrome-moly"
  shape: string | null;
  profile: string | null;
  profileMm: number | null;
  unit: string;
}

interface FormData {
  partName: string;
  materialGrade: string;
  shape: string;
  materialId: number | null;
  materialName: string;  // what gets sent to AI: "42CrMo4 Ø30"
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
  partName: "", materialGrade: "", shape: "", materialId: null, materialName: "",
  operations: [], surfaceFinish: [], batchQty: "1", materialQtyPerPiece: "", notes: "",
};

// Operations that don't apply for a given shape — hidden by default
const SHAPE_OP_EXCLUSIONS: Record<string, RegExp> = {
  rod:        /bend|press.?brake|laser|plasma|punch|shear|blanking|roll.?form/i,
  hex:        /bend|press.?brake|laser|plasma|punch|shear|blanking|roll.?form/i,
  sheet:      /lathe|turning|thread.*turn/i,
  plate:      /lathe|turning|thread.*turn/i,
  flat_bar:   /lathe|turning/i,
  tube_round: /lathe|turning/i,
  tube_sq:    /lathe|turning/i,
  angle:      /lathe|turning/i,
  channel:    /lathe|turning/i,
};

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Failed");
  return d;
}

// Display a profile with shape-appropriate prefix (Ø for rod/hex)
function fmtProfile(shape: string | null, profile: string | null): string {
  if (!profile || !profile.trim()) return "";
  const p = profile.trim();
  if ((shape === "rod" || shape === "hex") && /^\d/.test(p) && !p.includes("Ø")) return `Ø${p}`;
  return p;
}

function shapeLabel(v: string | null) {
  return MAT_SHAPES.find((s) => s.value === v)?.label ?? v ?? "";
}

// ─── Chip toggle helper ────────────────────────────────────────────────────

function ChipSelect({
  options, selected, onToggle, hiddenOps = [],
}: {
  options: string[]; selected: string[]; onToggle: (v: string) => void; hiddenOps?: string[];
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? options : options.filter((o) => !hiddenOps.includes(o));
  const hiddenCount = hiddenOps.length;

  if (options.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No station types configured yet — add them in Admin → Stations first.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {visible.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button key={opt} type="button" onClick={() => onToggle(opt)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all ${
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {active && <Check className="inline h-3 w-3 mr-1" />}{opt}
            </button>
          );
        })}
      </div>
      {hiddenCount > 0 && (
        <button type="button" onClick={() => setShowAll((p) => !p)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
          <Eye className="h-3 w-3" />
          {showAll
            ? `Hide ${hiddenCount} inapplicable operation${hiddenCount !== 1 ? "s" : ""}`
            : `Show ${hiddenCount} hidden (not typical for ${shapeLabel(null)})`}
        </button>
      )}
    </div>
  );
}

// ─── Single Result Card ────────────────────────────────────────────────────

function ResultCard({ result, sourceItem, onSaved }: {
  result: WizardResult; sourceItem: FormData; onSaved: () => void;
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
    navigator.clipboard.writeText(`${result.templateName}\n\n${text}`)
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
          body: JSON.stringify({ name: s.name, sortOrder: i, roleId: s.roleId, stationTypeId: s.stationTypeId, durationEstimate: s.durationEstimate }),
        });
      }
      setSaved(true); onSaved();
      toast({ title: `Template "${result.templateName}" saved!` });
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-xl border-2 border-border bg-card p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">AI Suggestion</p>
          <h3 className="text-sm font-black mt-0.5">{result.templateName}</h3>
        </div>
        <button type="button" onClick={copyToClipboard}
          className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors">
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
                <FileText className="h-3 w-3 flex-shrink-0 mt-0.5" />{step.notes}
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

// ─── Wizard Form ──────────────────────────────────────────────────────────

function WizardForm({
  form, onChange, materials, operationOptions, onAddToCart, onGenerateNow, isPending, cartCount,
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
  // Unique grades from catalogue
  const uniqueGrades = [...new Set(materials.map((m) => m.name))];

  // Get the display name for a grade (first entry wins)
  const getDisplay = (grade: string) => materials.find((m) => m.name === grade)?.displayName ?? null;

  // Shapes available for a given grade in the catalogue
  const shapesForGrade = (grade: string) =>
    [...new Set(materials.filter((m) => m.name === grade && m.shape).map((m) => m.shape!))];

  // Profiles for a given grade+shape
  const profilesForGradeShape = (grade: string, shape: string) =>
    materials.filter((m) => m.name === grade && m.shape === shape);

  const availableShapes = form.materialGrade ? shapesForGrade(form.materialGrade) : [];
  const availableProfiles = form.materialGrade && form.shape
    ? profilesForGradeShape(form.materialGrade, form.shape)
    : [];
  const selectedProfile = materials.find((m) => m.id === form.materialId);

  // Operations hidden for the selected shape
  const exclusion = form.shape ? SHAPE_OP_EXCLUSIONS[form.shape] : undefined;
  const hiddenOps = exclusion ? operationOptions.filter((o) => exclusion.test(o)) : [];

  const canSubmit = form.partName.trim().length >= 2 && form.operations.length > 0;

  const toggleOp = (v: string) => {
    const cur = form.operations;
    onChange({ operations: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };
  const toggleFinish = (v: string) => onChange({ surfaceFinish: form.surfaceFinish.includes(v) ? [] : [v] });

  // When grade changes: keep shape if it exists for new grade; auto-select if only 1; auto-select profile if only 1
  const handleGradeChange = (newGrade: string) => {
    const newShapes = newGrade ? shapesForGrade(newGrade) : [];
    const shapeStillValid = form.shape && newShapes.includes(form.shape);
    const autoShape = shapeStillValid ? form.shape : (newShapes.length === 1 ? newShapes[0] : "");

    const newExclusion = autoShape ? SHAPE_OP_EXCLUSIONS[autoShape] : undefined;
    const cleanedOps = newExclusion ? form.operations.filter((o) => !newExclusion.test(o)) : form.operations;

    const profiles = newGrade && autoShape ? profilesForGradeShape(newGrade, autoShape) : [];
    const autoMat = profiles.length === 1 ? profiles[0] : null;
    const display = getDisplay(newGrade);

    onChange({
      materialGrade: newGrade,
      shape: autoShape,
      materialId: autoMat?.id ?? null,
      materialName: autoMat
        ? `${display ?? newGrade}${fmtProfile(autoShape, autoMat.profile) ? ` ${fmtProfile(autoShape, autoMat.profile)}` : ""}`
        : (display ?? newGrade),
      operations: cleanedOps,
    });
  };

  // When shape changes: auto-select profile if only 1; clear incompatible ops
  const handleShapeChange = (newShape: string) => {
    const newExclusion = newShape ? SHAPE_OP_EXCLUSIONS[newShape] : undefined;
    const cleanedOps = newExclusion ? form.operations.filter((o) => !newExclusion.test(o)) : form.operations;
    const profiles = form.materialGrade && newShape ? profilesForGradeShape(form.materialGrade, newShape) : [];
    const autoMat = profiles.length === 1 ? profiles[0] : null;
    const display = form.materialGrade ? getDisplay(form.materialGrade) : null;

    onChange({
      shape: newShape,
      materialId: autoMat?.id ?? null,
      materialName: autoMat
        ? `${display ?? form.materialGrade}${fmtProfile(newShape, autoMat.profile) ? ` ${fmtProfile(newShape, autoMat.profile)}` : ""}`
        : (display ?? form.materialGrade),
      operations: cleanedOps,
    });
  };

  const handleProfileChange = (mat: RawMaterial) => {
    const active = form.materialId === mat.id;
    const display = form.materialGrade ? getDisplay(form.materialGrade) : null;
    const profileStr = fmtProfile(form.shape, mat.profile);
    onChange({
      materialId: active ? null : mat.id,
      materialName: active
        ? (display ?? form.materialGrade)
        : `${display ?? form.materialGrade}${profileStr ? ` ${profileStr}` : ""}`,
    });
  };

  const clearMaterial = () => onChange({ materialGrade: "", shape: "", materialId: null, materialName: "" });

  let step = 0;
  const s = () => { step++; return step; };

  // Build material context summary (shown as a strip before operations)
  const hasAnyMaterial = form.materialGrade || form.shape || form.materialId;
  const contextParts: string[] = [];
  if (form.materialGrade) {
    const dn = getDisplay(form.materialGrade);
    contextParts.push(dn ? `${dn} (${form.materialGrade})` : form.materialGrade);
  }
  if (form.shape) contextParts.push(shapeLabel(form.shape) ?? form.shape);
  if (selectedProfile) {
    const p = fmtProfile(form.shape, selectedProfile.profile);
    if (p) contextParts.push(p);
  }

  return (
    <div className="space-y-5">

      {/* 1. Part name */}
      <div className="space-y-2">
        <label className="text-sm font-bold">{s()}. What is this part called?</label>
        <input
          type="text" value={form.partName}
          onChange={(e) => onChange({ partName: e.target.value })}
          placeholder="e.g. Bracket arm, Gate frame, Piston rod…"
          className="w-full h-11 px-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {/* 2. Material grade */}
      <div className="space-y-2">
        <label className="text-sm font-bold">
          {s()}. Material grade{" "}
          <a href="/work/materials" className="text-[10px] font-normal text-primary underline">manage list</a>
        </label>
        {uniqueGrades.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No materials added yet.{" "}
            <a href="/work/materials" className="text-primary underline">Add grades and sizes</a> to your catalogue first.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {uniqueGrades.map((grade) => {
              const active = form.materialGrade === grade;
              const display = getDisplay(grade);
              return (
                <button key={grade} type="button"
                  onClick={() => handleGradeChange(active ? "" : grade)}
                  className={`flex flex-col items-start px-3 py-1.5 rounded-xl text-left border-2 transition-all ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-foreground hover:border-primary/40"
                  }`}
                >
                  <span className="text-xs font-bold leading-tight">
                    {active && <Check className="inline h-3 w-3 mr-1" />}
                    {display ?? grade}
                  </span>
                  {display && (
                    <span className={`text-[10px] font-mono leading-tight ${active ? "text-primary/70" : "text-muted-foreground"}`}>
                      {grade}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Shape — shown whenever the grade has any shape in the catalogue */}
      {form.materialGrade && availableShapes.length >= 1 && (
        <div className="space-y-2">
          <label className="text-sm font-bold">
            {s()}. Shape
            {availableShapes.length === 1 && (
              <span className="font-normal text-muted-foreground text-xs ml-1">(only shape stocked — tap to change/clear)</span>
            )}
          </label>
          <div className="flex flex-wrap gap-2">
            {availableShapes.map((sv) => {
              const active = form.shape === sv;
              return (
                <button key={sv} type="button" onClick={() => handleShapeChange(active ? "" : sv)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {active && <Check className="inline h-3 w-3 mr-1" />}
                  {shapeLabel(sv)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Grade selected but no shapes in catalogue — explain why no shape prompt */}
      {form.materialGrade && availableShapes.length === 0 && (
        <p className="text-xs text-muted-foreground bg-muted px-2.5 py-2 rounded-lg">
          No shapes defined for <strong>{getDisplay(form.materialGrade) ?? form.materialGrade}</strong> yet.{" "}
          <a href="/work/materials" className="text-primary underline">Add a shape and sizes</a> to this grade so you can pick them here.
        </p>
      )}

      {/* 4. Size / diameter — shown whenever the grade+shape has any size defined */}
      {form.materialGrade && form.shape && availableProfiles.length >= 1 && (
        <div className="space-y-2">
          <label className="text-sm font-bold">
            {s()}. Size
            {(form.shape === "rod" || form.shape === "hex") && (
              <span className="font-normal text-muted-foreground text-xs ml-1">(diameter)</span>
            )}
            {(form.shape === "sheet" || form.shape === "plate") && (
              <span className="font-normal text-muted-foreground text-xs ml-1">(thickness)</span>
            )}
            {availableProfiles.length === 1 && (
              <span className="font-normal text-muted-foreground text-xs ml-1">(only size stocked — tap to clear)</span>
            )}
          </label>
          <div className="flex flex-wrap gap-2">
            {availableProfiles.map((mat) => {
              const active = form.materialId === mat.id;
              const label = fmtProfile(form.shape, mat.profile) || mat.unit;
              return (
                <button key={mat.id} type="button" onClick={() => handleProfileChange(mat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {active && <Check className="inline h-3 w-3 mr-1" />}{label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Material context summary strip */}
      {hasAnyMaterial && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="flex-1 flex items-center gap-1.5 flex-wrap text-xs font-semibold text-blue-800 min-w-0">
            {contextParts.map((p, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-blue-300">·</span>}
                {p}
              </span>
            ))}
            {availableShapes.length === 1 && form.shape && (
              <span className="text-blue-400 font-normal text-[10px]">(auto-selected)</span>
            )}
          </div>
          <button type="button" onClick={clearMaterial} className="flex-shrink-0 text-blue-400 hover:text-blue-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 5. Material per piece */}
      {selectedProfile && (
        <div className="space-y-2">
          <label className="text-sm font-bold">
            {s()}. Material per piece{" "}
            <span className="font-normal text-muted-foreground">({selectedProfile.unit} — optional)</span>
          </label>
          <input
            type="number" min="0" step="0.001"
            value={form.materialQtyPerPiece}
            onChange={(e) => onChange({ materialQtyPerPiece: e.target.value })}
            placeholder={`e.g. 250 ${selectedProfile.unit} of ${fmtProfile(form.shape, selectedProfile.profile) || selectedProfile.unit}`}
            className="w-full h-11 px-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none"
          />
        </div>
      )}

      {/* Operations */}
      <div className="space-y-2">
        <label className="text-sm font-bold">
          {s()}. Required operations{" "}
          <span className="font-normal text-muted-foreground">(select all that apply)</span>
        </label>
        {form.shape && hiddenOps.length > 0 && (
          <p className="text-[10px] text-muted-foreground bg-muted px-2.5 py-1.5 rounded-lg">
            Showing operations typical for <strong>{shapeLabel(form.shape)}</strong>.
            {hiddenOps.length} operation{hiddenOps.length !== 1 ? "s" : ""} hidden below.
          </p>
        )}
        <ChipSelect
          options={operationOptions}
          selected={form.operations}
          onToggle={toggleOp}
          hiddenOps={hiddenOps}
        />
      </div>

      {/* Surface finish */}
      <div className="space-y-2">
        <label className="text-sm font-bold">
          {s()}. Surface finish{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <ChipSelect options={FINISH_OPTIONS} selected={form.surfaceFinish} onToggle={toggleFinish} />
      </div>

      {/* Batch qty */}
      <div className="space-y-2">
        <label className="text-sm font-bold">{s()}. Typical batch quantity</label>
        <div className="flex gap-2">
          {["1", "5", "10", "25", "50"].map((q) => (
            <button key={q} type="button" onClick={() => onChange({ batchQty: q })}
              className={`flex-1 h-10 rounded-lg text-sm font-bold border-2 transition-all ${
                form.batchQty === q ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
              }`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <label className="text-sm font-bold">
          {s()}. Anything else the AI should know?{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          value={form.notes} onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="e.g. parts come pre-cut, tight tolerance holes, client provides own paint, needs deburring after every step…"
          rows={3}
          className="w-full px-3 py-2 rounded-xl border-2 border-input bg-background text-sm resize-none focus:border-primary focus:outline-none"
        />
      </div>

      {!canSubmit && (
        <p className="text-xs text-center text-muted-foreground">
          Fill in part name and at least one operation to generate.
        </p>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 h-12 font-bold text-sm"
          disabled={!canSubmit || isPending} onClick={onAddToCart}>
          <Plus className="h-4 w-4 mr-1.5" /> Add to Batch
        </Button>
        <Button className="flex-1 h-12 font-bold text-sm"
          disabled={!canSubmit || isPending} onClick={onGenerateNow}>
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

function CartList({ items, onRemove }: { items: FormData[]; onRemove: (i: number) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Batch queue — {items.length} part{items.length !== 1 ? "s" : ""}
      </p>
      {items.map((item, i) => (
        <div key={i} className="flex items-center justify-between gap-2 bg-muted/50 rounded-xl px-3 py-2 border-2 border-border">
          <div className="min-w-0">
            <p className="text-xs font-bold truncate">{item.partName}</p>
            <p className="text-[10px] text-muted-foreground truncate">
              {item.materialName || "—"}{item.shape ? ` · ${shapeLabel(item.shape)}` : ""} · {item.operations.join(", ")}
            </p>
          </div>
          <button type="button" onClick={() => onRemove(i)}
            className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Batch results ────────────────────────────────────────────────────────

function BatchResults({ results, onReset }: { results: BatchResult[]; onReset: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {results.length} template{results.length !== 1 ? "s" : ""} generated
        </p>
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
              <ResultCard result={br.result} sourceItem={br.item} onSaved={() => { br.saved = true; }} />
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
    queryFn: async () => {
      const r = await fetch("/api/raw-materials", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load materials");
      return r.json();
    },
    staleTime: 60_000,
  });

  const operationOptions = stationTypes.map((s) => s.name);
  const patchForm = (patch: Partial<FormData>) => setForm((f) => ({ ...f, ...patch }));
  const canSubmit = form.partName.trim().length >= 2 && form.operations.length > 0;

  const addToCart = () => {
    if (!canSubmit) return;
    setCart((prev) => [...prev, { ...form }]);
    setForm({ ...EMPTY_FORM });
    toast({ title: `"${form.partName}" added to batch` });
  };

  const removeFromCart = (i: number) => setCart((prev) => prev.filter((_, idx) => idx !== i));

  const generateItem = async (item: FormData): Promise<WizardResult> =>
    apiFetch("/api/work/ai-template-wizard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partName: item.partName.trim(),
        material: item.materialName || undefined,
        materialGrade: item.materialGrade || undefined,
        shape: item.shape || undefined,
        operations: item.operations,
        surfaceFinish: item.surfaceFinish[0] ?? undefined,
        batchQuantity: Number(item.batchQty) || 1,
        notes: item.notes.trim() || undefined,
      }),
    });

  const generateAll = async () => {
    if (!canSubmit) return;
    const allItems = [...cart, { ...form }];
    setGenerating(true);
    setProgress({ current: 0, total: allItems.length });
    const results: BatchResult[] = [];
    for (let i = 0; i < allItems.length; i++) {
      setProgress({ current: i + 1, total: allItems.length });
      try {
        results.push({ item: allItems[i], result: await generateItem(allItems[i]), error: null, saved: false });
      } catch (err: any) {
        results.push({ item: allItems[i], result: null, error: err.message, saved: false });
      }
    }
    setGenerating(false); setProgress(null);
    setBatchResults(results); setCart([]); setForm({ ...EMPTY_FORM });
  };

  const reset = () => { setBatchResults(null); setCart([]); setForm({ ...EMPTY_FORM }); };

  return (
    <div className="p-4 space-y-5 pb-24 max-w-2xl mx-auto">
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
            Grade → shape → size → operations → Generate
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
                <div className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }} />
              </div>
            </div>
          )}
          <CartList items={cart} onRemove={removeFromCart} />
          <WizardForm
            form={form} onChange={patchForm} materials={rawMaterials}
            operationOptions={operationOptions} onAddToCart={addToCart}
            onGenerateNow={generateAll} isPending={generating} cartCount={cart.length}
          />
        </>
      )}
    </div>
  );
}
