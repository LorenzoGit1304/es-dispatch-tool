import express from "express";
import enrollmentRoutes from "./routes/enrollments";
import cors from "cors";
import healthRoutes from "./routes/health.routes";
import pool from "./config/db";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/enrollments", enrollmentRoutes);

app.get("/health",healthRoutes)

const PORT = 4000;

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
