import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLang } from "@/contexts/lang";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, FileText, Loader2, ChevronRight, Trash2, Check, Sparkles, Crown, Clock, ExternalLink, Zap, TrendingDown, CheckCircle2, AlertTriangle } from "lucide-react";
import { useState } from "react";

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

// ─── Low-stock reorder types ───────────────────────────────────────────────────

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

// ─── Per-category RFQ card ────────────────────────────────────────────────────

function CategoryRfqCard({ categoryName, items, suppliers }: {
  categoryName: string;
  items: ReorderQueueItem[];
  suppliers: Supplier[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [checkedSupplierIds, setCheckedSupplierIds] = useState<Set<number>>(
    () => new Set(suppliers.map((s) => s.id))
  );
  const [quantities, setQuantities] = useState<Record<number, number>>(
    () => Object.fromEntries(items.map((i) => [i.id, i.quantityNeeded || i.shortfall || 1]))
  );
  const [sent, setSent] = useState(false);

  const createMutation = useMutation({
    mutationFn: () => apiFetch("/api/quote-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((i) => ({
          productId: i.id,
          productName: i.name,
          quantity: quantities[i.id] ?? (i.quantityNeeded || i.shortfall || 1),
          flagId: i.flagIds?.[0] ?? null,
        })),
        supplierIds: Array.from(checkedSupplierIds),
        origin: window.location.origin,
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quote-requests"] });
      setSent(true);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (sent) {
    return (
      <div className="flex items-center gap-2 rounded-xl border-2 border-green-200 bg-green-50 px-4 py-3">
        <Check className="h-4 w-4 text-green-600" />
        <span className="text-sm font-semibold text-green-700">Quotes sent for {categoryName}</span>
      </div>
    );
  }

  return (
    <div className="border-2 border-amber-200 rounded-xl overflow-hidden bg-card">
      <div className="px-4 py-2.5 bg-amber-50 flex items-center gap-2">
        <TrendingDown className="h-4 w-4 text-amber-700 flex-shrink-0" />
        <h3 className="text-sm font-bold text-amber-800 flex-1">{categoryName}</h3>
        <span className="px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 text-[10px] font-bold">{items.length}</span>
      </div>

      <div className="divide-y divide-border/40 px-4">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 py-2">
            <span className="text-sm font-medium flex-1 min-w-0 truncate">{item.name}</span>
            <Input
              type="number"
              min={1}
              value={quantities[item.id] ?? (item.quantityNeeded || item.shortfall || 1)}
              onChange={(e) => setQuantities((q) => ({ ...q, [item.id]: Math.max(1, Number(e.target.value)) }))}
              className="h-7 border-2 w-16 text-center text-sm"
            />
          </div>
        ))}
      </div>

      <div className="px-4 py-3 border-t border-border/40 space-y-2">
        {suppliers.length === 0 ? (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span className="text-xs text-amber-700">
              No suppliers assigned to "{categoryName}" — go to the Suppliers tab to assign some.
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {suppliers.map((s) => {
              const checked = checkedSupplierIds.has(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setCheckedSupplierIds((set) => {
                    const n = new Set(set);
                    if (n.has(s.id)) n.delete(s.id); else n.add(s.id);
                    return n;
                  })}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border-2 text-xs font-semibold transition-colors ${checked ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                >
                  <span className={`h-3.5 w-3.5 rounded-sm border-2 flex items-center justify-center flex-shrink-0 ${checked ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                    {checked && <Check className="h-2.5 w-2.5 text-white" />}
                  </span>
                  {s.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border bg-muted/20">
        <Button
          size="sm"
          className="gap-1.5 font-bold"
          disabled={checkedSupplierIds.size === 0 || suppliers.length === 0 || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
          Send quotes
        </Button>
      </div>
    </div>
  );
}

// ─── Low-stock ordering: one card per category ────────────────────────────────

function LowStockOrdering() {
  const { t } = useLang();
  const { data: queue = [], isLoading } = useQuery<ReorderQueueItem[]>({
    queryKey: ["/api/work/reorder-from-flags"],
    queryFn: () => apiFetch("/api/work/reorder-from-flags"),
    refetchInterval: 60000,
  });

  const categories = [...new Set(queue.map((i) => i.category || "Uncategorised"))];
  const catKey = categories.sort().join(",");

  const { data: categorySuppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers/by-categories", catKey],
    queryFn: () => {
      const params = new URLSearchParams();
      categories.forEach((c) => params.append("cats[]", c));
      return apiFetch(`/api/suppliers/by-categories?${params.toString()}`);
    },
    enabled: categories.length > 0,
  });

  if (isLoading) return <Skeleton className="h-28 w-full rounded-xl" />;
  if (queue.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 font-semibold">
        <CheckCircle2 className="h-4 w-4" /> {t("suppliersAllStocked")}
      </div>
    );
  }

  const byCategory = queue.reduce<Record<string, ReorderQueueItem[]>>((acc, item) => {
    const cat = item.category || "Uncategorised";
    (acc[cat] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      {Object.entries(byCategory).map(([cat, items]) => (
        <CategoryRfqCard
          key={cat}
          categoryName={cat}
          items={items}
          suppliers={categorySuppliers.filter((s) => s.categories?.includes(cat))}
        />
      ))}
    </div>
  );
}

// ─── New request dialog (manual) ──────────────────────────────────────────────

interface DraftItem { key: string; productId: number | null; productName: string; quantity: number; flagId: number | null; category?: string }

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

  const [seeded, setSeeded] = useState(false);
  if (!seeded && reorder.length > 0) {
    setItems(reorder.map((r) => ({
      key: `flag-${r.id}`, productId: r.id, productName: r.name,
      quantity: Math.max(1, r.quantityNeeded || r.shortfall || 1), flagId: r.flagIds?.[0] ?? null,
      category: r.category,
    })));
    setSeeded(true);
  }

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
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{L.suppliers}</p>
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

// ─── Predicted cheapest supplier card ─────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────────────────────

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
