const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { Client } = require("pg");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const required = ["DB_USER", "DB_PASSWORD", "DB_HOST", "DB_PORT", "DB_NAME"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const migrationsDir = path.resolve(__dirname, "../migrations");

async function main() {
  const allFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => file.replace(/\.js$/, ""))
    .sort();

  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  await client.connect();
  const result = await client.query(
    "SELECT name FROM pgmigrations ORDER BY name"
  );
  await client.end();

  const applied = new Set(result.rows.map((row) => row.name));
  const pending = allFiles.filter((name) => !applied.has(name));

  console.log(`Migrations on disk: ${allFiles.length}`);
  console.log(`Migrations applied: ${applied.size}`);

  if (pending.length === 0) {
    console.log("Status: OK - no pending migrations.");
    return;
  }

  console.log("Status: PENDING");
  for (const migration of pending) {
    console.log(`- ${migration}`);
  }
  process.exit(2);
}

main().catch((error) => {
  console.error("Failed to check migration status:", error.message);
  process.exit(1);
});
