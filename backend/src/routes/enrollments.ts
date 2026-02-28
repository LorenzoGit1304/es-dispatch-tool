import { Router } from "express";
import pool from "../config/db";
import { validate } from "../middleware/validate";
import {
  asEnrollmentRequestSchema,
  enrollmentCreateSchema,
  enrollmentListQuerySchema,
  idParamSchema,
} from "../schemas/requestSchemas";
import { apiError } from "../utils/apiError";
import { getActorUserId, logAuditEvent } from "../utils/auditLog";
import { requireRole } from "../middleware/requireRole";
import { getAuthenticatedClerkId, getAuthenticatedDbUser } from "../utils/authenticatedUser";

const router = Router();

const createEnrollmentAndDispatch = async (
  premiseId: string,
  requestedBy: number,
  timeslot: string
) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const enrollmentResult = await client.query(
      `INSERT INTO enrollments (premise_id, requested_by, timeslot)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [premiseId, requestedBy, timeslot]
    );

    const enrollment = enrollmentResult.rows[0];

    let esResult = await client.query(
      `SELECT * FROM users
       WHERE role = 'ES'
         AND status = 'AVAILABLE'
       ORDER BY last_assigned_at ASC NULLS FIRST
       LIMIT 1`
    );

    let selectedES;
    let queuedForBusy = false;

    if (esResult.rows.length === 0) {
      esResult = await client.query(
        `SELECT * FROM users
         WHERE role = 'ES'
           AND status = 'BUSY'
         ORDER BY last_assigned_at ASC NULLS FIRST
         LIMIT 1`
      );

      if (esResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return { error: "NO_ES_AVAILABLE" as const };
      }

      queuedForBusy = true;
    }

    selectedES = esResult.rows[0];

    const offerResult = await client.query(
      `INSERT INTO enrollment_offers
       (enrollment_id, es_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '5 minutes')
       RETURNING *`,
      [enrollment.id, selectedES.id]
    );
    const offer = offerResult.rows[0];

    if (!queuedForBusy) {
      await client.query(
        `UPDATE users
         SET last_assigned_at = NOW()
         WHERE id = $1`,
        [selectedES.id]
      );
    }

    await client.query("COMMIT");
    return { enrollment, selectedES, offer, queuedForBusy };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/* ======================================================
   CREATE ENROLLMENT + DISPATCH OFFER (ADMIN)
====================================================== */
router.post("/", requireRole("ADMIN"), validate(enrollmentCreateSchema), async (req, res) => {
  const { premise_id, requested_by, timeslot } = req.body;
  const actorClerkId = getAuthenticatedClerkId(req);

  try {
    const creation = await createEnrollmentAndDispatch(premise_id, requested_by, timeslot);
    if ("error" in creation) {
      return apiError(res, 400, "No ES available for assignment", "NO_ES_AVAILABLE");
    }
    const { enrollment, selectedES, offer, queuedForBusy } = creation;

    await logAuditEvent({
      actorClerkId,
      actorUserId: await getActorUserId(pool, actorClerkId),
      action: "ENROLLMENT_CREATED",
      entityType: "enrollment",
      entityId: enrollment.id,
      after: enrollment,
      metadata: {
        offerId: offer.id,
        offeredToEsId: selectedES.id,
        queuedForBusy,
      },
    });

    return res.status(201).json({
      enrollment,
      offered_to: selectedES.name,
      offer,
      queued_for_busy: queuedForBusy,
    });
  } catch (error) {
    console.error("Enrollment creation error:", error);
    return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
  }
});

/* ======================================================
   AS REQUEST TRANSFER (SELF OWNED)
====================================================== */
router.post("/request", requireRole("AS"), validate(asEnrollmentRequestSchema), async (req, res) => {
  const actorClerkId = getAuthenticatedClerkId(req);
  const currentUser = await getAuthenticatedDbUser(req, pool);
  if (!currentUser) {
    return apiError(res, 403, "User not registered in system", "USER_NOT_REGISTERED");
  }

  const { premise_id, timeslot } = req.body;

  try {
    const creation = await createEnrollmentAndDispatch(premise_id, currentUser.id, timeslot);
    if ("error" in creation) {
      return apiError(res, 400, "No ES available for assignment", "NO_ES_AVAILABLE");
    }
    const { enrollment, selectedES, offer, queuedForBusy } = creation;

    await logAuditEvent({
      actorClerkId,
      actorUserId: currentUser.id,
      action: "AS_TRANSFER_REQUEST_CREATED",
      entityType: "enrollment",
      entityId: enrollment.id,
      after: enrollment,
      metadata: {
        offerId: offer.id,
        offeredToEsId: selectedES.id,
        queuedForBusy,
      },
    });

    return res.status(201).json({
      enrollment,
      offered_to: selectedES.name,
      offer,
      queued_for_busy: queuedForBusy,
    });
  } catch (error) {
    console.error("AS transfer request error:", error);
    return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
  }
});

/* ======================================================
   COMPLETE ENROLLMENT
====================================================== */
router.post("/:id/complete", requireRole("AS", "ADMIN"), async (req, res) => {
  const { id } = req.params;
  const actorClerkId = getAuthenticatedClerkId(req);
  const currentUser = await getAuthenticatedDbUser(req, pool);
  if (!currentUser) {
    return apiError(res, 403, "User not registered in system", "USER_NOT_REGISTERED");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const enrollmentResult = await client.query(
      `SELECT * FROM enrollments WHERE id = $1`,
      [id]
    );

    if (enrollmentResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return apiError(res, 404, "Enrollment not found", "ENROLLMENT_NOT_FOUND");
    }

    const enrollment = enrollmentResult.rows[0];

    if (currentUser.role === "AS" && enrollment.requested_by !== currentUser.id) {
      await client.query("ROLLBACK");
      return apiError(res, 403, "Forbidden", "FORBIDDEN");
    }

    if (enrollment.status !== "ASSIGNED") {
      await client.query("ROLLBACK");
      return apiError(res, 400, "Enrollment is not assigned", "ENROLLMENT_NOT_ASSIGNED");
    }

    const completedResult = await client.query(
      `UPDATE enrollments
       SET status = 'COMPLETED'
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    const freedEsResult = await client.query(
      `UPDATE users
       SET status = 'AVAILABLE'
       WHERE id = $1
       RETURNING status`,
      [enrollment.assigned_es_id]
    );

    await client.query("COMMIT");

    await logAuditEvent({
      actorClerkId,
      actorUserId: await getActorUserId(pool, actorClerkId),
      action: "ENROLLMENT_COMPLETED",
      entityType: "enrollment",
      entityId: String(id),
      before: enrollment,
      after: completedResult.rows[0],
      metadata: {
        releasedEsId: enrollment.assigned_es_id,
        releasedEsStatus: freedEsResult.rows[0]?.status ?? "AVAILABLE",
      },
    });

    return res.json({ message: "Enrollment completed successfully" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Complete enrollment error:", error);
    return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
  } finally {
    client.release();
  }
});

