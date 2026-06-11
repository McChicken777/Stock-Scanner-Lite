import { Router, type IRouter } from "express";
import {
  db, kioskStationsTable, nfcCardsTable, workstationsTable, stationTypesTable,
  workItemStepsTable, workProjectItemsTable, workProjectsTable, usersTable,
  workTimeLogsTable, partLocationsTable, wipLocationsTable,
  companiesTable, inboundTable,
} from "@workspace/db";
import { eq, and, asc, inArray, isNull, sql, desc } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";

const router: IRouter = Router();

// ─── Shared: resolve kiosk from token ────────────────────────────────────────

async function resolveKiosk(token: string) {
  const [kiosk] = await db
    .select({
      id: kioskStationsTable.id,
      companyId: kioskStationsTable.companyId,
      workstationId: kioskStationsTable.workstationId,
      label: kioskStationsTable.label,
    })
    .from(kioskStationsTable)
    .where(eq(kioskStationsTable.token, token));
  return kiosk ?? null;
}

// ─── GET /api/kiosk/verify/:token ─────────────────────────────────────────────
// Verify token, return station info + worker list for identification UI

router.get("/verify/:token", async (req, res) => {
  try {
    const kiosk = await resolveKiosk(req.params.token);
    if (!kiosk) { res.status(404).json({ error: "Invalid kiosk token" }); return; }

    await db.update(kioskStationsTable)
      .set({ lastSeenAt: new Date() })
      .where(eq(kioskStationsTable.id, kiosk.id));

    const [workstation] = await db.select().from(workstationsTable)
      .where(eq(workstationsTable.id, kiosk.workstationId));
    const [stationType] = workstation
      ? await db.select().from(stationTypesTable)
          .where(eq(stationTypesTable.id, workstation.stationTypeId))
      : [undefined];

    const workers = await db
      .select({ id: usersTable.id, username: usersTable.username, kioskPinHash: usersTable.kioskPinHash })
      .from(usersTable)
      .where(and(
        eq(usersTable.companyId, kiosk.companyId),
        inArray(usersTable.role, ["admin", "worker"]),
      ))
      .orderBy(asc(usersTable.username));

    const nfcCards = await db.select({ userId: nfcCardsTable.userId })
      .from(nfcCardsTable)
      .where(eq(nfcCardsTable.companyId, kiosk.companyId));
    const nfcUserIds = new Set(nfcCards.map((c) => c.userId));

    res.json({
      kiosk: { id: kiosk.id, label: kiosk.label },
      workstation: workstation ?? null,
      stationType: stationType ?? null,
      workers: workers.map((w) => ({
        id: w.id,
        username: w.username,
        hasNfc: nfcUserIds.has(w.id),
        hasPin: !!w.kioskPinHash,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to verify kiosk" });
  }
});

// ─── GET /api/kiosk/:token/queue ──────────────────────────────────────────────
// Returns next steps for this workstation's station type, with collect-from hints

router.get("/:token/queue", async (req, res) => {
  try {
    const kiosk = await resolveKiosk(req.params.token);
    if (!kiosk) { res.status(404).json({ error: "Invalid kiosk token" }); return; }

    const { companyId, workstationId } = kiosk;
    const [workstation] = await db.select().from(workstationsTable)
      .where(eq(workstationsTable.id, workstationId));
    if (!workstation) { res.status(404).json({ error: "Workstation not found" }); return; }

    const typeId = workstation.stationTypeId;

    const candidateSteps = await db
      .select({
        stepId: workItemStepsTable.id,
        stepName: workItemStepsTable.name,
        sortOrder: workItemStepsTable.sortOrder,
        status: workItemStepsTable.status,
        durationEstimate: workItemStepsTable.durationEstimate,
        consumesProductId: workItemStepsTable.consumesProductId,
        consumesQuantity: workItemStepsTable.consumesQuantity,
        qcEnabled: workItemStepsTable.qcEnabled,
        qcInstructions: workItemStepsTable.qcInstructions,
        workstationId: workItemStepsTable.workstationId,
        itemId: workProjectItemsTable.id,
        itemName: workProjectItemsTable.name,
        projectId: workProjectsTable.id,
        projectName: workProjectsTable.name,
        projectDeadline: workProjectsTable.deadline,
        projectPriority: workProjectsTable.priority,
        startTime: sql<string | null>`(
          SELECT start_time FROM work_time_logs
          WHERE step_id = ${workItemStepsTable.id} AND end_time IS NULL
          ORDER BY start_time DESC LIMIT 1
        )`,
      })
      .from(workItemStepsTable)
      .innerJoin(workProjectItemsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
      .innerJoin(workProjectsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
      .where(and(
        eq(workItemStepsTable.stationTypeId, typeId),
        inArray(workItemStepsTable.status, ["not_started", "in_progress"]),
        eq(workProjectsTable.status, "in_progress"),
        eq(workProjectsTable.companyId, companyId),
      ))
      .orderBy(asc(workProjectsTable.deadline), asc(workItemStepsTable.sortOrder));

    const itemIds = [...new Set(candidateSteps.map((s) => s.itemId))];
    const allItemSteps = itemIds.length
      ? await db.select({
          id: workItemStepsTable.id,
          itemId: workItemStepsTable.itemId,
          sortOrder: workItemStepsTable.sortOrder,
          status: workItemStepsTable.status,
        }).from(workItemStepsTable).where(inArray(workItemStepsTable.itemId, itemIds))
      : [];

    const itemStepMap = new Map<number, typeof allItemSteps>();
    for (const s of allItemSteps) {
      if (!itemStepMap.has(s.itemId)) itemStepMap.set(s.itemId, []);
      itemStepMap.get(s.itemId)!.push(s);
    }

    const readySteps = candidateSteps.filter((s) => {
      if (s.status === "in_progress") return true;
      const siblings = itemStepMap.get(s.itemId) ?? [];
      return !siblings.some((sib) => sib.sortOrder < s.sortOrder && sib.status !== "completed");
    });

    // Enrich each step with: part location from previous step + claimant name
    const enriched = await Promise.all(readySteps.map(async (step) => {
      const siblings = itemStepMap.get(step.itemId) ?? [];
      const prevStep = siblings
        .filter((s) => s.sortOrder < step.sortOrder && s.status === "completed")
        .sort((a, b) => b.sortOrder - a.sortOrder)[0];

      let collectFrom: string | null = null;
      if (prevStep) {
        const [loc] = await db
          .select({ locationType: partLocationsTable.locationType, locationValue: partLocationsTable.locationValue })
          .from(partLocationsTable)
          .where(eq(partLocationsTable.stepId, prevStep.id))
          .orderBy(desc(partLocationsTable.setAt))
          .limit(1);
        if (loc) {
          if (loc.locationType === "warehouse" && loc.locationValue) {
            collectFrom = loc.locationValue;
          } else if (loc.locationType === "zone" && loc.locationValue) {
            collectFrom = loc.locationValue;
          } else if (loc.locationType === "with_worker") {
            collectFrom = loc.locationValue ?? "with worker";
          }
        }
      }

      let claimedByUsername: string | null = null;
      if (step.status === "in_progress") {
        const [log] = await db
          .select({ username: usersTable.username })
          .from(workTimeLogsTable)
          .innerJoin(usersTable, eq(workTimeLogsTable.userId, usersTable.id))
          .where(and(eq(workTimeLogsTable.stepId, step.stepId), isNull(workTimeLogsTable.endTime)))
          .limit(1);
        claimedByUsername = log?.username ?? null;
      }

      return { ...step, collectFrom, claimedByUsername };
    }));

    res.json({ workstation, steps: enriched });
  } catch (err) {
    res.status(500).json({ error: "Failed to load queue" });
  }
});

// ─── POST /api/kiosk/:token/identify ─────────────────────────────────────────
// Identify a worker by NFC card UID, PIN, or direct select

router.post("/:token/identify", async (req, res) => {
  try {
    const kiosk = await resolveKiosk(req.params.token);
    if (!kiosk) { res.status(404).json({ error: "Invalid kiosk token" }); return; }

    const parsed = z.discriminatedUnion("method", [
      z.object({ method: z.literal("nfc"), cardUid: z.string() }),
      z.object({ method: z.literal("pin"), pin: z.string().min(4).max(4) }),
      z.object({ method: z.literal("select"), userId: z.number().int() }),
    ]).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

    const { companyId } = kiosk;
    let worker: { id: number; username: string } | null = null;

    if (parsed.data.method === "nfc") {
      const [card] = await db.select({ userId: nfcCardsTable.userId })
        .from(nfcCardsTable)
        .where(and(eq(nfcCardsTable.cardUid, parsed.data.cardUid), eq(nfcCardsTable.companyId, companyId)));
      if (!card) { res.status(404).json({ error: "Card not recognised" }); return; }
      const [user] = await db.select({ id: usersTable.id, username: usersTable.username })
        .from(usersTable).where(eq(usersTable.id, card.userId));
      worker = user ?? null;

    } else if (parsed.data.method === "pin") {
      const users = await db
        .select({ id: usersTable.id, username: usersTable.username, kioskPinHash: usersTable.kioskPinHash })
        .from(usersTable).where(eq(usersTable.companyId, companyId));
      for (const u of users) {
        if (u.kioskPinHash && await bcrypt.compare(parsed.data.pin, u.kioskPinHash)) {
          worker = { id: u.id, username: u.username };
          break;
        }
      }
      if (!worker) { res.status(401).json({ error: "Incorrect PIN" }); return; }

    } else {
      const [user] = await db.select({ id: usersTable.id, username: usersTable.username })
        .from(usersTable)
        .where(and(eq(usersTable.id, parsed.data.userId), eq(usersTable.companyId, companyId)));
      worker = user ?? null;
    }

    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }
    res.json({ worker });
  } catch (err) {
    res.status(500).json({ error: "Identification failed" });
  }
});

// ─── POST /api/kiosk/:token/steps/:stepId/start ───────────────────────────────

router.post("/:token/steps/:stepId/start", async (req, res) => {
  try {
    const kiosk = await resolveKiosk(req.params.token);
    if (!kiosk) { res.status(404).json({ error: "Invalid kiosk token" }); return; }

    const stepId = Number(req.params.stepId);
    const parsed = z.object({ workerId: z.number().int() }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "workerId required" }); return; }

    const { workerId } = parsed.data;
    const { companyId } = kiosk;

    const [worker] = await db.select({ id: usersTable.id, username: usersTable.username })
      .from(usersTable)
      .where(and(eq(usersTable.id, workerId), eq(usersTable.companyId, companyId)));
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }

    // Verify step belongs to company
    const [stepRow] = await db
      .select({ id: workItemStepsTable.id, status: workItemStepsTable.status, itemId: workItemStepsTable.itemId, requiresInbound: workItemStepsTable.requiresInbound })
      .from(workItemStepsTable)
      .innerJoin(workProjectItemsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
      .innerJoin(workProjectsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
      .where(and(eq(workItemStepsTable.id, stepId), eq(workProjectsTable.companyId, companyId)));
    if (!stepRow) { res.status(404).json({ error: "Step not found" }); return; }

    if (stepRow.requiresInbound) {
      const [item] = await db.select().from(workProjectItemsTable).where(eq(workProjectItemsTable.id, stepRow.itemId));
      if (item) {
        const [inbound] = await db.select().from(inboundTable)
          .where(and(eq(inboundTable.projectId, item.projectId), eq(inboundTable.companyId, companyId)));
        if (inbound?.status === "expected") {
          res.status(403).json({ error: "Cannot start: waiting for inbound parts." });
          return;
        }
      }
    }

    // Check worker doesn't already have an open timer
    const [existing] = await db.select().from(workTimeLogsTable)
      .where(and(eq(workTimeLogsTable.userId, workerId), isNull(workTimeLogsTable.endTime)));
    if (existing) { res.status(409).json({ error: "Worker already has a running task. Stop it first." }); return; }

    await db.update(workItemStepsTable).set({ status: "in_progress" }).where(eq(workItemStepsTable.id, stepId));
    const [log] = await db.insert(workTimeLogsTable)
      .values({ stepId, userId: workerId, startTime: new Date() })
      .returning();

    await db.insert(wipLocationsTable).values({
      stepId,
      locationType: "with_worker",
      locationValue: `With ${worker.username} (kiosk)`,
      setByUserId: workerId,
    }).catch(() => {});

    res.status(201).json({ log, worker });
  } catch (err) {
    res.status(500).json({ error: "Failed to start step" });
  }
});

// ─── POST /api/kiosk/:token/steps/:stepId/complete ───────────────────────────

router.post("/:token/steps/:stepId/complete", async (req, res) => {
  try {
    const kiosk = await resolveKiosk(req.params.token);
    if (!kiosk) { res.status(404).json({ error: "Invalid kiosk token" }); return; }

    const stepId = Number(req.params.stepId);
    const parsed = z.object({
      workerId: z.number().int(),
      locationType: z.enum(["warehouse", "zone", "with_worker"]).optional(),
      locationValue: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "workerId required" }); return; }

    const { workerId, locationType, locationValue } = parsed.data;
    const { companyId } = kiosk;

    const [worker] = await db.select().from(usersTable)
      .where(and(eq(usersTable.id, workerId), eq(usersTable.companyId, companyId)));
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }

    const [activeLog] = await db.select().from(workTimeLogsTable)
      .where(and(eq(workTimeLogsTable.userId, workerId), eq(workTimeLogsTable.stepId, stepId), isNull(workTimeLogsTable.endTime)));
    if (!activeLog) { res.status(404).json({ error: "No active timer for this step" }); return; }

    const endTime = new Date();
    const durationSeconds = Math.round((endTime.getTime() - activeLog.startTime.getTime()) / 1000);
    await db.update(workTimeLogsTable).set({ endTime, durationSeconds }).where(eq(workTimeLogsTable.id, activeLog.id));

    const [proc] = await db.update(workItemStepsTable)
      .set({ status: "completed", totalTimeSeconds: sql`${workItemStepsTable.totalTimeSeconds} + ${durationSeconds}` })
      .where(eq(workItemStepsTable.id, stepId))
      .returning();

    if (locationType && proc?.itemId) {
      await db.insert(partLocationsTable).values({
        stepId,
        itemId: proc.itemId,
        locationType,
        locationValue: locationValue ?? null,
        setByUserId: workerId,
      }).catch(() => {});
    }

    // Auto-complete the project if every step across all items is now done
    if (proc?.itemId) {
      const [projectRow] = await db
        .select({ projectId: workProjectItemsTable.projectId })
        .from(workProjectItemsTable)
        .where(eq(workProjectItemsTable.id, proc.itemId));

      if (projectRow) {
        const remaining = await db
          .select({ id: workItemStepsTable.id })
          .from(workItemStepsTable)
          .innerJoin(workProjectItemsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
          .where(and(
            eq(workProjectItemsTable.projectId, projectRow.projectId),
            inArray(workItemStepsTable.status, ["not_started", "in_progress"]),
          ));
        if (remaining.length === 0) {
          await db.update(workProjectsTable)
            .set({ status: "completed", completedAt: new Date() })
            .where(eq(workProjectsTable.id, projectRow.projectId));
        }
      }
    }

    res.json({ ok: true, durationSeconds });
  } catch (err) {
    res.status(500).json({ error: "Failed to complete step" });
  }
});

export default router;
