import { Request, Response, NextFunction } from "express";
import { clerkClient } from "@clerk/express";

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authObject = (req as any).auth;

  if (!authObject || !authObject.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
};