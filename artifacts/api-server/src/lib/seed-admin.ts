import bcrypt from "bcryptjs";
import { db, usersTable, companiesTable, locationsTable, productsTable, workTemplatesTable, workProjectsTable, historyTable, PLAN_FEATURES } from "@workspace/db";
import { sql, isNull } from "drizzle-orm";
import { logger } from "./logger";

export async function seedAdminUser() {
  try {
    // 1. Ensure a default company exists
    const [{ companyCount }] = await db
      .select({ companyCount: sql<number>`COUNT(*)` })
      .from(companiesTable);

    let defaultCompanyId: number;

    if (Number(companyCount) === 0) {
      const [company] = await db.insert(companiesTable).values({
        name: "Default Company",
        plan: "pro",
        features: { ...PLAN_FEATURES.pro },
      }).returning();
      defaultCompanyId = company.id;
      logger.info({ companyId: defaultCompanyId }, "Default company created");
    } else {
      const [company] = await db.select().from(companiesTable);
      defaultCompanyId = company.id;
    }

    // 2. Assign all existing data without company_id to the default company
    await db.update(usersTable).set({ companyId: defaultCompanyId }).where(isNull(usersTable.companyId));
    await db.update(locationsTable).set({ companyId: defaultCompanyId }).where(isNull(locationsTable.companyId));
    await db.update(productsTable).set({ companyId: defaultCompanyId }).where(isNull(productsTable.companyId));
    await db.update(workTemplatesTable).set({ companyId: defaultCompanyId }).where(isNull(workTemplatesTable.companyId));
    await db.update(workProjectsTable).set({ companyId: defaultCompanyId }).where(isNull(workProjectsTable.companyId));
    await db.update(historyTable).set({ companyId: defaultCompanyId }).where(isNull(historyTable.companyId));

    // 3. Create default admin if no users exist
    const [{ userCount }] = await db
      .select({ userCount: sql<number>`COUNT(*)` })
      .from(usersTable);

    if (Number(userCount) === 0) {
      const passwordHash = await bcrypt.hash("admin123", 12);
      await db.insert(usersTable).values({
        username: "admin",
        passwordHash,
        role: "admin",
        companyId: defaultCompanyId,
      });
      logger.info("Default admin user created (username: admin, password: admin123)");
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed");
  }
}
