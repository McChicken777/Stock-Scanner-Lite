import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useLang } from "@/contexts/lang";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Mail, Phone, Users, ChevronRight, X, FileText } from "lucide-react";

interface Customer {
  id: number;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
}

async function fetchCustomers(): Promise<Customer[]> {
  const res = await fetch("/api/customers", { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export default function CustomersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { t } = useLang();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", contactPerson: "", email: "", phone: "", address: "", notes: "" });

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["/api/customers"],
    queryFn: fetchCustomers,
  });

  const createMut = useMutation({
    mutationFn: async (d: typeof form) => {
      const res = await fetch("/api/customers", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/customers"] });
      setForm({ name: "", contactPerson: "", email: "", phone: "", address: "", notes: "" });
      setShowForm(false);
      toast({ title: "Customer added" });
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" }),
  });

  const filtered = customers.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.contactPerson?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-black">{t("customersTitle")}</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
            {customers.length} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/quotes">
            <Button size="sm" variant="outline" className="font-bold gap-1 border-2">
              <FileText className="h-4 w-4" /> {t("navQuotes")}
            </Button>
          </Link>
          {isAdmin && (
            <Button size="sm" className="font-bold gap-1" onClick={() => setShowForm((v) => !v)}>
              {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showForm ? t("cancel") : t("new")}
            </Button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="bg-card border-2 border-primary/30 rounded-xl p-4 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">{t("fieldName")} *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10 border-2" placeholder="Acme Corp" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{t("fieldContact")}</Label>
              <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} className="h-10 border-2" placeholder="John Doe" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{t("fieldPhone")}</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-10 border-2" placeholder="555-1234" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">{t("fieldEmail")}</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-10 border-2" placeholder="contact@acme.com" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">{t("fieldAddress")}</Label>
            <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="border-2 min-h-[60px]" placeholder="123 Main St, City" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">{t("fieldNotes")}</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="border-2 min-h-[60px]" />
          </div>
          <Button
            disabled={!form.name.trim() || createMut.isPending}
            onClick={() => createMut.mutate(form)}
            className="w-full h-11 font-bold"
          >
            {createMut.isPending ? t("saving") : t("customersSaveCustomer")}
          </Button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("customersSearchPlaceholder")}
          className="pl-9 h-10 border-2"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 px-4 bg-muted/30 rounded-xl border border-dashed">
          <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="font-semibold">{t("customersNoCustomers")}</p>
          {isAdmin && <p className="text-sm text-muted-foreground mt-1">{t("customersAddFirst")}</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <Link key={c.id} href={`/customers/${c.id}`}>
              <div className="bg-card border-2 border-border rounded-xl p-3 hover:border-primary/40 transition-colors cursor-pointer">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold truncate">{c.name}</p>
                    {c.contactPerson && <p className="text-xs text-muted-foreground truncate">{c.contactPerson}</p>}
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {c.email && <span className="flex items-center gap-1 truncate"><Mail className="h-3 w-3" />{c.email}</span>}
                      {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
