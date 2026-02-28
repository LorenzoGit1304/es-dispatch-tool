import { Request } from "express";
import pool from "../config/db";

type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

export type AuthenticatedDbUser = {
  id: number;
  clerk_id: string;
  name: string;
  email: string;
  role: "ES" | "AS" | "ADMIN";
  language: string | null;
  status: "AVAILABLE" | "BUSY" | "UNAVAILABLE";
};

export const getAuthenticatedClerkId = (req: Request): string | null => {
  const clerkId = (req as any).auth?.userId;
  return typeof clerkId === "string" ? clerkId : null;
};

export const getAuthenticatedDbUser = async (
  req: Request,
  db: Queryable = pool
): Promise<AuthenticatedDbUser | null> => {
  const clerkId = getAuthenticatedClerkId(req);
  if (!clerkId) {
    return null;
  }

  const result = await db.query(
    `SELECT id, clerk_id, name, email, role, language, status
     FROM users
     WHERE clerk_id = $1
     LIMIT 1`,
    [clerkId]
  ) as { rows?: AuthenticatedDbUser[] };

  return result.rows?.[0] ?? null;
};
