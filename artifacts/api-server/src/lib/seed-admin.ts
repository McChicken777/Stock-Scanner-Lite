import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export async function seedAdminUser() {
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(usersTable);

    if (Number(count) === 0) {
      const passwordHash = await bcrypt.hash("admin123", 12);
      await db.insert(usersTable).values({
        username: "admin",
        passwordHash,
        role: "admin",
      });
      logger.info("Default admin user created (username: admin, password: admin123)");
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed admin user");
  }
}
