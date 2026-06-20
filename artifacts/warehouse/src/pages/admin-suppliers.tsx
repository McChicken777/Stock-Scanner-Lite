import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, usePlan } from "@/contexts/auth";
import { useLang } from "@/contexts/lang";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Mail, Phone, Edit2, Package2, ChevronDown, ChevronUp, AlertTriangle, ShoppingCart, Globe, CheckCircle2, Building2, HelpCircle, ExternalLink, Loader2, TrendingDown, Truck, Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";
import { buildMailtoLink, buildCartUrl } from "@/lib/ordering";

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

  // Group by category
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

// ─── Low-stock ordering (grouped by supplier) ────────────────────────────────────

interface ReorderQueueItem {
  id: number;
  name: string;
  category: string;
  shortfall: number;
  available: number;
  minStock: number;
  quantityNeeded: number;
  flagIds: number[];
  unitCost: number;
  supplierId: number | null;
  supplierSku: string | null;
  supplierName: string | null;
  supplierEmail: string | null;
  supplierOrderMethod: string;
  supplierStoreUrl: string | null;
  supplierStorePlatform: string | null;
  supplierLanguage: string;
  storeProductId: string | null;
  storeProductUrl: string | null;
  pendingPo: { poId: number; quantity: number; status: string } | null;
}

interface OrderGroup {
  supplierId: number | null;
  supplierName: string | null;
  supplierEmail: string | null;
  orderMethod: string;
  storeUrl: string | null;
  storePlatform: string | null;
  language: string;
  items: ReorderQueueItem[];
}

// A frozen snapshot of what was ordered, captured at confirm time. Rendering the
// done phase from this (not the live queue) keeps the checklist intact after the
// reorder-queue refetch re-tags those items with their new pending PO.
interface OrderLine {
  id: number;
  name: string;
  qty: number;
  unitCost: number;
  supplierSku: string | null;
  storeProductId: string | null;
  storeProductUrl: string | null;
  flagIds: number[];
}

