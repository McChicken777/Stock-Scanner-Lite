import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLang } from "@/contexts/lang";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, FileText, Loader2, ChevronRight, Trash2, Check, Sparkles, Crown, Clock, ExternalLink, Zap, TrendingDown, AlertTriangle, ShoppingCart, CheckCircle2, Building2, HelpCircle, Mail } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { buildMailtoLink } from "@/lib/ordering";

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || d.error || "Failed"); }
  return res.json();
}

interface Rfq {
  id: number;
  status: "open" | "ordered" | "cancelled";
  note: string | null;
  createdAt: string;
  itemCount: number;
  invitedCount: number;
  respondedCount: number;
}
interface ReorderItem {
  id: number; name: string; category: string; shortfall: number; quantityNeeded: number; flagIds: number[];
}
interface Supplier { id: number; name: string; email: string | null; categories?: string[] }

interface PriceHint { supplierId: number; supplierName: string | null; unitPrice: number; date: string }
interface PriceHistoryResp { latestPerSupplier: PriceHint[]; history: PriceHint[] }
interface PredictSupplier {
  supplierId: number; supplierName: string | null;
  covered: number; totalItems: number; missing: number[];
  estimatedTotal: number; complete: boolean; oldestPriceDate: string | null;
}
interface PredictResp { totalItems: number; suppliers: PredictSupplier[] }

const T = {
  en: {
    title: "Sourcing", subtitle: "Ask suppliers for prices, compare, and order the best.",
    newReq: "New request", noReqs: "No sourcing requests yet.",
    open: "Open", ordered: "Ordered", cancelled: "Cancelled",
    items: "items", responded: "responded", of: "of",
    dialogTitle: "New sourcing request", whatItems: "What do you need a quote for?",
    lowStock: "Low-stock items", addItem: "Add another item",
    itemName: "Item name", qty: "Qty", suppliers: "Ask which suppliers?",
    noSuppliers: "Add suppliers first (with email addresses).",
    note: "Note to suppliers (optional)", send: "Send request", sending: "Sending…",
    pickItem: "Add at least one item.", pickSupplier: "Select at least one supplier.",
    sent: "Request sent", delete: "Delete",
    pastPrices: "Past prices:",
    predTitle: "Predicted cheapest supplier", predSubtitle: "From your past quotes for the items you're low on.",
    predNone: "Not enough price history yet — send a request to start learning supplier prices.",
    predPriced: "priced", predEst: "Est. total", predBest: "Best match",
    predOldest: "oldest price", predNoPrice: "items without a known price",
    orderNow: "Order now", confirmOrder: "Confirm order?", yesOrder: "Yes, order", cancel: "Cancel",
    ordering: "Ordering…", orderPlaced: "Order placed", viewPo: "View purchase order",
    sendToConfirm: "Send request to confirm",
    needQuote: "Need every price to order instantly", getQuote: "Get a quote",
  },
  sl: {
    title: "Nabava", subtitle: "Vprašajte dobavitelje za cene, primerjajte in naročite najboljše.",
    newReq: "Novo povpraševanje", noReqs: "Še ni povpraševanj.",
    open: "Odprto", ordered: "Naročeno", cancelled: "Preklicano",
    items: "izdelkov", responded: "odgovorili", of: "od",
    dialogTitle: "Novo povpraševanje", whatItems: "Za kaj potrebujete ponudbo?",
    lowStock: "Izdelki z nizko zalogo", addItem: "Dodaj izdelek",
    itemName: "Ime izdelka", qty: "Kol.", suppliers: "Katere dobavitelje vprašati?",
    noSuppliers: "Najprej dodajte dobavitelje (z e-naslovi).",
    note: "Opomba dobaviteljem (neobvezno)", send: "Pošlji povpraševanje", sending: "Pošiljanje…",
    pickItem: "Dodajte vsaj en izdelek.", pickSupplier: "Izberite vsaj enega dobavitelja.",
    sent: "Povpraševanje poslano", delete: "Izbriši",
    pastPrices: "Pretekle cene:",
    predTitle: "Predvideni najcenejši dobavitelj", predSubtitle: "Iz preteklih ponudb za izdelke z nizko zalogo.",
    predNone: "Premalo zgodovine cen — pošljite povpraševanje, da začnete spremljati cene dobaviteljev.",
    predPriced: "s ceno", predEst: "Ocenjeni znesek", predBest: "Najboljša izbira",
    predOldest: "najstarejša cena", predNoPrice: "izdelkov brez znane cene",
    orderNow: "Naroči zdaj", confirmOrder: "Potrdi naročilo?", yesOrder: "Da, naroči", cancel: "Prekliči",
    ordering: "Naročanje…", orderPlaced: "Naročilo oddano", viewPo: "Ogled naročilnice",
    sendToConfirm: "Pošlji povpraševanje za potrditev",
    needQuote: "Za takojšnje naročilo so potrebne vse cene", getQuote: "Pridobi ponudbo",
  },
};

