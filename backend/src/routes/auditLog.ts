import { Router } from "express";
import pool from "../config/db";
import { requireRole } from "../middleware/requireRole";
import { validate } from "../middleware/validate";
import { auditLogQuerySchema } from "../schemas/requestSchemas";
import { apiError } from "../utils/apiError";

const router = Router();

router.get("/", requireRole("ADMIN"), validate(auditLogQuerySchema, "query"), async (req, res) => {
  const { page, limit, action, entity_type, actor_clerk_id } = req.query as unknown as {
    page: number;
    limit: number;
    action?: string;
    entity_type?: string;
    actor_clerk_id?: string;
  };

  const offset = (page - 1) * limit;

  const params: Array<string | number> = [];
  const whereParts: string[] = [];

  if (action) {
    params.push(action);
    whereParts.push(`action = $${params.length}`);
  }
  if (entity_type) {
    params.push(entity_type);
    whereParts.push(`entity_type = $${params.length}`);
  }
  if (actor_clerk_id) {
    params.push(actor_clerk_id);
    whereParts.push(`actor_clerk_id = $${params.length}`);
  }

  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM audit_log ${whereClause}`,
      params
    );
    const total = countResult.rows[0]?.total ?? 0;

    const dataParams = [...params, limit, offset];
    const result = await pool.query(
      `SELECT *
       FROM audit_log
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${dataParams.length - 1}
       OFFSET $${dataParams.length}`,
      dataParams
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
    console.error("Fetch audit log error:", error);
    return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
  }
});

export default router;
