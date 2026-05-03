import { Router, type IRouter } from "express";
import {
  db, workTemplatesTable, workStepsTable, workProjectsTable,
  workProjectItemsTable, workItemStepsTable, workTimeLogsTable, inboundTable,
  productsTable, productComponentsTable,
  rolesTable, userRolesTable, stepPresetsTable, stepPresetEntriesTable, aiSnapshotsTable,
} from "@workspace/db";
import { eq, and, isNull, sql, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { seedStarterPack, STARTER_PACK_COUNT } from "../lib/seedStarterPack";

const router: IRouter = Router();

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Returns the full template row if owned by companyId, else null. */
async function getOwnedTemplate(templateId: number, companyId: number) {
  const [t] = await db.select().from(workTemplatesTable)
    .where(and(eq(workTemplatesTable.id, templateId), eq(workTemplatesTable.companyId, companyId)));
  return t ?? null;
}

/**
 * Returns the productComponent row if it belongs to a template owned by companyId,
 * else null.  componentId = productComponentsTable.id (the BOM entry's PK).
 */
async function getOwnedComponent(templateId: number, componentId: number, companyId: number) {
  const tmpl = await getOwnedTemplate(templateId, companyId);
  if (!tmpl?.productId) return null;
  const [comp] = await db.select().from(productComponentsTable)
    .where(and(
      eq(productComponentsTable.id, componentId),
      eq(productComponentsTable.parentProductId, tmpl.productId),
    ));
  return comp ?? null;
}

const procSchema = z.object({
  name: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  requiresInbound: z.boolean().optional(),
  roleId: z.number().int().nullable().optional(),
  batchMode: z.string().optional(),
  durationEstimate: z.number().int().nullable().optional(),
});

// ─── TEMPLATES ────────────────────────────────────────────────────────────────

router.get("/templates", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const templates = await db.select().from(workTemplatesTable)
      .where(eq(workTemplatesTable.companyId, companyId))
      .orderBy(workTemplatesTable.name);
    res.json(templates);
  } catch (err) {
    req.log.error({ err }, "Failed to list templates");
    res.status(500).json({ error: "Failed to list templates" });
  }
});

// Seed starter pack (POST /work/templates/seed-starter-pack)
router.post("/templates/seed-starter-pack", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    await seedStarterPack(companyId);
    res.status(201).json({ seeded: STARTER_PACK_COUNT });
  } catch (err) {
    req.log.error({ err }, "Failed to seed starter pack");
    res.status(500).json({ error: "Failed to seed starter pack" });
  }
});

// AI generate template preview — returns structured payload WITHOUT persisting (requires explicit confirm)
router.post("/templates/generate", requireAdmin, async (req, res) => {
  try {
    const parsed = z.object({
      description: z.string().min(3),
      existingRoles: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Description required" }); return; }

    const { description, existingRoles = [] } = parsed.data;
    const roleList = existingRoles.map((r) => `- id:${r.id} "${r.name}"`).join("\n");

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{
        role: "user",
        content: `You are a production planning assistant for a custom fabrication shop. Generate a work order template based on this description:

"${description}"

Available roles (use their IDs if relevant, or null if uncertain):
${roleList || "None defined yet"}

Respond with ONLY a valid JSON object in this exact shape (no markdown, no explanation):
{
  "name": "Template name",
  "parts": [
    {
      "name": "Sub-part name",
      "itemType": "manufactured_part",
      "procedures": [
        { "name": "Step name", "roleId": null, "batchMode": "individual", "durationEstimate": null }
      ]
    }
  ],
  "topProcedures": [
    { "name": "Final step", "roleId": null, "batchMode": "individual", "durationEstimate": null }
  ]
}

Rules:
- batchMode must be "individual", "free_batch", or "type_batch"
- durationEstimate is minutes (integer or null)
- roleId must be null or one of the IDs listed above
- Keep names concise (2-5 words each)
- Include 2-6 top procedures and 0-4 parts with 1-6 procedures each
- Focus on the actual fabrication steps, not project management`,
      }],
    });

    const text = message.content[0];
    if (text.type !== "text") throw new Error("No text response");

    let generated: {
      name: string;
      parts: { name: string; itemType: string; procedures: { name: string; roleId: number | null; batchMode: string; durationEstimate: number | null }[] }[];
      topProcedures: { name: string; roleId: number | null; batchMode: string; durationEstimate: number | null }[];
    };
    try {
      generated = JSON.parse(text.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    } catch {
      res.status(500).json({ error: "AI returned invalid JSON" }); return;
    }

    // Return the preview payload — nothing is saved to the database yet
    res.json({ preview: generated });
  } catch (err) {
    req.log.error({ err }, "Failed to generate template preview");
    res.status(500).json({ error: "Failed to generate template" });
  }
});

// Confirm and persist a generated template (called after user reviews the AI preview)
router.post("/templates/confirm-generate", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = z.object({
      name: z.string().min(1),
      topProcedures: z.array(z.object({
        name: z.string().min(1),
        roleId: z.number().int().nullable().optional(),
        batchMode: z.string().optional(),
        durationEstimate: z.number().int().nullable().optional(),
      })).optional().default([]),
      parts: z.array(z.object({
        name: z.string().min(1),
        itemType: z.string().optional(),
        procedures: z.array(z.object({
          name: z.string().min(1),
          roleId: z.number().int().nullable().optional(),
          batchMode: z.string().optional(),
          durationEstimate: z.number().int().nullable().optional(),
        })),
      })).optional().default([]),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid template payload" }); return; }

    const { name, topProcedures, parts } = parsed.data;

    const [product] = await db.insert(productsTable).values({
      name, category: "Template", itemType: "final_product",
      bufferStock: 0, targetStock: 0, companyId,
    }).returning();

    const [template] = await db.insert(workTemplatesTable).values({
      name, companyId, productId: product.id,
    }).returning();

    for (let i = 0; i < topProcedures.length; i++) {
      const p = topProcedures[i];
      await db.insert(workStepsTable).values({
        templateId: template.id, name: p.name, sortOrder: i,
        roleId: p.roleId ?? null, batchMode: p.batchMode ?? "individual",
        durationEstimate: p.durationEstimate ?? null,
      });
    }

    for (let pi = 0; pi < parts.length; pi++) {
      const part = parts[pi];
      const [partProduct] = await db.insert(productsTable).values({
        name: part.name, category: "Component",
        itemType: part.itemType ?? "manufactured_part" as "manufactured_part",
        bufferStock: 0, targetStock: 0, companyId,
      }).returning();
      const [compEntry] = await db.insert(productComponentsTable).values({
        parentProductId: product.id, componentProductId: partProduct.id, quantity: 1, sortOrder: pi,
      }).returning();
      // Save component steps into work_steps with templateComponentId = compEntry.id
      for (let j = 0; j < part.procedures.length; j++) {
        const p = part.procedures[j];
        await db.insert(workStepsTable).values({
          templateId: template.id, templateComponentId: compEntry.id,
          name: p.name, sortOrder: j,
          roleId: p.roleId ?? null, batchMode: p.batchMode ?? "individual",
          durationEstimate: p.durationEstimate ?? null,
        });
      }
    }

    res.status(201).json({ template, productId: product.id });
  } catch (err) {
    req.log.error({ err }, "Failed to confirm template generation");
    res.status(500).json({ error: "Failed to save template" });
  }
});

router.post("/templates", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Name required" }); return; }

    const [product] = await db.insert(productsTable).values({
      name: parsed.data.name, category: "", itemType: "final_product",
      bufferStock: 0, targetStock: 0, companyId,
    }).returning();

    const [t] = await db.insert(workTemplatesTable).values({
      name: parsed.data.name, companyId, productId: product.id,
    }).returning();
    res.status(201).json({ ...t, productId: product.id });
  } catch (err) {
    req.log.error({ err }, "Failed to create template");
    res.status(500).json({ error: "Failed to create template" });
  }
});

