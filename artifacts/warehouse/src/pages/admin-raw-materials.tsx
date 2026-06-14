import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Check, X, Loader2, FlaskConical } from "lucide-react";

interface RawMaterial {
  id: number;
  name: string;
  unit: string;
  notes: string | null;
}

const UNIT_OPTIONS = ["kg", "m", "mm", "pcs", "L", "m²", "m³"];

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Request failed");
  return d;
}

function MaterialRow({
  mat,
  onSaved,
  onDeleted,
}: {
  mat: RawMaterial;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(mat.name);
  const [unit, setUnit] = useState(mat.unit);
  const [notes, setNotes] = useState(mat.notes ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/api/raw-materials/${mat.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), unit, notes: notes.trim() || undefined }),
      });
      onSaved();
      setEditing(false);
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteMat = async () => {
    if (!confirm(`Delete "${mat.name}"? Templates using it will lose the material link.`)) return;
    try {
      await apiFetch(`/api/raw-materials/${mat.id}`, { method: "DELETE" });
      onDeleted();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    }
  };

  if (editing) {
    return (
      <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3 space-y-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full h-9 px-2.5 rounded-lg border-2 border-input bg-background text-sm focus:border-primary focus:outline-none font-semibold"
          placeholder="Material name"
        />
        <div className="flex gap-2">
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="h-9 px-2 rounded-lg border-2 border-input bg-background text-sm focus:border-primary focus:outline-none"
          >
            {UNIT_OPTIONS.map((u) => <option key={u}>{u}</option>)}
          </select>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="flex-1 h-9 px-2.5 rounded-lg border-2 border-input bg-background text-sm focus:border-primary focus:outline-none"
            placeholder="Notes (optional)"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setEditing(false)}>
            <X className="h-3.5 w-3.5 mr-1" /> Cancel
          </Button>
          <Button size="sm" className="h-8 text-xs" disabled={!name.trim() || saving} onClick={save}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 border-border bg-card hover:border-border/60 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{mat.name}</p>
        {mat.notes && <p className="text-xs text-muted-foreground truncate">{mat.notes}</p>}
      </div>
      <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex-shrink-0">
        {mat.unit}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex-shrink-0 text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={deleteMat}
        className="flex-shrink-0 text-muted-foreground hover:text-destructive p-1 rounded-lg hover:bg-muted transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function AddMaterialForm({ onAdded }: { onAdded: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("kg");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await apiFetch("/api/raw-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), unit, notes: notes.trim() || undefined }),
      });
      setName("");
      setUnit("kg");
      setNotes("");
      setOpen(false);
      onAdded();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="w-full h-11 font-bold">
        <Plus className="h-4 w-4 mr-2" /> Add material
      </Button>
    );
  }

  return (
    <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3 space-y-2">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">New material</p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        className="w-full h-9 px-2.5 rounded-lg border-2 border-input bg-background text-sm focus:border-primary focus:outline-none font-semibold"
        placeholder="e.g. S235 structural steel, 42CrMo4 rod, AL6082-T6…"
      />
      <div className="flex gap-2">
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="h-9 px-2 rounded-lg border-2 border-input bg-background text-sm focus:border-primary focus:outline-none"
        >
          {UNIT_OPTIONS.map((u) => <option key={u}>{u}</option>)}
        </select>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="flex-1 h-9 px-2.5 rounded-lg border-2 border-input bg-background text-sm focus:border-primary focus:outline-none"
          placeholder="Notes (optional)"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setOpen(false)}>
          <X className="h-3.5 w-3.5 mr-1" /> Cancel
        </Button>
        <Button size="sm" className="h-8 text-xs" disabled={!name.trim() || saving} onClick={save}>
          {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
          Add
        </Button>
      </div>
    </div>
  );
}

export default function AdminRawMaterialsPage() {
  const qc = useQueryClient();

  const { data: materials = [], isLoading } = useQuery<RawMaterial[]>({
    queryKey: ["/api/raw-materials"],
    queryFn: () => fetch("/api/raw-materials", { credentials: "include" }).then((r) => r.json()),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/raw-materials"] });

  return (
    <div className="p-4 space-y-5 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 pt-2">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
          <FlaskConical className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black">Raw Materials</h1>
          <p className="text-xs text-muted-foreground">
            Your material catalogue — used in the AI Template Wizard and job orders
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : materials.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <FlaskConical className="h-10 w-10 text-muted-foreground/30 mx-auto" />
          <p className="text-sm font-semibold text-muted-foreground">No materials yet</p>
          <p className="text-xs text-muted-foreground">
            Add the steel grades, profiles, and raw materials your workshop uses.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {materials.map((m) => (
            <MaterialRow key={m.id} mat={m} onSaved={refresh} onDeleted={refresh} />
          ))}
        </div>
      )}

      <AddMaterialForm onAdded={refresh} />
    </div>
  );
}
