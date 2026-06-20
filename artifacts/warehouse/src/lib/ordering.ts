// Shared helpers for building supplier order links (email + web store cart URLs).
// Used by both the Suppliers ordering view and the Reorder Queue.

export interface OrderLineItem {
  name: string;
  supplierSku?: string | null;
  storeProductId?: string | null;
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

/** Build a pre-filled cart URL for web-store suppliers (Shopify / WooCommerce / custom). */
export function buildCartUrl(
  storeUrl: string,
  platform: string | null,
  items: Array<{ storeProductId: string | null; qty: number }>,
): string {
  const base = storeUrl.replace(/\/$/, "");
  const itemsWithId = items.filter((i) => i.storeProductId);
  if (itemsWithId.length === 0) return base;

  if (platform === "shopify") {
    // Shopify native: /cart/variantId:qty,variantId2:qty2
    const parts = itemsWithId.map((i) => `${i.storeProductId}:${i.qty}`).join(",");
    return `${base}/cart/${parts}`;
  }
  if (platform === "woocommerce") {
    // WooCommerce: /?add-to-cart=ID&quantity=Q (single), or multi via query string (needs plugin)
    if (itemsWithId.length === 1) {
      return `${base}/?add-to-cart=${itemsWithId[0].storeProductId}&quantity=${itemsWithId[0].qty}`;
    }
    const params = itemsWithId.map((i) => `add-to-cart=${i.storeProductId}&quantity=${i.qty}`).join("&");
    return `${base}/cart/?${params}`;
  }
  // Custom/other: just open the store URL
  return base;
}
