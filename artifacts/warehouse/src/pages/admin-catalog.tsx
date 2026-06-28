import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLang } from "@/contexts/lang";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Check, X, ChevronRight, BookOpen, Tag, Upload, TrendingUp } from "lucide-react";

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
  if (res.status === 204) return null;
  return res.json();
}

interface CatalogCategory {
  id: number;
  name: string;
  parentId: number | null;
  sortOrder: number;
}

interface CatalogItem {
  id: number;
  name: string;
  description: string | null;
  unitPrice: number | null;
  categoryId: number | null;
  sortOrder: number;
}

const T = {
  en: {
    title: "Sales Catalog",
    subtitle: "Manage sellable items shown in the quote builder.",
    categories: "Categories",
    items: "Items",
    addCategory: "Add category",
    addSubcategory: "Add subcategory",
    addItem: "Add item",
    allItems: "All items",
    uncategorised: "Uncategorised",
    noCategories: "No categories yet — create one to organise your catalog.",
    noItems: "No items in this category.",
    name: "Name",
    price: "Unit price",
    desc: "Description (optional)",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    deleteConfirm: "Are you sure?",
  },
  sl: {
    title: "Prodajni katalog",
    subtitle: "Upravljajte prodajne artikle, ki se prikažejo pri ustvarjanju ponudb.",
    categories: "Kategorije",
    items: "Artikli",
    addCategory: "Dodaj kategorijo",
    addSubcategory: "Dodaj podkategorijo",
    addItem: "Dodaj artikel",
    allItems: "Vsi artikli",
    uncategorised: "Nekategorizirano",
    noCategories: "Še ni kategorij — ustvarite eno za organizacijo kataloga.",
    noItems: "V tej kategoriji ni artiklov.",
    name: "Naziv",
    price: "Cena (enota)",
    desc: "Opis (neobvezno)",
    save: "Shrani",
    cancel: "Prekliči",
    delete: "Izbriši",
    deleteConfirm: "Ste prepričani?",
  },
};

// ─── CSV helpers ──────────────────────────────────────────────────────────────

type ColRole = "name" | "description" | "price" | "ignore";

function parseEuropeanPrice(raw: string): number | null {
  const s = raw.trim().replace(/[^\d,.-]/g, "");
  if (!s) return null;
  const hasCommaAndDot = s.includes(",") && s.includes(".");
  const normalized = hasCommaAndDot
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(",", ".");
  const n = parseFloat(normalized);
  return isNaN(n) ? null : n;
}

