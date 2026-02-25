import express from "express";
import cors from "cors";
import path from "path";

import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { clerkMiddleware } from "@clerk/express";
import { requireAuth } from "./middleware/requireAuth";

import healthRoutes from "./routes/health.routes";
import enrollmentRoutes from "./routes/enrollments";
import offerRoutes from "./routes/offers";
import userRoutes from "./routes/users";
import authDebugRoutes from "./routes/authDebug";

import pool from "./config/db";
import "./jobs/offerTimeoutJob";

const app = express();

if (!process.env.CLERK_SECRET_KEY || !process.env.CLERK_PUBLISHABLE_KEY) {
  throw new Error("Missing required Clerk env vars: CLERK_SECRET_KEY and/or CLERK_PUBLISHABLE_KEY");
}

const allowedOrigins = (process.env.FRONTEND_URL ?? "http://localhost:5173")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

// Must be first, before any routes
app.use(clerkMiddleware());

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());

// Public route — no auth required
app.use("/health", healthRoutes);

if (process.env.NODE_ENV !== "production" && process.env.AUTH_DEBUG_BYPASS === "true") {
  app.use("/auth/debug", authDebugRoutes);
}

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
