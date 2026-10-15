import "server-only";
import { randomBytes } from "node:crypto";
import type { PlayClass } from "@/lib/sources/sources-types";

/**
 * Opaque per-user stream handles: `/api/play/resolve` writes `{streamId → cdnUrl + context}` here (50 min TTL, in memory,
 * HMR-safe via globalThis); Phase 4's /watch reads it with `getStream(id, userId)`. The CDN URL (which embeds the TorBox
 * API key) never appears in any page HTML/JSON — only the streamId does. Lock / delete drop a user's handles at once.
 */
export const STREAM_TTL_MS = 50 * 60_000;
const MAX_ENTRIES = 500;

export type StreamEntry = {
  streamId: string;
  cdnUrl: string;
  torrentId: number;
  fileId: number;
  fileName: string;
  userId: number;
  mediaKey: string;
  release: { hash: string; title: string; qualityLabel: string };
  playClass: PlayClass;
  createdAt: number;
  expiresAt: number;
};

const g = globalThis as unknown as { __hcStreams?: Map<string, StreamEntry> };
const map = (): Map<string, StreamEntry> => (g.__hcStreams ??= new Map());

function sweep(now: number): void {
  const m = map();
  for (const [id, e] of m) if (e.expiresAt <= now) m.delete(id);
  while (m.size >= MAX_ENTRIES) {
    const oldest = m.keys().next().value;
    if (oldest === undefined) break;
    m.delete(oldest);
  }
}

export function registerStream(input: Omit<StreamEntry, "streamId" | "createdAt" | "expiresAt">, now = Date.now()): StreamEntry {
  sweep(now);
  const entry: StreamEntry = { ...input, streamId: randomBytes(16).toString("hex"), createdAt: now, expiresAt: now + STREAM_TTL_MS };
  map().set(entry.streamId, entry);
  return entry;
}

/** Only the user who resolved it may read it; expired handles read as missing. */
export function getStream(streamId: string, userId: number, now = Date.now()): StreamEntry | null {
  const e = map().get(streamId);
  if (!e || e.userId !== userId || e.expiresAt <= now) return null;
  return e;
}

/** Account lock / delete: every live handle of the user dies now (web player + Stremio proxy pipe answer 410). Returns the count. */
export function dropUserStreams(userId: number): number {
  const m = map();
  let n = 0;
  for (const [id, e] of m) if (e.userId === userId) {
    m.delete(id);
    n++;
  }
  return n;
}