// ─── Low-stock ordering (moved from admin-suppliers) ──────────────────────────

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
  supplierLanguage: string;
  pendingPo: { poId: number; quantity: number; status: string } | null;
}

interface OrderGroup {
  supplierId: number | null;
  supplierName: string | null;
  supplierEmail: string | null;
  language: string;
  items: ReorderQueueItem[];
}

interface OrderLine {
  id: number;
  name: string;
  qty: number;
  unitCost: number;
  supplierSku: string | null;
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

  const hasSupplier = group.supplierId != null;
  const itemsToOrder = group.items.filter((i) => !i.pendingPo);
  const allPending = itemsToOrder.length === 0;
  const liveTotal = itemsToOrder.reduce(
    (s, i) => s + (i.unitCost > 0 ? (quantities[i.id] ?? i.shortfall) * i.unitCost : 0),
    0
  );

  const reviewLines: OrderLine[] = itemsToOrder.map((i) => ({
    id: i.id,
    name: i.name,
    qty: Math.max(1, quantities[i.id] ?? i.shortfall),
    unitCost: i.unitCost,
    supplierSku: i.supplierSku,
    flagIds: i.flagIds ?? [],
  }));
  const dialogLines = phase === "review" ? reviewLines : orderedLines;
  const dialogTotal = dialogLines.reduce((s, l) => s + (l.unitCost > 0 ? l.qty * l.unitCost : 0), 0);

