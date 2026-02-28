import pool from "../config/db";

type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

export type AuditLogInput = {
  actorClerkId?: string | null;
  actorUserId?: number | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

export const getActorUserId = async (
  db: Queryable,
  actorClerkId?: string | null
): Promise<number | null> => {
  if (!actorClerkId) {
    return null;
  }

  const result = await db.query(
    "SELECT id FROM users WHERE clerk_id = $1 LIMIT 1",
    [actorClerkId]
  ) as { rows?: Array<{ id: number }> };

  return result.rows?.[0]?.id ?? null;
};

export const logAuditEvent = async (
  input: AuditLogInput,
  db: Queryable = pool
): Promise<boolean> => {
  try {
    await db.query(
      `INSERT INTO audit_log
       (actor_clerk_id, actor_user_id, action, entity_type, entity_id, before_state, after_state, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)`,
      [
        input.actorClerkId ?? null,
        input.actorUserId ?? null,
        input.action,
        input.entityType,
        input.entityId != null ? String(input.entityId) : null,
        input.before !== undefined ? JSON.stringify(input.before) : null,
        input.after !== undefined ? JSON.stringify(input.after) : null,
        input.metadata !== undefined ? JSON.stringify(input.metadata) : null,
      ]
    );
    return true;
  } catch (error) {
    // Non-blocking policy: never break business flow due to audit failure.
    console.error("audit_log insert failed:", error);
    return false;
  }
};
