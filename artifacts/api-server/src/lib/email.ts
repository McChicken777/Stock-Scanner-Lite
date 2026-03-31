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
