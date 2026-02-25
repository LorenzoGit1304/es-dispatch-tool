import express from "express";
import cors from "cors";
import dotenv from "dotenv";


import healthRoutes from "./routes/health.routes";
import enrollmentRoutes from "./routes/enrollments";
import offerRoutes from "./routes/offers";
import userRoutes from "./routes/users";

import pool from "./config/db";
import "./jobs/offerTimeoutJob";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

//Mount routes
app.use("/enrollments", enrollmentRoutes);
app.use("/offers", offerRoutes);
app.use("/health",healthRoutes);
app.use("/users", userRoutes);

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
