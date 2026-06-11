import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useLang } from "@/contexts/lang";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, AlertTriangle, ShoppingCart, CheckCircle2,
  Package2, TrendingDown, Plus, Mail, ChevronDown, ChevronUp,
  Truck, Building2, HelpCircle,
} from "lucide-react";

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
  items: ReorderItem[];
}

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
  return res.json();
}

function buildMailtoLink(supplierEmail: string, supplierName: string, poId: number, items: ReorderItem[]) {
  const subject = `Purchase Order #${poId} — Order Request`;
  const rows = items.map((item) => {
    const sku = item.supplierSku ? ` (SKU: ${item.supplierSku})` : "";
    const price = item.unitCost > 0 ? ` @ $${Number(item.unitCost).toFixed(2)} each` : "";
    return `  • ${item.name}${sku} — Qty: ${item.shortfall}${price}`;
  }).join("\n");
  const total = items.reduce((s, i) => s + i.estimatedReorderCost, 0);
  const totalLine = total > 0 ? `\n\nEstimated total: $${total.toFixed(2)}` : "";
  const body = `Dear ${supplierName},\n\nPlease process the following purchase order:\n\nPO #${poId}\n\n${rows}${totalLine}\n\nPlease confirm receipt and expected delivery date.\n\nThank you`;
  return `mailto:${supplierEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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

  const hasSupplier = group.supplierId != null;
  const allPending = group.items.every((i) => i.pendingPo != null);
  const totalCost = group.items.reduce((s, i) => s + (i.unitCost > 0 ? (quantities[i.id] ?? i.shortfall) * i.unitCost : 0), 0);

  const batchMutation = useMutation({
    mutationFn: () => apiFetch("/api/purchase-orders/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId: group.supplierId,
        items: group.items
          .filter((i) => !i.pendingPo)
          .map((i) => ({
            productId: i.id,
            quantityOrdered: Math.max(1, quantities[i.id] ?? i.shortfall),
            unitPrice: i.unitCost > 0 ? i.unitCost : null,
          })),
      }),
    }),
    onSuccess: (po) => {
      queryClient.invalidateQueries({ queryKey: ["/api/work/reorder-queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: `PO #${po.id} created` });
      onOrderCreated(po.id, group.supplierEmail, group.supplierName, group.items.filter((i) => !i.pendingPo));
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const itemsToOrder = group.items.filter((i) => !i.pendingPo);

  return (
    <div className="border-2 border-border rounded-xl overflow-hidden bg-card">
      {/* Supplier header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className={`flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 ${hasSupplier ? "bg-blue-100" : "bg-muted"}`}>
          {hasSupplier ? <Building2 className="h-4 w-4 text-blue-700" /> : <HelpCircle className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">{group.supplierName ?? t("reorderNoSupplier")}</p>
          <p className="text-xs text-muted-foreground">
            {group.items.length} {t("reorderItemsToReorder")}
            {totalCost > 0 && ` · est. $${totalCost.toFixed(2)}`}
          </p>
        </div>
        {group.supplierEmail && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5 flex-shrink-0">
            <Mail className="h-3 w-3" /> {group.supplierEmail}
          </span>
        )}
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
          <div className="border-t border-border bg-muted/20 px-4 py-3 flex items-center gap-2 flex-wrap">
            {allPending ? (
              <div className="flex items-center gap-2 text-sm text-green-700 font-semibold">
                <CheckCircle2 className="h-4 w-4" /> {t("reorderAllPending")}
              </div>
            ) : (
              <Button
                size="sm"
                className="h-9 font-bold gap-1.5"
                disabled={batchMutation.isPending || itemsToOrder.length === 0}
                onClick={() => batchMutation.mutate()}
              >
                {batchMutation.isPending
                  ? "Creating…"
                  : <><ShoppingCart className="h-3.5 w-3.5" /> Order {itemsToOrder.length} {t("reorderItemsToReorder")} from {group.supplierName ?? t("reorderNoSupplier")}</>}
              </Button>
            )}
            <Link href="/work/purchase-orders">
              <Button size="sm" variant="outline" className="h-9 font-semibold gap-1 text-xs">
                <Truck className="h-3.5 w-3.5" /> {t("reorderViewPO")}
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function ReorderQueuePage() {
  const { user } = useAuth();
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
      const mailtoUrl = buildMailtoLink(supplierEmail, supplierName, poId, items);
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
