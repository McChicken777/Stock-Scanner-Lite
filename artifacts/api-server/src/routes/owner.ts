import { Router, type IRouter } from "express";
import { db, usersTable, companiesTable, PLAN_FEATURES } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireOwner } from "../middlewares/auth";

const router: IRouter = Router();

// All routes require owner role
router.use(requireOwner);

// ─── LIST ALL COMPANIES ────────────────────────────────────────────────────────
router.get("/companies", async (req, res) => {
  try {
    const companies = await db.select().from(companiesTable).orderBy(companiesTable.createdAt);

    const result = await Promise.all(
      companies.map(async (c) => {
        const [{ userCount }] = await db
          .select({ userCount: sql<number>`COUNT(*)` })
          .from(usersTable)
          .where(eq(usersTable.companyId, c.id));
        return { ...c, userCount: Number(userCount) };
      }),
    );

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list companies");
    res.status(500).json({ error: "Failed to list companies" });
  }
});

// ─── CREATE COMPANY + FIRST ADMIN ─────────────────────────────────────────────
router.post("/companies", async (req, res) => {
  try {
    const parsed = z.object({
      companyName: z.string().min(1),
      plan: z.enum(["basic", "pro"]).default("pro"),
      adminUsername: z.string().min(2),
      adminPassword: z.string().min(6),
    }).safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }

    const { companyName, plan, adminUsername, adminPassword } = parsed.data;

    // Check username not taken
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.username, adminUsername));
    if (existing) {
      res.status(409).json({ error: `Username "${adminUsername}" is already taken` });
      return;
    }

    const [company] = await db.insert(companiesTable).values({
      name: companyName,
      plan,
      features: { ...PLAN_FEATURES[plan] },
    }).returning();

    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const [user] = await db.insert(usersTable).values({
      username: adminUsername,
      passwordHash,
      role: "admin",
      companyId: company.id,
    }).returning();

    res.status(201).json({ company, adminUser: { id: user.id, username: user.username } });
  } catch (err) {
    req.log.error({ err }, "Failed to create company");
    res.status(500).json({ error: "Failed to create company" });
  }
});

// ─── UPDATE COMPANY (name, plan) ──────────────────────────────────────────────
router.put("/companies/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const parsed = z.object({
      name: z.string().min(1).optional(),
      plan: z.enum(["basic", "pro"]).optional(),
    }).safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.name) updates.name = parsed.data.name;
    if (parsed.data.plan) {
      updates.plan = parsed.data.plan;
      updates.features = { ...PLAN_FEATURES[parsed.data.plan] };
    }

    const [company] = await db.update(companiesTable).set(updates as never)
      .where(eq(companiesTable.id, id)).returning();

    if (!company) { res.status(404).json({ error: "Company not found" }); return; }
    res.json(company);
  } catch (err) {
    req.log.error({ err }, "Failed to update company");
    res.status(500).json({ error: "Failed to update company" });
  }
});

// ─── LIST USERS FOR A COMPANY ──────────────────────────────────────────────────
router.get("/companies/:id/users", async (req, res) => {
  try {
    const users = await db
      .select({ id: usersTable.id, username: usersTable.username, role: usersTable.role, createdAt: usersTable.createdAt })
      .from(usersTable)
      .where(eq(usersTable.companyId, Number(req.params.id)))
      .orderBy(usersTable.createdAt);
    res.json(users);
  } catch (err) {
    req.log.error({ err }, "Failed to list users");
    res.status(500).json({ error: "Failed to list users" });
  }
});

// ─── ADD USER TO A COMPANY ─────────────────────────────────────────────────────
router.post("/companies/:id/users", async (req, res) => {
  try {
    const companyId = Number(req.params.id);
    const parsed = z.object({
      username: z.string().min(2),
      password: z.string().min(6),
      role: z.enum(["admin", "worker"]).default("admin"),
    }).safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }

    const [existing] = await db.select().from(usersTable).where(eq(usersTable.username, parsed.data.username));
    if (existing) {
      res.status(409).json({ error: `Username "${parsed.data.username}" is already taken` });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const [user] = await db.insert(usersTable).values({
      username: parsed.data.username,
      passwordHash,
      role: parsed.data.role,
      companyId,
    }).returning();

    res.status(201).json({ id: user.id, username: user.username, role: user.role });
  } catch (err) {
    req.log.error({ err }, "Failed to add user");
    res.status(500).json({ error: "Failed to add user" });
  }
});

// ─── RESET A USER'S PASSWORD ───────────────────────────────────────────────────
router.put("/users/:userId/password", async (req, res) => {
  try {
    const parsed = z.object({ password: z.string().min(6) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, Number(req.params.userId)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reset password");
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// ─── DELETE A COMPANY ──────────────────────────────────────────────────────────
router.delete("/companies/:id", async (req, res) => {
  try {
    await db.delete(companiesTable).where(eq(companiesTable.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete company" );
    res.status(500).json({ error: "Failed to delete company" });
  }
});

export default router;
