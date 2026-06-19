import { Router, type IRouter } from "express";
import { db, companiesTable, PLAN_FEATURES } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import type { CompanyFeatures } from "@workspace/db";
import { encryptSecret, decryptSecret } from "../lib/crypto";
import { sendTestEmail } from "../lib/email";

const router: IRouter = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId));
    if (!company) { res.status(404).json({ error: "Company not found" }); return; }
    // Never leak the stored SMTP password; expose a configured flag instead.
    const { smtpPassEnc, ...rest } = company;
    res.json({ ...rest, smtpConfigured: !!smtpPassEnc });
  } catch (err) {
    req.log.error({ err }, "Failed to get company");
    res.status(500).json({ error: "Failed to get company" });
  }
});

router.put("/", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const schema = z.object({
      name: z.string().min(1).optional(),
      plan: z.enum(["lite", "standard", "pro"]).optional(),
      workHoursPerDay: z.number().int().min(60).max(1440).optional(),
      weekendOvertimeEnabled: z.boolean().optional(),
      country: z.string().max(10).nullable().optional(),
      // Branding: base64 data URL (~2MB cap) + typed signer name for quote PDFs.
      logo: z.string().max(2_900_000).nullable().optional().refine(
        (v) => v == null || v === "" || /^data:image\/(png|jpe?g);base64,/.test(v),
        "Logo must be a PNG or JPG image",
      ),
      quoteSignerName: z.string().max(120).nullable().optional(),
      currency: z.string().length(3).optional(),
      // Per-company SMTP (order emails). smtpPass is write-only; "" leaves it unchanged.
      emailFromName: z.string().max(120).nullable().optional(),
      smtpHost: z.string().max(255).nullable().optional(),
      smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
      smtpUser: z.string().max(255).nullable().optional(),
      smtpPass: z.string().max(512).optional(),
      clearSmtp: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const updates: Record<string, unknown> = {};
    if (parsed.data.name) updates.name = parsed.data.name;
    if (parsed.data.plan) {
      updates.plan = parsed.data.plan;
      updates.features = { ...PLAN_FEATURES[parsed.data.plan] };
    }
    if (parsed.data.workHoursPerDay !== undefined) updates.workHoursPerDay = parsed.data.workHoursPerDay;
    if (parsed.data.weekendOvertimeEnabled !== undefined) updates.weekendOvertimeEnabled = parsed.data.weekendOvertimeEnabled;
    if (parsed.data.country !== undefined) updates.country = parsed.data.country;
    if (parsed.data.logo !== undefined) updates.logo = parsed.data.logo || null;
    if (parsed.data.quoteSignerName !== undefined) updates.quoteSignerName = parsed.data.quoteSignerName || null;
    if (parsed.data.currency) updates.currency = parsed.data.currency;

    // SMTP settings
    if (parsed.data.clearSmtp) {
      updates.smtpHost = null;
      updates.smtpPort = null;
      updates.smtpUser = null;
      updates.smtpPassEnc = null;
      updates.emailFromName = null;
    } else {
      if (parsed.data.emailFromName !== undefined) updates.emailFromName = parsed.data.emailFromName || null;
      if (parsed.data.smtpHost !== undefined) updates.smtpHost = parsed.data.smtpHost || null;
      if (parsed.data.smtpPort !== undefined) updates.smtpPort = parsed.data.smtpPort ?? null;
      if (parsed.data.smtpUser !== undefined) updates.smtpUser = parsed.data.smtpUser || null;
      if (parsed.data.smtpPass) updates.smtpPassEnc = encryptSecret(parsed.data.smtpPass);
    }

    const [company] = await db.update(companiesTable).set(updates as never).where(eq(companiesTable.id, companyId)).returning();
    // Update session features
    req.session.features = company.features as CompanyFeatures;
    const { smtpPassEnc, ...rest } = company;
    res.json({ ...rest, smtpConfigured: !!smtpPassEnc });
  } catch (err) {
    req.log.error({ err }, "Failed to update company");
    res.status(500).json({ error: "Failed to update company" });
  }
});

const featuresSchema = z.object({
  inventory: z.boolean().optional(),
  alerts: z.boolean().optional(),
  work_orders: z.boolean().optional(),
  progress_tracking: z.boolean().optional(),
  deadline_alerts: z.boolean().optional(),
  time_tracking: z.boolean().optional(),
});

router.put("/features", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = featuresSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [current] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId));
    if (!current) { res.status(404).json({ error: "Company not found" }); return; }

    const newFeatures = { ...(current.features as CompanyFeatures), ...parsed.data };
    const [company] = await db.update(companiesTable)
      .set({ features: newFeatures })
      .where(eq(companiesTable.id, companyId))
      .returning();

    req.session.features = newFeatures;
    res.json(company);
  } catch (err) {
    req.log.error({ err }, "Failed to update features");
    res.status(500).json({ error: "Failed to update features" });
  }
});

// Send a test email using the company's saved SMTP settings, to the admin's email
// (or a provided address) so they can verify the setup works.
router.post("/email-test", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId));
    if (!company) { res.status(404).json({ error: "Company not found" }); return; }

    const pass = decryptSecret(company.smtpPassEnc);
    if (!company.smtpHost || !company.smtpPort || !company.smtpUser || !pass) {
      res.status(400).json({ error: "Email isn't fully set up yet — fill in and save all SMTP fields first." });
      return;
    }

    const to = z.string().email().safeParse(req.body?.to).success ? req.body.to : company.smtpUser;
    const ok = await sendTestEmail(
      { host: company.smtpHost, port: company.smtpPort, user: company.smtpUser, pass, fromName: company.emailFromName },
      to,
    );
    if (!ok) { res.status(502).json({ error: "Couldn't send — check the host, port, email and app password." }); return; }
    res.json({ sent: true, to });
  } catch (err) {
    req.log.error({ err }, "Failed to send test email");
    res.status(500).json({ error: "Failed to send test email" });
  }
});

export default router;
