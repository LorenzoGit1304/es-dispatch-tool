import { Router } from "express";
import pool from "../config/db";
import { apiError } from "../utils/apiError";
import { validate } from "../middleware/validate";
import { idParamSchema, paginationQuerySchema } from "../schemas/requestSchemas";
import { getActorUserId, logAuditEvent } from "../utils/auditLog";

const router = Router();

/* ======================================================
   ACCEPT OFFER (Race-Safe Version)
====================================================== */
router.post("/:id/accept", async (req, res) => {
  const { id } = req.params;
  const actorClerkId = (req as any).auth?.userId ?? null;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 🔒 SAFER PATTERN:
    // Atomically update ONLY if status is still PENDING
    // This prevents double-accept race conditions
    const acceptResult = await client.query(
      `UPDATE enrollment_offers
       SET status = 'ACCEPTED'
       WHERE id = $1
         AND status = 'PENDING'
       RETURNING *`,
      [id]
    );

    if (acceptResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return apiError(res, 400, "Offer already processed or not found", "OFFER_NOT_PENDING");
    }

    const offer = acceptResult.rows[0];
    const beforeOffer = { ...offer, status: "PENDING" };

    // 2️⃣ Update enrollment (assign ES)
    await client.query(
      `UPDATE enrollments
       SET status = 'ASSIGNED',
           assigned_es_id = $1
       WHERE id = $2`,
      [offer.es_id, offer.enrollment_id]
    );

    // 3️⃣ Mark ES as BUSY
    await client.query(
      `UPDATE users
       SET status = 'BUSY',
           last_assigned_at = NOW()
       WHERE id = $1`,
      [offer.es_id]
    );

    await client.query("COMMIT");

    await logAuditEvent({
      actorClerkId,
      actorUserId: await getActorUserId(pool, actorClerkId),
      action: "OFFER_ACCEPTED",
      entityType: "offer",
      entityId: id,
      before: beforeOffer,
      after: offer,
      metadata: {
        enrollmentId: offer.enrollment_id,
        esId: offer.es_id,
      },
    });

    res.json({ message: "Offer accepted successfully" });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Accept error:", error);
    return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
  } finally {
    client.release();
  }
});


/* ======================================================
   REJECT OFFER (Race-Safe Version)
====================================================== */
router.post("/:id/reject", async (req, res) => {
  const { id } = req.params;
  const actorClerkId = (req as any).auth?.userId ?? null;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 🔒 Lock the row so no concurrent modification happens
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

    if (offer.status !== "PENDING") {
      await client.query("ROLLBACK");
      return apiError(res, 400, "Offer already processed", "OFFER_ALREADY_PROCESSED");
    }

    // 2️⃣ Mark current offer REJECTED
    await client.query(
      `UPDATE enrollment_offers
       SET status = 'REJECTED'
       WHERE id = $1`,
      [id]
    );

    // 3️⃣ Find next AVAILABLE ES (excluding rejecting ES)
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
      await client.query("COMMIT"); // rejection is valid even without reassignment
      return apiError(res, 400, "No other available ES", "NO_OTHER_ES_AVAILABLE");
    }

    const nextES = nextESResult.rows[0];

    // 4️⃣ Create new offer
    const newOfferResult = await client.query(
      `INSERT INTO enrollment_offers
       (enrollment_id, es_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '5 minutes')
       RETURNING *`,
      [offer.enrollment_id, nextES.id]
    );

    // 5️⃣ Update fairness timestamp
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
      entityId: id,
      before: beforeOffer,
      after: { ...offer, status: "REJECTED" },
      metadata: {
        enrollmentId: offer.enrollment_id,
        rejectedByEsId: offer.es_id,
        reassignedOfferId: newOfferResult.rows[0]?.id ?? null,
        reassignedToEsId: nextES.id,
      },
    });

    res.json({
      message: "Offer rejected. Reassigned to next ES.",
      new_offer: newOfferResult.rows[0],
      reassigned_to: nextES.name
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
   GET SINGLE OFFER
====================================================== */
router.get("/:id", validate(idParamSchema, "params"), async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT o.*,
              u.name AS es_name,
              u.email AS es_email,
              e.status AS enrollment_status
       FROM enrollment_offers o
       JOIN users u ON u.id = o.es_id
       JOIN enrollments e ON e.id = o.enrollment_id
       WHERE o.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return apiError(res, 404, "Offer not found", "OFFER_NOT_FOUND");
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Fetch offer detail error:", error);
    return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
  }
});

/* ======================================================
   LIST OFFERS
====================================================== */
router.get("/", validate(paginationQuerySchema, "query"), async (req, res) => {
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
