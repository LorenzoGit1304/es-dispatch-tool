import { Router } from "express";
import pool from "../config/db";
import { validate } from "../middleware/validate";
import { apiError } from "../utils/apiError";
import { getActorUserId, logAuditEvent } from "../utils/auditLog";
import {
  idParamSchema,
  paginationQuerySchema,
  userCreateSchema,
  userStatusUpdateSchema,
  userSyncSchema,
  userUpdateSchema,
} from "../schemas/requestSchemas";

const router = Router();

/* ======================================================
   SYNC CLERK USER (called on first login)
====================================================== */
router.post("/sync", validate(userSyncSchema), async (req, res) => {
  const clerkId = (req as any).auth?.userId;

  if (!clerkId) {
    return apiError(res, 401, "Unauthorized", "UNAUTHORIZED");
  }

  const { clerk_id, email, name } = req.body;
  if (clerk_id !== clerkId) {
    return apiError(res, 400, "clerk_id does not match authenticated user", "CLERK_ID_MISMATCH");
  }

  try {
    // If user already exists, return them
    const existing = await pool.query(
      "SELECT id, name, role, status, clerk_id, email FROM users WHERE clerk_id = $1",
      [clerkId]
    );

    if (existing.rows.length > 0) {
      return res.json(existing.rows[0]);
    }

    // Otherwise create new user with default role ES
    const result = await pool.query(
      `INSERT INTO users (name, email, clerk_id, role, status)
       VALUES ($1, $2, $3, 'ES', 'AVAILABLE')
       RETURNING id, name, role, status, clerk_id, email`,
      [name, email, clerkId]
    );

    await logAuditEvent({
      actorClerkId: clerkId,
      actorUserId: result.rows[0].id,
      action: "USER_SYNC_CREATED",
      entityType: "user",
      entityId: result.rows[0].id,
      after: result.rows[0],
    });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Sync error:", err);
    return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
  }
});


/* ======================================================
   LIST ALL USERS
====================================================== */
router.get("/", validate(paginationQuerySchema, "query"), async (req, res) => {
  const { page, limit } = req.query as unknown as { page: number; limit: number };
  const offset = (page - 1) * limit;

  try {
    const countResult = await pool.query("SELECT COUNT(*)::int AS total FROM users");
    const total = countResult.rows[0]?.total ?? 0;

    const result = await pool.query(
      `SELECT id, name, role, status, last_assigned_at
       FROM users
       ORDER BY id
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return res.json({
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error("Fetch users error:", error);
    return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
  }
});

/* ======================================================
   GET SINGLE USER
====================================================== */
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "SELECT id, name, role, status, last_assigned_at FROM users WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) return apiError(res, 404, "User not found", "USER_NOT_FOUND");
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Fetch user error:", error);
    return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
  }
});

/* ======================================================
   UPDATE USER STATUS
   (e.g., AVAILABLE, BUSY, UNAVAILABLE)
====================================================== */
router.patch("/:id/status", validate(idParamSchema, "params"), validate(userStatusUpdateSchema), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const actorClerkId = (req as any).auth?.userId ?? null;

  try {
    const beforeResult = await pool.query(
      "SELECT id, name, role, status, last_assigned_at FROM users WHERE id = $1",
      [id]
    );
    if (beforeResult.rows.length === 0) return apiError(res, 404, "User not found", "USER_NOT_FOUND");

    const result = await pool.query(
      "UPDATE users SET status = $1 WHERE id = $2 RETURNING id, name, role, status, last_assigned_at",
      [status, id]
    );

    await logAuditEvent({
      actorClerkId,
      actorUserId: await getActorUserId(pool, actorClerkId),
      action: "USER_STATUS_UPDATED",
      entityType: "user",
      entityId: String(id),
      before: beforeResult.rows[0],
      after: result.rows[0],
    });

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Update user status error:", error);
    return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
  }
});

/* ======================================================
   CREATE NEW USER
====================================================== */
router.post("/", validate(userCreateSchema), async (req, res) => {
  const { name, role, status } = req.body;
  const actorClerkId = (req as any).auth?.userId ?? null;

  try {
    const result = await pool.query(
      `INSERT INTO users (name, role, status)
       VALUES ($1, $2, $3)
       RETURNING id, name, role, status, last_assigned_at`,
      [name, role, status]
    );

    await logAuditEvent({
      actorClerkId,
      actorUserId: await getActorUserId(pool, actorClerkId),
      action: "USER_CREATED",
      entityType: "user",
      entityId: result.rows[0].id,
      after: result.rows[0],
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Create user error:", error);
    return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
  }
});

/* ======================================================
   UPDATE USER DETAILS
====================================================== */
router.put("/:id", validate(idParamSchema, "params"), validate(userUpdateSchema), async (req, res) => {
  const { id } = req.params;
  const { name, role, status } = req.body;
  const actorClerkId = (req as any).auth?.userId ?? null;

  try {
    const beforeResult = await pool.query(
      "SELECT id, name, role, status, last_assigned_at FROM users WHERE id = $1",
      [id]
    );
    if (beforeResult.rows.length === 0) return apiError(res, 404, "User not found", "USER_NOT_FOUND");

    const result = await pool.query(
      `UPDATE users
       SET name = COALESCE($1, name),
           role = COALESCE($2, role),
           status = COALESCE($3, status)
       WHERE id = $4
       RETURNING id, name, role, status, last_assigned_at`,
      [name, role, status, id]
    );

    await logAuditEvent({
      actorClerkId,
      actorUserId: await getActorUserId(pool, actorClerkId),
      action: "USER_UPDATED",
      entityType: "user",
      entityId: String(id),
      before: beforeResult.rows[0],
      after: result.rows[0],
    });

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Update user error:", error);
    return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
  }
});

/* ======================================================
   DELETE USER
====================================================== */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const actorClerkId = (req as any).auth?.userId ?? null;
  try {
    const beforeResult = await pool.query(
      "SELECT id, name, role, status, last_assigned_at FROM users WHERE id = $1",
      [id]
    );
    if (beforeResult.rows.length === 0) return apiError(res, 404, "User not found", "USER_NOT_FOUND");

    const result = await pool.query("DELETE FROM users WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) return apiError(res, 404, "User not found", "USER_NOT_FOUND");

    await logAuditEvent({
      actorClerkId,
      actorUserId: await getActorUserId(pool, actorClerkId),
      action: "USER_DELETED",
      entityType: "user",
      entityId: id,
      before: beforeResult.rows[0],
      after: null,
    });

    res.json({ message: "User deleted successfully", id: result.rows[0].id });
  } catch (error) {
    console.error("Delete user error:", error);
    return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
  }
});

console.log("Users route loaded");
export default router;
