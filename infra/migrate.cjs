// One-off SQLite migration for the Docker image (copied to /app/migrate.cjs): infra/deploy.sh runs it in a throw-away
// container built from the NEW image while the old container keeps serving, so a failing migration never takes the
// app down. The app also migrates on boot (src/lib/db/migrate-on-boot.ts) — this is the same drizzle migrator.
//   docker compose run --rm --no-deps -T app node migrate.cjs
const path = require("node:path");
const Database = require("better-sqlite3");
const { drizzle } = require("drizzle-orm/better-sqlite3");
const { migrate } = require("drizzle-orm/better-sqlite3/migrator");

const dataDir = process.env.DATA_DIR || "/data";
const file = path.join(dataDir, "lumen.sqlite");
const sqlite = new Database(file);
try {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  migrate(drizzle(sqlite), { migrationsFolder: path.join(__dirname, "drizzle") });
  sqlite.pragma("wal_checkpoint(TRUNCATE)");
  console.log(`[migrate] ${file}: schema up to date`);
} catch (err) {
  console.error("[migrate] failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  sqlite.close();
}
