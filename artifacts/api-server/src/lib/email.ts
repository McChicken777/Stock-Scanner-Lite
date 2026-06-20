import nodemailer from "nodemailer";
import { logger } from "./logger";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromName?: string | null;
}

function buildTransport(smtp: SmtpConfig) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });
}

function fromHeader(smtp: SmtpConfig): string {
  const name = smtp.fromName?.trim();
  return name ? `"${name.replace(/"/g, "")}" <${smtp.user}>` : smtp.user;
}

/** Send a quick test email using a company's SMTP config, to verify their setup. */
export async function sendTestEmail(smtp: SmtpConfig, to: string): Promise<boolean> {
  try {
    await buildTransport(smtp).sendMail({
      from: fromHeader(smtp),
      to,
      subject: "Fabriflow email test ✓",
      text: "This is a test from Fabriflow. Your email settings are working — order emails will send from this address.",
    });
    logger.info({ to }, "Test email sent");
    return true;
  } catch (err) {
    logger.error({ err }, "Test email failed");
    return false;
  }
}

export type OrderEmailLang = "en" | "sl";

// Order-email strings per language. Add a new key here to support another language.
const ORDER_STRINGS = {
  en: {
    ourTeam: "our team",
    subject: (po: number) => `Purchase Order #${po} — Order Request`,
    greeting: (name: string) => `Dear ${name},`,
    intro: "Please process the following purchase order:",
    poLabel: (po: number) => `PO #${po}`,
    sku: "SKU",
    qty: "Qty",
    each: "each",
    totalLabel: "Estimated total",
    confirm: "Please confirm receipt and expected delivery date.",
    thanks: "Thank you,",
  },
  sl: {
    ourTeam: "naša ekipa",
    subject: (po: number) => `Naročilo št. ${po}`,
    greeting: (name: string) => `Spoštovani ${name},`,
    intro: "Prosimo, obdelajte naslednje naročilo:",
    poLabel: (po: number) => `Naročilo št. ${po}`,
    sku: "Šifra",
    qty: "Količina",
    each: "/kos",
    totalLabel: "Ocenjena vrednost",
    confirm: "Prosimo, potrdite prejem in predviden datum dobave.",
    thanks: "Hvala,",
  },
} as const;

export async function sendSupplierOrderEmail(params: {
  smtp: SmtpConfig;
  supplierName: string;
  supplierEmail: string;
  poId: number;
  companyName?: string | null;
  lang?: OrderEmailLang;
  items: { name: string; sku?: string | null; quantity: number; unitCost?: number | null }[];
}): Promise<boolean> {
  try {
    const L = ORDER_STRINGS[params.lang === "sl" ? "sl" : "en"];
    const from = params.companyName?.trim() || L.ourTeam;
    const subject = L.subject(params.poId);
    const rows = params.items.map((i) => {
      const sku = i.sku ? ` (${L.sku}: ${i.sku})` : "";
      const price = i.unitCost && i.unitCost > 0 ? ` @ ${Number(i.unitCost).toFixed(2)} ${L.each}` : "";
      return `  • ${i.name}${sku} — ${L.qty}: ${i.quantity}${price}`;
    }).join("\n");
    const total = params.items.reduce((s, i) => s + (i.unitCost ?? 0) * i.quantity, 0);
    const totalLine = total > 0 ? `\n\n${L.totalLabel}: ${total.toFixed(2)}` : "";
    const text = `${L.greeting(params.supplierName)}\n\n${L.intro}\n\n${L.poLabel(params.poId)}\n\n${rows}${totalLine}\n\n${L.confirm}\n\n${L.thanks}\n${from}`;

    const htmlRows = params.items.map((i) => {
      const sku = i.sku ? ` <span style="color:#666">(${L.sku}: ${i.sku})</span>` : "";
      const price = i.unitCost && i.unitCost > 0 ? ` @ ${Number(i.unitCost).toFixed(2)} ${L.each}` : "";
      return `<li><strong>${i.name}</strong>${sku} — ${L.qty}: <strong>${i.quantity}</strong>${price}</li>`;
    }).join("");

    await buildTransport(params.smtp).sendMail({
      from: fromHeader(params.smtp),
      to: params.supplierEmail,
      subject,
      text,
      html: `
<p>${L.greeting(params.supplierName)}</p>
<p>${L.intro}</p>
<p style="font-weight:bold;">${L.poLabel(params.poId)}</p>
<ul>${htmlRows}</ul>
${total > 0 ? `<p>${L.totalLabel}: <strong>${total.toFixed(2)}</strong></p>` : ""}
<p>${L.confirm}</p>
<p>${L.thanks}<br/>${from}</p>
      `.trim(),
    });
    logger.info({ poId: params.poId, to: params.supplierEmail, lang: params.lang }, "Supplier order email sent");
    return true;
  } catch (err) {
    logger.error({ err, poId: params.poId }, "Failed to send supplier order email");
    return false;
  }
}

export async function sendLowStockAlert(params: {
  productName: string;
  category: string;
  totalStock: number;
  bufferStock: number;
  alertEmail: string;
}): Promise<boolean> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn({ productName: params.productName }, "Email not configured — skipping low stock alert");
    return false;
  }

  try {
    const subject = `LOW STOCK! ${params.productName} - you have ${params.totalStock} left`;
    const body = `LOW STOCK! ${params.productName} - you have ${params.totalStock} left\n\nMinimum required: ${params.bufferStock}\nCategory: ${params.category}\n\nPlease restock as soon as possible.`;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: params.alertEmail,
      subject,
      text: body,
      html: `
<p style="font-size:18px;font-weight:bold;color:#c0392b;">LOW STOCK! ${params.productName} - you have ${params.totalStock} left</p>
<p>Minimum required: <strong>${params.bufferStock}</strong><br/>Category: ${params.category}</p>
<p>Please restock as soon as possible.</p>
      `.trim(),
    });
    logger.info({ productName: params.productName, to: params.alertEmail }, "Low stock alert sent");
    return true;
  } catch (err) {
    logger.error({ err, productName: params.productName }, "Failed to send low stock alert email");
    return false;
  }
}
