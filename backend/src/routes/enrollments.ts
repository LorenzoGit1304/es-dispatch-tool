import { Router } from "express";
import pool from "../config/db";
import { validate } from "../middleware/validate";
import {
  enrollmentCreateSchema,
  enrollmentListQuerySchema,
  idParamSchema,
} from "../schemas/requestSchemas";
import { apiError } from "../utils/apiError";

const router = Router();

/* ======================================================
   CREATE ENROLLMENT + DISPATCH OFFER (with BUSY fallback)
====================================================== */
router.post("/", validate(enrollmentCreateSchema), async (req, res) => {
  const { premise_id, requested_by, timeslot } = req.body;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ Create enrollment
    const enrollmentResult = await client.query(
      `INSERT INTO enrollments (premise_id, requested_by, timeslot)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [premise_id, requested_by, timeslot]
    );

    const enrollment = enrollmentResult.rows[0];

    // 2️⃣ Find fairest AVAILABLE ES first
    let esResult = await client.query(
      `SELECT * FROM users
       WHERE role = 'ES'
         AND status = 'AVAILABLE'
       ORDER BY last_assigned_at ASC NULLS FIRST
       LIMIT 1`
    );

    let selectedES;
    let queuedForBusy = false; // 🔹 flag if we assign to BUSY ES

    if (esResult.rows.length === 0) {
      // 🔹 No AVAILABLE ES → fallback to fairest BUSY ES
      esResult = await client.query(
        `SELECT * FROM users
         WHERE role = 'ES'
           AND status = 'BUSY'
         ORDER BY last_assigned_at ASC NULLS FIRST
         LIMIT 1`
      );

      if (esResult.rows.length === 0) {
        // 🔹 No ES at all → rollback
        await client.query("ROLLBACK");
        return apiError(res, 400, "No ES available for assignment", "NO_ES_AVAILABLE");
      }

      queuedForBusy = true;
    }

    selectedES = esResult.rows[0];

    // 3️⃣ Create offer (expires in 5 minutes)
    const offerResult = await client.query(
      `INSERT INTO enrollment_offers 
       (enrollment_id, es_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '5 minutes')
       RETURNING *`,
      [enrollment.id, selectedES.id]
    );

    const offer = offerResult.rows[0];

    // 4️⃣ Update fairness timestamp ONLY if ES is AVAILABLE
    if (!queuedForBusy) {
      await client.query(
        `UPDATE users
         SET last_assigned_at = NOW()
         WHERE id = $1`,
        [selectedES.id]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      enrollment,
      offered_to: selectedES.name,
      offer,
      queued_for_busy: queuedForBusy // 🔹 optional info for frontend
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Enrollment creation error:", error);
    return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
  } finally {
    client.release();
  }
});


/* ======================================================
   COMPLETE ENROLLMENT
====================================================== */
router.post("/:id/complete", async (req, res) => {
  const { id } = req.params;

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

    if (enrollment.status !== "ASSIGNED") {
      await client.query("ROLLBACK");
      return apiError(res, 400, "Enrollment is not assigned", "ENROLLMENT_NOT_ASSIGNED");
    }

    // 1️⃣ Mark enrollment as COMPLETED
    await client.query(
      `UPDATE enrollments
       SET status = 'COMPLETED'
       WHERE id = $1`,
      [id]
    );

    // 2️⃣ Free the assigned ES
    await client.query(
      `UPDATE users
       SET status = 'AVAILABLE'
       WHERE id = $1`,
      [enrollment.assigned_es_id]
    );

    await client.query("COMMIT");

    res.json({ message: "Enrollment completed successfully" });

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

    const offersResult = await pool.query(
      `SELECT o.*, u.name AS es_name, u.email AS es_email
       FROM enrollment_offers o
       JOIN users u ON u.id = o.es_id
       WHERE o.enrollment_id = $1
       ORDER BY o.offered_at DESC`,
      [id]
    );

    return res.json({
      ...enrollmentResult.rows[0],
      offers: offersResult.rows,
    });
  } catch (error) {
    console.error("Fetch enrollment detail error:", error);
    return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
  }
});

/* ======================================================
   LIST ENROLLMENTS
====================================================== */
router.get("/", validate(enrollmentListQuerySchema, "query"), async (req, res) => {
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
