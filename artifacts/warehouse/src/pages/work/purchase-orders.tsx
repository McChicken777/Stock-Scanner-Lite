import { useState, useEffect } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Plus, ShoppingCart, Package2, CheckCircle2,
  Truck, AlertCircle, ChevronRight, Trash2, Edit2, X,
} from "lucide-react";

interface PurchaseOrder {
  id: number;
  supplierId: number | null;
  supplierName: string | null;
  status: "draft" | "ordered" | "partially_arrived" | "arrived" | "cancelled";
  expectedDate: string | null;
  notes: string | null;
  itemCount: number;
  totalOrdered: number;
  createdAt: string;
}

interface WaitingProject {
  projectId: number;
  projectName: string;
  quantity: number;
}

interface POItem {
  id: number;
  poId: number;
  productId: number;
  productName: string;
  productCategory: string;
  supplierSku: string | null;
  quantityOrdered: number;
  quantityArrived: number;
  unitPrice: number | null;
  waitingProjects: WaitingProject[];
}

interface PODetail {
  id: number;
  supplierId: number | null;
  supplierName: string | null;
  status: string;
  expectedDate: string | null;
  notes: string | null;
  createdAt: string;
  items: POItem[];
}

interface Product {
  id: number;
  name: string;
  category: string;
  itemType: string;
}

interface Supplier {
  id: number;
  name: string;
}

interface Location {
  id: string;
  description: string | null;
}

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
  return res.json();
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  ordered: "bg-blue-100 text-blue-700 border-blue-200",
  partially_arrived: "bg-yellow-100 text-yellow-800 border-yellow-200",
  arrived: "bg-green-100 text-green-700 border-green-200",
  cancelled: "bg-red-100 text-red-600 border-red-200",
};

const statusIcons: Record<string, React.ReactNode> = {
  draft: <Edit2 className="h-3 w-3" />,
  ordered: <Truck className="h-3 w-3" />,
  partially_arrived: <Package2 className="h-3 w-3" />,
  arrived: <CheckCircle2 className="h-3 w-3" />,
  cancelled: <X className="h-3 w-3" />,
};

// ─── PO Detail View ────────────────────────────────────────────────────────────

