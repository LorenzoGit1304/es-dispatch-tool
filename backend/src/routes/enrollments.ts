import { Router } from "express";
import pool from "../config/db";

const router = Router();

router.post("/", async (req, res) => {
  const { premise_id, requested_by, timeslot } = req.body;

  try {
    // 1 Create enrollment
    const enrollmentResult = await pool.query(
      `INSERT INTO enrollments (premise_id, requested_by, timeslot)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [premise_id, requested_by, timeslot]
    );

    const enrollment = enrollmentResult.rows[0];

    // 2 Find fairest available ES
    const esResult = await pool.query(
      `SELECT * FROM users
       WHERE role = 'ES' AND status = 'AVAILABLE'
       ORDER BY last_assigned_at ASC NULLS FIRST
       LIMIT 1`
    );

    if (esResult.rows.length === 0) {
      return res.status(400).json({ error: "No available ES" });
    }

    const selectedES = esResult.rows[0];

    // 3 Create offer (expires in 5 minutes)
    const offerResult = await pool.query(
      `INSERT INTO enrollment_offers 
       (enrollment_id, es_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '5 minutes')
       RETURNING *`,
      [enrollment.id, selectedES.id]
    );

    const offer = offerResult.rows[0];

    // 4 Update ES fairness timestamp
    await pool.query(
        `UPDATE users
         SET last_assigned_at = NOW()
         WHERE id = $1`,
        [selectedES.id]
    );

    res.status(201).json({
      enrollment,
      offered_to: selectedES.name,
      offer,
    });


  } catch (error) {
    console.error("Enrollment creation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", async (req, res) => {
  const result = await pool.query("SELECT * FROM enrollments");
  res.json(result.rows);
});

export default router;