/* ======================================================
   GET SINGLE ENROLLMENT + OFFER HISTORY
====================================================== */
router.get("/:id", validate(idParamSchema, "params"), async (req, res) => {
  const { id } = req.params;
  const currentUser = await getAuthenticatedDbUser(req, pool);
  if (!currentUser) {
    return apiError(res, 403, "User not registered in system", "USER_NOT_REGISTERED");
  }

  try {
    const enrollmentResult = await pool.query(
      `SELECT e.*,
              requester.name AS requested_by_name,
              assigned.name AS assigned_es_name
       FROM enrollments e
       LEFT JOIN users requester ON requester.id = e.requested_by
       LEFT JOIN users assigned ON assigned.id = e.assigned_es_id
       WHERE e.id = $1`,
      [id]
    );

    if (enrollmentResult.rows.length === 0) {
      return apiError(res, 404, "Enrollment not found", "ENROLLMENT_NOT_FOUND");
    }

    const enrollment = enrollmentResult.rows[0];
    const isOwnerAs = currentUser.role === "AS" && enrollment.requested_by === currentUser.id;
    const isAssignedEs = currentUser.role === "ES" && enrollment.assigned_es_id === currentUser.id;
    const isAdmin = currentUser.role === "ADMIN";
    if (!(isOwnerAs || isAssignedEs || isAdmin)) {
      return apiError(res, 403, "Forbidden", "FORBIDDEN");
    }

    const offersResult = await pool.query(
      `SELECT o.*, u.name AS es_name, u.email AS es_email
       FROM enrollment_offers o
       JOIN users u ON u.id = o.es_id
       WHERE o.enrollment_id = $1
       ORDER BY o.offered_at DESC`,
      [id]
    );

    return res.json({
      ...enrollment,
      offers: offersResult.rows,
    });
  } catch (error) {
    console.error("Fetch enrollment detail error:", error);
    return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
  }
});

/* ======================================================
   AS: LIST MY REQUESTED ENROLLMENTS
====================================================== */
router.get("/my/requests", requireRole("AS"), validate(enrollmentListQuerySchema, "query"), async (req, res) => {
  const currentUser = await getAuthenticatedDbUser(req, pool);
  if (!currentUser) {
    return apiError(res, 403, "User not registered in system", "USER_NOT_REGISTERED");
  }

  const { page, limit, status } = req.query as unknown as {
    page: number;
    limit: number;
    status?: "WAITING" | "ASSIGNED" | "COMPLETED";
  };
  const offset = (page - 1) * limit;

  const params: Array<string | number> = [currentUser.id];
  let whereClause = "WHERE requested_by = $1";
  if (status) {
    params.push(status);
    whereClause += ` AND status = $${params.length}`;
  }

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM enrollments ${whereClause}`,
      params
    );
    const total = countResult.rows[0]?.total ?? 0;

    const dataParams = [...params, limit, offset];
    const result = await pool.query(
      `SELECT *
       FROM enrollments
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
    console.error("Fetch my enrollments error:", error);
    return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
  }
});

/* ======================================================
   LIST ENROLLMENTS (ADMIN)
====================================================== */
router.get("/", requireRole("ADMIN"), validate(enrollmentListQuerySchema, "query"), async (req, res) => {
  const { page, limit, status } = req.query as unknown as {
    page: number;
    limit: number;
    status?: "WAITING" | "ASSIGNED" | "COMPLETED";
  };

  const offset = (page - 1) * limit;
  const params: Array<string | number> = [];
  let whereClause = "";

  if (status) {
    params.push(status);
    whereClause = `WHERE status = $${params.length}`;
  }

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM enrollments ${whereClause}`,
      params
    );
    const total = countResult.rows[0]?.total ?? 0;

    const dataParams = [...params, limit, offset];
    const result = await pool.query(
      `SELECT * FROM enrollments
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
    console.error("Fetch enrollments error:", error);
    return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
  }
});

console.log("Enrollments route loaded");
export default router;