function parseCsvText(text: string): { headers: string[]; rawRows: string[][] } {
  const delimiter = text.includes(";") ? ";" : ",";
  const allRows = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(delimiter).map((cell) => cell.trim().replace(/^["']|["']$/g, "")));
  if (allRows.length === 0) return { headers: [], rawRows: [] };
  const firstCell = allRows[0][0] ?? "";
  const looksLikeHeader = isNaN(parseFloat(firstCell.replace(",", "."))) || /^[a-zA-Z]/.test(firstCell);
  if (looksLikeHeader) {
    return { headers: allRows[0], rawRows: allRows.slice(1) };
  }
  return {
    headers: allRows[0].map((_, i) => `Column ${String.fromCharCode(65 + i)}`),
    rawRows: allRows,
  };
}

function autoAssignColMap(headers: string[], sampleRows: string[][]): ColRole[] {
  const nameAliases = ["name", "naziv", "item", "artikel", "product", "ime"];
  const descAliases = ["description", "opis", "desc", "details"];
  const priceAliases = ["price", "cena", "unit_price", "unitprice", "unit price", "preis", "precio"];

  const n = headers.length;
  const colMap: ColRole[] = new Array(n).fill("ignore") as ColRole[];

  headers.forEach((h, i) => {
    const lower = h.toLowerCase().trim();
    if (nameAliases.includes(lower)) colMap[i] = "name";
    else if (descAliases.includes(lower)) colMap[i] = "description";
    else if (priceAliases.includes(lower)) colMap[i] = "price";
  });

  if (!colMap.includes("price") || !colMap.includes("name")) {
    for (let col = 0; col < n; col++) {
      if (colMap[col] !== "ignore") continue;
      const values = sampleRows.map((r) => r[col] ?? "").filter((v) => v.length > 0);
      if (values.length === 0) continue;
      const numericCount = values.filter((v) => parseEuropeanPrice(v) !== null).length;
      if (numericCount / values.length >= 0.8 && !colMap.includes("price")) {
        colMap[col] = "price";
      }
    }
    if (!colMap.includes("name")) {
      let bestCol = -1;
      let bestAvg = -1;
      for (let col = 0; col < n; col++) {
        if (colMap[col] !== "ignore") continue;
        const values = sampleRows.map((r) => r[col] ?? "").filter((v) => v.length > 0);
        const avg = values.reduce((s, v) => s + v.length, 0) / (values.length || 1);
        if (avg > bestAvg) { bestAvg = avg; bestCol = col; }
      }
      if (bestCol >= 0) colMap[bestCol] = "name";
    }
  }

  return colMap;
}

// ─── Inline edit forms ────────────────────────────────────────────────────────

function InlineItemForm({
  initial,
  categories,
  onSave,
  onCancel,
  L,
}: {
  initial?: Partial<CatalogItem>;
  categories: CatalogCategory[];
  onSave: (data: { name: string; description: string | null; unitPrice: number | null; categoryId: number | null }) => void;
  onCancel: () => void;
  L: typeof T["en"];
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [price, setPrice] = useState(initial?.unitPrice != null ? String(initial.unitPrice) : "");
  const [catId, setCatId] = useState<number | null>(initial?.categoryId ?? null);

  return (
    <div className="space-y-2 p-3 bg-muted/30 rounded-lg border">
      <Input placeholder={L.name} value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" autoFocus />
      <Input placeholder={L.desc} value={desc} onChange={(e) => setDesc(e.target.value)} className="h-8 text-sm" />
      <div className="flex gap-2">
        <Input placeholder={L.price} type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="h-8 text-sm flex-1" />
        <select
          value={catId ?? ""}
          onChange={(e) => setCatId(e.target.value ? Number(e.target.value) : null)}
          className="h-8 text-sm border rounded-md px-2 flex-1 bg-background"
        >
          <option value="">— no category —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.parentId ? "  ↳ " : ""}{c.name}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="gap-1.5" onClick={() => onSave({ name: name.trim(), description: desc.trim() || null, unitPrice: price ? Number(price) : null, categoryId: catId })}>
          <Check className="h-3.5 w-3.5" /> {L.save}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}><X className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

function InlineCategoryForm({
  initial,
  onSave,
  onCancel,
  L,
}: {
  initial?: { name: string };
  onSave: (name: string) => void;
  onCancel: () => void;
  L: typeof T["en"];
}) {
  const [name, setName] = useState(initial?.name ?? "");
  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder={L.name} value={name} onChange={(e) => setName(e.target.value)}
        className="h-8 text-sm flex-1" autoFocus
        onKeyDown={(e) => { if (e.key === "Enter") onSave(name.trim()); if (e.key === "Escape") onCancel(); }}
      />
      <button onClick={() => onSave(name.trim())} className="p-1.5 rounded hover:bg-green-100 text-green-700"><Check className="h-4 w-4" /></button>
      <button onClick={onCancel} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
    </div>
  );
}

// ─── CSV Mapper Panel ─────────────────────────────────────────────────────────

function CsvMapperPanel({
  preview,
  onChangeColMap,
  onImport,
  onCancel,
  isImporting,
}: {
  preview: { rawRows: string[][]; headers: string[]; colMap: ColRole[] };
  onChangeColMap: (idx: number, role: ColRole) => void;
  onImport: () => void;
  onCancel: () => void;
  isImporting: boolean;
}) {
  const { rawRows, headers, colMap } = preview;
  const sampleRows = rawRows.slice(0, 5);
  const validRowCount = rawRows.filter((r) => {
    const nameIdx = colMap.indexOf("name");
    return nameIdx >= 0 && (r[nameIdx] ?? "").trim().length > 0;
  }).length;

  const roleLabel: Record<ColRole, string> = {
    name: "Name",
    description: "Description",
    price: "Price",
    ignore: "— ignore —",
  };

  return (
    <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Map CSV columns</p>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>

      {/* Column role selectors */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="pb-1.5 pr-2 text-left font-normal text-muted-foreground min-w-[110px]">
                  <div className="text-[10px] truncate mb-1">{h}</div>
                  <select
                    value={colMap[i]}
                    onChange={(e) => onChangeColMap(i, e.target.value as ColRole)}
                    className="w-full h-7 border rounded px-1 bg-background text-xs font-semibold"
                  >
                    {(["name", "description", "price", "ignore"] as ColRole[]).map((r) => (
                      <option key={r} value={r}>{roleLabel[r]}</option>
                    ))}
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sampleRows.map((row, ri) => (
              <tr key={ri} className="border-t border-border/50">
                {headers.map((_, ci) => (
                  <td key={ci} className={`py-1 pr-2 truncate max-w-[140px] ${colMap[ci] === "ignore" ? "text-muted-foreground/50" : "text-foreground"}`}>
                    {row[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
            {rawRows.length > 5 && (
              <tr>
                <td colSpan={headers.length} className="pt-1 text-[10px] text-muted-foreground italic">
                  … and {rawRows.length - 5} more rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" onClick={onImport} disabled={isImporting || validRowCount === 0} className="gap-1.5">
          <Upload className="h-3.5 w-3.5" /> Import {validRowCount} row{validRowCount !== 1 ? "s" : ""}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>{`Cancel`}</Button>
        {!colMap.includes("name") && (
          <p className="text-[11px] text-amber-600 ml-2">Assign at least one column as "Name"</p>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminCatalogPage() {
  const { lang } = useLang();
  const L = T[lang === "sl" ? "sl" : "en"];
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: categories = [], isLoading: catsLoading } = useQuery<CatalogCategory[]>({
    queryKey: ["/api/catalog/categories"],
    queryFn: () => apiFetch("/api/catalog/categories"),
  });

  const { data: allItems = [], isLoading: itemsLoading } = useQuery<CatalogItem[]>({
    queryKey: ["/api/catalog/items"],
    queryFn: () => apiFetch("/api/catalog/items"),
  });

  const { data: company } = useQuery<{ currency: string }>({
    queryKey: ["/api/company"],
    queryFn: () => fetch("/api/company", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
  });
  const currency = company?.currency ?? "EUR";

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null | "all">("all");
  const [addingCategory, setAddingCategory] = useState(false);
  const [addingSubOf, setAddingSubOf] = useState<number | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);

  // CSV mapper state
  const [csvPreview, setCsvPreview] = useState<{
    rawRows: string[][];
    headers: string[];
    colMap: ColRole[];
  } | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);

  // Bulk actions state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [priceAdjustPct, setPriceAdjustPct] = useState("10");

  // Clear selection when switching categories
  useEffect(() => {
    setSelectedIds(new Set());
    setCsvPreview(null);
  }, [selectedCategoryId]);

  // ── Category mutations ──────────────────────────────────────────────────────

  const createCategory = useMutation({
    mutationFn: (body: { name: string; parentId?: number | null }) =>
      apiFetch("/api/catalog/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/catalog/categories"] }); setAddingCategory(false); setAddingSubOf(null); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateCategory = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      apiFetch(`/api/catalog/categories/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/catalog/categories"] }); setEditingCategoryId(null); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteCategory = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/catalog/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/catalog/categories"] }); queryClient.invalidateQueries({ queryKey: ["/api/catalog/items"] }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  // ── Item mutations ──────────────────────────────────────────────────────────

  const createItem = useMutation({
    mutationFn: (body: { name: string; description: string | null; unitPrice: number | null; categoryId: number | null }) =>
      apiFetch("/api/catalog/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/catalog/items"] }); setAddingItem(false); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateItem = useMutation({
    mutationFn: ({ id, ...body }: { id: number; name: string; description: string | null; unitPrice: number | null; categoryId: number | null }) =>
      apiFetch(`/api/catalog/items/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/catalog/items"] }); setEditingItemId(null); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteItem = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/catalog/items/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/catalog/items"] }),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  // ── CSV handlers ────────────────────────────────────────────────────────────

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rawRows } = parseCsvText(text);
      if (rawRows.length === 0) { toast({ title: "CSV has no data rows", variant: "destructive" }); return; }
      const colMap = autoAssignColMap(headers, rawRows.slice(0, 10));
      setCsvPreview({ rawRows, headers, colMap });
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleCsvImport = async () => {
    if (!csvPreview) return;
    const { rawRows, colMap } = csvPreview;
    const nameIdx = colMap.indexOf("name");
    const descIdx = colMap.indexOf("description");
    const priceIdx = colMap.indexOf("price");

    const items = rawRows
      .map((row) => ({
        name: (nameIdx >= 0 ? row[nameIdx] ?? "" : "").trim(),
        description: descIdx >= 0 ? (row[descIdx]?.trim() || null) : null,
        unitPrice: priceIdx >= 0 ? parseEuropeanPrice(row[priceIdx] ?? "") : null,
      }))
      .filter((item) => item.name.length > 0);

    if (items.length === 0) { toast({ title: "No valid rows to import", variant: "destructive" }); return; }

    setCsvImporting(true);
    try {
      const result = await apiFetch("/api/catalog/items/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: selectedCategoryId === "all" ? null : selectedCategoryId,
          items,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/items"] });
      setCsvPreview(null);
      toast({ title: `Imported ${result.imported} item${result.imported !== 1 ? "s" : ""}` });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Import failed", variant: "destructive" });
    } finally {
      setCsvImporting(false);
    }
  };

  // ── Bulk action handlers ────────────────────────────────────────────────────

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.size} item${selectedIds.size !== 1 ? "s" : ""}?`)) return;
    const ids = [...selectedIds];
    try {
      await Promise.all(ids.map((id) => apiFetch(`/api/catalog/items/${id}`, { method: "DELETE" })));
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/items"] });
      setSelectedIds(new Set());
      toast({ title: `Deleted ${ids.length} item${ids.length !== 1 ? "s" : ""}` });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Delete failed", variant: "destructive" });
    }
  };

  const handlePriceAdjust = async () => {
    const pct = Number(priceAdjustPct);
    if (isNaN(pct) || pct === 0) return;
    const targets = filteredItems.filter((i) => selectedIds.has(i.id) && i.unitPrice != null);
    if (targets.length === 0) { toast({ title: "No selected items have a price set" }); return; }
    try {
      await Promise.all(
        targets.map((item) =>
          apiFetch(`/api/catalog/items/${item.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ unitPrice: +(item.unitPrice! * (1 + pct / 100)).toFixed(2) }),
          })
        )
      );
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/items"] });
      setSelectedIds(new Set());
      toast({ title: `Price adjusted ${pct > 0 ? "+" : ""}${pct}% on ${targets.length} item${targets.length !== 1 ? "s" : ""}` });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Price adjust failed", variant: "destructive" });
    }
  };

  // ── Derived data ────────────────────────────────────────────────────────────

  const topCategories = categories.filter((c) => c.parentId == null);
  const subOf = (parentId: number) => categories.filter((c) => c.parentId === parentId);

  const filteredItems = selectedCategoryId === "all"
    ? allItems
    : allItems.filter((i) => i.categoryId === selectedCategoryId);

  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every((i) => selectedIds.has(i.id));
  const toggleSelectAll = () => {
    setSelectedIds(allFilteredSelected ? new Set() : new Set(filteredItems.map((i) => i.id)));
  };
  const toggleSelectItem = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const fmt = (price: number | null) =>
    price != null
      ? new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price)
      : "—";

  return (
    <div className="flex flex-col gap-4 p-4 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="h-6 w-6" />{L.title}</h1>
        <p className="text-sm text-muted-foreground">{L.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
        {/* ── Left: Category tree ────────────────────────────────────────── */}
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1 pb-1">{L.categories}</p>

          <button
            onClick={() => setSelectedCategoryId("all")}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${selectedCategoryId === "all" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
          >
            <Tag className="h-4 w-4 flex-shrink-0" />
            {L.allItems}
            <span className="ml-auto text-xs font-normal text-muted-foreground">{allItems.length}</span>
          </button>

          {catsLoading ? (
            <div className="space-y-1">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 rounded-lg" />)}</div>
          ) : (
            <>
              {topCategories.map((cat) => (
                <div key={cat.id}>
                  <div className={`flex items-center gap-1 rounded-lg transition-colors ${selectedCategoryId === cat.id ? "bg-primary/10" : "hover:bg-muted"}`}>
                    {editingCategoryId === cat.id ? (
                      <div className="flex-1 p-1">
                        <InlineCategoryForm
                          initial={{ name: cat.name }}
                          onSave={(name) => name && updateCategory.mutate({ id: cat.id, name })}
                          onCancel={() => setEditingCategoryId(null)}
                          L={L}
                        />
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => setSelectedCategoryId(cat.id)}
                          className={`flex-1 flex items-center gap-2 px-3 py-2 text-sm font-semibold text-left ${selectedCategoryId === cat.id ? "text-primary" : "text-foreground"}`}
                        >
                          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{cat.name}</span>
                          <span className="ml-auto text-xs font-normal text-muted-foreground">
                            {allItems.filter((i) => i.categoryId === cat.id).length}
                          </span>
                        </button>
                        <button onClick={() => setEditingCategoryId(cat.id)} className="p-1.5 text-muted-foreground hover:text-foreground flex-shrink-0"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => deleteCategory.mutate(cat.id)} className="p-1.5 text-muted-foreground hover:text-destructive flex-shrink-0 mr-1"><Trash2 className="h-3.5 w-3.5" /></button>
                      </>
                    )}
                  </div>

                  {/* Subcategories */}
                  {subOf(cat.id).map((sub) => (
                    <div key={sub.id} className={`ml-4 flex items-center gap-1 rounded-lg transition-colors ${selectedCategoryId === sub.id ? "bg-primary/10" : "hover:bg-muted"}`}>
                      {editingCategoryId === sub.id ? (
                        <div className="flex-1 p-1">
                          <InlineCategoryForm
                            initial={{ name: sub.name }}
                            onSave={(name) => name && updateCategory.mutate({ id: sub.id, name })}
                            onCancel={() => setEditingCategoryId(null)}
                            L={L}
                          />
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => setSelectedCategoryId(sub.id)}
                            className={`flex-1 flex items-center gap-2 px-3 py-1.5 text-sm text-left ${selectedCategoryId === sub.id ? "text-primary font-semibold" : "text-muted-foreground"}`}
                          >
                            <span className="truncate">{sub.name}</span>
                            <span className="ml-auto text-xs text-muted-foreground">
                              {allItems.filter((i) => i.categoryId === sub.id).length}
                            </span>
                          </button>
                          <button onClick={() => setEditingCategoryId(sub.id)} className="p-1.5 text-muted-foreground hover:text-foreground flex-shrink-0"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => deleteCategory.mutate(sub.id)} className="p-1.5 text-muted-foreground hover:text-destructive flex-shrink-0 mr-1"><Trash2 className="h-3.5 w-3.5" /></button>
                        </>
                      )}
                    </div>
                  ))}

                  {/* Add subcategory inline */}
                  {addingSubOf === cat.id ? (
                    <div className="ml-4 p-1">
                      <InlineCategoryForm
                        onSave={(name) => name && createCategory.mutate({ name, parentId: cat.id })}
                        onCancel={() => setAddingSubOf(null)}
                        L={L}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingSubOf(cat.id)}
                      className="ml-4 flex items-center gap-1.5 px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" /> {L.addSubcategory}
                    </button>
                  )}
                </div>
              ))}

              {addingCategory ? (
                <div className="p-1">
                  <InlineCategoryForm
                    onSave={(name) => name && createCategory.mutate({ name, parentId: null })}
                    onCancel={() => setAddingCategory(false)}
                    L={L}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setAddingCategory(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Plus className="h-4 w-4" /> {L.addCategory}
                </button>
              )}
            </>
          )}
        </div>

        {/* ── Right: Items panel ─────────────────────────────────────────── */}
        <div className="space-y-2">
          {/* Panel header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {filteredItems.length > 0 && (
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-border cursor-pointer"
                  title="Select all"
                />
              )}
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{L.items}</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="cursor-pointer">
                <input type="file" accept=".csv,.txt" className="hidden" onChange={handleCsvUpload} />
                <Button type="button" size="sm" variant="outline" className="gap-1.5 pointer-events-none" tabIndex={-1} asChild>
                  <span><Upload className="h-3.5 w-3.5" /> Import CSV</span>
                </Button>
              </label>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddingItem(true)}>
                <Plus className="h-3.5 w-3.5" /> {L.addItem}
              </Button>
            </div>
          </div>

          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-primary/5 border-2 border-primary/20 rounded-lg">
              <span className="text-sm font-bold text-primary">{selectedIds.size} selected</span>
              <div className="flex items-center gap-1.5 ml-auto">
                <Input
                  type="number"
                  value={priceAdjustPct}
                  onChange={(e) => setPriceAdjustPct(e.target.value)}
                  className="w-16 h-7 text-sm text-center"
                  placeholder="%"
                />
                <span className="text-xs text-muted-foreground">%</span>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 px-2" onClick={handlePriceAdjust}>
                  <TrendingUp className="h-3 w-3" /> Adjust price
                </Button>
              </div>
              <Button size="sm" variant="destructive" className="h-7 text-xs gap-1 px-2" onClick={handleBulkDelete}>
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
              <button onClick={() => setSelectedIds(new Set())} className="text-muted-foreground hover:text-foreground ml-1">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* CSV mapper panel */}
          {csvPreview && (
            <CsvMapperPanel
              preview={csvPreview}
              onChangeColMap={(idx, role) =>
                setCsvPreview((prev) => prev ? { ...prev, colMap: prev.colMap.map((r, i) => i === idx ? role : r) } : null)
              }
              onImport={handleCsvImport}
              onCancel={() => setCsvPreview(null)}
              isImporting={csvImporting}
            />
          )}

          {addingItem && (
            <InlineItemForm
              initial={selectedCategoryId !== "all" ? { categoryId: selectedCategoryId } : undefined}
              categories={categories}
              onSave={(data) => createItem.mutate(data)}
              onCancel={() => setAddingItem(false)}
              L={L}
            />
          )}

          {itemsLoading ? (
            <div className="space-y-1">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Tag className="h-8 w-8 opacity-30 mx-auto mb-2" />
              <p className="text-sm">{L.noItems}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredItems.map((item) => (
                <div key={item.id}>
                  {editingItemId === item.id ? (
                    <InlineItemForm
                      initial={item}
                      categories={categories}
                      onSave={(data) => updateItem.mutate({ id: item.id, ...data })}
                      onCancel={() => setEditingItemId(null)}
                      L={L}
                    />
                  ) : (
                    <div className="flex items-center gap-2 px-2 py-2.5 rounded-lg border hover:bg-muted/40 transition-colors group">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelectItem(item.id)}
                        className="h-4 w-4 rounded border-border cursor-pointer flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{item.name}</p>
                        {item.description && <p className="text-xs text-muted-foreground truncate">{item.description}</p>}
                      </div>
                      <span className="text-sm font-mono text-muted-foreground flex-shrink-0">{fmt(item.unitPrice)}</span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button onClick={() => setEditingItemId(item.id)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => deleteItem.mutate(item.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
