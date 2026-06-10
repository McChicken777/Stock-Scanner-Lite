import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLang } from "@/contexts/lang";
import * as XLSX from "xlsx";
import { Plus, Upload, Download, Search, Trash2, Loader2, PackageOpen, X, CheckCircle2, AlertTriangle, TrendingDown, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";

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
        {isAdmin && (
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
    </div>
  );
}
