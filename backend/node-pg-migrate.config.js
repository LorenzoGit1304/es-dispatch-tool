const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, ".env") });

const required = ["DB_USER", "DB_PASSWORD", "DB_HOST", "DB_PORT", "DB_NAME"];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var for migrations: ${key}`);
  }
}

const encodedPassword = encodeURIComponent(process.env.DB_PASSWORD);
const databaseUrl = `postgres://${process.env.DB_USER}:${encodedPassword}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

module.exports = {
  databaseUrl,
  dir: "migrations",
  migrationsTable: "pgmigrations",
};
