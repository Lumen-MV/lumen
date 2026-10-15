import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { migrateOnBoot } from "./migrate-on-boot";
import { getEnv } from "@/lib/config/env";

export type Db = BetterSQLite3Database<typeof schema>;

/** Single process-wide connection (survives Next dev HMR via globalThis). */
const g = globalThis as unknown as { __hcDb?: Db; __hcSqlite?: Database.Database };

export function getDb(): Db {
  if (g.__hcDb) return g.__hcDb;
  const dataDir = path.resolve(process.cwd(), getEnv().DATA_DIR);
  fs.mkdirSync(dataDir, { recursive: true });
  const sqlite = new Database(path.join(dataDir, "lumen.sqlite"));
  const db = drizzle(sqlite, { schema });
  migrateOnBoot(sqlite, db);
  g.__hcDb = db;
  g.__hcSqlite = sqlite;
  return db;
}

/** The underlying better-sqlite3 handle (online backup API). */
export function rawSqlite(): Database.Database {
  getDb();
  return g.__hcSqlite!;
}

/**
 * Folds the WAL back into `lumen.sqlite` and truncates it — run on SIGTERM and before every backup so a copied main
 * file is complete on its own (a restore that leaves a stale `-wal` beside the file would otherwise replay it).
 */
export function checkpointWal(): void {
  g.__hcSqlite?.pragma("wal_checkpoint(TRUNCATE)");
}

/** Tests/scripts: release the file handle (Windows cannot delete an open SQLite file). */
export function closeDb(): void {
  g.__hcSqlite?.close();
  g.__hcDb = undefined;
  g.__hcSqlite = undefined;
}

export { schema };
