import { Request, Response, NextFunction } from "express";
import pool from "../config/db";

export const requireRole = (...roles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const clerkId = (req as any).auth?.userId;

    if (!clerkId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const result = await pool.query(
        "SELECT role FROM users WHERE clerk_id = $1",
        [clerkId]
      );

      if (result.rows.length === 0) {
        res.status(403).json({ error: "User not registered in system" });
        return;
      }

      if (!roles.includes(result.rows[0].role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      next();
    } catch (err) {
      console.error("requireRole error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  };
};