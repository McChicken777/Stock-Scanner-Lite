import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLang } from "@/contexts/lang";
import { useRoute, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Loader2, Trophy, Truck, Bell, CheckCircle2, Clock } from "lucide-react";
import { useState } from "react";

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
  return res.json();
}

interface RfqDetail {
  id: number;
  status: "open" | "ordered" | "cancelled";
  note: string | null;
  decidedSupplierId: number | null;
  poId: number | null;
  items: { id: number; productName: string; quantity: number }[];
  suppliers: {
    id: number; supplierId: number; supplierName: string | null;
    status: "invited" | "submitted" | "declined";
    leadTimeDays: number | null; note: string | null; submittedAt: string | null;
    lines: { rfqItemId: number; unitPrice: number | null; supplierSku: string | null }[];
  }[];
}

const T = {
  en: {
    back: "Sourcing", item: "Item", qty: "Qty", total: "Total", lead: "Lead time",
    days: "days", cheapest: "Cheapest", fastest: "Fastest", waiting: "Waiting for response",
    order: "Order from this supplier", ordered: "Ordered ✓", orderedFrom: "Order placed",
    remind: "Remind non-responders", reminded: "Reminders sent", noResp: "No response yet",
    confirmOrder: "Create order from", emailSent: "Order email sent to supplier.",
    emailNotSent: "Order created. Email not sent (supplier has no email or SMTP not set up).",
    viewPo: "View purchase order", copyLink: "Copy link", copied: "Copied",
    decided: "Winner", noItems: "—",
  },
  sl: {
    back: "Nabava", item: "Izdelek", qty: "Kol.", total: "Skupaj", lead: "Rok dobave",
    days: "dni", cheapest: "Najceneje", fastest: "Najhitreje", waiting: "Čaka odgovor",
    order: "Naroči pri tem dobavitelju", ordered: "Naročeno ✓", orderedFrom: "Naročilo oddano",
    remind: "Opomni dobavitelje", reminded: "Opomniki poslani", noResp: "Še ni odgovora",
    confirmOrder: "Ustvari naročilo pri", emailSent: "E-naročilo poslano dobavitelju.",
    emailNotSent: "Naročilo ustvarjeno. E-pošta ni poslana (dobavitelj nima e-naslova ali SMTP ni nastavljen).",
    viewPo: "Odpri naročilo", copyLink: "Kopiraj povezavo", copied: "Kopirano",
    decided: "Zmagovalec", noItems: "—",
  },
};

