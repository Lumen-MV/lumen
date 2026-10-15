import { getEnv } from "@/lib/config/env";
import { checkpointWal, closeDb } from "@/lib/db/sqlite-client";
import { seedAdminFromEnv } from "@/lib/users/user-service";
import { pruneExpiredSessions } from "@/lib/auth/session-service";
import { purgeTmdbCache } from "@/lib/tmdb/tmdb-cache";
import { TMDB_CACHE_PURGE_AGE_MS, TMDB_CACHE_PURGE_INTERVAL_MS } from "@/lib/tmdb/tmdb-cache-policy";

/** Boot: validate env (fail fast with every missing key), migrate SQLite (on first getDb), seed the env admin, drop expired sessions, purge old TMDB rows. */
getEnv();
const result = await seedAdminFromEnv();
console.log(result.created ? `[boot] admin "${result.username}" created from env` : `[boot] admin "${result.username}" present`);
const pruned = pruneExpiredSessions();
if (pruned > 0) console.log(`[boot] pruned ${pruned} expired session(s)`);

/** tmdb_cache never grows unbounded: rows older than 60 d go at boot and once a day (process-local timer, unref'd). */
function purgeOldTmdbRows() {
  try {
    const n = purgeTmdbCache(TMDB_CACHE_PURGE_AGE_MS);
    if (n > 0) console.log(`[tmdb-cache] purged ${n} row(s) older than 60 d`);
  } catch (err) {
    console.error("[tmdb-cache] purge failed", err instanceof Error ? err.message : err);
  }
}
purgeOldTmdbRows();
setInterval(purgeOldTmdbRows, TMDB_CACHE_PURGE_INTERVAL_MS).unref();

/** Phase 3: cloud-job poller + title_sources sweeper (one interval each per process). */
import { startBootTasks } from "@/lib/boot/boot-tasks";
startBootTasks();

/**
 * Graceful stop (`docker compose stop` → SIGTERM, Ctrl-C → SIGINT): fold the WAL into lumen.sqlite so the data dir
 * holds one complete file (backups / restores never depend on a stale -wal). Next's own handler closes the server and
 * exits; the `exit` hook closes the handle last.
 */
const g = globalThis as unknown as { __hcShutdownHooked?: boolean };
if (!g.__hcShutdownHooked) {
  g.__hcShutdownHooked = true;
  const checkpoint = (why: string) => {
    try {
      checkpointWal();
      console.log(`[boot] ${why}: WAL checkpointed`);
    } catch (err) {
      console.error(`[boot] ${why}: checkpoint failed`, err instanceof Error ? err.message : err);
    }
  };
  for (const sig of ["SIGTERM", "SIGINT"] as const) process.once(sig, () => checkpoint(sig));
  process.once("exit", () => {
    checkpoint("exit");
    closeDb();
  });
}
