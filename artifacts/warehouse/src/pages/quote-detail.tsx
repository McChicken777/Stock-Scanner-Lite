import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import { useState } from "react";
import { useAuth } from "@/contexts/auth";
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
  ArrowLeft, Edit2, Send, Check, X, Download, Rocket, Trash2, History, Briefcase, Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface QuoteFull {
  id: number;
  quoteNumber: string;
  status: "draft" | "sent" | "approved" | "rejected" | "converted";
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
  createdAt: string;
  updatedAt: string;
  customer: { id: number; name: string; email: string | null; phone: string | null } | null;
  items: { id: number; name: string; description: string | null; quantity: number | string; unitPrice: number | string; lineTotal: number | string; productId: number | null }[];
  revisions: { id: number; revisionNumber: number; note: string | null; createdAt: string }[];
}

const statusBadge: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-300",
  sent: "bg-blue-100 text-blue-700 border-blue-300",
  approved: "bg-green-100 text-green-700 border-green-300",
  rejected: "bg-red-100 text-red-700 border-red-300",
  converted: "bg-purple-100 text-purple-700 border-purple-300",
};

export default function QuoteDetailPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [, params] = useRoute("/quotes/:id");
  const id = params ? Number(params.id) : 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [convertOpen, setConvertOpen] = useState(false);
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");

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
      toast({ title: "Status updated" });
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
      toast({ title: "Quote deleted" });
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
      toast({ title: "Sent to production!" });
      setConvertOpen(false);
      setLocation(`/work/projects/${d.project.id}`);
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" }),
  });

  if (isLoading) return <div className="p-4"><Skeleton className="h-64 w-full rounded-xl" /></div>;
  if (!quote) return <div className="p-6 text-center text-muted-foreground">Not found</div>;

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
        <Badge className={cn("text-[10px] uppercase font-bold", statusBadge[quote.status])}>{quote.status}</Badge>
      </div>

      <div className="p-4 space-y-4 pb-24">
        {/* Customer block */}
        <div className="bg-card border-2 border-border rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Customer</p>
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
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Created</p>
            <p className="font-semibold">{format(new Date(quote.createdAt), "dd MMM yyyy")}</p>
          </div>
          <div className="border-2 border-border rounded-lg p-2">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Valid Until</p>
            <p className="font-semibold">{quote.validUntil ? format(new Date(quote.validUntil), "dd MMM yyyy") : "—"}</p>
          </div>
        </div>

        {/* Line items */}
        <div className="bg-card border-2 border-border rounded-xl divide-y divide-border">
          {quote.items.map((it) => (
            <div key={it.id} className="p-3 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{it.name}</p>
                {it.description && <p className="text-xs text-muted-foreground">{it.description}</p>}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {Number(it.quantity)} × ${Number(it.unitPrice).toFixed(2)}
                </p>
              </div>
              <p className="font-mono font-bold text-sm">${Number(it.lineTotal).toFixed(2)}</p>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="bg-muted/30 border-2 border-border rounded-xl p-3 space-y-1.5 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">${Number(quote.subtotal).toFixed(2)}</span></div>
          {Number(quote.discount) > 0 && <div className="flex justify-between text-muted-foreground"><span>Discount</span><span className="font-mono">-${Number(quote.discount).toFixed(2)}</span></div>}
          {Number(quote.taxRate) > 0 && <div className="flex justify-between text-muted-foreground"><span>Tax ({Number(quote.taxRate)}%)</span><span className="font-mono">${Number(quote.taxAmount).toFixed(2)}</span></div>}
          <div className="border-t-2 border-border pt-2 flex justify-between text-lg font-black">
            <span>Total</span><span className="font-mono">${Number(quote.total).toFixed(2)}</span>
          </div>
        </div>

        {quote.notes && (
          <div className="bg-card border-2 border-border rounded-xl p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Notes</p>
            <p className="text-sm whitespace-pre-line">{quote.notes}</p>
          </div>
        )}
        {quote.terms && (
          <div className="bg-card border-2 border-border rounded-xl p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Terms</p>
            <p className="text-sm whitespace-pre-line">{quote.terms}</p>
          </div>
        )}

        {quote.workProjectId && (
          <Link href={`/work/projects/${quote.workProjectId}`}>
            <div className="bg-purple-50 border-2 border-purple-300 rounded-xl p-3 flex items-center gap-2 hover:bg-purple-100 cursor-pointer">
              <Briefcase className="h-5 w-5 text-purple-600" />
              <div className="flex-1">
                <p className="font-bold text-sm text-purple-800">Linked Work Order</p>
                <p className="text-xs text-purple-600">Tap to open #{quote.workProjectId}</p>
              </div>
            </div>
          </Link>
        )}

        {quote.revisions.length > 0 && (
          <div className="bg-card border-2 border-border rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Revision History</p>
            </div>
            <div className="space-y-1">
              {quote.revisions.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <span className="font-semibold">v{r.revisionNumber} · {r.note ?? "Edited"}</span>
                  <span className="text-muted-foreground">{format(new Date(r.createdAt), "dd MMM HH:mm")}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        {isAdmin && (
          <div className="space-y-2">
            <a href={`/api/quotes/${id}/pdf`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="w-full h-11 gap-2 font-bold border-2">
                <Download className="h-4 w-4" /> Download PDF
              </Button>
            </a>

            {editable && (
              <Link href={`/quotes/${id}/edit`}>
                <Button variant="outline" className="w-full h-11 gap-2 font-bold border-2">
                  <Edit2 className="h-4 w-4" /> Edit Quote
                </Button>
              </Link>
            )}

            {quote.status === "draft" && (
              <Button onClick={() => statusMut.mutate("sent")} disabled={statusMut.isPending} className="w-full h-11 gap-2 font-bold bg-blue-600 hover:bg-blue-700">
                <Send className="h-4 w-4" /> Mark as Sent
              </Button>
            )}
            {quote.status === "sent" && (
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => statusMut.mutate("approved")} disabled={statusMut.isPending} className="h-11 gap-1 font-bold bg-green-600 hover:bg-green-700">
                  <Check className="h-4 w-4" /> Approved
                </Button>
                <Button onClick={() => statusMut.mutate("rejected")} disabled={statusMut.isPending} variant="outline" className="h-11 gap-1 font-bold border-2 border-red-300 text-red-700 hover:bg-red-50">
                  <X className="h-4 w-4" /> Rejected
                </Button>
              </div>
            )}
            {quote.status === "approved" && !quote.workProjectId && (
              <Button onClick={() => setConvertOpen(true)} className="w-full h-12 gap-2 font-bold bg-purple-600 hover:bg-purple-700 text-base">
                <Rocket className="h-5 w-5" /> Send to Production
              </Button>
            )}

            {editable && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="w-full h-10 gap-2 text-destructive border-destructive/30">
                    <Trash2 className="h-4 w-4" /> Delete Quote
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="w-[90vw] max-w-md rounded-xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this quote?</AlertDialogTitle>
                    <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMut.mutate()} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
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
              <Rocket className="h-5 w-5 text-purple-600" /> Send to Production
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This creates a work order from the quoted items. If a quoted item has a matching template, its production steps will be copied in.
            </p>
            <div className="space-y-2">
              <Label className="text-sm font-bold">Deadline</Label>
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="h-11 border-2" min={new Date().toISOString().split("T")[0]} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-bold">Priority</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {(["low", "normal", "high", "urgent"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={cn("h-10 rounded-lg border-2 font-bold text-xs uppercase",
                      priority === p ? "border-purple-500 bg-purple-50 text-purple-700" : "border-border bg-muted/30 text-muted-foreground"
                    )}
                  >{p}</button>
                ))}
              </div>
            </div>
            <Button
              onClick={() => convertMut.mutate()}
              disabled={!deadline || convertMut.isPending}
              className="w-full h-12 font-bold bg-purple-600 hover:bg-purple-700"
            >
              {convertMut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…</> : "Create Work Order"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
