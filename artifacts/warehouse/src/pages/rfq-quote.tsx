import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, XCircle, FileText } from "lucide-react";

type Lang = "en" | "sl";

const STR = {
  en: {
    loadingErr: "This link is not valid. Please check the URL or ask for a new one.",
    closed: "This request has been closed. Thank you.",
    title: "Request for quote",
    intro: (c: string) => `${c} would like your best price and delivery time for the items below.`,
    yourSku: "Your SKU (optional)",
    unitPrice: "Unit price",
    qty: "Qty",
    leadTime: "Delivery time (days)",
    leadTimePlaceholder: "e.g. 5",
    note: "Note (optional)",
    notePlaceholder: "Anything we should know…",
    submit: "Submit quote",
    submitting: "Submitting…",
    submitted: "Quote submitted — thank you!",
    submittedSub: "You can close this page. We'll be in touch if we order.",
    resubmit: "You already submitted a quote. You can update it below.",
    skuPlaceholder: "Your SKU",
  },
  sl: {
    loadingErr: "Povezava ni veljavna. Preverite naslov ali zaprosite za novega.",
    closed: "To povpraševanje je zaprto. Hvala.",
    title: "Povpraševanje po ponudbi",
    intro: (c: string) => `${c} prosi za vašo najboljšo ceno in rok dobave za spodnje izdelke.`,
    yourSku: "Šifra izdelka",
    unitPrice: "Cena na enoto",
    qty: "Količina",
    leadTime: "Rok dobave (dni)",
    leadTimePlaceholder: "npr. 5",
    note: "Opomba (neobvezno)",
    notePlaceholder: "Karkoli naj vemo…",
    submit: "Oddaj ponudbo",
    submitting: "Pošiljanje…",
    submitted: "Ponudba oddana — hvala!",
    submittedSub: "To stran lahko zaprete. Oglasili se bomo, če naročimo.",
    resubmit: "Ponudbo ste že oddali. Spodaj jo lahko posodobite.",
    skuPlaceholder: "Šifra",
  },
} satisfies Record<Lang, Record<string, string | ((c: string) => string)>>;

interface RfqItem {
  rfqItemId: number;
  productName: string;
  quantity: number;
  supplierSku: string | null;
  unitPrice: number | null;
}

interface RfqData {
  valid: boolean;
  closed: boolean;
  companyName: string | null;
  supplierName: string | null;
  language: Lang;
  status: string;
  leadTimeDays: number | null;
  note: string | null;
  items: RfqItem[];
}

export default function RfqQuotePage() {
  const [, params] = useRoute("/rfq/:token");
  const token = params?.token ?? "";

  const [state, setState] = useState<"loading" | "ready" | "invalid">("loading");
  const [data, setData] = useState<RfqData | null>(null);
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [skus, setSkus] = useState<Record<number, string>>({});
  const [leadTime, setLeadTime] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    fetch(`/api/rfq/${token}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: RfqData | null) => {
        if (!d || !d.valid) { setState("invalid"); return; }
        setData(d);
        setPrices(Object.fromEntries(d.items.map((i) => [i.rfqItemId, i.unitPrice != null ? String(i.unitPrice) : ""])));
        setSkus(Object.fromEntries(d.items.map((i) => [i.rfqItemId, i.supplierSku ?? ""])));
        if (d.leadTimeDays != null) setLeadTime(String(d.leadTimeDays));
        if (d.note) setNote(d.note);
        setState("ready");
      })
      .catch(() => setState("invalid"));
  }, [token]);

  const lang: Lang = data?.language === "sl" ? "sl" : "en";
  const L = STR[lang];
  const tr = (s: string) => s as string;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/rfq/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: (data?.items ?? []).map((i) => ({
            rfqItemId: i.rfqItemId,
            unitPrice: prices[i.rfqItemId] ? Number(prices[i.rfqItemId]) : null,
            supplierSku: skus[i.rfqItemId]?.trim() || undefined,
          })),
          leadTimeDays: leadTime ? Number(leadTime) : null,
          note: note.trim() || undefined,
        }),
      });
      if (res.ok) setSuccess(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (state === "loading") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state === "invalid") {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-6 text-center gap-4">
        <XCircle className="h-14 w-14 text-destructive" />
        <p className="text-muted-foreground text-sm max-w-xs">{STR.en.loadingErr}</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-6 text-center gap-4">
        <CheckCircle2 className="h-14 w-14 text-green-500" />
        <h1 className="text-2xl font-black">{tr(L.submitted)}</h1>
        <p className="text-muted-foreground text-sm max-w-xs">{tr(L.submittedSub)}</p>
      </div>
    );
  }

  const company = data?.companyName ?? "";

  return (
    <div className="min-h-[100dvh] bg-background p-4">
      <div className="w-full max-w-lg mx-auto space-y-6 py-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center">
            <FileText className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-black">{tr(L.title)}</h1>
          <p className="text-sm text-muted-foreground">{(L.intro as (c: string) => string)(company)}</p>
          {data?.supplierName && <p className="text-xs text-muted-foreground">{data.supplierName}</p>}
        </div>

        {data?.closed && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 text-center font-semibold">
            {tr(L.closed)}
          </div>
        )}
        {!data?.closed && data?.status === "submitted" && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-800 text-center">
            {tr(L.resubmit)}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {data?.items.map((item) => (
            <div key={item.rfqItemId} className="rounded-xl border-2 border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-sm">{item.productName}</p>
                <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">{tr(L.qty)}: <strong>{item.quantity}</strong></span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground">{tr(L.unitPrice)}</Label>
                  <Input
                    type="number" step="0.01" min="0" inputMode="decimal"
                    value={prices[item.rfqItemId] ?? ""}
                    onChange={(e) => setPrices((p) => ({ ...p, [item.rfqItemId]: e.target.value }))}
                    placeholder="0.00"
                    className="h-10 border-2"
                    disabled={data?.closed}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground">{tr(L.yourSku)}</Label>
                  {item.supplierSku ? (
                    <div className="h-10 flex items-center px-3 border-2 rounded-lg bg-muted/40">
                      <span className="text-sm font-mono font-semibold text-muted-foreground truncate">{item.supplierSku}</span>
                    </div>
                  ) : (
                    <Input
                      value={skus[item.rfqItemId] ?? ""}
                      onChange={(e) => setSkus((s) => ({ ...s, [item.rfqItemId]: e.target.value }))}
                      placeholder={tr(L.skuPlaceholder)}
                      className="h-10 border-2"
                      disabled={data?.closed}
                    />
                  )}
                </div>
              </div>
            </div>
          ))}

          <div className="space-y-1.5">
            <Label className="text-sm font-bold">{tr(L.leadTime)}</Label>
            <Input
              type="number" min="0" inputMode="numeric"
              value={leadTime}
              onChange={(e) => setLeadTime(e.target.value)}
              placeholder={tr(L.leadTimePlaceholder)}
              className="h-11 border-2"
              disabled={data?.closed}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-bold">{tr(L.note)}</Label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={tr(L.notePlaceholder)}
              rows={2}
              className="w-full px-3 py-2 border-2 rounded-lg text-sm"
              disabled={data?.closed}
            />
          </div>

          {!data?.closed && (
            <Button type="submit" disabled={submitting} className="w-full h-12 font-bold text-base">
              {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {tr(L.submitting)}</> : tr(L.submit)}
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
