import { Router } from "express";
import pool from "../config/db";
import { validate } from "../middleware/validate";
import { enrollmentCreateSchema } from "../schemas/requestSchemas";

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
        return res.status(400).json({ error: "No ES available for assignment" });
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
    res.status(500).json({ error: "Internal server error" });
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
      return res.status(404).json({ error: "Enrollment not found" });
    }

    const enrollment = enrollmentResult.rows[0];

    if (enrollment.status !== "ASSIGNED") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Enrollment is not assigned" });
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
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});


/* ======================================================
   LIST ENROLLMENTS
====================================================== */
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM enrollments ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Fetch enrollments error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

console.log("Enrollments route loaded");
export default router;
