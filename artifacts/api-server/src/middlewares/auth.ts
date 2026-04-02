import type { Request, Response, NextFunction } from "express";
import type { CompanyFeatures } from "@workspace/db";

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

export function requireFeature(feature: keyof CompanyFeatures) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.features?.[feature]) {
      res.status(403).json({ error: `Feature "${feature}" is not enabled for your plan` });
      return;
    }
    next();
  };
}
