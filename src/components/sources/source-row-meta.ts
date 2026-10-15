import { copy } from "@/lib/copy-vi";
import type { Release } from "@/lib/sources/sources-types";

/**
 * `.l1` meta text after the tags (pure); an unknown audio label is skipped:
 *   movie    → "2.7 GB · AAC 5.1 · 👤 100 · YTS"
 *   episode  → "Tập 1 · 1.4 GB · AAC 2.0 · 👤 35"
 *   pack     → "Trọn mùa 4 · 9 tập · 18 GB · AAC · 👤 210" (whole-pack size unknown → "1.4 GB (1 tập)")
 */
export function rowMetaText(r: Release, episode: number | undefined): string {
  const p = copy.picker;
  const seeds = `👤 ${r.seeders}`;
  const parts = r.pack ? [p.pack(r.pack.season, r.pack.episodes, r.pack.sizeIsFile ? p.packSizeFile(r.sizeLabel) : r.sizeLabel), r.audioLabel, seeds] : episode !== undefined ? [p.ep(episode), r.sizeLabel, r.audioLabel, seeds] : [r.sizeLabel, r.audioLabel, seeds, r.parsed.group];
  return parts.filter(Boolean).join(" · ");
}

/** `.l2` file line: pack → "Name… (season pack)", else the file name (or release name). */
export function rowFileText(r: Release): string {
  if (r.pack) return `${r.title}${copy.picker.packSuffix}`;
  return r.fileName ?? r.title;
}
