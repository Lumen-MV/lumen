import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";
import { users } from "./schema-auth";
import { bool, now, ts } from "./schema-helpers";

/** Catalog, playback-progress, sources, cloud jobs and subtitle tables (filled by Phases 2-5). */
const userRef = () => integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" });

export const likes = sqliteTable(
  "likes",
  { userId: userRef(), mediaType: text("media_type").notNull(), tmdbId: integer("tmdb_id").notNull() },
  (t) => [primaryKey({ columns: [t.userId, t.mediaType, t.tmdbId] })],
);

export const myList = sqliteTable(
  "my_list",
  { userId: userRef(), mediaType: text("media_type").notNull(), tmdbId: integer("tmdb_id").notNull(), addedAt: ts("added_at").notNull().$defaultFn(now) },
  (t) => [primaryKey({ columns: [t.userId, t.mediaType, t.tmdbId] })],
);

export const progress = sqliteTable(
  "progress",
  {
    userId: userRef(),
    mediaType: text("media_type").notNull(),
    tmdbId: integer("tmdb_id").notNull(),
    season: integer("season").notNull().default(0),
    episode: integer("episode").notNull().default(0),
    positionS: real("position_s").notNull().default(0),
    durationS: real("duration_s").notNull().default(0),
    completed: bool("completed").notNull().default(false),
    deviceLabel: text("device_label").notNull().default(""),
    updatedAt: ts("updated_at").notNull().$defaultFn(now),
  },
  (t) => [primaryKey({ columns: [t.userId, t.mediaType, t.tmdbId, t.season, t.episode] })],
);

export const views = sqliteTable("views", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: userRef(),
  mediaType: text("media_type").notNull(),
  tmdbId: integer("tmdb_id").notNull(),
  season: integer("season"),
  episode: integer("episode"),
  releaseHash: text("release_hash").notNull().default(""),
  mode: text("mode", { enum: ["direct", "app", "stremio"] }).notNull(),
  deviceLabel: text("device_label").notNull().default(""),
  startedAt: ts("started_at").notNull().$defaultFn(now),
  lastBeatAt: ts("last_beat_at").notNull().$defaultFn(now),
});

export const tmdbCache = sqliteTable("tmdb_cache", {
  key: text("key").primaryKey(),
  json: text("json").notNull(),
  fetchedAt: ts("fetched_at").notNull().$defaultFn(now),
});

export const titleSources = sqliteTable(
  "title_sources",
  {
    mediaType: text("media_type").notNull(),
    tmdbId: integer("tmdb_id").notNull(),
    season: integer("season").notNull().default(0),
    episode: integer("episode").notNull().default(0),
    bestClass: text("best_class", { enum: ["direct", "maybe", "app"] }),
    bestLabel: text("best_label"),
    cachedCount: integer("cached_count").notNull().default(0),
    releaseCount: integer("release_count").notNull().default(0),
    firstCachedAt: ts("first_cached_at"),
    checkedAt: ts("checked_at").notNull().$defaultFn(now),
  },
  (t) => [primaryKey({ columns: [t.mediaType, t.tmdbId, t.season, t.episode] })],
);

export const torrentCache = sqliteTable("torrent_cache", {
  hash: text("hash").primaryKey(),
  torboxTorrentId: integer("torbox_torrent_id"),
  filesJson: text("files_json").notNull().default("[]"),
  state: text("state").notNull().default(""),
  updatedAt: ts("updated_at").notNull().$defaultFn(now),
});

export const cloudJobs = sqliteTable("cloud_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: userRef(),
  hash: text("hash").notNull(),
  torboxTorrentId: integer("torbox_torrent_id"),
  mediaType: text("media_type").notNull(),
  tmdbId: integer("tmdb_id").notNull(),
  season: integer("season"),
  episode: integer("episode"),
  title: text("title").notNull(),
  releaseLabel: text("release_label").notNull().default(""),
  fileName: text("file_name").notNull().default(""),
  sizeBytes: integer("size_bytes").notNull().default(0),
  state: text("state", { enum: ["queued", "downloading", "ready", "error"] }).notNull().default("queued"),
  progress: real("progress").notNull().default(0),
  speedBps: integer("speed_bps").notNull().default(0),
  etaS: integer("eta_s").notNull().default(0),
  errorMsg: text("error_msg"),
  appQueuePos: integer("app_queue_pos"),
  createdAt: ts("created_at").notNull().$defaultFn(now),
  finishedAt: ts("finished_at"),
});

export const subtitleCache = sqliteTable("subtitle_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mediaKey: text("media_key").notNull(),
  lang: text("lang").notNull(),
  source: text("source", { enum: ["embedded", "os", "os_mt", "subdl", "ai"] }).notNull(),
  label: text("label").notNull().default(""),
  sourceFileId: text("source_file_id"),
  downloads: integer("downloads").notNull().default(0),
  vttPath: text("vtt_path").notNull(),
  cueCount: integer("cue_count").notNull().default(0),
  costVnd: integer("cost_vnd").notNull().default(0),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});

export const subtitlePrefs = sqliteTable(
  "subtitle_prefs",
  {
    userId: userRef(),
    mediaKey: text("media_key").notNull(),
    offsetMs: integer("offset_ms").notNull().default(0),
    size: text("size", { enum: ["S", "M", "L"] }).notNull().default("M"),
    selectedSubId: integer("selected_sub_id"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.mediaKey] })],
);

/**
 * "Lần trước": the release a viewer explicitly picked in the source picker, remembered per TITLE (`movie:<id>` / `tv:<id>`)
 * so the next primary action (hero ▶, continue card, episode row, Stremio) prefers it while it is still cached.
 * `episode_media_key` only records which episode the pick happened on (series).
 */
export const releasePrefs = sqliteTable(
  "release_prefs",
  {
    userId: userRef(),
    mediaKey: text("media_key").notNull(),
    hash: text("hash").notNull(),
    fileId: integer("file_id"),
    label: text("label").notNull().default(""),
    quality: text("quality").notNull().default(""),
    releaseGroup: text("release_group").notNull().default(""),
    playClass: text("play_class", { enum: ["direct", "maybe", "app"] }).notNull().default("direct"),
    episodeMediaKey: text("episode_media_key"),
    chosenAt: ts("chosen_at").notNull().$defaultFn(now),
  },
  (t) => [primaryKey({ columns: [t.userId, t.mediaKey] })],
);
