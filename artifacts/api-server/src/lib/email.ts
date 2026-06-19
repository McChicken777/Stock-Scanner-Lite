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

export async function sendSupplierOrderEmail(params: {
  smtp: SmtpConfig;
  supplierName: string;
  supplierEmail: string;
  poId: number;
  companyName?: string | null;
  items: { name: string; sku?: string | null; quantity: number; unitCost?: number | null }[];
}): Promise<boolean> {
  try {
    const from = params.companyName?.trim() || "our team";
    const subject = `Purchase Order #${params.poId} — Order Request`;
    const rows = params.items.map((i) => {
      const sku = i.sku ? ` (SKU: ${i.sku})` : "";
      const price = i.unitCost && i.unitCost > 0 ? ` @ ${Number(i.unitCost).toFixed(2)} each` : "";
      return `  • ${i.name}${sku} — Qty: ${i.quantity}${price}`;
    }).join("\n");
    const total = params.items.reduce((s, i) => s + (i.unitCost ?? 0) * i.quantity, 0);
    const totalLine = total > 0 ? `\n\nEstimated total: ${total.toFixed(2)}` : "";
    const text = `Dear ${params.supplierName},\n\nPlease process the following purchase order:\n\nPO #${params.poId}\n\n${rows}${totalLine}\n\nPlease confirm receipt and expected delivery date.\n\nThank you,\n${from}`;

    const htmlRows = params.items.map((i) => {
      const sku = i.sku ? ` <span style="color:#666">(SKU: ${i.sku})</span>` : "";
      const price = i.unitCost && i.unitCost > 0 ? ` @ ${Number(i.unitCost).toFixed(2)} ea` : "";
      return `<li><strong>${i.name}</strong>${sku} — Qty: <strong>${i.quantity}</strong>${price}</li>`;
    }).join("");

    await buildTransport(params.smtp).sendMail({
      from: fromHeader(params.smtp),
      to: params.supplierEmail,
      subject,
      text,
      html: `
<p>Dear ${params.supplierName},</p>
<p>Please process the following purchase order:</p>
<p style="font-weight:bold;">PO #${params.poId}</p>
<ul>${htmlRows}</ul>
${total > 0 ? `<p>Estimated total: <strong>${total.toFixed(2)}</strong></p>` : ""}
<p>Please confirm receipt and expected delivery date.</p>
<p>Thank you,<br/>${from}</p>
      `.trim(),
    });
    logger.info({ poId: params.poId, to: params.supplierEmail }, "Supplier order email sent");
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
