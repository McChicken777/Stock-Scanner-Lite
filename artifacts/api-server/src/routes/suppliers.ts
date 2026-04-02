import { Router, type IRouter } from "express";
import { db, suppliersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

const createSupplierSchema = z.object({
  name: z.string().min(1, "Name required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

// GET /api/suppliers - List suppliers
router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = req.session;

    const suppliers = await db.query.suppliersTable.findMany({
      where: eq(suppliersTable.companyId, companyId),
    });

    res.json(suppliers);
  } catch (err) {
    req.log.error({ err }, "Failed to list suppliers");
    res.status(500).json({ error: "Failed to list suppliers" });
  }
});

// POST /api/suppliers - Create supplier
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = req.session;
    const data = createSupplierSchema.parse(req.body);

    const [supplier] = await db.insert(suppliersTable).values({
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      notes: data.notes || null,
      companyId,
    }).returning();

    res.status(201).json(supplier);
  } catch (err: any) {
    if (err.name === "ZodError") {
      res.status(400).json({ error: err.errors[0].message });
    } else {
      req.log.error({ err }, "Failed to create supplier");
      res.status(500).json({ error: "Failed to create supplier" });
    }
  }
});

// PUT /api/suppliers/:id - Update supplier
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = req.session;
    const { id } = req.params;
    const data = createSupplierSchema.parse(req.body);

    const supplier = await db.query.suppliersTable.findFirst({
      where: and(
        eq(suppliersTable.id, parseInt(id)),
        eq(suppliersTable.companyId, companyId)
      ),
    });

    if (!supplier) {
      res.status(404).json({ error: "Supplier not found" });
      return;
    }

    const [updated] = await db.update(suppliersTable)
      .set({
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        notes: data.notes || null,
      })
      .where(eq(suppliersTable.id, parseInt(id)))
      .returning();

    res.json(updated);
  } catch (err: any) {
    if (err.name === "ZodError") {
      res.status(400).json({ error: err.errors[0].message });
    } else {
      req.log.error({ err }, "Failed to update supplier");
      res.status(500).json({ error: "Failed to update supplier" });
    }
  }
});

// DELETE /api/suppliers/:id - Delete supplier
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = req.session;
    const { id } = req.params;

    const supplier = await db.query.suppliersTable.findFirst({
      where: and(
        eq(suppliersTable.id, parseInt(id)),
        eq(suppliersTable.companyId, companyId)
      ),
    });

    if (!supplier) {
      res.status(404).json({ error: "Supplier not found" });
      return;
    }

    await db.delete(suppliersTable).where(eq(suppliersTable.id, parseInt(id)));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete supplier");
    res.status(500).json({ error: "Failed to delete supplier" });
  }
});

export default router;
