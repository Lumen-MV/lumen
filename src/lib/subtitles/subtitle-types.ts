/** Shared subtitle contracts (client-safe: no env / db imports). Times are milliseconds. */
export type Cue = { start: number; end: number; text: string };

/** `os_mt` = OpenSubtitles machine / AI translated vi file: last free fallback, labelled "dịch máy", ranked below AI vi */
export type SubSource = "embedded" | "os" | "os_mt" | "subdl" | "ai";
export const SUB_SOURCES = ["embedded", "os", "os_mt", "subdl", "ai"] as const;
export const isOsSource = (s: SubSource): boolean => s === "os" || s === "os_mt";

/** One selectable track in the popover; `vttUrl` is same-origin (`<track>` / fetch need it). */
export type SubTrack = {
  id: number;
  lang: string;
  label: string;
  source: SubSource;
  ai: boolean;
  downloads?: number;
  /** OpenSubtitles quota is 0 and this file was never downloaded → greyed 🔒 */
  locked?: boolean;
  /** "NTb · WEB-DL · 1080p": which release the community file was timed for (human community sources only) */
  release?: string;
  /** timed for the release being played (same group / same name, or embedded in the file) */
  matched?: boolean;
  vttUrl: string;
};

export type SubSize = "S" | "M" | "L";

export type SubtitlePrefsDto = { offsetMs: number; size: SubSize; /** 0 = user chose "Tắt"; null = never chosen for this title */ selectedSubId: number | null };

export type QuotaInfo = { remaining: number; resetAt: number | null };

export type TranslateState = "running" | "done" | "error";
export type TranslateStatusDto = { jobId: string; percent: number; state: TranslateState; subId?: number; errorMsg?: string };

export type SubsSearchResponse = {
  tracks: SubTrack[];
  /** auto-selected track id, or null for "Tắt" */
  selectedId: number | null;
  hasEnglish: boolean;
  quota: QuotaInfo;
  prefs: { offsetMs: number; size: SubSize };
  /** user setting `auto_translate` (onboarding "Tự dịch bằng AI khi không có bản Việt"); always false in the dev sim */
  autoTranslate: boolean;
  /** translation job of this user for this title still worth showing (running / failed) */
  job?: TranslateStatusDto;
};

/** `.subs` font size per S/M/L (desktop / ≤ 700 px); M = the mockup CSS (32 px / 19 px), S and L scale around it */
export const SUB_FONT_PX: Record<"desktop" | "mobile", Record<SubSize, number>> = { desktop: { S: 24, M: 32, L: 40 }, mobile: { S: 16, M: 19, L: 26 } };
export const OFFSET_STEP_MS = 100;
export const OFFSET_LONG_PRESS_STEP_MS = 500;
export const OFFSET_LIMIT_MS = 60_000;
export const OS_DAILY_QUOTA = 20;
export const EMBEDDED_MAX_BYTES = 8 * 1024 ** 3;
export const vttUrlFor = (id: number): string => `/api/subs/${id}.vtt`;
