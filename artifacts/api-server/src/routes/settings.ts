import { Router, type IRouter } from "express";
import { db, companyHolidaysTable, companiesTable } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

// Curated public holidays for common countries (year 2026)
const PUBLIC_HOLIDAYS: Record<string, Array<{ date: string; label: string }>> = {
  US: [
    { date: "2026-01-01", label: "New Year's Day" },
    { date: "2026-01-19", label: "Martin Luther King Jr. Day" },
    { date: "2026-02-16", label: "Presidents' Day" },
    { date: "2026-05-25", label: "Memorial Day" },
    { date: "2026-06-19", label: "Juneteenth" },
    { date: "2026-07-04", label: "Independence Day" },
    { date: "2026-09-07", label: "Labor Day" },
    { date: "2026-11-26", label: "Thanksgiving Day" },
    { date: "2026-12-25", label: "Christmas Day" },
  ],
  GB: [
    { date: "2026-01-01", label: "New Year's Day" },
    { date: "2026-04-03", label: "Good Friday" },
    { date: "2026-04-06", label: "Easter Monday" },
    { date: "2026-05-04", label: "Early May Bank Holiday" },
    { date: "2026-05-25", label: "Spring Bank Holiday" },
    { date: "2026-08-31", label: "Summer Bank Holiday" },
    { date: "2026-12-25", label: "Christmas Day" },
    { date: "2026-12-28", label: "Boxing Day (substitute)" },
  ],
  DE: [
    { date: "2026-01-01", label: "Neujahrstag" },
    { date: "2026-04-03", label: "Karfreitag" },
    { date: "2026-04-06", label: "Ostermontag" },
    { date: "2026-05-01", label: "Tag der Arbeit" },
    { date: "2026-05-14", label: "Christi Himmelfahrt" },
    { date: "2026-05-25", label: "Pfingstmontag" },
    { date: "2026-10-03", label: "Tag der Deutschen Einheit" },
    { date: "2026-12-25", label: "1. Weihnachtstag" },
    { date: "2026-12-26", label: "2. Weihnachtstag" },
  ],
  FR: [
    { date: "2026-01-01", label: "Jour de l'An" },
    { date: "2026-04-06", label: "Lundi de Pâques" },
    { date: "2026-05-01", label: "Fête du Travail" },
    { date: "2026-05-08", label: "Victoire 1945" },
    { date: "2026-05-14", label: "Ascension" },
    { date: "2026-05-25", label: "Lundi de Pentecôte" },
    { date: "2026-07-14", label: "Fête Nationale" },
    { date: "2026-08-15", label: "Assomption" },
    { date: "2026-11-01", label: "Toussaint" },
    { date: "2026-11-11", label: "Armistice" },
    { date: "2026-12-25", label: "Noël" },
  ],
  ES: [
    { date: "2026-01-01", label: "Año Nuevo" },
    { date: "2026-01-06", label: "Reyes Magos" },
    { date: "2026-04-02", label: "Jueves Santo" },
    { date: "2026-04-03", label: "Viernes Santo" },
    { date: "2026-05-01", label: "Día del Trabajo" },
    { date: "2026-08-15", label: "Asunción" },
    { date: "2026-10-12", label: "Fiesta Nacional" },
    { date: "2026-11-01", label: "Todos los Santos" },
    { date: "2026-12-06", label: "Día de la Constitución" },
    { date: "2026-12-08", label: "Inmaculada Concepción" },
    { date: "2026-12-25", label: "Navidad" },
  ],
  PT: [
    { date: "2026-01-01", label: "Ano Novo" },
    { date: "2026-04-03", label: "Sexta-Feira Santa" },
    { date: "2026-04-25", label: "Dia da Liberdade" },
    { date: "2026-05-01", label: "Dia do Trabalhador" },
    { date: "2026-06-10", label: "Dia de Portugal" },
    { date: "2026-08-15", label: "Assunção de Nossa Senhora" },
    { date: "2026-10-05", label: "Implantação da República" },
    { date: "2026-11-01", label: "Dia de Todos os Santos" },
    { date: "2026-12-01", label: "Restauração da Independência" },
    { date: "2026-12-08", label: "Imaculada Conceição" },
    { date: "2026-12-25", label: "Natal" },
  ],
  NL: [
    { date: "2026-01-01", label: "Nieuwjaarsdag" },
    { date: "2026-04-03", label: "Goede Vrijdag" },
    { date: "2026-04-05", label: "Eerste Paasdag" },
    { date: "2026-04-06", label: "Tweede Paasdag" },
    { date: "2026-04-27", label: "Koningsdag" },
    { date: "2026-05-05", label: "Bevrijdingsdag" },
    { date: "2026-05-14", label: "Hemelvaartsdag" },
    { date: "2026-05-24", label: "Eerste Pinksterdag" },
    { date: "2026-05-25", label: "Tweede Pinksterdag" },
    { date: "2026-12-25", label: "Eerste Kerstdag" },
    { date: "2026-12-26", label: "Tweede Kerstdag" },
  ],
  IT: [
    { date: "2026-01-01", label: "Capodanno" },
    { date: "2026-01-06", label: "Epifania" },
    { date: "2026-04-06", label: "Lunedì dell'Angelo" },
    { date: "2026-04-25", label: "Festa della Liberazione" },
    { date: "2026-05-01", label: "Festa del Lavoro" },
    { date: "2026-06-02", label: "Festa della Repubblica" },
    { date: "2026-08-15", label: "Ferragosto" },
    { date: "2026-11-01", label: "Ognissanti" },
    { date: "2026-12-08", label: "Immacolata Concezione" },
    { date: "2026-12-25", label: "Natale" },
    { date: "2026-12-26", label: "Santo Stefano" },
  ],
  BR: [
    { date: "2026-01-01", label: "Confraternização Universal" },
    { date: "2026-02-16", label: "Carnaval" },
    { date: "2026-02-17", label: "Carnaval" },
    { date: "2026-04-03", label: "Sexta-feira Santa" },
    { date: "2026-04-21", label: "Tiradentes" },
    { date: "2026-05-01", label: "Dia do Trabalhador" },
    { date: "2026-06-04", label: "Corpus Christi" },
    { date: "2026-09-07", label: "Independência" },
    { date: "2026-10-12", label: "Nossa Senhora Aparecida" },
    { date: "2026-11-02", label: "Finados" },
    { date: "2026-11-15", label: "Proclamação da República" },
    { date: "2026-12-25", label: "Natal" },
  ],
  AU: [
    { date: "2026-01-01", label: "New Year's Day" },
    { date: "2026-01-26", label: "Australia Day" },
    { date: "2026-04-03", label: "Good Friday" },
    { date: "2026-04-04", label: "Easter Saturday" },
    { date: "2026-04-06", label: "Easter Monday" },
    { date: "2026-04-25", label: "ANZAC Day" },
    { date: "2026-12-25", label: "Christmas Day" },
    { date: "2026-12-26", label: "Boxing Day" },
  ],
};