function SupplierOrderCard({ group }: { group: OrderGroup }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [quantities, setQuantities] = useState<Record<number, number>>(
    Object.fromEntries(group.items.map((i) => [i.id, Math.max(1, i.shortfall)]))
  );
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"review" | "done">("review");
  const [resultPoId, setResultPoId] = useState<number | null>(null);
  const [mailtoUrl, setMailtoUrl] = useState<string | null>(null);
  const [openedItems, setOpenedItems] = useState<Set<number>>(new Set());
  const [orderedLines, setOrderedLines] = useState<OrderLine[]>([]);
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  async function sendOrderEmail(poId: number) {
    setEmailStatus("sending");
    try {
      const r = await apiFetch(`/api/purchase-orders/${poId}/send-email`, { method: "POST" });
      setEmailStatus(r?.sent ? "sent" : "failed");
    } catch {
      setEmailStatus("failed");
    }
  }

  const isWebStore = group.orderMethod === "web_store";
  const isCustomStore = isWebStore && group.storePlatform === "custom";
  const hasSupplier = group.supplierId != null;
  const itemsToOrder = group.items.filter((i) => !i.pendingPo);
  const allPending = itemsToOrder.length === 0;
  // Live total for the card header (reflects the current queue).
  const liveTotal = itemsToOrder.reduce(
    (s, i) => s + (i.unitCost > 0 ? (quantities[i.id] ?? i.shortfall) * i.unitCost : 0),
    0
  );

  // Lines shown in the dialog: live (editable) while reviewing, frozen snapshot once ordered.
  const reviewLines: OrderLine[] = itemsToOrder.map((i) => ({
    id: i.id,
    name: i.name,
    qty: Math.max(1, quantities[i.id] ?? i.shortfall),
    unitCost: i.unitCost,
    supplierSku: i.supplierSku,
    storeProductId: i.storeProductId,
    storeProductUrl: i.storeProductUrl,
    flagIds: i.flagIds ?? [],
  }));
  const dialogLines = phase === "review" ? reviewLines : orderedLines;
  const dialogTotal = dialogLines.reduce((s, l) => s + (l.unitCost > 0 ? l.qty * l.unitCost : 0), 0);
  const checkedCount = dialogLines.filter((l) => openedItems.has(l.id)).length;
  // Lines missing the data needed to auto-fill: a direct URL for custom stores, a variant ID otherwise.
  const missingStoreIds = isCustomStore
    ? dialogLines.filter((l) => !l.storeProductUrl)
    : isWebStore
      ? dialogLines.filter((l) => !l.storeProductId)
      : [];

  const markOrderedMutation = useMutation({
    mutationFn: async (poId: number) => {
      await apiFetch(`/api/purchase-orders/${poId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ordered" }),
      });
      // Now that the order is actually placed, resolve the flags so the items
      // leave the reorder list. (Done here, not at PO creation, so the checklist
      // stays on screen while the boss opens each product link.)
      const flagIds = orderedLines.flatMap((l) => l.flagIds);
      await Promise.allSettled(
        flagIds.map((fid) => apiFetch(`/api/work/shortage-flags/${fid}/resolve`, { method: "PUT" }))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work/reorder-from-flags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work/shortage-flags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Order marked as placed" });
      setOpen(false);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const batchMutation = useMutation({
    mutationFn: (lines: OrderLine[]) =>
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
    onSuccess: (po: { id: number }, lines) => {
      // Do NOT resolve flags or refetch the reorder list yet — that would drop this
      // supplier's items and unmount the card (closing the checklist). Flags are
      // resolved later, when the boss confirms "Order placed".
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      setResultPoId(po.id);
      if (isCustomStore) {
        // No combined cart URL for custom stores — the done-phase checklist opens
        // each product link individually (one user click per item avoids popup blocking).
      } else if (isWebStore && group.storeUrl) {
        const cartItems = lines.map((l) => ({ storeProductId: l.storeProductId, qty: Math.max(1, l.qty) }));
        window.open(buildCartUrl(group.storeUrl, group.storePlatform, cartItems), "_blank", "noopener,noreferrer");
      } else if (group.supplierEmail && group.supplierName) {
        setMailtoUrl(
          buildMailtoLink(
            group.supplierEmail,
            group.supplierName,
            po.id,
            lines.map((l) => ({ name: l.name, supplierSku: l.supplierSku, quantity: l.qty, unitCost: l.unitCost })),
            group.language === "sl" ? "sl" : "en"
          )
        );
        // Try to send it server-side; UI falls back to the mailto link if this fails.
        sendOrderEmail(po.id);
      }
      setPhase("done");
      toast({ title: `PO #${po.id} created` });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  function confirmOrder() {
    // Freeze what we're ordering before the mutation triggers a queue refetch.
    const snapshot = reviewLines;
    setOrderedLines(snapshot);
    batchMutation.mutate(snapshot);
  }

  function openReview() {
    setPhase("review");
    setResultPoId(null);
    setMailtoUrl(null);
    setOpenedItems(new Set());
    setOrderedLines([]);
    setEmailStatus("idle");
    setOpen(true);
  }

  const cartUrl =
    isWebStore && group.storeUrl
      ? buildCartUrl(
          group.storeUrl,
          group.storePlatform,
          dialogLines.map((l) => ({ storeProductId: l.storeProductId, qty: l.qty }))
        )
      : null;

  return (
    <div className="border-2 border-border rounded-xl overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 ${hasSupplier ? (isWebStore ? "bg-purple-100" : "bg-blue-100") : "bg-muted"}`}>
          {hasSupplier
            ? isWebStore
              ? <Globe className="h-4 w-4 text-purple-700" />
              : <Building2 className="h-4 w-4 text-blue-700" />
            : <HelpCircle className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate">{group.supplierName ?? "No supplier assigned"}</p>
          <p className="text-xs text-muted-foreground">
            {group.items.length} item{group.items.length !== 1 ? "s" : ""} low
            {liveTotal > 0 && ` · est. $${liveTotal.toFixed(2)}`}
          </p>
        </div>
        <span className={`flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0 ${isWebStore ? "text-purple-700 bg-purple-50 border border-purple-200" : "text-blue-600 bg-blue-50 border border-blue-200"}`}>
          {isWebStore ? <><Globe className="h-3 w-3" /> web store</> : <><Mail className="h-3 w-3" /> email</>}
        </span>
      </div>

      {/* Item list */}
      <div className="border-t border-border divide-y divide-border/60">
        {group.items.map((item) => (
          <div key={item.id} className="px-4 py-2 flex items-center gap-3 text-sm">
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{item.name}</p>
              <p className="text-xs text-amber-600 font-semibold">
                flagged low{item.quantityNeeded > 1 ? ` · qty ${item.quantityNeeded}` : ""}
                {item.pendingPo && <span className="text-blue-600 ml-1">· PO #{item.pendingPo.poId} pending</span>}
              </p>
            </div>
            {item.unitCost > 0 && <span className="text-xs text-muted-foreground">${Number(item.unitCost).toFixed(2)} ea</span>}
          </div>
        ))}
      </div>

      {/* Action */}
      <div className="border-t border-border bg-muted/20 px-4 py-3">
        {allPending ? (
          <div className="flex items-center gap-2 text-sm text-green-700 font-semibold">
            <CheckCircle2 className="h-4 w-4" /> All items already on order
          </div>
        ) : (
          <Button
            size="sm"
            className={`h-9 font-bold gap-1.5 ${isWebStore ? "bg-purple-600 hover:bg-purple-700" : ""}`}
            onClick={openReview}
          >
            <ShoppingCart className="h-3.5 w-3.5" /> Review & order {itemsToOrder.length} item{itemsToOrder.length !== 1 ? "s" : ""}
          </Button>
        )}
      </div>

      {/* Review / confirm dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              {isWebStore ? <Globe className="h-5 w-5 text-purple-600" /> : <Mail className="h-5 w-5 text-blue-600" />}
              {phase === "review" ? "Review order" : `PO #${resultPoId} created`}
            </DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">
              {phase === "review"
                ? <>Ordering from <span className="font-semibold">{group.supplierName ?? "no supplier"}</span> {isWebStore ? "via web store" : "by email"}. Adjust quantities, then confirm.</>
                : isCustomStore
                  ? "Open each item below, add it to your cart on the store, then check out. Mark the order placed when done."
                  : isWebStore
                    ? "We opened the store cart in a new tab. Finish checkout there, then mark the order as placed."
                    : "Open your email app to send the order, then it's tracked as a draft PO."}
            </p>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 p-3 space-y-1.5">
            {phase === "review" && missingStoreIds.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                {missingStoreIds.length} item{missingStoreIds.length !== 1 ? "s have" : " has"} no {isCustomStore ? "product link" : "store product ID"} and {missingStoreIds.length !== 1 ? "won't" : "won't"} be auto-added. Add {isCustomStore ? "links" : "IDs"} in the supplier's product list.
              </div>
            )}
            {dialogLines.map((line) => {
              const lineTotal = line.unitCost > 0 ? line.qty * line.unitCost : 0;
              return (
                <div key={line.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{line.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {line.unitCost > 0 ? `$${Number(line.unitCost).toFixed(2)} ea` : "no price"}
                      {lineTotal > 0 && ` · $${lineTotal.toFixed(2)}`}
                      {isCustomStore && !line.storeProductUrl && <span className="text-amber-600"> · no link</span>}
                      {isWebStore && !isCustomStore && !line.storeProductId && <span className="text-amber-600"> · no store ID</span>}
                    </p>
                  </div>
                  {phase === "review" ? (
                    <input
                      type="number"
                      min={1}
                      value={line.qty}
                      onChange={(e) => setQuantities((q) => ({ ...q, [line.id]: Math.max(1, Number(e.target.value)) }))}
                      className="w-16 h-9 text-sm text-center border-2 border-border rounded-lg font-bold outline-none focus:border-primary"
                    />
                  ) : (
                    <span className="text-sm font-bold w-16 text-center">×{line.qty}</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-4 border-t bg-background space-y-2">
            {dialogTotal > 0 && (
              <div className="flex items-center justify-between text-sm font-bold">
                <span>Estimated total</span>
                <span>${dialogTotal.toFixed(2)}</span>
              </div>
            )}
            {phase === "review" ? (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  className={`flex-1 font-bold gap-1.5 ${isWebStore ? "bg-purple-600 hover:bg-purple-700" : ""}`}
                  disabled={batchMutation.isPending || reviewLines.length === 0}
                  onClick={confirmOrder}
                >
                  {batchMutation.isPending
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> {isWebStore && !isCustomStore ? "Opening cart…" : "Creating…"}</>
                    : isCustomStore
                      ? <><Globe className="h-4 w-4" /> Confirm & list items</>
                      : isWebStore
                        ? <><Globe className="h-4 w-4" /> Confirm & open cart</>
                        : <><CheckCircle2 className="h-4 w-4" /> Confirm order</>}
                </Button>
              </div>
            ) : isCustomStore ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-muted-foreground">
                    {checkedCount} of {dialogLines.length} added to cart
                  </span>
                  {group.storeUrl && (
                    <a href={group.storeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-purple-700">
                      <ExternalLink className="h-3 w-3" /> Open store
                    </a>
                  )}
                </div>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {dialogLines.map((line) => {
                    const checked = openedItems.has(line.id);
                    return (
                      <div key={line.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${checked ? "border-green-300 bg-green-50" : "border-border"}`}>
                        <button
                          type="button"
                          title={checked ? "Added — tap to undo" : "Mark as added to cart"}
                          onClick={() => setOpenedItems((s) => {
                            const n = new Set(s);
                            if (n.has(line.id)) n.delete(line.id); else n.add(line.id);
                            return n;
                          })}
                          className={`h-6 w-6 flex-shrink-0 rounded-md border-2 flex items-center justify-center transition-colors ${checked ? "bg-green-500 border-green-500 text-white" : "border-muted-foreground/40 text-transparent hover:border-green-400"}`}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold truncate ${checked ? "line-through text-muted-foreground" : ""}`}>
                            {line.name} <span className="font-normal opacity-70">×{line.qty}</span>
                          </p>
                        </div>
                        {line.storeProductUrl ? (
                          <a href={line.storeProductUrl} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="outline" className="h-8 text-xs font-bold gap-1 border-purple-300 text-purple-700">
                              <ExternalLink className="h-3.5 w-3.5" /> Open
                            </Button>
                          </a>
                        ) : (
                          <span className="text-[10px] font-semibold text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> no link</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Open each item, add it to your cart on the store, then tick it. Confirm below once your whole cart is correct.
                </p>
                <Button
                  className="w-full font-bold gap-1.5 bg-purple-600 hover:bg-purple-700"
                  disabled={markOrderedMutation.isPending || resultPoId == null}
                  onClick={() => resultPoId != null && markOrderedMutation.mutate(resultPoId)}
                >
                  {markOrderedMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {checkedCount < dialogLines.length ? `Confirm whole order placed (${checkedCount}/${dialogLines.length})` : "Confirm — whole order placed"}
                </Button>
              </div>
            ) : isWebStore ? (
              <div className="flex gap-2">
                {cartUrl && (
                  <a href={cartUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                    <Button variant="outline" className="w-full font-semibold gap-1.5 border-purple-300 text-purple-700">
                      <ExternalLink className="h-4 w-4" /> Reopen cart
                    </Button>
                  </a>
                )}
                <Button
                  className="flex-1 font-bold gap-1.5 bg-purple-600 hover:bg-purple-700"
                  disabled={markOrderedMutation.isPending || resultPoId == null}
                  onClick={() => resultPoId != null && markOrderedMutation.mutate(resultPoId)}
                >
                  {markOrderedMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Order placed
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {emailStatus === "sending" && (
                  <div className="flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
                    <Loader2 className="h-4 w-4 animate-spin" /> Sending order to {group.supplierEmail}…
                  </div>
                )}
                {emailStatus === "sent" && (
                  <div className="flex items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
                    <CheckCircle2 className="h-4 w-4" /> Order emailed to {group.supplierEmail}
                  </div>
                )}
                {(emailStatus === "failed" || emailStatus === "idle") && (
                  <>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                      Couldn't send automatically (email isn't set up on the server). Open it in your own mail app instead:
                    </div>
                    {mailtoUrl && (
                      <a href={mailtoUrl} className="block">
                        <Button className="w-full font-bold gap-1.5 bg-blue-600 hover:bg-blue-700">
                          <Mail className="h-4 w-4" /> Open email to {group.supplierName ?? "supplier"}
                        </Button>
                      </a>
                    )}
                  </>
                )}
                <Button
                  variant={emailStatus === "sent" ? "default" : "outline"}
                  className="w-full font-semibold gap-1.5"
                  disabled={markOrderedMutation.isPending || resultPoId == null}
                  onClick={() => resultPoId != null && markOrderedMutation.mutate(resultPoId)}
                >
                  {markOrderedMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {emailStatus === "sent" ? "Mark as ordered" : "Mark as ordered anyway"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LowStockOrdering() {
  const { data: queue = [], isLoading } = useQuery<ReorderQueueItem[]>({
    queryKey: ["/api/work/reorder-from-flags"],
    queryFn: () => apiFetch("/api/work/reorder-from-flags"),
    refetchInterval: 60000,
  });

  // Group by supplier
  const groups: OrderGroup[] = [];
  const map = new Map<string, OrderGroup>();
  for (const item of queue) {
    const key = item.supplierId != null ? String(item.supplierId) : "__none__";
    if (!map.has(key)) {
      const g: OrderGroup = {
        supplierId: item.supplierId,
        supplierName: item.supplierName,
        supplierEmail: item.supplierEmail,
        orderMethod: item.supplierOrderMethod ?? "email",
        storeUrl: item.supplierStoreUrl ?? null,
        storePlatform: item.supplierStorePlatform ?? null,
        language: item.supplierLanguage ?? "en",
        items: [],
      };
      map.set(key, g);
      groups.push(g);
    }
    map.get(key)!.items.push(item);
  }
  groups.sort((a, b) => {
    if (a.supplierId == null && b.supplierId != null) return 1;
    if (a.supplierId != null && b.supplierId == null) return -1;
    return (a.supplierName ?? "").localeCompare(b.supplierName ?? "");
  });

  if (isLoading) {
    return <Skeleton className="h-28 w-full rounded-xl" />;
  }
  if (queue.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 font-semibold">
        <CheckCircle2 className="h-4 w-4" /> Everything's stocked — nothing needs reordering.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
        <TrendingDown className="h-4 w-4" /> Needs reorder
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">{queue.length}</span>
      </h2>
      {groups.map((g, idx) => (
        <SupplierOrderCard key={g.supplierId ?? `__none__${idx}`} group={g} />
      ))}
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

      {/* One-click ordering — what's low, grouped by supplier */}
      <LowStockOrdering />

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
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Order email language</p>
            <select
              value={formData.language}
              onChange={(e) => setFormData({ ...formData, language: e.target.value })}
              className="w-full h-9 px-2 rounded-lg border-2 border-input bg-background text-sm"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              <option value="en">English</option>
              <option value="sl">Slovenščina</option>
            </select>
            <p className="text-[11px] text-muted-foreground">The order email to this supplier is written in this language.</p>
          </div>

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
