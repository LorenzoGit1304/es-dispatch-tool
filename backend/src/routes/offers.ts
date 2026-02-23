import { Router } from "express";
import pool from "../config/db";

const router = Router();

// Accept Offer
router.post("/:id/accept", async (req, res) => {
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
    await pool.query(
      `UPDATE users
       SET status = 'BUSY'
       WHERE id = $1`,
      [offer.es_id]
    );

    res.json({ message: "Offer accepted successfully" });

  } catch (error) {
    console.error("Accept error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
console.log("Offers route loaded");
export default router;