router.put("/templates/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;
    const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Name required" }); return; }
    const [t] = await db.update(workTemplatesTable).set({ name: parsed.data.name })
      .where(and(eq(workTemplatesTable.id, id), eq(workTemplatesTable.companyId, companyId))).returning();
    if (!t) { res.status(404).json({ error: "Not found" }); return; }
    res.json(t);
  } catch (err) {
    req.log.error({ err }, "Failed to update template");
    res.status(500).json({ error: "Failed to update template" });
  }
});

// Clone a template
router.post("/templates/:id/clone", requireAdmin, async (req, res) => {
  try {
    const templateId = Number(req.params.id);
    const companyId = req.session.companyId!;

    const [source] = await db.select().from(workTemplatesTable)
      .where(and(eq(workTemplatesTable.id, templateId), eq(workTemplatesTable.companyId, companyId)));
    if (!source) { res.status(404).json({ error: "Not found" }); return; }

    const cloneName = `${source.name} (copy)`;

    // Clone the final_product
    let newProductId: number | null = null;
    if (source.productId) {
      const [srcProduct] = await db.select().from(productsTable).where(eq(productsTable.id, source.productId));
      if (srcProduct) {
        const [newProduct] = await db.insert(productsTable).values({
          name: cloneName, category: srcProduct.category, itemType: srcProduct.itemType,
          bufferStock: srcProduct.bufferStock, targetStock: srcProduct.targetStock, companyId,
        }).returning();
        newProductId = newProduct.id;

        // Clone BOM components
        const components = await db.select().from(productComponentsTable)
          .where(eq(productComponentsTable.parentProductId, source.productId))
          .orderBy(productComponentsTable.sortOrder);

        // Track old→new component ID mapping for copying work_steps
        const compIdMap = new Map<number, number>(); // oldComponentId → newComponentId
        for (const comp of components) {
          const [compProduct] = await db.select().from(productsTable).where(eq(productsTable.id, comp.componentProductId));
          if (!compProduct) continue;
          const [newComp] = await db.insert(productsTable).values({
            name: compProduct.name, category: compProduct.category, itemType: compProduct.itemType,
            bufferStock: compProduct.bufferStock, targetStock: compProduct.targetStock, companyId,
          }).returning();
          const [newCompEntry] = await db.insert(productComponentsTable).values({
            parentProductId: newProductId, componentProductId: newComp.id,
            quantity: comp.quantity, sortOrder: comp.sortOrder,
          }).returning();
          compIdMap.set(comp.id, newCompEntry.id);
        }
      }
    }

    const [newTemplate] = await db.insert(workTemplatesTable).values({
      name: cloneName, companyId, productId: newProductId,
    }).returning();

    // Clone all work_steps (top-level and component-level)
    const srcSteps = await db.select().from(workStepsTable)
      .where(eq(workStepsTable.templateId, templateId))
      .orderBy(workStepsTable.sortOrder);

    // Rebuild compIdMap in scope for step cloning
    // Re-query the new template's components to map old→new component IDs
    const newComponents = newProductId
      ? await db.select().from(productComponentsTable).where(eq(productComponentsTable.parentProductId, newProductId))
      : [];
    const oldComponents = source.productId
      ? await db.select().from(productComponentsTable).where(eq(productComponentsTable.parentProductId, source.productId))
        .orderBy(productComponentsTable.sortOrder)
      : [];
    // Match by sortOrder (same order as original)
    const cloneCompIdMap = new Map<number, number>();
    oldComponents.forEach((oc, i) => {
      if (newComponents[i]) cloneCompIdMap.set(oc.id, newComponents[i].id);
    });

    for (const s of srcSteps) {
      const newTemplateComponentId = s.templateComponentId
        ? (cloneCompIdMap.get(s.templateComponentId) ?? null)
        : null;
      await db.insert(workStepsTable).values({
        templateId: newTemplate.id, name: s.name, sortOrder: s.sortOrder,
        requiresInbound: s.requiresInbound, roleId: s.roleId ?? null,
        batchMode: s.batchMode ?? "individual", durationEstimate: s.durationEstimate ?? null,
        templateComponentId: newTemplateComponentId,
      });
    }

    res.status(201).json(newTemplate);
  } catch (err) {
    req.log.error({ err }, "Failed to clone template");
    res.status(500).json({ error: "Failed to clone template" });
  }
});

// AI edit template
router.put("/templates/:id/ai-edit", requireAdmin, async (req, res) => {
  try {
    const templateId = Number(req.params.id);
    const companyId = req.session.companyId!;
    const parsed = z.object({
      instruction: z.string().min(3),
      existingRoles: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Instruction required" }); return; }

    const [template] = await db.select().from(workTemplatesTable)
      .where(and(eq(workTemplatesTable.id, templateId), eq(workTemplatesTable.companyId, companyId)));
    if (!template) { res.status(404).json({ error: "Not found" }); return; }

    // Snapshot current state before editing (top-level steps only)
    const currentProcs = await db.select().from(workStepsTable)
      .where(and(eq(workStepsTable.templateId, templateId), isNull(workStepsTable.templateComponentId)))
      .orderBy(workStepsTable.sortOrder);

    // Save snapshot for undo
    await db.insert(aiSnapshotsTable).values({
      entityType: "template_procs",
      entityId: templateId,
      companyId,
      snapshot: currentProcs as unknown as Record<string, unknown>[],
    });

    const { instruction, existingRoles = [] } = parsed.data;
    const roleList = existingRoles.map((r) => `- id:${r.id} "${r.name}"`).join("\n");
    const currentState = currentProcs.map((p, i) => `${i + 1}. "${p.name}" roleId:${p.roleId ?? "null"} batchMode:${p.batchMode} duration:${p.durationEstimate ?? "null"}`).join("\n");

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{
        role: "user",
        content: `You are editing the top-level production steps for template "${template.name}".

Current steps:
${currentState || "(none)"}

Available roles:
${roleList || "None"}

User instruction: "${instruction}"

Respond with ONLY a valid JSON array of steps (no markdown):
[
  { "name": "Step name", "roleId": null, "batchMode": "individual", "durationEstimate": null }
]

Rules:
- Return the COMPLETE updated list, not just changes
- batchMode: "individual", "free_batch", or "type_batch"
- durationEstimate: integer minutes or null
- roleId: null or one of the IDs above`,
      }],
    });

    const text = message.content[0];
    if (text.type !== "text") throw new Error("No text response");

    let steps: { name: string; roleId: number | null; batchMode: string; durationEstimate: number | null }[];
    try {
      steps = JSON.parse(text.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    } catch {
      res.status(500).json({ error: "AI returned invalid JSON" }); return;
    }

    // Replace all top-level template procedures (leave component steps untouched)
    await db.delete(workStepsTable).where(and(eq(workStepsTable.templateId, templateId), isNull(workStepsTable.templateComponentId)));
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      await db.insert(workStepsTable).values({
        templateId, name: s.name, sortOrder: i,
        roleId: s.roleId ?? null, batchMode: s.batchMode ?? "individual",
        durationEstimate: s.durationEstimate ?? null,
      });
    }

    const updated = await db.select().from(workStepsTable)
      .where(and(eq(workStepsTable.templateId, templateId), isNull(workStepsTable.templateComponentId)))
      .orderBy(workStepsTable.sortOrder);
    res.json({ procedures: updated, canUndo: true });
  } catch (err) {
    req.log.error({ err }, "Failed to AI edit template");
    res.status(500).json({ error: "Failed to AI edit template" });
  }
});

