import { Router } from "express";
import pool from "../config/db";

const router = Router();

/* ======================================================
   ACCEPT OFFER
====================================================== */
router.post("/:id/accept", async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect(); // ✅ dedicated connection

  try {
    await client.query("BEGIN"); // ✅ start transaction

    // 1️⃣ Get offer
    const offerResult = await client.query(
      `SELECT * FROM enrollment_offers WHERE id = $1`,
      [id]
    );

    if (offerResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Offer not found" });
    }

    const offer = offerResult.rows[0];

    if (offer.status !== "PENDING") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Offer already processed" });
    }

    // 2️⃣ Mark offer ACCEPTED
    await client.query(
      `UPDATE enrollment_offers
       SET status = 'ACCEPTED'
       WHERE id = $1`,
      [id]
    );

    // 3️⃣ Update enrollment:
    //    - Mark ASSIGNED
    //    - Store which ES accepted (NEW)
    await client.query(
      `UPDATE enrollments
       SET status = 'ASSIGNED',
           assigned_es_id = $1
       WHERE id = $2`,
      [offer.es_id, offer.enrollment_id]
    );

    // 4️⃣ Mark ES as BUSY and update fairness timestamp
    await client.query(
      `UPDATE users
       SET status = 'BUSY',
           last_assigned_at = NOW()
       WHERE id = $1`,
      [offer.es_id]
    );

    await client.query("COMMIT"); // ✅ commit only if ALL succeed

    res.json({ message: "Offer accepted successfully" });

  } catch (error) {
    await client.query("ROLLBACK"); // ✅ rollback everything on error
    console.error("Accept error:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release(); // ✅ always release
  }
});


/* ======================================================
   REJECT OFFER
====================================================== */
router.post("/:id/reject", async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect(); // ✅ dedicated connection

  try {
    await client.query("BEGIN"); // ✅ start transaction

    // 1️⃣ Get offer
    const offerResult = await client.query(
      `SELECT * FROM enrollment_offers WHERE id = $1`,
      [id]
    );

    if (offerResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Offer not found" });
    }

    const offer = offerResult.rows[0];

    if (offer.status !== "PENDING") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Offer already processed" });
    }

    // 2️⃣ Mark current offer REJECTED
    await client.query(
      `UPDATE enrollment_offers
       SET status = 'REJECTED'
       WHERE id = $1`,
      [id]
    );

    // 3️⃣ Find next available ES (excluding rejecting ES)
    const nextESResult = await client.query(
      `SELECT * FROM users
       WHERE role = 'ES'
         AND status = 'AVAILABLE'
         AND id != $1
       ORDER BY last_assigned_at ASC NULLS FIRST
       LIMIT 1`,
      [offer.es_id]
    );

    if (nextESResult.rows.length === 0) {
      // No reassignment possible → commit rejection only
      await client.query("COMMIT");
      return res.status(400).json({ error: "No other available ES" });
    }

    const nextES = nextESResult.rows[0];

    // 4️⃣ Create new offer for next ES
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

    await client.query("COMMIT"); // ✅ commit only after ALL succeed

    res.json({
      message: "Offer rejected. Reassigned to next ES.",
      new_offer: newOfferResult.rows[0],
      reassigned_to: nextES.name
    });

  } catch (error) {
    await client.query("ROLLBACK"); // ✅ rollback everything
    console.error("Reject error:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release(); // ✅ always release
  }
});


/* ======================================================
   LIST OFFERS
====================================================== */
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