import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import { useState } from "react";
import { useAuth, usePlan } from "@/contexts/auth";
import { useLang } from "@/contexts/lang";
import type { TranslationKey } from "@/i18n/translations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Edit2, Send, Check, X, Download, Rocket, Trash2, History, Briefcase, Loader2, Link2,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface QuoteFull {
  id: number;
  quoteNumber: string;
  status: "draft" | "sent" | "approved" | "rejected" | "converted" | "delivered";
  customerId: number | null;
  customerName: string | null;
  customerContact: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  validUntil: string | null;
  notes: string | null;
  terms: string | null;
  subtotal: number | string;
  discount: number | string;
  taxRate: number | string;
  taxAmount: number | string;
  total: number | string;
  workProjectId: number | null;
  issuerId: number | null;
  publicToken: string | null;
  createdAt: string;
  updatedAt: string;
  customer: { id: number; name: string; email: string | null; phone: string | null } | null;
  issuer: { id: number; name: string; email: string | null; phone: string | null } | null;
  items: { id: number; name: string; description: string | null; quantity: number | string; unitPrice: number | string; lineTotal: number | string; productId: number | null }[];
  revisions: { id: number; revisionNumber: number; note: string | null; createdAt: string; snapshot: { quote: Record<string, unknown>; items: Array<{ name: string; quantity: number; unitPrice: number; lineTotal: number }> } }[];
}

const statusBadge: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-300",
  sent: "bg-blue-100 text-blue-700 border-blue-300",
  approved: "bg-green-100 text-green-700 border-green-300",
  rejected: "bg-red-100 text-red-700 border-red-300",
  converted: "bg-purple-100 text-purple-700 border-purple-300",
  delivered: "bg-emerald-100 text-emerald-700 border-emerald-300",
};

const statusLabel: Record<string, TranslationKey> = {
  draft: "statusDraft",
  sent: "statusSent",
  approved: "statusApproved",
  rejected: "statusRejected",
  converted: "statusConverted",
  delivered: "statusDelivered",
};

const priorityLabel: Record<string, TranslationKey> = {
  low: "priorityLow",
  normal: "priorityNormal",
  high: "priorityHigh",
  urgent: "priorityUrgent",
};

