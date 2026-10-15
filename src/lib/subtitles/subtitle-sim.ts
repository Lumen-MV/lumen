import "server-only";
import type { ScenarioFlag } from "@/lib/dev/scenario-flags-shared";
import { isSampleEntry } from "@/lib/play/sample-stream";
import type { StreamEntry } from "@/lib/play/stream-registry";
import { listSubRows, storeVtt, upsertCandidate, type SubRow } from "./subtitle-store";
import { SAMPLE_EN_CUES, SAMPLE_VI_CUES } from "./subtitle-sample-cues";

/**
 * Dev scenario `subs-sim=<popover state>` (LUMEN_SCENARIOS=1): deterministic subtitle rows for a title so the 7 popover
 * states, the band and the source line can be screenshotted / tested without touching OpenSubtitles, SubDL or Kie.
 * The LOCAL ffmpeg sample stream (`play-sample`) always runs in sim mode (default state `popover`) — a fake title must
 * never spend real provider quota. Rows carry `source_file_id = sim:<tag>`; rows created by real jobs (`ai:<id>`) are
 * always listed too.
 */
export const SIM_STATES = ["popover", "popover-ai", "popover-translating", "popover-none", "popover-none-en", "popover-quota", "popover-translate-failed"] as const;
export type SimState = (typeof SIM_STATES)[number];

type Tag = "vi-os" | "vi-ai" | "en-os" | "vi-subdl" | "en-subdl" | "vi-os-locked";
const STATE_TAGS: Record<SimState, Tag[]> = {
  popover: ["vi-os", "vi-ai", "en-os"],
  "popover-ai": ["vi-os", "vi-ai", "en-os"],
  "popover-translating": ["en-os"],
  "popover-none": ["en-os"],
  "popover-none-en": [],
  "popover-quota": ["vi-os-locked", "vi-subdl", "en-subdl"],
  "popover-translate-failed": ["en-os"],
};
const FIXTURES: Record<Tag, { lang: string; source: SubRow["source"]; label: string; downloads: number; cues: "vi" | "en" | null }> = {
  "vi-os": { lang: "vi", source: "os", label: "Spider-Man.No.Way.Home.2021.1080p.WEB-DL.vi", downloads: 81_234, cues: "vi" },
  "vi-ai": { lang: "vi", source: "ai", label: "Tiếng Việt (Dịch AI)", downloads: 0, cues: "vi" },
  "en-os": { lang: "en", source: "os", label: "Spider-Man.No.Way.Home.2021.1080p.WEB-DL.en", downloads: 24_510, cues: "en" },
  "vi-subdl": { lang: "vi", source: "subdl", label: "Spider-Man.No.Way.Home.2021.BluRay.vi", downloads: 0, cues: "vi" },
  "en-subdl": { lang: "en", source: "subdl", label: "Spider-Man.No.Way.Home.2021.BluRay.en", downloads: 0, cues: "en" },
  "vi-os-locked": { lang: "vi", source: "os", label: "Spider-Man.No.Way.Home.2021.1080p.BluRay.vi", downloads: 60_000, cues: null },
};
const simTagOf = (r: SubRow): Tag | null => (r.sourceFileId?.startsWith("sim:") ? (r.sourceFileId.slice(4) as Tag) : null);

export function simStateFor(params: Map<ScenarioFlag, string>, entry: StreamEntry | null): SimState | null {
  const raw = params.get("subs-sim");
  if (raw && (SIM_STATES as readonly string[]).includes(raw)) return raw as SimState;
  return entry && isSampleEntry(entry) ? "popover" : null;
}

/** Idempotent: every fixture row exists with its VTT (except the "locked" one, which stays undownloaded). */
export function ensureSimRows(mediaKey: string): SubRow[] {
  for (const [tag, f] of Object.entries(FIXTURES) as Array<[Tag, (typeof FIXTURES)[Tag]]>) {
    const row = upsertCandidate({ mediaKey, lang: f.lang, source: f.source, label: f.label, sourceFileId: `sim:${tag}`, downloads: f.downloads });
    if (f.cues && !row.vttPath) storeVtt(row.id, f.cues === "vi" ? SAMPLE_VI_CUES : SAMPLE_EN_CUES);
  }
  return listSubRows(mediaKey);
}

export function simRowsFor(state: SimState, rows: SubRow[]): SubRow[] {
  const tags = new Set<Tag>(STATE_TAGS[state]);
  return rows.filter((r) => {
    const tag = simTagOf(r);
    return tag ? tags.has(tag) : true;
  });
}
