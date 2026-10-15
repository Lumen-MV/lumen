import "server-only";
import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { getEnv } from "@/lib/config/env";
import { getDb, schema } from "@/lib/db/sqlite-client";
import { cuesToVtt } from "./vtt-writer";
import type { Cue, SubSize, SubSource, SubtitlePrefsDto } from "./subtitle-types";

/**
 * `subtitle_cache` rows (one per candidate track; `vtt_path` empty until the file was fetched / extracted / translated)
 * + the VTT files under `DATA_DIR/subs/<id>.vtt` + per-user `subtitle_prefs`.
 */
export type SubRow = typeof schema.subtitleCache.$inferSelect;
export type Candidate = { mediaKey: string; lang: string; source: SubSource; label: string; sourceFileId: string; downloads?: number };

export const subsDir = (): string => path.resolve(process.cwd(), getEnv().DATA_DIR, "subs");
export const vttPathFor = (id: number): string => path.join(subsDir(), `${id}.vtt`);

export const findSubRow = (id: number): SubRow | null => getDb().select().from(schema.subtitleCache).where(eq(schema.subtitleCache.id, id)).get() ?? null;
export const listSubRows = (mediaKey: string): SubRow[] => getDb().select().from(schema.subtitleCache).where(eq(schema.subtitleCache.mediaKey, mediaKey)).all();
export const hasVtt = (row: SubRow): boolean => row.vttPath !== "" && fs.existsSync(row.vttPath);

/** Insert or refresh (label / downloads) the row identified by (mediaKey, source, sourceFileId). */
export function upsertCandidate(c: Candidate): SubRow {
  const db = getDb();
  const where = and(eq(schema.subtitleCache.mediaKey, c.mediaKey), eq(schema.subtitleCache.source, c.source), eq(schema.subtitleCache.sourceFileId, c.sourceFileId));
  const existing = db.select().from(schema.subtitleCache).where(where).get();
  if (existing) {
    db.update(schema.subtitleCache).set({ label: c.label, downloads: c.downloads ?? existing.downloads, lang: c.lang }).where(eq(schema.subtitleCache.id, existing.id)).run();
    return { ...existing, label: c.label, downloads: c.downloads ?? existing.downloads, lang: c.lang };
  }
  return db.insert(schema.subtitleCache).values({ mediaKey: c.mediaKey, lang: c.lang, source: c.source, label: c.label, sourceFileId: c.sourceFileId, downloads: c.downloads ?? 0, vttPath: "" }).returning().get();
}

/** Writes the VTT file and marks the row ready (cue count, optional AI cost). */
export function storeVtt(id: number, cues: Cue[], costVnd = 0): SubRow {
  fs.mkdirSync(subsDir(), { recursive: true });
  const file = vttPathFor(id);
  fs.writeFileSync(file, cuesToVtt(cues), "utf8");
  getDb().update(schema.subtitleCache).set({ vttPath: file, cueCount: cues.length, costVnd }).where(eq(schema.subtitleCache.id, id)).run();
  return findSubRow(id)!;
}

export const readVtt = (row: SubRow): string => fs.readFileSync(row.vttPath, "utf8");

/** One AI translation per source file: `source_file_id = ai:<sourceSubId>`. */
export const aiSourceFileId = (sourceSubId: number): string => `ai:${sourceSubId}`;
export function findAiRowFor(mediaKey: string, sourceSubId: number): SubRow | null {
  const row = getDb().select().from(schema.subtitleCache).where(and(eq(schema.subtitleCache.mediaKey, mediaKey), eq(schema.subtitleCache.source, "ai"), eq(schema.subtitleCache.sourceFileId, aiSourceFileId(sourceSubId)))).get();
  return row && hasVtt(row) ? row : null;
}

/** Dev fixtures / tests: drop rows + files of a title (prefs of every user for it too). */
export function deleteSubRowsFor(mediaKey: string): number {
  const rows = listSubRows(mediaKey);
  for (const r of rows) if (r.vttPath) fs.rmSync(r.vttPath, { force: true });
  getDb().delete(schema.subtitleCache).where(eq(schema.subtitleCache.mediaKey, mediaKey)).run();
  getDb().delete(schema.subtitlePrefs).where(eq(schema.subtitlePrefs.mediaKey, mediaKey)).run();
  return rows.length;
}

const defaultPrefs = (size: SubSize): SubtitlePrefsDto => ({ offsetMs: 0, size, selectedSubId: null });

export function getSubtitlePrefs(userId: number, mediaKey: string, defaultSize: SubSize = "M"): SubtitlePrefsDto {
  const row = getDb().select().from(schema.subtitlePrefs).where(and(eq(schema.subtitlePrefs.userId, userId), eq(schema.subtitlePrefs.mediaKey, mediaKey))).get();
  return row ? { offsetMs: row.offsetMs, size: row.size, selectedSubId: row.selectedSubId } : defaultPrefs(defaultSize);
}

export function setSubtitlePrefs(userId: number, mediaKey: string, patch: Partial<SubtitlePrefsDto>, defaultSize: SubSize = "M"): SubtitlePrefsDto {
  const next = { ...getSubtitlePrefs(userId, mediaKey, defaultSize), ...patch };
  getDb()
    .insert(schema.subtitlePrefs)
    .values({ userId, mediaKey, offsetMs: next.offsetMs, size: next.size, selectedSubId: next.selectedSubId })
    .onConflictDoUpdate({ target: [schema.subtitlePrefs.userId, schema.subtitlePrefs.mediaKey], set: { offsetMs: next.offsetMs, size: next.size, selectedSubId: next.selectedSubId } })
    .run();
  return next;
}
