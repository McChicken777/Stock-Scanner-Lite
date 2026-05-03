import type { Request, Response, NextFunction } from "express";
import type { CompanyFeatures } from "@workspace/db";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (req.session.role !== "admin" && req.session.role !== "owner") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (req.session.role !== "owner") {
    res.status(403).json({ error: "Owner access required" });
    return;
  }
  next();
}

export async function requireSupervisorOrAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (req.session.role === "admin" || req.session.role === "owner") {
    next();
    return;
  }
  // Re-check isSupervisor from the DB so mid-session flag changes take effect immediately
  try {
    const [user] = await db.select({ isSupervisor: usersTable.isSupervisor })
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId));
    if (!user?.isSupervisor) {
      res.status(403).json({ error: "Supervisor or admin access required" });
      return;
    }
    // Sync the session flag to stay consistent with DB
    req.session.isSupervisor = true;
    next();
  } catch {
    res.status(500).json({ error: "Authorization check failed" });
  }
}

export function requireFeature(feature: keyof CompanyFeatures) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.features?.[feature]) {
      res.status(403).json({ error: `Feature "${feature}" is not enabled for your plan` });
      return;
    }
    next();
  };
}
