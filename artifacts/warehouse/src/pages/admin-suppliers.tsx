import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, usePlan } from "@/contexts/auth";
import { useLang } from "@/contexts/lang";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Mail, Phone, Edit2, Package2, X, ChevronDown, ChevronUp, AlertTriangle, ShoppingCart, Lock, Globe } from "lucide-react";
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
  companyId: number;
}

interface SupplierProductLink {
  id: number;
  productId: number;
  supplierSku: string | null;
  unitPrice: number | null;
  storeProductId: string | null;
  productName: string;
  productCategory: string;
  productItemType: string;
  bufferStock: number;
  totalStock: number;
}

interface Product {
  id: number;
  name: string;
  category: string;
  itemType: string;
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

function SupplierProductsPanel({ supplierId, supplierOrderMethod }: { supplierId: number; supplierOrderMethod: string }) {
  const { toast } = useToast();
  const { t } = useLang();
  const { atLeast } = usePlan();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [addProductId, setAddProductId] = useState("");
  const [addSku, setAddSku] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [addStoreProductId, setAddStoreProductId] = useState("");

  const { data: links = [], isLoading } = useQuery<SupplierProductLink[]>({
    queryKey: [`/api/suppliers/${supplierId}/products`],
    queryFn: () => apiFetch(`/api/suppliers/${supplierId}/products`),
  });

  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: () => apiFetch("/api/products"),
    enabled: showAdd,
  });

  const linkedProductIds = new Set(links.map((l) => l.productId));
  const purchasedProducts = allProducts.filter(
    (p) => (p.itemType === "purchased_part" || p.itemType === "purchase") && !linkedProductIds.has(p.id)
  );

  const linkMutation = useMutation({
    mutationFn: (data: object) => apiFetch(`/api/suppliers/${supplierId}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/suppliers/${supplierId}/products`] });
      toast({ title: "Product linked" });
      setShowAdd(false);
      setAddProductId(""); setAddSku(""); setAddPrice(""); setAddStoreProductId("");
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const unlinkMutation = useMutation({
    mutationFn: (productId: number) => apiFetchVoid(`/api/suppliers/${supplierId}/products/${productId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/suppliers/${supplierId}/products`] });
      toast({ title: "Product removed from supplier" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  // Group by category
  const byCategory = links.reduce<Record<string, SupplierProductLink[]>>((acc, l) => {
    const cat = l.productCategory || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(l);
    return acc;
  }, {});

  const lowItems = links.filter((l) => l.bufferStock > 0 && l.totalStock < l.bufferStock);

  return (
    <div className="border-t pt-2 mt-1 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Package2 className="h-3 w-3" /> {t("suppliersProductsSupplied")} ({links.length})
      </p>

      {/* Low-stock summary + one-click order (gated to Standard+) */}
      {lowItems.length > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5">
          <span className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            {lowItems.length} low — needs reorder
          </span>
          {atLeast("standard") ? (
            <Link href="/work/purchase-orders">
              <Button size="sm" className="h-7 text-xs font-bold gap-1">
                <ShoppingCart className="h-3 w-3" /> Order
              </Button>
            </Link>
          ) : (
            <span
              title="Upgrade to Standard to raise purchase orders in one click"
              className="flex items-center gap-1 text-[10px] font-semibold text-amber-700/80"
            >
              <Lock className="h-3 w-3" /> Upgrade to order
            </span>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">{t("loading")}</p>
      ) : links.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("suppliersNoProductsLinked")}</p>
      ) : (
        <div className="space-y-2">
          {Object.entries(byCategory).map(([cat, items]) => (
            <div key={cat} className="space-y-0.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{cat}</p>
              {items.map((link) => {
                const isLow = link.bufferStock > 0 && link.totalStock < link.bufferStock;
                return (
                <div key={link.id} className="flex items-center justify-between pl-2 py-0.5 rounded hover:bg-muted/40">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium truncate flex items-center gap-1.5">
                      {link.productName}
                      {isLow && (
                        <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wide bg-red-100 text-red-700 border border-red-200 rounded-full px-1.5 py-0.5">
                          Low
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {[
                        `${link.totalStock} in stock${link.bufferStock > 0 ? ` / min ${link.bufferStock}` : ""}`,
                        link.supplierSku ? `SKU: ${link.supplierSku}` : null,
                        link.unitPrice != null ? `$${Number(link.unitPrice).toFixed(2)}` : null,
                        link.storeProductId && supplierOrderMethod === "web_store" ? `Store ID: ${link.storeProductId}` : null,
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <button
                    onClick={() => unlinkMutation.mutate(link.productId)}
                    disabled={unlinkMutation.isPending}
                    className="p-1 hover:bg-red-100 rounded text-red-500 flex-shrink-0"
                    title="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {showAdd ? (
        <div className="space-y-1.5 border border-dashed border-primary/40 rounded-lg p-2">
          <select
            value={addProductId}
            onChange={(e) => setAddProductId(e.target.value)}
            className="w-full h-8 px-2 rounded border border-input bg-background text-xs"
          >
            <option value="">{t("suppliersSelectProduct")}</option>
            {purchasedProducts.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.category ? ` (${p.category})` : ""}</option>
            ))}
          </select>
          <div className="flex gap-1.5">
            <input
              type="text"
              placeholder={t("suppliersSkuPlaceholder")}
              value={addSku}
              onChange={(e) => setAddSku(e.target.value)}
              className="flex-1 h-8 px-2 rounded border border-input bg-background text-xs"
            />
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder={t("suppliersUnitPrice")}
              value={addPrice}
              onChange={(e) => setAddPrice(e.target.value)}
              className="w-24 h-8 px-2 rounded border border-input bg-background text-xs font-mono"
            />
          </div>
          {supplierOrderMethod === "web_store" && (
            <input
              type="text"
              placeholder="Store product / variant ID (for cart fill)"
              value={addStoreProductId}
              onChange={(e) => setAddStoreProductId(e.target.value)}
              className="w-full h-8 px-2 rounded border border-input bg-background text-xs font-mono"
            />
          )}
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="h-7 text-xs font-bold flex-1"
              disabled={!addProductId || linkMutation.isPending}
              onClick={() => linkMutation.mutate({
                productId: Number(addProductId),
                supplierSku: addSku || undefined,
                unitPrice: addPrice ? Number(addPrice) : null,
                storeProductId: addStoreProductId || undefined,
              })}
            >
              {t("suppliersLinkProduct")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => { setShowAdd(false); setAddProductId(""); setAddSku(""); setAddPrice(""); setAddStoreProductId(""); }}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs font-bold w-full"
          onClick={() => setShowAdd(true)}
        >
          <Plus className="h-3 w-3 mr-1" /> {t("suppliersAddProduct")}
        </Button>
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
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", notes: "", orderMethod: "email", storeUrl: "", storePlatform: "" });
  const [expandedSupplierId, setExpandedSupplierId] = useState<number | null>(null);

  const suppliersQuery = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
    queryFn: () => apiFetch("/api/suppliers"),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => apiFetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      setFormData({ name: "", email: "", phone: "", notes: "", orderMethod: "email", storeUrl: "", storePlatform: "" });
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
      setFormData({ name: "", email: "", phone: "", notes: "", orderMethod: "email", storeUrl: "", storePlatform: "" });
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
            setFormData({ name: "", email: "", phone: "", notes: "", orderMethod: "email", storeUrl: "", storePlatform: "" });
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

          {/* Order method */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Ordering method</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, orderMethod: "email" })}
                className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg border-2 text-sm font-semibold transition-colors ${formData.orderMethod === "email" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border text-muted-foreground hover:border-blue-300"}`}
              >
                <Mail className="h-3.5 w-3.5" /> Email order
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, orderMethod: "web_store" })}
                className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg border-2 text-sm font-semibold transition-colors ${formData.orderMethod === "web_store" ? "border-purple-500 bg-purple-50 text-purple-700" : "border-border text-muted-foreground hover:border-purple-300"}`}
              >
                <Globe className="h-3.5 w-3.5" /> Web store
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

                {expanded && <SupplierProductsPanel supplierId={supplier.id} supplierOrderMethod={supplier.orderMethod || "email"} />}
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
