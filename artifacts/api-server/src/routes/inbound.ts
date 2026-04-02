import { Router, type IRouter } from "express";
import { db, inboundTable, workProjectsTable, locationsTable, proceduresTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

// GET /api/inbound — list all inbound records for company, optional ?status= filter
router.get("/", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const statusFilter = req.query.status as string | undefined;

    let rows = await db
      .select({
        inbound: inboundTable,
        projectName: workProjectsTable.name,
        locationName: locationsTable.description,
        procedureName: proceduresTable.name,
      })
      .from(inboundTable)
      .leftJoin(workProjectsTable, eq(inboundTable.projectId, workProjectsTable.id))
      .leftJoin(locationsTable, eq(inboundTable.locationId, locationsTable.id))
      .leftJoin(proceduresTable, eq(inboundTable.procedureId, proceduresTable.id))
      .where(eq(inboundTable.companyId, companyId))
      .orderBy(inboundTable.createdAt);

    if (statusFilter) {
      rows = rows.filter((r) => r.inbound.status === statusFilter);
    }

    res.json(
      rows.map((r) => ({
        ...r.inbound,
        projectName: r.projectName ?? null,
        locationName: r.locationName ?? null,
        procedureName: r.procedureName ?? r.inbound.assignedProcedure ?? null,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list inbound");
    res.status(500).json({ error: "Failed to list inbound" });
  }
});

// POST /api/inbound — manually create an inbound record (admin only)
router.post("/", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = z
      .object({
        projectId: z.number().int().nullable().optional(),
        notes: z.string().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [record] = await db
      .insert(inboundTable)
      .values({
        projectId: parsed.data.projectId ?? null,
        notes: parsed.data.notes ?? null,
        status: "expected",
        companyId,
      })
      .returning();

    res.status(201).json({ ...record, projectName: null, locationName: null, procedureName: null });
  } catch (err) {
    req.log.error({ err }, "Failed to create inbound");
    res.status(500).json({ error: "Failed to create inbound" });
  }
});

// PUT /api/inbound/:id/arrive — mark pallet as arrived
router.put("/:id/arrive", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;

    const [record] = await db
      .update(inboundTable)
      .set({ status: "arrived", receivedAt: new Date() })
      .where(and(eq(inboundTable.id, id), eq(inboundTable.companyId, companyId)))
      .returning();

    if (!record) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json(record);
  } catch (err) {
    req.log.error({ err }, "Failed to mark arrived");
    res.status(500).json({ error: "Failed to mark arrived" });
  }
});

// PUT /api/inbound/:id/route — route to storage or production
router.put("/:id/route", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;

    const parsed = z
      .object({
        destination: z.enum(["store", "production"]),
        locationId: z.string().optional(),
        procedureId: z.number().int().optional(),
        assignedProcedure: z.string().optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { destination, locationId, procedureId, assignedProcedure } = parsed.data;

    if (destination === "store" && !locationId) {
      res.status(400).json({ error: "locationId required for store destination" });
      return;
    }
    if (destination === "production" && !procedureId && !assignedProcedure) {
      res.status(400).json({ error: "procedureId or assignedProcedure required for production destination" });
      return;
    }

    // Resolve procedure name if procedureId given
    let resolvedProcedureName: string | null = assignedProcedure ?? null;
    if (procedureId) {
      const [proc] = await db.select().from(proceduresTable)
        .where(and(eq(proceduresTable.id, procedureId), eq(proceduresTable.companyId, companyId)));
      if (proc) resolvedProcedureName = proc.name;
    }

    const updates =
      destination === "store"
        ? { status: "stored" as const, locationId: locationId!, assignedProcedure: null, procedureId: null }
        : {
            status: "in_production" as const,
            assignedProcedure: resolvedProcedureName,
            procedureId: procedureId ?? null,
            locationId: null,
          };

    const [record] = await db
      .update(inboundTable)
      .set(updates)
      .where(and(eq(inboundTable.id, id), eq(inboundTable.companyId, companyId)))
      .returning();

    if (!record) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json({ ...record, procedureName: resolvedProcedureName });
  } catch (err) {
    req.log.error({ err }, "Failed to route inbound");
    res.status(500).json({ error: "Failed to route inbound" });
  }
});

// DELETE /api/inbound/:id — admin only
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;
    await db
      .delete(inboundTable)
      .where(and(eq(inboundTable.id, id), eq(inboundTable.companyId, companyId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete inbound");
    res.status(500).json({ error: "Failed to delete inbound" });
  }
});

export default router;
