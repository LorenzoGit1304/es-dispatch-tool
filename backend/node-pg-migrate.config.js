const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, ".env") });

const required = ["DB_USER", "DB_PASSWORD", "DB_HOST", "DB_PORT", "DB_NAME"];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var for migrations: ${key}`);
  }
}

module.exports = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  "migrations-dir": "migrations",
  "migrations-table": "pgmigrations",
};
