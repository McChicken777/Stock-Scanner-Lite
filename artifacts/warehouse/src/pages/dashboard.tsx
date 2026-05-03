import { useGetDashboardSummary } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Package, MapPin, AlertTriangle, Activity, DollarSign, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";

interface StockValuation {
  totalValue: number;
  totalRevenue: number;
  totalMargin: number;
  totalProducts: number;
  productsWithoutCost: number;
  productsWithoutSalePrice: number;
}

export default function Dashboard() {
  const { data: summary, isLoading, isError } = useGetDashboardSummary();
  const { data: valuation } = useQuery<StockValuation>({
    queryKey: ["/api/stock/valuation"],
    queryFn: async () => {
      const res = await fetch("/api/stock/valuation", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <h1 className="text-2xl font-bold tracking-tight px-1 pt-2">Overview</h1>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-64 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive mb-4" />
        <h2 className="text-lg font-semibold">Failed to load dashboard</h2>
        <p className="text-muted-foreground text-sm">Please try again later</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div className="px-1 pt-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/locations">
          <Card className="bg-secondary text-secondary-foreground border-none hover:bg-secondary/90 transition-colors cursor-pointer active:scale-95 duration-200">
            <CardContent className="p-4 flex flex-col gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <div className="space-y-0.5">
                <p className="text-3xl font-black">{summary.totalLocations}</p>
                <p className="text-xs font-medium text-secondary-foreground/70 uppercase tracking-wider">Locations</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/products">
          <Card className="bg-secondary text-secondary-foreground border-none hover:bg-secondary/90 transition-colors cursor-pointer active:scale-95 duration-200">
            <CardContent className="p-4 flex flex-col gap-2">
              <Package className="h-5 w-5 text-primary" />
              <div className="space-y-0.5">
                <p className="text-3xl font-black">{summary.totalProducts}</p>
                <p className="text-xs font-medium text-secondary-foreground/70 uppercase tracking-wider">Products</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Link href="/valuation">
        <Card className="bg-primary text-primary-foreground border-none hover:bg-primary/90 transition-colors cursor-pointer active:scale-95 duration-200">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary-foreground/15 flex items-center justify-center">
                <DollarSign className="h-5 w-5" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-medium uppercase tracking-wider opacity-80">Stock Value</p>
                <p className="text-2xl font-black font-mono leading-tight">
                  {valuation ? `$${Number(valuation.totalValue).toFixed(2)}` : "—"}
                </p>
              </div>
            </div>
            {valuation && valuation.productsWithoutCost > 0 && (
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Missing cost</p>
                <p className="text-sm font-bold flex items-center gap-1 justify-end">
                  <AlertTriangle className="h-3 w-3" /> {valuation.productsWithoutCost}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-secondary text-secondary-foreground border-none">
          <CardContent className="p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <p className="text-xs font-bold uppercase tracking-wider text-secondary-foreground/70">Potential Revenue</p>
            </div>
            <p className="text-xl font-black font-mono">
              {valuation ? `$${Number(valuation.totalRevenue).toFixed(2)}` : "—"}
            </p>
            {valuation && valuation.productsWithoutSalePrice > 0 && (
              <p className="text-[10px] text-secondary-foreground/70 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {valuation.productsWithoutSalePrice} missing price
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-emerald-600 text-white border-none">
          <CardContent className="p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              <p className="text-xs font-bold uppercase tracking-wider opacity-80">Potential Margin</p>
            </div>
            <p className="text-xl font-black font-mono">
              {valuation ? `$${Number(valuation.totalMargin).toFixed(2)}` : "—"}
            </p>
            {valuation && valuation.totalRevenue > 0 && (
              <p className="text-[10px] opacity-80">
                {((valuation.totalMargin / valuation.totalRevenue) * 100).toFixed(1)}% gross
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {summary.lowStockProducts.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {summary.lowStockProducts.slice(0, 3).map((product) => (
                <div key={product.id} className="flex justify-between items-center bg-background rounded-lg p-3 shadow-sm border border-border">
                  <div>
                    <p className="font-semibold text-sm">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-destructive">{product.totalStock}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">of {product.bufferStock} min</p>
                  </div>
                </div>
              ))}
              {summary.lowStockProducts.length > 3 && (
                <Link href="/products" className="text-xs font-semibold text-primary block text-center mt-2">
                  View all {summary.lowStockProducts.length} alerts
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {summary.recentActivity.slice(0, 5).map((entry) => (
              <div key={entry.id} className="flex gap-3 relative before:absolute before:left-[11px] before:top-6 before:bottom-[-16px] before:w-[2px] before:bg-muted last:before:hidden">
                <div className="mt-1">
                  <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold z-10 relative">
                    {entry.delta > 0 ? "+" : ""}
                  </div>
                </div>
                <div className="flex-1 pb-1">
                  <div className="flex justify-between items-start">
                    <p className="text-sm font-semibold">{entry.productName}</p>
                    <span className={`text-sm font-bold ${entry.delta > 0 ? "text-green-600" : "text-destructive"}`}>
                      {entry.delta > 0 ? "+" : ""}{entry.delta}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-0.5 text-xs text-muted-foreground">
                    <span>Loc: {entry.locationId}</span>
                    <span>{new Date(entry.changedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              </div>
            ))}
            {summary.recentActivity.length === 0 && (
              <p className="text-sm text-muted-foreground py-2 text-center">No recent activity</p>
            )}
          </div>
          {summary.recentActivity.length > 0 && (
            <Link href="/history" className="text-xs font-semibold text-primary block text-center mt-4">
              View full history
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}