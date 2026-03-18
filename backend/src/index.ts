import express from "express";
import cors from "cors";
import path from "path";

import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { clerkMiddleware } from "@clerk/express";
import { requireAuth } from "./middleware/requireAuth";
import { requestContext } from "./middleware/requestContext";
import { requestLogger } from "./middleware/requestLogger";
import { createRateLimit } from "./middleware/rateLimit";
import { globalErrorHandler, notFoundHandler } from "./middleware/errorHandlers";

import healthRoutes from "./routes/health.routes";
import enrollmentRoutes from "./routes/enrollments";
import offerRoutes from "./routes/offers";
import userRoutes from "./routes/users";
import authDebugRoutes from "./routes/authDebug";
import auditLogRoutes from "./routes/auditLog";

import pool from "./config/db";
import "./jobs/offerTimeoutJob";

const app = express();
app.set("trust proxy", 1);

if (!process.env.CLERK_SECRET_KEY || !process.env.CLERK_PUBLISHABLE_KEY) {
  throw new Error("Missing required Clerk env vars: CLERK_SECRET_KEY and/or CLERK_PUBLISHABLE_KEY");
}

const allowedOrigins = (process.env.FRONTEND_URL ?? "http://localhost:5173")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
};

const generalRateLimit = createRateLimit({
  keyPrefix: "general",
  windowMs: 60_000,
  maxRequests: 300,
});

const writeRateLimit = createRateLimit({
  keyPrefix: "writes",
  windowMs: 60_000,
  maxRequests: 120,
  methods: ["POST", "PATCH", "PUT", "DELETE"],
});

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(requestContext);
app.use(requestLogger);
app.use(generalRateLimit);
app.use(express.json({ limit: "100kb" }));
app.use(writeRateLimit);

// Must run before protected routes so req.auth is available
app.use(clerkMiddleware());

// Public route — no auth required
app.use("/health", healthRoutes);

if (process.env.NODE_ENV !== "production" && process.env.AUTH_DEBUG_BYPASS === "true") {
  app.use("/auth/debug", authDebugRoutes);
}

// Protected routes
app.use("/enrollments", requireAuth, enrollmentRoutes);
app.use("/offers", requireAuth, offerRoutes);
app.use("/users", requireAuth, userRoutes);
app.use("/audit-log", requireAuth, auditLogRoutes);

app.use(notFoundHandler);
app.use(globalErrorHandler);

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
