import path from "node:path";
import type Database from "better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "./schema";

/**
 * Applies pragmas + pending SQL migrations from ./drizzle. Runs once per process on first DB open
 * (dev server, scripts, Docker runner) so the schema is always current without a separate step.
 */
export function migrateOnBoot(sqlite: Database.Database, db: BetterSQLite3Database<typeof schema>): void {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
}