  const markOrderedMutation = useMutation({
    mutationFn: async (poId: number) => {
      await apiFetch(`/api/purchase-orders/${poId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ordered" }),
      });
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
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      setResultPoId(po.id);
      if (group.supplierEmail && group.supplierName) {
        setMailtoUrl(
          buildMailtoLink(
            group.supplierEmail,
            group.supplierName,
            po.id,
            lines.map((l) => ({ name: l.name, supplierSku: l.supplierSku, quantity: l.qty, unitCost: l.unitCost })),
            group.language === "sl" ? "sl" : "en"
          )
        );
        sendOrderEmail(po.id);
      }
      setPhase("done");
      toast({ title: `PO #${po.id} created` });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  function confirmOrder() {
    setOrderedLines(reviewLines);
    batchMutation.mutate(reviewLines);
  }

  function openReview() {
    setPhase("review");
    setResultPoId(null);
    setMailtoUrl(null);
    setOrderedLines([]);
    setEmailStatus("idle");
    setOpen(true);
  }

  return (
    <div className="border-2 border-border rounded-xl overflow-hidden bg-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 ${hasSupplier ? "bg-blue-100" : "bg-muted"}`}>
          {hasSupplier
            ? <Building2 className="h-4 w-4 text-blue-700" />
            : <HelpCircle className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate">{group.supplierName ?? "No supplier assigned"}</p>
          <p className="text-xs text-muted-foreground">
            {group.items.length} item{group.items.length !== 1 ? "s" : ""} low
            {liveTotal > 0 && ` · est. $${liveTotal.toFixed(2)}`}
          </p>
        </div>
        <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5 flex-shrink-0">
          <Mail className="h-3 w-3" /> email
        </span>
      </div>

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

      <div className="border-t border-border bg-muted/20 px-4 py-3">
        {allPending ? (
          <div className="flex items-center gap-2 text-sm text-green-700 font-semibold">
            <CheckCircle2 className="h-4 w-4" /> All items already on order
          </div>
        ) : (
          <Button size="sm" className="h-9 font-bold gap-1.5" onClick={openReview}>
            <ShoppingCart className="h-3.5 w-3.5" /> Review & order {itemsToOrder.length} item{itemsToOrder.length !== 1 ? "s" : ""}
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-600" />
              {phase === "review" ? "Review order" : `PO #${resultPoId} created`}
            </DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">
              {phase === "review"
                ? <>Ordering from <span className="font-semibold">{group.supplierName ?? "no supplier"}</span> by email. Adjust quantities, then confirm.</>
                : "Open your email app to send the order, then it's tracked as a draft PO."}
            </p>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 p-3 space-y-1.5">
            {dialogLines.map((line) => {
              const lineTotal = line.unitCost > 0 ? line.qty * line.unitCost : 0;
              return (
                <div key={line.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{line.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {line.unitCost > 0 ? `$${Number(line.unitCost).toFixed(2)} ea` : "no price"}
                      {lineTotal > 0 && ` · $${lineTotal.toFixed(2)}`}
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
                  className="flex-1 font-bold gap-1.5"
                  disabled={batchMutation.isPending || reviewLines.length === 0}
                  onClick={confirmOrder}
                >
                  {batchMutation.isPending
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
                    : <><CheckCircle2 className="h-4 w-4" /> Confirm order</>}
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
  const { t } = useLang();
  const { data: queue = [], isLoading } = useQuery<ReorderQueueItem[]>({
    queryKey: ["/api/work/reorder-from-flags"],
    queryFn: () => apiFetch("/api/work/reorder-from-flags"),
    refetchInterval: 60000,
  });

  const groups: OrderGroup[] = [];
  const map = new Map<string, OrderGroup>();
  for (const item of queue) {
    const key = item.supplierId != null ? String(item.supplierId) : "__none__";
    if (!map.has(key)) {
      const g: OrderGroup = {
        supplierId: item.supplierId,
        supplierName: item.supplierName,
        supplierEmail: item.supplierEmail,
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

  if (isLoading) return <Skeleton className="h-28 w-full rounded-xl" />;
  if (queue.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 font-semibold">
        <CheckCircle2 className="h-4 w-4" /> {t("suppliersAllStocked")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
        <TrendingDown className="h-4 w-4" /> {t("reorderNeeds")}
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">{queue.length}</span>
      </h2>
      {groups.map((g, idx) => (
        <SupplierOrderCard key={g.supplierId ?? `__none__${idx}`} group={g} />
      ))}
    </div>
  );
}

// ─── End of Low-stock ordering ─────────────────────────────────────────────────

interface DraftItem { key: string; productId: number | null; productName: string; quantity: number; flagId: number | null; category?: string }

// Phase 1 — show what suppliers last charged for this product, inline under each row.
function PriceHints({ productId, label }: { productId: number; label: string }) {
  const { data } = useQuery<PriceHistoryResp>({
    queryKey: [`/api/quote-requests/price-history/${productId}`],
    queryFn: () => apiFetch(`/api/quote-requests/price-history/${productId}`),
    staleTime: 60_000,
  });
  const hints = data?.latestPerSupplier ?? [];
  if (hints.length === 0) return null;
  return (
    <p className="text-[11px] text-muted-foreground pl-1 -mt-1">
      <span className="font-semibold">{label}</span>{" "}
      {hints.slice(0, 3).map((h, i) => (
        <span key={h.supplierId}>
          {i > 0 && " · "}
          <span className="text-foreground font-medium">{h.unitPrice.toFixed(2)}</span>
          {h.supplierName ? ` ${h.supplierName}` : ""}
        </span>
      ))}
    </p>
  );
}

function NewRequestDialog({ onClose }: { onClose: () => void }) {
  const { lang } = useLang();
  const L = T[lang === "sl" ? "sl" : "en"];
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: reorder = [] } = useQuery<ReorderItem[]>({
    queryKey: ["/api/work/reorder-from-flags"],
    queryFn: () => apiFetch("/api/work/reorder-from-flags"),
  });
  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
    queryFn: () => apiFetch("/api/suppliers"),
  });

  const [items, setItems] = useState<DraftItem[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<Set<number>>(new Set());
  const [note, setNote] = useState("");

  // Seed the draft from low-stock the first time the data arrives.
  const [seeded, setSeeded] = useState(false);
  if (!seeded && reorder.length > 0) {
    setItems(reorder.map((r) => ({
      key: `flag-${r.id}`, productId: r.id, productName: r.name,
      quantity: Math.max(1, r.quantityNeeded || r.shortfall || 1), flagId: r.flagIds?.[0] ?? null,
      category: r.category,
    })));
    setSeeded(true);
  }

  // Derive unique categories from current items for supplier suggestion.
  const categories = [...new Set(items.map((i) => i.category).filter(Boolean) as string[])];
  const catKey = categories.sort().join(",");

  const { data: categorySuggestions = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers/by-categories", catKey],
    queryFn: () => {
      const params = new URLSearchParams();
      categories.forEach((c) => params.append("cats[]", c));
      return apiFetch(`/api/suppliers/by-categories?${params.toString()}`);
    },
    enabled: categories.length > 0,
  });

  // Apply category suggestions to the supplier selection exactly once after seeding.
  const suggestionsApplied = useRef(false);
  useEffect(() => {
    if (suggestionsApplied.current || !seeded || categorySuggestions.length === 0) return;
    suggestionsApplied.current = true;
    setSelectedSuppliers((prev) => {
      const next = new Set(prev);
      categorySuggestions.forEach((s) => next.add(s.id));
      return next;
    });
  }, [seeded, categorySuggestions]);

  const createMutation = useMutation({
    mutationFn: () => apiFetch("/api/quote-requests", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((i) => ({ productId: i.productId, productName: i.productName, quantity: i.quantity, flagId: i.flagId })),
        supplierIds: Array.from(selectedSuppliers),
        note: note.trim() || undefined,
        origin: window.location.origin,
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quote-requests"] });
      toast({ title: L.sent });
      onClose();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  function submit() {
    const valid = items.filter((i) => i.productName.trim());
    if (valid.length === 0) { toast({ title: L.pickItem, variant: "destructive" }); return; }
    if (selectedSuppliers.size === 0) { toast({ title: L.pickSupplier, variant: "destructive" }); return; }
    createMutation.mutate();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[88vh] flex flex-col p-0">
        <DialogHeader className="p-4 border-b">
          <DialogTitle>{L.dialogTitle}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{L.whatItems}</p>
            {items.map((it, idx) => (
              <div key={it.key} className="space-y-1">
                <div className="flex items-center gap-2">
                  <Input
                    value={it.productName}
                    onChange={(e) => setItems((arr) => arr.map((x, i) => i === idx ? { ...x, productName: e.target.value } : x))}
                    placeholder={L.itemName}
                    className="h-9 border-2 flex-1"
                  />
                  <Input
                    type="number" min={1} value={it.quantity}
                    onChange={(e) => setItems((arr) => arr.map((x, i) => i === idx ? { ...x, quantity: Math.max(1, Number(e.target.value)) } : x))}
                    className="h-9 border-2 w-16 text-center"
                  />
                  <button onClick={() => setItems((arr) => arr.filter((_, i) => i !== idx))} className="p-2 text-red-500 hover:bg-red-50 rounded">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {it.productId != null && <PriceHints productId={it.productId} label={L.pastPrices} />}
              </div>
            ))}
            <Button
              variant="outline" size="sm" className="gap-1.5"
              onClick={() => setItems((arr) => [...arr, { key: `manual-${Date.now()}`, productId: null, productName: "", quantity: 1, flagId: null }])}
            >
              <Plus className="h-3.5 w-3.5" /> {L.addItem}
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{L.suppliers}</p>
              {categorySuggestions.length > 0 && (
                <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
                  {categorySuggestions.length} suggested from item categories
                </span>
              )}
            </div>
            {suppliers.length === 0 ? (
              <p className="text-xs text-muted-foreground">{L.noSuppliers}</p>
            ) : suppliers.map((s) => {
              const checked = selectedSuppliers.has(s.id);
              return (
                <button
                  key={s.id} type="button"
                  onClick={() => setSelectedSuppliers((set) => { const n = new Set(set); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-left ${checked ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <span className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${checked ? "bg-primary border-primary text-white" : "border-muted-foreground/40"}`}>
                    {checked && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="text-sm font-semibold block truncate">{s.name}</span>
                    {!s.email && <span className="text-[10px] text-amber-600">no email — link must be shared manually</span>}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{L.note}</p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full px-3 py-2 border-2 rounded-lg text-sm" />
          </div>
        </div>
        <div className="p-4 border-t">
          <Button className="w-full h-11 font-bold" onClick={submit} disabled={createMutation.isPending}>
            {createMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {L.sending}</> : L.send}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Phase 2 — predicted cheapest supplier for the current low-stock basket.
// Predict-then-verify: order immediately from known prices, or send an RFQ to confirm.
function PredictedCard({ L, onSendRfq }: { L: typeof T["en"]; onSendRfq: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [placedPoId, setPlacedPoId] = useState<number | null>(null);

  const { data: reorder = [] } = useQuery<ReorderItem[]>({
    queryKey: ["/api/work/reorder-from-flags"],
    queryFn: () => apiFetch("/api/work/reorder-from-flags"),
  });

  const basket = reorder.map((r) => ({
    productId: r.id,
    quantity: Math.max(1, r.quantityNeeded || r.shortfall || 1),
    flagId: r.flagIds?.[0] ?? null,
  }));
  const productKey = basket.map((b) => `${b.productId}x${b.quantity}`).join(",");

  const { data: pred, isLoading } = useQuery<PredictResp>({
    queryKey: ["/api/quote-requests/predict", productKey],
    queryFn: () => apiFetch("/api/quote-requests/predict", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: basket.map((b) => ({ productId: b.productId, quantity: b.quantity })) }),
    }),
    enabled: basket.length > 0,
  });

  const orderMutation = useMutation({
    mutationFn: (supplierId: number) => apiFetch("/api/quote-requests/order-now", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId, items: basket }),
    }),
    onSuccess: (res: { poId: number }) => {
      setPlacedPoId(res.poId);
      setConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/quote-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work/reorder-from-flags"] });
      toast({ title: L.orderPlaced });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (basket.length === 0) return null;

  const ranked = (pred?.suppliers ?? []).filter((s) => s.covered > 0);

  return (
    <div className="border-2 border-primary/30 rounded-xl bg-primary/5 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h2 className="font-bold leading-tight">{L.predTitle}</h2>
          <p className="text-xs text-muted-foreground">{L.predSubtitle}</p>
        </div>
      </div>

      {placedPoId != null ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border-2 border-green-200 bg-green-50 px-3 py-2">
          <span className="text-sm font-semibold text-green-700">{L.orderPlaced}</span>
          <Link href={`/work/purchase-orders/${placedPoId}`} className="text-sm font-semibold text-green-700 inline-flex items-center gap-1 hover:underline">
            {L.viewPo} <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : isLoading ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : ranked.length === 0 ? (
        <p className="text-sm text-muted-foreground">{L.predNone}</p>
      ) : (
        <div className="space-y-2">
          {ranked.slice(0, 3).map((s, idx) => {
            const best = idx === 0;
            const oldest = s.oldestPriceDate ? new Date(s.oldestPriceDate).toLocaleDateString() : null;
            return (
              <div key={s.supplierId} className={`rounded-lg border-2 p-3 ${best ? "border-primary bg-card" : "border-border bg-card/60"}`}>
                <div className="flex items-center gap-2">
                  {best && <Crown className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                  <span className="font-semibold flex-1 min-w-0 truncate">{s.supplierName ?? `#${s.supplierId}`}</span>
                  <span className="text-lg font-bold tabular-nums">{s.estimatedTotal.toFixed(2)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-muted-foreground">
                  <span>{s.covered}/{s.totalItems} {L.predPriced}</span>
                  {!s.complete && <span className="text-amber-600">{s.missing.length} {L.predNoPrice}</span>}
                  {oldest && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {L.predOldest} {oldest}</span>}
                  {best && <span className="text-primary font-semibold">{L.predBest}</span>}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {!s.complete ? (
                    <>
                      <span className="text-[11px] text-amber-600 flex-1 min-w-0">{L.needQuote}</span>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={onSendRfq}>
                        <FileText className="h-3.5 w-3.5" /> {L.getQuote}
                      </Button>
                    </>
                  ) : confirmId === s.supplierId ? (
                    <>
                      <span className="text-xs font-semibold flex-1">{L.confirmOrder}</span>
                      <Button size="sm" variant="outline" onClick={() => setConfirmId(null)} disabled={orderMutation.isPending}>{L.cancel}</Button>
                      <Button size="sm" onClick={() => orderMutation.mutate(s.supplierId)} disabled={orderMutation.isPending}>
                        {orderMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : L.yesOrder}
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" className="gap-1.5" variant={best ? "default" : "outline"} onClick={() => setConfirmId(s.supplierId)}>
                      <Zap className="h-3.5 w-3.5" /> {L.orderNow}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          <button onClick={onSendRfq} className="text-xs font-semibold text-primary hover:underline">
            {L.sendToConfirm} →
          </button>
        </div>
      )}
    </div>
  );
}

export default function SourcingPage() {
  const { lang } = useLang();
  const L = T[lang === "sl" ? "sl" : "en"];
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showNew, setShowNew] = useState(false);

  const { data: rfqs = [], isLoading } = useQuery<Rfq[]>({
    queryKey: ["/api/quote-requests"],
    queryFn: () => apiFetch("/api/quote-requests"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => fetch(`/api/quote-requests/${id}`, { method: "DELETE", credentials: "include" }).then(() => {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/quote-requests"] }),
    onError: () => toast({ title: "Failed", variant: "destructive" }),
  });

  const statusLabel = (s: Rfq["status"]) => s === "open" ? L.open : s === "ordered" ? L.ordered : L.cancelled;
  const statusClass = (s: Rfq["status"]) =>
    s === "open" ? "bg-blue-50 text-blue-700 border-blue-200"
      : s === "ordered" ? "bg-green-50 text-green-700 border-green-200"
        : "bg-muted text-muted-foreground border-border";

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{L.title}</h1>
          <p className="text-sm text-muted-foreground">{L.subtitle}</p>
        </div>
        <Button className="gap-2" onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4" /> {L.newReq}
        </Button>
      </div>

      <PredictedCard L={L} onSendRfq={() => setShowNew(true)} />

      <LowStockOrdering />

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : rfqs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-3">
          <FileText className="h-10 w-10 opacity-40" />
          <p>{L.noReqs}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rfqs.map((r) => (
            <div key={r.id} className="flex items-center gap-2 border-2 border-border rounded-xl bg-card overflow-hidden">
              <Link href={`/sourcing/${r.id}`} className="flex items-center gap-3 px-4 py-3 flex-1 min-w-0 hover:bg-muted/40">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 border ${statusClass(r.status)}`}>{statusLabel(r.status)}</span>
                    <span className="text-sm font-semibold">#{r.id}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.itemCount} {L.items} · {r.respondedCount} {L.of} {r.invitedCount} {L.responded}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </Link>
              {r.status !== "ordered" && (
                <button onClick={() => deleteMutation.mutate(r.id)} className="p-3 text-red-500 hover:bg-red-50" title={L.delete}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showNew && <NewRequestDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}
