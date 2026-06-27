import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLang } from "@/contexts/lang";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Mail, Phone, Edit2, Package2, ChevronUp, Tag, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useRef } from "react";

interface Supplier {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  language: string;
  companyId: number;
}

interface SupplierProductLink {
  id: number;
  productId: number;
  supplierSku: string | null;
  productName: string;
  productCategory: string;
  productItemType: string;
  bufferStock: number;
  totalStock: number;
}

interface SupplierStats {
  ordersPlaced: number;
  quotesSent: number;
  quotesAccepted: number;
}

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
  return res.json();
}

async function apiFetchVoid(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
}

// ─── Supplier Categories Panel ────────────────────────────────────────────────

function SupplierCategoriesPanel({ supplierId, allCategories }: { supplierId: number; allCategories: string[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: categories = [], isLoading } = useQuery<string[]>({
    queryKey: [`/api/suppliers/${supplierId}/categories`],
    queryFn: () => apiFetch(`/api/suppliers/${supplierId}/categories`),
  });

  const addMutation = useMutation({
    mutationFn: (category: string) => apiFetch(`/api/suppliers/${supplierId}/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/suppliers/${supplierId}/categories`] });
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers/by-categories"] });
      setInput("");
    },
    onError: () => toast({ description: "Failed to add category", variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: (category: string) => apiFetchVoid(
      `/api/suppliers/${supplierId}/categories/${encodeURIComponent(category)}`,
      { method: "DELETE" }
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/suppliers/${supplierId}/categories`] });
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers/by-categories"] });
    },
    onError: () => toast({ description: "Failed to remove category", variant: "destructive" }),
  });

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      const cat = input.trim().replace(/,$/, "");
      if (cat && !categories.includes(cat)) addMutation.mutate(cat);
      else setInput("");
    }
  }

  const suggestions = allCategories.filter((c) => !categories.includes(c) && c.toLowerCase().includes(input.toLowerCase()));

  return (
    <div className="border-t pt-2 mt-1 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Tag className="h-3 w-3" /> Categories supplied
      </p>
      <p className="text-[10px] text-muted-foreground">Items in these categories will suggest this supplier for RFQs.</p>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <span key={cat} className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-semibold px-2 py-0.5">
              {cat}
              <button
                onClick={() => removeMutation.mutate(cat)}
                disabled={removeMutation.isPending}
                className="hover:text-red-600 ml-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {categories.length === 0 && (
            <p className="text-xs text-muted-foreground">No categories assigned yet.</p>
          )}
        </div>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          list={`cats-${supplierId}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add category (Enter to confirm)"
          className="w-full h-8 px-3 border-2 border-dashed rounded-lg text-xs focus:outline-none focus:border-blue-400"
          disabled={addMutation.isPending}
        />
        <datalist id={`cats-${supplierId}`}>
          {suggestions.map((c) => <option key={c} value={c} />)}
        </datalist>
      </div>
    </div>
  );
}

// ─── Supplier Products Panel ───────────────────────────────────────────────────

function SupplierProductsPanel({ supplierId }: { supplierId: number }) {
  const { t } = useLang();

  const { data: links = [], isLoading } = useQuery<SupplierProductLink[]>({
    queryKey: [`/api/suppliers/${supplierId}/products`],
    queryFn: () => apiFetch(`/api/suppliers/${supplierId}/products`),
  });

  const byCategory = links.reduce<Record<string, SupplierProductLink[]>>((acc, l) => {
    const cat = l.productCategory || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(l);
    return acc;
  }, {});

  return (
    <div className="border-t pt-2 mt-1 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Package2 className="h-3 w-3" /> {t("suppliersProductsSupplied")} ({links.length})
      </p>
      <p className="text-[10px] text-muted-foreground">Edit these on each product's page.</p>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">{t("loading")}</p>
      ) : links.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("suppliersNoProductsLinked")}</p>
      ) : (
        <div className="space-y-2">
          {Object.entries(byCategory).map(([cat, items]) => (
            <div key={cat} className="space-y-0.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{cat}</p>
              {items.map((link) => (
                <div key={link.id} className="flex items-center justify-between pl-2 py-0.5">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium truncate block">{link.productName}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {[
                        `${link.totalStock} in stock`,
                        link.supplierSku ? `SKU: ${link.supplierSku}` : null,
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminSuppliersPage() {
  const { toast } = useToast();
  const { t } = useLang();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", notes: "", language: "en" });
  const [expandedSupplierId, setExpandedSupplierId] = useState<number | null>(null);

  const suppliersQuery = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
    queryFn: () => apiFetch("/api/suppliers"),
  });

  const { data: products = [] } = useQuery<{ category: string }[]>({
    queryKey: ["/api/products"],
    queryFn: () => apiFetch("/api/products"),
    select: (data) => data,
  });
  const allCategories = [...new Set((products as { category: string }[]).map((p) => p.category).filter(Boolean))].sort();

  const { data: stats = {} } = useQuery<Record<number, SupplierStats>>({
    queryKey: ["/api/suppliers/stats"],
    queryFn: () => apiFetch("/api/suppliers/stats"),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => apiFetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      setFormData({ name: "", email: "", phone: "", notes: "", language: "en" });
      setShowForm(false);
      toast({ description: "Supplier created" });
    },
    onError: () => toast({ description: "Failed to create supplier", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => apiFetch(`/api/suppliers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      setEditing(null);
      setFormData({ name: "", email: "", phone: "", notes: "", language: "en" });
      toast({ description: "Supplier updated" });
    },
    onError: () => toast({ description: "Failed to update supplier", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetchVoid(`/api/suppliers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      toast({ description: "Supplier deleted" });
    },
    onError: () => toast({ description: "Failed to delete supplier", variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({ description: "Supplier name is required", variant: "destructive" });
      return;
    }
    if (editing) {
      updateMutation.mutate({ id: editing, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const startEdit = (supplier: Supplier) => {
    setEditing(supplier.id);
    setFormData({
      name: supplier.name,
      email: supplier.email || "",
      phone: supplier.phone || "",
      notes: supplier.notes || "",
      language: supplier.language || "en",
    });
    setShowForm(true);
  };

  return (
    <div className="flex flex-col gap-4 p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("navSuppliers")}</h1>
        <Button
          onClick={() => {
            setEditing(null);
            setFormData({ name: "", email: "", phone: "", notes: "", language: "en" });
            setShowForm(!showForm);
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" /> {t("suppliersAdd")}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 space-y-3">
          <input
            type="text"
            placeholder={t("suppliersNamePlaceholder")}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
            disabled={createMutation.isPending || updateMutation.isPending}
          />
          <input
            type="email"
            placeholder={t("fieldEmail")}
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
            disabled={createMutation.isPending || updateMutation.isPending}
          />
          <input
            type="tel"
            placeholder={t("fieldPhone")}
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
            disabled={createMutation.isPending || updateMutation.isPending}
          />
          <textarea
            placeholder={t("fieldNotes")}
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
            rows={2}
            disabled={createMutation.isPending || updateMutation.isPending}
          />

          <div className="space-y-1.5">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("suppliersEmailLang")}</p>
            <select
              value={formData.language}
              onChange={(e) => setFormData({ ...formData, language: e.target.value })}
              className="w-full h-9 px-2 rounded-lg border-2 border-input bg-background text-sm"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              <option value="en">English</option>
              <option value="sl">Slovenščina</option>
            </select>
            <p className="text-[11px] text-muted-foreground">{t("suppliersEmailLangHint")}</p>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
              {editing ? t("suppliersUpdate") : t("create")}
            </Button>
            <Button type="button" onClick={() => { setShowForm(false); setEditing(null); }} variant="outline">
              {t("cancel")}
            </Button>
          </div>
        </form>
      )}

      {suppliersQuery.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : suppliersQuery.data && suppliersQuery.data.length > 0 ? (
        <div className="space-y-2">
          {suppliersQuery.data.map((supplier) => {
            const expanded = expandedSupplierId === supplier.id;
            const s = stats[supplier.id];
            return (
              <div key={supplier.id} className="bg-white border-2 border-border rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm">{supplier.name}</p>
                      <span className="flex items-center gap-1 text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2 py-0.5">
                        <Mail className="h-2.5 w-2.5" /> Email
                      </span>
                    </div>
                    {supplier.email && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <Mail className="h-3 w-3" /> {supplier.email}
                      </div>
                    )}
                    {supplier.phone && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" /> {supplier.phone}
                      </div>
                    )}
                    {supplier.notes && (
                      <p className="text-xs text-muted-foreground mt-1">{supplier.notes}</p>
                    )}
                    {s && (s.ordersPlaced > 0 || s.quotesSent > 0) && (
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        {s.ordersPlaced > 0 && <span>{s.ordersPlaced} order{s.ordersPlaced !== 1 ? "s" : ""}</span>}
                        {s.ordersPlaced > 0 && s.quotesSent > 0 && <span> · </span>}
                        {s.quotesSent > 0 && <span>{s.quotesSent} quote{s.quotesSent !== 1 ? "s" : ""} sent</span>}
                        {s.quotesAccepted > 0 && <span> · {s.quotesAccepted} accepted</span>}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => setExpandedSupplierId(expanded ? null : supplier.id)}
                      className="p-2 hover:bg-blue-50 rounded text-blue-600"
                      title="View / manage supplied products"
                    >
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <Package2 className="h-4 w-4" />}
                    </button>
                    <button onClick={() => startEdit(supplier)} className="p-2 hover:bg-blue-100 rounded text-blue-600">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(supplier.id)}
                      disabled={deleteMutation.isPending}
                      className="p-2 hover:bg-red-100 rounded text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {expanded && (
                  <>
                    <SupplierCategoriesPanel supplierId={supplier.id} allCategories={allCategories} />
                    <SupplierProductsPanel supplierId={supplier.id} />
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <p>{t("suppliersNone")}</p>
        </div>
      )}
    </div>
  );
}
