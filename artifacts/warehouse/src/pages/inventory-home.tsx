import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  ScanLine, MapPin, Package2, AlertTriangle, History as HistoryIcon,
  FileText, ChevronRight, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
  ClipboardList, Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ProductItem {
  id: number;
  name: string;
  totalStock: number;
  bufferStock: number;
  isLowStock: boolean;
  unit?: string;
}

interface HistoryEntry {
  id: number;
  productName?: string;
  action: string;
  changedBy?: string;
  reason?: string;
  delta?: number;
  createdAt: string;
}

interface QuoteItem {
  id: number;
  status: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  received: ArrowDownToLine,
  consumed: Minus,
  moved: ArrowLeftRight,
  transfer_in: ArrowDownToLine,
  transfer_out: ArrowUpFromLine,
  adjusted: ClipboardList,
  counted: ClipboardList,
};

function StatCard({
  label, value, icon: Icon, href, danger = false, loading = false,
}: {
  label: string; value: number; icon: React.ComponentType<{ className?: string }>;
  href: string; danger?: boolean; loading?: boolean;
}) {
  return (
    <Link href={href}>
      <div className={cn(
        "rounded-xl border p-4 flex flex-col gap-2 cursor-pointer transition-colors active:scale-95",
        danger && value > 0
          ? "border-red-500/40 bg-red-50 dark:bg-red-950/20"
          : "border-border bg-card hover:bg-muted/50"
      )}>
        <div className="flex items-center justify-between">
          <Icon className={cn("h-5 w-5", danger && value > 0 ? "text-red-500" : "text-muted-foreground")} />
          <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
        </div>
        {loading ? (
          <Skeleton className="h-8 w-12" />
        ) : (
          <p className={cn("text-3xl font-black tabular-nums", danger && value > 0 ? "text-red-600" : "text-foreground")}>
            {value}
          </p>
        )}
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider leading-none">{label}</p>
      </div>
    </Link>
  );
}

export default function InventoryHomePage() {
  const [, navigate] = useLocation();

  const { data: locations, isLoading: locLoading } = useQuery<{ id: string }[]>({
    queryKey: ["/api/locations"],
    queryFn: () => fetch("/api/locations", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
  });

  const { data: products, isLoading: prodLoading } = useQuery<ProductItem[]>({
    queryKey: ["/api/products"],
    queryFn: () => fetch("/api/products", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
  });

  const { data: history, isLoading: histLoading } = useQuery<HistoryEntry[]>({
    queryKey: ["/api/history", { limit: 5 }],
    queryFn: () => fetch("/api/history?limit=5", { credentials: "include" }).then((r) => r.json()),
    staleTime: 30_000,
  });

  const { data: quotes } = useQuery<QuoteItem[]>({
    queryKey: ["/api/quotes"],
    queryFn: () => fetch("/api/quotes", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
  });

  const locationCount = locations?.length ?? 0;
  const productCount = products?.length ?? 0;
  const lowStockItems = products?.filter((p) => p.isLowStock) ?? [];
  const pendingQuotes = quotes?.filter((q) => q.status === "approved") ?? [];

  return (
    <div className="p-4 max-w-2xl mx-auto w-full space-y-6 pb-28">
      <div className="pt-1">
        <h1 className="text-2xl font-black tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your warehouse at a glance</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Locations" value={locationCount} icon={MapPin} href="/locations" loading={locLoading} />
        <StatCard label="Items in stock" value={productCount} icon={Package2} href="/products" loading={prodLoading} />
        <StatCard label="Low stock" value={lowStockItems.length} icon={AlertTriangle} href="/products" danger loading={prodLoading} />
        <StatCard label="Quotes pending" value={pendingQuotes.length} icon={FileText} href="/quotes" />
      </div>

      {/* Low stock list */}
      {lowStockItems.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold uppercase tracking-wider text-red-600">Low stock ({lowStockItems.length})</p>
            <Link href="/products" className="text-xs font-semibold text-primary">See all →</Link>
          </div>
          <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/10 divide-y divide-red-100 dark:divide-red-900/20 overflow-hidden">
            {lowStockItems.slice(0, 5).map((p) => (
              <Link href="/products" key={p.id}>
                <div className="flex items-center justify-between px-4 py-3 hover:bg-red-100/50 dark:hover:bg-red-900/20 transition-colors">
                  <span className="text-sm font-semibold text-foreground truncate">{p.name}</span>
                  <span className="text-xs text-red-600 font-bold ml-2 flex-shrink-0">
                    {p.totalStock} / {p.bufferStock} {p.unit ?? ""}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recent activity */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Recent activity</p>
          <Link href="/history" className="text-xs font-semibold text-primary">See all →</Link>
        </div>
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {histLoading ? (
            [1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-none" />)
          ) : !history?.length ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No activity yet</div>
          ) : (
            history.map((h) => {
              const ActionIcon = ACTION_ICONS[h.action] ?? HistoryIcon;
              return (
                <div key={h.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                    <ActionIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{h.productName ?? "—"}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {h.action.replace(/_/g, " ")}
                      {h.changedBy ? ` · ${h.changedBy}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{timeAgo(h.createdAt)}</span>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Big scan button */}
      <Button
        size="lg"
        className="w-full h-16 text-lg font-bold gap-3 rounded-2xl shadow-lg"
        onClick={() => navigate("/scan")}
      >
        <ScanLine className="h-7 w-7" strokeWidth={2.5} />
        Scan location or item
      </Button>
    </div>
  );
}
