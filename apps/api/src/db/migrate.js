import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../migrations");

async function run() {

  console.log("Current Directory:", process.cwd());
  console.log("DATABASE_URL:", process.env.DATABASE_URL);

  const test = await pool.query("SELECT NOW()");
  console.log("Database Test:", test.rows);
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const applied = new Set(
    (await pool.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name)
  );

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`Applying migration ${file}...`);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`  done.`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`Migration ${file} failed:`, err.message);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  console.log("All migrations applied.");
  await pool.end();
}

run();
