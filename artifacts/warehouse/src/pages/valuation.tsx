import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useLang } from "@/contexts/lang";
import { ArrowLeft, DollarSign, Package, TrendingUp, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ValuationProduct {
  productId: number;
  name: string;
  category: string;
  totalQty: number;
  unitCost: number;
  salePrice?: number;
  totalValue: number;
  totalRevenue?: number;
  totalMargin?: number;
}

interface ValuationCategory {
  category: string;
  productCount: number;
  totalQty: number;
  totalValue: number;
  totalRevenue?: number;
  totalMargin?: number;
  products: ValuationProduct[];
}

interface StockValuation {
  totalValue: number;
  totalRevenue?: number;
  totalMargin?: number;
  totalProducts: number;
  totalQty: number;
  productsWithoutCost: number;
  productsWithoutSalePrice?: number;
  categories: ValuationCategory[];
}

async function apiFetch(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load valuation");
  return res.json();
}

export default function ValuationPage() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { t } = useLang();
  const { data, isLoading, isError } = useQuery<StockValuation>({
    queryKey: ["/api/stock/valuation"],
    queryFn: () => apiFetch("/api/stock/valuation"),
  });

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm flex items-center gap-3">
        <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-secondary-foreground/10 transition-colors">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{t("valuationTitle")}</h1>
          <p className="text-xs opacity-70">{t("valuationSubtitle")}</p>
        </div>
      </div>

      <div className="p-4 space-y-5 pb-24">
        {isLoading ? (
          <>
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </>
        ) : isError || !data ? (
          <div className="p-6 text-center bg-destructive/5 rounded-xl border border-destructive/30">
            <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
            <p className="font-semibold">{t("valuationFailed")}</p>
          </div>
        ) : (
          <>
            <Card className="bg-primary text-primary-foreground border-none">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  <span className="text-xs font-bold uppercase tracking-wider opacity-80">{t("valuationTotalLabel")}</span>
                </div>
                <p className="text-4xl font-black font-mono">${Number(data.totalValue).toFixed(2)}</p>
                <div className="flex items-center gap-4 text-xs opacity-90 pt-1 border-t border-primary-foreground/20">
                  <span><span className="font-bold">{data.totalProducts}</span> {t("valuationProducts")}</span>
                  <span><span className="font-bold">{data.totalQty}</span> {t("valuationUnits")}</span>
                  {data.productsWithoutCost > 0 && (
                    <span className="ml-auto text-amber-200 font-bold">
                      <AlertTriangle className="h-3 w-3 inline mr-0.5" />
                      {data.productsWithoutCost} {t("valuationMissingCost")}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" /> {t("valuationByCategory")}
              </h2>
              {data.categories.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  {t("valuationNoStock")}
                </div>
              ) : (
                data.categories.map((cat) => {
                  const pct = data.totalValue > 0 ? (cat.totalValue / data.totalValue) * 100 : 0;
                  return (
                    <Card key={cat.category || "(uncategorized)"}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm truncate">{cat.category || t("valuationUncategorized")}</p>
                            <p className="text-xs text-muted-foreground">
                              {cat.productCount} product{cat.productCount !== 1 ? "s" : ""} · {cat.totalQty} unit{cat.totalQty !== 1 ? "s" : ""}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-black font-mono text-base">${Number(cat.totalValue).toFixed(2)}</p>
                            <p className="text-[10px] text-muted-foreground">{pct.toFixed(1)}% of total</p>
                          </div>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        {cat.products.length > 0 && (() => {
                          const key = cat.category || "(uncategorized)";
                          const isOpen = expanded[key] ?? false;
                          const visible = isOpen ? cat.products : cat.products.slice(0, 5);
                          return (
                            <div className="space-y-1 pt-1 border-t">
                              {visible.map((p) => (
                                <div key={p.productId} className="flex items-center justify-between text-xs gap-2">
                                  <span className="truncate flex-1">{p.name}</span>
                                  <span className="text-muted-foreground font-mono whitespace-nowrap">
                                    {p.totalQty} × ${Number(p.unitCost).toFixed(2)}
                                  </span>
                                  <span className="font-bold font-mono w-20 text-right">${Number(p.totalValue).toFixed(2)}</span>
                                </div>
                              ))}
                              {cat.products.length > 5 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="w-full h-7 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                                  onClick={() => setExpanded((s) => ({ ...s, [key]: !isOpen }))}
                                >
                                  {isOpen ? (
                                    <><ChevronUp className="h-3 w-3 mr-1" /> Show less</>
                                  ) : (
                                    <><ChevronDown className="h-3 w-3 mr-1" /> Show {cat.products.length - 5} more</>
                                  )}
                                </Button>
                              )}
                            </div>
                          );
                        })()}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
