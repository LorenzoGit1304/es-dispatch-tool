import { Pool } from "pg";

const pool = new Pool({
  user: "dispatch_user",
  host: "localhost",
  database: "es_dispatch",
  password: "yourpassword",
  port: 5432,
});

export default pool;
