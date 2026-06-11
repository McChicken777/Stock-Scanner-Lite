import { Router, type IRouter } from "express";
import { db, usersTable, companiesTable, PLAN_FEATURES, kioskStationsTable, workstationsTable, stationTypesTable, nfcCardsTable } from "@workspace/db";
import { eq, sql, and, asc } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
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
      plan: z.enum(["lite", "standard", "pro"]).default("standard"),
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
      plan: z.enum(["lite", "standard", "pro"]).optional(),
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

// ─── KIOSK MANAGEMENT ─────────────────────────────────────────────────────────

// List all kiosks for a company (with workstation + station type names)
router.get("/companies/:id/kiosks", async (req, res) => {
  try {
    const companyId = Number(req.params.id);
    const rows = await db
      .select({
        id: kioskStationsTable.id,
        token: kioskStationsTable.token,
        label: kioskStationsTable.label,
        lastSeenAt: kioskStationsTable.lastSeenAt,
        createdAt: kioskStationsTable.createdAt,
        workstationId: workstationsTable.id,
        workstationName: workstationsTable.name,
        stationTypeName: stationTypesTable.name,
        stationTypeColor: stationTypesTable.color,
      })
      .from(kioskStationsTable)
      .innerJoin(workstationsTable, eq(kioskStationsTable.workstationId, workstationsTable.id))
      .innerJoin(stationTypesTable, eq(workstationsTable.stationTypeId, stationTypesTable.id))
      .where(eq(kioskStationsTable.companyId, companyId))
      .orderBy(asc(stationTypesTable.flowOrder), asc(workstationsTable.priority));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list kiosks");
    res.status(500).json({ error: "Failed to list kiosks" });
  }
});

// List all workstations for a company (for picking which one to pair)
router.get("/companies/:id/workstations", async (req, res) => {
  try {
    const companyId = Number(req.params.id);
    const rows = await db
      .select({
        id: workstationsTable.id,
        name: workstationsTable.name,
        isActive: workstationsTable.isActive,
        stationTypeId: stationTypesTable.id,
        stationTypeName: stationTypesTable.name,
        stationTypeColor: stationTypesTable.color,
      })
      .from(workstationsTable)
      .innerJoin(stationTypesTable, eq(workstationsTable.stationTypeId, stationTypesTable.id))
      .where(eq(workstationsTable.companyId, companyId))
      .orderBy(asc(stationTypesTable.flowOrder), asc(workstationsTable.priority));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list workstations");
    res.status(500).json({ error: "Failed to list workstations" });
  }
});

// Generate a kiosk token for a workstation
router.post("/companies/:id/kiosks", async (req, res) => {
  try {
    const companyId = Number(req.params.id);
    const parsed = z.object({
      workstationId: z.number().int(),
      label: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "workstationId required" }); return; }

    // Verify workstation belongs to company
    const [ws] = await db.select().from(workstationsTable)
      .where(and(eq(workstationsTable.id, parsed.data.workstationId), eq(workstationsTable.companyId, companyId)));
    if (!ws) { res.status(404).json({ error: "Workstation not found" }); return; }

    // Revoke any existing kiosk for this workstation first
    await db.delete(kioskStationsTable)
      .where(and(
        eq(kioskStationsTable.workstationId, parsed.data.workstationId),
        eq(kioskStationsTable.companyId, companyId),
      ));

    const token = randomUUID();
    const [kiosk] = await db.insert(kioskStationsTable).values({
      companyId,
      workstationId: parsed.data.workstationId,
      token,
      label: parsed.data.label ?? ws.name,
    }).returning();
    res.status(201).json(kiosk);
  } catch (err) {
    req.log.error({ err }, "Failed to create kiosk");
    res.status(500).json({ error: "Failed to create kiosk" });
  }
});

// Revoke a kiosk token
router.delete("/kiosks/:kioskId", async (req, res) => {
  try {
    await db.delete(kioskStationsTable).where(eq(kioskStationsTable.id, Number(req.params.kioskId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to revoke kiosk");
    res.status(500).json({ error: "Failed to revoke kiosk" });
  }
});

// ─── NFC + PIN MANAGEMENT (per worker, owner-scoped) ─────────────────────────

// Get workers with NFC + PIN status for a company
router.get("/companies/:id/workers-kiosk", async (req, res) => {
  try {
    const companyId = Number(req.params.id);
    const workers = await db
      .select({ id: usersTable.id, username: usersTable.username, role: usersTable.role, kioskPinHash: usersTable.kioskPinHash })
      .from(usersTable)
      .where(and(eq(usersTable.companyId, companyId), eq(usersTable.role, "worker")))
      .orderBy(asc(usersTable.username));

    const cards = await db.select({ userId: nfcCardsTable.userId, cardUid: nfcCardsTable.cardUid, id: nfcCardsTable.id })
      .from(nfcCardsTable).where(eq(nfcCardsTable.companyId, companyId));
    const cardMap = new Map(cards.map((c) => [c.userId, c]));

    res.json(workers.map((w) => ({
      id: w.id,
      username: w.username,
      hasPin: !!w.kioskPinHash,
      nfcCard: cardMap.get(w.id) ? { id: cardMap.get(w.id)!.id, cardUid: cardMap.get(w.id)!.cardUid } : null,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list workers");
    res.status(500).json({ error: "Failed to list workers" });
  }
});

// Assign NFC card to a worker
router.post("/workers/:userId/nfc-card", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const parsed = z.object({ cardUid: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "cardUid required" }); return; }

    const [user] = await db.select({ companyId: usersTable.companyId })
      .from(usersTable).where(eq(usersTable.id, userId));
    if (!user?.companyId) { res.status(404).json({ error: "Worker not found" }); return; }

    // Remove existing card for this user
    await db.delete(nfcCardsTable).where(eq(nfcCardsTable.userId, userId));

    const [card] = await db.insert(nfcCardsTable).values({
      userId,
      companyId: user.companyId,
      cardUid: parsed.data.cardUid,
    }).returning();
    res.status(201).json(card);
  } catch (err) {
    req.log.error({ err }, "Failed to assign NFC card");
    res.status(500).json({ error: "Failed to assign NFC card" });
  }
});

// Remove NFC card from a worker
router.delete("/workers/:userId/nfc-card", async (req, res) => {
  try {
    await db.delete(nfcCardsTable).where(eq(nfcCardsTable.userId, Number(req.params.userId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to remove NFC card");
    res.status(500).json({ error: "Failed to remove NFC card" });
  }
});

// Set a worker's kiosk PIN (4 digits)
router.post("/workers/:userId/kiosk-pin", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const parsed = z.object({ pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits") }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid PIN" }); return; }

    const hash = await bcrypt.hash(parsed.data.pin, 10);
    await db.update(usersTable).set({ kioskPinHash: hash }).where(eq(usersTable.id, userId));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to set PIN");
    res.status(500).json({ error: "Failed to set PIN" });
  }
});

// Clear a worker's kiosk PIN
router.delete("/workers/:userId/kiosk-pin", async (req, res) => {
  try {
    await db.update(usersTable).set({ kioskPinHash: null }).where(eq(usersTable.id, Number(req.params.userId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to clear PIN");
    res.status(500).json({ error: "Failed to clear PIN" });
  }
});

export default router;