// Undo AI edit
router.post("/templates/:id/undo", requireAdmin, async (req, res) => {
  try {
    const templateId = Number(req.params.id);
    const companyId = req.session.companyId!;

    const [snapshot] = await db.select().from(aiSnapshotsTable)
      .where(and(
        eq(aiSnapshotsTable.entityType, "template_procs"),
        eq(aiSnapshotsTable.entityId, templateId),
        eq(aiSnapshotsTable.companyId, companyId),
      ))
      .orderBy(sql`${aiSnapshotsTable.createdAt} DESC`)
      .limit(1);

    if (!snapshot) { res.status(404).json({ error: "No snapshot to undo" }); return; }

    // Enforce 10-minute expiry
    const snapshotAge = Date.now() - new Date(snapshot.createdAt).getTime();
    if (snapshotAge > 10 * 60 * 1000) {
      await db.delete(aiSnapshotsTable).where(eq(aiSnapshotsTable.id, snapshot.id));
      res.status(410).json({ error: "Undo window has expired (10 minutes)" });
      return;
    }

    const procs = snapshot.snapshot as { name: string; sortOrder: number; requiresInbound: boolean; roleId: number | null; batchMode: string; durationEstimate: number | null }[];
    // Restore only top-level steps; leave component steps untouched
    await db.delete(workStepsTable).where(and(eq(workStepsTable.templateId, templateId), isNull(workStepsTable.templateComponentId)));
    for (const p of procs) {
      await db.insert(workStepsTable).values({
        templateId, name: p.name, sortOrder: p.sortOrder,
        requiresInbound: p.requiresInbound ?? false,
        roleId: p.roleId ?? null, batchMode: p.batchMode ?? "individual",
        durationEstimate: p.durationEstimate ?? null,
      });
    }

    // Remove the used snapshot
    await db.delete(aiSnapshotsTable).where(eq(aiSnapshotsTable.id, snapshot.id));

    const updated = await db.select().from(workStepsTable)
      .where(and(eq(workStepsTable.templateId, templateId), isNull(workStepsTable.templateComponentId)))
      .orderBy(workStepsTable.sortOrder);
    res.json({ procedures: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to undo AI edit");
    res.status(500).json({ error: "Failed to undo" });
  }
});

// Get template procedures (includes hasSnapshot flag for undo button visibility)
router.get("/templates/:id/procedures", requireAuth, async (req, res) => {
  try {
    const templateId = Number(req.params.id);
    const companyId = req.session.companyId!;
    if (!await getOwnedTemplate(templateId, companyId)) { res.status(404).json({ error: "Not found" }); return; }
    const procs = await db.select().from(workStepsTable)
      .where(and(eq(workStepsTable.templateId, templateId), isNull(workStepsTable.templateComponentId)))
      .orderBy(workStepsTable.sortOrder);

    // Check if a valid (non-expired) snapshot exists for the undo button
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const [snapshot] = await db.select({ id: aiSnapshotsTable.id, createdAt: aiSnapshotsTable.createdAt })
      .from(aiSnapshotsTable)
      .where(and(
        eq(aiSnapshotsTable.entityType, "template_procs"),
        eq(aiSnapshotsTable.entityId, templateId),
        eq(aiSnapshotsTable.companyId, companyId),
        sql`${aiSnapshotsTable.createdAt} > ${tenMinAgo}`,
      ))
      .orderBy(sql`${aiSnapshotsTable.createdAt} DESC`)
      .limit(1);

    res.json({ procedures: procs, hasSnapshot: !!snapshot });
  } catch (err) {
    req.log.error({ err }, "Failed to list template procedures");
    res.status(500).json({ error: "Failed to list template procedures" });
  }
});

router.post("/templates/:id/procedures", requireAdmin, async (req, res) => {
  try {
    const templateId = Number(req.params.id);
    const companyId = req.session.companyId!;
    if (!await getOwnedTemplate(templateId, companyId)) { res.status(404).json({ error: "Not found" }); return; }
    const parsed = z.object({
      name: z.string().min(1),
      sortOrder: z.number().int().optional(),
      roleId: z.number().int().nullable().optional(),
      batchMode: z.string().optional(),
      durationEstimate: z.number().int().nullable().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Name required" }); return; }
    let so = parsed.data.sortOrder;
    if (so === undefined) {
      const existing = await db.select().from(workStepsTable)
        .where(and(eq(workStepsTable.templateId, templateId), isNull(workStepsTable.templateComponentId)));
      so = existing.length;
    }
    const [p] = await db.insert(workStepsTable).values({
      templateId, name: parsed.data.name, sortOrder: so,
      templateComponentId: null,
      roleId: parsed.data.roleId ?? null,
      batchMode: parsed.data.batchMode ?? "individual",
      durationEstimate: parsed.data.durationEstimate ?? null,
    }).returning();
    res.status(201).json(p);
  } catch (err) {
    req.log.error({ err }, "Failed to add procedure");
    res.status(500).json({ error: "Failed to add procedure" });
  }
});

router.put("/templates/:id/procedures/reorder", requireAdmin, async (req, res) => {
  try {
    const templateId = Number(req.params.id);
    const companyId = req.session.companyId!;
    if (!await getOwnedTemplate(templateId, companyId)) { res.status(404).json({ error: "Not found" }); return; }
    const parsed = z.object({
      order: z.array(z.object({ id: z.number().int(), sortOrder: z.number().int() })),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid order" }); return; }
    for (const { id, sortOrder } of parsed.data.order) {
      await db.update(workStepsTable).set({ sortOrder })
        .where(and(eq(workStepsTable.id, id), eq(workStepsTable.templateId, templateId)));
    }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to reorder procedures");
    res.status(500).json({ error: "Failed to reorder procedures" });
  }
});

router.put("/templates/:templateId/procedures/:procId", requireAdmin, async (req, res) => {
  try {
    const templateId = Number(req.params.templateId);
    const procId = Number(req.params.procId);
    const companyId = req.session.companyId!;
    if (!await getOwnedTemplate(templateId, companyId)) { res.status(404).json({ error: "Not found" }); return; }
    const parsed = procSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const [p] = await db.update(workStepsTable).set(parsed.data)
      .where(and(eq(workStepsTable.id, procId), eq(workStepsTable.templateId, templateId))).returning();
    if (!p) { res.status(404).json({ error: "Not found" }); return; }
    res.json(p);
  } catch (err) {
    req.log.error({ err }, "Failed to update procedure");
    res.status(500).json({ error: "Failed to update procedure" });
  }
});

router.delete("/templates/:templateId/procedures/:procId", requireAdmin, async (req, res) => {
  try {
    const templateId = Number(req.params.templateId);
    const procId = Number(req.params.procId);
    const companyId = req.session.companyId!;
    if (!await getOwnedTemplate(templateId, companyId)) { res.status(404).json({ error: "Not found" }); return; }
    await db.delete(workStepsTable)
      .where(and(eq(workStepsTable.id, procId), eq(workStepsTable.templateId, templateId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete procedure");
    res.status(500).json({ error: "Failed to delete procedure" });
  }
});

router.delete("/templates/:id", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    await db.delete(workTemplatesTable)
      .where(and(eq(workTemplatesTable.id, Number(req.params.id)), eq(workTemplatesTable.companyId, companyId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete template");
    res.status(500).json({ error: "Failed to delete template" });
  }
});

// ─── STEP PRESETS ─────────────────────────────────────────────────────────────

router.get("/step-presets", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const presets = await db.select().from(stepPresetsTable)
      .where(eq(stepPresetsTable.companyId, companyId))
      .orderBy(stepPresetsTable.name);
    const presetsWithEntries = await Promise.all(presets.map(async (preset) => {
      const entries = await db.select().from(stepPresetEntriesTable)
        .where(eq(stepPresetEntriesTable.presetId, preset.id))
        .orderBy(stepPresetEntriesTable.sortOrder);
      return { ...preset, entries };
    }));
    res.json(presetsWithEntries);
  } catch (err) {
    req.log.error({ err }, "Failed to list step presets");
    res.status(500).json({ error: "Failed to list step presets" });
  }
});

router.post("/step-presets", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = z.object({
      name: z.string().min(1),
      entries: z.array(z.object({
        name: z.string().min(1),
        roleId: z.number().int().nullable().optional(),
        batchMode: z.string().optional(),
        durationEstimate: z.number().int().nullable().optional(),
      })),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Name and entries required" }); return; }

    const [preset] = await db.insert(stepPresetsTable).values({
      name: parsed.data.name, companyId,
    }).returning();

    for (let i = 0; i < parsed.data.entries.length; i++) {
      const e = parsed.data.entries[i];
      await db.insert(stepPresetEntriesTable).values({
        presetId: preset.id, name: e.name, sortOrder: i,
        roleId: e.roleId ?? null, batchMode: e.batchMode ?? "individual",
        durationEstimate: e.durationEstimate ?? null,
      });
    }

    const entries = await db.select().from(stepPresetEntriesTable)
      .where(eq(stepPresetEntriesTable.presetId, preset.id))
      .orderBy(stepPresetEntriesTable.sortOrder);
    res.status(201).json({ ...preset, entries });
  } catch (err) {
    req.log.error({ err }, "Failed to create step preset");
    res.status(500).json({ error: "Failed to create step preset" });
  }
});

router.delete("/step-presets/:id", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    await db.delete(stepPresetsTable)
      .where(and(eq(stepPresetsTable.id, Number(req.params.id)), eq(stepPresetsTable.companyId, companyId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete step preset");
    res.status(500).json({ error: "Failed to delete step preset" });
  }
});

// Apply preset to template procedures
router.post("/templates/:id/apply-preset", requireAdmin, async (req, res) => {
  try {
    const templateId = Number(req.params.id);
    const companyId = req.session.companyId!;
    if (!await getOwnedTemplate(templateId, companyId)) { res.status(404).json({ error: "Template not found" }); return; }
    const parsed = z.object({ presetId: z.number().int(), append: z.boolean().optional() }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "presetId required" }); return; }

    const [preset] = await db.select().from(stepPresetsTable)
      .where(and(eq(stepPresetsTable.id, parsed.data.presetId), eq(stepPresetsTable.companyId, companyId)));
    if (!preset) { res.status(404).json({ error: "Preset not found" }); return; }

    const entries = await db.select().from(stepPresetEntriesTable)
      .where(eq(stepPresetEntriesTable.presetId, preset.id))
      .orderBy(stepPresetEntriesTable.sortOrder);

    let baseSortOrder = 0;
    if (parsed.data.append) {
      const existing = await db.select().from(workStepsTable)
        .where(and(eq(workStepsTable.templateId, templateId), isNull(workStepsTable.templateComponentId)));
      baseSortOrder = existing.length;
    } else {
      await db.delete(workStepsTable).where(and(eq(workStepsTable.templateId, templateId), isNull(workStepsTable.templateComponentId)));
    }

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      await db.insert(workStepsTable).values({
        templateId, name: e.name, sortOrder: baseSortOrder + i,
        roleId: e.roleId ?? null, batchMode: e.batchMode ?? "individual",
        durationEstimate: e.durationEstimate ?? null,
        // templateComponentId intentionally null → top-level step
      });
    }

    const procs = await db.select().from(workStepsTable)
      .where(and(eq(workStepsTable.templateId, templateId), isNull(workStepsTable.templateComponentId)))
      .orderBy(workStepsTable.sortOrder);
    res.json(procs);
  } catch (err) {
    req.log.error({ err }, "Failed to apply preset");
    res.status(500).json({ error: "Failed to apply preset" });
  }
});

// ─── TEMPLATE COMPONENT STEPS ─────────────────────────────────────────────────
// Steps for BOM sub-parts live in work_steps with templateComponentId = productComponent.id
// This decouples component step sequences from global product_procedures.

// List BOM components for a template, with their per-template steps
router.get("/templates/:id/components", requireAuth, async (req, res) => {
  try {
    const templateId = Number(req.params.id);
    const companyId = req.session.companyId!;
    const tmpl = await getOwnedTemplate(templateId, companyId);
    if (!tmpl) { res.status(404).json({ error: "Not found" }); return; }
    if (!tmpl.productId) { res.json([]); return; }

    const components = await db.select().from(productComponentsTable)
      .where(eq(productComponentsTable.parentProductId, tmpl.productId))
      .orderBy(productComponentsTable.sortOrder);

    const result = await Promise.all(components.map(async (comp) => {
      const [product] = await db.select().from(productsTable)
        .where(eq(productsTable.id, comp.componentProductId));
      const steps = await db.select().from(workStepsTable)
        .where(and(
          eq(workStepsTable.templateId, templateId),
          eq(workStepsTable.templateComponentId, comp.id),
        ))
        .orderBy(workStepsTable.sortOrder);
      return { ...comp, product, procedures: steps };
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list template components");
    res.status(500).json({ error: "Failed to list template components" });
  }
});

// List steps for one BOM component within a template
router.get("/templates/:templateId/components/:componentId/steps", requireAdmin, async (req, res) => {
  try {
    const templateId = Number(req.params.templateId);
    const componentId = Number(req.params.componentId);
    const companyId = req.session.companyId!;
    if (!await getOwnedComponent(templateId, componentId, companyId)) { res.status(404).json({ error: "Not found" }); return; }
    const steps = await db.select().from(workStepsTable)
      .where(and(
        eq(workStepsTable.templateId, templateId),
        eq(workStepsTable.templateComponentId, componentId),
      ))
      .orderBy(workStepsTable.sortOrder);
    res.json(steps);
  } catch (err) {
    req.log.error({ err }, "Failed to list component steps");
    res.status(500).json({ error: "Failed to list component steps" });
  }
});

// Add a step to a BOM component in a template
router.post("/templates/:templateId/components/:componentId/steps", requireAdmin, async (req, res) => {
  try {
    const templateId = Number(req.params.templateId);
    const componentId = Number(req.params.componentId);
    const companyId = req.session.companyId!;
    if (!await getOwnedComponent(templateId, componentId, companyId)) { res.status(404).json({ error: "Not found" }); return; }
    const parsed = z.object({
      name: z.string().min(1),
      roleId: z.number().int().nullable().optional(),
      batchMode: z.string().optional(),
      durationEstimate: z.number().int().nullable().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Name required" }); return; }
    const existing = await db.select().from(workStepsTable)
      .where(and(eq(workStepsTable.templateId, templateId), eq(workStepsTable.templateComponentId, componentId)));
    const [step] = await db.insert(workStepsTable).values({
      templateId,
      templateComponentId: componentId,
      name: parsed.data.name,
      sortOrder: existing.length,
      roleId: parsed.data.roleId ?? null,
      batchMode: parsed.data.batchMode ?? "individual",
      durationEstimate: parsed.data.durationEstimate ?? null,
    }).returning();
    res.status(201).json(step);
  } catch (err) {
    req.log.error({ err }, "Failed to add component step");
    res.status(500).json({ error: "Failed to add component step" });
  }
});

// Reorder steps for a BOM component
router.put("/templates/:templateId/components/:componentId/steps/reorder", requireAdmin, async (req, res) => {
  try {
    const templateId = Number(req.params.templateId);
    const componentId = Number(req.params.componentId);
    const companyId = req.session.companyId!;
    if (!await getOwnedComponent(templateId, componentId, companyId)) { res.status(404).json({ error: "Not found" }); return; }
    const parsed = z.object({
      order: z.array(z.object({ id: z.number().int(), sortOrder: z.number().int() })),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid order" }); return; }
    for (const { id, sortOrder } of parsed.data.order) {
      await db.update(workStepsTable).set({ sortOrder })
        .where(and(
          eq(workStepsTable.id, id),
          eq(workStepsTable.templateId, templateId),
          eq(workStepsTable.templateComponentId, componentId),
        ));
    }
    const steps = await db.select().from(workStepsTable)
      .where(and(eq(workStepsTable.templateId, templateId), eq(workStepsTable.templateComponentId, componentId)))
      .orderBy(workStepsTable.sortOrder);
    res.json(steps);
  } catch (err) {
    req.log.error({ err }, "Failed to reorder component steps");
    res.status(500).json({ error: "Failed to reorder component steps" });
  }
});

// Update a component step
router.put("/templates/:templateId/components/:componentId/steps/:stepId", requireAdmin, async (req, res) => {
  try {
    const templateId = Number(req.params.templateId);
    const componentId = Number(req.params.componentId);
    const stepId = Number(req.params.stepId);
    const companyId = req.session.companyId!;
    if (!await getOwnedComponent(templateId, componentId, companyId)) { res.status(404).json({ error: "Not found" }); return; }
    const parsed = procSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const [step] = await db.update(workStepsTable).set(parsed.data)
      .where(and(
        eq(workStepsTable.id, stepId),
        eq(workStepsTable.templateId, templateId),
        eq(workStepsTable.templateComponentId, componentId),
      )).returning();
    if (!step) { res.status(404).json({ error: "Step not found" }); return; }
    res.json(step);
  } catch (err) {
    req.log.error({ err }, "Failed to update component step");
    res.status(500).json({ error: "Failed to update component step" });
  }
});

// Delete a component step
router.delete("/templates/:templateId/components/:componentId/steps/:stepId", requireAdmin, async (req, res) => {
  try {
    const templateId = Number(req.params.templateId);
    const componentId = Number(req.params.componentId);
    const stepId = Number(req.params.stepId);
    const companyId = req.session.companyId!;
    if (!await getOwnedComponent(templateId, componentId, companyId)) { res.status(404).json({ error: "Not found" }); return; }
    await db.delete(workStepsTable)
      .where(and(
        eq(workStepsTable.id, stepId),
        eq(workStepsTable.templateId, templateId),
        eq(workStepsTable.templateComponentId, componentId),
      ));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete component step");
    res.status(500).json({ error: "Failed to delete component step" });
  }
});

// Apply a step preset to a BOM component's step sequence
router.post("/templates/:templateId/components/:componentId/apply-preset", requireAdmin, async (req, res) => {
  try {
    const templateId = Number(req.params.templateId);
    const componentId = Number(req.params.componentId);
    const companyId = req.session.companyId!;
    if (!await getOwnedComponent(templateId, componentId, companyId)) { res.status(404).json({ error: "Not found" }); return; }
    const parsed = z.object({ presetId: z.number().int(), append: z.boolean().optional() }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "presetId required" }); return; }

    const [preset] = await db.select().from(stepPresetsTable)
      .where(and(eq(stepPresetsTable.id, parsed.data.presetId), eq(stepPresetsTable.companyId, companyId)));
    if (!preset) { res.status(404).json({ error: "Preset not found" }); return; }

    const entries = await db.select().from(stepPresetEntriesTable)
      .where(eq(stepPresetEntriesTable.presetId, preset.id))
      .orderBy(stepPresetEntriesTable.sortOrder);

    let baseSortOrder = 0;
    if (parsed.data.append) {
      const existing = await db.select().from(workStepsTable)
        .where(and(eq(workStepsTable.templateId, templateId), eq(workStepsTable.templateComponentId, componentId)));
      baseSortOrder = existing.length;
    } else {
      await db.delete(workStepsTable)
        .where(and(eq(workStepsTable.templateId, templateId), eq(workStepsTable.templateComponentId, componentId)));
    }

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      await db.insert(workStepsTable).values({
        templateId, templateComponentId: componentId, name: e.name,
        sortOrder: baseSortOrder + i,
        roleId: e.roleId ?? null, batchMode: e.batchMode ?? "individual",
        durationEstimate: e.durationEstimate ?? null,
      });
    }

    const steps = await db.select().from(workStepsTable)
      .where(and(eq(workStepsTable.templateId, templateId), eq(workStepsTable.templateComponentId, componentId)))
      .orderBy(workStepsTable.sortOrder);
    res.json(steps);
  } catch (err) {
    req.log.error({ err }, "Failed to apply preset to component");
    res.status(500).json({ error: "Failed to apply preset to component" });
  }
});

// ─── BATCH QUEUE ──────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function topPriority(items: { priority: string }[]): string {
  return items.reduce((best, i) =>
    (PRIORITY_ORDER[i.priority] ?? 99) < (PRIORITY_ORDER[best] ?? 99) ? i.priority : best
  , "low");
}

// GET /work/batch-queue — ready batch steps scoped to user's roles
router.get("/batch-queue", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const companyId = req.session.companyId!;
    const isAdmin = req.session.role === "admin" || req.session.role === "owner";

    const userRoles = await db.select().from(userRolesTable).where(eq(userRolesTable.userId, userId));
    const roleIds = userRoles.map((r) => r.roleId);

    if (!isAdmin && roleIds.length === 0) {
      res.json({ freeBatchGroups: [], typeBatchGroups: [], totalCount: 0 });
      return;
    }

    const batchConditions = [
      eq(workProjectsTable.companyId, companyId),
      eq(workProjectsTable.status, "in_progress"),
      eq(workItemStepsTable.status, "not_started"),
      inArray(workItemStepsTable.batchMode, ["free_batch", "type_batch"]),
    ];
    if (!isAdmin) batchConditions.push(inArray(workItemStepsTable.roleId!, roleIds));

    const batchRows = await db
      .select({ step: workItemStepsTable, item: workProjectItemsTable, project: workProjectsTable })
      .from(workItemStepsTable)
      .innerJoin(workProjectItemsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
      .innerJoin(workProjectsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
      .where(and(...batchConditions))
      .orderBy(workProjectsTable.deadline, workProjectItemsTable.sortOrder);

    if (batchRows.length === 0) {
      res.json({ freeBatchGroups: [], typeBatchGroups: [], totalCount: 0 });
      return;
    }

    // Filter to READY steps only (all earlier steps on same item are completed)
    const itemIds = [...new Set(batchRows.map((r) => r.item.id))];
    const allItemSteps = await db.select().from(workItemStepsTable)
      .where(inArray(workItemStepsTable.itemId, itemIds))
      .orderBy(workItemStepsTable.sortOrder);
    const itemStepMap = new Map<number, typeof workItemStepsTable.$inferSelect[]>();
    for (const s of allItemSteps) {
      if (!itemStepMap.has(s.itemId)) itemStepMap.set(s.itemId, []);
      itemStepMap.get(s.itemId)!.push(s);
    }

    const readyRows = batchRows.filter(({ step, item }) => {
      const itemSteps = itemStepMap.get(item.id) ?? [];
      const myIndex = itemSteps.findIndex((s) => s.id === step.id);
      if (myIndex <= 0) return true;
      return itemSteps.slice(0, myIndex).every((s) => s.status === "completed");
    });

    if (readyRows.length === 0) {
      res.json({ freeBatchGroups: [], typeBatchGroups: [], totalCount: 0 });
      return;
    }

    const allRoles = await db.select().from(rolesTable).where(eq(rolesTable.companyId, companyId));
    const roleMap = new Map(allRoles.map((r) => [r.id, r.name]));

    const itemData = readyRows.map(({ step, item, project }) => ({
      id: step.id,
      name: item.name,
      stepName: step.name,
      batchMode: step.batchMode,
      roleId: step.roleId,
      roleName: step.roleId ? (roleMap.get(step.roleId) ?? null) : null,
      projectId: project.id,
      projectName: project.name,
      priority: project.priority as string,
      deadline: project.deadline,
      durationEstimate: step.durationEstimate,
    }));

    // Free batch: group by step name (normalised)
    const freeBatchMap = new Map<string, typeof itemData>();
    for (const item of itemData.filter((i) => i.batchMode === "free_batch")) {
      const key = item.stepName.toLowerCase().trim();
      if (!freeBatchMap.has(key)) freeBatchMap.set(key, []);
      freeBatchMap.get(key)!.push(item);
    }
    const freeBatchGroups = Array.from(freeBatchMap.values()).map((items) => ({
      stepName: items[0].stepName,
      roleId: items[0].roleId,
      roleName: items[0].roleName,
      topPriority: topPriority(items),
      items,
    }));

    // Type batch: group by template name (strip trailing " #N" and sub-part suffix)
    const typeBatchMap = new Map<string, typeof itemData>();
    for (const item of itemData.filter((i) => i.batchMode === "type_batch")) {
      const templateName = item.name.replace(/ #\d+$/, "").replace(/ › .*$/, "");
      if (!typeBatchMap.has(templateName)) typeBatchMap.set(templateName, []);
      typeBatchMap.get(templateName)!.push(item);
    }
    const typeBatchGroups = Array.from(typeBatchMap.entries()).map(([templateName, items]) => ({
      templateName,
      stepName: items[0].stepName,
      roleId: items[0].roleId,
      roleName: items[0].roleName,
      topPriority: topPriority(items),
      items,
    }));

    res.json({ freeBatchGroups, typeBatchGroups, totalCount: readyRows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to get batch queue");
    res.status(500).json({ error: "Failed to get batch queue" });
  }
});

// POST /work/batch-complete — bulk complete an array of step IDs
// Batch steps skip individual timers (no start/stop required — by design for batch mode).
// READY/BLOCKED for subsequent steps is recomputed at query time in /batch-queue and
// /my-steps, so marking steps completed here immediately unblocks downstream steps on
// the next query — consistent with the individual /procedures/:id/stop flow.
router.post("/batch-complete", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const companyId = req.session.companyId!;
    const isAdmin = req.session.role === "admin" || req.session.role === "owner";

    const parsed = z.object({ stepIds: z.array(z.number().int()).min(1).max(200) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "stepIds required" }); return; }
    const { stepIds } = parsed.data;

    // For non-admins, get the caller's assigned roles to enforce step-level access control
    let callerRoleIds: number[] = [];
    if (!isAdmin) {
      const userRoles = await db.select().from(userRolesTable).where(eq(userRolesTable.userId, userId));
      callerRoleIds = userRoles.map((r) => r.roleId);
    }

    const result = await db.transaction(async (tx) => {
      // Within the transaction: verify company ownership + read roleId and status atomically
      const verified = await tx
        .select({
          id: workItemStepsTable.id,
          status: workItemStepsTable.status,
          roleId: workItemStepsTable.roleId,
        })
        .from(workItemStepsTable)
        .innerJoin(workProjectItemsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
        .innerJoin(workProjectsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
        .where(and(inArray(workItemStepsTable.id, stepIds), eq(workProjectsTable.companyId, companyId)));

      if (verified.length !== stepIds.length) {
        throw Object.assign(new Error("One or more steps not found or unauthorized"), { statusCode: 403 });
      }

      // Role-based access: non-admins may only complete steps whose roleId is in their own roles
      // (steps with no roleId are accessible to all workers in the company)
      if (!isAdmin) {
        const unauthorized = verified.filter(
          (s) => s.roleId !== null && !callerRoleIds.includes(s.roleId)
        );
        if (unauthorized.length > 0) {
          throw Object.assign(
            new Error(`You do not have the role required to complete ${unauthorized.length} of the selected steps`),
            { statusCode: 403 }
          );
        }
      }

      // Idempotent: only update steps not already completed
      const toComplete = verified.filter((s) => s.status !== "completed").map((s) => s.id);
      const alreadyDone = verified.length - toComplete.length;

      if (toComplete.length > 0) {
        await tx.update(workItemStepsTable)
          .set({ status: "completed" })
          .where(inArray(workItemStepsTable.id, toComplete));
      }

      return { completed: toComplete.length, alreadyDone };
    });

    res.json(result);
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 403) {
      res.status(403).json({ error: (err as Error).message });
      return;
    }
    req.log.error({ err }, "Failed to batch complete steps");
    res.status(500).json({ error: "Failed to batch complete steps" });
  }
});

// ─── MY STEPS (role-based worker view) ───────────────────────────────────────

router.get("/my-steps", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const companyId = req.session.companyId!;

    // Get all roleIds for this user
    const userRoles = await db.select().from(userRolesTable).where(eq(userRolesTable.userId, userId));
    const roleIds = userRoles.map((r) => r.roleId);

    // If worker has no roles, return empty list (unfiltered would be overwhelming)
    if (roleIds.length === 0) {
      res.json([]);
      return;
    }

    // Get all non-completed item procedures assigned to user's roles in this company
    const allProcsForRoles = await db
      .select({
        proc: workItemStepsTable,
        item: workProjectItemsTable,
        project: workProjectsTable,
      })
      .from(workItemStepsTable)
      .innerJoin(workProjectItemsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
      .innerJoin(workProjectsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
      .where(and(
        eq(workProjectsTable.companyId, companyId),
        eq(workProjectsTable.status, "in_progress"),
        inArray(workItemStepsTable.roleId, roleIds),
        ne(workItemStepsTable.status, "completed"),
      ))
      .orderBy(workProjectsTable.deadline, workProjectItemsTable.sortOrder, workItemStepsTable.sortOrder);

    if (allProcsForRoles.length === 0) {
      res.json([]);
      return;
    }

    // Determine READY vs BLOCKED for each procedure
    // A procedure is BLOCKED if any earlier step (lower sortOrder, same itemId) is not completed
    const itemIds = [...new Set(allProcsForRoles.map((r) => r.item.id))];
    const allItemProcs = await db.select().from(workItemStepsTable)
      .where(inArray(workItemStepsTable.itemId, itemIds))
      .orderBy(workItemStepsTable.sortOrder);

    // Build a map of itemId -> sorted procedures
    const itemProcMap = new Map<number, typeof workItemStepsTable.$inferSelect[]>();
    for (const p of allItemProcs) {
      if (!itemProcMap.has(p.itemId)) itemProcMap.set(p.itemId, []);
      itemProcMap.get(p.itemId)!.push(p);
    }

    // Get role names
    const allRoles = await db.select().from(rolesTable).where(eq(rolesTable.companyId, companyId));
    const roleMap = new Map(allRoles.map((r) => [r.id, r.name]));

    const result = allProcsForRoles.map(({ proc, item, project }) => {
      const itemProcs = itemProcMap.get(item.id) ?? [];
      const myIndex = itemProcs.findIndex((p) => p.id === proc.id);
      const blockedByStep = myIndex > 0
        ? itemProcs.slice(0, myIndex).find((p) => p.status !== "completed")
        : undefined;

      return {
        ...proc,
        roleName: proc.roleId ? (roleMap.get(proc.roleId) ?? null) : null,
        stepStatus: blockedByStep ? "blocked" : "ready",
        blockedByStep: blockedByStep ? { id: blockedByStep.id, name: blockedByStep.name } : null,
        item: { id: item.id, name: item.name },
        project: {
          id: project.id,
          name: project.name,
          deadline: project.deadline,
          priority: project.priority,
        },
      };
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get my steps");
    res.status(500).json({ error: "Failed to get my steps" });
  }
});

// ─── PROJECTS ─────────────────────────────────────────────────────────────────

async function getProjectWithItems(projectId: number) {
  const [project] = await db.select().from(workProjectsTable).where(eq(workProjectsTable.id, projectId));
  if (!project) return null;

  const items = await db.select().from(workProjectItemsTable)
    .where(eq(workProjectItemsTable.projectId, projectId))
    .orderBy(workProjectItemsTable.sortOrder);
  const itemIds = items.map((i) => i.id);

  let procedures: (typeof workItemStepsTable.$inferSelect)[] = [];
  if (itemIds.length > 0) {
    procedures = await db.select().from(workItemStepsTable).where(
      sql`${workItemStepsTable.itemId} = ANY(${sql.raw(`ARRAY[${itemIds.join(",")}]::int[]`)})`,
    ).orderBy(workItemStepsTable.sortOrder);
  }

  const itemsWithProcs = items.map((item) => {
    const procs = procedures.filter((p) => p.itemId === item.id);
    const completed = procs.filter((p) => p.status === "completed").length;
    return {
      ...item,
      procedures: procs,
      progress: procs.length > 0 ? Math.round((completed / procs.length) * 100) : 0,
    };
  });

  const totalProcs = procedures.length;
  const completedProcs = procedures.filter((p) => p.status === "completed").length;

  const [inbound] = await db.select().from(inboundTable).where(eq(inboundTable.projectId, projectId));

  return {
    ...project,
    items: itemsWithProcs,
    totalProcedures: totalProcs,
    completedProcedures: completedProcs,
    progress: totalProcs > 0 ? Math.round((completedProcs / totalProcs) * 100) : 0,
    inbound: inbound ?? null,
  };
}

const quickStepSchema = z.object({
  name: z.string().min(1),
  roleId: z.number().int().nullable().optional(),
  batchMode: z.string().optional(),
  durationEstimate: z.number().int().nullable().optional(),
});

const createProjectSchema = z.object({
  name: z.string().min(1),
  deadline: z.string(),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  paintColor: z.string().nullable().optional(),
  requiresExternalParts: z.boolean().optional().default(false),
  // Template-based mode
  templateItems: z.array(z.object({
    templateId: z.number().int(),
    quantity: z.number().int().min(1).max(100),
  })).optional(),
  // Quick job mode: one item with inline steps (no template required)
  quickJob: z.boolean().optional().default(false),
  quickJobName: z.string().optional(),
  quickSteps: z.array(quickStepSchema).optional(),
});

router.get("/projects", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const projects = await db.select().from(workProjectsTable)
      .where(eq(workProjectsTable.companyId, companyId))
      .orderBy(workProjectsTable.deadline);
    const projectsWithProgress = await Promise.all(
      projects.map(async (project) => {
        const items = await db.select().from(workProjectItemsTable).where(eq(workProjectItemsTable.projectId, project.id));
        const itemIds = items.map((i) => i.id);
        let totalProcedures = 0;
        let completedProcedures = 0;
        if (itemIds.length > 0) {
          const procs = await db.select().from(workItemStepsTable).where(
            sql`${workItemStepsTable.itemId} = ANY(${sql.raw(`ARRAY[${itemIds.join(",")}]::int[]`)})`,
          );
          totalProcedures = procs.length;
          completedProcedures = procs.filter((p) => p.status === "completed").length;
        }
        return {
          ...project,
          itemCount: items.length,
          totalProcedures,
          completedProcedures,
          progress: totalProcedures > 0 ? Math.round((completedProcedures / totalProcedures) * 100) : 0,
        };
      }),
    );
    res.json(projectsWithProgress);
  } catch (err) {
    req.log.error({ err }, "Failed to list projects");
    res.status(500).json({ error: "Failed to list projects" });
  }
});

router.post("/projects", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const { name, deadline, priority, paintColor, requiresExternalParts, templateItems, quickJob, quickJobName, quickSteps } = parsed.data;

    const [project] = await db.insert(workProjectsTable).values({
      name, deadline: new Date(deadline), priority, paintColor: paintColor ?? null,
      requiresExternalParts: requiresExternalParts ?? false, companyId,
    }).returning();

    if (quickJob) {
      // Quick job mode: create a single item with the provided inline steps
      const itemName = quickJobName || name;
      const [item] = await db.insert(workProjectItemsTable).values({
        projectId: project.id, name: itemName, sortOrder: 0,
      }).returning();

      const steps = quickSteps ?? [];
      for (let i = 0; i < steps.length; i++) {
        await db.insert(workItemStepsTable).values({
          itemId: item.id, name: steps[i].name, sortOrder: i,
          roleId: steps[i].roleId ?? null,
          batchMode: steps[i].batchMode ?? "individual",
          durationEstimate: steps[i].durationEstimate ?? null,
        });
      }
    } else {
      // Template-based mode
      let sortOrder = 0;
      for (const { templateId, quantity } of (templateItems ?? [])) {
        const [template] = await db.select().from(workTemplatesTable).where(eq(workTemplatesTable.id, templateId));
        if (!template) continue;

        // Load template's top-level procedures
        const templateProcs = await db.select().from(workStepsTable)
          .where(eq(workStepsTable.templateId, templateId))
          .orderBy(workStepsTable.sortOrder);

        // Load BOM components with per-template steps from work_steps (templateComponentId)
        let bomComponents: {
          componentProductId: number; quantity: number; name: string;
          procedures: { name: string; sortOrder: number; roleId: number | null; batchMode: string; durationEstimate: number | null }[];
          itemType: string;
        }[] = [];
        if (template.productId) {
          const components = await db.select().from(productComponentsTable)
            .where(eq(productComponentsTable.parentProductId, template.productId))
            .orderBy(productComponentsTable.sortOrder);
          for (const comp of components) {
            const [compProduct] = await db.select().from(productsTable).where(eq(productsTable.id, comp.componentProductId));
            if (!compProduct) continue;
            // Load steps from work_steps (per-template, keyed by templateComponentId = comp.id)
            const steps = await db.select().from(workStepsTable)
              .where(and(
                eq(workStepsTable.templateId, templateId),
                eq(workStepsTable.templateComponentId, comp.id),
              ))
              .orderBy(workStepsTable.sortOrder);
            bomComponents.push({
              componentProductId: comp.componentProductId,
              quantity: comp.quantity,
              name: compProduct.name,
              procedures: steps.map((s) => ({
                name: s.name,
                sortOrder: s.sortOrder,
                roleId: s.roleId ?? null,
                batchMode: s.batchMode ?? "individual",
                durationEstimate: s.durationEstimate ?? null,
              })),
              itemType: compProduct.itemType,
            });
          }
        }

        for (let i = 1; i <= quantity; i++) {
          const itemName = quantity > 1 ? `${template.name} #${i}` : template.name;
          const [item] = await db.insert(workProjectItemsTable).values({
            projectId: project.id, name: itemName, sortOrder,
          }).returning();
          sortOrder++;

          // Copy top-level steps (templateComponentId IS NULL)
          for (const proc of templateProcs.filter((p) => p.templateComponentId === null)) {
            await db.insert(workItemStepsTable).values({
              itemId: item.id, name: proc.name, sortOrder: proc.sortOrder,
              requiresInbound: proc.requiresInbound,
              roleId: proc.roleId ?? null,
              batchMode: proc.batchMode ?? "individual",
              durationEstimate: proc.durationEstimate ?? null,
            });
          }

          // Create sub-items for each manufactured_part in BOM
          for (const comp of bomComponents) {
            if (comp.itemType !== "manufactured_part") continue;
            for (let q = 1; q <= comp.quantity; q++) {
              const subName = comp.quantity > 1
                ? `${itemName} › ${comp.name} #${q}`
                : `${itemName} › ${comp.name}`;
              const [subItem] = await db.insert(workProjectItemsTable).values({
                projectId: project.id, name: subName, sortOrder,
              }).returning();
              sortOrder++;
              for (const proc of comp.procedures) {
                await db.insert(workItemStepsTable).values({
                  itemId: subItem.id, name: proc.name, sortOrder: proc.sortOrder,
                  requiresInbound: false,
                  roleId: proc.roleId ?? null,
                  batchMode: proc.batchMode ?? "individual",
                  durationEstimate: proc.durationEstimate ?? null,
                });
              }
            }
          }
        }
      }
    }

    if (requiresExternalParts) {
      await db.insert(inboundTable).values({ projectId: project.id, status: "expected", companyId });
    }

    const full = await getProjectWithItems(project.id);
    res.status(201).json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to create project");
    res.status(500).json({ error: "Failed to create project" });
  }
});

router.get("/projects/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;
    const full = await getProjectWithItems(id);
    if (!full || full.companyId !== companyId) { res.status(404).json({ error: "Not found" }); return; }
    res.json(full);
  } catch (err) {
    req.log.error({ err }, "Failed to get project");
    res.status(500).json({ error: "Failed to get project" });
  }
});

router.put("/projects/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;
    const parsed = z.object({
      name: z.string().min(1).optional(),
      deadline: z.string().optional(),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      status: z.enum(["in_progress", "completed"]).optional(),
      paintColor: z.string().nullable().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.deadline) updates.deadline = new Date(parsed.data.deadline);
    const [project] = await db.update(workProjectsTable).set(updates as never)
      .where(and(eq(workProjectsTable.id, id), eq(workProjectsTable.companyId, companyId))).returning();
    if (!project) { res.status(404).json({ error: "Not found" }); return; }
    res.json(project);
  } catch (err) {
    req.log.error({ err }, "Failed to update project");
    res.status(500).json({ error: "Failed to update project" });
  }
});

router.delete("/projects/:id", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    await db.delete(workProjectsTable)
      .where(and(eq(workProjectsTable.id, Number(req.params.id)), eq(workProjectsTable.companyId, companyId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete project");
    res.status(500).json({ error: "Failed to delete project" });
  }
});

// ─── PROJECT ITEMS ────────────────────────────────────────────────────────────

router.post("/projects/:id/items", requireAdmin, async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    const companyId = req.session.companyId!;
    const [project] = await db.select().from(workProjectsTable)
      .where(and(eq(workProjectsTable.id, projectId), eq(workProjectsTable.companyId, companyId)));
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }

    const parsed = z.object({
      templateId: z.number().int(),
      quantity: z.number().int().min(1).max(100),
      paintColor: z.string().nullable().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const { templateId, quantity, paintColor } = parsed.data;
    const [template] = await db.select().from(workTemplatesTable).where(eq(workTemplatesTable.id, templateId));
    if (!template) { res.status(404).json({ error: "Template not found" }); return; }

    const templateProcs = await db.select().from(workStepsTable)
      .where(and(eq(workStepsTable.templateId, templateId), isNull(workStepsTable.templateComponentId)))
      .orderBy(workStepsTable.sortOrder);

    const existingItems = await db.select().from(workProjectItemsTable).where(eq(workProjectItemsTable.projectId, projectId));
    let sortOrder = existingItems.length;

    const newItems = [];
    for (let i = 1; i <= quantity; i++) {
      const itemName = quantity > 1 ? `${template.name} #${i}` : template.name;
      const [item] = await db.insert(workProjectItemsTable).values({
        projectId, name: itemName, paintColor: paintColor ?? null, sortOrder,
      }).returning();
      sortOrder++;

      for (const proc of templateProcs) {
        await db.insert(workItemStepsTable).values({
          itemId: item.id, name: proc.name, sortOrder: proc.sortOrder,
          requiresInbound: proc.requiresInbound,
          roleId: proc.roleId ?? null,
          batchMode: proc.batchMode ?? "individual",
          durationEstimate: proc.durationEstimate ?? null,
        });
      }

      newItems.push(item);
    }

    res.status(201).json(newItems);
  } catch (err) {
    req.log.error({ err }, "Failed to add items");
    res.status(500).json({ error: "Failed to add items" });
  }
});

router.put("/project-items/:itemId", requireAdmin, async (req, res) => {
  try {
    const itemId = Number(req.params.itemId);
    const parsed = z.object({
      name: z.string().min(1).optional(),
      paintColor: z.string().nullable().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const [item] = await db.update(workProjectItemsTable).set(parsed.data)
      .where(eq(workProjectItemsTable.id, itemId)).returning();
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }
    res.json(item);
  } catch (err) {
    req.log.error({ err }, "Failed to update item");
    res.status(500).json({ error: "Failed to update item" });
  }
});

router.delete("/project-items/:itemId", requireAdmin, async (req, res) => {
  try {
    await db.delete(workProjectItemsTable).where(eq(workProjectItemsTable.id, Number(req.params.itemId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete item");
    res.status(500).json({ error: "Failed to delete item" });
  }
});

// ─── TIMER ────────────────────────────────────────────────────────────────────

router.get("/active-timer", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const [active] = await db.select().from(workTimeLogsTable).where(
      and(eq(workTimeLogsTable.userId, userId), isNull(workTimeLogsTable.endTime))
    );
    if (!active) { res.json(null); return; }
    const [procedure] = await db.select().from(workItemStepsTable).where(eq(workItemStepsTable.id, active.stepId));
    res.json({ log: active, procedure });
  } catch (err) {
    req.log.error({ err }, "Failed to get active timer");
    res.status(500).json({ error: "Failed to get active timer" });
  }
});

router.post("/procedures/:procedureId/start", requireAuth, async (req, res) => {
  try {
    const procedureId = Number(req.params.procedureId);
    const userId = req.session.userId!;
    const companyId = req.session.companyId!;

    const [existing] = await db.select().from(workTimeLogsTable).where(
      and(eq(workTimeLogsTable.userId, userId), isNull(workTimeLogsTable.endTime))
    );
    if (existing) {
      res.status(409).json({ error: "You already have a running task. Stop it first." });
      return;
    }

    const [procedure] = await db.select().from(workItemStepsTable).where(eq(workItemStepsTable.id, procedureId));
    if (!procedure) { res.status(404).json({ error: "Procedure not found" }); return; }

    if (procedure.requiresInbound) {
      const [item] = await db.select().from(workProjectItemsTable).where(eq(workProjectItemsTable.id, procedure.itemId));
      if (item) {
        const [inbound] = await db.select().from(inboundTable)
          .where(and(eq(inboundTable.projectId, item.projectId), eq(inboundTable.companyId, companyId)));
        if (inbound && inbound.status === "expected") {
          res.status(403).json({ error: "Cannot start: waiting for inbound parts to arrive." });
          return;
        }
      }
    }

    await db.update(workItemStepsTable).set({ status: "in_progress" }).where(eq(workItemStepsTable.id, procedureId));
    const [log] = await db.insert(workTimeLogsTable).values({ stepId: procedureId, userId, startTime: new Date() }).returning();
    res.status(201).json(log);
  } catch (err) {
    req.log.error({ err }, "Failed to start timer");
    res.status(500).json({ error: "Failed to start timer" });
  }
});

router.post("/procedures/:procedureId/stop", requireAuth, async (req, res) => {
  try {
    const procedureId = Number(req.params.procedureId);
    const userId = req.session.userId!;

    const [activeLog] = await db.select().from(workTimeLogsTable).where(
      and(eq(workTimeLogsTable.userId, userId), eq(workTimeLogsTable.stepId, procedureId), isNull(workTimeLogsTable.endTime))
    );
    if (!activeLog) { res.status(404).json({ error: "No active timer for this procedure" }); return; }

    const endTime = new Date();
    const durationSeconds = Math.round((endTime.getTime() - activeLog.startTime.getTime()) / 1000);
    const [log] = await db.update(workTimeLogsTable).set({ endTime, durationSeconds })
      .where(eq(workTimeLogsTable.id, activeLog.id)).returning();

    const [proc] = await db.update(workItemStepsTable)
      .set({ status: "completed", totalTimeSeconds: sql`${workItemStepsTable.totalTimeSeconds} + ${durationSeconds}` })
      .where(eq(workItemStepsTable.id, procedureId)).returning();

    res.json({ log, procedure: proc });
  } catch (err) {
    req.log.error({ err }, "Failed to stop timer");
    res.status(500).json({ error: "Failed to stop timer" });
  }
});

router.post("/procedures/:procedureId/reset", requireAdmin, async (req, res) => {
  try {
    const procedureId = Number(req.params.procedureId);
    const [proc] = await db.update(workItemStepsTable)
      .set({ status: "not_started", totalTimeSeconds: 0 })
      .where(eq(workItemStepsTable.id, procedureId)).returning();
    res.json(proc);
  } catch (err) {
    req.log.error({ err }, "Failed to reset procedure");
    res.status(500).json({ error: "Failed to reset procedure" });
  }
});

export default router;
