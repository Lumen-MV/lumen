import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Release } from "@/lib/sources/sources-types";

/**
 * Integration on a real temp SQLite with a mocked TorBox client: the poller reconciles jobs from DB rows alone (restart-safe),
 * backs off while TorBox is unreachable, the app queue promotes on cancel, and cancel/retry delete only unfinished torrents.
 */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-cloud-test-"));
process.env.DATA_DIR = tmp;
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-1234";
process.env.ADMIN_USERNAME = "owner";
process.env.ADMIN_PASSWORD = "admin-pass-123";
process.env.MAX_CLOUD_JOBS = "2";

const tb = vi.hoisted(() => ({ getTorrent: vi.fn(), listTorrents: vi.fn(), createTorrent: vi.fn(), controlTorrent: vi.fn() }));
vi.mock("@/lib/torbox/torbox-client", () => {
  class TorboxError extends Error {
    constructor(message: string, public readonly status: number, public readonly detail: string, public readonly path: string) {
      super(message);
      this.name = "TorboxError";
    }
  }
  const isTorboxUnreachable = (e: unknown) => e instanceof TorboxError && (e.status === 0 || e.status >= 500 || e.status === 429);
  return { TorboxError, isTorboxUnreachable, isTorrentGone: () => false, redactToken: (s: string) => s, torboxStats: {}, checkCached: vi.fn(), requestDownloadLink: vi.fn(), ...tb };
});

type M = {
  db: typeof import("@/lib/db/sqlite-client");
  store: typeof import("@/lib/cloud/cloud-jobs-store");
  queue: typeof import("@/lib/cloud/cloud-queue");
  poller: typeof import("@/lib/cloud/cloud-job-poller");
  ensure: typeof import("@/lib/torbox/torbox-ensure-torrent");
  client: typeof import("@/lib/torbox/torbox-client");
};
let m: M;
let userId = 0;
const H = (n: number) => n.toString(16).padStart(40, "0");
const NOW = 1_800_000_000_000;
const torrent = (id: number, hash: string, progress: number, finished = false) => ({ id, hash, name: "n", size: 10, download_state: finished ? "completed" : "downloading", progress, download_speed: 1000, eta: 30, seeds: 5, download_finished: finished, download_present: finished, files: finished ? [{ id: 0, name: "Movie.2021.1080p.mp4", short_name: "Movie.2021.1080p.mp4", size: 3e9 }] : [] });
const release = (hash: string): Release => ({ hash, title: `Movie.2021.1080p.x264-G${hash.slice(-2)}.mp4`, parsed: { resolution: "1080p", codec: "x264", audio: [], hdr: [], source: "WEB", group: "G", container: "mp4", bad: false }, qualityLabel: "1080p", formatLabel: "MP4", sizeBytes: 3e9, sizeLabel: "2.8 GB", audioLabel: "AAC", seeders: 10, cacheState: "uncached", playClass: "direct", playReason: "", score: 0, recommended: false });
const key = { type: "movie" as const, tmdbId: 1 };
const insertJob = (hash: string, patch: Partial<Parameters<M["store"]["insertJob"]>[0]> = {}) => m.store.insertJob({ userId, hash, mediaType: "movie", tmdbId: 1, title: "Movie", releaseLabel: "r", fileName: "f", sizeBytes: 1, state: "queued", appQueuePos: null, ...patch });

beforeAll(async () => {
  m = { db: await import("@/lib/db/sqlite-client"), store: await import("@/lib/cloud/cloud-jobs-store"), queue: await import("@/lib/cloud/cloud-queue"), poller: await import("@/lib/cloud/cloud-job-poller"), ensure: await import("@/lib/torbox/torbox-ensure-torrent"), client: await import("@/lib/torbox/torbox-client") };
  userId = Number(m.db.getDb().insert(m.db.schema.users).values({ username: "owner", passwordHash: "x", displayName: "Owner", role: "admin" }).run().lastInsertRowid);
});
afterAll(() => {
  m.db.closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});
beforeEach(() => {
  for (const f of Object.values(tb)) f.mockReset();
  m.db.getDb().delete(m.db.schema.cloudJobs).run();
  m.db.getDb().delete(m.db.schema.torrentCache).run();
  m.store.torboxQueue().clear();
  Object.assign(m.poller.pollerState(), { backoffMs: 0, nextAt: 0, tick: 0 });
});

