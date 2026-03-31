import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";

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

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;

    res.json({ id: user.id, username: user.username, role: user.role });
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
  res.json({
    id: req.session.userId,
    username: req.session.username,
    role: req.session.role,
  });
});

router.get("/users", requireAdmin, async (req, res) => {
  try {
    const users = await db
      .select({ id: usersTable.id, username: usersTable.username, role: usersTable.role, createdAt: usersTable.createdAt })
      .from(usersTable)
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
    const existing = await db.select().from(usersTable).where(eq(usersTable.username, username));
    if (existing.length > 0) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db
      .insert(usersTable)
      .values({ username, passwordHash, role })
      .returning({ id: usersTable.id, username: usersTable.username, role: usersTable.role, createdAt: usersTable.createdAt });

    res.status(201).json(user);
  } catch (err) {
    req.log.error({ err }, "Failed to create user");
    res.status(500).json({ error: "Failed to create user" });
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
