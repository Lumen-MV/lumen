import { copy } from "@/lib/copy-vi";
import type { SubSource } from "@/lib/subtitles/subtitle-types";

/**
 * Pure: `subtitle_cache` rows of a title → Stremio subtitle objects served through `/stremio/{token}/subs/{id}.vtt`.
 * Rows not yet fetched (OpenSubtitles / SubDL candidates) are listed too — the VTT route downloads on first use, exactly
 * like the web player — but embedded tracks need a stream handle and are skipped. Vietnamese first, AI after human.
 */
export type SubRowLike = { id: number; lang: string; source: SubSource; label: string; ready: boolean };
export type StremioSubtitle = { id: string; lang: string; url: string };
const ISO3: Record<string, string> = { vi: "vie", en: "eng", ja: "jpn", ko: "kor", zh: "zho", fr: "fra", de: "deu", es: "spa", th: "tha" };
const ORDER: Record<string, number> = { vi: 0, en: 1 };
const SOURCE_RANK: Record<SubSource, number> = { os: 0, subdl: 1, embedded: 2, ai: 3, os_mt: 4 };

export const subtitleVttUrl = (base: string, token: string, id: number): string => `${base}/stremio/${token}/subs/${id}.vtt`;

export function buildSubtitles(rows: SubRowLike[], base: string, token: string): StremioSubtitle[] {
  return rows
    .filter((r) => r.source !== "embedded")
    .sort((a, b) => (ORDER[a.lang] ?? 9) - (ORDER[b.lang] ?? 9) || SOURCE_RANK[a.source] - SOURCE_RANK[b.source] || Number(b.ready) - Number(a.ready) || a.id - b.id)
    .map((r) => ({ id: `lumen-${r.id}`, lang: r.source === "ai" ? `${ISO3[r.lang] ?? r.lang}${copy.stremio.aiSuffix}` : (ISO3[r.lang] ?? r.lang), url: subtitleVttUrl(base, token, r.id) }));
}
