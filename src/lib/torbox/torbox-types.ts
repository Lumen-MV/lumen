/** TorBox v1 API shapes (snake_case, verified live 2026-10-14 — see tests/fixtures/torbox-*.json). */
export type TorboxEnvelope<T> = { success: boolean; error?: string | null; detail?: string; data: T };

export type TorboxCachedFile = { id?: number; name: string; size: number; short_name?: string; mimetype?: string };
/** `checkcached?format=list&list_files=true` entry (only cached hashes are returned) */
export type TorboxCachedEntry = { hash: string; name?: string; size?: number; files?: TorboxCachedFile[] };

export type TorboxFile = { id: number; name: string; short_name?: string; size: number; mimetype?: string };

export type TorboxDownloadState = "downloading" | "uploading" | "stalled" | "stalledDL" | "paused" | "completed" | "cached" | "metaDL" | "checkingResumeData" | "error" | "missingFiles" | string;

/** `mylist?id=` object (subset we read) */
export type TorboxTorrent = {
  id: number;
  hash: string;
  name?: string;
  size?: number;
  active?: boolean;
  download_state: TorboxDownloadState;
  /** 0–1 */
  progress: number;
  download_speed?: number;
  eta?: number;
  seeds?: number;
  peers?: number;
  download_present?: boolean;
  download_finished?: boolean;
  files?: TorboxFile[];
  expires_at?: string | null;
};

/** `createtorrent` → added (or found cached) torrent, or queued behind the account's active-download limit */
export type TorboxCreateResult = { torrent_id?: number; hash?: string; queued_id?: number; active_limit?: number; current_active_downloads?: number };

export type TorboxCacheCheck = { cached: Map<string, TorboxCachedEntry> };
