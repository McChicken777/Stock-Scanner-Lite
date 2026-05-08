import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import {
  db, workTemplatesTable, workStepsTable, workProjectsTable,
  workProjectItemsTable, workItemStepsTable, workTimeLogsTable, inboundTable,
  productsTable, productComponentsTable,
  rolesTable, userRolesTable, stepPresetsTable, stepPresetEntriesTable, aiSnapshotsTable,
  productionZonesTable, wipLocationsTable, partLocationsTable, stockTable, locationsTable, usersTable,
  purchaseOrdersTable, purchaseOrderItemsTable, shortageFlagsTable, stockReservationsTable,
  suppliersTable, stepDependenciesTable, companiesTable,
} from "@workspace/db";
import { eq, and, isNull, or, sql, inArray, ne, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireAdmin, requireSupervisorOrAdmin } from "../middlewares/auth";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { seedStarterPack, STARTER_PACK_COUNT } from "../lib/seedStarterPack";

const router: IRouter = Router();

// ─── PRO PLAN GATE ─────────────────────────────────────────────────────────────
/** Blocks the request with 403 if the company is not on the Pro plan. */
const requirePro = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.session.companyId!;
    const [company] = await db.select({ plan: companiesTable.plan })
      .from(companiesTable).where(eq(companiesTable.id, companyId));
    if (!company || company.plan !== "pro") {
      res.status(403).json({ error: "DAG step dependencies require a Pro plan" });
      return;
    }
    next();
  } catch {
    res.status(500).json({ error: "Failed to verify plan" });
  }
};

// ─── PAINTER / ADMIN GATE ──────────────────────────────────────────────────────
/**
 * Allows access to admin, owner, and supervisor users, plus any worker who
 * has been assigned a company role whose name contains "paint" (case-insensitive).
 */
const requirePainterOrAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.session?.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
    const role = req.session.role;
    if (role === "admin" || role === "owner") { next(); return; }

    // Re-check isSupervisor from DB
    const [userRow] = await db.select({ isSupervisor: usersTable.isSupervisor })
      .from(usersTable).where(eq(usersTable.id, req.session.userId));
    if (userRow?.isSupervisor) { req.session.isSupervisor = true; next(); return; }

    // Check if user has any company role with "paint" in the name
    const userRoleRows = await db.select({ roleId: userRolesTable.roleId })
      .from(userRolesTable).where(eq(userRolesTable.userId, req.session.userId));
    if (userRoleRows.length > 0) {
      const roleIds = userRoleRows.map((r) => r.roleId);
      const paintRoles = await db.select({ id: rolesTable.id })
        .from(rolesTable)
        .where(and(
          inArray(rolesTable.id, roleIds),
          eq(rolesTable.companyId, req.session.companyId!),
          sql`lower(${rolesTable.name}) like '%paint%'`,
        ));
      if (paintRoles.length > 0) { next(); return; }
    }

    res.status(403).json({ error: "Paint Shop requires painter role or admin access" });
  } catch {
    res.status(500).json({ error: "Failed to verify permissions" });
  }
};

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

    // Self-heal: legacy templates may have been created before the code that
    // auto-links a final_product. Create the missing product and update the row
    // so the BOM section becomes available for those templates.
    for (const tmpl of templates) {
      if (!tmpl.productId) {
        const [product] = await db.insert(productsTable).values({
          name: tmpl.name, category: "Template", itemType: "final_product",
          bufferStock: 0, targetStock: 0, companyId,
        }).returning();
        await db.update(workTemplatesTable)
          .set({ productId: product.id })
          .where(eq(workTemplatesTable.id, tmpl.id));
        tmpl.productId = product.id;
      }
    }

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

// Friendly wrapper for AI calls — turns integration errors into a user-readable message
function friendlyAiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("etimedout")) {
    return { status: 504, message: "The AI took too long to respond. Please try again." };
  }
  if (lower.includes("api key") || lower.includes("unauthorized") || lower.includes("401") || lower.includes("not configured") || lower.includes("missing")) {
    return { status: 503, message: "AI is not available right now. Please ask your admin to check the AI integration." };
  }
  if (lower.includes("rate") || lower.includes("429")) {
    return { status: 429, message: "AI is busy right now. Please try again in a moment." };
  }
  if (lower.includes("invalid json") || lower.includes("unexpected token")) {
    return { status: 502, message: "AI returned an unexpected response. Please try rewording your description." };
  }
  return { status: 500, message: "AI couldn't process that right now. Please try again." };
}

