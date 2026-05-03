import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, AlertTriangle, RefreshCw, ShoppingCart, CheckCircle2,
  Package2, TrendingDown, Plus,
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

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
  return res.json();
}

export default function ReorderQueuePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin" || user?.role === "owner";
  const [showFlagForm, setShowFlagForm] = useState(false);
  const [flagProductName, setFlagProductName] = useState("");
  const [flagNote, setFlagNote] = useState("");

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
      setFlagProductName("");
      setFlagNote("");
      setShowFlagForm(false);
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

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    ordered: "bg-blue-100 text-blue-700",
    partially_arrived: "bg-yellow-100 text-yellow-700",
    arrived: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
  };

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm flex items-center gap-3">
        <Link href="/work/projects" className="p-2 -ml-2 rounded-full hover:bg-secondary-foreground/10 transition-colors">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Reorder Queue</h1>
          <p className="text-xs opacity-70">{queue.length} items below min stock</p>
        </div>
        {isAdmin && (
          <Link href="/work/purchase-orders">
            <Button size="sm" variant="outline" className="font-bold h-9">
              <ShoppingCart className="h-3.5 w-3.5 mr-1" /> POs
            </Button>
          </Link>
        )}
      </div>

      <div className="p-4 space-y-5 pb-24">

        {/* Worker shortage flag section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Shortage Flags
              {activeFlags.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">
                  {activeFlags.length}
                </span>
              )}
            </h2>
            <Button size="sm" variant="outline" className="h-8 font-bold text-xs" onClick={() => setShowFlagForm((v) => !v)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Flag Shortage
            </Button>
          </div>

          {showFlagForm && (
            <div className="border-2 border-rose-200 bg-rose-50 rounded-xl p-3 space-y-3">
              <p className="text-xs font-bold text-rose-700">Report a missing or low part</p>
              <input
                type="text"
                placeholder="Part / product name"
                value={flagProductName}
                onChange={(e) => setFlagProductName(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
              />
              <input
                type="text"
                placeholder="Note (optional, e.g. needed for job #42)"
                value={flagNote}
                onChange={(e) => setFlagNote(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => setShowFlagForm(false)}>Cancel</Button>
                <Button
                  size="sm"
                  className="flex-1 h-9 font-bold bg-rose-600 hover:bg-rose-700"
                  disabled={!flagProductName.trim() || flagMutation.isPending}
                  onClick={() => flagMutation.mutate({ productName: flagProductName.trim(), note: flagNote.trim() || undefined })}
                >
                  Submit Flag
                </Button>
              </div>
            </div>
          )}

          {flagsLoading ? (
            <Skeleton className="h-16 rounded-xl" />
          ) : activeFlags.length === 0 ? (
            <div className="text-center py-4 text-xs text-muted-foreground">No active shortage flags</div>
          ) : (
            <div className="space-y-2">
              {activeFlags.map((flag) => (
                <div key={flag.id} className="border-2 border-rose-200 bg-rose-50 rounded-xl p-3 flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-rose-900">{flag.productName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {flag.quantityNeeded && (
                        <span className="text-xs font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
                          Need: {flag.quantityNeeded}
                        </span>
                      )}
                      {flag.flaggedByUsername && (
                        <span className="text-xs text-rose-600">by {flag.flaggedByUsername}</span>
                      )}
                    </div>
                    {flag.note && <p className="text-xs text-rose-700 mt-0.5">{flag.note}</p>}
                    <p className="text-[10px] text-rose-500 mt-1">
                      {new Date(flag.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs font-bold flex-shrink-0 border-rose-300 text-rose-700 hover:bg-rose-100"
                      onClick={() => resolveMutation.mutate(flag.id)}
                      disabled={resolveMutation.isPending}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Resolve
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reorder queue */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
            <TrendingDown className="h-3.5 w-3.5" /> Below Min Stock
            {queue.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                {queue.length}
              </span>
            )}
          </h2>

          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          ) : queue.length === 0 ? (
            <div className="text-center py-10 px-4 bg-green-50 rounded-xl border border-green-200">
              <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <p className="font-semibold text-green-800">All stock levels look good</p>
              <p className="text-xs text-green-600 mt-1">No items below minimum threshold</p>
            </div>
          ) : (
            <div className="space-y-2">
              {queue.map((item) => (
                <div key={item.id} className="border-2 border-amber-200 bg-amber-50 rounded-xl p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Package2 className="h-4 w-4 text-amber-600 flex-shrink-0" />
                        <p className="font-bold text-sm truncate">{item.name}</p>
                      </div>
                      {item.category && (
                        <p className="text-xs text-muted-foreground mt-0.5 ml-6">{item.category}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xl font-black text-amber-700 leading-none">{item.totalStock}</p>
                      <p className="text-[10px] text-muted-foreground">of {item.minStock} min</p>
                    </div>
                  </div>

                  {/* Worker shortage flag badges for this specific product */}
                  {activeFlags.filter((f) => f.productName.trim().toLowerCase() === item.name.trim().toLowerCase()).map((f) => (
                    <div key={f.id} className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
                      <AlertTriangle className="h-3 w-3 text-rose-600 flex-shrink-0" />
                      <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wide">Flagged by worker</span>
                      {f.flaggedByUsername && <span className="text-[10px] text-rose-600">({f.flaggedByUsername})</span>}
                      {f.note && <span className="text-[10px] text-rose-600 truncate">— {f.note}</span>}
                    </div>
                  ))}

                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">Total: <span className="font-bold text-foreground">{item.totalStock}</span></span>
                      {item.reserved > 0 && (
                        <span className="text-purple-700">Reserved: <span className="font-bold">{item.reserved}</span></span>
                      )}
                      <span className="text-foreground">Available: <span className="font-bold text-amber-700">{item.available}</span></span>
                    </div>
                    <div className="flex items-center gap-1 text-red-700 font-bold">
                      <RefreshCw className="h-3 w-3" />
                      Short by {item.shortfall} (min: {item.minStock})
                    </div>
                    {item.supplierName && (
                      <span className="text-muted-foreground">
                        Supplier: <span className="font-semibold">{item.supplierName}</span>
                      </span>
                    )}
                    {item.supplierSku && (
                      <span className="text-muted-foreground font-mono">SKU: {item.supplierSku}</span>
                    )}
                  </div>

                  {item.pendingPo ? (
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] font-bold ${statusColors[item.pendingPo.status] ?? "bg-gray-100 text-gray-700"}`}>
                        PO #{item.pendingPo.poId} · {item.pendingPo.status.replace("_", " ")} · qty {item.pendingPo.quantity}
                      </Badge>
                    </div>
                  ) : isAdmin ? (
                    <Link href={`/work/purchase-orders/new?productId=${item.id}`}>
                      <Button size="sm" className="w-full h-9 font-bold bg-amber-600 hover:bg-amber-700 text-white">
                        <ShoppingCart className="h-3.5 w-3.5 mr-1.5" /> Create Purchase Order
                      </Button>
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
