import type { Cue } from "@/lib/subtitles/subtitle-types";
import type { TranslateItem } from "./translator-interface";

/** Batch geometry (research 02 §B4): 50 cues per request, the previous 4 translated cues as context, 4 in flight. */
export const BATCH_SIZE = 50;
export const CONTEXT_CUES = 4;
export const CONCURRENCY = 4;

/** Cues → index + text batches (index = position in the cue array, so timings re-attach locally). */
export function makeBatches(cues: Cue[], size = BATCH_SIZE): TranslateItem[][] {
  const items = cues.map((c, i) => ({ i, t: c.text }));
  const out: TranslateItem[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Context for batch k: the last 4 cues of batch k-1 — translated when already done, else their English (concurrency). */
export function contextFor(batches: TranslateItem[][], k: number, done: Record<number, string[]>, n = CONTEXT_CUES): TranslateItem[] {
  if (k === 0) return [];
  const prev = batches[k - 1];
  const translated = done[k - 1];
  const tail = prev.slice(-n);
  return tail.map((item, j) => ({ i: item.i, t: translated ? translated[prev.length - tail.length + j] : item.t }));
}

export function splitHalves(items: TranslateItem[]): [TranslateItem[], TranslateItem[]] {
  const mid = Math.ceil(items.length / 2);
  return [items.slice(0, mid), items.slice(mid)];
}

/** Batch results (lines per batch, in batch order) → the translated cue list with the original timings. */
export function assembleCues(cues: Cue[], batches: TranslateItem[][], done: Record<number, string[]>): Cue[] {
  const text = new Map<number, string>();
  batches.forEach((b, k) => b.forEach((item, j) => text.set(item.i, done[k]?.[j] ?? item.t)));
  return cues.map((c, i) => ({ ...c, text: text.get(i) ?? c.text }));
}

export const percentOf = (doneBatches: number, total: number): number => (total === 0 ? 100 : Math.min(100, Math.floor((doneBatches / total) * 100)));
