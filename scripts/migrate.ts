/**
 * Apply SQL migrations to the Supabase Postgres database with psql.
 *
 * Usage: pnpm tsx scripts/migrate.ts [file ...]
 *   With no arguments, applies every file in supabase/migrations in order.
 *
 * Requires SUPABASE_DB_URL in .env.local: the "Direct connection" or
 * "Session pooler" string from Supabase dashboard -> Connect, e.g.
 *   postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { spawnSync } from "child_process";
import { readdirSync } from "fs";
import { join } from "path";

const DB_URL = process.env.SUPABASE_DB_URL;
const MIGRATIONS_DIR = "supabase/migrations";

if (!DB_URL) {
  console.error("Error: SUPABASE_DB_URL is not set in .env.local");
  process.exit(1);
}

const files =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort()
        .map((f) => join(MIGRATIONS_DIR, f));

for (const file of files) {
  console.log(`Applying ${file}...`);
  const result = spawnSync("psql", [DB_URL, "-v", "ON_ERROR_STOP=1", "-f", file], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(`Migration failed: ${file}`);
    process.exit(result.status ?? 1);
  }
}
console.log("Done.");
