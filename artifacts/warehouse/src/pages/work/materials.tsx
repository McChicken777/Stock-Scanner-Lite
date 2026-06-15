import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLang } from "@/contexts/lang";
import * as XLSX from "xlsx";
import { Plus, Upload, Download, Search, Trash2, Loader2, PackageOpen, X, CheckCircle2, AlertTriangle, TrendingDown, Pencil, Check, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";

// ─── Raw Materials tab ────────────────────────────────────────────────────────

interface RawMaterial {
  id: number; name: string; displayName: string | null; shape: string | null;
  profile: string | null; profileMm: number | null; unit: string; notes: string | null;
  productId: number | null; totalStock: number;
}

const RAW_UNITS = ["mm", "m", "kg", "pcs", "L", "m²"];

export const MAT_SHAPES = [
  { value: "rod",        label: "Round bar / rod",      icon: "●", profileHint: "Ø mm — e.g. 30" },
  { value: "hex",        label: "Hex bar",              icon: "⬡", profileHint: "A/F mm — e.g. 27" },
  { value: "sheet",      label: "Sheet metal",          icon: "▬", profileHint: "thickness mm — e.g. 3" },
  { value: "plate",      label: "Plate",                icon: "▬", profileHint: "thickness mm — e.g. 20" },
  { value: "flat_bar",   label: "Flat bar",             icon: "═", profileHint: "W×H mm — e.g. 50×10" },
  { value: "tube_round", label: "Round tube",           icon: "○", profileHint: "OD×wall mm — e.g. 60.3×3.6" },
  { value: "tube_sq",    label: "Square / rect. tube",  icon: "□", profileHint: "W×H×wall mm — e.g. 50×50×3" },
  { value: "angle",      label: "Angle iron (L)",       icon: "∟", profileHint: "A×B×t mm — e.g. 50×50×5" },
  { value: "channel",    label: "Channel (U/C)",        icon: "⊏", profileHint: "H×W×t mm — e.g. 100×50×5" },
  { value: "other",      label: "Other / custom",       icon: "◇", profileHint: "describe dimensions" },
] as const;

function shapeLabel(v: string | null) {
  return MAT_SHAPES.find((s) => s.value === v)?.label ?? v ?? "";
}

function shapeIcon(v: string | null): string {
  return MAT_SHAPES.find((s) => s.value === v)?.icon ?? "◇";
}

// Returns the display string for a profile chip — adds Ø prefix for rod/hex
function formatProfile(shape: string | null, profile: string | null): string {
  if (!profile || !profile.trim()) return "";
  const p = profile.trim();
  if ((shape === "rod" || shape === "hex") && /^\d/.test(p) && !p.includes("Ø")) return `Ø${p}`;
  return p;
}

// Human-readable label for the size input field based on shape
function sizeInputLabel(shape: string | null): string {
  switch (shape) {
    case "rod":        return "Diameter in mm — e.g. 30 (shown as Ø30)";
    case "hex":        return "Across-flats in mm — e.g. 27 (shown as Ø27)";
    case "sheet":      return "Thickness in mm — e.g. 3";
    case "plate":      return "Thickness in mm — e.g. 20";
    case "flat_bar":   return "Width × Height — e.g. 50×10";
    case "tube_round": return "OD × wall — e.g. 60.3×3.6";
    case "tube_sq":    return "W × H × wall — e.g. 50×50×3";
    case "angle":      return "A × B × t — e.g. 50×50×5";
    case "channel":    return "H × W × t — e.g. 100×50×5";
    default:           return "Size / profile description";
  }
}

// Groups flat list into grade → shape → profiles
function groupMaterials(mats: RawMaterial[]) {
  const order: string[] = [];
  const map = new Map<string, { grade: string; shape: string | null; items: RawMaterial[] }>();
  for (const m of mats) {
    const key = `${m.name}\0${m.shape ?? ""}`;
    if (!map.has(key)) { order.push(key); map.set(key, { grade: m.name, shape: m.shape, items: [] }); }
    map.get(key)!.items.push(m);
  }
  return order.map((k) => map.get(k)!);
}

// One profile chip — click to edit, X to delete
function ProfileChip({ mat, onRefresh }: { mat: RawMaterial; onRefresh: () => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(mat.profile ?? "");
  const [saving, setSaving] = useState(false);

  const displayed = formatProfile(mat.shape, mat.profile);

  const save = async () => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      const profileMm = parseFloat(value.replace(/[^\d.]/g, "")) || null;
      const r = await fetch(`/api/raw-materials/${mat.id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: mat.name, displayName: mat.displayName ?? undefined,
          shape: mat.shape ?? undefined, profile: value.trim(), profileMm,
          unit: mat.unit, notes: mat.notes ?? undefined,
        }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
      onRefresh(); setEditing(false);
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const del = async () => {
    const label = displayed || mat.unit;
    if (!confirm(`Remove "${label}" from ${mat.name}? Templates using this entry will lose the material link.`)) return;
    try {
      const r = await fetch(`/api/raw-materials/${mat.id}`, { method: "DELETE", credentials: "include" });
      if (r.ok) onRefresh();
      else { const d = await r.json().catch(() => ({})); toast({ title: d.error || "Failed to delete", variant: "destructive" }); }
    } catch { toast({ title: "Failed to delete", variant: "destructive" }); }
  };

  if (editing) return (
    <div className="flex items-center gap-1">
      <input
        autoFocus value={value} onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        placeholder={sizeInputLabel(mat.shape).split(" — ")[1] ?? "size"}
        className="h-7 w-28 px-2 text-xs rounded-full border-2 border-primary bg-background focus:outline-none font-semibold"
      />
      <button onClick={save} disabled={!value.trim() || saving} className="text-green-600 hover:text-green-700 disabled:opacity-40">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      </button>
      <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  return (
    <div className="group flex items-center gap-1.5 rounded-full border border-border bg-muted pl-2.5 pr-2 py-1.5">
      <button onClick={() => setEditing(true)}
        className={`text-xs font-semibold hover:text-primary transition-colors ${!displayed ? "text-muted-foreground italic" : ""}`}>
        {displayed || "set size"}
      </button>
      <span
        title="On-hand stock"
        className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full ${
          mat.totalStock > 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
        }`}
      >
        {mat.totalStock} {mat.unit}
      </span>
      <button onClick={del} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// One grade+shape group card with profile chips and editable display name
function MaterialGradeGroup({ grade, shape, items, onRefresh }: {
  grade: string; shape: string | null; items: RawMaterial[]; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const displayName = items[0]?.displayName ?? "";
  const unit = items[0]?.unit ?? "mm";

  const [addingProfile, setAddingProfile] = useState(false);
  const [newProfile, setNewProfile] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [savingName, setSavingName] = useState(false);

  const saveDisplayName = async () => {
    setSavingName(true);
    try {
      await Promise.all(items.map((m) =>
        fetch(`/api/raw-materials/${m.id}`, {
          method: "PUT", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: m.name, displayName: nameDraft.trim() || null,
            shape: m.shape ?? undefined, profile: m.profile ?? undefined,
            profileMm: m.profileMm ?? undefined, unit: m.unit, notes: m.notes ?? undefined,
          }),
        })
      ));
      onRefresh(); setEditingName(false);
    } catch { toast({ title: "Failed to save name", variant: "destructive" }); }
    finally { setSavingName(false); }
  };

  const addProfile = async () => {
    if (!newProfile.trim()) return;
    const isDuplicate = items.some((m) =>
      (m.profile ?? "").toLowerCase() === newProfile.trim().toLowerCase()
    );
    if (isDuplicate) {
      toast({ title: `${formatProfile(shape, newProfile.trim()) || newProfile.trim()} already exists in this group`, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const profileMm = parseFloat(newProfile.replace(/[^\d.]/g, "")) || null;
      const r = await fetch("/api/raw-materials", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: grade, displayName: displayName || undefined,
          shape: shape ?? undefined, profile: newProfile.trim(), profileMm, unit,
        }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || `Server error ${r.status}`); }
      setNewProfile(""); onRefresh();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const deleteGroup = async () => {
    const label = displayName || (shape ? `${grade} ${shapeLabel(shape)}` : grade);
    if (!confirm(`Delete all ${items.length} size${items.length !== 1 ? "s" : ""} of "${label}"?`)) return;
    try {
      await Promise.all(items.map((m) => fetch(`/api/raw-materials/${m.id}`, { method: "DELETE", credentials: "include" })));
      onRefresh();
    } catch { toast({ title: "Failed to delete", variant: "destructive" }); }
  };

  return (
    <div className="rounded-xl border-2 border-border bg-card p-3 space-y-2.5">
      {/* Header: display name + grade + shape */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveDisplayName(); if (e.key === "Escape") setEditingName(false); }}
                placeholder={`Worker name — e.g. "Chrome-moly", "Mild steel"`}
                className="flex-1 h-8 px-2.5 rounded-lg border-2 border-primary bg-background text-sm focus:outline-none font-bold"
              />
              <button onClick={saveDisplayName} disabled={savingName} className="text-green-600 hover:text-green-700 disabled:opacity-40">
                {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </button>
              <button onClick={() => setEditingName(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setNameDraft(displayName); setEditingName(true); }}
              className="group/n flex items-center gap-1.5 text-left w-full"
            >
              <div className="min-w-0">
                {displayName ? (
                  <>
                    <p className="font-black text-base leading-tight truncate">{displayName}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">{grade}</p>
                  </>
                ) : (
                  <p className="font-bold text-sm truncate">{grade}</p>
                )}
              </div>
              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover/n:opacity-60 transition-opacity flex-shrink-0 mt-0.5" />
            </button>
          )}
          {!editingName && (
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {shape && (
                <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full">
                  {shapeIcon(shape)} {shapeLabel(shape)}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">
                {items.length} size{items.length !== 1 ? "s" : ""}
                {!displayName && <span className="ml-1 text-amber-500">&middot; tap name to add worker label</span>}
              </span>
            </div>
          )}
        </div>
        <button onClick={deleteGroup} className="flex-shrink-0 text-muted-foreground hover:text-destructive p-1 rounded-lg hover:bg-muted transition-colors mt-0.5">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Size chips */}
      <div className="space-y-1.5">
        {shape && (
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            {sizeInputLabel(shape).split(" — ")[0]}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5 items-center">
          {items.map((m) => <ProfileChip key={m.id} mat={m} onRefresh={onRefresh} />)}
          {addingProfile ? (
            <div className="flex items-center gap-1 flex-wrap">
              <div className="flex items-center gap-1">
                <input
                  autoFocus value={newProfile}
                  onChange={(e) => setNewProfile(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addProfile(); if (e.key === "Escape") { setAddingProfile(false); setNewProfile(""); } }}
                  placeholder={shape ? sizeInputLabel(shape).split(" — ")[1] ?? "value" : "size"}
                  className="h-7 w-36 px-2.5 text-xs rounded-full border-2 border-primary bg-background focus:outline-none font-semibold"
                />
                <button onClick={addProfile} disabled={!newProfile.trim() || saving} className="text-green-600 hover:text-green-700 disabled:opacity-40">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => { setAddingProfile(false); setNewProfile(""); }} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingProfile(true)}
              className="flex items-center gap-0.5 px-2.5 py-1.5 rounded-full border-2 border-dashed border-border text-xs text-muted-foreground hover:border-primary hover:text-primary transition-all"
            >
              <Plus className="h-3 w-3" /> Add size
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RawMaterialsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newGrade, setNewGrade] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newShape, setNewShape] = useState("");
  const [newProfile, setNewProfile] = useState("");
  const [newUnit, setNewUnit] = useState("mm");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: mats = [], isLoading } = useQuery<RawMaterial[]>({
    queryKey: ["/api/raw-materials"],
    queryFn: async () => {
      const r = await fetch("/api/raw-materials", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load materials");
      return r.json();
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/raw-materials"] });
  const groups = groupMaterials(mats);
  const uniqueGrades = [...new Set(mats.map((m) => m.name))];

  const saveOne = async () => {
    if (!newGrade.trim()) return;
    const alreadyExists = groups.some(
      (g) =>
        g.grade.toLowerCase() === newGrade.trim().toLowerCase() &&
        (g.shape ?? "") === (newShape ?? "")
    );
    if (alreadyExists) {
      const shapeName = newShape ? ` ${shapeLabel(newShape)}` : "";
      toast({
        title: `${newGrade.trim()}${shapeName} already exists`,
        description: 'Find it below and use "+ Add size" to add more sizes.',
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const profileMm = newProfile ? parseFloat(newProfile.replace(/[^\d.]/g, "")) || null : null;
      const r = await fetch("/api/raw-materials", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newGrade.trim(),
          displayName: newDisplayName.trim() || undefined,
          shape: newShape || undefined,
          profile: newProfile.trim() || undefined,
          profileMm,
          unit: newUnit,
        }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || `Server error ${r.status} — try restarting the server`); }
      setNewProfile(""); // keep grade+shape+displayName so user can quickly add more sizes
      refresh();
      const label = newDisplayName.trim() || newGrade.trim();
      toast({ title: `Added${newProfile ? ` ${label} ${newProfile}` : ` ${label}`}` });
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Define each material grade once (e.g. S235, 42CrMo4), then add all the sizes your shop stocks. Each size is a separate stock item.
      </p>

      {/* Add form at TOP so new cards appear below where the user is looking */}
      {adding ? (
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3 space-y-2">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">New material</p>
          {/* Grade (technical) */}
          <div className="flex gap-2">
            <div className="flex-1">
              <p className="text-[10px] text-muted-foreground mb-1">Technical grade</p>
              <input
                autoFocus
                list="grade-suggestions"
                value={newGrade}
                onChange={(e) => setNewGrade(e.target.value)}
                placeholder="e.g. S235, 42CrMo4, AL6082, SS304"
                className="w-full h-9 px-2.5 rounded-lg border-2 border-input bg-background text-sm focus:border-primary focus:outline-none font-semibold"
              />
              <datalist id="grade-suggestions">
                {uniqueGrades.map((g) => <option key={g} value={g} />)}
              </datalist>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Stock unit</p>
              <select value={newUnit} onChange={(e) => setNewUnit(e.target.value)}
                className="h-9 px-2 rounded-lg border-2 border-input bg-background text-sm focus:border-primary focus:outline-none">
                {RAW_UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
          </div>
          {/* Worker name (optional) */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Worker name <span className="opacity-60">(optional — what your team calls it)</span></p>
            <input
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder='e.g. "Chrome-moly", "Mild steel", "Stainless", "Aluminium"'
              className="w-full h-9 px-2.5 rounded-lg border-2 border-input bg-background text-sm focus:border-primary focus:outline-none"
            />
          </div>
          {/* Shape */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Shape</p>
            <select value={newShape} onChange={(e) => { setNewShape(e.target.value); setNewProfile(""); }}
              className="w-full h-9 px-2 rounded-lg border-2 border-input bg-background text-sm focus:border-primary focus:outline-none">
              <option value="">Shape (optional)…</option>
              {MAT_SHAPES.map((s) => <option key={s.value} value={s.value}>{s.icon} {s.label}</option>)}
            </select>
          </div>
          {/* Profile / size */}
          <div>
            {newShape && (
              <p className="text-[10px] text-muted-foreground mb-1">{sizeInputLabel(newShape)}</p>
            )}
            <div className="flex gap-2">
              <input
                value={newProfile}
                onChange={(e) => setNewProfile(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveOne()}
                placeholder={newShape ? sizeInputLabel(newShape).split(" — ")[1] ?? "value" : "Size / dimensions (optional)"}
                className="flex-1 h-9 px-2.5 rounded-lg border-2 border-input bg-background text-sm focus:border-primary focus:outline-none"
              />
              <Button size="sm" className="h-9 px-4 text-xs font-bold" disabled={!newGrade.trim() || saving} onClick={saveOne}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Grade, name and shape stay filled after adding — quickly add all your sizes.
          </p>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" className="h-8 text-xs"
              onClick={() => { setAdding(false); setNewGrade(""); setNewDisplayName(""); setNewShape(""); setNewProfile(""); }}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <Button className="w-full h-10 font-bold" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add material
        </Button>
      )}

      {/* Groups list below the form — new cards appear here, right below where user is looking */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : groups.length === 0 && !adding ? (
        <div className="text-center py-10 text-muted-foreground">
          <FlaskConical className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-semibold">No materials yet</p>
          <p className="text-xs mt-0.5">e.g. S235 rod → add Ø30, Ø50, Ø100 as separate sizes</p>
        </div>
      ) : groups.length > 0 ? (
        <div className="space-y-2">
          {groups.map((g) => (
            <MaterialGradeGroup
              key={`${g.grade}\0${g.shape ?? ""}`}
              grade={g.grade}
              shape={g.shape}
              items={g.items}
              onRefresh={refresh}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface Material {
  id: number;
  name: string;
  category: string | null;
  unit: string | null;
  minStock: number;
  bufferStock: number;
  targetStock: number;
  totalStock: number;
}

interface ImportRow {
  name: string;
  category: string;
  unit: string;
  buffer_stock: number;
  target_stock: number;
  _valid: boolean;
  _error: string;
}

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || "Request failed");
  }
  return res.json();
}

function downloadTemplate() {
  const rows = [
    "name,category,unit,buffer_stock,target_stock",
    "# ── Available categories ─────────────────────────────────────────────────────",
    "# Fasteners | Hydraulics | Electrical | Welding Supplies | CNC Parts",
    "# Raw Materials | Pneumatics | Bearings & Seals | Hardware | Consumables | Other",
    "# ─────────────────────────────────────────────────────────────────────────────",
    "M8 x 20mm Hex Bolt,Fasteners,pcs,200,1000",
    "M10 x 30mm Hex Bolt,Fasteners,pcs,100,500",
    "40mm Steel Rod,Raw Materials,mm,0,0",
    "3mm Mild Steel Sheet,Raw Materials,pcs,5,20",
    "Hydraulic Cylinder 50mm,Hydraulics,pcs,2,10",
    "10mm Hydraulic Hose,Hydraulics,m,5,30",
    "24V Solenoid Valve,Electrical,pcs,3,15",
    "Control Panel Switch,Electrical,pcs,10,50",
    "MIG Welding Wire 1mm,Welding Supplies,kg,10,50",
    "Grinding Disc 125mm,Welding Supplies,pcs,20,100",
    "CNC Insert CCMT 09,CNC Parts,pcs,50,200",
    "End Mill 8mm,CNC Parts,pcs,10,50",
    "5mm x 6mm Pneumatic Tube,Pneumatics,m,10,50",
    "Festo Solenoid Valve,Pneumatics,pcs,5,20",
    "6205 Ball Bearing,Bearings & Seals,pcs,10,50",
    "30x47x7 Oil Seal,Bearings & Seals,pcs,10,50",
    "M6 T-Slot Nut,Hardware,pcs,50,200",
    "Safety Glasses,Consumables,pcs,20,50",
  ];
  const csv = rows.filter((r) => !r.startsWith("#")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "materials_import_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function parseExcel(file: File): Promise<ImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

        const rows: ImportRow[] = raw.map((r) => {
          const name = String(r["name"] ?? "").trim();
          const category = String(r["category"] ?? "").trim();
          const unit = String(r["unit"] ?? "").trim();
          const bufRaw = String(r["buffer_stock"] ?? "0").trim();
          const tgtRaw = String(r["target_stock"] ?? "0").trim();
          const errors: string[] = [];

          if (!name) errors.push("name is required");
          const buffer_stock = parseInt(bufRaw) || 0;
          const target_stock = parseInt(tgtRaw) || 0;
          if (buffer_stock < 0) errors.push("buffer_stock must be ≥ 0");
          if (target_stock < 0) errors.push("target_stock must be ≥ 0");

          return {
            name,
            category,
            unit,
            buffer_stock,
            target_stock,
            _valid: errors.length === 0,
            _error: errors.join("; "),
          };
        });

        resolve(rows);
      } catch {
        reject(new Error("Could not read file — make sure it's a valid .xlsx or .csv"));
      }
    };
    reader.onerror = () => reject(new Error("File read error"));
    reader.readAsArrayBuffer(file);
  });
}

function MaterialCard({
  material: m, isAdmin, onDelete, onUpdateMinStock,
}: {
  material: Material;
  isAdmin: boolean;
  onDelete: () => void;
  onUpdateMinStock: (v: number) => void;
}) {
  const { t } = useLang();
  const [editingMin, setEditingMin] = useState(false);
  const [minDraft, setMinDraft] = useState(String(m.minStock));

  const isLow = m.minStock > 0 && m.totalStock < m.minStock;
  const isOut = m.totalStock === 0;

  function saveMin() {
    const val = parseInt(minDraft);
    if (!isNaN(val) && val >= 0 && val !== m.minStock) onUpdateMinStock(val);
    setEditingMin(false);
  }

  return (
    <div className={`bg-card border-2 rounded-xl px-4 py-3 ${isOut ? "border-red-300" : isLow ? "border-orange-300" : "border-border"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-bold text-sm truncate">{m.name}</p>
            {isOut && (
              <span className="flex items-center gap-0.5 text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 rounded-full px-2 py-0.5 flex-shrink-0">
                <AlertTriangle className="h-3 w-3" /> {t("materialsOutOfStock")}
              </span>
            )}
            {!isOut && isLow && (
              <span className="flex items-center gap-0.5 text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5 flex-shrink-0">
                <TrendingDown className="h-3 w-3" /> {t("materialsLowStockBadge")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {m.category && (
              <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">
                {m.category}
              </span>
            )}
            {m.unit && (
              <span className="text-[10px] font-semibold bg-muted text-muted-foreground rounded-full px-2 py-0.5">
                {m.unit}
              </span>
            )}
            <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${isOut ? "bg-red-50 text-red-600" : isLow ? "bg-orange-50 text-orange-600" : "bg-green-50 text-green-700"}`}>
              {m.totalStock} in stock
            </span>
            {/* Min stock display / edit */}
            {isAdmin && editingMin ? (
              <span className="flex items-center gap-1">
                <span className="text-[10px] font-semibold text-muted-foreground">min:</span>
                <input
                  type="number"
                  min={0}
                  value={minDraft}
                  onChange={(e) => setMinDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveMin(); if (e.key === "Escape") setEditingMin(false); }}
                  className="w-14 text-xs border border-border rounded px-1 py-0.5 outline-none focus:border-primary"
                  autoFocus
                />
                <button onClick={saveMin} className="text-green-600 hover:text-green-700"><Check className="h-3 w-3" /></button>
                <button onClick={() => setEditingMin(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
              </span>
            ) : (
              <button
                onClick={() => isAdmin && (setMinDraft(String(m.minStock)), setEditingMin(true))}
                className={`flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 ${isAdmin ? "hover:bg-muted/60 cursor-pointer" : "cursor-default"} bg-muted text-muted-foreground`}
              >
                min: {m.minStock}
                {isAdmin && <Pencil className="h-2.5 w-2.5" />}
              </button>
            )}
          </div>
        </div>
        {isAdmin && (
          <button onClick={onDelete} className="text-muted-foreground hover:text-destructive p-1 rounded flex-shrink-0">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function MaterialsPage() {
  const { user } = useAuth();
  const { t } = useLang();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<"consumables" | "raw">("consumables");
  const [search, setSearch] = useState("");
  const [addingName, setAddingName] = useState("");
  const [addingCategory, setAddingCategory] = useState("");
  const [addingUnit, setAddingUnit] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  // Import state
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [showImportPreview, setShowImportPreview] = useState(false);

  const { data: materials = [], isLoading } = useQuery<Material[]>({
    queryKey: ["/api/work/materials"],
    queryFn: () => apiFetch("/api/work/materials"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/work/materials"] });

  const addMutation = useMutation({
    mutationFn: (data: { name: string; category: string; unit: string }) =>
      apiFetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          category: data.category || "Materials",
          unit: data.unit || null,
          itemType: "purchased_part",
          bufferStock: 0,
          targetStock: 0,
        }),
      }),
    onSuccess: () => {
      invalidate();
      setShowAdd(false);
      setAddingName("");
      setAddingCategory("");
      setAddingUnit("");
      toast({ title: "Material added" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/products/${id}`, { method: "DELETE", credentials: "include" }).then(() => {}),
    onSuccess: () => { invalidate(); toast({ title: "Material deleted" }); },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const updateMinStockMutation = useMutation({
    mutationFn: ({ id, minStock }: { id: number; minStock: number }) =>
      apiFetch(`/api/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minStock }),
      }),
    onSuccess: () => { invalidate(); toast({ title: "Min stock updated" }); },
    onError: () => toast({ title: "Failed to update min stock", variant: "destructive" }),
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const rows = await parseExcel(file);
      if (rows.length === 0) { toast({ title: "No rows found in file", variant: "destructive" }); return; }
      setImportRows(rows);
      setShowImportPreview(true);
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : "Failed to read file", variant: "destructive" });
    }
  }

  async function runImport() {
    if (!importRows) return;
    const valid = importRows.filter((r) => r._valid);
    if (valid.length === 0) { toast({ title: "No valid rows to import", variant: "destructive" }); return; }
    setImporting(true);
    let success = 0;
    let failed = 0;
    for (const row of valid) {
      try {
        await apiFetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: row.name,
            category: row.category || "Materials",
            unit: row.unit || null,
            itemType: "purchased_part",
            bufferStock: row.buffer_stock,
            targetStock: row.target_stock,
          }),
        });
        success++;
      } catch {
        failed++;
      }
    }
    setImporting(false);
    setShowImportPreview(false);
    setImportRows(null);
    invalidate();
    toast({
      title: `Imported ${success} material${success !== 1 ? "s" : ""}${failed > 0 ? ` (${failed} failed)` : ""}`,
      variant: failed > 0 && success === 0 ? "destructive" : "default",
    });
  }

  const filtered = materials.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    (m.category ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const validCount = importRows?.filter((r) => r._valid).length ?? 0;
  const invalidCount = importRows?.filter((r) => !r._valid).length ?? 0;

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-black">{t("materialsTitle")}</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{t("materialsSubtitle")}</p>
        </div>
        {isAdmin && tab === "consumables" && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={downloadTemplate}>
              <Download className="h-3.5 w-3.5" /> {t("productsTemplate")}
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> {t("import")}
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
            <Button size="sm" className="gap-1 text-xs font-bold" onClick={() => setShowAdd(true)}>
              <Plus className="h-3.5 w-3.5" /> {t("add")}
            </Button>
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl">
        {(["consumables", "raw"] as const).map((t_) => (
          <button
            key={t_}
            onClick={() => setTab(t_)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              tab === t_ ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t_ === "consumables" ? "Consumables" : "Raw Materials"}
          </button>
        ))}
      </div>

      {tab === "raw" && <RawMaterialsTab />}

      {tab === "consumables" && <>
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("materialsSearchPlaceholder")}
          className="pl-9 h-10 border-2"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Inline add form */}
      {showAdd && (
        <div className="rounded-xl border-2 border-dashed border-primary/40 p-4 space-y-3 bg-primary/5">
          <p className="text-sm font-bold">{t("materialsNewMaterial")}</p>
          <Input
            value={addingName}
            onChange={(e) => setAddingName(e.target.value)}
            placeholder="Name — e.g. 40mm Steel Rod"
            className="h-9 border-2"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && addingName.trim()) addMutation.mutate({ name: addingName.trim(), category: addingCategory, unit: addingUnit }); }}
          />
          <div className="flex gap-2">
            <Input
              value={addingCategory}
              onChange={(e) => setAddingCategory(e.target.value)}
              placeholder="Category — e.g. Raw Metal"
              className="h-9 border-2"
            />
            <Input
              value={addingUnit}
              onChange={(e) => setAddingUnit(e.target.value)}
              placeholder="Unit — e.g. mm / pcs"
              className="h-9 border-2 w-32"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-9 font-bold"
              disabled={!addingName.trim() || addMutation.isPending}
              onClick={() => addMutation.mutate({ name: addingName.trim(), category: addingCategory, unit: addingUnit })}>
              {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("save")}
            </Button>
            <Button size="sm" variant="outline" className="h-9"
              onClick={() => { setShowAdd(false); setAddingName(""); setAddingCategory(""); setAddingUnit(""); }}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}

      {/* Import preview */}
      {showImportPreview && importRows && (
        <div className="rounded-xl border-2 border-blue-300 bg-blue-50/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-sm">Import Preview — {importRows.length} row{importRows.length !== 1 ? "s" : ""}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="text-green-700 font-semibold">{validCount} valid</span>
                {invalidCount > 0 && <span className="text-red-600 font-semibold ml-2">{invalidCount} invalid (will be skipped)</span>}
              </p>
            </div>
            <button onClick={() => { setShowImportPreview(false); setImportRows(null); }} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
            {importRows.map((row, i) => (
              <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${row._valid ? "bg-white border border-green-200" : "bg-red-50 border border-red-200"}`}>
                {row._valid
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                  : <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <span className="font-semibold">{row.name || "(blank)"}</span>
                  {row.category && <span className="text-muted-foreground ml-1.5">· {row.category}</span>}
                  {row.unit && <span className="text-muted-foreground ml-1.5">· {row.unit}</span>}
                  {!row._valid && <p className="text-red-600 mt-0.5">{row._error}</p>}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button size="sm" className="h-9 font-bold" disabled={validCount === 0 || importing} onClick={runImport}>
              {importing ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> {t("creating")}</> : `${t("import")} ${validCount} material${validCount !== 1 ? "s" : ""}`}
            </Button>
            <Button size="sm" variant="outline" className="h-9" disabled={importing}
              onClick={() => { setShowImportPreview(false); setImportRows(null); }}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 px-4 bg-muted/30 rounded-xl border border-dashed">
          <PackageOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="font-semibold">{search ? "No materials match your search" : t("materialsNoMaterials")}</p>
          {!search && isAdmin && (
            <p className="text-sm text-muted-foreground mt-1">
              {t("materialsNoMaterialsDesc")}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider px-1">
            {filtered.length} material{filtered.length !== 1 ? "s" : ""}
          </p>
          {filtered.map((m) => (
            <MaterialCard
              key={m.id}
              material={m}
              isAdmin={isAdmin}
              onDelete={() => deleteMutation.mutate(m.id)}
              onUpdateMinStock={(minStock) => updateMinStockMutation.mutate({ id: m.id, minStock })}
            />
          ))}
        </div>
      )}
      </>}
    </div>
  );
}
