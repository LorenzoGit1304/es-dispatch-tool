import { Router } from "express";
import pool from "../config/db";
import { apiError } from "../utils/apiError";
import { validate } from "../middleware/validate";
import { idParamSchema, paginationQuerySchema } from "../schemas/requestSchemas";
import { getActorUserId, logAuditEvent } from "../utils/auditLog";
import { requireRole } from "../middleware/requireRole";
import { getAuthenticatedClerkId, getAuthenticatedDbUser } from "../utils/authenticatedUser";

const router = Router();

/* ======================================================
   ACCEPT OFFER (ES owner or ADMIN)
====================================================== */
router.post("/:id/accept", requireRole("ES", "ADMIN"), async (req, res) => {
  const { id } = req.params;
  const actorClerkId = getAuthenticatedClerkId(req);
  const currentUser = await getAuthenticatedDbUser(req, pool);
  if (!currentUser) {
    return apiError(res, 403, "User not registered in system", "USER_NOT_REGISTERED");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const offerLookup = await client.query(
      `SELECT * FROM enrollment_offers
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (offerLookup.rows.length === 0) {
      await client.query("ROLLBACK");
      return apiError(res, 404, "Offer not found", "OFFER_NOT_FOUND");
    }

    const lockedOffer = offerLookup.rows[0];
    if (currentUser.role === "ES" && lockedOffer.es_id !== currentUser.id) {
      await client.query("ROLLBACK");
      return apiError(res, 403, "Forbidden", "FORBIDDEN");
    }

    const acceptResult = await client.query(
      `UPDATE enrollment_offers
       SET status = 'ACCEPTED', responded_at = NOW()
       WHERE id = $1
         AND status = 'PENDING'
       RETURNING *`,
      [id]
    );

    if (acceptResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return apiError(res, 400, "Offer already processed", "OFFER_NOT_PENDING");
    }

    const offer = acceptResult.rows[0];
    const beforeOffer = { ...lockedOffer };

    await client.query(
      `UPDATE enrollments
       SET status = 'ASSIGNED',
           assigned_es_id = $1
       WHERE id = $2`,
      [offer.es_id, offer.enrollment_id]
    );

    await client.query(
      `UPDATE users
       SET status = 'BUSY',
           last_assigned_at = NOW()
       WHERE id = $1`,
      [offer.es_id]
    );

    await client.query(
      `UPDATE enrollment_offers
       SET status = 'EXPIRED'
       WHERE enrollment_id = $1
         AND id != $2
         AND status = 'PENDING'`,
      [offer.enrollment_id, offer.id]
    );

    await client.query("COMMIT");

    await logAuditEvent({
      actorClerkId,
      actorUserId: await getActorUserId(pool, actorClerkId),
      action: "OFFER_ACCEPTED",
      entityType: "offer",
      entityId: String(id),
      before: beforeOffer,
      after: offer,
      metadata: {
        enrollmentId: offer.enrollment_id,
        esId: offer.es_id,
      },
    });

    return res.json({ message: "Offer accepted successfully" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Accept error:", error);
    return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
  } finally {
    client.release();
  }
});

/* ======================================================
   REJECT OFFER (ES owner or ADMIN)
====================================================== */
router.post("/:id/reject", requireRole("ES", "ADMIN"), async (req, res) => {
  const { id } = req.params;
  const actorClerkId = getAuthenticatedClerkId(req);
  const currentUser = await getAuthenticatedDbUser(req, pool);
  if (!currentUser) {
    return apiError(res, 403, "User not registered in system", "USER_NOT_REGISTERED");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const offerResult = await client.query(
      `SELECT * FROM enrollment_offers
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (offerResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return apiError(res, 404, "Offer not found", "OFFER_NOT_FOUND");
    }

    const offer = offerResult.rows[0];
    const beforeOffer = { ...offer };
    if (currentUser.role === "ES" && offer.es_id !== currentUser.id) {
      await client.query("ROLLBACK");
      return apiError(res, 403, "Forbidden", "FORBIDDEN");
    }

    if (offer.status !== "PENDING") {
      await client.query("ROLLBACK");
      return apiError(res, 400, "Offer already processed", "OFFER_ALREADY_PROCESSED");
    }

    await client.query(
      `UPDATE enrollment_offers
       SET status = 'REJECTED', responded_at = NOW()
       WHERE id = $1`,
      [id]
    );

    const nextESResult = await client.query(
      `SELECT *
       FROM users
       WHERE role = 'ES'
         AND status = 'AVAILABLE'
         AND id != $1
       ORDER BY last_assigned_at ASC NULLS FIRST
       LIMIT 1`,
      [offer.es_id]
    );

    if (nextESResult.rows.length === 0) {
      await client.query("COMMIT");
      return apiError(res, 400, "No other available ES", "NO_OTHER_ES_AVAILABLE");
    }

    const nextES = nextESResult.rows[0];

    const newOfferResult = await client.query(
      `INSERT INTO enrollment_offers
       (enrollment_id, es_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '5 minutes')
       RETURNING *`,
      [offer.enrollment_id, nextES.id]
    );

    await client.query(
      `UPDATE users
       SET last_assigned_at = NOW()
       WHERE id = $1`,
      [nextES.id]
    );

    await client.query("COMMIT");

    await logAuditEvent({
      actorClerkId,
      actorUserId: await getActorUserId(pool, actorClerkId),
      action: "OFFER_REJECTED_REASSIGNED",
      entityType: "offer",
      entityId: String(id),
      before: beforeOffer,
      after: { ...offer, status: "REJECTED" },
      metadata: {
        enrollmentId: offer.enrollment_id,
        rejectedByEsId: offer.es_id,
        reassignedOfferId: newOfferResult.rows[0]?.id ?? null,
        reassignedToEsId: nextES.id,
      },
    });

    return res.json({
      message: "Offer rejected. Reassigned to next ES.",
      new_offer: newOfferResult.rows[0],
      reassigned_to: nextES.name,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Reject error:", error);
    return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
  } finally {
    client.release();
  }
});

/* ======================================================
   ES: LIST MY OFFERS
====================================================== */
router.get("/my", requireRole("ES"), validate(paginationQuerySchema, "query"), async (req, res) => {
  const currentUser = await getAuthenticatedDbUser(req, pool);
  if (!currentUser) {
    return apiError(res, 403, "User not registered in system", "USER_NOT_REGISTERED");
  }

  const { page, limit } = req.query as unknown as { page: number; limit: number };
  const offset = (page - 1) * limit;

  try {
    const countResult = await pool.query(
      "SELECT COUNT(*)::int AS total FROM enrollment_offers WHERE es_id = $1",
      [currentUser.id]
    );
    const total = countResult.rows[0]?.total ?? 0;

    const result = await pool.query(
      `SELECT *
       FROM enrollment_offers
       WHERE es_id = $1
       ORDER BY offered_at DESC
       LIMIT $2 OFFSET $3`,
      [currentUser.id, limit, offset]
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
    console.error("Fetch my offers error:", error);
    return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
  }
});

/* ======================================================
   GET SINGLE OFFER (ADMIN or owner ES/AS)
====================================================== */
router.get("/:id", validate(idParamSchema, "params"), async (req, res) => {
  const { id } = req.params;
  const currentUser = await getAuthenticatedDbUser(req, pool);
  if (!currentUser) {
    return apiError(res, 403, "User not registered in system", "USER_NOT_REGISTERED");
  }

  try {
    const result = await pool.query(
      `SELECT o.*,
              u.name AS es_name,
              u.email AS es_email,
              e.status AS enrollment_status,
              e.requested_by
       FROM enrollment_offers o
       JOIN users u ON u.id = o.es_id
       JOIN enrollments e ON e.id = o.enrollment_id
       WHERE o.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return apiError(res, 404, "Offer not found", "OFFER_NOT_FOUND");
    }

    const offer = result.rows[0];
    const isAdmin = currentUser.role === "ADMIN";
    const isOwnerEs = currentUser.role === "ES" && offer.es_id === currentUser.id;
    const isOwnerAs = currentUser.role === "AS" && offer.requested_by === currentUser.id;

    if (!(isAdmin || isOwnerEs || isOwnerAs)) {
      return apiError(res, 403, "Forbidden", "FORBIDDEN");
    }

    return res.json(offer);
  } catch (error) {
    console.error("Fetch offer detail error:", error);
    return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
  }
});

/* ======================================================
   LIST OFFERS (ADMIN)
====================================================== */
router.get("/", requireRole("ADMIN"), validate(paginationQuerySchema, "query"), async (req, res) => {
  const { page, limit } = req.query as unknown as { page: number; limit: number };
  const offset = (page - 1) * limit;

  try {
    const countResult = await pool.query("SELECT COUNT(*)::int AS total FROM enrollment_offers");
    const total = countResult.rows[0]?.total ?? 0;

    const result = await pool.query(
      `SELECT *
       FROM enrollment_offers
       ORDER BY offered_at DESC
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
    console.error("Fetch offers error:", error);
    return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
  }
});

console.log("Offers route loaded");
export default router;
