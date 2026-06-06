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

    // 3. Ensure default admin exists with correct password
    const [existingAdmin] = await db
      .select()
      .from(usersTable)
      .where(sql`${usersTable.username} = 'admin'`);

    const adminPasswordHash = await bcrypt.hash("admin123", 12);
    if (!existingAdmin) {
      await db.insert(usersTable).values({
        username: "admin",
        passwordHash: adminPasswordHash,
        role: "admin",
        companyId: defaultCompanyId,
      });
      logger.info("Default admin user created (username: admin, password: admin123)");
    } else {
      // Verify the stored hash still works; reset it if not (e.g. after a DB restore)
      const hashOk = await bcrypt.compare("admin123", existingAdmin.passwordHash);
      if (!hashOk) {
        await db.update(usersTable)
          .set({ passwordHash: adminPasswordHash })
          .where(sql`${usersTable.username} = 'admin'`);
        logger.warn("Admin password hash was invalid — reset to admin123");
      }
    }

    // 4. Ensure owner account exists (companyId = null, role = owner)
    const ownerUsername = process.env.OWNER_USERNAME || "owner";
    const ownerPassword = process.env.OWNER_PASSWORD || "owner123";
    const [existingOwner] = await db
      .select()
      .from(usersTable)
      .where(sql`${usersTable.role} = 'owner'`);

    if (!existingOwner) {
      const passwordHash = await bcrypt.hash(ownerPassword, 12);
      await db.insert(usersTable).values({
        username: ownerUsername,
        passwordHash,
        role: "owner",
        companyId: null,
      });
      logger.info({ username: ownerUsername }, "Owner account created");
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed");
  }
}
