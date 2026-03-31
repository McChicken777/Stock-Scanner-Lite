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
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: params.alertEmail,
      subject: `Low Stock Alert: ${params.productName}`,
      text: `
Low Stock Alert

Product: ${params.productName}
Category: ${params.category}
Current Stock: ${params.totalStock}
Buffer (Minimum Required): ${params.bufferStock}

The total stock of "${params.productName}" has fallen below the minimum buffer level.
Please restock as soon as possible.

This alert was sent automatically by the Warehouse Stock Management system.
      `.trim(),
      html: `
<h2>Low Stock Alert</h2>
<table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse;">
  <tr><th>Product</th><td>${params.productName}</td></tr>
  <tr><th>Category</th><td>${params.category}</td></tr>
  <tr><th>Current Stock</th><td style="color:red;font-weight:bold;">${params.totalStock}</td></tr>
  <tr><th>Minimum Buffer</th><td>${params.bufferStock}</td></tr>
</table>
<p>The total stock has fallen below the minimum buffer level. Please restock as soon as possible.</p>
<p><em>Sent automatically by the Warehouse Stock Management system.</em></p>
      `,
    });
    logger.info({ productName: params.productName, to: params.alertEmail }, "Low stock alert sent");
    return true;
  } catch (err) {
    logger.error({ err, productName: params.productName }, "Failed to send low stock alert email");
    return false;
  }
}
