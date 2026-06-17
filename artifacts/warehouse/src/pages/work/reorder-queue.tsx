import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, usePlan } from "@/contexts/auth";
import { useLang } from "@/contexts/lang";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, AlertTriangle, ShoppingCart, CheckCircle2,
  Package2, TrendingDown, Plus, Mail, ChevronDown, ChevronUp,
  Truck, Building2, HelpCircle, Lock, Globe, ExternalLink,
} from "lucide-react";
import { buildMailtoLink, buildCartUrl } from "@/lib/ordering";

interface ReorderItem {
  id: number;
  name: string;
  category: string;
  itemType: string;
  minStock: number;
  bufferStock: number;
  targetStock: number;
  totalStock: number;
  reserved: number;
  available: number;
  shortfall: number;
  pendingPo: { poId: number; quantity: number; status: string } | null;
  supplierId: number | null;
  supplierSku: string | null;
  supplierName: string | null;
  supplierEmail: string | null;
  supplierOrderMethod: string;
  supplierStoreUrl: string | null;
  supplierStorePlatform: string | null;
  storeProductId: string | null;
  storeProductUrl: string | null;
  unitCost: number;
  estimatedReorderCost: number;
}

interface ShortageFlag {
  id: number;
  productName: string;
  quantityNeeded: number | null;
  flaggedByUsername: string | null;
  note: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

interface SupplierGroup {
  supplierId: number | null;
  supplierName: string | null;
  supplierEmail: string | null;
  orderMethod: string;
  storeUrl: string | null;
  storePlatform: string | null;
  items: ReorderItem[];
}

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
  return res.json();
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  ordered: "bg-blue-100 text-blue-700",
  partially_arrived: "bg-yellow-100 text-yellow-800",
  arrived: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600",
};

