import { copy } from "@/lib/copy-vi";
import { MATCH_CONFIDENT, releaseMatchScore, releaseTag, type PlayingRelease } from "./subtitle-release-match";
import { isOsSource, type QuotaInfo, type SubSource, type SubTrack } from "./subtitle-types";

/**
 * Pure ranking / labelling (unit-tested). Input = cached rows (any order) + the release being played; output = the
 * popover list: vi human → vi AI → vi OS machine-translated → en → other. Within a language, human files timed for the
 * playing release come first (subtitle-release-match.ts), then embedded → OS → SubDL, then downloads. Up to
 * MAX_PER_SLOT files per (lang, source) and MAX_PER_LANG human files per language (one AI / MT row), duplicates by
 * (lang, normalised release name) collapsed. Labels are generic ("Tiếng Việt (cộng đồng)" / "English") unless a
 * language has several sources or the OS quota is exhausted — then the source is named (mockup `popover-quota`:
 * "Tiếng Việt (OpenSubtitles) 🔒", "Tiếng Việt (SubDL)", "English (SubDL)"); the release tag tells same-source files apart.
 */
export type RankInput = { id: number; lang: string; source: SubSource; label: string; downloads: number; ready: boolean };

export const MAX_PER_SLOT = 3;
export const MAX_PER_LANG = 4;
const SOURCE_RANK: Record<SubSource, number> = { embedded: 0, os: 1, subdl: 2, ai: 3, os_mt: 4 };
const normalizeName = (s: string) => s.toLowerCase().replace(/\.(srt|ass|ssa|vtt)$/, "").replace(/[^a-z0-9]+/g, "");
const langRank = (lang: string, source: SubSource) => (lang === "vi" ? (source === "ai" ? 1 : source === "os_mt" ? 2 : 0) : lang === "en" ? 3 : 4);
/** Human community / embedded files: the ones a release match applies to (AI and MT rows are derived, one each). */
const isHuman = (source: SubSource) => source !== "ai" && source !== "os_mt";

export function rankTracks(rows: RankInput[], quota: QuotaInfo, vttUrlFor: (id: number) => string, playing: PlayingRelease | null = null): SubTrack[] {
  // embedded streams live inside the playing file → always a match; AI / MT rows never compete on release
  const scored = rows.map((r) => ({ r, match: r.source === "embedded" ? MATCH_CONFIDENT : isHuman(r.source) ? releaseMatchScore(r.label, playing) : 0 }));
  scored.sort((a, b) => langRank(a.r.lang, a.r.source) - langRank(b.r.lang, b.r.source) || b.match - a.match || SOURCE_RANK[a.r.source] - SOURCE_RANK[b.r.source] || b.r.downloads - a.r.downloads || a.r.id - b.r.id);
  const slotCount = new Map<string, number>();
  const langCount = new Map<string, number>();
  const seenName = new Set<string>();
  const picked: Array<{ r: RankInput; match: number }> = [];
  for (const s of scored) {
    const { r } = s;
    const slot = `${r.lang}:${r.source}`;
    const name = `${r.lang}:${normalizeName(r.label)}`;
    const slotCap = isHuman(r.source) ? MAX_PER_SLOT : 1;
    if ((slotCount.get(slot) ?? 0) >= slotCap || (r.label && seenName.has(name))) continue;
    if (isHuman(r.source) && (langCount.get(r.lang) ?? 0) >= MAX_PER_LANG) continue;
    slotCount.set(slot, (slotCount.get(slot) ?? 0) + 1);
    if (isHuman(r.source)) langCount.set(r.lang, (langCount.get(r.lang) ?? 0) + 1);
    seenName.add(name);
    picked.push(s);
  }
  const quotaOut = quota.remaining <= 0;
  const specific = quotaOut || ["vi", "en"].some((l) => new Set(picked.filter((p) => p.r.lang === l && p.r.source !== "ai").map((p) => p.r.source)).size > 1);
  return picked.map(({ r, match }) => ({
    id: r.id,
    lang: r.lang,
    source: r.source,
    ai: r.source === "ai",
    label: labelFor(r.lang, r.source, specific),
    downloads: r.downloads || undefined,
    locked: isOsSource(r.source) && !r.ready && quotaOut ? true : undefined,
    release: isHuman(r.source) && r.source !== "embedded" && r.label ? releaseTag(r.label) : undefined,
    matched: isHuman(r.source) && match >= MATCH_CONFIDENT ? true : undefined,
    vttUrl: vttUrlFor(r.id),
  }));
}

export function labelFor(lang: string, source: SubSource, specific: boolean): string {
  const s = copy.subs;
  if (source === "ai") return s.viAi;
  if (source === "os_mt") return s.viMt;
  if (lang === "vi") return !specific ? s.viCommunity : source === "os" ? s.viOs : source === "subdl" ? s.viSubdl : s.viEmbedded;
  if (lang === "en") return !specific ? s.en : source === "os" ? s.enOs : source === "subdl" ? s.enSubdl : s.enEmbedded;
  return s.other(lang);
}

/** "81k" / "1.2k" / "530" for the source line */
export function formatDownloads(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

export function sourceLineFor(track: SubTrack): string {
  const s = copy.subs;
  if (track.source === "ai") return s.sourceAi;
  if (isOsSource(track.source)) return s.sourceOs(formatDownloads(track.downloads ?? 0));
  if (track.source === "subdl") return s.sourceSubdl;
  return s.sourceEmbedded;
}
