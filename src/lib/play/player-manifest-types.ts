import type { PlayClass } from "@/lib/sources/sources-types";
import type { SubTrack } from "@/lib/subtitles/subtitle-types";

/** Client-safe contract of GET /api/play/manifest?streamId= — the only place the player learns `src`. */
export type StreamMode = "direct" | "proxy";

export type SeasonInfoDto = { n: number; episodeCount: number; unairedCount: number };

export type NextEpisodeDto = {
  mediaKey: string;
  season: number;
  episode: number;
  title: string;
  stillUrl: string | null;
  /** the current torrent also contains this episode's file → resolve with the same hash */
  samePack: boolean;
};

export type ResumeDto = { positionS: number; percent: number; device: string; when: string };

export type PlayerManifest = {
  streamId: string;
  mode: StreamMode;
  /** CDN URL (direct) or same-origin proxy URL — never rendered into HTML */
  src: string;
  expiresAt: number;
  playClass: PlayClass;
  qualityLabel: string;
  /** "MP4" / "MKV" */
  container: string;
  codec: string;
  audio: string;
  fileName: string;
  releaseHash: string;
  releaseGroup: string;
  sizeLabel: string;
  mediaKey: string;
  title: string;
  backdropUrl: string | null;
  imdbId: string | null;
  series?: { tmdbId: number; season: number; episode: number; epTitle: string; seasons: SeasonInfoDto[] };
  next?: NextEpisodeDto;
  /**
   * present when the episode is the last aired one of its season: next season to jump to, or null — then `upcoming`
   * tells whether more episodes are coming (air date of the next one when TMDB knows it) or the series is finished
   */
  endSeason?: { season: number; nextSeason: SeasonInfoDto | null; upcoming?: { airDate: string | null } };
  resume?: ResumeDto;
  /** best cached direct (MP4) alternative for the codec-error dialog */
  mp4Alt: { hash: string; group: string; sizeLabel: string } | null;
  autoplayNext: boolean;
  askResume: boolean;
  /** Phase 5: tracks already cached for the title (the player still asks /api/subs/search for the full answer) */
  subtitleTracks: SubTrack[];
};

export type ManifestError = { code: "STREAM_EXPIRED" | "LIMIT_5" | "AUTH_REQUIRED" | "SERVER_ERROR"; active?: number };

export type ContinueItem = { mediaKey: string; type: "movie" | "tv"; tmdbId: number; title: string; backdropUrl: string | null; percent: number; positionS: number; epLabel?: string; season?: number; episode?: number };

export type SeriesProgressDto = {
  primary: { kind: "first" | "continue" | "next" | "replay"; season: number; episode: number; positionS: number; percent: number };
  lastCompleted: { season: number; episode: number } | null;
  seasonCount: number;
  seasons: Record<number, { watched: number; total: number }>;
  episodes: Record<string, { percent: number; completed: boolean; positionS: number }>;
};