function SupplierGroupCard({
  group, activeFlags, onOrderCreated,
}: {
  group: SupplierGroup;
  activeFlags: ShortageFlag[];
  onOrderCreated: (poId: number, supplierEmail: string | null, supplierName: string | null, items: ReorderItem[]) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [quantities, setQuantities] = useState<Record<number, number>>(
    Object.fromEntries(group.items.map((i) => [i.id, i.shortfall]))
  );
  const { toast } = useToast();
  const { t } = useLang();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [webStorePoId, setWebStorePoId] = useState<number | null>(null);
  const [openedItems, setOpenedItems] = useState<Set<number>>(new Set());
  // Frozen snapshot of what was ordered — the post-order queue refetch re-tags these
  // items with their new pending PO, so the live filtered list would otherwise empty out.
  const [orderedLines, setOrderedLines] = useState<Array<{ id: number; name: string; qty: number; storeProductId: string | null; storeProductUrl: string | null }>>([]);

  const hasSupplier = group.supplierId != null;
  const allPending = group.items.every((i) => i.pendingPo != null);
  const totalCost = group.items.reduce((s, i) => s + (i.unitCost > 0 ? (quantities[i.id] ?? i.shortfall) * i.unitCost : 0), 0);
  const isWebStore = group.orderMethod === "web_store";
  const isCustomStore = isWebStore && group.storePlatform === "custom";

  const markOrderedMutation = useMutation({
    mutationFn: (poId: number) => apiFetch(`/api/purchase-orders/${poId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ordered" }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work/reorder-queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      setWebStorePoId(null);
      toast({ title: "Order marked as placed" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const itemsToOrder = group.items.filter((i) => !i.pendingPo);

  const batchMutation = useMutation({
    mutationFn: (lines: Array<{ id: number; name: string; qty: number; storeProductId: string | null; storeProductUrl: string | null; unitCost: number; supplierSku: string | null }>) =>
      apiFetch("/api/purchase-orders/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: group.supplierId,
          items: lines.map((l) => ({
            productId: l.id,
            quantityOrdered: Math.max(1, l.qty),
            unitPrice: l.unitCost > 0 ? l.unitCost : null,
          })),
        }),
      }),
    onSuccess: (po, lines) => {
      queryClient.invalidateQueries({ queryKey: ["/api/work/reorder-queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: `PO #${po.id} created` });
      if (isCustomStore) {
        // No combined cart URL — the confirmation banner lists each product link to open one-by-one.
        setOpenedItems(new Set());
        setWebStorePoId(po.id);
      } else if (isWebStore && group.storeUrl) {
        // Open the pre-filled cart in a new tab
        const cartItems = lines.map((l) => ({ storeProductId: l.storeProductId, qty: Math.max(1, l.qty) }));
        window.open(buildCartUrl(group.storeUrl, group.storePlatform, cartItems), "_blank", "noopener,noreferrer");
        setWebStorePoId(po.id);
      } else {
        onOrderCreated(po.id, group.supplierEmail, group.supplierName, group.items.filter((i) => !i.pendingPo));
      }
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  function confirmOrder() {
    // Snapshot the lines before the mutation triggers a queue refetch.
    const snapshot = itemsToOrder.map((i) => ({
      id: i.id,
      name: i.name,
      qty: Math.max(1, quantities[i.id] ?? i.shortfall),
      storeProductId: i.storeProductId,
      storeProductUrl: i.storeProductUrl,
      unitCost: i.unitCost,
      supplierSku: i.supplierSku,
    }));
    setOrderedLines(snapshot.map((l) => ({ id: l.id, name: l.name, qty: l.qty, storeProductId: l.storeProductId, storeProductUrl: l.storeProductUrl })));
    batchMutation.mutate(snapshot);
  }

  return (
    <div className="border-2 border-border rounded-xl overflow-hidden bg-card">
      {/* Supplier header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className={`flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 ${hasSupplier ? (isWebStore ? "bg-purple-100" : "bg-blue-100") : "bg-muted"}`}>
          {hasSupplier
            ? isWebStore
              ? <Globe className="h-4 w-4 text-purple-700" />
              : <Building2 className="h-4 w-4 text-blue-700" />
            : <HelpCircle className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">{group.supplierName ?? t("reorderNoSupplier")}</p>
          <p className="text-xs text-muted-foreground">
            {group.items.length} {t("reorderItemsToReorder")}
            {totalCost > 0 && ` · est. $${totalCost.toFixed(2)}`}
          </p>
        </div>
        {isWebStore ? (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-full px-2 py-0.5 flex-shrink-0">
            <Globe className="h-3 w-3" /> web store
          </span>
        ) : group.supplierEmail ? (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5 flex-shrink-0">
            <Mail className="h-3 w-3" /> {group.supplierEmail}
          </span>
        ) : null}
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
      </button>

      {expanded && (
        <>
          {/* Item rows */}
          <div className="border-t border-border divide-y divide-border/60">
            {group.items.map((item) => {
              const flagsForItem = activeFlags.filter((f) =>
                f.productName.trim().toLowerCase() === item.name.trim().toLowerCase()
              );
              return (
                <div key={item.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{item.name}</p>
                      {flagsForItem.length > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200 rounded-full px-1.5 py-0.5">
                          <AlertTriangle className="h-2.5 w-2.5" /> flagged
                        </span>
                      )}
                      {item.pendingPo && (
                        <Link href={`/work/purchase-orders/${item.pendingPo.poId}`}>
                          <Badge className={`text-[10px] cursor-pointer ${statusColors[item.pendingPo.status] ?? "bg-gray-100 text-gray-700"}`}>
                            PO #{item.pendingPo.poId} · {item.pendingPo.status.replace("_", " ")}
                          </Badge>
                        </Link>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                      {item.supplierSku && <span className="font-mono">SKU: {item.supplierSku}</span>}
                      {item.category && <span>{item.category}</span>}
                      <span className="text-red-600 font-semibold">
                        {item.available} / {item.minStock} min — short {item.shortfall}
                      </span>
                      {item.unitCost > 0 && (
                        <span>${Number(item.unitCost).toFixed(2)} ea</span>
                      )}
                    </div>
                  </div>
                  {/* Editable quantity — only for items without a pending PO */}
                  {!item.pendingPo && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-xs text-muted-foreground">Qty:</span>
                      <input
                        type="number"
                        min={1}
                        value={quantities[item.id] ?? item.shortfall}
                        onChange={(e) => setQuantities((q) => ({ ...q, [item.id]: Math.max(1, Number(e.target.value)) }))}
                        className="w-16 h-8 text-xs text-center border-2 border-border rounded-lg font-bold outline-none focus:border-primary"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action bar */}
          <div className="border-t border-border bg-muted/20 px-4 py-3 flex flex-col gap-2">
            {/* Custom store: per-item link checklist + "Order placed" */}
            {webStorePoId && isCustomStore && (
              <div className="rounded-lg border-2 border-purple-300 bg-purple-50 px-3 py-2 space-y-2">
                <p className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" /> Open each item, add to cart, then check out
                </p>
                <div className="space-y-1">
                  {orderedLines.map((line) => {
                    const opened = openedItems.has(line.id);
                    return (
                      <div key={line.id} className="flex items-center gap-2">
                        <span className="flex-1 min-w-0 text-xs font-medium text-purple-900 truncate">{line.name} <span className="opacity-60">×{line.qty}</span></span>
                        {line.storeProductUrl ? (
                          <a href={line.storeProductUrl} target="_blank" rel="noopener noreferrer" onClick={() => setOpenedItems((s) => new Set(s).add(line.id))}>
                            <Button size="sm" variant={opened ? "outline" : "default"} className={`h-7 text-[11px] font-bold gap-1 ${opened ? "border-green-300 text-green-700" : "bg-purple-600 hover:bg-purple-700"}`}>
                              {opened ? <><CheckCircle2 className="h-3 w-3" /> Opened</> : <><ExternalLink className="h-3 w-3" /> Open</>}
                            </Button>
                          </a>
                        ) : (
                          <span className="text-[10px] font-semibold text-amber-600 flex items-center gap-0.5"><AlertTriangle className="h-3 w-3" /> no link</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-1.5">
                  {group.storeUrl && (
                    <a href={group.storeUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                      <Button size="sm" variant="outline" className="w-full h-8 text-xs font-bold gap-1 border-purple-300 text-purple-700">
                        <ExternalLink className="h-3 w-3" /> Open store
                      </Button>
                    </a>
                  )}
                  <Button
                    size="sm"
                    className="flex-1 h-8 text-xs font-bold gap-1 bg-purple-600 hover:bg-purple-700"
                    disabled={markOrderedMutation.isPending}
                    onClick={() => markOrderedMutation.mutate(webStorePoId)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Order placed
                  </Button>
                </div>
              </div>
            )}

            {/* Web store (Shopify/Woo) "Order placed" confirmation banner */}
            {webStorePoId && !isCustomStore && (
              <div className="flex items-center gap-3 rounded-lg border-2 border-purple-300 bg-purple-50 px-3 py-2">
                <Globe className="h-4 w-4 text-purple-700 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-purple-900">Cart opened — finish checkout in the store</p>
                  <p className="text-[11px] text-purple-700">Once you've paid, confirm below so stock is tracked as ordered.</p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  {group.storeUrl && (
                    <a href={buildCartUrl(group.storeUrl, group.storePlatform, orderedLines.map((l) => ({ storeProductId: l.storeProductId, qty: l.qty })))} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="h-8 text-xs font-bold gap-1 border-purple-300 text-purple-700">
                        <ExternalLink className="h-3 w-3" /> Reopen
                      </Button>
                    </a>
                  )}
                  <Button
                    size="sm"
                    className="h-8 text-xs font-bold gap-1 bg-purple-600 hover:bg-purple-700"
                    disabled={markOrderedMutation.isPending}
                    onClick={() => markOrderedMutation.mutate(webStorePoId)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Order placed
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              {allPending ? (
                <div className="flex items-center gap-2 text-sm text-green-700 font-semibold">
                  <CheckCircle2 className="h-4 w-4" /> {t("reorderAllPending")}
                </div>
              ) : (
                <Button
                  size="sm"
                  className={`h-9 font-bold gap-1.5 ${isWebStore ? "bg-purple-600 hover:bg-purple-700" : ""}`}
                  disabled={batchMutation.isPending || itemsToOrder.length === 0}
                  onClick={confirmOrder}
                >
                  {batchMutation.isPending
                    ? (isWebStore && !isCustomStore ? "Opening cart…" : "Creating…")
                    : isCustomStore
                      ? <><Globe className="h-3.5 w-3.5" /> Order · list {itemsToOrder.length} items</>
                      : isWebStore
                        ? <><Globe className="h-3.5 w-3.5" /> Open cart · {itemsToOrder.length} items</>
                        : <><ShoppingCart className="h-3.5 w-3.5" /> Order {itemsToOrder.length} {t("reorderItemsToReorder")} from {group.supplierName ?? t("reorderNoSupplier")}</>}
                </Button>
              )}
              <Link href="/work/purchase-orders">
                <Button size="sm" variant="outline" className="h-9 font-semibold gap-1 text-xs">
                  <Truck className="h-3.5 w-3.5" /> {t("reorderViewPO")}
                </Button>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function ReorderQueuePage() {
  const { user } = useAuth();
  const { atLeast } = usePlan();
  const { toast } = useToast();
  const { t } = useLang();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin" || user?.role === "owner";
  const [showFlagForm, setShowFlagForm] = useState(false);
  const [flagProductName, setFlagProductName] = useState("");
  const [flagNote, setFlagNote] = useState("");
  // After a batch order: prompt to email
  const [emailPrompt, setEmailPrompt] = useState<{ poId: number; mailtoUrl: string; supplierName: string } | null>(null);

  const { data: queue = [], isLoading } = useQuery<ReorderItem[]>({
    queryKey: ["/api/work/reorder-queue"],
    queryFn: () => apiFetch("/api/work/reorder-queue"),
    refetchInterval: 30000,
  });

  const { data: flags = [], isLoading: flagsLoading } = useQuery<ShortageFlag[]>({
    queryKey: ["/api/work/shortage-flags"],
    queryFn: () => apiFetch("/api/work/shortage-flags"),
  });

  const flagMutation = useMutation({
    mutationFn: (data: { productName: string; note?: string }) =>
      apiFetch("/api/work/shortage-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work/shortage-flags"] });
      toast({ title: "Shortage flagged" });
      setFlagProductName(""); setFlagNote(""); setShowFlagForm(false);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/work/shortage-flags/${id}/resolve`, { method: "PUT" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work/shortage-flags"] });
      toast({ title: "Shortage resolved" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const activeFlags = flags.filter((f) => !f.resolvedAt);

  function handleOrderCreated(poId: number, supplierEmail: string | null, supplierName: string | null, items: ReorderItem[]) {
    if (supplierEmail && supplierName) {
      const mailtoUrl = buildMailtoLink(supplierEmail, supplierName, poId, items.map((i) => ({
        name: i.name,
        supplierSku: i.supplierSku,
        quantity: i.shortfall,
        unitCost: i.unitCost,
      })));
      setEmailPrompt({ poId, mailtoUrl, supplierName });
    }
  }

  // Group items by supplier
  const supplierGroups: SupplierGroup[] = [];
  const supplierMap = new Map<string, SupplierGroup>();
  for (const item of queue) {
    const key = item.supplierId != null ? String(item.supplierId) : "__none__";
    if (!supplierMap.has(key)) {
      const group: SupplierGroup = {
        supplierId: item.supplierId,
        supplierName: item.supplierName,
        supplierEmail: item.supplierEmail,
        orderMethod: item.supplierOrderMethod ?? "email",
        storeUrl: item.supplierStoreUrl ?? null,
        storePlatform: item.supplierStorePlatform ?? null,
        items: [],
      };
      supplierMap.set(key, group);
      supplierGroups.push(group);
    }
    supplierMap.get(key)!.items.push(item);
  }
  // Sort: suppliers with items first, no-supplier last
  supplierGroups.sort((a, b) => {
    if (a.supplierId == null && b.supplierId != null) return 1;
    if (a.supplierId != null && b.supplierId == null) return -1;
    return (a.supplierName ?? "").localeCompare(b.supplierName ?? "");
  });

  // Non-admin view
  if (!isAdmin) {
    return (
      <div className="flex flex-col min-h-full">
        <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm flex items-center gap-3">
          <Link href="/work/projects" className="p-2 -ml-2 rounded-full hover:bg-secondary-foreground/10 transition-colors">
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <h1 className="text-xl font-bold">{t("reorderReportShortage")}</h1>
        </div>
        <div className="p-4 space-y-4 pb-24">
          <div className="border-2 border-rose-200 bg-rose-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-bold text-rose-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> {t("reorderFlagDesc")}
            </p>
            <input
              type="text"
              placeholder={t("reorderPartName")}
              value={flagProductName}
              onChange={(e) => setFlagProductName(e.target.value)}
              className="w-full h-11 px-3 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
            <input
              type="text"
              placeholder={t("reorderNoteDetailed")}
              value={flagNote}
              onChange={(e) => setFlagNote(e.target.value)}
              className="w-full h-11 px-3 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
            <Button
              className="w-full h-11 font-bold bg-rose-600 hover:bg-rose-700 text-white"
              disabled={!flagProductName.trim() || flagMutation.isPending}
              onClick={() => flagMutation.mutate({ productName: flagProductName.trim(), note: flagNote.trim() || undefined })}
            >
              {t("reorderSubmitFlag")}
            </Button>
          </div>
          {activeFlags.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("reorderRecentFlags")}</p>
              {activeFlags.map((f) => (
                <div key={f.id} className="border rounded-xl p-3 text-sm">
                  <p className="font-semibold">{f.productName}</p>
                  {f.note && <p className="text-xs text-muted-foreground mt-0.5">{f.note}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!atLeast("standard")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 gap-3 max-w-md mx-auto">
        <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
          <Lock className="h-6 w-6 text-amber-600" />
        </div>
        <h2 className="text-lg font-black">One-click ordering is a Standard feature</h2>
        <p className="text-sm text-muted-foreground">
          On Lite you can see what's running low and who supplies it in the Suppliers tab. Upgrade to Standard to raise purchase orders here in one click.
        </p>
        <Link href="/admin/suppliers">
          <Button className="font-bold gap-1.5"><Truck className="h-4 w-4" /> Go to Suppliers</Button>
        </Link>
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
          <h1 className="text-xl font-bold">{t("reorderTitle")}</h1>
          <p className="text-xs opacity-70">{queue.length} {t("reorderSubtitle")}</p>
        </div>
        <Link href="/work/purchase-orders">
          <Button size="sm" variant="outline" className="font-bold h-9">
            <ShoppingCart className="h-3.5 w-3.5 mr-1" /> {t("reorderViewPO")}
          </Button>
        </Link>
      </div>

      <div className="p-4 space-y-5 pb-24">

        {/* Email prompt — shown after batch order if supplier has email */}
        {emailPrompt && (
          <div className="border-2 border-blue-300 bg-blue-50 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-sm text-blue-900">{t("reorderPoCreated")} #{emailPrompt.poId}</p>
                <p className="text-xs text-blue-700 mt-0.5">{t("reorderSendPrompt")} {emailPrompt.supplierName}?</p>
              </div>
              <button onClick={() => setEmailPrompt(null)} className="text-blue-400 hover:text-blue-600 flex-shrink-0">✕</button>
            </div>
            <div className="flex gap-2">
              <a href={emailPrompt.mailtoUrl} onClick={() => setEmailPrompt(null)}>
                <Button size="sm" className="h-9 font-bold gap-1.5 bg-blue-600 hover:bg-blue-700">
                  <Mail className="h-3.5 w-3.5" /> {t("reorderOpenEmail")}
                </Button>
              </a>
              <Link href={`/work/purchase-orders/${emailPrompt.poId}`} onClick={() => setEmailPrompt(null)}>
                <Button size="sm" variant="outline" className="h-9 font-semibold">{t("reorderViewPO")}</Button>
              </Link>
            </div>
          </div>
        )}

        {/* Shortage flags */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> {t("reorderShortageFlags")}
              {activeFlags.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">{activeFlags.length}</span>
              )}
            </h2>
            <Button size="sm" variant="outline" className="h-8 font-bold text-xs" onClick={() => setShowFlagForm((v) => !v)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> {t("reorderFlagShortage")}
            </Button>
          </div>

          {showFlagForm && (
            <div className="border-2 border-rose-200 bg-rose-50 rounded-xl p-3 space-y-3">
              <input
                type="text"
                placeholder={t("reorderPartName")}
                value={flagProductName}
                onChange={(e) => setFlagProductName(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border-2 border-input bg-background text-sm focus:outline-none"
              />
              <input
                type="text"
                placeholder={t("reorderNoteOpt")}
                value={flagNote}
                onChange={(e) => setFlagNote(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border-2 border-input bg-background text-sm focus:outline-none"
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => setShowFlagForm(false)}>{t("cancel")}</Button>
                <Button
                  size="sm" className="flex-1 h-9 font-bold bg-rose-600 hover:bg-rose-700"
                  disabled={!flagProductName.trim() || flagMutation.isPending}
                  onClick={() => flagMutation.mutate({ productName: flagProductName.trim(), note: flagNote.trim() || undefined })}
                >{t("reorderSubmit")}</Button>
              </div>
            </div>
          )}

          {flagsLoading ? <Skeleton className="h-16 rounded-xl" /> : activeFlags.length === 0 ? (
            <div className="text-center py-3 text-xs text-muted-foreground">{t("reorderNoFlags")}</div>
          ) : (
            <div className="space-y-2">
              {activeFlags.map((flag) => (
                <div key={flag.id} className="border-2 border-rose-200 bg-rose-50 rounded-xl p-3 flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-rose-900">{flag.productName}</p>
                    {flag.flaggedByUsername && <p className="text-xs text-rose-600">{flag.flaggedByUsername}</p>}
                    {flag.note && <p className="text-xs text-rose-700 mt-0.5">{flag.note}</p>}
                  </div>
                  <Button size="sm" variant="outline"
                    className="h-8 text-xs font-bold flex-shrink-0 border-rose-300 text-rose-700 hover:bg-rose-100"
                    onClick={() => resolveMutation.mutate(flag.id)} disabled={resolveMutation.isPending}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> {t("reorderResolve")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reorder queue — grouped by supplier */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
            <TrendingDown className="h-3.5 w-3.5" /> {t("reorderBelowMin")}
            {queue.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">{queue.length}</span>
            )}
          </h2>

          {isLoading ? (
            <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
          ) : queue.length === 0 ? (
            <div className="text-center py-10 px-4 bg-green-50 rounded-xl border border-green-200">
              <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <p className="font-semibold text-green-800">{t("reorderAllGood")}</p>
              <p className="text-xs text-green-600 mt-1">{t("reorderAllGoodDesc")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {supplierGroups.map((group, idx) => (
                <SupplierGroupCard
                  key={group.supplierId ?? `__none__${idx}`}
                  group={group}
                  activeFlags={activeFlags}
                  onOrderCreated={handleOrderCreated}
                />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
