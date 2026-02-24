import { Router } from "express";
import pool from "../config/db";

const router = Router();

/* ======================================================
   ACCEPT OFFER (Race-Safe Version)
====================================================== */
router.post("/:id/accept", async (req, res) => {
  const { id } = req.params;
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
      return res.status(400).json({ error: "Offer already processed or not found" });
    }

    const offer = acceptResult.rows[0];

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

    res.json({ message: "Offer accepted successfully" });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Accept error:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});


/* ======================================================
   REJECT OFFER (Race-Safe Version)
====================================================== */
router.post("/:id/reject", async (req, res) => {
  const { id } = req.params;
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
      return res.status(400).json({ error: "No other available ES" });
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

    res.json({
      message: "Offer rejected. Reassigned to next ES.",
      new_offer: newOfferResult.rows[0],
      reassigned_to: nextES.name
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Reject error:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
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