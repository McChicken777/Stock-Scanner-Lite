// Shared helpers for building supplier order links (email + web store cart URLs).
// Used by both the Suppliers ordering view and the Reorder Queue.

export interface OrderLineItem {
  name: string;
  supplierSku?: string | null;
  storeProductId?: string | null;
  quantity: number;
  unitCost?: number;
}

/** Build a mailto: link with a formatted purchase-order body for email suppliers. */
export function buildMailtoLink(
  supplierEmail: string,
  supplierName: string,
  poId: number,
  items: OrderLineItem[],
): string {
  const subject = `Purchase Order #${poId} — Order Request`;
  const rows = items.map((item) => {
    const sku = item.supplierSku ? ` (SKU: ${item.supplierSku})` : "";
    const price = item.unitCost && item.unitCost > 0 ? ` @ $${Number(item.unitCost).toFixed(2)} each` : "";
    return `  • ${item.name}${sku} — Qty: ${item.quantity}${price}`;
  }).join("\n");
  const total = items.reduce((s, i) => s + (i.unitCost ?? 0) * i.quantity, 0);
  const totalLine = total > 0 ? `\n\nEstimated total: $${total.toFixed(2)}` : "";
  const body = `Dear ${supplierName},\n\nPlease process the following purchase order:\n\nPO #${poId}\n\n${rows}${totalLine}\n\nPlease confirm receipt and expected delivery date.\n\nThank you`;
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
