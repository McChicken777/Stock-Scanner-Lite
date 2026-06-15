import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useLang } from "@/contexts/lang";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, ClipboardList, AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Material {
  id: number;
  name: string;
  category: string;
  totalStock: number;
  bufferStock: number;
  minStock: number;
}

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
  return res.json();
}

export default function StocktakePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useLang();
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [saved, setSaved] = useState(false);

  const { data: materials = [], isLoading } = useQuery<Material[]>({
    queryKey: ["/api/work/materials", "stocktake"],
    queryFn: () => apiFetch("/api/work/materials?includeRaw=1"),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const items = Object.entries(counts)
        .filter(([, v]) => v !== "")
        .map(([productId, v]) => ({ productId: Number(productId), newQuantity: Math.max(0, parseFloat(v) || 0) }));
      return apiFetch("/api/work/stocktake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
    },
    onSuccess: () => {
      setSaved(true);
      toast({ title: "Stock-take saved" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (user?.role !== "admin" && !user?.isSupervisor) {
    return <div className="p-6 text-center text-muted-foreground mt-20"><p>{t("stocktakeAdminOnly")}</p></div>;
  }

  const changedCount = Object.values(counts).filter((v) => v !== "").length;
  const discrepancies = materials.filter((m) => {
    const v = counts[m.id];
    return v !== "" && v !== undefined && parseFloat(v) !== m.totalStock;
  });

  return (
    <div className="p-4 space-y-4 pb-28">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-black">Stock-Take</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{t("stocktakeSubtitle")}</p>
        </div>
        {changedCount > 0 && !saved && (
          <Button
            className="font-bold gap-1.5 bg-green-600 hover:bg-green-700"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Save ({changedCount})
          </Button>
        )}
        {saved && (
          <Button variant="outline" className="gap-1.5" onClick={() => { setCounts({}); setSaved(false); }}>
            <RotateCcw className="h-4 w-4" /> {t("stocktakeNewCount")}
          </Button>
        )}
      </div>

      {discrepancies.length > 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5">
          <p className="text-sm font-bold text-orange-700 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> {discrepancies.length} {t("stocktakeDiscrepanciesFound")}
          </p>
          <ul className="mt-1 space-y-0.5">
            {discrepancies.map((m) => {
              const counted = parseFloat(counts[m.id]);
              const diff = counted - m.totalStock;
              return (
                <li key={m.id} className="text-xs text-orange-800 flex items-center justify-between">
                  <span className="truncate">{m.name}</span>
                  <span className="font-bold ml-2 flex-shrink-0">
                    {m.totalStock} → {counted} ({diff > 0 ? "+" : ""}{diff})
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {saved && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-3 text-center">
          <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-1" />
          <p className="font-bold text-green-800">{t("stocktakeComplete")}</p>
          <p className="text-xs text-green-700 mt-0.5">
            {changedCount} {t("stocktakeItemsUpdated")} · {discrepancies.length} {t("stocktakeCorrected")}
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : materials.length === 0 ? (
        <div className="text-center py-16 px-4 bg-muted/30 rounded-xl border border-dashed">
          <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <p className="font-semibold text-muted-foreground">{t("stocktakeNoMaterials")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("stocktakeNoMaterials")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground px-1">
            {t("stocktakeInstruction")}
          </p>
          {materials.map((m) => {
            const raw = counts[m.id];
            const touched = raw !== undefined && raw !== "";
            const counted = touched ? parseFloat(raw) : null;
            const isOk = touched && counted === m.totalStock;
            const isDiff = touched && counted !== null && !isNaN(counted) && counted !== m.totalStock;
            const isLow = m.bufferStock > 0 && m.totalStock < m.bufferStock;

            return (
              <div
                key={m.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-colors ${
                  isOk ? "bg-green-50 border-green-300"
                  : isDiff ? "bg-orange-50 border-orange-300"
                  : "bg-card border-border"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{m.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {t("stocktakeSystem")} <strong>{m.totalStock}</strong>
                    </span>
                    {isLow && (
                      <span className="text-[10px] font-bold text-orange-600 bg-orange-100 border border-orange-200 rounded-full px-1.5 py-0.5">
                        LOW
                      </span>
                    )}
                    {isOk && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                    {isDiff && counted !== null && !isNaN(counted) && (
                      <span className="text-[10px] font-bold text-orange-700">
                        Δ {counted - m.totalStock > 0 ? "+" : ""}{counted - m.totalStock}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <label className="text-xs text-muted-foreground">{t("stocktakeCounted")}</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    placeholder={String(m.totalStock)}
                    value={raw ?? ""}
                    onChange={(e) => {
                      setSaved(false);
                      setCounts((prev) => ({ ...prev, [m.id]: e.target.value }));
                    }}
                    className={`w-20 h-10 text-center rounded-lg border-2 bg-background text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                      isOk ? "border-green-400" : isDiff ? "border-orange-400" : "border-input"
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
