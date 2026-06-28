import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, Clock, AlertTriangle, FileText } from "lucide-react";
import { FabriflowMark } from "@/components/fabriflow-logo";

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
  return res.json();
}

interface QuotePublicData {
  valid: boolean;
  reason?: string;
  expired?: boolean;
  status?: string;
  companyName: string | null;
  customerName: string | null;
  quoteNumber: string;
  validUntil: string | null;
  subtotal: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes: string | null;
  terms: string | null;
  items: { name: string; description: string | null; quantity: number; unitPrice: number; lineTotal: number }[];
}

export default function QuotePublicPage() {
  const [, params] = useRoute("/q/:token");
  const token = params?.token ?? "";
  const [responded, setResponded] = useState<"accept" | "reject" | null>(null);

  const { data, isLoading, isError } = useQuery<QuotePublicData>({
    queryKey: [`/api/quote-public/${token}`],
    queryFn: () => apiFetch(`/api/quote-public/${token}`),
    retry: false,
  });

  const respondMutation = useMutation({
    mutationFn: (action: "accept" | "reject") =>
      apiFetch(`/api/quote-public/${token}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }),
    onSuccess: (_data, action) => setResponded(action),
  });

  const fmt = (n: number) =>
    new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  return (
    <div className="min-h-[100dvh] bg-muted/30 flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-6">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <FabriflowMark className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg">Fabriflow</span>
        </div>

        {isLoading && (
          <div className="space-y-3 bg-background rounded-xl border p-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {isError && (
          <div className="bg-background rounded-xl border p-8 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
            <h2 className="text-lg font-bold">Quote not found</h2>
            <p className="text-sm text-muted-foreground mt-1">This link may be invalid or the quote has been deleted.</p>
          </div>
        )}

        {data && !data.valid && (
          <div className="bg-background rounded-xl border p-8 text-center">
            {data.reason === "plan_not_supported" ? (
              <>
                <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <h2 className="text-lg font-bold">Online acceptance not available</h2>
                <p className="text-sm text-muted-foreground mt-1">Please contact the company directly to accept or decline this quote.</p>
              </>
            ) : (
              <>
                <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
                <h2 className="text-lg font-bold">Quote not found</h2>
                <p className="text-sm text-muted-foreground mt-1">This link may be invalid or expired.</p>
              </>
            )}
          </div>
        )}

        {data?.valid && responded && (
          <div className={`rounded-xl border-2 p-8 text-center ${responded === "accept" ? "border-green-200 bg-green-50" : "border-border bg-background"}`}>
            {responded === "accept" ? (
              <>
                <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3" />
                <h2 className="text-xl font-bold text-green-800">Quote Accepted</h2>
                <p className="text-sm text-green-700 mt-1">Thank you! The company has been notified and will follow up with you shortly.</p>
              </>
            ) : (
              <>
                <XCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <h2 className="text-xl font-bold">Quote Declined</h2>
                <p className="text-sm text-muted-foreground mt-1">The company has been notified of your decision.</p>
              </>
            )}
          </div>
        )}

        {data?.valid && !responded && (
          <>
            {/* Already-responded states */}
            {data.status === "approved" && (
              <div className="rounded-xl border-2 border-green-200 bg-green-50 p-6 text-center">
                <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <p className="font-bold text-green-800">This quote has already been accepted.</p>
              </div>
            )}
            {data.status === "rejected" && (
              <div className="rounded-xl border-2 border-border bg-muted/30 p-6 text-center">
                <XCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="font-bold text-muted-foreground">This quote has already been declined.</p>
              </div>
            )}
            {data.status !== "approved" && data.status !== "rejected" && data.expired && (
              <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-6 text-center">
                <Clock className="h-8 w-8 text-amber-600 mx-auto mb-2" />
                <p className="font-bold text-amber-800">This quote has expired.</p>
                <p className="text-sm text-amber-700 mt-1">Please contact the company for an updated quote.</p>
              </div>
            )}

            {/* Active quote */}
            {data.status === "sent" && !data.expired && (
              <div className="bg-background rounded-xl border shadow-sm overflow-hidden">
                <div className="p-6 border-b">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{data.companyName}</p>
                      <h1 className="text-2xl font-bold mt-0.5">Quote {data.quoteNumber}</h1>
                      {data.customerName && <p className="text-sm text-muted-foreground mt-0.5">For {data.customerName}</p>}
                    </div>
                    {data.validUntil && (
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-muted-foreground">Valid until</p>
                        <p className="font-bold text-sm">{new Date(data.validUntil).toLocaleDateString()}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Line items */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/40 text-left">
                        <th className="px-4 py-2 font-semibold">Item</th>
                        <th className="px-4 py-2 font-semibold text-center w-16">Qty</th>
                        <th className="px-4 py-2 font-semibold text-right w-24">Unit</th>
                        <th className="px-4 py-2 font-semibold text-right w-28">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((item, idx) => (
                        <tr key={idx} className="border-t border-border">
                          <td className="px-4 py-2.5">
                            <p className="font-medium">{item.name}</p>
                            {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                          </td>
                          <td className="px-4 py-2.5 text-center text-muted-foreground">{item.quantity}</td>
                          <td className="px-4 py-2.5 text-right">{fmt(item.unitPrice)}</td>
                          <td className="px-4 py-2.5 text-right font-medium">{fmt(item.lineTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals */}
                <div className="p-6 border-t bg-muted/20 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{fmt(data.subtotal)}</span>
                  </div>
                  {data.discount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Discount ({data.discount}%)</span>
                      <span className="text-green-700">-{fmt(data.subtotal * data.discount / 100)}</span>
                    </div>
                  )}
                  {data.taxRate > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax ({data.taxRate}%)</span>
                      <span>{fmt(data.taxAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-base border-t border-border pt-2 mt-2">
                    <span>Total</span>
                    <span>{fmt(data.total)}</span>
                  </div>
                </div>

                {/* Notes / Terms */}
                {(data.notes || data.terms) && (
                  <div className="px-6 pb-4 space-y-2 border-t">
                    {data.notes && (
                      <div className="pt-4">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Notes</p>
                        <p className="text-sm whitespace-pre-wrap">{data.notes}</p>
                      </div>
                    )}
                    {data.terms && (
                      <div className="pt-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Terms & Conditions</p>
                        <p className="text-sm whitespace-pre-wrap text-muted-foreground">{data.terms}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Accept / Decline */}
                <div className="p-6 border-t bg-background flex flex-col sm:flex-row gap-3">
                  <Button
                    className="flex-1 h-12 text-base font-bold gap-2"
                    disabled={respondMutation.isPending}
                    onClick={() => respondMutation.mutate("accept")}
                  >
                    <CheckCircle2 className="h-5 w-5" /> Accept Quote
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 h-12 text-base font-bold gap-2"
                    disabled={respondMutation.isPending}
                    onClick={() => respondMutation.mutate("reject")}
                  >
                    <XCircle className="h-5 w-5" /> Decline
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