export default function QuoteDetailPage() {
  const { user } = useAuth();
  const { atLeast } = usePlan();
  const { t } = useLang();
  const isAdmin = user?.role === "admin";
  const [, params] = useRoute("/quotes/:id");
  const id = params ? Number(params.id) : 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [convertOpen, setConvertOpen] = useState(false);
  const [openRevisionId, setOpenRevisionId] = useState<number | null>(null);
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");

  const { data: company } = useQuery<{ currency: string }>({
    queryKey: ["/api/company"],
    queryFn: () => fetch("/api/company", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
  });
  const currency = company?.currency ?? "EUR";
  const fmt = (amount: number | string) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount));

  const { data: quote, isLoading } = useQuery<QuoteFull>({
    queryKey: ["/api/quotes", id],
    queryFn: async () => {
      const res = await fetch(`/api/quotes/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!id,
  });

  const statusMut = useMutation({
    mutationFn: async (status: string) => {
      const res = await fetch(`/api/quotes/${id}/status`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/quotes"] });
      qc.invalidateQueries({ queryKey: ["/api/quotes", id] });
      toast({ title: t("quoteStatusUpdated") });
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/quotes/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({ title: t("quoteDeleted") });
      setLocation("/quotes");
    },
  });

  const convertMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/quotes/${id}/convert`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deadline, priority }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      return res.json();
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({ title: t("quoteSentToProduction") });
      setConvertOpen(false);
      setLocation(`/work/projects/${d.project.id}`);
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" }),
  });

  // Templates are matched to quote line items by productId so the convert preview can
  // flag which items will get production steps vs. land as empty items needing attention.
  const { data: templates = [] } = useQuery<{ id: number; name: string; productId: number | null }[]>({
    queryKey: ["/api/work/templates"],
    queryFn: async () => {
      const res = await fetch("/api/work/templates", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id && isAdmin,
  });
  const templateProductIds = new Set(
    templates.filter((t) => t.productId != null).map((t) => t.productId as number),
  );

  if (isLoading) return <div className="p-4"><Skeleton className="h-64 w-full rounded-xl" /></div>;
  if (!quote) return <div className="p-6 text-center text-muted-foreground">{t("quoteNotFound")}</div>;

  const itemsWithoutTemplate = quote.items.filter(
    (it) => it.productId == null || !templateProductIds.has(it.productId),
  );

  const editable = quote.status !== "converted";
  const customerDisplay = quote.customer?.name ?? quote.customerName ?? "—";

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm flex items-center gap-3">
        <Link href="/quotes" className="p-2 -ml-2 rounded-full hover:bg-secondary-foreground/10">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{quote.quoteNumber}</h1>
        </div>
        <Badge className={cn("text-[10px] uppercase font-bold", statusBadge[quote.status])}>{t(statusLabel[quote.status])}</Badge>
      </div>

      <div className="p-4 space-y-4 pb-24">
        {/* Customer block */}
        <div className="bg-card border-2 border-border rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{t("quoteCustomer")}</p>
          {quote.customerId ? (
            <Link href={`/customers/${quote.customerId}`}>
              <p className="font-bold text-lg hover:underline">{customerDisplay}</p>
            </Link>
          ) : (
            <p className="font-bold text-lg">{customerDisplay}</p>
          )}
          {(quote.customer?.email ?? quote.customerEmail) && (
            <p className="text-sm text-muted-foreground">{quote.customer?.email ?? quote.customerEmail}</p>
          )}
          {(quote.customer?.phone ?? quote.customerPhone) && (
            <p className="text-sm text-muted-foreground">{quote.customer?.phone ?? quote.customerPhone}</p>
          )}
          {quote.customerAddress && !quote.customer && (
            <p className="text-sm text-muted-foreground whitespace-pre-line">{quote.customerAddress}</p>
          )}
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="border-2 border-border rounded-lg p-2">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">{t("quoteCreated")}</p>
            <p className="font-semibold">{format(new Date(quote.createdAt), "dd MMM yyyy")}</p>
          </div>
          <div className="border-2 border-border rounded-lg p-2">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">{t("quoteValidUntil")}</p>
            <p className="font-semibold">{quote.validUntil ? format(new Date(quote.validUntil), "dd MMM yyyy") : "—"}</p>
          </div>
        </div>

        {/* Issuer */}
        {quote.issuer && (
          <div className="bg-card border-2 border-border rounded-xl p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{t("quoteIssuedBy")}</p>
            <p className="text-sm font-semibold">{quote.issuer.name}</p>
            <div className="text-xs text-muted-foreground space-y-0.5 mt-0.5">
              {quote.issuer.email && <p>{quote.issuer.email}</p>}
              {quote.issuer.phone && <p>{quote.issuer.phone}</p>}
            </div>
          </div>
        )}

        {/* Line items */}
        <div className="bg-card border-2 border-border rounded-xl divide-y divide-border">
          {quote.items.map((it) => (
            <div key={it.id} className="p-3 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{it.name}</p>
                {it.description && <p className="text-xs text-muted-foreground">{it.description}</p>}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {Number(it.quantity)} × {fmt(it.unitPrice)}
                </p>
              </div>
              <p className="font-mono font-bold text-sm">{fmt(it.lineTotal)}</p>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="bg-muted/30 border-2 border-border rounded-xl p-3 space-y-1.5 text-sm">
          <div className="flex justify-between"><span>{t("quoteSubtotal")}</span><span className="font-mono">{fmt(quote.subtotal)}</span></div>
          {Number(quote.discount) > 0 && <div className="flex justify-between text-muted-foreground"><span>{t("quoteDiscount")} ({Number(quote.discount)}%)</span><span className="font-mono">-{fmt(Number(quote.subtotal) * Number(quote.discount) / 100)}</span></div>}
          {Number(quote.taxRate) > 0 && <div className="flex justify-between text-muted-foreground"><span>{t("quoteTax")} ({Number(quote.taxRate)}%)</span><span className="font-mono">{fmt(quote.taxAmount)}</span></div>}
          <div className="border-t-2 border-border pt-2 flex justify-between text-lg font-black">
            <span>{t("quoteTotal")}</span><span className="font-mono">{fmt(quote.total)}</span>
          </div>
        </div>

        {quote.notes && (
          <div className="bg-card border-2 border-border rounded-xl p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{t("fieldNotes")}</p>
            <p className="text-sm whitespace-pre-line">{quote.notes}</p>
          </div>
        )}
        {quote.terms && (
          <div className="bg-card border-2 border-border rounded-xl p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{t("quoteTerms")}</p>
            <p className="text-sm whitespace-pre-line">{quote.terms}</p>
          </div>
        )}

        {/* Customer acceptance link — Standard/Pro, status = sent */}
        {atLeast("standard") && quote.status === "sent" && quote.publicToken && (
          <div className="bg-card border-2 border-primary/30 rounded-xl p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" /> {t("quoteCustomerLink")}
            </p>
            <p className="text-xs text-muted-foreground">{t("quoteCustomerLinkHelp")}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted rounded px-2 py-1.5 truncate font-mono">
                {`${window.location.origin}/q/${quote.publicToken}`}
              </code>
              <Button
                size="sm" variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/q/${quote.publicToken}`);
                  toast({ title: t("quoteLinkCopied") });
                }}
              >
                {t("quoteCopy")}
              </Button>
            </div>
          </div>
        )}

        {/* Lite: online approval link not available yet — give the admin a clear next step */}
        {!atLeast("standard") && quote.status === "sent" && (
          <div className="bg-muted/50 border border-border rounded-xl p-3 flex items-start gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">{t("quoteApprovalSoon")}</p>
          </div>
        )}

        {quote.workProjectId && (
          <Link href={`/work/projects/${quote.workProjectId}`}>
            <div className="bg-purple-50 border-2 border-purple-300 rounded-xl p-3 flex items-center gap-2 hover:bg-purple-100 cursor-pointer">
              <Briefcase className="h-5 w-5 text-purple-600" />
              <div className="flex-1">
                <p className="font-bold text-sm text-purple-800">{t("quoteLinkedWorkOrder")}</p>
                <p className="text-xs text-purple-600">{t("quoteTapToOpen")}{quote.workProjectId}</p>
              </div>
            </div>
          </Link>
        )}

        {quote.revisions.length > 0 && (
          <div className="bg-card border-2 border-border rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("quoteRevisionHistory")}</p>
            </div>
            <div className="space-y-2">
              {quote.revisions.map((r) => {
                const isOpen = openRevisionId === r.id;
                const snapTotal = (r.snapshot?.quote as { total?: number } | undefined)?.total;
                return (
                  <div key={r.id} className="border border-border rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenRevisionId(isOpen ? null : r.id)}
                      className="w-full flex items-center justify-between text-xs px-3 py-2 hover:bg-muted/50 transition-colors"
                    >
                      <span className="font-semibold text-left">v{r.revisionNumber} · {r.note ?? t("quoteRevisionEdited")}</span>
                      <span className="text-muted-foreground flex items-center gap-2">
                        {snapTotal != null && <span className="font-mono">{fmt(snapTotal)}</span>}
                        {format(new Date(r.createdAt), "dd MMM HH:mm")}
                        <span className="text-[10px]">{isOpen ? "▲" : "▼"}</span>
                      </span>
                    </button>
                    {isOpen && (
                      <div className="bg-muted/40 border-t border-border px-3 py-2 space-y-1">
                        {r.snapshot?.items?.length ? (
                          r.snapshot.items.map((it, i) => (
                            <div key={i} className="flex justify-between text-[11px] font-mono">
                              <span className="truncate pr-2">{it.name} × {it.quantity}</span>
                              <span>{fmt(it.lineTotal)}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-[11px] text-muted-foreground">{t("quoteNoSnapshot")}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        {isAdmin && (
          <div className="space-y-2">
            <a href={`/api/quotes/${id}/pdf`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="w-full h-11 gap-2 font-bold border-2">
                <Download className="h-4 w-4" /> {t("quoteDownloadPdf")}
              </Button>
            </a>

            {editable && (
              <Link href={`/quotes/${id}/edit`}>
                <Button variant="outline" className="w-full h-11 gap-2 font-bold border-2">
                  <Edit2 className="h-4 w-4" /> {t("quoteEditQuote")}
                </Button>
              </Link>
            )}

            {quote.status === "draft" && (
              <Button onClick={() => statusMut.mutate("sent")} disabled={statusMut.isPending} className="w-full h-11 gap-2 font-bold bg-blue-600 hover:bg-blue-700">
                <Send className="h-4 w-4" /> {t("quoteMarkAsSent")}
              </Button>
            )}
            {quote.status === "sent" && (
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => statusMut.mutate("approved")} disabled={statusMut.isPending} className="h-11 gap-1 font-bold bg-green-600 hover:bg-green-700">
                  <Check className="h-4 w-4" /> {t("statusApproved")}
                </Button>
                <Button onClick={() => statusMut.mutate("rejected")} disabled={statusMut.isPending} variant="outline" className="h-11 gap-1 font-bold border-2 border-red-300 text-red-700 hover:bg-red-50">
                  <X className="h-4 w-4" /> {t("statusRejected")}
                </Button>
              </div>
            )}
            {quote.status === "approved" && !quote.workProjectId && (
              <div className="space-y-2">
                <Button onClick={() => statusMut.mutate("delivered")} disabled={statusMut.isPending} className="w-full h-11 gap-2 font-bold bg-emerald-600 hover:bg-emerald-700">
                  <Check className="h-4 w-4" /> {t("quoteMarkDelivered")}
                </Button>
                {atLeast("standard") && (
                  <Button onClick={() => setConvertOpen(true)} className="w-full h-12 gap-2 font-bold bg-purple-600 hover:bg-purple-700 text-base">
                    <Rocket className="h-5 w-5" /> {t("quoteSendToProduction")}
                  </Button>
                )}
              </div>
            )}
            {quote.status === "delivered" && (
              <Button onClick={() => statusMut.mutate("approved")} disabled={statusMut.isPending} variant="outline" className="w-full h-10 gap-2 font-bold border-2">
                {t("quoteReopen")}
              </Button>
            )}

            {editable && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="w-full h-10 gap-2 text-destructive border-destructive/30">
                    <Trash2 className="h-4 w-4" /> {t("quoteDeleteQuote")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="w-[90vw] max-w-md rounded-xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("quoteDeleteTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("quoteDeleteDesc")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMut.mutate()} className="bg-destructive text-destructive-foreground">{t("delete")}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </div>

      {/* Convert dialog */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="w-[90vw] max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-purple-600" /> {t("quoteSendToProduction")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("quoteReviewItems")}
            </p>

            {/* Item preview — lets the boss check the order before confirming */}
            <div className="rounded-xl border-2 border-border bg-muted/20 p-3 space-y-1.5 max-h-56 overflow-y-auto">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {quote.items.length} {t("quoteItemsGoingToProduction")}
              </p>
              {quote.items.map((it) => {
                const hasTemplate = it.productId != null && templateProductIds.has(it.productId);
                const qty = Math.max(1, Math.floor(Number(it.quantity)));
                return (
                  <div key={it.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium truncate">
                      {qty > 1 && <span className="text-muted-foreground font-bold">{qty}× </span>}
                      {it.name}
                    </span>
                    {hasTemplate ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        <Check className="h-3 w-3" /> {t("quoteHasSteps")}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        <X className="h-3 w-3" /> {t("quoteNoTemplate")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {itemsWithoutTemplate.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {itemsWithoutTemplate.length} {t("quoteNoTemplateWarning")}
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-bold">{t("fieldDeadline")}</Label>
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="h-11 border-2" min={new Date().toISOString().split("T")[0]} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-bold">{t("fieldPriority")}</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {(["low", "normal", "high", "urgent"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={cn("h-10 rounded-lg border-2 font-bold text-xs uppercase",
                      priority === p ? "border-purple-500 bg-purple-50 text-purple-700" : "border-border bg-muted/30 text-muted-foreground"
                    )}
                  >{t(priorityLabel[p])}</button>
                ))}
              </div>
            </div>
            <Button
              onClick={() => convertMut.mutate()}
              disabled={!deadline || convertMut.isPending}
              className="w-full h-12 font-bold bg-purple-600 hover:bg-purple-700"
            >
              {convertMut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("quoteCreating")}</> : t("quoteCreateWorkOrder")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
