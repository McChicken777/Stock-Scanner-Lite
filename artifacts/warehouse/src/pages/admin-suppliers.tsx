import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLang } from "@/contexts/lang";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Mail, Phone, Edit2, Package2, ChevronUp, Globe } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";

interface Supplier {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  orderMethod: string;
  storeUrl: string | null;
  storePlatform: string | null;
  language: string;
  companyId: number;
}

interface SupplierProductLink {
  id: number;
  productId: number;
  supplierSku: string | null;
  storeProductUrl: string | null;
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

// ─── Supplier Products Panel ───────────────────────────────────────────────────

function SupplierProductsPanel({ supplierId, supplierOrderMethod }: { supplierId: number; supplierOrderMethod: string; supplierStorePlatform: string | null }) {
  const { t } = useLang();
  const isWebStore = supplierOrderMethod === "web_store";

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
                        !isWebStore && link.supplierSku ? `SKU: ${link.supplierSku}` : null,
                        isWebStore && link.storeProductUrl ? "link set ✓" : null,
                        isWebStore && !link.storeProductUrl ? "no link" : null,
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
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", notes: "", orderMethod: "email", storeUrl: "", storePlatform: "", language: "en" });
  const [expandedSupplierId, setExpandedSupplierId] = useState<number | null>(null);

  const suppliersQuery = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
    queryFn: () => apiFetch("/api/suppliers"),
  });

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
      setFormData({ name: "", email: "", phone: "", notes: "", orderMethod: "email", storeUrl: "", storePlatform: "", language: "en" });
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
      setFormData({ name: "", email: "", phone: "", notes: "", orderMethod: "email", storeUrl: "", storePlatform: "", language: "en" });
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
      orderMethod: supplier.orderMethod || "email",
      storeUrl: supplier.storeUrl || "",
      storePlatform: supplier.storePlatform || "",
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
            setFormData({ name: "", email: "", phone: "", notes: "", orderMethod: "email", storeUrl: "", storePlatform: "", language: "en" });
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

          {/* Order email language */}
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

          {/* Order method */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("suppliersOrderingMethod")}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, orderMethod: "email" })}
                className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg border-2 text-sm font-semibold transition-colors ${formData.orderMethod === "email" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border text-muted-foreground hover:border-blue-300"}`}
              >
                <Mail className="h-3.5 w-3.5" /> {t("suppliersEmailOrder")}
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, orderMethod: "web_store" })}
                className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg border-2 text-sm font-semibold transition-colors ${formData.orderMethod === "web_store" ? "border-purple-500 bg-purple-50 text-purple-700" : "border-border text-muted-foreground hover:border-purple-300"}`}
              >
                <Globe className="h-3.5 w-3.5" /> {t("suppliersWebStore")}
              </button>
            </div>
          </div>

          {/* Web store fields */}
          {formData.orderMethod === "web_store" && (
            <div className="space-y-2 border-2 border-purple-200 bg-purple-50 rounded-lg p-3">
              <input
                type="url"
                placeholder="Store URL (e.g. https://mystore.myshopify.com)"
                value={formData.storeUrl}
                onChange={(e) => setFormData({ ...formData, storeUrl: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                disabled={createMutation.isPending || updateMutation.isPending}
              />
              <select
                value={formData.storePlatform}
                onChange={(e) => setFormData({ ...formData, storePlatform: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                <option value="">Select platform…</option>
                <option value="shopify">Shopify</option>
                <option value="woocommerce">WooCommerce</option>
                <option value="custom">Custom / Other</option>
              </select>
              <p className="text-[11px] text-purple-700">
                After selecting a platform, add the store product/variant ID for each linked product below.
              </p>
            </div>
          )}

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
                      {supplier.orderMethod === "web_store" ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5">
                          <Globe className="h-2.5 w-2.5" /> Web store
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2 py-0.5">
                          <Mail className="h-2.5 w-2.5" /> Email
                        </span>
                      )}
                    </div>
                    {supplier.email && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <Mail className="h-3 w-3" /> {supplier.email}
                      </div>
                    )}
                    {supplier.storeUrl && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <Globe className="h-3 w-3" />
                        <a href={supplier.storeUrl} target="_blank" rel="noopener noreferrer" className="underline truncate max-w-[200px]">
                          {supplier.storeUrl}
                        </a>
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
                      className="p-2 hover:bg-purple-50 rounded text-purple-600"
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

                {expanded && <SupplierProductsPanel supplierId={supplier.id} supplierOrderMethod={supplier.orderMethod || "email"} supplierStorePlatform={supplier.storePlatform} />}
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