router.get("/holidays/presets", requireAuth, (req, res) => {
  const country = String(req.query.country ?? "").toUpperCase();
  const requestedYear = typeof req.query.year === "string" && /^\d{4}$/.test(req.query.year)
    ? req.query.year
    : String(new Date().getFullYear());
  const presets = (PUBLIC_HOLIDAYS[country] ?? []).map((h) => ({
    ...h,
    date: h.date.replace(/^\d{4}/, requestedYear),
  }));
  res.json(presets);
});

router.get("/holidays", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const rows = await db.select().from(companyHolidaysTable)
      .where(eq(companyHolidaysTable.companyId, companyId));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list holidays");
    res.status(500).json({ error: "Failed to list holidays" });
  }
});

const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().min(1).max(200),
});

router.post("/holidays", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = holidaySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [created] = await db.insert(companyHolidaysTable).values({
      companyId,
      date: parsed.data.date,
      label: parsed.data.label,
    }).returning();
    res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Failed to add holiday");
    res.status(500).json({ error: "Failed to add holiday" });
  }
});

router.delete("/holidays/:id", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const id = Number(req.params.id);
    await db.delete(companyHolidaysTable)
      .where(and(eq(companyHolidaysTable.id, id), eq(companyHolidaysTable.companyId, companyId)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete holiday");
    res.status(500).json({ error: "Failed to delete holiday" });
  }
});

router.post("/holidays/bulk", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = z.object({
      holidays: z.array(holidaySchema),
      year: z.number().int().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    if (parsed.data.holidays.length === 0) { res.json({ inserted: 0 }); return; }

    // Delete existing holidays for dates that overlap so we don't duplicate
    const yearStr = parsed.data.year ? String(parsed.data.year) : parsed.data.holidays[0].date.slice(0, 4);
    await db.delete(companyHolidaysTable)
      .where(and(
        eq(companyHolidaysTable.companyId, companyId),
        gte(companyHolidaysTable.date, `${yearStr}-01-01`),
        lte(companyHolidaysTable.date, `${yearStr}-12-31`),
      ));

    const inserted = await db.insert(companyHolidaysTable)
      .values(parsed.data.holidays.map(h => ({ companyId, date: h.date, label: h.label })))
      .returning();
    res.status(201).json({ inserted: inserted.length });
  } catch (err) {
    req.log.error({ err }, "Failed to bulk-add holidays");
    res.status(500).json({ error: "Failed to bulk-add holidays" });
  }
});

// GET /api/settings/company — includes new scheduling fields
router.get("/company", requireAuth, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId));
    if (!company) { res.status(404).json({ error: "Not found" }); return; }
    res.json(company);
  } catch (err) {
    req.log.error({ err }, "Failed to get company settings");
    res.status(500).json({ error: "Failed to get company settings" });
  }
});

const schedulingSchema = z.object({
  weekendOvertimeEnabled: z.boolean().optional(),
  country: z.string().max(10).nullable().optional(),
});

router.put("/company/scheduling", requireAdmin, async (req, res) => {
  try {
    const companyId = req.session.companyId!;
    const parsed = schedulingSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const updates: Record<string, unknown> = {};
    if (parsed.data.weekendOvertimeEnabled !== undefined) updates.weekendOvertimeEnabled = parsed.data.weekendOvertimeEnabled;
    if (parsed.data.country !== undefined) updates.country = parsed.data.country;

    const [updated] = await db.update(companiesTable).set(updates as never)
      .where(eq(companiesTable.id, companyId)).returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update scheduling settings");
    res.status(500).json({ error: "Failed to update scheduling settings" });
  }
});

export default router;
