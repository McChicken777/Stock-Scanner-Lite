import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, companiesTable, workTemplatesTable } from "@workspace/db";
import { eq, count, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import type { CompanyFeatures } from "@workspace/db";
import { seedStarterPack } from "../lib/seedStarterPack";

const router: IRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const createUserSchema = z.object({
  username: z.string().min(2).max(50),
  password: z.string().min(4),
  role: z.enum(["admin", "worker"]),
});

router.post("/login", async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Username and password required" });
      return;
    }

    const { username, password } = parsed.data;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    // Load company features + plan
    let features: CompanyFeatures = {
      inventory: true, alerts: true, work_orders: true,
      progress_tracking: true, deadline_alerts: true, time_tracking: true,
    };
    let plan: string | null = null;

    if (user.companyId) {
      const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, user.companyId));
      if (company) {
        features = company.features as CompanyFeatures;
        plan = company.plan ?? null;
      }
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.isSupervisor = user.isSupervisor ?? false;
    req.session.companyId = user.companyId ?? 0;
    req.session.features = features;

    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      isSupervisor: user.isSupervisor,
      companyId: user.companyId,
      features,
      plan,
    });

    // Auto-seed starter pack on first admin login if company has zero templates
    if (user.role === "admin" && user.companyId) {
      const [{ value: templateCount }] = await db.select({ value: count() })
        .from(workTemplatesTable)
        .where(eq(workTemplatesTable.companyId, user.companyId));
      if (templateCount === 0) {
        seedStarterPack(user.companyId).catch((e: unknown) => {
          req.log.warn({ err: e }, "Auto starter pack seed failed");
        });
      }
    }
  } catch (err) {
    req.log.error({ err }, "Login failed");
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("wms_sid");
    res.json({ ok: true });
  });
});

router.get("/me", requireAuth, async (req, res) => {
  // Refresh features from DB each time /me is called
  let features = req.session.features;
  let plan: "basic" | "pro" | null = null;
  if (req.session.companyId) {
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, req.session.companyId));
    if (company) {
      features = company.features as CompanyFeatures;
      req.session.features = features;
      plan = company.plan ?? null;
    }
  }

  const [meUser] = await db.select({ isSupervisor: usersTable.isSupervisor })
    .from(usersTable).where(eq(usersTable.id, req.session.userId!));

  res.json({
    id: req.session.userId,
    username: req.session.username,
    role: req.session.role,
    isSupervisor: meUser?.isSupervisor ?? false,
    companyId: req.session.companyId,
    features,
    plan,
  });
});

router.get("/users", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const users = await db
      .select({ id: usersTable.id, username: usersTable.username, role: usersTable.role, isSupervisor: usersTable.isSupervisor, shiftId: usersTable.shiftId, createdAt: usersTable.createdAt })
      .from(usersTable)
      .where(eq(usersTable.companyId, companyId))
      .orderBy(usersTable.username);
    res.json(users);
  } catch (err) {
    req.log.error({ err }, "Failed to list users");
    res.status(500).json({ error: "Failed to list users" });
  }
});

router.post("/users", requireAdmin, async (req, res) => {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { username, password, role } = parsed.data;
    const companyId = req.session.companyId!;
    const existing = await db.select().from(usersTable).where(eq(usersTable.username, username));
    if (existing.length > 0) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db
      .insert(usersTable)
      .values({ username, passwordHash, role, companyId })
      .returning({ id: usersTable.id, username: usersTable.username, role: usersTable.role, createdAt: usersTable.createdAt });

    res.status(201).json(user);
  } catch (err) {
    req.log.error({ err }, "Failed to create user");
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.patch("/users/:userId/supervisor", requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const parsed = z.object({ isSupervisor: z.boolean() }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "isSupervisor boolean required" }); return; }
    const companyId = req.session.companyId!;
    const [user] = await db
      .update(usersTable)
      .set({ isSupervisor: parsed.data.isSupervisor })
      .where(and(eq(usersTable.id, userId), eq(usersTable.companyId, companyId)))
      .returning({ id: usersTable.id, isSupervisor: usersTable.isSupervisor });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(user);
  } catch (err) {
    req.log.error({ err }, "Failed to update supervisor flag");
    res.status(500).json({ error: "Failed to update supervisor flag" });
  }
});

router.patch("/users/:userId/shift", requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const companyId = req.session.companyId!;
    const parsed = z.object({ shiftId: z.number().nullable() }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "shiftId (number | null) required" }); return; }
    const [user] = await db
      .update(usersTable)
      .set({ shiftId: parsed.data.shiftId })
      .where(and(eq(usersTable.id, userId), eq(usersTable.companyId, companyId)))
      .returning({ id: usersTable.id, shiftId: usersTable.shiftId });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(user);
  } catch (err) {
    req.log.error({ err }, "Failed to update user shift");
    res.status(500).json({ error: "Failed to update user shift" });
  }
});

router.delete("/users/:userId", requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (userId === req.session.userId) {
      res.status(400).json({ error: "Cannot delete your own account" });
      return;
    }
    await db.delete(usersTable).where(eq(usersTable.id, userId));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete user");
    res.status(500).json({ error: "Failed to delete user" });
  }
});

export default router;
