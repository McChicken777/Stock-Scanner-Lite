import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth";
import { useLang } from "@/contexts/lang";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Mail, Phone, MapPin, FileText, Trash2, Save, Plus, ChevronRight } from "lucide-react";
import { format } from "date-fns";

interface Customer {
  id: number;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
}

interface QuoteSummary {
  id: number;
  quoteNumber: string;
  status: string;
  total: number | string;
  createdAt: string;
  validUntil: string | null;
}

const statusColor: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  approved: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
  converted: "bg-purple-100 text-purple-700 border-purple-200",
};

export default function CustomerDetailPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { t } = useLang();
  const [, params] = useRoute("/customers/:id");
  const id = params ? Number(params.id) : 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState({ name: "", contactPerson: "", email: "", phone: "", address: "", notes: "" });

  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: ["/api/customers", id],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: quotes = [] } = useQuery<QuoteSummary[]>({
    queryKey: ["/api/customers", id, "quotes"],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${id}/quotes`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (customer) {
      setForm({
        name: customer.name,
        contactPerson: customer.contactPerson ?? "",
        email: customer.email ?? "",
        phone: customer.phone ?? "",
        address: customer.address ?? "",
        notes: customer.notes ?? "",
      });
    }
  }, [customer]);

  const updateMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/customers/${id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Customer updated" });
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/customers/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Customer deleted" });
      setLocation("/customers");
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  if (isLoading) return <div className="p-4 space-y-3"><Skeleton className="h-32 w-full rounded-xl" /></div>;
  if (!customer) return <div className="p-6 text-center text-muted-foreground">Customer not found</div>;

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm flex items-center gap-3">
        <Link href="/customers" className="p-2 -ml-2 rounded-full hover:bg-secondary-foreground/10">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-xl font-bold flex-1 truncate">{customer.name}</h1>
        <Link href={`/quotes/new?customerId=${customer.id}`}>
          <Button size="sm" variant="secondary" className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold gap-1">
            <Plus className="h-4 w-4" /> Quote
          </Button>
        </Link>
      </div>

      <div className="p-4 space-y-4 pb-24">
        {/* Edit form */}
        <div className="bg-card border-2 border-border rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("customersInfo")}</p>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">{t("fieldName")}</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10 border-2" disabled={!isAdmin} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{t("fieldContact")}</Label>
              <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} className="h-10 border-2" disabled={!isAdmin} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{t("fieldPhone")}</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-10 border-2" disabled={!isAdmin} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">{t("fieldEmail")}</Label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-10 border-2" disabled={!isAdmin} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">{t("fieldAddress")}</Label>
            <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="border-2 min-h-[60px]" disabled={!isAdmin} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">{t("fieldNotes")}</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="border-2 min-h-[60px]" disabled={!isAdmin} />
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <Button onClick={() => updateMut.mutate()} disabled={updateMut.isPending} className="flex-1 h-10 font-bold gap-1">
                <Save className="h-4 w-4" /> {updateMut.isPending ? t("saving") : t("save")}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="h-10 text-destructive border-destructive/40">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="w-[90vw] max-w-md rounded-xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("customersDeleteQ")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("customersDeleteDesc")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMut.mutate()} className="bg-destructive text-destructive-foreground">{t("delete")}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>

        {/* Contact quick links */}
        <div className="grid grid-cols-3 gap-2">
          {customer.email && (
            <a href={`mailto:${customer.email}`} className="bg-muted/30 border-2 border-border rounded-lg p-3 text-center hover:bg-muted">
              <Mail className="h-4 w-4 mx-auto mb-1" /><span className="text-[10px] font-bold uppercase">Email</span>
            </a>
          )}
          {customer.phone && (
            <a href={`tel:${customer.phone}`} className="bg-muted/30 border-2 border-border rounded-lg p-3 text-center hover:bg-muted">
              <Phone className="h-4 w-4 mx-auto mb-1" /><span className="text-[10px] font-bold uppercase">Call</span>
            </a>
          )}
          {customer.address && (
            <div className="bg-muted/30 border-2 border-border rounded-lg p-3 text-center">
              <MapPin className="h-4 w-4 mx-auto mb-1" /><span className="text-[10px] font-bold uppercase">Located</span>
            </div>
          )}
        </div>

        {/* Quote history */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">{t("customersQuoteHistory")}</p>
            <span className="text-xs text-muted-foreground">{quotes.length} quote{quotes.length !== 1 ? "s" : ""}</span>
          </div>
          {quotes.length === 0 ? (
            <div className="text-center py-8 bg-muted/30 rounded-xl border border-dashed">
              <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-semibold">{t("customersNoQuotes")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {quotes.map((q) => (
                <Link key={q.id} href={`/quotes/${q.id}`}>
                  <div className="bg-card border-2 border-border rounded-lg p-3 flex items-center justify-between gap-3 hover:border-primary/40 transition-colors cursor-pointer">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-sm">{q.quoteNumber}</p>
                        <Badge className={`text-[9px] uppercase ${statusColor[q.status]}`}>{q.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{format(new Date(q.createdAt), "dd MMM yyyy")}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-sm">${Number(q.total).toFixed(2)}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
