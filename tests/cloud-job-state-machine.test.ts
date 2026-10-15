import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyTorboxStatus, DEAD_STALL_MS, etaMinutes, isTorrentFinished } from "@/lib/cloud/cloud-job-state-machine";
import { parseCloudSimSpec, simCreateTorrent, simGetTorrent, simReset } from "@/lib/cloud/cloud-sim-torbox";
import type { TorboxTorrent } from "@/lib/torbox/torbox-types";

/** Recorded TorBox answers (sanitised) from tests/fixtures. */
const fixture = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8")) as T;
const cachedTorrent = fixture<{ data: TorboxTorrent }>("torbox-mylist-cached.json").data;
const job = { state: "downloading" as const, progress: 10, stalledSince: null };
const NOW = 1_700_000_000_000;

describe("applyTorboxStatus (poller state machine)", () => {
  it("recorded cached torrent → ready 100 %", () => {
    expect(isTorrentFinished(cachedTorrent)).toBe(true);
    expect(applyTorboxStatus(job, cachedTorrent, NOW)).toMatchObject({ state: "ready", progress: 100, dead: false });
  });
  it("downloading 0.73 with eta → downloading 73 %, eta minutes rounded up", () => {
    const t: TorboxTorrent = { ...cachedTorrent, download_state: "downloading", progress: 0.73, download_speed: 12_000_000, eta: 61, seeds: 12, download_finished: false, download_present: false };
    const p = applyTorboxStatus(job, t, NOW);
    expect(p).toMatchObject({ state: "downloading", progress: 73, speedBps: 12_000_000, etaS: 61, stalledSince: null });
    expect(etaMinutes(p.etaS)).toBe(2);
    expect(etaMinutes(0)).toBeUndefined();
  });
  it("TorBox error state → error (dead)", () => {
    const t: TorboxTorrent = { ...cachedTorrent, download_state: "error", progress: 0.2, download_finished: false, download_present: false };
    expect(applyTorboxStatus(job, t, NOW)).toMatchObject({ state: "error", dead: true });
  });
  it("stalled with 0 seeds starts the 10-minute clock, then dies", () => {
    const t: TorboxTorrent = { ...cachedTorrent, download_state: "stalledDL", progress: 0.2, seeds: 0, download_finished: false, download_present: false };
    const first = applyTorboxStatus(job, t, NOW);
    expect(first).toMatchObject({ state: "downloading", stalledSince: NOW, dead: false });
    const later = applyTorboxStatus({ ...job, stalledSince: NOW }, t, NOW + DEAD_STALL_MS - 1);
    expect(later.state).toBe("downloading");
    expect(applyTorboxStatus({ ...job, stalledSince: NOW }, t, NOW + DEAD_STALL_MS)).toMatchObject({ state: "error", dead: true });
  });
  it("stalled WITH seeds does not count as dead and resets the clock", () => {
    const t: TorboxTorrent = { ...cachedTorrent, download_state: "stalled", progress: 0.5, seeds: 3, download_finished: false, download_present: false };
    expect(applyTorboxStatus({ ...job, stalledSince: NOW - DEAD_STALL_MS * 2 }, t, NOW)).toMatchObject({ state: "downloading", stalledSince: null });
  });
  it("finished flag without download_present is not ready yet", () => {
    const t: TorboxTorrent = { ...cachedTorrent, download_finished: true, download_present: false, download_state: "uploading", progress: 1 };
    expect(applyTorboxStatus(job, t, NOW).state).toBe("downloading");
  });
});

describe("cloud-sim fake TorBox", () => {
  it("parses specs", () => {
    expect(parseCloudSimSpec("downloading:73")).toMatchObject({ kind: "downloading", start: 73, step: 0 });
    expect(parseCloudSimSpec("downloading:60:20")).toMatchObject({ start: 60, step: 20 });
    expect(parseCloudSimSpec("queued:10:10")).toMatchObject({ kind: "queued", active: 10, limit: 10 });
    expect(parseCloudSimSpec("error")).toMatchObject({ kind: "error" });
    expect(parseCloudSimSpec("bogus")).toBeNull();
    expect(parseCloudSimSpec(undefined)).toBeNull();
  });
  it("advances per poll and finishes through the real state machine", () => {
    simReset();
    const created = simCreateTorrent(parseCloudSimSpec("downloading:60:20")!, "a".repeat(40), "file.mp4");
    const id = created.torrent_id!;
    expect(id).toBeLessThan(0);
    const polls = [1, 2, 3, 4].map(() => applyTorboxStatus(job, simGetTorrent(id)!, NOW));
    expect(polls.map((p) => p.progress)).toEqual([60, 80, 100, 100]);
    expect(polls[2].state).toBe("ready");
    expect(simGetTorrent(id)?.files?.[0].name).toBe("file.mp4");
  });
  it("queued spec answers with queued_id; error spec is dead", () => {
    simReset();
    expect(simCreateTorrent(parseCloudSimSpec("queued:10:10")!, "b".repeat(40), "f")).toMatchObject({ active_limit: 10, current_active_downloads: 10 });
    const err = simCreateTorrent(parseCloudSimSpec("error")!, "c".repeat(40), "f");
    expect(applyTorboxStatus(job, simGetTorrent(err.torrent_id!)!, NOW).dead).toBe(true);
  });
});
