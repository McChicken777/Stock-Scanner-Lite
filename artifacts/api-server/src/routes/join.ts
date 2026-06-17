import { Router, type IRouter } from "express";
import { db, usersTable, companiesTable, companyInvitesTable, PLAN_FEATURES } from "@workspace/db";
import { eq, and, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";

const router: IRouter = Router();

// ─── PREVIEW INVITE ────────────────────────────────────────────────────────────
// Public: validate token and return company name + plan for display on the form.
router.get("/:token", async (req, res) => {
  try {
    const [invite] = await db
      .select()
      .from(companyInvitesTable)
      .where(eq(companyInvitesTable.token, req.params.token));

    if (!invite) {
      res.status(404).json({ valid: false, reason: "not_found" });
      return;
    }
    if (invite.usedAt !== null) {
      res.status(410).json({ valid: false, reason: "used" });
      return;
    }
    if (invite.expiresAt < new Date()) {
      res.status(410).json({ valid: false, reason: "expired" });
      return;
    }

    res.json({
      valid: true,
      companyName: invite.companyName ?? null,
      plan: invite.plan,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to validate invite" });
  }
});

// ─── REGISTER VIA INVITE ───────────────────────────────────────────────────────
// Public: create company + admin user, mark token used.
router.post("/:token", async (req, res) => {
  try {
    const parsed = z.object({
      companyName: z.string().trim().min(1).max(120),
      adminUsername: z.string().trim().min(2).max(60),
      adminEmail: z.string().trim().email().optional().or(z.literal("")),
      password: z.string().min(8, "Password must be at least 8 characters"),
    }).safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }

    const { companyName, adminUsername, adminEmail, password } = parsed.data;

    // Validate invite
    const [invite] = await db
      .select()
      .from(companyInvitesTable)
      .where(eq(companyInvitesTable.token, req.params.token));

    if (!invite || invite.usedAt !== null || invite.expiresAt < new Date()) {
      res.status(410).json({ error: "This invite link is no longer valid" });
      return;
    }

    // Check username not already taken
    const [existing] = await db.select({ id: usersTable.id })
      .from(usersTable).where(eq(usersTable.username, adminUsername));
    if (existing) {
      res.status(409).json({ error: `Username "${adminUsername}" is already taken` });
      return;
    }

    const plan = (invite.plan ?? "lite") as "lite" | "standard" | "pro";

    // Create company
    const [company] = await db.insert(companiesTable).values({
      name: companyName,
      plan,
      features: { ...PLAN_FEATURES[plan] },
    }).returning();

    // Create admin user
    const passwordHash = await bcrypt.hash(password, 12);
    await db.insert(usersTable).values({
      username: adminUsername,
      passwordHash,
      role: "admin",
      companyId: company.id,
      email: adminEmail || null,
      emailVerified: false,
    });

    // Mark invite as used
    await db.update(companyInvitesTable)
      .set({ usedAt: new Date() })
      .where(eq(companyInvitesTable.token, req.params.token));

    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Registration failed" });
  }
});

export default router;
