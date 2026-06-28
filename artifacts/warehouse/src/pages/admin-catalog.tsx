import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLang } from "@/contexts/lang";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Check, X, ChevronRight, BookOpen, Tag } from "lucide-react";

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

// ─── Inline edit form ─────────────────────────────────────────────────────────

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
  parentId,
  onSave,
  onCancel,
  L,
}: {
  initial?: { name: string };
  parentId?: number | null;
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

  // ── Derived data ────────────────────────────────────────────────────────────

  const topCategories = categories.filter((c) => c.parentId == null);
  const subOf = (parentId: number) => categories.filter((c) => c.parentId === parentId);

  const filteredItems = selectedCategoryId === "all"
    ? allItems
    : allItems.filter((i) => i.categoryId === selectedCategoryId);

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
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{L.items}</p>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddingItem(true)}>
              <Plus className="h-3.5 w-3.5" /> {L.addItem}
            </Button>
          </div>

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
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border hover:bg-muted/40 transition-colors group">
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