export default function SourcingDetailPage() {
  const { lang } = useLang();
  const L = T[lang === "sl" ? "sl" : "en"];
  const [, params] = useRoute("/sourcing/:id");
  const [, setLocation] = useLocation();
  const id = Number(params?.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reminded, setReminded] = useState(false);

  const { data, isLoading } = useQuery<RfqDetail>({
    queryKey: [`/api/quote-requests/${id}`],
    queryFn: () => apiFetch(`/api/quote-requests/${id}`),
    refetchInterval: 30000,
  });

  const decideMutation = useMutation({
    mutationFn: (supplierId: number) => apiFetch(`/api/quote-requests/${id}/decide`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId }),
    }),
    onSuccess: (r: { emailSent: boolean }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/quote-requests/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/quote-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work/reorder-from-flags"] });
      toast({ title: r.emailSent ? L.emailSent : L.emailNotSent });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const remindMutation = useMutation({
    mutationFn: () => apiFetch(`/api/quote-requests/${id}/remind`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin: window.location.origin }),
    }),
    onSuccess: () => { setReminded(true); toast({ title: L.reminded }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (isLoading || !data) {
    return <div className="p-4 max-w-3xl mx-auto"><Skeleton className="h-64 w-full rounded-xl" /></div>;
  }

  const submitted = data.suppliers.filter((s) => s.status === "submitted");
  const pending = data.suppliers.filter((s) => s.status !== "submitted");

  // Per-supplier totals (only counting items they priced).
  const totals = new Map<number, number>();
  for (const s of submitted) {
    let sum = 0;
    for (const item of data.items) {
      const line = s.lines.find((l) => l.rfqItemId === item.id);
      if (line?.unitPrice != null) sum += line.unitPrice * item.quantity;
    }
    totals.set(s.id, sum);
  }
  const cheapestId = submitted.length > 0
    ? [...submitted].sort((a, b) => (totals.get(a.id) ?? Infinity) - (totals.get(b.id) ?? Infinity))[0]?.id
    : null;
  const withLead = submitted.filter((s) => s.leadTimeDays != null);
  const fastestId = withLead.length > 0
    ? [...withLead].sort((a, b) => (a.leadTimeDays ?? Infinity) - (b.leadTimeDays ?? Infinity))[0]?.id
    : null;

  const isOrdered = data.status === "ordered";

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <Link href="/sourcing" className="p-2 -ml-2 hover:bg-muted rounded-lg"><ArrowLeft className="h-5 w-5" /></Link>
        <div>
          <h1 className="text-xl font-bold">#{data.id}</h1>
          {data.note && <p className="text-xs text-muted-foreground">{data.note}</p>}
        </div>
      </div>

      {submitted.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
          <Clock className="h-8 w-8 opacity-40" />
          <p className="font-semibold">{L.waiting}</p>
          <p className="text-xs">{data.suppliers.length} invited · 0 responded</p>
        </div>
      ) : (
        <div className="overflow-x-auto border-2 border-border rounded-xl">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/40">
                <th className="text-left p-2 font-semibold sticky left-0 bg-muted/40 min-w-[140px]">{L.item}</th>
                <th className="text-center p-2 font-semibold w-12">{L.qty}</th>
                {submitted.map((s) => (
                  <th key={s.id} className="text-center p-2 font-semibold min-w-[110px]">
                    <div className="flex flex-col items-center gap-1">
                      <span className="truncate max-w-[110px]">{s.supplierName}</span>
                      <div className="flex gap-1">
                        {s.id === cheapestId && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-green-700 bg-green-100 rounded-full px-1.5 py-0.5"><Trophy className="h-2.5 w-2.5" />{L.cheapest}</span>}
                        {s.id === fastestId && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-blue-700 bg-blue-100 rounded-full px-1.5 py-0.5"><Truck className="h-2.5 w-2.5" />{L.fastest}</span>}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="p-2 font-medium sticky left-0 bg-card">{item.productName}</td>
                  <td className="p-2 text-center text-muted-foreground">{item.quantity}</td>
                  {submitted.map((s) => {
                    const line = s.lines.find((l) => l.rfqItemId === item.id);
                    return (
                      <td key={s.id} className="p-2 text-center">
                        {line?.unitPrice != null ? `${line.unitPrice.toFixed(2)}` : <span className="text-muted-foreground">{L.noItems}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t-2 border-border bg-muted/30 font-bold">
                <td className="p-2 sticky left-0 bg-muted/30">{L.total}</td>
                <td className="p-2"></td>
                {submitted.map((s) => (
                  <td key={s.id} className={`p-2 text-center ${s.id === cheapestId ? "text-green-700" : ""}`}>
                    {(totals.get(s.id) ?? 0).toFixed(2)}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-border text-xs">
                <td className="p-2 text-muted-foreground sticky left-0 bg-card">{L.lead}</td>
                <td className="p-2"></td>
                {submitted.map((s) => (
                  <td key={s.id} className={`p-2 text-center ${s.id === fastestId ? "text-blue-700 font-bold" : ""}`}>
                    {s.leadTimeDays != null ? `${s.leadTimeDays} ${L.days}` : "—"}
                  </td>
                ))}
              </tr>
              {!isOrdered && (
                <tr className="border-t border-border">
                  <td className="p-2 sticky left-0 bg-card"></td>
                  <td className="p-2"></td>
                  {submitted.map((s) => (
                    <td key={s.id} className="p-2 text-center">
                      <Button
                        size="sm"
                        className={`h-8 text-xs font-bold ${s.id === cheapestId ? "" : "variant-outline"}`}
                        variant={s.id === cheapestId ? "default" : "outline"}
                        disabled={decideMutation.isPending}
                        onClick={() => decideMutation.mutate(s.supplierId)}
                      >
                        {decideMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : L.order}
                      </Button>
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {isOrdered && (
        <div className="rounded-xl border-2 border-green-200 bg-green-50 p-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-green-800 font-bold">
            <CheckCircle2 className="h-5 w-5" />
            {L.orderedFrom}{data.decidedSupplierId != null && (() => {
              const w = data.suppliers.find((s) => s.supplierId === data.decidedSupplierId);
              return w ? ` — ${w.supplierName}` : "";
            })()}
          </div>
          {data.poId != null && (
            <Button variant="outline" size="sm" onClick={() => setLocation(`/work/purchase-orders/${data.poId}`)}>
              {L.viewPo}
            </Button>
          )}
        </div>
      )}

      {/* Non-responders */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{L.waiting} ({pending.length})</p>
            {!isOrdered && (
              <Button variant="outline" size="sm" className="gap-1.5" disabled={remindMutation.isPending || reminded} onClick={() => remindMutation.mutate()}>
                {remindMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                {reminded ? L.reminded : L.remind}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {pending.map((s) => (
              <span key={s.id} className="text-xs px-2.5 py-1 rounded-full border border-border bg-muted/30 text-muted-foreground">
                {s.supplierName} · {L.noResp}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
