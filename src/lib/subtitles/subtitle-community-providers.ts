import "server-only";
import type { MediaKey } from "@/lib/catalog/media-key";
import { osSearch } from "./opensubtitles-client";
import { subdlSearch } from "./subdl-client";
import type { Candidate } from "./subtitle-store";

/**
 * OpenSubtitles + SubDL searched in parallel with a 6 s budget each; a failing / slow provider only logs (the other one
 * still answers) but is reported as `failed` so the search service keeps a short negative cache instead of 24 h.
 * OS `ai_translated` / `machine_translated` Vietnamese hits are kept as source `os_mt` (last free fallback, ranked
 * below the app's own AI translation); machine-made English files are dropped. Hearing-impaired files rank after
 * clean ones by being listed later.
 */
export const PROVIDER_TIMEOUT_MS = 6000;
const LANGS = ["vi", "en"];
export type CommunityResult = { candidates: Candidate[]; failed: boolean };

const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
  p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

async function fromOpenSubtitles(mediaKey: string, key: MediaKey, imdbId: string): Promise<Candidate[]> {
  const hits = await osSearch(key.type === "tv" ? { parentImdbId: imdbId, season: key.season, episode: key.episode } : { imdbId });
  return hits
    .filter((h) => h.fileId !== null && LANGS.includes(h.lang) && (h.lang === "vi" || (!h.aiTranslated && !h.machineTranslated)))
    .sort((a, b) => Number(a.hearingImpaired) - Number(b.hearingImpaired) || b.downloads - a.downloads)
    .map((h) => ({ mediaKey, lang: h.lang, source: h.aiTranslated || h.machineTranslated ? ("os_mt" as const) : ("os" as const), label: h.release || h.fileName, sourceFileId: String(h.fileId), downloads: h.downloads }));
}

async function fromSubdl(mediaKey: string, key: MediaKey, imdbId: string): Promise<Candidate[]> {
  const base = { imdbId, type: key.type, season: key.season, episode: key.episode };
  // `languages=VI` alone returns the vi files (a combined VI,EN query lets the 10-result cap starve vi)
  const [vi, en] = await Promise.all([subdlSearch({ ...base, languages: "VI" }), subdlSearch({ ...base, languages: "EN" })]);
  return [...vi.map((h) => ({ ...h, lang: "vi" })), ...en.map((h) => ({ ...h, lang: "en" }))]
    .sort((a, b) => Number(a.hearingImpaired) - Number(b.hearingImpaired))
    .map((h) => ({ mediaKey, lang: h.lang, source: "subdl" as const, label: h.name, sourceFileId: h.url, downloads: 0 }));
}

export async function gatherCommunityCandidates(mediaKey: string, key: MediaKey, imdbId: string | null): Promise<CommunityResult> {
  if (!imdbId) return { candidates: [], failed: true };
  const settled = await Promise.allSettled([withTimeout(fromOpenSubtitles(mediaKey, key, imdbId), PROVIDER_TIMEOUT_MS, "opensubtitles"), withTimeout(fromSubdl(mediaKey, key, imdbId), PROVIDER_TIMEOUT_MS, "subdl")]);
  const candidates: Candidate[] = [];
  let failed = false;
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") candidates.push(...r.value);
    else {
      failed = true;
      console.warn(`[subs] ${i === 0 ? "opensubtitles" : "subdl"} failed:`, r.reason instanceof Error ? r.reason.message : r.reason);
    }
  });
  return { candidates, failed };
}
