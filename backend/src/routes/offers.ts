import { Router } from "express";
import pool from "../config/db";

const router = Router();

// ACCEPT OFFER
router.post("/:id/accept", async (req, res) => {
  const { id } = req.params;

    // 🔹 CHANGED: Get a dedicated client for transaction control
  const client = await pool.connect();

  try {
    // 🔹 CHANGED: Start transaction
    await client.query("BEGIN");

    // 1️⃣ Get the offer
    const offerResult = await pool.query(
      `SELECT * FROM enrollment_offers WHERE id = $1`,
      [id]
    );

    if (offerResult.rows.length === 0) {
      return res.status(404).json({ error: "Offer not found" });
    }

    const offer = offerResult.rows[0];

    if (offer.status !== "PENDING") {
      // 🔹 CHANGED: Rollback before returning
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Offer already processed" });
    }

    // 2️⃣ Mark offer as ACCEPTED
    await pool.query(
      `UPDATE enrollment_offers
       SET status = 'ACCEPTED'
       WHERE id = $1`,
      [id]
    );

    // 3️⃣ Update enrollment status
    await pool.query(
      `UPDATE enrollments
       SET status = 'ASSIGNED'
       WHERE id = $1`,
      [offer.enrollment_id]
    );

    // 4️⃣ Update ES status
    // 🔹 CHANGED: Added last_assigned_at update
    await pool.query(
      `UPDATE users
       SET status = 'BUSY',
           last_assigned_at = NOW() 
       WHERE id = $1`,
      [offer.es_id]
    );

    // 🔹 CHANGED: Commit only if everything succeeds
    await client.query("COMMIT");

    res.json({ message: "Offer accepted successfully" });

  } catch (error) {
    // 🔹 CHANGED: Rollback if ANY query fails
    await client.query("ROLLBACK");
    console.error("Accept error:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    // 🔹 CHANGED: Always release client back to pool
    client.release();
  }
});

// REJECT OFFER
router.post("/:id/reject", async (req, res) => {
  const { id } = req.params;

  try {
    // 1️⃣ Get the offer
    const offerResult = await pool.query(
      `SELECT * FROM enrollment_offers WHERE id = $1`,
      [id]
    );

    if (offerResult.rows.length === 0) {
      return res.status(404).json({ error: "Offer not found" });
    }

    const offer = offerResult.rows[0];

    if (offer.status !== "PENDING") {
      return res.status(400).json({ error: "Offer already processed" });
    }

    // 2️⃣ Mark current offer as REJECTED
    await pool.query(
      `UPDATE enrollment_offers
       SET status = 'REJECTED'
       WHERE id = $1`,
      [id]
    );

    // 3️⃣ Find next fairest AVAILABLE ES (excluding rejecting ES)
    const nextESResult = await pool.query(
      `SELECT * FROM users
       WHERE role = 'ES'
         AND status = 'AVAILABLE'
         AND id != $1
       ORDER BY last_assigned_at ASC NULLS FIRST
       LIMIT 1`,
      [offer.es_id]
    );

    if (nextESResult.rows.length === 0) {
      return res.status(400).json({ error: "No other available ES" });
    }

    const nextES = nextESResult.rows[0];

    // 4️⃣ Create new offer
    const newOfferResult = await pool.query(
      `INSERT INTO enrollment_offers
       (enrollment_id, es_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '5 minutes')
       RETURNING *`,
      [offer.enrollment_id, nextES.id]
    );

    // 5️⃣ Update fairness timestamp
    await pool.query(
      `UPDATE users
       SET last_assigned_at = NOW()
       WHERE id = $1`,
      [nextES.id]
    );

    res.json({
      message: "Offer rejected. Reassigned to next ES.",
      new_offer: newOfferResult.rows[0],
      reassigned_to: nextES.name
    });

  } catch (error) {
    console.error("Reject error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM enrollment_offers ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Fetch offers error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
console.log("Offers route loaded");
export default router;