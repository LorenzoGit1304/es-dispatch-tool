import { Request, Response, NextFunction } from "express";
import pool from "../config/db";
import { apiError } from "../utils/apiError";

export const requireRole = (...roles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const clerkId = (req as any).auth?.userId;

    if (!clerkId) {
      return apiError(res, 401, "Unauthorized", "UNAUTHORIZED");
    }

    try {
      const result = await pool.query(
        "SELECT role FROM users WHERE clerk_id = $1",
        [clerkId]
      );

      if (result.rows.length === 0) {
        return apiError(res, 403, "User not registered in system", "USER_NOT_REGISTERED");
      }

      if (!roles.includes(result.rows[0].role)) {
        return apiError(res, 403, "Forbidden", "FORBIDDEN");
      }

      next();
    } catch (err) {
      console.error("requireRole error:", err);
      return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
    }
  };
};