function PODetailPage({ poId }: { poId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [showAddItem, setShowAddItem] = useState(false);
  const [addProductId, setAddProductId] = useState("");
  const [addQty, setAddQty] = useState("1");
  const [arriveItemId, setArriveItemId] = useState<number | null>(null);
  const [arriveQty, setArriveQty] = useState("1");
  const [arriveLocationId, setArriveLocationId] = useState("");
  const [editPriceItemId, setEditPriceItemId] = useState<number | null>(null);
  const [editPriceValue, setEditPriceValue] = useState("");
  const [addPrice, setAddPrice] = useState("");

  const { data: po, isLoading } = useQuery<PODetail>({
    queryKey: [`/api/purchase-orders/${poId}`],
    queryFn: () => apiFetch(`/api/purchase-orders/${poId}`),
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: () => apiFetch("/api/products"),
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
    queryFn: () => apiFetch("/api/suppliers"),
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    queryFn: () => apiFetch("/api/locations"),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/purchase-orders/${poId}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
    queryClient.invalidateQueries({ queryKey: ["/api/work/reorder-queue"] });
    queryClient.invalidateQueries({ queryKey: ["/api/products"] });
  };

  const addItemMutation = useMutation({
    mutationFn: (data: { productId: number; quantityOrdered: number; unitPrice: number | null }) =>
      apiFetch(`/api/purchase-orders/${poId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => { invalidate(); toast({ title: "Item added" }); setShowAddItem(false); setAddProductId(""); setAddQty("1"); setAddPrice(""); },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const updateItemPriceMutation = useMutation({
    mutationFn: (data: { itemId: number; unitPrice: number | null }) =>
      apiFetch(`/api/purchase-orders/${poId}/items/${data.itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitPrice: data.unitPrice }),
      }),
    onSuccess: () => { invalidate(); toast({ title: "Unit price updated" }); setEditPriceItemId(null); },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const removeItemMutation = useMutation({
    mutationFn: (itemId: number) => apiFetch(`/api/purchase-orders/${poId}/items/${itemId}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); toast({ title: "Item removed" }); },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) =>
      apiFetch(`/api/purchase-orders/${poId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => { invalidate(); toast({ title: "PO status updated" }); },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const arriveItemMutation = useMutation({
    mutationFn: (data: { itemId: number; quantityArrived: number; locationId: string }) =>
      apiFetch(`/api/purchase-orders/${poId}/items/${data.itemId}/arrive`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantityArrived: data.quantityArrived, locationId: data.locationId }),
      }),
    onSuccess: (data) => {
      invalidate();
      const stepNote = data.affectedStepCount > 0 ? ` · ${data.affectedStepCount} work step${data.affectedStepCount !== 1 ? "s" : ""} can now proceed` : "";
      const costNote = data.unitCostUpdated ? " · product unit cost updated from PO price" : "";
      toast({ title: `Stock updated — PO now ${data.poStatus.replace("_", " ")}${stepNote}${costNote}` });
      setArriveItemId(null);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/api/purchase-orders/${poId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "PO deleted" });
      setLocation("/work/purchase-orders");
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return <div className="p-4 space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>;
  }
  if (!po) return <div className="p-4 text-center text-muted-foreground">PO not found</div>;

  const purchasedProducts = products.filter((p) => p.itemType === "purchased_part" || p.itemType === "purchase");
  const canEdit = po.status !== "arrived" && po.status !== "cancelled";
  const currentItem = arriveItemId ? po.items.find((i) => i.id === arriveItemId) : null;

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* PO Header */}
      <div className="border-2 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-black text-lg">PO #{po.id}</h2>
            {po.supplierName && <p className="text-sm text-muted-foreground">{po.supplierName}</p>}
          </div>
          <Badge className={`${statusColors[po.status] ?? ""} flex items-center gap-1 font-bold`}>
            {statusIcons[po.status]}
            {po.status.replace("_", " ")}
          </Badge>
        </div>
        {po.expectedDate && (
          <p className="text-xs text-muted-foreground">
            Expected: {new Date(po.expectedDate).toLocaleDateString()}
          </p>
        )}
        {po.notes && <p className="text-xs text-muted-foreground border-t pt-2">{po.notes}</p>}

        {/* Status actions */}
        {canEdit && (
          <div className="flex gap-2 pt-1">
            {po.status === "draft" && (
              <Button size="sm" className="flex-1 h-9 font-bold" onClick={() => updateStatusMutation.mutate("ordered")}>
                <Truck className="h-3.5 w-3.5 mr-1" /> Mark Ordered
              </Button>
            )}
            {po.status === "ordered" && (
              <Button size="sm" variant="outline" className="h-9 font-bold text-yellow-700 border-yellow-300" onClick={() => updateStatusMutation.mutate("partially_arrived")}>
                <Package2 className="h-3.5 w-3.5 mr-1" /> Partially Arrived
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-9 text-destructive border-destructive/30 font-bold" onClick={() => updateStatusMutation.mutate("cancelled")}>
              Cancel PO
            </Button>
          </div>
        )}
        {!canEdit && po.status !== "cancelled" && (
          <div className="flex items-center gap-2 text-green-700 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4" /> All items received
          </div>
        )}
      </div>

      {/* Items */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Items ({po.items.length})</h3>
          {canEdit && (
            <Button size="sm" variant="outline" className="h-8 font-bold text-xs" onClick={() => setShowAddItem((v) => !v)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
            </Button>
          )}
        </div>

        {showAddItem && (
          <div className="border-2 border-primary/20 bg-primary/5 rounded-xl p-3 space-y-2">
            <select
              value={addProductId}
              onChange={(e) => setAddProductId(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border-2 border-input bg-background text-sm"
            >
              <option value="">Select product…</option>
              {purchasedProducts.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.category ? ` (${p.category})` : ""}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
                placeholder="Qty"
                className="w-20 h-10 px-3 rounded-lg border-2 border-input bg-background text-sm font-mono"
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={addPrice}
                onChange={(e) => setAddPrice(e.target.value)}
                placeholder="Unit price"
                className="w-28 h-10 px-3 rounded-lg border-2 border-input bg-background text-sm font-mono"
              />
              <Button
                size="sm"
                className="flex-1 h-10 font-bold"
                disabled={!addProductId || addItemMutation.isPending}
                onClick={() => addItemMutation.mutate({
                  productId: Number(addProductId),
                  quantityOrdered: Math.max(1, Number(addQty)),
                  unitPrice: addPrice ? Math.max(0, Number(addPrice)) : null,
                })}
              >
                Add
              </Button>
              <Button size="sm" variant="outline" className="h-10" onClick={() => setShowAddItem(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {po.items.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">No items added yet</div>
        ) : (
          <div className="space-y-2">
            {po.items.map((item) => {
              const pct = item.quantityOrdered > 0 ? Math.round((item.quantityArrived / item.quantityOrdered) * 100) : 0;
              const fullyArrived = item.quantityArrived >= item.quantityOrdered;
              return (
                <div key={item.id} className={`border-2 rounded-xl p-3 space-y-2 ${fullyArrived ? "border-green-200 bg-green-50" : "border-border"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{item.productName}</p>
                      {item.productCategory && <p className="text-xs text-muted-foreground">{item.productCategory}</p>}
                      {item.supplierSku && <p className="text-xs font-mono text-muted-foreground">SKU: {item.supplierSku}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-black text-base">{item.quantityArrived}<span className="text-muted-foreground font-normal text-sm">/{item.quantityOrdered}</span></p>
                      <p className="text-[10px] text-muted-foreground">{pct}% arrived</p>
                    </div>
                  </div>

                  {/* Unit price + line total */}
                  <div className="flex items-center justify-between gap-2 bg-muted/30 rounded-lg p-2">
                    {editPriceItemId === item.id ? (
                      <div className="flex items-center gap-1.5 flex-1">
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">Unit price</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={editPriceValue}
                          onChange={(e) => setEditPriceValue(e.target.value)}
                          placeholder="0.00"
                          className="w-24 h-8 px-2 rounded border-2 border-input bg-background text-xs font-mono"
                        />
                        <Button
                          size="sm"
                          className="h-8 text-xs font-bold"
                          disabled={updateItemPriceMutation.isPending}
                          onClick={() => updateItemPriceMutation.mutate({
                            itemId: item.id,
                            unitPrice: editPriceValue ? Math.max(0, Number(editPriceValue)) : null,
                          })}
                        >Save</Button>
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setEditPriceItemId(null)}>X</Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-muted-foreground">Unit price: <span className="font-bold font-mono text-foreground">{item.unitPrice != null ? `$${Number(item.unitPrice).toFixed(2)}` : "—"}</span></span>
                          {item.unitPrice != null && (
                            <span className="text-muted-foreground">Line total: <span className="font-bold font-mono text-foreground">${(Number(item.unitPrice) * item.quantityOrdered).toFixed(2)}</span></span>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[10px] font-bold"
                          onClick={() => { setEditPriceItemId(item.id); setEditPriceValue(item.unitPrice != null ? String(item.unitPrice) : ""); }}
                        >
                          <Edit2 className="h-3 w-3 mr-1" /> Edit
                        </Button>
                      </>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${fullyArrived ? "bg-green-500" : "bg-blue-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* Waiting projects — which work orders need this product */}
                  {item.waitingProjects.length > 0 && (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700">Waiting Work Orders ({item.waitingProjects.length})</p>
                      {item.waitingProjects.map((wp) => (
                        <div key={wp.projectId} className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-purple-900 truncate">{wp.projectName}</span>
                          <span className="text-purple-600 font-mono ml-2 flex-shrink-0">need {wp.quantity}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {canEdit && !fullyArrived && (
                    <div className="flex gap-2">
                      {arriveItemId === item.id ? (
                        <div className="flex-1 space-y-2">
                          <div className="flex gap-2">
                            <input
                              type="number"
                              min={1}
                              max={item.quantityOrdered - item.quantityArrived}
                              value={arriveQty}
                              onChange={(e) => setArriveQty(e.target.value)}
                              placeholder="Qty arriving"
                              className="w-24 h-9 px-2 rounded-lg border-2 border-input bg-background text-sm font-mono"
                            />
                            <select
                              value={arriveLocationId}
                              onChange={(e) => setArriveLocationId(e.target.value)}
                              className="flex-1 h-9 px-2 rounded-lg border-2 border-input bg-background text-sm"
                            >
                              <option value="">Select location…</option>
                              {locations.map((l) => (
                                <option key={l.id} value={l.id}>{l.id}{l.description ? ` — ${l.description}` : ""}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1 h-9 font-bold bg-green-600 hover:bg-green-700"
                              disabled={!arriveLocationId || arriveItemMutation.isPending}
                              onClick={() => arriveItemMutation.mutate({
                                itemId: item.id,
                                quantityArrived: Math.max(1, Number(arriveQty)),
                                locationId: arriveLocationId,
                              })}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Confirm Arrival
                            </Button>
                            <Button size="sm" variant="outline" className="h-9" onClick={() => setArriveItemId(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-9 font-bold text-green-700 border-green-300"
                          onClick={() => { setArriveItemId(item.id); setArriveQty(String(item.quantityOrdered - item.quantityArrived)); setArriveLocationId(""); }}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Arrive Stock
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-9 w-9 text-destructive border-destructive/30"
                        onClick={() => removeItemMutation.mutate(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  {fullyArrived && (
                    <div className="flex items-center gap-1 text-xs text-green-700 font-semibold">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Fully received
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Danger zone */}
      {po.status === "draft" && (
        <div className="border-2 border-destructive/20 rounded-xl p-3">
          <Button
            size="sm"
            variant="outline"
            className="w-full h-9 font-bold text-destructive border-destructive/30"
            onClick={() => { if (confirm("Delete this purchase order?")) deleteMutation.mutate(); }}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete PO
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── PO List + Create ──────────────────────────────────────────────────────────

export default function PurchaseOrdersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const isAdmin = user?.role === "admin" || user?.role === "owner";

  const [matchDetail] = useRoute("/work/purchase-orders/:id");
  const [, params] = useRoute("/work/purchase-orders/:id");
  const rawId = params?.id;
  const isNewRoute = rawId === "new";
  const detailId = rawId && !isNewRoute ? Number(rawId) : null;

  // Read prefill product from reorder-queue link (?productId=123)
  const prefillProductId = isNewRoute
    ? (Number(new URLSearchParams(window.location.search).get("productId")) || null)
    : null;

  const [showCreate, setShowCreate] = useState(isNewRoute ?? false);
  const [newSupplierId, setNewSupplierId] = useState("");
  const [newExpectedDate, setNewExpectedDate] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const { data: pos = [], isLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["/api/purchase-orders"],
    queryFn: () => apiFetch("/api/purchase-orders"),
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
    queryFn: () => apiFetch("/api/suppliers"),
  });

  const { data: products = [] } = useQuery<{ id: number; name: string; supplierId: number | null }[]>({
    queryKey: ["/api/products"],
    queryFn: () => apiFetch("/api/products"),
    enabled: !!prefillProductId,
  });
  const prefillProduct = prefillProductId ? products.find((p) => p.id === prefillProductId) ?? null : null;

  // Auto-select the prefill product's supplier when it loads
  useEffect(() => {
    if (prefillProduct?.supplierId && !newSupplierId) {
      setNewSupplierId(String(prefillProduct.supplierId));
    }
  }, [prefillProduct?.supplierId]);

  const createMutation = useMutation({
    mutationFn: (data: object) =>
      apiFetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: async (po: PurchaseOrder) => {
      // If navigated here from the reorder queue, auto-add the flagged product as a line item
      if (prefillProductId) {
        try {
          await apiFetch(`/api/purchase-orders/${po.id}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId: prefillProductId, quantityOrdered: 1 }),
          });
        } catch { /* user can add items manually from PO detail */ }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Purchase order created" });
      setShowCreate(false);
      setLocation(`/work/purchase-orders/${po.id}`);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  if (!isAdmin) {
    return (
      <div className="p-6 text-center text-muted-foreground mt-20">
        <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="font-semibold">Admin access required</p>
      </div>
    );
  }

  // Show detail view if navigated to /work/purchase-orders/:id
  if (matchDetail && detailId) {
    return (
      <div className="flex flex-col min-h-full">
        <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm flex items-center gap-3">
          <Link href="/work/purchase-orders" className="p-2 -ml-2 rounded-full hover:bg-secondary-foreground/10 transition-colors">
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <h1 className="text-xl font-bold">Purchase Order #{detailId}</h1>
        </div>
        <PODetailPage poId={detailId} />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm flex items-center gap-3">
        <Link href="/work/projects" className="p-2 -ml-2 rounded-full hover:bg-secondary-foreground/10 transition-colors">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Purchase Orders</h1>
          <p className="text-xs opacity-70">{pos.length} order{pos.length !== 1 ? "s" : ""}</p>
        </div>
        <Button size="sm" className="font-bold h-9" onClick={() => setShowCreate((v) => !v)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New PO
        </Button>
      </div>

      <div className="p-4 space-y-4 pb-24">
        {showCreate && (
          <div className="border-2 border-primary/30 bg-primary/5 rounded-xl p-4 space-y-3">
            <p className="font-bold text-sm">New Purchase Order</p>
            {prefillProduct && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-center gap-2">
                <Package2 className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <span className="text-xs font-semibold text-amber-800">
                  Will include: <span className="font-bold">{prefillProduct.name}</span>
                </span>
              </div>
            )}
            <select
              value={newSupplierId}
              onChange={(e) => setNewSupplierId(e.target.value)}
              className="w-full h-11 px-3 rounded-lg border-2 border-input bg-background text-sm"
            >
              <option value="">No supplier (add later)</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Expected Delivery (optional)</label>
              <input
                type="date"
                value={newExpectedDate}
                onChange={(e) => setNewExpectedDate(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border-2 border-input bg-background text-sm"
              />
            </div>
            <input
              type="text"
              placeholder="Notes (optional)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="w-full h-11 px-3 rounded-lg border-2 border-input bg-background text-sm"
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-10" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button
                className="flex-1 h-10 font-bold"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate({
                  supplierId: newSupplierId ? Number(newSupplierId) : null,
                  expectedDate: newExpectedDate || null,
                  notes: newNotes || null,
                })}
              >
                Create PO
              </Button>
            </div>
          </div>
        )}

        {/* Link to reorder queue */}
        <Link href="/work/reorder-queue">
          <div className="flex items-center gap-3 border-2 border-amber-200 bg-amber-50 rounded-xl p-3 hover:bg-amber-100 transition-colors cursor-pointer">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-sm text-amber-800">View Reorder Queue</p>
              <p className="text-xs text-amber-600">Products below minimum stock level</p>
            </div>
            <ChevronRight className="h-4 w-4 text-amber-600" />
          </div>
        </Link>

        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        ) : pos.length === 0 ? (
          <div className="text-center py-16 px-4 bg-muted/30 rounded-xl border border-dashed">
            <ShoppingCart className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-semibold text-muted-foreground">No purchase orders yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create a PO to track supplier orders and stock arrivals.</p>
          </div>
        ) : (() => {
          const OPEN_STATUSES = ["draft", "ordered", "partially_arrived"];
          const openPos = pos.filter((p) => OPEN_STATUSES.includes(p.status));
          const closedPos = pos.filter((p) => !OPEN_STATUSES.includes(p.status));
          const renderPOCard = (po: PurchaseOrder) => (
            <Link key={po.id} href={`/work/purchase-orders/${po.id}`}>
              <div className={`border-2 rounded-xl p-3 space-y-2 hover:border-primary/40 transition-colors cursor-pointer ${OPEN_STATUSES.includes(po.status) ? "border-amber-200 bg-amber-50/50" : "border-border"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm">PO #{po.id}</p>
                    {po.supplierName && <p className="text-xs text-muted-foreground">{po.supplierName}</p>}
                    {po.expectedDate && (
                      <p className="text-xs text-muted-foreground">
                        Expected: {new Date(po.expectedDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={`${statusColors[po.status] ?? ""} text-[10px] font-bold flex items-center gap-1`}>
                      {statusIcons[po.status]}
                      {po.status.replace("_", " ")}
                    </Badge>
                    <p className="text-xs text-muted-foreground">{po.itemCount} item{po.itemCount !== 1 ? "s" : ""} · {po.totalOrdered} units</p>
                  </div>
                </div>
                {po.notes && <p className="text-xs text-muted-foreground truncate">{po.notes}</p>}
              </div>
            </Link>
          );
          return (
            <div className="space-y-4">
              {openPos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5" /> Open Orders ({openPos.length})
                  </p>
                  {openPos.map(renderPOCard)}
                </div>
              )}
              {closedPos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Completed / Cancelled ({closedPos.length})
                  </p>
                  {closedPos.map(renderPOCard)}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
