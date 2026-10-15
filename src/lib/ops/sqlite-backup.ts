import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getEnv } from "@/lib/config/env";
import { checkpointWal, getDb, rawSqlite } from "@/lib/db/sqlite-client";

/**
 * Nightly SQLite snapshot (`DATA_DIR/backups/lumen-YYYYMMDD.sqlite`, better-sqlite3 online backup API — consistent
 * even under writes) keeping the last 14. infra/backup.sh tars these together with `DATA_DIR/subs` off the VM.
 */
export const BACKUP_KEEP = 14;
const DAY_MS = 86_400_000;
const g = globalThis as unknown as { __hcBackupTimer?: ReturnType<typeof setTimeout> };

export const backupDir = (): string => path.resolve(process.cwd(), getEnv().DATA_DIR, "backups");
const stamp = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

/** Deletes the oldest `lumen-*.sqlite` files beyond `keep`; returns the surviving names (newest first). */
export function pruneBackups(dir: string, keep = BACKUP_KEEP): string[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => /^lumen-\d{8}\.sqlite$/.test(f)).sort().reverse();
  for (const f of files.slice(keep)) fs.rmSync(path.join(dir, f), { force: true });
  return files.slice(0, keep);
}

export async function runSqliteBackup(now = new Date()): Promise<string> {
  getDb(); // opens + migrates when this is the first touch of the process
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `lumen-${stamp(now)}.sqlite`);
  checkpointWal();
  await rawSqlite().backup(file);
  fs.chmodSync(file, 0o600);
  pruneBackups(dir);
  return file;
}

/** Next 03:15 local time. */
export function msUntilNextRun(now = new Date(), hour = 3, minute = 15): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) next.setTime(next.getTime() + DAY_MS);
  return next.getTime() - now.getTime();
}

export function startNightlyBackup(): void {
  if (g.__hcBackupTimer) return;
  const schedule = () => {
    g.__hcBackupTimer = setTimeout(async () => {
      try {
        console.log(`[backup] wrote ${path.basename(await runSqliteBackup())}`);
      } catch (err) {
        console.error("[backup] failed", err instanceof Error ? err.message : err);
      }
      schedule();
    }, msUntilNextRun());
    g.__hcBackupTimer.unref();
  };
  schedule();
}
