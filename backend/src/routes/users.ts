import { Router } from "express";
import pool from "../config/db";
import { validate } from "../middleware/validate";
import {
  idParamSchema,
  userCreateSchema,
  userStatusUpdateSchema,
  userSyncSchema,
  userUpdateSchema,
} from "../schemas/requestSchemas";

const router = Router();

/* ======================================================
   SYNC CLERK USER (called on first login)
====================================================== */
router.post("/sync", validate(userSyncSchema), async (req, res) => {
  const clerkId = (req as any).auth?.userId;

  if (!clerkId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { clerk_id, email, name } = req.body;
  if (clerk_id !== clerkId) {
    return res.status(400).json({ error: "clerk_id does not match authenticated user" });
  }

  try {
    // If user already exists, return them
    const existing = await pool.query(
      "SELECT id, name, role, status, clerk_id, email FROM users WHERE clerk_id = $1",
      [clerkId]
    );

    if (existing.rows.length > 0) {
      return res.json(existing.rows[0]);
    }

    // Otherwise create new user with default role ES
    const result = await pool.query(
      `INSERT INTO users (name, email, clerk_id, role, status)
       VALUES ($1, $2, $3, 'ES', 'AVAILABLE')
       RETURNING id, name, role, status, clerk_id, email`,
      [name, email, clerkId]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Sync error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


/* ======================================================
   LIST ALL USERS
====================================================== */
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name, role, status, last_assigned_at FROM users ORDER BY id");
    res.json(result.rows);
  } catch (error) {
    console.error("Fetch users error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ======================================================
   GET SINGLE USER
====================================================== */
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "SELECT id, name, role, status, last_assigned_at FROM users WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Fetch user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ======================================================
   UPDATE USER STATUS
   (e.g., AVAILABLE, BUSY, UNAVAILABLE)
====================================================== */
router.patch("/:id/status", validate(idParamSchema, "params"), validate(userStatusUpdateSchema), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const result = await pool.query(
      "UPDATE users SET status = $1 WHERE id = $2 RETURNING id, name, role, status, last_assigned_at",
      [status, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Update user status error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ======================================================
   CREATE NEW USER
====================================================== */
router.post("/", validate(userCreateSchema), async (req, res) => {
  const { name, role, status } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO users (name, role, status)
       VALUES ($1, $2, $3)
       RETURNING id, name, role, status, last_assigned_at`,
      [name, role, status]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ======================================================
   UPDATE USER DETAILS
====================================================== */
router.put("/:id", validate(idParamSchema, "params"), validate(userUpdateSchema), async (req, res) => {
  const { id } = req.params;
  const { name, role, status } = req.body;

  try {
    const result = await pool.query(
      `UPDATE users
       SET name = COALESCE($1, name),
           role = COALESCE($2, role),
           status = COALESCE($3, status)
       WHERE id = $4
       RETURNING id, name, role, status, last_assigned_at`,
      [name, role, status, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ======================================================
   DELETE USER
====================================================== */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM users WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User deleted successfully", id: result.rows[0].id });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

console.log("Users route loaded");
export default router;
