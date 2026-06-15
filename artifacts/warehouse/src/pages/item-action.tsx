import { useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Minus, ClipboardCheck, ArrowLeftRight, Loader2, PackageOpen, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";

interface ProductStock {
  productId: number;
  name: string;
  category: string;
  bufferStock: number;
  totalStock: number;
  reserved: number;
  available: number;
  locations: { locationId: string; quantity: number }[];
}

type Action = "receive" | "consume" | "count" | "move";

const ACTIONS: { value: Action; label: string; reason: string; icon: typeof Plus }[] = [
  { value: "receive", label: "Receive", reason: "received", icon: Plus },
  { value: "consume", label: "Consume", reason: "consumed", icon: Minus },
  { value: "count",   label: "Count",   reason: "counted",  icon: ClipboardCheck },
  { value: "move",    label: "Move",    reason: "moved",    icon: ArrowLeftRight },
];

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error("Request failed");
  return r.json();
}

export default function ItemActionPage() {
  const [, params] = useRoute("/item/:productId");
  const productId = params?.productId ? Number(params.productId) : NaN;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [action, setAction] = useState<Action>("receive");
  const [locationId, setLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: stock, isLoading } = useQuery<ProductStock>({
    queryKey: ["/api/stock/product", productId],
    queryFn: () => getJSON(`/api/stock/product/${productId}`),
    enabled: !Number.isNaN(productId),
  });

  const { data: locations = [] } = useQuery<{ id: string }[]>({
    queryKey: ["/api/locations"],
    queryFn: () => getJSON("/api/locations"),
  });

  const current = stock?.locations.find((l) => l.locationId === locationId)?.quantity ?? 0;

  const refreshStock = () => {
    qc.invalidateQueries({ queryKey: ["/api/stock/product", productId] });
    qc.invalidateQueries({ queryKey: ["/api/raw-materials"] });
    qc.invalidateQueries({ queryKey: ["/api/work/materials"] });
  };

  const submit = async () => {
    const n = parseFloat(qty);
    if (!locationId) { toast({ title: action === "move" ? "Pick a source location" : "Pick a location", variant: "destructive" }); return; }
    if (Number.isNaN(n) || n <= 0) { toast({ title: "Enter a valid quantity", variant: "destructive" }); return; }

    const cfg = ACTIONS.find((a) => a.value === action)!;
    setSaving(true);
    try {
      if (action === "move") {
        if (!toLocationId) { toast({ title: "Pick a destination", variant: "destructive" }); return; }
        if (toLocationId === locationId) { toast({ title: "Source and destination must differ", variant: "destructive" }); return; }
        const r = await fetch(`/api/stock/transfer`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromLocationId: locationId, toLocationId, productId, quantity: n, changedBy: user?.username ?? null }),
        });
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
        refreshStock();
        toast({ title: `Moved ${n} — ${locationId} → ${toLocationId}` });
        setQty("");
        return;
      }

      const body: { quantity?: number; delta?: number; changedBy: string | null; reason: string } = {
        changedBy: user?.username ?? null,
        reason: cfg.reason,
      };
      if (action === "receive") body.delta = n;
      else if (action === "consume") body.delta = -n;
      else body.quantity = n; // count = absolute

      const r = await fetch(`/api/stock/${encodeURIComponent(locationId)}/${productId}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
      refreshStock();
      toast({ title: `${cfg.label} recorded — ${stock?.name}` });
      setQty("");
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    } finally { setSaving(false); }
  };

  if (Number.isNaN(productId)) {
    return <div className="p-6 text-center text-muted-foreground mt-20">Invalid item.</div>;
  }

  return (
    <div className="flex flex-col min-h-full pb-24">
      {/* Header */}
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/scan" className="p-2 -ml-2 rounded-full hover:bg-secondary-foreground/10 transition-colors">
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <div className="min-w-0">
            <p className="text-xs font-bold text-secondary-foreground/60 uppercase tracking-widest mb-0.5">Item</p>
            {isLoading ? (
              <Skeleton className="h-7 w-40" />
            ) : (
              <h1 className="text-xl font-black leading-none truncate">{stock?.name}</h1>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Stock summary */}
        {isLoading ? (
          <Skeleton className="h-20 w-full rounded-xl" />
        ) : stock ? (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border-2 border-border bg-card p-3 text-center">
              <p className="text-2xl font-black tabular-nums">{stock.totalStock}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">On hand</p>
            </div>
            <div className="rounded-xl border-2 border-border bg-card p-3 text-center">
              <p className="text-2xl font-black tabular-nums text-amber-600">{stock.reserved}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Reserved</p>
            </div>
            <div className="rounded-xl border-2 border-border bg-card p-3 text-center">
              <p className="text-2xl font-black tabular-nums text-green-600">{stock.available}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Free</p>
            </div>
          </div>
        ) : null}

        {/* Action picker */}
        <div className="flex gap-1 bg-muted p-1 rounded-xl">
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.value}
                onClick={() => setAction(a.value)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-bold transition-all ${
                  action === a.value ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" /> {a.label}
              </button>
            );
          })}
        </div>

        {/* Location (source) */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">{action === "move" ? "From location" : "Location"}</p>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none"
          >
            <option value="">Select a location…</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.id}</option>)}
          </select>
          {locationId && (
            <p className="text-xs text-muted-foreground mt-1">
              Currently <span className="font-bold">{current}</span> here
              {action === "count" && " — Count sets the new total at this location"}
            </p>
          )}
        </div>

        {/* Destination (move only) */}
        {action === "move" && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">To location</p>
            <select
              value={toLocationId}
              onChange={(e) => setToLocationId(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none"
            >
              <option value="">Select a destination…</option>
              {locations.filter((l) => l.id !== locationId).map((l) => <option key={l.id} value={l.id}>{l.id}</option>)}
            </select>
          </div>
        )}

        {/* Quantity */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">
            {action === "count" ? "Counted quantity" : "Quantity"}
          </p>
          <Input
            type="number" inputMode="decimal" min={0} step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
            className="h-14 text-2xl font-bold text-center border-2"
          />
        </div>

        <Button
          className="w-full h-14 text-base font-bold"
          disabled={saving || !locationId || !qty || (action === "move" && !toLocationId)}
          onClick={submit}
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Confirm {ACTIONS.find((a) => a.value === action)!.label}</>}
        </Button>

        {/* Per-location breakdown */}
        {stock && stock.locations.length > 0 && (
          <div className="pt-2">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Where it is</p>
            <div className="space-y-1.5">
              {stock.locations.map((l) => (
                <button
                  key={l.locationId}
                  onClick={() => setLocationId(l.locationId)}
                  className="w-full flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm hover:border-primary transition-colors"
                >
                  <span className="font-medium">{l.locationId}</span>
                  <span className="font-mono font-bold tabular-nums">{l.quantity}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {stock && stock.locations.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <PackageOpen className="h-7 w-7 mx-auto mb-1.5 opacity-40" />
            <p className="text-sm">No stock anywhere yet — Receive some to a location.</p>
          </div>
        )}

        <Link href="/scan" className="flex items-center justify-center gap-1.5 text-sm text-primary font-semibold pt-2">
          <Scan className="h-4 w-4" /> Scan another
        </Link>
      </div>
    </div>
  );
}