describe("poller rehydration from DB rows (no memory state)", () => {
  it("a TorBox-queued row (no app position, no torrent id) is matched by hash in mylist and promoted; a downloading row is refreshed", async () => {
    const queued = insertJob(H(1));
    const downloading = insertJob(H(2), { state: "downloading", torboxTorrentId: 123 });
    expect(m.store.torboxQueue().size).toBe(0); // "after a restart"
    tb.listTorrents.mockResolvedValue([torrent(77, H(1), 0.1), torrent(123, H(2), 0.5)]);
    tb.getTorrent.mockImplementation(async (id: number) => (id === 77 ? torrent(77, H(1), 0.1) : torrent(123, H(2), 0.5)));
    expect(await m.poller.pollOnce(NOW, true)).toBe(true);
    expect(m.store.getJob(queued.id)).toMatchObject({ state: "downloading", torboxTorrentId: 77, progress: 10 });
    expect(m.store.getJob(downloading.id)).toMatchObject({ state: "downloading", progress: 50 });
    expect(tb.listTorrents).toHaveBeenCalledTimes(1);
  });
  it("finished torrent → ready + torrent_cache + cloud_ready notification; the list call is throttled when nothing waits", async () => {
    const job = insertJob(H(3), { state: "downloading", torboxTorrentId: 9, progress: 90 });
    tb.getTorrent.mockResolvedValue(torrent(9, H(3), 1, true));
    await m.poller.pollOnce(NOW, true);
    expect(m.store.getJob(job.id)).toMatchObject({ state: "ready", progress: 100, fileName: "Movie.2021.1080p.mp4" });
    expect(m.ensure.readTorrentCache(H(3))?.torrentId).toBe(9);
    const notif = m.db.getDb().select().from(m.db.schema.notifications).all();
    expect(notif.some((n) => n.type === "cloud_ready" && n.userId === userId)).toBe(true);
    expect(tb.listTorrents).not.toHaveBeenCalled();
  });
  it("unreachable TorBox → tick reports false and backs off 5 s → 10 s → … ≤ 30 s; ticks inside the window are skipped", async () => {
    insertJob(H(4), { state: "downloading", torboxTorrentId: 5 });
    tb.getTorrent.mockRejectedValue(new m.client.TorboxError("down", 0, "network", "/p"));
    expect(await m.poller.pollOnce(NOW, true)).toBe(false);
    expect(m.poller.pollerState().backoffMs).toBe(5000);
    expect(await m.poller.pollOnce(NOW + 1000)).toBe(true); // skipped, no call
    expect(tb.getTorrent).toHaveBeenCalledTimes(1);
    expect(await m.poller.pollOnce(NOW + 5000)).toBe(false);
    expect(m.poller.pollerState().backoffMs).toBe(10_000);
    for (let t = 20_000; t < 200_000; t += 40_000) await m.poller.pollOnce(NOW + t);
    expect(m.poller.pollerState().backoffMs).toBeLessThanOrEqual(m.poller.BACKOFF_MAX_MS);
    tb.getTorrent.mockResolvedValue(torrent(5, H(4), 0.2));
    expect(await m.poller.pollOnce(NOW + 400_000)).toBe(true);
    expect(m.poller.pollerState().backoffMs).toBe(0);
  });
});

describe("cloud queue", () => {
  it("MAX_CLOUD_JOBS=2: the 3rd job waits with app_queue_pos 1 and starts when a slot frees", async () => {
    let nextId = 100;
    tb.createTorrent.mockImplementation(async () => ({ torrent_id: ++nextId }));
    const a = await m.queue.createCloudJob({ userId, userName: "Admin", key, release: release(H(10)), title: "Movie" });
    const b = await m.queue.createCloudJob({ userId, userName: "Admin", key, release: release(H(11)), title: "Movie" });
    const c = await m.queue.createCloudJob({ userId, userName: "Admin", key, release: release(H(12)), title: "Movie" });
    expect(a.job).toMatchObject({ state: "downloading" });
    expect(b.job).toMatchObject({ state: "downloading" });
    expect(c.job).toMatchObject({ state: "queued", appQueuePos: 1 });
    expect(m.store.toCloudJob(c.job).queuedSlots).toEqual({ active: 2, limit: 2 });
    const dup = await m.queue.createCloudJob({ userId, userName: "Admin", key, release: release(H(10)), title: "Movie" });
    expect(dup.created).toBe(false);
    await m.queue.cancelJob(a.job);
    expect(tb.controlTorrent).toHaveBeenCalledWith(a.job.torboxTorrentId, "delete");
    expect(m.store.getJob(c.job.id)).toMatchObject({ state: "downloading", appQueuePos: null });
  });
  it("cancel of a READY job drops only the row (shared cached torrent survives); retry deletes the dead torrent first", async () => {
    const ready = insertJob(H(20), { state: "ready", torboxTorrentId: 55, progress: 100 });
    m.ensure.writeTorrentCache(H(20), 55, [{ id: 0, name: "a.mp4", size: 3e9 }], "cached");
    await m.queue.cancelJob(ready);
    expect(m.store.getJob(ready.id)).toBeNull();
    expect(tb.controlTorrent).not.toHaveBeenCalled();
    expect(m.ensure.readTorrentCache(H(20))?.torrentId).toBe(55);
    const errored = insertJob(H(21), { state: "error", torboxTorrentId: 56, errorMsg: "x" });
    tb.createTorrent.mockResolvedValue({ torrent_id: 57 });
    const again = await m.queue.retryJob(errored);
    expect(tb.controlTorrent).toHaveBeenCalledWith(56, "delete");
    expect(again).toMatchObject({ state: "downloading", torboxTorrentId: 57, errorMsg: null });
  });
  it("start failure labels: network / 5xx → 'Không kết nối được Torbox', TorBox refusal → 'Tải thất bại (ít seed)'", async () => {
    tb.createTorrent.mockRejectedValueOnce(new m.client.TorboxError("down", 0, "network", "/p"));
    const net = await m.queue.startJob(insertJob(H(30)));
    expect(net).toMatchObject({ state: "error", errorMsg: "✕ Không kết nối được Torbox" });
    tb.createTorrent.mockRejectedValueOnce(new m.client.TorboxError("bad", 400, "invalid magnet", "/p"));
    const bad = await m.queue.startJob(insertJob(H(31)));
    expect(bad).toMatchObject({ state: "error", errorMsg: "Tải thất bại (ít seed)" });
  });
});
