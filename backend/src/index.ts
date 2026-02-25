import express from "express";
import cors from "cors";

import dotenv from "dotenv";
dotenv.config();

import { clerkMiddleware } from "@clerk/express";
import { requireAuth } from "./middleware/requireAuth";

import healthRoutes from "./routes/health.routes";
import enrollmentRoutes from "./routes/enrollments";
import offerRoutes from "./routes/offers";
import userRoutes from "./routes/users";

import pool from "./config/db";
import "./jobs/offerTimeoutJob";

const app = express();

// Must be first, before any routes
app.use(clerkMiddleware());

app.use(cors());
app.use(express.json());

// Public route — no auth required
app.use("/health", healthRoutes);

// Protected routes
app.use("/enrollments", requireAuth, enrollmentRoutes);
app.use("/offers", requireAuth, offerRoutes);
app.use("/users", requireAuth, userRoutes);

const PORT = Number(process.env.PORT ?? 4000);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

//Database Connection
pool.query("SELECT NOW()")
  .then(res => {
    console.log("DB connected:", res.rows[0]);
  })
  .catch(err => {
    console.error("DB connection error:", err);
  });
