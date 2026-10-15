/** Client-safe contracts shared by /api/sources, /api/cloud/jobs, /api/play/resolve and the source picker (no server imports). */
export type Resolution = "2160p" | "1080p" | "720p" | "SD";
export type Codec = "x264" | "x265" | "av1" | "";
export type Container = "mp4" | "mkv" | "avi" | "ts" | "unknown";
export type PlayClass = "direct" | "maybe" | "app";
export type CacheState = "cached" | "uncached";

export type ParsedRelease = {
  resolution: Resolution;
  codec: Codec;
  /** audio tags found in the name, e.g. ["AAC", "5.1"] / ["DDP", "5.1", "Atmos"] / ["DTS"] */
  audio: string[];
  hdr: string[];
  /** BluRay / WEB-DL / WEBRip / REMUX / CAM … */
  source: string;
  group: string;
  container: Container;
  /** CAM/TS/telesync releases */
  bad: boolean;
};

export type CloudJobState = "queued" | "downloading" | "ready" | "error";

export type CloudJob = {
  id: number;
  hash: string;
  mediaKey: string;
  userId: number;
  state: CloudJobState;
  /** 0–100 */
  progress: number;
  etaMin?: number;
  speedBps?: number;
  /** TorBox slot queue (`Xếp hàng · 10/10 slot`) or app queue */
  queuedSlots?: { active: number; limit: number };
  errorMsg?: string;
  fileName: string;
  title: string;
};

export type Release = {
  hash: string;
  /** release name (Torrentio title line 1) */
  title: string;
  fileIdx?: number;
  parsed: ParsedRelease;
  qualityLabel: string;
  /** "MP4 · H.264", "MKV · x265", "MKV · HDR" */
  formatLabel: string;
  sizeBytes: number;
  sizeLabel: string;
  /** "AAC 5.1", "DDP 5.1 Atmos" */
  audioLabel: string;
  seeders: number;
  cacheState: CacheState;
  playClass: PlayClass;
  /** why not direct: "MKV DTS", "AV1" … ("" for direct) */
  playReason: string;
  score: number;
  recommended: boolean;
  /** season pack: season number + episode count known from TMDB; `sizeIsFile` = whole-pack size unknown, label shows the episode file "(1 tập)" */
  pack?: { season: number; episodes: number; sizeIsFile?: boolean };
  /** video file name (from TorBox file list when cached, else Torrentio's filename hint) */
  fileName?: string;
  job?: CloudJob;
  /** torbox-down only: a `requestdl` link for this torrent is still inside the 50-min cache → "▶ Phát" stays enabled */
  linkReady?: boolean;
};

export type SourcesState = "ok" | "torbox-down" | "empty";

export type SourcesResponse = {
  releases: Release[];
  best: Release | null;
  state: SourcesState;
  slots: { active: number; limit: number };
  /** episode number the list was built for (series) */
  episode?: { season: number; episode: number };
  /** "Lần trước": the viewer's remembered release for this title (release-pref-select.ts) — the applied row's hash, or the stored one when it no longer applies */
  preferredHash?: string | null;
  /** true when the primary action uses `preferredHash` (cached + in this list; series may fall back to the same group / quality) */
  preferredApplies?: boolean;
};

/** `hash` = the release actually resolved (a remembered pref may override a `pickReason:'primary'` / `auto` request). */
export type ResolveResponse = { streamId: string; playClass: PlayClass; fileName: string; hash: string };

/** Per-episode cache marker for the series page chips (`GET /api/sources/season`). */
export type EpisodeSourceStatus = { cacheState: CacheState; job?: CloudJob };
export type SeasonSourcesResponse = { episodes: Record<number, EpisodeSourceStatus> };
