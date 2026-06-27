// Shared helpers for building supplier order links.

export interface OrderLineItem {
  name: string;
  supplierSku?: string | null;
  quantity: number;
  unitCost?: number;
}

export type MailLang = "en" | "sl";

// Keep these in sync with ORDER_STRINGS in api-server's email.ts.
const MAIL_STRINGS: Record<MailLang, {
  subject: (po: number) => string; greeting: (n: string) => string; intro: string;
  poLabel: (po: number) => string; sku: string; qty: string; each: string;
  totalLabel: string; confirm: string; thanks: string;
}> = {
  en: {
    subject: (po) => `Purchase Order #${po} — Order Request`,
    greeting: (n) => `Dear ${n},`,
    intro: "Please process the following purchase order:",
    poLabel: (po) => `PO #${po}`,
    sku: "SKU", qty: "Qty", each: "each",
    totalLabel: "Estimated total",
    confirm: "Please confirm receipt and expected delivery date.",
    thanks: "Thank you",
  },
  sl: {
    subject: (po) => `Naročilo št. ${po}`,
    greeting: (n) => `Spoštovani ${n},`,
    intro: "Prosimo, obdelajte naslednje naročilo:",
    poLabel: (po) => `Naročilo št. ${po}`,
    sku: "Šifra", qty: "Količina", each: "/kos",
    totalLabel: "Ocenjena vrednost",
    confirm: "Prosimo, potrdite prejem in predviden datum dobave.",
    thanks: "Hvala",
  },
};

/** Build a mailto: link with a formatted purchase-order body for email suppliers. */
export function buildMailtoLink(
  supplierEmail: string,
  supplierName: string,
  poId: number,
  items: OrderLineItem[],
  lang: MailLang = "en",
): string {
  const L = MAIL_STRINGS[lang] ?? MAIL_STRINGS.en;
  const subject = L.subject(poId);
  const rows = items.map((item) => {
    const sku = item.supplierSku ? ` (${L.sku}: ${item.supplierSku})` : "";
    const price = item.unitCost && item.unitCost > 0 ? ` @ ${Number(item.unitCost).toFixed(2)} ${L.each}` : "";
    return `  • ${item.name}${sku} — ${L.qty}: ${item.quantity}${price}`;
  }).join("\n");
  const total = items.reduce((s, i) => s + (i.unitCost ?? 0) * i.quantity, 0);
  const totalLine = total > 0 ? `\n\n${L.totalLabel}: ${total.toFixed(2)}` : "";
  const body = `${L.greeting(supplierName)}\n\n${L.intro}\n\n${L.poLabel(poId)}\n\n${rows}${totalLine}\n\n${L.confirm}\n\n${L.thanks}`;
  return `mailto:${supplierEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

