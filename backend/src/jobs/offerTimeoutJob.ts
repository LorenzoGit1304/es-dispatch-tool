import cron from "node-cron";
import pool from "../config/db";
import { DispatchLanguage, findAssignableEs } from "../utils/dispatchSelection";

cron.schedule("*/15 * * * * *", async () => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ Find potentially expired offers
    const expiredCandidates = await client.query(
      `SELECT id
       FROM enrollment_offers
       WHERE status = 'PENDING'
         AND created_at <= NOW() - INTERVAL '90 seconds'
       FOR UPDATE`
    );

    for (const row of expiredCandidates.rows) {

      // 2️⃣ Atomically expire offer (race-safe)
      const expireResult = await client.query(
        `UPDATE enrollment_offers o
         SET status = 'EXPIRED'
         FROM enrollments e
         WHERE o.id = $1
           AND o.status = 'PENDING'
           AND e.id = o.enrollment_id
         RETURNING o.*, e.language AS enrollment_language`,
        [row.id]
      );

      if (expireResult.rows.length === 0) {
        continue; // already accepted or processed
      }

      const expiredOffer = expireResult.rows[0];

      // 3️⃣ Mark ES as UNAVAILABLE
      await client.query(
        `UPDATE users
         SET status = 'UNAVAILABLE'
         WHERE id = $1`,
        [expiredOffer.es_id]
      );

      // 4️⃣ Try AVAILABLE first
      let nextES = await findAssignableEs(
        client,
        expiredOffer.enrollment_language as DispatchLanguage,
        "AVAILABLE",
        expiredOffer.es_id
      );

      // 5️⃣ If none AVAILABLE → fallback to BUSY
      if (!nextES) {
        nextES = await findAssignableEs(
          client,
          expiredOffer.enrollment_language as DispatchLanguage,
          "BUSY",
          expiredOffer.es_id
        );
      }

      if (!nextES) {
        continue; // no ES left in system
      }

      // 6️⃣ Create new offer
      await client.query(
        `INSERT INTO enrollment_offers
         (enrollment_id, es_id, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '5 minutes')`,
        [expiredOffer.enrollment_id, nextES.id]
      );

      // 7️⃣ Update fairness timestamp
      await client.query(
        `UPDATE users
         SET last_assigned_at = NOW()
         WHERE id = $1`,
        [nextES.id]
      );
    }

    await client.query("COMMIT");

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Timeout job error:", error);
  } finally {
    client.release();
  }

//   console.log("Timeout job running..."); //debug log
});