// AI generate steps for a quick job — returns suggested steps WITHOUT persisting
router.post("/quick-steps/generate", requireAdmin, async (req, res) => {
  try {
    const parsed = z.object({
      description: z.string().min(3).max(2000),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Description required (3-2000 characters)" }); return; }

    const companyId = req.session.companyId!;
    const { description } = parsed.data;
    // Authoritative: load roles from DB for THIS company. Never trust client-supplied role IDs.
    const companyRoles = await db.select({ id: rolesTable.id, name: rolesTable.name })
      .from(rolesTable).where(eq(rolesTable.companyId, companyId));
    const roleList = companyRoles.map((r) => `- id:${r.id} "${r.name}"`).join("\n");

    let text: string;
    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        messages: [{
          role: "user",
          content: `You are a production planning assistant for a custom fabrication shop. Generate the production steps for a one-off "quick job" based on this description:

"${description}"

Available roles (use their IDs if relevant, or null if uncertain):
${roleList || "None defined yet"}

Respond with ONLY a valid JSON array (no markdown, no explanation) of 2-8 steps:
[
  { "name": "Step name", "roleId": null }
]

Rules:
- Keep step names short (2-5 words each)
- roleId must be null or one of the IDs listed above
- Order steps in the sequence they will be performed
- Focus only on the physical fabrication/repair steps`,
        }],
      });
      const block = message.content[0];
      if (!block || block.type !== "text") throw new Error("AI returned no text response");
      text = block.text;
    } catch (aiErr) {
      req.log.warn({ err: aiErr }, "AI call failed for quick-job generation");
      const { status, message } = friendlyAiError(aiErr);
      res.status(status).json({ error: message });
      return;
    }

    let steps: { name: string; roleId: number | null }[];
    try {
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      steps = JSON.parse(cleaned);
      if (!Array.isArray(steps)) throw new Error("Not an array");
    } catch {
      res.status(502).json({ error: "AI returned an unexpected response. Please try rewording your description." });
      return;
    }

    // Sanitize: keep only well-formed steps
    const validRoleIds = new Set(companyRoles.map((r) => r.id));
    const cleanSteps = steps
      .filter((s) => s && typeof s.name === "string" && s.name.trim())
      .slice(0, 12)
      .map((s) => ({
        name: String(s.name).trim().slice(0, 120),
        roleId: typeof s.roleId === "number" && validRoleIds.has(s.roleId) ? s.roleId : null,
      }));

    if (cleanSteps.length === 0) {
      res.status(502).json({ error: "AI didn't return any usable steps. Please try again with more detail." });
      return;
    }

    res.json({ steps: cleanSteps });
  } catch (err) {
    req.log.error({ err }, "Failed to generate quick-job steps");
    res.status(500).json({ error: "Couldn't generate steps right now. Please try again." });
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

    let message;
    try {
      message = await anthropic.messages.create({
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
    } catch (aiErr) {
      req.log.warn({ err: aiErr }, "AI call failed for template generate");
      const { status, message: msg } = friendlyAiError(aiErr);
      res.status(status).json({ error: msg });
      return;
    }

    const text = message.content[0];
    if (!text || text.type !== "text") {
      res.status(502).json({ error: "AI returned an empty response. Please try again." });
      return;
    }

    let generated: {
      name: string;
      parts: { name: string; itemType: string; procedures: { name: string; roleId: number | null; batchMode: string; durationEstimate: number | null }[] }[];
      topProcedures: { name: string; roleId: number | null; batchMode: string; durationEstimate: number | null }[];
    };
    try {
      generated = JSON.parse(text.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    } catch {
      res.status(502).json({ error: "AI returned an unexpected response. Please try rewording your description." }); return;
    }

    // Return the preview payload — nothing is saved to the database yet
    res.json({ preview: generated });
  } catch (err) {
    req.log.error({ err }, "Failed to generate template preview");
    res.status(500).json({ error: "Couldn't generate template right now. Please try again." });
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
        itemType: (part.itemType ?? "manufactured_part") as "manufactured_part",
        minStock: 0, bufferStock: 0, targetStock: 0, companyId,
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

    let message;
    try {
      message = await anthropic.messages.create({
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
    } catch (aiErr) {
      req.log.warn({ err: aiErr }, "AI call failed for template ai-edit");
      const { status, message: msg } = friendlyAiError(aiErr);
      res.status(status).json({ error: msg });
      return;
    }

    const text = message.content[0];
    if (!text || text.type !== "text") {
      res.status(502).json({ error: "AI returned an empty response. Please try again." });
      return;
    }

    let steps: { name: string; roleId: number | null; batchMode: string; durationEstimate: number | null }[];
    try {
      steps = JSON.parse(text.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    } catch {
      res.status(502).json({ error: "AI returned an unexpected response. Please try rewording your instruction." }); return;
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

/** Shared helper: build a batch item data object from a joined row. */
function toBatchItemData(
  step: typeof workItemStepsTable.$inferSelect,
  item: typeof workProjectItemsTable.$inferSelect,
  project: typeof workProjectsTable.$inferSelect,
  roleMap: Map<number, string>,
) {
  return {
    id: step.id,
    name: item.name,
    stepName: step.name,
    batchMode: step.batchMode,
    status: step.status,
    roleId: step.roleId,
    roleName: step.roleId ? (roleMap.get(step.roleId) ?? null) : null,
    projectId: project.id,
    projectName: project.name,
    priority: project.priority as string,
    deadline: project.deadline,
    durationEstimate: step.durationEstimate,
  };
}

function groupFreeBatch(items: ReturnType<typeof toBatchItemData>[]) {
  const map = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.stepName.toLowerCase().trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.values()).map((grp) => ({
    stepName: grp[0].stepName,
    roleId: grp[0].roleId,
    roleName: grp[0].roleName,
    topPriority: topPriority(grp),
    items: grp,
  }));
}

function groupTypeBatch(items: ReturnType<typeof toBatchItemData>[]) {
  const map = new Map<string, typeof items>();
  for (const item of items) {
    const templateName = item.name.replace(/ #\d+$/, "").replace(/ › .*$/, "");
    if (!map.has(templateName)) map.set(templateName, []);
    map.get(templateName)!.push(item);
  }
  return Array.from(map.entries()).map(([templateName, grp]) => ({
    templateName,
    stepName: grp[0].stepName,
    roleId: grp[0].roleId,
    roleName: grp[0].roleName,
    topPriority: topPriority(grp),
    items: grp,
  }));
}

// GET /work/batch-queue — ready + active batch steps scoped to user's roles
router.get("/batch-queue", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const companyId = req.session.companyId!;
    const isAdmin = req.session.role === "admin" || req.session.role === "owner";

    const userRoles = await db.select().from(userRolesTable).where(eq(userRolesTable.userId, userId));
    const roleIds = userRoles.map((r) => r.roleId);

    const empty = { freeBatchGroups: [], typeBatchGroups: [], activeBatchGroups: [], totalCount: 0 };
    if (!isAdmin && roleIds.length === 0) { res.json(empty); return; }

    const baseConditions = [
      eq(workProjectsTable.companyId, companyId),
      eq(workProjectsTable.status, "in_progress"),
      inArray(workItemStepsTable.batchMode, ["free_batch", "type_batch"]),
    ];
    // Non-admins see steps assigned to their roles OR steps with no role (accessible to all workers)
    if (!isAdmin) baseConditions.push(or(isNull(workItemStepsTable.roleId), inArray(workItemStepsTable.roleId, roleIds))!);

    // Fetch both not_started (ready candidates) and in_progress (active batches)
    const allBatchRows = await db
      .select({ step: workItemStepsTable, item: workProjectItemsTable, project: workProjectsTable })
      .from(workItemStepsTable)
      .innerJoin(workProjectItemsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
      .innerJoin(workProjectsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
      .where(and(...baseConditions, inArray(workItemStepsTable.status, ["not_started", "in_progress"])))
      .orderBy(workProjectsTable.deadline, workProjectItemsTable.sortOrder);

    if (allBatchRows.length === 0) { res.json(empty); return; }

    const allRoles = await db.select().from(rolesTable).where(eq(rolesTable.companyId, companyId));
    const roleMap = new Map(allRoles.map((r) => [r.id, r.name]));

    // Separate in_progress (already started) from not_started
    const activeRows = allBatchRows.filter((r) => r.step.status === "in_progress");
    const notStartedRows = allBatchRows.filter((r) => r.step.status === "not_started");

    // For not_started: filter to READY only (all earlier steps completed)
    const itemIds = [...new Set(notStartedRows.map((r) => r.item.id))];
    let readyRows: typeof notStartedRows = [];
    if (itemIds.length > 0) {
      const allItemSteps = await db.select().from(workItemStepsTable)
        .where(inArray(workItemStepsTable.itemId, itemIds))
        .orderBy(workItemStepsTable.sortOrder);
      const itemStepMap = new Map<number, typeof workItemStepsTable.$inferSelect[]>();
      for (const s of allItemSteps) {
        if (!itemStepMap.has(s.itemId)) itemStepMap.set(s.itemId, []);
        itemStepMap.get(s.itemId)!.push(s);
      }
      readyRows = notStartedRows.filter(({ step, item }) => {
        const itemSteps = itemStepMap.get(item.id) ?? [];
        const myIndex = itemSteps.findIndex((s) => s.id === step.id);
        if (myIndex <= 0) return true;
        return itemSteps.slice(0, myIndex).every((s) => s.status === "completed");
      });
    }

    const toItemData = ({ step, item, project }: (typeof allBatchRows)[0]) =>
      toBatchItemData(step, item, project, roleMap);

    const readyItemData = readyRows.map(toItemData);
    const freeBatchGroups = groupFreeBatch(readyItemData.filter((i) => i.batchMode === "free_batch"));
    const typeBatchGroups = groupTypeBatch(readyItemData.filter((i) => i.batchMode === "type_batch"));

    // Active groups: steps currently in_progress (grouped same way by batchMode)
    const activeItemData = activeRows.map(toItemData);
    const activeFree = groupFreeBatch(activeItemData.filter((i) => i.batchMode === "free_batch"));
    const activeType = groupTypeBatch(activeItemData.filter((i) => i.batchMode === "type_batch"));
    const activeBatchGroups = [
      ...activeFree.map((g) => ({ ...g, groupType: "free_batch" as const })),
      ...activeType.map((g) => ({ ...g, groupType: "type_batch" as const })),
    ];

    const totalCount = readyRows.length + activeRows.length;
    res.json({ freeBatchGroups, typeBatchGroups, activeBatchGroups, totalCount });
  } catch (err) {
    req.log.error({ err }, "Failed to get batch queue");
    res.status(500).json({ error: "Failed to get batch queue" });
  }
});

// POST /work/batch-start — begin a batch run (marks steps in_progress)
router.post("/batch-start", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const companyId = req.session.companyId!;
    const isAdmin = req.session.role === "admin" || req.session.role === "owner";

    const parsed = z.object({ stepIds: z.array(z.number().int()).min(1).max(200) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "stepIds required" }); return; }
    const { stepIds } = parsed.data;

    let callerRoleIds: number[] = [];
    if (!isAdmin) {
      const userRoles = await db.select().from(userRolesTable).where(eq(userRolesTable.userId, userId));
      callerRoleIds = userRoles.map((r) => r.roleId);
    }

    const result = await db.transaction(async (tx) => {
      const verified = await tx
        .select({ id: workItemStepsTable.id, status: workItemStepsTable.status, roleId: workItemStepsTable.roleId, batchMode: workItemStepsTable.batchMode })
        .from(workItemStepsTable)
        .innerJoin(workProjectItemsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
        .innerJoin(workProjectsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
        .where(and(inArray(workItemStepsTable.id, stepIds), eq(workProjectsTable.companyId, companyId)));

      if (verified.length !== stepIds.length) {
        throw Object.assign(new Error("One or more steps not found or unauthorized"), { statusCode: 403 });
      }
      const nonBatch = verified.filter((s) => !["free_batch", "type_batch"].includes(s.batchMode ?? ""));
      if (nonBatch.length > 0) {
        throw Object.assign(new Error("One or more steps are not batch-mode steps"), { statusCode: 400 });
      }
      if (!isAdmin) {
        const unauthorized = verified.filter((s) => s.roleId !== null && !callerRoleIds.includes(s.roleId));
        if (unauthorized.length > 0) {
          throw Object.assign(new Error(`You do not have the role required to start ${unauthorized.length} of the selected steps`), { statusCode: 403 });
        }
      }
      // READY check: all prior steps (lower sortOrder, same itemId) must be completed
      const candidateIds = verified.filter((s) => s.status === "not_started").map((s) => s.id);
      if (candidateIds.length > 0) {
        const candidateRows = await tx
          .select({ id: workItemStepsTable.id, itemId: workItemStepsTable.itemId, sortOrder: workItemStepsTable.sortOrder })
          .from(workItemStepsTable)
          .where(inArray(workItemStepsTable.id, candidateIds));
        const candidateItemIds = [...new Set(candidateRows.map((r) => r.itemId))];
        const allItemSteps = await tx
          .select({ id: workItemStepsTable.id, itemId: workItemStepsTable.itemId, sortOrder: workItemStepsTable.sortOrder, status: workItemStepsTable.status })
          .from(workItemStepsTable)
          .where(inArray(workItemStepsTable.itemId, candidateItemIds));
        const stepMap = new Map<number, typeof allItemSteps>();
        for (const s of allItemSteps) {
          if (!stepMap.has(s.itemId)) stepMap.set(s.itemId, []);
          stepMap.get(s.itemId)!.push(s);
        }
        const blocked = candidateRows.filter(({ id, itemId, sortOrder }) => {
          const siblings = stepMap.get(itemId) ?? [];
          return siblings.some((s) => s.sortOrder < sortOrder && s.status !== "completed" && s.id !== id);
        });
        if (blocked.length > 0) {
          throw Object.assign(
            new Error(`${blocked.length} step${blocked.length !== 1 ? "s" : ""} cannot be started — prior steps are not yet completed`),
            { statusCode: 400 },
          );
        }
      }
      const toStart = verified.filter((s) => s.status === "not_started").map((s) => s.id);
      if (toStart.length > 0) {
        await tx.update(workItemStepsTable).set({ status: "in_progress" }).where(inArray(workItemStepsTable.id, toStart));
      }
      return { started: toStart.length, alreadyActive: verified.length - toStart.length };
    });

    res.json(result);
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 403 || statusCode === 400) {
      res.status(statusCode).json({ error: (err as Error).message });
      return;
    }
    req.log.error({ err }, "Failed to start batch");
    res.status(500).json({ error: "Failed to start batch" });
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

      // Enforce batch-mode only — individual steps must use the start/stop timer flow
      const nonBatchSteps = await tx
        .select({ id: workItemStepsTable.id })
        .from(workItemStepsTable)
        .where(and(
          inArray(workItemStepsTable.id, stepIds),
          sql`${workItemStepsTable.batchMode} NOT IN ('free_batch', 'type_batch')`,
        ));
      if (nonBatchSteps.length > 0) {
        throw Object.assign(new Error("One or more steps are not batch-mode steps and must use the individual timer flow"), { statusCode: 400 });
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

      // Guard: steps must be in_progress (started) or already completed; not_started means unstarted/blocked
      const notStarted = verified.filter((s) => s.status === "not_started");
      if (notStarted.length > 0) {
        throw Object.assign(
          new Error(`${notStarted.length} step${notStarted.length !== 1 ? "s" : ""} must be started before completing — use batch-start first`),
          { statusCode: 400 },
        );
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
    if (statusCode === 400) {
      res.status(400).json({ error: (err as Error).message });
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

    // Fetch template step → component → product info for "parts needed" display
    const templateStepIds = allProcsForRoles
      .map((r) => r.proc.templateStepId)
      .filter((id): id is number => id !== null && id !== undefined);
    const partsNeededMap = new Map<number, { partName: string; quantity: number; itemType: string; location: string | null }[]>();
    if (templateStepIds.length > 0) {
      const tmplSteps = await db.select({
        id: workStepsTable.id,
        templateComponentId: workStepsTable.templateComponentId,
      }).from(workStepsTable).where(inArray(workStepsTable.id, templateStepIds));

      const compIds = tmplSteps
        .map((s) => s.templateComponentId)
        .filter((id): id is number => id !== null && id !== undefined);

      if (compIds.length > 0) {
        const components = await db.select({
          compId: productComponentsTable.id,
          componentProductId: productComponentsTable.componentProductId,
          quantity: productComponentsTable.quantity,
        }).from(productComponentsTable).where(inArray(productComponentsTable.id, compIds));

        const productIds = components.map((c) => c.componentProductId);
        const products = productIds.length > 0
          ? await db.select({ id: productsTable.id, name: productsTable.name, itemType: productsTable.itemType })
              .from(productsTable).where(inArray(productsTable.id, productIds))
          : [];

        // Fetch bin locations for purchased parts (first location with qty > 0)
        const purchasedProductIds = products
          .filter((p) => p.itemType === "purchased_part")
          .map((p) => p.id);
        const stockBinMap = new Map<number, string>();
        if (purchasedProductIds.length > 0) {
          const stockRows = await db.select({
            productId: stockTable.productId,
            locationId: stockTable.locationId,
            quantity: stockTable.quantity,
          }).from(stockTable)
            .where(and(inArray(stockTable.productId, purchasedProductIds)));
          for (const row of stockRows) {
            if (row.quantity > 0 && !stockBinMap.has(row.productId)) {
              stockBinMap.set(row.productId, row.locationId);
            }
          }
        }

        const productMap = new Map(products.map((p) => [p.id, p]));
        const compMap = new Map(components.map((c) => [c.compId, c]));

        for (const proc of allProcsForRoles) {
          const tmplStep = tmplSteps.find((s) => s.id === proc.proc.templateStepId);
          if (!tmplStep?.templateComponentId) continue;
          const comp = compMap.get(tmplStep.templateComponentId);
          if (!comp) continue;
          const product = productMap.get(comp.componentProductId);
          if (!product) continue;
          const binLocation = product.itemType === "purchased_part"
            ? (stockBinMap.get(product.id) ?? null)
            : null;
          if (!partsNeededMap.has(proc.proc.id)) partsNeededMap.set(proc.proc.id, []);
          partsNeededMap.get(proc.proc.id)!.push({
            partName: product.name,
            quantity: comp.quantity,
            itemType: product.itemType,
            location: binLocation,
          });
        }
      }
    }

    // Fetch latest part location for all visible step IDs (with user attribution).
    // Reads from part_locations (dedicated model); falls back gracefully if none recorded.
    const stepIds = allProcsForRoles.map((r) => r.proc.id);
    const latestWipMap = new Map<number, {
      locationType: string; locationValue: string;
      setByUsername: string | null; setAt: Date;
    }>();
    if (stepIds.length > 0) {
      const partLocRows = await db
        .select({
          stepId: partLocationsTable.stepId,
          locationType: partLocationsTable.locationType,
          locationValue: partLocationsTable.locationValue,
          setAt: partLocationsTable.setAt,
          setByUsername: usersTable.username,
        })
        .from(partLocationsTable)
        .leftJoin(usersTable, eq(partLocationsTable.setByUserId, usersTable.id))
        .where(inArray(partLocationsTable.stepId, stepIds))
        .orderBy(desc(partLocationsTable.setAt));
      for (const row of partLocRows) {
        if (!latestWipMap.has(row.stepId)) {
          latestWipMap.set(row.stepId, {
            locationType: row.locationType,
            locationValue: row.locationValue ?? "",
            setByUsername: row.setByUsername ?? null,
            setAt: row.setAt,
          });
        }
      }
    }

    // ── DAG: fetch explicit step-to-step dependencies (pro-tier only) ─────────
    const [companyRow] = await db.select({ plan: companiesTable.plan })
      .from(companiesTable).where(eq(companiesTable.id, companyId));
    const isProPlan = companyRow?.plan === "pro";

    const dagBlockMap = new Map<number, number[]>(); // blockedStepId -> [blockerStepIds]
    if (isProPlan && stepIds.length > 0) {
      const dagDeps = await db.select().from(stepDependenciesTable)
        .where(and(
          inArray(stepDependenciesTable.blockedStepId, stepIds),
          eq(stepDependenciesTable.companyId, companyId),
        ));
      for (const dep of dagDeps) {
        if (!dagBlockMap.has(dep.blockedStepId)) dagBlockMap.set(dep.blockedStepId, []);
        dagBlockMap.get(dep.blockedStepId)!.push(dep.blockerStepId);
      }
    }
    // Fetch completion status of all blocker steps referenced in the DAG
    const allBlockerIds = [...new Set([...dagBlockMap.values()].flat())];
    const blockerStatusMap = new Map<number, string>(); // stepId -> status
    if (allBlockerIds.length > 0) {
      const blockerSteps = await db.select({ id: workItemStepsTable.id, status: workItemStepsTable.status })
        .from(workItemStepsTable)
        .where(inArray(workItemStepsTable.id, allBlockerIds));
      for (const s of blockerSteps) blockerStatusMap.set(s.id, s.status);
    }

    // Fetch part locations for DAG blocker steps not already in latestWipMap.
    // This lets previousWip show location of upstream manufactured dependencies,
    // not just sequential same-item steps.
    if (allBlockerIds.length > 0) {
      const missingIds = allBlockerIds.filter((id) => !latestWipMap.has(id));
      if (missingIds.length > 0) {
        const blockerLocRows = await db
          .select({
            stepId: partLocationsTable.stepId,
            locationType: partLocationsTable.locationType,
            locationValue: partLocationsTable.locationValue,
            setAt: partLocationsTable.setAt,
            setByUsername: usersTable.username,
          })
          .from(partLocationsTable)
          .leftJoin(usersTable, eq(partLocationsTable.setByUserId, usersTable.id))
          .where(inArray(partLocationsTable.stepId, missingIds))
          .orderBy(desc(partLocationsTable.setAt));
        for (const row of blockerLocRows) {
          if (!latestWipMap.has(row.stepId)) {
            latestWipMap.set(row.stepId, {
              locationType: row.locationType,
              locationValue: row.locationValue ?? "",
              setByUsername: row.setByUsername ?? null,
              setAt: row.setAt,
            });
          }
        }
      }
    }

    // ── parentChain: build item ancestry map for all relevant projects ────────
    const projectIds = [...new Set(allProcsForRoles.map((r) => r.project.id))];
    const allProjectItems = await db.select().from(workProjectItemsTable)
      .where(inArray(workProjectItemsTable.projectId, projectIds));
    const itemAncestorMap = new Map(allProjectItems.map((i) => [i.id, i]));
    function buildParentChain(itemId: number): string[] {
      const chain: string[] = [];
      let current = itemAncestorMap.get(itemId);
      while (current?.parentItemId) {
        const parent = itemAncestorMap.get(current.parentItemId);
        if (!parent) break;
        chain.unshift(parent.name);
        current = parent;
      }
      return chain;
    }

    const result = allProcsForRoles.map(({ proc, item, project }) => {
      const itemProcs = itemProcMap.get(item.id) ?? [];
      const myIndex = itemProcs.findIndex((p) => p.id === proc.id);
      const blockedByStep = myIndex > 0
        ? itemProcs.slice(0, myIndex).find((p) => p.status !== "completed")
        : undefined;

      // DAG: check if any explicit blocker step is not yet completed
      const dagBlockers = dagBlockMap.get(proc.id) ?? [];
      const dagBlocked = dagBlockers.some((blockerId) => blockerStatusMap.get(blockerId) !== "completed");

      // Previous step's part location — shown to the next worker so they can find the part.
      // Checks (1) sequential prior steps on the same item, then (2) DAG blocker steps.
      let previousWip: { locationType: string; locationValue: string; setByUsername: string | null; setAt: Date } | null = null;
      if (myIndex > 0) {
        const completedPrev = itemProcs
          .slice(0, myIndex)
          .filter((p) => p.status === "completed")
          .reverse();
        for (const prev of completedPrev) {
          const wip = latestWipMap.get(prev.id);
          if (wip) { previousWip = wip; break; }
        }
      }
      // If still no location, check upstream manufactured dependencies via DAG blockers
      if (!previousWip) {
        const dagBlockerIds = dagBlockMap.get(proc.id) ?? [];
        for (const blockerId of dagBlockerIds) {
          const wip = latestWipMap.get(blockerId);
          if (wip) { previousWip = wip; break; }
        }
      }

      // Enrich manufactured parts in partsNeeded with previousWip location
      const rawParts = partsNeededMap.get(proc.id) ?? [];
      const enrichedParts = rawParts.map((part) => {
        if (part.itemType === "manufactured_part" && previousWip && !part.location) {
          return { ...part, location: previousWip.locationValue };
        }
        return part;
      });

      return {
        ...proc,
        roleName: proc.roleId ? (roleMap.get(proc.roleId) ?? null) : null,
        stepStatus: (blockedByStep || dagBlocked) ? "blocked" : "ready",
        blockedByStep: blockedByStep ? { id: blockedByStep.id, name: blockedByStep.name } : null,
        wipLocation: latestWipMap.get(proc.id) ?? null,
        previousWip,
        partsNeeded: enrichedParts,
        parentChain: buildParentChain(item.id),
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

  type ProcWithRole = typeof workItemStepsTable.$inferSelect & {
    roleName: string | null;
    activeStartTime: string | null;
  };
  let procedures: ProcWithRole[] = [];
  if (itemIds.length > 0) {
    const rows = await db
      .select({
        step: workItemStepsTable,
        roleName: rolesTable.name,
        activeStartTime: workTimeLogsTable.startTime,
      })
      .from(workItemStepsTable)
      .leftJoin(rolesTable, eq(rolesTable.id, workItemStepsTable.roleId))
      .leftJoin(
        workTimeLogsTable,
        and(eq(workTimeLogsTable.stepId, workItemStepsTable.id), isNull(workTimeLogsTable.endTime)),
      )
      .where(sql`${workItemStepsTable.itemId} = ANY(${sql.raw(`ARRAY[${itemIds.join(",")}]::int[]`)})`)
      .orderBy(workItemStepsTable.sortOrder);
    procedures = rows.map((r) => ({
      ...r.step,
      roleName: r.roleName ?? null,
      activeStartTime: r.activeStartTime ? r.activeStartTime.toISOString() : null,
    }));
  }

  // ── DAG: fetch step dependencies and compute blocked state per step ─────────
  // Only computed for Pro-tier companies; free/basic companies get all steps unblocked.
  const [projectCompany] = await db
    .select({ plan: companiesTable.plan })
    .from(companiesTable)
    .where(eq(companiesTable.id, project.companyId!));
  const isProProject = projectCompany?.plan === "pro";

  const dagBlockerIdsMap = new Map<number, number[]>(); // blockedStepId → [blockerStepIds]
  const stepNameMap = new Map<number, string>();
  const stepStatusMap = new Map<number, string>();

  if (isProProject && itemIds.length > 0) {
    // Seed name/status map from this project's own procedures
    for (const p of procedures) {
      stepNameMap.set(p.id, p.name);
      stepStatusMap.set(p.id, p.status);
    }
    const allStepIds = procedures.map((p) => p.id);
    if (allStepIds.length > 0) {
      const dagDeps = await db.select().from(stepDependenciesTable)
        .where(and(
          inArray(stepDependenciesTable.blockedStepId, allStepIds),
          eq(stepDependenciesTable.companyId, project.companyId!),
        ));
      // Fetch names + statuses for blocker steps that live in other items (cross-item)
      const foreignBlockerIds = [...new Set(
        dagDeps.map((d) => d.blockerStepId).filter((id) => !stepNameMap.has(id)),
      )];
      if (foreignBlockerIds.length > 0) {
        const foreignSteps = await db
          .select({ id: workItemStepsTable.id, name: workItemStepsTable.name, status: workItemStepsTable.status })
          .from(workItemStepsTable).where(inArray(workItemStepsTable.id, foreignBlockerIds));
        for (const s of foreignSteps) {
          stepNameMap.set(s.id, s.name);
          stepStatusMap.set(s.id, s.status);
        }
      }
      for (const dep of dagDeps) {
        if (!dagBlockerIdsMap.has(dep.blockedStepId)) dagBlockerIdsMap.set(dep.blockedStepId, []);
        dagBlockerIdsMap.get(dep.blockedStepId)!.push(dep.blockerStepId);
      }
    }
  }

  const itemsWithProcs = items.map((item) => {
    const procs = procedures.filter((p) => p.itemId === item.id).map((p) => {
      // Free/basic plan: no DAG blocking — all steps are unblocked
      if (!isProProject) return { ...p, dagBlockerNames: [] as string[], dagBlocked: false };

      const allBlockerIds = dagBlockerIdsMap.get(p.id) ?? [];
      // Only blockers that are NOT yet completed contribute to the blocked state
      const incompleteBlockerIds = allBlockerIds.filter(
        (id) => stepStatusMap.get(id) !== "completed",
      );
      const dagBlocked = incompleteBlockerIds.length > 0;
      const dagBlockerNames = incompleteBlockerIds.map(
        (id) => stepNameMap.get(id) ?? `Step #${id}`,
      );
      return { ...p, dagBlockerNames, dagBlocked };
    });
    const completed = procs.filter((p) => p.status === "completed").length;
    const nextUp = procs.find((p) => p.status === "in_progress")
      ?? procs.find((p) => p.status === "not_started");
    return {
      ...item,
      children: [] as unknown[],
      procedures: procs,
      progress: procs.length > 0 ? Math.round((completed / procs.length) * 100) : 0,
      nextUp: nextUp ? { id: nextUp.id, name: nextUp.name, roleName: nextUp.roleName, status: nextUp.status } : null,
    };
  });

  // Build nested BOM tree in-place: populate children[] with child item objects
  const itemMap = new Map(itemsWithProcs.map((i) => [i.id, i]));
  for (const item of itemsWithProcs) {
    if (item.parentItemId) {
      const parent = itemMap.get(item.parentItemId);
      if (parent) (parent.children as typeof itemsWithProcs).push(item);
    }
  }
  // Only top-level items are returned; children are nested recursively
  const nestedItems = itemsWithProcs.filter((i) => !i.parentItemId);

  const totalProcs = procedures.length;
  const completedProcs = procedures.filter((p) => p.status === "completed").length;

  const [inbound] = await db.select().from(inboundTable).where(eq(inboundTable.projectId, projectId));

  return {
    ...project,
    items: nestedItems,
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
      // Validate any provided roleId belongs to THIS company; coerce unknown IDs to null.
      const companyRoleRows = await db.select({ id: rolesTable.id }).from(rolesTable)
        .where(eq(rolesTable.companyId, companyId));
      const validRoleIds = new Set(companyRoleRows.map((r) => r.id));
      for (let i = 0; i < steps.length; i++) {
        const rid = steps[i].roleId ?? null;
        await db.insert(workItemStepsTable).values({
          itemId: item.id, name: steps[i].name, sortOrder: i,
          roleId: rid !== null && validRoleIds.has(rid) ? rid : null,
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
              templateStepId: proc.id,
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
                projectId: project.id, name: subName, sortOrder, parentItemId: item.id,
              }).returning();
              sortOrder++;
              for (const proc of comp.procedures) {
                // Look up template step id for this component procedure
                const [tmplStep] = await db.select({ id: workStepsTable.id }).from(workStepsTable)
                  .where(and(
                    eq(workStepsTable.templateId, templateId),
                    eq(workStepsTable.name, proc.name),
                    eq(workStepsTable.sortOrder, proc.sortOrder),
                  ));
                await db.insert(workItemStepsTable).values({
                  itemId: subItem.id, name: proc.name, sortOrder: proc.sortOrder,
                  requiresInbound: false,
                  roleId: proc.roleId ?? null,
                  batchMode: proc.batchMode ?? "individual",
                  durationEstimate: proc.durationEstimate ?? null,
                  templateStepId: tmplStep?.id ?? null,
                });
              }
            }
          }
        }
      }
    }

    // ── Reserve purchased-part BOM components for this work order ────────────────
    // Ensures reorder queue and BOM checks reflect stock already committed to open orders
    if (!quickJob) {
      for (const { templateId, quantity } of (templateItems ?? [])) {
        const [tmpl] = await db.select().from(workTemplatesTable).where(eq(workTemplatesTable.id, templateId));
        if (!tmpl?.productId) continue;
        const bomComps = await db.select().from(productComponentsTable)
          .where(eq(productComponentsTable.parentProductId, tmpl.productId));
        for (const comp of bomComps) {
          const [compProduct] = await db.select({ itemType: productsTable.itemType })
            .from(productsTable).where(eq(productsTable.id, comp.componentProductId));
          if (compProduct?.itemType !== "purchased_part") continue;
          await db.insert(stockReservationsTable).values({
            companyId,
            productId: comp.componentProductId,
            quantity: comp.quantity * quantity,
            workOrderId: project.id,
            status: "active",
          });
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
    if (parsed.data.status === "completed") updates.completedAt = new Date();
    if (parsed.data.status === "in_progress") updates.completedAt = null;
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
      parentItemId: z.number().int().nullable().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const { templateId, quantity, paintColor, parentItemId } = parsed.data;
    const [template] = await db.select().from(workTemplatesTable).where(eq(workTemplatesTable.id, templateId));
    if (!template) { res.status(404).json({ error: "Template not found" }); return; }

    // Validate parentItemId belongs to the same project
    if (parentItemId != null) {
      const [parent] = await db.select({ id: workProjectItemsTable.id })
        .from(workProjectItemsTable)
        .where(and(eq(workProjectItemsTable.id, parentItemId), eq(workProjectItemsTable.projectId, projectId)));
      if (!parent) { res.status(400).json({ error: "Parent item not found in this project" }); return; }
    }

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
        parentItemId: parentItemId ?? null,
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
    const companyId = req.session.companyId!;
    const parsed = z.object({
      name: z.string().min(1).optional(),
      paintColor: z.string().nullable().optional(),
      parentItemId: z.number().int().nullable().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    // Verify the item belongs to this company (tenant ownership check)
    const [currentItem] = await db
      .select({ id: workProjectItemsTable.id, projectId: workProjectItemsTable.projectId, parentItemId: workProjectItemsTable.parentItemId })
      .from(workProjectItemsTable)
      .innerJoin(workProjectsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
      .where(and(
        eq(workProjectItemsTable.id, itemId),
        eq(workProjectsTable.companyId, companyId),
      ));
    if (!currentItem) { res.status(404).json({ error: "Item not found" }); return; }

    // Validate parentItemId: must belong to same project/company, must not create a cycle
    if (parsed.data.parentItemId != null) {
      const newParentId = parsed.data.parentItemId;
      if (newParentId === itemId) {
        res.status(400).json({ error: "An item cannot be its own parent" }); return;
      }

      // Parent must exist in the same project (and therefore same company)
      const [parentItem] = await db.select({ id: workProjectItemsTable.id })
        .from(workProjectItemsTable)
        .where(and(
          eq(workProjectItemsTable.id, newParentId),
          eq(workProjectItemsTable.projectId, currentItem.projectId),
        ));
      if (!parentItem) { res.status(400).json({ error: "Parent item not found in this project" }); return; }

      // Cycle detection: traverse ancestors of newParentId — if we reach itemId, it's a cycle
      const allProjectItems = await db.select({ id: workProjectItemsTable.id, parentItemId: workProjectItemsTable.parentItemId })
        .from(workProjectItemsTable)
        .where(eq(workProjectItemsTable.projectId, currentItem.projectId));
      const parentMap = new Map(allProjectItems.map((i) => [i.id, i.parentItemId]));
      let cursor: number | null = newParentId;
      let hasCycle = false;
      const visited = new Set<number>();
      while (cursor != null) {
        if (cursor === itemId) { hasCycle = true; break; }
        if (visited.has(cursor)) break;
        visited.add(cursor);
        cursor = parentMap.get(cursor) ?? null;
      }
      if (hasCycle) {
        res.status(400).json({ error: "Setting this parent would create a circular BOM hierarchy" }); return;
      }
    }

    const { name, paintColor, parentItemId } = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (paintColor !== undefined) updateData.paintColor = paintColor;
    if (parentItemId !== undefined) updateData.parentItemId = parentItemId;

    const [item] = await db.update(workProjectItemsTable).set(updateData)
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
    const itemId = Number(req.params.itemId);
    const companyId = req.session.companyId!;
    // Verify ownership before deleting (company scoping via project join)
    const [owned] = await db
      .select({ id: workProjectItemsTable.id })
      .from(workProjectItemsTable)
      .innerJoin(workProjectsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
      .where(and(eq(workProjectItemsTable.id, itemId), eq(workProjectsTable.companyId, companyId)));
    if (!owned) { res.status(404).json({ error: "Item not found" }); return; }
    await db.delete(workProjectItemsTable).where(eq(workProjectItemsTable.id, itemId));
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

    // DAG: check if any explicit blocker step is not yet completed (pro-tier only)
    const [startCompany] = await db.select({ plan: companiesTable.plan })
      .from(companiesTable).where(eq(companiesTable.id, companyId));
    if (startCompany?.plan === "pro") {
      const dagDeps = await db.select().from(stepDependenciesTable)
        .where(and(
          eq(stepDependenciesTable.blockedStepId, procedureId),
          eq(stepDependenciesTable.companyId, companyId),
        ));
      if (dagDeps.length > 0) {
        const blockerIds = dagDeps.map((d) => d.blockerStepId);
        const blockerSteps = await db.select({ id: workItemStepsTable.id, status: workItemStepsTable.status, name: workItemStepsTable.name })
          .from(workItemStepsTable).where(inArray(workItemStepsTable.id, blockerIds));
        const incomplete = blockerSteps.filter((s) => s.status !== "completed");
        if (incomplete.length > 0) {
          const names = incomplete.map((s) => `"${s.name}"`).join(", ");
          res.status(403).json({ error: `Cannot start: waiting for ${names} to complete first.` });
          return;
        }
      }
    }

    await db.update(workItemStepsTable).set({ status: "in_progress" }).where(eq(workItemStepsTable.id, procedureId));
    const [log] = await db.insert(workTimeLogsTable).values({ stepId: procedureId, userId, startTime: new Date() }).returning();

    // Auto-log "with_worker" WIP location — include worker's username
    const [worker] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, userId));
    await db.insert(wipLocationsTable).values({
      stepId: procedureId,
      locationType: "with_worker",
      locationValue: `With ${worker?.username ?? "worker"} (picked up)`,
      setByUserId: userId,
    }).catch((err: unknown) => {
      req.log.warn({ err, stepId: procedureId }, "Failed to auto-log WIP location on step start");
    });

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

    // Accept multiple part locations (partLocations array) or legacy single wipLocation.
    // Multiple placements allow one step's output to be split across several storage spots.
    const locParsed = z.object({
      partLocations: z.array(z.object({
        locationType: z.enum(["warehouse", "zone", "with_worker"]),
        locationValue: z.string().optional(),
      })).optional(),
      wipLocation: z.object({
        locationType: z.enum(["warehouse", "zone", "with_worker"]),
        locationValue: z.string().optional(),
      }).optional(),
    }).safeParse(req.body);
    const locEntries = locParsed.success
      ? (locParsed.data.partLocations?.length
          ? locParsed.data.partLocations
          : locParsed.data.wipLocation ? [locParsed.data.wipLocation] : [])
      : [];

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

    // Insert one part_locations row per placement entry.
    if (locEntries.length > 0 && proc?.itemId) {
      for (const loc of locEntries) {
        await db.insert(partLocationsTable).values({
          stepId: procedureId,
          itemId: proc.itemId,
          locationType: loc.locationType,
          locationValue: loc.locationValue ?? null,
          setByUserId: userId,
        }).catch((err: unknown) => {
          req.log.warn({ err, stepId: procedureId }, "Failed to save part location on stop");
        });
      }
    }

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

// ─── PRODUCTION ZONES ─────────────────────────────────────────────────────────

router.get("/production-zones", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const zones = await db.select().from(productionZonesTable)
      .where(eq(productionZonesTable.companyId, companyId))
      .orderBy(productionZonesTable.sortOrder, productionZonesTable.name);
    res.json(zones);
  } catch (err) {
    req.log.error({ err }, "Failed to list production zones");
    res.status(500).json({ error: "Failed to list production zones" });
  }
});

router.post("/production-zones", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Name required" }); return; }
    const [zone] = await db.insert(productionZonesTable)
      .values({ name: parsed.data.name, companyId })
      .returning();
    res.status(201).json(zone);
  } catch (err) {
    req.log.error({ err }, "Failed to create production zone");
    res.status(500).json({ error: "Failed to create production zone" });
  }
});

router.delete("/production-zones/:id", requireAdmin, async (req, res) => {
  try {
    await db.delete(productionZonesTable).where(eq(productionZonesTable.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete production zone");
    res.status(500).json({ error: "Failed to delete production zone" });
  }
});

// ─── WIP LOCATIONS ────────────────────────────────────────────────────────────

router.get("/steps/:stepId/wip-location", requireAuth, async (req, res) => {
  try {
    const stepId = Number(req.params.stepId);
    const [loc] = await db.select().from(wipLocationsTable)
      .where(eq(wipLocationsTable.stepId, stepId))
      .orderBy(desc(wipLocationsTable.setAt))
      .limit(1);
    res.json(loc ?? null);
  } catch (err) {
    req.log.error({ err }, "Failed to get wip location");
    res.status(500).json({ error: "Failed to get wip location" });
  }
});

router.post("/steps/:stepId/wip-location", requireAuth, async (req, res) => {
  try {
    const stepId = Number(req.params.stepId);
    const userId = req.session.userId!;
    const parsed = z.object({
      locationType: z.enum(["warehouse", "zone", "with_worker"]),
      locationValue: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid location data" }); return; }
    const [loc] = await db.insert(wipLocationsTable)
      .values({ stepId, locationType: parsed.data.locationType, locationValue: parsed.data.locationValue ?? null, setByUserId: userId })
      .returning();
    res.status(201).json(loc);
  } catch (err) {
    req.log.error({ err }, "Failed to set wip location");
    res.status(500).json({ error: "Failed to set wip location" });
  }
});

// ─── SUPERVISOR STEP ACTIONS ──────────────────────────────────────────────────

// Verify a step belongs to the caller's company; returns the step row or null.
async function getOwnedStep(stepId: number, companyId: number) {
  const [row] = await db
    .select({ step: workItemStepsTable })
    .from(workItemStepsTable)
    .innerJoin(workProjectItemsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
    .innerJoin(workProjectsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
    .where(and(eq(workItemStepsTable.id, stepId), eq(workProjectsTable.companyId, companyId)));
  return row?.step ?? null;
}

router.patch("/steps/:id/role", requireSupervisorOrAdmin, async (req, res) => {
  try {
    const stepId = Number(req.params.id);
    const companyId = req.session.companyId!;
    const parsed = z.object({ roleId: z.number().int().nullable() }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "roleId required (number or null)" }); return; }

    const existing = await getOwnedStep(stepId, companyId);
    if (!existing) { res.status(404).json({ error: "Step not found" }); return; }

    // Validate roleId belongs to the same company (when not null)
    if (parsed.data.roleId !== null) {
      const [role] = await db.select().from(rolesTable)
        .where(and(eq(rolesTable.id, parsed.data.roleId), eq(rolesTable.companyId, companyId)));
      if (!role) { res.status(400).json({ error: "Invalid role for this company" }); return; }
    }

    const [updated] = await db.update(workItemStepsTable)
      .set({ roleId: parsed.data.roleId })
      .where(eq(workItemStepsTable.id, stepId))
      .returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to reassign step role");
    res.status(500).json({ error: "Failed to reassign step role" });
  }
});

// ─── STEP DEPENDENCIES (DAG) ──────────────────────────────────────────────────

// GET /work/projects/:projectId/step-dependencies — all dep edges in a project (read-only viz)
router.get("/projects/:projectId/step-dependencies", requireAuth, requirePro, async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const companyId = req.session.companyId!;

    // Verify the project belongs to this company
    const [project] = await db.select({ id: workProjectsTable.id, companyId: workProjectsTable.companyId })
      .from(workProjectsTable).where(eq(workProjectsTable.id, projectId));
    if (!project || project.companyId !== companyId) {
      res.status(404).json({ error: "Project not found" }); return;
    }

    // Fetch all steps in this project
    const projectSteps = await db.select({
      id: workItemStepsTable.id,
      name: workItemStepsTable.name,
      status: workItemStepsTable.status,
    })
      .from(workItemStepsTable)
      .innerJoin(workProjectItemsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
      .where(eq(workProjectItemsTable.projectId, projectId));

    if (projectSteps.length === 0) { res.json([]); return; }

    const projectStepIds = projectSteps.map((s) => s.id);
    const stepInfoMap = new Map(projectSteps.map((s) => [s.id, s]));

    // Fetch all dep edges where either side belongs to this project
    const edges = await db.select({
      id: stepDependenciesTable.id,
      blockerStepId: stepDependenciesTable.blockerStepId,
      blockedStepId: stepDependenciesTable.blockedStepId,
    })
      .from(stepDependenciesTable)
      .where(and(
        inArray(stepDependenciesTable.blockedStepId, projectStepIds),
        eq(stepDependenciesTable.companyId, companyId),
      ));

    // Collect any blocker step IDs that might be external (cross-project) and fetch them
    const externalBlockerIds = edges
      .map((e) => e.blockerStepId)
      .filter((id) => !stepInfoMap.has(id));
    if (externalBlockerIds.length > 0) {
      const extSteps = await db.select({ id: workItemStepsTable.id, name: workItemStepsTable.name, status: workItemStepsTable.status })
        .from(workItemStepsTable).where(inArray(workItemStepsTable.id, externalBlockerIds));
      for (const s of extSteps) stepInfoMap.set(s.id, s);
    }

    const result = edges.map((e) => {
      const blocker = stepInfoMap.get(e.blockerStepId);
      const blocked = stepInfoMap.get(e.blockedStepId);
      return {
        id: e.id,
        blockerStepId: e.blockerStepId,
        blockedStepId: e.blockedStepId,
        blockerName: blocker?.name ?? `Step #${e.blockerStepId}`,
        blockedName: blocked?.name ?? `Step #${e.blockedStepId}`,
        blockerStatus: blocker?.status ?? "not_started",
        blockedStatus: blocked?.status ?? "not_started",
      };
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list project step dependencies");
    res.status(500).json({ error: "Failed to list project step dependencies" });
  }
});

// GET /work/steps/:stepId/dependencies — list all blockers for a step
router.get("/steps/:stepId/dependencies", requireAuth, requirePro, async (req, res) => {
  try {
    const stepId = Number(req.params.stepId);
    const companyId = req.session.companyId!;
    const deps = await db.select({
      id: stepDependenciesTable.id,
      blockerStepId: stepDependenciesTable.blockerStepId,
      blockedStepId: stepDependenciesTable.blockedStepId,
      blockerName: workItemStepsTable.name,
      blockerStatus: workItemStepsTable.status,
    })
      .from(stepDependenciesTable)
      .innerJoin(workItemStepsTable, eq(workItemStepsTable.id, stepDependenciesTable.blockerStepId))
      .where(and(
        eq(stepDependenciesTable.blockedStepId, stepId),
        eq(stepDependenciesTable.companyId, companyId),
      ));
    res.json(deps);
  } catch (err) {
    req.log.error({ err }, "Failed to list step dependencies");
    res.status(500).json({ error: "Failed to list step dependencies" });
  }
});

// POST /work/steps/:stepId/dependencies — add a blocker
router.post("/steps/:stepId/dependencies", requireAdmin, requirePro, async (req, res) => {
  try {
    const blockedStepId = Number(req.params.stepId);
    const companyId = req.session.companyId!;
    const parsed = z.object({ blockerStepId: z.number().int() }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "blockerStepId required" }); return; }
    const { blockerStepId } = parsed.data;

    if (blockerStepId === blockedStepId) {
      res.status(400).json({ error: "A step cannot depend on itself" });
      return;
    }

    // Verify both steps belong to the same company
    const [blockedStep] = await db
      .select({ id: workItemStepsTable.id })
      .from(workItemStepsTable)
      .innerJoin(workProjectItemsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
      .innerJoin(workProjectsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
      .where(and(eq(workItemStepsTable.id, blockedStepId), eq(workProjectsTable.companyId, companyId)));
    if (!blockedStep) { res.status(404).json({ error: "Blocked step not found" }); return; }

    const [blockerStep] = await db
      .select({ id: workItemStepsTable.id })
      .from(workItemStepsTable)
      .innerJoin(workProjectItemsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
      .innerJoin(workProjectsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
      .where(and(eq(workItemStepsTable.id, blockerStepId), eq(workProjectsTable.companyId, companyId)));
    if (!blockerStep) { res.status(404).json({ error: "Blocker step not found" }); return; }

    // ── Cycle detection (DFS reachability check) ──────────────────────────────
    // The proposed edge is: blockerStepId → blockedStepId.
    // A cycle exists if blockedStepId already has a path back to blockerStepId
    // via existing "blocker → blocked" edges (i.e. blockerStepId is reachable
    // from blockedStepId in the forward dependency graph).
    const allDepsForCompany = await db.select({
      blocker: stepDependenciesTable.blockerStepId,
      blocked: stepDependenciesTable.blockedStepId,
    }).from(stepDependenciesTable).where(eq(stepDependenciesTable.companyId, companyId));

    // Build adjacency list: blockerStepId → Set<blockedStepIds>
    const fwdGraph = new Map<number, Set<number>>();
    for (const { blocker, blocked } of allDepsForCompany) {
      if (!fwdGraph.has(blocker)) fwdGraph.set(blocker, new Set());
      fwdGraph.get(blocker)!.add(blocked);
    }
    // DFS from blockedStepId — if we reach blockerStepId, adding the edge creates a cycle
    const visited = new Set<number>();
    const stack = [blockedStepId];
    let hasCycle = false;
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node === blockerStepId) { hasCycle = true; break; }
      if (visited.has(node)) continue;
      visited.add(node);
      for (const next of (fwdGraph.get(node) ?? [])) stack.push(next);
    }
    if (hasCycle) {
      res.status(400).json({ error: "Adding this dependency would create a cycle in the DAG" });
      return;
    }

    const [dep] = await db.insert(stepDependenciesTable)
      .values({ blockerStepId, blockedStepId, companyId })
      .onConflictDoNothing()
      .returning();
    res.status(201).json(dep ?? { blockerStepId, blockedStepId, companyId });
  } catch (err) {
    req.log.error({ err }, "Failed to add step dependency");
    res.status(500).json({ error: "Failed to add step dependency" });
  }
});

// DELETE /work/steps/:stepId/dependencies/:blockerId — remove a blocker
router.delete("/steps/:stepId/dependencies/:blockerId", requireAdmin, requirePro, async (req, res) => {
  try {
    const blockedStepId = Number(req.params.stepId);
    const blockerStepId = Number(req.params.blockerId);
    const companyId = req.session.companyId!;
    await db.delete(stepDependenciesTable).where(and(
      eq(stepDependenciesTable.blockedStepId, blockedStepId),
      eq(stepDependenciesTable.blockerStepId, blockerStepId),
      eq(stepDependenciesTable.companyId, companyId),
    ));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to remove step dependency");
    res.status(500).json({ error: "Failed to remove step dependency" });
  }
});


router.patch("/steps/:id/skip", requireSupervisorOrAdmin, async (req, res) => {
  try {
    const stepId = Number(req.params.id);
    const companyId = req.session.companyId!;

    const existing = await getOwnedStep(stepId, companyId);
    if (!existing) { res.status(404).json({ error: "Step not found" }); return; }
    if (existing.status === "completed") {
      res.status(400).json({ error: "Step is already completed" });
      return;
    }

    // If skipping an in-progress step, close out any open time logs (no duration recorded)
    if (existing.status === "in_progress") {
      const endTime = new Date();
      await db.update(workTimeLogsTable)
        .set({ endTime, durationSeconds: 0 })
        .where(and(eq(workTimeLogsTable.stepId, stepId), isNull(workTimeLogsTable.endTime)));
    }

    const [updated] = await db.update(workItemStepsTable)
      .set({ status: "completed" })
      .where(eq(workItemStepsTable.id, stepId))
      .returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to skip step");
    res.status(500).json({ error: "Failed to skip step" });
  }
});

router.patch("/projects/:id/priority", requireSupervisorOrAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.companyId!;
    const parsed = z.object({
      priority: z.enum(["low", "normal", "high", "urgent"]),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "priority must be low, normal, high, or urgent" }); return; }

    const [project] = await db.update(workProjectsTable)
      .set({ priority: parsed.data.priority })
      .where(and(eq(workProjectsTable.id, id), eq(workProjectsTable.companyId, companyId)))
      .returning();
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    res.json(project);
  } catch (err) {
    req.log.error({ err }, "Failed to update project priority");
    res.status(500).json({ error: "Failed to update project priority" });
  }
});

// ─── SUPERVISOR ENDPOINTS ──────────────────────────────────────────────────────

router.get("/supervisor/daily-plan", requireSupervisorOrAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;

    // Daily plan: steps from projects due today or overdue (deadline <= end of today)
    // Also include any currently in_progress steps regardless of deadline
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const allSteps = await db
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
        ne(workItemStepsTable.status, "completed"),
        or(
          sql`${workProjectsTable.deadline} <= ${todayEnd}`,
          eq(workItemStepsTable.status, "in_progress"),
        ),
      ))
      .orderBy(workProjectsTable.deadline, workProjectItemsTable.sortOrder, workItemStepsTable.sortOrder);

    if (allSteps.length === 0) {
      res.json({ roleGroups: [], totalReady: 0, totalInProgress: 0 });
      return;
    }

    // Determine readiness: need all steps per item to check blocking
    const itemIds = [...new Set(allSteps.map((r) => r.item.id))];
    const allItemProcs = await db.select().from(workItemStepsTable)
      .where(inArray(workItemStepsTable.itemId, itemIds))
      .orderBy(workItemStepsTable.sortOrder);

    const itemProcMap = new Map<number, typeof workItemStepsTable.$inferSelect[]>();
    for (const p of allItemProcs) {
      if (!itemProcMap.has(p.itemId)) itemProcMap.set(p.itemId, []);
      itemProcMap.get(p.itemId)!.push(p);
    }

    const allRoles = await db.select().from(rolesTable).where(eq(rolesTable.companyId, companyId));
    const roleMap = new Map(allRoles.map((r) => [r.id, r.name]));

    const readyAndActive: Array<{
      id: number; name: string; itemName: string; itemId: number;
      projectName: string; projectId: number;
      deadline: string; priority: string; roleName: string | null;
      durationEstimate: number | null; status: "not_started" | "in_progress";
      roleId: number | null;
    }> = [];

    for (const { proc, item, project } of allSteps) {
      const itemProcs = itemProcMap.get(item.id) ?? [];
      const myIndex = itemProcs.findIndex((p) => p.id === proc.id);
      const blockedBy = myIndex > 0
        ? itemProcs.slice(0, myIndex).find((p) => p.status !== "completed")
        : undefined;

      if (!blockedBy || proc.status === "in_progress") {
        readyAndActive.push({
          id: proc.id,
          name: proc.name,
          itemName: item.name,
          itemId: item.id,
          projectName: project.name,
          projectId: project.id,
          deadline: project.deadline.toISOString(),
          priority: project.priority,
          roleName: proc.roleId ? (roleMap.get(proc.roleId) ?? null) : null,
          durationEstimate: proc.durationEstimate,
          status: proc.status as "not_started" | "in_progress",
          roleId: proc.roleId,
        });
      }
    }

    // Group by role
    const roleGroupMap = new Map<string, typeof readyAndActive>();
    for (const step of readyAndActive) {
      const key = step.roleId != null ? String(step.roleId) : "null";
      if (!roleGroupMap.has(key)) roleGroupMap.set(key, []);
      roleGroupMap.get(key)!.push(step);
    }

    const SHIFT_MINUTES = 480; // 8-hour shift
    const roleGroups = [...roleGroupMap.entries()].map(([, steps]) => {
      const totalMinutes = steps.reduce((sum, s) => sum + (s.durationEstimate ?? 0), 0);
      return {
        roleId: steps[0].roleId,
        roleName: steps[0].roleName,
        steps,
        totalMinutes,
        overCapacity: totalMinutes > SHIFT_MINUTES,
      };
    }).sort((a, b) => (a.roleName ?? "zzz").localeCompare(b.roleName ?? "zzz"));

    res.json({
      roleGroups,
      totalReady: readyAndActive.filter((s) => s.status === "not_started").length,
      totalInProgress: readyAndActive.filter((s) => s.status === "in_progress").length,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get supervisor daily plan");
    res.status(500).json({ error: "Failed to get supervisor daily plan" });
  }
});

router.get("/supervisor/bottlenecks", requireSupervisorOrAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;

    // All in_progress projects
    const projects = await db.select().from(workProjectsTable)
      .where(and(eq(workProjectsTable.companyId, companyId), eq(workProjectsTable.status, "in_progress")));

    const projectIds = projects.map((p) => p.id);
    if (projectIds.length === 0) {
      res.json({ roleBottlenecks: [], overdueProjects: [], allBlockedItems: [] });
      return;
    }

    const allItems = await db.select().from(workProjectItemsTable)
      .where(inArray(workProjectItemsTable.projectId, projectIds));
    const itemIds = allItems.map((i) => i.id);

    const allProcs = itemIds.length > 0
      ? await db.select().from(workItemStepsTable)
          .where(inArray(workItemStepsTable.itemId, itemIds))
          .orderBy(workItemStepsTable.itemId, workItemStepsTable.sortOrder)
      : [];

    const allRoles = await db.select().from(rolesTable).where(eq(rolesTable.companyId, companyId));
    const roleMap = new Map(allRoles.map((r) => [r.id, r.name]));

    // Overdue projects
    const now = new Date();
    const overdueProjects = projects
      .filter((p) => new Date(p.deadline) < now)
      .map((p) => ({ id: p.id, name: p.name, deadline: p.deadline.toISOString(), priority: p.priority }));

    // Per-item step readiness
    const itemProcMap = new Map<number, typeof workItemStepsTable.$inferSelect[]>();
    for (const p of allProcs) {
      if (!itemProcMap.has(p.itemId)) itemProcMap.set(p.itemId, []);
      itemProcMap.get(p.itemId)!.push(p);
    }

    const roleStats = new Map<number | null, { readyCount: number; blockedCount: number; roleName: string | null }>();

    const allBlockedItems: { id: number; name: string; projectName: string; blockedStep: string }[] = [];

    for (const item of allItems) {
      const procs = itemProcMap.get(item.id) ?? [];
      const remaining = procs.filter((p) => p.status !== "completed");
      if (remaining.length === 0) continue;

      const project = projects.find((p) => p.id === item.projectId)!;
      let allBlocked = true;

      for (const proc of remaining) {
        const myIndex = procs.findIndex((p) => p.id === proc.id);
        const blockedBy = myIndex > 0
          ? procs.slice(0, myIndex).find((p) => p.status !== "completed")
          : undefined;

        const isBlocked = !!blockedBy && proc.status !== "in_progress";
        const roleId = proc.roleId ?? null;
        const roleName = roleId !== null ? (roleMap.get(roleId) ?? null) : null;

        if (!roleStats.has(roleId)) roleStats.set(roleId, { readyCount: 0, blockedCount: 0, roleName });
        if (isBlocked) {
          roleStats.get(roleId)!.blockedCount++;
        } else {
          roleStats.get(roleId)!.readyCount++;
          allBlocked = false;
        }
      }

      if (allBlocked) {
        const firstBlocked = remaining[0];
        const myIndex = procs.findIndex((p) => p.id === firstBlocked.id);
        const blockedBy = myIndex > 0 ? procs.slice(0, myIndex).find((p) => p.status !== "completed") : undefined;
        allBlockedItems.push({
          id: item.id,
          name: item.name,
          projectName: project?.name ?? "",
          blockedStep: blockedBy?.name ?? firstBlocked.name,
        });
      }
    }

    // Role bottlenecks: roles with 5+ ready steps queued (workload overload) OR high blocked pressure
    const BOTTLENECK_QUEUE_THRESHOLD = 5;
    const roleBottlenecks = [...roleStats.entries()]
      .map(([roleId, stats]) => ({ roleId, ...stats }))
      .filter((r) => r.readyCount >= BOTTLENECK_QUEUE_THRESHOLD || r.blockedCount > r.readyCount)
      .sort((a, b) => (b.readyCount + b.blockedCount) - (a.readyCount + a.blockedCount));

    // Inbound delay: pallet arrived 2+ days ago and still not routed to production/stored
    const INBOUND_DELAY_DAYS = 2;
    const delayThreshold = new Date();
    delayThreshold.setDate(delayThreshold.getDate() - INBOUND_DELAY_DAYS);
    const stalledInbound = await db.select().from(inboundTable)
      .where(and(
        inArray(inboundTable.projectId, projectIds),
        or(
          eq(inboundTable.status, "arrived"),
          eq(inboundTable.status, "expected"),
        ),
        sql`${inboundTable.createdAt} <= ${delayThreshold}`,
      ));
    const inboundDelays = stalledInbound.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      projectName: projects.find((p) => p.id === r.projectId)?.name ?? null,
      status: r.status,
      daysPending: Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 86400000),
    }));

    res.json({ roleBottlenecks, overdueProjects, allBlockedItems, inboundDelays });
  } catch (err) {
    req.log.error({ err }, "Failed to get bottlenecks");
    res.status(500).json({ error: "Failed to get bottlenecks" });
  }
});

// ─── REORDER QUEUE ────────────────────────────────────────────────────────────

router.get("/reorder-queue", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;

    // Get all products for this company
    const allProducts = await db.select().from(productsTable)
      .where(eq(productsTable.companyId, companyId));

    // Only count stock in this company's own locations (multi-tenant safety)
    const companyLocationIds = (await db.select({ id: locationsTable.id })
      .from(locationsTable)
      .where(eq(locationsTable.companyId, companyId)))
      .map((l) => l.id);
    const allStock = companyLocationIds.length > 0
      ? await db.select().from(stockTable).where(inArray(stockTable.locationId, companyLocationIds))
      : [];
    const stockByProduct = new Map<number, number>();
    for (const s of allStock) {
      stockByProduct.set(s.productId, (stockByProduct.get(s.productId) ?? 0) + s.quantity);
    }

    // Aggregate active reservations per product
    const activeReservations = await db.select({
      productId: stockReservationsTable.productId,
      reserved: sql<number>`sum(${stockReservationsTable.quantity})::int`,
    })
      .from(stockReservationsTable)
      .where(and(
        eq(stockReservationsTable.companyId, companyId),
        eq(stockReservationsTable.status, "active"),
      ))
      .groupBy(stockReservationsTable.productId);
    const reservedByProduct = new Map<number, number>(
      activeReservations.map((r) => [r.productId, r.reserved ?? 0])
    );

    // Filter by available stock (total - reserved) < minStock (= explicit reorder point)
    const lowStockProducts = allProducts
      .filter((p) => {
        const total = stockByProduct.get(p.id) ?? 0;
        const reserved = reservedByProduct.get(p.id) ?? 0;
        const available = Math.max(0, total - reserved);
        return available < p.minStock;
      })
      .map((p) => {
        const total = stockByProduct.get(p.id) ?? 0;
        const reserved = reservedByProduct.get(p.id) ?? 0;
        const available = Math.max(0, total - reserved);
        return {
          id: p.id,
          name: p.name,
          category: p.category,
          itemType: p.itemType,
          minStock: p.minStock,
          bufferStock: p.bufferStock,
          targetStock: p.targetStock,
          totalStock: total,
          reserved,
          available,
          shortfall: Math.max(0, p.minStock - available),
          unitCost: Number(p.unitCost ?? 0),
          estimatedReorderCost: Math.max(0, p.minStock - available) * Number(p.unitCost ?? 0),
          supplierId: p.supplierId,
          supplierSku: p.supplierSku,
        };
      })
      .sort((a, b) => b.shortfall - a.shortfall);

    // Find pending POs for each product
    if (lowStockProducts.length === 0) { res.json([]); return; }

    const productIds = lowStockProducts.map((p) => p.id);
    const pendingPoItems = await db.select({
      item: purchaseOrderItemsTable,
      po: purchaseOrdersTable,
    })
      .from(purchaseOrderItemsTable)
      .innerJoin(purchaseOrdersTable, eq(purchaseOrderItemsTable.poId, purchaseOrdersTable.id))
      .where(and(
        inArray(purchaseOrderItemsTable.productId, productIds),
        eq(purchaseOrdersTable.companyId, companyId),
        inArray(purchaseOrdersTable.status, ["draft", "ordered", "partially_arrived"]),
      ));

    const pendingPoByProduct = new Map<number, { poId: number; quantity: number; status: string }>();
    for (const row of pendingPoItems) {
      const existing = pendingPoByProduct.get(row.item.productId);
      if (!existing) {
        pendingPoByProduct.set(row.item.productId, {
          poId: row.po.id,
          quantity: row.item.quantityOrdered - row.item.quantityArrived,
          status: row.po.status,
        });
      }
    }

    // Resolve supplier names for display and linking
    const supplierIds = [...new Set(lowStockProducts.map((p) => p.supplierId).filter((id): id is number => id != null))];
    const supplierRows = supplierIds.length > 0
      ? await db.select({ id: suppliersTable.id, name: suppliersTable.name })
          .from(suppliersTable)
          .where(inArray(suppliersTable.id, supplierIds))
      : [];
    const supplierNameById = new Map(supplierRows.map((s) => [s.id, s.name]));

    res.json(lowStockProducts.map((p) => ({
      ...p,
      supplierName: p.supplierId ? (supplierNameById.get(p.supplierId) ?? null) : null,
      pendingPo: pendingPoByProduct.get(p.id) ?? null,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to get reorder queue");
    res.status(500).json({ error: "Failed to get reorder queue" });
  }
});

// ─── BOM STOCK CHECK ──────────────────────────────────────────────────────────

router.get("/bom-check", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const templateId = Number(req.query.templateId);
    const quantity = Math.max(1, Number(req.query.quantity) || 1);

    if (!templateId) { res.status(400).json({ error: "templateId required" }); return; }

    const [template] = await db.select().from(workTemplatesTable)
      .where(and(eq(workTemplatesTable.id, templateId), eq(workTemplatesTable.companyId, companyId)));
    if (!template?.productId) { res.json({ ok: true, shortages: [] }); return; }

    const components = await db.select({
      comp: productComponentsTable,
      product: productsTable,
    })
      .from(productComponentsTable)
      .innerJoin(productsTable, eq(productComponentsTable.componentProductId, productsTable.id))
      .where(eq(productComponentsTable.parentProductId, template.productId));

    if (components.length === 0) { res.json({ ok: true, shortages: [] }); return; }

    const componentProductIds = components.map((c) => c.comp.componentProductId);

    // Total stock per component product — only count this company's locations (multi-tenant safety)
    const bomLocationIds = (await db.select({ id: locationsTable.id })
      .from(locationsTable)
      .where(eq(locationsTable.companyId, companyId)))
      .map((l) => l.id);
    const allStock = bomLocationIds.length > 0
      ? await db.select().from(stockTable).where(and(
          inArray(stockTable.productId, componentProductIds),
          inArray(stockTable.locationId, bomLocationIds),
        ))
      : [];
    const stockByProduct = new Map<number, number>();
    for (const s of allStock) {
      stockByProduct.set(s.productId, (stockByProduct.get(s.productId) ?? 0) + s.quantity);
    }

    // Active reservations per component product (subtract from available)
    const activeReservations = await db.select({
      productId: stockReservationsTable.productId,
      reserved: sql<number>`sum(${stockReservationsTable.quantity})::int`,
    })
      .from(stockReservationsTable)
      .where(and(
        eq(stockReservationsTable.companyId, companyId),
        eq(stockReservationsTable.status, "active"),
        inArray(stockReservationsTable.productId, componentProductIds),
      ))
      .groupBy(stockReservationsTable.productId);
    const reservedByProduct = new Map<number, number>(
      activeReservations.map((r) => [r.productId, r.reserved ?? 0])
    );

    const shortages = components
      .filter((c) => c.product.itemType === "purchased_part")
      .map((c) => {
        const needed = c.comp.quantity * quantity;
        const total = stockByProduct.get(c.comp.componentProductId) ?? 0;
        const reserved = reservedByProduct.get(c.comp.componentProductId) ?? 0;
        const available = Math.max(0, total - reserved);
        return {
          productId: c.comp.componentProductId,
          productName: c.product.name,
          itemType: c.product.itemType,
          needed,
          have: available,
          totalStock: total,
          reserved,
          shortfall: Math.max(0, needed - available),
        };
      })
      .filter((s) => s.shortfall > 0);

    res.json({ ok: shortages.length === 0, shortages });
  } catch (err) {
    req.log.error({ err }, "Failed to check BOM stock");
    res.status(500).json({ error: "Failed to check BOM stock" });
  }
});

// ─── PAINT QUEUE (Pro) ────────────────────────────────────────────────────────

// GET /work/painter-access — returns whether the current user can access the Paint Shop
// Used by the frontend nav to decide whether to show the Paint Shop link for plain workers.
router.get("/painter-access", requireAuth, async (req, res) => {
  try {
    const role = req.session.role;
    if (role === "admin" || role === "owner") { res.json({ isPainter: true }); return; }
    const [userRow] = await db.select({ isSupervisor: usersTable.isSupervisor })
      .from(usersTable).where(eq(usersTable.id, req.session.userId!));
    if (userRow?.isSupervisor) { res.json({ isPainter: true }); return; }
    const userRoleRows = await db.select({ roleId: userRolesTable.roleId })
      .from(userRolesTable).where(eq(userRolesTable.userId, req.session.userId!));
    if (userRoleRows.length > 0) {
      const roleIds = userRoleRows.map((r) => r.roleId);
      const paintRoles = await db.select({ id: rolesTable.id })
        .from(rolesTable)
        .where(and(
          inArray(rolesTable.id, roleIds),
          eq(rolesTable.companyId, req.session.companyId!),
          sql`lower(${rolesTable.name}) like '%paint%'`,
        ));
      if (paintRoles.length > 0) { res.json({ isPainter: true }); return; }
    }
    res.json({ isPainter: false });
  } catch {
    res.status(500).json({ error: "Failed to check painter access" });
  }
});

// GET /work/paint-queue — all ready-to-paint steps across active projects
// "Paint" steps = workItemStepsTable where name ilike '%paint%'
// "Ready" = all prior steps (lower sortOrder, same itemId) are completed
router.get("/paint-queue", requirePainterOrAdmin, requirePro, async (req, res) => {
  try {
    const companyId = req.session.companyId!;

    // Fetch all non-completed steps named "paint*" in in_progress projects
    const candidates = await db
      .select({
        step: workItemStepsTable,
        item: workProjectItemsTable,
        project: workProjectsTable,
      })
      .from(workItemStepsTable)
      .innerJoin(workProjectItemsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
      .innerJoin(workProjectsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
      .where(and(
        eq(workProjectsTable.companyId, companyId),
        eq(workProjectsTable.status, "in_progress"),
        sql`lower(${workItemStepsTable.name}) like '%paint%'`,
        ne(workItemStepsTable.status, "completed"),
      ))
      .orderBy(workProjectsTable.deadline, workProjectItemsTable.sortOrder, workItemStepsTable.sortOrder);

    if (candidates.length === 0) { res.json([]); return; }

    // Load all steps for affected items to determine READY status
    const itemIds = [...new Set(candidates.map((r) => r.item.id))];
    const allItemSteps = await db.select().from(workItemStepsTable)
      .where(inArray(workItemStepsTable.itemId, itemIds))
      .orderBy(workItemStepsTable.sortOrder);
    const itemStepMap = new Map<number, typeof workItemStepsTable.$inferSelect[]>();
    for (const s of allItemSteps) {
      if (!itemStepMap.has(s.itemId)) itemStepMap.set(s.itemId, []);
      itemStepMap.get(s.itemId)!.push(s);
    }

    // Fetch latest part location per step to show in the UI
    const stepIds = candidates.map((r) => r.step.id);
    const partLocRows = await db.select().from(partLocationsTable)
      .where(inArray(partLocationsTable.stepId, stepIds))
      .orderBy(desc(partLocationsTable.setAt));
    const wipMap = new Map<number, { locationValue: string }>();
    for (const row of partLocRows) {
      if (!wipMap.has(row.stepId)) wipMap.set(row.stepId, { locationValue: row.locationValue ?? "" });
    }

    // Fetch DAG dependencies to check blockers beyond simple sort-order
    const allStepIds = allItemSteps.map((s) => s.id);
    const dagDepsForQueue = allStepIds.length > 0
      ? await db.select({
          blockedStepId: stepDependenciesTable.blockedStepId,
          blockerStepId: stepDependenciesTable.blockerStepId,
        })
          .from(stepDependenciesTable)
          .where(and(
            inArray(stepDependenciesTable.blockedStepId, allStepIds),
            eq(stepDependenciesTable.companyId, companyId),
          ))
      : [];
    const dagBlockerMap = new Map<number, number[]>(); // blockedStepId → blockerStepIds
    for (const dep of dagDepsForQueue) {
      if (!dagBlockerMap.has(dep.blockedStepId)) dagBlockerMap.set(dep.blockedStepId, []);
      dagBlockerMap.get(dep.blockedStepId)!.push(dep.blockerStepId);
    }
    const stepStatusMap = new Map(allItemSteps.map((s) => [s.id, s.status]));

    const readyItems = candidates
      .map(({ step, item, project }) => {
        const siblings = itemStepMap.get(item.id) ?? [];
        const myIndex = siblings.findIndex((s) => s.id === step.id);
        // Check 1: all prior steps by sortOrder must be completed
        const priorDone = myIndex <= 0 || siblings.slice(0, myIndex).every((s) => s.status === "completed");
        // Check 2: all DAG blockers must be completed
        const dagBlockers = dagBlockerMap.get(step.id) ?? [];
        const dagDone = dagBlockers.every((bid) => stepStatusMap.get(bid) === "completed");
        const isReady = priorDone && dagDone;
        if (!isReady) return null;
        return {
          id: step.id,
          stepName: step.name,
          status: step.status,
          durationEstimate: step.durationEstimate,
          sizeWeight: step.sizeWeight ?? null,
          itemId: item.id,
          itemName: item.name,
          projectId: project.id,
          projectName: project.name,
          deadline: project.deadline.toISOString(),
          priority: project.priority,
          paintColor: project.paintColor ?? null,
          partLocation: wipMap.get(step.id)?.locationValue ?? null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // Sort: overdue first, then by deadline, then by paint color
    const now = new Date();
    readyItems.sort((a, b) => {
      const aOverdue = new Date(a.deadline) < now ? 0 : 1;
      const bOverdue = new Date(b.deadline) < now ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      const dDiff = new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      if (dDiff !== 0) return dDiff;
      return (a.paintColor ?? "").localeCompare(b.paintColor ?? "");
    });

    res.json(readyItems);
  } catch (err) {
    req.log.error({ err }, "Failed to get paint queue");
    res.status(500).json({ error: "Failed to get paint queue" });
  }
});

// POST /work/paint-queue/batch-start — mark selected paint steps as in_progress
router.post("/paint-queue/batch-start", requirePainterOrAdmin, requirePro, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = z.object({ stepIds: z.array(z.number().int()).min(1) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "stepIds required" }); return; }
    const { stepIds } = parsed.data;

    // Verify ownership, paint-step constraint, and state
    const verified = await db
      .select({
        id: workItemStepsTable.id,
        name: workItemStepsTable.name,
        status: workItemStepsTable.status,
        sortOrder: workItemStepsTable.sortOrder,
        itemId: workItemStepsTable.itemId,
      })
      .from(workItemStepsTable)
      .innerJoin(workProjectItemsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
      .innerJoin(workProjectsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
      .where(and(
        inArray(workItemStepsTable.id, stepIds),
        eq(workProjectsTable.companyId, companyId),
        eq(workProjectsTable.status, "in_progress"),
        sql`lower(${workItemStepsTable.name}) like '%paint%'`,
      ));

    if (verified.length !== stepIds.length) {
      res.status(403).json({ error: "One or more steps not found, not a paint step, or project is not active" }); return;
    }

    // Reject already-completed steps
    const alreadyDone = verified.filter((s) => s.status === "completed");
    if (alreadyDone.length > 0) {
      res.status(400).json({ error: `${alreadyDone.length} step(s) are already completed` }); return;
    }

    // Verify all prior steps (by sortOrder) and DAG blockers for each item are completed
    const itemIds = [...new Set(verified.map((s) => s.itemId))];
    const allItemSteps = await db.select({
      id: workItemStepsTable.id,
      itemId: workItemStepsTable.itemId,
      sortOrder: workItemStepsTable.sortOrder,
      status: workItemStepsTable.status,
    }).from(workItemStepsTable).where(inArray(workItemStepsTable.itemId, itemIds));

    // Load DAG blockers for all steps in affected items
    const allIds = allItemSteps.map((s) => s.id);
    const dagDepsStart = allIds.length > 0
      ? await db.select({
          blockedStepId: stepDependenciesTable.blockedStepId,
          blockerStepId: stepDependenciesTable.blockerStepId,
        })
          .from(stepDependenciesTable)
          .where(and(
            inArray(stepDependenciesTable.blockedStepId, allIds),
            eq(stepDependenciesTable.companyId, companyId),
          ))
      : [];
    const dagStartMap = new Map<number, number[]>();
    for (const dep of dagDepsStart) {
      if (!dagStartMap.has(dep.blockedStepId)) dagStartMap.set(dep.blockedStepId, []);
      dagStartMap.get(dep.blockedStepId)!.push(dep.blockerStepId);
    }
    const startStatusMap = new Map(allItemSteps.map((s) => [s.id, s.status]));

    for (const step of verified) {
      const siblings = allItemSteps.filter((s) => s.itemId === step.itemId && s.sortOrder < step.sortOrder);
      const incomplete = siblings.filter((s) => s.status !== "completed");
      if (incomplete.length > 0) {
        res.status(400).json({ error: `Cannot start: prior steps not yet completed for "${step.name}"` }); return;
      }
      const dagBlockers = dagStartMap.get(step.id) ?? [];
      const dagIncomplete = dagBlockers.filter((bid) => startStatusMap.get(bid) !== "completed");
      if (dagIncomplete.length > 0) {
        res.status(400).json({ error: `Cannot start: upstream dependencies not yet completed for "${step.name}"` }); return;
      }
    }

    const toStart = verified.filter((s) => s.status === "not_started").map((s) => s.id);
    if (toStart.length > 0) {
      await db.update(workItemStepsTable)
        .set({ status: "in_progress" })
        .where(inArray(workItemStepsTable.id, toStart));
    }

    res.json({ started: toStart.length, alreadyStarted: verified.length - toStart.length });
  } catch (err) {
    req.log.error({ err }, "Failed to start paint batch");
    res.status(500).json({ error: "Failed to start paint batch" });
  }
});

// POST /work/paint-queue/batch-complete — complete paint steps + log WIP locations
router.post("/paint-queue/batch-complete", requirePainterOrAdmin, requirePro, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const userId = req.session.userId!;
    const parsed = z.object({
      stepIds: z.array(z.number().int()).min(1),
      locations: z.array(z.object({
        stepId: z.number().int(),
        locationType: z.enum(["warehouse", "zone", "with_worker"]),
        locationValue: z.string().optional(),
      })).optional().default([]),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "stepIds required" }); return; }
    const { stepIds, locations } = parsed.data;

    // Verify ownership, paint-step constraint, and that steps are in_progress
    const verified = await db
      .select({ id: workItemStepsTable.id, name: workItemStepsTable.name, status: workItemStepsTable.status })
      .from(workItemStepsTable)
      .innerJoin(workProjectItemsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
      .innerJoin(workProjectsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
      .where(and(
        inArray(workItemStepsTable.id, stepIds),
        eq(workProjectsTable.companyId, companyId),
        eq(workProjectsTable.status, "in_progress"),
        sql`lower(${workItemStepsTable.name}) like '%paint%'`,
      ));

    if (verified.length !== stepIds.length) {
      res.status(403).json({ error: "One or more steps not found, not a paint step, or project is not active" }); return;
    }

    // Steps must be in_progress to be completed — not_started must go through batch-start first
    const notInProgress = verified.filter((s) => s.status !== "in_progress");
    if (notInProgress.length > 0) {
      const breakdown = notInProgress.map((s) => `"${s.name}" (${s.status})`).join(", ");
      res.status(400).json({
        error: `All steps must be in_progress before completing. Use batch-start first: ${breakdown}`,
      }); return;
    }

    // Complete steps and record part locations in a single transaction so a
    // failed location insert never leaves a completed step without any location row.
    const locationMap = new Map(locations.map((l) => [l.stepId, l]));
    await db.transaction(async (tx) => {
      await tx.update(workItemStepsTable)
        .set({ status: "completed" })
        .where(inArray(workItemStepsTable.id, stepIds));

      // Fetch itemIds inside the transaction so we read consistent state
      const stepsWithItems = await tx
        .select({ id: workItemStepsTable.id, itemId: workItemStepsTable.itemId })
        .from(workItemStepsTable)
        .where(inArray(workItemStepsTable.id, stepIds));
      const stepItemMap = new Map(stepsWithItems.map((s) => [s.id, s.itemId]));

      for (const id of stepIds) {
        const loc = locationMap.get(id);
        const itemId = stepItemMap.get(id);
        if (loc && itemId) {
          await tx.insert(partLocationsTable).values({
            stepId: id,
            itemId,
            locationType: loc.locationType,
            locationValue: loc.locationValue ?? null,
            setByUserId: userId,
          });
        }
      }
    });

    res.json({ completed: stepIds.length });
  } catch (err) {
    req.log.error({ err }, "Failed to complete paint batch");
    res.status(500).json({ error: "Failed to complete paint batch" });
  }
});

// ─── SUPERVISOR: UNLOGGED PARTS ───────────────────────────────────────────────

// GET /work/supervisor/unlogged-parts
// Returns completed steps from active projects (last 7 days) without a WIP location entry
router.get("/supervisor/unlogged-parts", requireSupervisorOrAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;

    // All completed steps in this company's active projects
    const completedSteps = await db
      .select({
        stepId: workItemStepsTable.id,
        stepName: workItemStepsTable.name,
        itemId: workProjectItemsTable.id,
        itemName: workProjectItemsTable.name,
        projectId: workProjectsTable.id,
        projectName: workProjectsTable.name,
        deadline: workProjectsTable.deadline,
      })
      .from(workItemStepsTable)
      .innerJoin(workProjectItemsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
      .innerJoin(workProjectsTable, eq(workProjectItemsTable.projectId, workProjectsTable.id))
      .where(and(
        eq(workProjectsTable.companyId, companyId),
        eq(workProjectsTable.status, "in_progress"),
        eq(workItemStepsTable.status, "completed"),
      ))
      .orderBy(workProjectsTable.deadline);

    if (completedSteps.length === 0) { res.json([]); return; }

    // Find which step IDs have part locations recorded
    const completedStepIds = completedSteps.map((s) => s.stepId);
    const loggedStepIds = new Set(
      (await db.select({ stepId: partLocationsTable.stepId })
        .from(partLocationsTable)
        .where(inArray(partLocationsTable.stepId, completedStepIds)))
        .map((r) => r.stepId)
    );

    // Find last worker per step from time logs
    const timeLogRows = await db
      .select({
        stepId: workTimeLogsTable.stepId,
        userId: workTimeLogsTable.userId,
        endTime: workTimeLogsTable.endTime,
        username: usersTable.username,
      })
      .from(workTimeLogsTable)
      .innerJoin(usersTable, eq(workTimeLogsTable.userId, usersTable.id))
      .where(and(
        inArray(workTimeLogsTable.stepId, completedStepIds),
        sql`${workTimeLogsTable.endTime} is not null`,
      ))
      .orderBy(desc(workTimeLogsTable.endTime));

    const lastWorkerMap = new Map<number, { username: string; endTime: Date }>();
    for (const row of timeLogRows) {
      if (!lastWorkerMap.has(row.stepId) && row.endTime) {
        lastWorkerMap.set(row.stepId, { username: row.username, endTime: row.endTime });
      }
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const unlogged = completedSteps
      .filter((s) => {
        if (loggedStepIds.has(s.stepId)) return false;
        // Only include steps completed within the last 7 days
        const endTime = lastWorkerMap.get(s.stepId)?.endTime;
        if (!endTime) return false; // no time log → skip (can't determine when it was done)
        return endTime >= sevenDaysAgo;
      })
      .map((s) => ({
        stepId: s.stepId,
        stepName: s.stepName,
        itemName: s.itemName,
        projectId: s.projectId,
        projectName: s.projectName,
        deadline: s.deadline.toISOString(),
        lastWorker: lastWorkerMap.get(s.stepId)?.username ?? null,
        completedAt: lastWorkerMap.get(s.stepId)?.endTime?.toISOString() ?? null,
      }));

    res.json(unlogged);
  } catch (err) {
    req.log.error({ err }, "Failed to get unlogged parts");
    res.status(500).json({ error: "Failed to get unlogged parts" });
  }
});

// ─── SHORTAGE FLAGS ───────────────────────────────────────────────────────────

router.get("/shortage-flags", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const flags = await db.select().from(shortageFlagsTable)
      .where(eq(shortageFlagsTable.companyId, companyId))
      .orderBy(sql`${shortageFlagsTable.createdAt} desc`);
    res.json(flags);
  } catch (err) {
    req.log.error({ err }, "Failed to list shortage flags");
    res.status(500).json({ error: "Failed to list shortage flags" });
  }
});

router.post("/shortage-flags", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const username = req.session.username ?? null;
    const parsed = z.object({
      productName: z.string().min(1),
      productId: z.number().int().optional(),
      quantityNeeded: z.number().int().min(1).optional(),
      projectId: z.number().int().optional(),
      note: z.string().optional(),
      stepId: z.number().int().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    // Derive projectId from stepId → item → project when not explicitly provided
    let resolvedProjectId = parsed.data.projectId ?? null;
    if (!resolvedProjectId && parsed.data.stepId) {
      const [row] = await db.select({ projectId: workProjectItemsTable.projectId })
        .from(workItemStepsTable)
        .innerJoin(workProjectItemsTable, eq(workItemStepsTable.itemId, workProjectItemsTable.id))
        .where(eq(workItemStepsTable.id, parsed.data.stepId));
      if (row?.projectId) resolvedProjectId = row.projectId;
    }

    const [flag] = await db.insert(shortageFlagsTable).values({
      productName: parsed.data.productName,
      productId: parsed.data.productId ?? null,
      quantityNeeded: parsed.data.quantityNeeded ?? null,
      projectId: resolvedProjectId,
      flaggedByUsername: username,
      note: parsed.data.note ?? null,
      stepId: parsed.data.stepId ?? null,
      companyId,
    }).returning();

    res.status(201).json(flag);
  } catch (err) {
    req.log.error({ err }, "Failed to create shortage flag");
    res.status(500).json({ error: "Failed to create shortage flag" });
  }
});

router.put("/shortage-flags/:id/resolve", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const id = Number(req.params.id);
    const [flag] = await db.update(shortageFlagsTable)
      .set({ resolvedAt: new Date() })
      .where(and(eq(shortageFlagsTable.id, id), eq(shortageFlagsTable.companyId, companyId)))
      .returning();
    if (!flag) { res.status(404).json({ error: "Not found" }); return; }
    res.json(flag);
  } catch (err) {
    req.log.error({ err }, "Failed to resolve shortage flag");
    res.status(500).json({ error: "Failed to resolve shortage flag" });
  }
});

export default router;
