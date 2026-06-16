import { useState, useEffect, useMemo } from "react";
import { useLocation, Link, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useLang } from "@/contexts/lang";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Plus, X, FileText, User, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Customer {
  id: number;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}

interface Product {
  id: number;
  name: string;
  salePrice: number | string;
}

interface LineItem {
  id?: number;
  productId: number | null;
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

interface QuoteData {
  id: number;
  customerId: number | null;
  customerName: string | null;
  customerContact: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  validUntil: string | null;
  notes: string | null;
  terms: string | null;
  discount: number | string;
  taxRate: number | string;
  status: string;
  items: LineItem[];
}

export default function QuoteFormPage() {
  const { user } = useAuth();
  const { t } = useLang();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/quotes/:id/edit");
  const editingId = params ? Number(params.id) : null;
  const { toast } = useToast();
  const qc = useQueryClient();

  // URL param for new quote with pre-selected customer
  const initialCustomerId = useMemo(() => {
    if (editingId) return null;
    const url = new URL(window.location.href);
    const cid = url.searchParams.get("customerId");
    return cid ? Number(cid) : null;
  }, [editingId]);

  const [customerMode, setCustomerMode] = useState<"existing" | "manual">("existing");
  const [customerId, setCustomerId] = useState<number | null>(initialCustomerId);
  const [manualName, setManualName] = useState("");
  const [manualContact, setManualContact] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualAddress, setManualAddress] = useState("");

  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [discount, setDiscount] = useState("0");
  const [taxRate, setTaxRate] = useState("0");
  const [issuerId, setIssuerId] = useState<number | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);

  const [productSearch, setProductSearch] = useState("");
  const [showProductPicker, setShowProductPicker] = useState(false);

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: async () => (await fetch("/api/customers", { credentials: "include" })).json(),
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: async () => (await fetch("/api/products", { credentials: "include" })).json(),
  });

  const { data: issuers = [] } = useQuery<{ id: number; name: string; email: string | null; phone: string | null }[]>({
    queryKey: ["/api/quote-issuers"],
    queryFn: () => fetch("/api/quote-issuers", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
  });

  const { data: company } = useQuery<{ currency: string }>({
    queryKey: ["/api/company"],
    queryFn: () => fetch("/api/company", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
  });
  const currency = company?.currency ?? "USD";
  const fmt = (amount: number) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

  const { data: existing } = useQuery<QuoteData>({
    queryKey: ["/api/quotes", editingId],
    queryFn: async () => (await fetch(`/api/quotes/${editingId}`, { credentials: "include" })).json(),
    enabled: !!editingId,
  });

  useEffect(() => {
    if (existing && editingId) {
      setCustomerMode(existing.customerId ? "existing" : "manual");
      setCustomerId(existing.customerId);
      setManualName(existing.customerName ?? "");
      setManualContact(existing.customerContact ?? "");
      setManualEmail(existing.customerEmail ?? "");
      setManualPhone(existing.customerPhone ?? "");
      setManualAddress(existing.customerAddress ?? "");
      setValidUntil(existing.validUntil ? existing.validUntil.split("T")[0] : "");
      setNotes(existing.notes ?? "");
      setTerms(existing.terms ?? "");
      setDiscount(String(existing.discount ?? 0));
      setTaxRate(String(existing.taxRate ?? 0));
      setIssuerId((existing as any).issuerId ?? null);
      setItems(existing.items.map((it) => ({
        productId: it.productId,
        name: it.name,
        description: it.description ?? "",
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
      })));
    }
  }, [existing, editingId]);

  const subtotal = items.reduce((sum, it) => sum + (it.quantity * it.unitPrice), 0);
  // discount is a percentage (0–100)
  const afterDiscount = Math.max(0, subtotal * (1 - Number(discount || 0) / 100));
  const taxAmount = +(afterDiscount * (Number(taxRate || 0) / 100)).toFixed(2);
  const total = +(afterDiscount + taxAmount).toFixed(2);

  const addProduct = (p: Product) => {
    setItems((prev) => [...prev, {
      productId: p.id,
      name: p.name,
      description: "",
      quantity: 1,
      unitPrice: Number(p.salePrice ?? 0),
    }]);
    setShowProductPicker(false);
    setProductSearch("");
  };

  const addFreeText = () => {
    setItems((prev) => [...prev, { productId: null, name: "", description: "", quantity: 1, unitPrice: 0 }]);
  };

  const updateItem = (idx: number, patch: Partial<LineItem>) => {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = {
        customerId: customerMode === "existing" ? customerId : null,
        customerName: customerMode === "manual" ? manualName : null,
        customerContact: customerMode === "manual" ? manualContact : null,
        customerEmail: customerMode === "manual" ? manualEmail : null,
        customerPhone: customerMode === "manual" ? manualPhone : null,
        customerAddress: customerMode === "manual" ? manualAddress : null,
        validUntil: validUntil || null,
        notes: notes || null,
        terms: terms || null,
        discount: Number(discount || 0),
        taxRate: Number(taxRate || 0),
        issuerId: issuerId ?? null,
        items: items.filter((it) => it.name.trim()).map((it, idx) => ({
          productId: it.productId,
          name: it.name.trim(),
          description: it.description || null,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          sortOrder: idx,
        })),
      };
      const url = editingId ? `/api/quotes/${editingId}` : "/api/quotes";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      return res.json();
    },
    onSuccess: (q) => {
      qc.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({ title: editingId ? t("quoteFormUpdated") : t("quoteFormCreated") });
      setLocation(`/quotes/${q.id}`);
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" }),
  });

  if (user?.role !== "admin") {
    return <div className="p-6 text-center text-muted-foreground mt-20">{t("adminOnly")}</div>;
  }

  const customerValid =
    (customerMode === "existing" && customerId !== null) ||
    (customerMode === "manual" && manualName.trim().length > 0);
  const canSubmit = customerValid && items.some((it) => it.name.trim());

  const filteredProducts = products.filter((p) => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()));

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-secondary text-secondary-foreground p-4 sticky top-0 z-20 shadow-sm flex items-center gap-3">
        <Link href={editingId ? `/quotes/${editingId}` : "/quotes"} className="p-2 -ml-2 rounded-full hover:bg-secondary-foreground/10">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-xl font-bold">{editingId ? t("quoteEditQuote") : t("quoteFormNewTitle")}</h1>
      </div>

      <div className="p-4 space-y-5 pb-24">
        {/* Customer mode toggle */}
        <div className="grid grid-cols-2 gap-2 rounded-xl border-2 border-border p-1 bg-muted/30">
          <button
            type="button"
            onClick={() => setCustomerMode("existing")}
            className={cn("rounded-lg py-2.5 text-sm font-bold transition-all flex items-center justify-center gap-1.5",
              customerMode === "existing" ? "bg-card shadow text-foreground" : "text-muted-foreground")}
          >
            <User className="h-3.5 w-3.5" /> {t("quoteFormPickCustomer")}
          </button>
          <button
            type="button"
            onClick={() => setCustomerMode("manual")}
            className={cn("rounded-lg py-2.5 text-sm font-bold transition-all flex items-center justify-center gap-1.5",
              customerMode === "manual" ? "bg-card shadow text-foreground" : "text-muted-foreground")}
          >
            <UserPlus className="h-3.5 w-3.5" /> {t("quoteFormEnterManually")}
          </button>
        </div>

        {customerMode === "existing" ? (
          <div className="space-y-2">
            <Label className="text-sm font-bold">{t("quoteCustomer")}</Label>
            <select
              value={customerId ?? ""}
              onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : null)}
              className="w-full h-12 border-2 border-border rounded-lg px-3 text-base bg-background"
            >
              <option value="">{t("quoteFormSelectCustomer")}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Link href="/customers" className="text-xs text-primary font-semibold underline">{t("quoteFormManageCustomers")}</Link>
          </div>
        ) : (
          <div className="space-y-3 border-2 border-border rounded-xl p-3 bg-muted/10">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{t("quoteFormCustomerName")}</Label>
              <Input value={manualName} onChange={(e) => setManualName(e.target.value)} className="h-10 border-2" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">{t("fieldContact")}</Label>
                <Input value={manualContact} onChange={(e) => setManualContact(e.target.value)} className="h-10 border-2" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">{t("fieldPhone")}</Label>
                <Input value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} className="h-10 border-2" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{t("fieldEmail")}</Label>
              <Input value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} className="h-10 border-2" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{t("fieldAddress")}</Label>
              <Textarea value={manualAddress} onChange={(e) => setManualAddress(e.target.value)} className="border-2 min-h-[50px]" />
            </div>
          </div>
        )}

        {/* Issued by */}
        {issuers.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-bold">Issued by</Label>
            <select
              value={issuerId ?? ""}
              onChange={(e) => setIssuerId(e.target.value ? Number(e.target.value) : null)}
              className="w-full h-12 px-3 rounded-lg border-2 border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">— No issuer —</option>
              {issuers.map((iss) => (
                <option key={iss.id} value={iss.id}>{iss.name}{iss.email ? ` (${iss.email})` : ""}</option>
              ))}
            </select>
          </div>
        )}

        {/* Validity */}
        <div className="space-y-2">
          <Label className="text-sm font-bold">{t("quoteValidUntil")}</Label>
          <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="h-12 border-2" />
        </div>

        {/* Line items */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-bold">{t("quoteFormLineItems")}</Label>
            <span className="text-xs text-muted-foreground">{items.length} {t("ordersItems")}</span>
          </div>

          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="border-2 border-border rounded-lg p-3 bg-card space-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0 space-y-2">
                    <Input
                      value={it.name}
                      onChange={(e) => updateItem(idx, { name: e.target.value })}
                      placeholder={t("quoteFormItemName")}
                      className="h-9 border-2 text-sm font-semibold"
                    />
                    <Textarea
                      value={it.description}
                      onChange={(e) => updateItem(idx, { description: e.target.value })}
                      placeholder={t("quoteFormDescOptional")}
                      className="border-2 text-xs min-h-[40px]"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[10px] font-bold text-muted-foreground">{t("quoteFormQty")}</Label>
                        <Input
                          type="number" step="0.01" min="0"
                          value={it.quantity}
                          onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                          className="h-9 border-2 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] font-bold text-muted-foreground">{t("quoteFormUnitPrice")}</Label>
                        <Input
                          type="number" step="0.01" min="0"
                          value={it.unitPrice}
                          onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })}
                          className="h-9 border-2 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] font-bold text-muted-foreground">{t("quoteTotal")}</Label>
                        <p className="h-9 flex items-center font-mono font-bold text-sm">{fmt(it.quantity * it.unitPrice)}</p>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => removeItem(idx)} className="p-1 text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-10 gap-1.5" onClick={() => setShowProductPicker((v) => !v)}>
              <Plus className="h-3.5 w-3.5" /> {showProductPicker ? t("quoteFormHideProducts") : t("quoteFormFromCatalog")}
            </Button>
            <Button type="button" variant="outline" className="h-10 gap-1.5" onClick={addFreeText}>
              <FileText className="h-3.5 w-3.5" /> {t("quoteFormFreeText")}
            </Button>
          </div>

          {showProductPicker && (
            <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 space-y-2">
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder={t("quoteFormSearchProducts")}
                className="h-9 border-2 text-sm bg-background"
              />
              <div className="max-h-56 overflow-y-auto space-y-1">
                {filteredProducts.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic text-center py-2">{t("quoteFormNoProducts")}</p>
                ) : filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded border bg-background hover:border-primary hover:bg-primary/10 transition-colors"
                  >
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <span className="text-xs font-mono font-bold text-primary">{fmt(Number(p.salePrice ?? 0))}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="border-2 border-border rounded-xl p-3 space-y-2 bg-muted/20">
          <div className="flex justify-between text-sm">
            <span className="font-semibold">{t("quoteSubtotal")}</span>
            <span className="font-mono">{fmt(subtotal)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs font-bold flex-shrink-0">{t("quoteFormDiscountDollar")}</Label>
            <Input type="number" step="0.1" min="0" max="100" value={discount} onChange={(e) => setDiscount(e.target.value)} className="h-8 border-2 text-sm flex-1" />
            {Number(discount) > 0 && <span className="text-xs font-mono text-muted-foreground flex-shrink-0">-{fmt(subtotal - afterDiscount)}</span>}
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs font-bold flex-shrink-0">{t("quoteFormTaxPercent")}</Label>
            <Input type="number" step="0.01" min="0" max="100" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="h-8 border-2 text-sm flex-1" />
            <span className="text-xs font-mono">{fmt(taxAmount)}</span>
          </div>
          <div className="border-t-2 border-border pt-2 flex justify-between text-lg font-black">
            <span>{t("quoteTotal")}</span>
            <span className="font-mono">{fmt(total)}</span>
          </div>
        </div>

        {/* Notes / Terms */}
        <div className="space-y-2">
          <Label className="text-sm font-bold">{t("fieldNotes")}</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("quoteFormNotesPlaceholder")} className="border-2 min-h-[60px]" />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-bold">{t("quoteFormTermsAndConditions")}</Label>
          <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} placeholder={t("quoteFormTermsPlaceholder")} className="border-2 min-h-[60px]" />
        </div>

        <Button onClick={() => saveMut.mutate()} disabled={!canSubmit || saveMut.isPending} className="w-full h-14 font-bold text-base">
          {saveMut.isPending
            ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t("saving")}</>
            : editingId ? t("quoteFormSaveChanges") : t("quoteFormCreateQuote")}
        </Button>
      </div>
    </div>
  );
}
